/* Neon Sparks Draw — drawing helpers used by tools: gradients, shapes, text, mesh warping, curves. */
'use strict';
(function () {
  const U = ND.U;
  const R = {};

  /* ---------- gradients ---------- */
  const PRESET_STOPS = {
    rainbow: ['#ff0000', '#ff9900', '#ffee00', '#33cc33', '#0099ff', '#6633cc', '#cc33cc'],
    sunset: ['#2b1055', '#7597de', '#ff7e5f', '#feb47b'],
    ocean: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#caf0f8'],
    fire: ['#000000', '#7a0000', '#e83f00', '#ffb000', '#ffffcc'],
    metal: ['#3a3a3a', '#d9d9d9', '#6e6e6e', '#f2f2f2', '#8a8a8a'],
    neon: ['#ff00cc', '#3333ff', '#00ffee'],
    forest: ['#0b2e13', '#1f6b35', '#7fbf5a', '#e3f0b5'],
    skin: ['#5a3825', '#a86b4a', '#e0a882', '#f6d7c3'],
  };
  R.GRADIENT_PRESETS = PRESET_STOPS;
  // User gradients from the gradient editor: name → [{p: 0..1, c: '#hex', a: 0..1}]
  R.customGradients = {};
  // Stops as [{p, c, a}] for any gradient spec.
  R.gradientStops = function (fg, bg, to) {
    if (Array.isArray(to)) return to;
    if (typeof to === 'string' && to.startsWith('custom:') && R.customGradients[to.slice(7)]) return R.customGradients[to.slice(7)];
    if (to === 'transparent') return [{ p: 0, c: fg, a: 1 }, { p: 1, c: fg, a: 0 }];
    if (PRESET_STOPS[to]) return PRESET_STOPS[to].map((c, i, a) => ({ p: i / (a.length - 1), c, a: 1 }));
    return [{ p: 0, c: fg, a: 1 }, { p: 1, c: bg, a: 1 }];
  };
  // colour lookup table (1024 entries, RGBA)
  R.gradientLUT = function (fg, bg, to, reverse) {
    let stops = R.gradientStops(fg, bg, to).slice().sort((a, b) => a.p - b.p).map((s) => ({ p: s.p, rgba: [...U.hexToRgb(s.c), (s.a == null ? 1 : s.a) * 255] }));
    if (reverse) stops = stops.map((s) => ({ p: 1 - s.p, rgba: s.rgba })).reverse();
    const N = 1024, lut = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      let k = 0;
      while (k < stops.length - 2 && t > stops[k + 1].p) k++;
      const a = stops[k], b = stops[Math.min(k + 1, stops.length - 1)];
      const f = b.p > a.p ? U.clamp((t - a.p) / (b.p - a.p), 0, 1) : t <= a.p ? 0 : 1;
      for (let c = 0; c < 4; c++) lut[i * 4 + c] = a.rgba[c] + (b.rgba[c] - a.rgba[c]) * f;
    }
    return lut;
  };
  R.renderGradient = function (ctx, w, h, p0, p1, o) {
    const lut = R.gradientLUT(o.fg, o.bg, o.to, o.reverse), N = 1024;
    const id = ctx.createImageData(w, h), d = id.data;
    const dx = p1.x - p0.x, dy = p1.y - p0.y, len2 = Math.max(1e-6, dx * dx + dy * dy), len = Math.sqrt(len2);
    const ang0 = Math.atan2(dy, dx);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = x + 0.5 - p0.x, py = y + 0.5 - p0.y;
        let t;
        switch (o.type) {
          case 'radial': t = Math.sqrt(px * px + py * py) / len; break;
          case 'conic': { let a = Math.atan2(py, px) - ang0; a = ((a % U.TAU) + U.TAU) % U.TAU; t = a / U.TAU; break; }
          case 'diamond': { const u = (px * dx + py * dy) / len, v = (-px * dy + py * dx) / len; t = (Math.abs(u) + Math.abs(v)) / len; break; }
          case 'reflected': t = Math.abs((px * dx + py * dy) / len2); break;
          default: t = (px * dx + py * dy) / len2;
        }
        if (o.repeat === 'repeat') t = t - Math.floor(t);
        else if (o.repeat === 'mirror') { t = t % 2; if (t < 0) t += 2; if (t > 1) t = 2 - t; }
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const j = (y * w + x) * 4, q = ((t * (N - 1)) | 0) * 4;
        const dn = o.dither ? Math.random() - 0.5 : 0;
        d[j] = lut[q] + dn; d[j + 1] = lut[q + 1] + dn; d[j + 2] = lut[q + 2] + dn; d[j + 3] = lut[q + 3];
      }
    }
    const c = U.canvas(w, h);
    U.ctx(c).putImageData(id, 0, 0);
    ctx.save();
    ctx.globalAlpha = o.opacity == null ? 1 : o.opacity;
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  };
  R.gradientSwatch = function (to, fg, bg, w, h) {
    const c = U.canvas(w, h), x = U.ctx(c), lut = R.gradientLUT(fg, bg, to, false);
    for (let i = 0; i < w; i++) {
      const k = Math.round((i / (w - 1)) * 1023) * 4;
      x.fillStyle = 'rgba(' + lut[k] + ',' + lut[k + 1] + ',' + lut[k + 2] + ',' + lut[k + 3] / 255 + ')';
      x.fillRect(i, 0, 1, h);
    }
    return c;
  };

  /* ---------- shapes ---------- */
  R.shapePath = function (tool, a, b, o) {
    const p = new Path2D();
    let x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (o.square) { const m = Math.max(w, h); w = h = m; x0 = b.x < a.x ? a.x - m : a.x; y0 = b.y < a.y ? a.y - m : a.y; }
    if (o.center) { x0 = a.x - (o.square ? Math.max(w, h) : w); y0 = a.y - (o.square ? Math.max(w, h) : h); w *= 2; h *= 2; }
    if (tool === 'rect' || tool === 'sel-rect' || tool === 'crop') {
      if (o.radius > 0 && p.roundRect) p.roundRect(x0, y0, w, h, Math.min(o.radius, w / 2, h / 2)); else p.rect(x0, y0, w, h);
    } else if (tool === 'ellipse' || tool === 'sel-ellipse') {
      p.ellipse(x0 + w / 2, y0 + h / 2, Math.max(0.1, w / 2), Math.max(0.1, h / 2), 0, 0, U.TAU);
    } else if (tool === 'polygon') {
      const r = Math.hypot(b.x - a.x, b.y - a.y), rot = Math.atan2(b.y - a.y, b.x - a.x), n = Math.max(3, o.sides | 0);
      const pts = o.star ? n * 2 : n;
      for (let i = 0; i < pts; i++) {
        const ang = rot + (i / pts) * U.TAU, rr = o.star && i % 2 ? r * o.inner : r;
        const px = a.x + Math.cos(ang) * rr, py = a.y + Math.sin(ang) * rr;
        i ? p.lineTo(px, py) : p.moveTo(px, py);
      }
      p.closePath();
    }
    return { path: p, rect: { x: x0, y: y0, w, h } };
  };

  /* ---------- curves ---------- */
  R.catmull = function (pts, seg) {
    seg = seg || 16;
    if (pts.length < 3) return pts.slice();
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < seg; k++) {
        const t = k / seg, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  };

  /* ---------- text ---------- */
  R.fontString = (t) => (t.italic ? 'italic ' : '') + (t.bold ? 'bold ' : '') + t.size + 'px ' + t.font;
  // Draw (possibly multi-line, warped) text with its top-left at (x, y). Returns the bounding box.
  // Word-wrap text to a box width. Returns [{ s, last }] (last = final line of a paragraph).
  R.wrapText = function (ctx, text, width) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      let line = '';
      const push = (s, last) => out.push({ s: s.replace(/\s+$/, ''), last });
      for (const tok of para.split(/(\s+)/)) {
        if (!tok) continue;
        const test = line + tok;
        if (ctx.measureText(test).width <= width || !line.trim()) {
          if (ctx.measureText(test).width > width && !/^\s+$/.test(tok)) {
            // a single word longer than the box: break it into pieces
            let piece = line;
            for (const ch of tok) { if (piece && ctx.measureText(piece + ch).width > width) { push(piece, false); piece = ''; } piece += ch; }
            line = piece;
          } else line = test;
        } else { push(line, false); line = /^\s+$/.test(tok) ? '' : tok; }
      }
      push(line, true);
    }
    return out;
  };
  // Text along a path: glyphs sit on the curve, rotated to follow it.
  function drawOnPath(ctx, t, x, y, colour, measureOnly) {
    const P = ND.Paths, dx = x - (t.px === undefined ? x : t.px), dy = y - (t.py === undefined ? y : t.py);
    const pts = P.sample(t.onPath, 1), b = P.bounds(t.onPath) || { x: 0, y: 0, w: 0, h: 0 }, pad0 = t.size * 1.2;
    if (!measureOnly && pts.length > 1) {
      const txt = String(t.text || '').replace(/\n/g, ' '), chars = [...txt], cw = chars.map((ch) => ctx.measureText(ch).width + (t.spacing || 0));
      const total = cw.reduce((a, c) => a + c, 0), len = pts[pts.length - 1].d, off = ((t.pathOffset || 0) / 100) * len;
      const start = t.align === 'center' ? (len - total) / 2 + off : t.align === 'right' ? len - total - off : off;
      const at = (dd) => pts[U.clamp(Math.round(dd), 0, pts.length - 1)];
      ctx.textBaseline = 'alphabetic';
      if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
      const paint = (how, ox, oy) => {
        let acc = 0;
        for (let k = 0; k < chars.length; k++) {
          const w = cw[k];
          let mid = start + acc + w / 2;
          acc += w;
          if (t.onPath.closed) mid = ((mid % len) + len) % len;
          if (mid < 0 || mid > len || !chars[k].trim()) continue;
          const q = at(mid), a0 = at(mid - 3), a1 = at(mid + 3), ang = Math.atan2(a1.y - a0.y, a1.x - a0.x);
          ctx.save();
          ctx.translate(q.x + dx + ox, q.y + dy + oy);
          ctx.rotate(ang);
          if (how === 'fill') ctx.fillText(chars[k], -(w - (t.spacing || 0)) / 2, -(t.baselineShift || 0)); else ctx.strokeText(chars[k], -(w - (t.spacing || 0)) / 2, -(t.baselineShift || 0));
          ctx.restore();
        }
      };
      if (t.shadow) { ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = '#000'; paint('fill', t.size * 0.06, t.size * 0.08); ctx.restore(); }
      if (t.outline > 0) { ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = t.outline * 2; ctx.strokeStyle = t.outlineColour; paint('stroke', 0, 0); ctx.restore(); }
      ctx.fillStyle = colour; paint('fill', 0, 0);
    }
    ctx.restore();
    // the box (for picking and moving) is the path's bounds grown by the text size; t.x/t.y is its corner
    const tw = b.w + pad0 * 2, th = b.h + pad0 * 2;
    return { x: x - 8, y: y - 8, w: tw + 16, h: th + 16, tw, th };
  }
  // Is point p on this text? Text on a path is only "hit" close to its curve.
  R.textHit = function (ctx, t, p, slack) {
    slack = slack || 8;
    if (t.onPath && t.onPath.nodes && t.onPath.nodes.length > 1 && ND.Paths) {
      const dx = t.x - (t.px === undefined ? t.x : t.px), dy = t.y - (t.py === undefined ? t.y : t.py);
      const n = ND.Paths.nearest(t.onPath, p.x - dx, p.y - dy + (t.baselineShift || 0) + t.size * 0.4);
      return !!n && n.dist < t.size * 0.8 + slack;
    }
    const bb = R.drawText(ctx, t, t.x, t.y, '#000', true);
    return p.x >= t.x - slack && p.y >= t.y - slack && p.x <= t.x + bb.tw + slack && p.y <= t.y + bb.th + slack;
  };
  R.drawText = function (ctx, t, x, y, colour, measureOnly) {
    ctx.save();
    ctx.font = R.fontString(t);
    ctx.textBaseline = 'top';
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = (t.spacing || 0) + 'px';
    if (t.onPath && t.onPath.nodes && t.onPath.nodes.length > 1 && ND.Paths) return drawOnPath(ctx, t, x, y, colour, measureOnly);
    const box = t.boxWidth > 0 ? t.boxWidth : 0;
    const rows = box ? R.wrapText(ctx, t.text, box) : String(t.text || '').split('\n').map((s) => ({ s, last: true }));
    const lines = rows.map((r) => r.s);
    const lh = t.size * (t.lineHeight || 1.2);
    const widths = lines.map((l) => ctx.measureText(l).width);
    const W = box || Math.max(10, ...widths), H = Math.max(lh, lines.length * lh);
    if (!measureOnly) {
      lines.forEach((line, i) => {
        const lw = widths[i], lx = t.align === 'center' ? x + (W - lw) / 2 : t.align === 'right' ? x + W - lw : x, ly = y + i * lh;
        const justify = t.align === 'justify' && box && !rows[i].last && /\s/.test(line.trim());
        const paint = (fn) => {
          if (t.shadow) { ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = '#000'; fn(ctx, 'fill', t.size * 0.06, t.size * 0.08); ctx.restore(); }
          if (t.outline > 0) { ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = t.outline * 2; ctx.strokeStyle = t.outlineColour; fn(ctx, 'stroke', 0, 0); ctx.restore(); }
          ctx.fillStyle = colour; fn(ctx, 'fill', 0, 0);
        };
        if (justify) {
          // spread the spare width evenly between the words
          const words = line.trim().split(/\s+/), ww = words.map((wd) => ctx.measureText(wd).width), gap = (W - ww.reduce((a, b) => a + b, 0)) / (words.length - 1);
          paint((c, how, ox, oy) => { let cxp = x; words.forEach((wd, k) => { if (how === 'fill') c.fillText(wd, cxp + ox, ly + oy); else c.strokeText(wd, cxp + ox, ly + oy); cxp += ww[k] + gap; }); });
        } else if (t.warp === 'none' || !t.amount) {
          paint((c, how, ox, oy) => (how === 'fill' ? c.fillText(line, lx + ox, ly + oy) : c.strokeText(line, lx + ox, ly + oy)));
        } else {
          const chars = [...line], cw = chars.map((ch) => ctx.measureText(ch).width), half = cw.reduce((a, b) => a + b, 0) / 2;
          paint((c, how, ox, oy) => {
            let acc = 0;
            for (let k = 0; k < chars.length; k++) {
              const w = cw[k], mid = acc + w / 2 - half;
              acc += w;
              if (!chars[k].trim()) continue;
              c.save();
              if (t.warp === 'arc') {
                const curv = t.amount * 0.0016, rad = 1 / (Math.abs(curv) < 1e-6 ? 1e-6 : curv), ang = mid / rad;
                c.translate(lx + half + Math.sin(ang) * rad + ox, ly + (1 - Math.cos(ang)) * rad + oy);
                c.rotate(ang);
              } else {
                const amp = (t.amount / 100) * t.size * 0.9, wl = Math.max(20, t.size * 3), ph = (mid / wl) * U.TAU;
                c.translate(lx + half + mid + ox, ly + Math.sin(ph) * amp + oy);
                c.rotate(Math.atan(Math.cos(ph) * amp * (U.TAU / wl)));
              }
              if (how === 'fill') c.fillText(chars[k], -w / 2, 0); else c.strokeText(chars[k], -w / 2, 0);
              c.restore();
            }
          });
        }
      });
    }
    ctx.restore();
    const pad = (t.outline || 0) + Math.abs(t.warp !== 'none' ? t.amount : 0) * 1.2 + t.size * 0.3;
    return { x: x - pad, y: y - pad, w: W + pad * 2, h: H + pad * 2, tw: W, th: H };
  };

  /* ---------- textured triangle mapping (transform warp/distort) ---------- */
  function tri(ctx, img, s0, s1, s2, d0, d1, d2) {
    const den = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
    if (Math.abs(den) < 1e-6) return;
    const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / den;
    const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / den;
    const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / den;
    const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / den;
    const e = d0.x - a * s0.x - c * s0.y, f = d0.y - b * s0.x - d * s0.y;
    // expand the clip triangle slightly to hide seams between neighbours
    const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
    const ex = (p) => { const dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1; return { x: p.x + (dx / l) * 0.7, y: p.y + (dy / l) * 0.7 }; };
    const q0 = ex(d0), q1 = ex(d1), q2 = ex(d2);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.closePath(); ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  // Map image rect (bx,by,bw,bh) onto a grid of control points (gw × gh, row-major) using bilinear patches.
  R.meshDraw = function (ctx, img, src, ctrl, gw, gh, sub) {
    sub = sub || 6;
    const P = (gx, gy) => ctrl[gy * gw + gx];
    const map = (u, v) => {
      // u, v in 0..1 over the whole mesh
      const fx = u * (gw - 1), fy = v * (gh - 1);
      const ix = Math.min(gw - 2, Math.floor(fx)), iy = Math.min(gh - 2, Math.floor(fy)), tx = fx - ix, ty = fy - iy;
      const a = P(ix, iy), b = P(ix + 1, iy), c = P(ix, iy + 1), d = P(ix + 1, iy + 1);
      return { x: (a.x * (1 - tx) + b.x * tx) * (1 - ty) + (c.x * (1 - tx) + d.x * tx) * ty, y: (a.y * (1 - tx) + b.y * tx) * (1 - ty) + (c.y * (1 - tx) + d.y * tx) * ty };
    };
    const n = sub * (Math.max(gw, gh) - 1);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, v0 = j / n, v1 = (j + 1) / n;
      const s = (u, v) => ({ x: src.x + u * src.w, y: src.y + v * src.h });
      const A = map(u0, v0), B = map(u1, v0), C = map(u0, v1), D = map(u1, v1);
      tri(ctx, img, s(u0, v0), s(u1, v0), s(u0, v1), A, B, C);
      tri(ctx, img, s(u1, v0), s(u1, v1), s(u0, v1), B, D, C);
    }
  };

  ND.Render = R;
})();
