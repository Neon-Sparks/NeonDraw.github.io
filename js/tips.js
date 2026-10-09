/* Neon Draw — brush tips. Tips are white-on-transparent canvases; colour is applied by tinting. */
'use strict';
(function () {
  const U = ND.U, S = 256, C = S / 2;

  function mk(fn, seed) {
    const c = U.canvas(S, S), x = U.ctx(c), r = U.rng(seed || 1);
    x.fillStyle = '#fff';
    x.strokeStyle = '#fff';
    fn(x, r);
    return c;
  }
  // Fill a blob whose radius is modulated by noise around the circle.
  function blob(x, r, cx, cy, rad, rough, pts) {
    pts = pts || 48;
    const ph = [r() * 6, r() * 6, r() * 6];
    x.beginPath();
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * U.TAU;
      const k = 1 + rough * (Math.sin(a * 3 + ph[0]) * 0.5 + Math.sin(a * 7 + ph[1]) * 0.3 + Math.sin(a * 13 + ph[2]) * 0.2 + (r() - 0.5) * 0.5);
      const px = cx + Math.cos(a) * rad * k, py = cy + Math.sin(a) * rad * k;
      i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.closePath();
    x.fill();
  }
  // Multiply alpha by a function of (x, y, alpha) using pixel access.
  function alphaMap(c, fn) {
    const x = U.ctx(c), id = x.getImageData(0, 0, S, S), d = id.data;
    for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
      const j = (y * S + xx) * 4;
      d[j + 3] = U.clamp(fn(xx, y, d[j + 3] / 255) * 255, 0, 255);
      d[j] = d[j + 1] = d[j + 2] = 255;
    }
    x.putImageData(id, 0, 0);
    return c;
  }
  function softDot(x, cx, cy, rad, a) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, rad, 0, U.TAU); x.fill();
  }

  const DEFS = [
    { id: 'round', label: 'Round (soft/hard)' },
    { id: 'square', label: 'Square', make: () => mk((x) => { x.fillRect(C - 100, C - 100, 200, 200); }) },
    { id: 'pencil', label: 'Pencil grain', make: () => {
      const n = U.fbm(S, 64, 3, 7, 0.6);
      const c = mk((x) => { softDot(x, C, C, 120, 1); x.beginPath(); x.arc(C, C, 90, 0, U.TAU); x.fill(); });
      return alphaMap(c, (px, py, a) => a * U.clamp((n[py * S + px] - 0.25) * 2.2, 0, 1));
    } },
    { id: 'chalk', label: 'Chalk', variants: 4, make: (seed) => {
      const n = U.fbm(S, 32, 4, 20 + seed, 0.6);
      const c = mk((x, r) => blob(x, r, C, C, 108, 0.14, 64), 30 + seed);
      return alphaMap(c, (px, py, a) => a * U.clamp((n[py * S + px] - 0.3) * 2.6, 0, 1));
    } },
    { id: 'charcoal', label: 'Charcoal', variants: 3, make: (seed) => {
      const n = U.fbm(S, 16, 4, 40 + seed, 0.6), r2 = U.rng(50 + seed), streak = new Float32Array(S);
      for (let i = 0; i < S; i++) streak[i] = r2();
      const c = mk((x, r) => { x.save(); x.translate(C, C); x.scale(1, 0.55); blob(x, r, 0, 0, 115, 0.12, 64); x.restore(); }, 60 + seed);
      return alphaMap(c, (px, py, a) => a * U.clamp((n[py * S + px] * 0.6 + streak[px] * 0.6 - 0.35) * 2.2, 0, 1));
    } },
    { id: 'bristle', label: 'Bristle cluster', variants: 3, make: (seed) => mk((x, r) => {
      for (let i = 0; i < 70; i++) {
        const a = r() * U.TAU, d = Math.sqrt(r()) * 104;
        softDot(x, C + Math.cos(a) * d, C + Math.sin(a) * d * 0.45, 6 + r() * 12, 0.5 + r() * 0.5);
      }
    }, 70 + seed) },
    { id: 'flat', label: 'Flat brush', make: () => {
      const r2 = U.rng(81), streak = new Float32Array(S);
      for (let i = 0; i < S; i++) streak[i] = 0.55 + r2() * 0.45;
      const c = mk((x) => { x.beginPath(); x.ellipse(C, C, 118, 36, 0, 0, U.TAU); x.fill(); });
      return alphaMap(c, (px, py, a) => a * streak[px]);
    } },
    { id: 'sponge', label: 'Sponge', variants: 3, make: (seed) => {
      const n = U.fbm(S, 24, 3, 90 + seed, 0.55);
      const c = mk((x, r) => blob(x, r, C, C, 112, 0.1));
      return alphaMap(c, (px, py, a) => a * (n[py * S + px] > 0.48 ? 1 : 0.0));
    } },
    { id: 'splatter', label: 'Splatter', variants: 4, make: (seed) => mk((x, r) => {
      blob(x, r, C, C, 46 + r() * 20, 0.25);
      for (let i = 0; i < 26; i++) {
        const a = r() * U.TAU, d = 50 + r() * 70, rad = 2 + r() * 9;
        x.beginPath(); x.arc(C + Math.cos(a) * d, C + Math.sin(a) * d, rad, 0, U.TAU); x.fill();
      }
    }, 100 + seed) },
    { id: 'rake', label: 'Rake', make: () => mk((x) => { for (let i = 0; i < 7; i++) softDot(x, 22 + i * 35, C, 15, 1); }) },
    { id: 'hair', label: 'Hair strands', variants: 3, make: (seed) => mk((x, r) => {
      x.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        x.lineWidth = 1.5 + r() * 2.5;
        x.globalAlpha = 0.5 + r() * 0.5;
        const y0 = 30 + r() * 196;
        x.beginPath(); x.moveTo(20, y0); x.quadraticCurveTo(C, y0 + (r() - 0.5) * 60, 236, y0 + (r() - 0.5) * 30); x.stroke();
      }
    }, 120 + seed) },
    { id: 'dry', label: 'Dry brush', make: () => {
      const r2 = U.rng(131), streak = new Float32Array(S);
      for (let i = 0; i < S; i++) streak[i] = r2() < 0.35 ? 0 : 0.6 + r2() * 0.4;
      const c = mk((x) => softDot(x, C, C, 124, 1));
      return alphaMap(c, (px, py, a) => Math.min(1, a * 1.6) * streak[py]);
    } },
    { id: 'cloud', label: 'Cloud', variants: 3, make: (seed) => {
      const n = U.fbm(S, 8, 5, 140 + seed, 0.6);
      const c = mk((x) => softDot(x, C, C, 126, 1));
      return alphaMap(c, (px, py, a) => a * U.clamp(n[py * S + px] * 1.6 - 0.2, 0, 1));
    } },
    { id: 'watercolour', label: 'Watercolour blob', variants: 6, make: (seed) => {
      // irregular blob, translucent body with a darker pooled rim
      const c = mk((x, r) => blob(x, r, C, C, 100, 0.16, 72), 150 + seed);
      const sh = ND.Filters.blurCanvas(c, 8);
      const inner = U.ctx(sh).getImageData(0, 0, S, S).data;
      const n = U.fbm(S, 16, 3, 160 + seed, 0.5);
      return alphaMap(c, (px, py, a) => {
        const b = inner[(py * S + px) * 4 + 3] / 255;
        const rim = Math.max(0, a - b * 0.85);
        return a * (0.42 + n[py * S + px] * 0.18) + rim * 0.9;
      });
    } },
    { id: 'gouache', label: 'Gouache', variants: 3, make: (seed) => {
      const n = U.fbm(S, 32, 3, 170 + seed, 0.55);
      const c = mk((x, r) => blob(x, r, C, C, 112, 0.08, 64), 175 + seed);
      return alphaMap(c, (px, py, a) => a * (0.82 + n[py * S + px] * 0.18));
    } },
    { id: 'star', label: 'Star', make: () => mk((x) => {
      x.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * U.TAU - Math.PI / 2, rr = i % 2 ? 46 : 118; x.lineTo(C + Math.cos(a) * rr, C + Math.sin(a) * rr); }
      x.closePath(); x.fill();
    }) },
    { id: 'leaf', label: 'Leaf', make: () => mk((x) => {
      x.beginPath(); x.moveTo(C, 12); x.quadraticCurveTo(232, C, C, 244); x.quadraticCurveTo(24, C, C, 12); x.fill();
    }) },
    { id: 'grass', label: 'Grass blades', variants: 3, make: (seed) => mk((x, r) => {
      for (let i = 0; i < 12; i++) {
        const bx = 30 + r() * 196, h = 120 + r() * 120, lean = (r() - 0.5) * 80;
        x.beginPath(); x.moveTo(bx - 6, 250); x.quadraticCurveTo(bx + lean * 0.3, 250 - h * 0.6, bx + lean, 250 - h); x.quadraticCurveTo(bx + lean * 0.3 + 4, 250 - h * 0.5, bx + 6, 250); x.fill();
      }
    }, 180 + seed) },
    { id: 'triangle', label: 'Triangle', make: () => mk((x) => { x.beginPath(); x.moveTo(C, 20); x.lineTo(236, 226); x.lineTo(20, 226); x.closePath(); x.fill(); }) },
    { id: 'ring', label: 'Ring', make: () => mk((x) => { x.lineWidth = 26; x.beginPath(); x.arc(C, C, 100, 0, U.TAU); x.stroke(); }) },
    { id: 'smoke', label: 'Smoke wisp', variants: 3, make: (seed) => {
      const n = U.fbm(S, 6, 5, 190 + seed, 0.65);
      const c = mk((x) => softDot(x, C, C, 126, 1));
      return alphaMap(c, (px, py, a) => a * Math.pow(U.clamp(Math.sin(n[py * S + px] * 18) * 0.5 + 0.5, 0, 1), 3));
    } },
    { id: 'filbert', label: 'Filbert (oval bristles)', variants: 3, make: (seed) => {
      // an oval of bristle marks with streaky density across the head
      const r2 = U.rng(300 + seed), streak = new Float32Array(S);
      for (let i = 0; i < S; i++) streak[i] = 0.45 + r2() * 0.55;
      const c = mk((x) => { x.beginPath(); x.ellipse(C, C, 70, 112, 0, 0, U.TAU); x.fill(); });
      return alphaMap(c, (px, py, a) => a * streak[px] * (0.75 + 0.25 * Math.sin(py * 0.4 + streak[px] * 9)));
    } },
    { id: 'fan', label: 'Fan brush', variants: 2, make: (seed) => mk((x, r) => {
      x.lineCap = 'round';
      for (let i = 0; i < 34; i++) {
        const a = -Math.PI * 0.42 + (i / 33) * Math.PI * 0.84 + (r() - 0.5) * 0.05, len = 70 + r() * 40;
        x.globalAlpha = 0.45 + r() * 0.55; x.lineWidth = 2 + r() * 3;
        x.beginPath(); x.moveTo(C + Math.sin(a) * 40, C + 60 - Math.cos(a) * 40); x.lineTo(C + Math.sin(a) * (40 + len), C + 60 - Math.cos(a) * (40 + len)); x.stroke();
      }
    }, 320 + seed) },
    { id: 'pastel', label: 'Pastel (side of the stick)', variants: 3, make: (seed) => {
      const n = U.fbm(S, 48, 3, 340 + seed, 0.6), r2 = U.rng(345 + seed), row = new Float32Array(S);
      for (let i = 0; i < S; i++) row[i] = 0.6 + r2() * 0.4;
      const c = mk((x, r) => { x.save(); x.translate(C, C); x.scale(1, 0.34); blob(x, r, 0, 0, 118, 0.06, 64); x.restore(); }, 350 + seed);
      return alphaMap(c, (px, py, a) => a * row[py] * U.clamp((n[py * S + px] - 0.22) * 2.4, 0, 1));
    } },
    { id: 'stipple', label: 'Stipple dots', variants: 3, make: (seed) => mk((x, r) => {
      for (let i = 0; i < 90; i++) { const a = r() * U.TAU, d = Math.sqrt(r()) * 112, rad = 2 + r() * 5; x.globalAlpha = 0.6 + r() * 0.4; x.beginPath(); x.arc(C + Math.cos(a) * d, C + Math.sin(a) * d, rad, 0, U.TAU); x.fill(); }
    }, 360 + seed) },
    { id: 'scratch', label: 'Scratchy (vine charcoal)', variants: 3, make: (seed) => mk((x, r) => {
      x.lineCap = 'round';
      for (let i = 0; i < 40; i++) {
        const y0 = C + (r() - 0.5) * 120, x0 = C - 110 + r() * 40, x1 = C + 70 + r() * 40;
        x.globalAlpha = 0.25 + r() * 0.6; x.lineWidth = 1 + r() * 3.5;
        x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y0 + (r() - 0.5) * 14); x.stroke();
      }
    }, 380 + seed) },
    { id: 'needles', label: 'Pine needles', variants: 3, make: (seed) => mk((x, r) => {
      x.lineCap = 'round';
      for (let i = 0; i < 46; i++) {
        const a = r() * U.TAU, len = 50 + r() * 70;
        x.globalAlpha = 0.5 + r() * 0.5; x.lineWidth = 1.5 + r() * 2;
        x.beginPath(); x.moveTo(C + Math.cos(a) * 8, C + Math.sin(a) * 8); x.lineTo(C + Math.cos(a) * len, C + Math.sin(a) * len); x.stroke();
      }
    }, 400 + seed) },
  ];

  const baseCache = new Map();
  function variants(id) {
    let v = baseCache.get(id);
    if (!v) {
      const d = DEFS.find((q) => q.id === id);
      if (!d || !d.make) return null;
      v = [];
      for (let i = 0; i < (d.variants || 1); i++) v.push(d.make(i));
      baseCache.set(id, v);
    }
    return v;
  }

  // Procedural round tip (soft/hard, elliptical) rendered at the exact size.
  const roundCache = new Map();
  function round(size, softness, roundness, angle) {
    const q = size < 12 ? Math.round(size * 4) / 4 : size < 60 ? Math.round(size) : Math.round(size / 2) * 2;
    const key = q + '|' + softness.toFixed(2) + '|' + roundness.toFixed(2) + '|' + Math.round(angle);
    let c = roundCache.get(key);
    if (c) return c;
    const pad = 2, D = Math.ceil(q + pad * 2);
    c = U.canvas(D, D);
    const x = U.ctx(c);
    x.translate(D / 2, D / 2);
    x.rotate((angle * Math.PI) / 180);
    x.scale(1, Math.max(0.05, roundness));
    const rad = Math.max(0.3, q / 2), hard = U.clamp(1 - softness, 0, 0.995);
    if (softness <= 0.02 && q >= 3) {
      x.fillStyle = '#fff';
      x.beginPath(); x.arc(0, 0, rad, 0, U.TAU); x.fill();
    } else {
      const g = x.createRadialGradient(0, 0, 0, 0, 0, rad);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(hard, 'rgba(255,255,255,1)');
      // smoother falloff than a single linear stop
      const mid = hard + (1 - hard) * 0.5;
      g.addColorStop(mid, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(0, 0, rad, 0, U.TAU); x.fill();
    }
    if (roundCache.size > 400) roundCache.clear();
    roundCache.set(key, c);
    return c;
  }

  // Tinted copies, cached per source canvas.
  const tintCache = new WeakMap();
  function tint(src, colour) {
    let m = tintCache.get(src);
    if (!m) { m = new Map(); tintCache.set(src, m); }
    let c = m.get(colour);
    if (c) return c;
    c = U.canvas(src.width, src.height);
    const x = U.ctx(c);
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = colour;
    x.fillRect(0, 0, c.width, c.height);
    if (m.size > 24) m.clear();
    m.set(colour, c);
    return c;
  }
  // Alpha values of a canvas (0..1), cached.
  const alphaCache = new WeakMap();
  function alpha(c) {
    let a = alphaCache.get(c);
    if (a) return a;
    const d = U.ctx(c).getImageData(0, 0, c.width, c.height).data;
    a = new Float32Array(c.width * c.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
    alphaCache.set(c, a);
    return a;
  }
  // Rasterise a (possibly rotated/scaled) tip at the final dab size so it can be textured per pixel.
  const rasterCache = new Map();
  function raster(id, variant, size, roundness, angle) {
    const v = variants(id);
    if (!v) return null;
    const q = size < 60 ? Math.round(size) : Math.round(size / 3) * 3;
    const key = id + variant + '|' + q + '|' + roundness.toFixed(2) + '|' + Math.round(angle / 3) * 3;
    let c = rasterCache.get(key);
    if (c) return c;
    const D = Math.max(2, Math.ceil(q * 1.05) + 2);
    c = U.canvas(D, D);
    const x = U.ctx(c);
    x.translate(D / 2, D / 2);
    x.rotate((angle * Math.PI) / 180);
    x.scale(1, Math.max(0.05, roundness));
    x.imageSmoothingQuality = 'high';
    x.drawImage(v[variant % v.length], -q / 2, -q / 2, q, q);
    if (rasterCache.size > 300) rasterCache.clear();
    rasterCache.set(key, c);
    return c;
  }
  function preview(id, size) {
    const c = U.canvas(size, size), x = U.ctx(c);
    const src = id === 'round' ? round(size * 0.8, 0.3, 1, 0) : variants(id)[0];
    x.drawImage(src, (size - (id === 'round' ? src.width : size * 0.9)) / 2, (size - (id === 'round' ? src.height : size * 0.9)) / 2, id === 'round' ? src.width : size * 0.9, id === 'round' ? src.height : size * 0.9);
    return c;
  }

  /* User tips: dark areas (or opaque areas of a transparent image) become paint. */
  function addUser(id, label, img) {
    const c = U.canvas(S, S), x = U.ctx(c), s = Math.min((S - 8) / img.width, (S - 8) / img.height);
    x.drawImage(img, (S - img.width * s) / 2, (S - img.height * s) / 2, img.width * s, img.height * s);
    const d = x.getImageData(0, 0, S, S), p = d.data;
    let transparent = false;
    for (let i = 3; i < p.length; i += 4) if (p[i] < 250) { transparent = true; break; }
    for (let i = 0; i < p.length; i += 4) {
      const a = p[i + 3] / 255, l = U.luma(p[i], p[i + 1], p[i + 2]) / 255;
      p[i + 3] = 255 * (transparent ? a : 1 - l) * (transparent ? 1 : 1);
      p[i] = p[i + 1] = p[i + 2] = 255;
    }
    x.putImageData(d, 0, 0);
    const def = { id, label, user: true, make: () => c, canvas: c };
    const i = DEFS.findIndex((q) => q.id === id);
    if (i >= 0) DEFS.splice(i, 1, def); else DEFS.push(def);
    baseCache.delete(id);
    for (const k of Array.from(rasterCache.keys())) if (k.startsWith(id)) rasterCache.delete(k);
    ND.Tips.list = DEFS.map((q) => ({ id: q.id, label: q.label, user: !!q.user }));
    return def;
  }
  function removeUser(id) {
    const i = DEFS.findIndex((q) => q.id === id && q.user);
    if (i >= 0) DEFS.splice(i, 1);
    baseCache.delete(id);
    ND.Tips.list = DEFS.map((q) => ({ id: q.id, label: q.label, user: !!q.user }));
  }

  ND.Tips = {
    addUser, removeUser, userTips: () => DEFS.filter((q) => q.user),
    list: DEFS.map((d) => ({ id: d.id, label: d.label })),
    variants, round, tint, alpha, raster, preview,
    count: (id) => { const d = DEFS.find((q) => q.id === id); return d ? d.variants || 1 : 1; },
  };
})();
