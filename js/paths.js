/* Neon Sparks Draw — Bézier paths: geometry, drawing, sampling, hit-testing and editing helpers.
 * A path: { id, name, closed, nodes: [{ x, y, ix, iy, ox, oy, smooth }] }
 *   (ix, iy) = handle coming into the node, (ox, oy) = handle going out (both absolute positions). */
'use strict';
(function () {
  const P = {};
  let seq = 1;
  P.node = (x, y) => ({ x, y, ix: x, iy: y, ox: x, oy: y, smooth: false });
  P.create = (name) => ({ id: 'p' + Date.now().toString(36) + (seq++), name: name || 'Path', closed: false, nodes: [] });
  P.clone = (p) => JSON.parse(JSON.stringify(p));

  // segments as cubic Béziers [p0, c1, c2, p1]
  P.segments = function (path) {
    const n = path.nodes, out = [];
    const last = path.closed ? n.length : n.length - 1;
    for (let i = 0; i < last; i++) {
      const a = n[i], b = n[(i + 1) % n.length];
      out.push([{ x: a.x, y: a.y }, { x: a.ox, y: a.oy }, { x: b.ix, y: b.iy }, { x: b.x, y: b.y }]);
    }
    return out;
  };
  P.trace = function (ctx, path) {
    const n = path.nodes;
    if (!n.length) return;
    ctx.moveTo(n[0].x, n[0].y);
    for (const s of P.segments(path)) ctx.bezierCurveTo(s[1].x, s[1].y, s[2].x, s[2].y, s[3].x, s[3].y);
    if (path.closed) ctx.closePath();
  };
  P.toPath2D = function (paths) {
    const p2 = new Path2D();
    (Array.isArray(paths) ? paths : [paths]).forEach((p) => {
      const n = p.nodes;
      if (!n.length) return;
      p2.moveTo(n[0].x, n[0].y);
      for (const s of P.segments(p)) p2.bezierCurveTo(s[1].x, s[1].y, s[2].x, s[2].y, s[3].x, s[3].y);
      if (p.closed) p2.closePath();
    });
    return p2;
  };
  const bez = (s, t) => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return { x: a * s[0].x + b * s[1].x + c * s[2].x + d * s[3].x, y: a * s[0].y + b * s[1].y + c * s[2].y + d * s[3].y };
  };
  const tangent = (s, t) => {
    const u = 1 - t;
    return { x: 3 * u * u * (s[1].x - s[0].x) + 6 * u * t * (s[2].x - s[1].x) + 3 * t * t * (s[3].x - s[2].x), y: 3 * u * u * (s[1].y - s[0].y) + 6 * u * t * (s[2].y - s[1].y) + 3 * t * t * (s[3].y - s[2].y) };
  };
  P.point = bez;
  // Evenly spaced points along the path (every `step` px), each with its distance and direction.
  P.sample = function (path, step) {
    step = step || 2;
    const out = [];
    let dist = 0, carry = 0, prev = null;
    for (const s of P.segments(path)) {
      // fine pre-sampling, then walk at even spacing
      const N = 64;
      for (let k = 0; k <= N; k++) {
        const t = k / N, q = bez(s, t);
        if (!prev) { out.push({ x: q.x, y: q.y, d: 0, a: Math.atan2(tangent(s, t).y, tangent(s, t).x) }); prev = q; continue; }
        let seg = Math.hypot(q.x - prev.x, q.y - prev.y);
        while (carry + seg >= step) {
          const need = step - carry, f = need / seg;
          const x = prev.x + (q.x - prev.x) * f, y = prev.y + (q.y - prev.y) * f, tg = tangent(s, t);
          dist += step;
          out.push({ x, y, d: dist, a: Math.atan2(tg.y, tg.x) });
          prev = { x, y }; seg -= need; carry = 0;
        }
        carry += seg; prev = q;
      }
    }
    return out;
  };
  P.length = (path) => { const s = P.sample(path, 1); return s.length ? s[s.length - 1].d : 0; };
  // nearest point on the path: { seg, t, x, y, dist }
  P.nearest = function (path, x, y) {
    let best = null;
    P.segments(path).forEach((s, i) => {
      for (let k = 0; k <= 48; k++) {
        const t = k / 48, q = bez(s, t), dd = Math.hypot(q.x - x, q.y - y);
        if (!best || dd < best.dist) best = { seg: i, t, x: q.x, y: q.y, dist: dd };
      }
    });
    return best;
  };
  // Insert a node at parameter t of segment i without changing the shape (de Casteljau split).
  P.split = function (path, i, t) {
    const n = path.nodes, a = n[i], b = n[(i + 1) % n.length];
    const p0 = { x: a.x, y: a.y }, p1 = { x: a.ox, y: a.oy }, p2 = { x: b.ix, y: b.iy }, p3 = { x: b.x, y: b.y };
    const L = (u, v) => ({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t });
    const q0 = L(p0, p1), q1 = L(p1, p2), q2 = L(p2, p3), r0 = L(q0, q1), r1 = L(q1, q2), m = L(r0, r1);
    a.ox = q0.x; a.oy = q0.y; b.ix = q2.x; b.iy = q2.y;
    const nn = { x: m.x, y: m.y, ix: r0.x, iy: r0.y, ox: r1.x, oy: r1.y, smooth: true };
    n.splice(i + 1, 0, nn);
    return i + 1;
  };
  P.bounds = function (path) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of P.sample(path, 4)) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    return x1 < x0 ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  P.translate = function (path, dx, dy) { path.nodes.forEach((q) => { q.x += dx; q.y += dy; q.ix += dx; q.iy += dy; q.ox += dx; q.oy += dy; }); };
  // shapes as paths (used for vector rectangles / ellipses)
  P.rect = function (x, y, w, h) { const p = P.create('Rectangle'); [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].forEach(([a, b]) => p.nodes.push(P.node(a, b))); p.closed = true; return p; };
  P.ellipse = function (cx, cy, rx, ry) {
    const p = P.create('Ellipse'), k = 0.5523;
    [[cx + rx, cy, 0, ry], [cx, cy + ry, -rx, 0], [cx - rx, cy, 0, -ry], [cx, cy - ry, rx, 0]].forEach(([x, y, tx, ty]) => {
      p.nodes.push({ x, y, ix: x - tx * k, iy: y - ty * k, ox: x + tx * k, oy: y + ty * k, smooth: true });
    });
    p.closed = true;
    return p;
  };

  /* ---------- vector shape layers ---------- */
  // shapeData: { paths: [...], fill: '#hex' | null, stroke: '#hex' | null, width, join }
  P.renderShape = function (canvas, sd) {
    const x = ND.U.ctx(canvas);
    x.clearRect(0, 0, canvas.width, canvas.height);
    const p2 = P.toPath2D(sd.paths);
    if (sd.fill) { x.fillStyle = sd.fill; x.fill(p2, 'nonzero'); }
    if (sd.stroke && sd.width > 0) { x.strokeStyle = sd.stroke; x.lineWidth = sd.width; x.lineJoin = sd.join || 'round'; x.lineCap = 'round'; x.stroke(p2); }
  };

  ND.Paths = P;
})();
