/* Neon Draw — paper / grain textures (tileable 256×256 height maps, 0..1).
 * A textured brush deposits paint where the paper "height" exceeds a threshold
 * that falls as pressure rises, so light strokes only catch the tooth of the paper. */
'use strict';
(function () {
  const U = ND.U, N = 256;

  function norm(a) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < a.length; i++) { if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; }
    const d = mx - mn || 1;
    for (let i = 0; i < a.length; i++) a[i] = (a[i] - mn) / d;
    return a;
  }
  // Tileable anisotropic fractal noise: different lattice counts along x and y give streaks.
  function stretched(seed, cx, cy, oct) {
    const out = new Float32Array(N * N), sm = (t) => t * t * (3 - 2 * t);
    let amp = 1;
    for (let o = 0; o < (oct || 4); o++) {
      const gx = Math.min(N, cx << o), gy = Math.min(N, cy << o), r = U.rng(seed + o * 131), g = new Float32Array(gx * gy);
      for (let i = 0; i < g.length; i++) g[i] = r();
      for (let y = 0; y < N; y++) {
        const fy = (y * gy) / N, y0 = Math.floor(fy), ty = sm(fy - y0), y1 = (y0 + 1) % gy;
        for (let x = 0; x < N; x++) {
          const fx = (x * gx) / N, x0 = Math.floor(fx), tx = sm(fx - x0), x1 = (x0 + 1) % gx;
          const a = g[y0 * gx + x0], b = g[y0 * gx + x1], c = g[y1 * gx + x0], d = g[y1 * gx + x1];
          out[y * N + x] += ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) * amp;
        }
      }
      amp *= 0.55;
    }
    return norm(out);
  }

  const DEFS = [
    { id: 'paper', label: 'Drawing paper', gen: () => {
      const a = U.fbm(N, 32, 4, 11, 0.6), b = U.fbm(N, 128, 2, 12, 0.5), o = new Float32Array(N * N);
      for (let i = 0; i < o.length; i++) o[i] = a[i] * 0.55 + b[i] * 0.45;
      return norm(o);
    } },
    { id: 'rough', label: 'Rough / cold press', gen: () => {
      const a = U.fbm(N, 16, 5, 21, 0.62), b = U.fbm(N, 64, 3, 22, 0.5), o = new Float32Array(N * N);
      for (let i = 0; i < o.length; i++) o[i] = Math.pow(a[i], 1.2) * 0.65 + b[i] * 0.35;
      return norm(o);
    } },
    { id: 'watercolour', label: 'Watercolour paper', gen: () => {
      // soft cellular dimples
      const r = U.rng(31), pts = [];
      for (let i = 0; i < 90; i++) pts.push([r() * N, r() * N]);
      const o = new Float32Array(N * N), fine = U.fbm(N, 64, 3, 32, 0.5);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let best = 1e9;
        for (const [px, py] of pts) {
          let dx = Math.abs(x - px), dy = Math.abs(y - py);
          if (dx > N / 2) dx = N - dx; if (dy > N / 2) dy = N - dy;
          const d = dx * dx + dy * dy; if (d < best) best = d;
        }
        o[y * N + x] = Math.sqrt(best) * 0.06 + fine[y * N + x] * 0.6;
      }
      return norm(o);
    } },
    { id: 'canvas', label: 'Canvas weave', gen: () => {
      const o = new Float32Array(N * N), n = U.fbm(N, 64, 2, 41, 0.5), k = (U.TAU * 32) / N;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const wx = Math.sin(x * k) * 0.5 + 0.5, wy = Math.sin(y * k) * 0.5 + 0.5;
        const over = ((Math.floor((x * 32) / N) + Math.floor((y * 32) / N)) & 1) ? wx : wy;
        o[y * N + x] = over * 0.75 + n[y * N + x] * 0.25;
      }
      return norm(o);
    } },
    { id: 'linen', label: 'Linen', gen: () => {
      const a = stretched(51, 4, 64, 3), b = stretched(52, 64, 4, 3), o = new Float32Array(N * N);
      for (let i = 0; i < o.length; i++) o[i] = Math.max(a[i], b[i]);
      return norm(o);
    } },
    { id: 'crayon', label: 'Wax crayon', gen: () => {
      const a = stretched(61, 6, 48, 4), b = U.fbm(N, 128, 2, 62, 0.5), o = new Float32Array(N * N);
      for (let i = 0; i < o.length; i++) o[i] = a[i] * 0.7 + b[i] * 0.3;
      return norm(o);
    } },
    { id: 'charcoal', label: 'Laid charcoal paper', gen: () => {
      const o = new Float32Array(N * N), n = U.fbm(N, 32, 4, 71, 0.6), f = U.fbm(N, 128, 2, 72, 0.5);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const laid = Math.sin((x / N) * U.TAU * 48) * 0.5 + 0.5;
        o[y * N + x] = n[y * N + x] * 0.55 + laid * 0.2 + f[y * N + x] * 0.25;
      }
      return norm(o);
    } },
    { id: 'sand', label: 'Sandpaper', gen: () => {
      const r = U.rng(81), o = new Float32Array(N * N), n = U.fbm(N, 128, 1, 82, 0.5);
      for (let i = 0; i < o.length; i++) o[i] = r() * 0.6 + n[i] * 0.4;
      return norm(o);
    } },
    { id: 'concrete', label: 'Concrete', gen: () => {
      const a = U.fbm(N, 8, 6, 91, 0.7), r = U.rng(92), o = new Float32Array(N * N);
      for (let i = 0; i < o.length; i++) o[i] = a[i] * 0.8 + (r() < 0.04 ? -0.6 : 0) + r() * 0.15;
      return norm(o);
    } },
    { id: 'bark', label: 'Wood grain', gen: () => {
      const n = stretched(101, 2, 16, 4), o = new Float32Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = Math.sin((x / N) * U.TAU * 10 + n[y * N + x] * 6);
        o[y * N + x] = v * 0.5 + 0.5;
      }
      return norm(o);
    } },
    { id: 'dots', label: 'Halftone dots', gen: () => {
      const o = new Float32Array(N * N), c = 16;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = (x % c) - c / 2 + 0.5, dy = (y % c) - c / 2 + 0.5;
        o[y * N + x] = 1 - Math.min(1, Math.hypot(dx, dy) / (c / 1.6));
      }
      return o;
    } },
    { id: 'hatch', label: 'Hatching', gen: () => {
      const o = new Float32Array(N * N), n = U.fbm(N, 64, 2, 111, 0.5);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        o[y * N + x] = (Math.sin(((x + y) / N) * U.TAU * 32) * 0.5 + 0.5) * 0.8 + n[y * N + x] * 0.2;
      }
      return norm(o);
    } },
  ];

  const cache = new Map();
  function get(id) {
    if (!id) return null;
    let t = cache.get(id);
    if (!t) {
      const d = DEFS.find((q) => q.id === id);
      if (!d) return null;
      t = { id, data: d.gen(), size: N };
      cache.set(id, t);
    }
    return t;
  }
  function preview(id, size) {
    const t = get(id), c = U.canvas(size, size), x = U.ctx(c), im = x.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++) {
      const v = t.data[((y * 2) % N) * N + ((xx * 2) % N)] * 255, j = (y * size + xx) * 4;
      im.data[j] = im.data[j + 1] = im.data[j + 2] = v; im.data[j + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    return c;
  }
  // Paint coverage for one pixel given texture height h, pressure p, strength s.
  function coverage(h, p, s) {
    const thr = 0.78 - p * 0.62;
    let v = (h - thr + 0.18) / 0.36;
    v = v < 0 ? 0 : v > 1 ? 1 : v * v * (3 - 2 * v);
    return 1 - s + s * v;
  }

  ND.Textures = { list: DEFS.map((d) => ({ id: d.id, label: d.label })), get, preview, coverage, SIZE: N };
})();
