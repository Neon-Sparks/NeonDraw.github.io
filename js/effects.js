/* Neon Draw — non-destructive layer effects (layer styles).
 * Computed while compositing, so they follow the layer as you paint, move or mask it. */
'use strict';
(function () {
  const U = ND.U;

  const LABELS = { overlay: 'Colour overlay', inner: 'Inner shadow', stroke: 'Stroke', glow: 'Outer glow', shadow: 'Drop shadow', bevel: 'Bevel & emboss' };
  function defaults() {
    return {
      overlay: { on: false, color: '#ff3d7f', opacity: 1 },
      inner: { on: false, color: '#000000', opacity: 0.5, angle: 120, distance: 6, size: 10 },
      bevel: { on: false, depth: 0.6, size: 8, angle: 120, highlight: '#ffffff', shadow: '#000000' },
      stroke: { on: false, color: '#000000', opacity: 1, size: 4, position: 'outside' },
      glow: { on: false, color: '#ffe066', opacity: 0.8, size: 20, spread: 0.15 },
      shadow: { on: false, color: '#000000', opacity: 0.6, angle: 120, distance: 12, size: 14 },
    };
  }
  function normalise(fx) {
    const d = defaults();
    for (const k in d) d[k] = Object.assign(d[k], fx && fx[k]);
    return d;
  }
  const any = (fx) => !!fx && Object.keys(LABELS).some((k) => fx[k] && fx[k].on);
  function extent(fx) {
    if (!any(fx)) return 0;
    let e = 0;
    if (fx.shadow && fx.shadow.on) e = Math.max(e, fx.shadow.distance + fx.shadow.size * 1.5);
    if (fx.glow && fx.glow.on) e = Math.max(e, fx.glow.size * 1.6);
    if (fx.stroke && fx.stroke.on) e = Math.max(e, fx.stroke.size + 2);
    if (fx.inner && fx.inner.on) e = Math.max(e, fx.inner.distance + fx.inner.size);
    if (fx.bevel && fx.bevel.on) e = Math.max(e, fx.bevel.size * 2);
    return e;
  }
  const offsetOf = (angle, dist) => { const a = (angle * Math.PI) / 180; return { x: -Math.cos(a) * dist, y: Math.sin(a) * dist }; };

  function silhouette(base, r, colour) {
    const c = U.canvas(r.w, r.h), x = U.ctx(c);
    x.drawImage(base, 0, 0, r.w, r.h, 0, 0, r.w, r.h);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = colour; x.fillRect(0, 0, r.w, r.h);
    return c;
  }
  // Inverse silhouette: colour everywhere the base is transparent.
  function inverse(base, r, colour, dx, dy) {
    const c = U.canvas(r.w, r.h), x = U.ctx(c);
    x.fillStyle = colour; x.fillRect(0, 0, r.w, r.h);
    x.globalCompositeOperation = 'destination-out';
    x.drawImage(base, 0, 0, r.w, r.h, dx || 0, dy || 0, r.w, r.h);
    return c;
  }
  // Grow a silhouette by drawing it at offsets on a few concentric rings.
  function dilate(src, size) {
    const c = U.canvas(src.width, src.height), x = U.ctx(c);
    x.drawImage(src, 0, 0);
    if (size <= 0) return c;
    const rings = Math.max(1, Math.ceil(size / 6));
    for (let k = 1; k <= rings; k++) {
      const rad = (size * k) / rings, n = Math.max(8, Math.round(rad * 2.2));
      for (let i = 0; i < n; i++) { const a = (i / n) * U.TAU; x.drawImage(src, Math.cos(a) * rad, Math.sin(a) * rad); }
    }
    return c;
  }
  function blur(src, radius) { return radius > 0.4 ? ND.Filters.blurCanvas(src, radius) : src; }
  function drawWith(bx, src, op, alpha) {
    bx.save();
    bx.globalCompositeOperation = op;
    bx.globalAlpha = alpha;
    bx.drawImage(src, 0, 0);
    bx.restore();
  }

  // Effects painted on top of the layer (inside its shape).
  function inner(doc, bx, base, r, fx) {
    if (fx.overlay && fx.overlay.on) drawWith(bx, silhouette(base, r, fx.overlay.color), 'source-atop', fx.overlay.opacity);
    if (fx.bevel && fx.bevel.on) {
      const b = fx.bevel, o = offsetOf(b.angle, Math.max(1, b.size * 0.5));
      // light side: inverse silhouette shifted away from the light, blurred, kept inside the shape
      const hi = blur(inverse(base, r, b.highlight, o.x, o.y), b.size * 0.5), hx = U.ctx(hi);
      hx.globalCompositeOperation = 'destination-in'; hx.drawImage(base, 0, 0, r.w, r.h, 0, 0, r.w, r.h);
      const sh = blur(inverse(base, r, b.shadow, -o.x, -o.y), b.size * 0.5), sx = U.ctx(sh);
      sx.globalCompositeOperation = 'destination-in'; sx.drawImage(base, 0, 0, r.w, r.h, 0, 0, r.w, r.h);
      drawWith(bx, sh, 'source-atop', Math.min(1, b.depth));
      drawWith(bx, hi, 'source-atop', Math.min(1, b.depth * 0.9));
    }
    if (fx.inner && fx.inner.on) {
      const s = fx.inner, o = offsetOf(s.angle, s.distance);
      const sh = blur(inverse(base, r, s.color, o.x, o.y), s.size / 2), sx = U.ctx(sh);
      sx.globalCompositeOperation = 'destination-in'; sx.drawImage(base, 0, 0, r.w, r.h, 0, 0, r.w, r.h);
      drawWith(bx, sh, 'source-atop', s.opacity);
    }
  }
  // Effects around the layer (painted behind it).
  function outer(doc, bx, base, r, fx) {
    if (fx.stroke && fx.stroke.on) {
      const s = fx.stroke, sil = silhouette(base, r, s.color);
      if (s.position !== 'inside') drawWith(bx, dilate(sil, s.position === 'center' ? s.size / 2 : s.size), 'destination-over', s.opacity);
      if (s.position !== 'outside') {
        const inv = dilate(inverse(base, r, s.color), s.position === 'center' ? s.size / 2 : s.size), ix = U.ctx(inv);
        ix.globalCompositeOperation = 'destination-in'; ix.drawImage(base, 0, 0, r.w, r.h, 0, 0, r.w, r.h);
        drawWith(bx, inv, 'source-atop', s.opacity);
      }
    }
    if (fx.glow && fx.glow.on) {
      const g = fx.glow, sil = silhouette(base, r, g.color);
      drawWith(bx, blur(dilate(sil, g.size * g.spread), Math.max(1, g.size * (1 - g.spread) * 0.6)), 'destination-over', g.opacity);
    }
    if (fx.shadow && fx.shadow.on) {
      const s = fx.shadow, o = offsetOf(s.angle, s.distance), sil = U.canvas(r.w, r.h), x = U.ctx(sil);
      x.drawImage(silhouette(base, r, s.color), o.x, o.y);
      drawWith(bx, blur(sil, s.size / 2), 'destination-over', s.opacity);
    }
  }

  ND.Effects = { LABELS, defaults, normalise, any, extent, inner, outer };
})();
