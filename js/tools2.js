/* Neon Draw — retouch tools (spot heal, patch, red-eye, liquify), perspective & ruler assistants,
 * rulers + guides with snapping, and the quick-mask overlay. Hooked into viewport.js. */
'use strict';
(function () {
  const U = ND.U, App = ND.App;
  const T = {};
  const V = () => ND.View;
  const RULER = 18;

  /* ---------------- snapping ---------------- */
  T.snap = function (p) {
    const st = App.state, d = App.doc, z = st.view.zoom, tol = 8 / z;
    let x = p.x, y = p.y;
    if (st.snapGuides) {
      for (const g of d.guides) {
        if (g.axis === 'x' && Math.abs(x - g.pos) < tol) x = g.pos;
        if (g.axis === 'y' && Math.abs(y - g.pos) < tol) y = g.pos;
      }
      for (const v of [0, d.width]) if (Math.abs(x - v) < tol) x = v;
      for (const v of [0, d.height]) if (Math.abs(y - v) < tol) y = v;
    }
    if (st.grid && st.snapGuides) {
      const gs = st.gridSize, gx = Math.round(x / gs) * gs, gy = Math.round(y / gs) * gs;
      if (Math.abs(x - gx) < tol) x = gx;
      if (Math.abs(y - gy) < tol) y = gy;
    }
    return Object.assign({}, p, { x, y });
  };

  /* ---------------- assistants ---------------- */
  T.addPerspective = function (kind) {
    const d = App.doc, W = d.width, H = d.height, hy = H * 0.42;
    const list = kind === 1 ? [{ type: 'vp', x: W / 2, y: hy }]
      : kind === 2 ? [{ type: 'vp', x: -W * 0.25, y: hy }, { type: 'vp', x: W * 1.25, y: hy }]
        : [{ type: 'vp', x: -W * 0.2, y: hy }, { type: 'vp', x: W * 1.2, y: hy }, { type: 'vp', x: W / 2, y: H * 2.2 }];
    if (kind === 1 || kind === 2) list.push({ type: 'parallel', a: { x: W / 2, y: H * 0.2 }, b: { x: W / 2, y: H * 0.8 } });
    if (kind === 1) list.push({ type: 'parallel', a: { x: W * 0.2, y: H * 0.85 }, b: { x: W * 0.8, y: H * 0.85 } });
    setAssistants(d.assistants.concat(list), 'Perspective Assistant');
    App.set('showAssist', true);
    App.setTool('assist');
    App.toast(kind + '-point perspective added — drag the handles to place it. Brush strokes snap to it; use the bar at the top right to hide or remove it.', 4500);
  };
  function setAssistants(list, label) {
    const d = App.doc, before = d.assistants, after = list;
    d.assistants = after;
    d.history.push({ label: label || 'Assistants', undo: () => { d.assistants = before; V().request(); }, redo: () => { d.assistants = after; V().request(); } });
    V().request();
  }
  T.clearAssistants = () => { setAssistants([], 'Clear Assistants'); App.toast('Perspective guides removed'); };

  /* Floating bar so perspective guides can always be found, hidden or removed. */
  T.buildBar = function (vp) {
    const C = ND.C, bar = U.h('div.nd-assistbar');
    const label = U.h('span', ND.icon('assist', 15), U.h('b', ' Perspective'));
    const edit = C.button('Edit', () => App.setTool('assist'), { cls: 'sm', title: 'Move the vanishing points' });
    const snap = C.button('Snap', () => App.set('snapAssist', !App.state.snapAssist), { cls: 'sm', title: 'Brush strokes follow the perspective lines' });
    const show = C.button('Hide', () => { App.set('showAssist', !App.state.showAssist); if (!App.state.showAssist && App.state.tool === 'assist') App.setTool('brush'); }, { cls: 'sm' });
    const del = C.button('Remove', () => T.clearAssistants(), { cls: 'sm', title: 'Delete all perspective guides (undoable)' });
    bar.append(label, edit, snap, show, del);
    vp.appendChild(bar);
    const refresh = () => {
      const d = App.doc, st = App.state;
      bar.style.display = d && d.assistants.length ? 'flex' : 'none';
      snap.classList.toggle('active', !!st.snapAssist);
      show.lastChild.textContent = st.showAssist ? 'Hide' : 'Show';
      edit.classList.toggle('active', st.tool === 'assist');
      V().request();
    };
    ['state', 'tool', 'doc', 'docchange'].forEach((e) => App.on(e, refresh));
    // editing hidden guides makes no sense: picking the edit tool shows them
    App.on('tool', () => { if (App.state.tool === 'assist' && !App.state.showAssist) App.set('showAssist', true); });
    refresh();
  };
  function handles(a) { return a.type === 'vp' ? [a] : [a.a, a.b]; }
  // Brush strokes: decide a direction from the first few pixels, then project onto it.
  T.beginConstraint = function (p) {
    const d = App.doc;
    if (!App.state.snapAssist || !App.state.showAssist || !d.assistants.length) return null;
    return { start: { x: p.x, y: p.y }, dir: null, origin: null };
  };
  T.constrain = function (c, p) {
    if (!c) return p;
    const d = App.doc;
    if (!c.dir) {
      const dx = p.x - c.start.x, dy = p.y - c.start.y, dist = Math.hypot(dx, dy);
      if (dist * App.state.view.zoom < 7) return Object.assign({}, p, { x: c.start.x, y: c.start.y });
      const ang = Math.atan2(dy, dx);
      let best = null, bestA = 0.55; // ~31°
      const consider = (vx, vy, origin) => {
        const l = Math.hypot(vx, vy);
        if (l < 1e-6) return;
        const a = Math.atan2(vy, vx);
        let diff = Math.abs(Math.atan2(Math.sin(ang - a), Math.cos(ang - a)));
        diff = Math.min(diff, Math.PI - diff);
        if (diff < bestA) { bestA = diff; best = { x: vx / l, y: vy / l, origin }; }
      };
      for (const a of d.assistants) {
        if (a.type === 'vp') consider(a.x - c.start.x, a.y - c.start.y, c.start);
        else if (a.type === 'parallel') consider(a.b.x - a.a.x, a.b.y - a.a.y, c.start);
        else if (a.type === 'ruler') {
          // snap onto the ruler line itself when the stroke starts close to it
          const vx = a.b.x - a.a.x, vy = a.b.y - a.a.y, l = Math.hypot(vx, vy) || 1, nx = -vy / l, ny = vx / l;
          const off = (c.start.x - a.a.x) * nx + (c.start.y - a.a.y) * ny;
          if (Math.abs(off) * App.state.view.zoom < 40) consider(vx, vy, { x: c.start.x - nx * off, y: c.start.y - ny * off });
        }
      }
      c.dir = best || { free: true };
    }
    if (c.dir.free) return p;
    const o = c.dir.origin, t = (p.x - o.x) * c.dir.x + (p.y - o.y) * c.dir.y;
    return Object.assign({}, p, { x: o.x + c.dir.x * t, y: o.y + c.dir.y * t });
  };

  /* ---------------- quick-mask overlay ---------------- */
  let qmCanvas = null, qmRev = -1, qmDoc = null;
  function qmUpdate(d) {
    const q = d.quickMask;
    let full = false;
    if (!qmCanvas || qmDoc !== d || qmCanvas.width !== d.width || qmCanvas.height !== d.height) { qmCanvas = U.canvas(d.width, d.height); full = true; qmDoc = d; }
    if (qmRev !== d.quickRev) { full = true; qmRev = d.quickRev; }
    let r = full ? { x: 0, y: 0, w: d.width, h: d.height } : U.clipRect(d.qmDirty, d.width, d.height);
    d.qmDirty = null;
    if (d.stroke && d.stroke.kind === 'qm' && d.stroke.rect) r = U.union(r, U.clipRect(d.stroke.rect, d.width, d.height));
    if (!r) return;
    const src = d.stroke && d.stroke.kind === 'qm' ? d.surfaceWithStroke(r) : null;
    const img = src ? U.ctx(src).getImageData(0, 0, r.w, r.h) : U.ctx(q).getImageData(r.x, r.y, r.w, r.h), p = img.data;
    for (let i = 0; i < p.length; i += 4) {
      const v = (U.luma(p[i], p[i + 1], p[i + 2]) * (p[i + 3] / 255)) / 255;
      p[i] = 230; p[i + 1] = 40; p[i + 2] = 60; p[i + 3] = (1 - v) * 120;
    }
    U.ctx(qmCanvas).putImageData(img, r.x, r.y);
  }

  /* ---------------- drawing (document space) ---------------- */
  T.overlay = function (cx, lw, zr) {
    const d = App.doc, st = App.state;
    if (d.quickMask) { qmUpdate(d); cx.drawImage(qmCanvas, 0, 0); }
    // assistants
    if (d.assistants.length && st.showAssist) {
      cx.save();
      cx.lineWidth = lw;
      for (const a of d.assistants) {
        if (a.type === 'vp') {
          cx.strokeStyle = 'rgba(80,220,255,0.22)';
          cx.beginPath();
          const R = Math.hypot(d.width, d.height) * 2.5;
          for (let k = 0; k < 72; k++) { const t = (k / 72) * U.TAU; cx.moveTo(a.x, a.y); cx.lineTo(a.x + Math.cos(t) * R, a.y + Math.sin(t) * R); }
          cx.stroke();
        } else {
          cx.strokeStyle = a.type === 'ruler' ? 'rgba(255,200,80,0.9)' : 'rgba(80,220,255,0.75)';
          cx.setLineDash(a.type === 'parallel' ? [6 * lw, 4 * lw] : []);
          cx.beginPath(); cx.moveTo(a.a.x, a.a.y); cx.lineTo(a.b.x, a.b.y); cx.stroke();
          cx.setLineDash([]);
        }
      }
      if (st.tool === 'assist') for (const a of d.assistants) for (const hd of handles(a)) { cx.beginPath(); cx.arc(hd.x, hd.y, 7 * zr, 0, U.TAU); cx.fillStyle = a.type === 'vp' ? '#50dcff' : a.type === 'ruler' ? '#ffc850' : '#9fe8ff'; cx.fill(); cx.strokeStyle = '#111'; cx.lineWidth = 2 * zr; cx.stroke(); }
      cx.restore();
    }
    // guides
    if (d.guides.length) {
      cx.save(); cx.strokeStyle = 'rgba(0,230,255,0.85)'; cx.lineWidth = lw; cx.beginPath();
      for (const g of d.guides) { if (g.axis === 'x') { cx.moveTo(g.pos, -1e5); cx.lineTo(g.pos, 1e5); } else { cx.moveTo(-1e5, g.pos); cx.lineTo(1e5, g.pos); } }
      cx.stroke(); cx.restore();
    }
    const dr = V().drag;
    if (dr && dr.tool === 'x-patch' && V().selTint) {
      cx.save(); cx.globalAlpha = 0.9;
      cx.drawImage(V().selTint, dr.cur.x - dr.start.x, dr.cur.y - dr.start.y);
      cx.strokeStyle = '#ffd166'; cx.lineWidth = 1.5 * lw; cx.setLineDash([5 * lw, 4 * lw]);
      const bb = dr.bb;
      cx.strokeRect(bb.x + dr.cur.x - dr.start.x, bb.y + dr.cur.y - dr.start.y, bb.w, bb.h);
      cx.restore();
    }
    if (dr && dr.tool === 'x-patchsel' && dr.pts.length > 1) {
      cx.save(); cx.lineWidth = 1.5 * lw; cx.setLineDash([5 * lw, 4 * lw]); cx.strokeStyle = '#ffd166'; cx.beginPath();
      dr.pts.forEach((q, i) => (i ? cx.lineTo(q.x, q.y) : cx.moveTo(q.x, q.y))); cx.closePath(); cx.stroke(); cx.restore();
    }
    if (dr && dr.tool === 'x-guide') {
      cx.save(); cx.strokeStyle = '#ffd166'; cx.lineWidth = lw; cx.beginPath();
      if (dr.axis === 'x') { cx.moveTo(dr.pos, -1e5); cx.lineTo(dr.pos, 1e5); } else { cx.moveTo(-1e5, dr.pos); cx.lineTo(1e5, dr.pos); }
      cx.stroke(); cx.restore();
    }
    if (d.editMask && d.active && d.active.mask) {
      cx.save(); cx.strokeStyle = 'rgba(255,255,255,0.7)'; cx.setLineDash([10 * lw, 6 * lw]); cx.lineWidth = 2 * lw; cx.strokeRect(0, 0, d.width, d.height); cx.restore();
    }
    if (ND.Pen) ND.Pen.overlay(cx, lw, zr);
    const VV = V();
    // smoothing "string": from the line's end to the pen
    if (VV.stroke && VV.stroke.rope && VV.stroke.smooth && VV.stroke.lastRaw && VV.stroke.s.stabilizer >= 0.15) {
      const a = VV.stroke.smooth, b = VV.stroke.lastRaw;
      if (Math.hypot(b.x - a.x, b.y - a.y) > 2 * zr) {
        cx.save(); cx.strokeStyle = 'rgba(255,255,255,0.75)'; cx.lineWidth = lw; cx.setLineDash([3 * lw, 3 * lw]);
        cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
        cx.beginPath(); cx.arc(b.x, b.y, 2.5 * zr, 0, U.TAU); cx.fillStyle = '#fff'; cx.fill();
        cx.restore();
      }
    }
    if (VV.stroke && VV.predicted && VV.lastPt && App.state.tool === 'brush' && !App.state.eraserMode) {
      const b = App.state.brush;
      cx.save();
      cx.globalAlpha = Math.min(0.8, b.opacity == null ? 0.8 : b.opacity);
      cx.strokeStyle = App.state.fg; cx.lineCap = 'round'; cx.lineJoin = 'round';
      cx.lineWidth = Math.max(lw, (b.size || 4) * 0.8 * (VV.lastPt.p || 1));
      cx.beginPath(); cx.moveTo(VV.lastPt.x, VV.lastPt.y);
      VV.predicted.forEach((q) => cx.lineTo(q.x, q.y));
      cx.stroke();
      cx.restore();
    }
    if (ND.Anim && d.anim && !(ND.Timeline && ND.Timeline.playing)) {
      // onion skins: neighbouring drawings of the active layer, tinted
      const list = ND.Anim.onion(d);
      if (list.length) { cx.save(); list.forEach((o) => { cx.globalAlpha = o.alpha; cx.drawImage(o.canvas, 0, 0); }); cx.restore(); }
    }
  };

  /* ---------------- drawing (screen space): rulers, cursors ---------------- */
  T.screen = function (cx, W, H) {
    const st = App.state, c = V().cursor, d = App.doc, z = st.view.zoom;
    const circleTool = { heal: st.healSize, liquify: st.liqSize, redeye: st.redeyeSize, smartsel: st.smartSize }[st.tool];
    if (circleTool && c.inside && !V().panning) {
      const r = (circleTool * z) / 2;
      cx.save(); cx.beginPath(); cx.arc(c.sx, c.sy, r, 0, U.TAU);
      cx.strokeStyle = 'rgba(0,0,0,0.55)'; cx.lineWidth = 3; cx.stroke();
      cx.strokeStyle = st.tool === 'redeye' ? '#ff8080' : '#fff'; cx.lineWidth = 1; cx.stroke(); cx.restore();
    }
    if (!st.rulers) return;
    const v = st.view;
    cx.save();
    cx.fillStyle = 'rgba(28,30,35,0.94)';
    cx.fillRect(0, 0, W, RULER); cx.fillRect(0, 0, RULER, H);
    if (Math.abs(v.rot) < 1e-6) {
      const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
      const step = steps.find((s) => s * z >= 60) || 5000;
      const a = V().toDoc(0, 0), b = V().toDoc(W, H);
      cx.strokeStyle = '#6f7480'; cx.fillStyle = '#a3a8b3'; cx.font = '9px sans-serif'; cx.lineWidth = 1;
      cx.beginPath();
      const x0 = Math.floor(Math.min(a.x, b.x) / step) * step, x1 = Math.max(a.x, b.x);
      for (let x = x0; x <= x1; x += step / 5) {
        const sx = Math.round(V().toScreen(x, 0).x) + 0.5, major = Math.abs(x / step - Math.round(x / step)) < 1e-6;
        cx.moveTo(sx, RULER); cx.lineTo(sx, major ? 4 : RULER - 5);
        if (major) cx.fillText(String(Math.round(x)), sx + 2, 9);
      }
      const y0 = Math.floor(Math.min(a.y, b.y) / step) * step, y1 = Math.max(a.y, b.y);
      for (let y = y0; y <= y1; y += step / 5) {
        const sy = Math.round(V().toScreen(0, y).y) + 0.5, major = Math.abs(y / step - Math.round(y / step)) < 1e-6;
        cx.moveTo(RULER, sy); cx.lineTo(major ? 4 : RULER - 5, sy);
        if (major) { cx.save(); cx.translate(9, sy + 2); cx.rotate(-Math.PI / 2); cx.fillText(String(Math.round(y)), 0, 0); cx.restore(); }
      }
      cx.stroke();
      if (c.inside) { cx.strokeStyle = '#ff5fa2'; cx.beginPath(); cx.moveTo(c.sx + 0.5, 0); cx.lineTo(c.sx + 0.5, RULER); cx.moveTo(0, c.sy + 0.5); cx.lineTo(RULER, c.sy + 0.5); cx.stroke(); }
    } else { cx.fillStyle = '#6f7480'; cx.font = '10px sans-serif'; cx.fillText('rotated view', RULER + 6, 12); }
    cx.fillStyle = '#23262c'; cx.fillRect(0, 0, RULER, RULER);
    cx.restore();
    void d;
  };

  /* ---------------- pointer handling ---------------- */
  function surfacePixels() {
    const S = App.doc.surface();
    if (!S || S.kind !== 'pixels') { App.blocked(); return null; }
    return S;
  }
  T.down = function (e, p, l) {
    const st = App.state, d = App.doc, tool = st.tool, z = st.view.zoom;
    // rulers: drag out a guide
    if (st.rulers && (l.sy < RULER || l.sx < RULER)) {
      V().drag = { tool: 'x-guide', axis: l.sy < RULER ? 'y' : 'x', pos: l.sy < RULER ? p.y : p.x, index: -1 };
      return true;
    }
    // move an existing guide with the move tool
    if (tool === 'pen' && ND.Pen) return ND.Pen.down(e, p);
    if (tool === 'move' && d.guides.length) {
      for (let i = 0; i < d.guides.length; i++) {
        const g = d.guides[i], s = V().toScreen(g.axis === 'x' ? g.pos : p.x, g.axis === 'y' ? g.pos : p.y);
        if ((g.axis === 'x' && Math.abs(s.x - l.sx) < 5) || (g.axis === 'y' && Math.abs(s.y - l.sy) < 5)) { V().drag = { tool: 'x-guide', axis: g.axis, pos: g.pos, index: i }; return true; }
      }
    }
    if (tool === 'assist') {
      for (const a of d.assistants) for (const hd of handles(a)) {
        const s = V().toScreen(hd.x, hd.y);
        if (Math.hypot(s.x - l.sx, s.y - l.sy) < 12) {
          if (e.altKey) { setAssistants(d.assistants.filter((q) => q !== a), 'Delete Assistant'); return true; }
          V().drag = { tool: 'x-assist', h: hd, before: JSON.parse(JSON.stringify(d.assistants)) };
          return true;
        }
      }
      const t = st.assistType, len = 200 / z;
      const a = t === 'vp' ? { type: 'vp', x: p.x, y: p.y } : { type: t, a: { x: p.x, y: p.y }, b: { x: p.x + len, y: p.y } };
      setAssistants(d.assistants.concat([a]), 'Add Assistant');
      if (t !== 'vp') V().drag = { tool: 'x-assist', h: a.b, before: null };
      return true;
    }
    if (tool === 'heal') {
      if (!surfacePixels()) return true;
      const s = { engine: 'pixel', size: st.healSize, softness: 0.25, flow: 1, opacity: 0.45, spacing: 0.08, stabilizer: 0, pressureSize: false, symmetry: 'none' };
      V().stroke = new ND.Brush.Stroke(d, s, { colour: '#ff3d6e' });
      V().stroke.begin(p);
      V().healing = true;
      return true;
    }
    if (tool === 'smartsel') {
      const subtract = e.altKey || st.selMode === 'subtract';
      if (!T.smart || T.smart.doc !== d || T.smart.merged !== st.wandMerged) {
        const src = d.sampleCanvas(st.wandMerged);
        T.smart = { doc: d, merged: st.wandMerged, src: U.clone(src), s: new ND.Smart.Session(src) };
        if (d.selectionMask && st.selMode === 'add') { /* start fresh: seeds come from strokes */ }
      }
      const sz = st.smartSize;
      V().stroke = new ND.Brush.Stroke(d, { engine: 'pixel', size: sz, softness: 0.1, flow: 1, opacity: 0.35, spacing: 0.15, stabilizer: 0, pressureSize: false, symmetry: 'none' }, { colour: subtract ? '#ff4d6d' : '#4da3ff' });
      V().stroke.begin(p);
      V().smarting = { subtract };
      return true;
    }
    if (tool === 'patch') {
      if (!surfacePixels()) return true;
      const inside = d.selectionMask && U.ctx(d.selectionMask).getImageData(U.clamp(Math.floor(p.x), 0, d.width - 1), U.clamp(Math.floor(p.y), 0, d.height - 1), 1, 1).data[3] > 64;
      // Drag inside the selection = patch it from where you drop it. Anywhere else = draw a new patch area.
      if (inside) V().drag = { tool: 'x-patch', start: p, cur: p, bb: ND.Sel.bbox(d.selectionMask, 2) || { x: 0, y: 0, w: 0, h: 0 } };
      else V().drag = { tool: 'x-patchsel', pts: [{ x: p.x, y: p.y }] };
      return true;
    }
    if (tool === 'redeye') {
      const S = surfacePixels();
      if (!S) return true;
      const R = st.redeyeSize / 2 + 2, ox = Math.floor(p.x - R), oy = Math.floor(p.y - R), before = U.canvas(Math.ceil(R * 2) + 2, Math.ceil(R * 2) + 2);
      U.ctx(before).drawImage(S.canvas, ox, oy, before.width, before.height, 0, 0, before.width, before.height);
      const r = ND.Heal.redEye(S.canvas, p.x, p.y, st.redeyeSize / 2);
      if (r) { d.finishDirectEdit(S, before, r, 'Red Eye', ox, oy); App.toast('Red eye fixed'); } else App.toast('No red found there — click right on the pupil');
      return true;
    }
    if (tool === 'liquify') {
      const S = surfacePixels();
      if (!S) return true;
      if (!V().liq) { V().liq = new ND.Heal.Liquify(d, S); App.emit('liquify'); }
      V().drag = { tool: 'x-liq', last: p };
      T.liqDab(p, 0, 0);
      return true;
    }
    return false;
  };
  T.liqDab = function (p, mx, my) {
    const st = App.state;
    V().liq.dab(p.x, p.y, st.liqSize / 2, st.liqStrength, st.liqMode, mx, my);
    V().request();
  };
  T.move = function (e, p, l) {
    const dr = V().drag, d = App.doc;
    if (!dr || !dr.tool.startsWith('x-')) return false;
    if (dr.tool === 'x-pen') ND.Pen.move(e, p);
    else if (dr.tool === 'x-guide') { dr.pos = dr.axis === 'x' ? Math.round(p.x) : Math.round(p.y); dr.out = dr.axis === 'x' ? l.sx < RULER : l.sy < RULER; V().request(); }
    else if (dr.tool === 'x-assist') { const q = e.shiftKey ? p : T.snap(p); dr.h.x = q.x; dr.h.y = q.y; V().request(); }
    else if (dr.tool === 'x-patch') { dr.cur = p; V().request(); }
    else if (dr.tool === 'x-patchsel') { dr.pts.push({ x: p.x, y: p.y }); V().request(); }
    else if (dr.tool === 'x-liq') {
      const st = App.state, step = Math.max(2, st.liqSize * 0.08), dist = Math.hypot(p.x - dr.last.x, p.y - dr.last.y);
      if (dist >= step) {
        const n = Math.ceil(dist / step);
        for (let i = 1; i <= n; i++) {
          const q = { x: dr.last.x + ((p.x - dr.last.x) * i) / n, y: dr.last.y + ((p.y - dr.last.y) * i) / n };
          T.liqDab(q, (p.x - dr.last.x) / n, (p.y - dr.last.y) / n);
        }
        dr.last = p;
      }
    }
    void d;
    return true;
  };
  T.up = function (e, dr) {
    const d = App.doc;
    if (dr.tool === 'x-pen') { ND.Pen.up(dr); return; }
    if (dr.tool === 'x-guide') {
      const g = d.guides.slice();
      if (dr.index >= 0) g.splice(dr.index, 1);
      const inside = dr.axis === 'x' ? dr.pos >= 0 && dr.pos <= d.width : dr.pos >= 0 && dr.pos <= d.height;
      if (!dr.out && inside) g.push({ axis: dr.axis, pos: dr.pos });
      const before = d.guides;
      d.guides = g;
      d.history.push({ label: 'Guide', undo: () => { d.guides = before; V().request(); }, redo: () => { d.guides = g; V().request(); } });
    } else if (dr.tool === 'x-assist') {
      if (dr.before) { const after = JSON.parse(JSON.stringify(d.assistants)), before = dr.before; d.assistants = after; d.history.push({ label: 'Move Assistant', undo: () => { d.assistants = before; V().request(); }, redo: () => { d.assistants = after; V().request(); } }); }
    } else if (dr.tool === 'x-patchsel') {
      if (dr.pts.length < 4) { if (d.selectionMask) d.changeSelection('Deselect', null); }
      else {
        const path = new Path2D();
        dr.pts.forEach((q, i) => (i ? path.lineTo(q.x, q.y) : path.moveTo(q.x, q.y)));
        path.closePath();
        d.changeSelection('Patch Area', ND.Sel.maskFromPath(d, path, true));
        App.toast('Now drag the area onto good texture — it is replaced when you let go', 3000);
      }
    } else if (dr.tool === 'x-patch') {
      const off = { x: Math.round(dr.cur.x - dr.start.x), y: Math.round(dr.cur.y - dr.start.y) };
      if (Math.abs(off.x) + Math.abs(off.y) > 2) App.healSelection(off, 'Patch');
    }
    V().request();
  };
  T.tick = function () {
    const dr = V().drag, st = App.state;
    if (dr && dr.tool === 'x-liq' && st.liqMode !== 'push' && V().liq) T.liqDab(dr.last, 0, 0);
  };
  // Spot heal: the painted stroke becomes the area to repair.
  T.finishHeal = function () {
    const v = V(), d = App.doc, s = v.stroke;
    s.flush();
    const hint = U.clipRect(s.bbox, d.width, d.height);
    if (!hint) { d.discardStroke(); v.stroke = null; v.healing = false; return; }
    // copy just the painted area of the stroke buffer as the heal mask
    const mask = U.canvas(d.width, d.height);
    U.ctx(mask).drawImage(d.strokeBuffer, hint.x, hint.y, hint.w, hint.h, hint.x, hint.y, hint.w, hint.h);
    d.discardStroke();
    v.stroke = null; v.healing = false;
    const S = d.surface();
    if (!S || S.kind !== 'pixels') return;
    const m = 8, before = U.canvas(hint.w + m * 2, hint.h + m * 2);
    U.ctx(before).drawImage(S.canvas, hint.x - m, hint.y - m, before.width, before.height, 0, 0, before.width, before.height);
    const src = App.state.healMerged ? d.getProjection() : S.canvas;
    const res = ND.Heal.heal(src, S.canvas, mask, null, hint);
    if (!res) { App.toast('Could not find nearby texture to heal with'); return; }
    d.finishDirectEdit(S, before, res.rect, 'Spot Heal', hint.x - m, hint.y - m);
  };
  T.finishSmart = function () {
    const v = V(), d = App.doc, s = v.stroke, sub = v.smarting && v.smarting.subtract;
    s.flush();
    const hint = U.clipRect(s.bbox, d.width, d.height);
    const mark = U.canvas(d.width, d.height);
    if (hint) U.ctx(mark).drawImage(d.strokeBuffer, hint.x, hint.y, hint.w, hint.h, hint.x, hint.y, hint.w, hint.h);
    d.discardStroke();
    v.stroke = null; v.smarting = null;
    if (!hint || !T.smart) return;
    if (App.state.smartAI) {
      // AI objects: the stroke picks whole objects the AI model found
      App.aiQuickSelect(mark, sub, T.smart).then((m) => { if (m || T.smart.ai) d.changeSelection('Quick Select (AI)', m); }).catch((e) => App.toast('AI failed: ' + e.message, 4000));
      return;
    }
    const t0 = performance.now(), mask = T.smart.s.add(mark, sub);
    if (!mask) { App.toast('Paint over the object you want first'); return; }
    T.smartBusy = performance.now() - t0;
    d.changeSelection('Quick Select', mask);
  };
  App.on('tool', () => { if (App.state.tool !== 'smartsel') T.smart = null; });
  App.on('docchange', () => { T.smart = null; });
  App.on('doc', (t) => { if (t === 'selection' && App.doc && !App.doc.selectionMask && !V().smarting) T.smart = null; });
  T.applyLiquify = function () { const v = V(); if (!v.liq) return; v.liq.commit(); v.liq = null; App.emit('liquify'); App.toast('Liquify applied'); };
  T.cancelLiquify = function () { const v = V(); if (!v.liq) return; v.liq.cancel(); v.liq = null; App.emit('liquify'); };

  ND.Tools2 = T;
})();
