/* Neon Sparks Draw — brush engine.
 * A Stroke receives pointer samples, stabilises them, fans them out to symmetry "lanes",
 * spaces dabs along each lane and paints them with the selected engine. */
'use strict';
(function () {
  const U = ND.U;

  const DEFAULTS = {
    engine: 'pixel', size: 24, opacity: 1, flow: 0.9, softness: 0.4, spacing: 0.12, roundness: 1, angle: 0,
    scatter: 0, density: 24, stabilizer: 0.35, symmetry: 'none', symCount: 6,
    pattern: null, patternAngle: 0, patternRandom: 1, patternTint: false,
    pressureSize: true, pressureOpacity: false, pressureCurve: 1, minSize: 0.12,
    tip: 'round', texture: null, textureStrength: 0.6, textureScale: 1, fillPattern: null,
    sizeJitter: 0, opacityJitter: 0, angleJitter: 0, angleMode: 'fixed', hueJitter: 0, satJitter: 0, valJitter: 0,
    taper: 0, speedSize: 0, wetEdges: 0, bleed: 0, bristles: 24, blend: 'normal', variant: 'sketchy',
    hatchAngle: 45, cross: false, pixelPerfect: true, particle: 1, cloneAligned: false, lineWidth: 1,
    taperOut: 0, pressurePts: null, load: 0, dryness: 0, paperResponse: -1, mixMode: 'pigment', wetTime: 8, dualTip: null, dualSize: 0.5, dualCount: 3, splay: 0.5,
    // pen pressure → flow, and each option's own pressure curve ([[pressure, amount], …], as brushes from Krita have)
    pressureFlow: false, sizeCurve: null, opacityCurve: null, flowCurve: null,
    // roundness varying dab to dab, several dabs per step, scatter across the stroke only or both ways
    roundnessJitter: 0, minRoundness: 0.05, count: 1, countJitter: 0, scatterBoth: true,
  };
  // Engines whose dabs are recorded so the end of the stroke can be tapered when the pen lifts.
  const LOGGED = { pixel: 1, airbrush: 1, watercolor: 1, mixer: 1 };
  // Cubic-bezier pressure curve (two control points, like Procreate) → 256-entry table.
  function pressureTable(pts) {
    const [a, b] = pts, lut = new Float32Array(256), bez = (t, p1, p2) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
    let t = 0;
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      while (t < 1 && bez(t, a[0], b[0]) < x) t += 0.002;
      lut[i] = U.clamp(bez(t, a[1], b[1]), 0, 1);
    }
    return lut;
  }
  // A curve through points [[x, y], …] (x = pen pressure 0..1) → 256-entry table (straight lines between points).
  function curveTable(pts) {
    const p = (Array.isArray(pts) ? pts : []).filter((q) => Array.isArray(q) && isFinite(q[0]) && isFinite(q[1])).map((q) => [U.clamp(+q[0], 0, 1), U.clamp(+q[1], 0, 1)]).sort((a, b) => a[0] - b[0]);
    if (p.length < 2) return null;
    const lut = new Float32Array(256);
    let j = 0;
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      while (j < p.length - 2 && x > p[j + 1][0]) j++;
      const a = p[j], b = p[j + 1], t = b[0] > a[0] ? U.clamp((x - a[0]) / (b[0] - a[0]), 0, 1) : 0;
      lut[i] = x <= p[0][0] ? p[0][1] : x >= p[p.length - 1][0] ? p[p.length - 1][1] : a[1] + (b[1] - a[1]) * t;
    }
    return lut;
  }
  // Engines that modify the layer directly instead of painting into the stroke buffer.
  const DIRECT = { smudge: 1, blur: 1, dodge: 1, burn: 1 };
  const ENGINES = [
    { id: 'pixel', label: 'Pixel (dab)' }, { id: 'airbrush', label: 'Airbrush (builds up)' }, { id: 'spray', label: 'Spray' },
    { id: 'watercolor', label: 'Watercolour' }, { id: 'bristle', label: 'Bristle / oil' }, { id: 'mixer', label: 'Colour mixer' },
    { id: 'nib', label: 'Calligraphy nib' }, { id: 'glow', label: 'Glow / neon' }, { id: 'sketchy', label: 'Sketchy (harmony)' },
    { id: 'hatch', label: 'Hatching' }, { id: 'pixelart', label: 'Pixel art (aliased)' }, { id: 'smudge', label: 'Smudge' },
    { id: 'blur', label: 'Blur' }, { id: 'clone', label: 'Clone' }, { id: 'dodge', label: 'Dodge' }, { id: 'burn', label: 'Burn' },
    { id: 'eraser', label: 'Eraser' },
  ];

  function normalise(s) {
    const o = Object.assign({}, DEFAULTS, s || {});
    if (o.engine === 'airbrush' && s && s.flow == null) o.flow = 0.08;
    // old presets used tiling pattern names as dab tips — upgrade them to texture fills
    if (o.pattern && !ND.Patterns.isSprite(o.pattern) && ND.Patterns.isTile(o.pattern)) { o.fillPattern = o.pattern; o.pattern = null; }
    return o;
  }

  function sampleColour(canvas, x, y, r) {
    const x0 = Math.max(0, Math.floor(x - r)), y0 = Math.max(0, Math.floor(y - r));
    const w = Math.min(canvas.width - x0, Math.ceil(r * 2 + 1)), h = Math.min(canvas.height - y0, Math.ceil(r * 2 + 1));
    if (w <= 0 || h <= 0) return null;
    const d = U.ctx(canvas).getImageData(x0, y0, w, h).data;
    let R = 0, G = 0, B = 0, A = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; R += d[i] * a; G += d[i + 1] * a; B += d[i + 2] * a; A += a; n++; }
    if (A <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: R / A, g: G / A, b: B / A, a: A / n / 255 };
  }

  class Stroke {
    /* env: {colour, bg, eraser (bool), paintBg} */
    constructor(doc, settings, env) {
      if (ND.Anim && doc.anim) ND.Anim.autoKey(doc); // animated layer: painting on an empty frame makes a drawing
      this.doc = doc;
      this.s = normalise(settings);
      this.env = env;
      this.colour = env.colour;
      this.rgb = U.hexToRgb(env.colour);
      this.erasing = !!env.eraser || this.s.engine === 'eraser' || !!this.s.erase;
      let eng = this.s.engine;
      if (eng === 'eraser') eng = 'pixel';
      if (this.erasing && (DIRECT[eng] || eng === 'clone')) eng = 'pixel';
      this.engine = eng;
      this.direct = !!DIRECT[eng];
      this.smooth = null;
      this.lanes = [];
      this.bbox = null;
      this.pending = null;
      this.lastRaw = null;
      this.tex = this.s.texture && eng !== 'watercolor' ? ND.Textures.get(this.s.texture) : null;
      // watercolour lays an even wash (dabs merge rather than build up) and "dries" at the end
      this.wcTex = eng === 'watercolor' && this.s.texture ? ND.Textures.get(this.s.texture) : null;
      // the document's paper: its tooth replaces / strengthens the brush grain depending on the medium
      const pp = ND.Paper ? ND.Paper.forStroke(doc, this.s, eng, this.erasing) : null;
      this.paper = pp;
      if (pp) {
        if (eng === 'watercolor') { this.wcTex = pp.tex; this.wcStr = pp.strength; this.wcScale = pp.scale; }
        else if (eng === 'bristle') this.paperBr = pp;
        else if (eng === 'pixel' || eng === 'airbrush' || eng === 'mixer') { this.tex = pp.tex; this.texStr = pp.strength; this.texScale = pp.scale; }
      }
      this.fillTile = this.s.fillPattern && !this.erasing ? ND.Patterns.tileColoured(this.s.fillPattern, this.colour) : null;
      this.sprites = this.s.pattern && !this.erasing ? ND.Patterns.sprites(this.s.pattern) : null;
      this.spriteInfo = this.sprites ? ND.Patterns.spriteInfo(this.s.pattern) : null;
      this.lastTick = 0;
      this.pLUT = this.s.pressurePts ? pressureTable(this.s.pressurePts) : null;
      this.sizeLUT = curveTable(this.s.sizeCurve); this.opLUT = curveTable(this.s.opacityCurve); this.flowLUT = curveTable(this.s.flowCurve);
      this.log = this.s.taperOut > 0 && LOGGED[eng] ? [] : null;
    }

    /* ---------- lifecycle ---------- */
    begin(pt) {
      const doc = this.doc, s = this.s;
      this.surf = doc.surface() || { canvas: doc.active.canvas, node: doc.active, kind: 'pixels' };
      if (this.direct) {
        this.backup = new ND.TileBackup(this.surf.canvas);
      } else {
        const paintBg = this.erasing && this.surf.kind === 'pixels' && doc.isBackgroundLayer(doc.active);
        if (paintBg) {
          this.erasing = false; this.colour = doc.backgroundColor; this.rgb = U.hexToRgb(this.colour); this.fillTile = null; this.sprites = null; this.tex = null;
          // erasing on a paper background brings the paper (with its texture) back
          if (ND.Paper && ND.Paper.hasTexture(doc.paper) && doc.paper.show > 0) { this.fillTile = ND.Paper.tile(doc.paper); this.fillScale = 1; }
        }
        const body = this.engine === 'watercolor' ? U.clamp(s.flow * 3.5, 0.05, 1) : 1;
        doc.beginStroke({ mode: this.erasing ? 'erase' : 'paint', blend: this.erasing ? 'normal' : s.blend || 'normal', opacity: s.opacity * body });
      }
      if (this.engine === 'clone') {
        if (s.cloneAligned && doc.cloneDelta) this.cloneDelta = doc.cloneDelta;
        else this.cloneDelta = { x: pt.x - doc.cloneSource.x, y: pt.y - doc.cloneSource.y };
        doc.cloneDelta = this.cloneDelta;
        // the layer itself doesn't change during the stroke (paint goes to the stroke buffer), so sample it directly
        this.cloneSrc = s.cloneMerged ? U.clone(doc.getProjection()) : this.surf.canvas;
      }
      this.buildLanes();
      this.feed(pt, true);
    }
    move(pt) {
      this.feed(pt, false);
      this.flush();
    }
    // Airbrush: keep spraying while the pen rests.
    tick(now) {
      // smoothing: while the pen slows down or rests, the line keeps catching up with it
      if (this.s.stabilizer > 0 && this.rope && this.lastRaw) {
        const pt = this.stabilise(Object.assign({}, this.lastRaw, { t: now }));
        if (pt) { this.toLanes(pt, false); this.flush(); }
      }
      if (this.engine !== 'airbrush' || !this.smooth) return;
      if (now - this.lastTick < 28) return;
      this.lastTick = now;
      for (const L of this.lanes) if (L.last) this.dispatch(L, L.last, true);
      this.flush();
    }
    end(label) {
      this.flush();
      const doc = this.doc;
      if (this.direct) {
        const r = U.clipRect(this.bbox, doc.width, doc.height);
        if (r) doc.finishDirectEdit(this.surf, this.backup.region(r), r, label, r.x, r.y);
        this.backup = null;
        return;
      }
      if (!this.bbox) { doc.discardStroke(); return; }
      if (this.log && this.log.length > 2) this.replayTaper();
      if (this.engine === 'watercolor') this.dry();
      doc.commitStroke(label);
    }
    cancel() {
      if (this.direct && this.backup) {
        this.backup.restore();
        this.doc.invalidateAll();
      } else this.doc.discardStroke();
    }

    /* ---------- symmetry lanes ---------- */
    buildLanes() {
      const s = this.s, W = this.doc.width, H = this.doc.height, cx = W / 2, cy = H / 2;
      const T = [];
      const id = (p) => p;
      T.push({ f: id, flip: false, rot: 0 });
      if (s.symmetry === 'v' || s.symmetry === 'both') T.push({ f: (p) => ({ x: W - p.x, y: p.y }), flip: true, rot: 0 });
      if (s.symmetry === 'h' || s.symmetry === 'both') T.push({ f: (p) => ({ x: p.x, y: H - p.y }), flip: true, rot: 180 });
      if (s.symmetry === 'both') T.push({ f: (p) => ({ x: W - p.x, y: H - p.y }), flip: false, rot: 180 });
      if (s.symmetry === 'radial' || s.symmetry === 'kaleido') {
        const n = Math.max(2, s.symCount | 0);
        for (let k = 1; k < n; k++) {
          const a = (k / n) * U.TAU, c = Math.cos(a), sn = Math.sin(a);
          T.push({ f: (p) => ({ x: cx + (p.x - cx) * c - (p.y - cy) * sn, y: cy + (p.x - cx) * sn + (p.y - cy) * c }), flip: false, rot: (a * 180) / Math.PI });
        }
        if (s.symmetry === 'kaleido') {
          const base = T.slice();
          for (const t of base) T.push({ f: (p) => { const q = t.f(p); return { x: W - q.x, y: q.y }; }, flip: true, rot: -t.rot });
        }
      }
      this.lanes = T.map((t) => ({ tf: t, last: null, acc: 0, dist: 0, dir: null, vel: 0, state: {} }));
    }

    /* ---------- input → lanes ---------- */
    feed(raw, first) {
      const s = this.s;
      this.lastRaw = raw;
      let pt = raw;
      if (s.stabilizer > 0) {
        pt = this.stabilise(raw);
        if (!pt) return; // the pen is still inside the slack of the "string"
      } else this.smooth = { x: raw.x, y: raw.y };
      this.toLanes(pt, first);
    }
    /* Smoothing: the line eases towards the pen over time. Moving fast, it trails behind (steady, smooth
     * lines); as the pen slows down or rests it catches up (the view's frame ticks keep pulling it in).
     * Lifting the pen just ends the line where it is. Time-based, so it feels the same with any mouse,
     * pen or computer speed; the trailing distance is capped (measured on screen). 100% is very strong. */
    stabilise(raw) {
      const s = Math.min(1, this.s.stabilizer), z = (ND.App && ND.App.state && ND.App.state.view && ND.App.state.view.zoom) || 1;
      const tau = 320 * Math.pow(s, 1.6), maxLag = (170 * Math.pow(s, 1.3)) / z;
      const now = raw.t != null && raw.t > 0 ? raw.t : performance.now();
      if (!this.rope) { this.rope = true; this.smooth = { x: raw.x, y: raw.y }; this.lastT = now; return raw; }
      let dt = now - this.lastT;
      if (!(dt > 0)) dt = 0;
      if (now > this.lastT) this.lastT = now;
      dt = Math.min(dt, 100);
      const k = tau > 0 ? 1 - Math.exp(-dt / tau) : 1, ox = this.smooth.x, oy = this.smooth.y;
      this.smooth.x += (raw.x - this.smooth.x) * k;
      this.smooth.y += (raw.y - this.smooth.y) * k;
      const dx = raw.x - this.smooth.x, dy = raw.y - this.smooth.y, d = Math.hypot(dx, dy);
      if (d > maxLag) { this.smooth.x = raw.x - (dx / d) * maxLag; this.smooth.y = raw.y - (dy / d) * maxLag; }
      if (Math.hypot(this.smooth.x - ox, this.smooth.y - oy) < 0.05) return null;
      return { x: this.smooth.x, y: this.smooth.y, p: raw.p, tx: raw.tx, ty: raw.ty, t: now };
    }
    toLanes(pt, first) {
      for (const L of this.lanes) {
        const q = L.tf.f(pt);
        const lp = { x: q.x, y: q.y, p: pt.p, tx: pt.tx, ty: pt.ty, t: pt.t };
        this.advance(L, lp, first);
      }
    }
    advance(L, pt, first) {
      const s = this.s;
      if (!L.last || first) {
        L.last = pt;
        L.start = pt;
        this.dispatch(L, pt, true);
        return;
      }
      const dx = pt.x - L.last.x, dy = pt.y - L.last.y, d = Math.hypot(dx, dy);
      if (d > 0.01) {
        const a = Math.atan2(dy, dx);
        L.dir = L.dir == null ? a : L.dir + Math.atan2(Math.sin(a - L.dir), Math.cos(a - L.dir)) * 0.35;
        if (pt.t && L.last.t) { const v = d / Math.max(1, pt.t - L.last.t); L.vel = L.vel * 0.8 + v * 0.2; }
      }
      // continuous engines draw segments rather than spaced dabs
      if (this.engine === 'sketchy' || this.engine === 'nib' || this.engine === 'bristle' || this.engine === 'pixelart') {
        if (d < (this.engine === 'pixelart' ? 0.5 : 1)) return;
        L.dist += d;
        this.dispatch(L, pt, false);
        L.last = pt;
        return;
      }
      const size = Math.max(1, s.size * this.sizeFactor(L, pt));
      const step = Math.max(0.4, s.spacing * size);
      let guard = 0, last = L.last;
      while (guard++ < 5000) {
        const ddx = pt.x - last.x, ddy = pt.y - last.y, dd = Math.hypot(ddx, ddy);
        if (dd + L.acc < step) { L.acc += dd; L.last = pt; return; }
        const t = (step - L.acc) / dd;
        const np = { x: last.x + ddx * t, y: last.y + ddy * t, p: last.p + (pt.p - last.p) * t, tx: pt.tx, ty: pt.ty, t: pt.t };
        L.dist += step - L.acc;
        this.dispatch(L, np, false);
        last = np; L.last = np; L.acc = 0;
      }
    }

    /* ---------- dynamics ---------- */
    pressure(pt) {
      const p = U.clamp(pt.p == null ? 1 : pt.p, 0, 1);
      return this.pLUT ? this.pLUT[Math.round(p * 255)] : Math.pow(p, this.s.pressureCurve || 1);
    }
    // raw pen pressure as a table index (for the per-option curves)
    pIndex(pt) { return Math.round(U.clamp(pt.p == null ? 1 : pt.p, 0, 1) * 255); }
    sizeFactor(L, pt) {
      const s = this.s;
      let f = s.pressureSize ? (this.sizeLUT ? Math.max(0.02, this.sizeLUT[this.pIndex(pt)]) : s.minSize + (1 - s.minSize) * this.pressure(pt)) : 1;
      if (s.taper > 0) { const t = U.clamp(L.dist / s.taper, 0, 1); f *= s.minSize + (1 - s.minSize) * Math.sin((t * Math.PI) / 2); }
      if (s.speedSize) f *= U.clamp(1 - s.speedSize * Math.min(1.5, L.vel / 2.5), 0.15, 2);
      return f;
    }
    // pressure on opacity and/or flow, each through its own curve when the brush has one
    alphaFactor(pt) {
      const s = this.s;
      if (!s.pressureOpacity && !s.pressureFlow) return 1;
      let a = 1;
      if (s.pressureOpacity) a *= this.opLUT ? this.opLUT[this.pIndex(pt)] : this.pressure(pt);
      if (s.pressureFlow) a *= this.flowLUT ? this.flowLUT[this.pIndex(pt)] : this.pressure(pt);
      return Math.max(0.03, a);
    }
    dabAngle(L, pt) {
      const s = this.s;
      let a = s.angle;
      if (s.angleMode === 'direction' && L.dir != null) a += (L.dir * 180) / Math.PI;
      else if (s.angleMode === 'random') a += Math.random() * 360;
      else if (s.angleMode === 'tilt' && (pt.tx || pt.ty)) a += (Math.atan2(pt.ty, pt.tx) * 180) / Math.PI;
      else if (L.tf.flip) a = 180 - a + L.tf.rot;
      else a += L.tf.rot;
      if (s.angleJitter) a += (Math.random() - 0.5) * 360 * s.angleJitter;
      return a;
    }
    jitterColour() {
      const s = this.s;
      if (!s.hueJitter && !s.satJitter && !s.valJitter) return this.colour;
      const [r, g, b] = this.rgb;
      let [h, sa, v] = U.rgbToHsv(r, g, b);
      h += (Math.random() - 0.5) * 360 * s.hueJitter;
      sa = U.clamp(sa + (Math.random() - 0.5) * 2 * s.satJitter, 0, 1);
      v = U.clamp(v + (Math.random() - 0.5) * 2 * s.valJitter, 0, 1);
      const c = U.hsvToRgb(h, sa, v).map((q) => Math.round(q / 8) * 8);
      return U.rgbToHex(c[0], c[1], c[2]);
    }

    // Mix a working colour towards another: like paint (pigment, default) or like light (RGB).
    mixCol(cur, to, k) {
      if (k <= 0) return cur;
      if (this.s.mixMode !== 'rgb' && ND.Pigment) return ND.Pigment.mixInto(cur, to, Math.min(1, k));
      cur[0] += (to[0] - cur[0]) * k; cur[1] += (to[1] - cur[1]) * k; cur[2] += (to[2] - cur[2]) * k;
      return cur;
    }

    /* ---------- dispatch ---------- */
    dispatch(L, pt, first) {
      const e = this.engine;
      if (this.direct) { const R = this.s.size * 1.3 + 8; this.backup.save({ x: pt.x - R, y: pt.y - R, w: R * 2, h: R * 2 }); }
      if (e === 'spray') return this.sprayDab(L, pt);
      if (e === 'smudge') return this.smudgeDab(L, pt);
      if (e === 'blur') return this.blurDab(L, pt);
      if (e === 'dodge' || e === 'burn') return this.dodgeBurnDab(L, pt);
      if (e === 'clone') return this.cloneDab(L, pt);
      if (e === 'sketchy') return this.sketchy(L, pt, first);
      if (e === 'nib') return this.nib(L, pt, first);
      if (e === 'bristle') return this.bristle(L, pt, first);
      if (e === 'pixelart') return this.pixelArt(L, pt, first);
      if (e === 'hatch') return this.hatch(L, pt);
      if (e === 'glow') return this.glowDab(L, pt);
      if (e === 'watercolor') return this.waterDab(L, pt);
      if (e === 'mixer') return this.mixerDab(L, pt);
      return this.dab(L, pt);
    }
    target() { return this.direct ? U.ctx(this.surf.canvas) : U.ctx(this.doc.strokeBuffer); }
    touch(x, y, r) {
      const rect = { x: x - r - 2, y: y - r - 2, w: r * 2 + 4, h: r * 2 + 4 };
      this.bbox = U.union(this.bbox, rect);
      this.pending = U.union(this.pending, rect);
      if (this.doc.wrapAround) {
        const W = this.doc.width, H = this.doc.height;
        if (rect.x < 0) this.pending = U.union(this.pending, { x: rect.x + W, y: rect.y, w: rect.w, h: rect.h });
        if (rect.x + rect.w > W) this.pending = U.union(this.pending, { x: rect.x - W, y: rect.y, w: rect.w, h: rect.h });
        if (rect.y < 0) this.pending = U.union(this.pending, { x: rect.x, y: rect.y + H, w: rect.w, h: rect.h });
        if (rect.y + rect.h > H) this.pending = U.union(this.pending, { x: rect.x, y: rect.y - H, w: rect.w, h: rect.h });
        this.bbox = U.union(this.bbox, this.pending);
      }
    }
    flush() {
      if (!this.pending) return;
      if (this.direct) this.doc.invalidate(this.pending);
      else this.doc.strokeTouched(this.pending);
      this.pending = null;
    }
    // Run fn(ctx) for the canvas and, in wrap-around mode, for the copies across each edge.
    wrapped(x, y, r, fn) {
      const ctx = this.target();
      fn(ctx, 0, 0);
      if (!this.doc.wrapAround) return;
      const W = this.doc.width, H = this.doc.height, ox = [0], oy = [0];
      if (x - r < 0) ox.push(W); if (x + r > W) ox.push(-W);
      if (y - r < 0) oy.push(H); if (y + r > H) oy.push(-H);
      for (const a of ox) for (const b of oy) {
        if (!a && !b) continue;
        ctx.save(); ctx.translate(a, b); fn(ctx, a, b); ctx.restore();
      }
    }

    /* ---------- generic dab (tips, textures, patterns) ---------- */
    // Resolve a dab (all randomness decided here) and draw it; logged dabs can be replayed to taper the end.
    // several dabs per step when the brush asks for it (scatter count), each with its own randomness
    dab(L, pt, colourOverride, alphaOverride) {
      const s = this.s;
      let n = 1;
      if (s.count > 1 && alphaOverride == null) n = Math.max(1, Math.round(s.count * (1 - Math.random() * (s.countJitter || 0))));
      for (let i = 0; i < n; i++) this.dabOne(L, pt, colourOverride, alphaOverride);
    }
    dabOne(L, pt, colourOverride, alphaOverride) {
      const s = this.s;
      let size = Math.max(0.5, s.size * this.sizeFactor(L, pt));
      if (s.sizeJitter) size *= 1 + (Math.random() - 0.5) * 2 * s.sizeJitter;
      size = Math.max(0.5, size);
      let alpha = alphaOverride != null ? alphaOverride : Math.min(1, s.flow * this.alphaFactor(pt));
      if (s.opacityJitter) alpha *= 1 - Math.random() * s.opacityJitter;
      let x = pt.x, y = pt.y;
      if (s.scatter > 0) {
        const k = (Math.random() - 0.5) * s.scatter * size * 1.5;
        // across the stroke only (as in Photoshop without "Both axes"), or in both directions
        if (s.scatterBoth === false && L.dir != null) { x -= Math.sin(L.dir) * k; y += Math.cos(L.dir) * k; }
        else { x += k; y += (Math.random() - 0.5) * s.scatter * size * 1.5; }
      }
      const round = s.roundnessJitter ? U.clamp(s.roundness * (1 - Math.random() * s.roundnessJitter), s.minRoundness || 0.05, 1) : s.roundness;
      const D = {
        x, y, size, alpha, round, p: this.pressure(pt), dist: L.dist, lane: L,
        colour: this.erasing ? '#000000' : colourOverride || this.jitterColour(),
        angle: this.dabAngle(L, pt), variant: (Math.random() * ND.Tips.count(s.tip || 'round')) | 0, seed: (Math.random() * 1e9) | 0,
      };
      if (this.sprites) this.resolveSprite(L, D);
      this.drawDab(D);
      if (this.log) this.log.push(D);
    }
    drawDab(D) {
      const s = this.s;
      if (D.spr) return this.drawSprite(D);
      const rd = D.round == null ? s.roundness : D.round;
      const tipC = (s.tip && s.tip !== 'round' && ND.Tips.raster(s.tip, D.variant, D.size, rd, D.angle)) || ND.Tips.round(D.size, s.softness, rd, D.angle); // a missing tip paints round
      if (!tipC) return;
      const W = tipC.width, ox = Math.round((D.x - W / 2) * 4) / 4, oy = Math.round((D.y - W / 2) * 4) / 4;
      let img;
      if (this.tex) img = this.texturedDab(tipC, ox, oy, D.colour, D.alpha, { p: D.p });
      else if (this.fillTile) img = this.patternDab(tipC, ox, oy);
      else img = ND.Tips.tint(tipC, D.colour);
      if (s.dualTip) img = this.dualMask(img, D);
      this.wrapped(D.x, D.y, W / 2, (ctx) => {
        ctx.save();
        ctx.globalAlpha = this.tex ? 1 : D.alpha;
        ctx.drawImage(img, ox, oy);
        ctx.restore();
      });
      this.touch(D.x, D.y, W / 2);
    }
    // Dual brush: the dab only shows where a second, scattered tip lands.
    dualMask(img, D) {
      const s = this.s, W = img.width, r = U.rng(D.seed), m = U.canvas(W, W), mx = U.ctx(m);
      const ds = Math.max(1, D.size * s.dualSize), n = Math.max(1, s.dualCount | 0);
      for (let i = 0; i < n; i++) {
        const t = ND.Tips.raster(s.dualTip, (r() * ND.Tips.count(s.dualTip)) | 0, ds, 1, r() * 360);
        if (!t) continue;
        const a = r() * U.TAU, d = Math.sqrt(r()) * (W / 2) * 0.7;
        mx.drawImage(t, W / 2 + Math.cos(a) * d - t.width / 2, W / 2 + Math.sin(a) * d - t.height / 2);
      }
      const out = U.clone(img), ox2 = U.ctx(out);
      ox2.globalCompositeOperation = 'destination-in';
      ox2.drawImage(m, 0, 0);
      return out;
    }
    // Re-draw the stroke with the last `taperOut` pixels getting thinner, as if the pen lifted gradually.
    replayTaper() {
      const s = this.s, T = s.taperOut, doc = this.doc, log = this.log;
      this.log = null;
      const r = U.clipRect(this.bbox, doc.width, doc.height);
      if (r) U.ctx(doc.strokeBuffer).clearRect(r.x, r.y, r.w, r.h);
      if (this.engine === 'watercolor' || this.engine === 'mixer') {
        // these depend on what was already painted; keep their colours, just resize
      }
      const byLane = new Map();
      for (const D of log) { if (!byLane.has(D.lane)) byLane.set(D.lane, []); byLane.get(D.lane).push(D); }
      for (const list of byLane.values()) {
        const total = list[list.length - 1].dist;
        const f = (D) => {
          const left = total - D.dist;
          if (left >= T) return 1;
          return s.minSize + (1 - s.minSize) * Math.sin((U.clamp(left / T, 0, 1) * Math.PI) / 2);
        };
        let prev = null;
        for (const D of list) {
          const k = f(D), Dn = Object.assign({}, D, { size: Math.max(0.5, D.size * k), alpha: D.alpha * (0.55 + 0.45 * k) });
          if (prev && !D.spr) {
            // fill gaps left by the original (larger) spacing
            const gap = Math.hypot(D.x - prev.x, D.y - prev.y), step = Math.max(0.5, s.spacing * Dn.size);
            const n = Math.min(40, Math.floor(gap / step));
            for (let i = 1; i < n; i++) {
              const t = i / n;
              this.drawDab(Object.assign({}, Dn, { x: prev.x + (D.x - prev.x) * t, y: prev.y + (D.y - prev.y) * t, size: prev.size + (Dn.size - prev.size) * t, seed: D.seed + i }));
            }
          }
          this.drawDab(Dn);
          prev = Dn;
        }
      }
      this.flush();
    }
    texturedDab(tipC, ox, oy, colour, alpha, pt) {
      const s = this.s, tex = this.tex, N = tex.size, D = tipC.width;
      const a = ND.Tips.alpha(tipC), c = U.canvas(D, D), x = U.ctx(c), id = x.createImageData(D, D), d = id.data;
      const [r, g, b] = U.hexToRgb(colour), p = this.pressure(pt), str = this.texStr != null ? this.texStr : s.textureStrength;
      const sc = 1 / Math.max(0.1, this.texScale != null ? this.texScale : s.textureScale);
      const bx = Math.floor(ox), by = Math.floor(oy);
      for (let j = 0; j < D; j++) {
        const ty = ((((by + j) * sc) | 0) % N + N) % N;
        for (let i = 0; i < D; i++) {
          const k = j * D + i, av = a[k];
          if (av <= 0.002) continue;
          const tx = ((((bx + i) * sc) | 0) % N + N) % N;
          const cov = ND.Textures.coverage(tex.data[ty * N + tx], p, str);
          const q = k * 4;
          d[q] = r; d[q + 1] = g; d[q + 2] = b; d[q + 3] = av * cov * alpha * 255;
        }
      }
      x.putImageData(id, 0, 0);
      if (this.fillTile) {
        x.globalCompositeOperation = 'source-in';
        const pat = x.createPattern(this.fillTile, 'repeat');
        if (pat.setTransform) pat.setTransform(new DOMMatrix().translate(-ox, -oy));
        x.fillStyle = pat; x.fillRect(0, 0, D, D);
      }
      return c;
    }
    patternDab(tipC, ox, oy) {
      const D = tipC.width, c = U.canvas(D, D), x = U.ctx(c);
      x.drawImage(tipC, 0, 0);
      x.globalCompositeOperation = 'source-in';
      const pat = x.createPattern(this.fillTile, 'repeat');
      const sc = this.fillScale || this.s.textureScale || 1;
      if (pat.setTransform) pat.setTransform(new DOMMatrix().translate(-ox, -oy).scale(sc));
      x.fillStyle = pat;
      x.fillRect(0, 0, D, D);
      return c;
    }
    resolveSprite(L, D) {
      const s = this.s, info = this.spriteInfo;
      D.spr = (Math.random() * this.sprites.length) | 0;
      const rnd = info.rot === 'upright' ? Math.min(0.08, s.patternRandom * 0.08) : s.patternRandom;
      D.E = D.size * (1 + (Math.random() - 0.5) * 0.6 * rnd);
      let rot = (s.patternAngle * Math.PI) / 180;
      if (info.rot === 'direction' && L.dir != null) rot += L.dir + Math.PI / 2;
      rot += (Math.random() - 0.5) * rnd * Math.PI * 2;
      if (info.rot !== 'direction') rot += ((D.angle - s.angle) * Math.PI) / 180;
      D.rot = rot;
      D.flip = Math.random() < rnd * 0.5;
      D.spr += 1; // 0 means "no sprite"
      D.size0 = D.size;
    }
    drawSprite(D) {
      const s = this.s, info = this.spriteInfo, spr = this.sprites[D.spr - 1], E = D.E * (D.size / Math.max(0.5, D.size0 || D.size));
      let img = spr;
      if (s.patternTint || info.tintable) {
        const t = U.canvas(spr.width, spr.height), tx = U.ctx(t);
        tx.drawImage(spr, 0, 0);
        tx.globalCompositeOperation = info.tintable ? 'source-in' : 'color';
        tx.fillStyle = D.colour; tx.fillRect(0, 0, t.width, t.height);
        if (!info.tintable) { tx.globalCompositeOperation = 'destination-in'; tx.drawImage(spr, 0, 0); }
        img = t;
      }
      this.wrapped(D.x, D.y, E * 0.75, (ctx) => {
        ctx.save();
        ctx.globalAlpha = D.alpha;
        ctx.translate(D.x, D.y);
        ctx.rotate(D.rot);
        if (D.flip) ctx.scale(-1, 1);
        ctx.drawImage(img, -E / 2, -E / 2, E, E);
        ctx.restore();
      });
      this.touch(D.x, D.y, E * 0.75);
    }

    /* ---------- spray ---------- */
    sprayDab(L, pt) {
      const s = this.s, size = Math.max(2, s.size * this.sizeFactor(L, pt));
      const n = Math.max(1, Math.round(s.density * (s.pressureOpacity ? this.pressure(pt) : 1)));
      const dot = Math.max(0.7, (size / 60) * (s.particle || 1));
      const col = this.erasing ? '#000' : this.jitterColour();
      this.wrapped(pt.x, pt.y, size / 2, (ctx) => {
        ctx.save();
        ctx.fillStyle = col;
        ctx.globalAlpha = Math.min(1, s.flow) * 0.5;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * U.TAU, r = (Math.sqrt(Math.random()) * size) / 2;
          const sz = dot * (0.5 + Math.random());
          ctx.fillRect(pt.x + Math.cos(a) * r - sz / 2, pt.y + Math.sin(a) * r - sz / 2, sz, sz);
        }
        ctx.restore();
      });
      this.touch(pt.x, pt.y, size / 2 + 2);
    }

    /* ---------- watercolour ---------- */
    waterDab(L, pt) {
      const s = this.s;
      if (!this.erasing && s.bleed > 0) {
        const smp = sampleColour(this.surf.canvas, pt.x, pt.y, 2);
        const cur = L.state.wc || this.rgb.slice();
        if (smp && smp.a > 0.05) {
          const k = s.bleed * 0.25 * smp.a;
          this.mixCol(cur, [smp.r, smp.g, smp.b], k);
        }
        // slowly reload towards the brush colour
        this.mixCol(cur, this.rgb, 0.04);
        L.state.wc = cur;
        this.dab(L, pt, U.rgbToHex(cur[0], cur[1], cur[2]), this.wetAlpha(pt));
      } else this.dab(L, pt, null, this.wetAlpha(pt));
    }
    wetAlpha(pt) { return this.s.pressureOpacity ? Math.max(0.15, this.pressure(pt)) : 1; }
    // The wash dries: the wet area relaxes into a smooth organic shape, pigment pools at its edge,
    // settles into the paper grain and varies in density.
    dry() {
      const doc = this.doc, s = this.s;
      // absorbent paper lets the wash spread further and feather; hard-sized paper keeps it crisp
      const absorb = this.paper ? this.paper.absorb : 0;
      // wet-in-wet: painting into a wash that hasn't dried yet spreads further and feathers softly
      const wa = doc.wetArea, wetIn = !!(s.wetTime > 0 && wa && performance.now() < wa.until && U.intersect(wa.rect, this.bbox));
      this.wetIn = wetIn;
      const R = Math.max(2, s.size * 0.12 * (1 + absorb * 0.7) * (wetIn ? 2.2 : 1)), pad = Math.ceil(R * 2) + 2;
      const r = U.clipRect({ x: this.bbox.x - pad, y: this.bbox.y - pad, w: this.bbox.w + pad * 2, h: this.bbox.h + pad * 2 }, doc.width, doc.height);
      if (!r || !doc.stroke) return;
      const body = U.clamp(s.flow * 3.5, 0.05, 1), buf = doc.strokeBuffer, bx = U.ctx(buf);
      const region = U.canvas(r.w, r.h);
      U.ctx(region).drawImage(buf, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      const bl = U.ctx(ND.Filters.blurCanvas(region, R)).getImageData(0, 0, r.w, r.h).data;
      const img = bx.getImageData(r.x, r.y, r.w, r.h), d = img.data;
      const tex = this.wcTex, N = ND.Textures.SIZE, str = tex ? (this.wcStr != null ? this.wcStr : s.textureStrength) : 0, sc = 1 / Math.max(0.1, this.wcScale || s.textureScale || 1);
      const noise = this.wcNoise || (this.wcNoise = U.fbm(256, 6, 3, (Math.random() * 1e6) | 0, 0.5));
      const edgeNoise = this.wcEdge || (this.wcEdge = U.fbm(256, 24, 3, (Math.random() * 1e6) | 0, 0.55));
      const wet = s.wetEdges * (this.paper ? 1.3 - absorb * 0.7 : 1) * (wetIn ? 0.35 : 1), bloom = 0.15 + s.bleed * 0.35 + absorb * 0.25 + (wetIn ? 0.35 : 0);
      const ss = (a, b, v) => { const t = U.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
      for (let y = 0; y < r.h; y++) {
        for (let x = 0; x < r.w; x++) {
          const i = (y * r.w + x) * 4, ab = bl[i + 3] / 255;
          if (ab <= 0.01) { d[i + 3] = 0; continue; }
          const gx = x + r.x, gy = y + r.y, a0 = d[i + 3] / 255;
          // organic outline instead of scalloped dab edges
          const en = edgeNoise[(gy & 255) * 256 + (gx & 255)] - 0.5;
          const shape = ss(0.22, 0.5, ab + en * bloom);
          if (shape <= 0) { d[i + 3] = 0; continue; }
          if (a0 < 0.5) { const k = 1 - a0 * 2; d[i] += (bl[i] - d[i]) * k; d[i + 1] += (bl[i + 1] - d[i + 1]) * k; d[i + 2] += (bl[i + 2] - d[i + 2]) * k; }
          let v = shape * body;
          v *= 0.82 + 0.36 * noise[((gy >> 1) & 255) * 256 + ((gx >> 1) & 255)];
          if (tex) { const h = tex.data[((((gy * sc) | 0) % N) + N) % N * N + ((((gx * sc) | 0) % N) + N) % N]; v *= 1 - str * 0.75 * h + str * 0.2; }
          // pigment piles up in the band where the wash thins out
          const rim = shape * (1 - ss(0.32, 0.8, ab));
          v += rim * wet * 1.5 * Math.max(0.4, body);
          d[i + 3] = U.clamp(v, 0, 1) * 255;
        }
      }
      bx.putImageData(img, r.x, r.y);
      doc.stroke.opacity = s.opacity;
      this.bbox = U.union(this.bbox, r);
      doc.strokeTouched(r);
      // this wash stays wet for a while: strokes painted into it soon after blend wet-in-wet
      if (s.wetTime > 0) {
        const now = performance.now(), prev = doc.wetArea && now < doc.wetArea.until ? doc.wetArea.rect : null;
        doc.wetArea = { rect: prev ? U.union(prev, r) : r, until: now + s.wetTime * 1000 };
      }
    }

    /* ---------- colour mixer (paint picks up what is under it) ---------- */
    mixerDab(L, pt) {
      const s = this.s;
      if (this.erasing) return this.dab(L, pt);
      const cur = L.state.mix || this.rgb.slice();
      const layer = sampleColour(this.surf.canvas, pt.x, pt.y, Math.max(1, s.size * 0.15));
      const buf = sampleColour(this.doc.strokeBuffer, pt.x, pt.y, Math.max(1, s.size * 0.15));
      let smp = layer;
      if (buf && buf.a > 0.1 && (!layer || buf.a > layer.a)) smp = buf;
      // paint left on the brush decides how strongly it is reloaded with the brush colour
      const left = s.load > 0 ? Math.max(0.05, Math.exp(-L.dist / s.load)) : 1;
      if (smp && smp.a > 0.05) {
        const k = U.clamp(s.bleed, 0, 1) * smp.a * (0.3 + 0.4 * (1 - left));
        this.mixCol(cur, [smp.r, smp.g, smp.b], k);
      }
      const reload = (1 - U.clamp(s.bleed, 0, 1) * 0.8) * 0.12 * left;
      this.mixCol(cur, this.rgb, reload);
      L.state.mix = cur;
      // when the paint runs out the brush only smears what it picked up
      this.dab(L, pt, U.rgbToHex(cur[0], cur[1], cur[2]), Math.min(1, s.flow * this.alphaFactor(pt) * Math.max(0.15, left)));
    }

    /* ---------- glow ---------- */
    glowDab(L, pt) {
      const s = this.s, size = Math.max(1, s.size * this.sizeFactor(L, pt)), a = Math.min(1, s.flow * this.alphaFactor(pt));
      const col = this.erasing ? '#000000' : this.jitterColour();
      const core = this.erasing ? '#000000' : U.mixHex(col, '#ffffff', 0.75);
      this.wrapped(pt.x, pt.y, size / 2, (ctx) => {
        ctx.save();
        const outer = ND.Tips.tint(ND.Tips.round(size, 1, 1, 0), col);
        ctx.globalAlpha = a * 0.55;
        ctx.drawImage(outer, pt.x - outer.width / 2, pt.y - outer.height / 2);
        const inner = ND.Tips.tint(ND.Tips.round(Math.max(1, size * 0.28), 0.5, 1, 0), core);
        ctx.globalAlpha = a;
        ctx.drawImage(inner, pt.x - inner.width / 2, pt.y - inner.height / 2);
        ctx.restore();
      });
      this.touch(pt.x, pt.y, size / 2 + 2);
    }

    /* ---------- calligraphy nib (ribbon) ---------- */
    nib(L, pt, first) {
      const s = this.s, w = Math.max(0.5, s.size * this.sizeFactor(L, pt));
      const a = ((L.tf.flip ? 180 - s.angle + L.tf.rot : s.angle + L.tf.rot) * Math.PI) / 180;
      const nx = (Math.cos(a) * w) / 2, ny = (Math.sin(a) * w) / 2 * Math.max(0.05, 1);
      const thin = Math.max(0.6, w * (1 - s.roundness) * 0.12 + 0.6);
      const prev = L.state.nib;
      L.state.nib = { x: pt.x, y: pt.y, nx, ny };
      const col = this.erasing ? '#000' : this.colour, alpha = Math.min(1, s.flow * this.alphaFactor(pt));
      if (!prev || first) return;
      this.wrapped(pt.x, pt.y, w, (ctx) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = col;
        ctx.strokeStyle = col;
        ctx.lineWidth = thin;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(prev.x - prev.nx, prev.y - prev.ny);
        ctx.lineTo(prev.x + prev.nx, prev.y + prev.ny);
        ctx.lineTo(pt.x + nx, pt.y + ny);
        ctx.lineTo(pt.x - nx, pt.y - ny);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
      this.touch((pt.x + prev.x) / 2, (pt.y + prev.y) / 2, w / 2 + Math.hypot(pt.x - prev.x, pt.y - prev.y) / 2 + 2);
    }

    /* ---------- bristle / oil ----------
     * Each bristle carries its own paint: it runs out, picks up wet paint it passes through,
     * splays under pressure and wobbles slightly, giving streaky, broken oil-paint marks. */
    bristle(L, pt, first) {
      const s = this.s, size = Math.max(2, s.size * this.sizeFactor(L, pt)), p = this.pressure(pt);
      if (!L.state.br) {
        const n = Math.max(3, s.bristles | 0), arr = [];
        for (let i = 0; i < n; i++) {
          const u = (i / (n - 1) - 0.5) + (Math.random() - 0.5) * (0.9 / n);
          const shade = 1 + (Math.random() - 0.5) * 0.22;
          const decay = 0.2 + Math.random() * 0.7;
          // a bristle never runs completely dry: it settles at a streaky "dry-brush" level instead
          const floor = U.clamp(0.62 - decay * 0.45 - (s.dryness || 0) * 0.3, 0.12, 0.6);
          arr.push({ u, v: (Math.random() - 0.5) * 0.35, w: 0.5 + Math.random() * 1.7, ink: 0.75 + Math.random() * 0.25, decay, floor, shade,
            rgb: [this.rgb[0] * shade, this.rgb[1] * shade, this.rgb[2] * shade], last: null, wob: Math.random() * 10 });
        }
        L.state.br = arr;
      }
      const dir = L.dir == null ? (s.angle * Math.PI) / 180 : L.dir;
      const cx = -Math.sin(dir), cy = Math.cos(dir), fx = Math.cos(dir), fy = Math.sin(dir);
      const seg = L.state.lp ? Math.hypot(pt.x - L.state.lp.x, pt.y - L.state.lp.y) : 0;
      L.state.lp = pt;
      const spread = size * (0.7 + (s.splay || 0) * p * 0.8);
      const thick = Math.max(0.6, (size / Math.max(3, s.bristles)) * 1.7);
      // one read of the paint under the brush for pick-up
      let under = null, ux = 0, uy = 0, uw = 0, uh = 0;
      if (!this.erasing && s.bleed > 0 && !first) {
        ux = Math.max(0, Math.floor(pt.x - spread)); uy = Math.max(0, Math.floor(pt.y - spread));
        uw = Math.min(this.doc.width - ux, Math.ceil(spread * 2)); uh = Math.min(this.doc.height - uy, Math.ceil(spread * 2));
        if (uw > 0 && uh > 0) under = U.ctx(this.surf.canvas).getImageData(ux, uy, uw, uh).data;
      }
      const len = s.load > 0 ? s.load : s.taper > 0 ? s.taper : size * 14;
      const ctx = this.target();
      ctx.save();
      // butt caps: round caps overlap at every joint and leave a beaded, grid-like pattern
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      for (const b of L.state.br) {
        b.wob += seg * 0.05;
        const u = b.u + Math.sin(b.wob) * 0.018 + Math.sin(b.wob * 0.37 + b.shade * 9) * 0.012;
        const bx = pt.x + cx * u * spread + fx * b.v * size * 0.3;
        const by = pt.y + cy * u * spread + fy * b.v * size * 0.3;
        if (b.last && !first) {
          b.ink = b.floor + (b.ink - b.floor) * Math.exp((-seg * b.decay) / Math.max(10, len));
          if (under) {
            const ix = Math.round(bx) - ux, iy = Math.round(by) - uy;
            if (ix >= 0 && iy >= 0 && ix < uw && iy < uh) {
              const k = (iy * uw + ix) * 4, a = under[k + 3] / 255;
              if (a > 0.1) {
                const m = s.bleed * a * (0.35 + 0.4 * (1 - b.ink));
                this.mixCol(b.rgb, [under[k], under[k + 1], under[k + 2]], m);
                b.ink = Math.min(1, b.ink + a * s.bleed * 0.02);
              } else {
                const back = 0.04 * b.ink;
                this.mixCol(b.rgb, [this.rgb[0] * b.shade, this.rgb[1] * b.shade, this.rgb[2] * b.shade], back);
              }
            }
          }
          const a0 = Math.min(1, s.flow * b.ink * (s.pressureOpacity ? Math.max(0.1, p) : 1));
          ctx.strokeStyle = this.erasing ? '#000' : U.rgbToHex(b.rgb[0], b.rgb[1], b.rgb[2]);
          ctx.lineWidth = thick * b.w * (s.pressureSize ? 0.4 + p * 0.6 : 1);
          // long segments are split into short pieces so dry-brush breaks and paper tooth vary along the mark
          const pieces = Math.max(1, Math.min(24, Math.ceil(Math.hypot(bx - b.last.x, by - b.last.y) / 3)));
          for (let k = 0; k < pieces; k++) {
            const t0 = k / pieces, t1 = (k + 1) / pieces;
            const x0 = b.last.x + (bx - b.last.x) * t0, y0 = b.last.y + (by - b.last.y) * t0, x1 = b.last.x + (bx - b.last.x) * t1, y1 = b.last.y + (by - b.last.y) * t1;
            let a = a0;
            // dry-brush breaks: the thinner the paint, the more often a bristle skips
            if (b.ink < 0.5) { b.gap = (b.gap || 0) * 0.7 + (Math.random() < 0.3 + b.ink * 1.3 ? 0 : 0.3); a *= 1 - Math.min(0.85, b.gap * 1.6); }
            if (this.paperBr) a *= this.paperCoverage((x0 + x1) / 2, (y0 + y1) / 2, p); // paint skips the valleys of the paper / canvas
            if (a > 0.01) { ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
          }
        }
        b.last = { x: bx, y: by };
      }
      ctx.restore();
      this.touch(pt.x, pt.y, spread / 2 + size / 2 + seg + 4);
    }

    // how much paint a bristle leaves at (x, y) on the paper's tooth
    paperCoverage(x, y, p) {
      const pp = this.paperBr, N = pp.tex.size, sc = 1 / Math.max(0.1, pp.scale);
      const h = pp.tex.data[((((y * sc) | 0) % N) + N) % N * N + ((((x * sc) | 0) % N) + N) % N];
      return ND.Textures.coverage(h, p, pp.strength);
    }

    /* ---------- sketchy / harmony ---------- */
    sketchy(L, pt, first) {
      const s = this.s, pts = L.state.pts || (L.state.pts = []);
      const reach = Math.max(10, s.size * this.sizeFactor(L, pt) * 2.2), reach2 = reach * reach;
      const col = this.erasing ? '#000' : this.colour, a = Math.min(1, s.flow * this.alphaFactor(pt));
      const prev = pts[pts.length - 1];
      const ctx = this.target();
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(0.5, s.lineWidth || 1);
      ctx.lineCap = 'round';
      if (prev && !first) {
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
      }
      const v = s.variant || 'sketchy';
      const start = Math.max(0, pts.length - 400);
      for (let i = start; i < pts.length; i++) {
        const q = pts[i], dx = q.x - pt.x, dy = q.y - pt.y, d2 = dx * dx + dy * dy;
        if (d2 >= reach2 || Math.random() > (s.density || 24) / 40) continue;
        ctx.beginPath();
        if (v === 'fur') {
          ctx.globalAlpha = a * 0.25;
          ctx.moveTo(pt.x + dx * 0.5, pt.y + dy * 0.5); ctx.lineTo(pt.x - dx * 0.5, pt.y - dy * 0.5);
        } else if (v === 'web') {
          ctx.globalAlpha = a * 0.12;
          ctx.moveTo(pt.x, pt.y); ctx.lineTo(q.x, q.y);
        } else if (v === 'shaded') {
          ctx.globalAlpha = a * (1 - d2 / reach2) * 0.25;
          ctx.moveTo(pt.x, pt.y); ctx.lineTo(q.x, q.y);
        } else {
          ctx.globalAlpha = a * 0.25;
          ctx.moveTo(pt.x + dx * 0.25, pt.y + dy * 0.25); ctx.lineTo(q.x - dx * 0.25, q.y - dy * 0.25);
        }
        ctx.stroke();
      }
      ctx.restore();
      pts.push({ x: pt.x, y: pt.y });
      this.touch(pt.x, pt.y, reach + 2);
    }

    /* ---------- hatching ---------- */
    hatch(L, pt) {
      const s = this.s, len = Math.max(2, s.size * this.sizeFactor(L, pt));
      L.state.n = (L.state.n || 0) + 1;
      const base = ((s.hatchAngle + (L.tf.flip ? -2 * s.hatchAngle : 0) + L.tf.rot) * Math.PI) / 180 + (s.angleJitter ? (Math.random() - 0.5) * s.angleJitter : 0);
      const angles = [base];
      if (s.cross && L.state.n % 2 === 0) angles.push(base + Math.PI / 2);
      const col = this.erasing ? '#000' : this.jitterColour(), a = Math.min(1, s.flow * this.alphaFactor(pt));
      this.wrapped(pt.x, pt.y, len / 2, (ctx) => {
        ctx.save();
        ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(0.5, s.lineWidth || 1);
        for (const ang of angles) {
          const jl = len * (0.75 + Math.random() * 0.25), dx = (Math.cos(ang) * jl) / 2, dy = (Math.sin(ang) * jl) / 2;
          ctx.beginPath(); ctx.moveTo(pt.x - dx, pt.y - dy); ctx.lineTo(pt.x + dx, pt.y + dy); ctx.stroke();
        }
        ctx.restore();
      });
      this.touch(pt.x, pt.y, len / 2 + 2);
    }

    /* ---------- pixel art (aliased) ---------- */
    pixelArt(L, pt, first) {
      const s = this.s, size = Math.max(1, Math.round(s.size * (s.pressureSize ? this.sizeFactor(L, pt) : 1)));
      const col = this.erasing ? '#000' : this.colour;
      const x1 = Math.floor(pt.x), y1 = Math.floor(pt.y);
      const st = L.state;
      const ctx = this.target();
      const plot = (px, py) => {
        const o = Math.floor(size / 2);
        ctx.fillRect(px - o, py - o, size, size);
        this.touch(px, py, size + 1);
        if (size === 1 && s.pixelPerfect) {
          const h = st.hist || (st.hist = []);
          h.push([px, py]);
          if (h.length >= 3) {
            const [a, b, c] = h.slice(-3);
            const corner = (a[0] === b[0] || a[1] === b[1]) && (c[0] === b[0] || c[1] === b[1]) && a[0] !== c[0] && a[1] !== c[1];
            if (corner && !(st.seen && st.seen.has(b[0] + ',' + b[1]))) { ctx.clearRect(b[0], b[1], 1, 1); h.splice(h.length - 2, 1); }
          }
          (st.seen || (st.seen = new Set()));
          if (h.length > 3) { const old = h.shift(); st.seen.add(old[0] + ',' + old[1]); }
        }
      };
      ctx.save();
      ctx.fillStyle = col;
      ctx.globalAlpha = 1;
      if (first || st.px == null) plot(x1, y1);
      else {
        let x0 = st.px, y0 = st.py;
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy, guard = 0;
        while (guard++ < 10000) {
          if (x0 === x1 && y0 === y1) break;
          const e2 = 2 * err;
          if (e2 >= dy) { err += dy; x0 += sx; }
          if (e2 <= dx) { err += dx; y0 += sy; }
          plot(x0, y0);
        }
      }
      ctx.restore();
      st.px = x1; st.py = y1;
    }

    /* ---------- direct-edit engines ---------- */
    smudgeDab(L, pt) {
      const s = this.s, doc = this.doc, size = Math.max(2, s.size * this.sizeFactor(L, pt));
      const st = L.state;
      const x0 = Math.max(0, Math.floor(pt.x - size / 2)), y0 = Math.max(0, Math.floor(pt.y - size / 2));
      const w = Math.min(doc.width - x0, Math.ceil(size)), h = Math.min(doc.height - y0, Math.ceil(size));
      if (w <= 0 || h <= 0) return;
      const mask = ND.Tips.round(size, Math.max(0.3, s.softness), s.roundness, s.angle);
      if (!st.stamp) {
        // pick up paint
        const c = U.canvas(Math.ceil(size), Math.ceil(size));
        U.ctx(c).drawImage(this.surf.canvas, x0, y0, w, h, 0, 0, w, h);
        st.stamp = c;
        return;
      }
      if (Math.abs(st.stamp.width - Math.ceil(size)) > 1) {
        // pressure changed the size: resample the carried paint
        const c = U.canvas(Math.ceil(size), Math.ceil(size));
        U.ctx(c).drawImage(st.stamp, 0, 0, c.width, c.height);
        st.stamp = c;
      }
      const ctx = this.target(), stamp = st.stamp;
      const masked = U.canvas(stamp.width, stamp.height), mx = U.ctx(masked);
      mx.drawImage(stamp, 0, 0);
      mx.globalCompositeOperation = 'destination-in';
      mx.drawImage(mask, (stamp.width - mask.width) / 2, (stamp.height - mask.height) / 2);
      ctx.save();
      ctx.globalAlpha = Math.min(1, s.flow * (s.pressureOpacity ? Math.max(0.1, this.pressure(pt)) : 1));
      ctx.drawImage(masked, pt.x - stamp.width / 2, pt.y - stamp.height / 2);
      ctx.restore();
      // blend the carried paint with what is underneath (keeps the smear going)
      const sx = U.ctx(stamp);
      sx.save();
      sx.globalAlpha = 0.5;
      sx.drawImage(this.surf.canvas, Math.floor(pt.x - stamp.width / 2), Math.floor(pt.y - stamp.height / 2), stamp.width, stamp.height, 0, 0, stamp.width, stamp.height);
      sx.restore();
      this.touch(pt.x, pt.y, size / 2 + 2);
    }
    blurDab(L, pt) {
      const s = this.s, doc = this.doc, size = Math.max(4, s.size * this.sizeFactor(L, pt));
      const pad = Math.ceil(size * 0.3), x0 = Math.max(0, Math.floor(pt.x - size / 2 - pad)), y0 = Math.max(0, Math.floor(pt.y - size / 2 - pad));
      const w = Math.min(doc.width - x0, Math.ceil(size + pad * 2)), h = Math.min(doc.height - y0, Math.ceil(size + pad * 2));
      if (w <= 2 || h <= 2) return;
      const reg = U.canvas(w, h);
      U.ctx(reg).drawImage(this.surf.canvas, x0, y0, w, h, 0, 0, w, h);
      const bl = ND.Filters.blurCanvas(reg, Math.max(1, size * 0.06 * (0.5 + s.flow)));
      const mask = ND.Tips.round(size, Math.max(0.4, s.softness), s.roundness, s.angle), bx = U.ctx(bl);
      bx.globalCompositeOperation = 'destination-in';
      bx.drawImage(mask, pt.x - x0 - mask.width / 2, pt.y - y0 - mask.height / 2);
      const ctx = this.target();
      ctx.save();
      ctx.globalAlpha = Math.min(1, 0.4 + s.flow * 0.6) * this.alphaFactor(pt);
      ctx.drawImage(bl, x0, y0);
      ctx.restore();
      this.touch(pt.x, pt.y, size / 2 + 2);
    }
    dodgeBurnDab(L, pt) {
      const s = this.s, doc = this.doc, dodge = this.engine === 'dodge';
      const d = Math.max(2, s.size * this.sizeFactor(L, pt)), amt = Math.min(1, 0.25 * s.flow * this.alphaFactor(pt)), R = d / 2;
      const x0 = Math.max(0, Math.floor(pt.x - R)), y0 = Math.max(0, Math.floor(pt.y - R));
      const w = Math.min(doc.width - x0, Math.ceil(d)), h = Math.min(doc.height - y0, Math.ceil(d));
      if (w <= 0 || h <= 0) return;
      const ctx = U.ctx(this.surf.canvas), img = ctx.getImageData(x0, y0, w, h), D = img.data, soft = Math.max(0.05, s.softness);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const dist = Math.hypot(i + x0 - pt.x, j + y0 - pt.y) / R;
        if (dist > 1) continue;
        const k = amt * Math.min(1, Math.max(0, (1 - dist) / Math.max(0.05, 1 - soft + 0.05))), q = (j * w + i) * 4;
        if (!D[q + 3]) continue;
        for (let c = 0; c < 3; c++) { const v = D[q + c]; D[q + c] = dodge ? v + (255 - v) * k : v * (1 - k); }
      }
      ctx.putImageData(img, x0, y0);
      this.touch(pt.x, pt.y, R + 2);
    }
    cloneDab(L, pt) {
      const s = this.s, size = Math.max(2, s.size * this.sizeFactor(L, pt));
      const sx = pt.x - this.cloneDelta.x, sy = pt.y - this.cloneDelta.y;
      const D = Math.ceil(size + 4), c = U.canvas(D, D), x = U.ctx(c);
      x.drawImage(this.cloneSrc, sx - D / 2, sy - D / 2, D, D, 0, 0, D, D);
      const mask = ND.Tips.round(size, s.softness, s.roundness, s.angle);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(mask, (D - mask.width) / 2, (D - mask.height) / 2);
      const ctx = this.target();
      ctx.save();
      ctx.globalAlpha = Math.min(1, s.flow * this.alphaFactor(pt));
      ctx.drawImage(c, pt.x - D / 2, pt.y - D / 2);
      ctx.restore();
      this.touch(pt.x, pt.y, D / 2);
      void L;
    }
  }

  /* Render a short S-curve with the given settings — used for preset thumbnails. */
  function previewStroke(settings, w, h, colour) {
    const doc = new ND.Doc(w, h, null);
    const s = normalise(settings);
    const fit = Math.min(s.size, h * 0.42);
    const ps = Object.assign({}, s, { size: fit, stabilizer: 0, symmetry: 'none' });
    if (DIRECT[s.engine] || s.engine === 'clone' || s.engine === 'eraser') {
      // show these on a striped backdrop so the effect is visible
      const x = U.ctx(doc.active.canvas);
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#e35d6a'); g.addColorStop(0.5, '#f2c14e'); g.addColorStop(1, '#4d8fd1');
      x.fillStyle = g; x.fillRect(0, h * 0.3, w, h * 0.4);
      doc.cloneSource = { x: w * 0.3, y: h * 0.5 };
    }
    const st = new Stroke(doc, ps, { colour: colour || '#e8eef7' });
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = 14 + t * (w - 28), y = h / 2 + Math.sin(t * Math.PI * 2) * (h * 0.22);
      const p = Math.sin(t * Math.PI) * 0.85 + 0.15;
      const pt = { x, y, p, t: i * 16 };
      if (i === 0) st.begin(pt); else st.move(pt);
    }
    st.end('preview');
    return doc.getProjection();
  }

  ND.Brush = { DEFAULTS, ENGINES, DIRECT, normalise, Stroke, previewStroke, sampleColour };
})();
