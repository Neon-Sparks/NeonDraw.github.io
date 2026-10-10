/* Neon Sparks Draw — document model: layer tree, masks, adjustment layers, layer effects,
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
      this.shapeData = null; // vector shape layers remember their paths and style
      this.colorizeData = null; // colourise (lazy brush) set membership
      this.frames = null; // animation keyframes { frame: canvas }
      this.smart = null; // smart object: { src, m, mesh, g, contents }
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
  // a small number for each canvas object (so a fingerprint notices when a layer's canvas is swapped)
  const canvasIds = new WeakMap();
  let nextCanvasId = 1;
  const idOf = (o) => { if (!o) return 0; let v = canvasIds.get(o); if (!v) { v = nextCanvasId++; canvasIds.set(o, v); } return v; };
  // the box around a canvas's visible pixels (w × h area at 0,0), or null when it is empty
  function alphaBounds(c, w, h) {
    if (c._nd16) return { x: 0, y: 0, w, h };
    const d = new Uint32Array(U.ctx(c).getImageData(0, 0, w, h).data.buffer);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let a = -1, b = -1;
      for (let x = 0; x < w; x++) if (d[row + x] >>> 24) { a = x; break; }
      if (a < 0) continue;
      for (let x = w - 1; x >= a; x--) if (d[row + x] >>> 24) { b = x; break; }
      if (a < x0) x0 = a; if (b > x1) x1 = b; if (y < y0) y0 = y; y1 = y;
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
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
      this.paths = [];
      this.alphaChannels = []; // saved selections (grey canvases, white = selected)
      this.chanEdit = { r: true, g: true, b: true }; // colour channels you paint on
      this.chanView = { r: true, g: true, b: true }; // colour channels you see // Bézier paths (pen tool)
      this.activePath = null;
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
      else { c = new Layer(keepName ? n.name : n.name + ' copy', this.width, this.height); U.ctx(c.canvas).drawImage(n.canvas, 0, 0); c.textData = n.textData ? JSON.parse(JSON.stringify(n.textData)) : null; c.shapeData = n.shapeData ? JSON.parse(JSON.stringify(n.shapeData)) : null;
        if (n.frames) { c.frames = {}; for (const k in n.frames) { c.frames[k] = U.clone(n.frames[k]); if (n.frames[k] === n.canvas) c.canvas = c.frames[k]; } }
        if (n.smart) c.smart = Object.assign({}, n.smart, ND.SmartObj.state(n.smart));
        if (n.tween) c.tween = JSON.parse(JSON.stringify(n.tween));
        if (n.onion) c.onion = Object.assign({}, n.onion); }
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
      if (this.qmChannel) {
        // finished painting on an alpha channel: it stays a channel (the selection is left alone)
        this.quickMask = null; this.discardStroke(); markMask(q);
        this.qmChannel = null;
        this.emit('quickmask'); this.emit('channels');
        return;
      }
      this.quickMask = null;
      this.discardStroke();
      markMask(q);
      const a = U.clone(maskAlpha(q));
      const empty = !ND.Sel.bbox(a, 4);
      this.changeSelection('Quick Mask', empty ? null : a);
      this.emit('quickmask');
    }

    /* ----- alpha channels (saved selections) ----- */
    saveSelectionAsChannel(name) {
      if (!this.selectionMask) return null;
      const g = newMask(this.width, this.height, '#000');
      U.ctx(g).drawImage(this.selectionMask, 0, 0);
      greyify(g, { x: 0, y: 0, w: this.width, h: this.height });
      const ch = { id: 'ch' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name || 'Alpha ' + (this.alphaChannels.length + 1), canvas: g };
      const add = () => { this.alphaChannels.push(ch); this.emit('channels'); }, remove = () => { this.alphaChannels = this.alphaChannels.filter((c) => c !== ch); this.emit('channels'); };
      add();
      this.history.push({ label: 'Save Selection as Channel', bytes: 64, undo: remove, redo: add });
      return ch;
    }
    deleteChannel(ch) {
      const i = this.alphaChannels.indexOf(ch);
      if (i < 0) return;
      if (this.qmChannel === ch) this.exitQuickMask();
      const remove = () => { this.alphaChannels = this.alphaChannels.filter((c) => c !== ch); this.emit('channels'); };
      const add = () => { this.alphaChannels.splice(Math.min(i, this.alphaChannels.length), 0, ch); this.emit('channels'); };
      remove();
      this.history.push({ label: 'Delete Channel', bytes: 64, undo: add, redo: remove });
    }
    // mode: 'replace' | 'add' | 'subtract' | 'intersect'
    loadChannelSelection(ch, mode) {
      markMask(ch.canvas);
      const a = U.clone(maskAlpha(ch.canvas)), cur = this.selectionMask;
      if (cur && mode && mode !== 'replace') {
        const x = U.ctx(a);
        if (mode === 'add') { x.drawImage(cur, 0, 0); }
        else if (mode === 'subtract') { const c = U.clone(cur), cx = U.ctx(c); cx.globalCompositeOperation = 'destination-out'; cx.drawImage(a, 0, 0); x.globalCompositeOperation = 'copy'; x.drawImage(c, 0, 0); }
        else if (mode === 'intersect') { x.globalCompositeOperation = 'destination-in'; x.drawImage(cur, 0, 0); }
      }
      this.changeSelection('Load Channel', ND.Sel.bbox(a, 4) ? a : null);
    }
    // paint on an alpha channel (shown like a quick mask: white = selected); Q or Done finishes
    editChannel(ch) {
      if (this.quickMask) this.exitQuickMask();
      this.quickMask = ch.canvas;
      this.qmChannel = ch;
      this.quickRev = (this.quickRev || 0) + 1;
      this.emit('quickmask'); this.emit('channels');
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
        // special blend modes: on the graphics card when possible, otherwise pixel by pixel
        ND.GPU.blendAny(ctx, 0, 0, src, sx, sy, r.w, r.h, mode, opacity);
      }
    }
    // Pixel layer content inside rect (with any live stroke), rect-sized canvas.
    layerPixels(L, r) {
      const c = this.tmp(this._level++, r.w, r.h), x = U.ctx(c);
      if (L.tw) {
        // animation motion (tweening): moved / scaled / rotated / faded on top of the layer's own pixels
        x.save(); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        x.translate(-r.x, -r.y); x.transform(L.tw.m.a, L.tw.m.b, L.tw.m.c, L.tw.m.d, L.tw.m.e, L.tw.m.f); x.globalAlpha = L.tw.o;
        x.drawImage(L.canvas, 0, 0); x.restore();
      } else x.drawImage(L.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      if (this.stroke && L === this.active && this.stroke.kind === 'pixels') {
        this.applyStrokeTo(x, r);
        // live preview of painting on only some colour channels
        if (ND.Channels && ND.Channels.limited(this)) x.putImageData(ND.Channels.mix(x.getImageData(0, 0, r.w, r.h), U.ctx(L.canvas).getImageData(r.x, r.y, r.w, r.h), this.chanEdit), 0, 0);
      }
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
      const env = { x: r.x, y: r.y, docW: this.width, docH: this.height, fg: ND.App ? ND.App.state.fg : '#000000', bg: ND.App ? ND.App.state.bg : '#ffffff' };
      // 16-bit documents: worked out at full precision
      if (ctx.canvas && ctx.canvas._nd16 && ND.Deep && ND.Deep.adjust16(ctx, n, r, env, this.maskRect(n, r))) return;
      // fast path: on the graphics card as a colour table (much less lag while dragging sliders)
      if (ND.GPU && ND.GPU.pointwise(n.kind) && ND.GPU.adjust(ctx, r, n, this.maskRect(n, r), env)) return;
      const img = ctx.getImageData(0, 0, r.w, r.h);
      const orig = new Uint8ClampedArray(img.data);
      ND.Adjust.apply(n.kind, img, n.params, { x: r.x, y: r.y, docW: this.width, docH: this.height, fg: ND.App ? ND.App.state.fg : '#000000', bg: ND.App ? ND.App.state.bg : '#ffffff' });
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
    // a short fingerprint of what some layers look like (to know when a cached result is still right)
    sigOf(nodes) {
      return nodes.map((n) => [idOf(n.canvas), idOf(n.mask), n.type, n.visible ? 1 : 0, n.opacity, n.blendMode, n.clip ? 1 : 0, n.rev, n.kind || '', n.params ? JSON.stringify(n.params) : '', n.maskEnabled ? 1 : 0, n.effects ? JSON.stringify(n.effects) : '', n.tw ? n.tw.m.toString() + n.tw.o : '', n.children ? '[' + this.sigOf(n.children) + ']' : ''].join(',')).join(';');
    }
    composeChildren(ctx, children, r) {
      const lvl0 = this._level || 0;
      /* Editing an adjustment layer: everything below it stays the same while its sliders move, so that
       * part is kept from the previous redraw and only the adjustment and the layers above are redone. */
      let start = 0, snapAt = -1, sig = '';
      const act = this.active;
      if (children === this.root.children && act && act.isAdjust && !act.clip && !this.stroke && r.x === 0 && r.y === 0 && r.w === this.width && r.h === this.height) {
        const ai = children.indexOf(act);
        if (ai > 0) {
          sig = this.sigOf(children.slice(0, ai)) + '|' + (ND.App ? ND.App.state.fg + ND.App.state.bg : '');
          const c = this._below;
          if (c && c.sig === sig && c.node === act && c.canvas.width === r.w && c.canvas.height === r.h) { ctx.save(); ctx.globalCompositeOperation = 'copy'; ctx.drawImage(c.canvas, 0, 0); ctx.restore(); start = ai; }
          else snapAt = ai;
        }
      }
      for (let i = start; i < children.length; i++) {
        if (i === snapAt) {
          const c = this._below && this._below.canvas.width === r.w && this._below.canvas.height === r.h ? this._below.canvas : U.canvas(r.w, r.h), cx2 = U.ctx(c);
          cx2.clearRect(0, 0, r.w, r.h); cx2.drawImage(ctx.canvas, 0, 0, r.w, r.h, 0, 0, r.w, r.h);
          this._below = { sig, node: act, canvas: c };
        }
        const n = children[i];
        if (n.clip && i > 0) continue;
        let j = i + 1;
        const clips = [];
        while (j < children.length && children[j].clip) { clips.push(children[j]); j++; }
        if (!n.visible) continue;
        if (n.isAdjust && !ND.Adjust.isFill(n.kind)) {
          // filter / Develop layers are slow: keep their result while nothing below them changes
          const key = !ND.GPU.pointwise(n.kind) ? this.cacheKeyBelow(children, i, n, r) : null;
          if (key && n._ac && n._ac.key === key) { ctx.save(); ctx.globalCompositeOperation = 'copy'; ctx.drawImage(n._ac.canvas, 0, 0, r.w, r.h, 0, 0, r.w, r.h); ctx.restore(); }
          else {
            this.applyAdjust(ctx, n, r);
            if (key) { const c = n._ac && n._ac.canvas.width === r.w && n._ac.canvas.height === r.h ? n._ac.canvas : U.canvas(r.w, r.h), cx3 = U.ctx(c); cx3.clearRect(0, 0, r.w, r.h); cx3.drawImage(ctx.canvas, 0, 0, r.w, r.h, 0, 0, r.w, r.h); n._ac = { key, canvas: c }; }
          }
          this._level = lvl0;
          continue;
        }
        const fx = n.effects && ND.Effects && ND.Effects.any(n.effects) ? n.effects : null;
        // Pass Through group: its layers blend straight onto what's below (a group with a layer style or
        // clipped layers on top needs one flat picture of its own, so it is drawn isolated instead)
        if (n.isGroup && n.blendMode === 'passthrough' && !fx && !clips.some((c) => c.visible)) {
          this.composePassThrough(ctx, n, r);
          this._level = lvl0;
          continue;
        }
        if (fx && ND.Doc.fxCache && !this.beingEdited([n].concat(clips))) {
          /* A layer with a layer style that you're not working on right now: its finished look (style and
           * clipped layers included) is kept, so changing other layers doesn't redo the style every time. */
          const W = this.width, H = this.height, key = this.sigOf([n].concat(clips)) + '|' + (ND.App ? ND.App.state.fg + ND.App.state.bg : '');
          let c = n._fxc;
          if (!c || c.key !== key || c.canvas.width !== W || c.canvas.height !== H) {
            const full = { x: 0, y: 0, w: W, h: H }, styled = this.styledNode(n, clips, full);
            const cc = c && c.canvas.width === W && c.canvas.height === H ? c.canvas : U.canvas(W, H), cx4 = U.ctx(cc);
            cx4.clearRect(0, 0, W, H); cx4.drawImage(styled, 0, 0, W, H, 0, 0, W, H);
            n._fxc = c = { key, canvas: cc };
            this._level = lvl0;
          }
          this.blendCanvasInto(ctx, c.canvas, n.blendMode, n.opacity, r, false);
          this._level = lvl0;
          continue;
        }
        if (fx) n._fxc = null;
        const base = this.styledNode(n, clips, r);
        this.blendCanvasInto(ctx, base, n.blendMode, n.opacity, r, true);
        this._level = lvl0;
      }
      this._level = lvl0;
    }
    /* Pass Through: the group's layers are composited directly onto the backdrop (`ctx`), so blend modes and
     * adjustment layers inside it see — and change — what is under the group. The group's opacity and mask then
     * fade between the backdrop without the group (B) and with it (R): result = B·(1 − k) + R·k, k = opacity × mask. */
    composePassThrough(ctx, n, r) {
      const lvl = this._level, m = this.maskRect(n, r), full = n.opacity >= 1 && !m;
      let B = null;
      if (!full) { B = this.tmp(this._level++, r.w, r.h); U.ctx(B).drawImage(ctx.canvas, 0, 0, r.w, r.h, 0, 0, r.w, r.h); }
      this._ptDepth = (this._ptDepth || 0) + 1;
      try { this.composeChildren(ctx, n.children, r); } finally { this._ptDepth--; }
      if (!full) {
        const R = this.tmp(this._level++, r.w, r.h), rx = U.ctx(R);
        rx.drawImage(ctx.canvas, 0, 0, r.w, r.h, 0, 0, r.w, r.h);
        if (m) { rx.save(); rx.globalCompositeOperation = 'destination-in'; rx.drawImage(m, 0, 0, r.w, r.h, 0, 0, r.w, r.h); rx.restore(); }
        ctx.save();
        ctx.globalCompositeOperation = 'copy'; ctx.drawImage(B, 0, 0, r.w, r.h, 0, 0, r.w, r.h);
        // B·(1 − k): take away k of the backdrop…
        ctx.globalAlpha = n.opacity; ctx.globalCompositeOperation = 'destination-out';
        if (m) ctx.drawImage(m, 0, 0, r.w, r.h, 0, 0, r.w, r.h); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, r.w, r.h); }
        // …and add R·k
        ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(R, 0, 0, r.w, r.h, 0, 0, r.w, r.h);
        ctx.restore();
      }
      this._level = lvl;
    }
    // is the user working on one of these layers right now (active, inside the active group, or containing it)?
    beingEdited(nodes) {
      const a = this.active;
      if (!a) return false;
      return nodes.some((n) => n === a || this.isInside(a, n) || this.isInside(n, a));
    }
    // fingerprint of everything below child i (for caching a slow filter layer's result); null = don't cache
    cacheKeyBelow(children, i, n, r) {
      // inside a Pass Through group the backdrop also holds layers outside the group: don't cache there
      if (this._ptDepth) return null;
      const below = children.slice(0, i);
      if (this.beingEdited(below)) return null;
      return [r.x, r.y, r.w, r.h, this.sigOf(below), this.sigOf([n]), ND.App ? ND.App.state.fg + ND.App.state.bg : ''].join('|');
    }
    // A layer with its style and clipped layers, ready to blend (rect-sized canvas from the pool).
    styledNode(n, clips, r) {
      const base = this.composeNode(n, r), bx = U.ctx(base);
      const fx = n.effects && ND.Effects && ND.Effects.any(n.effects) ? n.effects : null;
      const anyClip = clips.some((c) => c.visible);
      /* Styles only reach a little way around the layer's pixels, so they are worked out in the box around its
       * content (plus that reach) instead of the whole area: much less work for text and logos. */
      let sub = null, sb = null, sx = null;
      if (fx) {
        const bb = alphaBounds(base, r.w, r.h);
        if (!bb) return base; // nothing on the layer: no style either
        const m = Math.ceil(ND.Effects.extent(fx)) + 4;
        sub = U.clipRect({ x: bb.x - m, y: bb.y - m, w: bb.w + 2 * m, h: bb.h + 2 * m }, r.w, r.h);
        sb = U.canvas(sub.w, sub.h); sx = U.ctx(sb);
      }
      const sr = sub && { x: r.x + sub.x, y: r.y + sub.y, w: sub.w, h: sub.h };
      const grab = () => { sx.save(); sx.globalCompositeOperation = 'copy'; sx.drawImage(base, sub.x, sub.y, sub.w, sub.h, 0, 0, sub.w, sub.h); sx.restore(); };
      const putBack = () => { bx.save(); bx.globalCompositeOperation = 'copy'; bx.beginPath(); bx.rect(sub.x, sub.y, sub.w, sub.h); bx.clip(); bx.drawImage(sb, sub.x, sub.y); bx.restore(); };
      if (fx) grab();
      // layer styles on the graphics card when possible (falls back to the CPU version)
      const g = fx && ND.GPUFX && ND.Doc.gpuFx !== false ? ND.GPUFX.effects(sb, sub.w, sub.h, fx, !anyClip) : null;
      const atop = (ctx, src) => { if (!src) return; ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.drawImage(src, 0, 0); ctx.restore(); };
      if (fx) {
        if (g) atop(sx, g.inner); else ND.Effects.inner(this, sx, sb, sr, fx);
        putBack();
      }
      if (anyClip) {
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
      if (fx) {
        if (anyClip) grab();
        if (g) {
          atop(sx, g.inside);
          if (g.outer) { sx.save(); sx.globalCompositeOperation = 'destination-over'; sx.drawImage(g.outer, 0, 0); sx.restore(); }
        } else ND.Effects.outer(this, sx, sb, sr, fx);
        putBack();
      }
      return base;
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
      // painting on only some colour channels: put the others back (text, shapes and smart objects redraw whole)
      if (S.kind === 'pixels' && ND.Channels && ND.Channels.limited(this) && !['Text', 'Shape', 'Smart'].includes(label)) ND.Channels.restore(S.canvas, beforeImg, rect, this.chanEdit);
      const c = S.canvas, afterImg = U.ctx(c).getImageData(rect.x, rect.y, rect.w, rect.h);
      const touch = () => {
        // painting pixels on a text or vector shape layer turns it into an ordinary paint layer
        if (S.kind === 'pixels') { S.node.rev++; if (label !== 'Text') S.node.textData = null; if (label !== 'Shape') S.node.shapeData = null; if (label !== 'Smart') S.node.smart = null; }
        else { markMask(c, rect); if (S.node) S.node.rev++; this.quickRev = (this.quickRev || 0) + 1; }
      };
      const textBefore = S.kind === 'pixels' ? (prevText !== undefined ? prevText : S.node.textData) : null;
      const shapeBefore = S.kind === 'pixels' ? S.node.shapeData : null, smartBefore = S.kind === 'pixels' ? S.node.smart : null;
      touch();
      const textAfter = S.kind === 'pixels' ? S.node.textData : null, shapeAfter = S.kind === 'pixels' ? S.node.shapeData : null, smartAfter = S.kind === 'pixels' ? S.node.smart : null;
      this.history.push({
        label, bytes: rect.w * rect.h * 8,
        undo: () => { U.ctx(c).putImageData(beforeImg, rect.x, rect.y); touch(); if (S.kind === 'pixels') { S.node.textData = textBefore; S.node.shapeData = shapeBefore; S.node.smart = smartBefore; } },
        redo: () => { U.ctx(c).putImageData(afterImg, rect.x, rect.y); touch(); if (S.kind === 'pixels') { S.node.textData = textAfter; S.node.shapeData = shapeAfter; S.node.smart = smartAfter; } },
      });
    }
    recordRegion(layer, beforeImg, rect, label) { this.recordSurface({ canvas: layer.canvas, node: layer, kind: 'pixels' }, beforeImg, rect, label); }
    /* Draw something on the current surface through the selection, honouring alpha lock.
     * draw(ctx) paints in document coordinates. opts: {rect, mode: 'normal'|'erase'|blendId, opacity} */
    paintOnActive(label, draw, opts) {
      opts = opts || {};
      if (ND.Anim && this.anim) ND.Anim.autoKey(this);
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
        ND.GPU.blendAny(lx, rect.x, rect.y, scratch, rect.x, rect.y, rect.w, rect.h, mode, opacity);
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
      const mk = (src, l) => { const c = U.canvas(w, h), x = U.ctx(c); x.imageSmoothingQuality = 'high'; drawFn(x, src, l); return c; };
      // animation keyframes are transformed too
      const framesAfter = layers.map((l) => { if (!l.frames) return null; const o = {}; for (const k in l.frames) o[k] = mk(l.frames[k], l); return o; });
      const before = { c: layers.map((l) => l.canvas), m: masked.map((n) => n.mask), g: this.guides.slice(), f: layers.map((l) => (l.frames ? Object.assign({}, l.frames) : null)), s: layers.map((l) => (l.smart ? ND.SmartObj.state(l.smart) : null)) };
      // smart objects: the operation becomes part of their placement and they are redrawn from the original
      const smartAfter = layers.map((l) => {
        if (!l.smart) return null;
        const T = ND.SmartObj.captureAffine(drawFn, l, W, H);
        return T ? ND.SmartObj.transformed(ND.SmartObj.state(l.smart), T) : null;
      });
      const after = {
        f: framesAfter,
        s: smartAfter,
        c: layers.map((l, i) => {
          if (smartAfter[i]) { const tmp = { canvas: U.canvas(w, h), smart: Object.assign({}, l.smart, smartAfter[i]), rev: 0 }; ND.SmartObj.render(tmp); return tmp.canvas; }
          if (l.frames) for (const k in l.frames) if (l.frames[k] === l.canvas) return framesAfter[i][k];
          return mk(l.canvas, l);
        }),
        m: masked.map((n) => { const c = U.canvas(w, h), x = U.ctx(c); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.imageSmoothingQuality = 'high'; drawFn(x, n.mask, null); return c; }),
        g: [],
      };
      const selBefore = this.selectionMask;
      const apply = (ww, hh, s) => {
        this.width = ww; this.height = hh;
        layers.forEach((l, i) => { l.canvas = s.c[i]; l.rev++; if (s.f[i]) { l.frames = Object.assign({}, s.f[i]); l._blank = null; } if (s.s && s.s[i] && l.smart) ND.SmartObj.setState(l.smart, s.s[i]); });
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
  Doc.fxCache = true; // keep finished layer-style results while their layer isn't being worked on
  Doc.gpuFx = true;   // layer styles and blurs on the graphics card (Options ▸ Graphics card)
})();
