/* Neon Draw — pop-up palette (Krita style): right-click the canvas (or press the pen's side button)
 * for a ring of favourite brushes, recent colours and a colour wheel right under the cursor. */
'use strict';
(function () {
  const U = ND.U, h = U.h, App = ND.App;
  const P = { el: null };
  const SIZE = 340, MID = SIZE / 2;
  const R_BRUSH = 140, SLOT = 46; // favourite brush ring
  const R_RECENT = 99, SWATCH = 17; // recent colour ring
  const HUE_OUT = 80, HUE_IN = 64, SQ = 84; // colour wheel
  const MAX_FAVS = 12;
  const DEFAULT_FAVS = ['HB Pencil', 'Ink Pen', 'G-Pen', 'Hard Round', 'Soft Brush', 'Oil Bristle', 'Watercolour Round', 'Airbrush', 'Charcoal', 'Wet Blender', 'Smudge', 'Eraser Soft'];

  const allPresets = () => App.customPresets.concat(ND.Presets.LIST);
  P.favourites = function () {
    if (!App.state.favBrushes) App.state.favBrushes = DEFAULT_FAVS.slice();
    const all = allPresets();
    return App.state.favBrushes.map((n) => all.find((p) => p.name === n)).filter(Boolean);
  };
  P.isFavourite = (name) => P.favourites().some((p) => p.name === name);
  P.toggleFavourite = function (name) {
    const list = P.favourites().map((p) => p.name), i = list.indexOf(name);
    if (i >= 0) list.splice(i, 1);
    else if (list.length >= MAX_FAVS) { App.toast('The pop-up palette holds ' + MAX_FAVS + ' brushes — remove one first'); return; }
    else list.push(name);
    App.set('favBrushes', list);
    App.emit('favourites');
    App.toast(i >= 0 ? 'Removed “' + name + '” from the pop-up palette' : 'Added “' + name + '” to the pop-up palette (right-click the canvas)');
  };

  // a brush preview cropped into a circle; brushes that lay no paint (erasers, smudge, blenders…) get their tool icon
  const thumbCache = new Map();
  const ICON_FOR = { eraser: 'eraser', smudge: 'smudge', blur: 'smudge', clone: 'clone', dodge: 'dodge', burn: 'burn', mixer: 'smudge' };
  // share of visible pixels, and average "ink" (alpha × brightness) of a preview
  function measure(c) {
    const d = U.ctx(c).getImageData(0, 0, c.width, c.height).data, n = d.length / 4;
    let cov = 0, ink = 0;
    for (let i = 3; i < d.length; i += 4) { if (d[i] > 40) cov++; ink += (d[i] * (d[i - 1] + d[i - 2] + d[i - 3])) / 765; }
    return { cov: cov / n, ink: ink / n / 255 };
  }
  function thumb(p) {
    const key = p.name + (p.custom ? JSON.stringify(p.settings) : '');
    if (thumbCache.has(key)) return thumbCache.get(key);
    const c = U.canvas(SLOT * 2, SLOT * 2), x = U.ctx(c);
    let img = null;
    try { img = ND.Brush.previewStroke(p.settings, 128, 40, '#e6ecf5'); } catch (e) { img = null; }
    const m = img ? measure(img) : { cov: 0, ink: 0 };
    if (!img || p.settings.erase || m.cov < 0.005) {
      const icon = p.settings.erase || p.settings.engine === 'eraser' ? 'eraser' : ICON_FOR[p.settings.engine] || 'brush';
      thumbCache.set(key, icon);
      return icon;
    }
    x.fillStyle = '#24272d'; x.beginPath(); x.arc(SLOT, SLOT, SLOT, 0, U.TAU); x.fill();
    x.save(); x.beginPath(); x.arc(SLOT, SLOT, SLOT - 2, 0, U.TAU); x.clip();
    // faint brushes (airbrush, soft pencils) are stacked a few times so they read at this size
    const reps = U.clamp(Math.round(0.08 / Math.max(0.005, m.ink)), 1, 6);
    for (let k = 0; k < reps; k++) x.drawImage(img, -SLOT * 0.55, SLOT * 0.35, SLOT * 3.1, SLOT * 1.3);
    x.restore();
    thumbCache.set(key, c);
    return c;
  }

  /* ---------- colour wheel ---------- */
  let hsv = [0, 0, 0];
  function drawWheel(c) {
    const x = U.ctx(c), s = c.width / (HUE_OUT * 2 + 4), cx = c.width / 2;
    x.setTransform(s, 0, 0, s, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    const m = HUE_OUT + 2;
    // hue ring (a conic gradient where supported, otherwise overlapping slices)
    x.lineWidth = HUE_OUT - HUE_IN;
    if (x.createConicGradient) {
      const g = x.createConicGradient(-Math.PI / 2, m, m);
      for (let a = 0; a <= 360; a += 30) g.addColorStop(a / 360, 'hsl(' + a + ',100%,50%)');
      x.strokeStyle = g;
      x.beginPath(); x.arc(m, m, (HUE_OUT + HUE_IN) / 2, 0, U.TAU); x.stroke();
    } else {
      for (let a = 0; a < 360; a += 2) {
        x.beginPath();
        x.strokeStyle = 'hsl(' + a + ',100%,50%)';
        x.arc(m, m, (HUE_OUT + HUE_IN) / 2, ((a - 91.5) * Math.PI) / 180, ((a - 88.5) * Math.PI) / 180);
        x.stroke();
      }
    }
    // saturation / value square
    const q = SQ / 2, rgb = U.hsvToRgb(hsv[0], 1, 1);
    x.fillStyle = 'rgb(' + rgb.join(',') + ')'; x.fillRect(m - q, m - q, SQ, SQ);
    let g = x.createLinearGradient(m - q, 0, m + q, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(m - q, m - q, SQ, SQ);
    g = x.createLinearGradient(0, m - q, 0, m + q); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000');
    x.fillStyle = g; x.fillRect(m - q, m - q, SQ, SQ);
    // markers
    const ha = ((hsv[0] - 90) * Math.PI) / 180, hr = (HUE_OUT + HUE_IN) / 2;
    x.lineWidth = 2; x.strokeStyle = '#fff';
    x.beginPath(); x.arc(m + Math.cos(ha) * hr, m + Math.sin(ha) * hr, 6, 0, U.TAU); x.stroke();
    const sx = m - q + hsv[1] * SQ, sy = m - q + (1 - hsv[2]) * SQ;
    x.strokeStyle = hsv[2] > 0.6 && hsv[1] < 0.5 ? '#000' : '#fff';
    x.beginPath(); x.arc(sx, sy, 5, 0, U.TAU); x.stroke();
    x.setTransform(1, 0, 0, 1, 0, 0);
    return cx;
  }
  function wheelPick(c, e, mode) {
    const r = c.getBoundingClientRect(), k = (HUE_OUT * 2 + 4) / r.width;
    const x = (e.clientX - r.left) * k - (HUE_OUT + 2), y = (e.clientY - r.top) * k - (HUE_OUT + 2);
    if (!mode) {
      const d = Math.hypot(x, y);
      if (Math.abs(x) <= SQ / 2 + 2 && Math.abs(y) <= SQ / 2 + 2) mode = 'sv';
      else if (d >= HUE_IN - 6 && d <= HUE_OUT + 4) mode = 'hue';
      else return null;
    }
    if (mode === 'hue') hsv[0] = (((Math.atan2(y, x) * 180) / Math.PI + 90) % 360 + 360) % 360;
    else { hsv[1] = U.clamp(x / SQ + 0.5, 0, 1); hsv[2] = U.clamp(0.5 - y / SQ, 0, 1); }
    App.setColour(U.rgbToHex(...U.hsvToRgb(hsv[0], hsv[1], hsv[2])), 'fg');
    return mode;
  }

  /* ---------- open / close ---------- */
  P.close = function () {
    if (!P.el) return;
    if (App.state.fg !== P.startFg) App.pushRecent(App.state.fg);
    P.el.remove(); P.el = null;
    window.removeEventListener('keydown', P.onKey, true);
  };
  P.isOpen = () => !!P.el;
  P.open = function (clientX, clientY) {
    P.close();
    P.startFg = App.state.fg;
    const fg = U.hexToRgb(App.state.fg);
    hsv = U.rgbToHsv(fg[0], fg[1], fg[2]);
    const back = h('div.nd-pp-back');
    const box = h('div.nd-pp', { role: 'dialog', 'aria-label': 'Pop-up palette' });
    const vw = window.innerWidth, vh = window.innerHeight;
    box.style.left = U.clamp(clientX - MID, 4, vw - SIZE - 4) + 'px';
    box.style.top = U.clamp(clientY - MID, 4, vh - SIZE - 4) + 'px';
    back.appendChild(box);
    const at = (r, ang) => ({ x: MID + Math.cos(ang) * r, y: MID + Math.sin(ang) * r });
    const label = h('div.nd-pp-label');
    const setLabel = (t) => { label.textContent = t || App.state.brushName + ' · ' + Math.round(App.state.brush.size) + ' px'; };

    // favourite brushes
    const favs = P.favourites(), n = Math.max(8, Math.min(MAX_FAVS, favs.length + 1));
    for (let i = 0; i < n; i++) {
      const p = favs[i], c = at(R_BRUSH, -Math.PI / 2 + (i / n) * U.TAU);
      const b = h('button.nd-pp-slot' + (p && p.name === App.state.brushName ? '.active' : '') + (p ? '' : '.empty'), { type: 'button', title: p ? p.name + ' — right-click to remove' : 'Add the current brush (' + App.state.brushName + ')' });
      b.style.left = c.x - SLOT / 2 + 'px'; b.style.top = c.y - SLOT / 2 + 'px';
      if (p) {
        const cv = thumb(p);
        if (typeof cv === 'string') { b.classList.add('icon'); b.appendChild(ND.icon(cv, 22)); } else {
          const view = h('canvas', { width: cv.width, height: cv.height });
          U.ctx(view).drawImage(cv, 0, 0);
          b.appendChild(view);
        }
        b.addEventListener('click', () => { App.loadPreset(p); P.close(); App.toast(p.name); });
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); P.toggleFavourite(p.name); P.open(clientX, clientY); });
        b.addEventListener('pointerenter', () => setLabel(p.name));
        b.addEventListener('pointerleave', () => setLabel());
      } else {
        b.textContent = '+';
        b.addEventListener('click', () => { P.toggleFavourite(App.state.brushName); P.open(clientX, clientY); });
      }
      box.appendChild(b);
    }
    // recent colours (foreground first)
    const recent = [App.state.fg, App.state.bg].concat(App.state.recent.filter((c) => c !== App.state.fg && c !== App.state.bg)).slice(0, 14);
    const steps = Math.max(8, recent.length);
    recent.forEach((col, i) => {
      const c = at(R_RECENT, -Math.PI / 2 + (i / steps) * U.TAU);
      const s = h('button.nd-pp-swatch' + (i < 2 ? '.fgbg' : ''), { type: 'button', title: i === 0 ? 'Foreground ' + col : i === 1 ? 'Background ' + col + ' (click to use)' : col });
      s.style.background = col;
      s.style.left = c.x - SWATCH / 2 + 'px'; s.style.top = c.y - SWATCH / 2 + 'px';
      s.addEventListener('click', () => {
        App.setColour(col, 'fg');
        const rgb = U.hexToRgb(col); hsv = U.rgbToHsv(rgb[0], rgb[1], rgb[2]); drawWheel(wheel);
      });
      box.appendChild(s);
    });
    // colour wheel in the middle
    const px = Math.round((HUE_OUT * 2 + 4) * Math.min(2, window.devicePixelRatio || 1));
    const wheel = h('canvas.nd-pp-wheel', { width: px, height: px });
    wheel.style.width = wheel.style.height = HUE_OUT * 2 + 4 + 'px';
    wheel.style.left = wheel.style.top = MID - HUE_OUT - 2 + 'px';
    drawWheel(wheel);
    let mode = null;
    wheel.addEventListener('pointerdown', (e) => { mode = wheelPick(wheel, e, null); if (mode) { try { wheel.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } drawWheel(wheel); } });
    wheel.addEventListener('pointermove', (e) => { if (mode) { wheelPick(wheel, e, mode); drawWheel(wheel); } });
    wheel.addEventListener('pointerup', () => { mode = null; });
    box.appendChild(wheel);
    setLabel();
    box.appendChild(label);

    back.addEventListener('pointerdown', (e) => { if (e.target === back) P.close(); });
    // the right-click that opened the palette also fires contextmenu on release — ignore that one
    const opened = performance.now();
    back.addEventListener('contextmenu', (e) => { e.preventDefault(); if (e.target === back && performance.now() - opened > 500) P.close(); });
    document.body.appendChild(back);
    P.el = back;
    P.onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); P.close(); } };
    window.addEventListener('keydown', P.onKey, true);
  };

  ND.Popup = P;
})();
