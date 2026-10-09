/* Neon Draw — retouching: spot healing, patch, content-aware fill, red-eye, and Liquify. */
'use strict';
(function () {
  const U = ND.U;

  /* ---------- membrane (Laplace) interpolation, coarse-to-fine ----------
   * unknown[i] = 1 for pixels to solve; val holds 4 channels per pixel (known values fixed). */
  function solveMembrane(w, h, unknown, val, iters) {
    if (w * h > 6000 && w > 24 && h > 24) {
      const w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2), u2 = new Uint8Array(w2 * h2), v2 = new Float32Array(w2 * h2 * 4);
      for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
        let kn = 0, unk = 0;
        const acc = [0, 0, 0, 0];
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          const xx = x * 2 + i, yy = y * 2 + j;
          if (xx >= w || yy >= h) continue;
          const k = yy * w + xx;
          if (unknown[k]) unk++; else { kn++; for (let c = 0; c < 4; c++) acc[c] += val[k * 4 + c]; }
        }
        const k2 = y * w2 + x;
        if (unk || !kn) u2[k2] = 1; else for (let c = 0; c < 4; c++) v2[k2 * 4 + c] = acc[c] / kn;
      }
      solveMembrane(w2, h2, u2, v2, iters);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (!unknown[k]) continue;
        const k2 = Math.min(h2 - 1, y >> 1) * w2 + Math.min(w2 - 1, x >> 1);
        for (let c = 0; c < 4; c++) val[k * 4 + c] = v2[k2 * 4 + c];
      }
      iters = Math.min(iters, 40);
    }
    const list = [];
    for (let k = 0; k < w * h; k++) if (unknown[k]) list.push(k);
    const om = 1.85;
    for (let it = 0; it < iters; it++) {
      for (const k of list) {
        const x = k % w, y = (k / w) | 0;
        const nb = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1];
        let n = 0;
        const s = [0, 0, 0, 0];
        for (const q of nb) { if (q < 0) continue; n++; for (let c = 0; c < 4; c++) s[c] += val[q * 4 + c]; }
        if (!n) continue;
        for (let c = 0; c < 4; c++) { const o = val[k * 4 + c]; val[k * 4 + c] = o + om * (s[c] / n - o); }
      }
    }
  }

  /* ---------- healing ----------
   * src: canvas to sample texture from; dst: canvas written to; mask: canvas whose alpha marks the area.
   * offset: optional {x, y} source offset (patch tool); otherwise the best nearby source is found. */
  function heal(src, dst, mask, offset, hint) {
    const W = dst.width, H = dst.height;
    const bb = ND.Sel.bbox(mask, 1, hint);
    if (!bb) return null;
    const m = 6, r = U.clipRect({ x: bb.x - m, y: bb.y - m, w: bb.w + m * 2, h: bb.h + m * 2 }, W, H);
    const mw = r.w, mh = r.h;
    const ma = U.ctx(mask).getImageData(r.x, r.y, mw, mh).data;
    const cov = new Float32Array(mw * mh), unknown = new Uint8Array(mw * mh);
    for (let i = 0; i < cov.length; i++) { cov[i] = ma[i * 4 + 3] / 255; unknown[i] = cov[i] > 0.02 ? 1 : 0; }
    const dd = U.ctx(dst).getImageData(r.x, r.y, mw, mh);
    const D = dd.data;
    // only read the part of the source that offsets can reach (keeps huge canvases fast)
    const reach = offset ? Math.max(Math.abs(offset.x), Math.abs(offset.y)) + 2 : Math.max(bb.w, bb.h) * 3 + 40;
    const win = U.clipRect({ x: r.x - reach, y: r.y - reach, w: mw + reach * 2, h: mh + reach * 2 }, W, H);
    const full = U.ctx(src).getImageData(win.x, win.y, win.w, win.h).data;
    const at = (x, y) => ((y - win.y) * win.w + (x - win.x)) * 4;
    // pick a source offset by comparing the ring of pixels around the hole
    if (!offset) {
      const ring = [];
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const k = y * mw + x; if (!unknown[k]) ring.push(k); }
      const R = Math.max(bb.w, bb.h);
      let best = null, bestCost = Infinity;
      const tryOff = (ox, oy) => {
        ox = Math.round(ox); oy = Math.round(oy);
        if (r.x + ox < win.x || r.y + oy < win.y || r.x + ox + mw > win.x + win.w || r.y + oy + mh > win.y + win.h) return;
        // the source must not overlap the hole itself
        if (Math.abs(ox) < bb.w + 2 && Math.abs(oy) < bb.h + 2) return;
        let cost = 0;
        const step = Math.max(1, Math.floor(ring.length / 600));
        for (let n = 0; n < ring.length; n += step) {
          const k = ring[n], x = k % mw, y = (k / mw) | 0, a = k * 4, b = at(r.x + x + ox, r.y + y + oy);
          for (let c = 0; c < 3; c++) { const df = D[a + c] - full[b + c]; cost += df * df; }
        }
        cost *= 1 + Math.hypot(ox, oy) / (R * 12);
        if (cost < bestCost) { bestCost = cost; best = { x: ox, y: oy }; }
      };
      for (const f of [1.15, 1.5, 2, 2.8]) for (let a = 0; a < 24; a++) { const ang = (a / 24) * U.TAU; tryOff(Math.cos(ang) * (bb.w * f + 4), Math.sin(ang) * (bb.h * f + 4)); }
      if (!best) for (let a = 0; a < 24; a++) { const ang = (a / 24) * U.TAU; tryOff(Math.cos(ang) * (R + 8), Math.sin(ang) * (R + 8)); }
      if (!best) return null;
      // refine around the best guess
      const b0 = best;
      for (let j = -6; j <= 6; j += 2) for (let i = -6; i <= 6; i += 2) tryOff(b0.x + i, b0.y + j);
      offset = best;
    }
    // source texture S, and the colour difference to the destination on the known border
    const S = new Float32Array(mw * mh * 4), diff = new Float32Array(mw * mh * 4);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const k = y * mw + x, sx = U.clamp(r.x + x + offset.x, win.x, win.x + win.w - 1), sy = U.clamp(r.y + y + offset.y, win.y, win.y + win.h - 1), b = at(sx, sy);
      for (let c = 0; c < 4; c++) { S[k * 4 + c] = full[b + c]; diff[k * 4 + c] = unknown[k] ? 0 : D[k * 4 + c] - full[b + c]; }
    }
    solveMembrane(mw, mh, unknown, diff, 160);
    for (let k = 0; k < mw * mh; k++) {
      const a = cov[k];
      if (a <= 0) continue;
      for (let c = 0; c < 4; c++) { const v = S[k * 4 + c] + diff[k * 4 + c]; D[k * 4 + c] = D[k * 4 + c] * (1 - a) + U.clamp(v, 0, 255) * a; }
    }
    U.ctx(dst).putImageData(dd, r.x, r.y);
    return { rect: r, offset };
  }

  /* ---------- red eye ---------- */
  function redEye(canvas, cx, cy, radius) {
    const r = U.clipRect({ x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 }, canvas.width, canvas.height);
    if (!r) return null;
    const x = U.ctx(canvas), img = x.getImageData(r.x, r.y, r.w, r.h), d = img.data;
    let changed = 0;
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
      const dist = Math.hypot(i + r.x - cx, j + r.y - cy) / radius;
      if (dist > 1) continue;
      const k = (j * r.w + i) * 4, R = d[k], G = d[k + 1], Bc = d[k + 2], other = (G + Bc) / 2;
      const redness = R > 50 ? (R - Math.max(G, Bc)) / R : 0;
      if (redness < 0.25) continue;
      const w = U.clamp((redness - 0.25) / 0.35, 0, 1) * U.clamp((1 - dist) / 0.25, 0, 1);
      d[k] = R + (other * 0.85 - R) * w;
      d[k + 1] = G * (1 - 0.15 * w);
      d[k + 2] = Bc * (1 - 0.15 * w);
      changed++;
    }
    x.putImageData(img, r.x, r.y);
    return changed ? r : null;
  }

  /* ---------- Liquify ----------
   * A displacement field over the layer: each output pixel samples the original at (x+dx, y+dy).
   * Everything is stored in 128-px tiles that are only created where you brush, so Liquify stays
   * light even on very large canvases. */
  const LT = 128;
  class Liquify {
    constructor(doc, S) {
      this.doc = doc;
      this.S = S;
      this.w = doc.width; this.h = doc.height;
      this.src = new Map(); // tile key → original RGBA
      this.disp = new Map(); // tile key → Float32Array (dx, dy interleaved)
      this.bbox = null;
    }
    key(tx, ty) { return ty * 100000 + tx; }
    srcTile(tx, ty) {
      const k = this.key(tx, ty);
      let t = this.src.get(k);
      if (!t) {
        const w = Math.min(LT, this.w - tx * LT), h = Math.min(LT, this.h - ty * LT);
        t = { w, h, d: U.ctx(this.S.canvas).getImageData(tx * LT, ty * LT, w, h).data };
        this.src.set(k, t);
      }
      return t;
    }
    dispTile(tx, ty, create) {
      const k = this.key(tx, ty);
      let t = this.disp.get(k);
      if (!t && create) { t = new Float32Array(LT * LT * 2); this.disp.set(k, t); }
      return t;
    }
    // Make sure originals exist for an area before it gets overwritten.
    keep(x0, y0, x1, y1) {
      for (let ty = Math.floor(y0 / LT); ty <= Math.floor(y1 / LT); ty++) for (let tx = Math.floor(x0 / LT); tx <= Math.floor(x1 / LT); tx++) this.srcTile(tx, ty);
    }
    sample(x, y, out) {
      x = U.clamp(x, 0, this.w - 1.001); y = U.clamp(y, 0, this.h - 1.001);
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const px = (X, Y, c) => { const t = this.srcTile((X / LT) | 0, (Y / LT) | 0); return t.d[((Y % LT) * t.w + (X % LT)) * 4 + c]; };
      const x1 = Math.min(this.w - 1, x0 + 1), y1 = Math.min(this.h - 1, y0 + 1);
      for (let c = 0; c < 4; c++) out[c] = (px(x0, y0, c) * (1 - fx) + px(x1, y0, c) * fx) * (1 - fy) + (px(x0, y1, c) * (1 - fx) + px(x1, y1, c) * fx) * fy;
    }
    getD(x, y) {
      const t = this.dispTile((x / LT) | 0, (y / LT) | 0, false);
      if (!t) return null;
      const i = ((y % LT) * LT + (x % LT)) * 2;
      return [t[i], t[i + 1], t, i];
    }
    dab(cx, cy, radius, strength, mode, mvx, mvy) {
      const W = this.w, H = this.h, R = Math.max(2, radius);
      const x0 = Math.max(0, Math.floor(cx - R)), y0 = Math.max(0, Math.floor(cy - R)), x1 = Math.min(W - 1, Math.ceil(cx + R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
      if (x1 < x0 || y1 < y0) return;
      const k = U.clamp(strength, 0.01, 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const ex = x - cx, ey = y - cy, d = Math.hypot(ex, ey) / R;
        if (d >= 1) continue;
        const f = (1 - d * d) * (1 - d * d), t = this.dispTile((x / LT) | 0, (y / LT) | 0, true), i = ((y % LT) * LT + (x % LT)) * 2;
        let dx = t[i], dy = t[i + 1];
        if (mode === 'push') { dx -= mvx * f * k; dy -= mvy * f * k; }
        else if (mode === 'bloat') { dx -= ex * f * k * 0.06; dy -= ey * f * k * 0.06; }
        else if (mode === 'pinch') { dx += ex * f * k * 0.06; dy += ey * f * k * 0.06; }
        else if (mode === 'twirl' || mode === 'twirlccw') {
          const a = (mode === 'twirl' ? 1 : -1) * f * k * 0.08, c = Math.cos(a), s = Math.sin(a);
          dx += ex * c - ey * s - ex; dy += ex * s + ey * c - ey;
        } else if (mode === 'reconstruct') { dx *= 1 - f * k * 0.3; dy *= 1 - f * k * 0.3; }
        else if (mode === 'smooth') {
          let sx = 0, sy = 0, n = 0;
          for (const [qx, qy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
            const q = this.getD(qx, qy); n++;
            if (q) { sx += q[0]; sy += q[1]; }
          }
          if (n) { dx += (sx / n - dx) * f * k * 0.5; dy += (sy / n - dy) * f * k * 0.5; }
        }
        t[i] = dx; t[i + 1] = dy;
      }
      const rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      this.render(rect);
      this.bbox = U.union(this.bbox, rect);
      this.doc.invalidate(rect);
    }
    render(r) {
      // originals must be kept for the area we are about to overwrite, and for wherever it samples from
      this.keep(r.x, r.y, r.x + r.w - 1, r.y + r.h - 1);
      const x = U.ctx(this.S.canvas), img = x.createImageData(r.w, r.h), d = img.data, o4 = [0, 0, 0, 0];
      for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
        const X = r.x + i, Y = r.y + j, q = this.getD(X, Y), o = (j * r.w + i) * 4;
        this.sample(X + (q ? q[0] : 0), Y + (q ? q[1] : 0), o4);
        d[o] = o4[0]; d[o + 1] = o4[1]; d[o + 2] = o4[2]; d[o + 3] = o4[3];
      }
      x.putImageData(img, r.x, r.y);
    }
    restoreOriginals() {
      const x = U.ctx(this.S.canvas);
      for (const [k, t] of this.src) { const tx = k % 100000, ty = Math.floor(k / 100000); x.putImageData(new ImageData(new Uint8ClampedArray(t.d), t.w, t.h), tx * LT, ty * LT); }
      this.doc.invalidateAll();
    }
    reset() { this.disp.clear(); this.restoreOriginals(); this.bbox = null; }
    commit() {
      const r = U.clipRect(this.bbox, this.w, this.h);
      if (!r) return;
      // rebuild the "before" region from the saved original tiles
      const before = U.canvas(r.w, r.h), bx = U.ctx(before);
      bx.drawImage(this.S.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      for (const [k, t] of this.src) { const tx = k % 100000, ty = Math.floor(k / 100000); bx.putImageData(new ImageData(new Uint8ClampedArray(t.d), t.w, t.h), tx * LT - r.x, ty * LT - r.y); }
      this.doc.finishDirectEdit(this.S, before, r, 'Liquify', r.x, r.y);
    }
    cancel() { this.restoreOriginals(); }
  }

  ND.Heal = { heal, redEye, solveMembrane, Liquify };
})();
