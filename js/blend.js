/* Neon Draw — blend modes.
 * Modes the browser supports natively are composited on the GPU with
 * globalCompositeOperation; the rest fall back to the per-pixel JS path. */
'use strict';
(function () {
  const MODES = [
    { id: 'normal', label: 'Normal', cat: 'Normal' },
    { id: 'multiply', label: 'Multiply', cat: 'Darken' },
    { id: 'darken', label: 'Darken', cat: 'Darken' },
    { id: 'burn', label: 'Color Burn', cat: 'Darken' },
    { id: 'linearburn', label: 'Linear Burn', cat: 'Darken' },
    { id: 'darkercolor', label: 'Darker Color', cat: 'Darken' },
    { id: 'screen', label: 'Screen', cat: 'Lighten' },
    { id: 'lighten', label: 'Lighten', cat: 'Lighten' },
    { id: 'dodge', label: 'Color Dodge', cat: 'Lighten' },
    { id: 'add', label: 'Linear Dodge (Add)', cat: 'Lighten' },
    { id: 'lightercolor', label: 'Lighter Color', cat: 'Lighten' },
    { id: 'overlay', label: 'Overlay', cat: 'Mix' },
    { id: 'softlight', label: 'Soft Light', cat: 'Mix' },
    { id: 'hardlight', label: 'Hard Light', cat: 'Mix' },
    { id: 'vividlight', label: 'Vivid Light', cat: 'Mix' },
    { id: 'linearlight', label: 'Linear Light', cat: 'Mix' },
    { id: 'pinlight', label: 'Pin Light', cat: 'Mix' },
    { id: 'hardmix', label: 'Hard Mix', cat: 'Mix' },
    { id: 'difference', label: 'Difference', cat: 'Negative' },
    { id: 'exclusion', label: 'Exclusion', cat: 'Negative' },
    { id: 'subtract', label: 'Subtract', cat: 'Arithmetic' },
    { id: 'divide', label: 'Divide', cat: 'Arithmetic' },
    { id: 'grainextract', label: 'Grain Extract', cat: 'Arithmetic' },
    { id: 'grainmerge', label: 'Grain Merge', cat: 'Arithmetic' },
    { id: 'hue', label: 'Hue', cat: 'HSX' },
    { id: 'saturation', label: 'Saturation', cat: 'HSX' },
    { id: 'color', label: 'Color', cat: 'HSX' },
    { id: 'luminosity', label: 'Luminosity', cat: 'HSX' },
  ];

  const NATIVE = {
    normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken',
    lighten: 'lighten', dodge: 'color-dodge', burn: 'color-burn', hardlight: 'hard-light',
    softlight: 'soft-light', difference: 'difference', exclusion: 'exclusion', hue: 'hue',
    saturation: 'saturation', color: 'color', luminosity: 'luminosity',
  };

  const C = Math.min, X = Math.max;
  const SEP = {
    multiply: (b, s) => b * s,
    screen: (b, s) => b + s - b * s,
    overlay: (b, s) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
    hardlight: (b, s) => (s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
    softlight: (b, s) => (s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b)),
    darken: (b, s) => C(b, s),
    lighten: (b, s) => X(b, s),
    dodge: (b, s) => (s >= 1 ? 1 : C(1, b / (1 - s))),
    burn: (b, s) => (s <= 0 ? 0 : 1 - C(1, (1 - b) / s)),
    difference: (b, s) => Math.abs(b - s),
    exclusion: (b, s) => b + s - 2 * b * s,
    add: (b, s) => C(1, b + s),
    subtract: (b, s) => X(0, b - s),
    divide: (b, s) => (s <= 0 ? 1 : C(1, b / s)),
    linearburn: (b, s) => X(0, b + s - 1),
    vividlight: (b, s) => (s <= 0.5 ? (s <= 0 ? 0 : 1 - C(1, (1 - b) / (2 * s))) : s >= 1 ? 1 : C(1, b / (2 * (1 - s)))),
    linearlight: (b, s) => C(1, X(0, b + 2 * s - 1)),
    pinlight: (b, s) => (s <= 0.5 ? C(b, 2 * s) : X(b, 2 * (s - 0.5))),
    hardmix: (b, s) => (b + s >= 1 ? 1 : 0),
    grainextract: (b, s) => C(1, X(0, b - s + 0.5)),
    grainmerge: (b, s) => C(1, X(0, b + s - 0.5)),
  };

  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const sat = (r, g, b) => X(r, g, b) - C(r, g, b);
  function clipColor(r, g, b) {
    const l = lum(r, g, b), n = C(r, g, b), x = X(r, g, b);
    if (n < 0) { r = l + ((r - l) * l) / (l - n); g = l + ((g - l) * l) / (l - n); b = l + ((b - l) * l) / (l - n); }
    if (x > 1) { r = l + ((r - l) * (1 - l)) / (x - l); g = l + ((g - l) * (1 - l)) / (x - l); b = l + ((b - l) * (1 - l)) / (x - l); }
    return [r, g, b];
  }
  function setLum(r, g, b, l) {
    const d = l - lum(r, g, b);
    return clipColor(r + d, g + d, b + d);
  }
  function setSat(r, g, b, s) {
    const c = [[r, 0], [g, 1], [b, 2]].sort((p, q) => p[0] - q[0]);
    const out = [0, 0, 0];
    if (c[2][0] > c[0][0]) { out[c[1][1]] = ((c[1][0] - c[0][0]) * s) / (c[2][0] - c[0][0]); out[c[2][1]] = s; }
    return out;
  }
  const NONSEP = {
    hue: (br, bg, bb, sr, sg, sb) => { const t = setSat(sr, sg, sb, sat(br, bg, bb)); return setLum(t[0], t[1], t[2], lum(br, bg, bb)); },
    saturation: (br, bg, bb, sr, sg, sb) => { const t = setSat(br, bg, bb, sat(sr, sg, sb)); return setLum(t[0], t[1], t[2], lum(br, bg, bb)); },
    color: (br, bg, bb, sr, sg, sb) => setLum(sr, sg, sb, lum(br, bg, bb)),
    luminosity: (br, bg, bb, sr, sg, sb) => setLum(br, bg, bb, lum(sr, sg, sb)),
    darkercolor: (br, bg, bb, sr, sg, sb) => (lum(sr, sg, sb) < lum(br, bg, bb) ? [sr, sg, sb] : [br, bg, bb]),
    lightercolor: (br, bg, bb, sr, sg, sb) => (lum(sr, sg, sb) > lum(br, bg, bb) ? [sr, sg, sb] : [br, bg, bb]),
  };

  /* Blend `src` ImageData over `dst` ImageData (same size) in place.
   * alphaLock keeps the destination alpha (used for alpha-locked layers). */
  function blendImageData(dst, src, mode, opacity, alphaLock) {
    const D = dst.data, S = src.data, f = SEP[mode], g = NONSEP[mode];
    for (let i = 0; i < D.length; i += 4) {
      const as = (S[i + 3] / 255) * opacity;
      if (as <= 0) continue;
      const ab = D[i + 3] / 255;
      if (alphaLock && ab <= 0) continue;
      const sr = S[i] / 255, sg = S[i + 1] / 255, sb = S[i + 2] / 255;
      const br = D[i] / 255, bg = D[i + 1] / 255, bb = D[i + 2] / 255;
      let mr, mg, mb;
      if (f) { mr = f(br, sr); mg = f(bg, sg); mb = f(bb, sb); }
      else if (g) { const t = g(br, bg, bb, sr, sg, sb); mr = t[0]; mg = t[1]; mb = t[2]; }
      else { mr = sr; mg = sg; mb = sb; }
      const ao = alphaLock ? ab : as + ab * (1 - as);
      if (ao <= 0) continue;
      const k = alphaLock ? 1 / ab : 1 / ao;
      if (alphaLock) {
        // Paint inside existing coverage only: lerp between backdrop and mixed colour.
        D[i] = 255 * (br + (((1 - ab) * sr + ab * mr) - br) * as);
        D[i + 1] = 255 * (bg + (((1 - ab) * sg + ab * mg) - bg) * as);
        D[i + 2] = 255 * (bb + (((1 - ab) * sb + ab * mb) - bb) * as);
      } else {
        D[i] = 255 * ((1 - as) * ab * br + (1 - ab) * as * sr + as * ab * mr) * k;
        D[i + 1] = 255 * ((1 - as) * ab * bg + (1 - ab) * as * sg + as * ab * mg) * k;
        D[i + 2] = 255 * ((1 - as) * ab * bb + (1 - ab) * as * sb + as * ab * mb) * k;
        D[i + 3] = 255 * ao;
      }
    }
  }

  ND.Blend = {
    MODES,
    NATIVE,
    isNative: (m) => !!NATIVE[m],
    blendImageData,
    label: (id) => (MODES.find((m) => m.id === id) || MODES[0]).label,
    // Build <option>/<optgroup> markup for a blend select.
    fillSelect(sel, value) {
      sel.innerHTML = '';
      let grp = null, cat = null;
      for (const m of MODES) {
        if (m.cat !== cat) { cat = m.cat; grp = document.createElement('optgroup'); grp.label = cat; sel.appendChild(grp); }
        const o = document.createElement('option');
        o.value = m.id; o.textContent = m.label;
        grp.appendChild(o);
      }
      sel.value = value || 'normal';
    },
  };
})();
