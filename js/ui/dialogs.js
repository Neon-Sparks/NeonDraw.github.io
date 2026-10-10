/* Neon Draw — modal dialogs. */
'use strict';
(function () {
  const U = ND.U, h = U.h, C = ND.C, App = ND.App;
  const D = {};

  D.modal = function (title, body, buttons, o) {
    o = o || {};
    D.close();
    const btnRow = h('div.nd-modal-btns');
    const box = h('div.nd-modal' + (o.wide ? '.wide' : ''), { role: 'dialog', 'aria-label': title }, h('div.nd-modal-head', h('h3', title), C.iconButton('close', 'Close (Esc)', () => { if (o.onCancel) o.onCancel(); D.close(); }, 'tiny')), h('div.nd-modal-body', body), btnRow);
    const back = h('div.nd-modal-back', box);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) { if (o.onCancel) o.onCancel(); D.close(); } });
    (buttons || []).forEach((b) => {
      const btn = C.button(b.label, () => { const r = b.action ? b.action() : null; if (r !== false) D.close(); }, { cls: b.primary ? 'primary' : '' });
      btnRow.appendChild(btn);
    });
    box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { if (o.onCancel) o.onCancel(); D.close(); }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { const p = (buttons || []).find((b) => b.primary); if (p) { const r = p.action ? p.action() : null; if (r !== false) D.close(); } }
    });
    document.body.appendChild(back);
    D.current = back;
    setTimeout(() => { const f = box.querySelector('input,select,textarea'); if (f && !o.noFocus) f.focus(); else box.tabIndex = -1, box.focus(); }, 30);
    return box;
  };
  D.close = function () { if (D.current) { D.current.remove(); D.current = null; } };
  D.isOpen = () => !!D.current;

  const num = (val, o) => { const i = h('input.nd-field', Object.assign({ type: 'number', value: val }, o || {})); return i; };
  const field = (label, input, suffix) => h('label.nd-field-row', h('span', label), input, suffix ? h('span.nd-unit', suffix) : null);

  // Ask for a number. Resolves to a number or null.
  D.number = function (title, label, def, min, max, suffix) {
    return new Promise((res) => {
      const i = num(def, { min, max });
      D.modal(title, field(label, i, suffix), [{ label: 'Cancel', action: () => res(null) }, { label: 'OK', primary: true, action: () => { const v = parseFloat(i.value); res(isNaN(v) ? null : U.clamp(v, min, max)); } }], { onCancel: () => res(null) });
    });
  };

  /* ---------------- paper picker (new document + Image ▸ Paper) ---------------- */
  // Edits `pp` (a paper object) in place; onChange runs after every change.
  D.paperPicker = function (pp, onChange) {
    const Pp = ND.Paper, chips = h('div.nd-paper-grid'), tints = h('div.nd-paper-tints'), note = h('div.nd-hint.nd-paper-note');
    const ctrls = [];
    const change = () => { renderChips(); renderTints(); ctrls.forEach((c) => c.refresh()); note.textContent = Pp.type(pp.type).note; if (onChange) onChange(); };
    function renderChips() {
      U.clear(chips);
      Pp.TYPES.forEach((t) => {
        const prev = Pp.preview(Object.assign({}, pp, { type: t.id, texture: t.texture, grain: t.grain, tint: pp.type === t.id ? pp.tint : t.tint }), 72, 44);
        const b = h('button.nd-paper-chip' + (pp.type === t.id ? '.active' : ''), { type: 'button', title: t.label + ' — ' + t.note }, prev, h('span', t.label));
        b.addEventListener('click', () => { Object.assign(pp, Pp.make(t.id, { show: pp.show, scale: pp.scale })); change(); });
        chips.appendChild(b);
      });
    }
    function renderTints() {
      U.clear(tints);
      Pp.TINTS.forEach(([c, n]) => {
        const b = h('button.nd-swatch' + (pp.tint === c ? '.active' : ''), { type: 'button', title: n + ' ' + c, style: { background: c } });
        b.addEventListener('click', () => { pp.tint = c; change(); });
        tints.appendChild(b);
      });
      const cust = C.colourInput(() => pp.tint, (v) => { pp.tint = v; if (onChange) onChange(); }, 'Any paper colour');
      tints.appendChild(cust);
    }
    const sl = (label, key, min, max, title) => { const c = C.slider(label, { min, max, step: 0.01, get: () => pp[key], set: (v) => { pp[key] = v; if (onChange) onChange(); }, fmt: (v) => Math.round(v * 100), toValue: (v) => v / 100, unit: '%', title }); ctrls.push(c); return c; };
    const el = h('div.nd-paper',
      chips,
      h('div.nd-row.tight', h('span.nd-lbl', 'Tint'), tints),
      sl('Roughness', 'grain', 0, 1, 'How toothy the paper is — rough paper breaks up dry media and makes watercolour granulate'),
      sl('Texture visible', 'show', 0, 1, 'How much of the paper texture you see (brushes still feel it at 0%)'),
      sl('Grain size', 'scale', 0.5, 3, 'Size of the paper grain'),
      note);
    change();
    return el;
  };
  D.paper = function () {
    const d = App.doc, pp = Object.assign({}, d.paper || ND.Paper.make('none'));
    const bottom = d.root.children[0], canRepaint = bottom && bottom.isPixel;
    let repaint = canRepaint && !!d.backgroundColor;
    const box = h('div', D.paperPicker(pp),
      canRepaint ? C.check('Repaint the bottom layer (“' + bottom.name + '”) with this paper', () => repaint, (v) => { repaint = v; }) : null,
      h('div.nd-hint', 'The paper changes how brushes behave: dry media catch its grain, watercolour granulates and spreads on absorbent paper, oils skip the canvas weave. Inks and pattern brushes barely notice.'));
    D.modal('Paper & texture', box, [{ label: 'Cancel' }, { label: 'Apply', primary: true, action: () => App.setPaper(pp.type === 'none' && !repaint ? null : pp, repaint) }], { wide: true, noFocus: true });
  };

  /* ---------------- new document ---------------- */
  D.newDoc = function () {
    const PRESETS = [
      ['Full HD', 1920, 1080], ['4K UHD', 3840, 2160], ['Square', 2048, 2048], ['Instagram post', 1080, 1350], ['Phone wallpaper', 1170, 2532],
      ['A4 @300ppi', 2480, 3508], ['A5 @300ppi', 1748, 2480], ['US Letter @300ppi', 2550, 3300], ['Comic page', 2063, 3131], ['Postcard', 1800, 1200],
      ['Texture 1K', 1024, 1024], ['Texture 2K', 2048, 2048], ['Pixel art 64', 64, 64], ['Pixel art 128', 128, 128], ['Icon 512', 512, 512], ['YouTube thumbnail', 1280, 720],
    ];
    const name = h('input.nd-field', { type: 'text', value: 'Untitled' });
    const w = num(1920, { min: 1, max: 16384 }), hh = num(1080, { min: 1, max: 16384 });
    let bgMode = App.state.lastPaper && App.state.lastPaper.type !== 'none' ? 'paper' : 'white';
    const pp = Object.assign(ND.Paper.make('none'), App.state.lastPaper || {});
    const bgCol = C.colourInput(() => '#f4efe6', () => {}, 'Custom background colour');
    const bgSeg = C.segmented([['paper', 'Paper', 'The paper below, with its texture'], ['white', 'White'], ['transparent', 'Transparent'], ['bg', 'BG colour'], ['custom', 'Custom']], () => bgMode, (v) => { bgMode = v; });
    const paperBox = D.paperPicker(pp, () => { if (pp.type !== 'none' && bgMode !== 'paper' && bgMode !== 'transparent') { bgMode = 'paper'; bgSeg.refresh(); } });
    const chips = h('div.nd-preset-chips');
    PRESETS.forEach(([n, pw, ph]) => {
      const b = h('button.nd-chipbtn', { type: 'button', title: pw + ' × ' + ph }, n);
      b.addEventListener('click', () => { w.value = pw; hh.value = ph; chips.querySelectorAll('.nd-chipbtn').forEach((q) => q.classList.toggle('active', q === b)); info(); });
      chips.appendChild(b);
    });
    let depth = App.state.newDepth === 16 && ND.Deep.supported() ? 16 : 8;
    const depthSeg = C.segmented([[8, '8-bit'], [16, '16-bit', 'Smoother gradients and edits, twice the memory']], () => depth, (v) => { if (+v === 16 && !ND.Deep.supported()) { App.toast('This browser can’t do 16-bit canvases yet — use Chrome or Edge'); return; } depth = +v; App.set('newDepth', depth); info(); });
    const swapB = C.button('⇄ Portrait / landscape', () => { const t = w.value; w.value = hh.value; hh.value = t; info(); }, { cls: 'sm' });
    const inf = h('div.nd-hint');
    const info = () => { const mp = (w.value * hh.value) / 1e6; inf.textContent = (+w.value) + ' × ' + (+hh.value) + ' px · ' + mp.toFixed(1) + ' MP · about ' + U.fmtBytes(w.value * hh.value * (depth === 16 ? 8 : 4)) + ' per layer' + (mp > 20 ? ' — large canvases are slower' : ''); };
    w.addEventListener('input', info); hh.addEventListener('input', info);
    info();
    D.modal('New document', h('div', chips, field('Name', name), h('div.nd-row', field('Width', w, 'px'), field('Height', hh, 'px'), swapB), inf, h('div.nd-row', h('span.nd-lbl', 'Background'), bgSeg, bgCol), h('div.nd-row', h('span.nd-lbl', 'Colour depth'), depthSeg), h('div.nd-mini-title', 'Paper'), paperBox), [
      { label: 'Cancel' },
      { label: 'Create', primary: true, action: () => {
        const W = U.clamp(Math.round(+w.value || 1920), 1, 16384), H = U.clamp(Math.round(+hh.value || 1080), 1, 16384);
        const bg = bgMode === 'paper' ? pp.tint : bgMode === 'white' ? '#ffffff' : bgMode === 'transparent' ? null : bgMode === 'bg' ? App.state.bg : bgCol.value;
        App.set('lastPaper', Object.assign({}, pp));
        App.newDocument(W, H, bg, name.value || 'Untitled', pp.type === 'none' ? null : pp, bgMode === 'paper', depth);
      } },
    ], { wide: true });
  };

  /* ---------------- scale image / canvas size ---------------- */
  D.scaleImage = function () {
    const d = App.doc, w = num(d.width, { min: 1, max: 16384 }), hh = num(d.height, { min: 1, max: 16384 }), p = num(100, { min: 1, max: 1000 });
    const keep = C.check('Keep aspect ratio', () => true, () => {});
    const box = () => keep.querySelector('input').checked;
    w.addEventListener('input', () => { if (box()) hh.value = Math.round((w.value * d.height) / d.width); p.value = Math.round((w.value / d.width) * 1000) / 10; });
    hh.addEventListener('input', () => { if (box()) w.value = Math.round((hh.value * d.width) / d.height); });
    p.addEventListener('input', () => { w.value = Math.round((d.width * p.value) / 100); hh.value = Math.round((d.height * p.value) / 100); });
    D.modal('Scale image', h('div', field('Width', w, 'px'), field('Height', hh, 'px'), field('Scale', p, '%'), keep, h('div.nd-hint', 'Resamples every layer. Use Image ▸ Canvas size to add space instead.')), [
      { label: 'Cancel' }, { label: 'Scale', primary: true, action: () => App.scaleImage(U.clamp(+w.value, 1, 16384), U.clamp(+hh.value, 1, 16384)) },
    ]);
  };
  D.canvasSize = function () {
    const d = App.doc, w = num(d.width, { min: 1, max: 16384 }), hh = num(d.height, { min: 1, max: 16384 });
    let ax = 0.5, ay = 0.5;
    const grid = h('div.nd-anchor');
    const draw = () => grid.querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.x === ax && +b.dataset.y === ay));
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const b = h('button', { type: 'button', title: 'Anchor' });
      b.dataset.x = i / 2; b.dataset.y = j / 2;
      b.addEventListener('click', () => { ax = i / 2; ay = j / 2; draw(); });
      grid.appendChild(b);
    }
    draw();
    D.modal('Canvas size', h('div.nd-row', h('div', field('Width', w, 'px'), field('Height', hh, 'px')), h('div', h('div.nd-mini-title', 'Anchor'), grid)), [
      { label: 'Cancel' }, { label: 'Resize canvas', primary: true, action: () => App.canvasSize(U.clamp(+w.value, 1, 16384), U.clamp(+hh.value, 1, 16384), ax, ay) },
    ]);
  };

  /* ---------------- PDF export ---------------- */
  D.pdf = function () {
    const d = App.doc, s = App.state;
    let dpi = s.pdfDpi || 300, q = 'jpeg', frames = false;
    const size = h('div.nd-hint');
    const upd = () => { size.textContent = 'Page size: ' + ((d.width / dpi) * 25.4).toFixed(0) + ' × ' + ((d.height / dpi) * 25.4).toFixed(0) + ' mm (' + (d.width / dpi).toFixed(2) + ' × ' + (d.height / dpi).toFixed(2) + ' in)'; };
    const body = h('div.nd-col',
      C.select('Resolution', [[72, '72 dpi (screen)'], [150, '150 dpi'], [300, '300 dpi (print)'], [600, '600 dpi']], () => dpi, (v) => { dpi = +v; App.set('pdfDpi', dpi); upd(); }),
      C.segmented([['jpeg', 'Smaller (JPEG 92%)'], ['lossless', 'Lossless']], () => q, (v) => { q = v; }),
      ND.Anim && ND.Anim.isAnimated(d) ? C.check('Every animation frame as its own page', () => frames, (v) => { frames = v; }) : null,
      size);
    upd();
    D.modal('Export PDF', body, [{ label: 'Cancel' }, { label: 'Export', primary: true, action: () => { App.exportPDF({ dpi, jpeg: q === 'jpeg' ? 0.92 : 0, frames }); } }]);
  };

  /* ---------------- filter with live preview ---------------- */
  D.filter = function (id) {
    const d = App.doc, f = ND.Filters.byId(id);
    if (!d.canPaint()) return App.blocked();
    if (!f.params.length) return App.applyFilter(id, {});
    const S = d.surface(), L = { canvas: S.canvas }, original = U.clone(S.canvas), vals = {};
    const touched = () => { if (S.kind !== 'pixels') ND.DocMask.markMask(S.canvas); };
    f.params.forEach((p) => { vals[p.key] = App.lastFilter && App.lastFilter.id === id ? App.lastFilter.params[p.key] : p.def; });
    let preview = true, closed = false, working = false, again = false, lastOut = null, lastKey = '';
    const restore = () => { closed = true; const x = U.ctx(L.canvas); x.clearRect(0, 0, d.width, d.height); x.drawImage(original, 0, 0); touched(); d.invalidateAll(); };
    const env = { fg: App.state.fg, bg: App.state.bg };
    // previews run in a background worker when possible; a new request waits for the one in progress
    const go = async () => {
      if (closed) return;
      if (!preview) { const x = U.ctx(L.canvas); x.clearRect(0, 0, d.width, d.height); x.drawImage(original, 0, 0); touched(); d.invalidateAll(); ND.View.request(); return; }
      if (working) { again = true; return; }
      working = true;
      const key = JSON.stringify(vals);
      try {
        const out = await ND.Filters.runAsync(id, original, vals, env, { cache: true });
        if (!closed && preview) { lastKey = key; lastOut = d.selectionMask ? U.clone(out) : out; show(out); }
      } finally { working = false; if (again && !closed) { again = false; go(); } }
    };
    const show = (out) => {
      const x = U.ctx(L.canvas);
      x.clearRect(0, 0, d.width, d.height);
      if (d.selectionMask) {
        const keep = U.clone(original), kx = U.ctx(keep); kx.globalCompositeOperation = 'destination-out'; kx.drawImage(d.selectionMask, 0, 0);
        const ox = U.ctx(out); ox.globalCompositeOperation = 'destination-in'; ox.drawImage(d.selectionMask, 0, 0);
        x.drawImage(keep, 0, 0);
      }
      x.drawImage(out, 0, 0);
      touched();
      d.invalidateAll();
      ND.View.request();
    };
    const run = U.debounce(go, ND.Filters.asyncAvailable() ? 40 : d.width * d.height > 4e6 ? 350 : 120);
    const ctrls = f.params.map((p) => p.type === 'check'
      ? C.check(p.label, () => !!vals[p.key], (v) => { vals[p.key] = v ? 1 : 0; run(); })
      : C.slider(p.label, { min: p.min, max: p.max, step: p.step, get: () => vals[p.key], set: (v) => { vals[p.key] = v; run(); }, wide: true }));
    const prev = C.check('Preview', () => preview, (v) => { preview = v; run(); });
    // smart filter: keep the filter editable as a filter layer instead of changing the pixels
    const canSmart = S.kind === 'pixels' && !d.selectionMask;
    const smart = canSmart ? C.check('Keep editable (smart filter layer)', () => !!App.state.smartFilter, (v) => App.set('smartFilter', v), 'Adds a filter layer clipped to this layer instead of changing its pixels — edit or remove it any time') : null;
    const reset = C.button('Defaults', () => { f.params.forEach((p) => { vals[p.key] = p.def; }); ctrls.forEach((c) => c.refresh()); run(); }, { cls: 'sm' });
    D.modal(f.label, h('div.nd-filter', ...ctrls, h('div.nd-row.space', prev, reset), smart, d.selectionMask ? h('div.nd-hint', 'Applies inside the selection only.') : null), [
      { label: 'Cancel', action: () => restore() },
      { label: 'Apply', primary: true, action: () => { const ready = preview && lastKey === JSON.stringify(vals) ? lastOut : null; restore(); if (canSmart && App.state.smartFilter) App.addFilterLayer(id, Object.assign({}, vals), true); else App.applyFilter(id, Object.assign({}, vals), ready); } },
    ], { onCancel: restore, noFocus: true });
    run();
  };

  /* ---------------- stamp picker ---------------- */
  D.stampPicker = function () {
    let cat = 'All', q = '';
    const chips = h('div.nd-chips'), grid = h('div.nd-stampgrid');
    const search = h('input.nd-search', { type: 'search', placeholder: 'Search stamps…' });
    search.addEventListener('input', () => { q = search.value.toLowerCase(); renderGrid(); });
    const fileIn = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    fileIn.addEventListener('change', async () => { if (fileIn.files[0]) { await App.importStampImage(fileIn.files[0]); renderChips(); renderGrid(); } });
    const renderChips = () => {
      U.clear(chips);
      ['All'].concat(ND.Stamps.cats()).forEach((c) => {
        const b = h('button.nd-chipbtn' + (c === cat ? '.active' : ''), { type: 'button' }, c);
        b.addEventListener('click', () => { cat = c; renderChips(); renderGrid(); });
        chips.appendChild(b);
      });
    };
    const renderGrid = () => {
      U.clear(grid);
      ND.Stamps.all().filter((s) => (cat === 'All' || s.cat === cat) && (!q || s.name.toLowerCase().includes(q))).forEach((s) => {
        const c = U.canvas(64, 64), img = ND.Stamps.render(s.name, 64, App.state.stampMode, App.state.fg);
        if (img) U.ctx(c).drawImage(img, 0, 0, 64, 64);
        const t = h('button.nd-stamptile' + (s.name === App.state.stamp ? '.active' : ''), { type: 'button', title: s.name }, c, h('span', s.name));
        t.addEventListener('click', () => { App.state.stamp = s.name; App.savePrefsSoon(); if (App.state.tool !== 'stamp') App.setTool('stamp'); else ND.Toolbar.renderOptions(); D.close(); });
        if (s.user) {
          const del = h('span.nd-preset-del', { title: 'Delete stamp' }, '×');
          del.addEventListener('click', (e) => { e.stopPropagation(); ND.Stamps.removeUser(s.name); App.saveUserStamps(); renderChips(); renderGrid(); });
          t.appendChild(del);
        }
        grid.appendChild(t);
      });
    };
    renderChips(); renderGrid();
    D.modal('Choose a stamp', h('div', chips, h('div.nd-row', search, C.button('Import image…', () => fileIn.click(), { cls: 'sm' }), C.button('From selection', () => { D.close(); App.stampFromSelection(); }, { cls: 'sm' }), fileIn), grid), [{ label: 'Close' }], { wide: true, noFocus: true });
  };

  /* ---------------- help ---------------- */
  D.help = function () {
    const rows = [
      ['B · E', 'Brush · toggle eraser mode (eraser remembers its own size)'], ['V U O N', 'Line · Rectangle · Ellipse · Polygon/star'], ['F · G', 'Fill · Gradient'],
      ['Y · S', 'Text · Stamp (S again opens the stamp library)'], ['R · L · Shift+L · W', 'Rect select · Lasso · Polygon lasso · Magic wand'], ['A', 'Quick select — paint over an object, the selection snaps to its edges (Alt removes)'],
      ['T · K · C · P · I', 'Move · Transform · Crop · Pen (paths) · Colour sampler'], ['H · Z', 'Pan · Zoom'], ['J', 'Spot healing brush'],
      ['Q', 'Quick mask — paint a selection, Q again to finish'], ['\\', 'Switch between painting the layer and its mask'], ['Ctrl+R', 'Rulers (drag from a ruler to make a guide)'],
      ['Shift+Backspace', 'Content-aware fill of the selection'],
      ['[ ]', 'Brush size down / up (Shift: softness)'], ['Shift+drag', 'Resize the brush on the canvas'], ['Shift+click', 'Straight line from the last stroke'],
      ['Ctrl/Alt+click', 'Pick colour while painting (sets clone source with the clone tool)'], ['Right-click / pen side button', 'Pop-up palette: favourite brushes, recent colours, colour wheel (Alt+right-click picks a colour)'], ['Alt+wheel', 'Brush size'],
      ['X · D', 'Swap colours · black & white'], ['1 · 2 · 3', 'Fit · 100% · 200%'], ['4 · 5 · 6', 'Rotate view left · reset · right'], ['M', 'Mirror view'],
      ['Space+drag', 'Pan from any tool (Shift+Space+drag rotates)'], ['Tab', 'Hide / show panels (the canvas fills the window)'], ['F11', 'Full screen'],
      ['Ctrl+Z · Ctrl+Shift+Z / Ctrl+Y', 'Undo · redo'], ['Ctrl+C · X · V', 'Copy · cut · paste (works with other apps)'], ['Ctrl+Shift+C', 'Copy merged'],
      ['Ctrl+A · Ctrl+D · Ctrl+Shift+I', 'Select all · deselect · invert'], ['Delete', 'Clear the selection'], ['Alt+Backspace · Ctrl+Backspace', 'Fill with FG · BG'],
      ['Ctrl+Shift+N · Ctrl+J · Ctrl+E', 'New layer · layer via copy · merge down'], ['Ctrl+G · Ctrl+Shift+G', 'Group · ungroup'], ['Ctrl+Alt+G', 'Clipping mask'],
      ['Ctrl+K', 'Command palette — type to run anything'], ['Ctrl+Alt+R', 'Select and Mask (refine edges, hair)'],
      ['Ctrl+T', 'Transform'], ['Ctrl+F', 'Repeat the last filter'], ['Ctrl+N · O', 'New · open'], ['Ctrl+S · Ctrl+Alt+S', 'Save (back to the same file) · save as'], ['Ctrl+Shift+S', 'Export PNG'],
      ['Arrow keys', 'Nudge layer with the Move tool (Shift ×10)'], ['Enter · Esc', 'Apply · cancel transforms, crops, curves and text'],
      ['Two-finger tap', 'Undo (touch screens)'], ['Pinch', 'Zoom & pan'],
    ];
    D.modal('Neon Draw — shortcuts & tips', h('div', h('div.nd-help-grid', ...rows.flatMap(([k, v]) => [h('kbd', k), h('span', v)])),
      h('p.nd-hint', 'Graphics tablets: pressure, tilt and the pen eraser end are supported. Your work autosaves in this browser every 30 seconds, and projects (.ndraw) keep layers. Use File ▸ Export for PNG, JPEG, WebP, layered PSD or OpenRaster (.ora, opens in Krita/GIMP). File ▸ Open reads Photoshop .psd files with their layers, groups and masks.')), [{ label: 'Close', primary: true }], { wide: true, noFocus: true });
  };
  D.about = function () {
    D.modal('About Neon Draw', h('div', h('p', 'Neon Draw is a layered painting app that runs entirely in your browser — no install and no uploads. Open index.html from disk or put the folder on any web host.'),
      h('p.nd-hint', ND.Adjust.KINDS.length + ' adjustment & fill layers · ' + Object.keys(ND.Effects.LABELS).length + ' layer effects · ' + ND.Presets.LIST.length + ' brush presets · ' + ND.Brush.ENGINES.length + ' brush engines · ' + ND.Tips.list.length + ' tips · ' + ND.Textures.list.length + ' paper textures · ' + ND.Patterns.SPRITES.length + ' scatter patterns · ' + ND.Patterns.TILES.length + ' tiling patterns · ' + ND.Stamps.list.length + ' stamps · ' + ND.Filters.list.length + ' filters · ' + ND.Blend.MODES.length + ' blend modes')), [{ label: 'Close', primary: true }]);
  };
  D.installHelp = function (fromDisk) {
    const steps = fromDisk
      ? [h('p', 'This copy of Neon Draw is running from a file (from disk, or the single-file version). That works fine, but browsers only install apps from a website.'),
        h('p', 'Upload the folder to GitHub Pages (see DEPLOY.md) or any web host, open it there, and an “Install app” button appears in the top bar.')]
      : [h('p', 'Your browser has not offered installation yet. You can usually install from its menu:'),
        h('ul.nd-list',
          h('li', h('b', 'Chrome / Edge (Windows, Mac, Linux, Android): '), 'the install icon at the right of the address bar, or menu ⋮ ▸ “Install Neon Draw” / “Apps ▸ Install this site as an app”.'),
          h('li', h('b', 'Safari on iPhone / iPad: '), 'Share button ▸ “Add to Home Screen”.'),
          h('li', h('b', 'Safari on Mac: '), 'File ▸ “Add to Dock”.'),
          h('li', h('b', 'Firefox: '), 'desktop Firefox can’t install web apps, but Neon Draw still works offline in a tab after the first visit.')),
        h('p.nd-hint', 'Installed, it opens in its own window, works without internet, and can open .ndraw, .psd, .ora and image files directly.')];
    D.modal('Install Neon Draw', h('div', ...steps), [{ label: 'Close', primary: true }], { noFocus: true });
  };
  D.recovered = function (doc, n) {
    D.modal('Welcome back', h('p', n > 1 ? 'Your last session was restored from autosave: ' + n + ' documents, one per tab at the top.' : 'Your last session (“' + doc.name + '”, ' + doc.width + ' × ' + doc.height + ') was restored from autosave.'), [
      { label: 'Start a new document', action: () => { setTimeout(() => D.newDoc(), 0); } },
      { label: 'Keep working', primary: true },
    ], { noFocus: true });
  };

  ND.Dialogs = D;
})();
