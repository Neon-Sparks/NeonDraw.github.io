/* Neon Draw — right-hand panel area: one or two columns, and drag & drop of panels between them.
 * Panels (Colour, Brush presets, Brush settings, Adjustments, Properties) are dragged by their title
 * bar; the Layers panel by the grip in its tab bar (it always sits at the bottom of its column). */
'use strict';
(function () {
  const U = ND.U, h = U.h, App = ND.App;
  const D = {};
  const IDS = ['colour', 'presets', 'brushsettings', 'adjustments', 'properties'];
  const DEFAULT = () => ({ col1: ['colour', 'presets', 'brushsettings'], col2: ['adjustments', 'properties'], layers: 2 });

  // the saved arrangement, repaired if panels were added or removed since it was saved
  D.arrangement = function () {
    const L = App.state.dockLayout;
    if (!L || !Array.isArray(L.col1) || !Array.isArray(L.col2)) return DEFAULT();
    const seen = new Set(), clean = (a) => a.filter((id) => IDS.includes(id) && !seen.has(id) && seen.add(id));
    const out = { col1: clean(L.col1), col2: clean(L.col2), layers: L.layers === 1 ? 1 : 2 };
    IDS.forEach((id) => { if (!seen.has(id)) out[DEFAULT().col1.includes(id) ? 'col1' : 'col2'].push(id); });
    return out;
  };
  const save = (L) => App.set('dockLayout', L);

  D.init = function (dock) {
    const scroll1 = document.getElementById('nd-dock-scroll'), layersBox = document.getElementById('nd-dock-layers');
    const scroll2 = h('div.nd-dock-scroll.nd-dock-scroll2');
    const col1 = h('div.nd-dock-col.nd-dock-col1'), col2 = h('div.nd-dock-col.nd-dock-col2', scroll2);
    dock.insertBefore(col1, scroll1);
    col1.append(scroll1, layersBox);
    dock.appendChild(col2);
    const sections = () => { const m = {}; dock.querySelectorAll('.nd-section').forEach((s) => { m[s.dataset.sec] = s; }); return m; };

    D.colsNow = () => (App.state.dockCols === 2 && window.innerWidth >= 1000 ? 2 : 1);
    D.layout = function () {
      const two = D.colsNow() === 2, L = D.arrangement(), S = sections();
      dock.classList.toggle('two', two);
      if (two) {
        L.col1.forEach((id) => S[id] && scroll1.appendChild(S[id]));
        L.col2.forEach((id) => S[id] && scroll2.appendChild(S[id]));
        (L.layers === 1 ? col1 : col2).appendChild(layersBox);
      } else {
        L.col1.concat(L.col2).forEach((id) => S[id] && scroll1.appendChild(S[id]));
        col1.appendChild(layersBox);
      }
      col1.classList.toggle('has-layers', layersBox.parentNode === col1);
      col2.classList.toggle('has-layers', layersBox.parentNode === col2);
      dock.style.width = (App.state.dockWidth || 300) * (two ? 2 : 1) + 'px';
      if (ND.Toolbar && ND.Toolbar.layoutToolbox) ND.Toolbar.layoutToolbox();
      if (ND.View) ND.View.request();
    };
    D.setCols = (n) => { App.set('dockCols', n); D.layout(); };
    D.reset = () => { save(DEFAULT()); D.layout(); App.toast('Panel layout reset'); };

    /* ---------- drag & drop ---------- */
    const line = h('div.nd-dock-drop'), ghost = h('div.nd-dock-ghost');
    let drag = null, suppressClick = false;
    // where would a drop at (x, y) go? → { scroll, index, col } (index among that column's panels)
    function target(x, y, exclude) {
      const two = dock.classList.contains('two');
      const cols = two ? [[col1, scroll1, 1], [col2, scroll2, 2]] : [[col1, scroll1, 1]];
      let best = cols[0];
      for (const c of cols) { const r = c[0].getBoundingClientRect(); if (x >= r.left && x <= r.right) best = c; }
      const [col, scroll, n] = best;
      const items = Array.from(scroll.children).filter((s) => s.classList.contains('nd-section') && s !== exclude);
      let index = items.length;
      for (let i = 0; i < items.length; i++) { const r = items[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { index = i; break; } }
      return { col, scroll, n, items, index };
    }
    function showLine(t) {
      const dr = dock.getBoundingClientRect(), sr = t.scroll.getBoundingClientRect();
      let y;
      if (drag.kind === 'layers') { const r = t.col.getBoundingClientRect(); y = r.bottom - 4; }
      else if (t.index < t.items.length) y = t.items[t.index].getBoundingClientRect().top;
      else y = t.items.length ? t.items[t.items.length - 1].getBoundingClientRect().bottom : sr.top + 4;
      line.style.left = sr.left - dr.left + 6 + 'px';
      line.style.width = sr.width - 12 + 'px';
      line.style.top = U.clamp(y - dr.top, 0, dr.height - 3) + 'px';
      line.style.display = 'block';
    }
    function start(e, el, kind, label) {
      drag = { el, kind, label, sx: e.clientX, sy: e.clientY, moving: false, id: e.pointerId };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', end, true);
      window.addEventListener('pointercancel', end, true);
    }
    function move(e) {
      if (!drag) return;
      if (!drag.moving) {
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 6) return;
        drag.moving = true;
        dock.classList.add('dnd');
        ghost.textContent = drag.label;
        document.body.append(ghost);
        dock.appendChild(line);
        if (drag.kind === 'section') drag.el.classList.add('dnd-src');
      }
      e.preventDefault();
      ghost.style.left = e.clientX + 12 + 'px'; ghost.style.top = e.clientY + 8 + 'px';
      const t = target(e.clientX, e.clientY, drag.el);
      // near the top or bottom of a long column: scroll it so any position can be reached
      const sr = t.scroll.getBoundingClientRect();
      if (e.clientY < sr.top + 36) t.scroll.scrollTop -= 14; else if (e.clientY > sr.bottom - 36) t.scroll.scrollTop += 14;
      showLine(t);
    }
    function end(e) {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      if (!drag) return;
      const d = drag;
      drag = null;
      if (!d.moving) return;
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
      dock.classList.remove('dnd'); ghost.remove(); line.remove(); line.style.display = 'none';
      if (d.kind === 'section') d.el.classList.remove('dnd-src');
      const t = target(e.clientX, e.clientY, d.el);
      const L = D.arrangement();
      if (d.kind === 'layers') {
        L.layers = t.n;
      } else {
        const id = d.el.dataset.sec;
        L.col1 = L.col1.filter((q) => q !== id); L.col2 = L.col2.filter((q) => q !== id);
        const before = t.items[t.index] ? t.items[t.index].dataset.sec : null;
        if (dock.classList.contains('two')) {
          const list = t.n === 1 ? L.col1 : L.col2;
          const i = before ? list.indexOf(before) : -1;
          list.splice(i < 0 ? list.length : i, 0, id);
        } else {
          // one column: the panel joins the column group of the panel it was dropped before
          const inCol1 = before ? L.col1.includes(before) : false;
          const list = before ? (inCol1 ? L.col1 : L.col2) : L.col2.length ? L.col2 : L.col1;
          const i = before ? list.indexOf(before) : list.length;
          list.splice(i, 0, id);
        }
      }
      save(L);
      D.layout();
    }
    // section title bars start a drag; a plain click still collapses / expands
    dock.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const head = e.target.closest('.nd-sec-head');
      if (head && !e.target.closest('button,input,select') && dock.contains(head)) {
        const sec = head.closest('.nd-section');
        start(e, sec, 'section', head.textContent.replace('▾', '').trim());
        return;
      }
      const grip = e.target.closest('.nd-layers-grip');
      if (grip) start(e, layersBox, 'layers', 'Layers');
    });
    dock.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);
    // grip in the Layers tab bar (only useful with two columns)
    const tabs = layersBox.querySelector('.nd-tabs');
    if (tabs) tabs.insertBefore(h('span.nd-layers-grip', { title: 'Drag to move the Layers panel to the other column' }, '⋮⋮'), tabs.firstChild);

    D.layout();
    window.addEventListener('resize', U.debounce(() => D.layout(), 150));
  };

  ND.Dock = D;
})();
