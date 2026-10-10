/* Neon Sparks Draw — pattern library.
 *  SPRITES: scatter brushes — little images sprayed along the stroke (leaves, stars, confetti…).
 *  TILES:   seamless repeating patterns — painted through the brush mask, used by the fill tool,
 *           Edit ▸ Fill with Pattern and the brush "texture fill" option.
 *  mono tiles are white-on-transparent and take the current colour; others keep their colours. */
'use strict';
(function () {
  const U = ND.U, T = U.TAU;
  const pick = (r, a) => a[(r() * a.length) | 0];
  const sq = (n, fn) => U.drawSquare(n, fn);

  /* ---------- small drawing helpers ---------- */
  function leaf(x, cx, cy, len, ang, col, vein) {
    x.save(); x.translate(cx, cy); x.rotate(ang);
    x.fillStyle = col;
    x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * 0.45, -len * 0.32, len, 0); x.quadraticCurveTo(len * 0.45, len * 0.32, 0, 0); x.fill();
    if (vein !== false) { x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = Math.max(1, len * 0.04); x.beginPath(); x.moveTo(len * 0.06, 0); x.lineTo(len * 0.92, 0); x.stroke(); }
    x.restore();
  }
  function blade(x, bx, by, h, lean, w, col) {
    x.fillStyle = col;
    x.beginPath(); x.moveTo(bx - w, by); x.lineTo(bx + w, by); x.quadraticCurveTo(bx + lean * 0.5, by - h * 0.6, bx + lean, by - h); x.closePath(); x.fill();
  }
  function star(x, cx, cy, ro, ri, n, rot) {
    x.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * T - Math.PI / 2 + (rot || 0), r = i % 2 ? ri : ro; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    x.closePath();
  }
  function heart(x, cx, cy, s) {
    x.beginPath(); x.moveTo(cx, cy + s * 0.35);
    x.bezierCurveTo(cx - s * 0.6, cy - s * 0.05, cx - s * 0.25, cy - s * 0.45, cx, cy - s * 0.15);
    x.bezierCurveTo(cx + s * 0.25, cy - s * 0.45, cx + s * 0.6, cy - s * 0.05, cx, cy + s * 0.35);
    x.closePath();
  }
  function ellipse(x, cx, cy, rx, ry, rot) { x.beginPath(); x.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, T); }
  function poly(x, cx, cy, r, n, rnd, rot) {
    x.beginPath();
    for (let i = 0; i < n; i++) { const a = (i / n) * T + (rot || 0), rr = r * (1 - (rnd ? rnd() * 0.35 : 0)); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.closePath();
  }
  function glowDot(x, cx, cy, r, col) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, T); x.fill();
  }

  const GREENS = ['#3d7a3f', '#57a34a', '#2f6b34', '#6bbf59', '#48914a'];
  const AUTUMN = ['#d9822b', '#c4471c', '#e8b23a', '#9c3b1a', '#b8661e'];
  const BRIGHT = ['#ff5d73', '#ffd23f', '#3bceac', '#4d8fd1', '#c86bfa', '#ff9f43'];

  /* ---------- SPRITES ---------- */
  const SPRITES = [
    { name: 'Leaves', rot: 'random', v: 4, make: (r) => sq(96, (x, s) => { for (let i = 0; i < 7; i++) leaf(x, 10 + r() * (s - 36), 14 + r() * (s - 36), 22 + r() * 16, r() * T, pick(r, GREENS)); }) },
    { name: 'Autumn Leaves', rot: 'random', v: 4, make: (r) => sq(96, (x, s) => { for (let i = 0; i < 5; i++) leaf(x, 12 + r() * (s - 40), 14 + r() * (s - 40), 24 + r() * 14, r() * T, pick(r, AUTUMN)); }) },
    { name: 'Ivy', rot: 'random', v: 3, make: (r) => sq(96, (x) => {
      for (let i = 0; i < 4; i++) {
        const cx = 20 + r() * 56, cy = 20 + r() * 56, s = 14 + r() * 8, c = pick(r, GREENS);
        x.fillStyle = c; x.save(); x.translate(cx, cy); x.rotate(r() * T);
        x.beginPath(); x.moveTo(0, s); x.lineTo(-s, 0); x.lineTo(-s * 0.4, -s * 0.2); x.lineTo(0, -s); x.lineTo(s * 0.4, -s * 0.2); x.lineTo(s, 0); x.closePath(); x.fill(); x.restore();
      }
    }) },
    { name: 'Grass', rot: 'upright', v: 4, make: (r) => sq(96, (x, s) => { for (let i = 0; i < 16; i++) blade(x, r() * s, s + 2, 30 + r() * 58, (r() - 0.5) * 24, 1.5 + r() * 2, pick(r, ['#4a8f3c', '#5fa346', '#3a7530', '#71b356'])); }) },
    { name: 'Dry Grass', rot: 'upright', v: 3, make: (r) => sq(96, (x, s) => { for (let i = 0; i < 16; i++) blade(x, r() * s, s + 2, 30 + r() * 58, (r() - 0.5) * 30, 1.2 + r() * 1.5, pick(r, ['#c9a75a', '#a88a44', '#d8c07a', '#8f7a3e'])); }) },
    { name: 'Fern', rot: 'random', v: 3, make: (r) => sq(96, (x) => {
      const c = pick(r, GREENS); x.strokeStyle = c; x.lineWidth = 2;
      x.beginPath(); x.moveTo(48, 92); x.quadraticCurveTo(44 + r() * 8, 50, 50, 6); x.stroke();
      for (let i = 1; i < 12; i++) { const y = 92 - i * 7, l = 30 * (1 - i / 13); leaf(x, 48, y, l, -0.5 - Math.PI, c, false); leaf(x, 48, y, l, 0.5, c, false); }
    }) },
    { name: 'Pine Needles', rot: 'random', v: 3, make: (r) => sq(96, (x) => {
      x.lineCap = 'round';
      for (let i = 0; i < 26; i++) { const a = r() * T, l = 14 + r() * 26, cx = 48 + (r() - 0.5) * 30, cy = 48 + (r() - 0.5) * 30; x.strokeStyle = pick(r, ['#2c5e3a', '#3b7a45', '#24502f']); x.lineWidth = 1.6; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); x.stroke(); }
    }) },
    { name: 'Bushes', rot: 'upright', v: 4, make: (r) => sq(96, (x) => {
      for (let i = 0; i < 18; i++) { const cx = 14 + r() * 68, cy = 22 + r() * 60, rr = 8 + r() * 12, base = pick(r, GREENS); x.fillStyle = U.shade(base, -0.25); ellipse(x, cx + 2, cy + 3, rr, rr * 0.85); x.fill(); x.fillStyle = base; ellipse(x, cx, cy, rr, rr * 0.85); x.fill(); x.fillStyle = U.shade(base, 0.25); ellipse(x, cx - rr * 0.3, cy - rr * 0.35, rr * 0.4, rr * 0.3); x.fill(); }
    }) },
    { name: 'Moss', rot: 'random', v: 3, make: (r) => sq(64, (x) => { for (let i = 0; i < 120; i++) { x.fillStyle = pick(r, ['#5b7f2e', '#7a9a3a', '#3f5f22', '#93ad4c']); const a = r() * T, d = Math.sqrt(r()) * 28; x.fillRect(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 2 + r() * 2, 2 + r() * 2); } }) },
    { name: 'Clover', rot: 'random', v: 3, make: (r) => sq(96, (x) => {
      for (let k = 0; k < 3; k++) { const cx = 20 + r() * 56, cy = 20 + r() * 56, s = 9 + r() * 4; x.fillStyle = pick(r, GREENS); for (let i = 0; i < 3; i++) { const a = (i / 3) * T + r(); heart(x, cx + Math.cos(a) * s * 0.6, cy + Math.sin(a) * s * 0.6, s * 1.2); x.fill(); } }
    }) },
    { name: 'Flowers', rot: 'random', v: 4, make: (r) => sq(96, (x, s) => {
      for (let b = 0; b < 5; b++) {
        const cx = 14 + r() * (s - 28), cy = 14 + r() * (s - 28), rr = 7 + r() * 6; x.fillStyle = pick(r, ['#e06aa8', '#f0a03c', '#c85adf', '#e05a5a', '#5aa0e0']);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * T + r(); ellipse(x, cx + Math.cos(a) * rr * 0.8, cy + Math.sin(a) * rr * 0.8, rr * 0.55, rr * 0.3, a); x.fill(); }
        x.fillStyle = '#f5d43c'; x.beginPath(); x.arc(cx, cy, rr * 0.35, 0, T); x.fill();
      }
    }) },
    { name: 'Daisies', rot: 'random', v: 3, make: (r) => sq(96, (x) => {
      for (let b = 0; b < 3; b++) {
        const cx = 18 + r() * 60, cy = 18 + r() * 60, rr = 12 + r() * 5; x.fillStyle = '#fbfbf5';
        for (let i = 0; i < 12; i++) { const a = (i / 12) * T; ellipse(x, cx + Math.cos(a) * rr * 0.7, cy + Math.sin(a) * rr * 0.7, rr * 0.5, rr * 0.16, a); x.fill(); }
        x.fillStyle = '#f2b929'; x.beginPath(); x.arc(cx, cy, rr * 0.3, 0, T); x.fill();
      }
    }) },
    { name: 'Sakura Petals', rot: 'random', v: 4, make: (r) => sq(96, (x) => {
      for (let i = 0; i < 6; i++) {
        const cx = 12 + r() * 72, cy = 12 + r() * 72, s = 7 + r() * 6; x.save(); x.translate(cx, cy); x.rotate(r() * T);
        x.fillStyle = pick(r, ['#ffc4d6', '#ffb0c8', '#ffd9e4', '#f79ab7']);
        x.beginPath(); x.moveTo(0, s); x.bezierCurveTo(-s, s * 0.2, -s * 0.6, -s, 0, -s * 0.6); x.bezierCurveTo(s * 0.6, -s, s, s * 0.2, 0, s); x.fill(); x.restore();
      }
    }) },
    { name: 'Petals', rot: 'random', v: 4, make: (r) => sq(96, (x) => { for (let i = 0; i < 6; i++) { x.fillStyle = pick(r, BRIGHT); ellipse(x, 12 + r() * 72, 12 + r() * 72, 9 + r() * 5, 4 + r() * 2, r() * T); x.fill(); } }) },
    { name: 'Dandelion Seeds', rot: 'random', v: 3, make: (r) => sq(96, (x) => {
      x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 1;
      for (let k = 0; k < 2; k++) { const cx = 25 + r() * 46, cy = 25 + r() * 46; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + 4, cy + 22); x.stroke(); for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + (i / 13 - 0.5) * 2.6; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14); x.stroke(); } }
    }) },
    { name: 'Berries', rot: 'random', v: 3, make: (r) => sq(64, (x) => { for (let i = 0; i < 6; i++) { const cx = 12 + r() * 40, cy = 12 + r() * 40, rr = 5 + r() * 3, c = pick(r, ['#9b1c31', '#5a1e6e', '#c0282d', '#2b2d6e']); x.fillStyle = c; x.beginPath(); x.arc(cx, cy, rr, 0, T); x.fill(); x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc(cx - rr * 0.35, cy - rr * 0.35, rr * 0.25, 0, T); x.fill(); } }) },
    { name: 'Mushrooms', rot: 'upright', v: 3, make: (r) => sq(96, (x) => {
      for (let i = 0; i < 3; i++) {
        const cx = 18 + r() * 60, by = 90, h = 26 + r() * 30, w = 14 + r() * 10, c = pick(r, ['#c8352e', '#b5764a', '#d9a066']);
        x.fillStyle = '#f2e8d5'; x.fillRect(cx - w * 0.2, by - h, w * 0.4, h);
        x.fillStyle = c; x.beginPath(); x.ellipse(cx, by - h, w, w * 0.65, 0, Math.PI, 0); x.fill();
        if (c === '#c8352e') { x.fillStyle = '#fff'; for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(cx + (r() - 0.5) * w * 1.2, by - h - r() * w * 0.4, 2, 0, T); x.fill(); } }
      }
    }) },
    { name: 'Stars', rot: 'random', v: 3, make: (r) => sq(64, (x, s) => { for (let b = 0; b < 6; b++) { x.fillStyle = pick(r, ['#f5d43c', '#f0f0f0', '#8fc1ff']); star(x, 8 + r() * (s - 16), 8 + r() * (s - 16), 3 + r() * 5, (3 + r() * 5) * 0.45, 5, r() * 6); x.fill(); } }) },
    { name: 'Sparkles', rot: 'random', v: 3, make: (r) => sq(64, (x) => { for (let i = 0; i < 4; i++) { const cx = 10 + r() * 44, cy = 10 + r() * 44, s = 4 + r() * 8; glowDot(x, cx, cy, s * 0.9, 'rgba(255,240,200,0.6)'); x.fillStyle = '#fffbe8'; star(x, cx, cy, s, s * 0.18, 4, 0); x.fill(); } }) },
    { name: 'Space Dust', rot: 'random', v: 3, make: (r) => sq(96, (x) => { for (let i = 0; i < 40; i++) { x.fillStyle = pick(r, ['#ffffff', '#cfe3ff', '#ffe9c4', '#e6d0ff']); x.globalAlpha = 0.4 + r() * 0.6; const s = r() < 0.9 ? 1 + r() * 1.5 : 3; x.beginPath(); x.arc(r() * 96, r() * 96, s, 0, T); x.fill(); } }) },
    { name: 'Hearts', rot: 'random', v: 3, make: (r) => sq(64, (x) => { for (let i = 0; i < 4; i++) { x.fillStyle = pick(r, ['#e0525a', '#ff7aa2', '#c2185b', '#ff9eb5']); heart(x, 10 + r() * 44, 12 + r() * 40, 10 + r() * 10); x.fill(); } }) },
    { name: 'Confetti', rot: 'random', v: 4, make: (r) => sq(64, (x) => { for (let i = 0; i < 10; i++) { x.save(); x.translate(r() * 64, r() * 64); x.rotate(r() * T); x.fillStyle = pick(r, BRIGHT); if (r() < 0.5) x.fillRect(-4, -1.6, 8, 3.2); else { x.beginPath(); x.arc(0, 0, 2.4, 0, T); x.fill(); } x.restore(); } }) },
    { name: 'Bubbles', rot: 'upright', v: 3, make: (r) => sq(96, (x) => { for (let i = 0; i < 5; i++) { const cx = 14 + r() * 68, cy = 14 + r() * 68, rr = 5 + r() * 12; x.strokeStyle = 'rgba(200,230,255,0.9)'; x.lineWidth = 1.5; x.fillStyle = 'rgba(180,220,255,0.15)'; x.beginPath(); x.arc(cx, cy, rr, 0, T); x.fill(); x.stroke(); x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.arc(cx - rr * 0.4, cy - rr * 0.4, rr * 0.22, 0, T); x.fill(); } }) },
    { name: 'Bokeh', rot: 'upright', v: 3, make: (r) => sq(96, (x) => { for (let i = 0; i < 5; i++) { const cx = 14 + r() * 68, cy = 14 + r() * 68, rr = 6 + r() * 14; x.fillStyle = pick(r, ['rgba(255,214,120,0.35)', 'rgba(120,200,255,0.35)', 'rgba(255,140,200,0.35)']); x.beginPath(); x.arc(cx, cy, rr, 0, T); x.fill(); } }) },
    { name: 'Snow', rot: 'random', v: 3, make: (r) => sq(64, (x) => { for (let i = 0; i < 14; i++) { const s = 1 + r() * 3; x.fillStyle = 'rgba(255,255,255,' + (0.6 + r() * 0.4) + ')'; x.beginPath(); x.arc(r() * 64, r() * 64, s, 0, T); x.fill(); } }) },
    { name: 'Snowflakes', rot: 'random', v: 3, make: (r) => sq(96, (x) => {
      x.strokeStyle = '#e6f4ff'; x.lineCap = 'round';
      for (let k = 0; k < 3; k++) { const cx = 18 + r() * 60, cy = 18 + r() * 60, s = 8 + r() * 10; x.lineWidth = 1.6; for (let i = 0; i < 6; i++) { const a = (i / 6) * T; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s); x.stroke(); const bx = cx + Math.cos(a) * s * 0.6, by = cy + Math.sin(a) * s * 0.6; for (const o of [-0.6, 0.6]) { x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + Math.cos(a + o) * s * 0.3, by + Math.sin(a + o) * s * 0.3); x.stroke(); } } }
    }) },
    { name: 'Rain', rot: 'upright', v: 3, make: (r) => sq(96, (x) => { x.lineCap = 'round'; for (let i = 0; i < 14; i++) { const cx = r() * 96, cy = r() * 96, l = 8 + r() * 14; x.strokeStyle = 'rgba(170,200,235,' + (0.4 + r() * 0.5) + ')'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx - l * 0.25, cy + l); x.stroke(); } }) },
    { name: 'Clouds', rot: 'upright', v: 3, make: (r) => sq(128, (x) => {
      for (let i = 0; i < 9; i++) { const cx = 28 + r() * 72, cy = 50 + r() * 34, rr = 14 + r() * 16; const g = x.createRadialGradient(cx, cy - rr * 0.3, 0, cx, cy, rr); g.addColorStop(0, '#ffffff'); g.addColorStop(0.75, '#eef3f8'); g.addColorStop(1, 'rgba(220,230,240,0)'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rr, 0, T); x.fill(); }
    }) },
    { name: 'Smoke', rot: 'random', v: 3, make: (r) => sq(96, (x) => { for (let i = 0; i < 10; i++) { const cx = 20 + r() * 56, cy = 20 + r() * 56, rr = 10 + r() * 18; const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr); g.addColorStop(0, 'rgba(150,150,155,0.35)'); g.addColorStop(1, 'rgba(150,150,155,0)'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rr, 0, T); x.fill(); } }) },
    { name: 'Embers', rot: 'random', v: 3, make: (r) => sq(64, (x) => { for (let i = 0; i < 7; i++) glowDot(x, 6 + r() * 52, 6 + r() * 52, 3 + r() * 6, pick(r, ['rgba(255,140,40,0.9)', 'rgba(255,200,60,0.9)', 'rgba(255,90,30,0.9)'])); }) },
    { name: 'Flames', rot: 'upright', v: 3, make: (r) => sq(96, (x) => {
      for (let i = 0; i < 4; i++) {
        const cx = 22 + r() * 52, h = 40 + r() * 46, w = 10 + r() * 8;
        for (const [c, k] of [['#e8401c', 1], ['#f78a1d', 0.7], ['#ffd23f', 0.42]]) { x.fillStyle = c; x.beginPath(); x.moveTo(cx - w * k, 94); x.quadraticCurveTo(cx - w * k * 1.2, 94 - h * k * 0.5, cx + (r() - 0.5) * 6, 94 - h * k); x.quadraticCurveTo(cx + w * k * 1.2, 94 - h * k * 0.5, cx + w * k, 94); x.fill(); }
      }
    }) },
    { name: 'Lightning', rot: 'random', v: 3, make: (r) => sq(96, (x) => {
      x.strokeStyle = '#dff1ff'; x.shadowColor = '#7fc4ff'; x.shadowBlur = 8; x.lineWidth = 2; x.beginPath();
      let px = 48, py = 4; x.moveTo(px, py);
      while (py < 92) { px += (r() - 0.5) * 22; py += 6 + r() * 10; x.lineTo(px, py); }
      x.stroke();
    }) },
    { name: 'Fur', rot: 'direction', v: 4, make: (r) => sq(64, (x) => { x.lineCap = 'round'; for (let i = 0; i < 30; i++) { const cx = 32 + (r() - 0.5) * 34, cy = 32 + (r() - 0.5) * 34, l = 8 + r() * 14, a = -Math.PI / 2 + (r() - 0.5) * 0.7; x.strokeStyle = pick(r, ['#6b4a2f', '#8a6440', '#4d3320', '#a77d52']); x.lineWidth = 1 + r(); x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + Math.cos(a) * l * 0.5 + 2, cy + Math.sin(a) * l * 0.5, cx + Math.cos(a) * l, cy + Math.sin(a) * l); x.stroke(); } }) },
    { name: 'Feathers', rot: 'random', v: 3, make: (r) => sq(96, (x) => {
      const c = pick(r, ['#f2efe6', '#9db4c8', '#c9a77b', '#e8d8c4']); x.save(); x.translate(48, 48); x.rotate(r() * T);
      x.strokeStyle = U.shade(c, -0.35); x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, 40); x.lineTo(0, -40); x.stroke();
      x.strokeStyle = c; x.lineWidth = 1;
      for (let i = -36; i < 36; i += 2.2) { const w = 14 * Math.cos((i / 40) * Math.PI / 2); x.beginPath(); x.moveTo(0, i); x.lineTo(-w, i - 6); x.moveTo(0, i); x.lineTo(w, i - 6); x.stroke(); }
      x.restore();
    }) },
    { name: 'Butterflies', rot: 'random', v: 3, make: (r) => sq(96, (x) => {
      for (let k = 0; k < 2; k++) { const cx = 22 + r() * 52, cy = 22 + r() * 52, s = 12 + r() * 6, c = pick(r, ['#c85adf', '#4d8fd1', '#f0a03c', '#e05a5a']); x.save(); x.translate(cx, cy); x.rotate((r() - 0.5) * 1.2); x.fillStyle = c; ellipse(x, -s * 0.55, -s * 0.2, s * 0.55, s * 0.75, -0.5); x.fill(); ellipse(x, s * 0.55, -s * 0.2, s * 0.55, s * 0.75, 0.5); x.fill(); x.fillStyle = U.shade(c, -0.3); ellipse(x, -s * 0.4, s * 0.55, s * 0.35, s * 0.45, -0.9); x.fill(); ellipse(x, s * 0.4, s * 0.55, s * 0.35, s * 0.45, 0.9); x.fill(); x.fillStyle = '#2a2a2a'; x.fillRect(-1, -s * 0.8, 2, s * 1.6); x.restore(); }
    }) },
    { name: 'Birds', rot: 'upright', v: 3, make: (r) => sq(96, (x) => { x.strokeStyle = '#2b2b30'; x.lineWidth = 2; x.lineCap = 'round'; for (let i = 0; i < 4; i++) { const cx = 14 + r() * 68, cy = 14 + r() * 68, s = 5 + r() * 8; x.beginPath(); x.moveTo(cx - s, cy - s * 0.3); x.quadraticCurveTo(cx - s * 0.4, cy - s * 0.7, cx, cy); x.quadraticCurveTo(cx + s * 0.4, cy - s * 0.7, cx + s, cy - s * 0.3); x.stroke(); } }) },
    { name: 'Fish', rot: 'direction', v: 3, make: (r) => sq(96, (x) => {
      for (let k = 0; k < 3; k++) { const cx = 20 + r() * 56, cy = 20 + r() * 56, s = 8 + r() * 6, c = pick(r, ['#f0a03c', '#4d8fd1', '#3bceac', '#ff5d73']); x.fillStyle = c; ellipse(x, cx, cy, s, s * 0.5); x.fill(); x.beginPath(); x.moveTo(cx - s * 0.8, cy); x.lineTo(cx - s * 1.5, cy - s * 0.5); x.lineTo(cx - s * 1.5, cy + s * 0.5); x.closePath(); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(cx + s * 0.5, cy - s * 0.1, 1.4, 0, T); x.fill(); }
    }) },
    { name: 'Ladybirds', rot: 'random', v: 3, make: (r) => sq(64, (x) => { for (let k = 0; k < 3; k++) { const cx = 12 + r() * 40, cy = 12 + r() * 40, s = 6 + r() * 3; x.fillStyle = '#d32f2f'; x.beginPath(); x.arc(cx, cy, s, 0, T); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(cx, cy - s * 0.8, s * 0.5, 0, T); x.fill(); x.fillRect(cx - 0.5, cy - s, 1, s * 2); for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(cx + (i < 2 ? -1 : 1) * s * 0.5, cy + (i % 2 ? 0.45 : -0.1) * s, s * 0.18, 0, T); x.fill(); } } }) },
    { name: 'Paw Prints', rot: 'direction', v: 2, make: (r) => sq(64, (x) => { x.fillStyle = '#4a3a30'; const cx = 32, cy = 36; ellipse(x, cx, cy + 6, 10, 8); x.fill(); for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i - 1.5) * 0.55; ellipse(x, cx + Math.cos(a) * 16, cy + 6 + Math.sin(a) * 16, 4, 5, a); x.fill(); } void r; }) },
    { name: 'Music Notes', rot: 'upright', v: 3, make: (r) => sq(64, (x) => { for (let k = 0; k < 2; k++) { const cx = 14 + r() * 30, cy = 30 + r() * 20; x.fillStyle = x.strokeStyle = pick(r, ['#222', '#4d8fd1', '#c85adf']); x.lineWidth = 2; ellipse(x, cx, cy, 5, 3.6, -0.4); x.fill(); x.beginPath(); x.moveTo(cx + 4.5, cy); x.lineTo(cx + 4.5, cy - 20); x.quadraticCurveTo(cx + 12, cy - 15, cx + 11, cy - 8); x.stroke(); } }) },
    { name: 'Coins', rot: 'random', v: 3, make: (r) => sq(64, (x) => { for (let k = 0; k < 4; k++) { const cx = 12 + r() * 40, cy = 12 + r() * 40, s = 6 + r() * 3; x.fillStyle = '#c99a1e'; ellipse(x, cx, cy + 1.5, s, s * 0.8); x.fill(); x.fillStyle = '#f4c542'; ellipse(x, cx, cy, s, s * 0.8); x.fill(); x.strokeStyle = '#d9a82b'; x.lineWidth = 1; ellipse(x, cx, cy, s * 0.65, s * 0.5); x.stroke(); } }) },
    { name: 'Gems', rot: 'random', v: 3, make: (r) => sq(64, (x) => { for (let k = 0; k < 3; k++) { const cx = 14 + r() * 36, cy = 14 + r() * 36, s = 6 + r() * 4, c = pick(r, ['#e0245e', '#1da1f2', '#17bf63', '#9b59b6', '#ffad1f']); x.fillStyle = c; x.beginPath(); x.moveTo(cx - s, cy - s * 0.3); x.lineTo(cx - s * 0.5, cy - s * 0.8); x.lineTo(cx + s * 0.5, cy - s * 0.8); x.lineTo(cx + s, cy - s * 0.3); x.lineTo(cx, cy + s); x.closePath(); x.fill(); x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); x.moveTo(cx - s * 0.5, cy - s * 0.8); x.lineTo(cx, cy - s * 0.3); x.lineTo(cx - s, cy - s * 0.3); x.closePath(); x.fill(); } }) },
    { name: 'Shells', rot: 'random', v: 3, make: (r) => sq(64, (x) => { for (let k = 0; k < 3; k++) { const cx = 14 + r() * 36, cy = 16 + r() * 34, s = 7 + r() * 4, c = pick(r, ['#f3d9c4', '#f0c6b0', '#e8e0d0']); x.fillStyle = c; x.beginPath(); x.moveTo(cx, cy + s * 0.7); x.arc(cx, cy, s, Math.PI * 0.85, Math.PI * 0.15, false); x.closePath(); x.fill(); x.strokeStyle = U.shade(c, -0.3); x.lineWidth = 1; for (let i = 0; i < 5; i++) { const a = Math.PI * (0.95 + i * 0.27); x.beginPath(); x.moveTo(cx, cy + s * 0.7); x.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s); x.stroke(); } } }) },
    { name: 'Pebbles', rot: 'random', v: 4, make: (r) => sq(64, (x, s) => { for (let b = 0; b < 8; b++) { x.fillStyle = pick(r, ['#9a9a94', '#7d7d78', '#b0aca2', '#8a8f96']); ellipse(x, 8 + r() * (s - 16), 8 + r() * (s - 16), 4 + r() * 6, 3 + r() * 5, r() * 3); x.fill(); } }) },
    { name: 'Rubble', rot: 'random', v: 4, make: (r) => sq(96, (x) => { for (let i = 0; i < 10; i++) { const cx = 12 + r() * 72, cy = 12 + r() * 72, s = 5 + r() * 9, c = pick(r, ['#6f6a64', '#8a847b', '#5b5651', '#9d978d']); x.fillStyle = U.shade(c, -0.3); poly(x, cx + 1.5, cy + 2, s, 5 + ((r() * 3) | 0), r, r()); x.fill(); x.fillStyle = c; poly(x, cx, cy, s, 5 + ((r() * 3) | 0), r, r()); x.fill(); } }) },
    { name: 'Gravel', rot: 'random', v: 3, make: (r) => sq(64, (x) => { for (let i = 0; i < 60; i++) { x.fillStyle = pick(r, ['#8b8378', '#a39b8f', '#6e675e', '#bfb6a8']); ellipse(x, r() * 64, r() * 64, 1 + r() * 2.2, 1 + r() * 1.6, r() * 3); x.fill(); } }) },
    { name: 'Splatter Drops', rot: 'random', v: 4, tintable: true, make: (r) => sq(96, (x) => { x.fillStyle = '#ffffff'; for (let i = 0; i < 14; i++) { const a = r() * T, d = Math.pow(r(), 0.6) * 40, s = 1 + r() * 6; x.beginPath(); x.arc(48 + Math.cos(a) * d, 48 + Math.sin(a) * d, s, 0, T); x.fill(); } }) },
    { name: 'Scribbles', rot: 'random', v: 3, tintable: true, make: (r) => sq(64, (x) => { x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.beginPath(); let px = 10 + r() * 44, py = 10 + r() * 44; x.moveTo(px, py); for (let i = 0; i < 9; i++) { const nx = 8 + r() * 48, ny = 8 + r() * 48; x.quadraticCurveTo(px + (r() - 0.5) * 30, py + (r() - 0.5) * 30, nx, ny); px = nx; py = ny; } x.stroke(); }) },
  ];

  /* ---------- TILES (seamless) ---------- */
  const W = '#ffffff';
  const TILES = [
    { name: 'Dots', mono: true, make: () => sq(32, (x, s) => { x.fillStyle = W; for (const [px, py] of [[s / 2, s / 2], [0, 0], [s, 0], [0, s], [s, s]]) { x.beginPath(); x.arc(px, py, s / 6, 0, T); x.fill(); } }) },
    { name: 'Polka Dots', mono: true, make: () => sq(48, (x, s) => { x.fillStyle = W; for (const [px, py] of [[s / 4, s / 4], [(s * 3) / 4, (s * 3) / 4]]) { x.beginPath(); x.arc(px, py, s / 9, 0, T); x.fill(); } }) },
    { name: 'Checker', mono: true, make: () => sq(32, (x, s) => { x.fillStyle = W; x.fillRect(0, 0, s / 2, s / 2); x.fillRect(s / 2, s / 2, s / 2, s / 2); }) },
    { name: 'Gingham', mono: true, make: () => sq(32, (x, s) => { x.fillStyle = 'rgba(255,255,255,0.45)'; x.fillRect(0, 0, s / 2, s); x.fillRect(0, 0, s, s / 2); x.fillStyle = 'rgba(255,255,255,0.4)'; x.fillRect(0, 0, s / 2, s / 2); }) },
    { name: 'Grid', mono: true, make: () => sq(32, (x, s) => { x.strokeStyle = W; x.lineWidth = 2; x.strokeRect(0, 0, s, s); }) },
    { name: 'Fine Grid', mono: true, make: () => sq(16, (x, s) => { x.fillStyle = W; x.fillRect(0, 0, s, 1); x.fillRect(0, 0, 1, s); }) },
    { name: 'Stripes', mono: true, make: () => sq(24, (x, s) => { x.fillStyle = W; x.fillRect(0, 0, s, s / 2); }) },
    { name: 'Vertical Stripes', mono: true, make: () => sq(24, (x, s) => { x.fillStyle = W; x.fillRect(0, 0, s / 2, s); }) },
    { name: 'Pinstripe', mono: true, make: () => sq(16, (x, s) => { x.fillStyle = W; x.fillRect(0, 0, 2, s); }) },
    { name: 'Diagonal', mono: true, make: () => sq(24, (x, s) => { x.strokeStyle = W; x.lineWidth = 6; for (const o of [-s, 0, s]) { x.beginPath(); x.moveTo(o - 4, s + 4); x.lineTo(o + s + 4, -4); x.stroke(); } }) },
    { name: 'Crosshatch', mono: true, make: () => sq(24, (x, s) => { x.strokeStyle = W; x.lineWidth = 2.5; for (const o of [-s, 0, s]) { x.beginPath(); x.moveTo(o - 4, s + 4); x.lineTo(o + s + 4, -4); x.moveTo(o - 4, -4); x.lineTo(o + s + 4, s + 4); x.stroke(); } }) },
    { name: 'Hatching (fine)', mono: true, make: () => sq(12, (x, s) => { x.strokeStyle = W; x.lineWidth = 1.2; for (const o of [-s, 0, s]) { x.beginPath(); x.moveTo(o - 2, s + 2); x.lineTo(o + s + 2, -2); x.stroke(); } }) },
    { name: 'Zigzag', mono: true, make: () => sq(32, (x, s) => { x.strokeStyle = W; x.lineWidth = 4; x.lineJoin = 'miter'; x.beginPath(); x.moveTo(0, s * 0.7); x.lineTo(s / 2, s * 0.3); x.lineTo(s, s * 0.7); x.stroke(); }) },
    { name: 'Chevron', mono: true, make: () => sq(32, (x, s) => { x.fillStyle = W; x.beginPath(); x.moveTo(0, s * 0.35); x.lineTo(s / 2, 0); x.lineTo(s, s * 0.35); x.lineTo(s, s * 0.65); x.lineTo(s / 2, s * 0.3); x.lineTo(0, s * 0.65); x.closePath(); x.fill(); }) },
    { name: 'Waves', mono: true, make: () => sq(40, (x, s) => { x.strokeStyle = W; x.lineWidth = 3; for (const oy of [s * 0.25, s * 0.75]) { x.beginPath(); for (let i = 0; i <= s; i++) x.lineTo(i, oy + Math.sin((i / s) * T) * s * 0.12); x.stroke(); } }) },
    { name: 'Scales', mono: true, make: () => sq(32, (x, s) => { x.strokeStyle = W; x.lineWidth = 2; for (const [cx, cy] of [[0, 0], [s, 0], [s / 2, s / 2], [0, s], [s, s]]) { x.beginPath(); x.arc(cx, cy, s / 2, 0, Math.PI); x.stroke(); } }) },
    { name: 'Roof Tiles', mono: true, make: () => sq(32, (x, s) => { x.fillStyle = W; for (const [cx, cy] of [[s / 2, 0], [0, s / 2], [s, s / 2], [s / 2, s]]) { x.beginPath(); x.arc(cx, cy, s / 2 - 1.5, 0, Math.PI); x.fill(); } }) },
    { name: 'Honeycomb', mono: true, make: () => {
      const r = 15, w = 3 * r, h = 26, c = U.canvas(w, h), x = U.ctx(c), k = h / (Math.sqrt(3) * r);
      x.strokeStyle = W; x.lineWidth = 2;
      const hex = (cx, cy) => { x.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * T; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * k); } x.closePath(); x.stroke(); };
      for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h], [1.5 * r, h / 2], [1.5 * r, -h / 2], [1.5 * r, 1.5 * h]]) hex(cx, cy);
      return c;
    } },
    { name: 'Triangles', mono: true, make: () => sq(32, (x, s) => { x.fillStyle = W; x.beginPath(); x.moveTo(0, s); x.lineTo(s / 2, 0); x.lineTo(s, s); x.closePath(); x.fill(); }) },
    { name: 'Diamonds', mono: true, make: () => sq(32, (x, s) => { x.fillStyle = W; x.beginPath(); x.moveTo(s / 2, 2); x.lineTo(s - 2, s / 2); x.lineTo(s / 2, s - 2); x.lineTo(2, s / 2); x.closePath(); x.fill(); }) },
    { name: 'Herringbone', mono: true, make: () => sq(32, (x, s) => { x.fillStyle = W; for (let i = -2; i < 4; i++) { x.save(); x.translate(i * (s / 2), 0); x.beginPath(); x.moveTo(0, 0); x.lineTo(s / 4, 0); x.lineTo(s / 2 + s / 4, s); x.lineTo(s / 2, s); x.closePath(); x.fill(); x.restore(); } }) },
    { name: 'Basketweave', mono: true, make: () => sq(32, (x, s) => { x.fillStyle = W; const h = s / 2; for (let i = 0; i < 3; i++) { x.fillRect(1, i * (h / 3) + 1, h - 2, h / 3 - 2); x.fillRect(h + i * (h / 3) + 1, 1, h / 3 - 2, h - 2); x.fillRect(h + 1, h + i * (h / 3) + 1, h - 2, h / 3 - 2); x.fillRect(i * (h / 3) + 1, h + 1, h / 3 - 2, h - 2); } }) },
    { name: 'Bricks', mono: true, make: () => sq(48, (x, s) => { x.strokeStyle = W; x.lineWidth = 3; x.strokeRect(0, 0, s, s / 2); x.strokeRect(-s / 2, s / 2, s, s / 2); x.strokeRect(s / 2, s / 2, s, s / 2); }) },
    { name: 'Cobblestones', mono: true, make: () => sq(64, (x) => { const r = U.rng(5); x.fillStyle = W; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const cx = i * 16 + 8 + (j % 2) * 8, cy = j * 16 + 8; for (const ox of [-64, 0, 64]) { ellipse(x, cx + ox + (r() - 0.5) * 2, cy, 6.5 + r(), 6 + r(), r()); x.fill(); } } }) },
    { name: 'Rings', mono: true, make: () => sq(32, (x, s) => { x.strokeStyle = W; x.lineWidth = 2; x.beginPath(); x.arc(s / 2, s / 2, s / 3, 0, T); x.stroke(); }) },
    { name: 'Plus', mono: true, make: () => sq(24, (x, s) => { x.fillStyle = W; x.fillRect(s / 2 - 1.5, s / 2 - 5, 3, 10); x.fillRect(s / 2 - 5, s / 2 - 1.5, 10, 3); }) },
    { name: 'Star Field', mono: true, make: () => sq(48, (x, s) => { x.fillStyle = W; star(x, s / 4, s / 4, 6, 2.6, 5, 0); x.fill(); star(x, (s * 3) / 4, (s * 3) / 4, 6, 2.6, 5, 0.3); x.fill(); }) },
    { name: 'Hearts', mono: true, make: () => sq(40, (x, s) => { x.fillStyle = W; heart(x, s / 4, s / 4, 14); x.fill(); heart(x, (s * 3) / 4, (s * 3) / 4, 14); x.fill(); }) },
    { name: 'Halftone', mono: true, make: () => sq(12, (x, s) => { x.fillStyle = W; x.beginPath(); x.arc(s / 2, s / 2, s / 3.2, 0, T); x.fill(); }) },
    { name: 'Dashes', mono: true, make: () => sq(24, (x, s) => { x.fillStyle = W; x.fillRect(2, s / 4 - 1, s / 2, 2.5); x.fillRect(s / 2 + 2, (s * 3) / 4 - 1, s / 2, 2.5); x.fillRect(-s / 2 + 2, (s * 3) / 4 - 1, s / 2, 2.5); }) },
    { name: 'Cross Stitch', mono: true, make: () => sq(16, (x, s) => { x.strokeStyle = W; x.lineWidth = 2; x.beginPath(); x.moveTo(3, 3); x.lineTo(s - 3, s - 3); x.moveTo(s - 3, 3); x.lineTo(3, s - 3); x.stroke(); }) },
    { name: 'Lattice', mono: true, make: () => sq(32, (x, s) => { x.strokeStyle = W; x.lineWidth = 4; x.beginPath(); x.moveTo(0, 0); x.lineTo(s, s); x.moveTo(s, 0); x.lineTo(0, s); x.stroke(); }) },
    { name: 'Greek Key', mono: true, make: () => sq(32, (x, s) => { x.strokeStyle = W; x.lineWidth = 3; x.lineCap = 'square'; x.beginPath(); x.moveTo(0, s - 4); x.lineTo(s - 6, s - 4); x.lineTo(s - 6, 4); x.lineTo(6, 4); x.lineTo(6, s - 12); x.lineTo(s - 14, s - 12); x.lineTo(s - 14, 12); x.lineTo(14, 12); x.stroke(); x.beginPath(); x.moveTo(s - 6, s - 4); x.lineTo(s, s - 4); x.stroke(); }) },
    { name: 'Circuit', mono: true, make: () => sq(64, (x) => { const r = U.rng(9); x.strokeStyle = W; x.fillStyle = W; x.lineWidth = 2; for (let i = 0; i < 10; i++) { let px = Math.round(r() * 8) * 8, py = Math.round(r() * 8) * 8; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 3; k++) { if (r() < 0.5) px += (r() < 0.5 ? -1 : 1) * 16; else py += (r() < 0.5 ? -1 : 1) * 16; x.lineTo(px, py); } x.stroke(); x.beginPath(); x.arc(px, py, 3, 0, T); x.fill(); } }) },
    { name: 'Noise', mono: true, make: () => sq(64, (x, s) => { const r = U.rng(3), id = x.createImageData(s, s); for (let i = 0; i < id.data.length; i += 4) { id.data[i] = id.data[i + 1] = id.data[i + 2] = 255; id.data[i + 3] = 60 + r() * 195; } x.putImageData(id, 0, 0); }) },
    { name: 'Stipple', mono: true, make: () => sq(64, (x) => { const r = U.rng(4); x.fillStyle = W; for (let i = 0; i < 90; i++) { x.beginPath(); x.arc(r() * 64, r() * 64, 0.8 + r() * 1.2, 0, T); x.fill(); } }) },
    { name: 'Leopard', mono: true, make: () => sq(96, (x) => { const r = U.rng(12); x.strokeStyle = W; x.lineCap = 'round'; for (let i = 0; i < 16; i++) { const cx = r() * 96, cy = r() * 96, s = 5 + r() * 4; x.lineWidth = 3 + r() * 2; for (const ox of [-96, 0, 96]) for (const oy of [-96, 0, 96]) { x.beginPath(); x.arc(cx + ox, cy + oy, s, r() * T, r() * T + 4.2); x.stroke(); } } }) },
    { name: 'Zebra', mono: true, make: () => sq(96, (x) => { x.fillStyle = W; for (let i = 0; i < 8; i++) { const y0 = i * 12; x.beginPath(); for (let k = 0; k <= 96; k += 4) x.lineTo(k, y0 + Math.sin((k / 96) * T * 2 + i) * 4); for (let k = 96; k >= 0; k -= 4) x.lineTo(k, y0 + 5 + Math.sin((k / 96) * T * 2 + i + 0.6) * 4 + Math.sin(k * 0.3) * 1.5); x.closePath(); x.fill(); } }) },
    { name: 'Crackle', mono: true, make: () => sq(96, (x) => { const r = U.rng(21); x.strokeStyle = W; x.lineWidth = 1.2; for (let i = 0; i < 22; i++) { let px = r() * 96, py = r() * 96; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (r() - 0.5) * 30; py += (r() - 0.5) * 30; x.lineTo(px, py); } x.stroke(); } }) },
    { name: 'Wood Grain', mono: true, make: () => sq(128, (x) => { const n = U.fbm(128, 4, 3, 77, 0.5); x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 1.4; for (let i = 0; i < 16; i++) { x.beginPath(); for (let y = 0; y <= 128; y += 4) x.lineTo(i * 8 + n[(y % 128) * 128 + ((i * 8) % 128)] * 10, y); x.stroke(); } }) },
    /* coloured tiles */
    { name: 'Red Bricks', make: () => sq(64, (x, s) => { x.fillStyle = '#c9c1b5'; x.fillRect(0, 0, s, s); const r = U.rng(8); const br = (bx, by, w, h) => { x.fillStyle = U.shade('#a8442f', (r() - 0.5) * 0.35); x.fillRect(bx + 1.5, by + 1.5, w - 3, h - 3); }; br(0, 0, s, s / 4); br(-s / 2, s / 4, s, s / 4); br(s / 2, s / 4, s, s / 4); br(0, s / 2, s, s / 4); br(-s / 2, (s * 3) / 4, s, s / 4); br(s / 2, (s * 3) / 4, s, s / 4); }) },
    { name: 'Stone Wall', make: () => sq(96, (x, s) => { x.fillStyle = '#4a4744'; x.fillRect(0, 0, s, s); const r = U.rng(14); for (let j = 0; j < 4; j++) for (let i = -1; i < 4; i++) { const w = 28 + r() * 8; x.fillStyle = U.shade('#8a847b', (r() - 0.5) * 0.4); const px = i * 32 + (j % 2) * 16; x.beginPath(); x.roundRect ? x.roundRect(px + 2, j * 24 + 2, w - 4, 20, 5) : x.rect(px + 2, j * 24 + 2, w - 4, 20); x.fill(); } }) },
    { name: 'Tartan', make: () => sq(64, (x, s) => { x.fillStyle = '#1f3d6b'; x.fillRect(0, 0, s, s); x.fillStyle = 'rgba(180,30,40,0.75)'; x.fillRect(0, 22, s, 20); x.fillRect(22, 0, 20, s); x.fillStyle = 'rgba(30,90,50,0.6)'; x.fillRect(0, 4, s, 8); x.fillRect(4, 0, 8, s); x.fillStyle = 'rgba(255,220,90,0.8)'; x.fillRect(0, 31, s, 2); x.fillRect(31, 0, 2, s); }) },
    { name: 'Argyle', make: () => sq(48, (x, s) => { x.fillStyle = '#2d4a6e'; x.fillRect(0, 0, s, s); x.fillStyle = '#c8a24a'; x.beginPath(); x.moveTo(s / 2, 0); x.lineTo(s, s / 2); x.lineTo(s / 2, s); x.lineTo(0, s / 2); x.closePath(); x.fill(); x.strokeStyle = '#f2ead8'; x.lineWidth = 1; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(0, 0); x.lineTo(s, s); x.moveTo(s, 0); x.lineTo(0, s); x.stroke(); }) },
    { name: 'Denim', make: () => sq(32, (x, s) => { x.fillStyle = '#2f4e78'; x.fillRect(0, 0, s, s); x.strokeStyle = 'rgba(200,215,235,0.35)'; x.lineWidth = 1; for (let i = -s; i < s * 2; i += 3) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + s, s); x.stroke(); } }) },
    { name: 'Camouflage', make: () => sq(128, (x, s) => { const n = U.fbm(128, 4, 3, 33, 0.5), m = U.fbm(128, 6, 3, 34, 0.5), id = x.createImageData(s, s); const cols = [[85, 94, 58], [120, 110, 70], [60, 66, 44], [150, 140, 100]]; for (let i = 0; i < s * s; i++) { const k = n[i] > 0.6 ? 0 : n[i] > 0.45 ? 1 : m[i] > 0.55 ? 2 : 3, c = cols[k]; id.data[i * 4] = c[0]; id.data[i * 4 + 1] = c[1]; id.data[i * 4 + 2] = c[2]; id.data[i * 4 + 3] = 255; } x.putImageData(id, 0, 0); }) },
    { name: 'Giraffe', make: () => sq(96, (x, s) => { x.fillStyle = '#f1d9a7'; x.fillRect(0, 0, s, s); const r = U.rng(41); x.fillStyle = '#b5652a'; for (let i = 0; i < 9; i++) { const cx = r() * s, cy = r() * s; for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { poly(x, cx + ox, cy + oy, 13, 6, r, r()); x.fill(); } } }) },
    { name: 'Water', make: () => sq(64, (x, s) => { x.fillStyle = '#2a7fb8'; x.fillRect(0, 0, s, s); x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 2; for (const oy of [10, 26, 42, 58]) { x.beginPath(); for (let i = 0; i <= s; i++) x.lineTo(i, oy + Math.sin((i / s) * T * 2 + oy) * 3); x.stroke(); } }) },
    { name: 'Grass Texture', make: () => sq(64, (x, s) => { x.fillStyle = '#4c8a3a'; x.fillRect(0, 0, s, s); const r = U.rng(51); x.lineCap = 'round'; for (let i = 0; i < 140; i++) { const px = r() * s, py = r() * s; x.strokeStyle = pick(r, ['#5fa346', '#3a7530', '#71b356', '#2f6b2a']); x.lineWidth = 1.2; for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(px + ox + (r() - 0.5) * 3, py + oy - 5 - r() * 4); x.stroke(); } } }) },
  ];

  /* ---------- caches & API ---------- */
  const spriteCache = new Map();
  function sprites(name) {
    let v = spriteCache.get(name);
    if (!v) {
      const d = SPRITES.find((q) => q.name === name);
      if (!d) return null;
      v = [];
      for (let i = 0; i < d.v; i++) v.push(d.make(U.rng(U.hash(name) + i * 7919)));
      spriteCache.set(name, v);
    }
    return v;
  }
  const tileCache = new Map();
  function tile(name) {
    let c = tileCache.get(name);
    if (!c) {
      const d = TILES.find((q) => q.name === name) || (ND.Patterns.custom || []).find((q) => q.name === name);
      if (!d) return null;
      c = d.canvas || (d.custom ? d.custom() : d.make());
      tileCache.set(name, c);
    }
    return c;
  }
  function tileInfo(name) { return TILES.find((q) => q.name === name) || (ND.Patterns.custom || []).find((q) => q.name === name) || null; }
  // A tile coloured for use (mono tiles take `colour`).
  function tileColoured(name, colour) {
    const t = tile(name), info = tileInfo(name);
    if (!t) return null;
    if (!info || !info.mono) return t;
    return ND.Tips.tint(t, colour);
  }
  function spriteInfo(name) { return SPRITES.find((q) => q.name === name) || null; }
  function preview(kind, name, size) {
    const c = U.canvas(size, size), x = U.ctx(c);
    if (kind === 'sprite') {
      const s = sprites(name);
      if (s) { x.drawImage(s[0], 0, 0, size, size); if (spriteInfo(name).tintable) { x.globalCompositeOperation = 'source-in'; x.fillStyle = '#9fb8d8'; x.fillRect(0, 0, size, size); } }
    } else {
      const t = tileColoured(name, '#9fb8d8');
      if (t) { x.fillStyle = x.createPattern(t, 'repeat'); x.fillRect(0, 0, size, size); }
    }
    return c;
  }
  // User-defined tiles (from a selection) are stored as data URLs.
  function addCustomTile(name, canvas, mono) {
    ND.Patterns.custom = (ND.Patterns.custom || []).filter((q) => q.name !== name);
    ND.Patterns.custom.push({ name, canvas, mono: !!mono, user: true });
    tileCache.delete(name);
  }

  ND.Patterns = {
    SPRITES, TILES, sprites, tile, tileInfo, tileColoured, spriteInfo, preview, addCustomTile, custom: [],
    allTiles: () => TILES.concat(ND.Patterns.custom || []),
    isSprite: (n) => !!SPRITES.find((q) => q.name === n),
    isTile: (n) => !!TILES.find((q) => q.name === n) || !!(ND.Patterns.custom || []).find((q) => q.name === n),
  };
})();
