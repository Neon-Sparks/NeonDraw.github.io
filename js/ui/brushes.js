/* Neon Sparks Draw — brush docker: preset browser with live stroke previews + full brush settings. */
'use strict';
(function () {
  const U = ND.U, h = U.h, C = ND.C, App = ND.App;
  const previewCache = new Map();

  ND.BrushPanel = { build };

  function build(root) {
    let cat = App.state.presetCat || 'All', query = '';
    const chips = h('div.nd-chips');
    const search = h('input.nd-search', { type: 'search', placeholder: 'Search brushes…' });
    search.addEventListener('input', () => { query = search.value.toLowerCase(); renderGrid(); });
    search.addEventListener('keydown', (e) => e.stopPropagation());
    const grid = h('div.nd-presets');
    const fileIn = h('input', { type: 'file', multiple: true, accept: '.json,.abr,.kpp,.bundle,.gbr,.gih,.png,.zip', style: { display: 'none' } });
    fileIn.addEventListener('change', () => { if (fileIn.files.length) App.importAnyBrushes(Array.from(fileIn.files)); fileIn.value = ''; });
    const actions = h('div.nd-row.tight',
      C.button('Save brush', () => { const n = window.prompt('Name for this brush preset', App.state.brushName.replace(/ \(mine\)$/, '') + ' (mine)'); if (n) App.saveBrushPreset(n.trim()); }, { icon: 'save', cls: 'sm', title: 'Save the current settings as a preset' }),
      C.button('Import', () => fileIn.click(), { cls: 'sm', title: 'Import brushes: this app’s .json, Photoshop .abr, Krita .kpp / .bundle, GIMP .gbr / .gih, .png tips' }),
      C.button('Export', () => App.exportBrushes(), { cls: 'sm', title: 'Export your brush presets' }), fileIn);
    // an imported set is selected: offer to remove it
    const setBar = h('div.nd-row.tight');
    const presetsBody = h('div', chips, h('div.nd-row', search), setBar, grid, actions);
    root.appendChild(C.section('presets', 'Brush presets', presetsBody));

    const settings = h('div.nd-brush-settings');
    root.appendChild(C.section('brushsettings', 'Brush settings', settings));

    function cats() { return ['All'].concat(App.customPresets.some((p) => !p.imported) ? ['My Brushes'] : [], App.brushSets(), ND.Presets.CATS); }
    function renderChips() {
      if (App.state.presetCat && App.state.presetCat !== cat && cats().includes(App.state.presetCat)) cat = App.state.presetCat;
      if (!cats().includes(cat)) cat = 'All';
      U.clear(chips);
      U.clear(setBar);
      if (App.brushSets().includes(cat)) {
        const n = App.customPresets.filter((p) => p.imported === cat).length;
        setBar.append(h('span.nd-hint', n + ' imported brush' + (n === 1 ? '' : 'es')), C.button('Remove this set', () => { if (window.confirm('Remove the brush set “' + cat + '” and its tips?')) App.deleteBrushSet(cat); }, { cls: 'sm', icon: 'trash' }));
      }
      cats().forEach((c) => {
        const b = h('button.nd-chipbtn' + (c === cat ? '.active' : ''), { type: 'button' }, c);
        b.addEventListener('click', () => { cat = c; App.state.presetCat = c; renderChips(); renderGrid(); });
        chips.appendChild(b);
      });
    }
    const queue = [];
    let pumping = false;
    function pump() {
      if (pumping) return;
      pumping = true;
      const step = () => {
        const t0 = performance.now();
        while (queue.length && performance.now() - t0 < 14) {
          const { p, cv } = queue.shift();
          if (!cv.isConnected) continue;
          drawPreview(p, cv);
        }
        if (queue.length) setTimeout(step, 16); else pumping = false;
      };
      setTimeout(step, 0);
    }
    function drawPreview(p, cv) {
      const key = p.name + (p.custom ? JSON.stringify(p.settings) : '');
      let img = previewCache.get(key);
      if (!img) {
        try { img = U.clone(ND.Brush.previewStroke(p.settings, 128, 40, '#e6ecf5')); } catch (e) { console.warn('preview failed', p.name, e); img = U.canvas(1, 1); }
        previewCache.set(key, img);
      }
      const x = cv.getContext('2d');
      x.clearRect(0, 0, cv.width, cv.height);
      x.drawImage(img, 0, 0, cv.width, cv.height);
    }
    function renderGrid() {
      U.clear(grid);
      queue.length = 0;
      const all = App.customPresets.concat(ND.Presets.LIST);
      const list = all.filter((p) => (cat === 'All' || p.cat === cat) && (!query || p.name.toLowerCase().includes(query) || p.cat.toLowerCase().includes(query)));
      if (!list.length) grid.appendChild(h('div.nd-hint', 'No brushes match.'));
      list.forEach((p) => {
        const cv = h('canvas', { width: 128, height: 40 });
        const tile = h('button.nd-preset' + (p.name === App.state.brushName ? '.active' : ''), { type: 'button', title: p.name + ' — ' + p.cat }, cv, h('span', p.name));
        tile.addEventListener('click', () => App.loadPreset(p));
        const fav = ND.Popup.isFavourite(p.name), star = h('span.nd-preset-fav' + (fav ? '.on' : ''), { title: fav ? 'Remove from the pop-up palette' : 'Add to the pop-up palette (right-click the canvas)' }, fav ? '★' : '☆');
        star.addEventListener('click', (e) => { e.stopPropagation(); ND.Popup.toggleFavourite(p.name); });
        tile.appendChild(star);
        if (p.custom) {
          const del = h('span.nd-preset-del', { title: 'Delete preset' }, '×');
          del.addEventListener('click', (e) => { e.stopPropagation(); if (window.confirm('Delete brush preset “' + p.name + '”?')) App.deleteBrushPreset(p.name); });
          tile.appendChild(del);
        }
        grid.appendChild(tile);
        const key = p.name + (p.custom ? JSON.stringify(p.settings) : '');
        if (previewCache.has(key)) drawPreview(p, cv); else queue.push({ p, cv });
      });
      pump();
    }
    App.on('presets', () => { renderChips(); renderGrid(); });
    App.on('favourites', () => renderGrid());
    App.on('brush', () => grid.querySelectorAll('.nd-preset').forEach((t) => t.classList.toggle('active', t.title.split(' — ')[0] === App.state.brushName)));

    /* ----- settings ----- */
    let ctrls = [], lastEngine = null, lastPattern = null, lastCurves = false;
    const B = () => App.state.brush;
    const sl = (label, key, min, max, o) => { const c = C.slider(label, Object.assign({ min, max, get: () => B()[key], set: (v) => App.setBrush({ [key]: v }) }, o || {})); ctrls.push(c); return c; };
    const pct = (o) => Object.assign({ step: 0.01, fmt: (v) => Math.round(v * 100), toValue: (v) => v / 100, unit: '%' }, o || {});
    const ck = (label, key, title) => { const c = C.check(label, () => B()[key], (v) => App.setBrush({ [key]: v }), title); ctrls.push(c); return c; };
    const se = (label, key, opts, title, rerender) => { const c = C.select(label, opts, () => B()[key], (v) => { App.setBrush({ [key]: v === '' ? null : v }); if (rerender) renderSettings(); }, title); ctrls.push(c); return c; };
    const grp = (title, ...kids) => h('div.nd-sgroup', h('div.nd-mini-title', title), ...kids.filter(Boolean));

    function renderSettings() {
      U.clear(settings);
      ctrls = [];
      const b = B(), e = b.engine;
      lastEngine = e; lastPattern = b.pattern; lastCurves = !!(b.sizeCurve || b.opacityCurve || b.flowCurve);
      const isDab = ['pixel', 'airbrush', 'watercolor', 'mixer', 'eraser'].includes(e);
      settings.appendChild(grp('Engine',
        se('Engine', 'engine', ND.Brush.ENGINES.map((q) => [q.id, q.label]), 'How the brush lays down paint', true),
        isDab ? tipPicker() : null,
        sl('Size', 'size', 1, 1000, { log: true, unit: 'px', fmt: (v) => (v < 10 ? v.toFixed(1) : Math.round(v)) }),
        sl('Opacity', 'opacity', 0.01, 1, pct({ title: 'Maximum opacity of one stroke' })),
        sl('Flow', 'flow', 0.01, 1, pct({ title: 'Paint laid by each dab — builds up within a stroke' })),
        !['sketchy', 'nib', 'bristle', 'pixelart'].includes(e) ? sl('Spacing', 'spacing', 0.02, 2, pct({ title: 'Distance between dabs, relative to size' })) : null,
        isDab || ['smudge', 'blur', 'clone', 'dodge', 'burn', 'glow'].includes(e) ? sl('Softness', 'softness', 0, 1, pct()) : null,
        isDab || e === 'nib' ? sl('Roundness', 'roundness', 0.05, 1, pct()) : null,
        isDab || e === 'nib' || e === 'bristle' ? sl('Angle', 'angle', -180, 180, { unit: '°' }) : null,
        isDab ? se('Rotation', 'angleMode', [['fixed', 'Fixed angle'], ['direction', 'Follow stroke'], ['random', 'Random'], ['tilt', 'Pen tilt']]) : null));

      const eng = [];
      if (e === 'spray') eng.push(sl('Density', 'density', 1, 200), sl('Particle size', 'particle', 0.2, 6, { step: 0.1 }));
      if (e === 'watercolor') eng.push(sl('Wet edges', 'wetEdges', 0, 1, pct({ title: 'Pigment pooling at the edge when the stroke dries' })), sl('Colour bleed', 'bleed', 0, 1, pct({ title: 'Picks up and mixes the colours underneath' })), sl('Stays wet', 'wetTime', 0, 30, { unit: 's', title: 'Strokes painted into a wash within this time blend wet-in-wet (0 = every stroke dries at once)' }));
      if (['watercolor', 'mixer', 'bristle'].includes(e)) eng.push(se('Colour mixing', 'mixMode', [['pigment', 'Pigment (like paint: blue + yellow = green)'], ['rgb', 'Light (screen RGB)']], 'How picked-up colours mix with the brush colour'));
      if (e === 'mixer') eng.push(sl('Mixing', 'bleed', 0, 1, pct({ title: 'How much paint is picked up from the canvas' })), sl('Paint load', 'load', 0, 5000, { title: 'Distance before the brush runs dry and only smears (0 = never)', unit: 'px' }));
      if (e === 'bristle') eng.push(sl('Bristles', 'bristles', 3, 80), sl('Paint load', 'load', 0, 8000, { title: 'How far the paint lasts before the brush goes streaky (0 = automatic)', unit: 'px' }), sl('Dryness', 'dryness', 0, 1, pct({ title: 'How broken and scratchy the stroke gets as the paint thins' })), sl('Pick-up', 'bleed', 0, 1, pct({ title: 'Bristles drag wet paint they pass through' })), sl('Splay', 'splay', 0, 1, pct({ title: 'Bristles spread apart under pressure' })));
      if (e === 'sketchy') eng.push(se('Style', 'variant', [['sketchy', 'Sketchy'], ['shaded', 'Shaded'], ['web', 'Web'], ['fur', 'Fur']]), sl('Density', 'density', 1, 60), sl('Line width', 'lineWidth', 0.5, 6, { step: 0.1 }));
      if (e === 'hatch') eng.push(sl('Hatch angle', 'hatchAngle', -90, 90, { unit: '°' }), ck('Cross-hatch', 'cross'), sl('Line width', 'lineWidth', 0.5, 8, { step: 0.1 }));
      if (e === 'pixelart') eng.push(ck('Pixel-perfect lines', 'pixelPerfect', 'Removes doubled corner pixels (1 px only)'), ck('Erase', 'erase'));
      if (e === 'clone') eng.push(ck('Aligned', 'cloneAligned', 'Keep the same source offset between strokes'), ck('Sample all layers', 'cloneMerged'));
      if (eng.length) settings.appendChild(grp('Engine options', ...eng));

      settings.appendChild(grp('Pressure & dynamics',
        h('div.nd-row.tight', ck('Pressure → size', 'pressureSize'), ck('Pressure → opacity', 'pressureOpacity'), ck('Pressure → flow', 'pressureFlow', 'Light pressure lays down less paint per dab (Photoshop “Transfer”)')),
        sl('Min size', 'minSize', 0, 1, pct({ title: 'Size at the lightest pressure' })),
        curveGraph(),
        // imported brushes can bring their own curve for size, opacity or flow
        B().sizeCurve || B().opacityCurve || B().flowCurve ? h('div.nd-row.tight', h('span.nd-hint', 'This brush brings its own pressure curves (from the imported brush).'), C.button('Use my curve', () => { App.setBrush({ sizeCurve: null, opacityCurve: null, flowCurve: null }); renderSettings(); }, { cls: 'sm', title: 'Use the curve above for everything instead' })) : null,
        e !== 'bristle' ? sl('Taper in', 'taper', 0, 400, { unit: 'px', title: 'Stroke starts thin and grows over this distance' }) : null,
        ['pixel', 'airbrush', 'watercolor', 'mixer', 'eraser'].includes(e) ? sl('Taper out', 'taperOut', 0, 400, { unit: 'px', title: 'The end of the stroke thins out when you lift the pen' }) : null,
        sl('Speed thinning', 'speedSize', -1, 1, pct({ title: 'Fast strokes get thinner (handy with a mouse)' })),
        sl('Size jitter', 'sizeJitter', 0, 1, pct()),
        sl('Opacity jitter', 'opacityJitter', 0, 1, pct()),
        isDab ? sl('Angle jitter', 'angleJitter', 0, 1, pct()) : null,
        isDab ? sl('Roundness jitter', 'roundnessJitter', 0, 1, pct({ title: 'Each dab gets a little flatter at random' })) : null,
        isDab || e === 'spray' ? sl('Scatter', 'scatter', 0, 3, pct()) : null,
        isDab ? (() => { const c = C.select('Scatter direction', [['both', 'Both ways'], ['across', 'Across the stroke']], () => (B().scatterBoth === false ? 'across' : 'both'), (v) => App.setBrush({ scatterBoth: v !== 'across' }), 'Photoshop scatters across the stroke unless “Both axes” is on'); ctrls.push(c); return c; })() : null,
        isDab ? sl('Count', 'count', 1, 16, { step: 1, title: 'Dabs placed at each step (with scatter: a cloud of marks)' }) : null));

      if (!ND.Brush.DIRECT[e] && e !== 'clone') {
        settings.appendChild(grp('Colour dynamics',
          sl('Hue jitter', 'hueJitter', 0, 1, pct()), sl('Saturation jitter', 'satJitter', 0, 1, pct()), sl('Value jitter', 'valJitter', 0, 1, pct())));
      }
      if (isDab) {
        settings.appendChild(grp('Paper texture',
          se('Texture', 'texture', [['', 'None'], ...ND.Textures.list.map((t) => [t.id, t.label])], 'Paper grain — light pressure only catches the tooth', true),
          b.texture ? texPreview() : null,
          b.texture ? sl('Strength', 'textureStrength', 0, 1, pct()) : null,
          b.texture ? sl('Scale', 'textureScale', 0.25, 4, pct()) : null));
        settings.appendChild(grp('Pattern fill',
          se('Fill with', 'fillPattern', [['', 'None (solid colour)'], ...ND.Patterns.allTiles().map((t) => [t.name, t.name])], 'Paint a repeating pattern through the brush', true),
          b.fillPattern ? sl('Pattern scale', 'textureScale', 0.25, 4, pct()) : null));
        settings.appendChild(grp('Dual brush',
          se('Second tip', 'dualTip', [['', 'Off'], ...ND.Tips.list.map((t) => [t.id, t.label])], 'Paint only where a second, scattered tip lands — breaks up the edge like dry media', true),
          b.dualTip ? sl('Tip size', 'dualSize', 0.05, 1.5, pct()) : null,
          b.dualTip ? sl('Count', 'dualCount', 1, 8) : null));
        settings.appendChild(grp('Scatter pattern', spriteStrip(),
          b.pattern ? sl('Rotation', 'patternAngle', -180, 180, { unit: '°' }) : null,
          b.pattern ? sl('Randomness', 'patternRandom', 0, 1, pct()) : null,
          b.pattern ? ck('Tint with colour', 'patternTint', 'Recolour the pattern with the foreground colour') : null));
      }
      // how this brush reacts to the document's paper (Image ▸ Paper & texture)
      const auto = ND.Paper.autoResponse(b, e), isAuto = !(b.paperResponse >= 0);
      const resp = C.slider('Paper response', { min: 0, max: 1, step: 0.01, get: () => ND.Paper.response(B(), B().engine), set: (v) => App.setBrush({ paperResponse: v }), fmt: (v) => Math.round(v * 100), toValue: (v) => v / 100, unit: '%', title: 'How strongly the paper texture breaks up this brush (0% = ignores the paper)' });
      ctrls.push(resp);
      const paperInfo = App.doc && App.doc.paper ? 'On ' + ND.Paper.type(App.doc.paper.type).label.toLowerCase() : 'This document has no paper texture (Image ▸ Paper & texture…)';
      settings.appendChild(grp('Paper', resp,
        h('div.nd-row.tight', h('span.nd-hint', paperInfo + (isAuto ? ' · automatic for this kind of brush' : '')),
          !isAuto ? C.button('Auto (' + Math.round(auto * 100) + '%)', () => { App.setBrush({ paperResponse: -1 }); renderSettings(); }, { cls: 'sm' }) : null)));
      const symm = ND.Toolbar.symmetryControls();
      symm.forEach((c) => c && ctrls.push(c));
      settings.appendChild(grp('Stabiliser & symmetry', sl('Smoothing', 'stabilizer', 0, 1, pct()), ...symm,
        C.check('Show symmetry guides', () => App.state.showSymmetry, (v) => App.set('showSymmetry', v))));
      settings.appendChild(grp('Test pad', testPad()));
      settings.appendChild(h('div.nd-row', C.button('Reset to preset', () => { const p = App.customPresets.concat(ND.Presets.LIST).find((q) => q.name === App.state.brushName); if (p) App.loadPreset(p); }, { cls: 'sm' })));
    }
    // Pressure curve: drag the two handles (Procreate-style). Double-click resets to linear.
    function curveGraph() {
      const S = 132, cv = h('canvas.nd-pcurve', { width: S, height: S, title: 'Pressure curve — drag the handles · double-click to reset' });
      const get = () => B().pressurePts || [[0.33, 0.33], [0.67, 0.67]];
      const draw = () => {
        const x = cv.getContext('2d'), [a, b2] = get();
        x.fillStyle = '#16171b'; x.fillRect(0, 0, S, S);
        x.strokeStyle = 'rgba(255,255,255,0.08)'; x.beginPath();
        for (let i = 1; i < 4; i++) { x.moveTo((i * S) / 4, 0); x.lineTo((i * S) / 4, S); x.moveTo(0, (i * S) / 4); x.lineTo(S, (i * S) / 4); }
        x.stroke();
        x.strokeStyle = 'rgba(255,255,255,0.25)'; x.beginPath(); x.moveTo(0, S); x.lineTo(a[0] * S, S - a[1] * S); x.moveTo(S, 0); x.lineTo(b2[0] * S, S - b2[1] * S); x.stroke();
        x.strokeStyle = '#6db3ff'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, S); x.bezierCurveTo(a[0] * S, S - a[1] * S, b2[0] * S, S - b2[1] * S, S, 0); x.stroke(); x.lineWidth = 1;
        for (const q of [a, b2]) { x.beginPath(); x.arc(q[0] * S, S - q[1] * S, 5, 0, U.TAU); x.fillStyle = '#ffd166'; x.fill(); }
        x.fillStyle = '#6f7480'; x.font = '9px sans-serif'; x.fillText('pressure →', S - 56, S - 4);
      };
      let drag = -1;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [U.clamp((e.clientX - r.left) / r.width, 0, 1), U.clamp(1 - (e.clientY - r.top) / r.height, 0, 1)]; };
      cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); const p = pos(e), pts = get(); drag = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) < Math.hypot(p[0] - pts[1][0], p[1] - pts[1][1]) ? 0 : 1; });
      cv.addEventListener('pointermove', (e) => { if (drag < 0) return; const pts = get().map((q) => q.slice()); pts[drag] = pos(e); App.setBrush({ pressurePts: pts }); draw(); });
      cv.addEventListener('pointerup', () => { drag = -1; });
      cv.addEventListener('dblclick', () => { App.setBrush({ pressurePts: null, pressureCurve: 1 }); draw(); });
      const presets = C.select(null, [['', 'Curve presets…'], ['lin', 'Linear'], ['soft', 'Soft (light touch)'], ['firm', 'Firm (press harder)'], ['s', 'S-curve'], ['ink', 'Inking (quick ramp)']], () => '', (v) => {
        const m = { lin: null, soft: [[0.1, 0.5], [0.4, 0.95]], firm: [[0.5, 0.05], [0.9, 0.5]], s: [[0.45, 0.05], [0.55, 0.95]], ink: [[0.05, 0.6], [0.3, 1]] };
        if (v) App.setBrush({ pressurePts: m[v], pressureCurve: 1 });
        presets.sel.value = '';
        draw();
      });
      draw();
      cv.refresh = draw;
      ctrls.push(cv);
      return h('div.nd-row.tight.top', cv, h('div', h('div.nd-mini-title', 'Pressure curve'), presets, h('div.nd-hint', 'Drag the yellow handles. Double-click resets.')));
    }
    // A small scratch area to try the brush without touching the picture.
    function testPad() {
      const W = 268, H = 120, cv = h('canvas.nd-testpad', { width: W, height: H });
      let doc = null, stroke = null;
      const reset = () => { doc = new ND.Doc(W, H, '#f4f1ea'); show(); };
      const show = () => { const x = cv.getContext('2d'); x.clearRect(0, 0, W, H); x.drawImage(doc.getProjection(), 0, 0); };
      const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, p: e.pointerType === 'pen' ? Math.max(0.05, e.pressure) : 1, tx: e.tiltX || 0, ty: e.tiltY || 0, t: e.timeStamp }; };
      cv.addEventListener('pointerdown', (e) => {
        cv.setPointerCapture(e.pointerId);
        if (B().engine === 'clone') doc.cloneSource = pt(e);
        stroke = new ND.Brush.Stroke(doc, Object.assign({}, B(), { symmetry: 'none' }), { colour: App.state.fg, eraser: App.state.eraserMode });
        stroke.begin(pt(e)); show();
      });
      cv.addEventListener('pointermove', (e) => { if (!stroke) return; const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; (evs.length ? evs : [e]).forEach((q) => stroke.move(pt(q))); stroke.tick(performance.now()); show(); });
      cv.addEventListener('pointerup', () => { if (!stroke) return; stroke.end('test'); stroke = null; show(); });
      reset();
      return h('div', cv, h('div.nd-row.tight', C.button('Clear', reset, { cls: 'sm' }), h('span.nd-hint', 'Scribble here to try the brush')));
    }
    function tipPicker() {
      const b = h('button.nd-chip.tip', { title: 'Brush tip shape' });
      const ref = () => { U.clear(b); b.appendChild(ND.Tips.preview(B().tip || 'round', 22)); b.appendChild(h('span', (ND.Tips.list.find((t) => t.id === (B().tip || 'round')) || {}).label || 'Round')); };
      ref();
      b.refresh = ref;
      ctrls.push(b);
      b.addEventListener('click', () => {
        const g = h('div.nd-tipgrid');
        ND.Tips.list.forEach((t) => {
          const c = h('button.nd-tiptile' + ((B().tip || 'round') === t.id ? '.active' : ''), { title: t.label + (t.user ? ' (Alt+click to delete)' : '') }, ND.Tips.preview(t.id, 40), h('span', t.label));
          c.addEventListener('click', (ev) => { if (ev.altKey && t.user) { App.deleteUserTip(t.id); C.closePopover(); return; } App.setBrush({ tip: t.id }); C.closePopover(); });
          g.appendChild(c);
        });
        const fin = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
        fin.addEventListener('change', () => { if (fin.files[0]) App.importTipImage(fin.files[0]); C.closePopover(); });
        C.popover(b, h('div', h('div.nd-pop-title', 'Brush tips'), g, h('div.nd-pop-foot', C.button('Make tip from selection', () => { C.closePopover(); App.tipFromSelection(); }), C.button('Import image…', () => fin.click()), fin, h('span.nd-hint', 'Dark areas paint; transparent PNGs use their shape.'))), { cls: 'wide' });
      });
      return h('label.nd-select', h('span.nd-lbl', 'Tip'), b);
    }
    function texPreview() {
      const c = ND.Textures.preview(B().texture, 64);
      c.className = 'nd-texprev';
      return c;
    }
    function spriteStrip() {
      const strip = h('div.nd-patstrip');
      const none = h('button.nd-pattile.sm' + (!B().pattern ? '.active' : ''), { title: 'None' }, h('span.nd-none', '∅'));
      none.addEventListener('click', () => { App.setBrush({ pattern: null }); renderSettings(); });
      strip.appendChild(none);
      ND.Patterns.SPRITES.forEach((s) => {
        const t = h('button.nd-pattile.sm' + (B().pattern === s.name ? '.active' : ''), { title: s.name }, ND.Patterns.preview('sprite', s.name, 34));
        t.addEventListener('click', () => { App.setBrush({ pattern: s.name }); renderSettings(); });
        strip.appendChild(t);
      });
      return strip;
    }
    App.on('brush', () => {
      const b = B();
      // rebuild when the engine, pattern or own pressure curves change (the curve note comes and goes)
      const curves = !!(b.sizeCurve || b.opacityCurve || b.flowCurve);
      if (b.engine !== lastEngine || b.pattern !== lastPattern || curves !== lastCurves) { lastCurves = curves; renderSettings(); }
      else ctrls.forEach((c) => c.refresh && c.refresh());
    });
    App.on('state', () => ctrls.forEach((c) => c.refresh && c.refresh()));
    App.on('patterns', renderSettings);
    App.on('paper', renderSettings);
    App.on('docchange', renderSettings);
    App.on('tips', renderSettings);
    renderChips();
    renderGrid();
    renderSettings();
  }
})();
