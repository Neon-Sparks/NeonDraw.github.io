/* Neon Draw — layers, history and navigator docker. */
'use strict';
(function () {
  const U = ND.U, h = U.h, C = ND.C, App = ND.App;
  ND.LayersPanel = { build };

  function build(root) {
    let tab = 'layers';
    const tabs = h('div.nd-tabs');
    const body = h('div.nd-tabbody');
    [['layers', 'Layers'], ['history', 'History'], ['nav', 'Navigator']].forEach(([id, label]) => {
      const b = h('button.nd-tab', { type: 'button' }, label);
      b.dataset.id = id;
      b.addEventListener('click', () => { tab = id; render(); });
      tabs.appendChild(b);
    });
    const panel = h('div.nd-docker.nd-layers-docker', tabs, body);
    root.appendChild(panel);

    function render() {
      tabs.querySelectorAll('.nd-tab').forEach((b) => b.classList.toggle('active', b.dataset.id === tab));
      U.clear(body);
      if (tab === 'layers') renderLayers();
      else if (tab === 'history') renderHistory();
      else renderNav();
    }

    /* ---------------- layers ---------------- */
    let listEl = null, propsEl = null;
    function renderLayers() {
      const d = App.doc;
      if (!d) return;
      const bar = h('div.nd-layer-bar',
        C.iconButton('plus', 'New layer (Ctrl+Shift+N)', () => d.addLayer()),
        C.iconButton('folder', 'New group', () => d.addGroup()),
        C.iconButton('duplicate', 'Duplicate (Ctrl+J)', () => d.duplicateLayer()),
        C.iconButton('merge', 'Merge down (Ctrl+E)', () => { if (d.mergeDown() === false) App.toast('Nothing below to merge into (or it is a group)'); }),
        C.iconButton('mask', 'Add layer mask (from the selection if there is one)', () => App.addMaskSmart()),
        C.iconButton('adjust', 'New adjustment layer', (e) => adjustMenu(e.currentTarget)),
        C.iconButton('fx', 'Layer style (shadow, glow, stroke…)', () => ND.AdjustPanel.layerStyle(d.active)),
        C.iconButton('group', 'Group layer (Ctrl+G)', () => d.groupActive()),
        C.iconButton('ungroup', 'Ungroup (Ctrl+Shift+G)', () => { if (d.ungroupActive() === false) App.toast('Select a group'); }),
        C.iconButton('up', 'Move up (Ctrl+])', () => d.moveActive(1)),
        C.iconButton('down', 'Move down (Ctrl+[)', () => d.moveActive(-1)),
        C.iconButton('trash', 'Delete layer', () => { if (d.deleteLayer() === false) App.toast('Cannot delete the last layer'); }));
      propsEl = h('div.nd-layer-props');
      listEl = h('div.nd-layer-list');
      body.append(bar, propsEl, listEl);
      renderProps();
      renderList();
    }
    function renderProps() {
      const d = App.doc, n = d.active;
      if (!propsEl || !n) return;
      U.clear(propsEl);
      const blend = C.select(null, ND.Blend.MODES.map((m) => ({ value: m.id, label: m.label, group: m.cat })), () => n.blendMode, (v) => d.setProps(n, { blendMode: v }, 'Blend Mode'), 'Blend mode');
      const op = C.slider('Opacity', { min: 0, max: 1, step: 0.01, get: () => n.opacity, set: (v) => d.setProps(n, { opacity: v }, 'Layer Opacity'), fmt: (v) => Math.round(v * 100), toValue: (v) => v / 100, unit: '%' });
      const tog = (icon, key, title) => {
        const b = C.iconButton(icon, title, () => d.setProps(n, { [key]: !n[key] }, title), 'tiny');
        b.classList.toggle('active', !!n[key]);
        return b;
      };
      propsEl.append(h('div.nd-row.tight', blend, tog('lock', 'locked', 'Lock layer'), n.isPixel ? tog('alpha', 'alphaLock', 'Alpha lock (paint only on existing pixels)') : null, tog('clip', 'clip', 'Clip to layer below (clipping mask)')), op);
    }
    let dragNode = null;
    function renderList() {
      const d = App.doc;
      if (!listEl) return;
      U.clear(listEl);
      for (const { node: n, depth } of d.displayList()) {
        const eye = h('button.nd-eye', { title: 'Show / hide (Alt+click: solo)' }, ND.icon(n.visible ? 'eye' : 'eye-off', 15));
        eye.addEventListener('click', (e) => {
          e.stopPropagation();
          if (e.altKey) {
            const others = d.allNodes().filter((q) => q !== n && !d.isInside(n, q) && !(n.isGroup && d.isInside(q, n)));
            const solo = others.some((q) => q.visible);
            others.forEach((q) => { q.visible = !solo; });
            n.visible = true; d.invalidateAll(); d.emit('layers');
          } else d.setProps(n, { visible: !n.visible }, n.visible ? 'Hide Layer' : 'Show Layer');
        });
        let thumb;
        if (n.isGroup) {
          thumb = h('button.nd-caret-btn', { title: n.collapsed ? 'Expand' : 'Collapse' }, n.collapsed ? '▸' : '▾');
          thumb.addEventListener('click', (e) => { e.stopPropagation(); n.collapsed = !n.collapsed; renderList(); });
        } else if (n.isAdjust) {
          thumb = h('span.nd-adjthumb', { title: ND.Adjust.label(n.kind) }, ND.Adjust.find(n.kind).icon);
        } else {
          thumb = h('canvas.nd-thumb' + (n === d.active && !d.editMask ? '.sel' : ''), { width: 40, height: 30, title: 'Paint on the layer' });
          drawThumb(thumb, n);
          thumb.addEventListener('click', (e) => { e.stopPropagation(); d.setActive(n); d.setEditMask(false); renderList(); });
        }
        let mthumb = null;
        if (n.mask) {
          mthumb = h('canvas.nd-thumb.mask' + (n === d.active && d.editMask ? '.sel' : '') + (!n.maskEnabled ? '.off' : ''), { width: 40, height: 30, title: 'Layer mask — click to paint on it · Shift+click disables · Alt+click selects it' });
          drawThumb(mthumb, n, true);
          mthumb.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.shiftKey) { d.setProps(n, { maskEnabled: !n.maskEnabled }, 'Toggle Mask'); return; }
            d.setActive(n);
            if (e.altKey) { d.selectionFromMask(); return; }
            d.setEditMask(true); renderList();
          });
        }
        const name = h('span.nd-layer-name', n.name);
        const fxOn = n.effects && ND.Effects.any(n.effects);
        const fxB = fxOn ? h('button.nd-fxtag', { title: 'Layer style — click to edit' }, 'fx') : null;
        if (fxB) fxB.addEventListener('click', (e) => { e.stopPropagation(); d.setActive(n); ND.AdjustPanel.layerStyle(n); });
        const flags = h('span.nd-layer-flags', fxB, n.textData ? h('span.nd-tag', 'T') : null, n.clip ? ND.icon('clip', 12) : null, n.alphaLock ? ND.icon('alpha', 12) : null, n.locked ? ND.icon('lock', 12) : null, n.blendMode !== 'normal' ? h('span.nd-tag', ND.Blend.label(n.blendMode)) : null, n.opacity < 1 ? h('span.nd-tag', Math.round(n.opacity * 100) + '%') : null);
        const row = h('div.nd-layer' + (n === d.active ? '.active' : '') + (n.isGroup ? '.group' : '') + (n.clip ? '.clipped' : '') + (!d.effectiveVisible(n) ? '.hidden' : ''), { draggable: true, style: { paddingLeft: 4 + depth * 14 + 'px' } }, eye, n.isGroup ? ND.icon('folder', 15) : null, thumb, mthumb, name, flags);
        row.addEventListener('click', () => d.setActive(n));
        row.addEventListener('dblclick', (e) => { e.stopPropagation(); rename(n, name); });
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); d.setActive(n); layerMenu(row); });
        row.addEventListener('dragstart', (e) => { dragNode = n; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', n.name); } catch (err) { /* ignore */ } });
        row.addEventListener('dragover', (e) => {
          if (!dragNode || dragNode === n) return;
          e.preventDefault();
          const r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
          row.classList.remove('drop-above', 'drop-below', 'drop-into');
          row.classList.add(n.isGroup && y > 0.3 && y < 0.7 ? 'drop-into' : y < 0.5 ? 'drop-above' : 'drop-below');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below', 'drop-into'));
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          const where = row.classList.contains('drop-into') ? 'into' : row.classList.contains('drop-above') ? 'above' : 'below';
          row.classList.remove('drop-above', 'drop-below', 'drop-into');
          if (dragNode) d.moveNode(dragNode, n, where);
          dragNode = null;
        });
        row.addEventListener('dragend', () => { dragNode = null; });
        listEl.appendChild(row);
      }
    }
    function drawThumb(c, n, mask) {
      const d = App.doc, x = c.getContext('2d'), s = Math.min(c.width / d.width, c.height / d.height), w = d.width * s, hh = d.height * s;
      if (mask) { x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.drawImage(n.mask, (c.width - w) / 2, (c.height - hh) / 2, w, hh); c._rev = n.rev; return; }
      x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = '#3a3d42'; x.fillRect((c.width - w) / 2, (c.height - hh) / 2, w, hh);
      x.fillStyle = '#2e3136';
      for (let i = 0; i < w; i += 5) for (let j = 0; j < hh; j += 5) if (((i + j) / 5) % 2 === 0) x.fillRect((c.width - w) / 2 + i, (c.height - hh) / 2 + j, Math.min(5, w - i), Math.min(5, hh - j));
      x.drawImage(n.canvas, (c.width - w) / 2, (c.height - hh) / 2, w, hh);
      c._rev = n.rev;
    }
    function refreshThumbs() {
      if (!listEl) return;
      const d = App.doc, rows = listEl.querySelectorAll('canvas.nd-thumb:not(.mask)'), list = d.displayList().filter((q) => q.node.isPixel);
      rows.forEach((c, i) => { const n = list[i] && list[i].node; if (n && c._rev !== n.rev) drawThumb(c, n); });
      const mrows = listEl.querySelectorAll('canvas.nd-thumb.mask'), ml = d.displayList().filter((q) => q.node.mask);
      mrows.forEach((c, i) => { const n = ml[i] && ml[i].node; if (n && c._rev !== n.rev) drawThumb(c, n, true); });
    }
    function rename(n, el) {
      const inp = h('input.nd-rename', { type: 'text', value: n.name });
      el.replaceWith(inp);
      inp.focus(); inp.select();
      const done = (ok) => { if (ok && inp.value.trim() && inp.value !== n.name) App.doc.setProps(n, { name: inp.value.trim() }, 'Rename Layer'); else renderList(); };
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true));
    }
    function layerMenu(anchor) {
      const d = App.doc, n = d.active, it = (label, fn) => h('button.nd-menu-item', { onclick: () => { C.closePopover(); fn(); } }, label);
      C.popover(anchor, h('div.nd-menu-list',
        it('Rename…', () => { const nm = window.prompt('Layer name', n.name); if (nm) d.setProps(n, { name: nm }, 'Rename Layer'); }),
        it('Duplicate', () => d.duplicateLayer()),
        it('Merge down', () => d.mergeDown()),
        it(n.clip ? 'Release clipping mask' : 'Clip to layer below', () => d.setProps(n, { clip: !n.clip }, 'Clipping Mask')),
        it('Select opaque pixels', () => d.changeSelection('Select Opaque', ND.Sel.opaque(d, n))),
        it('Layer style…', () => ND.AdjustPanel.layerStyle(n)),
        n.effects ? it('Clear layer style', () => d.setProps(n, { effects: null }, 'Clear Layer Style')) : null,
        n.mask ? null : it('Add mask (reveal all)', () => { d.addMask(false); }),
        n.mask ? null : it('Add mask (hide all)', () => { d.addMask(false, true); }),
        n.mask || !d.selectionMask ? null : it('Add mask from selection', () => d.addMask(true)),
        n.mask ? it('Invert mask', () => d.invertMask()) : null,
        n.mask ? it('Mask to selection', () => d.selectionFromMask()) : null,
        n.mask && n.isPixel ? it('Apply mask', () => d.applyMask()) : null,
        n.mask ? it('Delete mask', () => d.deleteMask()) : null,
        it('Export layer as PNG', () => App.exportLayerPNG()),
        it('Delete', () => d.deleteLayer())));
    }

    function adjustMenu(anchor) {
      const list = h('div.nd-menu-list');
      ND.Adjust.KINDS.forEach((k) => list.appendChild(h('button.nd-menu-item', { onclick: () => { C.closePopover(); App.addAdjustment(k.id); } }, h('span.nd-menu-chk', k.icon), h('span.nd-menu-label', k.label))));
      C.popover(anchor, list);
    }

    /* ---------------- history ---------------- */
    function renderHistory() {
      const d = App.doc, H = d.history;
      const list = h('div.nd-history');
      const mk = (label, i) => {
        const r = h('div.nd-hist' + (H.pos === i ? '.current' : H.pos < i ? '.future' : ''), label);
        r.addEventListener('click', () => H.jumpTo(i));
        list.appendChild(r);
      };
      mk('Document opened', 0);
      H.stack.forEach((e, i) => mk(e.label, i + 1));
      body.append(h('div.nd-row.space', h('span.nd-hint', H.stack.length + ' steps · ' + U.fmtBytes(H.bytes())), C.button('Clear', () => { if (window.confirm('Clear the undo history? This frees memory but cannot be undone.')) { H.clear(); render(); } }, { cls: 'sm' })), list);
      setTimeout(() => { const c = list.querySelector('.current'); if (c) c.scrollIntoView({ block: 'nearest' }); }, 0);
    }

    /* ---------------- navigator ---------------- */
    let navCv = null;
    function renderNav() {
      navCv = h('canvas.nd-nav', { width: 268, height: 180 });
      const drag = (e) => {
        const d = App.doc, r = navCv.getBoundingClientRect(), s = navScale();
        const px = ((e.clientX - r.left) / r.width) * navCv.width, py = ((e.clientY - r.top) / r.height) * navCv.height;
        const dx = (px - navOff().x) / s, dy = (py - navOff().y) / s, v = App.state.view;
        const ox = (dx - d.width / 2) * v.zoom * (v.mirror ? -1 : 1), oy = (dy - d.height / 2) * v.zoom;
        App.setView({ panX: -(ox * Math.cos(v.rot) - oy * Math.sin(v.rot)), panY: -(ox * Math.sin(v.rot) + oy * Math.cos(v.rot)) });
      };
      navCv.addEventListener('pointerdown', (e) => { navCv.setPointerCapture(e.pointerId); drag(e); const mv = (ev) => drag(ev), up = () => { navCv.removeEventListener('pointermove', mv); navCv.removeEventListener('pointerup', up); }; navCv.addEventListener('pointermove', mv); navCv.addEventListener('pointerup', up); });
      const v = () => App.state.view;
      const zs = C.slider('Zoom', { min: 0.02, max: 64, log: true, get: () => v().zoom, set: (z) => App.setView({ zoom: z }), fmt: (z) => Math.round(z * 100), toValue: (z) => z / 100, unit: '%' });
      const rs = C.slider('Rotate', { min: -180, max: 180, get: () => Math.round((((v().rot * 180) / Math.PI + 540) % 360) - 180), set: (a) => App.setView({ rot: (a * Math.PI) / 180 }), unit: '°' });
      const mir = C.check('Mirror view', () => v().mirror, (m) => App.setView({ mirror: m }));
      body.append(navCv, zs, rs, mir);
      navCtrls = [zs, rs, mir];
      drawNav();
    }
    let navCtrls = [];
    const navScale = () => { const d = App.doc; return Math.min(navCv.width / d.width, navCv.height / d.height); };
    const navOff = () => { const d = App.doc, s = navScale(); return { x: (navCv.width - d.width * s) / 2, y: (navCv.height - d.height * s) / 2 }; };
    function drawNav() {
      if (!navCv || !navCv.isConnected) return;
      const d = App.doc, x = navCv.getContext('2d'), s = navScale(), o = navOff();
      x.fillStyle = '#16171b'; x.fillRect(0, 0, navCv.width, navCv.height);
      x.fillStyle = '#2e3136'; x.fillRect(o.x, o.y, d.width * s, d.height * s);
      x.drawImage(d.getProjection(), o.x, o.y, d.width * s, d.height * s);
      const vp = document.getElementById('nd-viewport');
      if (vp && ND.View.toDoc) {
        const pts = [[0, 0], [vp.clientWidth, 0], [vp.clientWidth, vp.clientHeight], [0, vp.clientHeight]].map(([a, b]) => ND.View.toDoc(a, b));
        x.strokeStyle = '#ff5fa2'; x.lineWidth = 1.5; x.beginPath();
        pts.forEach((p, i) => (i ? x.lineTo(o.x + p.x * s, o.y + p.y * s) : x.moveTo(o.x + p.x * s, o.y + p.y * s)));
        x.closePath(); x.stroke();
      }
      navCtrls.forEach((c) => c.refresh());
    }

    const refreshSoon = U.debounce(() => {
      if (tab === 'layers') { renderProps(); renderList(); }
      else if (tab === 'history') render();
    }, 30);
    const thumbsSoon = U.debounce(() => { if (tab === 'layers') refreshThumbs(); if (tab === 'nav') drawNav(); }, 250);
    App.on('doc', (t) => { if (t === 'layers' || t === 'active' || t === 'history' || t === 'resize') refreshSoon(); thumbsSoon(); });
    App.on('docchange', render);
    App.on('view', () => { if (tab === 'nav') drawNav(); });
    App.on('frame', () => { if (tab === 'nav' && App.doc && App.doc.dirty === null) thumbsSoon(); });
    render();
  }
})();
