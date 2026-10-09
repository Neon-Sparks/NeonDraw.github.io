/* Neon Draw — colour harmony maths (used by the Harmony wheel in the colour panel). */
'use strict';
(function () {
  /* ---------- colour harmony maths ---------- */
  // Painter's (RYB) wheel ↔ RGB hue: complements match paint mixing (blue ↔ orange, red ↔ green, yellow ↔ violet).
  const RYB = [[0, 0], [60, 30], [120, 60], [180, 120], [240, 240], [300, 280], [360, 360]];
  const lerpTable = (t, from, to) => {
    t = ((t % 360) + 360) % 360;
    for (let i = 1; i < RYB.length; i++) {
      const a = RYB[i - 1], b = RYB[i];
      if (t <= b[from]) return a[to] + ((t - a[from]) / (b[from] - a[from] || 1)) * (b[to] - a[to]);
    }
    return t;
  };
  const rybToHue = (a) => lerpTable(a, 0, 1), hueToRyb = (hh) => lerpTable(hh, 1, 0);
  const RULES = [
    ['complementary', 'Complementary'], ['analogous', 'Analogous'], ['triadic', 'Triadic'], ['split', 'Split complementary'],
    ['tetradic', 'Rectangle (tetradic)'], ['square', 'Square'], ['mono', 'Monochromatic'], ['shades', 'Shades & tints'],
  ];
  // Colours of a scheme as [hue, sat, val]; hue offsets are taken on the chosen wheel.
  function harmony(base, rule, spread, ryb) {
    const [h0, s0, v0] = base, toW = (hh) => (ryb ? hueToRyb(hh) : hh), fromW = (a) => (ryb ? rybToHue(a) : ((a % 360) + 360) % 360);
    const rot = (offs) => offs.map((o) => [fromW(toW(h0) + o), s0, v0]);
    switch (rule) {
      case 'complementary': return rot([0, 180]);
      case 'analogous': return rot([-2 * spread, -spread, 0, spread, 2 * spread]);
      case 'triadic': return rot([0, 120, 240]);
      case 'split': return rot([0, 180 - spread, 180 + spread]);
      case 'tetradic': return rot([0, spread * 2, 180, 180 + spread * 2]);
      case 'square': return rot([0, 90, 180, 270]);
      case 'mono': return [[h0, s0, v0], [h0, s0 * 0.55, Math.min(1, v0 * 1.12)], [h0, Math.min(1, s0 * 1.15), v0 * 0.72], [h0, s0 * 0.3, Math.min(1, v0 * 1.2 + 0.1)], [h0, s0, v0 * 0.45]];
      case 'shades': return [[h0, s0 * 0.25, Math.min(1, v0 + (1 - v0) * 0.75)], [h0, s0 * 0.6, Math.min(1, v0 + (1 - v0) * 0.4)], [h0, s0, v0], [h0, s0, v0 * 0.65], [h0, s0, v0 * 0.35]];
      default: return [base];
    }
  }

  ND.Harmony = { harmony, rybToHue, hueToRyb, RULES };
})();
