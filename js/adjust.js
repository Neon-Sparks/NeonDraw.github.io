/* Neon Sparks Draw — adjustment layers and fill layers (non-destructive), curves maths and histograms. */
'use strict';
(function () {
  const U = ND.U;
  const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  /* ---------- curves: monotone cubic spline through the points → 256-entry LUT ---------- */
  function curveLUT(pts) {
    const p = (pts && pts.length >= 2 ? pts : [[0, 0], [255, 255]]).slice().sort((a, b) => a[0] - b[0]);
    const n = p.length, lut = new Uint8ClampedArray(256);
    if (n === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 255 && p[1][1] === 255) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]), d = [], m = [];
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    for (let x = 0; x < 256; x++) {
      if (x <= xs[0]) { lut[x] = ys[0]; continue; }
      if (x >= xs[n - 1]) { lut[x] = ys[n - 1]; continue; }
      let k = 0;
      while (k < n - 2 && x > xs[k + 1]) k++;
      const h = xs[k + 1] - xs[k], t = (x - xs[k]) / h, t2 = t * t, t3 = t2 * t;
      lut[x] = (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
    }
    return lut;
  }
  function levelsLUT(l) {
    const lut = new Uint8ClampedArray(256), iw = Math.max(l.ib + 1, l.iw), g = 1 / Math.max(0.05, l.g);
    for (let v = 0; v < 256; v++) { const t = U.clamp((v - l.ib) / (iw - l.ib), 0, 1); lut[v] = l.ob + Math.pow(t, g) * (l.ow - l.ob); }
    return lut;
  }
  const identityLevels = () => ({ ib: 0, iw: 255, g: 1, ob: 0, ow: 255 });
  function lut3(img, lr, lg, lb, lm) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = lr[lm ? lm[d[i]] : d[i]]; d[i + 1] = lg[lm ? lm[d[i + 1]] : d[i + 1]]; d[i + 2] = lb[lm ? lm[d[i + 2]] : d[i + 2]]; }
  }

  function histogram(canvas, rect) {
    const r = rect || { x: 0, y: 0, w: canvas.width, h: canvas.height };
    const s = Math.max(1, Math.floor(Math.sqrt((r.w * r.h) / 400000)));
    const d = U.ctx(canvas).getImageData(r.x, r.y, r.w, r.h).data, H = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), l: new Uint32Array(256) };
    for (let y = 0; y < r.h; y += s) for (let x = 0; x < r.w; x += s) {
      const i = (y * r.w + x) * 4;
      if (d[i + 3] < 8) continue;
      H.r[d[i]]++; H.g[d[i + 1]]++; H.b[d[i + 2]]++; H.l[Math.round(U.luma(d[i], d[i + 1], d[i + 2]))]++;
    }
    return H;
  }

  /* ---------- per-pixel helpers ---------- */
  function each(img, fn) { const d = img.data; for (let i = 0; i < d.length; i += 4) if (d[i + 3]) fn(d, i); }
  function blurredCopy(img, radius) {
    const d = new Uint8ClampedArray(img.data);
    ND.Filters.boxBlurRGBA(d, img.width, img.height, Math.max(1, radius / 1.7));
    return d;
  }
  // deterministic per-pixel noise (no flicker when re-compositing)
  const hashNoise = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) & 1023) / 1023 - 0.5; };

  /* ---------- adjustment kinds ---------- */
  const R = (key, label, min, max, def, step) => ({ key, label, min, max, def, step: step || 1 });
  const KINDS = [
    { id: 'brightcon', label: 'Brightness / Contrast', icon: '☀', params: [R('b', 'Brightness', -100, 100, 0), R('c', 'Contrast', -100, 100, 0)],
      apply: (img, p) => {
        const b = (p.b / 100) * 255 * 0.6, f = (259 * (p.c * 2.55 + 255)) / (255 * (259 - p.c * 2.55)), lut = new Uint8ClampedArray(256);
        for (let v = 0; v < 256; v++) lut[v] = f * (v + b - 128) + 128;
        lut3(img, lut, lut, lut);
      } },
    { id: 'levels', label: 'Levels', icon: '▥', custom: 'levels', defaults: () => ({ rgb: identityLevels(), r: identityLevels(), g: identityLevels(), b: identityLevels() }),
      apply: (img, p) => lut3(img, levelsLUT(p.r || identityLevels()), levelsLUT(p.g || identityLevels()), levelsLUT(p.b || identityLevels()), levelsLUT(p.rgb || identityLevels())) },
    { id: 'curves', label: 'Curves', icon: '∿', custom: 'curves', defaults: () => ({ rgb: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]] }),
      apply: (img, p) => lut3(img, curveLUT(p.r), curveLUT(p.g), curveLUT(p.b), curveLUT(p.rgb)) },
    { id: 'exposure', label: 'Exposure', icon: '◐', params: [R('e', 'Exposure', -5, 5, 0, 0.05), R('o', 'Offset', -0.5, 0.5, 0, 0.01), R('g', 'Gamma', 0.1, 3, 1, 0.01)],
      apply: (img, p) => {
        const m = Math.pow(2, p.e), lut = new Uint8ClampedArray(256);
        for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(U.clamp((v / 255) * m + p.o, 0, 1), 1 / p.g);
        lut3(img, lut, lut, lut);
      } },
    { id: 'hsl', label: 'Hue / Saturation', icon: '◑', params: [R('h', 'Hue', -180, 180, 0), R('s', 'Saturation', -100, 100, 0), R('l', 'Lightness', -100, 100, 0), { key: 'col', label: 'Colorize', type: 'check', def: 0 }],
      apply: (img, p) => each(img, (d, i) => {
        let [h, s, l] = U.rgbToHsl(d[i], d[i + 1], d[i + 2]);
        if (p.col) { h = (p.h + 360) % 360; s = U.clamp(0.25 + p.s / 100, 0, 1); }
        else { h += p.h; s = U.clamp(p.s >= 0 ? s + (1 - s) * (p.s / 100) * s * 1.5 : s * (1 + p.s / 100), 0, 1); }
        l = p.l >= 0 ? l + (1 - l) * (p.l / 100) : l * (1 + p.l / 100);
        const c = U.hslToRgb(h, s, U.clamp(l, 0, 1)); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      }) },
    { id: 'vibrance', label: 'Vibrance', icon: '✺', params: [R('v', 'Vibrance', -100, 100, 30), R('s', 'Saturation', -100, 100, 0)],
      apply: (img, p) => each(img, (d, i) => {
        const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0, l = U.luma(r, g, b);
        const k = 1 + (p.s / 100) + (p.v / 100) * (1 - sat) * 1.4;
        d[i] = cl(l + (r - l) * k); d[i + 1] = cl(l + (g - l) * k); d[i + 2] = cl(l + (b - l) * k);
      }) },
    { id: 'colorbalance', label: 'Colour Balance', icon: '⚖', custom: 'tones', defaults: () => ({ sh: { r: 0, g: 0, b: 0 }, mid: { r: 0, g: 0, b: 0 }, hi: { r: 0, g: 0, b: 0 }, keepLum: 1 }),
      apply: (img, p) => each(img, (d, i) => {
        const l = U.luma(d[i], d[i + 1], d[i + 2]) / 255, ws = Math.max(0, 1 - l * 2.2) ** 1.2, wh = Math.max(0, l * 2.2 - 1.2) ** 1.2, wm = Math.max(0, 1 - Math.abs(l - 0.5) * 2.4);
        let r = d[i], g = d[i + 1], b = d[i + 2];
        for (const [t, w] of [[p.sh, ws], [p.mid, wm], [p.hi, wh]]) { r += t.r * w * 1.1; g += t.g * w * 1.1; b += t.b * w * 1.1; }
        if (p.keepLum) { const nl = U.luma(r, g, b), k = l * 255 - nl; r += k; g += k; b += k; }
        d[i] = cl(r); d[i + 1] = cl(g); d[i + 2] = cl(b);
      }) },
    { id: 'bw', label: 'Black & White', icon: '◧', params: [R('reds', 'Reds', -200, 300, 40), R('yellows', 'Yellows', -200, 300, 60), R('greens', 'Greens', -200, 300, 40), R('cyans', 'Cyans', -200, 300, 60), R('blues', 'Blues', -200, 300, 20), R('magentas', 'Magentas', -200, 300, 80), { key: 'tint', label: 'Tint', type: 'check', def: 0 }, { key: 'tintColor', label: 'Tint colour', type: 'colour', def: '#c8a46e' }],
      apply: (img, p) => {
        const tc = U.hexToRgb(p.tintColor || '#c8a46e'), tl = U.luma(tc[0], tc[1], tc[2]);
        each(img, (d, i) => {
          const r = d[i], g = d[i + 1], b = d[i + 2], mn = Math.min(r, g, b);
          // PS-style: grey from the minimum plus weighted hue contributions
          let rr = r - mn, gg = g - mn, bb = b - mn, v = mn;
          const yel = Math.min(rr, gg), cy = Math.min(gg, bb), mag = Math.min(rr, bb);
          if (yel) { v += yel * p.yellows / 100; rr -= yel; gg -= yel; }
          else if (cy) { v += cy * p.cyans / 100; gg -= cy; bb -= cy; }
          else if (mag) { v += mag * p.magentas / 100; rr -= mag; bb -= mag; }
          v += rr * p.reds / 100 + gg * p.greens / 100 + bb * p.blues / 100;
          v = cl(v);
          if (p.tint) { d[i] = cl(v + (tc[0] - tl) * 0.5); d[i + 1] = cl(v + (tc[1] - tl) * 0.5); d[i + 2] = cl(v + (tc[2] - tl) * 0.5); }
          else d[i] = d[i + 1] = d[i + 2] = v;
        });
      } },
    { id: 'photofilter', label: 'Photo Filter', icon: '◎', params: [{ key: 'color', label: 'Filter colour', type: 'colour', def: '#ec8a00' }, R('density', 'Density', 1, 100, 25), { key: 'keep', label: 'Preserve luminosity', type: 'check', def: 1 }],
      apply: (img, p) => {
        const c = U.hexToRgb(p.color), k = p.density / 100;
        each(img, (d, i) => {
          const l = U.luma(d[i], d[i + 1], d[i + 2]);
          let r = d[i] + (d[i] * c[0] / 255 - d[i]) * k * 1.0 + (c[0] - d[i]) * k * 0.15;
          let g = d[i + 1] + (d[i + 1] * c[1] / 255 - d[i + 1]) * k + (c[1] - d[i + 1]) * k * 0.15;
          let b = d[i + 2] + (d[i + 2] * c[2] / 255 - d[i + 2]) * k + (c[2] - d[i + 2]) * k * 0.15;
          if (p.keep) { const dl = l - U.luma(r, g, b); r += dl; g += dl; b += dl; }
          d[i] = cl(r); d[i + 1] = cl(g); d[i + 2] = cl(b);
        });
      } },
    { id: 'gradientmap', label: 'Gradient Map', icon: '▤', custom: 'gradient', defaults: () => ({ to: 'bg', fg: '#1b1530', bg: '#ffd9a0', reverse: 0 }),
      apply: (img, p) => {
        const lut = ND.Render.gradientLUT(p.fg, p.bg, p.to, p.reverse);
        each(img, (d, i) => { const k = Math.round((U.luma(d[i], d[i + 1], d[i + 2]) / 255) * 1023) * 4; d[i] = lut[k]; d[i + 1] = lut[k + 1]; d[i + 2] = lut[k + 2]; });
      } },
    { id: 'selective', label: 'Selective Colour', icon: '◍', custom: 'selective', defaults: () => { const o = {}; ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks'].forEach((k) => { o[k] = { c: 0, m: 0, y: 0, k: 0 }; }); return o; },
      apply: (img, p) => each(img, (d, i) => {
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), mid = r + g + b - mx - mn;
        const W = {};
        W.reds = r === mx ? mx - mid : 0; W.cyans = r === mn ? mid - mn : 0;
        W.greens = g === mx ? mx - mid : 0; W.magentas = g === mn ? mid - mn : 0;
        W.blues = b === mx ? mx - mid : 0; W.yellows = b === mn ? mid - mn : 0;
        W.whites = mn > 0.5 ? (mn - 0.5) * 2 : 0; W.blacks = mx < 0.5 ? (0.5 - mx) * 2 : 0; W.neutrals = Math.max(0, 1 - Math.abs(mx - 0.5) - Math.abs(mn - 0.5)) * (1 - (mx - mn));
        let dr = 0, dg = 0, db = 0;
        for (const k in W) {
          const w = W[k], a = p[k];
          if (!w || !a) continue;
          const kk = a.k / 100;
          dr -= w * (a.c / 100 + kk) * (a.c >= 0 ? r : 1 - r);
          dg -= w * (a.m / 100 + kk) * (a.m >= 0 ? g : 1 - g);
          db -= w * (a.y / 100 + kk) * (a.y >= 0 ? b : 1 - b);
        }
        d[i] = cl((r + dr) * 255); d[i + 1] = cl((g + dg) * 255); d[i + 2] = cl((b + db) * 255);
      }) },
    { id: 'invert', label: 'Invert', icon: '◒', params: [], apply: (img) => each(img, (d, i) => { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }) },
    { id: 'threshold', label: 'Threshold', icon: '◼', params: [R('lvl', 'Level', 1, 254, 128)], apply: (img, p) => each(img, (d, i) => { d[i] = d[i + 1] = d[i + 2] = U.luma(d[i], d[i + 1], d[i + 2]) >= p.lvl ? 255 : 0; }) },
    { id: 'posterize', label: 'Posterize', icon: '▦', params: [R('lv', 'Levels', 2, 32, 6)], apply: (img, p) => { const s = 255 / (p.lv - 1), lut = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) lut[v] = Math.round(v / s) * s; lut3(img, lut, lut, lut); } },
    { id: 'develop', label: 'Develop (photo)', icon: '📷', custom: 'develop',
      params: [R('temp', 'Temperature', -100, 100, 0), R('tint', 'Tint', -100, 100, 0), R('exposure', 'Exposure', -4, 4, 0, 0.05), R('contrast', 'Contrast', -100, 100, 0), R('highlights', 'Highlights', -100, 100, 0), R('shadows', 'Shadows', -100, 100, 0),
        R('whites', 'Whites', -100, 100, 0), R('blacks', 'Blacks', -100, 100, 0), R('clarity', 'Clarity', -100, 100, 0), R('dehaze', 'Dehaze', -100, 100, 0), R('vibrance', 'Vibrance', -100, 100, 0), R('saturation', 'Saturation', -100, 100, 0),
        R('sharpen', 'Sharpen', 0, 150, 0), R('vignette', 'Vignette', -100, 100, 0), R('grain', 'Grain', 0, 100, 0)],
      apply: (img, p, env) => {
        const w = img.width, h = img.height, d = img.data;
        const blurBig = p.clarity ? blurredCopy(img, 22) : null, blurSmall = p.sharpen ? blurredCopy(img, 1.6) : null;
        const em = Math.pow(2, p.exposure), wb = [1 + p.temp * 0.0028 + p.tint * 0.0008, 1 - p.tint * 0.0024, 1 - p.temp * 0.0028 + p.tint * 0.0008];
        const con = p.contrast / 100, hl = p.highlights / 100, sh = p.shadows / 100, bp = -p.blacks / 100 * 0.12, wp = 1 - p.whites / 100 * 0.12;
        const clar = p.clarity / 100 * 0.9, dh = p.dehaze / 100, vib = p.vibrance / 100, sat = p.saturation / 100, shp = p.sharpen / 100, vig = p.vignette / 100, gr = p.grain / 100;
        const cxd = env.docW / 2, cyd = env.docH / 2, md = Math.hypot(cxd, cyd);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (!d[i + 3]) continue;
          let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
          if (shp) { r += (r - blurSmall[i] / 255) * shp; g += (g - blurSmall[i + 1] / 255) * shp; b += (b - blurSmall[i + 2] / 255) * shp; }
          r *= wb[0] * em; g *= wb[1] * em; b *= wb[2] * em;
          if (dh) {
            const dc = Math.min(r, g, b);
            if (dh > 0) { const k = dh * 0.75, t = Math.max(0.25, 1 - k * dc); r = (r - k * dc * 0.9) / t; g = (g - k * dc * 0.9) / t; b = (b - k * dc * 0.9) / t; }
            else { const k = -dh * 0.5; r = r * (1 - k) + k * 0.82; g = g * (1 - k) + k * 0.84; b = b * (1 - k) + k * 0.88; }
          }
          let L = 0.299 * r + 0.587 * g + 0.114 * b;
          if (sh || hl) {
            const ws = Math.pow(U.clamp(1 - L, 0, 1), 2.2), wh = Math.pow(U.clamp(L, 0, 1), 2.2);
            const dl = (sh > 0 ? sh * ws * (1 - L) * 0.9 : sh * ws * L * 0.6) + (hl > 0 ? hl * wh * (1 - L) * 0.6 : hl * wh * L * 0.55);
            r += dl; g += dl; b += dl; L += dl;
          }
          if (clar) {
            const bl = (0.299 * blurBig[i] + 0.587 * blurBig[i + 1] + 0.114 * blurBig[i + 2]) / 255, mid = 1 - Math.pow(Math.abs(2 * L - 1), 2), dl = (L - bl) * clar * mid * 1.6;
            r += dl; g += dl; b += dl;
          }
          if (con) { const k = 1 + con * (con > 0 ? 0.9 : 0.75); r = 0.5 + (r - 0.5) * k; g = 0.5 + (g - 0.5) * k; b = 0.5 + (b - 0.5) * k; }
          if (bp || wp !== 1) { const s = 1 / (wp - bp); r = (r - bp) * s; g = (g - bp) * s; b = (b - bp) * s; }
          if (vib || sat) {
            const l2 = 0.299 * r + 0.587 * g + 0.114 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b), cs = mx > 0 ? (mx - mn) / mx : 0;
            const k = 1 + sat + vib * (1 - cs) * 1.3;
            r = l2 + (r - l2) * k; g = l2 + (g - l2) * k; b = l2 + (b - l2) * k;
          }
          if (vig) { const t = Math.hypot(x + env.x - cxd, y + env.y - cyd) / md, f = Math.pow(U.clamp((t - 0.35) / 0.65, 0, 1), 2) * vig; if (f > 0) { r *= 1 - f; g *= 1 - f; b *= 1 - f; } else { r -= (1 - r) * f; g -= (1 - g) * f; b -= (1 - b) * f; } }
          if (gr) { const n = hashNoise(x + env.x, y + env.y) * gr * 0.22; r += n; g += n; b += n; }
          d[i] = cl(r * 255); d[i + 1] = cl(g * 255); d[i + 2] = cl(b * 255);
        }
      } },
    /* fill layers: they generate content instead of adjusting what is below */
    // Filter layer: any filter, kept editable (a "smart filter" when clipped to a layer)
    { id: 'filter', label: 'Filter layer', icon: 'ƒ', custom: 'filter', defaults: () => ({ fid: 'blur', fp: {} }),
      apply: (img, p, env) => {
        const F = ND.Filters, f = F && F.byId(p.fid);
        if (!f) return;
        const c = U.canvas(img.width, img.height);
        U.ctx(c).putImageData(img, 0, 0);
        const out = F.run(p.fid, c, p.fp || {}, env);
        img.data.set(U.ctx(out).getImageData(0, 0, img.width, img.height).data);
      } },
    { id: 'solid', label: 'Solid Colour', icon: '■', fill: true, params: [{ key: 'color', label: 'Colour', type: 'colour', def: '#4d8fd1' }] },
    { id: 'gradientfill', label: 'Gradient Fill', icon: '◩', fill: true, custom: 'gradient', defaults: () => ({ to: 'bg', fg: '#2b1055', bg: '#feb47b', reverse: 0, type: 'linear', angle: 90, scale: 100 }) },
  ];

  function find(kind) { return KINDS.find((k) => k.id === kind); }
  function defaults(kind) {
    const k = find(kind);
    if (!k) return {};
    if (k.defaults) {
      const o = k.defaults();
      (k.params || []).forEach((q) => { if (o[q.key] === undefined) o[q.key] = q.def; });
      return o;
    }
    const o = {};
    (k.params || []).forEach((q) => { o[q.key] = q.def; });
    return o;
  }
  function apply(kind, img, params, env) {
    const k = find(kind);
    if (!k || !k.apply) return;
    k.apply(img, Object.assign(defaults(kind), params), env || { x: 0, y: 0, docW: img.width, docH: img.height });
  }
  function renderFill(kind, ctx, r, p, doc) {
    if (kind === 'solid') { ctx.fillStyle = p.color; ctx.fillRect(0, 0, r.w, r.h); return; }
    // gradient fill across the whole document
    const W = doc.width, H = doc.height, a = (p.angle * Math.PI) / 180, len = (Math.abs(Math.cos(a)) * W + Math.abs(Math.sin(a)) * H) * (p.scale / 100) / 2;
    const cx = W / 2, cy = H / 2, p0 = { x: cx - Math.cos(a) * len - r.x, y: cy + Math.sin(a) * len - r.y }, p1 = { x: cx + Math.cos(a) * len - r.x, y: cy - Math.sin(a) * len - r.y };
    if (p.type === 'radial') { p0.x = cx - r.x; p0.y = cy - r.y; }
    ND.Render.renderGradient(ctx, r.w, r.h, p0, p1, { fg: p.fg, bg: p.bg, to: p.to, type: p.type || 'linear', repeat: 'none', dither: true, reverse: p.reverse, opacity: 1 });
  }
  function pad(kind, params) {
    if (kind === 'develop' && params) return (params.clarity ? 40 : 0) || (params.sharpen ? 4 : 0);
    if (kind === 'filter' && params) {
      // filters that look at neighbouring pixels need a margin around each redrawn area
      const f = ND.Filters && ND.Filters.byId(params.fid);
      if (!f || f.cat === 'Adjust') return 0;
      const big = Math.max(8, ...f.params.map((q) => (params.fp && params.fp[q.key] != null ? +params.fp[q.key] : q.def) || 0));
      return Math.min(240, Math.round(big * 3 + 16));
    }
    return 0;
  }
  // Auto tone for Develop: stretch the histogram and neutralise a colour cast.
  function autoDevelop(canvas) {
    const H = histogram(canvas), total = H.l.reduce((a, b) => a + b, 0) || 1;
    const pct = (arr, q) => { let s = 0; for (let i = 0; i < 256; i++) { s += arr[i]; if (s >= total * q) return i; } return 255; };
    const lo = pct(H.l, 0.005), hi = pct(H.l, 0.995), mean = H.l.reduce((a, c, i) => a + c * i, 0) / total;
    const rm = H.r.reduce((a, c, i) => a + c * i, 0) / total, bm = H.b.reduce((a, c, i) => a + c * i, 0) / total;
    return {
      blacks: U.clamp(Math.round((-(lo / 255) / 0.12) * 100 * 0.8), -100, 0),
      whites: U.clamp(Math.round((1 - hi / 255) / 0.12 * 100 * 0.8), -100, 100),
      exposure: Math.round(U.clamp(Math.log2(118 / Math.max(10, mean)) * 0.6, -2, 2) * 20) / 20,
      temp: U.clamp(Math.round((bm - rm) / 2), -60, 60), shadows: mean < 100 ? 25 : 0, highlights: hi > 250 ? -25 : 0, vibrance: 15,
    };
  }

  ND.Adjust = {
    KINDS, find, defaults, apply, renderFill, pad, histogram, curveLUT, levelsLUT, autoDevelop, identityLevels,
    label: (k) => (find(k) || { label: k }).label,
    isFill: (k) => !!(find(k) || {}).fill,
  };
})();
