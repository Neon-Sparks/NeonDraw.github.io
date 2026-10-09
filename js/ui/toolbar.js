/* Neon Draw — toolbox (left), tool options bar (top) and status bar (bottom). */
'use strict';
(function () {
  const U = ND.U, h = U.h, C = ND.C, App = ND.App;
  const T = {};

  /* ---------------- toolbox ---------------- */
  T.buildToolbox = function (box) {
    const btns = {};
    let group = null;
    // header: drag grip, column switch, dock / float
    const cols = h('button.nd-tb-btn', { type: 'button', title: 'Columns: click to switch between 1, 2 and 3 columns' });
    const pin = h('button.nd-tb-btn', { type: 'button' });
    const head = h('div.nd-tb-head', { title: 'Drag to move the tool panel — drop it near the left or right edge to dock it' }, h('span.nd-tb-grip', '⋮⋮'), cols, pin);
    const el = h('div.nd-tb-body');
    box.append(head, el);
    T.layoutToolbox = () => layout(box, cols, pin);
    cols.addEventListener('click', (e) => { e.stopPropagation(); App.set('toolboxCols', (T.colsNow() % 3) + 1); T.layoutToolbox(); });
    pin.addEventListener('click', (e) => { e.stopPropagation(); T.setToolboxMode(App.state.toolboxMode === 'float' ? 'left' : 'float'); });
    dragToolbox(box, head);
    for (const t of App.TOOLS) {
      if (t.group !== group) { group = t.group; el.appendChild(h('div.nd-tool-group', group)); }
      const b = h('button.nd-tool', { type: 'button', title: t.label + (t.key ? '  (' + t.key + ')' : ''), 'aria-label': t.label }, ND.icon(t.icon, 20));
      b.addEventListener('click', () => App.setTool(t.id));
      btns[t.id] = b;
      el.appendChild(b);
    }
    const fg = h('button.nd-sw.fg', { title: 'Foreground colour' }), bg = h('button.nd-sw.bg', { title: 'Background colour (click to make active)' });
    const swap = C.iconButton('swap', 'Swap colours (X)', () => App.swapColours(), 'tiny');
    const reset = C.iconButton('reset', 'Black & white (D)', () => App.resetColours(), 'tiny');
    fg.addEventListener('click', () => { const i = document.querySelector('.nd-colour-panel input[type=color]'); if (i) i.click(); });
    bg.addEventListener('click', () => App.swapColours());
    el.appendChild(h('div.nd-tool-group.nd-tb-sep'));
    el.appendChild(h('div.nd-fgbg', fg, bg, swap, reset));
    const qm = h('button.nd-tool.qm', { type: 'button', title: 'Quick mask — paint a selection (Q)' }, ND.icon('quickmask', 20));
    qm.addEventListener('click', () => App.toggleQuickMask());
    el.appendChild(qm);
    App.on('quickmask', () => qm.classList.toggle('active', !!(App.doc && App.doc.quickMask)));
    const refresh = () => {
      const s = App.state;
      for (const id in btns) btns[id].classList.toggle('active', id === 'eraser' ? s.eraserMode && s.tool === 'brush' : s.tool === id && !(id === 'brush' && s.eraserMode));
      fg.style.background = s.fg; bg.style.background = s.bg;
    };
    App.on('tool', refresh); App.on('colour', refresh); App.on('brush', refresh);
    refresh();
    T.layoutToolbox();
    window.addEventListener('resize', () => T.layoutToolbox());
  };

  /* ---------- tool panel layout: 1–3 columns, docked left / right or floating ---------- */
  // columns in use: the user's choice, or automatic (2 when one column would need scrolling)
  let autoCols = 1;
  T.colsNow = function () {
    const c = App.state.toolboxCols;
    return c >= 1 && c <= 3 ? c : autoCols;
  };
  function layout(box, colsBtn, pin) {
    const st = App.state, mode = ['left', 'right', 'float'].includes(st.toolboxMode) ? st.toolboxMode : 'left';
    box.classList.remove('tb-left', 'tb-right', 'tb-float');
    box.classList.add('tb-' + mode);
    const apply = (k) => { box.style.setProperty('--cols', k); box.classList.toggle('multi', k > 1); };
    if (!(st.toolboxCols >= 1 && st.toolboxCols <= 3) && box.offsetParent) {
      // automatic: the fewest columns that fit without scrolling
      const body = box.querySelector('.nd-tb-body');
      for (autoCols = 1; autoCols < 3; autoCols++) {
        apply(autoCols);
        if (body.scrollHeight <= body.clientHeight + 1) break;
      }
    }
    const n = T.colsNow();
    apply(n);
    colsBtn.textContent = String(n);
    colsBtn.title = n + ' column' + (n > 1 ? 's' : '') + ' — click for ' + ((n % 3) + 1);
    U.clear(pin); pin.appendChild(ND.icon(mode === 'float' ? 'pin' : 'fullscreen', 12));
    pin.title = mode === 'float' ? 'Dock the tool panel on the left' : 'Float the tool panel (then drag it anywhere)';
    if (mode === 'float') {
      const main = box.parentNode, p = st.toolboxPos || { x: 70, y: 12 };
      const maxX = Math.max(0, main.clientWidth - box.offsetWidth), maxY = Math.max(0, main.clientHeight - 60);
      box.style.left = U.clamp(p.x, 0, maxX) + 'px'; box.style.top = U.clamp(p.y, 0, maxY) + 'px';
    } else { box.style.left = ''; box.style.top = ''; }
    if (ND.View && ND.View.request) ND.View.request();
  }
  T.setToolboxMode = function (mode, pos) {
    App.set('toolboxMode', mode);
    if (pos) App.set('toolboxPos', pos);
    T.layoutToolbox();
  };
  // drag by the header; dropping near the left / right edge docks it there
  function dragToolbox(box, head) {
    let drag = null, zone = null;
    const hint = h('div.nd-tb-snap');
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.button !== 0) return;
      const main = box.parentNode, mr = main.getBoundingClientRect(), br = box.getBoundingClientRect();
      drag = { sx: e.clientX, sy: e.clientY, ox: e.clientX - br.left, oy: e.clientY - br.top, mr, moved: false, startX: br.left - mr.left, startY: br.top - mr.top };
      try { head.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 5) return;
        drag.moved = true;
        if (App.state.toolboxMode !== 'float') T.setToolboxMode('float', { x: drag.startX + 8, y: drag.startY });
        box.parentNode.appendChild(hint);
        box.classList.add('dragging');
      }
      const main = box.parentNode, mr = main.getBoundingClientRect(), dock = document.getElementById('nd-dock');
      const vpRight = (dock && dock.offsetParent ? dock.getBoundingClientRect().left : mr.right) - mr.left;
      let x = e.clientX - mr.left - drag.ox, y = e.clientY - mr.top - drag.oy;
      const w = box.offsetWidth, hgt = box.offsetHeight;
      // magnet to the edges of the canvas area
      if (Math.abs(y) < 14) y = 0;
      if (Math.abs(main.clientHeight - (y + hgt)) < 14) y = main.clientHeight - hgt;
      x = U.clamp(x, 0, Math.max(0, main.clientWidth - w)); y = U.clamp(y, 0, Math.max(0, main.clientHeight - 40));
      box.style.left = x + 'px'; box.style.top = y + 'px';
      const px = e.clientX - mr.left;
      zone = px < 40 ? 'left' : Math.abs(px - vpRight) < 40 ? 'right' : null;
      hint.className = 'nd-tb-snap' + (zone ? ' show ' + zone : '');
      if (zone === 'right') hint.style.left = vpRight - 56 + 'px'; else hint.style.left = '';
    });
    const end = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      box.classList.remove('dragging');
      hint.remove();
      if (!moved) return;
      if (zone) { T.setToolboxMode(zone); App.toast('Tool panel docked on the ' + zone); } else T.setToolboxMode('float', { x: parseFloat(box.style.left) || 0, y: parseFloat(box.style.top) || 0 });
      zone = null;
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }

  /* ---------------- options bar ---------------- */
  let optEl, controls = [];
  T.buildOptions = function (el) {
    optEl = el;
    App.on('tool', render);
    App.on('transform', () => { if (App.state.tool === 'transform') render(); });
    App.on('crop', () => { if (App.state.tool === 'crop') render(); });
    App.on('textstart', render); App.on('textend', render);
    App.on('liquify', () => { if (App.state.tool === 'liquify') render(); });
    App.on('gradients', () => { if (App.state.tool === 'gradient') render(); });
    App.on('brush', () => controls.forEach((c) => c.refresh && c.refresh()));
    App.on('colour', () => controls.forEach((c) => c.refresh && c.refresh()));
    App.on('stamps', () => { if (App.state.tool === 'stamp') render(); });
    App.on('patterns', () => { if (App.state.tool === 'fill') render(); });
    App.on('state', () => controls.forEach((c) => c.refresh && c.refresh()));
    render();
  };
  function add(...cs) { cs.forEach((c) => { if (!c) return; optEl.appendChild(c); controls.push(c); }); }
  const S = () => App.state;
  const brushSlider = (label, key, min, max, o) => C.slider(label, Object.assign({ min, max, get: () => S().brush[key], set: (v) => App.setBrush({ [key]: v }) }, o || {}));
  const pct = { fmt: (v) => Math.round(v * 100), toValue: (v) => v / 100, unit: '%' };
  const stateSlider = (label, key, min, max, o) => C.slider(label, Object.assign({ min, max, get: () => S()[key], set: (v) => App.set(key, v) }, o || {}));
  const stateCheck = (label, key, title) => C.check(label, () => S()[key], (v) => App.set(key, v), title);
  T.symmetryControls = function () {
    const sym = C.select('Mirror', [['none', 'Off'], ['v', 'Vertical'], ['h', 'Horizontal'], ['both', 'Quad (4-way)'], ['radial', 'Radial'], ['kaleido', 'Kaleidoscope']], () => S().brush.symmetry, (v) => { App.setBrush({ symmetry: v }); render(); }, 'Symmetry painting');
    const cnt = (S().brush.symmetry === 'radial' || S().brush.symmetry === 'kaleido') ? C.slider('Segments', { min: 2, max: 24, get: () => S().brush.symCount, set: (v) => App.setBrush({ symCount: Math.round(v) }) }) : null;
    return [sym, cnt];
  };

  function render() {
    U.clear(optEl);
    controls = [];
    const s = S(), tool = s.tool;
    const T0 = App.TOOLS.find((t) => t.id === tool);
    optEl.appendChild(h('span.nd-opt-title', ND.icon(T0 ? T0.icon : 'brush', 16), h('span', s.eraserMode && tool === 'brush' ? 'Eraser' : T0 ? T0.label.replace(/ \(.*$/, '') : '')));
    if (App.isBrushTool(tool)) {
      const chip = h('button.nd-chip', { title: 'Current brush preset — click to browse' });
      chip.refresh = () => { chip.textContent = S().eraserMode && S().tool === 'brush' ? 'Eraser · ' + S().brushName : S().brushName; };
      chip.refresh();
      chip.addEventListener('click', () => { const p = document.querySelector('.nd-presets'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
      add(chip);
      add(brushSlider('Size', 'size', 1, 1000, { log: true, unit: 'px', fmt: (v) => (v < 10 ? v.toFixed(1) : Math.round(v)) }));
      add(brushSlider('Opacity', 'opacity', 0.01, 1, Object.assign({ step: 0.01 }, pct)));
      add(brushSlider('Flow', 'flow', 0.01, 1, Object.assign({ step: 0.01 }, pct)));
      add(brushSlider('Smoothing', 'stabilizer', 0, 0.98, Object.assign({ step: 0.01 }, pct)));
      if (!ND.Brush.DIRECT[s.brush.engine]) add(C.select('Blend', ND.Blend.MODES.map((m) => ({ value: m.id, label: m.label, group: m.cat })), () => s.brush.blend, (v) => App.setBrush({ blend: v })));
      add(...T.symmetryControls());
      if (tool === 'brush') {
        const er = C.button('Eraser', () => App.setEraser(!S().eraserMode), { icon: 'eraser', title: 'Erase with this brush (E)' });
        er.refresh = () => er.classList.toggle('active', S().eraserMode);
        er.refresh();
        add(er);
      }
      if (tool === 'clone' || s.brush.engine === 'clone') add(C.hint('Ctrl/Alt+click sets the source'));
      else if (tool === 'brush') add(C.hint('Shift+drag: size · Shift+click: straight line · Ctrl/Alt+click: pick colour'));
    } else if (tool === 'line') {
      add(stateCheck('Draw with brush', 'lineUseBrush', 'Render the line with the current brush (textures, watercolour…)'));
      add(brushSlider('Width', 'size', 1, 500, { log: true, unit: 'px', fmt: (v) => Math.round(v) }));
      add(brushSlider('Opacity', 'opacity', 0.01, 1, Object.assign({ step: 0.01 }, pct)));
      add(C.hint('Drag a line, bend it with the handles · Shift snaps 15° · Enter applies · Esc cancels'));
    } else if (tool === 'rect' || tool === 'ellipse' || tool === 'polygon') {
      add(stateCheck('Fill (FG)', 'shapeFill'), stateCheck('Outline', 'shapeStroke', 'Outline uses the background colour when fill is on'));
      add(stateSlider('Line', 'shapeWidth', 1, 200, { unit: 'px' }));
      if (tool === 'rect') add(stateSlider('Corners', 'shapeRadius', 0, 400, { unit: 'px' }));
      if (tool === 'polygon') { add(stateSlider('Sides', 'polySides', 3, 24)); add(stateCheck('Star', 'polyStar')); add(stateSlider('Inner', 'polyInner', 0.1, 0.95, Object.assign({ step: 0.01 }, pct))); }
      add(brushSlider('Opacity', 'opacity', 0.01, 1, Object.assign({ step: 0.01 }, pct)));
      add(C.hint(tool === 'polygon' ? 'Drag from the centre — the angle sets the rotation' : 'Shift: square/circle · Alt: from centre'));
    } else if (tool === 'fill') {
      add(C.segmented([['fg', 'Colour'], ['bg', 'Background'], ['pattern', 'Pattern']], () => S().fillWith, (v) => { App.set('fillWith', v); render(); }));
      if (s.fillWith === 'pattern') add(T.patternButton(), stateSlider('Scale', 'fillPatternScale', 0.25, 4, Object.assign({ step: 0.05 }, pct)));
      add(stateSlider('Tolerance', 'fillTolerance', 0, 255));
      add(stateCheck('Contiguous', 'fillContiguous'), stateCheck('Sample all layers', 'fillMerged', 'Use the merged image to find the area (great for line art on its own layer)'));
      add(stateSlider('Grow', 'fillExpand', 0, 8, { unit: 'px', title: 'Expand the filled area to hide anti-aliased halos' }));
      add(stateSlider('Close gaps', 'fillGap', 0, 12, { unit: 'px', title: 'Stop the fill leaking through small gaps in line art' }));
    } else if (tool === 'gradient') {
      add(C.segmented([['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Angle'], ['diamond', 'Diamond'], ['reflected', 'Reflected']], () => S().gradType, (v) => App.set('gradType', v)));
      const gsel = C.select('Colours', App.gradientOptions(), () => S().gradTo, (v) => { App.set('gradTo', v); sw.refresh(); });
      const sw = h('canvas.nd-gradsw', { width: 90, height: 14 });
      sw.refresh = () => { const c = ND.Render.gradientSwatch(S().gradTo, S().fg, S().bg, 90, 14); const x = sw.getContext('2d'); x.clearRect(0, 0, 90, 14); x.drawImage(c, 0, 0); };
      sw.refresh();
      add(gsel, sw, C.button('Edit…', () => ND.AdjustPanel.gradientEditor(S().gradTo), { cls: 'sm', title: 'Gradient editor — custom colour stops' }));
      add(C.select('Repeat', [['none', 'None'], ['repeat', 'Repeat'], ['mirror', 'Mirror']], () => S().gradRepeat, (v) => App.set('gradRepeat', v)));
      add(stateCheck('Reverse', 'gradReverse'), stateCheck('Dither', 'gradDither', 'Adds subtle noise to prevent banding'));
      add(stateSlider('Opacity', 'gradOpacity', 0.01, 1, Object.assign({ step: 0.01 }, pct)));
    } else if (tool === 'heal') {
      add(stateSlider('Size', 'healSize', 4, 600, { log: true, unit: 'px', fmt: (v) => Math.round(v) }));
      add(stateCheck('Sample all layers', 'healMerged', 'Take texture from the merged image (heal on an empty layer above)'));
      add(C.hint('Paint over a blemish or object — it is replaced with matching texture from nearby when you let go'));
    } else if (tool === 'patch') {
      add(stateCheck('Sample all layers', 'healMerged'));
      add(C.button('Content-aware fill', () => App.healSelection(null), { cls: 'primary', title: 'Fill the selection automatically from its surroundings' }));
      add(C.hint('Drag a loop around the spot, then drag it onto good texture — or click Content-aware fill'));
    } else if (tool === 'redeye') {
      add(stateSlider('Pupil size', 'redeyeSize', 6, 300, { unit: 'px' }));
      add(C.hint('Click on each red pupil'));
    } else if (tool === 'liquify') {
      add(C.segmented([['push', 'Push'], ['bloat', 'Bloat'], ['pinch', 'Pinch'], ['twirl', 'Twirl ↻'], ['twirlccw', 'Twirl ↺'], ['smooth', 'Smooth'], ['reconstruct', 'Restore']], () => S().liqMode, (v) => App.set('liqMode', v)));
      add(stateSlider('Size', 'liqSize', 10, 1000, { log: true, unit: 'px', fmt: (v) => Math.round(v) }));
      add(stateSlider('Strength', 'liqStrength', 0.02, 1, Object.assign({ step: 0.01 }, pct)));
      if (ND.View.liq) add(C.button('Apply', () => ND.Tools2.applyLiquify(), { cls: 'primary', title: 'Enter' }), C.button('Reset', () => ND.View.liq.reset()), C.button('Cancel', () => ND.Tools2.cancelLiquify(), { title: 'Esc' }));
      else add(C.hint('Drag to push pixels · hold still for bloat, pinch and twirl · Enter applies'));
    } else if (tool === 'assist') {
      add(C.segmented([['vp', 'Vanishing point'], ['parallel', 'Parallel lines'], ['ruler', 'Straight ruler']], () => S().assistType, (v) => App.set('assistType', v)));
      add(C.button('1-point', () => ND.Tools2.addPerspective(1), { cls: 'sm' }), C.button('2-point', () => ND.Tools2.addPerspective(2), { cls: 'sm' }), C.button('3-point', () => ND.Tools2.addPerspective(3), { cls: 'sm' }), C.button('Remove all', () => ND.Tools2.clearAssistants(), { cls: 'sm', title: 'Delete every perspective guide' }));
      add(stateCheck('Snap brush strokes', 'snapAssist', 'Strokes follow the closest perspective line'));
      add(C.hint('Click to add · drag handles to move · Alt+click a handle to delete'));
    } else if (tool === 'text') {
      T.textOptions(add);
    } else if (tool === 'stamp') {
      T.stampOptions(add);
    } else if (tool === 'smartsel') {
      add(C.segmented([['add', 'Add'], ['subtract', 'Subtract']], () => (S().selMode === 'subtract' ? 'subtract' : 'add'), (v) => App.set('selMode', v)));
      add(stateSlider('Size', 'smartSize', 4, 400, { log: true, unit: 'px', fmt: (v) => Math.round(v) }));
      add(stateCheck('Sample all layers', 'wandMerged'));
      add(stateCheck('AI objects', 'smartAI', 'Each stroke selects the whole object the AI finds under it (uses a downloaded AI model)'));
      add(C.button('AI subject', () => App.aiSelect(false), { icon: 'smartsel', title: 'Select the main subject with an AI model' }));
      add(C.button('Select subject', () => App.selectSubject(), { icon: 'smartsel', title: 'Find the main object automatically (quick, no AI)' }), C.button('Remove background with AI…', () => App.aiRemoveBackground(), { icon: 'removebg', title: 'Hide the background of the active layer with an AI mask' }), C.button('Select and Mask…', () => ND.SelectMask.open(), { title: 'Refine the edge — hair, fur, soft edges (Ctrl+Alt+R)' }));
      add(C.hint('Paint over the object — the selection snaps to its edges · Alt+paint removes'));
    } else if (App.SELECT_TOOLS.includes(tool)) {
      add(C.segmented([['replace', 'Replace'], ['add', 'Add'], ['subtract', 'Subtract'], ['intersect', 'Intersect']], () => S().selMode, (v) => App.set('selMode', v)));
      if (tool === 'sel-wand') { add(stateSlider('Tolerance', 'wandTolerance', 0, 255), stateCheck('Contiguous', 'wandContiguous', 'Off = select this colour everywhere'), stateCheck('Sample all layers', 'wandMerged')); }
      add(stateCheck('Anti-alias', 'selAntialias'), stateSlider('Feather', 'selFeather', 0, 100, { unit: 'px' }));
      add(C.hint(tool === 'sel-poly' ? 'Click points · double-click / Enter closes · Esc cancels' : 'Shift: add · Alt: subtract · Shift+Alt: intersect'));
    } else if (tool === 'move') {
      add(C.hint('Drag to move the layer (or the selected pixels) · Shift locks the axis · arrow keys nudge (Shift ×10)'));
    } else if (tool === 'transform') {
      const V = ND.View, t = V.xf;
      add(C.segmented([['free', 'Free'], ['warp', 'Warp'], ['distort', 'Distort']], () => (V.xf ? V.xf.mode : 'free'), (v) => { if (!V.xf) V.startTransform(); V.setTransformMode(v); }));
      add(C.button('Flip H', () => V.transformOp('flipH'), { title: 'Flip horizontally' }), C.button('Flip V', () => V.transformOp('flipV'), { title: 'Flip vertically' }));
      add(C.button('↻ 90°', () => V.transformOp('rot90')), C.button('↺ 90°', () => V.transformOp('rot-90')), C.button('Fit canvas', () => V.transformOp('fit')), C.button('Reset', () => V.transformOp('reset')));
      if (t && t.mode === 'free') add(h('span.nd-readout', Math.round(Math.abs(t.sx) * 100) + '% × ' + Math.round(Math.abs(t.sy) * 100) + '%  ' + Math.round(((t.rot * 180) / Math.PI) % 360) + '°'));
      add(C.button('Apply', () => V.applyTransform(), { cls: 'primary', title: 'Enter' }), C.button('Cancel', () => V.cancelTransform(), { title: 'Esc' }));
      add(C.hint('Corners scale (Shift = free aspect) · edges stretch · drag outside to rotate (Shift snaps)'));
    } else if (tool === 'crop') {
      add(C.select('Ratio', [['free', 'Free'], ['doc', 'Original'], ['1:1', '1:1'], ['4:3', '4:3'], ['3:2', '3:2'], ['16:9', '16:9'], ['9:16', '9:16'], ['3:4', '3:4'], ['2:3', '2:3']], () => S().cropRatio, (v) => App.set('cropRatio', v)));
      const c = ND.View.crop;
      if (c) { add(h('span.nd-readout', Math.round(c.w) + ' × ' + Math.round(c.h) + ' px')); add(C.button('Crop', () => ND.View.applyCrop(), { cls: 'primary', title: 'Enter' }), C.button('Cancel', () => ND.View.cancelCrop())); }
      add(C.button('Trim transparent', () => App.trim(), { title: 'Crop to the visible content' }), C.button('Crop to selection', () => App.cropToSelection()));
      add(C.hint('Drag a region, adjust the handles, then press Enter'));
    } else if (tool === 'eyedropper') {
      add(stateCheck('Sample all layers', 'pickMerged'), C.select('Average', [[1, 'Point'], [3, '3×3'], [5, '5×5'], [11, '11×11']], () => S().pickAverage, (v) => App.set('pickAverage', +v)));
      add(C.hint('Click or drag to sample · Alt+click sets the background colour · right-click samples from any tool'));
    } else if (tool === 'pan') add(C.hint('Drag to pan · Space+drag works with any tool · Shift+Space+drag rotates the view'));
    else if (tool === 'zoom') add(C.hint('Click to zoom in · Alt+click zooms out · drag left/right to scrub · Ctrl+wheel zooms anywhere'));
  }
  T.renderOptions = render;

  T.patternButton = function () {
    const b = h('button.nd-chip.pat', { title: 'Choose pattern' });
    b.refresh = () => { U.clear(b); b.appendChild(ND.Patterns.preview('tile', S().fillPattern, 18)); b.appendChild(h('span', S().fillPattern)); };
    b.refresh();
    b.addEventListener('click', () => {
      const grid = h('div.nd-patgrid');
      ND.Patterns.allTiles().forEach((t) => {
        const c = h('button.nd-pattile', { title: t.name + (t.mono ? ' (takes your colour)' : '') }, ND.Patterns.preview('tile', t.name, 44), h('span', t.name));
        if (t.name === S().fillPattern) c.classList.add('active');
        c.addEventListener('click', () => { App.set('fillPattern', t.name); b.refresh(); C.closePopover(); });
        grid.appendChild(c);
      });
      C.popover(b, h('div', h('div.nd-pop-title', 'Patterns'), grid, h('div.nd-pop-foot', C.button('Define from selection', () => { C.closePopover(); App.patternFromSelection(false); }), C.button('Define (colourable)', () => { C.closePopover(); App.patternFromSelection(true); }))), { cls: 'wide' });
    });
    return b;
  };

  T.textOptions = function (add) {
    const t = S().text, set = (k, v) => { t[k] = v; if (ND.View.text) ND.View.text[k] = v; ND.View.request(); App.savePrefsSoon(); };
    const FONTS = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Georgia', 'Times New Roman', 'Garamond', 'Courier New', 'Consolas', 'Impact', 'Comic Sans MS', 'Brush Script MT', 'Papyrus', 'Copperplate', 'Palatino Linotype', 'Lucida Console', 'system-ui'];
    add(C.select('Font', FONTS.map((f) => [f, f]), () => t.font, (v) => set('font', v)));
    add(C.slider('Size', { min: 6, max: 600, log: true, get: () => t.size, set: (v) => set('size', Math.round(v)), unit: 'px', fmt: (v) => Math.round(v) }));
    const bi = C.segmented([['b', 'B', 'Bold'], ['i', 'I', 'Italic']], () => '', () => {});
    bi.querySelectorAll('button').forEach((b) => {
      const k = b.dataset.v === 'b' ? 'bold' : 'italic';
      b.classList.toggle('active', !!t[k]);
      b.addEventListener('click', () => { set(k, !t[k]); b.classList.toggle('active', !!t[k]); });
    });
    bi.refresh = () => {};
    add(bi);
    add(C.segmented([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], () => t.align, (v) => set('align', v)));
    add(C.slider('Spacing', { min: -10, max: 60, get: () => t.spacing, set: (v) => set('spacing', v), unit: 'px' }));
    add(C.slider('Outline', { min: 0, max: 40, get: () => t.outline, set: (v) => set('outline', v), unit: 'px' }), C.colourInput(() => t.outlineColour, (v) => set('outlineColour', v), 'Outline colour'));
    add(C.check('Shadow', () => t.shadow, (v) => set('shadow', v)));
    add(C.select('Warp', [['none', 'None'], ['arc', 'Arc'], ['wave', 'Wave']], () => t.warp, (v) => set('warp', v)), C.slider('Amount', { min: -100, max: 100, get: () => t.amount, set: (v) => set('amount', v) }));
    add(C.check('New layer', () => t.newLayer, (v) => set('newLayer', v), 'Put the text on its own layer'));
    if (ND.View.text) {
      add(C.button('Place text', () => ND.View.commitText(), { cls: 'primary', title: 'Ctrl+Enter' }), C.button('Cancel', () => ND.View.cancelText()));
    } else add(C.hint('Click the canvas to start typing'));
  };

  T.stampOptions = function (add) {
    const s = S();
    const pick = h('button.nd-chip.stamp', { title: 'Choose a stamp (or click the Stamp tool again)' });
    pick.refresh = () => { U.clear(pick); const c = ND.Stamps.render(s.stamp, 22, s.stampMode, s.fg); if (c) { const cc = U.canvas(22, 22); U.ctx(cc).drawImage(c, 0, 0, 22, 22); pick.appendChild(cc); } pick.appendChild(h('span', s.stamp)); };
    pick.refresh();
    pick.addEventListener('click', () => App.emit('pickstamp'));
    add(pick);
    add(stateSlider('Size', 'stampSize', 8, 2000, { log: true, unit: 'px', fmt: (v) => Math.round(v) }));
    add(stateSlider('Rotation', 'stampRot', -180, 180, { unit: '°' }));
    add(stateSlider('Random', 'stampRandom', 0, 1, Object.assign({ step: 0.01 }, pct)));
    add(C.select('Colour', [['original', 'Original'], ['tint', 'Tint with FG'], ['silhouette', 'Silhouette (FG)']], () => S().stampMode, (v) => { App.set('stampMode', v); pick.refresh(); }));
    add(stateSlider('Opacity', 'stampOpacity', 0.01, 1, Object.assign({ step: 0.01 }, pct)));
    add(stateCheck('Paint with stamps', 'stampPaint', 'Drag to lay a trail of stamps'));
    if (s.stampPaint) add(stateSlider('Spacing', 'stampSpacing', 0.1, 4, Object.assign({ step: 0.05 }, pct)));
    add(C.hint(s.stampPaint ? 'Drag to paint stamps' : 'Click to place · drag to size & rotate'));
  };

  /* ---------------- status bar ---------------- */
  T.buildStatus = function (el) {
    const size = h('span.nd-st-size'), pos = h('span.nd-st-pos'), msg = h('span.nd-st-msg'), mem = h('span.nd-st-mem');
    const zoom = h('input.nd-zoom', { type: 'text', title: 'Zoom % — type a value' });
    zoom.addEventListener('change', () => { const v = parseFloat(zoom.value); if (v > 0) App.setView({ zoom: U.clamp(v / 100, 0.02, 64) }); });
    zoom.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') zoom.blur(); });
    const rot = h('button.nd-btn.sm', { title: 'View rotation — click to reset (5)' });
    rot.addEventListener('click', () => App.setView({ rot: 0 }));
    const mir = C.iconButton('mirror', 'Mirror view (M)', () => App.setView({ mirror: !App.state.view.mirror }), 'tiny');
    el.append(size, C.iconButton('minus', 'Zoom out', () => App.zoomBy(1 / 1.25), 'tiny'), zoom, h('span', '%'), C.iconButton('plus', 'Zoom in', () => App.zoomBy(1.25), 'tiny'),
      C.button('Fit', () => App.fitView(), { cls: 'sm', title: 'Fit to view (1)' }), C.button('100%', () => App.setView({ zoom: 1 }), { cls: 'sm', title: 'Actual pixels (2)' }), rot, mir, msg, mem, pos);
    const refresh = () => {
      const d = App.doc, v = App.state.view;
      if (!d) return;
      size.textContent = d.width + ' × ' + d.height;
      if (document.activeElement !== zoom) zoom.value = Math.round(v.zoom * 1000) / 10;
      rot.textContent = '⟳ ' + Math.round((((v.rot * 180) / Math.PI) % 360 + 360) % 360) + '°';
      mir.classList.toggle('active', v.mirror);
    };
    App.on('view', refresh); App.on('docchange', refresh); App.on('doc', (t) => { if (t === 'resize') refresh(); });
    App.on('cursor', (c) => { pos.textContent = Math.round(c.x) + ', ' + Math.round(c.y); });
    App.on('status', (m) => { msg.textContent = m || ''; });
    const memT = () => { const d = App.doc; if (!d) return; mem.textContent = 'Undo ' + U.fmtBytes(d.history.bytes()) + (App.lastAutosave ? ' · autosaved ' + new Date(App.lastAutosave).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''); };
    App.on('doc', U.debounce(memT, 300)); App.on('autosaved', memT);
    refresh();
  };

  ND.Toolbar = T;
})();
