/* Neon Sparks Draw — Colourise mask ("lazy brush") for line art.
 * Scribbled colour hints fill the areas they are in, up to (and just under) the lines. Lines are thickened
 * by the gap-closing radius first so small gaps in the line art don't leak. Linear-time flood fills. */
'use strict';
(function () {
  const U = ND.U;
  const K = {};

  // line strength 0..255 per pixel: dark and opaque = strong; faint paper texture is ignored
  K.barrier = function (lineCanvas, threshold) {
    const W = lineCanvas.width, H = lineCanvas.height, d = U.ctx(lineCanvas).getImageData(0, 0, W, H).data;
    const out = new Uint8Array(W * H), th = threshold === undefined ? 30 : threshold;
    for (let i = 0, j = 0; j < out.length; i += 4, j++) {
      const a = d[i + 3] / 255, lum = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
      const v = Math.round(a * (1 - lum) * 255);
      out[j] = v < th ? 0 : v;
    }
    return out;
  };
  // grow the lines by r pixels (square max filter, separable)
  K.dilate = function (src, W, H, r) {
    if (r < 1) return src;
    const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        let m = 0;
        for (let k = Math.max(0, x - r), e = Math.min(W - 1, x + r); k <= e; k++) if (src[row + k] > m) m = src[row + k];
        tmp[row + x] = m;
      }
    }
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        let m = 0;
        for (let k = Math.max(0, y - r), e = Math.min(H - 1, y + r); k <= e; k++) if (tmp[k * W + x] > m) m = tmp[k * W + x];
        out[y * W + x] = m;
      }
    }
    return out;
  };

  /* Returns { canvas, colours } or null when there are no hints.
   * opts: { gap (px, default 2), blankWhite (white hints = leave empty), threshold, merge }
   * 1. Each hint colour floods the open area it was scribbled in. It never crosses a line, and lines are
   *    thickened by `gap` first so small gaps don't leak. Areas without a scribble stay empty.
   * 2. The colours then grow a little under the lines (no white halo next to the ink), but never out of
   *    the other side of a line into a different area. */
  K.LINE = 64; // line strength (0–255) from which a pixel counts as ink
  K.run = function (lineCanvas, hintsCanvas, opts) {
    opts = opts || {};
    const W = lineCanvas.width, H = lineCanvas.height, N = W * H, LINE = K.LINE;
    const gap = Math.max(0, Math.round(opts.gap === undefined ? 2 : opts.gap));
    const raw = K.barrier(lineCanvas, opts.threshold), bar = K.dilate(raw, W, H, gap);
    const hd = U.ctx(hintsCanvas).getImageData(0, 0, W, H).data;
    // brush edges and colour jitter give many near-identical shades: merge them into clean flat colours
    const counts = new Map();
    for (let i = 0; i < hd.length; i += 4) {
      if (hd[i + 3] < 160) continue;
      const key = (hd[i] << 16) | (hd[i + 1] << 8) | hd[i + 2];
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const colours = [], keys = new Map(), tol = opts.merge === undefined ? 40 : opts.merge;
    [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([key]) => {
      const r = key >> 16, g = (key >> 8) & 255, b = key & 255;
      let id = colours.findIndex((c) => Math.hypot(c[0] - r, c[1] - g, c[2] - b) <= tol);
      if (id < 0) { id = colours.length; colours.push([r, g, b]); }
      keys.set(key, id);
    });
    if (!colours.length) return null;
    const lab = new Int32Array(N).fill(-1), q = new Int32Array(N);
    let qh = 0, qt = 0;
    // seeds: hint pixels in open areas (a scribble touching a line mustn't spill into the next area)
    for (let j = 0, i = 0; j < N; j++, i += 4) {
      if (hd[i + 3] < 160 || bar[j] >= LINE) continue;
      lab[j] = keys.get((hd[i] << 16) | (hd[i + 1] << 8) | hd[i + 2]);
      q[qt++] = j;
    }
    // tiny areas that the gap closing filled completely: let their own scribbles count
    if (qt === 0 || gap > 0) {
      for (let j = 0, i = 0; j < N; j++, i += 4) {
        if (hd[i + 3] < 160 || lab[j] >= 0 || raw[j] >= LINE) continue;
        let open = false;
        for (let k = 1; k <= gap + 1 && !open; k++) { const x = j % W; if ((x + k < W && bar[j + k] < LINE) || (x - k >= 0 && bar[j - k] < LINE) || (j + k * W < N && bar[j + k * W] < LINE) || (j - k * W >= 0 && bar[j - k * W] < LINE)) open = true; }
        if (!open) { lab[j] = keys.get((hd[i] << 16) | (hd[i + 1] << 8) | hd[i + 2]); q[qt++] = j; }
      }
    }
    // 1. flood the open areas
    const nb = (j, f) => { const x = j % W; if (x > 0) f(j - 1); if (x < W - 1) f(j + 1); if (j >= W) f(j - W); if (j < N - W) f(j + W); };
    while (qh < qt) {
      const i = q[qh++], L = lab[i];
      nb(i, (j) => { if (lab[j] < 0 && bar[j] < LINE) { lab[j] = L; q[qt++] = j; } });
    }
    // 2. grow under the lines. state: 0 = before the ink, 1 = inside the ink; leaving the ink is not allowed
    const st = new Uint8Array(N), dist = new Uint16Array(N), reach = gap + 2;
    qh = 0; qt = 0;
    for (let j = 0; j < N; j++) if (lab[j] >= 0) q[qt++] = j;
    while (qh < qt) {
      const i = q[qh++], L = lab[i], si = st[i], di = dist[i];
      nb(i, (j) => {
        if (lab[j] >= 0 || bar[j] < LINE) return; // open, unscribbled areas stay empty
        const ink = raw[j] >= LINE;
        if (!ink && (si === 1 || di + 1 > reach)) return;
        const dd = ink ? (si === 1 ? di + 1 : 1) : di + 1;
        if (ink && dd > 24) return; // only the ink next to this area, not every line in the picture
        lab[j] = L; st[j] = ink ? 1 : 0; dist[j] = dd; q[qt++] = j;
      });
    }
    const blank = colours.map((c) => !!opts.blankWhite && c[0] > 245 && c[1] > 245 && c[2] > 245);
    const out = U.canvas(W, H), x = U.ctx(out), img = x.createImageData(W, H), o = img.data;
    for (let j = 0, i = 0; j < N; j++, i += 4) {
      const L = lab[j];
      if (L < 0 || blank[L]) continue;
      const c = colours[L];
      o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; o[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return { canvas: out, colours };
  };

  ND.Colourise = K;
})();
