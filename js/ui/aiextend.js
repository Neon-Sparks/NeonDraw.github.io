/* Neon Sparks Draw — AI canvas extension (outpainting) and the content-aware move tool. Both use the AI remove models
 * (MI-GAN / LaMa): extending fills the new edges piece by piece, nearest the picture first; content-aware move
 * lifts the selected thing, puts it somewhere else and fills the hole it left. */
'use strict';
(function () {
  const U = ND.U, h = U.h, App = ND.App, AI = ND.AI, C = ND.C;
  const V = () => ND.View;
  const S = () => App.state;
  async function model(title) {
    const why = AI.unsupported();
    if (why) { ND.Dialogs.modal(title, h('p', why), [{ label: 'Close', primary: true }]); return null; }
    const id = AI.INPAINT.includes(S().aiInpaint) ? S().aiInpaint : 'migan';
    if (!S().aiInpaintAsk && (await AI.isDownloaded(id))) return id;
    return ND.AIUI.choose(title + ' — choose a model', 'Download and continue', null, AI.INPAINT, 'aiInpaint');
  }

  /* ================= Extend the canvas with AI ================= */
  const SHAPES = [['1:1', 1], ['4:5', 4 / 5], ['9:16', 9 / 16], ['16:9', 16 / 9], ['3:2', 3 / 2], ['2:3', 2 / 3]];
  const ANCHORS = [['Centre', 0.5, 0.5], ['Top', 0.5, 0], ['Bottom', 0.5, 1], ['Left', 0, 0.5], ['Right', 1, 0.5], ['Top left', 0, 0], ['Top right', 1, 0], ['Bottom left', 0, 1], ['Bottom right', 1, 1]];
  App.aiExtendDialog = function () {
    const d = App.doc;
    let mode = '4:5', border = 25, anchor = 'Centre';
    const wIn = h('input.nd-field', { type: 'number', min: d.width, max: 16384, value: Math.round(d.width * 1.25) }), hIn = h('input.nd-field', { type: 'number', min: d.height, max: 16384, value: Math.round(d.height * 1.25) });
    const info = h('div.nd-hint'), custom = h('div.nd-row', h('span', 'Width'), wIn, h('span', 'Height'), hIn);
    const target = () => {
      if (mode === 'border') { const k = 1 + (border / 100) * 2; return [Math.round(d.width * (anchor === 'Centre' || /Left|Right/.test(anchor) ? k : 1)), Math.round(d.height * (anchor === 'Centre' || /Top|Bottom/.test(anchor) ? k : 1))]; }
      if (mode === 'custom') return [Math.max(d.width, +wIn.value || d.width), Math.max(d.height, +hIn.value || d.height)];
      const ratio = SHAPES.find((s) => s[0] === mode)[1];
      return d.width / d.height < ratio ? [Math.round(d.height * ratio), d.height] : [d.width, Math.round(d.width / ratio)];
    };
    const upd = () => { const [W, H] = target(); custom.style.display = mode === 'custom' ? '' : 'none'; brow.style.display = mode === 'border' ? '' : 'none'; info.textContent = W === d.width && H === d.height ? 'The picture already has this shape — pick another one.' : d.width + ' × ' + d.height + '  →  ' + W + ' × ' + H + ' px. The new edges are filled by AI on a new layer (' + AI.MODELS[S().aiInpaint === 'lama' ? 'lama' : 'migan'].name + ').'; };
    const brow = C.slider('Border on each side', { min: 5, max: 100, get: () => border, set: (v) => { border = Math.round(v); upd(); }, unit: '%' });
    wIn.addEventListener('input', upd); hIn.addEventListener('input', upd);
    const body = h('div.nd-col',
      C.segmented(SHAPES.map((s) => [s[0], s[0]]).concat([['border', 'Add border'], ['custom', 'Custom size']]), () => mode, (v) => { mode = v; upd(); }),
      brow, custom,
      C.select('Keep the picture at', ANCHORS.map((a) => [a[0], a[0]]), () => anchor, (v) => { anchor = v; upd(); }),
      C.select('Model', [['migan', 'MI-GAN — fast (28 MB)'], ['lama', 'LaMa — best quality (208 MB)']], () => S().aiInpaint || 'migan', (v) => { App.set('aiInpaint', v); upd(); }),
      info);
    upd();
    ND.Dialogs.modal('Extend canvas with AI', body, [{ label: 'Cancel' }, { label: 'Extend', primary: true, action: () => { const [W, H] = target(), a = ANCHORS.find((q) => q[0] === anchor); if (W > d.width || H > d.height) App.aiExtend(W, H, a[1], a[2]); else App.toast('Pick a bigger size'); } }], { wide: true });
  };
  App.aiExtend = async function (W2, H2, ax, ay) {
    const d = App.doc, W = d.width, H = d.height;
    if (W2 * H2 > 40e6) return App.toast('That would be over 40 megapixels — too big for the browser');
    const id = await model('Extend canvas with AI');
    if (!id) return;
    const ox = Math.round((W2 - W) * ax), oy = Math.round((H2 - H) * ay);
    App.canvasSize(W2, H2, ax, ay);
    // what is known (the old picture) and what to fill (everything around it)
    const prevType = U.colorType;
    const work = U.clone(d.getProjection()), hole = U.canvas(W2, H2), hx = U.ctx(hole);
    hx.fillStyle = '#fff'; hx.fillRect(0, 0, W2, H2); hx.clearRect(ox, oy, W, H);
    const T = U.clamp(Math.round(Math.max(W2, H2) / 6), 256, 640), tiles = [];
    for (let y = 0; y < H2; y += T) for (let x = 0; x < W2; x += T) {
      const r = { x, y, w: Math.min(T, W2 - x), h: Math.min(T, H2 - y) };
      if (r.x >= ox && r.y >= oy && r.x + r.w <= ox + W && r.y + r.h <= oy + H) continue; // entirely inside the old picture
      const dx = Math.max(ox - (r.x + r.w), 0, r.x - (ox + W)), dy = Math.max(oy - (r.y + r.h), 0, r.y - (oy + H));
      tiles.push(Object.assign(r, { dist: Math.hypot(dx, dy) }));
    }
    tiles.sort((a, b) => a.dist - b.dist);
    let cancelled = false;
    const UI = ND.AIUI, t0 = performance.now();
    UI.busy('Starting AI…', () => { cancelled = true; UI.busy('Stopping…', null); });
    const th = U.canvas(W2, H2), tx = U.ctx(th);
    try {
      for (let i = 0; i < tiles.length; i++) {
        if (cancelled) throw new Error('cancelled');
        const r = tiles[i];
        tx.clearRect(0, 0, W2, H2); tx.drawImage(hole, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        if (!ND.Sel.contentBBox(th)) continue;
        // the whole unfilled area counts as unknown; only this piece is kept
        const res = await AI.inpaint(id, work, hole, (s) => UI.busy('Extending — part ' + (i + 1) + ' of ' + tiles.length + ' · ' + s), th);
        // only the part of this piece that was empty, kept crisp (no soft edge into neighbouring pieces)
        const pc = U.canvas(W2, H2), px = U.ctx(pc);
        px.drawImage(res.patch, 0, 0); px.globalCompositeOperation = 'destination-in'; px.drawImage(th, 0, 0);
        const full = U.canvas(W2, H2), fx = U.ctx(full);
        fx.drawImage(res.patch, 0, 0); // includes the softened edge: blend it over what is there
        U.ctx(work).drawImage(full, 0, 0);
        U.ctx(work).drawImage(pc, 0, 0);
        hx.save(); hx.globalCompositeOperation = 'destination-out'; hx.drawImage(th, 0, 0); hx.restore();
      }
    } catch (e) {
      UI.idle();
      U.colorType = prevType;
      if (/cancel/i.test(e.message)) { App.toast('Stopped — the canvas is bigger but the new edges were not filled (undo to go back)', 5000); return; }
      console.error(e); return App.toast('AI extend failed: ' + e.message, 6000);
    }
    UI.idle();
    // the filled edges on their own layer, on top
    const out = U.clone(work);
    U.ctx(out).clearRect(ox, oy, W, H);
    const top = d.root.children[d.root.children.length - 1];
    if (top) d.active = top;
    d.addLayerFromCanvas('AI extend', out, 0, 0);
    App.fitView();
    App.toast('Extended to ' + W2 + ' × ' + H2 + ' in ' + Math.round((performance.now() - t0) / 1000) + ' s — the new edges are on the “AI extend” layer (paint on its mask or erase to fix bits)', 6000);
  };

  /* ================= Content-aware move ================= */
  const M = { busy: false };
  const selAt = (d, p) => { if (!d.selectionMask) return false; const q = U.ctx(d.selectionMask).getImageData(Math.round(U.clamp(p.x, 0, d.width - 1)), Math.round(U.clamp(p.y, 0, d.height - 1)), 1, 1).data; return q[3] > 100; };
  M.down = function (e, p) {
    const d = App.doc;
    if (M.busy) return true;
    if (!d.selectionMask) { App.toast('Select the thing to move first (any selection tool), then drag it with this tool'); return true; }
    if (!selAt(d, p)) { App.toast('Drag from inside the selection'); return true; }
    if (!S().cmAll && !(d.active && d.active.isPixel)) { App.toast('Pick a paint layer, or turn on “Sample all layers”'); return true; }
    const src = S().cmAll ? U.clone(d.getProjection()) : U.clone(d.active.canvas), sel = U.clone(d.selectionMask);
    // soft-edged object
    const soft = U.canvas(d.width, d.height), sx = U.ctx(soft);
    sx.filter = 'blur(1.5px)'; sx.drawImage(sel, 0, 0);
    const obj = U.clone(src), ox = U.ctx(obj);
    ox.globalCompositeOperation = 'destination-in'; ox.drawImage(soft, 0, 0);
    V().drag = { tool: 'x-camove', start: p, dx: 0, dy: 0, src, sel, obj };
    return true;
  };
  M.move = function (e, p) { const dr = V().drag; dr.dx = Math.round(p.x - dr.start.x); dr.dy = Math.round(p.y - dr.start.y); V().request(); };
  M.overlay = function (cx, lw) {
    const dr = V().drag;
    if (!dr || dr.tool !== 'x-camove') return;
    cx.save();
    if (S().cmMode !== 'dup') { cx.globalAlpha = 0.55; cx.fillStyle = '#808080'; cx.drawImage(dr.sel, 0, 0); } // where the hole will be
    cx.globalAlpha = 0.9; cx.drawImage(dr.obj, dr.dx, dr.dy);
    cx.restore();
    cx.save(); cx.strokeStyle = '#ffb347'; cx.lineWidth = lw * 1.5; cx.setLineDash([5 * lw, 4 * lw]);
    const bb = ND.Sel.bbox(dr.sel, 1);
    if (bb) cx.strokeRect(bb.x + dr.dx, bb.y + dr.dy, bb.w, bb.h);
    cx.restore();
  };
  M.up = async function (dr) {
    const d = App.doc;
    V().request();
    if (Math.abs(dr.dx) + Math.abs(dr.dy) < 2) return;
    const dup = S().cmMode === 'dup';
    let id = null;
    if (!dup) { id = await model('Content-aware move'); if (!id) return; }
    M.busy = true;
    const UI = ND.AIUI;
    try {
      const out = U.canvas(d.width, d.height), x = U.ctx(out);
      let secs = 0;
      if (!dup) {
        UI.busy('Starting AI…');
        const r = await AI.inpaint(id, dr.src, dr.sel, (t) => UI.busy('Filling the hole · ' + t));
        x.drawImage(r.patch, 0, 0);
        secs = r.seconds;
      }
      x.drawImage(dr.obj, dr.dx, dr.dy);
      if (S().cmNewLayer || !d.canPaint()) d.addLayerFromCanvas(dup ? 'Copied object' : 'Moved object', out, 0, 0);
      else { const keep = d.selectionMask; d.selectionMask = null; d.paintOnActive(dup ? 'Copy Object' : 'Content-Aware Move', (c) => c.drawImage(out, 0, 0)); d.selectionMask = keep; }
      // the selection follows the object
      const m = U.canvas(d.width, d.height); U.ctx(m).drawImage(dr.sel, dr.dx, dr.dy); d.setSelection(m);
      App.toast(dup ? 'Copied' : 'Moved — the hole was filled by AI in ' + secs.toFixed(1) + ' s' + (S().cmNewLayer ? ' (on its own layer)' : ''), 4000);
    } catch (e) { console.error(e); App.toast('Content-aware move failed: ' + e.message, 6000); } finally { M.busy = false; UI.idle(); V().request(); }
  };
  ND.CAMove = M;
})();
