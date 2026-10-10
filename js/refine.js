/* Neon Sparks Draw — Select and Mask maths: smooth, edge refinement (hair & fur), feather, contrast,
 * shift edge, and colour decontamination. Works on Float32 alpha (0..1) plus the image's RGBA.
 *
 * Edge refinement: inside a band of `radius` pixels around the selection edge, each pixel is
 * explained as a mix of a nearby "object" colour F and a nearby "background" colour B, estimated
 * from the clearly-inside and clearly-outside pixels around it. alpha = how far the pixel sits from
 * B towards F. Decontamination then removes the background colour that bled into edge pixels. */
'use strict';
(function () {
  const U = ND.U;
  const R = {};
  R.DEFAULTS = { smooth: 0, radius: 0, feather: 0, contrast: 0, shift: 0, decontam: false, amount: 1 };

  // box blur (separable, O(n) per pass) of a float plane; returns a new array
  function boxBlur(src, w, h, r) {
    r = Math.round(r);
    if (r < 1) return Float32Array.from(src);
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = r * 2 + 1;
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[o + U.clamp(k, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = acc / n;
        acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[U.clamp(k, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / n;
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }
  // three box passes ≈ gaussian with sigma ≈ r
  function gauss(src, w, h, sigma) {
    if (sigma < 0.5) return Float32Array.from(src);
    const r = Math.max(1, Math.round(sigma * 0.9));
    return boxBlur(boxBlur(boxBlur(src, w, h, r), w, h, r), w, h, r);
  }
  R.boxBlur = boxBlur;
  R.gauss = gauss;

  /* Local colour estimates of F (inside) and B (outside) on a coarse grid, filled outwards so every
   * band pixel has a value. Returns samplers f(x, y) / b(x, y) → [r, g, b] or null. */
  function estimateColours(px, w, h, inside, outside, radius) {
    const f = Math.max(1, Math.ceil(radius / 3), Math.ceil(Math.sqrt((w * h) / 400000)));
    const gw = Math.ceil(w / f), gh = Math.ceil(h / f), gn = gw * gh;
    const mk = () => ({ r: new Float32Array(gn), g: new Float32Array(gn), b: new Float32Array(gn), w: new Float32Array(gn) });
    const F = mk(), B = mk();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, gi = ((y / f) | 0) * gw + ((x / f) | 0), j = i * 4;
        const t = inside[i] ? F : outside[i] ? B : null;
        if (!t) continue;
        t.r[gi] += px[j]; t.g[gi] += px[j + 1]; t.b[gi] += px[j + 2]; t.w[gi] += 1;
      }
    }
    const rr = Math.max(1, Math.ceil(radius / f));
    const spread = (t) => {
      // a blur sized to the band, then wider ones to fill cells that still have no samples
      let cur = { r: boxBlur(t.r, gw, gh, rr), g: boxBlur(t.g, gw, gh, rr), b: boxBlur(t.b, gw, gh, rr), w: boxBlur(t.w, gw, gh, rr) };
      for (let pass = 1, rad = rr * 3; pass < 4; pass++, rad *= 3) {
        let empty = false;
        for (let i = 0; i < gn; i++) if (cur.w[i] < 1e-4) { empty = true; break; }
        if (!empty) break;
        const wide = { r: boxBlur(t.r, gw, gh, rad), g: boxBlur(t.g, gw, gh, rad), b: boxBlur(t.b, gw, gh, rad), w: boxBlur(t.w, gw, gh, rad) };
        for (let i = 0; i < gn; i++) if (cur.w[i] < 1e-4) { cur.r[i] = wide.r[i]; cur.g[i] = wide.g[i]; cur.b[i] = wide.b[i]; cur.w[i] = wide.w[i]; }
      }
      const out = new Float32Array(gn * 3), ok = new Uint8Array(gn);
      for (let i = 0; i < gn; i++) if (cur.w[i] > 1e-6) { out[i * 3] = cur.r[i] / cur.w[i]; out[i * 3 + 1] = cur.g[i] / cur.w[i]; out[i * 3 + 2] = cur.b[i] / cur.w[i]; ok[i] = 1; }
      return { out, ok };
    };
    const fs = spread(F), bs = spread(B);
    const sampler = (s) => (x, y) => {
      // bilinear lookup between cell centres
      const gx = U.clamp(x / f - 0.5, 0, gw - 1), gy = U.clamp(y / f - 0.5, 0, gh - 1);
      const x0 = gx | 0, y0 = gy | 0, x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1), tx = gx - x0, ty = gy - y0;
      const res = [0, 0, 0];
      let wsum = 0;
      for (const [cx, cy, wt] of [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]]) {
        const c = cy * gw + cx;
        if (!s.ok[c] || wt <= 0) continue;
        res[0] += s.out[c * 3] * wt; res[1] += s.out[c * 3 + 1] * wt; res[2] += s.out[c * 3 + 2] * wt; wsum += wt;
      }
      if (wsum <= 0) return null;
      res[0] /= wsum; res[1] /= wsum; res[2] /= wsum;
      return res;
    };
    return { f: sampler(fs), b: sampler(bs) };
  }

  /* Run the pipeline.
   *   px: Uint8ClampedArray RGBA (w*h*4), mask: Float32Array (w*h) 0..1, p: parameters in pixels,
   *   scale: multiply pixel sizes by this (previews run on a shrunk copy).
   * Returns { alpha: Float32Array, colour: Uint8ClampedArray|null } — colour is the decontaminated
   * RGBA (alpha channel = new alpha) when p.decontam is on. */
  R.run = function (px, mask, w, h, p, scale) {
    p = Object.assign({}, R.DEFAULTS, p || {});
    scale = scale || 1;
    const n = w * h, S = (v) => v * scale;
    let A = Float32Array.from(mask);

    // 1. smooth: round off jagged outlines, then restore a crisp edge
    if (p.smooth > 0) {
      A = gauss(A, w, h, S(p.smooth) * 0.6);
      for (let i = 0; i < n; i++) A[i] = U.clamp((A[i] - 0.5) * 2.5 + 0.5, 0, 1);
    }

    // 2. edge refinement + colour estimates
    let est = null, band = null;
    const radius = S(p.radius), needEst = radius >= 1 || p.decontam;
    if (needEst) {
      const r = Math.max(radius, S(6), 1.5);
      const hard = new Float32Array(n);
      for (let i = 0; i < n; i++) hard[i] = A[i] >= 0.5 ? 1 : 0;
      const bl = boxBlur(hard, w, h, r);
      band = new Uint8Array(n);
      const inside = new Uint8Array(n), outside = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (bl[i] > 0.002 && bl[i] < 0.998) band[i] = 1;
        else if (hard[i]) inside[i] = 1; else outside[i] = 1;
      }
      est = estimateColours(px, w, h, inside, outside, r);
      if (radius >= 1) {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (!band[i]) continue;
            const F = est.f(x, y), B = est.b(x, y);
            if (!F || !B) continue;
            const j = i * 4, dr = F[0] - B[0], dg = F[1] - B[1], db = F[2] - B[2], dd = dr * dr + dg * dg + db * db;
            const a = ((px[j] - B[0]) * dr + (px[j + 1] - B[1]) * dg + (px[j + 2] - B[2]) * db) / (dd + 1e-6);
            // only trust colour where object and background really differ
            const trust = U.clamp((Math.sqrt(dd) - 12) / 30, 0, 1);
            A[i] = U.clamp(A[i] * (1 - trust) + U.clamp(a, 0, 1) * trust, 0, 1);
          }
        }
      }
    }

    // 3. feather
    if (p.feather > 0) A = gauss(A, w, h, S(p.feather) * 0.5);

    // 4. contrast: sharpen soft edges
    if (p.contrast > 0) {
      const k = 1 + (p.contrast / 100) * 24;
      for (let i = 0; i < n; i++) A[i] = U.clamp((A[i] - 0.5) * k + 0.5, 0, 1);
    }

    // 5. shift edge: positive grows, negative shrinks (pixels)
    if (p.shift) {
      const s = S(p.shift), r = Math.max(1, Math.round(Math.abs(s) * 2)), B = boxBlur(A, w, h, r);
      const tau = 0.5 - s / (2 * r + 1), slope = (2 * r + 1);
      for (let i = 0; i < n; i++) A[i] = U.clamp((B[i] - tau) * slope + 0.5, 0, 1);
    }

    // 6. decontaminate: remove the background colour that bled into the edge
    let colour = null;
    if (p.decontam && est) {
      colour = new Uint8ClampedArray(px.length);
      const amt = U.clamp(p.amount, 0, 1);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x, j = i * 4, a = A[i];
          colour[j] = px[j]; colour[j + 1] = px[j + 1]; colour[j + 2] = px[j + 2]; colour[j + 3] = Math.round(a * 255);
          if (a <= 0.002 || a >= 0.998 || !band[i]) continue;
          const B = est.b(x, y), F = est.f(x, y);
          if (!B) continue;
          for (let c = 0; c < 3; c++) {
            // solve I = a·F + (1 − a)·B for F; very faint pixels lean on the local object colour
            let v = (px[j + c] - (1 - a) * B[c]) / a;
            if (a < 0.25 && F) v = U.lerp(F[c], v, a / 0.25);
            colour[j + c] = px[j + c] + (U.clamp(v, 0, 255) - px[j + c]) * amt;
          }
        }
      }
    }
    return { alpha: A, colour };
  };

  /* Canvas helpers */
  R.alphaFrom = function (canvas, x, y, w, h) {
    const d = U.ctx(canvas).getImageData(x, y, w, h).data, a = new Float32Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
    return a;
  };
  // white selection canvas (doc size) with the alpha placed at (x, y)
  R.toSelection = function (alpha, x, y, w, h, W, H) {
    const c = U.canvas(W, H), id = new ImageData(w, h);
    for (let i = 0; i < alpha.length; i++) { const j = i * 4; id.data[j] = id.data[j + 1] = id.data[j + 2] = 255; id.data[j + 3] = Math.round(alpha[i] * 255); }
    U.ctx(c).putImageData(id, x, y);
    return c;
  };

  ND.Refine = R;
})();
