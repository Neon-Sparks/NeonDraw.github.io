/* Neon Draw — document model: layer tree, masks, adjustment layers, layer effects,
 * compositor, history and strokes.
 *
 * Painting always goes to the current "surface": the active layer's pixels, its mask
 * (while mask editing is on) or the quick mask. Masks are opaque greyscale canvases
 * (white = visible); a cached alpha version is kept for compositing. */
'use strict';
(function () {
  const U = ND.U, B = ND.Blend;
  let nextId = 1;

  /* ---------------- nodes ---------------- */
  class Node {
    constructor(name) {
      this.id = nextId++;
      this.name = name;
      this.visible = true;
      this.opacity = 1;
      this.blendMode = 'normal';
      this.locked = false;
      this.alphaLock = false;
      this.clip = false; // clipping mask: clipped to the node directly below
      this.mask = null; // greyscale canvas or null
      this.maskEnabled = true;
      this.effects = null; // layer style (see effects.js)
      this.rev = 0;
    }
    get isGroup() { return this.type === 'group'; }
    get isAdjust() { return this.type === 'adjust'; }
    get isPixel() { return this.type === 'layer'; }
  }
  class Layer extends Node {
    constructor(name, w, h) {
      super(name);
      this.type = 'layer';
      this.canvas = U.canvas(w, h);
      this.textData = null; // editable text layers remember their text
    }
  }
  class Group extends Node {
    constructor(name) {
      super(name);
      this.type = 'group';
      this.children = []; // bottom → top
      this.collapsed = false;
    }
  }
  class Adjust extends Node {
    constructor(kind, params) {
      super(ND.Adjust ? ND.Adjust.label(kind) : kind);
      this.type = 'adjust';
      this.kind = kind;
      this.params = params || (ND.Adjust ? ND.Adjust.defaults(kind) : {});
    }
  }

  /* ---------------- masks ---------------- */
  function newMask(w, h, fill) {
    const m = U.canvas(w, h), x = U.ctx(m);
    x.fillStyle = fill || '#ffffff';
    x.fillRect(0, 0, w, h);
    return m;
  }
  function markMask(m, r) { if (m) m._dirty = r ? U.union(m._dirty, r) : { x: 0, y: 0, w: m.width, h: m.height }; }
  // Alpha version of a greyscale mask (white with alpha = grey), updated incrementally.
  function maskAlpha(m) {
    if (!m._alpha || m._alpha.width !== m.width || m._alpha.height !== m.height) { m._alpha = U.canvas(m.width, m.height); m._dirty = { x: 0, y: 0, w: m.width, h: m.height }; }
    const r = U.clipRect(m._dirty, m.width, m.height);
    m._dirty = null;
    if (r) {
      const src = U.ctx(m).getImageData(r.x, r.y, r.w, r.h), d = src.data;
      for (let i = 0; i < d.length; i += 4) { d[i + 3] = d[i]; d[i] = d[i + 1] = d[i + 2] = 255; }
      U.ctx(m._alpha).putImageData(src, r.x, r.y);
    }
    return m._alpha;
  }
  // Convert painted pixels (colour + alpha) in rect to opaque grey: transparent = black.
  function greyify(c, r) {
    const x = U.ctx(c), img = x.getImageData(r.x, r.y, r.w, r.h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = U.luma(d[i], d[i + 1], d[i + 2]) * (d[i + 3] / 255);
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    x.putImageData(img, r.x, r.y);
  }
  const DocMask = { newMask, markMask, maskAlpha, greyify };

  /* Remembers the original pixels of only the tiles that get edited, so tools that paint
   * straight onto a layer don't need a copy of the whole (possibly huge) canvas. */
  class TileBackup {
    constructor(canvas, size) { this.c = canvas; this.T = size || 256; this.tiles = new Map(); }
    save(r) {
      const T = this.T, W = this.c.width, H = this.c.height;
      const x0 = Math.max(0, Math.floor(r.x / T)), y0 = Math.max(0, Math.floor(r.y / T));
      const x1 = Math.min(Math.ceil(W / T) - 1, Math.floor((r.x + r.w) / T)), y1 = Math.min(Math.ceil(H / T) - 1, Math.floor((r.y + r.h) / T));
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const k = ty * 100000 + tx;
        if (this.tiles.has(k)) continue;
        const w = Math.min(T, W - tx * T), h = Math.min(T, H - ty * T);
        this.tiles.set(k, { x: tx * T, y: ty * T, img: U.ctx(this.c).getImageData(tx * T, ty * T, w, h) });
      }
    }
    // A canvas of rect `r` holding the original pixels (current pixels where nothing was saved).
    region(r) {
      const c = U.canvas(r.w, r.h), x = U.ctx(c);
      x.drawImage(this.c, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      for (const t of this.tiles.values()) {
        if (t.x >= r.x + r.w || t.y >= r.y + r.h || t.x + t.img.width <= r.x || t.y + t.img.height <= r.y) continue;
        x.putImageData(t.img, t.x - r.x, t.y - r.y);
      }
      return c;
    }
    restore() { const x = U.ctx(this.c); for (const t of this.tiles.values()) x.putImageData(t.img, t.x, t.y); }
    get bytes() { let b = 0; for (const t of this.tiles.values()) b += t.img.data.length; return b; }
  }

  /* ---------------- History (memory aware) ---------------- */
  class History {
    constructor(doc) {
      this.doc = doc;
      this.stack = [];
      this.pos = 0;
      this.maxEntries = 200;
      this.maxBytes = 600 * 1024 * 1024;
    }
    push(entry) {
      this.stack.length = this.pos;
      entry.bytes = entry.bytes || 0;
      this.stack.push(entry);
      let total = this.stack.reduce((a, e) => a + e.bytes, 0);
      while (this.stack.length > 1 && (this.stack.length > this.maxEntries || total > this.maxBytes)) total -= this.stack.shift().bytes;
      this.pos = this.stack.length;
      this.doc.emit('history');
    }
    undo() { if (this.pos <= 0) return; this.pos--; this.stack[this.pos].undo(); this.doc.afterHistoryJump(); }
    redo() { if (this.pos >= this.stack.length) return; this.stack[this.pos].redo(); this.pos++; this.doc.afterHistoryJump(); }
    get canUndo() { return this.pos > 0; }
    get canRedo() { return this.pos < this.stack.length; }
    jumpTo(n) { n = U.clamp(n, 0, this.stack.length); while (this.pos > n) this.undo(); while (this.pos < n) this.redo(); }
    bytes() { return this.stack.reduce((a, e) => a + e.bytes, 0); }
    clear() { this.stack = []; this.pos = 0; }
  }

  /* ---------------- Document ---------------- */
  class Doc {
    constructor(w, h, bg) {
      this.width = w;
      this.height = h;
      this.name = 'Untitled';
      this.backgroundColor = bg || null;
      this.root = new Group('root');
      this.history = new History(this);
      this.selectionMask = null;
      this.selectionRev = 0;
      this.quickMask = null; // greyscale canvas while quick-mask mode is on
      this.editMask = false; // paint on the active node's mask
      this.guides = []; // {axis:'x'|'y', pos}
      this.assistants = []; // perspective / ruler helpers
      this.projection = U.canvas(w, h);
      this.strokeBuffer = U.canvas(w, h);
      this.dirty = null;
      this.stroke = null;
      this.wrapAround = false;
      this.cloneSource = null;
      this.listeners = new Set();
      this.pool = [];
      const bgLayer = new Layer('Background', w, h);
      if (bg) { const x = U.ctx(bgLayer.canvas); x.fillStyle = bg; x.fillRect(0, 0, w, h); }
      this.root.children.push(bgLayer);
      this.active = bgLayer;
      this.invalidateAll();
    }

    /* ----- events ----- */
    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit(type) { this.listeners.forEach((f) => f(type || 'change')); }
    afterHistoryJump() {
      if (!this.contains(this.active)) this.active = this.firstLayer() || this.root.children[0];
      if (this.editMask && !(this.active && this.active.mask)) this.editMask = false;
      for (const n of this.walk()) if (n.mask) markMask(n.mask);
      this.invalidateAll();
      this.selectionRev++;
      this.emit('history');
    }

    /* ----- tree helpers ----- */
    *walk(node) {
      node = node || this.root;
      for (const c of node.children) {
        yield c;
        if (c.isGroup) yield* this.walk(c);
      }
    }
    allNodes() { return Array.from(this.walk()); }
    allLayers() { return this.allNodes().filter((n) => n.isPixel); }
    firstLayer() { return this.allLayers().pop() || null; }
    contains(n) { return !!n && this.allNodes().includes(n); }
    parentOf(node, from) {
      from = from || this.root;
      for (const c of from.children) {
        if (c === node) return from;
        if (c.isGroup) { const p = this.parentOf(node, c); if (p) return p; }
      }
      return null;
    }
    depthOf(node) { let d = 0, p = this.parentOf(node); while (p && p !== this.root) { d++; p = this.parentOf(p); } return d; }
    isBackgroundLayer(n) { return n === this.root.children[0] && n.isPixel && !!this.backgroundColor; }
    displayList() {
      const out = [];
      const rec = (g, depth) => {
        for (let i = g.children.length - 1; i >= 0; i--) {
          const c = g.children[i];
          out.push({ node: c, depth });
          if (c.isGroup && !c.collapsed) rec(c, depth + 1);
        }
      };
      rec(this.root, 0);
      return out;
    }
    effectiveVisible(n) { let p = n; while (p && p !== this.root) { if (!p.visible) return false; p = this.parentOf(p); } return true; }
    effectiveLocked(n) { let p = n; while (p && p !== this.root) { if (p.locked) return true; p = this.parentOf(p); } return false; }
    setActive(n) {
      if (n && n !== this.active) { this.active = n; this.editMask = !!(n.mask && n.isAdjust); this.emit('active'); }
    }
    setEditMask(on) { this.editMask = !!on && !!(this.active && this.active.mask); this.emit('active'); }

    /* ----- painting surfaces ----- */
    // Where painting goes right now: {canvas, node, kind: 'pixels'|'mask'|'qm'} or null.
    surface() {
      if (this.quickMask) return { canvas: this.quickMask, node: null, kind: 'qm' };
      const a = this.active;
      if (!a || this.effectiveLocked(a)) return null;
      if (this.editMask && a.mask) return { canvas: a.mask, node: a, kind: 'mask' };
      if (a.isPixel) return { canvas: a.canvas, node: a, kind: 'pixels' };
      return null;
    }
    canPaint() { return !!this.surface(); }
    paintBlocker() {
      const a = this.active;
      if (!a) return 'No layer';
      if (this.effectiveLocked(a)) return 'Layer is locked';
      if (a.isGroup) return 'Select a paint layer (groups cannot be painted on)';
      if (a.isAdjust) return 'Adjustment layers have no pixels — click its mask to paint on the mask';
      return '';
    }

    /* ----- structural undo ----- */
    captureStruct() {
      const groups = [[this.root, this.root.children.slice()]];
      for (const n of this.walk()) if (n.isGroup) groups.push([n, n.children.slice()]);
      return { groups, active: this.active };
    }
    restoreStruct(s) { for (const [g, ch] of s.groups) g.children = ch.slice(); this.active = s.active; }
    structural(label, fn, extraBytes) {
      const before = this.captureStruct();
      const res = fn();
      if (res === false) return false;
      const after = this.captureStruct();
      this.history.push({
        label, bytes: extraBytes || 0,
        undo: () => { this.restoreStruct(before); if (res && res.undo) res.undo(); },
        redo: () => { this.restoreStruct(after); if (res && res.redo) res.redo(); },
      });
      this.invalidateAll();
      this.emit('layers');
      return true;
    }

    /* ----- layer operations ----- */
    insertAboveActive(node) {
      const a = this.active;
      if (a && a.isGroup && !a.collapsed) { a.children.push(node); return; }
      const p = (a && this.parentOf(a)) || this.root;
      const i = a ? p.children.indexOf(a) : p.children.length - 1;
      p.children.splice(i + 1, 0, node);
    }
    addLayer(name) {
      const L = new Layer(name || 'Layer ' + (this.allLayers().length + 1), this.width, this.height);
      this.structural('New Layer', () => { this.insertAboveActive(L); this.active = L; this.editMask = false; });
      return L;
    }
    addLayerFromCanvas(name, canvas, x, y) {
      const L = new Layer(name, this.width, this.height);
      U.ctx(L.canvas).drawImage(canvas, x || 0, y || 0);
      this.structural(name.startsWith('Paste') ? 'Paste' : 'New Layer', () => { this.insertAboveActive(L); this.active = L; this.editMask = false; });
      return L;
    }
    addGroup() {
      const G = new Group('Group ' + (this.allNodes().filter((n) => n.isGroup).length + 1));
      this.structural('New Group', () => { this.insertAboveActive(G); this.active = G; this.editMask = false; });
      return G;
    }
    addAdjustment(kind, params) {
      const A = new Adjust(kind, params);
      A.mask = this.selectionMask ? this.maskFromSelection() : newMask(this.width, this.height);
      this.structural('New ' + A.name, () => { this.insertAboveActive(A); this.active = A; this.editMask = true; });
      return A;
    }
    cloneNode(n, keepName) {
      let c;
      if (n.isGroup) { c = new Group(keepName ? n.name : n.name + ' copy'); c.collapsed = n.collapsed; c.children = n.children.map((q) => this.cloneNode(q, true)); }
      else if (n.isAdjust) { c = new Adjust(n.kind, JSON.parse(JSON.stringify(n.params))); c.name = keepName ? n.name : n.name + ' copy'; }
      else { c = new Layer(keepName ? n.name : n.name + ' copy', this.width, this.height); U.ctx(c.canvas).drawImage(n.canvas, 0, 0); c.textData = n.textData ? JSON.parse(JSON.stringify(n.textData)) : null; }
      Object.assign(c, { visible: n.visible, opacity: n.opacity, blendMode: n.blendMode, alphaLock: n.alphaLock, clip: n.clip, maskEnabled: n.maskEnabled });
      c.mask = n.mask ? U.clone(n.mask) : null;
      c.effects = n.effects ? JSON.parse(JSON.stringify(n.effects)) : null;
      return c;
    }
    duplicateLayer() {
      const a = this.active;
      if (!a) return;
      const c = this.cloneNode(a);
      this.structural('Duplicate Layer', () => { const p = this.parentOf(a); p.children.splice(p.children.indexOf(a) + 1, 0, c); this.active = c; });
    }
    deleteLayer() {
      const a = this.active;
      if (!a) return false;
      if (a.isPixel && this.allLayers().length <= 1) return false;
      if (a.isGroup && this.allLayers().every((l) => this.isInside(l, a))) return false;
      const p = this.parentOf(a);
      return this.structural('Delete Layer', () => {
        const i = p.children.indexOf(a);
        p.children.splice(i, 1);
        this.active = p.children[Math.max(0, i - 1)] || (p !== this.root ? p : this.firstLayer());
        this.editMask = false;
      });
    }
    isInside(node, group) { let p = this.parentOf(node); while (p) { if (p === group) return true; p = this.parentOf(p); } return false; }
    moveActive(dir) {
      const a = this.active, p = this.parentOf(a);
      if (!p) return;
      const i = p.children.indexOf(a), j = i + dir;
      return this.structural('Reorder Layer', () => {
        if (j < 0 || j >= p.children.length) {
          if (p === this.root) return false;
          const gp = this.parentOf(p), gi = gp.children.indexOf(p);
          p.children.splice(i, 1);
          gp.children.splice(dir > 0 ? gi + 1 : gi, 0, a);
          return;
        }
        const nb = p.children[j];
        p.children.splice(i, 1);
        if (nb.isGroup && !nb.collapsed) { if (dir > 0) nb.children.unshift(a); else nb.children.push(a); }
        else p.children.splice(j, 0, a);
      });
    }
    moveNode(node, target, where) {
      if (!node || !target || node === target || (node.isGroup && this.isInside(target, node))) return;
      return this.structural('Reorder Layer', () => {
        const p = this.parentOf(node);
        p.children.splice(p.children.indexOf(node), 1);
        if (where === 'into' && target.isGroup) { target.children.push(node); return; }
        const tp = this.parentOf(target), ti = tp.children.indexOf(target);
        tp.children.splice(where === 'above' ? ti + 1 : ti, 0, node);
      });
    }
    groupActive() {
      const a = this.active;
      if (!a) return;
      const G = new Group('Group ' + (this.allNodes().filter((n) => n.isGroup).length + 1));
      this.structural('Group Layer', () => { const p = this.parentOf(a), i = p.children.indexOf(a); p.children.splice(i, 1, G); G.children.push(a); this.active = G; });
    }
    ungroupActive() {
      const g = this.active;
      if (!g || !g.isGroup) return false;
      return this.structural('Ungroup', () => {
        const p = this.parentOf(g), i = p.children.indexOf(g);
        p.children.splice(i, 1, ...g.children);
        this.active = g.children[g.children.length - 1] || p.children[Math.max(0, i - 1)];
      });
    }
    // Render nodes in isolation (full canvas). Top-level opacity / blend / clip of `nodes[0]` can be neutralised.
    renderIsolated(nodes, neutralFirst) {
      const c = U.canvas(this.width, this.height), r = { x: 0, y: 0, w: this.width, h: this.height };
      const f = nodes[0], saved = { o: f.opacity, b: f.blendMode, c: f.clip };
      if (neutralFirst) { f.opacity = 1; f.blendMode = 'normal'; f.clip = false; }
      const lvl = this._level;
      this._level = 0;
      const acc = this.tmp(this._level++, r.w, r.h);
      this.composeChildren(U.ctx(acc), nodes, r);
      U.ctx(c).drawImage(acc, 0, 0);
      this._level = lvl;
      if (neutralFirst) { f.opacity = saved.o; f.blendMode = saved.b; f.clip = saved.c; }
      this.pool = [];
      return c;
    }
    renderNode(n) { return n.isPixel && !n.mask && !n.effects ? U.clone(n.canvas) : this.renderIsolated([n], true); }
    mergeDown() {
      const a = this.active, p = this.parentOf(a), i = p.children.indexOf(a), below = p.children[i - 1];
      if (!below || !below.isPixel) return false;
      const before = { canvas: U.clone(below.canvas), mask: below.mask, effects: below.effects };
      const merged = this.renderIsolated([below, a], true);
      const after = { canvas: merged, mask: null, effects: null };
      const put = (s) => { const x = U.ctx(below.canvas); x.clearRect(0, 0, this.width, this.height); x.drawImage(s.canvas, 0, 0); below.mask = s.mask; below.effects = s.effects; below.textData = null; below.rev++; };
      return this.structural('Merge Down', () => {
        p.children.splice(i, 1);
        this.active = below;
        this.editMask = false;
        put(after);
        return { undo: () => put(before), redo: () => put(after) };
      }, this.width * this.height * 8);
    }
    mergeVisible() {
      const flat = U.clone(this.getProjection());
      const L = new Layer('Merged', this.width, this.height);
      U.ctx(L.canvas).drawImage(flat, 0, 0);
      this.structural('Merge Visible', () => { this.root.children = this.root.children.filter((n) => !n.visible).concat([L]); this.active = L; this.editMask = false; }, this.width * this.height * 4);
    }
    flattenImage() {
      const flat = U.clone(this.getProjection());
      const L = new Layer('Background', this.width, this.height), x = U.ctx(L.canvas);
      if (this.backgroundColor) { x.fillStyle = this.backgroundColor; x.fillRect(0, 0, this.width, this.height); }
      x.drawImage(flat, 0, 0);
      this.structural('Flatten Image', () => { this.root.children = [L]; this.active = L; this.editMask = false; }, this.width * this.height * 4);
    }
    // Change node properties with undo. Rapid changes of the same keys merge into one step.
    setProps(node, props, label) {
      const keys = Object.keys(props), before = {}, after = {};
      keys.forEach((k) => { before[k] = node[k]; after[k] = props[k]; });
      Object.assign(node, after);
      const top = this.history.stack[this.history.pos - 1];
      if (top && top.propNode === node && top.propKeys === keys.join() && performance.now() - top.time < 800) {
        top.redo = () => Object.assign(node, after);
        top.time = performance.now();
      } else {
        this.history.push({
          label: label || 'Layer Property', propNode: node, propKeys: keys.join(), time: performance.now(),
          undo: () => Object.assign(node, before), redo: () => Object.assign(node, after),
        });
      }
      if (props.mask !== undefined) this.editMask = this.editMask && !!node.mask;
      this.invalidateAll();
      this.emit('layers');
    }

    /* ----- masks ----- */
    maskFromSelection() {
      const m = newMask(this.width, this.height, '#000');
      if (this.selectionMask) { const x = U.ctx(m); x.drawImage(this.selectionMask, 0, 0); greyify(m, { x: 0, y: 0, w: this.width, h: this.height }); }
      return m;
    }
    addMask(fromSelection, hideAll) {
      const n = this.active;
      if (!n || n.mask) return false;
      const m = fromSelection && this.selectionMask ? this.maskFromSelection() : newMask(this.width, this.height, hideAll ? '#000' : '#fff');
      this.setProps(n, { mask: m, maskEnabled: true }, 'Add Mask');
      this.setEditMask(true);
      return true;
    }
    deleteMask() { const n = this.active; if (n && n.mask) this.setProps(n, { mask: null }, 'Delete Mask'); this.editMask = false; }
    invertMask() {
      const n = this.active;
      if (!n || !n.mask) return;
      const m = U.clone(n.mask), x = U.ctx(m);
      x.globalCompositeOperation = 'difference'; x.fillStyle = '#fff'; x.fillRect(0, 0, m.width, m.height);
      this.setProps(n, { mask: m }, 'Invert Mask');
    }
    applyMask() {
      const n = this.active;
      if (!n || !n.mask || !n.isPixel) return false;
      const before = U.clone(n.canvas), mask = n.mask, after = U.clone(n.canvas), ax = U.ctx(after);
      ax.globalCompositeOperation = 'destination-in'; ax.drawImage(maskAlpha(mask), 0, 0);
      const put = (c, m) => { const x = U.ctx(n.canvas); x.clearRect(0, 0, this.width, this.height); x.drawImage(c, 0, 0); n.mask = m; n.rev++; };
      put(after, null);
      this.editMask = false;
      this.history.push({ label: 'Apply Mask', bytes: this.width * this.height * 8, undo: () => put(before, mask), redo: () => put(after, null) });
      this.invalidateAll();
      this.emit('layers');
      return true;
    }
    selectionFromMask() {
      const n = this.active;
      if (!n || !n.mask) return;
      this.changeSelection('Mask to Selection', U.clone(maskAlpha(n.mask)));
    }

    /* ----- quick mask ----- */
    enterQuickMask() {
      if (this.quickMask) return;
      const q = newMask(this.width, this.height, '#000');
      if (this.selectionMask) { U.ctx(q).drawImage(this.selectionMask, 0, 0); greyify(q, { x: 0, y: 0, w: this.width, h: this.height }); }
      this.quickMask = q;
      this.quickRev = (this.quickRev || 0) + 1;
      this.emit('quickmask');
    }
    exitQuickMask() {
      const q = this.quickMask;
      if (!q) return;
      this.quickMask = null;
      this.discardStroke();
      markMask(q);
      const a = U.clone(maskAlpha(q));
      const empty = !ND.Sel.bbox(a, 4);
      this.changeSelection('Quick Mask', empty ? null : a);
      this.emit('quickmask');
    }

    /* ----- compositor ----- */
    invalidate(r) { this.dirty = r ? U.union(this.dirty, r) : { x: 0, y: 0, w: this.width, h: this.height }; }
    invalidateAll() { this.dirty = { x: 0, y: 0, w: this.width, h: this.height }; }
    getProjection() { this.recompose(); return this.projection; }
    tmp(level, w, h) {
      let c = this.pool[level];
      // Keep scratch canvases close to the dirty-rect size: reusing a huge canvas after it was used
      // as a drawImage source forces the browser to copy all of it (copy-on-write), which is slow.
      if (!c || c.width < w || c.height < h || c.width * c.height > w * h * 4 + 65536) { c = U.canvas(w, h); this.pool[level] = c; }
      const x = U.ctx(c);
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
      x.filter = 'none';
      x.clearRect(0, 0, w, h);
      return c;
    }
    // Extra margin needed around a dirty rect for effects/adjustments that look at neighbouring pixels.
    neededPad() {
      let pad = 0;
      for (const n of this.walk()) {
        if (!n.visible) continue;
        if (n.effects && ND.Effects) pad = Math.max(pad, ND.Effects.extent(n.effects));
        if (n.isAdjust && ND.Adjust) pad = Math.max(pad, ND.Adjust.pad(n.kind, n.params, this));
      }
      return Math.ceil(pad);
    }
    recompose() {
      if (!this.dirty) return;
      const r = U.clipRect(this.dirty, this.width, this.height);
      this.dirty = null;
      if (!r) return;
      this.displayDirty = U.union(this.displayDirty, r); // the view copies these areas to its GPU canvas
      const pad = this.neededPad();
      const rr = pad ? U.clipRect({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }, this.width, this.height) : r;
      const x = U.ctx(this.projection);
      x.clearRect(r.x, r.y, r.w, r.h);
      this._level = 0;
      const acc = this.tmp(this._level++, rr.w, rr.h);
      this.composeChildren(U.ctx(acc), this.root.children, rr);
      x.drawImage(acc, r.x - rr.x, r.y - rr.y, r.w, r.h, r.x, r.y, r.w, r.h);
      this._level = 0;
    }
    // Draw `src` (full doc size, or cropped to rect when `cropped`) onto ctx (rect-local).
    blendCanvasInto(ctx, src, mode, opacity, r, cropped) {
      const sx = cropped ? 0 : r.x, sy = cropped ? 0 : r.y;
      if (B.isNative(mode)) {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.globalCompositeOperation = B.NATIVE[mode];
        ctx.drawImage(src, sx, sy, r.w, r.h, 0, 0, r.w, r.h);
        ctx.restore();
      } else {
        const d = ctx.getImageData(0, 0, r.w, r.h), s = U.ctx(src).getImageData(sx, sy, r.w, r.h);
        B.blendImageData(d, s, mode, opacity, false);
        ctx.putImageData(d, 0, 0);
      }
    }
    // Pixel layer content inside rect (with any live stroke), rect-sized canvas.
    layerPixels(L, r) {
      const c = this.tmp(this._level++, r.w, r.h), x = U.ctx(c);
      x.drawImage(L.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      if (this.stroke && L === this.active && this.stroke.kind === 'pixels') this.applyStrokeTo(x, r);
      return c;
    }
    // Alpha mask for a node inside rect (white with alpha), including a live mask stroke. Null = no mask.
    maskRect(n, r) {
      if (!n.mask || !n.maskEnabled) return null;
      const c = this.tmp(this._level++, r.w, r.h), x = U.ctx(c);
      if (this.stroke && n === this.active && this.stroke.kind === 'mask') {
        x.drawImage(n.mask, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        this.applyStrokeTo(x, r);
        const img = x.getImageData(0, 0, r.w, r.h), d = img.data;
        for (let i = 0; i < d.length; i += 4) { const v = U.luma(d[i], d[i + 1], d[i + 2]) * (d[i + 3] / 255); d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = v; }
        x.putImageData(img, 0, 0);
      } else x.drawImage(maskAlpha(n.mask), r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      return c;
    }
    applyMaskTo(ctx, m, r) {
      if (!m) return;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(m, 0, 0, r.w, r.h, 0, 0, r.w, r.h);
      ctx.restore();
    }
    // Apply an adjustment node onto ctx (rect-local) — the backdrop below it.
    applyAdjust(ctx, n, r) {
      const img = ctx.getImageData(0, 0, r.w, r.h);
      const orig = new Uint8ClampedArray(img.data);
      ND.Adjust.apply(n.kind, img, n.params, { x: r.x, y: r.y, docW: this.width, docH: this.height });
      const m = this.maskRect(n, r);
      const md = m ? U.ctx(m).getImageData(0, 0, r.w, r.h).data : null;
      const d = img.data, op = n.opacity;
      for (let i = 0; i < d.length; i += 4) {
        const a = orig[i + 3];
        if (!a) { d[i + 3] = 0; continue; }
        const k = op * (md ? md[i + 3] / 255 : 1);
        if (k >= 1) { d[i + 3] = a; continue; }
        d[i] = orig[i] + (d[i] - orig[i]) * k;
        d[i + 1] = orig[i + 1] + (d[i + 1] - orig[i + 1]) * k;
        d[i + 2] = orig[i + 2] + (d[i + 2] - orig[i + 2]) * k;
        d[i + 3] = a;
      }
      ctx.putImageData(img, 0, 0);
    }
    composeNode(n, r) {
      let base;
      if (n.isGroup) { base = this.tmp(this._level++, r.w, r.h); this.composeChildren(U.ctx(base), n.children, r); }
      else if (n.isAdjust) { base = this.tmp(this._level++, r.w, r.h); ND.Adjust.renderFill(n.kind, U.ctx(base), r, n.params, this); }
      else base = this.layerPixels(n, r);
      this.applyMaskTo(U.ctx(base), this.maskRect(n, r), r);
      return base;
    }
    composeChildren(ctx, children, r) {
      const lvl0 = this._level || 0;
      for (let i = 0; i < children.length; i++) {
        const n = children[i];
        if (n.clip && i > 0) continue;
        let j = i + 1;
        const clips = [];
        while (j < children.length && children[j].clip) { clips.push(children[j]); j++; }
        if (!n.visible) continue;
        if (n.isAdjust && !ND.Adjust.isFill(n.kind)) { this.applyAdjust(ctx, n, r); this._level = lvl0; continue; }
        const base = this.composeNode(n, r), bx = U.ctx(base);
        const fx = n.effects && ND.Effects && ND.Effects.any(n.effects) ? n.effects : null;
        if (fx) ND.Effects.inner(this, bx, base, r, fx);
        if (clips.some((c) => c.visible)) {
          const keep = this.tmp(this._level++, r.w, r.h);
          U.ctx(keep).drawImage(base, 0, 0);
          for (const c of clips) {
            if (!c.visible) continue;
            if (c.isAdjust && !ND.Adjust.isFill(c.kind)) {
              // adjust only the base: run it on a copy and restore the base alpha
              this.applyAdjust(bx, c, r);
              this.applyMaskTo(bx, keep, r);
              continue;
            }
            const px = this.composeNode(c, r), pxx = U.ctx(px);
            pxx.save(); pxx.globalCompositeOperation = 'destination-in'; pxx.drawImage(keep, 0, 0, r.w, r.h, 0, 0, r.w, r.h); pxx.restore();
            if (c.blendMode === 'normal') {
              bx.save(); bx.globalAlpha = c.opacity; bx.globalCompositeOperation = 'source-atop';
              bx.drawImage(px, 0, 0, r.w, r.h, 0, 0, r.w, r.h); bx.restore();
            } else this.blendCanvasInto(bx, px, c.blendMode, c.opacity, r, true);
          }
        }
        if (fx) ND.Effects.outer(this, bx, base, r, fx);
        this.blendCanvasInto(ctx, base, n.blendMode, n.opacity, r, true);
        this._level = lvl0;
      }
      this._level = lvl0;
    }

    /* ----- selection ----- */
    hasSelection() { return !!this.selectionMask; }
    setSelection(mask) { this.selectionMask = mask; this.selectionRev++; this.emit('selection'); }
    clearSelection() { this.setSelection(null); }
    selectAll() { const m = U.canvas(this.width, this.height), x = U.ctx(m); x.fillStyle = '#fff'; x.fillRect(0, 0, this.width, this.height); this.setSelection(m); }
    invertSelection() {
      const m = U.canvas(this.width, this.height), x = U.ctx(m);
      x.fillStyle = '#fff'; x.fillRect(0, 0, this.width, this.height);
      if (this.selectionMask) { x.globalCompositeOperation = 'destination-out'; x.drawImage(this.selectionMask, 0, 0); }
      this.setSelection(m);
    }
    changeSelection(label, mask) {
      const before = this.selectionMask, after = mask;
      this.setSelection(after);
      this.history.push({ label, undo: () => this.setSelection(before), redo: () => this.setSelection(after), bytes: 0 });
    }

    /* ----- pixel edits with undo ----- */
    // Record an edit of any canvas surface (layer pixels, mask or quick mask).
    recordSurface(S, beforeImg, rect, label, prevText) {
      const c = S.canvas, afterImg = U.ctx(c).getImageData(rect.x, rect.y, rect.w, rect.h);
      const touch = () => {
        if (S.kind === 'pixels') { S.node.rev++; if (label !== 'Text') S.node.textData = null; }
        else { markMask(c, rect); if (S.node) S.node.rev++; this.quickRev = (this.quickRev || 0) + 1; }
      };
      const textBefore = S.kind === 'pixels' ? (prevText !== undefined ? prevText : S.node.textData) : null;
      touch();
      const textAfter = S.kind === 'pixels' ? S.node.textData : null;
      this.history.push({
        label, bytes: rect.w * rect.h * 8,
        undo: () => { U.ctx(c).putImageData(beforeImg, rect.x, rect.y); touch(); if (S.kind === 'pixels') S.node.textData = textBefore; },
        redo: () => { U.ctx(c).putImageData(afterImg, rect.x, rect.y); touch(); if (S.kind === 'pixels') S.node.textData = textAfter; },
      });
    }
    recordRegion(layer, beforeImg, rect, label) { this.recordSurface({ canvas: layer.canvas, node: layer, kind: 'pixels' }, beforeImg, rect, label); }
    /* Draw something on the current surface through the selection, honouring alpha lock.
     * draw(ctx) paints in document coordinates. opts: {rect, mode: 'normal'|'erase'|blendId, opacity} */
    paintOnActive(label, draw, opts) {
      opts = opts || {};
      const S = this.surface();
      if (!S) return false;
      const rect = U.clipRect(opts.rect || { x: 0, y: 0, w: this.width, h: this.height }, this.width, this.height);
      if (!rect) return false;
      const scratch = U.canvas(this.width, this.height);
      draw(U.ctx(scratch));
      this.commitScratch(S, scratch, rect, opts.mode || 'normal', opts.opacity == null ? 1 : opts.opacity, label);
      return true;
    }
    commitScratch(S, scratch, rect, mode, opacity, label) {
      if (S instanceof Layer) S = { canvas: S.canvas, node: S, kind: 'pixels' };
      const lx = U.ctx(S.canvas), before = lx.getImageData(rect.x, rect.y, rect.w, rect.h);
      if (this.selectionMask) { const sx = U.ctx(scratch); sx.save(); sx.globalCompositeOperation = 'destination-in'; sx.drawImage(this.selectionMask, 0, 0); sx.restore(); }
      if (S.kind !== 'pixels' && mode === 'erase') {
        // erasing on a mask hides: paint black
        const sx = U.ctx(scratch); sx.save(); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#000'; sx.fillRect(0, 0, this.width, this.height); sx.restore();
        mode = 'normal';
      }
      if (mode === 'erase' || B.isNative(mode)) {
        lx.save();
        lx.globalAlpha = opacity;
        lx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : B.NATIVE[mode];
        lx.drawImage(scratch, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
        lx.restore();
      } else {
        const d = lx.getImageData(rect.x, rect.y, rect.w, rect.h);
        B.blendImageData(d, U.ctx(scratch).getImageData(rect.x, rect.y, rect.w, rect.h), mode, opacity, false);
        lx.putImageData(d, rect.x, rect.y);
      }
      if (S.kind === 'pixels' && S.node.alphaLock) this.restoreAlpha(S.canvas, before, rect);
      if (S.kind !== 'pixels') greyify(S.canvas, rect);
      this.invalidate(rect);
      this.recordSurface(S, before, rect, label);
    }
    restoreAlpha(target, before, rect) {
      const c = target.canvas || target, lx = U.ctx(c), now = lx.getImageData(rect.x, rect.y, rect.w, rect.h), a = before.data, b = now.data;
      for (let i = 3; i < a.length; i += 4) {
        if (a[i] === 0) { b[i - 3] = a[i - 3]; b[i - 2] = a[i - 2]; b[i - 1] = a[i - 1]; }
        b[i] = a[i];
      }
      lx.putImageData(now, rect.x, rect.y);
    }
    // For tools that edit the surface directly (smudge, dodge, liquify…): restore outside the selection.
    // beforeCanvas holds the original pixels; it may be a region starting at (ox, oy) instead of the full canvas.
    finishDirectEdit(S, beforeCanvas, rect, label, ox, oy) {
      if (S instanceof Layer) S = { canvas: S.canvas, node: S, kind: 'pixels' };
      rect = U.clipRect(rect, this.width, this.height);
      if (!rect) return;
      ox = ox || 0; oy = oy || 0;
      const lx = U.ctx(S.canvas), beforeImg = U.ctx(beforeCanvas).getImageData(rect.x - ox, rect.y - oy, rect.w, rect.h);
      if (this.selectionMask) {
        const keep = U.canvas(rect.w, rect.h), kx = U.ctx(keep);
        kx.drawImage(beforeCanvas, rect.x - ox, rect.y - oy, rect.w, rect.h, 0, 0, rect.w, rect.h);
        kx.globalCompositeOperation = 'destination-out';
        kx.drawImage(this.selectionMask, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        const cur = U.canvas(rect.w, rect.h), cx = U.ctx(cur);
        cx.drawImage(S.canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        cx.globalCompositeOperation = 'destination-in';
        cx.drawImage(this.selectionMask, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        lx.clearRect(rect.x, rect.y, rect.w, rect.h);
        lx.drawImage(keep, rect.x, rect.y);
        lx.drawImage(cur, rect.x, rect.y);
      }
      if (S.kind === 'pixels' && S.node.alphaLock) this.restoreAlpha(S.canvas, beforeImg, rect);
      if (S.kind !== 'pixels') greyify(S.canvas, rect);
      this.invalidate(rect);
      this.recordSurface(S, beforeImg, rect, label);
    }

    /* ----- live strokes ----- */
    beginStroke(opts) {
      const S = this.surface();
      this.stroke = { mode: opts.mode || 'paint', blend: opts.blend || 'normal', opacity: opts.opacity == null ? 1 : opts.opacity, rect: null, kind: S ? S.kind : 'pixels', surface: S };
      if (this.stroke.kind !== 'pixels' && this.stroke.mode === 'erase') { this.stroke.mode = 'paint'; this.stroke.eraseBlack = true; }
      // only clear what the previous stroke used — clearing a huge buffer every stroke is slow
      if (this.bufUsed) { const r = U.clipRect(this.bufUsed, this.width, this.height); if (r) U.ctx(this.strokeBuffer).clearRect(r.x, r.y, r.w, r.h); this.bufUsed = null; }
    }
    strokeTouched(r) {
      if (!this.stroke) return;
      this.stroke.rect = U.union(this.stroke.rect, r);
      this.bufUsed = U.union(this.bufUsed, r);
      this.invalidate(r);
      if (this.stroke.kind === 'qm') this.qmDirty = U.union(this.qmDirty, r);
    }
    // Composite the stroke buffer (rect area) onto a rect-local ctx holding the surface pixels.
    applyStrokeTo(ctx, r) {
      const s = this.stroke;
      if (!s || !s.rect) return;
      let src = this.strokeBuffer, cropped = false;
      if (this.selectionMask || s.eraseBlack) {
        const m = this.tmp(this._level++, r.w, r.h), mx = U.ctx(m);
        mx.drawImage(this.strokeBuffer, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        if (s.eraseBlack) { mx.globalCompositeOperation = 'source-in'; mx.fillStyle = '#000'; mx.fillRect(0, 0, r.w, r.h); }
        if (this.selectionMask) { mx.globalCompositeOperation = 'destination-in'; mx.drawImage(this.selectionMask, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); }
        mx.globalCompositeOperation = 'source-over';
        src = m; cropped = true;
      }
      this.blendStroke(ctx, src, r, cropped);
    }
    blendStroke(ctx, src, r, cropped) {
      const s = this.stroke, L = this.active;
      const keepAlpha = s.kind === 'pixels' && L && L.alphaLock;
      const sx = cropped ? 0 : r.x, sy = cropped ? 0 : r.y;
      if (keepAlpha && s.mode !== 'erase') {
        const m = this.tmp(this._level++, r.w, r.h), mx = U.ctx(m);
        mx.drawImage(src, sx, sy, r.w, r.h, 0, 0, r.w, r.h);
        mx.globalCompositeOperation = 'destination-in';
        mx.drawImage(ctx.canvas, 0, 0, r.w, r.h, 0, 0, r.w, r.h);
        mx.globalCompositeOperation = 'source-over';
        src = m; cropped = true;
      }
      const ox = cropped ? 0 : r.x, oy = cropped ? 0 : r.y;
      if (s.mode === 'erase') {
        if (keepAlpha) return; // alpha-locked eraser does nothing (like Krita)
        ctx.save(); ctx.globalAlpha = s.opacity; ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(src, ox, oy, r.w, r.h, 0, 0, r.w, r.h); ctx.restore();
      } else if (keepAlpha && B.isNative(s.blend)) {
        ctx.save(); ctx.globalAlpha = s.opacity; ctx.globalCompositeOperation = s.blend === 'normal' ? 'source-atop' : B.NATIVE[s.blend];
        ctx.drawImage(src, ox, oy, r.w, r.h, 0, 0, r.w, r.h); ctx.restore();
      } else this.blendCanvasInto(ctx, src, s.blend, s.opacity, r, cropped);
    }
    // The current surface with the live stroke applied, rect-sized (used for quick-mask preview).
    surfaceWithStroke(r) {
      const S = this.stroke && this.stroke.surface;
      if (!S) return null;
      const c = U.canvas(r.w, r.h), x = U.ctx(c);
      x.drawImage(S.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      const lvl = this._level; this._level = 0;
      this.applyStrokeTo(x, r);
      this._level = lvl;
      return c;
    }
    commitStroke(label) {
      const s = this.stroke;
      if (!s) return;
      const S = s.surface || this.surface();
      const r = U.clipRect(s.rect, this.width, this.height);
      if (!r || !S) { this.discardStroke(); return; }
      const lx = U.ctx(S.canvas), before = lx.getImageData(r.x, r.y, r.w, r.h);
      const work = U.canvas(r.w, r.h), wx = U.ctx(work);
      wx.drawImage(S.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      this._level = 0;
      this.applyStrokeTo(wx, r);
      this._level = 0;
      lx.clearRect(r.x, r.y, r.w, r.h);
      lx.drawImage(work, r.x, r.y);
      if (S.kind === 'pixels' && S.node.alphaLock) this.restoreAlpha(S.canvas, before, r);
      if (S.kind !== 'pixels') greyify(S.canvas, r);
      this.stroke = null;
      this.pool = [];
      const used = U.clipRect(U.union(this.bufUsed, r), this.width, this.height);
      if (used) U.ctx(this.strokeBuffer).clearRect(used.x, used.y, used.w, used.h);
      this.bufUsed = null;
      this.invalidate(r);
      this.qmDirty = U.union(this.qmDirty, r);
      this.recordSurface(S, before, r, label || 'Brush Stroke');
    }
    discardStroke() {
      if (!this.stroke) return;
      const r = this.stroke.rect;
      this.stroke = null;
      const used = U.clipRect(U.union(this.bufUsed, r), this.width, this.height);
      if (used) U.ctx(this.strokeBuffer).clearRect(used.x, used.y, used.w, used.h);
      this.bufUsed = null;
      if (r) { this.invalidate(r); this.qmDirty = U.union(this.qmDirty, r); }
    }

    /* ----- whole-canvas operations (crop / scale / rotate / canvas size) ----- */
    resizeAll(w, h, drawFn, label) {
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
      const W = this.width, H = this.height, nodes = this.allNodes();
      const layers = nodes.filter((n) => n.isPixel), masked = nodes.filter((n) => n.mask);
      const before = { c: layers.map((l) => l.canvas), m: masked.map((n) => n.mask), g: this.guides.slice() };
      const after = {
        c: layers.map((l) => { const c = U.canvas(w, h), x = U.ctx(c); x.imageSmoothingQuality = 'high'; drawFn(x, l.canvas, l); return c; }),
        m: masked.map((n) => { const c = U.canvas(w, h), x = U.ctx(c); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.imageSmoothingQuality = 'high'; drawFn(x, n.mask, null); return c; }),
        g: [],
      };
      const selBefore = this.selectionMask;
      const apply = (ww, hh, s) => {
        this.width = ww; this.height = hh;
        layers.forEach((l, i) => { l.canvas = s.c[i]; l.rev++; });
        masked.forEach((n, i) => { n.mask = s.m[i]; n.rev++; });
        this.guides = s.g.slice();
        this.projection = U.canvas(ww, hh);
        this.strokeBuffer = U.canvas(ww, hh);
        this.quickMask = null;
        this.pool = [];
        this.invalidateAll();
        this.emit('resize');
      };
      apply(w, h, after);
      this.selectionMask = null;
      this.history.push({
        label, bytes: (W * H + w * h) * 4 * (layers.length + masked.length),
        undo: () => { apply(W, H, before); this.setSelection(selBefore); },
        redo: () => { apply(w, h, after); this.setSelection(null); },
      });
      this.emit('layers');
    }

    /* ----- utility ----- */
    flatCopy() { return U.clone(this.getProjection()); }
    // Pixels to sample from: the merged image or the active layer.
    sampleCanvas(merged) {
      if (merged) return this.getProjection();
      const a = this.active;
      if (a && a.isPixel) return a.canvas;
      if (a && a.isGroup) return this.renderNode(a);
      return this.getProjection();
    }
  }

  ND.Layer = Layer;
  ND.Group = Group;
  ND.AdjustLayer = Adjust;
  ND.DocMask = DocMask;
  ND.TileBackup = TileBackup;
  ND.Doc = Doc;
})();
