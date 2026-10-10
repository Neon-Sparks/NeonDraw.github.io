/* Neon Sparks Draw — Select and Mask workspace: refine a selection's edge with a live preview, then
 * output it as a selection, a layer mask, or a new (optionally decontaminated) layer. */
'use strict';
(function () {
  const U = ND.U, h = U.h, C = ND.C, App = ND.App, R = ND.Refine;
  const SM = { el: null };
  const VIEWS = [['overlay', 'Overlay', 'Red tint over what is not selected (F cycles views)'], ['black', 'On black'], ['white', 'On white'], ['transparent', 'Transparent'], ['mask', 'Black & white']];
  const OUTPUTS = [['selection', 'Selection'], ['mask', 'Layer mask'], ['layer', 'New layer'], ['layermask', 'New layer with mask']];

  // pixels of src (doc-sized canvas) for a doc rect, shrunk by `scale`
  function grab(src, r, scale) {
    const w = Math.max(1, Math.round(r.w * scale)), hh = Math.max(1, Math.round(r.h * scale)), c = U.canvas(w, hh), x = U.ctx(c);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, w, hh);
    return { c, w, h: hh, data: x.getImageData(0, 0, w, hh).data };
  }
  const margin = (p) => Math.ceil(p.radius * 2 + p.feather * 1.5 + p.smooth * 2 + Math.abs(p.shift) * 3 + 12);

  // draw the preview for one view mode
  function paint(target, img, res, view) {
    const w = img.w, hh = img.h, px = img.data, A = res.alpha, col = res.colour || px;
    target.width = w; target.height = hh;
    const x = U.ctx(target), out = x.createImageData(w, hh), o = out.data;
    for (let y = 0; y < hh; y++) {
      for (let xx = 0; xx < w; xx++) {
        const i = y * w + xx, j = i * 4, a = A[i], sa = px[j + 3] / 255;
        const chk = ((xx >> 3) + (y >> 3)) & 1 ? 204 : 255;
        if (view === 'mask') { o[j] = o[j + 1] = o[j + 2] = a * 255; o[j + 3] = 255; continue; }
        if (view === 'overlay') {
          // the picture over a checkerboard, tinted red where it is not selected
          for (let c = 0; c < 3; c++) { const v = px[j + c] * sa + chk * (1 - sa), red = c === 0 ? 255 : 30; o[j + c] = v + (red - v) * (1 - a) * 0.55; }
        } else {
          const bg = view === 'black' ? 0 : view === 'white' ? 255 : chk, aa = a * (res.colour ? 1 : sa);
          for (let c = 0; c < 3; c++) o[j + c] = bg + (col[j + c] - bg) * aa;
        }
        o[j + 3] = 255;
      }
    }
    x.putImageData(out, 0, 0);
  }

  SM.isOpen = () => !!SM.el;
  SM.close = function () { if (SM.el) { SM.el.remove(); SM.el = null; window.removeEventListener('keydown', SM.onKey, true); } };

  SM.open = function () {
    const d = App.doc;
    if (!d) return;
    SM.close();
    if (ND.View.hasPending && ND.View.hasPending()) ND.View.commitPending();
    const st = App.state, W = d.width, H = d.height;
    const p = Object.assign({}, R.DEFAULTS, st.maskParams || {});
    let view = st.maskView || 'overlay', output = p.decontam ? 'layermask' : 'selection';
    let sampleAll = !(d.active && d.active.isPixel);
    let src = d.sampleCanvas(sampleAll);
    let base = d.selectionMask ? U.clone(d.selectionMask) : null;
    let zoom = null; // {cx, cy} doc centre when viewing at 100%

    const stage = h('div.nd-sm-stage'), canvas = h('canvas.nd-sm-canvas'), busy = h('div.nd-sm-busy', 'Working…');
    stage.append(canvas, busy);
    const info = h('div.nd-sm-info');
    const save = () => { App.set('maskParams', Object.assign({}, p)); };
    let timer = 0;
    const refresh = (now) => { clearTimeout(timer); if (now) compute(); else timer = setTimeout(compute, 40); };
    const sl = (label, key, min, max, o) => C.slider(label, Object.assign({ min, max, get: () => p[key], set: (v) => { p[key] = v; save(); refresh(); } }, o || {}));
    const ctrls = [];
    const add = (c) => { ctrls.push(c); return c; };

    const viewSeg = add(C.segmented(VIEWS, () => view, (v) => { view = v; App.set('maskView', v); refresh(true); }));
    const decon = add(C.check('Decontaminate colours', () => p.decontam, (v) => { p.decontam = v; if (v && (output === 'selection' || output === 'mask')) { output = 'layermask'; outSel.refresh(); } save(); refresh(); }, 'Remove the background colour fringe from edge pixels (outputs to a new layer)'));
    const outSel = add(C.select('Output to', OUTPUTS, () => output, (v) => { output = v; if (p.decontam && (v === 'selection' || v === 'mask')) { p.decontam = false; decon.refresh(); refresh(); } }));
    const sampleChk = add(C.check('Sample all layers', () => sampleAll, (v) => { sampleAll = v; src = d.sampleCanvas(sampleAll); prepFit(); refresh(true); }));
    const side = h('div.nd-sm-side',
      h('div.nd-sm-title', 'Select and Mask'),
      h('div.nd-mini-title', 'View'), viewSeg,
      h('div.nd-row.tight', sampleChk),
      h('div.nd-row.tight',
        C.button('AI subject…', async () => {
          const id = await ND.AIUI.model('Select and Mask — AI subject', 'Use');
          if (!id) return;
          try { base = (await ND.AIUI.segment(id, src)).mask; prepFit(); refresh(true); } catch (e) { App.toast('AI failed: ' + e.message, 4000); }
        }, { icon: 'smartsel', cls: 'sm', title: 'Start from the subject found by an AI model (best for hair and busy backgrounds)' }),
        C.button('Select subject', () => { base = ND.Smart.selectSubject(src).mask; prepFit(); refresh(true); }, { cls: 'sm', title: 'Start again from the quick (non-AI) subject selection' }),
        C.button('Invert', () => { const c = U.canvas(W, H), x = U.ctx(c); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'destination-out'; x.drawImage(base, 0, 0); base = c; prepFit(); refresh(true); }, { cls: 'sm' })),
      h('div.nd-mini-title', 'Edge detection'),
      add(sl('Radius', 'radius', 0, 120, { unit: 'px', title: 'Width of the edge zone that is re-analysed — raise it for hair and fur' })),
      h('div.nd-mini-title', 'Global refinements'),
      add(sl('Smooth', 'smooth', 0, 60, { unit: 'px', title: 'Round off jagged outlines' })),
      add(sl('Feather', 'feather', 0, 120, { step: 0.5, unit: 'px', title: 'Soften the edge' })),
      add(sl('Contrast', 'contrast', 0, 100, { unit: '%', title: 'Sharpen a soft edge' })),
      add(sl('Shift edge', 'shift', -60, 60, { unit: 'px', title: 'Move the edge outwards (+) or inwards (−)' })),
      h('div.nd-mini-title', 'Output'),
      decon,
      add(sl('Amount', 'amount', 0, 1, { step: 0.01, fmt: (v) => Math.round(v * 100), toValue: (v) => v / 100, unit: '%' })),
      outSel,
      info,
      h('div.nd-hint', 'Click the picture to look at 100% (drag to move around); click again to fit. F cycles the views.'),
      h('div.nd-row.space.nd-sm-btns',
        C.button('Reset', () => { Object.assign(p, R.DEFAULTS); save(); ctrls.forEach((c) => c.refresh && c.refresh()); refresh(true); }, { cls: 'sm' }),
        h('span.grow'),
        C.button('Cancel', () => SM.close()),
        C.button('OK', () => apply(), { cls: 'primary' })));
    const box = h('div.nd-sm', stage, side);
    document.body.appendChild(box);
    SM.el = box;

    // fit-to-view working copy
    let fit = null;
    function prepFit() {
      const vw = Math.max(200, stage.clientWidth - 24), vh = Math.max(200, stage.clientHeight - 24);
      const sc = Math.min(1, vw / W, vh / H), r = { x: 0, y: 0, w: W, h: H };
      const img = grab(src, r, sc), m = grab(base, r, sc);
      const mask = new Float32Array(img.w * img.h);
      for (let i = 0; i < mask.length; i++) mask[i] = m.data[i * 4 + 3] / 255;
      fit = { img, mask, sc };
    }
    function compute() {
      if (!SM.el) return;
      busy.classList.add('show');
      requestAnimationFrame(() => setTimeout(() => {
        if (!SM.el) return;
        const t0 = performance.now();
        if (!zoom) {
          const res = R.run(fit.img.data, fit.mask, fit.img.w, fit.img.h, p, fit.sc);
          paint(canvas, fit.img, res, view);
          canvas.style.width = fit.img.w + 'px'; canvas.style.height = fit.img.h + 'px';
        } else {
          // 100% view of the area around zoom.cx/cy, computed with a margin so edges are right
          const vw = Math.min(W, stage.clientWidth - 24), vh = Math.min(H, stage.clientHeight - 24);
          const x0 = Math.round(U.clamp(zoom.cx - vw / 2, 0, W - vw)), y0 = Math.round(U.clamp(zoom.cy - vh / 2, 0, H - vh));
          zoom.rect = { x: x0, y: y0, w: vw, h: vh };
          const m = margin(p), r = U.clipRect({ x: x0 - m, y: y0 - m, w: vw + m * 2, h: vh + m * 2 }, W, H);
          const img = grab(src, r, 1), mk = R.alphaFrom(base, r.x, r.y, r.w, r.h);
          const res = R.run(img.data, mk, r.w, r.h, p, 1);
          const full = U.canvas(r.w, r.h);
          paint(full, img, res, view);
          canvas.width = vw; canvas.height = vh;
          U.ctx(canvas).drawImage(full, x0 - r.x, y0 - r.y, vw, vh, 0, 0, vw, vh);
          canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
        }
        canvas.style.transform = '';
        info.textContent = (zoom ? '100%' : Math.round(fit.sc * 100) + '%') + ' · ' + Math.round(performance.now() - t0) + ' ms';
        busy.classList.remove('show');
      }, 0));
    }

    // click to zoom, drag to pan
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } drag = { x: e.clientX, y: e.clientY, moved: false }; });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved && zoom) canvas.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const r = canvas.getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.moved && zoom) { zoom.cx -= dx; zoom.cy -= dy; refresh(true); }
      else if (!drag.moved) {
        if (zoom) zoom = null;
        else zoom = { cx: ((e.clientX - r.left) / r.width) * W, cy: ((e.clientY - r.top) / r.height) * H };
        refresh(true);
      }
      drag = null;
    });

    // full-resolution result
    function apply() {
      busy.classList.add('show');
      setTimeout(() => {
        try { finish(); } catch (e) { console.error(e); App.toast('Select and Mask failed: ' + e.message, 4000); }
        SM.close();
      }, 30);
    }
    function finish() {
      const bb = ND.Sel.bbox(base, 1);
      if (!bb) { App.toast('Nothing is selected'); return; }
      const m = margin(p), r = U.clipRect({ x: bb.x - m, y: bb.y - m, w: bb.w + m * 2, h: bb.h + m * 2 }, W, H);
      const img = grab(src, r, 1), res = R.run(img.data, R.alphaFrom(base, r.x, r.y, r.w, r.h), r.w, r.h, p, 1);
      const sel = R.toSelection(res.alpha, r.x, r.y, r.w, r.h, W, H);
      const label = 'Select and Mask';
      if (output === 'selection') { d.changeSelection(label, sel); App.toast('Refined selection'); return; }
      const maskFrom = () => { const mk = ND.DocMask.newMask(W, H, '#000'); U.ctx(mk).drawImage(sel, 0, 0); ND.DocMask.greyify(mk, { x: 0, y: 0, w: W, h: H }); return mk; };
      if (output === 'mask') {
        const L = d.active;
        if (!L || !(L.isPixel || L.isGroup)) { d.changeSelection(label, sel); App.toast('That layer can’t take a mask — kept as a selection'); return; }
        d.setProps(L, { mask: maskFrom(), maskEnabled: true }, label);
        d.setEditMask(true);
        App.toast('Layer mask added');
        return;
      }
      // new layer: either the cut-out pixels, or a copy with a mask
      const c = U.canvas(W, H), id = new ImageData(r.w, r.h), o = id.data, col = res.colour || img.data;
      for (let i = 0; i < r.w * r.h; i++) {
        const j = i * 4;
        o[j] = col[j]; o[j + 1] = col[j + 1]; o[j + 2] = col[j + 2];
        o[j + 3] = output === 'layer' ? img.data[j + 3] * res.alpha[i] : img.data[j + 3];
      }
      if (output === 'layermask') {
        // outside the refined area the copy keeps the original pixels
        U.ctx(c).drawImage(src, 0, 0);
        U.ctx(c).clearRect(r.x, r.y, r.w, r.h);
      }
      const tmp = U.canvas(r.w, r.h); U.ctx(tmp).putImageData(id, 0, 0);
      U.ctx(c).drawImage(tmp, r.x, r.y);
      const name = (d.active && d.active.name ? d.active.name : 'Layer') + (output === 'layer' ? ' (cut out)' : ' (refined)');
      d.addLayerFromCanvas(name, c, 0, 0);
      if (output === 'layermask') { d.setProps(d.active, { mask: maskFrom(), maskEnabled: true }, label); }
      App.toast(output === 'layer' ? 'Cut-out placed on a new layer' : 'New layer with a refined mask');
    }

    SM.onKey = (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.key !== 'Escape') return;
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); SM.close(); }
      else if (e.key === 'Enter') { e.preventDefault(); apply(); }
      else if (e.key.toLowerCase() === 'f') { e.preventDefault(); const i = VIEWS.findIndex((v) => v[0] === view); view = VIEWS[(i + 1) % VIEWS.length][0]; App.set('maskView', view); viewSeg.refresh(); refresh(true); }
    };
    window.addEventListener('keydown', SM.onKey, true);

    const start = () => { prepFit(); refresh(true); };
    if (!base) {
      busy.classList.add('show');
      busy.textContent = 'Finding the subject…';
      setTimeout(() => { base = ND.Smart.selectSubject(src).mask; busy.textContent = 'Working…'; start(); App.toast('No selection — started from Select subject'); }, 30);
    } else requestAnimationFrame(start);
  };

  ND.SelectMask = SM;
})();
