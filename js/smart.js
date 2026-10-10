/* Neon Sparks Draw — smart objects. A smart layer keeps its original picture (`src`, full quality) plus how it is
 * placed on the canvas: an affine matrix `m` [a, b, c, d, e, f], or a warp / distort `mesh` (g × g points).
 * The layer's pixels are always redrawn from the original, so scaling down and up again, rotating many
 * times or warping never loses quality. "Edit contents" opens the original (with its own layers) in a tab.
 * layer.smart = { src, m, mesh, g, contents (a Doc or null) } */
'use strict';
(function () {
  const U = ND.U;
  const S = {};
  const M = (m) => new DOMMatrix(m);
  const arr = (dm) => [dm.a, dm.b, dm.c, dm.d, dm.e, dm.f];
  S.state = (sm) => ({ m: sm.m ? sm.m.slice() : null, mesh: sm.mesh ? sm.mesh.map((p) => ({ x: p.x, y: p.y })) : null, g: sm.g || 0 });
  S.setState = (sm, st) => { sm.m = st.m ? st.m.slice() : null; sm.mesh = st.mesh ? st.mesh.map((p) => ({ x: p.x, y: p.y })) : null; sm.g = st.g || 0; };
  // corners of the original, where they land on the canvas (TL, TR, BR, BL)
  S.corners = function (sm, st) {
    st = st || sm;
    const w = sm.src.width, h = sm.src.height;
    if (st.mesh) { const g = st.g, P = (i, j) => st.mesh[j * g + i]; return [P(0, 0), P(g - 1, 0), P(g - 1, g - 1), P(0, g - 1)]; }
    const m = M(st.m);
    return [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => { const p = m.transformPoint({ x, y }); return { x: p.x, y: p.y }; });
  };
  S.bounds = function (sm, st) {
    const c = S.corners(sm, st), xs = c.map((p) => p.x), ys = c.map((p) => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  };
  // redraw the layer from its original
  S.render = function (L, st) {
    const sm = L.smart, x = U.ctx(L.canvas);
    st = st || sm;
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, L.canvas.width, L.canvas.height);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    if (st.mesh) ND.Render.meshDraw(x, sm.src, { x: 0, y: 0, w: sm.src.width, h: sm.src.height }, st.mesh, st.g, st.g, st.g >= 3 ? 6 : 12);
    else { const m = st.m; x.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); x.drawImage(sm.src, 0, 0); }
    x.restore();
    L.rev++;
  };
  // apply a canvas-space transform (DOMMatrix) to a placement
  S.transformed = function (st, T) {
    if (st.mesh) return { m: null, mesh: st.mesh.map((p) => { const q = T.transformPoint(p); return { x: q.x, y: q.y }; }), g: st.g };
    return { m: arr(T.multiply(M(st.m))), mesh: null, g: 0 };
  };
  // a g × g mesh spread over four corners
  S.meshFromCorners = function (cs, g) {
    const mesh = [];
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
      const u = i / (g - 1), v = j / (g - 1);
      const top = { x: cs[0].x + (cs[1].x - cs[0].x) * u, y: cs[0].y + (cs[1].y - cs[0].y) * u };
      const bot = { x: cs[3].x + (cs[2].x - cs[3].x) * u, y: cs[3].y + (cs[2].y - cs[3].y) * u };
      mesh.push({ x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v });
    }
    return mesh;
  };
  /* What a whole-canvas operation (crop, scale, rotate…) does, as a matrix: run its draw function on a
   * stand-in context and read the transform it draws with. */
  S.captureAffine = function (drawFn, layer, W, H) {
    const real = U.ctx(U.canvas(1, 1)), mark = U.canvas(W, H);
    real.setTransform(1, 0, 0, 1, 0, 0);
    let found = null;
    const proxy = new Proxy(real, {
      get(t, k) {
        if (k === 'drawImage') {
          return (img, ...a) => {
            if (img !== mark || found) return;
            const T = t.getTransform();
            let sx = 0, sy = 0, sw = img.width, sh = img.height, dx, dy, dw, dh;
            if (a.length === 2) { [dx, dy] = a; dw = sw; dh = sh; } else if (a.length === 4) { [dx, dy, dw, dh] = a; } else { [sx, sy, sw, sh, dx, dy, dw, dh] = a; }
            found = T.multiply(new DOMMatrix([dw / sw, 0, 0, dh / sh, dx - (sx * dw) / sw, dy - (sy * dh) / sh]));
          };
        }
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, k, v) { t[k] = v; return true; },
    });
    try { drawFn(proxy, mark, layer); } catch (e) { return null; }
    return found;
  };

  /* ---------- commands ---------- */
  function push(doc, label, L, before, after) {
    const set = (v) => { L.smart = v.smart; if (v.smart) { S.setState(L.smart, v.st); L.smart.src = v.src; L.smart.contents = v.contents; S.render(L); } else { const x = U.ctx(L.canvas); x.clearRect(0, 0, L.canvas.width, L.canvas.height); x.drawImage(v.pixels, 0, 0); L.rev++; } doc.invalidateAll(); doc.emit('layers'); };
    doc.history.push({ label, bytes: L.canvas.width * L.canvas.height * 4, undo: () => set(before), redo: () => set(after) });
  }
  const snap = (L) => (L.smart ? { smart: L.smart, st: S.state(L.smart), src: L.smart.src, contents: L.smart.contents } : { smart: null, pixels: U.clone(L.canvas) });
  S.convert = function (doc, L) {
    if (!L || !L.isPixel) return 'Pick a paint layer';
    if (L.smart) return 'It is already a smart object';
    if (L.frames) return 'Animated layers can’t become smart objects';
    const bb = ND.Sel.contentBBox(L.canvas);
    if (!bb) return 'The layer is empty';
    const src = U.canvas(bb.w, bb.h);
    U.ctx(src).drawImage(L.canvas, -bb.x, -bb.y);
    const before = snap(L);
    L.smart = { src, m: [1, 0, 0, 1, bb.x, bb.y], mesh: null, g: 0, contents: null };
    L.textData = null; L.shapeData = null;
    S.render(L);
    push(doc, 'Convert to Smart Object', L, before, snap(L));
    doc.invalidateAll(); doc.emit('layers');
    return '';
  };
  S.rasterize = function (doc, L) {
    if (!L || !L.smart) return false;
    const before = snap(L);
    L.smart = null;
    push(doc, 'Rasterize Smart Object', L, before, snap(L));
    doc.emit('layers');
    return true;
  };
  // a picture placed as a new smart layer, shrunk to fit and centred
  S.place = function (doc, img, name) {
    const src = U.canvas(img.width, img.height);
    U.ctx(src).drawImage(img, 0, 0);
    const k = Math.min(1, (doc.width * 0.9) / src.width, (doc.height * 0.9) / src.height);
    const L = doc.addLayer(name || 'Placed');
    L.smart = { src, m: [k, 0, 0, k, (doc.width - src.width * k) / 2, (doc.height - src.height * k) / 2], mesh: null, g: 0, contents: null };
    S.render(L);
    doc.invalidateAll(); doc.emit('layers');
    return L;
  };
  // open the original in a new tab; saving (Ctrl+S) or closing that tab updates the layer
  S.edit = function (doc, L) {
    if (!L || !L.smart) return false;
    const App = ND.App, sm = L.smart;
    let cd = sm.contents;
    if (!cd || App.docs.includes(cd)) {
      if (cd && App.docs.includes(cd)) { App.showDoc(cd); return true; }
      cd = new ND.Doc(sm.src.width, sm.src.height, null);
      cd.root.children[0].name = 'Contents';
      U.ctx(cd.root.children[0].canvas).drawImage(sm.src, 0, 0);
      cd.invalidateAll();
    }
    cd.name = L.name + ' (contents)';
    cd.smartParent = { doc, L };
    cd._committed = cd.history.pos + ':' + cd.history.stack.length;
    App.setDoc(cd);
    App.toast('Editing the smart object’s contents — press Ctrl+S or close this tab to update “' + L.name + '”', 5000);
    return true;
  };
  S.commit = function (cd) {
    const p = cd && cd.smartParent;
    if (!p || !p.L.smart) return false;
    const key = cd.history.pos + ':' + cd.history.stack.length;
    if (key === cd._committed) return false;
    cd._committed = key;
    const L = p.L, before = snap(L);
    L.smart = Object.assign({}, L.smart, { src: U.clone(cd.getProjection()), contents: cd });
    S.render(L);
    push(p.doc, 'Edit Smart Object', L, before, snap(L));
    p.doc.invalidateAll(); p.doc.emit('layers');
    return true;
  };
  S.closing = function (cd) { S.commit(cd); const p = cd.smartParent; cd.smartParent = null; if (p && ND.App.docs.includes(p.doc)) setTimeout(() => ND.App.showDoc(p.doc), 0); };

  ND.SmartObj = S;
})();
