/* Neon Draw — selection helpers (masks are white canvases; alpha = selected amount). */
'use strict';
(function () {
  const U = ND.U;
  const S = {};

  S.maskFromPath = function (doc, path, antialias) {
    const m = U.canvas(doc.width, doc.height), x = U.ctx(m);
    x.fillStyle = '#fff';
    x.imageSmoothingEnabled = antialias !== false;
    x.fill(path, 'evenodd');
    return m;
  };

  // Combine a new mask with the existing selection according to mode.
  S.combine = function (doc, mask, mode) {
    const cur = doc.selectionMask;
    if (!cur || mode === 'replace') return mask;
    const out = U.clone(cur), x = U.ctx(out);
    if (mode === 'add') { x.drawImage(mask, 0, 0); }
    else if (mode === 'subtract') { x.globalCompositeOperation = 'destination-out'; x.drawImage(mask, 0, 0); }
    else if (mode === 'intersect') { x.globalCompositeOperation = 'destination-in'; x.drawImage(mask, 0, 0); }
    x.globalCompositeOperation = 'source-over';
    return out;
  };

  function alphaArray(mask) {
    const d = U.ctx(mask).getImageData(0, 0, mask.width, mask.height).data;
    const a = new Uint8ClampedArray(mask.width * mask.height);
    for (let i = 0, j = 3; i < a.length; i++, j += 4) a[i] = d[j];
    return a;
  }
  function maskFromAlpha(a, w, h) {
    const m = U.canvas(w, h), x = U.ctx(m), id = x.createImageData(w, h), d = id.data;
    for (let i = 0, j = 0; i < a.length; i++, j += 4) { d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = a[i]; }
    x.putImageData(id, 0, 0);
    return m;
  }
  S.alphaArray = alphaArray;
  S.maskFromAlpha = maskFromAlpha;

  // Separable max/min filter (square structuring element).
  function morph(a, w, h, r, grow) {
    const pick = grow ? Math.max : Math.min, init = grow ? 0 : 255;
    let src = a;
    for (let pass = 0; pass < 2; pass++) {
      const out = new Uint8ClampedArray(src.length);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let v = init;
          for (let k = -r; k <= r; k++) {
            const xx = pass === 0 ? U.clamp(x + k, 0, w - 1) : x;
            const yy = pass === 1 ? U.clamp(y + k, 0, h - 1) : y;
            v = pick(v, src[yy * w + xx]);
          }
          out[y * w + x] = v;
        }
      }
      src = out;
    }
    return src;
  }
  S.grow = function (doc, px) {
    if (!doc.selectionMask) return null;
    return maskFromAlpha(morph(alphaArray(doc.selectionMask), doc.width, doc.height, px, true), doc.width, doc.height);
  };
  S.shrink = function (doc, px) {
    if (!doc.selectionMask) return null;
    return maskFromAlpha(morph(alphaArray(doc.selectionMask), doc.width, doc.height, px, false), doc.width, doc.height);
  };
  S.border = function (doc, px) {
    if (!doc.selectionMask) return null;
    const a = alphaArray(doc.selectionMask);
    const g = morph(a, doc.width, doc.height, px, true), s = morph(a, doc.width, doc.height, px, false);
    for (let i = 0; i < g.length; i++) g[i] = Math.max(0, g[i] - s[i]);
    return maskFromAlpha(g, doc.width, doc.height);
  };
  S.feather = function (doc, px) {
    if (!doc.selectionMask) return null;
    return ND.Filters.blurCanvas(doc.selectionMask, Math.max(0.5, px / 2));
  };
  S.smooth = function (doc) {
    if (!doc.selectionMask) return null;
    const m = S.feather(doc, 6);
    const a = alphaArray(m);
    for (let i = 0; i < a.length; i++) a[i] = a[i] >= 128 ? 255 : 0;
    return maskFromAlpha(a, doc.width, doc.height);
  };
  S.opaque = function (doc, layer) {
    const src = layer && layer.isPixel ? layer.canvas : layer ? doc.renderNode(layer) : doc.getProjection();
    const m = U.canvas(doc.width, doc.height), x = U.ctx(m);
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#fff';
    x.fillRect(0, 0, doc.width, doc.height);
    return m;
  };

  /* Flood region by colour similarity.
   * opts: {tolerance 0..255, contiguous, source canvas, antialias} → Uint8 coverage array */
  S.colourRegion = function (src, w, h, sx, sy, opts) {
    const d = U.ctx(src).getImageData(0, 0, w, h).data;
    const tol = opts.tolerance, out = new Uint8ClampedArray(w * h);
    const p = (sy * w + sx) * 4, r0 = d[p], g0 = d[p + 1], b0 = d[p + 2], a0 = d[p + 3];
    const diff = (i) => Math.max(Math.abs(d[i] - r0), Math.abs(d[i + 1] - g0), Math.abs(d[i + 2] - b0), Math.abs(d[i + 3] - a0));
    if (!opts.contiguous) {
      for (let i = 0, j = 0; i < out.length; i++, j += 4) if (diff(j) <= tol) out[i] = 255;
    } else {
      const stack = [sy * w + sx];
      out[sy * w + sx] = 255;
      while (stack.length) {
        const i = stack.pop(), x = i % w, y = (i / w) | 0;
        const n = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
        for (const k of n) {
          if (k < 0 || out[k]) continue;
          if (diff(k * 4) <= tol) { out[k] = 255; stack.push(k); }
        }
      }
    }
    return out;
  };
  /* Fill region that does not leak through small gaps in line art.
   * Lines (pixels unlike the seed colour) are thickened by `gap`, the area is flooded,
   * then grown back by the same amount without crossing the lines. */
  S.gapRegion = function (src, w, h, sx, sy, opts) {
    const gap = Math.max(1, Math.round(opts.gap));
    const sim = S.colourRegion(src, w, h, sx, sy, { tolerance: opts.tolerance, contiguous: false });
    const barrier = new Uint8ClampedArray(w * h);
    for (let i = 0; i < barrier.length; i++) barrier[i] = sim[i] ? 0 : 255;
    const thick = morph(barrier, w, h, gap, true);
    if (thick[sy * w + sx]) return S.colourRegion(src, w, h, sx, sy, opts); // clicked right next to a line
    const out = new Uint8ClampedArray(w * h), stack = [sy * w + sx];
    out[sy * w + sx] = 255;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      for (const k of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (k < 0 || out[k] || thick[k]) continue;
        out[k] = 255; stack.push(k);
      }
    }
    let cur = out;
    for (let g = 0; g <= gap; g++) {
      const grown = morph(cur, w, h, 1, true);
      for (let i = 0; i < grown.length; i++) if (!sim[i]) grown[i] = 0;
      cur = grown;
    }
    return cur;
  };

  S.wand = function (doc, x, y, opts) {
    const src = doc.sampleCanvas(opts.merged);
    const a = S.colourRegion(src, doc.width, doc.height, x, y, opts);
    let m = maskFromAlpha(a, doc.width, doc.height);
    if (opts.antialias) m = ND.Filters.blurCanvas(m, 0.6);
    return m;
  };

  // Bounding box of non-transparent pixels. Large masks are scanned at low resolution first.
  S.bbox = function (mask, step, hint) {
    step = step || 1;
    const W = mask.width, H = mask.height;
    let area = hint ? U.clipRect({ x: hint.x - 2, y: hint.y - 2, w: hint.w + 4, h: hint.h + 4 }, W, H) : { x: 0, y: 0, w: W, h: H };
    if (!area) return null;
    const f = Math.ceil(Math.max(area.w, area.h) / 1024);
    if (f > 1) {
      const sw = Math.ceil(area.w / f), sh = Math.ceil(area.h / f), c = U.canvas(sw, sh), x = U.ctx(c);
      x.imageSmoothingEnabled = true;
      x.drawImage(mask, area.x, area.y, area.w, area.h, 0, 0, sw, sh);
      const d = x.getImageData(0, 0, sw, sh).data;
      let a0 = sw, b0 = sh, a1 = -1, b1 = -1;
      for (let y = 0; y < sh; y++) for (let xx = 0; xx < sw; xx++) if (d[(y * sw + xx) * 4 + 3] > 0) { if (xx < a0) a0 = xx; if (xx > a1) a1 = xx; if (y < b0) b0 = y; if (y > b1) b1 = y; }
      if (a1 < 0) return null;
      area = U.clipRect({ x: area.x + (a0 - 1) * f, y: area.y + (b0 - 1) * f, w: (a1 - a0 + 3) * f, h: (b1 - b0 + 3) * f }, W, H);
    }
    const d = U.ctx(mask).getImageData(area.x, area.y, area.w, area.h).data, w = area.w, h = area.h;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        if (d[(y * w + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    return { x: area.x + x0, y: area.y + y0, w: Math.min(W - area.x - x0, x1 - x0 + step), h: Math.min(H - area.y - y0, y1 - y0 + step) };
  };
  S.contentBBox = function (canvas) { return S.bbox(canvas, 1); };

  /* Build marching-ants overlays (two phases) for a mask. */
  S.buildAnts = function (mask) {
    const W = mask.width, H = mask.height, bb = S.bbox(mask, 1);
    if (!bb) return null;
    const r = U.clipRect({ x: bb.x - 1, y: bb.y - 1, w: bb.w + 2, h: bb.h + 2 }, W, H), w = r.w, h = r.h;
    const src = U.ctx(mask).getImageData(r.x, r.y, w, h).data;
    const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]);
    const ids = [new ImageData(w, h), new ImageData(w, h)];
    let any = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (a(x, y) < 128) continue;
        const gx = x + r.x, gy = y + r.y;
        const edge = gx === 0 || gy === 0 || gx === W - 1 || gy === H - 1 || a(x - 1, y) < 128 || a(x + 1, y) < 128 || a(x, y - 1) < 128 || a(x, y + 1) < 128;
        if (!edge) continue;
        any = true;
        const on = ((gx + gy) >> 2) & 1, j = (y * w + x) * 4;
        for (let p = 0; p < 2; p++) { const d = ids[p].data, v = (on ^ p) ? 255 : 0; d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255; }
      }
    }
    if (!any) return null;
    // full-size overlays (only the edge area is drawn into them)
    return ids.map((id) => { const c = U.canvas(W, H); U.ctx(c).putImageData(id, r.x, r.y); return c; });
  };

  ND.Sel = S;
})();
