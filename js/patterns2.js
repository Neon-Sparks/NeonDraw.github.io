/* Neon Sparks Draw — more scatter sprites and seamless tiles (added to the libraries in patterns.js).
 * Sprites: { name, rot: 'random' | 'upright' | 'direction', v: variants, tintable?, make(rng) → canvas }
 * Tiles:   { name, mono?, make() → canvas } — draw anything that crosses an edge again on the other side. */
'use strict';
(function () {
  const U = ND.U, T = U.TAU;
  const pick = (r, a) => a[(r() * a.length) | 0];
  const sq = (n, fn) => U.drawSquare(n, fn);
  const W = '#ffffff';
  function ellipse(x, cx, cy, rx, ry, rot) { x.beginPath(); x.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, T); }
  function petal(x, cx, cy, len, wid, ang, col) { x.save(); x.translate(cx, cy); x.rotate(ang); x.fillStyle = col; x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(len * 0.3, -wid, len * 0.85, -wid * 0.8, len, 0); x.bezierCurveTo(len * 0.85, wid * 0.8, len * 0.3, wid, 0, 0); x.fill(); x.restore(); }
  function glow(x, cx, cy, r, col) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, T); x.fill(); }
  function star(x, cx, cy, ro, ri, n, rot) { x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * T - Math.PI / 2 + (rot || 0), rr = i % 2 ? ri : ro; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); }
  // draw fn at the 9 wrapped positions so tiles are seamless
  const wrap = (s, fn) => { for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) fn(ox, oy); };

  const PINKS = ['#f7a1b8', '#f48fb1', '#ec6f95', '#f9c5d5', '#e2557a'];
  const WILD = ['#e94f64', '#f2c14e', '#6c8ef5', '#f78f3f', '#b67de8', '#ffffff'];
  const GREENS = ['#3d7a3f', '#57a34a', '#2f6b34', '#6bbf59', '#48914a'];
  const SEA = ['#ff7f6b', '#ff9e7a', '#f05a7e', '#ffc36b', '#c45ab3'];

  const SPRITES = [
    { name: 'Rose Petals', rot: 'random', v: 4, make: (r) => sq(96, (x) => { for (let i = 0; i < 5; i++) { const c = pick(r, PINKS); petal(x, 20 + r() * 56, 20 + r() * 56, 18 + r() * 12, 8 + r() * 5, r() * T, c); } }) },
    { name: 'Wildflowers', rot: 'upright', v: 4, make: (r) => sq(96, (x) => {
      for (let i = 0; i < 5; i++) {
        const bx = 14 + r() * 68, top = 18 + r() * 40, c = pick(r, WILD);
        x.strokeStyle = pick(r, GREENS); x.lineWidth = 1.6; x.beginPath(); x.moveTo(bx, 96); x.quadraticCurveTo(bx + (r() - 0.5) * 16, (96 + top) / 2, bx + (r() - 0.5) * 8, top); x.stroke();
        for (let k = 0; k < 5; k++) petal(x, bx, top, 7, 3.2, (k / 5) * T + r(), c);
        x.fillStyle = '#f6d34a'; x.beginPath(); x.arc(bx, top, 2.2, 0, T); x.fill();
      }
    }) },
    { name: 'Lavender', rot: 'upright', v: 3, make: (r) => sq(96, (x) => {
      for (let i = 0; i < 4; i++) {
        const bx = 18 + r() * 60, top = 10 + r() * 30;
        x.strokeStyle = '#6f8f5a'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(bx, 96); x.lineTo(bx + (r() - 0.5) * 10, top); x.stroke();
        for (let k = 0; k < 9; k++) { x.fillStyle = pick(r, ['#8e6fc8', '#a487d8', '#7656b5', '#b9a1e6']); ellipse(x, bx + (r() - 0.5) * 6, top + k * 4.2, 2.6, 3.4, r()); x.fill(); }
      }
    }) },
    { name: 'Tulips', rot: 'upright', v: 3, make: (r) => sq(96, (x) => {
      for (let i = 0; i < 3; i++) {
        const bx = 18 + r() * 60, top = 20 + r() * 30, c = pick(r, ['#e2384d', '#f2a33a', '#f6d54a', '#d4579d', '#ffffff']);
        x.strokeStyle = '#4c8a3a'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(bx, 96); x.lineTo(bx, top + 8); x.stroke();
        x.fillStyle = '#5a9a43'; ellipse(x, bx - 6, 72, 4, 14, -0.4); x.fill();
        x.fillStyle = c; x.beginPath(); x.moveTo(bx - 8, top); x.lineTo(bx - 4, top + 5); x.lineTo(bx, top - 2); x.lineTo(bx + 4, top + 5); x.lineTo(bx + 8, top); x.quadraticCurveTo(bx + 9, top + 14, bx, top + 15); x.quadraticCurveTo(bx - 9, top + 14, bx - 8, top); x.fill();
      }
    }) },
    { name: 'Reeds', rot: 'upright', v: 3, make: (r) => sq(96, (x) => {
      for (let i = 0; i < 7; i++) {
        const bx = 8 + r() * 80, top = 4 + r() * 30, lean = (r() - 0.5) * 20;
        x.strokeStyle = pick(r, ['#8a9a4a', '#6f7f3a', '#a5ad6a']); x.lineWidth = 1.4; x.beginPath(); x.moveTo(bx, 96); x.quadraticCurveTo(bx + lean * 0.3, 50, bx + lean, top); x.stroke();
        if (r() < 0.45) { x.fillStyle = '#6b4a2b'; ellipse(x, bx + lean * 0.85, top + 12, 2.6, 8, lean * 0.01); x.fill(); }
      }
    }) },
    { name: 'Pine Trees', rot: 'upright', v: 4, make: (r) => sq(96, (x) => {
      const cx = 48, base = 92, h = 60 + r() * 26, w = 22 + r() * 10, c = pick(r, ['#2e5e3a', '#3a6e44', '#25503a', '#41764a']);
      x.fillStyle = '#5a3d26'; x.fillRect(cx - 2.5, base - 10, 5, 10);
      for (let k = 0; k < 4; k++) { const y0 = base - 8 - k * (h / 4.5), ww = w * (1 - k * 0.2); x.fillStyle = k % 2 ? U.shade(c, 0.12) : c; x.beginPath(); x.moveTo(cx - ww, y0); x.lineTo(cx + ww, y0); x.lineTo(cx, y0 - h * 0.42); x.closePath(); x.fill(); }
    }) },
    { name: 'Tree Canopy', rot: 'random', v: 4, make: (r) => sq(128, (x) => {
      const base = pick(r, ['#3f7a3a', '#4f8a3f', '#2f6431', '#5c8f3c']);
      for (let i = 0; i < 26; i++) { const a = r() * T, d = Math.sqrt(r()) * 40, rr = 10 + r() * 12; x.fillStyle = U.shade(base, (r() - 0.6) * 0.5); x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rr, 0, T); x.fill(); }
      for (let i = 0; i < 10; i++) { const a = -Math.PI * 0.75 + r() * 1.2, d = 20 + r() * 25; x.fillStyle = U.shade(base, 0.35); x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 4 + r() * 6, 0, T); x.fill(); }
    }) },
    { name: 'Seaweed', rot: 'upright', v: 3, make: (r) => sq(96, (x) => {
      for (let i = 0; i < 3; i++) { const bx = 20 + r() * 56; x.strokeStyle = pick(r, ['#2f7a5a', '#3f8f4a', '#5a7a2f']); x.lineWidth = 4 + r() * 3; x.lineCap = 'round'; x.beginPath(); x.moveTo(bx, 96); for (let k = 1; k <= 6; k++) x.lineTo(bx + Math.sin(k * 1.3 + r()) * 8, 96 - k * (12 + r() * 3)); x.stroke(); }
    }) },
    { name: 'Coral', rot: 'upright', v: 3, make: (r) => sq(96, (x) => {
      const c = pick(r, SEA); x.strokeStyle = c; x.lineCap = 'round';
      const branch = (px, py, ang, len, w, depth) => { const ex = px + Math.cos(ang) * len, ey = py + Math.sin(ang) * len; x.lineWidth = w; x.beginPath(); x.moveTo(px, py); x.lineTo(ex, ey); x.stroke(); if (depth > 0) { branch(ex, ey, ang - 0.35 - r() * 0.3, len * 0.72, w * 0.72, depth - 1); branch(ex, ey, ang + 0.35 + r() * 0.3, len * 0.72, w * 0.72, depth - 1); } };
      branch(48, 94, -Math.PI / 2 + (r() - 0.5) * 0.2, 24, 7, 3);
    }) },
    { name: 'Raindrops', rot: 'random', v: 3, make: (r) => sq(64, (x) => {
      for (let i = 0; i < 4; i++) {
        const cx = 10 + r() * 44, cy = 10 + r() * 44, s = 4 + r() * 6;
        x.fillStyle = 'rgba(180,215,255,0.45)'; x.beginPath(); x.moveTo(cx, cy - s * 1.6); x.quadraticCurveTo(cx + s, cy, cx, cy + s); x.quadraticCurveTo(cx - s, cy, cx, cy - s * 1.6); x.fill();
        x.strokeStyle = 'rgba(40,70,110,0.5)'; x.lineWidth = 1; x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.9)'; ellipse(x, cx - s * 0.3, cy - s * 0.1, s * 0.18, s * 0.35, 0.3); x.fill();
      }
    }) },
    { name: 'Fireflies', rot: 'random', v: 3, make: (r) => sq(64, (x) => { for (let i = 0; i < 3; i++) glow(x, 12 + r() * 40, 12 + r() * 40, 6 + r() * 8, pick(r, ['#d8ff6a', '#fff27a', '#b6ff8a'])); }) },
    { name: 'Glitter', rot: 'random', v: 4, make: (r) => sq(64, (x) => { for (let i = 0; i < 18; i++) { x.fillStyle = pick(r, ['#ffd86b', '#ffffff', '#ff8ad8', '#8ad8ff', '#c9a8ff']); x.globalAlpha = 0.6 + r() * 0.4; const s = 1 + r() * 2.5; x.save(); x.translate(r() * 64, r() * 64); x.rotate(r() * T); x.fillRect(-s, -s * 0.6, s * 2, s * 1.2); x.restore(); } x.globalAlpha = 1; }) },
    { name: 'Galaxy Stars', rot: 'random', v: 4, make: (r) => sq(96, (x) => {
      for (let i = 0; i < 26; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.3 + r() * 0.7) + ')'; x.beginPath(); x.arc(r() * 96, r() * 96, 0.5 + r() * 1.2, 0, T); x.fill(); }
      const cx = 30 + r() * 36, cy = 30 + r() * 36; glow(x, cx, cy, 10, pick(r, ['#9cc7ff', '#ffd2a8', '#ffffff']));
      x.fillStyle = '#fff'; star(x, cx, cy, 9, 1.2, 4, 0); x.fill();
    }) },
    { name: 'Hatch Marks', rot: 'direction', v: 3, tintable: true, make: (r) => sq(64, (x) => { x.strokeStyle = W; x.lineCap = 'round'; for (let i = 0; i < 6; i++) { x.lineWidth = 1 + r() * 1.2; const y = 12 + i * 8 + (r() - 0.5) * 3; x.beginPath(); x.moveTo(10 + r() * 8, y); x.lineTo(46 + r() * 10, y - 6 - r() * 4); x.stroke(); } }) },
    { name: 'Cross Marks', rot: 'random', v: 3, tintable: true, make: (r) => sq(48, (x) => { x.strokeStyle = W; x.lineCap = 'round'; for (let i = 0; i < 3; i++) { const cx = 10 + r() * 28, cy = 10 + r() * 28, s = 4 + r() * 4; x.lineWidth = 1.5 + r(); x.beginPath(); x.moveTo(cx - s, cy - s); x.lineTo(cx + s, cy + s); x.moveTo(cx + s, cy - s); x.lineTo(cx - s, cy + s); x.stroke(); } }) },
    { name: 'Hair Strands', rot: 'direction', v: 4, tintable: true, make: (r) => sq(96, (x) => { x.strokeStyle = W; x.lineCap = 'round'; for (let i = 0; i < 9; i++) { x.globalAlpha = 0.4 + r() * 0.6; x.lineWidth = 0.8 + r() * 1.4; const y = 20 + r() * 56; x.beginPath(); x.moveTo(4, y); x.bezierCurveTo(30, y + (r() - 0.5) * 30, 66, y + (r() - 0.5) * 30, 92, y + (r() - 0.5) * 16); x.stroke(); } x.globalAlpha = 1; }) },
    { name: 'Stitches', rot: 'direction', v: 1, tintable: true, make: () => sq(48, (x) => { x.strokeStyle = W; x.lineWidth = 3; x.lineCap = 'round'; x.beginPath(); x.moveTo(8, 24); x.lineTo(30, 24); x.stroke(); }) },
    { name: 'Chain', rot: 'direction', v: 1, make: () => sq(64, (x) => { x.lineWidth = 5; x.strokeStyle = '#7d8590'; ellipse(x, 22, 32, 16, 9, 0); x.stroke(); x.strokeStyle = '#a9b1bb'; x.lineWidth = 2; ellipse(x, 22, 31, 16, 9, 0); x.stroke(); x.lineWidth = 5; x.strokeStyle = '#6b727c'; x.beginPath(); x.moveTo(42, 32); x.lineTo(62, 32); x.stroke(); }) },
    { name: 'Rope', rot: 'direction', v: 1, make: () => sq(48, (x) => { for (let i = -1; i < 4; i++) { x.fillStyle = i % 2 ? '#b08850' : '#c9a066'; x.beginPath(); x.moveTo(i * 14, 14); x.lineTo(i * 14 + 14, 14); x.lineTo(i * 14 + 26, 34); x.lineTo(i * 14 + 12, 34); x.closePath(); x.fill(); } x.strokeStyle = 'rgba(70,45,20,0.6)'; x.lineWidth = 1; x.strokeRect(0, 14, 48, 20); }) },
    { name: 'Footprints', rot: 'direction', v: 2, tintable: true, make: (r) => sq(96, (x) => {
      x.fillStyle = W;
      const foot = (cx, cy, flip) => { ellipse(x, cx, cy, 13, 6.5, 0); x.fill(); for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(cx + 14 + k * 0.6, cy + flip * (-6 + k * 3), 2 - k * 0.2, 0, T); x.fill(); } };
      foot(28, 36 + r() * 4, 1); foot(62, 62 + r() * 4, -1);
    }) },
    { name: 'Ink Blots', rot: 'random', v: 4, tintable: true, make: (r) => sq(96, (x) => {
      x.fillStyle = W; x.beginPath();
      const n = 40, ph = [r() * 6, r() * 6];
      for (let i = 0; i <= n; i++) { const a = (i / n) * T, k = 1 + 0.28 * Math.sin(a * 5 + ph[0]) + 0.16 * Math.sin(a * 11 + ph[1]) + (r() - 0.5) * 0.2, rr = 22 * k; x.lineTo(48 + Math.cos(a) * rr, 48 + Math.sin(a) * rr); }
      x.fill();
      for (let i = 0; i < 9; i++) { const a = r() * T, d = 28 + r() * 16; x.beginPath(); x.arc(48 + Math.cos(a) * d, 48 + Math.sin(a) * d, 1 + r() * 3.5, 0, T); x.fill(); }
    }) },
    { name: 'Candy', rot: 'random', v: 3, make: (r) => sq(64, (x) => {
      const c = pick(r, ['#ff5d8f', '#5dc8ff', '#ffd23f', '#8be07a', '#c38aff']);
      x.fillStyle = U.shade(c, -0.15); x.beginPath(); x.moveTo(8, 22); x.lineTo(20, 32); x.lineTo(8, 42); x.closePath(); x.fill(); x.beginPath(); x.moveTo(56, 22); x.lineTo(44, 32); x.lineTo(56, 42); x.closePath(); x.fill();
      x.fillStyle = c; ellipse(x, 32, 32, 14, 11, 0); x.fill(); x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(24, 26); x.lineTo(40, 38); x.stroke();
    }) },
    { name: 'Balloons', rot: 'upright', v: 3, make: (r) => sq(96, (x) => {
      const c = pick(r, ['#ff4d6d', '#ffd23f', '#3a86ff', '#8ac926', '#ff9f1c', '#c77dff']);
      x.strokeStyle = 'rgba(80,80,80,0.7)'; x.lineWidth = 1; x.beginPath(); x.moveTo(48, 66); x.quadraticCurveTo(42 + r() * 12, 80, 48, 96); x.stroke();
      x.fillStyle = c; ellipse(x, 48, 38, 20, 25, 0); x.fill(); x.beginPath(); x.moveTo(44, 64); x.lineTo(52, 64); x.lineTo(48, 60); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.45)'; ellipse(x, 40, 28, 5, 9, 0.5); x.fill();
    }) },
    { name: 'Leaf Litter', rot: 'random', v: 4, make: (r) => sq(96, (x) => { for (let i = 0; i < 9; i++) { const c = pick(r, ['#8a5a2b', '#a8743a', '#6e4a28', '#c08a4a', '#5f6b2e']); petal(x, 10 + r() * 76, 10 + r() * 76, 14 + r() * 10, 5 + r() * 3, r() * T, c); } }) },
  ];

  /* ---------- seamless tiles ---------- */
  const TILES = [
    { name: 'Quatrefoil', mono: true, make: () => sq(48, (x, s) => { x.strokeStyle = W; x.lineWidth = 2.5; wrap(s, (ox, oy) => { const c = s / 2; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { x.beginPath(); x.arc(c + ox + dx * 7, c + oy + dy * 7, 8, 0, T); x.stroke(); } }); }) },
    { name: 'Trellis', mono: true, make: () => sq(40, (x, s) => { x.strokeStyle = W; x.lineWidth = 3; wrap(s, (ox, oy) => { x.beginPath(); x.moveTo(ox, oy + s / 2); x.quadraticCurveTo(ox + s / 4, oy, ox + s / 2, oy); x.quadraticCurveTo(ox + (3 * s) / 4, oy, ox + s, oy + s / 2); x.quadraticCurveTo(ox + (3 * s) / 4, oy + s, ox + s / 2, oy + s); x.quadraticCurveTo(ox + s / 4, oy + s, ox, oy + s / 2); x.stroke(); }); }) },
    { name: 'Seigaiha Waves', mono: true, make: () => sq(48, (x, s) => {
      // overlapping fans, drawn top row first so lower rows cover the ones above
      const R = s / 2, centres = [];
      for (let ry = -1; ry <= 4; ry++) for (let rx = -1; rx <= 2; rx++) centres.push([rx * s + (ry & 1 ? 0 : s / 2), ry * (s / 2)]);
      centres.sort((a, b) => a[1] - b[1]);
      x.lineWidth = 1.8; x.strokeStyle = W;
      centres.forEach(([cx, cy]) => {
        x.save(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(cx, cy, R, Math.PI, 0); x.fill(); x.restore();
        for (let k = 4; k >= 1; k--) { x.beginPath(); x.arc(cx, cy, R * (k / 4) - 1, Math.PI, 0); x.stroke(); }
      });
    }) },
    { name: 'Scallops', mono: true, make: () => sq(32, (x, s) => { x.fillStyle = W; for (const [cx, cy] of [[s / 2, s], [0, s / 2], [s, s / 2], [s / 2, 0]]) { x.beginPath(); x.arc(cx, cy, s / 2 - 2, 0, Math.PI); x.fill(); } }) },
    { name: 'Houndstooth', mono: true, make: () => sq(32, (x) => {
      // the classic 8 × 8 houndstooth bitmap: checks joined by diagonal teeth
      const rows = ['11110001', '11110010', '11110100', '11111000', '00011111', '00101111', '01001111', '10001111'];
      x.fillStyle = W;
      rows.forEach((row, y) => { for (let i = 0; i < 8; i++) if (row[i] === '1') x.fillRect(i * 4, y * 4, 4, 4); });
    }) },
    { name: 'Hexagons', mono: true, make: () => { const s = 26, hgt = Math.round(s * Math.sqrt(3)), c = U.canvas(s * 3, hgt), x = U.ctx(c); x.strokeStyle = W; x.lineWidth = 2; const hex = (cx, cy) => { x.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * T; x.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s); } x.closePath(); x.stroke(); }; for (const [cx, cy] of [[0, 0], [s * 3, 0], [0, hgt], [s * 3, hgt], [s * 1.5, hgt / 2]]) hex(cx, cy); return c; } },
    { name: 'Dotted Grid', mono: true, make: () => sq(20, (x) => { x.fillStyle = W; x.beginPath(); x.arc(10, 10, 1.6, 0, T); x.fill(); }) },
    { name: 'Fishnet', mono: true, make: () => sq(28, (x, s) => { x.strokeStyle = W; x.lineWidth = 1.5; wrap(s, (ox, oy) => { x.beginPath(); x.moveTo(ox, oy); x.lineTo(ox + s, oy + s); x.moveTo(ox + s, oy); x.lineTo(ox, oy + s); x.stroke(); }); }) },
    { name: 'Rain', mono: true, make: () => sq(48, (x, s) => { x.strokeStyle = W; x.lineWidth = 1.5; x.lineCap = 'round'; const r = U.rng(77); const pts = []; for (let i = 0; i < 9; i++) pts.push([r() * s, r() * s]); wrap(s, (ox, oy) => pts.forEach(([px, py]) => { x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(px + ox - 3, py + oy + 9); x.stroke(); })); }) },
    { name: 'Small Leaves', mono: true, make: () => sq(48, (x, s) => { const r = U.rng(91), pts = []; for (let i = 0; i < 5; i++) pts.push([r() * s, r() * s, r() * T]); wrap(s, (ox, oy) => pts.forEach(([px, py, a]) => petal(x, px + ox, py + oy, 11, 4, a, W))); }) },
    { name: 'Knit', mono: true, make: () => sq(16, (x, s) => { x.strokeStyle = W; x.lineWidth = 2.6; x.lineCap = 'round'; x.beginPath(); x.moveTo(2, 2); x.lineTo(s / 2 - 1, s - 3); x.moveTo(s - 2, 2); x.lineTo(s / 2 + 1, s - 3); x.stroke(); }) },
    { name: 'Tumbling Blocks', make: () => {
      // rhombus cubes on an exact 42 × 72 period
      const dx = 21, sz = 24, dy = 12, c = U.canvas(dx * 2, sz * 3), x = U.ctx(c);
      const face = (pts, col) => { x.fillStyle = col; x.strokeStyle = col; x.lineWidth = 0.75; x.beginPath(); pts.forEach(([px, py]) => x.lineTo(px, py)); x.closePath(); x.fill(); x.stroke(); };
      const cube = (cx, cy) => {
        face([[cx, cy], [cx + dx, cy - dy], [cx, cy - sz], [cx - dx, cy - dy]], '#e8e8e8');
        face([[cx, cy], [cx - dx, cy - dy], [cx - dx, cy - dy + sz], [cx, cy + sz]], '#a2a2a2');
        face([[cx, cy], [cx + dx, cy - dy], [cx + dx, cy - dy + sz], [cx, cy + sz]], '#5e5e5e');
      };
      for (let row = -1; row <= 4; row++) for (let col = -1; col <= 2; col++) cube(col * dx * 2 + (row & 1 ? dx : 0), row * 36);
      return c;
    } },
    { name: 'Parquet', make: () => sq(64, (x, s) => { const cols = ['#b07a46', '#9a6738', '#c08852', '#8a5a30']; let k = 0; for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) { const vert = (bx + by) % 2 === 0; for (let i = 0; i < 4; i++) { x.fillStyle = cols[(k++) % cols.length]; if (vert) x.fillRect(bx * 32 + i * 8, by * 32, 8, 32); else x.fillRect(bx * 32, by * 32 + i * 8, 32, 8); } } x.strokeStyle = 'rgba(60,35,15,0.5)'; x.lineWidth = 1; for (let i = 0; i <= s; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, s); x.stroke(); } }) },
    { name: 'Wood Planks', make: () => sq(96, (x, s) => { const r = U.rng(5); for (let i = 0; i < 4; i++) { const base = pick(r, ['#a8763f', '#b6834a', '#9b6a37', '#c08f58']); x.fillStyle = base; x.fillRect(0, i * 24, s, 24); x.strokeStyle = U.shade(base, -0.18); x.lineWidth = 1; for (let k = 0; k < 5; k++) { const y = i * 24 + 3 + r() * 18; x.beginPath(); x.moveTo(0, y); for (let xx = 0; xx <= s; xx += 8) x.lineTo(xx, y + Math.sin((xx / s) * T * 2 + k) * 1.2); x.stroke(); } x.fillStyle = 'rgba(40,25,10,0.55)'; x.fillRect(0, i * 24 + 23, s, 1); const joint = ((i * 37) % s); x.fillRect(joint, i * 24, 1, 24); } }) },
    { name: 'Terrazzo', make: () => sq(96, (x, s) => { x.fillStyle = '#efebe4'; x.fillRect(0, 0, s, s); const r = U.rng(13), chips = []; for (let i = 0; i < 26; i++) chips.push([r() * s, r() * s, 2 + r() * 5, pick(r, ['#d36b4f', '#4f7fa6', '#e3b44a', '#7a8c6e', '#2f2f35', '#c9a49a']), r() * T]); wrap(s, (ox, oy) => chips.forEach(([px, py, rr, c, a]) => { x.fillStyle = c; x.save(); x.translate(px + ox, py + oy); x.rotate(a); x.beginPath(); x.moveTo(-rr, 0); x.lineTo(0, -rr * 0.7); x.lineTo(rr * 0.9, -rr * 0.2); x.lineTo(rr * 0.4, rr * 0.8); x.closePath(); x.fill(); x.restore(); })); }) },
    { name: 'Marble', make: () => { const s = 128, c = U.canvas(s, s), x = U.ctx(c), n = U.fbm(s, 4, 4, 23, 0.55), id = x.createImageData(s, s); for (let y = 0; y < s; y++) for (let xx = 0; xx < s; xx++) { const v = Math.abs(Math.sin(((xx + y) / s) * T + n[y * s + xx] * 9)), k = Math.pow(v, 0.25), j = (y * s + xx) * 4; id.data[j] = 200 + 50 * k; id.data[j + 1] = 200 + 48 * k; id.data[j + 2] = 205 + 45 * k; id.data[j + 3] = 255; } x.putImageData(id, 0, 0); return c; } },
    { name: 'Bathroom Tiles', make: () => sq(32, (x, s) => { x.fillStyle = '#d9d4cc'; x.fillRect(0, 0, s, s); x.fillStyle = '#f3f6f8'; x.fillRect(1, 1, s - 2, s - 2); x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(3, 3, s - 10, 2); }) },
    { name: 'Burlap', make: () => sq(24, (x, s) => { x.fillStyle = '#b89a6a'; x.fillRect(0, 0, s, s); x.fillStyle = '#a3865a'; for (let i = 0; i < s; i += 6) x.fillRect(i, 0, 3, s); x.fillStyle = 'rgba(201,174,128,0.85)'; for (let i = 0; i < s; i += 6) x.fillRect(0, i, s, 3); x.fillStyle = 'rgba(80,60,30,0.25)'; for (let i = 0; i < s; i += 6) x.fillRect(i + 3, 0, 1, s); }) },
    { name: 'Bamboo', make: () => sq(48, (x, s) => { x.fillStyle = '#e9e1c8'; x.fillRect(0, 0, s, s); for (let i = 0; i < 3; i++) { const bx = i * 16 + 2; x.fillStyle = i % 2 ? '#8fae4a' : '#a4bf5c'; x.fillRect(bx, 0, 12, s); x.fillStyle = '#6f8a36'; x.fillRect(bx, ((i * 19) % s), 12, 2.5); x.fillStyle = 'rgba(255,255,255,0.3)'; x.fillRect(bx + 2, 0, 2, s); } }) },
    { name: 'Carbon Fibre', make: () => sq(16, (x, s) => { x.fillStyle = '#1b1d21'; x.fillRect(0, 0, s, s); for (const [px, py, v] of [[0, 0, 0], [8, 8, 0], [8, 0, 1], [0, 8, 1]]) { const g = v ? x.createLinearGradient(px, py, px + 8, py) : x.createLinearGradient(px, py, px, py + 8); g.addColorStop(0, '#2c3036'); g.addColorStop(0.5, '#454a52'); g.addColorStop(1, '#25282d'); x.fillStyle = g; x.fillRect(px + 0.5, py + 0.5, 7, 7); } }) },
    { name: 'Blue Plaid', make: () => sq(48, (x, s) => { x.fillStyle = '#2b4a7a'; x.fillRect(0, 0, s, s); x.fillStyle = 'rgba(120,160,210,0.55)'; x.fillRect(0, 14, s, 10); x.fillRect(14, 0, 10, s); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, 36, s, 2); x.fillRect(36, 0, 2, s); x.fillStyle = 'rgba(20,30,50,0.45)'; x.fillRect(0, 4, s, 3); x.fillRect(4, 0, 3, s); }) },
    { name: 'Confetti Dots', make: () => sq(64, (x, s) => { const r = U.rng(31), d = []; for (let i = 0; i < 12; i++) d.push([r() * s, r() * s, 2 + r() * 3, pick(r, ['#ff5d73', '#ffd23f', '#3bceac', '#4d8fd1', '#c86bfa', '#ff9f43'])]); wrap(s, (ox, oy) => d.forEach(([px, py, rr, c]) => { x.fillStyle = c; x.beginPath(); x.arc(px + ox, py + oy, rr, 0, T); x.fill(); })); }) },
    { name: 'Sand Ripples', make: () => sq(64, (x, s) => { x.fillStyle = '#e4cf9f'; x.fillRect(0, 0, s, s); x.strokeStyle = 'rgba(160,125,70,0.45)'; x.lineWidth = 2; for (let k = 0; k < 5; k++) { x.beginPath(); for (let i = 0; i <= s; i += 2) x.lineTo(i, k * (s / 5) + 4 + Math.sin((i / s) * T * 2 + k) * 3); x.stroke(); } }) },
  ];

  SPRITES.forEach((q) => ND.Patterns.SPRITES.push(q));
  TILES.forEach((q) => ND.Patterns.TILES.push(q));
})();
