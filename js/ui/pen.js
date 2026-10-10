/* Neon Draw — Pen tool, path commands and vector shape layers.
 * Pen: click = corner point, drag = smooth point, click the first point = close, Enter / Esc = finish,
 * Backspace = delete the last / selected point. Editing: drag points and handles; Alt+click a point
 * toggles corner / smooth; Alt+drag a handle breaks the symmetry; click a segment to add a point;
 * Ctrl+drag moves the whole path. On a vector shape layer the pen edits the shape itself. */
'use strict';
(function () {
  const U = ND.U, App = ND.App, P = ND.Paths;
  const V = () => ND.View;
  const Pen = { building: false, sel: null };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ---------- what is being edited ---------- */
  const shapeLayer = () => { const d = App.doc, L = d && d.active; return L && L.isPixel && L.shapeData ? L : null; };
  Pen.activePath = function () { const d = App.doc; return d.paths.find((p) => p.id === d.activePath) || null; };
  // all paths editable right now: the shape layer's paths, or the active document path
  function editable() {
    const L = shapeLayer();
    if (L) return L.shapeData.paths;
    const p = Pen.activePath();
    return p ? [p] : [];
  }
  function rerender() {
    const L = shapeLayer();
    if (L) { P.renderShape(L.canvas, L.shapeData); L.rev++; App.doc.invalidateAll(); }
    V().request();
  }
  /* ---------- undo ---------- */
  function snapshot() {
    const d = App.doc, L = shapeLayer();
    return L ? { L, data: clone(L.shapeData) } : { paths: clone(d.paths), active: d.activePath };
  }
  function restore(s) {
    const d = App.doc;
    if (s.L) { s.L.shapeData = clone(s.data); P.renderShape(s.L.canvas, s.L.shapeData); s.L.rev++; d.invalidateAll(); } else { d.paths = clone(s.paths); d.activePath = s.active; }
    Pen.sel = null; Pen.building = false;
    App.emit('paths'); V().request();
  }
  function commit(before, label) {
    const d = App.doc, after = snapshot();
    d.history.push({ label, undo: () => restore(before), redo: () => restore(after) });
    App.emit('paths');
  }
  Pen.commit = commit; Pen.snapshot = snapshot;

  /* ---------- pointer ---------- */
  const constrain = (from, p, on) => {
    if (!on || !from) return p;
    const a = Math.round(Math.atan2(p.y - from.y, p.x - from.x) / (Math.PI / 4)) * (Math.PI / 4), r = Math.hypot(p.x - from.x, p.y - from.y);
    return { x: from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r };
  };
  Pen.down = function (e, p) {
    const d = App.doc, z = App.state.view.zoom, tol = 9 / z, paths = editable(), before = snapshot();
    const set = (drag) => { V().drag = Object.assign({ tool: 'x-pen', before, start: p, last: p }, drag); return true; };
    // 1. handles of the selected point
    if (Pen.sel && paths.includes(Pen.sel.path)) {
      const q = Pen.sel.path.nodes[Pen.sel.i];
      if (q) for (const w of ['o', 'i']) { if (Math.hypot(q[w + 'x'] - p.x, q[w + 'y'] - p.y) < tol && (q[w + 'x'] !== q.x || q[w + 'y'] !== q.y)) return set({ mode: 'handle', path: Pen.sel.path, i: Pen.sel.i, w }); }
    }
    // 2. points
    for (const path of paths) {
      for (let i = 0; i < path.nodes.length; i++) {
        const q = path.nodes[i];
        if (Math.hypot(q.x - p.x, q.y - p.y) > tol) continue;
        if (Pen.building && Pen.sel && Pen.sel.path === path && i === 0 && path.nodes.length >= 2) {
          path.closed = true; Pen.building = false; Pen.sel = { path, i: 0 };
          rerender();
          return set({ mode: 'newhandles', path, i: 0, closing: true });
        }
        Pen.sel = { path, i };
        if (e.altKey) {
          const hasHandles = q.ix !== q.x || q.iy !== q.y || q.ox !== q.x || q.oy !== q.y;
          if (hasHandles) { q.ix = q.ox = q.x; q.iy = q.oy = q.y; q.smooth = false; rerender(); commit(before, 'Corner Point'); return set({ mode: 'none' }); }
          return set({ mode: 'newhandles', path, i });
        }
        return set({ mode: 'node', path, i });
      }
    }
    // 3. whole path (Ctrl) or a new point on a segment
    if (!Pen.building) {
      for (const path of paths) {
        const hit = P.nearest(path, p.x, p.y);
        if (hit && hit.dist < tol) {
          if (e.ctrlKey || e.metaKey) return set({ mode: 'path', path });
          const i = P.split(path, hit.seg, hit.t);
          Pen.sel = { path, i };
          rerender();
          return set({ mode: 'node', path, i, added: true });
        }
      }
    }
    // 4. empty space: continue the open path, or start a new one
    let path = Pen.building && Pen.sel ? Pen.sel.path : null;
    if (!path) {
      const L = shapeLayer();
      path = P.create(L ? 'Sub-path' : 'Path ' + (d.paths.length + 1));
      if (L) L.shapeData.paths.push(path);
      else { d.paths.push(path); d.activePath = path.id; }
      Pen.building = true;
    }
    const last = path.nodes[path.nodes.length - 1];
    const q0 = constrain(last, p, e.shiftKey);
    path.nodes.push(P.node(q0.x, q0.y));
    Pen.sel = { path, i: path.nodes.length - 1 };
    rerender();
    return set({ mode: 'newhandles', path, i: Pen.sel.i, adding: true });
  };
  Pen.move = function (e, p) {
    const dr = V().drag;
    if (!dr || dr.tool !== 'x-pen') return;
    const path = dr.path, q = path && path.nodes[dr.i];
    if (dr.mode === 'newhandles' && q) {
      if (Math.hypot(p.x - q.x, p.y - q.y) > 2) {
        const h = constrain(q, p, e.shiftKey);
        q.ox = h.x; q.oy = h.y; q.ix = 2 * q.x - h.x; q.iy = 2 * q.y - h.y; q.smooth = true;
      }
    } else if (dr.mode === 'handle' && q) {
      const h = constrain(q, p, e.shiftKey), w = dr.w, o = w === 'o' ? 'i' : 'o';
      q[w + 'x'] = h.x; q[w + 'y'] = h.y;
      if (e.altKey) q.smooth = false;
      else if (q.smooth) {
        // keep the opposite handle in line (its own length is kept)
        const len = Math.hypot(q[o + 'x'] - q.x, q[o + 'y'] - q.y), a = Math.atan2(q.y - h.y, q.x - h.x);
        q[o + 'x'] = q.x + Math.cos(a) * len; q[o + 'y'] = q.y + Math.sin(a) * len;
      }
    } else if (dr.mode === 'node' && q) {
      const prev = path.nodes[dr.i - 1] || null, t = constrain(prev, p, e.shiftKey), dx = t.x - q.x, dy = t.y - q.y;
      q.x += dx; q.y += dy; q.ix += dx; q.iy += dy; q.ox += dx; q.oy += dy;
    } else if (dr.mode === 'path') {
      P.translate(path, p.x - dr.last.x, p.y - dr.last.y);
    }
    dr.last = p;
    rerender();
  };
  Pen.up = function (dragRec) {
    const dr = dragRec || V().drag;
    if (!dr || dr.mode === 'none') { V().request(); return; }
    const labels = { newhandles: dr.closing ? 'Close Path' : dr.adding ? 'Add Point' : 'Smooth Point', handle: 'Move Handle', node: dr.added ? 'Add Point' : 'Move Point', path: 'Move Path' };
    commit(dr.before, labels[dr.mode] || 'Edit Path');
    V().request();
  };
  // Enter / Esc finish the path, Backspace / Delete remove a point. Returns true when used.
  Pen.key = function (e) {
    const k = e.key;
    if (k === 'Enter' || k === 'Escape') {
      if (!Pen.building && !Pen.sel) return false;
      Pen.building = false; Pen.sel = null; V().request();
      return true;
    }
    if ((k === 'Backspace' || k === 'Delete') && Pen.sel) {
      const before = snapshot(), { path, i } = Pen.sel;
      path.nodes.splice(i, 1);
      if (path.nodes.length < 2) path.closed = false;
      Pen.sel = path.nodes.length ? { path, i: Math.min(i, path.nodes.length - 1) } : null;
      if (!path.nodes.length) Pen.building = false;
      rerender(); commit(before, 'Delete Point');
      return true;
    }
    return false;
  };
  App.on('tool', () => { if (App.state.tool !== 'pen') { Pen.building = false; Pen.sel = null; } });
  App.on('docchange', () => { Pen.building = false; Pen.sel = null; });

  /* ---------- drawing ---------- */
  Pen.overlay = function (cx, lw, zr) {
    if (App.state.tool === 'text' && !V().text) {
      // show the active path faintly so you can click on it to type along it
      const ap = Pen.activePath();
      if (ap) { cx.save(); cx.strokeStyle = '#2ec8ff'; cx.lineWidth = 1.5 * lw; cx.setLineDash([6 * lw, 4 * lw]); cx.beginPath(); P.trace(cx, ap); cx.stroke(); cx.restore(); }
      return;
    }
    if (App.state.tool !== 'pen') return;
    const paths = editable();
    if (!paths.length) return;
    cx.save();
    cx.lineWidth = 1.5 * lw;
    cx.strokeStyle = shapeLayer() ? '#ff5fa2' : '#2ec8ff';
    cx.beginPath();
    paths.forEach((p) => P.trace(cx, p));
    cx.stroke();
    // rubber band to the cursor while drawing
    const c = V().cursor;
    if (Pen.building && Pen.sel && c && c.inside && !V().drag) {
      const q = Pen.sel.path.nodes[Pen.sel.i], m = V().toDoc(c.sx, c.sy);
      if (q) { cx.setLineDash([4 * lw, 4 * lw]); cx.beginPath(); cx.moveTo(q.x, q.y); cx.bezierCurveTo(q.ox, q.oy, m.x, m.y, m.x, m.y); cx.stroke(); cx.setLineDash([]); }
    }
    const s = 3.5 * zr;
    for (const p of paths) {
      p.nodes.forEach((q, i) => {
        const selected = Pen.sel && Pen.sel.path === p && Pen.sel.i === i, near = Pen.sel && Pen.sel.path === p && Math.abs(Pen.sel.i - i) <= 1;
        if (near) {
          cx.strokeStyle = 'rgba(255,255,255,0.8)'; cx.lineWidth = lw;
          for (const w of ['i', 'o']) {
            if (q[w + 'x'] === q.x && q[w + 'y'] === q.y) continue;
            cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(q[w + 'x'], q[w + 'y']); cx.stroke();
            cx.beginPath(); cx.arc(q[w + 'x'], q[w + 'y'], s * 0.9, 0, U.TAU); cx.fillStyle = '#fff'; cx.fill(); cx.strokeStyle = '#222'; cx.stroke(); cx.strokeStyle = 'rgba(255,255,255,0.8)';
          }
        }
        cx.fillStyle = selected ? '#2ec8ff' : i === 0 && Pen.building ? '#ffd166' : '#ffffff';
        cx.strokeStyle = '#111'; cx.lineWidth = lw;
        cx.fillRect(q.x - s, q.y - s, s * 2, s * 2); cx.strokeRect(q.x - s, q.y - s, s * 2, s * 2);
      });
    }
    cx.restore();
  };

  /* ---------- commands ---------- */
  const need = () => { const p = editable(); if (!p.length || !p.some((q) => q.nodes.length > 1)) { App.toast('Draw a path with the Pen tool first'); return null; } return p; };
  App.pathToSelection = function () {
    const p = need(); if (!p) return;
    const d = App.doc;
    d.changeSelection('Path to Selection', ND.Sel.maskFromPath(d, P.toPath2D(p), true));
  };
  App.fillPath = function () {
    const p = need(); if (!p) return;
    const d = App.doc, col = App.state.fg;
    if (!d.canPaint()) return App.blocked();
    d.paintOnActive('Fill Path', (x) => { x.fillStyle = col; x.fill(P.toPath2D(p)); });
  };
  // Stroke with the current brush, optionally fading the pressure in and out like a real pen stroke
  App.strokePath = function () {
    const p = need(); if (!p) return;
    const d = App.doc, st = App.state;
    if (!d.canPaint()) return App.blocked();
    const settings = Object.assign({}, st.brush, { stabilizer: 0 });
    const step = Math.max(0.75, settings.size * Math.max(0.03, settings.spacing || 0.1) * 0.5);
    p.forEach((path) => {
      const pts = P.sample(path, step);
      if (pts.length < 2) return;
      const len = pts[pts.length - 1].d;
      const s = new ND.Brush.Stroke(d, settings, { colour: st.fg, bg: st.bg, eraser: st.eraserMode });
      const pr = (q) => (st.strokePressure ? Math.max(0.12, Math.sin((Math.PI * q.d) / len)) : 1);
      s.begin({ x: pts[0].x, y: pts[0].y, p: pr(pts[0]), t: 0 });
      for (let i = 1; i < pts.length; i++) s.move({ x: pts[i].x, y: pts[i].y, p: pr(pts[i]), t: i * 4 });
      s.end('Stroke Path');
    });
    d.invalidateAll();
    V().request();
  };
  App.pathToShape = function () {
    const p = need(); if (!p) return;
    const d = App.doc, st = App.state, closed = p.some((q) => q.closed);
    const L = d.addLayer('Shape');
    L.shapeData = { paths: clone(p), fill: closed ? st.fg : null, stroke: closed ? null : st.fg, width: Math.max(1, st.shapeWidth || 4), join: 'round' };
    P.renderShape(L.canvas, L.shapeData);
    L.rev++; d.invalidateAll();
    App.setTool('pen');
    App.toast('Vector shape layer — edit its points with the Pen tool; set fill and stroke in the options bar', 3500);
  };
  App.deletePath = function () {
    const d = App.doc, p = Pen.activePath();
    if (!p) return;
    const before = snapshot();
    d.paths = d.paths.filter((q) => q !== p); d.activePath = d.paths.length ? d.paths[d.paths.length - 1].id : null;
    Pen.sel = null; Pen.building = false;
    commit(before, 'Delete Path'); V().request();
  };
  App.toggleClosePath = function () {
    const paths = editable(); if (!paths.length) return;
    const before = snapshot();
    paths.forEach((q) => { q.closed = !q.closed && q.nodes.length > 2; });
    rerender(); commit(before, paths[0].closed ? 'Close Path' : 'Open Path');
  };
  App.setShapeStyle = function (patch) {
    const L = shapeLayer(); if (!L) return;
    const before = snapshot();
    Object.assign(L.shapeData, patch);
    rerender(); commit(before, 'Shape Style');
  };
  App.newPath = function () { Pen.building = false; Pen.sel = null; App.doc.activePath = null; App.emit('paths'); App.setTool('pen'); App.toast('Click to place points, drag for curves'); };

  ND.Pen = Pen;
})();
