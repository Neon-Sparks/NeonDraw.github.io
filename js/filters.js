/* Neon Draw — filters. Each filter works on ImageData (px) or returns a canvas (cv). */
'use strict';
(function () {
  const U = ND.U;
  const R = (key, label, min, max, def, step) => ({ key, label, min, max, def, step: step || 1 });
  const CHK = (key, label, def) => ({ key, label, type: 'check', def: def ? 1 : 0 });

  /* ---------- shared helpers ---------- */
  let filterSupport = null;
  function canvasFilterOK() {
    if (filterSupport === null) {
      try {
        const c = U.canvas(4, 4), x = c.getContext('2d');
        x.filter = 'blur(2px)';
        filterSupport = x.filter === 'blur(2px)';
      } catch (e) { filterSupport = false; }
    }
    return filterSupport;
  }
  // Three-pass box blur approximating a gaussian (premultiplied to avoid dark halos).
  function boxBlurRGBA(d, w, h, r) {
    r = Math.max(1, Math.round(r));
    const n = w * h, ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = d[j + 3] / 255;
      ch[0][i] = d[j] * a; ch[1][i] = d[j + 1] * a; ch[2][i] = d[j + 2] * a; ch[3][i] = d[j + 3];
    }
    const tmp = new Float32Array(n);
    const pass = (src, horiz) => {
      const len = horiz ? w : h, lines = horiz ? h : w, inv = 1 / (2 * r + 1);
      for (let l = 0; l < lines; l++) {
        const idx = (k) => (horiz ? l * w + U.clamp(k, 0, w - 1) : U.clamp(k, 0, h - 1) * w + l);
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += src[idx(k)];
        for (let k = 0; k < len; k++) {
          tmp[horiz ? l * w + k : k * w + l] = acc * inv;
          acc += src[idx(k + r + 1)] - src[idx(k - r)];
        }
      }
      src.set(tmp);
    };
    for (const c of ch) for (let it = 0; it < 3; it++) { pass(c, true); pass(c, false); }
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = ch[3][i], k = a > 0 ? 255 / a : 0;
      d[j] = ch[0][i] * k; d[j + 1] = ch[1][i] * k; d[j + 2] = ch[2][i] * k; d[j + 3] = a;
    }
  }
  function blurCanvas(src, radius) {
    const c = U.canvas(src.width, src.height), x = U.ctx(c);
    if (radius <= 0) { x.drawImage(src, 0, 0); return c; }
    if (canvasFilterOK()) {
      x.filter = 'blur(' + radius + 'px)';
      x.drawImage(src, 0, 0);
      x.filter = 'none';
      return c;
    }
    x.drawImage(src, 0, 0);
    const id = x.getImageData(0, 0, c.width, c.height);
    boxBlurRGBA(id.data, c.width, c.height, radius * 0.58);
    x.putImageData(id, 0, 0);
    return c;
  }
  function toCanvas(img) { const c = U.canvas(img.width, img.height); U.ctx(c).putImageData(img, 0, 0); return c; }
  function sampler(d, w, h, wrap) {
    return function (x, y, out) {
      if (wrap) { x = ((x % w) + w) % w; y = ((y % h) + h) % h; }
      x = U.clamp(x, 0, w - 1.001); y = U.clamp(y, 0, h - 1.001);
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const x1 = wrap ? (x0 + 1) % w : Math.min(w - 1, x0 + 1), y1 = wrap ? (y0 + 1) % h : Math.min(h - 1, y0 + 1);
      const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, e = (y1 * w + x1) * 4;
      for (let k = 0; k < 4; k++) out[k] = (d[a + k] * (1 - fx) + d[b + k] * fx) * (1 - fy) + (d[c + k] * (1 - fx) + d[e + k] * fx) * fy;
      return out;
    };
  }
  function remap(img, fn, wrap) {
    const { width: w, height: h } = img, src = new Uint8ClampedArray(img.data), d = img.data;
    const s = sampler(src, w, h, wrap), px = [0, 0, 0, 0], p = { x: 0, y: 0 };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      fn(x, y, p);
      s(p.x, p.y, px);
      const j = (y * w + x) * 4;
      d[j] = px[0]; d[j + 1] = px[1]; d[j + 2] = px[2]; d[j + 3] = px[3];
    }
  }
  const perPixel = (fn) => (img, p, env) => {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) fn(d, i, p, env);
  };
  // Silhouette of a canvas filled with a colour.
  function silhouette(src, colour) {
    const c = U.clone(src), x = U.ctx(c);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = colour;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /* ---------- filter list ---------- */
  const F = [
    /* Adjust */
    { id: 'brightcon', label: 'Brightness / Contrast', cat: 'Adjust', params: [R('b', 'Brightness', -100, 100, 15), R('c', 'Contrast', -100, 100, 15)],
      px: perPixel((d, i, p) => {
        const b = (p.b / 100) * 255, f = (259 * (p.c * 2.55 + 255)) / (255 * (259 - p.c * 2.55));
        for (let k = 0; k < 3; k++) d[i + k] = f * (d[i + k] + b - 128) + 128;
      }) },
    { id: 'levels', label: 'Levels', cat: 'Adjust', params: [R('ib', 'Input black', 0, 254, 0), R('iw', 'Input white', 1, 255, 255), R('g', 'Gamma ×100', 10, 400, 100), R('ob', 'Output black', 0, 255, 0), R('ow', 'Output white', 0, 255, 255)],
      px: (img, p) => {
        const lut = new Uint8ClampedArray(256), iw = Math.max(p.ib + 1, p.iw), g = 100 / p.g;
        for (let v = 0; v < 256; v++) { const t = U.clamp((v - p.ib) / (iw - p.ib), 0, 1); lut[v] = p.ob + Math.pow(t, g) * (p.ow - p.ob); }
        const d = img.data; for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
      } },
    { id: 'autocontrast', label: 'Auto Contrast', cat: 'Adjust', params: [],
      px: (img) => {
        const d = img.data; let lo = 255, hi = 0;
        for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const l = U.luma(d[i], d[i + 1], d[i + 2]); if (l < lo) lo = l; if (l > hi) hi = l; }
        const s = 255 / Math.max(1, hi - lo);
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = (d[i + k] - lo) * s;
      } },
    { id: 'hsl', label: 'Hue / Saturation / Lightness', cat: 'Adjust', params: [R('h', 'Hue', -180, 180, 0), R('s', 'Saturation', -100, 100, 0), R('l', 'Lightness', -100, 100, 0), CHK('col', 'Colorize', false)],
      px: perPixel((d, i, p) => {
        let [h, s, l] = U.rgbToHsl(d[i], d[i + 1], d[i + 2]);
        if (p.col) { h = (p.h + 360) % 360; s = U.clamp(0.25 + p.s / 100, 0, 1); }
        else { h += p.h; s = U.clamp(p.s >= 0 ? s + (1 - s) * (p.s / 100) * s : s * (1 + p.s / 100), 0, 1); }
        l = p.l >= 0 ? l + (1 - l) * (p.l / 100) : l * (1 + p.l / 100);
        const c = U.hslToRgb(h, s, U.clamp(l, 0, 1)); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      }) },
    { id: 'colorbalance', label: 'Colour Balance', cat: 'Adjust', params: [R('r', 'Cyan ↔ Red', -100, 100, 0), R('g', 'Magenta ↔ Green', -100, 100, 0), R('b', 'Yellow ↔ Blue', -100, 100, 0)],
      px: perPixel((d, i, p) => { d[i] += p.r * 1.2; d[i + 1] += p.g * 1.2; d[i + 2] += p.b * 1.2; }) },
    { id: 'temperature', label: 'Temperature / Tint', cat: 'Adjust', params: [R('t', 'Cool ↔ Warm', -100, 100, 25), R('n', 'Green ↔ Magenta', -100, 100, 0)],
      px: perPixel((d, i, p) => { d[i] += p.t * 0.6; d[i + 2] -= p.t * 0.6; d[i + 1] -= p.n * 0.5; d[i] += p.n * 0.15; d[i + 2] += p.n * 0.15; }) },
    { id: 'vibrance', label: 'Vibrance', cat: 'Adjust', params: [R('v', 'Vibrance', -100, 100, 40)],
      px: perPixel((d, i, p) => {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
        const amt = ((Math.abs(mx - avg) * 2) / 255) * (-p.v / 100) * 2;
        for (let k = 0; k < 3; k++) if (d[i + k] !== mx) d[i + k] += (mx - d[i + k]) * amt;
      }) },
    { id: 'exposure', label: 'Exposure', cat: 'Adjust', params: [R('e', 'Exposure (EV ×10)', -40, 40, 5), R('g', 'Gamma ×100', 30, 300, 100)],
      px: (img, p) => {
        const m = Math.pow(2, p.e / 10), g = 100 / p.g, lut = new Uint8ClampedArray(256);
        for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(U.clamp((v / 255) * m, 0, 1), g);
        const d = img.data; for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
      } },
    { id: 'invert', label: 'Invert', cat: 'Adjust', params: [], px: perPixel((d, i) => { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }) },
    { id: 'grayscale', label: 'Desaturate', cat: 'Adjust', params: [], px: perPixel((d, i) => { d[i] = d[i + 1] = d[i + 2] = U.luma(d[i], d[i + 1], d[i + 2]); }) },
    { id: 'sepia', label: 'Sepia', cat: 'Adjust', params: [],
      px: perPixel((d, i) => {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        d[i] = r * 0.393 + g * 0.769 + b * 0.189; d[i + 1] = r * 0.349 + g * 0.686 + b * 0.168; d[i + 2] = r * 0.272 + g * 0.534 + b * 0.131;
      }) },
    { id: 'threshold', label: 'Threshold', cat: 'Adjust', params: [R('lvl', 'Level', 1, 254, 128)],
      px: perPixel((d, i, p) => { d[i] = d[i + 1] = d[i + 2] = U.luma(d[i], d[i + 1], d[i + 2]) >= p.lvl ? 255 : 0; }) },
    { id: 'posterize', label: 'Posterize', cat: 'Adjust', params: [R('lv', 'Levels', 2, 16, 4)],
      px: perPixel((d, i, p) => { const s = 255 / (p.lv - 1); for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] / s) * s; }) },
    { id: 'solarize', label: 'Solarize', cat: 'Adjust', params: [R('t', 'Threshold', 0, 255, 128)],
      px: perPixel((d, i, p) => { for (let k = 0; k < 3; k++) if (d[i + k] > p.t) d[i + k] = 255 - d[i + k]; }) },
    { id: 'gradientmap', label: 'Gradient Map (FG → BG)', cat: 'Adjust', params: [CHK('rev', 'Reverse', false)],
      px: (img, p, env) => {
        let a = U.hexToRgb(env.fg), b = U.hexToRgb(env.bg);
        if (p.rev) { const t = a; a = b; b = t; }
        perPixel((d, i) => { const t = U.luma(d[i], d[i + 1], d[i + 2]) / 255; for (let k = 0; k < 3; k++) d[i + k] = a[k] + (b[k] - a[k]) * t; })(img);
      } },
    { id: 'colortoalpha', label: 'Colour to Alpha (BG colour)', cat: 'Adjust', params: [R('th', 'Threshold', 1, 255, 255)],
      px: (img, p, env) => {
        const c = U.hexToRgb(env.bg), d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          let a = 0;
          for (let k = 0; k < 3; k++) {
            const v = d[i + k], cv = c[k];
            const ak = v > cv ? (v - cv) / Math.max(1, Math.min(p.th, 255 - cv)) : v < cv ? (cv - v) / Math.max(1, Math.min(p.th, cv)) : 0;
            if (ak > a) a = ak;
          }
          a = U.clamp(a, 0, 1);
          if (a > 0) for (let k = 0; k < 3; k++) d[i + k] = (d[i + k] - c[k]) / a + c[k];
          d[i + 3] *= a;
        }
      } },

    /* Blur */
    { id: 'blur', label: 'Gaussian Blur', cat: 'Blur', params: [R('r', 'Radius', 1, 60, 6)], cv: (src, p) => blurCanvas(src, p.r) },
    { id: 'boxblur', label: 'Box Blur', cat: 'Blur', params: [R('r', 'Radius', 1, 40, 4)],
      px: (img, p) => { boxBlurRGBA(img.data, img.width, img.height, p.r / 3); } },
    { id: 'motionblur', label: 'Motion Blur', cat: 'Blur', params: [R('len', 'Length', 2, 150, 24), R('ang', 'Angle', 0, 359, 0)],
      px: (img, p) => {
        const { width: w, height: h } = img, s = new Uint8ClampedArray(img.data), d = img.data;
        const a = (p.ang * Math.PI) / 180, cx = Math.cos(a), cy = Math.sin(a), n = Math.max(2, Math.round(p.len)), half = n / 2;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let r = 0, g = 0, b = 0, al = 0, c = 0;
          for (let t = -half; t <= half; t += 1) {
            const xx = U.clamp(Math.round(x + cx * t), 0, w - 1), yy = U.clamp(Math.round(y + cy * t), 0, h - 1), j = (yy * w + xx) * 4, aa = s[j + 3];
            r += s[j] * aa; g += s[j + 1] * aa; b += s[j + 2] * aa; al += aa; c++;
          }
          const j = (y * w + x) * 4;
          if (al > 0) { d[j] = r / al; d[j + 1] = g / al; d[j + 2] = b / al; }
          d[j + 3] = al / c;
        }
      } },
    { id: 'zoomblur', label: 'Zoom Blur', cat: 'Blur', params: [R('amt', 'Amount', 1, 100, 25), R('cx', 'Centre X %', 0, 100, 50), R('cy', 'Centre Y %', 0, 100, 50)],
      px: (img, p) => {
        const { width: w, height: h } = img, s = new Uint8ClampedArray(img.data), d = img.data, cx = (w * p.cx) / 100, cy = (h * p.cy) / 100, N = 24, k = p.amt / 400;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let r = 0, g = 0, b = 0, a = 0;
          for (let i = 0; i < N; i++) {
            const t = 1 - (k * i) / N, xx = U.clamp(Math.round(cx + (x - cx) * t), 0, w - 1), yy = U.clamp(Math.round(cy + (y - cy) * t), 0, h - 1), j = (yy * w + xx) * 4;
            r += s[j]; g += s[j + 1]; b += s[j + 2]; a += s[j + 3];
          }
          const j = (y * w + x) * 4; d[j] = r / N; d[j + 1] = g / N; d[j + 2] = b / N; d[j + 3] = a / N;
        }
      } },
    { id: 'spinblur', label: 'Spin Blur', cat: 'Blur', params: [R('ang', 'Angle', 1, 45, 8), R('cx', 'Centre X %', 0, 100, 50), R('cy', 'Centre Y %', 0, 100, 50)],
      px: (img, p) => {
        const { width: w, height: h } = img, s = new Uint8ClampedArray(img.data), d = img.data, cx = (w * p.cx) / 100, cy = (h * p.cy) / 100, N = 20, A = (p.ang * Math.PI) / 180;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let r = 0, g = 0, b = 0, a = 0;
          const dx = x - cx, dy = y - cy;
          for (let i = 0; i < N; i++) {
            const t = (i / (N - 1) - 0.5) * A, c = Math.cos(t), sn = Math.sin(t);
            const xx = U.clamp(Math.round(cx + dx * c - dy * sn), 0, w - 1), yy = U.clamp(Math.round(cy + dx * sn + dy * c), 0, h - 1), j = (yy * w + xx) * 4;
            r += s[j]; g += s[j + 1]; b += s[j + 2]; a += s[j + 3];
          }
          const j = (y * w + x) * 4; d[j] = r / N; d[j + 1] = g / N; d[j + 2] = b / N; d[j + 3] = a / N;
        }
      } },
    { id: 'median', label: 'Median (Despeckle)', cat: 'Blur', params: [R('r', 'Radius', 1, 4, 1)],
      px: (img, p) => {
        const { width: w, height: h } = img, s = new Uint8ClampedArray(img.data), d = img.data, r = p.r;
        const buf = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          buf.length = 0;
          for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
            const k = (U.clamp(y + j, 0, h - 1) * w + U.clamp(x + i, 0, w - 1)) * 4;
            buf.push(Math.round(s[k] * 0.299 + s[k + 1] * 0.587 + s[k + 2] * 0.114) * 67108864 + (k >> 2));
          }
          buf.sort((a, b) => a - b);
          const k = (buf[buf.length >> 1] % 67108864) * 4, o = (y * w + x) * 4;
          d[o] = s[k]; d[o + 1] = s[k + 1]; d[o + 2] = s[k + 2]; d[o + 3] = s[k + 3];
        }
      } },

    /* Enhance */
    { id: 'sharpen', label: 'Sharpen', cat: 'Enhance', params: [R('amt', 'Amount', 1, 100, 40)],
      px: (img, p) => {
        const { width: w, height: h } = img, s = new Uint8ClampedArray(img.data), d = img.data, k = p.amt / 100;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          const i = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) d[i + c] = s[i + c] + (4 * s[i + c] - s[i - 4 + c] - s[i + 4 + c] - s[i - w * 4 + c] - s[i + w * 4 + c]) * k;
        }
      } },
    { id: 'unsharp', label: 'Unsharp Mask', cat: 'Enhance', params: [R('amt', 'Amount', 1, 300, 80), R('r', 'Radius', 1, 30, 3)],
      cv: (src, p) => {
        const bl = U.ctx(blurCanvas(src, p.r)).getImageData(0, 0, src.width, src.height).data;
        const out = U.clone(src), x = U.ctx(out), id = x.getImageData(0, 0, src.width, src.height), d = id.data, k = p.amt / 100;
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = d[i + c] + (d[i + c] - bl[i + c]) * k;
        x.putImageData(id, 0, 0);
        return out;
      } },
    { id: 'clarity', label: 'Clarity (local contrast)', cat: 'Enhance', params: [R('amt', 'Amount', 1, 100, 35)],
      cv: (src, p) => ND.Filters.byId('unsharp').cv(src, { amt: p.amt, r: Math.max(12, Math.min(src.width, src.height) / 60) }) },

    /* Edge */
    { id: 'edge', label: 'Edge Detect', cat: 'Edge', params: [],
      px: (img) => {
        const { width: w, height: h } = img, s = new Uint8ClampedArray(img.data), d = img.data;
        const L = (x, y) => { const j = (U.clamp(y, 0, h - 1) * w + U.clamp(x, 0, w - 1)) * 4; return s[j] * 0.299 + s[j + 1] * 0.587 + s[j + 2] * 0.114; };
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const gx = -L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1) + L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1);
          const gy = -L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1) + L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1);
          const j = (y * w + x) * 4; d[j] = d[j + 1] = d[j + 2] = Math.min(255, Math.hypot(gx, gy));
        }
      } },
    { id: 'inklines', label: 'Ink Lines (sketch)', cat: 'Edge', params: [R('t', 'Sensitivity', 1, 100, 50)],
      px: (img, p) => {
        ND.Filters.byId('edge').px(img);
        const d = img.data, k = 1 + p.t / 25;
        for (let i = 0; i < d.length; i += 4) { const v = 255 - Math.min(255, d[i] * k); d[i] = d[i + 1] = d[i + 2] = v; }
      } },
    { id: 'emboss', label: 'Emboss', cat: 'Edge', params: [R('amt', 'Depth', 1, 100, 50)],
      px: (img, p) => {
        const { width: w, height: h } = img, s = new Uint8ClampedArray(img.data), d = img.data, k = p.amt / 25;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          const i = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) d[i + c] = 128 + (s[i + w * 4 + 4 + c] - s[i - w * 4 - 4 + c]) * k;
        }
      } },

    /* Artistic */
    { id: 'noise', label: 'Add Noise', cat: 'Artistic', params: [R('amt', 'Amount', 1, 100, 20), CHK('mono', 'Monochrome', true)],
      px: perPixel((d, i, p) => {
        if (p.mono) { const n = (Math.random() - 0.5) * 2 * p.amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
        else for (let k = 0; k < 3; k++) d[i + k] += (Math.random() - 0.5) * 2 * p.amt;
      }) },
    { id: 'filmgrain', label: 'Film Grain', cat: 'Artistic', params: [R('amt', 'Amount', 1, 100, 30), R('size', 'Size', 1, 4, 1)],
      px: (img, p) => {
        const { width: w, height: h } = img, d = img.data, s = p.size;
        const gw = Math.ceil(w / s), gh = Math.ceil(h / s), g = new Float32Array(gw * gh);
        for (let i = 0; i < g.length; i++) g[i] = (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const j = (y * w + x) * 4, l = U.luma(d[j], d[j + 1], d[j + 2]) / 255, wgt = 1 - Math.abs(l - 0.5) * 1.4;
          const n = g[((y / s) | 0) * gw + ((x / s) | 0)] * p.amt * wgt;
          d[j] += n; d[j + 1] += n; d[j + 2] += n;
        }
      } },
    { id: 'pixelate', label: 'Pixelate', cat: 'Artistic', params: [R('sz', 'Size', 2, 96, 8)],
      px: (img, p) => {
        const { width: w, height: h } = img, d = img.data, z = p.sz;
        for (let by = 0; by < h; by += z) for (let bx = 0; bx < w; bx += z) {
          let r = 0, g = 0, b = 0, a = 0, n = 0;
          for (let y = by; y < Math.min(h, by + z); y++) for (let x = bx; x < Math.min(w, bx + z); x++) { const j = (y * w + x) * 4; r += d[j]; g += d[j + 1]; b += d[j + 2]; a += d[j + 3]; n++; }
          for (let y = by; y < Math.min(h, by + z); y++) for (let x = bx; x < Math.min(w, bx + z); x++) { const j = (y * w + x) * 4; d[j] = r / n; d[j + 1] = g / n; d[j + 2] = b / n; d[j + 3] = a / n; }
        }
      } },
    { id: 'vignette', label: 'Vignette', cat: 'Artistic', params: [R('amt', 'Strength', 1, 100, 40), R('size', 'Size', 10, 100, 60)],
      px: (img, p) => {
        const { width: w, height: h } = img, d = img.data, cx = w / 2, cy = h / 2, md = Math.hypot(cx, cy), inner = p.size / 100;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const t = Math.hypot(x - cx, y - cy) / md, f = 1 - (p.amt / 100) * U.clamp((t - inner * 0.6) / (1 - inner * 0.6), 0, 1) ** 2, j = (y * w + x) * 4;
          d[j] *= f; d[j + 1] *= f; d[j + 2] *= f;
        }
      } },
    { id: 'oilpaint', label: 'Oil Paint (Kuwahara)', cat: 'Artistic', params: [R('r', 'Brush size', 1, 12, 4)],
      px: (img, p) => {
        const { width: w, height: h } = img, d = img.data, r = p.r, W = w + 1;
        const sum = [0, 1, 2].map(() => new Float64Array(W * (h + 1))), sq = new Float64Array(W * (h + 1));
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const j = (y * w + x) * 4, o = (y + 1) * W + x + 1, l = U.luma(d[j], d[j + 1], d[j + 2]);
          for (let c = 0; c < 3; c++) sum[c][o] = d[j + c] + sum[c][o - 1] + sum[c][o - W] - sum[c][o - W - 1];
          sq[o] = l * l + sq[o - 1] + sq[o - W] - sq[o - W - 1];
        }
        const area = (t, x0, y0, x1, y1) => t[(y1 + 1) * W + x1 + 1] - t[y0 * W + x1 + 1] - t[(y1 + 1) * W + x0] + t[y0 * W + x0];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let best = Infinity, br = 0, bg = 0, bb = 0;
          for (const [qx, qy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
            const x0 = U.clamp(x + qx * r, 0, w - 1), x1 = U.clamp(x + (qx + 1) * r, 0, w - 1), y0 = U.clamp(y + qy * r, 0, h - 1), y1 = U.clamp(y + (qy + 1) * r, 0, h - 1);
            const n = (x1 - x0 + 1) * (y1 - y0 + 1);
            const mr = area(sum[0], x0, y0, x1, y1) / n, mg = area(sum[1], x0, y0, x1, y1) / n, mb = area(sum[2], x0, y0, x1, y1) / n;
            const ml = mr * 0.299 + mg * 0.587 + mb * 0.114, v = area(sq, x0, y0, x1, y1) / n - ml * ml;
            if (v < best) { best = v; br = mr; bg = mg; bb = mb; }
          }
          const j = (y * w + x) * 4; d[j] = br; d[j + 1] = bg; d[j + 2] = bb;
        }
      } },
    { id: 'halftone', label: 'Halftone', cat: 'Artistic', params: [R('cell', 'Cell size', 3, 40, 8), R('ang', 'Angle', 0, 90, 45), CHK('colour', 'Keep colour', false)],
      cv: (src, p) => {
        const w = src.width, h = src.height, d = U.ctx(src).getImageData(0, 0, w, h).data;
        const out = U.canvas(w, h), x = U.ctx(out), a = (p.ang * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), c = p.cell, ext = Math.hypot(w, h);
        if (!p.colour) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
        for (let v = -ext; v < ext; v += c) for (let u = -ext; u < ext; u += c) {
          const px = w / 2 + u * ca - v * sa, py = h / 2 + u * sa + v * ca;
          if (px < -c || py < -c || px > w + c || py > h + c) continue;
          const j = (U.clamp(Math.round(py), 0, h - 1) * w + U.clamp(Math.round(px), 0, w - 1)) * 4;
          if (d[j + 3] < 10) continue;
          const l = U.luma(d[j], d[j + 1], d[j + 2]) / 255, rad = (c / 2) * Math.sqrt(1 - l) * 1.35;
          if (rad < 0.3) continue;
          x.fillStyle = p.colour ? 'rgb(' + d[j] + ',' + d[j + 1] + ',' + d[j + 2] + ')' : '#000';
          if (p.colour) { const rr = (c / 2) * 1.1; x.beginPath(); x.arc(px, py, rr, 0, U.TAU); x.fill(); }
          else { x.beginPath(); x.arc(px, py, rad, 0, U.TAU); x.fill(); }
        }
        return out;
      } },
    { id: 'glow', label: 'Glow / Bloom', cat: 'Artistic', params: [R('th', 'Threshold', 0, 254, 160), R('r', 'Radius', 2, 80, 18), R('amt', 'Strength', 1, 200, 80)],
      cv: (src, p) => {
        const w = src.width, h = src.height, bright = U.clone(src), bx = U.ctx(bright), id = bx.getImageData(0, 0, w, h), d = id.data;
        for (let i = 0; i < d.length; i += 4) { const l = U.luma(d[i], d[i + 1], d[i + 2]); if (l < p.th) d[i + 3] = 0; }
        bx.putImageData(id, 0, 0);
        const bl = blurCanvas(bright, p.r), out = U.clone(src), x = U.ctx(out);
        x.globalCompositeOperation = 'screen'; x.globalAlpha = Math.min(1, p.amt / 100);
        x.drawImage(bl, 0, 0);
        if (p.amt > 100) { x.globalAlpha = (p.amt - 100) / 100; x.drawImage(bl, 0, 0); }
        return out;
      } },
    { id: 'chromatic', label: 'Chromatic Aberration', cat: 'Artistic', params: [R('amt', 'Amount', 1, 50, 8)],
      px: (img, p) => {
        const { width: w, height: h } = img, s = new Uint8ClampedArray(img.data), d = img.data, smp = sampler(s, w, h, false), o = [0, 0, 0, 0], k = p.amt / 1000, cx = w / 2, cy = h / 2;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const j = (y * w + x) * 4;
          smp(cx + (x - cx) * (1 + k), cy + (y - cy) * (1 + k), o); d[j] = o[0];
          smp(cx + (x - cx) * (1 - k), cy + (y - cy) * (1 - k), o); d[j + 2] = o[2];
        }
      } },
    { id: 'dither', label: 'Dither (retro)', cat: 'Artistic', params: [R('lv', 'Levels per channel', 2, 8, 2), CHK('mono', 'Monochrome', false)],
      px: (img, p) => {
        const { width: w, height: h } = img, d = img.data, f = new Float32Array(w * h * 3), st = 255 / (p.lv - 1);
        for (let i = 0, j = 0; i < w * h; i++, j += 4) {
          if (p.mono) { const l = U.luma(d[j], d[j + 1], d[j + 2]); f[i * 3] = f[i * 3 + 1] = f[i * 3 + 2] = l; }
          else { f[i * 3] = d[j]; f[i * 3 + 1] = d[j + 1]; f[i * 3 + 2] = d[j + 2]; }
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
          const i = (y * w + x) * 3 + c, old = f[i], nv = Math.round(old / st) * st, e = old - nv;
          f[i] = nv;
          if (x + 1 < w) f[i + 3] += (e * 7) / 16;
          if (y + 1 < h) { if (x > 0) f[i + w * 3 - 3] += (e * 3) / 16; f[i + w * 3] += (e * 5) / 16; if (x + 1 < w) f[i + w * 3 + 3] += e / 16; }
        }
        for (let i = 0, j = 0; i < w * h; i++, j += 4) { d[j] = f[i * 3]; d[j + 1] = f[i * 3 + 1]; d[j + 2] = f[i * 3 + 2]; }
      } },

    /* Distort */
    { id: 'wave', label: 'Wave / Ripple', cat: 'Distort', params: [R('amp', 'Amplitude', 1, 80, 10), R('len', 'Wavelength', 4, 400, 80), CHK('both', 'Both directions', true)],
      px: (img, p) => remap(img, (x, y, o) => { o.x = x + p.amp * Math.sin((y / p.len) * U.TAU); o.y = p.both ? y + p.amp * Math.sin((x / p.len) * U.TAU) : y; }) },
    { id: 'twirl', label: 'Twirl', cat: 'Distort', params: [R('ang', 'Angle', -720, 720, 180), R('rad', 'Radius %', 5, 100, 60)],
      px: (img, p) => {
        const cx = img.width / 2, cy = img.height / 2, Rr = (Math.min(cx, cy) * p.rad) / 50, A = (p.ang * Math.PI) / 180;
        remap(img, (x, y, o) => {
          const dx = x - cx, dy = y - cy, dd = Math.hypot(dx, dy);
          if (dd >= Rr) { o.x = x; o.y = y; return; }
          const t = A * (1 - dd / Rr) ** 2, c = Math.cos(t), s = Math.sin(t);
          o.x = cx + dx * c - dy * s; o.y = cy + dx * s + dy * c;
        });
      } },
    { id: 'pinch', label: 'Pinch / Bulge', cat: 'Distort', params: [R('amt', 'Pinch ↔ Bulge', -100, 100, 50), R('rad', 'Radius %', 5, 100, 70)],
      px: (img, p) => {
        const cx = img.width / 2, cy = img.height / 2, Rr = (Math.min(cx, cy) * p.rad) / 50, k = p.amt / 100;
        remap(img, (x, y, o) => {
          const dx = x - cx, dy = y - cy, dd = Math.hypot(dx, dy);
          if (dd >= Rr || dd === 0) { o.x = x; o.y = y; return; }
          const f = Math.pow(dd / Rr, k > 0 ? 1 + k : 1 / (1 - k)) * Rr / dd;
          o.x = cx + dx * f; o.y = cy + dy * f;
        });
      } },
    { id: 'offset', label: 'Offset (wrap — for seamless tiles)', cat: 'Distort', params: [R('dx', 'Horizontal %', 0, 100, 50), R('dy', 'Vertical %', 0, 100, 50)],
      cv: (src, p) => {
        const w = src.width, h = src.height, ox = Math.round((w * p.dx) / 100), oy = Math.round((h * p.dy) / 100), out = U.canvas(w, h), x = U.ctx(out);
        for (const ix of [-1, 0]) for (const iy of [-1, 0]) x.drawImage(src, ox + ix * w, oy + iy * h);
        return out;
      } },

    /* Render / Layer styles */
    { id: 'clouds', label: 'Render Clouds (FG → BG)', cat: 'Render', params: [R('scale', 'Scale', 2, 32, 6), R('detail', 'Detail', 1, 8, 5), R('seed', 'Seed', 1, 999, 7)],
      cv: (src, p, env) => {
        const w = src.width, h = src.height, N = 512, n = U.fbm(N, p.scale, p.detail, p.seed, 0.55), out = U.canvas(w, h), x = U.ctx(out), id = x.createImageData(w, h), d = id.data;
        const a = U.hexToRgb(env.fg), b = U.hexToRgb(env.bg), sc = N / Math.max(w, h);
        for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
          const t = n[(((y * sc) | 0) % N) * N + (((xx * sc) | 0) % N)], j = (y * w + xx) * 4;
          d[j] = a[0] + (b[0] - a[0]) * t; d[j + 1] = a[1] + (b[1] - a[1]) * t; d[j + 2] = a[2] + (b[2] - a[2]) * t; d[j + 3] = 255;
        }
        x.putImageData(id, 0, 0);
        return out;
      }, replaces: true },
    { id: 'outline', label: 'Outline (FG colour)', cat: 'Render', params: [R('w', 'Width', 1, 60, 6)],
      cv: (src, p, env) => {
        const sil = silhouette(src, env.fg), out = U.canvas(src.width, src.height), x = U.ctx(out), n = Math.max(12, Math.round(p.w * 3));
        for (let i = 0; i < n; i++) { const a = (i / n) * U.TAU; x.drawImage(sil, Math.cos(a) * p.w, Math.sin(a) * p.w); }
        x.drawImage(sil, 0, 0);
        x.drawImage(src, 0, 0);
        return out;
      } },
    { id: 'shadow', label: 'Drop Shadow', cat: 'Render', params: [R('dx', 'Offset X', -100, 100, 10), R('dy', 'Offset Y', -100, 100, 12), R('blur', 'Blur', 0, 60, 10), R('op', 'Opacity %', 1, 100, 60)],
      cv: (src, p) => {
        const sh = blurCanvas(silhouette(src, '#000'), p.blur), out = U.canvas(src.width, src.height), x = U.ctx(out);
        x.globalAlpha = p.op / 100; x.drawImage(sh, p.dx, p.dy); x.globalAlpha = 1; x.drawImage(src, 0, 0);
        return out;
      } },
  ];

  const CATS = ['Adjust', 'Blur', 'Enhance', 'Edge', 'Artistic', 'Distort', 'Render'];

  // Apply a filter to a canvas (full layer) → new canvas.
  function run(id, src, params, env) {
    const f = F.find((q) => q.id === id);
    if (!f) return U.clone(src);
    const p = {};
    f.params.forEach((q) => { p[q.key] = params && params[q.key] != null ? +params[q.key] : q.def; });
    if (f.cv) return f.cv(src, p, env || {});
    const c = U.clone(src), x = U.ctx(c), img = x.getImageData(0, 0, c.width, c.height);
    const res = f.px(img, p, env || {}) || img;
    x.putImageData(res, 0, 0);
    return c;
  }

  ND.Filters = { list: F, CATS, run, blurCanvas, boxBlurRGBA, byId: (id) => F.find((f) => f.id === id), toCanvas, silhouette };
})();
