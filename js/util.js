/* Neon Sparks Draw — shared helpers.
 * Every script attaches to the global ND namespace (classic scripts, so the app
 * runs straight from file:// without a web server or build step). */
'use strict';
window.ND = window.ND || {};

(function () {
  const U = {};

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.TAU = Math.PI * 2;

  /* ---------- canvas helpers ---------- */
  U.colorType = 'unorm8'; // 'float16' while a 16-bit document is being edited
  U.canvas = function (w, h) {
    const c = document.createElement('canvas');
    if (U.colorType === 'float16') c._nd16 = true;
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  // Canvases we read back from often get the willReadFrequently hint.
  U.ctx = function (c) {
    if (c._nd2d) return c._nd2d;
    const x = c.getContext('2d', c._nd16 ? { willReadFrequently: true, colorType: 'float16' } : { willReadFrequently: true });
    if (!x) throw new Error('2d context unavailable');
    c._nd2d = x;
    return x;
  };
  U.clone = function (src) {
    const c = U.canvas(src.width, src.height);
    U.ctx(c).drawImage(src, 0, 0);
    return c;
  };
  U.drawSquare = function (size, fn) {
    const c = U.canvas(size, size);
    fn(U.ctx(c), size);
    return c;
  };

  /* ---------- rectangles ---------- */
  U.union = function (a, b) {
    if (!a) return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null;
    if (!b) return a;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  };
  U.intersect = function (a, b) {
    if (!a || !b) return null;
    const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };
  U.clipRect = function (r, w, h) {
    if (!r) return null;
    const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(w, Math.ceil(r.x + r.w)), y1 = Math.min(h, Math.ceil(r.y + r.h));
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  /* ---------- colour ---------- */
  U.hexToRgb = function (hex) {
    let s = String(hex || '').replace('#', '').trim();
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
  };
  U.rgbToHex = function (r, g, b) {
    const f = (v) => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    return '#' + f(r) + f(g) + f(b);
  };
  U.isHex = (s) => /^#?[0-9a-f]{6}$/i.test(String(s).trim()) || /^#?[0-9a-f]{3}$/i.test(String(s).trim());
  U.normHex = (s) => U.rgbToHex(...U.hexToRgb(s));
  U.hsvToRgb = function (h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  };
  U.rgbToHsv = function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 0) {
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return [h, mx === 0 ? 0 : d / mx, mx];
  };
  U.rgbToHsl = function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0, s = 0;
    if (d > 0) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (mx === g) h = ((b - r) / d + 2) * 60;
      else h = ((r - g) / d + 4) * 60;
    }
    return [h, s, l];
  };
  U.hslToRgb = function (h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  };
  U.luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  U.mixHex = function (a, b, t) {
    const A = U.hexToRgb(a), B = U.hexToRgb(b);
    return U.rgbToHex(U.lerp(A[0], B[0], t), U.lerp(A[1], B[1], t), U.lerp(A[2], B[2], t));
  };
  // Shade a hex colour: amt < 0 darkens, > 0 lightens.
  U.shade = (hex, amt) => (amt < 0 ? U.mixHex(hex, '#000000', -amt) : U.mixHex(hex, '#ffffff', amt));

  /* ---------- randomness & noise ---------- */
  U.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.hash = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  // Tileable value noise on a size x size grid, `cells` lattice cells per side.
  U.valueNoise = function (size, cells, seed) {
    const r = U.rng(seed), g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = r();
    const out = new Float32Array(size * size), k = cells / size;
    const sm = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++) {
      const fy = y * k, y0 = Math.floor(fy), ty = sm(fy - y0), y1 = (y0 + 1) % cells;
      for (let x = 0; x < size; x++) {
        const fx = x * k, x0 = Math.floor(fx), tx = sm(fx - x0), x1 = (x0 + 1) % cells;
        const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
        out[y * size + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
      }
    }
    return out;
  };
  // Fractal (octave) tileable noise normalised to 0..1.
  U.fbm = function (size, baseCells, octaves, seed, gain) {
    gain = gain || 0.5;
    const out = new Float32Array(size * size);
    let amp = 1, cells = baseCells, total = 0;
    for (let o = 0; o < octaves; o++) {
      const n = U.valueNoise(size, Math.min(size, cells), seed + o * 101);
      for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
      total += amp; amp *= gain; cells *= 2;
    }
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < out.length; i++) { out[i] /= total; if (out[i] < mn) mn = out[i]; if (out[i] > mx) mx = out[i]; }
    const d = mx - mn || 1;
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / d;
    return out;
  };

  /* ---------- misc ---------- */
  U.download = function (name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  };
  U.safeName = (s) => String(s || 'Untitled').replace(/[^\w\- ]+/g, '_').trim() || 'Untitled';
  U.debounce = function (fn, ms) {
    let t = 0;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  };
  U.loadImage = function (src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('image decode failed'));
      im.src = src;
    });
  };
  U.blobToImage = async function (blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob); } catch (e) { /* fall back to <img> */ }
    }
    const url = URL.createObjectURL(blob);
    try { return await U.loadImage(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  };
  U.canvasToBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type || 'image/png', q));
  U.fmtBytes = function (n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  };

  /* ---------- tiny DOM builder ---------- */
  // h('div.cls#id', {attrs/props/on*}, children...)
  U.h = function (tag, props) {
    const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
    const el = document.createElement(m[1] || 'div');
    (m[2] || '').replace(/([.#])([\w-]+)/g, (_, k, v) => {
      if (k === '.') el.classList.add(v); else el.id = v;
      return '';
    });
    let kids = Array.prototype.slice.call(arguments, 2);
    if (props && (props.nodeType || typeof props !== 'object' || Array.isArray(props))) { kids.unshift(props); props = null; }
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k in el && k !== 'list' && k !== 'type' && typeof v !== 'string') el[k] = v;
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
  };
  U.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  ND.U = U;
})();
