/* Neon Sparks Draw — smart selection: quick-select brush, Select Subject and Remove Background.
 * Works without AI models. The image is shrunk and lightly smoothed, then every pixel is claimed by
 * whichever seeds (object or background) can reach it most cheaply. Crossing a strong colour edge is
 * very expensive while texture and gentle gradients are cheap (edge cost grows with the cube of the
 * colour jump), so selections stop at real outlines instead of leaking or stopping at noise.
 * The result is scaled back up with soft, anti-aliased edges. */
'use strict';
(function () {
  const U = ND.U;
  const MAX = 640; // working size (longest side)
  const SOFT = 1.2; // width of the soft edge band, in edge-cost units

  // separable box blur of a 3-channel float image
  function blur3(src, w, h, r) {
    if (r < 1) return src;
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = r * 2 + 1;
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += src[(y * w + U.clamp(k, 0, w - 1)) * 3 + c];
        for (let x = 0; x < w; x++) {
          tmp[(y * w + x) * 3 + c] = acc / n;
          acc += src[(y * w + Math.min(w - 1, x + r + 1)) * 3 + c] - src[(y * w + Math.max(0, x - r)) * 3 + c];
        }
      }
    }
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += tmp[(U.clamp(k, 0, h - 1) * w + x) * 3 + c];
        for (let y = 0; y < h; y++) {
          out[(y * w + x) * 3 + c] = acc / n;
          acc += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 3 + c] - tmp[(Math.max(0, y - r) * w + x) * 3 + c];
        }
      }
    }
    return out;
  }

  function small(src) {
    const W = src.width, H = src.height, s = Math.min(1, MAX / Math.max(W, H));
    const w = Math.max(2, Math.round(W * s)), h = Math.max(2, Math.round(H * s));
    const c = U.canvas(w, h), x = U.ctx(c);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    // perceptual-ish colour (weights roughly match how different colours look); transparency reads as white
    const raw = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      const a = d[i * 4 + 3] / 255;
      raw[i * 3] = (d[i * 4] * a + 255 * (1 - a)) * 0.55;
      raw[i * 3 + 1] = (d[i * 4 + 1] * a + 255 * (1 - a)) * 0.8;
      raw[i * 3 + 2] = (d[i * 4 + 2] * a + 255 * (1 - a)) * 0.4;
    }
    const lab = blur3(raw, w, h, 1);
    // cost of stepping onto each pixel grows with the cube of the local colour gradient, so both crossing
    // an outline and sliding along it are expensive, while flat areas and soft texture stay cheap
    const n = w * h, pc = new Float32Array(n), ex = new Float32Array(n), ey = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const l = (y * w + Math.max(0, x - 1)) * 3, r = (y * w + Math.min(w - 1, x + 1)) * 3;
        const u = (Math.max(0, y - 1) * w + x) * 3, d2 = (Math.min(h - 1, y + 1) * w + x) * 3;
        let g = 0;
        for (let c = 0; c < 3; c++) { const gx = lab[r + c] - lab[l + c], gy = lab[d2 + c] - lab[u + c]; g += gx * gx + gy * gy; }
        const e = Math.sqrt(g) / 45;
        pc[y * w + x] = e * e * e + 0.004;
      }
    }
    for (let i = 0; i < n; i++) {
      if (i % w < w - 1) ex[i] = (pc[i] + pc[i + 1]) / 2;
      if (i + w < n) ey[i] = (pc[i] + pc[i + w]) / 2;
    }
    return { w, h, s, W, H, raw, lab, ex, ey };
  }

  // Binary min-heap keyed by distance.
  class Heap {
    constructor(n) { this.k = new Float64Array(n); this.v = new Int32Array(n); this.n = 0; }
    grow() { const k = new Float64Array(this.k.length * 2), v = new Int32Array(this.v.length * 2); k.set(this.k); v.set(this.v); this.k = k; this.v = v; }
    push(key, val) {
      if (this.n >= this.k.length) this.grow();
      let i = this.n++;
      while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= key) break; this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p; }
      this.k[i] = key; this.v[i] = val;
    }
    pop() {
      const top = this.v[0], last = --this.n, kk = this.k[last], vv = this.v[last];
      let i = 0;
      while (true) {
        let c = 2 * i + 1;
        if (c >= this.n) break;
        if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
        if (this.k[c] >= kk) break;
        this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
      }
      this.k[i] = kk; this.v[i] = vv;
      return top;
    }
  }
  // Cheapest path cost from any seed pixel (seeds[i] = 1) to every pixel.
  function geodesic(img, seeds) {
    const { w, ex, ey } = img, n = w * img.h, dist = new Float64Array(n).fill(Infinity), done = new Uint8Array(n), heap = new Heap(n + 16);
    for (let i = 0; i < n; i++) if (seeds[i]) { dist[i] = 0; heap.push(0, i); }
    const relax = (j, nd) => { if (!done[j] && nd < dist[j]) { dist[j] = nd; heap.push(nd, j); } };
    while (heap.n) {
      const i = heap.pop();
      if (done[i]) continue; // stale entry
      done[i] = 1;
      const di = dist[i], x = i % w;
      if (x > 0) relax(i - 1, di + ex[i - 1]);
      if (x < w - 1) relax(i + 1, di + ex[i]);
      if (i >= w) relax(i - w, di + ey[i - w]);
      if (i + w < n) relax(i + w, di + ey[i]);
    }
    return dist;
  }
  // Pixels reachable from the seeds without crossing any noticeable edge (a soft flood fill).
  function flatRegion(img, seeds, limit) {
    const { w, ex, ey } = img, n = w * img.h, out = new Uint8Array(n), stack = [];
    for (let i = 0; i < n; i++) if (seeds[i]) { out[i] = 1; stack.push(i); }
    const go = (j, c) => { if (!out[j] && c < limit) { out[j] = 1; stack.push(j); } };
    while (stack.length) {
      const i = stack.pop(), x = i % w;
      if (x > 0) go(i - 1, ex[i - 1]);
      if (x < w - 1) go(i + 1, ex[i]);
      if (i >= w) go(i - w, ey[i - w]);
      if (i + w < n) go(i + w, ey[i]);
    }
    return out;
  }
  // Image-border pixels used as background seeds — except where the selected area itself runs off
  // the edge without any edge in between (e.g. quick-selecting the sky).
  function borderSeeds(img, fg) {
    const { w, h } = img, out = new Uint8Array(w * h), flat = flatRegion(img, fg, 0.12);
    const mark = (i) => { if (!fg[i] && !flat[i]) out[i] = 1; };
    for (let x = 0; x < w; x++) { mark(x); mark((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { mark(y * w); mark(y * w + w - 1); }
    return out;
  }
  // fg / bg seed maps (small size) → { mask: full-size selection canvas, coverage }
  function segment(img, fg, bgExtra) {
    const { w, h, W, H } = img, n = w * h;
    const dF = geodesic(img, fg), bg = borderSeeds(img, fg);
    if (bgExtra) for (let i = 0; i < n; i++) if (bgExtra[i]) bg[i] = 1;
    const dB = geodesic(img, bg);
    const a = U.canvas(w, h), x = U.ctx(a), id = x.createImageData(w, h);
    let count = 0;
    for (let i = 0; i < n; i++) {
      // whichever seeds are cheaper to reach win; a narrow soft band gives anti-aliased edges
      let v = U.clamp((dB[i] - dF[i]) / SOFT + 0.5, 0, 1);
      if (!isFinite(dF[i])) v = 0; else if (!isFinite(dB[i])) v = 1;
      if (fg[i]) v = 1; else if (bg[i]) v = 0;
      const s = v * v * (3 - 2 * v);
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = s * 255;
      if (s > 0.5) count++;
    }
    x.putImageData(id, 0, 0);
    const out = U.canvas(W, H), ox = U.ctx(out);
    ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high';
    ox.drawImage(a, 0, 0, W, H);
    return { mask: out, coverage: count / n };
  }
  function seedsFrom(canvas, img) {
    const c = U.canvas(img.w, img.h), x = U.ctx(c);
    x.imageSmoothingEnabled = true;
    x.drawImage(canvas, 0, 0, img.w, img.h);
    const d = x.getImageData(0, 0, img.w, img.h).data, out = new Uint8Array(img.w * img.h);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] > 40 ? 1 : 0;
    return out;
  }

  /* Find the main subject: regions that look least like the image edges, favouring the middle. */
  function subjectSeeds(img) {
    const { w, h } = img, n = w * h, lab = blur3(img.raw, w, h, 2);
    // background colours: k-means over the top, left and right edges (subjects often touch the bottom)
    const samples = [];
    const step = Math.max(1, Math.round((w + h) / 400));
    for (let x = 0; x < w; x += step) samples.push(x, w + x);
    for (let y = 0; y < h; y += step) samples.push(y * w, y * w + 1, y * w + w - 1, y * w + w - 2);
    const K = 8, cent = [];
    for (let k = 0; k < K; k++) { const i = samples[Math.floor(((k + 0.5) / K) * samples.length)]; cent.push([lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]]); }
    const nearest = (i) => {
      let bd = Infinity;
      for (let k = 0; k < K; k++) { const dr = lab[i * 3] - cent[k][0], dg = lab[i * 3 + 1] - cent[k][1], db = lab[i * 3 + 2] - cent[k][2], dd = dr * dr + dg * dg + db * db; if (dd < bd) bd = dd; }
      return Math.sqrt(bd);
    };
    for (let it = 0; it < 8; it++) {
      const acc = cent.map(() => [0, 0, 0, 0]);
      for (const i of samples) {
        let best = 0, bd = Infinity;
        for (let k = 0; k < K; k++) { const dr = lab[i * 3] - cent[k][0], dg = lab[i * 3 + 1] - cent[k][1], db = lab[i * 3 + 2] - cent[k][2], dd = dr * dr + dg * dg + db * db; if (dd < bd) { bd = dd; best = k; } }
        acc[best][0] += lab[i * 3]; acc[best][1] += lab[i * 3 + 1]; acc[best][2] += lab[i * 3 + 2]; acc[best][3]++;
      }
      acc.forEach((a, k) => { if (a[3]) cent[k] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
    }
    // how far the edge colours spread: a busy background needs a higher bar
    let spread = 0;
    for (const i of samples) spread += nearest(i);
    spread /= samples.length;
    const diff = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i / w) | 0, cx = (x / w - 0.5) * 2, cy = (y / h - 0.45) * 2;
      diff[i] = nearest(i) * Math.max(0.15, 1 - 0.45 * (cx * cx + cy * cy));
    }
    const sorted = Float32Array.from(diff).sort(), thr = Math.max(7, spread * 2.2 + 3, sorted[Math.floor(n * 0.85)]);
    const on = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (diff[i] >= thr) on[i] = 1;
    // keep the strongest connected region(s)
    const comp = new Int32Array(n).fill(-1), score = [], size = [], stack = [];
    for (let i = 0; i < n; i++) {
      if (!on[i] || comp[i] >= 0) continue;
      const id = score.length;
      let sc = 0, sz = 0;
      comp[i] = id; stack.push(i);
      while (stack.length) {
        const j = stack.pop(), x = j % w;
        sc += diff[j]; sz++;
        const nb = [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j >= w ? j - w : -1, j + w < n ? j + w : -1];
        for (const k of nb) if (k >= 0 && on[k] && comp[k] < 0) { comp[k] = id; stack.push(k); }
      }
      score.push(sc); size.push(sz);
    }
    const fg = new Uint8Array(n);
    // keep the best region plus any other region that is both large and as distinct as it
    let bi = -1;
    score.forEach((v, k) => { if (bi < 0 || v > score[bi]) bi = k; });
    const keep = score.map((v, k) => bi >= 0 && (k === bi || (v >= score[bi] * 0.25 && v / size[k] >= (score[bi] / size[bi]) * 0.7)));
    let c = 0;
    for (let i = 0; i < n; i++) if (comp[i] >= 0 && keep[comp[i]]) { fg[i] = 1; c++; }
    // the saliency map was blurred, so pull the seeds back inside the real outline
    for (let it = 0; it < 6; it++) {
      const prev = fg.slice();
      for (let i = 0; i < n; i++) {
        if (!prev[i]) continue;
        const x = i % w;
        if (x === 0 || x === w - 1 || i < w || i + w >= n) continue;
        if (!prev[i - 1] || !prev[i + 1] || !prev[i - w] || !prev[i + w]) { fg[i] = 0; c--; }
      }
    }
    if (c < n * 0.002) {
      // nothing stands out: start from a small area in the middle
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = (x / w - 0.5) / 0.1, dy = (y / h - 0.5) / 0.14; if (dx * dx + dy * dy < 1) fg[y * w + x] = 1; }
    }
    // background hints: pixels that clearly match the edge colours
    const bg = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (!fg[i] && diff[i] < thr * 0.25 && nearest(i) < Math.max(6, spread * 0.8)) bg[i] = 1;
    return { fg, bg };
  }
  function selectSubject(src) {
    const img = small(src), seeds = subjectSeeds(img);
    return segment(img, seeds.fg, seeds.bg);
  }

  /* Quick-select session: strokes add (or subtract) seeds; each stroke updates the selection. */
  class Session {
    constructor(src) { this.img = small(src); const n = this.img.w * this.img.h; this.fg = new Uint8Array(n); this.bg = new Uint8Array(n); }
    add(strokeCanvas, subtract) {
      const sd = seedsFrom(strokeCanvas, this.img), n = sd.length;
      for (let i = 0; i < n; i++) if (sd[i]) { if (subtract) { this.bg[i] = 1; this.fg[i] = 0; } else { this.fg[i] = 1; this.bg[i] = 0; } }
      let any = false;
      for (let i = 0; i < n; i++) if (this.fg[i]) { any = true; break; }
      if (!any) return null;
      return segment(this.img, this.fg, this.bg).mask;
    }
  }

  // Greyscale layer mask (white = keep) that hides everything except the main subject of `src`.
  function backgroundMask(src) {
    const res = selectSubject(src), m = ND.DocMask.newMask(src.width, src.height, '#000');
    U.ctx(m).drawImage(res.mask, 0, 0);
    ND.DocMask.greyify(m, { x: 0, y: 0, w: src.width, h: src.height });
    return m;
  }

  ND.Smart = { selectSubject, backgroundMask, Session, _debug: { small, subjectSeeds, segment, geodesic } };
})();
