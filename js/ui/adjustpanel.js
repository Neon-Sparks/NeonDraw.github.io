/* Neon Draw — Adjustments & Properties docker, curves / levels editors, layer style dialog, gradient editor. */
'use strict';
(function () {
  const U = ND.U, h = U.h, C = ND.C, App = ND.App;
  const P = {};

  /* ---------------- docker ---------------- */
  P.build = function (root) {
    const grid = h('div.nd-adjgrid');
    ND.Adjust.KINDS.forEach((k) => {
      const b = h('button.nd-adjbtn', { type: 'button', title: (k.fill ? 'New fill layer: ' : 'New adjustment layer: ') + k.label }, h('span.nd-adjic', k.icon), h('span', k.label.replace(' (photo)', '')));
      b.addEventListener('click', () => App.addAdjustment(k.id));
      grid.appendChild(b);
    });
    root.appendChild(C.section('adjustments', 'Adjustments', h('div', grid, h('div.nd-hint', 'Adjustment layers change everything below them and stay editable. Paint black on their mask to hide the effect.'))));
    const props = h('div.nd-props');
    root.appendChild(C.section('properties', 'Properties', props));
    let internal = false;
    const render = () => {
      const d = App.doc;
      if (!d) return;
      const n = d.active;
      U.clear(props);
      if (!n) return;
      props.appendChild(h('div.nd-props-head', n.isAdjust ? h('span.nd-adjic', ND.Adjust.find(n.kind).icon) : ND.icon(n.isGroup ? 'folder' : 'image', 16), h('b', n.name)));
      if (n.isAdjust) props.appendChild(P.editor(n, () => { internal = true; setTimeout(() => { internal = false; }, 0); }));
      else props.appendChild(h('div.nd-hint', n.isGroup ? 'Group' : n.textData ? 'Text layer — click it with the Text tool to edit the words.' : 'Paint layer'));
      const row = h('div.nd-row.tight');
      row.appendChild(n.mask ? C.button('Edit mask', () => { d.setEditMask(!d.editMask); render(); }, { cls: 'sm' + (d.editMask ? ' active' : ''), icon: 'mask' }) : C.button('Add mask', () => App.addMaskSmart(), { cls: 'sm', icon: 'mask', title: 'Add a layer mask (from the selection if there is one)' }));
      if (!n.isAdjust || ND.Adjust.isFill(n.kind)) row.appendChild(C.button('Layer style', () => P.layerStyle(n), { cls: 'sm', icon: 'fx' }));
      props.appendChild(row);
      if (n.mask) {
        props.appendChild(h('div.nd-row.tight',
          C.button('Invert', () => d.invertMask(), { cls: 'sm' }),
          C.button(n.maskEnabled ? 'Disable' : 'Enable', () => d.setProps(n, { maskEnabled: !n.maskEnabled }, 'Toggle Mask'), { cls: 'sm' }),
          n.isPixel ? C.button('Apply', () => d.applyMask(), { cls: 'sm', title: 'Bake the mask into the layer' }) : null,
          C.button('Delete', () => d.deleteMask(), { cls: 'sm' })));
      }
    };
    App.on('doc', (t) => {
      if (internal) return;
      // never rebuild under a slider that is being dragged; catch up when it's released
      if (t === 'active' || t === 'history' || t === 'resize' || t === 'layers') C.whenFree(props, render);
    });
    App.on('docchange', render);
    App.on('adjust', render);
    render();
  };

  /* ---------------- adjustment parameter editors ---------------- */
  // Returns an element editing node.params; calls mark() before each change so the panel doesn't rebuild under the user.
  P.editor = function (n, mark) {
    const d = App.doc, k = ND.Adjust.find(n.kind), box = h('div.nd-adjedit');
    const commit = (patch) => { mark(); d.setProps(n, { params: Object.assign({}, n.params, patch) }, k.label); };
    const plain = (k.params || []).map((q) => {
      if (q.type === 'check') return C.check(q.label, () => n.params[q.key], (v) => commit({ [q.key]: v ? 1 : 0 }));
      if (q.type === 'colour') return h('label.nd-select', h('span.nd-lbl', q.label), C.colourInput(() => n.params[q.key], (v) => commit({ [q.key]: v })));
      return C.slider(q.label, { min: q.min, max: q.max, step: q.step, get: () => n.params[q.key], set: (v) => commit({ [q.key]: v }), wide: true });
    });
    if (k.custom === 'curves') box.appendChild(P.curvesEditor(n, commit));
    else if (k.custom === 'levels') box.appendChild(P.levelsEditor(n, commit));
    else if (k.custom === 'tones') {
      let tone = 'mid';
      const sl = h('div');
      const draw = () => {
        U.clear(sl);
        [['r', 'Cyan ↔ Red'], ['g', 'Magenta ↔ Green'], ['b', 'Yellow ↔ Blue']].forEach(([c, label]) => sl.appendChild(C.slider(label, { min: -100, max: 100, get: () => n.params[tone][c], set: (v) => commit({ [tone]: Object.assign({}, n.params[tone], { [c]: v }) }), wide: true })));
      };
      box.append(C.segmented([['sh', 'Shadows'], ['mid', 'Midtones'], ['hi', 'Highlights']], () => tone, (v) => { tone = v; draw(); }), sl, C.check('Preserve luminosity', () => n.params.keepLum, (v) => commit({ keepLum: v ? 1 : 0 })));
      draw();
    } else if (k.custom === 'selective') {
      let range = 'reds';
      const sl = h('div');
      const draw = () => {
        U.clear(sl);
        [['c', 'Cyan'], ['m', 'Magenta'], ['y', 'Yellow'], ['k', 'Black']].forEach(([c, label]) => sl.appendChild(C.slider(label, { min: -100, max: 100, get: () => n.params[range][c], set: (v) => commit({ [range]: Object.assign({}, n.params[range], { [c]: v }) }), unit: '%', wide: true })));
      };
      box.append(C.select('Colours', ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks'].map((r) => [r, r[0].toUpperCase() + r.slice(1)]), () => range, (v) => { range = v; draw(); }), sl);
      draw();
    } else if (k.custom === 'gradient') {
      const sw = h('canvas.nd-gradsw.wide', { width: 240, height: 16 });
      const ref = () => { const c = ND.Render.gradientSwatch(n.params.to, n.params.fg, n.params.bg, 240, 16); const x = sw.getContext('2d'); x.clearRect(0, 0, 240, 16); x.drawImage(c, 0, 0); };
      ref();
      box.append(sw,
        C.select('Gradient', App.gradientOptions(), () => n.params.to, (v) => { commit({ to: v }); ref(); }),
        h('div.nd-row.tight', h('span.nd-lbl', 'Colours'), C.colourInput(() => n.params.fg, (v) => { commit({ fg: v }); ref(); }, 'Start colour'), C.colourInput(() => n.params.bg, (v) => { commit({ bg: v }); ref(); }, 'End colour'),
          C.check('Reverse', () => n.params.reverse, (v) => { commit({ reverse: v ? 1 : 0 }); ref(); }), C.button('Edit…', () => P.gradientEditor(n.params.to, (name) => { commit({ to: 'custom:' + name }); ref(); }), { cls: 'sm' })));
      if (n.kind === 'gradientfill') {
        box.append(C.select('Style', [['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Angle'], ['diamond', 'Diamond'], ['reflected', 'Reflected']], () => n.params.type, (v) => commit({ type: v })),
          C.slider('Angle', { min: 0, max: 360, get: () => n.params.angle, set: (v) => commit({ angle: v }), unit: '°', wide: true }),
          C.slider('Scale', { min: 10, max: 300, get: () => n.params.scale, set: (v) => commit({ scale: v }), unit: '%', wide: true }));
      }
    } else if (k.custom === 'develop') {
      const groups = [['White balance', ['temp', 'tint']], ['Tone', ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks']], ['Presence', ['clarity', 'dehaze', 'vibrance', 'saturation']], ['Effects', ['sharpen', 'vignette', 'grain']]];
      box.appendChild(h('div.nd-row.tight', C.button('Auto tone', () => { mark(); App.autoDevelop(); setTimeout(() => App.emit('adjust'), 0); }, { cls: 'sm primary', title: 'Analyse the image and set exposure, white balance and range' }),
        C.button('Reset', () => { mark(); d.setProps(n, { params: ND.Adjust.defaults('develop') }, 'Reset Develop'); setTimeout(() => App.emit('adjust'), 0); }, { cls: 'sm' })));
      for (const [title, keys] of groups) {
        box.appendChild(h('div.nd-mini-title', title));
        keys.forEach((key) => { const i = k.params.findIndex((q) => q.key === key); box.appendChild(plain[i]); });
      }
      return box;
    }
    plain.forEach((c) => box.appendChild(c));
    if (!plain.length && !k.custom) box.appendChild(h('div.nd-hint', 'No settings — use opacity and the mask to control it.'));
    return box;
  };

  // Histogram of what lies below an adjustment layer.
  function histBelow(n) {
    const d = App.doc, vis = n.visible;
    n.visible = false; d.invalidateAll();
    const H = ND.Adjust.histogram(d.getProjection());
    n.visible = vis; d.invalidateAll();
    return H;
  }
  function drawHist(x, H, ch, W, Hh) {
    const arr = ch === 'r' ? H.r : ch === 'g' ? H.g : ch === 'b' ? H.b : H.l;
    let mx = 1;
    for (let i = 2; i < 254; i++) mx = Math.max(mx, arr[i]);
    x.fillStyle = ch === 'r' ? 'rgba(255,90,90,0.35)' : ch === 'g' ? 'rgba(90,220,120,0.35)' : ch === 'b' ? 'rgba(90,150,255,0.4)' : 'rgba(200,205,215,0.28)';
    for (let i = 0; i < 256; i++) { const v = Math.min(1, arr[i] / mx) * Hh; x.fillRect((i / 255) * W, Hh - v, W / 256 + 0.6, v); }
  }

  P.curvesEditor = function (n, commit) {
    const S = 240, cv = h('canvas.nd-curves', { width: S, height: S });
    let ch = 'rgb', drag = -1;
    const H = histBelow(n);
    const pts = () => n.params[ch].map((p) => p.slice());
    const toPx = (p) => ({ x: (p[0] / 255) * S, y: S - (p[1] / 255) * S });
    const draw = () => {
      const x = cv.getContext('2d');
      x.fillStyle = '#16171b'; x.fillRect(0, 0, S, S);
      drawHist(x, H, ch === 'rgb' ? 'l' : ch, S, S);
      x.strokeStyle = 'rgba(255,255,255,0.08)'; x.beginPath();
      for (let i = 1; i < 4; i++) { x.moveTo((i * S) / 4, 0); x.lineTo((i * S) / 4, S); x.moveTo(0, (i * S) / 4); x.lineTo(S, (i * S) / 4); }
      x.moveTo(0, S); x.lineTo(S, 0); x.stroke();
      const lut = ND.Adjust.curveLUT(n.params[ch]);
      x.strokeStyle = ch === 'r' ? '#ff6b6b' : ch === 'g' ? '#6fdc8c' : ch === 'b' ? '#6db3ff' : '#fff'; x.lineWidth = 2; x.beginPath();
      for (let i = 0; i < 256; i++) { const px = (i / 255) * S, py = S - (lut[i] / 255) * S; i ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.stroke();
      n.params[ch].forEach((p) => { const q = toPx(p); x.beginPath(); x.arc(q.x, q.y, 5, 0, U.TAU); x.fillStyle = '#16171b'; x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke(); });
    };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: U.clamp(((e.clientX - r.left) / r.width) * 255, 0, 255), y: U.clamp((1 - (e.clientY - r.top) / r.height) * 255, 0, 255), outside: e.clientX < r.left - 20 || e.clientX > r.right + 20 || e.clientY < r.top - 20 || e.clientY > r.bottom + 20 }; };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const q = pos(e), list = pts();
      drag = list.findIndex((p) => Math.hypot((p[0] - q.x) * (S / 255), (p[1] - q.y) * (S / 255)) < 9);
      if (drag < 0) { list.push([Math.round(q.x), Math.round(q.y)]); list.sort((a, b) => a[0] - b[0]); drag = list.findIndex((p) => p[0] === Math.round(q.x) && p[1] === Math.round(q.y)); commit({ [ch]: list }); draw(); }
    });
    cv.addEventListener('pointermove', (e) => {
      if (drag < 0) return;
      const q = pos(e), list = pts(), last = list.length - 1;
      if (q.outside && drag > 0 && drag < last) { list.splice(drag, 1); drag = -1; commit({ [ch]: list }); draw(); return; }
      const lo = drag > 0 ? list[drag - 1][0] + 1 : 0, hi = drag < last ? list[drag + 1][0] - 1 : 255;
      list[drag] = [Math.round(U.clamp(q.x, lo, hi)), Math.round(q.y)];
      commit({ [ch]: list }); draw();
    });
    cv.addEventListener('pointerup', () => { drag = -1; });
    cv.addEventListener('dblclick', () => { commit({ [ch]: [[0, 0], [255, 255]] }); draw(); });
    const seg = C.segmented([['rgb', 'RGB'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']], () => ch, (v) => { ch = v; draw(); });
    const presets = C.select(null, [['', 'Presets…'], ['contrast', 'More contrast'], ['soft', 'Less contrast'], ['bright', 'Brighten'], ['dark', 'Darken'], ['fade', 'Faded film'], ['invert', 'Invert'], ['reset', 'Reset all']], () => '', (v) => {
      const map = { contrast: [[0, 0], [64, 48], [192, 210], [255, 255]], soft: [[0, 20], [128, 128], [255, 235]], bright: [[0, 0], [110, 150], [255, 255]], dark: [[0, 0], [150, 110], [255, 255]], fade: [[0, 30], [128, 132], [255, 235]], invert: [[0, 255], [255, 0]] };
      if (v === 'reset') commit(ND.Adjust.defaults('curves'));
      else if (map[v]) commit({ rgb: map[v] });
      presets.sel.value = '';
      draw();
    });
    draw();
    return h('div', h('div.nd-row.tight', seg, presets), cv, h('div.nd-hint', 'Click to add points, drag to shape, drag a point off the graph to remove it, double-click to reset this channel.'));
  };

  P.levelsEditor = function (n, commit) {
    let ch = 'rgb';
    const S = 240, cv = h('canvas.nd-curves.short', { width: S, height: 90 }), H = histBelow(n), sliders = h('div');
    const draw = () => {
      const x = cv.getContext('2d'), l = n.params[ch];
      x.fillStyle = '#16171b'; x.fillRect(0, 0, S, 90);
      drawHist(x, H, ch === 'rgb' ? 'l' : ch, S, 90);
      x.fillStyle = 'rgba(0,0,0,0.45)';
      x.fillRect(0, 0, (l.ib / 255) * S, 90); x.fillRect((l.iw / 255) * S, 0, S, 90);
    };
    const setL = (patch) => { commit({ [ch]: Object.assign({}, n.params[ch], patch) }); draw(); };
    const drawSl = () => {
      U.clear(sliders);
      const l = () => n.params[ch];
      sliders.append(C.slider('Input black', { min: 0, max: 253, get: () => l().ib, set: (v) => setL({ ib: Math.min(v, l().iw - 2) }), wide: true }),
        C.slider('Midtones', { min: 0.1, max: 4, step: 0.01, get: () => l().g, set: (v) => setL({ g: v }), wide: true }),
        C.slider('Input white', { min: 2, max: 255, get: () => l().iw, set: (v) => setL({ iw: Math.max(v, l().ib + 2) }), wide: true }),
        C.slider('Output black', { min: 0, max: 255, get: () => l().ob, set: (v) => setL({ ob: v }), wide: true }),
        C.slider('Output white', { min: 0, max: 255, get: () => l().ow, set: (v) => setL({ ow: v }), wide: true }));
    };
    const auto = C.button('Auto', () => {
      const arr = H.l, tot = arr.reduce((a, b) => a + b, 0) || 1;
      let s = 0, lo = 0, hi = 255;
      for (let i = 0; i < 256; i++) { s += arr[i]; if (s > tot * 0.004) { lo = i; break; } }
      s = 0;
      for (let i = 255; i >= 0; i--) { s += arr[i]; if (s > tot * 0.004) { hi = i; break; } }
      ch = 'rgb'; seg.refresh();
      setL({ ib: lo, iw: Math.max(lo + 2, hi), g: 1 });
      drawSl();
    }, { cls: 'sm' });
    const seg = C.segmented([['rgb', 'RGB'], ['r', 'R'], ['g', 'G'], ['b', 'B']], () => ch, (v) => { ch = v; draw(); drawSl(); });
    draw(); drawSl();
    return h('div', h('div.nd-row.tight', seg, auto), cv, sliders);
  };

  /* ---------------- layer style dialog ---------------- */
  P.layerStyle = function (n) {
    const d = App.doc, original = n.effects ? JSON.parse(JSON.stringify(n.effects)) : null;
    let fx = ND.Effects.normalise(n.effects);
    const apply = () => { n.effects = JSON.parse(JSON.stringify(fx)); d.invalidateAll(); ND.View.request(); };
    const sec = (key, title, kids) => {
      const on = C.check(title, () => fx[key].on, (v) => { fx[key].on = v; apply(); });
      return h('div.nd-fxsec', on, h('div.nd-fxbody', ...kids));
    };
    const sl = (key, prop, label, min, max, o) => C.slider(label, Object.assign({ min, max, get: () => fx[key][prop], set: (v) => { fx[key][prop] = v; fx[key].on = true; apply(); }, wide: true }, o || {}));
    const col = (key, prop, label) => h('label.nd-select', h('span.nd-lbl', label), C.colourInput(() => fx[key][prop], (v) => { fx[key][prop] = v; fx[key].on = true; apply(); }));
    const pct = { step: 0.01, fmt: (v) => Math.round(v * 100), toValue: (v) => v / 100, unit: '%' };
    const body = h('div.nd-fxdialog',
      sec('shadow', 'Drop shadow', [col('shadow', 'color', 'Colour'), sl('shadow', 'opacity', 'Opacity', 0, 1, pct), sl('shadow', 'angle', 'Angle', 0, 360, { unit: '°' }), sl('shadow', 'distance', 'Distance', 0, 200, { unit: 'px' }), sl('shadow', 'size', 'Size', 0, 120, { unit: 'px' })]),
      sec('glow', 'Outer glow', [col('glow', 'color', 'Colour'), sl('glow', 'opacity', 'Opacity', 0, 1, pct), sl('glow', 'size', 'Size', 1, 150, { unit: 'px' }), sl('glow', 'spread', 'Spread', 0, 1, pct)]),
      sec('stroke', 'Stroke', [col('stroke', 'color', 'Colour'), sl('stroke', 'size', 'Size', 1, 80, { unit: 'px' }), sl('stroke', 'opacity', 'Opacity', 0, 1, pct),
        C.select('Position', [['outside', 'Outside'], ['center', 'Centre'], ['inside', 'Inside']], () => fx.stroke.position, (v) => { fx.stroke.position = v; fx.stroke.on = true; apply(); })]),
      sec('inner', 'Inner shadow', [col('inner', 'color', 'Colour'), sl('inner', 'opacity', 'Opacity', 0, 1, pct), sl('inner', 'angle', 'Angle', 0, 360, { unit: '°' }), sl('inner', 'distance', 'Distance', 0, 100, { unit: 'px' }), sl('inner', 'size', 'Size', 0, 80, { unit: 'px' })]),
      sec('bevel', 'Bevel & emboss', [sl('bevel', 'depth', 'Depth', 0.1, 1, pct), sl('bevel', 'size', 'Size', 1, 60, { unit: 'px' }), sl('bevel', 'angle', 'Light angle', 0, 360, { unit: '°' }), col('bevel', 'highlight', 'Highlight'), col('bevel', 'shadow', 'Shadow')]),
      sec('overlay', 'Colour overlay', [col('overlay', 'color', 'Colour'), sl('overlay', 'opacity', 'Opacity', 0, 1, pct)]));
    ND.Dialogs.modal('Layer style — ' + n.name, body, [
      { label: 'Clear all', action: () => { fx = ND.Effects.normalise(null); n.effects = original; d.setProps(n, { effects: null }, 'Clear Layer Style'); } },
      { label: 'Cancel', action: () => { n.effects = original; d.invalidateAll(); } },
      { label: 'OK', primary: true, action: () => { const next = ND.Effects.any(fx) ? JSON.parse(JSON.stringify(fx)) : null; n.effects = original; d.setProps(n, { effects: next }, 'Layer Style'); } },
    ], { wide: true, noFocus: true, onCancel: () => { n.effects = original; d.invalidateAll(); } });
  };

  /* ---------------- gradient editor ---------------- */
  P.gradientEditor = function (start, onSave) {
    const st = App.state;
    let stops = ND.Render.gradientStops(st.fg, st.bg, start || st.gradTo).map((s) => ({ p: s.p, c: U.normHex(s.c), a: s.a == null ? 1 : s.a }));
    let sel = 0;
    const W = 520, bar = h('canvas.nd-gradbar', { width: W, height: 40 }), marks = h('div.nd-gradmarks');
    const name = h('input.nd-field', { type: 'text', value: (start || '').startsWith('custom:') ? start.slice(7) : 'My gradient' });
    const colIn = C.colourInput(() => stops[sel].c, (v) => { stops[sel].c = v; draw(); });
    const alpha = C.slider('Opacity', { min: 0, max: 1, step: 0.01, get: () => stops[sel].a, set: (v) => { stops[sel].a = v; draw(); }, fmt: (v) => Math.round(v * 100), toValue: (v) => v / 100, unit: '%' });
    const posS = C.slider('Position', { min: 0, max: 1, step: 0.005, get: () => stops[sel].p, set: (v) => { stops[sel].p = v; draw(); }, fmt: (v) => Math.round(v * 100), toValue: (v) => v / 100, unit: '%' });
    const del = C.button('Delete stop', () => { if (stops.length > 2) { stops.splice(sel, 1); sel = 0; draw(); } }, { cls: 'sm' });
    function draw() {
      const x = bar.getContext('2d');
      for (let i = 0; i < W; i += 10) for (let j = 0; j < 40; j += 10) { x.fillStyle = ((i + j) / 10) % 2 ? '#3a3d42' : '#2e3136'; x.fillRect(i, j, 10, 10); }
      x.drawImage(ND.Render.gradientSwatch(stops, '#000', '#fff', W, 40), 0, 0);
      U.clear(marks);
      stops.forEach((s, i) => {
        const m = h('button.nd-gradmark' + (i === sel ? '.active' : ''), { style: { left: s.p * 100 + '%', background: s.c }, title: 'Drag to move · click to select' });
        m.addEventListener('pointerdown', (e) => {
          e.stopPropagation(); sel = i; m.setPointerCapture(e.pointerId);
          const mv = (ev) => { const r = marks.getBoundingClientRect(); stops[i].p = U.clamp((ev.clientX - r.left) / r.width, 0, 1); draw(); };
          const up = () => { m.removeEventListener('pointermove', mv); m.removeEventListener('pointerup', up); };
          m.addEventListener('pointermove', mv); m.addEventListener('pointerup', up);
          draw();
        });
        marks.appendChild(m);
      });
      colIn.refresh(); alpha.refresh(); posS.refresh();
    }
    marks.addEventListener('pointerdown', (e) => {
      const r = marks.getBoundingClientRect(), p = U.clamp((e.clientX - r.left) / r.width, 0, 1);
      const lut = ND.Render.gradientLUT('#000', '#fff', stops, false), k = Math.round(p * 1023) * 4;
      stops.push({ p, c: U.rgbToHex(lut[k], lut[k + 1], lut[k + 2]), a: lut[k + 3] / 255 });
      sel = stops.length - 1;
      draw();
    });
    const presetRow = h('div.nd-row.tight', h('span.nd-lbl', 'Start from'), C.select(null, App.gradientOptions(), () => '', (v) => { stops = ND.Render.gradientStops(st.fg, st.bg, v).map((s) => ({ p: s.p, c: U.normHex(s.c), a: s.a == null ? 1 : s.a })); sel = 0; draw(); }));
    draw();
    ND.Dialogs.modal('Gradient editor', h('div', presetRow, h('div.nd-gradwrap', bar, marks), h('div.nd-hint', 'Click under the bar to add a colour stop. Drag stops to move them.'),
      h('div.nd-row', h('span.nd-lbl', 'Stop colour'), colIn, del), alpha, posS, h('label.nd-field-row', h('span', 'Name'), name)), [
      { label: 'Delete saved', action: () => { if (name.value && ND.Render.customGradients[name.value]) App.deleteGradient(name.value); } },
      { label: 'Cancel' },
      { label: 'Save & use', primary: true, action: () => {
        const nm = (name.value || 'My gradient').trim();
        App.saveGradient(nm, stops.slice().sort((a, b) => a.p - b.p));
        if (onSave) onSave(nm); else { App.set('gradTo', 'custom:' + nm); ND.Toolbar.renderOptions(); }
      } },
    ], { wide: true, noFocus: true });
  };

  ND.AdjustPanel = P;
})();
