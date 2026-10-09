/* Neon Draw — the canvas view: rendering, pointer input and tool behaviour. */
'use strict';
(function () {
  const U = ND.U, App = ND.App;
  const V = {};
  let wrap, cv, cx;
  let checker = null;

  V.init = function (container) {
    wrap = container;
    cv = U.h('canvas.nd-canvas');
    wrap.appendChild(cv);
    cx = cv.getContext('2d');
    const ck = U.canvas(16, 16), kx = U.ctx(ck);
    kx.fillStyle = '#3a3d42'; kx.fillRect(0, 0, 16, 16);
    kx.fillStyle = '#2e3136'; kx.fillRect(0, 0, 8, 8); kx.fillRect(8, 8, 8, 8);
    checker = cx.createPattern(ck, 'repeat');
    V.cursor = { x: 0, y: 0, inside: false, sx: 0, sy: 0 };
    bindInput();
    ['doc', 'view', 'tool', 'brush', 'colour', 'state', 'docchange'].forEach((e) => App.on(e, () => V.request()));
    App.on('zoomat', (o) => zoomAt(o.f, o.sx == null ? cv.clientWidth / 2 : o.sx, o.sy == null ? cv.clientHeight / 2 : o.sy));
    App.on('beforetool', (id) => V.finishPending(id));
    // a different document: drop any half-finished interaction that belongs to the old one
    App.on('docchange', () => {
      if (V.stroke) V.stroke = null;
      V.xf = null; V.crop = null; V.curve = null; V.poly = null; V.drag = null; V.ants = null;
      if (V.text) { V.text = null; App.emit('textend'); }
      App.emit('transform');
    });
    App.on('doc', (t) => { if (t === 'selection' || t === 'history' || t === 'resize') V.ants = null; });
    requestAnimationFrame(loop);
  };
  V.request = function () { V.needs = true; };

  /* ---------------- coordinates ---------------- */
  function toDoc(sx, sy) {
    const d = App.doc, v = App.state.view;
    let x = sx - cv.clientWidth / 2 - v.panX, y = sy - cv.clientHeight / 2 - v.panY;
    const c = Math.cos(-v.rot), s = Math.sin(-v.rot);
    let rx = (x * c - y * s) / v.zoom;
    const ry = (x * s + y * c) / v.zoom;
    if (v.mirror) rx = -rx;
    return { x: rx + d.width / 2, y: ry + d.height / 2 };
  }
  function toScreen(x, y) {
    const d = App.doc, v = App.state.view;
    const px = (x - d.width / 2) * v.zoom * (v.mirror ? -1 : 1), py = (y - d.height / 2) * v.zoom;
    return { x: cv.clientWidth / 2 + v.panX + px * Math.cos(v.rot) - py * Math.sin(v.rot), y: cv.clientHeight / 2 + v.panY + px * Math.sin(v.rot) + py * Math.cos(v.rot) };
  }
  V.toDoc = toDoc;
  V.toScreen = toScreen;
  function zoomAt(f, sx, sy) {
    const d = App.doc, v = App.state.view;
    if (!d) return;
    const p = toDoc(sx, sy), z = U.clamp(v.zoom * f, 0.02, 64);
    const px = (p.x - d.width / 2) * z * (v.mirror ? -1 : 1), py = (p.y - d.height / 2) * z;
    App.setView({ zoom: z, panX: sx - cv.clientWidth / 2 - (px * Math.cos(v.rot) - py * Math.sin(v.rot)), panY: sy - cv.clientHeight / 2 - (px * Math.sin(v.rot) + py * Math.cos(v.rot)) });
  }
  V.zoomAt = zoomAt;

  /* ---------------- render loop ---------------- */
  let lastAnts = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const d = App.doc;
    if (!d) return;
    if (V.stroke) { V.stroke.tick(now); }
    ND.Tools2.tick();
    const antsDue = d.selectionMask && now - lastAnts > 320;
    if (antsDue) { lastAnts = now; V.antPhase = (V.antPhase + 1) % 2 || 0; V.needs = true; }
    if (!V.needs && !d.dirty && !d.displayDirty) return;
    V.needs = false;
    render();
    App.emit('frame');
  }
  function render() {
    const d = App.doc, v = App.state.view, st = App.state;
    const dpr = window.devicePixelRatio || 1, W = wrap.clientWidth, H = wrap.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
    }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = '#16171b';
    cx.fillRect(0, 0, W, H);
    cx.save();
    cx.translate(W / 2 + v.panX, H / 2 + v.panY);
    cx.rotate(v.rot);
    cx.scale(v.zoom * (v.mirror ? -1 : 1), v.zoom);
    cx.translate(-d.width / 2, -d.height / 2);
    // drop shadow + transparency checker
    cx.save();
    cx.shadowColor = 'rgba(0,0,0,0.55)'; cx.shadowBlur = 24 / 1; cx.shadowOffsetY = 4 / v.zoom;
    cx.fillStyle = '#2e3136'; cx.fillRect(0, 0, d.width, d.height);
    cx.restore();
    cx.save();
    cx.scale(1 / v.zoom, 1 / v.zoom);
    cx.fillStyle = checker;
    cx.fillRect(0, 0, d.width * v.zoom, d.height * v.zoom);
    cx.restore();
    const proj = displayCanvas(d);
    cx.imageSmoothingEnabled = v.zoom < 2;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(proj, 0, 0);
    if (d.wrapAround) {
      cx.globalAlpha = 0.85;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (i || j) cx.drawImage(proj, i * d.width, j * d.height);
      cx.globalAlpha = 1;
    }
    const lw = 1 / v.zoom;
    // pixel grid at high zoom
    if (st.pixelGrid && v.zoom >= 10) {
      const a = toDoc(0, 0), b = toDoc(W, H), c2 = toDoc(W, 0), e = toDoc(0, H);
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c2.x, e.x))), x1 = Math.min(d.width, Math.ceil(Math.max(a.x, b.x, c2.x, e.x)));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, c2.y, e.y))), y1 = Math.min(d.height, Math.ceil(Math.max(a.y, b.y, c2.y, e.y)));
      cx.strokeStyle = 'rgba(128,128,128,0.35)'; cx.lineWidth = lw; cx.beginPath();
      for (let x = x0; x <= x1; x++) { cx.moveTo(x, y0); cx.lineTo(x, y1); }
      for (let y = y0; y <= y1; y++) { cx.moveTo(x0, y); cx.lineTo(x1, y); }
      cx.stroke();
    }
    if (st.grid) {
      cx.strokeStyle = 'rgba(120,160,255,0.28)'; cx.lineWidth = lw; cx.beginPath();
      for (let x = 0; x <= d.width; x += st.gridSize) { cx.moveTo(x, 0); cx.lineTo(x, d.height); }
      for (let y = 0; y <= d.height; y += st.gridSize) { cx.moveTo(0, y); cx.lineTo(d.width, y); }
      cx.stroke();
    }
    drawSymmetryGuides(lw);
    drawSelection(lw);
    ND.Tools2.overlay(cx, lw, 1 / v.zoom);
    drawToolOverlay(lw);
    cx.restore();
    drawScreenOverlay();
    ND.Tools2.screen(cx, W, H);
  }
  // A GPU-friendly copy of the projection: only changed areas are uploaded each frame,
  // instead of re-uploading the whole (CPU-side) image.
  let display = null, displayDoc = null;
  function displayCanvas(d) {
    const proj = d.getProjection();
    if (!display || displayDoc !== d || display.width !== d.width || display.height !== d.height) {
      display = document.createElement('canvas');
      display.width = d.width; display.height = d.height;
      displayDoc = d;
      d.displayDirty = { x: 0, y: 0, w: d.width, h: d.height };
    }
    const r = U.clipRect(d.displayDirty, d.width, d.height);
    d.displayDirty = null;
    if (r) {
      const x = display.getContext('2d');
      x.clearRect(r.x, r.y, r.w, r.h);
      x.drawImage(proj, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    }
    return display;
  }
  V.displayCanvas = displayCanvas;

  function drawSymmetryGuides(lw) {
    const d = App.doc, st = App.state, s = st.brush;
    if (!st.showSymmetry || !App.isBrushTool(st.tool) || !s.symmetry || s.symmetry === 'none') return;
    cx.save();
    cx.strokeStyle = 'rgba(255,120,200,0.55)'; cx.lineWidth = lw; cx.setLineDash([6 * lw, 6 * lw]);
    const W = d.width, H = d.height;
    cx.beginPath();
    if (s.symmetry === 'v' || s.symmetry === 'both') { cx.moveTo(W / 2, 0); cx.lineTo(W / 2, H); }
    if (s.symmetry === 'h' || s.symmetry === 'both') { cx.moveTo(0, H / 2); cx.lineTo(W, H / 2); }
    if (s.symmetry === 'radial' || s.symmetry === 'kaleido') {
      const n = Math.max(2, s.symCount | 0), r = Math.hypot(W, H) / 2;
      for (let k = 0; k < n; k++) { const a = (k / n) * U.TAU - Math.PI / 2; cx.moveTo(W / 2, H / 2); cx.lineTo(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r); }
    }
    cx.stroke();
    cx.restore();
  }
  function drawSelection(lw) {
    const d = App.doc;
    if (!d.selectionMask) { V.ants = null; return; }
    if (!V.ants || V.antsRev !== d.selectionRev) {
      V.antsRev = d.selectionRev;
      V.ants = ND.Sel.buildAnts(d.selectionMask) || [];
      const tint = U.canvas(d.width, d.height), tx = U.ctx(tint);
      tx.fillStyle = 'rgba(70,140,255,0.16)'; tx.fillRect(0, 0, d.width, d.height);
      tx.globalCompositeOperation = 'destination-out'; tx.drawImage(d.selectionMask, 0, 0);
      V.selTint = tint;
    }
    cx.save();
    cx.imageSmoothingEnabled = false;
    if (V.selTint) cx.drawImage(V.selTint, 0, 0);
    if (V.ants && V.ants.length) cx.drawImage(V.ants[V.antPhase || 0], 0, 0);
    cx.restore();
    void lw;
  }
  function handle(x, y, r, fill) {
    cx.beginPath(); cx.arc(x, y, r, 0, U.TAU);
    cx.fillStyle = fill || '#fff'; cx.fill();
    cx.strokeStyle = '#1a1a1a'; cx.lineWidth = r * 0.3; cx.stroke();
  }
  function drawToolOverlay(lw) {
    const st = App.state, d = App.doc, v = st.view, zr = 1 / v.zoom;
    const dr = V.drag;
    cx.lineWidth = lw;
    if (dr && (App.SELECT_TOOLS.includes(dr.tool) || dr.tool === 'crop-new')) {
      cx.save(); cx.setLineDash([5 * lw, 5 * lw]); cx.strokeStyle = '#fff';
      if (dr.tool === 'sel-lasso') { cx.beginPath(); dr.pts.forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.closePath(); cx.stroke(); cx.strokeStyle = '#000'; cx.lineDashOffset = 5 * lw; cx.stroke(); }
      else if (dr.tool !== 'sel-wand') { const sp = ND.Render.shapePath(dr.tool === 'crop-new' ? 'rect' : dr.tool, dr.a, dr.b, dr.mods); cx.stroke(sp.path); cx.strokeStyle = '#000'; cx.lineDashOffset = 5 * lw; cx.stroke(sp.path); }
      cx.restore();
    }
    if (V.poly) {
      const pts = V.poly.pts.concat([{ x: V.cursor.x, y: V.cursor.y }]);
      cx.save(); cx.strokeStyle = '#fff'; cx.setLineDash([5 * lw, 5 * lw]); cx.beginPath();
      pts.forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.stroke();
      cx.setLineDash([]); V.poly.pts.forEach((p, i) => handle(p.x, p.y, (i === 0 ? 6 : 4) * zr, i === 0 ? '#ffd166' : '#fff'));
      cx.restore();
    }
    if (dr && (dr.tool === 'rect' || dr.tool === 'ellipse' || dr.tool === 'polygon')) {
      const sp = ND.Render.shapePath(dr.tool, dr.a, dr.b, Object.assign({ radius: st.shapeRadius, sides: st.polySides, star: st.polyStar, inner: st.polyInner }, dr.mods));
      cx.save(); cx.globalAlpha = 0.75;
      if (st.shapeFill) { cx.fillStyle = st.fg; cx.fill(sp.path); }
      if (st.shapeStroke || !st.shapeFill) { cx.strokeStyle = st.shapeFill ? st.bg : st.fg; cx.lineWidth = st.shapeWidth; cx.lineJoin = 'round'; cx.stroke(sp.path); }
      cx.restore();
    }
    if (dr && dr.tool === 'gradient') {
      cx.save(); cx.strokeStyle = '#fff'; cx.lineWidth = 1.5 * lw; cx.setLineDash([6 * lw, 4 * lw]);
      cx.beginPath(); cx.moveTo(dr.a.x, dr.a.y); cx.lineTo(dr.b.x, dr.b.y); cx.stroke();
      if (st.gradType === 'radial' || st.gradType === 'diamond') { cx.beginPath(); cx.arc(dr.a.x, dr.a.y, Math.hypot(dr.b.x - dr.a.x, dr.b.y - dr.a.y), 0, U.TAU); cx.stroke(); }
      cx.setLineDash([]); handle(dr.a.x, dr.a.y, 5 * zr, st.fg); handle(dr.b.x, dr.b.y, 5 * zr, st.gradTo === 'bg' ? st.bg : '#fff');
      cx.restore();
    }
    if (dr && dr.tool === 'line' && !V.curve) {
      cx.save(); cx.strokeStyle = st.fg; cx.globalAlpha = 0.8; cx.lineCap = 'round'; cx.lineWidth = Math.max(lw, st.brush.size);
      cx.beginPath(); cx.moveTo(dr.a.x, dr.a.y); cx.lineTo(dr.b.x, dr.b.y); cx.stroke(); cx.restore();
    }
    if (V.curve) {
      const c = V.curve, pts = ND.Render.catmull([c.p0, ...c.anchors, c.p1], 24);
      cx.save(); cx.strokeStyle = st.fg; cx.globalAlpha = 0.85; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.lineWidth = Math.max(lw, st.brush.size);
      cx.beginPath(); pts.forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.stroke();
      cx.globalAlpha = 1; cx.lineWidth = lw; cx.strokeStyle = 'rgba(255,255,255,0.5)'; cx.setLineDash([4 * lw, 4 * lw]);
      cx.beginPath(); [c.p0, ...c.anchors, c.p1].forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.stroke(); cx.setLineDash([]);
      [c.p0, ...c.anchors, c.p1].forEach((p, i, a) => handle(p.x, p.y, (i === 0 || i === a.length - 1 ? 5 : 7) * zr, i === 0 || i === a.length - 1 ? '#fff' : '#ffd166'));
      cx.restore();
    }
    if (V.xf) drawTransform(lw, zr);
    if (V.crop) {
      const r = V.crop;
      cx.save();
      cx.fillStyle = 'rgba(0,0,0,0.55)';
      cx.beginPath(); cx.rect(-1e5, -1e5, 2e5, 2e5); cx.rect(r.x, r.y, r.w, r.h); cx.fill('evenodd');
      cx.strokeStyle = '#fff'; cx.lineWidth = lw; cx.strokeRect(r.x, r.y, r.w, r.h);
      cx.strokeStyle = 'rgba(255,255,255,0.35)'; cx.beginPath();
      for (let i = 1; i < 3; i++) { cx.moveTo(r.x + (r.w * i) / 3, r.y); cx.lineTo(r.x + (r.w * i) / 3, r.y + r.h); cx.moveTo(r.x, r.y + (r.h * i) / 3); cx.lineTo(r.x + r.w, r.y + (r.h * i) / 3); }
      cx.stroke();
      cropHandles(r).forEach((h) => { cx.fillStyle = '#fff'; cx.fillRect(h.x - 5 * zr, h.y - 5 * zr, 10 * zr, 10 * zr); });
      cx.restore();
    }
    if (V.text) {
      const t = V.text, bb = ND.Render.drawText(cx, t, t.x, t.y, t.colour || st.fg);
      cx.save(); cx.strokeStyle = '#4da3ff'; cx.lineWidth = lw; cx.setLineDash([4 * lw, 4 * lw]);
      cx.strokeRect(t.x - 4 * zr, t.y - 4 * zr, bb.tw + 8 * zr, bb.th + 8 * zr); cx.restore();
    }
    if (d.cloneSource && (st.tool === 'clone' || (App.isBrushTool(st.tool) && st.brush.engine === 'clone'))) {
      const a = V.stroke && V.stroke.cloneDelta ? { x: V.cursor.x - V.stroke.cloneDelta.x, y: V.cursor.y - V.stroke.cloneDelta.y } : d.cloneSource, r = 8 * zr;
      cx.save(); cx.strokeStyle = '#ff6d6d'; cx.lineWidth = 1.5 * lw;
      cx.beginPath(); cx.arc(a.x, a.y, r, 0, U.TAU); cx.moveTo(a.x - r * 1.6, a.y); cx.lineTo(a.x + r * 1.6, a.y); cx.moveTo(a.x, a.y - r * 1.6); cx.lineTo(a.x, a.y + r * 1.6); cx.stroke(); cx.restore();
    }
    // stamp ghost
    if (st.tool === 'stamp' && V.cursor.inside && !V.panning) {
      const sd = V.drag && V.drag.tool === 'stamp' ? V.drag : null;
      const p = sd ? sd.a : V.cursor, size = sd ? sd.size : st.stampSize, rot = sd ? sd.rot : (st.stampRot * Math.PI) / 180;
      const img = ND.Stamps.render(st.stamp, Math.min(512, Math.max(16, size * v.zoom)), st.stampMode, st.fg);
      if (img) {
        cx.save(); cx.globalAlpha = sd ? 0.85 : 0.45; cx.translate(p.x, p.y); cx.rotate(rot);
        cx.drawImage(img, -size / 2, -size / 2, size, size); cx.restore();
      }
    }
  }
  function drawScreenOverlay() {
    const st = App.state, c = V.cursor;
    if (!c.inside || V.panning || !App.doc) return;
    if (App.isBrushTool(st.tool) || (st.tool === 'line' && st.lineUseBrush)) {
      const s = st.brush, z = st.view.zoom;
      const r = Math.max(0.5, (s.size * z) / 2);
      cx.save();
      cx.translate(c.sx, c.sy);
      cx.rotate(st.view.rot);
      cx.strokeStyle = 'rgba(0,0,0,0.55)'; cx.lineWidth = 3;
      cx.beginPath();
      if (s.engine === 'pixelart') cx.rect(-r, -r, r * 2, r * 2); else cx.ellipse(0, 0, r, r * (s.tip === 'round' ? Math.max(0.05, s.roundness) : 1), (s.angle * Math.PI) / 180, 0, U.TAU);
      cx.stroke();
      cx.strokeStyle = st.eraserMode ? 'rgba(255,160,160,0.95)' : 'rgba(255,255,255,0.95)'; cx.lineWidth = 1; cx.stroke();
      if (r < 6) { cx.beginPath(); cx.moveTo(-8, 0); cx.lineTo(-3, 0); cx.moveTo(3, 0); cx.lineTo(8, 0); cx.moveTo(0, -8); cx.lineTo(0, -3); cx.moveTo(0, 3); cx.lineTo(0, 8); cx.stroke(); }
      cx.restore();
    }
  }

  /* ---------------- transform (free / warp / distort) ---------------- */
  function xfCorners(t) {
    const c = Math.cos(t.rot), s = Math.sin(t.rot), mx = t.cx + t.offX, my = t.cy + t.offY;
    return [[t.bx, t.by], [t.bx + t.bw, t.by], [t.bx + t.bw, t.by + t.bh], [t.bx, t.by + t.bh]].map(([x, y]) => {
      const lx = (x - t.cx) * t.sx, ly = (y - t.cy) * t.sy;
      return { x: mx + lx * c - ly * s, y: my + lx * s + ly * c };
    });
  }
  function xfMids(cs) { return [0, 1, 2, 3].map((i) => ({ x: (cs[i].x + cs[(i + 1) % 4].x) / 2, y: (cs[i].y + cs[(i + 1) % 4].y) / 2 })); }
  function drawTransform(lw, zr) {
    const t = V.xf;
    cx.save();
    cx.strokeStyle = '#4da3ff'; cx.lineWidth = 1.5 * lw;
    if (t.mode === 'free') {
      const cs = xfCorners(t);
      cx.beginPath(); cs.forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.closePath(); cx.stroke();
      cs.forEach((p) => { cx.fillStyle = '#fff'; cx.fillRect(p.x - 5 * zr, p.y - 5 * zr, 10 * zr, 10 * zr); cx.strokeRect(p.x - 5 * zr, p.y - 5 * zr, 10 * zr, 10 * zr); });
      xfMids(cs).forEach((p) => handle(p.x, p.y, 4 * zr, '#cfe3ff'));
      const rh = rotHandle(cs, zr);
      cx.beginPath(); cx.moveTo(rh.m.x, rh.m.y); cx.lineTo(rh.p.x, rh.p.y); cx.stroke();
      handle(rh.p.x, rh.p.y, 6 * zr, '#fff');
      handle(t.cx + t.offX, t.cy + t.offY, 3 * zr, '#4da3ff');
    } else {
      const g = t.mode === 'warp' ? 3 : 2, m = t.mesh;
      cx.beginPath();
      for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
        const p = m[j * g + i];
        if (i < g - 1) { const q = m[j * g + i + 1]; cx.moveTo(p.x, p.y); cx.lineTo(q.x, q.y); }
        if (j < g - 1) { const q = m[(j + 1) * g + i]; cx.moveTo(p.x, p.y); cx.lineTo(q.x, q.y); }
      }
      cx.stroke();
      m.forEach((p) => handle(p.x, p.y, 7 * zr, '#ffd166'));
    }
    cx.restore();
  }
  function rotHandle(cs, zr) {
    const m = { x: (cs[0].x + cs[1].x) / 2, y: (cs[0].y + cs[1].y) / 2 };
    const nx = cs[1].y - cs[0].y, ny = -(cs[1].x - cs[0].x), l = Math.max(1e-6, Math.hypot(nx, ny));
    return { m, p: { x: m.x + (nx / l) * 30 * zr, y: m.y + (ny / l) * 30 * zr } };
  }
  V.startTransform = function () {
    const d = App.doc;
    if (V.xf) return true;
    if (!d.active || !d.active.isPixel) { App.toast('Select a paint layer to transform'); return false; }
    if (d.effectiveLocked(d.active)) { App.toast('Layer is locked'); return false; }
    const L = d.active, before = U.clone(L.canvas);
    let base, holed = null, bb;
    if (d.selectionMask && (bb = ND.Sel.bbox(d.selectionMask, 1))) {
      base = U.clone(L.canvas);
      const bx = U.ctx(base); bx.globalCompositeOperation = 'destination-in'; bx.drawImage(d.selectionMask, 0, 0);
      holed = U.clone(L.canvas);
      const hx = U.ctx(holed); hx.globalCompositeOperation = 'destination-out'; hx.drawImage(d.selectionMask, 0, 0);
    } else {
      base = U.clone(L.canvas);
      bb = ND.Sel.contentBBox(base) || { x: 0, y: 0, w: d.width, h: d.height };
      holed = U.canvas(d.width, d.height);
    }
    V.xf = { L, base, before, holed, bx: bb.x, by: bb.y, bw: bb.w, bh: bb.h, cx: bb.x + bb.w / 2, cy: bb.y + bb.h / 2, offX: 0, offY: 0, sx: 1, sy: 1, rot: 0, mode: 'free', fromSelection: !!d.selectionMask };
    App.emit('transform');
    V.request();
    return true;
  };
  function xfApplyPreview() {
    const t = V.xf, d = App.doc, x = U.ctx(t.L.canvas);
    x.save();
    x.clearRect(0, 0, d.width, d.height);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(t.holed, 0, 0);
    if (t.mode === 'free') {
      x.translate(t.cx + t.offX, t.cy + t.offY); x.rotate(t.rot); x.scale(t.sx, t.sy); x.translate(-t.cx, -t.cy);
      x.drawImage(t.base, 0, 0);
    } else {
      const g = t.mode === 'warp' ? 3 : 2;
      ND.Render.meshDraw(x, t.base, { x: t.bx, y: t.by, w: t.bw, h: t.bh }, t.mesh, g, g, t.mode === 'warp' ? 5 : 10);
    }
    x.restore();
    d.invalidateAll();
    V.request();
  }
  V.setTransformMode = function (mode) {
    const t = V.xf;
    if (!t || t.mode === mode) return;
    if (mode !== 'free') {
      const cs = xfCorners(t), g = mode === 'warp' ? 3 : 2, mesh = [];
      for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
        const u = i / (g - 1), v = j / (g - 1);
        const top = { x: cs[0].x + (cs[1].x - cs[0].x) * u, y: cs[0].y + (cs[1].y - cs[0].y) * u };
        const bot = { x: cs[3].x + (cs[2].x - cs[3].x) * u, y: cs[3].y + (cs[2].y - cs[3].y) * u };
        mesh.push({ x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v });
      }
      t.mesh = mesh;
    }
    t.mode = mode;
    xfApplyPreview();
    App.emit('transform');
  };
  V.transformOp = function (op) {
    const t = V.xf;
    if (!t) return;
    if (op === 'flipH') t.sx = -t.sx;
    else if (op === 'flipV') t.sy = -t.sy;
    else if (op === 'rot90') t.rot += Math.PI / 2;
    else if (op === 'rot-90') t.rot -= Math.PI / 2;
    else if (op === 'reset') { Object.assign(t, { offX: 0, offY: 0, sx: 1, sy: 1, rot: 0, mode: 'free', mesh: null }); }
    else if (op === 'fit') { const d = App.doc, s = Math.min(d.width / t.bw, d.height / t.bh); t.sx = Math.sign(t.sx) * s; t.sy = Math.sign(t.sy) * s; t.offX = d.width / 2 - t.cx; t.offY = d.height / 2 - t.cy; t.rot = 0; }
    if (t.mode !== 'free' && op !== 'reset') return;
    xfApplyPreview();
    App.emit('transform');
  };
  V.applyTransform = function () {
    const t = V.xf, d = App.doc;
    if (!t) return;
    V.xf = null;
    const beforeImg = U.ctx(t.before).getImageData(0, 0, d.width, d.height);
    d.recordRegion(t.L, beforeImg, { x: 0, y: 0, w: d.width, h: d.height }, 'Transform');
    if (t.fromSelection && t.mode === 'free') {
      // move the selection with its pixels
      const m = U.canvas(d.width, d.height), mx = U.ctx(m);
      mx.translate(t.cx + t.offX, t.cy + t.offY); mx.rotate(t.rot); mx.scale(t.sx, t.sy); mx.translate(-t.cx, -t.cy);
      mx.drawImage(d.selectionMask, 0, 0);
      d.setSelection(m);
    } else if (t.fromSelection) d.clearSelection();
    d.emit('history');
    App.emit('transform');
    App.toast('Transform applied');
    V.request();
  };
  V.cancelTransform = function () {
    const t = V.xf, d = App.doc;
    if (!t) return;
    V.xf = null;
    const x = U.ctx(t.L.canvas);
    x.clearRect(0, 0, d.width, d.height); x.drawImage(t.before, 0, 0);
    d.invalidateAll();
    App.emit('transform');
    V.request();
  };
  function xfHit(sx, sy) {
    const t = V.xf, z = App.state.view.zoom, near = (p, r) => { const q = toScreen(p.x, p.y); return Math.hypot(q.x - sx, q.y - sy) < r; };
    if (t.mode !== 'free') { for (let i = 0; i < t.mesh.length; i++) if (near(t.mesh[i], 14)) return { kind: 'mesh', i }; return null; }
    const cs = xfCorners(t);
    for (let i = 0; i < 4; i++) if (near(cs[i], 11)) return { kind: 'scale', i };
    const ms = xfMids(cs);
    for (let i = 0; i < 4; i++) if (near(ms[i], 10)) return { kind: 'edge', i };
    if (near(rotHandle(cs, 1 / z).p, 12)) return { kind: 'rotate' };
    const p = toDoc(sx, sy), mx = t.cx + t.offX, my = t.cy + t.offY, c = Math.cos(-t.rot), s = Math.sin(-t.rot);
    const lx = (p.x - mx) * c - (p.y - my) * s, ly = (p.x - mx) * s + (p.y - my) * c;
    if (Math.abs(lx) <= (t.bw / 2) * Math.abs(t.sx) + 2 && Math.abs(ly) <= (t.bh / 2) * Math.abs(t.sy) + 2) return { kind: 'move' };
    return { kind: 'rotate' };
  }
  function xfDrag(h, p, start, e) {
    const t = V.xf, o = h.orig;
    if (h.kind === 'mesh') { t.mesh[h.i] = { x: p.x, y: p.y }; return xfApplyPreview(); }
    if (h.kind === 'move') { t.offX = o.offX + p.x - start.x; t.offY = o.offY + p.y - start.y; }
    else if (h.kind === 'rotate') {
      const mx = t.cx + t.offX, my = t.cy + t.offY;
      let a = o.rot + Math.atan2(p.y - my, p.x - mx) - Math.atan2(start.y - my, start.x - mx);
      if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      t.rot = a;
    } else {
      const mx = t.cx + t.offX, my = t.cy + t.offY, c = Math.cos(-t.rot), s = Math.sin(-t.rot);
      const lx = (p.x - mx) * c - (p.y - my) * s, ly = (p.x - mx) * s + (p.y - my) * c;
      const hw = t.bw / 2 || 1, hh = t.bh / 2 || 1;
      if (h.kind === 'scale') {
        const sgnx = h.i === 0 || h.i === 3 ? -1 : 1, sgny = h.i < 2 ? -1 : 1;
        let nsx = (lx / hw) * sgnx * Math.sign(o.sx || 1), nsy = (ly / hh) * sgny * Math.sign(o.sy || 1);
        if (!e.shiftKey) { const m = Math.max(Math.abs(nsx), Math.abs(nsy)); nsx = m * Math.sign(nsx || 1); nsy = m * Math.sign(nsy || 1); }
        t.sx = Math.abs(nsx) < 0.01 ? 0.01 : nsx * Math.sign(o.sx || 1);
        t.sy = Math.abs(nsy) < 0.01 ? 0.01 : nsy * Math.sign(o.sy || 1);
        t.sx = Math.sign(o.sx) * Math.abs(t.sx); t.sy = Math.sign(o.sy) * Math.abs(t.sy);
      } else {
        if (h.i === 0 || h.i === 2) { const v = (ly / hh) * (h.i === 0 ? -1 : 1); t.sy = Math.sign(o.sy) * Math.max(0.01, Math.abs(v)); }
        else { const v = (lx / hw) * (h.i === 3 ? -1 : 1); t.sx = Math.sign(o.sx) * Math.max(0.01, Math.abs(v)); }
      }
    }
    xfApplyPreview();
    App.emit('transform');
  }

  /* ---------------- crop ---------------- */
  function cropHandles(r) {
    return [{ x: r.x, y: r.y, k: 'nw' }, { x: r.x + r.w, y: r.y, k: 'ne' }, { x: r.x + r.w, y: r.y + r.h, k: 'se' }, { x: r.x, y: r.y + r.h, k: 'sw' },
      { x: r.x + r.w / 2, y: r.y, k: 'n' }, { x: r.x + r.w, y: r.y + r.h / 2, k: 'e' }, { x: r.x + r.w / 2, y: r.y + r.h, k: 's' }, { x: r.x, y: r.y + r.h / 2, k: 'w' }];
  }
  function cropRatio() {
    const r = App.state.cropRatio, d = App.doc;
    if (r === 'free') return 0;
    if (r === 'doc') return d.width / d.height;
    const [a, b] = r.split(':').map(Number);
    return a / b;
  }
  V.applyCrop = function () {
    if (!V.crop) return;
    const r = V.crop;
    V.crop = null;
    App.cropTo({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }, 'Crop');
    App.emit('crop');
    App.toast('Cropped');
  };
  V.cancelCrop = function () { V.crop = null; App.emit('crop'); V.request(); };

  /* ---------------- curve (line tool) ---------------- */
  V.commitCurve = function () {
    const c = V.curve, d = App.doc, st = App.state;
    if (!c) return;
    V.curve = null;
    const pts = ND.Render.catmull([c.p0, ...c.anchors, c.p1], 32);
    if (!d.canPaint()) { App.blocked(); return; }
    if (st.lineUseBrush) {
      const s = Object.assign({}, st.brush, { stabilizer: 0 });
      const stroke = new ND.Brush.Stroke(d, s, { colour: st.fg, eraser: st.eraserMode });
      // resample evenly so pressure-based tapers look right
      const dense = [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
        for (let k = 0; k < n; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
      }
      dense.push(pts[pts.length - 1]);
      dense.forEach((p, i) => {
        const q = { x: p.x, y: p.y, p: 1, t: i * 4 };
        if (i === 0) stroke.begin(q); else stroke.move(q);
      });
      stroke.end('Line');
    } else {
      d.paintOnActive('Line', (x) => {
        x.strokeStyle = st.fg; x.lineWidth = st.brush.size; x.lineCap = 'round'; x.lineJoin = 'round';
        x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.stroke();
      }, { opacity: st.brush.opacity, mode: st.eraserMode ? 'erase' : st.brush.blend });
    }
    App.pushRecent(st.fg);
    V.request();
  };

  /* ---------------- text ---------------- */
  const TEXT_KEYS = ['text', 'font', 'size', 'bold', 'italic', 'align', 'lineHeight', 'spacing', 'warp', 'amount', 'outline', 'outlineColour', 'shadow', 'x', 'y'];
  V.commitText = function () {
    const t = V.text, d = App.doc, st = App.state;
    V.text = null;
    App.emit('textend');
    if (t && t.editing) t.editing.visible = t.wasVisible;
    if (!t || !String(t.text).trim()) {
      if (t && t.editing) d.invalidateAll();
      V.request();
      return;
    }
    const colour = t.colour || st.fg;
    const data = {};
    TEXT_KEYS.forEach((k) => { data[k] = t[k]; });
    data.colour = colour;
    if (t.editing) {
      // re-render an editable text layer in place
      const L = t.editing, before = U.ctx(L.canvas).getImageData(0, 0, d.width, d.height), x = U.ctx(L.canvas);
      x.clearRect(0, 0, d.width, d.height);
      ND.Render.drawText(x, t, t.x, t.y, colour);
      L.name = String(t.text).split('\n')[0].slice(0, 24) || L.name;
      d.invalidateAll();
      const prev = L.textData;
      L.textData = data;
      d.recordSurface({ canvas: L.canvas, node: L, kind: 'pixels' }, before, { x: 0, y: 0, w: d.width, h: d.height }, 'Text', prev);
      d.emit('layers');
      App.toast('Text updated');
      return;
    }
    if (st.text.newLayer) { d.addLayer(String(t.text).split('\n')[0].slice(0, 24) || 'Text'); d.active.textData = data; }
    else if (!d.canPaint()) { App.blocked(); return; }
    d.paintOnActive('Text', (x) => ND.Render.drawText(x, t, t.x, t.y, colour));
    App.pushRecent(st.fg);
    App.toast(st.text.newLayer ? 'Text placed — click it again with the Text tool to edit' : 'Text placed');
  };
  V.cancelText = function () {
    const t = V.text;
    V.text = null;
    if (t && t.editing) { t.editing.visible = t.wasVisible; App.doc.invalidateAll(); }
    App.emit('textend');
    V.request();
  };
  // Start editing an existing text layer (returns true when one was hit).
  V.editTextAt = function (p) {
    const d = App.doc;
    const hit = (L) => {
      if (!L || !L.isPixel || !L.textData || !L.visible) return false;
      const t = L.textData, bb = ND.Render.drawText(cx, t, t.x, t.y, '#000', true);
      return p.x >= t.x - 8 && p.y >= t.y - 8 && p.x <= t.x + bb.tw + 8 && p.y <= t.y + bb.th + 8;
    };
    let L = hit(d.active) ? d.active : null;
    if (!L) L = d.allLayers().reverse().find(hit) || null;
    if (!L || d.effectiveLocked(L)) return false;
    d.setActive(L);
    V.text = Object.assign({}, L.textData, { editing: L, wasVisible: L.visible });
    const keep = Object.assign({}, L.textData);
    delete keep.text; delete keep.x; delete keep.y; delete keep.colour;
    Object.assign(App.state.text, keep);
    L.visible = false;
    d.invalidateAll();
    App.emit('textstart', V.text.text);
    V.request();
    return true;
  };

  /* ---------------- polygon lasso ---------------- */
  function closePoly() {
    const P = V.poly;
    V.poly = null;
    if (!P || P.pts.length < 3) { V.request(); return; }
    const path = new Path2D();
    P.pts.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    path.closePath();
    finishSelection(path, P.mode);
  }
  V.closePoly = closePoly;

  // Commit pending multi-step tool work when switching tools.
  V.finishPending = function (nextTool) {
    if (V.curve && nextTool !== 'line') V.commitCurve();
    if (V.text && nextTool !== 'text') V.commitText();
    if (V.xf && nextTool !== 'transform') V.applyTransform();
    if (V.crop && nextTool !== 'crop') V.cancelCrop();
    if (V.poly && nextTool !== 'sel-poly') closePoly();
    if (V.liq && nextTool !== 'liquify') ND.Tools2.applyLiquify();
    if (nextTool === 'transform') setTimeout(() => { if (App.state.tool === 'transform') V.startTransform(); }, 0);
  };
  V.hasPending = () => !!(V.curve || V.text || V.xf || V.crop || V.poly || V.liq);
  V.cancelPending = function () {
    if (V.curve) { V.curve = null; V.request(); return true; }
    if (V.text) { V.cancelText(); return true; }
    if (V.xf) { V.cancelTransform(); return true; }
    if (V.crop) { V.cancelCrop(); return true; }
    if (V.poly) { V.poly = null; V.request(); return true; }
    if (V.liq) { ND.Tools2.cancelLiquify(); return true; }
    return false;
  };
  V.commitPending = function () {
    if (V.curve) { V.commitCurve(); return true; }
    if (V.xf) { V.applyTransform(); return true; }
    if (V.crop) { V.applyCrop(); return true; }
    if (V.poly) { closePoly(); return true; }
    if (V.liq) { ND.Tools2.applyLiquify(); return true; }
    return false;
  };

  /* ---------------- selection finishing ---------------- */
  function finishSelection(pathOrMask, mode) {
    const d = App.doc, st = App.state;
    let m = pathOrMask instanceof Path2D ? ND.Sel.maskFromPath(d, pathOrMask, st.selAntialias) : pathOrMask;
    if (st.selFeather > 0) {
      const tmp = { width: d.width, height: d.height, selectionMask: m };
      m = ND.Sel.feather(tmp, st.selFeather);
    }
    d.changeSelection('Select', ND.Sel.combine(d, m, mode));
    V.request();
  }
  function selModeFrom(e) {
    if (e.shiftKey && e.altKey) return 'intersect';
    if (e.shiftKey) return 'add';
    if (e.altKey) return 'subtract';
    return App.state.selMode;
  }

  /* ---------------- tool actions ---------------- */
  function pickColour(p, toBg) {
    const d = App.doc, st = App.state;
    const src = d.sampleCanvas(st.pickMerged);
    const r = st.pickAverage > 1 ? (st.pickAverage - 1) / 2 : 0;
    const c = ND.Brush.sampleColour(src, U.clamp(p.x, 0, d.width - 1), U.clamp(p.y, 0, d.height - 1), r);
    if (!c || c.a <= 0) return;
    const hex = U.rgbToHex(c.r, c.g, c.b);
    App.setColour(hex, toBg ? 'bg' : 'fg');
  }
  V.pickColour = pickColour;
  function doFill(p) {
    const d = App.doc, st = App.state;
    if (!d.canPaint()) return App.blocked();
    const x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= d.width || y >= d.height) return;
    const src = st.fillMerged ? d.getProjection() : d.surface().canvas;
    const a = st.fillGap > 0 && st.fillContiguous
      ? ND.Sel.gapRegion(src, d.width, d.height, x, y, { tolerance: st.fillTolerance, gap: st.fillGap, contiguous: true })
      : ND.Sel.colourRegion(src, d.width, d.height, x, y, { tolerance: st.fillTolerance, contiguous: st.fillContiguous });
    let mask = ND.Sel.maskFromAlpha(a, d.width, d.height);
    if (st.fillExpand > 0) mask = ND.Sel.grow({ width: d.width, height: d.height, selectionMask: mask }, st.fillExpand);
    d.paintOnActive('Fill', (cx2) => {
      if (st.fillWith === 'pattern') {
        const t = ND.Patterns.tileColoured(st.fillPattern, st.fg), pat = cx2.createPattern(t, 'repeat');
        if (pat.setTransform && st.fillPatternScale !== 1) pat.setTransform(new DOMMatrix().scale(st.fillPatternScale));
        cx2.fillStyle = pat;
      } else cx2.fillStyle = st.fillWith === 'bg' ? st.bg : st.fg;
      cx2.fillRect(0, 0, d.width, d.height);
      cx2.globalCompositeOperation = 'destination-in';
      cx2.drawImage(mask, 0, 0);
    });
    App.pushRecent(st.fg);
  }
  function doGradient(a, b) {
    const d = App.doc, st = App.state;
    if (!d.canPaint()) return App.blocked();
    if (Math.hypot(b.x - a.x, b.y - a.y) < 2) return;
    d.paintOnActive('Gradient', (x) => ND.Render.renderGradient(x, d.width, d.height, a, b, { fg: st.fg, bg: st.bg, to: st.gradTo, type: st.gradType, repeat: st.gradRepeat, dither: st.gradDither, reverse: st.gradReverse, opacity: 1 }), { opacity: st.gradOpacity });
    App.pushRecent(st.fg);
  }
  function doShape(dr) {
    const d = App.doc, st = App.state;
    if (!d.canPaint()) return App.blocked();
    if (Math.hypot(dr.b.x - dr.a.x, dr.b.y - dr.a.y) < 2) return;
    const sp = ND.Render.shapePath(dr.tool, dr.a, dr.b, Object.assign({ radius: st.shapeRadius, sides: st.polySides, star: st.polyStar, inner: st.polyInner }, dr.mods));
    d.paintOnActive('Shape', (x) => {
      if (st.shapeFill) { x.fillStyle = st.fg; x.fill(sp.path); }
      if (st.shapeStroke || !st.shapeFill) { x.strokeStyle = st.shapeFill ? st.bg : st.fg; x.lineWidth = st.shapeWidth; x.lineJoin = 'round'; x.stroke(sp.path); }
    }, { opacity: st.brush.opacity });
    App.pushRecent(st.fg);
  }
  function placeStamp(p, size, rot) {
    const d = App.doc, st = App.state;
    if (!d.canPaint()) return App.blocked();
    const img = ND.Stamps.render(st.stamp, size, st.stampMode, st.fg);
    if (!img) return;
    d.paintOnActive('Stamp', (x) => {
      x.translate(p.x, p.y); x.rotate(rot);
      x.drawImage(img, -size / 2, -size / 2, size, size);
    }, { opacity: st.stampOpacity, rect: { x: p.x - size, y: p.y - size, w: size * 2, h: size * 2 } });
  }
  function stampRot() { const st = App.state; return (st.stampRot * Math.PI) / 180 + (Math.random() - 0.5) * st.stampRandom * Math.PI * 2; }

  /* ---------------- pointer input ---------------- */
  const pointers = new Map();
  let spaceDown = false, penSeen = false;
  V.isSpaceDown = () => spaceDown;
  function local(e) { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; }
  function pressureOf(e) {
    if (e.pointerType === 'pen') return e.pressure > 0 ? e.pressure : 0.05;
    return 1;
  }
  function pt(e) { const l = local(e), p = toDoc(l.sx, l.sy); return { x: p.x, y: p.y, p: pressureOf(e), tx: e.tiltX || 0, ty: e.tiltY || 0, t: e.timeStamp }; }

  function bindInput() {
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onCancel);
    cv.addEventListener('pointerleave', () => { V.cursor.inside = false; V.request(); });
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('dblclick', onDbl);
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTyping(e)) { spaceDown = true; cv.style.cursor = 'grab'; if (e.target === document.body) e.preventDefault(); } });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceDown = false; updateCursor(); } });
    window.addEventListener('blur', () => { spaceDown = false; });
    App.on('tool', updateCursor);
  }
  function isTyping(e) { const t = e.target && e.target.tagName; return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || (e.target && e.target.isContentEditable); }
  function updateCursor() {
    const t = App.state.tool;
    cv.style.cursor = spaceDown ? 'grab' : t === 'pan' ? 'grab' : t === 'zoom' ? 'zoom-in' : t === 'move' ? 'move' : t === 'eyedropper' ? 'copy' : t === 'text' ? 'text' : App.isBrushTool(t) ? 'none' : 'crosshair';
  }

  // hand a pointer over to an overlay (e.g. the pop-up palette) opened on pointerdown
  function endPointer(e) { pointers.delete(e.pointerId); try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ } }
  function onDown(e) {
    const d = App.doc;
    if (!d) return;
    if (e.pointerType === 'pen') penSeen = true;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const l = local(e);
    pointers.set(e.pointerId, { x: l.sx, y: l.sy, t: performance.now(), moved: false, type: e.pointerType });
    document.activeElement && document.activeElement.blur && document.activeElement !== document.body && document.activeElement.blur();
    // two-finger gestures
    const touches = Array.from(pointers.values()).filter((p) => p.type === 'touch');
    if (touches.length === 2) {
      if (V.stroke) { V.stroke.cancel(); V.stroke = null; }
      V.drag = null;
      const v = App.state.view;
      V.pinch = { d0: Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y), mid: { x: (touches[0].x + touches[1].x) / 2, y: (touches[0].y + touches[1].y) / 2 }, zoom0: v.zoom, panX0: v.panX, panY0: v.panY, t: performance.now(), moved: false };
      return;
    }
    if (e.pointerType === 'touch' && (App.state.touchMode === 'pan' || (App.state.touchMode === 'auto' && penSeen))) {
      V.panning = { sx: l.sx, sy: l.sy, px: App.state.view.panX, py: App.state.view.panY };
      return;
    }
    const tool = App.state.tool, p = pt(e), st = App.state;
    // pan: middle button, space, or pan tool
    if (e.button === 1 || spaceDown || tool === 'pan') {
      if (spaceDown && e.shiftKey) { V.rotating = { a0: Math.atan2(l.sy - cv.clientHeight / 2, l.sx - cv.clientWidth / 2), rot0: st.view.rot }; return; }
      V.panning = { sx: l.sx, sy: l.sy, px: st.view.panX, py: st.view.panY };
      cv.style.cursor = 'grabbing';
      return;
    }
    if (e.button === 2) { if (st.rightClick === 'pick' || e.altKey || e.ctrlKey) pickColour(p, false); else { endPointer(e); ND.Popup.open(e.clientX, e.clientY); } return; }
    if (e.button !== 0 && e.pointerType !== 'pen') return;
    if (ND.Tools2.down(e, p, l)) return;
    if (tool === 'zoom') { V.drag = { tool: 'zoom', sx: l.sx, sy: l.sy, z0: st.view.zoom, alt: e.altKey, moved: false }; return; }
    if (tool === 'eyedropper' || (App.isBrushTool(tool) && e.ctrlKey && !(tool === 'clone' || st.brush.engine === 'clone')) || (e.altKey && App.isBrushTool(tool) && tool !== 'clone')) {
      pickColour(p, tool === 'eyedropper' && e.altKey);
      V.drag = { tool: 'eyedropper', alt: e.altKey && tool === 'eyedropper' };
      return;
    }
    if ((tool === 'clone' || (App.isBrushTool(tool) && st.brush.engine === 'clone')) && (e.ctrlKey || e.altKey)) {
      d.cloneSource = { x: p.x, y: p.y };
      d.cloneDelta = null;
      App.toast('Clone source set at ' + Math.round(p.x) + ', ' + Math.round(p.y));
      V.request();
      return;
    }
    if (tool === 'transform') {
      if (!V.xf && !V.startTransform()) return;
      const h = xfHit(l.sx, l.sy);
      if (!h) return;
      h.orig = { offX: V.xf.offX, offY: V.xf.offY, sx: V.xf.sx, sy: V.xf.sy, rot: V.xf.rot };
      V.drag = { tool: 'transform', h, start: p };
      return;
    }
    if (tool === 'crop') {
      if (V.crop) {
        const r = V.crop;
        for (const h of cropHandles(r)) { const q = toScreen(h.x, h.y); if (Math.hypot(q.x - l.sx, q.y - l.sy) < 12) { V.drag = { tool: 'crop-edit', k: h.k, r0: Object.assign({}, r), start: p }; return; } }
        if (p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h) { V.drag = { tool: 'crop-edit', k: 'move', r0: Object.assign({}, r), start: p }; return; }
      }
      const a0 = ND.Tools2.snap(p);
      V.drag = { tool: 'crop-new', a: a0, b: a0, mods: {} };
      return;
    }
    if (tool === 'move') {
      const S = d.surface();
      const layers = d.active.isGroup ? d.allLayers().filter((L) => d.isInside(L, d.active) && !d.effectiveLocked(L)) : S && S.kind === 'pixels' ? [d.active] : [];
      if (!layers.length) return App.toast(d.paintBlocker() || 'Nothing to move here');
      const items = layers.map((L) => ({ L, before: U.clone(L.canvas) }));
      if (d.selectionMask && !d.active.isGroup) {
        // move only the selected pixels
        const o = items[0];
        o.base = U.clone(o.L.canvas); const bx = U.ctx(o.base); bx.globalCompositeOperation = 'destination-in'; bx.drawImage(d.selectionMask, 0, 0);
        o.holed = U.clone(o.L.canvas); const hx = U.ctx(o.holed); hx.globalCompositeOperation = 'destination-out'; hx.drawImage(d.selectionMask, 0, 0);
      }
      V.drag = { tool: 'move', start: p, layers: items, dx: 0, dy: 0, withSel: d.selectionMask ? U.clone(d.selectionMask) : null };
      return;
    }
    if (tool === 'fill') { doFill(p); return; }
    if (tool === 'sel-wand') {
      const x = Math.floor(p.x), y = Math.floor(p.y);
      if (x < 0 || y < 0 || x >= d.width || y >= d.height) return;
      const m = ND.Sel.wand(d, x, y, { tolerance: st.wandTolerance, contiguous: st.wandContiguous, merged: st.wandMerged, antialias: st.selAntialias });
      finishSelection(m, selModeFrom(e));
      return;
    }
    if (tool === 'sel-poly') {
      if (!V.poly) V.poly = { pts: [], mode: selModeFrom(e) };
      const P = V.poly;
      if (P.pts.length > 2) { const q = toScreen(P.pts[0].x, P.pts[0].y); if (Math.hypot(q.x - l.sx, q.y - l.sy) < 10) { closePoly(); return; } }
      P.pts.push({ x: p.x, y: p.y });
      V.request();
      return;
    }
    if (tool === 'line' && V.curve) {
      const all = [V.curve.p0, ...V.curve.anchors, V.curve.p1];
      for (let i = 0; i < all.length; i++) { const q = toScreen(all[i].x, all[i].y); if (Math.hypot(q.x - l.sx, q.y - l.sy) < 14) { V.drag = { tool: 'curve-edit', i }; return; } }
      V.commitCurve();
    }
    if (tool === 'text') {
      if (V.text) {
        const bb = ND.Render.drawText(cx, V.text, V.text.x, V.text.y, '#000', true);
        if (p.x >= V.text.x - 10 && p.y >= V.text.y - 10 && p.x <= V.text.x + bb.tw + 10 && p.y <= V.text.y + bb.th + 10) { V.drag = { tool: 'text-move', dx: p.x - V.text.x, dy: p.y - V.text.y }; return; }
        V.commitText();
        return;
      }
      if (V.editTextAt(p)) return;
      if (!st.text.newLayer && !d.canPaint()) return App.blocked();
      V.text = Object.assign({}, st.text, { x: p.x, y: p.y, text: '' });
      App.emit('textstart');
      V.request();
      return;
    }
    if (tool === 'stamp') {
      if (st.stampPaint) {
        const size = st.stampSize * (e.pointerType === 'pen' ? 0.4 + p.p * 0.6 : 1);
        placeStamp(p, size, stampRot());
        V.drag = { tool: 'stamp-paint', last: p };
      } else V.drag = { tool: 'stamp', a: p, size: st.stampSize, rot: stampRot(), moved: false };
      V.request();
      return;
    }
    if (['line', 'rect', 'ellipse', 'polygon', 'gradient', 'sel-rect', 'sel-ellipse', 'sel-lasso'].includes(tool)) {
      if (['line', 'rect', 'ellipse', 'polygon', 'gradient'].includes(tool) && !d.canPaint()) return App.blocked();
      const a0 = tool === 'sel-lasso' ? p : ND.Tools2.snap(p);
      V.drag = { tool, a: a0, b: a0, mods: {}, mode: selModeFrom(e), pts: tool === 'sel-lasso' ? [p] : null };
      return;
    }
    if (App.isBrushTool(tool)) {
      if (!d.canPaint()) return App.blocked();
      if (e.shiftKey) { V.drag = { tool: 'brush-shift', sx: l.sx, size0: st.brush.size, p, moved: false }; return; }
      if ((tool === 'clone' || st.brush.engine === 'clone') && !d.cloneSource) return App.toast('Ctrl+click (or Alt+click) to set the clone source first', 2400);
      startStroke(p);
    }
  }
  function startStroke(p) {
    const d = App.doc, st = App.state;
    V.stroke = new ND.Brush.Stroke(d, st.brush, { colour: st.fg, eraser: st.eraserMode && st.tool === 'brush' });
    V.constraint = ND.Tools2.beginConstraint(p);
    V.stroke.begin(p);
    V.request();
  }
  function onMove(e) {
    const d = App.doc;
    if (!d) return;
    const l = local(e), pp = toDoc(l.sx, l.sy);
    V.cursor = { x: pp.x, y: pp.y, sx: l.sx, sy: l.sy, inside: true };
    App.emit('cursor', V.cursor);
    const ptr = pointers.get(e.pointerId);
    if (ptr) { if (Math.hypot(ptr.x - l.sx, ptr.y - l.sy) > 4) ptr.moved = true; ptr.x = l.sx; ptr.y = l.sy; }
    V.request();
    if (V.pinch) {
      const t = Array.from(pointers.values()).filter((q) => q.type === 'touch');
      if (t.length < 2) return;
      const dist = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y), mid = { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 }, P = V.pinch;
      if (Math.abs(dist - P.d0) > 8 || Math.hypot(mid.x - P.mid.x, mid.y - P.mid.y) > 8) P.moved = true;
      App.setView({ zoom: U.clamp(P.zoom0 * (dist / Math.max(1, P.d0)), 0.02, 64), panX: P.panX0 + mid.x - P.mid.x, panY: P.panY0 + mid.y - P.mid.y });
      return;
    }
    if (V.rotating) {
      const a = Math.atan2(l.sy - cv.clientHeight / 2, l.sx - cv.clientWidth / 2);
      App.setView({ rot: V.rotating.rot0 + a - V.rotating.a0 });
      return;
    }
    if (V.panning) { const P = V.panning; App.setView({ panX: P.px + l.sx - P.sx, panY: P.py + l.sy - P.sy }); return; }
    const dr = V.drag;
    if (V.stroke) {
      const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const ev of evs.length ? evs : [e]) V.stroke.move(ND.Tools2.constrain(V.constraint, pt(ev)));
      return;
    }
    if (!dr) return;
    if (dr.tool.startsWith('x-')) { ND.Tools2.move(e, pt(e), l); return; }
    const p = pt(e), st = App.state;
    switch (dr.tool) {
      case 'zoom': {
        const dx = l.sx - dr.sx;
        if (Math.abs(dx) > 3) dr.moved = true;
        if (dr.moved) { const z = U.clamp(dr.z0 * Math.pow(1.01, dx), 0.02, 64); zoomAt(z / st.view.zoom, dr.sx, dr.sy); }
        break;
      }
      case 'eyedropper': pickColour(p, dr.alt); break;
      case 'brush-shift': {
        if (Math.abs(l.sx - dr.sx) > 3) dr.moved = true;
        if (dr.moved) App.setBrush({ size: U.clamp(dr.size0 + (l.sx - dr.sx) / st.view.zoom, 1, 1000) });
        break;
      }
      case 'transform': xfDrag(dr.h, p, dr.start, e); break;
      case 'crop-new': {
        let b = ND.Tools2.snap(p);
        const ratio = cropRatio();
        if (ratio) { const w = b.x - dr.a.x, h = Math.abs(w) / ratio; b = { x: b.x, y: dr.a.y + Math.sign(b.y - dr.a.y || 1) * h }; }
        dr.b = b;
        break;
      }
      case 'crop-edit': {
        const r0 = dr.r0, dx = p.x - dr.start.x, dy = p.y - dr.start.y;
        let r = Object.assign({}, r0);
        if (dr.k === 'move') { r.x += dx; r.y += dy; }
        else {
          if (dr.k.includes('w')) { r.x = r0.x + dx; r.w = r0.w - dx; }
          if (dr.k.includes('e')) r.w = r0.w + dx;
          if (dr.k.includes('n')) { r.y = r0.y + dy; r.h = r0.h - dy; }
          if (dr.k.includes('s')) r.h = r0.h + dy;
          const ratio = cropRatio();
          if (ratio) { if (dr.k === 'n' || dr.k === 's') r.w = r.h * ratio; else r.h = r.w / ratio; if (dr.k.includes('n')) r.y = r0.y + r0.h - r.h; }
          if (r.w < 0) { r.x += r.w; r.w = -r.w; }
          if (r.h < 0) { r.y += r.h; r.h = -r.h; }
        }
        V.crop = r;
        App.emit('crop');
        break;
      }
      case 'move': {
        let dx = Math.round(p.x - dr.start.x), dy = Math.round(p.y - dr.start.y);
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        dr.dx = dx; dr.dy = dy;
        for (const o of dr.layers) {
          const x = U.ctx(o.L.canvas);
          x.clearRect(0, 0, d.width, d.height);
          if (o.holed) { x.drawImage(o.holed, 0, 0); x.drawImage(o.base, dx, dy); } else x.drawImage(o.before, dx, dy);
        }
        if (dr.withSel) { const m = U.canvas(d.width, d.height); U.ctx(m).drawImage(dr.withSel, dx, dy); d.selectionMask = m; d.selectionRev++; }
        d.invalidateAll();
        App.emit('status', 'Δ ' + dx + ', ' + dy);
        break;
      }
      case 'curve-edit': {
        const c = V.curve, i = dr.i, n = c.anchors.length + 1;
        if (i === 0) c.p0 = { x: p.x, y: p.y }; else if (i === n) c.p1 = { x: p.x, y: p.y }; else c.anchors[i - 1] = { x: p.x, y: p.y };
        break;
      }
      case 'text-move': V.text.x = p.x - dr.dx; V.text.y = p.y - dr.dy; break;
      case 'stamp': {
        const dist = Math.hypot(p.x - dr.a.x, p.y - dr.a.y);
        if (dist * st.view.zoom > 6) { dr.moved = true; dr.size = Math.max(4, dist * 2); dr.rot = Math.atan2(p.y - dr.a.y, p.x - dr.a.x) + Math.PI / 2; }
        break;
      }
      case 'stamp-paint': {
        const size = st.stampSize * (e.pointerType === 'pen' ? 0.4 + p.p * 0.6 : 1);
        if (Math.hypot(p.x - dr.last.x, p.y - dr.last.y) >= size * st.stampSpacing) { placeStamp(p, size, stampRot()); dr.last = p; }
        break;
      }
      case 'sel-lasso': dr.pts.push(p); break;
      default: {
        let b = e.shiftKey && (dr.tool === 'line' || dr.tool === 'gradient') ? { x: p.x, y: p.y } : ND.Tools2.snap({ x: p.x, y: p.y });
        if (dr.tool === 'line' || dr.tool === 'gradient') {
          if (e.shiftKey) {
            const a = Math.atan2(b.y - dr.a.y, b.x - dr.a.x), r = Math.hypot(b.x - dr.a.x, b.y - dr.a.y), sn = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
            b = { x: dr.a.x + Math.cos(sn) * r, y: dr.a.y + Math.sin(sn) * r };
          }
        }
        dr.b = b;
        dr.mods = { square: e.shiftKey && dr.tool !== 'line' && dr.tool !== 'gradient' && !(App.SELECT_TOOLS.includes(dr.tool) && dr.mode === 'add' && !dr.shiftLate), center: e.altKey && !(App.SELECT_TOOLS.includes(dr.tool)) };
        if (App.SELECT_TOOLS.includes(dr.tool)) dr.mods.square = e.shiftKey && dr.mode !== 'add';
      }
    }
  }
  function onUp(e) {
    const d = App.doc;
    const ptr = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (V.pinch) {
      const P = V.pinch;
      if (pointers.size === 0 || Array.from(pointers.values()).filter((q) => q.type === 'touch').length < 2) {
        if (!P.moved && performance.now() - P.t < 300 && ptr && !ptr.moved) { d.history.undo(); App.toast('Undo'); }
        V.pinch = null;
      }
      return;
    }
    if (V.rotating) { V.rotating = null; return; }
    if (V.panning) { V.panning = null; updateCursor(); return; }
    if (V.stroke && V.healing) { ND.Tools2.finishHeal(); V.request(); return; }
    if (V.stroke && V.smarting) { ND.Tools2.finishSmart(); V.request(); return; }
    if (V.stroke) {
      const st = App.state, T = App.TOOLS.find((t) => t.id === st.tool);
      const label = st.eraserMode && st.tool === 'brush' ? 'Eraser' : T && T.engine ? T.label.replace(/ \(.*$/, '') : st.brushName || 'Brush Stroke';
      V.stroke.end(label);
      V.lastPoint = V.stroke.lastRaw;
      V.stroke = null;
      if (!st.eraserMode) App.pushRecent(st.fg);
      V.request();
      return;
    }
    const dr = V.drag;
    V.drag = null;
    if (!dr) return;
    if (dr.tool.startsWith('x-')) { ND.Tools2.up(e, dr); return; }
    const st = App.state;
    switch (dr.tool) {
      case 'zoom': if (!dr.moved) { const l = local(e); zoomAt(dr.alt || e.altKey ? 0.8 : 1.25, l.sx, l.sy); } break;
      case 'brush-shift': {
        if (!dr.moved && V.lastPoint) {
          // Shift+click: straight line from the end of the previous stroke
          const s = new ND.Brush.Stroke(d, Object.assign({}, st.brush, { stabilizer: 0 }), { colour: st.fg, eraser: st.eraserMode && st.tool === 'brush' });
          const a = V.lastPoint, b = dr.p, n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
          for (let i = 0; i <= n; i++) { const q = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, p: (a.p || 1) + ((b.p || 1) - (a.p || 1)) * (i / n), t: i * 4 }; if (i === 0) s.begin(q); else s.move(q); }
          s.end('Straight Line');
          V.lastPoint = b;
        }
        break;
      }
      case 'transform': d.emit('layers'); break;
      case 'crop-new': {
        const sp = ND.Render.shapePath('rect', dr.a, dr.b, {});
        if (sp.rect.w > 3 && sp.rect.h > 3) { V.crop = sp.rect; App.emit('crop'); }
        break;
      }
      case 'move': {
        if (!dr.dx && !dr.dy) break;
        const items = dr.layers.map((o) => ({ L: o.L, before: o.before, after: U.clone(o.L.canvas) }));
        const selB = dr.withSel, selA = d.selectionMask;
        const put = (key) => { for (const o of items) { const x = U.ctx(o.L.canvas); x.clearRect(0, 0, d.width, d.height); x.drawImage(o[key], 0, 0); o.L.rev++; } };
        items.forEach((o) => o.L.rev++);
        d.history.push({ label: 'Move', bytes: items.length * d.width * d.height * 8, undo: () => { put('before'); if (selB) d.setSelection(selB); }, redo: () => { put('after'); if (selB) d.setSelection(selA); } });
        App.emit('status', '');
        break;
      }
      case 'line': {
        if (Math.hypot(dr.b.x - dr.a.x, dr.b.y - dr.a.y) > 3) {
          const a = dr.a, b = dr.b;
          V.curve = { p0: a, p1: b, anchors: [0.25, 0.5, 0.75].map((t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) };
          App.toast('Drag the yellow handles to bend · Enter applies · Esc cancels', 2600);
        }
        break;
      }
      case 'rect': case 'ellipse': case 'polygon': doShape(dr); break;
      case 'gradient': doGradient(dr.a, dr.b); break;
      case 'sel-rect': case 'sel-ellipse': {
        const sp = ND.Render.shapePath(dr.tool, dr.a, dr.b, dr.mods);
        if (sp.rect.w < 2 && sp.rect.h < 2) { if (dr.mode === 'replace' && d.selectionMask) d.changeSelection('Deselect', null); break; }
        finishSelection(sp.path, dr.mode);
        break;
      }
      case 'sel-lasso': {
        if (dr.pts.length < 3) break;
        const path = new Path2D();
        dr.pts.forEach((q, i) => (i ? path.lineTo(q.x, q.y) : path.moveTo(q.x, q.y)));
        path.closePath();
        finishSelection(path, dr.mode);
        break;
      }
      case 'stamp': placeStamp(dr.a, dr.size, dr.rot); break;
      default: break;
    }
    V.request();
  }
  function onCancel(e) {
    pointers.delete(e.pointerId);
    if (V.stroke) { V.stroke.cancel(); V.stroke = null; }
    V.healing = false; V.smarting = null;
    V.drag = null; V.panning = null; V.pinch = null; V.rotating = null;
    V.request();
  }
  function onWheel(e) {
    e.preventDefault();
    const l = local(e);
    if (e.ctrlKey || e.metaKey) { zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025) * 4), l.sx, l.sy); return; }
    if (e.deltaX && Math.abs(e.deltaX) > 0 && e.deltaMode === 0 && !e.shiftKey && Math.abs(e.deltaY) < 50) {
      const v = App.state.view; App.setView({ panX: v.panX - e.deltaX, panY: v.panY - e.deltaY }); return;
    }
    if (e.altKey) { App.setBrush({ size: U.clamp(App.state.brush.size * (e.deltaY < 0 ? 1.1 : 0.9), 1, 1000) }); return; }
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, l.sx, l.sy);
  }
  function onDbl() {
    if (V.text) { V.commitText(); return; }
    if (V.poly) { closePoly(); return; }
    if (V.crop) { V.applyCrop(); return; }
    if (V.xf) { V.applyTransform(); return; }
    if (V.curve) V.commitCurve();
  }

  ND.View = V;
})();
