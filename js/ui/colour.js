/* Neon Draw — colour docker: square / wheel / slider pickers, recent colours and palettes. */
'use strict';
(function () {
  const U = ND.U, h = U.h, C = ND.C, App = ND.App;

  const PALETTES = {
    'Default': ['#000000', '#3d3d3d', '#7a7a7a', '#b8b8b8', '#ffffff', '#7a1c1c', '#d32f2f', '#ff7043', '#ffa726', '#ffd54f', '#fff59d', '#9ccc65', '#43a047', '#1b5e20', '#26a69a', '#00acc1', '#29b6f6', '#1e88e5', '#283593', '#5e35b1', '#8e24aa', '#d81b60', '#f48fb1', '#8d6e63', '#4e342e'],
    'Pastel': ['#ffd1dc', '#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff', '#d7baff', '#f3c4fb', '#c9f2e9', '#fbe7c6', '#b4f8c8', '#a0e7e5', '#ffaebc', '#e2f0cb', '#cdb4db', '#ffc8dd', '#bde0fe', '#a2d2ff'],
    'Skin Tones': ['#ffe0bd', '#ffd1aa', '#f1c27d', '#e0ac69', '#c68642', '#a1665e', '#8d5524', '#5c3a21', '#3b2219', '#f6d7c3', '#e8b4a0', '#d29a7f', '#b07a5d', '#7c4e36'],
    'Earth': ['#3e2723', '#5d4037', '#795548', '#8d6e63', '#a1887f', '#6b4f2e', '#8a3d1e', '#c99a2e', '#a88a44', '#556b2f', '#6b8e23', '#808000', '#2f4f4f', '#708090', '#c2b280', '#e0d8b0'],
    'Watercolour Pigments': ['#2a3f9e', '#0f3a6b', '#2a8fbd', '#2e7d6b', '#5b7f2e', '#c99a2e', '#f2c12e', '#e8742c', '#d63a2f', '#8e1c2e', '#b0306a', '#5b2a6e', '#8a3d1e', '#6b4f2e', '#3b4452', '#1d1d24'],
    'Neon': ['#ff00cc', '#ff3366', '#ff9900', '#ffee00', '#ccff00', '#33ff66', '#00ffcc', '#00ccff', '#3366ff', '#9933ff', '#ffffff', '#111111'],
    'Greys': ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888', '#999999', '#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd', '#eeeeee', '#ffffff'],
    'PICO-8': ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
    'Game Boy': ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    'Sky & Sea': ['#03045e', '#023e8a', '#0077b6', '#0096c7', '#00b4d8', '#48cae4', '#90e0ef', '#ade8f4', '#caf0f8', '#ffffff', '#f8c291', '#e58e73', '#b8505b', '#6a2c70'],
  };

  const { harmony, rybToHue, hueToRyb, RULES } = ND.Harmony;

  ND.ColourPanel = { build };
  App.palette = App.palette || 'Default';
  App.userPalettes = App.userPalettes || {};

  function allPalettes() { return Object.assign({}, PALETTES, App.userPalettes); }

  function build(root) {
    let hsv = U.rgbToHsv(...U.hexToRgb(App.state.fg));
    let mode = App.state.colourMode || 'square';
    let internal = false;
    const setFromHsv = () => { internal = true; App.setColour(U.rgbToHex(...U.hsvToRgb(hsv[0], hsv[1], hsv[2]))); internal = false; };

    const modeSeg = C.segmented([['square', 'Square'], ['wheel', 'Wheel'], ['harmony', 'Harmony', 'Colour harmony wheel — complementary, triadic, analogous…'], ['sliders', 'Sliders']], () => mode, (v) => { mode = v; App.state.colourMode = v; renderPicker(); });
    const pickerBox = h('div.nd-picker');
    const fgSw = h('div.nd-big-sw.fg', { title: 'Foreground' }), bgSw = h('div.nd-big-sw.bg', { title: 'Background — click to swap' });
    bgSw.addEventListener('click', () => App.swapColours());
    const native = C.colourInput(() => App.state.fg, (v) => App.setColour(v), 'System colour picker');
    const hex = h('input.nd-hex', { type: 'text', spellcheck: false, maxlength: 7 });
    hex.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') hex.blur(); });
    hex.addEventListener('change', () => { if (U.isHex(hex.value)) App.setColour(U.normHex(hex.value.startsWith('#') ? hex.value : '#' + hex.value)); else hex.value = App.state.fg; });
    const tools = h('div.nd-row.tight', C.iconButton('swap', 'Swap (X)', () => App.swapColours(), 'tiny'), C.iconButton('reset', 'Black & white (D)', () => App.resetColours(), 'tiny'));
    if (window.EyeDropper) tools.appendChild(C.iconButton('eyedropper', 'Pick a colour from anywhere on screen', async () => { try { const r = await new window.EyeDropper().open(); App.setColour(r.sRGBHex); } catch (e) { /* cancelled */ } }, 'tiny'));
    const swRow = h('div.nd-sw-row', h('div.nd-sw-stack', bgSw, fgSw), h('div.nd-sw-col', h('div.nd-row.tight', native, hex), tools));
    const recent = h('div.nd-recent');
    const palSel = h('select.nd-palsel');
    palSel.addEventListener('keydown', (e) => e.stopPropagation());
    const palGrid = h('div.nd-palette');
    const palBar = h('div.nd-row.tight', palSel,
      C.iconButton('plus', 'Add the current colour to this palette', () => addToPalette()),
      C.iconButton('palette', 'Palette menu (new / import / export)', (e) => paletteMenu(e.currentTarget)));
    const mixRow = h('div.nd-mixrow');
    const body = h('div.nd-colour-panel', h('div.nd-row.space', modeSeg), pickerBox, swRow, h('div.nd-mini-title', 'Paint mix (foreground → background)'), mixRow, h('div.nd-mini-title', 'Recent'), recent, h('div.nd-mini-title', 'Palette'), palBar, palGrid);
    root.appendChild(C.section('colour', 'Colour', body));

    /* ----- pickers ----- */
    let draw = () => {};
    function renderPicker() {
      U.clear(pickerBox);
      modeSeg.refresh();
      if (mode === 'square') squarePicker(); else if (mode === 'wheel') wheelPicker(); else if (mode === 'harmony') harmonyPicker(); else sliderPicker();
      draw();
    }
    function dragOn(el, fn) {
      el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); fn(e); const mv = (ev) => fn(ev); const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); App.pushRecent(App.state.fg); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); });
    }
    function squarePicker() {
      const W = 236, H = 150, sq = h('canvas.nd-sq', { width: W, height: H }), hue = h('canvas.nd-hue', { width: W, height: 14 });
      pickerBox.append(sq, hue);
      dragOn(sq, (e) => { const r = sq.getBoundingClientRect(); hsv[1] = U.clamp((e.clientX - r.left) / r.width, 0, 1); hsv[2] = U.clamp(1 - (e.clientY - r.top) / r.height, 0, 1); setFromHsv(); draw(); });
      dragOn(hue, (e) => { const r = hue.getBoundingClientRect(); hsv[0] = U.clamp((e.clientX - r.left) / r.width, 0, 0.999) * 360; setFromHsv(); draw(); });
      draw = () => {
        const x = sq.getContext('2d'), [hr, hg, hb] = U.hsvToRgb(hsv[0], 1, 1);
        let g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgb(' + hr + ',' + hg + ',' + hb + ')'); x.fillStyle = g; x.fillRect(0, 0, W, H);
        g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, W, H);
        ring(x, hsv[1] * W, (1 - hsv[2]) * H);
        const y = hue.getContext('2d'); g = y.createLinearGradient(0, 0, W, 0);
        for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, 'hsl(' + i * 60 + ',100%,50%)');
        y.fillStyle = g; y.fillRect(0, 0, W, 14);
        y.strokeStyle = '#fff'; y.lineWidth = 2; y.strokeRect((hsv[0] / 360) * W - 2, 1, 4, 12);
      };
    }
    function ring(x, px, py) { x.beginPath(); x.arc(px, py, 6, 0, U.TAU); x.strokeStyle = '#000'; x.lineWidth = 3; x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke(); }
    function wheelPicker() {
      const S = 220, c = h('canvas.nd-wheel', { width: S, height: S }), R = S / 2, inner = R - 18, side = inner * 1.38, off = (S - side) / 2;
      pickerBox.append(c);
      const wheelImg = U.canvas(S, S), wx = U.ctx(wheelImg), id = wx.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x - R, dy = y - R, d = Math.hypot(dx, dy);
        if (d > R || d < inner) continue;
        const [r, g, b] = U.hsvToRgb(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, 1, 1), j = (y * S + x) * 4;
        id.data[j] = r; id.data[j + 1] = g; id.data[j + 2] = b; id.data[j + 3] = 255 * U.clamp(Math.min(R - d, d - inner), 0, 1);
      }
      wx.putImageData(id, 0, 0);
      let grab = null;
      dragOn(c, (e) => {
        const r = c.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * S, y = ((e.clientY - r.top) / r.height) * S;
        if (e.type === 'pointerdown') grab = Math.hypot(x - R, y - R) >= inner - 2 ? 'ring' : 'sq';
        if (grab === 'ring') hsv[0] = ((Math.atan2(y - R, x - R) * 180) / Math.PI + 360) % 360;
        else { hsv[1] = U.clamp((x - off) / side, 0, 1); hsv[2] = U.clamp(1 - (y - off) / side, 0, 1); }
        setFromHsv(); draw();
      });
      draw = () => {
        const x = c.getContext('2d');
        x.clearRect(0, 0, S, S); x.drawImage(wheelImg, 0, 0);
        const [hr, hg, hb] = U.hsvToRgb(hsv[0], 1, 1);
        let g = x.createLinearGradient(off, 0, off + side, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgb(' + hr + ',' + hg + ',' + hb + ')'); x.fillStyle = g; x.fillRect(off, off, side, side);
        g = x.createLinearGradient(0, off, 0, off + side); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(off, off, side, side);
        const a = (hsv[0] * Math.PI) / 180;
        ring(x, R + Math.cos(a) * (inner + 9), R + Math.sin(a) * (inner + 9));
        ring(x, off + hsv[1] * side, off + (1 - hsv[2]) * side);
      };
    }
    /* Harmony wheel: hue around, saturation outwards, value below. The base colour is the
     * foreground; the scheme's other colours are shown as markers and as swatches to paint with. */
    function harmonyPicker() {
      const st = App.state.harmony || (App.state.harmony = { rule: 'complementary', spread: 30, ryb: true });
      const S = 220, R = S / 2 - 6, c = h('canvas.nd-wheel.nd-harm', { width: S, height: S });
      const val = h('input.nd-harm-v', { type: 'range', min: 0, max: 100, step: 1, title: 'Brightness (value)' });
      const rule = C.select('Scheme', RULES, () => st.rule, (v) => { st.rule = v; App.savePrefsSoon(); renderSpread(); draw(); });
      const spreadBox = h('div.nd-harm-row');
      const sw = h('div.nd-harm-sw');
      const rybChk = C.check('Painter’s wheel (RYB)', () => st.ryb, (v) => { st.ryb = v; disc = null; App.savePrefsSoon(); draw(); }, 'Arrange hues like a painter’s colour wheel, so complements match paint (blue ↔ orange). Off: the screen (RGB) wheel.');
      const save = C.button('Save as palette', () => {
        const cols = harmony(hsv, st.rule, st.spread, st.ryb).map((q) => U.rgbToHex(...U.hsvToRgb(q[0], q[1], q[2])));
        const name = 'Harmony – ' + RULES.find((r) => r[0] === st.rule)[1] + ' ' + cols[0];
        App.userPalettes[name] = cols; App.palette = name; renderPalette(); App.savePrefsSoon();
        App.toast('Saved “' + name + '” to your palettes');
      }, { cls: 'sm', icon: 'palette' });
      pickerBox.append(c, h('div.nd-row.tight.nd-harm-row', h('span.nd-lbl', 'Value'), val), h('div.nd-row.tight.nd-harm-row', rule), spreadBox, sw, h('div.nd-row.tight.nd-harm-row', rybChk, save));
      function renderSpread() {
        U.clear(spreadBox);
        if (['analogous', 'split', 'tetradic'].includes(st.rule)) {
          spreadBox.appendChild(C.slider('Spread', { min: 5, max: 90, get: () => st.spread, set: (v) => { st.spread = v; App.savePrefsSoon(); draw(); }, unit: '°', wide: true, title: 'Angle between the colours of the scheme' }));
        }
      }
      renderSpread();
      // the disc for the current value (cached)
      let disc = null, discKey = '';
      const toWheel = (hh) => (st.ryb ? hueToRyb(hh) : hh), fromWheel = (a) => (st.ryb ? rybToHue(a) : a);
      function buildDisc() {
        const key = Math.round(hsv[2] * 100) + (st.ryb ? 'r' : 'g');
        if (disc && discKey === key) return disc;
        discKey = key;
        disc = U.canvas(S, S);
        const x = U.ctx(disc), id = x.createImageData(S, S);
        for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
          const dx = xx - S / 2, dy = y - S / 2, d = Math.hypot(dx, dy);
          if (d > R + 1) continue;
          const a = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
          const [r, g, b] = U.hsvToRgb(fromWheel(a), Math.min(1, d / R), hsv[2]), j = (y * S + xx) * 4;
          id.data[j] = r; id.data[j + 1] = g; id.data[j + 2] = b; id.data[j + 3] = 255 * U.clamp(R + 1 - d, 0, 1);
        }
        x.putImageData(id, 0, 0);
        return disc;
      }
      const pos = (q) => { const a = ((toWheel(q[0]) - 90) * Math.PI) / 180; return [S / 2 + Math.cos(a) * q[1] * R, S / 2 + Math.sin(a) * q[1] * R]; };
      let grab = 0, grabOff = 0;
      dragOn(c, (e) => {
        const r = c.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * S - S / 2, y = ((e.clientY - r.top) / r.height) * S - S / 2;
        const a = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360, sat = Math.min(1, Math.hypot(x, y) / R);
        const cols = harmony(hsv, st.rule, st.spread, st.ryb);
        if (e.type === 'pointerdown') {
          // grab the nearest marker; dragging any of them turns the whole scheme
          grab = 0; grabOff = 0;
          let best = 14;
          cols.forEach((q, i) => { const [px, py] = pos(q), dd = Math.hypot(px - S / 2 - x, py - S / 2 - y); if (dd < best) { best = dd; grab = i; } });
          grabOff = toWheel(cols[grab][0]) - toWheel(hsv[0]);
        }
        hsv[0] = ((fromWheel(((a - grabOff) % 360 + 360) % 360)) + 360) % 360;
        if (!['mono', 'shades'].includes(st.rule) || grab === 0) hsv[1] = sat;
        setFromHsv(); draw();
      });
      val.addEventListener('input', () => { hsv[2] = val.value / 100; setFromHsv(); draw(); });
      val.addEventListener('change', () => App.pushRecent(App.state.fg));
      draw = () => {
        const x = c.getContext('2d');
        x.clearRect(0, 0, S, S); x.drawImage(buildDisc(), 0, 0);
        const cols = harmony(hsv, st.rule, st.spread, st.ryb);
        // spokes from the centre to each colour
        x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1.2;
        cols.forEach((q) => { const [px, py] = pos(q); x.beginPath(); x.moveTo(S / 2, S / 2); x.lineTo(px, py); x.stroke(); });
        cols.forEach((q, i) => {
          const [px, py] = pos(q), rr = i === 0 ? 8 : 6;
          x.beginPath(); x.arc(px, py, rr, 0, U.TAU);
          x.fillStyle = 'rgb(' + U.hsvToRgb(q[0], q[1], q[2]).join(',') + ')'; x.fill();
          x.lineWidth = i === 0 ? 3 : 2; x.strokeStyle = '#fff'; x.stroke();
          x.lineWidth = 1; x.strokeStyle = 'rgba(0,0,0,.6)'; x.beginPath(); x.arc(px, py, rr + 1.5, 0, U.TAU); x.stroke();
        });
        if (document.activeElement !== val) val.value = Math.round(hsv[2] * 100);
        val.style.background = 'linear-gradient(90deg,#000,rgb(' + U.hsvToRgb(hsv[0], hsv[1], 1).join(',') + '))';
        U.clear(sw);
        cols.forEach((q, i) => {
          const hex = U.rgbToHex(...U.hsvToRgb(q[0], q[1], q[2]));
          const b = h('button.nd-harm-swatch' + (hex === App.state.fg ? '.active' : '') + (i === 0 ? '.base' : ''), { type: 'button', title: hex + (i === 0 ? ' (base)' : '') + ' — click to paint with it · Alt+click: background', style: { background: hex } });
          b.addEventListener('click', (e) => { internal = true; App.setColour(hex, e.altKey ? 'bg' : 'fg'); internal = false; App.pushRecent(hex); draw(); });
          sw.appendChild(b);
        });
      };
    }
    function sliderPicker() {
      const rows = [];
      const mk = (label, max, get, set, grad) => {
        const track = h('div.nd-ctrack'), range = h('input', { type: 'range', min: 0, max, step: 1 }), num = h('input.nd-num', { type: 'text' });
        range.addEventListener('input', () => { set(+range.value); });
        range.addEventListener('change', () => App.pushRecent(App.state.fg));
        num.addEventListener('change', () => { const v = parseFloat(num.value); if (!isNaN(v)) set(U.clamp(v, 0, max)); });
        num.addEventListener('keydown', (e) => e.stopPropagation());
        const el = h('div.nd-crow', h('span.nd-lbl', label), h('div.nd-ctrack-wrap', track, range), num);
        rows.push(() => { range.value = get(); if (document.activeElement !== num) num.value = Math.round(get()); track.style.background = grad(); });
        pickerBox.appendChild(el);
      };
      const rgb = () => U.hexToRgb(App.state.fg);
      const setRgb = (i, v) => { const c = rgb(); c[i] = v; internal = false; App.setColour(U.rgbToHex(...c)); };
      const hsvCss = (hh, s, v) => 'rgb(' + U.hsvToRgb(hh, s, v).join(',') + ')';
      mk('H', 359, () => hsv[0], (v) => { hsv[0] = v; setFromHsv(); draw(); }, () => 'linear-gradient(90deg,' + [0, 60, 120, 180, 240, 300, 360].map((q) => hsvCss(q, Math.max(0.2, hsv[1]), Math.max(0.3, hsv[2]))).join(',') + ')');
      mk('S', 100, () => hsv[1] * 100, (v) => { hsv[1] = v / 100; setFromHsv(); draw(); }, () => 'linear-gradient(90deg,' + hsvCss(hsv[0], 0, hsv[2]) + ',' + hsvCss(hsv[0], 1, hsv[2]) + ')');
      mk('V', 100, () => hsv[2] * 100, (v) => { hsv[2] = v / 100; setFromHsv(); draw(); }, () => 'linear-gradient(90deg,#000,' + hsvCss(hsv[0], hsv[1], 1) + ')');
      ['R', 'G', 'B'].forEach((L, i) => mk(L, 255, () => rgb()[i], (v) => setRgb(i, v), () => { const a = rgb(), b = rgb(); a[i] = 0; b[i] = 255; return 'linear-gradient(90deg,rgb(' + a.join(',') + '),rgb(' + b.join(',') + '))'; }));
      draw = () => rows.forEach((f) => f());
    }

    /* ----- swatches ----- */
    function refreshSwatches() {
      const s = App.state;
      fgSw.style.background = s.fg; bgSw.style.background = s.bg;
      if (document.activeElement !== hex) hex.value = s.fg;
      native.refresh();
    }
    // pigment mixes between the foreground and background colours, like mixing paint on a palette
    function renderMix() {
      U.clear(mixRow);
      ND.Pigment.ramp(App.state.fg, App.state.bg, 9).forEach((c, i) => {
        const b = h('button.nd-swatch', { title: c + (i === 0 ? ' (foreground)' : i === 8 ? ' (background)' : ' — paint mix, click to use') , style: { background: c } });
        b.addEventListener('click', () => { internal = false; App.setColour(c, 'fg'); App.pushRecent(c); });
        mixRow.appendChild(b);
      });
    }
    function renderRecent() {
      U.clear(recent);
      App.state.recent.forEach((c) => {
        const b = h('button.nd-swatch', { title: c, style: { background: c } });
        b.addEventListener('click', (e) => App.setColour(c, e.altKey ? 'bg' : 'fg'));
        recent.appendChild(b);
      });
      if (!App.state.recent.length) recent.appendChild(h('span.nd-hint', 'Colours you paint with appear here'));
    }
    function renderPalette() {
      const pals = allPalettes();
      if (!pals[App.palette]) App.palette = 'Default';
      U.clear(palSel);
      Object.keys(pals).forEach((n) => palSel.appendChild(h('option', { value: n }, n + (App.userPalettes[n] ? ' ★' : ''))));
      palSel.value = App.palette;
      U.clear(palGrid);
      pals[App.palette].forEach((c, i) => {
        const b = h('button.nd-swatch', { title: c + (App.userPalettes[App.palette] ? '  (Alt+click removes)' : '  (Alt+click: background)'), style: { background: c } });
        b.addEventListener('click', (e) => {
          if (e.altKey && App.userPalettes[App.palette]) { App.userPalettes[App.palette].splice(i, 1); renderPalette(); App.savePrefsSoon(); return; }
          App.setColour(c, e.altKey ? 'bg' : 'fg');
        });
        palGrid.appendChild(b);
      });
    }
    palSel.addEventListener('change', () => { App.palette = palSel.value; renderPalette(); App.savePrefsSoon(); });
    function addToPalette() {
      if (!App.userPalettes[App.palette]) {
        // copy a built-in palette into an editable one
        const name = App.palette + ' (mine)';
        App.userPalettes[name] = (App.userPalettes[name] || allPalettes()[App.palette].slice());
        App.palette = name;
      }
      if (!App.userPalettes[App.palette].includes(App.state.fg)) App.userPalettes[App.palette].push(App.state.fg);
      renderPalette();
      App.savePrefsSoon();
    }
    function paletteMenu(anchor) {
      const file = h('input', { type: 'file', accept: '.gpl,.json,.txt,.hex', style: { display: 'none' } });
      file.addEventListener('change', async () => { const f = file.files[0]; if (f) importPalette(f); C.closePopover(); });
      const pop = h('div.nd-menu-list',
        h('button.nd-menu-item', { onclick: () => { const n = window.prompt('New palette name', 'My Palette'); if (n) { App.userPalettes[n] = []; App.palette = n; renderPalette(); App.savePrefsSoon(); } C.closePopover(); } }, 'New empty palette'),
        h('button.nd-menu-item', { onclick: () => { const n = window.prompt('Palette name', 'From image'); if (n) { App.userPalettes[n] = extractColours(); App.palette = n; renderPalette(); App.savePrefsSoon(); } C.closePopover(); } }, 'Extract palette from image'),
        h('button.nd-menu-item', { onclick: () => file.click() }, 'Import palette (.gpl / .hex)…'),
        h('button.nd-menu-item', { onclick: () => { exportPalette(); C.closePopover(); } }, 'Export as GIMP palette (.gpl)'),
        App.userPalettes[App.palette] ? h('button.nd-menu-item.danger', { onclick: () => { if (window.confirm('Delete palette “' + App.palette + '”?')) { delete App.userPalettes[App.palette]; App.palette = 'Default'; renderPalette(); App.savePrefsSoon(); } C.closePopover(); } }, 'Delete this palette') : null,
        file);
      C.popover(anchor, pop);
    }
    async function importPalette(f) {
      const txt = await f.text(), cols = [];
      txt.split(/\r?\n/).forEach((line) => {
        const m = /^\s*(\d+)\s+(\d+)\s+(\d+)/.exec(line);
        if (m) cols.push(U.rgbToHex(+m[1], +m[2], +m[3]));
        else { const hx = /#?([0-9a-f]{6})\b/i.exec(line); if (hx && !/^Name:|^GIMP|^Columns/.test(line)) cols.push('#' + hx[1].toLowerCase()); }
      });
      if (!cols.length) return App.toast('No colours found in that file');
      const name = f.name.replace(/\.[^.]+$/, '');
      App.userPalettes[name] = cols;
      App.palette = name;
      renderPalette();
      App.savePrefsSoon();
      App.toast('Imported ' + cols.length + ' colours');
    }
    function exportPalette() {
      const cols = allPalettes()[App.palette];
      const body = 'GIMP Palette\nName: ' + App.palette + '\nColumns: 8\n#\n' + cols.map((c) => { const [r, g, b] = U.hexToRgb(c); return String(r).padStart(3) + ' ' + String(g).padStart(3) + ' ' + String(b).padStart(3) + '\t' + c; }).join('\n') + '\n';
      U.download(U.safeName(App.palette) + '.gpl', new Blob([body], { type: 'text/plain' }));
    }
    // k-means style colour extraction from the merged image (quantised buckets)
    function extractColours() {
      const d = App.doc, s = Math.min(1, 160 / Math.max(d.width, d.height)), c = U.canvas(d.width * s, d.height * s), x = U.ctx(c);
      x.drawImage(d.getProjection(), 0, 0, c.width, c.height);
      const px = x.getImageData(0, 0, c.width, c.height).data, buckets = new Map();
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 128) continue;
        const k = (px[i] >> 4) * 256 + (px[i + 1] >> 4) * 16 + (px[i + 2] >> 4);
        const b = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
        b.n++; b.r += px[i]; b.g += px[i + 1]; b.b += px[i + 2];
        buckets.set(k, b);
      }
      const top = Array.from(buckets.values()).sort((a, b) => b.n - a.n), out = [];
      for (const b of top) {
        const hx = U.rgbToHex(b.r / b.n, b.g / b.n, b.b / b.n), rgb = U.hexToRgb(hx);
        if (out.every((o) => { const q = U.hexToRgb(o); return Math.abs(q[0] - rgb[0]) + Math.abs(q[1] - rgb[1]) + Math.abs(q[2] - rgb[2]) > 60; })) out.push(hx);
        if (out.length >= 24) break;
      }
      return out;
    }

    App.on('colour', () => {
      if (!internal) { const n = U.rgbToHsv(...U.hexToRgb(App.state.fg)); if (n[1] > 0.001 && n[2] > 0.001) hsv = n; else hsv = [hsv[0], n[1], n[2]]; draw(); }
      else if (mode === 'sliders') draw();
      refreshSwatches();
      renderMixSoon();
    });
    const renderMixSoon = U.debounce(renderMix, 120);
    App.on('recent', renderRecent);
    renderPicker(); refreshSwatches(); renderRecent(); renderPalette(); renderMix();
  }
})();
