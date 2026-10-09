/* Neon Draw — stamp library. Each stamp is drawn as vectors in a 100×100 box, so it stays crisp at any size.
 * User stamps (captured from a selection or imported images) are bitmaps. */
'use strict';
(function () {
  const U = ND.U, T = U.TAU;

  /* helpers working in 100-unit space */
  const C = (x, cx, cy, r, f) => { x.beginPath(); x.arc(cx, cy, r, 0, T); if (f) { x.fillStyle = f; x.fill(); } };
  const E = (x, cx, cy, rx, ry, rot, f) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot || 0, 0, T); if (f) { x.fillStyle = f; x.fill(); } };
  const P = (x, pts, f, close) => { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); if (close !== false) x.closePath(); if (f) { x.fillStyle = f; x.fill(); } };
  const RR = (x, rx, ry, w, h, r, f) => { x.beginPath(); if (x.roundRect) x.roundRect(rx, ry, w, h, r); else x.rect(rx, ry, w, h); if (f) { x.fillStyle = f; x.fill(); } };
  const L = (x, pts, col, w) => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; P(x, pts, null, false); x.stroke(); };
  const STAR = (x, cx, cy, ro, ri, n, f, rot) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * T - Math.PI / 2 + (rot || 0), r = i % 2 ? ri : ro; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } P(x, p, f); };
  const HEART = (x, cx, cy, s, f) => { x.beginPath(); x.moveTo(cx, cy + s * 0.38); x.bezierCurveTo(cx - s * 0.62, cy - s * 0.02, cx - s * 0.28, cy - s * 0.5, cx, cy - s * 0.17); x.bezierCurveTo(cx + s * 0.28, cy - s * 0.5, cx + s * 0.62, cy - s * 0.02, cx, cy + s * 0.38); x.closePath(); x.fillStyle = f; x.fill(); };
  const LEAF = (x, cx, cy, len, ang, f) => { x.save(); x.translate(cx, cy); x.rotate(ang); x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * 0.45, -len * 0.34, len, 0); x.quadraticCurveTo(len * 0.45, len * 0.34, 0, 0); x.fillStyle = f; x.fill(); x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(len * 0.06, 0); x.lineTo(len * 0.9, 0); x.stroke(); x.restore(); };
  const FACE = (x, cx, cy, s) => { C(x, cx - s * 0.32, cy - s * 0.1, s * 0.09, '#2a2a2a'); C(x, cx + s * 0.32, cy - s * 0.1, s * 0.09, '#2a2a2a'); x.strokeStyle = '#2a2a2a'; x.lineWidth = s * 0.07; x.lineCap = 'round'; x.beginPath(); x.arc(cx, cy + s * 0.05, s * 0.3, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke(); };

  const STAMPS = [
    /* ---- Nature ---- */
    { name: 'Leaf', cat: 'Nature', draw: (x) => { LEAF(x, 10, 55, 80, -0.25, '#48914a'); LEAF(x, 18, 62, 50, 0.45, '#57a34a'); } },
    { name: 'Maple Leaf', cat: 'Nature', draw: (x) => { P(x, [[50, 6], [58, 26], [74, 18], [70, 38], [92, 36], [80, 52], [90, 60], [64, 66], [66, 82], [52, 74], [50, 96], [48, 74], [34, 82], [36, 66], [10, 60], [20, 52], [8, 36], [30, 38], [26, 18], [42, 26]], '#d4561c'); L(x, [[50, 30], [50, 96]], '#8a3410', 2); } },
    { name: 'Grass Tuft', cat: 'Nature', draw: (x) => { const c = ['#4a8f3c', '#5fa346', '#3a7530', '#71b356']; for (let i = 0; i < 11; i++) { const bx = 18 + (i / 10) * 64, h = 45 + (i % 3) * 14, lean = (i - 5) * 4; x.fillStyle = c[i % 4]; x.beginPath(); x.moveTo(bx - 3, 98); x.lineTo(bx + 3, 98); x.quadraticCurveTo(bx + lean * 0.5, 98 - h * 0.6, bx + lean, 98 - h); x.closePath(); x.fill(); } } },
    { name: 'Flower', cat: 'Nature', draw: (x) => { for (let i = 0; i < 6; i++) { const a = (i / 6) * T; E(x, 50 + Math.cos(a) * 24, 50 + Math.sin(a) * 24, 19, 12, a, '#e06aa8'); } C(x, 50, 50, 13, '#f5d43c'); } },
    { name: 'Daisy', cat: 'Nature', draw: (x) => { for (let i = 0; i < 14; i++) { const a = (i / 14) * T; E(x, 50 + Math.cos(a) * 26, 50 + Math.sin(a) * 26, 18, 6, a, '#fbfbf5'); } C(x, 50, 50, 12, '#f2b929'); C(x, 47, 47, 4, '#f7cf55'); } },
    { name: 'Tulip', cat: 'Nature', draw: (x) => { L(x, [[50, 96], [50, 50]], '#3a7a35', 4); LEAF(x, 50, 92, 34, -2.2, '#4f9a45'); P(x, [[32, 22], [40, 34], [50, 18], [60, 34], [68, 22], [70, 46], [60, 58], [40, 58], [30, 46]], '#e0384f'); } },
    { name: 'Rose', cat: 'Nature', draw: (x) => { C(x, 50, 46, 30, '#c2185b'); x.strokeStyle = '#8e0f40'; x.lineWidth = 3; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(50 + i, 46 - i, 24 - i * 6, i, i + 4.2); x.stroke(); } LEAF(x, 40, 80, 26, 2.6, '#3f8a3c'); LEAF(x, 60, 80, 26, 0.5, '#3f8a3c'); } },
    { name: 'Sunflower', cat: 'Nature', draw: (x) => { for (let i = 0; i < 18; i++) { const a = (i / 18) * T; E(x, 50 + Math.cos(a) * 30, 50 + Math.sin(a) * 30, 14, 6, a, '#f6c026'); } C(x, 50, 50, 20, '#6b3e1e'); for (let i = 0; i < 20; i++) C(x, 50 + Math.cos(i * 2.4) * Math.sqrt(i) * 4, 50 + Math.sin(i * 2.4) * Math.sqrt(i) * 4, 1.6, '#3d2210'); } },
    { name: 'Tree', cat: 'Nature', draw: (x) => { RR(x, 45, 60, 10, 36, 2, '#6b4a2f'); P(x, [[50, 6], [82, 50], [18, 50]], '#3d7a3f'); P(x, [[50, 30], [88, 72], [12, 72]], '#356b37'); } },
    { name: 'Round Tree', cat: 'Nature', draw: (x) => { RR(x, 45, 58, 10, 38, 2, '#7a5236'); C(x, 50, 40, 30, '#4f9a45'); C(x, 34, 50, 18, '#458a3d'); C(x, 66, 50, 18, '#458a3d'); C(x, 42, 30, 10, '#62b356'); } },
    { name: 'Palm Tree', cat: 'Nature', draw: (x) => { x.strokeStyle = '#8b6a3e'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(52, 98); x.quadraticCurveTo(58, 60, 48, 28); x.stroke(); for (const a of [-2.6, -2.1, -1.2, -0.5, 0.1]) LEAF(x, 48, 28, 40, a, '#3f9a4a'); C(x, 46, 32, 4, '#5a3d1e'); C(x, 52, 33, 4, '#5a3d1e'); } },
    { name: 'Cactus', cat: 'Nature', draw: (x) => { RR(x, 40, 20, 20, 72, 10, '#4f9a5a'); RR(x, 20, 40, 14, 28, 7, '#4f9a5a'); RR(x, 20, 58, 26, 10, 5, '#4f9a5a'); RR(x, 66, 30, 14, 26, 7, '#4f9a5a'); RR(x, 56, 48, 24, 10, 5, '#4f9a5a'); RR(x, 34, 88, 32, 10, 3, '#c0703a'); } },
    { name: 'Mushroom', cat: 'Nature', draw: (x) => { RR(x, 40, 48, 20, 44, 8, '#f2e8d5'); x.beginPath(); x.ellipse(50, 50, 42, 32, 0, Math.PI, 0); x.closePath(); x.fillStyle = '#d63a2f'; x.fill(); for (const [a, b, r] of [[34, 34, 6], [56, 28, 7], [72, 42, 5], [28, 46, 4]]) C(x, a, b, r, '#fff'); } },
    { name: 'Clover', cat: 'Nature', draw: (x) => { L(x, [[50, 52], [56, 96]], '#3a7a35', 4); for (let i = 0; i < 4; i++) { x.save(); x.translate(50, 50); x.rotate((i / 4) * T); HEART(x, 0, -18, 34, '#4caf50'); x.restore(); } } },
    { name: 'Mountain', cat: 'Nature', draw: (x) => { P(x, [[2, 92], [38, 22], [62, 60], [72, 44], [98, 92]], '#6b7d8f'); P(x, [[38, 22], [28, 42], [36, 40], [42, 46], [48, 34]], '#f4f7fa'); P(x, [[72, 44], [66, 54], [74, 52], [78, 54]], '#f4f7fa'); } },
    { name: 'Pebble', cat: 'Nature', draw: (x) => { E(x, 52, 58, 40, 26, 0.1, '#8d8a84'); E(x, 44, 50, 18, 8, 0.1, 'rgba(255,255,255,0.25)'); } },
    { name: 'Feather', cat: 'Nature', draw: (x) => { x.save(); x.translate(50, 50); x.rotate(0.6); x.strokeStyle = '#4a6b8a'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 46); x.lineTo(0, -44); x.stroke(); x.strokeStyle = '#8fb3d6'; x.lineWidth = 1.4; for (let i = -40; i < 38; i += 2.4) { const w = 16 * Math.cos((i / 44) * Math.PI / 2); x.beginPath(); x.moveTo(0, i); x.lineTo(-w, i - 7); x.moveTo(0, i); x.lineTo(w, i - 7); x.stroke(); } x.restore(); } },
    { name: 'Shell', cat: 'Nature', draw: (x) => { x.beginPath(); x.moveTo(50, 88); x.arc(50, 52, 40, Math.PI * 0.85, Math.PI * 0.15); x.closePath(); x.fillStyle = '#f3c9a8'; x.fill(); x.strokeStyle = '#d18b62'; x.lineWidth = 2.5; for (let i = 0; i < 7; i++) { const a = Math.PI * (0.92 + i * 0.193); x.beginPath(); x.moveTo(50, 88); x.lineTo(50 + Math.cos(a) * 40, 52 + Math.sin(a) * 40); x.stroke(); } } },
    { name: 'Starfish', cat: 'Nature', draw: (x) => { STAR(x, 50, 52, 46, 18, 5, '#f08a4b'); for (let i = 0; i < 5; i++) { const a = (i / 5) * T - Math.PI / 2; for (let k = 1; k < 4; k++) C(x, 50 + Math.cos(a) * k * 10, 52 + Math.sin(a) * k * 10, 2, '#ffc79e'); } } },
    /* ---- Weather & Sky ---- */
    { name: 'Sun', cat: 'Sky', draw: (x) => { for (let i = 0; i < 12; i++) { const a = (i / 12) * T; P(x, [[50 + Math.cos(a - 0.12) * 30, 50 + Math.sin(a - 0.12) * 30], [50 + Math.cos(a) * 47, 50 + Math.sin(a) * 47], [50 + Math.cos(a + 0.12) * 30, 50 + Math.sin(a + 0.12) * 30]], '#f7b928'); } C(x, 50, 50, 26, '#ffd23f'); } },
    { name: 'Moon', cat: 'Sky', draw: (x) => { x.beginPath(); x.arc(50, 50, 40, 0, T); x.arc(66, 40, 34, 0, T, true); x.fillStyle = '#f4e9b8'; x.fill('evenodd'); C(x, 30, 56, 4, 'rgba(0,0,0,0.08)'); C(x, 38, 74, 6, 'rgba(0,0,0,0.08)'); } },
    { name: 'Star', cat: 'Sky', draw: (x) => STAR(x, 50, 54, 46, 19, 5, '#f5d43c') },
    { name: 'Sparkle', cat: 'Sky', draw: (x) => { STAR(x, 50, 50, 46, 9, 4, '#fff6c8'); STAR(x, 78, 22, 14, 3, 4, '#fff6c8'); } },
    { name: 'Cloud', cat: 'Sky', draw: (x) => { x.fillStyle = '#ffffff'; C(x, 32, 60, 18, '#f2f6fb'); C(x, 52, 48, 24, '#f2f6fb'); C(x, 72, 60, 18, '#f2f6fb'); RR(x, 16, 58, 72, 22, 11, '#f2f6fb'); C(x, 48, 44, 12, '#ffffff'); } },
    { name: 'Rain Cloud', cat: 'Sky', draw: (x) => { C(x, 32, 44, 16, '#9aa6b4'); C(x, 52, 34, 21, '#9aa6b4'); C(x, 70, 44, 16, '#9aa6b4'); RR(x, 18, 42, 66, 18, 9, '#9aa6b4'); for (const px of [30, 46, 62, 76]) L(x, [[px, 68], [px - 5, 84]], '#5aa0e0', 3.5); } },
    { name: 'Lightning', cat: 'Sky', draw: (x) => P(x, [[58, 4], [24, 56], [46, 56], [36, 96], [76, 40], [54, 40], [66, 4]], '#ffd23f') },
    { name: 'Raindrop', cat: 'Sky', draw: (x) => { x.beginPath(); x.moveTo(50, 6); x.bezierCurveTo(72, 40, 80, 56, 80, 66); x.arc(50, 66, 30, 0, Math.PI); x.bezierCurveTo(20, 56, 28, 40, 50, 6); x.fillStyle = '#4aa3e8'; x.fill(); E(x, 40, 66, 6, 10, 0.3, 'rgba(255,255,255,0.5)'); } },
    { name: 'Snowflake', cat: 'Sky', draw: (x) => { x.strokeStyle = '#a8d8f0'; x.lineWidth = 4.5; x.lineCap = 'round'; for (let i = 0; i < 6; i++) { const a = (i / 6) * T; x.beginPath(); x.moveTo(50, 50); x.lineTo(50 + Math.cos(a) * 42, 50 + Math.sin(a) * 42); x.stroke(); const bx = 50 + Math.cos(a) * 26, by = 50 + Math.sin(a) * 26; for (const r of [-0.5, 0.5]) { x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + Math.cos(a + r) * 12, by + Math.sin(a + r) * 12); x.stroke(); } } } },
    { name: 'Rainbow', cat: 'Sky', draw: (x) => { const c = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#5e35b1']; c.forEach((col, i) => { x.strokeStyle = col; x.lineWidth = 6; x.beginPath(); x.arc(50, 82, 44 - i * 6, Math.PI, 0); x.stroke(); }); } },
    { name: 'Planet', cat: 'Sky', draw: (x) => { C(x, 50, 50, 26, '#e0a96d'); E(x, 44, 42, 10, 5, -0.4, 'rgba(255,255,255,0.2)'); x.strokeStyle = '#c9884a'; x.lineWidth = 4; x.beginPath(); x.ellipse(50, 50, 46, 12, -0.35, 0.15, Math.PI - 0.15, true); x.stroke(); } },
    { name: 'Comet', cat: 'Sky', draw: (x) => { const g = x.createLinearGradient(10, 90, 70, 30); g.addColorStop(0, 'rgba(120,200,255,0)'); g.addColorStop(1, 'rgba(180,230,255,0.9)'); P(x, [[8, 96], [62, 26], [78, 42]], g); C(x, 72, 32, 13, '#e8f6ff'); } },
    /* ---- Animals ---- */
    { name: 'Butterfly', cat: 'Animals', draw: (x) => { E(x, 32, 42, 18, 26, -0.5, '#c85adf'); E(x, 68, 42, 18, 26, 0.5, '#c85adf'); E(x, 36, 72, 12, 16, -0.9, '#8a3aa8'); E(x, 64, 72, 12, 16, 0.9, '#8a3aa8'); C(x, 30, 40, 6, '#f5d0ff'); C(x, 70, 40, 6, '#f5d0ff'); RR(x, 48.5, 25, 3, 55, 1.5, '#2a2a2a'); L(x, [[50, 26], [42, 12]], '#2a2a2a', 1.5); L(x, [[50, 26], [58, 12]], '#2a2a2a', 1.5); } },
    { name: 'Bird', cat: 'Animals', draw: (x) => { E(x, 46, 56, 30, 22, 0, '#4d8fd1'); C(x, 70, 40, 16, '#4d8fd1'); P(x, [[84, 40], [96, 44], [84, 48]], '#f0a03c'); C(x, 74, 37, 3, '#111'); P(x, [[20, 52], [2, 40], [8, 62]], '#3a6ea8'); E(x, 42, 52, 16, 9, -0.4, '#6aa8e8'); } },
    { name: 'Fish', cat: 'Animals', draw: (x) => { E(x, 46, 50, 32, 20, 0, '#f0a03c'); P(x, [[16, 50], [2, 30], [2, 70]], '#e0882a'); C(x, 64, 45, 4, '#111'); x.strokeStyle = 'rgba(0,0,0,0.2)'; x.lineWidth = 2; x.beginPath(); x.arc(40, 50, 14, -1, 1); x.stroke(); } },
    { name: 'Cat Face', cat: 'Animals', draw: (x) => { P(x, [[20, 20], [36, 38], [22, 48]], '#f0a03c'); P(x, [[80, 20], [64, 38], [78, 48]], '#f0a03c'); C(x, 50, 58, 34, '#f0a03c'); C(x, 38, 52, 5, '#2a2a2a'); C(x, 62, 52, 5, '#2a2a2a'); P(x, [[46, 62], [54, 62], [50, 67]], '#e0525a'); x.strokeStyle = '#2a2a2a'; x.lineWidth = 1.5; for (const s of [-1, 1]) for (const k of [-4, 2]) { x.beginPath(); x.moveTo(50 + s * 10, 66 + k * 0.3); x.lineTo(50 + s * 34, 62 + k); x.stroke(); } } },
    { name: 'Dog Face', cat: 'Animals', draw: (x) => { E(x, 22, 46, 12, 24, 0.3, '#7a5236'); E(x, 78, 46, 12, 24, -0.3, '#7a5236'); C(x, 50, 54, 32, '#c8955e'); E(x, 50, 70, 16, 12, 0, '#f2dcc0'); C(x, 38, 48, 4.5, '#2a2a2a'); C(x, 62, 48, 4.5, '#2a2a2a'); E(x, 50, 64, 6, 4.5, 0, '#2a2a2a'); } },
    { name: 'Bunny', cat: 'Animals', draw: (x) => { E(x, 38, 26, 8, 24, -0.15, '#f2f2f2'); E(x, 62, 26, 8, 24, 0.15, '#f2f2f2'); E(x, 38, 26, 4, 16, -0.15, '#f7b6c8'); E(x, 62, 26, 4, 16, 0.15, '#f7b6c8'); C(x, 50, 62, 28, '#f2f2f2'); C(x, 40, 58, 3.5, '#2a2a2a'); C(x, 60, 58, 3.5, '#2a2a2a'); C(x, 50, 66, 3, '#f08aa8'); } },
    { name: 'Paw Print', cat: 'Animals', draw: (x) => { E(x, 50, 64, 20, 17, 0, '#4a3a30'); for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i - 1.5) * 0.55; E(x, 50 + Math.cos(a) * 34, 66 + Math.sin(a) * 34, 8, 10, a + Math.PI / 2, '#4a3a30'); } } },
    { name: 'Ladybird', cat: 'Animals', draw: (x) => { C(x, 50, 56, 34, '#d32f2f'); C(x, 50, 24, 14, '#1a1a1a'); RR(x, 48.5, 24, 3, 66, 1.5, '#1a1a1a'); for (const [a, b] of [[34, 46], [66, 46], [30, 66], [70, 66], [42, 80], [58, 80]]) C(x, a, b, 6, '#1a1a1a'); C(x, 44, 21, 3, '#fff'); C(x, 56, 21, 3, '#fff'); } },
    { name: 'Bee', cat: 'Animals', draw: (x) => { E(x, 38, 30, 14, 20, -0.4, 'rgba(210,235,255,0.85)'); E(x, 60, 30, 14, 20, 0.4, 'rgba(210,235,255,0.85)'); E(x, 50, 60, 30, 22, 0, '#f6c026'); x.save(); x.beginPath(); x.ellipse(50, 60, 30, 22, 0, 0, T); x.clip(); for (const px of [38, 54, 70]) { x.fillStyle = '#2a2a2a'; x.fillRect(px - 4, 30, 8, 60); } x.restore(); C(x, 22, 58, 3, '#2a2a2a'); } },
    { name: 'Whale', cat: 'Animals', draw: (x) => { x.beginPath(); x.moveTo(8, 56); x.quadraticCurveTo(14, 26, 50, 28); x.quadraticCurveTo(84, 30, 86, 56); x.quadraticCurveTo(70, 76, 40, 72); x.quadraticCurveTo(16, 70, 8, 56); x.fillStyle = '#4a7fb8'; x.fill(); P(x, [[84, 54], [98, 38], [96, 64]], '#4a7fb8'); E(x, 42, 64, 26, 7, 0, '#cfe3f5'); C(x, 26, 48, 3, '#111'); L(x, [[48, 24], [44, 10]], '#9fd0ff', 3); L(x, [[48, 24], [54, 10]], '#9fd0ff', 3); } },
    { name: 'Owl', cat: 'Animals', draw: (x) => { E(x, 50, 56, 34, 40, 0, '#8a6440'); P(x, [[22, 22], [30, 34], [36, 22]], '#8a6440'); P(x, [[78, 22], [70, 34], [64, 22]], '#8a6440'); C(x, 36, 44, 13, '#fff'); C(x, 64, 44, 13, '#fff'); C(x, 36, 44, 6, '#2a2a2a'); C(x, 64, 44, 6, '#2a2a2a'); P(x, [[46, 56], [54, 56], [50, 64]], '#f0a03c'); E(x, 50, 78, 18, 14, 0, '#c9a77b'); } },
    /* ---- Food ---- */
    { name: 'Apple', cat: 'Food', draw: (x) => { C(x, 38, 56, 28, '#d32f2f'); C(x, 62, 56, 28, '#d32f2f'); C(x, 50, 74, 22, '#d32f2f'); L(x, [[50, 34], [52, 16]], '#6b4a2f', 4); LEAF(x, 53, 22, 22, -0.5, '#4caf50'); E(x, 36, 48, 6, 10, -0.4, 'rgba(255,255,255,0.35)'); } },
    { name: 'Cherries', cat: 'Food', draw: (x) => { x.strokeStyle = '#4a7a35'; x.lineWidth = 3; x.beginPath(); x.moveTo(32, 70); x.quadraticCurveTo(40, 30, 62, 12); x.moveTo(68, 66); x.quadraticCurveTo(64, 34, 62, 12); x.stroke(); C(x, 30, 72, 16, '#c2185b'); C(x, 68, 68, 16, '#c2185b'); C(x, 25, 66, 4, 'rgba(255,255,255,0.4)'); C(x, 63, 62, 4, 'rgba(255,255,255,0.4)'); } },
    { name: 'Strawberry', cat: 'Food', draw: (x) => { x.beginPath(); x.moveTo(50, 94); x.bezierCurveTo(14, 70, 14, 30, 50, 30); x.bezierCurveTo(86, 30, 86, 70, 50, 94); x.fillStyle = '#e53935'; x.fill(); STAR(x, 50, 30, 20, 7, 6, '#43a047'); for (let i = 0; i < 14; i++) C(x, 32 + (i % 4) * 12 + (i % 2) * 3, 44 + Math.floor(i / 4) * 12, 1.8, '#ffe082'); } },
    { name: 'Cupcake', cat: 'Food', draw: (x) => { P(x, [[24, 54], [76, 54], [68, 94], [32, 94]], '#4d8fd1'); x.strokeStyle = 'rgba(0,0,0,0.15)'; x.lineWidth = 2; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(30 + i * 10, 56); x.lineTo(34 + i * 8, 92); x.stroke(); } C(x, 34, 50, 14, '#f7b6c8'); C(x, 66, 50, 14, '#f7b6c8'); C(x, 50, 40, 18, '#f7b6c8'); C(x, 50, 18, 6, '#d32f2f'); } },
    { name: 'Ice Cream', cat: 'Food', draw: (x) => { P(x, [[30, 46], [70, 46], [50, 96]], '#e0a96d'); x.strokeStyle = '#b97f45'; x.lineWidth = 1.5; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(34 + i * 9, 46); x.lineTo(50 + i * 4, 90 - i * 4); x.stroke(); } C(x, 40, 40, 14, '#f7b6c8'); C(x, 60, 40, 14, '#fff3c4'); C(x, 50, 26, 15, '#8d5a3b'); } },
    { name: 'Pizza Slice', cat: 'Food', draw: (x) => { P(x, [[50, 94], [14, 14], [86, 14]], '#f4c542'); RR(x, 10, 8, 80, 12, 6, '#c98a3e'); for (const [a, b] of [[40, 34], [60, 34], [50, 56], [48, 76]]) C(x, a, b, 6, '#c62828'); } },
    { name: 'Donut', cat: 'Food', draw: (x) => { x.beginPath(); x.arc(50, 50, 42, 0, T); x.arc(50, 50, 14, 0, T, true); x.fillStyle = '#d9a066'; x.fill('evenodd'); x.beginPath(); x.arc(50, 48, 36, 0, T); x.arc(50, 48, 17, 0, T, true); x.fillStyle = '#f48fb1'; x.fill('evenodd'); const cs = ['#fff', '#4d8fd1', '#ffd23f', '#3bceac']; for (let i = 0; i < 14; i++) { const a = i * 0.9, r = 24 + (i % 3) * 4; x.save(); x.translate(50 + Math.cos(a) * r, 48 + Math.sin(a) * r); x.rotate(a * 2); x.fillStyle = cs[i % 4]; x.fillRect(-3, -1, 6, 2.4); x.restore(); } } },
    { name: 'Carrot', cat: 'Food', draw: (x) => { P(x, [[36, 30], [64, 30], [50, 96]], '#f08a24'); for (const a of [-2.2, -1.6, -1]) LEAF(x, 50, 30, 26, a, '#4caf50'); } },
    { name: 'Coffee Cup', cat: 'Food', draw: (x) => { RR(x, 20, 36, 50, 50, 8, '#f5f5f5'); x.strokeStyle = '#f5f5f5'; x.lineWidth = 7; x.beginPath(); x.arc(72, 58, 12, -1.3, 1.3); x.stroke(); E(x, 45, 38, 25, 5, 0, '#6d4c41'); for (const px of [36, 48, 60]) { x.strokeStyle = 'rgba(200,200,200,0.8)'; x.lineWidth = 3; x.beginPath(); x.moveTo(px, 28); x.quadraticCurveTo(px - 6, 18, px, 8); x.stroke(); } } },
    /* ---- Objects ---- */
    { name: 'House', cat: 'Objects', draw: (x) => { RR(x, 20, 46, 60, 48, 2, '#f2e3c6'); P(x, [[10, 50], [50, 12], [90, 50]], '#c0392b'); RR(x, 42, 64, 16, 30, 2, '#7a5236'); RR(x, 26, 56, 12, 12, 1, '#8fd3ff'); RR(x, 62, 56, 12, 12, 1, '#8fd3ff'); } },
    { name: 'Castle', cat: 'Objects', draw: (x) => { RR(x, 14, 40, 72, 56, 0, '#9e9e9e'); for (let i = 0; i < 5; i++) RR(x, 14 + i * 16, 32, 8, 10, 0, '#9e9e9e'); RR(x, 4, 24, 20, 72, 0, '#8a8a8a'); RR(x, 76, 24, 20, 72, 0, '#8a8a8a'); P(x, [[2, 26], [14, 6], [26, 26]], '#c0392b'); P(x, [[74, 26], [86, 6], [98, 26]], '#c0392b'); x.beginPath(); x.moveTo(40, 96); x.lineTo(40, 70); x.arc(50, 70, 10, Math.PI, 0); x.lineTo(60, 96); x.fillStyle = '#5d4037'; x.fill(); } },
    { name: 'Balloon', cat: 'Objects', draw: (x) => { E(x, 50, 38, 28, 34, 0, '#e53935'); P(x, [[46, 72], [54, 72], [50, 78]], '#c62828'); x.strokeStyle = '#555'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(50, 78); x.quadraticCurveTo(40, 88, 52, 98); x.stroke(); E(x, 40, 28, 6, 10, -0.4, 'rgba(255,255,255,0.45)'); } },
    { name: 'Gift', cat: 'Objects', draw: (x) => { RR(x, 16, 40, 68, 54, 3, '#4d8fd1'); RR(x, 12, 30, 76, 14, 3, '#5aa0e0'); RR(x, 44, 30, 12, 64, 0, '#ffd23f'); E(x, 38, 24, 12, 8, 0.4, '#ffd23f'); E(x, 62, 24, 12, 8, -0.4, '#ffd23f'); } },
    { name: 'Crown', cat: 'Objects', draw: (x) => { P(x, [[10, 80], [10, 30], [30, 52], [50, 20], [70, 52], [90, 30], [90, 80]], '#f4c542'); RR(x, 10, 78, 80, 12, 2, '#d9a82b'); for (const [a, b, c] of [[30, 66, '#e53935'], [50, 66, '#1e88e5'], [70, 66, '#43a047']]) C(x, a, b, 5, c); } },
    { name: 'Diamond', cat: 'Objects', draw: (x) => { P(x, [[10, 38], [28, 14], [72, 14], [90, 38], [50, 92]], '#5fd3f3'); P(x, [[10, 38], [90, 38], [50, 92]], '#3fb5d8'); P(x, [[28, 14], [40, 38], [50, 14]], '#a6ecff'); P(x, [[50, 14], [60, 38], [72, 14]], '#a6ecff'); } },
    { name: 'Key', cat: 'Objects', draw: (x) => { x.beginPath(); x.arc(28, 50, 20, 0, T); x.arc(28, 50, 9, 0, T, true); x.fillStyle = '#f4c542'; x.fill('evenodd'); RR(x, 44, 46, 50, 8, 2, '#f4c542'); RR(x, 74, 54, 6, 12, 1, '#f4c542'); RR(x, 86, 54, 6, 16, 1, '#f4c542'); } },
    { name: 'Light Bulb', cat: 'Objects', draw: (x) => { C(x, 50, 40, 28, '#ffe066'); P(x, [[36, 58], [64, 58], [60, 74], [40, 74]], '#ffe066'); RR(x, 38, 74, 24, 16, 3, '#9e9e9e'); x.strokeStyle = '#d4a017'; x.lineWidth = 2; x.beginPath(); x.moveTo(44, 70); x.lineTo(44, 50); x.lineTo(50, 44); x.lineTo(56, 50); x.lineTo(56, 70); x.stroke(); } },
    { name: 'Rocket', cat: 'Objects', draw: (x) => { x.beginPath(); x.moveTo(50, 4); x.quadraticCurveTo(76, 30, 70, 72); x.lineTo(30, 72); x.quadraticCurveTo(24, 30, 50, 4); x.fillStyle = '#eceff1'; x.fill(); C(x, 50, 38, 9, '#4d8fd1'); P(x, [[30, 56], [14, 82], [32, 74]], '#e53935'); P(x, [[70, 56], [86, 82], [68, 74]], '#e53935'); P(x, [[38, 74], [62, 74], [50, 98]], '#ff9f43'); } },
    { name: 'Anchor', cat: 'Objects', draw: (x) => { x.strokeStyle = '#37474f'; x.lineWidth = 8; x.lineCap = 'round'; x.beginPath(); x.arc(50, 16, 8, 0, T); x.moveTo(50, 24); x.lineTo(50, 88); x.moveTo(30, 36); x.lineTo(70, 36); x.stroke(); x.beginPath(); x.arc(50, 56, 34, 0.35, Math.PI - 0.35); x.stroke(); } },
    { name: 'Candle', cat: 'Objects', draw: (x) => { RR(x, 36, 40, 28, 56, 3, '#f5f0e1'); L(x, [[50, 40], [50, 32]], '#333', 2); x.beginPath(); x.moveTo(50, 8); x.quadraticCurveTo(62, 22, 50, 32); x.quadraticCurveTo(38, 22, 50, 8); x.fillStyle = '#ffb300'; x.fill(); E(x, 50, 26, 3, 5, 0, '#fff3c4'); } },
    { name: 'Umbrella', cat: 'Objects', draw: (x) => { x.beginPath(); x.moveTo(6, 50); x.quadraticCurveTo(50, -6, 94, 50); x.closePath(); x.fillStyle = '#e53935'; x.fill(); for (const px of [28, 50, 72]) { x.beginPath(); x.arc(px - 11, 50, 11, Math.PI, 0); x.fillStyle = '#e53935'; x.fill(); } x.strokeStyle = '#5d4037'; x.lineWidth = 4; x.lineCap = 'round'; x.beginPath(); x.moveTo(50, 20); x.lineTo(50, 86); x.arc(42, 86, 8, 0, Math.PI); x.stroke(); } },
    { name: 'Book', cat: 'Objects', draw: (x) => { RR(x, 14, 22, 72, 60, 3, '#1e88e5'); RR(x, 14, 76, 72, 10, 2, '#f5f0e1'); RR(x, 14, 22, 10, 64, 2, '#1565c0'); RR(x, 36, 36, 36, 8, 2, '#ffd23f'); } },
    { name: 'Music Note', cat: 'Objects', draw: (x) => { E(x, 30, 76, 14, 11, -0.4, '#2a2a2a'); E(x, 74, 66, 14, 11, -0.4, '#2a2a2a'); RR(x, 39, 18, 6, 58, 1, '#2a2a2a'); RR(x, 83, 10, 6, 58, 1, '#2a2a2a'); P(x, [[39, 18], [89, 8], [89, 22], [39, 32]], '#2a2a2a'); } },
    { name: 'Lock', cat: 'Objects', draw: (x) => { x.strokeStyle = '#9e9e9e'; x.lineWidth = 8; x.beginPath(); x.arc(50, 40, 18, Math.PI, 0); x.lineTo(68, 48); x.moveTo(32, 48); x.lineTo(32, 40); x.stroke(); RR(x, 22, 46, 56, 44, 6, '#f4c542'); C(x, 50, 64, 6, '#5d4037'); RR(x, 47, 66, 6, 12, 2, '#5d4037'); } },
    { name: 'Bow', cat: 'Objects', draw: (x) => { P(x, [[50, 50], [10, 26], [10, 74]], '#e91e63'); P(x, [[50, 50], [90, 26], [90, 74]], '#e91e63'); P(x, [[46, 54], [34, 92], [44, 88], [50, 58]], '#c2185b'); P(x, [[54, 54], [66, 92], [56, 88], [50, 58]], '#c2185b'); C(x, 50, 50, 9, '#ad1457'); } },
    /* ---- Celebration ---- */
    { name: 'Party Hat', cat: 'Celebration', draw: (x) => { P(x, [[50, 8], [80, 90], [20, 90]], '#7c4dff'); for (const [a, b, c] of [[44, 40, '#ffd23f'], [58, 60, '#3bceac'], [40, 72, '#ff5d73']]) C(x, a, b, 5, c); C(x, 50, 8, 7, '#ffd23f'); RR(x, 16, 86, 68, 8, 4, '#ff9f43'); } },
    { name: 'Firework', cat: 'Celebration', draw: (x) => { const cs = ['#ff5d73', '#ffd23f', '#3bceac', '#4d8fd1', '#c86bfa']; for (let i = 0; i < 16; i++) { const a = (i / 16) * T; L(x, [[50 + Math.cos(a) * 12, 50 + Math.sin(a) * 12], [50 + Math.cos(a) * 40, 50 + Math.sin(a) * 40]], cs[i % 5], 3); C(x, 50 + Math.cos(a) * 45, 50 + Math.sin(a) * 45, 3, cs[i % 5]); } } },
    { name: 'Pumpkin', cat: 'Celebration', draw: (x) => { E(x, 30, 58, 22, 30, 0, '#f57c00'); E(x, 70, 58, 22, 30, 0, '#f57c00'); E(x, 50, 58, 22, 32, 0, '#fb8c00'); RR(x, 46, 18, 8, 14, 2, '#5d4037'); P(x, [[34, 48], [44, 48], [39, 40]], '#3e2723'); P(x, [[56, 48], [66, 48], [61, 40]], '#3e2723'); P(x, [[30, 64], [70, 64], [62, 76], [38, 76]], '#3e2723'); } },
    { name: 'Ghost', cat: 'Celebration', draw: (x) => { x.beginPath(); x.moveTo(20, 92); x.lineTo(20, 44); x.arc(50, 44, 30, Math.PI, 0); x.lineTo(80, 92); for (let i = 0; i < 4; i++) x.quadraticCurveTo(80 - i * 15 - 7.5, 82, 80 - (i + 1) * 15, 92); x.fillStyle = '#f5f5f5'; x.fill(); E(x, 40, 44, 5, 8, 0, '#2a2a2a'); E(x, 60, 44, 5, 8, 0, '#2a2a2a'); E(x, 50, 62, 6, 5, 0, '#2a2a2a'); } },
    { name: 'Snowman', cat: 'Celebration', draw: (x) => { C(x, 50, 74, 22, '#f5f9ff'); C(x, 50, 40, 16, '#f5f9ff'); RR(x, 36, 8, 28, 18, 2, '#263238'); RR(x, 30, 24, 40, 5, 2, '#263238'); C(x, 44, 38, 2.5, '#222'); C(x, 56, 38, 2.5, '#222'); P(x, [[50, 42], [64, 46], [50, 46]], '#ff9800'); for (const y of [66, 76, 86]) C(x, 50, y, 2.5, '#222'); } },
    { name: 'Xmas Tree', cat: 'Celebration', draw: (x) => { RR(x, 44, 82, 12, 14, 2, '#6b4a2f'); P(x, [[50, 8], [80, 44], [20, 44]], '#2e7d32'); P(x, [[50, 26], [86, 66], [14, 66]], '#2e7d32'); P(x, [[50, 44], [92, 86], [8, 86]], '#2e7d32'); STAR(x, 50, 10, 9, 4, 5, '#ffd23f'); for (const [a, b, c] of [[40, 40, '#e53935'], [60, 56, '#4d8fd1'], [36, 70, '#ffd23f'], [66, 78, '#e53935'], [52, 68, '#fff']]) C(x, a, b, 3.5, c); } },
    { name: 'Heart', cat: 'Celebration', draw: (x) => HEART(x, 50, 54, 92, '#e0525a') },
    /* ---- Symbols & shapes ---- */
    { name: 'Smiley', cat: 'Symbols', draw: (x) => { C(x, 50, 50, 44, '#ffd23f'); FACE(x, 50, 50, 70); } },
    { name: 'Speech Bubble', cat: 'Symbols', draw: (x) => { RR(x, 6, 10, 88, 60, 18, '#ffffff'); P(x, [[24, 66], [20, 92], [44, 68]], '#ffffff'); } },
    { name: 'Thought Bubble', cat: 'Symbols', draw: (x) => { for (const [a, b, r] of [[34, 36, 22], [56, 28, 24], [72, 42, 20], [50, 50, 22], [28, 52, 16]]) C(x, a, b, r, '#ffffff'); C(x, 22, 78, 7, '#ffffff'); C(x, 12, 92, 4, '#ffffff'); } },
    { name: 'Burst (POW)', cat: 'Symbols', draw: (x) => { STAR(x, 50, 50, 48, 30, 12, '#ffd23f'); STAR(x, 50, 50, 38, 24, 12, '#ff5d3a', 0.2); } },
    { name: 'Arrow', cat: 'Symbols', draw: (x) => P(x, [[6, 40], [56, 40], [56, 20], [94, 50], [56, 80], [56, 60], [6, 60]], '#4d8fd1') },
    { name: 'Curved Arrow', cat: 'Symbols', draw: (x) => { x.strokeStyle = '#4d8fd1'; x.lineWidth = 10; x.lineCap = 'round'; x.beginPath(); x.arc(46, 60, 30, Math.PI, Math.PI * 1.9); x.stroke(); P(x, [[66, 18], [90, 40], [62, 50]], '#4d8fd1'); } },
    { name: 'Check Mark', cat: 'Symbols', draw: (x) => L(x, [[12, 52], [38, 78], [88, 22]], '#43a047', 14) },
    { name: 'Cross Mark', cat: 'Symbols', draw: (x) => { L(x, [[18, 18], [82, 82]], '#e53935', 14); L(x, [[82, 18], [18, 82]], '#e53935', 14); } },
    { name: 'Exclamation', cat: 'Symbols', draw: (x) => { P(x, [[50, 4], [96, 90], [4, 90]], '#ffd23f'); RR(x, 45, 30, 10, 36, 4, '#2a2a2a'); C(x, 50, 78, 5.5, '#2a2a2a'); } },
    { name: 'Question', cat: 'Symbols', draw: (x) => { C(x, 50, 50, 44, '#4d8fd1'); x.strokeStyle = '#fff'; x.lineWidth = 9; x.lineCap = 'round'; x.beginPath(); x.arc(50, 38, 14, Math.PI * 1.05, Math.PI * 0.45); x.lineTo(50, 60); x.stroke(); C(x, 50, 76, 5.5, '#fff'); } },
    { name: 'Pin', cat: 'Symbols', draw: (x) => { x.beginPath(); x.moveTo(50, 96); x.bezierCurveTo(20, 60, 14, 46, 14, 38); x.arc(50, 38, 36, Math.PI, 0); x.bezierCurveTo(86, 46, 80, 60, 50, 96); x.fillStyle = '#e53935'; x.fill(); C(x, 50, 38, 14, '#fff'); } },
    { name: 'Circle', cat: 'Shapes', draw: (x) => C(x, 50, 50, 46, '#4d8fd1') },
    { name: 'Square', cat: 'Shapes', draw: (x) => RR(x, 6, 6, 88, 88, 6, '#4d8fd1') },
    { name: 'Triangle', cat: 'Shapes', draw: (x) => P(x, [[50, 6], [96, 90], [4, 90]], '#4d8fd1') },
    { name: 'Hexagon', cat: 'Shapes', draw: (x) => { const p = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * T; p.push([50 + Math.cos(a) * 46, 50 + Math.sin(a) * 46]); } P(x, p, '#4d8fd1'); } },
    { name: 'Pentagon', cat: 'Shapes', draw: (x) => { const p = []; for (let i = 0; i < 5; i++) { const a = (i / 5) * T - Math.PI / 2; p.push([50 + Math.cos(a) * 46, 54 + Math.sin(a) * 46]); } P(x, p, '#4d8fd1'); } },
    { name: 'Ring', cat: 'Shapes', draw: (x) => { x.beginPath(); x.arc(50, 50, 46, 0, T); x.arc(50, 50, 30, 0, T, true); x.fillStyle = '#4d8fd1'; x.fill('evenodd'); } },
    { name: 'Crescent', cat: 'Shapes', draw: (x) => { x.beginPath(); x.arc(50, 50, 44, 0, T); x.arc(68, 42, 36, 0, T, true); x.fillStyle = '#4d8fd1'; x.fill('evenodd'); } },
    { name: 'Star Burst', cat: 'Shapes', draw: (x) => STAR(x, 50, 50, 48, 32, 16, '#4d8fd1') },
  ];

  /* ---------- rendering & API ---------- */
  const user = []; // {name, cat:'My Stamps', canvas}
  function find(name) { return user.find((s) => s.name === name) || STAMPS.find((s) => s.name === name) || null; }
  function all() { return user.concat(STAMPS); }
  const cache = new Map();
  // Render a stamp at `size` px (square), mode: 'original' | 'tint' | 'silhouette'.
  function render(name, size, mode, colour) {
    size = Math.max(4, Math.round(size));
    const q = size <= 64 ? size : Math.ceil(size / 8) * 8;
    const key = name + '|' + q + '|' + mode + '|' + (mode === 'original' ? '' : colour);
    let c = cache.get(key);
    if (c) return c;
    const st = find(name);
    if (!st) return null;
    c = U.canvas(q, q);
    const x = U.ctx(c);
    if (st.canvas) {
      const s = Math.min(q / st.canvas.width, q / st.canvas.height);
      x.imageSmoothingQuality = 'high';
      x.drawImage(st.canvas, (q - st.canvas.width * s) / 2, (q - st.canvas.height * s) / 2, st.canvas.width * s, st.canvas.height * s);
    } else {
      x.save(); x.scale(q / 100, q / 100); st.draw(x); x.restore();
    }
    if (mode === 'silhouette') { x.globalCompositeOperation = 'source-in'; x.fillStyle = colour; x.fillRect(0, 0, q, q); }
    else if (mode === 'tint') {
      const t = U.clone(c), tx = U.ctx(t);
      tx.globalCompositeOperation = 'color'; tx.fillStyle = colour; tx.fillRect(0, 0, q, q);
      tx.globalCompositeOperation = 'destination-in'; tx.drawImage(c, 0, 0);
      c = t;
    }
    if (cache.size > 120) cache.clear();
    cache.set(key, c);
    return c;
  }
  function addUser(name, canvas) {
    let n = name, i = 2;
    while (find(n)) n = name + ' ' + i++;
    user.unshift({ name: n, cat: 'My Stamps', canvas, user: true });
    return n;
  }
  function removeUser(name) {
    const i = user.findIndex((s) => s.name === name);
    if (i >= 0) user.splice(i, 1);
    for (const k of Array.from(cache.keys())) if (k.startsWith(name + '|')) cache.delete(k);
  }
  const cats = () => {
    const out = [];
    all().forEach((s) => { if (!out.includes(s.cat)) out.push(s.cat); });
    return out;
  };

  ND.Stamps = { list: STAMPS, all, user, find, render, addUser, removeUser, cats };
})();
