/* Neon Draw — Colourise line art: the layer setup, the floating bar and automatic updates. */
'use strict';
(function () {
  const U = ND.U, App = ND.App, K = ND.Colourise;
  const V = () => ND.View;

  // the three layers of one colourise set: { lines, hints, flats }
  function group(L) {
    const d = App.doc;
    if (!d || !L || !L.colorizeData) return null;
    const key = L.colorizeData.key, g = {};
    d.allLayers().forEach((l) => { if (l.colorizeData && l.colorizeData.key === key) g[l.colorizeData.role] = l; });
    return g.lines && g.hints && g.flats ? g : null;
  }
  App.colouriseGroup = () => group(App.doc && App.doc.active);
  // how much ink a canvas holds (fraction of pixels that count as lines)
  const inkShare = (c) => { const b = K.barrier(c); let n = 0; for (let i = 0; i < b.length; i += 3) if (b[i] >= K.LINE) n++; return n / (b.length / 3); };
  // the line art the fill is based on: the line layer, or everything visible except the flats and hints
  function linesFor(g) {
    if (g.flats.colorizeData.source !== 'visible') return g.lines.canvas;
    const d = App.doc, vf = g.flats.visible, vh = g.hints.visible;
    g.flats.visible = false; g.hints.visible = false; d.invalidateAll();
    const c = U.clone(d.getProjection());
    g.flats.visible = vf; g.hints.visible = vh; d.invalidateAll();
    return c;
  }

  App.startColourise = function () {
    const d = App.doc, line = d.active;
    if (!line || !line.isPixel) return App.toast('Pick your line-art layer first');
    if (line.colorizeData) return App.toast('This layer is already being colourised — see the Colourise bar');
    const key = 'cz' + Date.now().toString(36);
    // no lines on this layer (e.g. an empty layer was selected): use everything that's visible instead
    const source = inkShare(line.canvas) < 0.0005 ? 'visible' : 'layer';
    const flats = new ND.Layer('Flats (colourise)', d.width, d.height), hints = new ND.Layer('Colour hints', d.width, d.height);
    d.structural('Colourise Line Art', () => {
      const p = d.parentOf(line), i = p.children.indexOf(line);
      p.children.splice(i + 1, 0, hints);
      p.children.splice(i, 0, flats);
      line.colorizeData = { key, role: 'lines' };
      hints.colorizeData = { key, role: 'hints' };
      flats.colorizeData = { key, role: 'flats', gap: 2, blankWhite: true, auto: true, source };
      d.active = hints; d.editMask = false;
      return { undo: () => { line.colorizeData = null; }, redo: () => { line.colorizeData = { key, role: 'lines' }; } };
    });
    App.setTool('brush');
    App.toast((source === 'visible' ? '“' + line.name + '” has no lines on it, so all visible layers are used as the line art. ' : '') + 'Scribble a little colour inside each area on the “Colour hints” layer — that area fills up to your lines. Areas without a scribble stay empty.', 7000);
    refresh();
  };

  // Recompute the flats. They are worked out from the hints, so this isn't a separate undo step:
  // undoing a hint scribble simply recomputes them.
  App.colouriseUpdate = function (silent) {
    const g = App.colouriseGroup() || lastGroup;
    if (!g) return;
    const o = g.flats.colorizeData, t0 = performance.now();
    const res = K.run(linesFor(g), g.hints.canvas, { gap: o.gap, blankWhite: o.blankWhite });
    const x = U.ctx(g.flats.canvas);
    x.clearRect(0, 0, g.flats.canvas.width, g.flats.canvas.height);
    if (res) x.drawImage(res.canvas, 0, 0);
    g.flats.rev++; g.hints.seenRev = g.hints.rev;
    App.doc.invalidateAll(); App.doc.emit('layers'); V().request();
    if (!silent) App.toast(res ? 'Flats updated — ' + res.colours.length + ' colours (' + Math.round(performance.now() - t0) + ' ms)' : 'Scribble some colour on the “Colour hints” layer first');
  };
  App.colouriseFinish = function () {
    const g = App.colouriseGroup();
    if (!g) return;
    const d = App.doc, keep = { l: g.lines.colorizeData, h: g.hints.colorizeData, f: g.flats.colorizeData };
    d.structural('Finish Colourise', () => {
      const p = d.parentOf(g.hints);
      p.children.splice(p.children.indexOf(g.hints), 1);
      g.lines.colorizeData = g.flats.colorizeData = null;
      g.flats.name = 'Flats';
      d.active = g.flats;
      return { undo: () => { g.lines.colorizeData = keep.l; g.hints.colorizeData = keep.h; g.flats.colorizeData = keep.f; }, redo: () => { g.lines.colorizeData = g.flats.colorizeData = null; } };
    });
    App.toast('Colourising finished — the flats are an ordinary layer now');
    refresh();
  };
  function setOpt(k, v) { const g = App.colouriseGroup(); if (!g) return; g.flats.colorizeData[k] = v; refresh(); App.colouriseUpdate(true); }

  /* ---------- automatic updates after each hint stroke (and its undo / redo) ---------- */
  let lastGroup = null, timer = 0;
  App.on('doc', (t) => {
    if (t !== 'history' && t !== 'active') return;
    const g = App.colouriseGroup();
    if (g) lastGroup = g;
    refresh();
    const G = g || (lastGroup && App.doc.contains(lastGroup.hints) && lastGroup.flats.colorizeData ? lastGroup : null);
    if (!G || !G.flats.colorizeData.auto || G.hints.rev === G.hints.seenRev) return;
    clearTimeout(timer);
    timer = setTimeout(() => { lastGroup = G; App.colouriseUpdate(true); }, 120);
  });
  App.on('docchange', () => { lastGroup = null; refresh(); });

  /* ---------- floating bar ---------- */
  let bar = null, els = null;
  function build() {
    const C = ND.C, vp = document.getElementById('nd-viewport');
    if (!vp || bar) return;
    bar = U.h('div.nd-assistbar.nd-czbar');
    const label = U.h('span', ND.icon('fill', 15), U.h('b', ' Colourise'));
    els = {
      upd: C.button('Update', () => App.colouriseUpdate(), { cls: 'sm', title: 'Recalculate the flats' }),
      auto: C.button('Auto', () => { const g = App.colouriseGroup(); if (g) setOpt('auto', !g.flats.colorizeData.auto); }, { cls: 'sm', title: 'Update after every scribble' }),
      gap: C.slider('Gap closing', { min: 0, max: 12, step: 1, get: () => { const g = App.colouriseGroup(); return g ? g.flats.colorizeData.gap : 2; }, set: (v) => setOpt('gap', Math.round(v)), unit: 'px' }),
      blank: C.button('White = empty', () => { const g = App.colouriseGroup(); if (g) setOpt('blankWhite', !g.flats.colorizeData.blankWhite); }, { cls: 'sm', title: 'Areas scribbled with white stay transparent' }),
      hints: C.button('Hide hints', () => { const g = App.colouriseGroup(); if (g) { g.hints.visible = !g.hints.visible; App.doc.invalidateAll(); App.doc.emit('layers'); refresh(); } }, { cls: 'sm' }),
      src: C.button('Lines: this layer', () => { const g = App.colouriseGroup(); if (g) setOpt('source', g.flats.colorizeData.source === 'visible' ? 'layer' : 'visible'); }, { cls: 'sm', title: 'Use only the line-art layer, or everything that is visible, as the lines' }),
      done: C.button('Done', () => App.colouriseFinish(), { cls: 'sm', title: 'Remove the hints and keep the flats as a normal layer' }),
    };
    els.gap.classList.add('nd-czgap');
    bar.append(label, els.upd, els.auto, els.gap, els.blank, els.src, els.hints, els.done);
    vp.appendChild(bar);
  }
  function refresh() {
    if (!bar) build();
    if (!bar) return;
    const g = App.colouriseGroup();
    bar.style.display = g ? 'flex' : 'none';
    if (!g) return;
    const o = g.flats.colorizeData;
    els.auto.classList.toggle('active', !!o.auto);
    els.blank.classList.toggle('active', !!o.blankWhite);
    els.hints.lastChild.textContent = g.hints.visible ? 'Hide hints' : 'Show hints';
    els.src.lastChild.textContent = o.source === 'visible' ? 'Lines: all layers' : 'Lines: “' + g.lines.name.slice(0, 14) + '”';
    if (els.gap.refresh) els.gap.refresh();
  }
  setTimeout(refresh, 0);
})();
