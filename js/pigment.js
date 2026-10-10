/* Neon Sparks Draw — pigment (paint-like) colour mixing.
 * Screens mix light: blue + yellow averages to grey. Paint mixes pigment: blue + yellow makes green.
 * This uses the Kubelka–Munk model per channel in linear light: each colour is turned into an
 * absorption/scattering ratio K/S = (1 − R)² / 2R, ratios are mixed, then converted back to reflectance.
 * (Written for Neon Sparks Draw; no third-party code.) */
'use strict';
(function () {
  const lin = new Float32Array(256), ks = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255, l = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    lin[i] = l;
    const R = Math.min(0.999, Math.max(0.001, l));
    ks[i] = ((1 - R) * (1 - R)) / (2 * R);
  }
  const toSRGB = (l) => {
    l = l < 0 ? 0 : l > 1 ? 1 : l;
    return 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);
  };
  const fromKS = (k) => 1 + k - Math.sqrt(k * k + 2 * k);
  const ksOf = (v) => {
    const i = v | 0;
    if (i >= 255) return ks[255];
    if (i <= 0) return ks[0];
    const t = v - i;
    return ks[i] * (1 - t) + ks[i + 1] * t;
  };

  // Mix colour a towards colour b by t (0..1) like paint. Colours are [r, g, b] 0..255 (floats ok).
  function mix(a, b, t) {
    if (t <= 0) return [a[0], a[1], a[2]];
    if (t >= 1) return [b[0], b[1], b[2]];
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const k = ksOf(a[c]) * (1 - t) + ksOf(b[c]) * t;
      out[c] = toSRGB(fromKS(k));
    }
    // K–M darkens mixtures a little more than real paint: keep the mixture's brightness between the two
    const la = 0.2126 * lin[a[0] | 0] + 0.7152 * lin[a[1] | 0] + 0.0722 * lin[a[2] | 0];
    const lb = 0.2126 * lin[b[0] | 0] + 0.7152 * lin[b[1] | 0] + 0.0722 * lin[b[2] | 0];
    const target = la * (1 - t) + lb * t;
    const lm = 0.2126 * lin[Math.round(out[0])] + 0.7152 * lin[Math.round(out[1])] + 0.0722 * lin[Math.round(out[2])];
    if (lm > 1e-4 && lm < target) {
      const g = Math.min(2.2, Math.sqrt(target / lm)); // partial lift
      for (let c = 0; c < 3; c++) out[c] = toSRGB(Math.min(1, (lin[Math.round(out[c])] || 0) * g));
    }
    return out;
  }
  // In-place helper for engines that keep a working colour array.
  function mixInto(cur, b, t) { const m = mix(cur, b, t); cur[0] = m[0]; cur[1] = m[1]; cur[2] = m[2]; return cur; }
  // A row of mixes between two hex colours.
  function ramp(hexA, hexB, n) {
    const a = ND.U.hexToRgb(hexA), b = ND.U.hexToRgb(hexB), out = [];
    for (let i = 0; i < n; i++) { const m = mix(a, b, i / (n - 1)); out.push(ND.U.rgbToHex(m[0], m[1], m[2])); }
    return out;
  }

  ND.Pigment = { mix, mixInto, ramp };
})();
