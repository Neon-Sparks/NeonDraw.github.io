/* Neon Sparks Draw — frame-by-frame animation.
 * An animated layer has `frames`: { frameNumber: canvas } (keyframes). A keyframe is shown until the next
 * one (like Krita). Switching frames just points `layer.canvas` at the held keyframe, so every tool, filter
 * and undo step works on the frame you see. Layers without frames show on every frame (backgrounds).
 * Also: onion skins, rendering whole frames, and a small GIF encoder (median-cut palette + LZW). */
'use strict';
(function () {
  const U = ND.U;
  const A = {};
  const DEF = { frame: 0, fps: 12, length: 24, loop: true, onion: true, onionBefore: 1, onionAfter: 1, onionOpacity: 0.3, autoKey: 'blank' };
  A.state = (doc) => { if (!doc.anim) doc.anim = Object.assign({}, DEF); else for (const k in DEF) if (doc.anim[k] === undefined) doc.anim[k] = DEF[k]; return doc.anim; };
  A.normalise = (s) => (s && typeof s === 'object' ? Object.assign({}, DEF, s) : null);
  A.isAnimated = (doc) => doc.allLayers().some((l) => l.frames);
  A.keys = (L) => (L.frames ? Object.keys(L.frames).map(Number).sort((a, b) => a - b) : []);
  A.keyAt = function (L, f) { let k = null; for (const n of A.keys(L)) { if (n <= f) k = n; else break; } return k; };
  A.isKey = (L, f) => !!(L.frames && L.frames[f]);
  const blank = (L, doc) => { if (!L._blank || L._blank.width !== doc.width || L._blank.height !== doc.height) L._blank = U.canvas(doc.width, doc.height); else U.ctx(L._blank).clearRect(0, 0, doc.width, doc.height); return L._blank; };

  // point every animated layer at the drawing held on the current frame
  /* ---------- tweening (motion keys) ----------
   * layer.tween = { cx, cy, ease: 'linear' | 'ease', keys: { frame: { x, y, s, r, o } } }
   * x / y = move (px), s = scale (1 = 100%), r = rotation (degrees), o = opacity (0–1).
   * Between keys the values are interpolated; before the first / after the last they hold. */
  const NOMOVE = { x: 0, y: 0, s: 1, r: 0, o: 1 };
  A.tweenKeys = (L) => (L.tween ? Object.keys(L.tween.keys).map(Number).sort((a, b) => a - b) : []);
  A.tweenAt = function (L, f) {
    const ks = A.tweenKeys(L);
    if (!ks.length) return null;
    const K = L.tween.keys;
    if (f <= ks[0]) return Object.assign({}, NOMOVE, K[ks[0]]);
    if (f >= ks[ks.length - 1]) return Object.assign({}, NOMOVE, K[ks[ks.length - 1]]);
    let i = 0;
    while (ks[i + 1] <= f) i++;
    const a = Object.assign({}, NOMOVE, K[ks[i]]), b = Object.assign({}, NOMOVE, K[ks[i + 1]]);
    let t = (f - ks[i]) / (ks[i + 1] - ks[i]);
    if (L.tween.ease === 'ease') t = t * t * (3 - 2 * t);
    const out = {};
    for (const k in NOMOVE) out[k] = a[k] + (b[k] - a[k]) * t;
    return out;
  };
  // display transform for a tween value (around the layer's centre)
  A.tweenMatrix = (L, v) => new DOMMatrix().translate(L.tween.cx + v.x, L.tween.cy + v.y).rotate(v.r).scale(v.s).translate(-L.tween.cx, -L.tween.cy);
  A.setTweenKey = function (doc, L, f, v) {
    const before = L.tween ? JSON.parse(JSON.stringify(L.tween)) : null;
    if (!L.tween) { const bb = ND.Sel.contentBBox(L.canvas) || { x: 0, y: 0, w: doc.width, h: doc.height }; L.tween = { cx: bb.x + bb.w / 2, cy: bb.y + bb.h / 2, ease: 'ease', keys: {} }; }
    L.tween.keys[f] = Object.assign({}, NOMOVE, A.tweenAt(L, f) || {}, v);
    const after = JSON.parse(JSON.stringify(L.tween));
    push(doc, 'Motion Key', () => { L.tween = before ? JSON.parse(JSON.stringify(before)) : null; }, () => { L.tween = JSON.parse(JSON.stringify(after)); });
    A.apply(doc, true);
    doc.emit('layers');
  };
  A.deleteTweenKey = function (doc, L, f) {
    if (!L.tween || !L.tween.keys[f]) return false;
    const before = JSON.parse(JSON.stringify(L.tween));
    delete L.tween.keys[f];
    if (!Object.keys(L.tween.keys).length) L.tween = null;
    const after = L.tween ? JSON.parse(JSON.stringify(L.tween)) : null;
    push(doc, 'Delete Motion Key', () => { L.tween = JSON.parse(JSON.stringify(before)); }, () => { L.tween = after ? JSON.parse(JSON.stringify(after)) : null; });
    A.apply(doc, true);
    doc.emit('layers');
    return true;
  };

  A.apply = function (doc, force) {
    const f = A.state(doc).frame;
    let changed = !!force;
    doc.allLayers().forEach((L) => {
      // motion: L.tw = { m, o } is drawn by the compositor on top of the layer's own pixels
      const v = L.tween ? A.tweenAt(L, f) : null;
      const tw = v && (v.x || v.y || v.s !== 1 || v.r || v.o !== 1) ? { m: A.tweenMatrix(L, v), o: Math.max(0, Math.min(1, v.o)) } : null;
      if (JSON.stringify(tw && [tw.m.toString(), tw.o]) !== JSON.stringify(L.tw && [L.tw.m.toString(), L.tw.o])) { L.tw = tw; L.rev++; changed = true; }
      if (!L.frames) return;
      const k = A.keyAt(L, f), c = k === null ? (L.canvas === L._blank ? L._blank : blank(L, doc)) : L.frames[k];
      if (L.canvas !== c) { L.canvas = c; L.rev++; changed = true; }
    });
    if (changed) doc.invalidateAll();
    return changed;
  };
  A.goto = function (doc, f) {
    const s = A.state(doc);
    f = Math.round(f);
    if (f < 0) f = s.loop ? s.length - 1 : 0;
    if (f >= s.length) f = s.loop ? 0 : s.length - 1;
    s.frame = f;
    A.apply(doc);
    if (ND.App) ND.App.emit('frame', f);
  };

  function push(doc, label, undo, redo) { doc.history.push({ label, undo: () => { undo(); A.apply(doc); doc.invalidateAll(); doc.emit('layers'); }, redo: () => { redo(); A.apply(doc); doc.invalidateAll(); doc.emit('layers'); } }); }
  // turn a normal layer into an animated one: its current picture becomes the keyframe at this frame
  A.animate = function (doc, L) {
    if (!L || !L.isPixel || L.frames) return false;
    const f = A.state(doc).frame, c = L.canvas;
    L.frames = { [f]: c };
    push(doc, 'Animate Layer', () => { L.frames = null; L.canvas = c; L.rev++; }, () => { L.frames = { [f]: c }; });
    doc.emit('layers');
    return true;
  };
  // new keyframe on the current frame: 'blank' or 'copy' (a copy of the drawing held there)
  A.addKey = function (doc, L, mode, f) {
    if (!L || !L.isPixel) return false;
    const s = A.state(doc);
    f = f === undefined ? s.frame : f;
    const wasAnimated = !!L.frames, original = L.canvas;
    if (!wasAnimated) {
      // a still layer: its picture becomes the drawing on frame 0
      L.frames = { 0: original };
      if (f === 0) { push(doc, 'Animate Layer', () => { L.frames = null; L.canvas = original; L.rev++; }, () => { L.frames = { 0: original }; }); doc.emit('layers'); return true; }
    } else if (L.frames[f]) return false;
    const held = A.keyAt(L, f), c = U.canvas(doc.width, doc.height);
    if (mode === 'copy' && held !== null) U.ctx(c).drawImage(L.frames[held], 0, 0);
    L.frames[f] = c;
    const snapshot = Object.assign({}, L.frames);
    push(doc, mode === 'copy' ? 'Duplicate Frame' : 'New Frame',
      () => { if (wasAnimated) delete L.frames[f]; else { L.frames = null; L.canvas = original; L.rev++; } },
      () => { L.frames = Object.assign({}, snapshot); });
    A.apply(doc);
    doc.emit('layers');
    return true;
  };
  A.deleteKey = function (doc, L, f) {
    if (!L || !L.frames) return false;
    f = f === undefined ? A.state(doc).frame : f;
    const c = L.frames[f];
    if (!c) return false;
    delete L.frames[f];
    push(doc, 'Delete Frame', () => { L.frames[f] = c; }, () => { delete L.frames[f]; });
    A.apply(doc);
    doc.emit('layers');
    return true;
  };
  A.moveKey = function (doc, L, from, to) {
    if (!L || !L.frames || !L.frames[from] || from === to || to < 0) return false;
    const c = L.frames[from], over = L.frames[to];
    const doIt = () => { delete L.frames[from]; L.frames[to] = c; }, undo = () => { L.frames[from] = c; if (over) L.frames[to] = over; else delete L.frames[to]; };
    doIt();
    push(doc, 'Move Frame', undo, doIt);
    A.apply(doc);
    doc.emit('layers');
    return true;
  };
  // Before painting: on an animated layer, painting on a frame without its own drawing makes one.
  A.autoKey = function (doc) {
    const L = doc.active;
    if (!L || !L.isPixel || !L.frames || doc.editMask || doc.quickMask) return;
    const s = A.state(doc);
    if (L.frames[s.frame]) return;
    const held = A.keyAt(L, s.frame);
    if (held !== null && s.autoKey === 'off') return; // paint on the held drawing
    A.addKey(doc, L, held !== null && s.autoKey === 'copy' ? 'copy' : 'blank');
  };

  /* ---------- rendering ---------- */
  // the whole picture at frame f (restores the current frame afterwards)
  A.renderFrame = function (doc, f) {
    const s = A.state(doc), cur = s.frame;
    s.frame = f; A.apply(doc);
    const out = U.clone(doc.getProjection());
    s.frame = cur; A.apply(doc);
    return out;
  };
  // onion skins for the active layer: earlier drawings tinted red, later ones green
  const tintCache = new WeakMap();
  // onion skins: the active layer (global setting), plus any layer whose own onion setting is "always"
  // layer.onion = { mode: 'auto' | 'on' | 'off', before, after, opacity, colBefore, colAfter }
  A.onion = function (doc) {
    const s = A.state(doc), out = [];
    doc.allLayers().forEach((L) => {
      if (!L.frames || !L.visible) return;
      const o = L.onion || {}, mode = o.mode || 'auto';
      if (mode === 'off' || (mode === 'auto' && (!s.onion || L !== doc.active))) return;
      out.push(...onionFor(doc, L, o.before != null ? o.before : s.onionBefore, o.after != null ? o.after : s.onionAfter, o.opacity != null ? o.opacity : s.onionOpacity, o.colBefore || '#ff3b5c', o.colAfter || '#2fd67b'));
    });
    return out;
  };
  function onionFor(doc, L, nb, na, op, cb, ca) {
    const s = A.state(doc), keys = A.keys(L), cur = A.keyAt(L, s.frame), i = cur === null ? -1 : keys.indexOf(cur), out = [];
    const ver = doc.history.stack.length + ':' + doc.history.pos;
    const tint = (c, col) => {
      let e = tintCache.get(c);
      if (!e || e.ver !== ver || e.col !== col) {
        const t = U.canvas(c.width, c.height), x = U.ctx(t);
        x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, t.width, t.height);
        e = { ver, col, t }; tintCache.set(c, e);
      }
      return e.t;
    };
    for (let k = 1; k <= nb; k++) { const j = (cur === null ? keys.filter((n) => n < s.frame).length : i) - k; if (j >= 0) out.push({ canvas: tint(L.frames[keys[j]], cb), alpha: op / k }); }
    for (let k = 1; k <= na; k++) { const j = (cur === null ? keys.filter((n) => n <= s.frame).length - 1 : i) + k; if (j < keys.length && j >= 0) out.push({ canvas: tint(L.frames[keys[j]], ca), alpha: op / k }); }
    return out;
  }

  /* ---------- GIF encoder ---------- */
  function medianCut(samples, max) {
    // samples: Uint32Array of 0xRRGGBB
    let boxes = [samples];
    const range = (b) => {
      let r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0;
      for (const v of b) { const r = v >> 16, g = (v >> 8) & 255, bb = v & 255; if (r < r0) r0 = r; if (r > r1) r1 = r; if (g < g0) g0 = g; if (g > g1) g1 = g; if (bb < b0) b0 = bb; if (bb > b1) b1 = bb; }
      return [r1 - r0, g1 - g0, b1 - b0];
    };
    while (boxes.length < max) {
      let bi = -1, best = 0, ch = 0;
      boxes.forEach((b, i) => { if (b.length < 2) return; const r = range(b), m = Math.max(r[0], r[1], r[2]) * Math.log2(b.length + 1); if (m > best) { best = m; bi = i; ch = r.indexOf(Math.max(r[0], r[1], r[2])); } });
      if (bi < 0) break;
      const shift = ch === 0 ? 16 : ch === 1 ? 8 : 0, b = boxes[bi].slice().sort((x, y) => ((x >> shift) & 255) - ((y >> shift) & 255));
      const mid = b.length >> 1;
      boxes.splice(bi, 1, b.subarray(0, mid), b.subarray(mid));
    }
    return boxes.filter((b) => b.length).map((b) => { let r = 0, g = 0, bb = 0; for (const v of b) { r += v >> 16; g += (v >> 8) & 255; bb += v & 255; } return [Math.round(r / b.length), Math.round(g / b.length), Math.round(bb / b.length)]; });
  }
  function lzw(ix, minCode, out) {
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, next = eoi + 1, dict = new Map(), cur = 0, bits = 0;
    const block = [];
    const emit = (code) => { cur |= code << bits; bits += size; while (bits >= 8) { block.push(cur & 255); cur >>>= 8; bits -= 8; } };
    emit(clear);
    let prefix = ix[0];
    for (let i = 1; i < ix.length; i++) {
      const k = ix[i], key = (prefix << 8) | k, hit = dict.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix);
      if (next === 4096) { emit(clear); dict = new Map(); size = minCode + 1; next = eoi + 1; }
      else { if (next >= 1 << size) size++; dict.set(key, next++); }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (bits > 0) block.push(cur & 255);
    out.push(minCode);
    for (let i = 0; i < block.length; i += 255) { const n = Math.min(255, block.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(block[i + j]); }
    out.push(0);
  }
  // frames: canvases of equal size; delay in 1/100 s. Returns a Blob (image/gif).
  A.encodeGIF = function (frames, delayCs, loop) {
    const W = frames[0].width, H = frames[0].height, datas = frames.map((c) => U.ctx(c).getImageData(0, 0, W, H).data);
    let transparent = false;
    const total = W * H * frames.length, stride = Math.max(1, Math.floor(total / 120000)), samp = [];
    datas.forEach((d) => { for (let i = 0; i < W * H; i += stride) { if (d[i * 4 + 3] < 128) { transparent = true; continue; } samp.push((d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2]); } });
    if (!samp.length) samp.push(0);
    const pal = medianCut(Uint32Array.from(samp), transparent ? 255 : 256);
    while (pal.length < 256) pal.push([0, 0, 0]);
    const TI = transparent ? 255 : -1;
    const lut = new Int16Array(32768).fill(-1);
    const nearest = (r, g, b) => {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let v = lut[key];
      if (v >= 0) return v;
      let best = 1e9;
      for (let i = 0; i < (transparent ? 255 : 256); i++) { const p = pal[i], d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (d < best) { best = d; v = i; } }
      lut[key] = v;
      return v;
    };
    const out = [];
    const str = (s) => { for (const ch of s) out.push(ch.charCodeAt(0)); };
    const u16 = (n) => out.push(n & 255, (n >> 8) & 255);
    str('GIF89a'); u16(W); u16(H); out.push(0xf7, 0, 0);
    pal.forEach((p) => out.push(p[0], p[1], p[2]));
    if (loop !== false) { out.push(0x21, 0xff, 11); str('NETSCAPE2.0'); out.push(3, 1); u16(0); out.push(0); }
    datas.forEach((d) => {
      out.push(0x21, 0xf9, 4, (transparent ? (2 << 2) | 1 : 1 << 2), delayCs & 255, (delayCs >> 8) & 255, transparent ? TI : 0, 0);
      out.push(0x2c); u16(0); u16(0); u16(W); u16(H); out.push(0);
      const ix = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) ix[i] = d[i * 4 + 3] < 128 && transparent ? TI : nearest(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
      lzw(ix, 8, out);
    });
    out.push(0x3b);
    return new Blob([Uint8Array.from(out)], { type: 'image/gif' });
  };

  ND.Anim = A;
})();
