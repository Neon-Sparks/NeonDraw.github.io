/* Neon Sparks Draw — command palette (Ctrl+K): type to find any menu command, tool, brush, filter,
 * adjustment, layer or recent file, then press Enter. */
'use strict';
(function () {
  const U = ND.U, h = U.h, App = ND.App;
  const K = { el: null };
  const MAX_SHOWN = 60;

  // Everything the palette can run. Built fresh on each open so it reflects the current state.
  function collect() {
    const out = [], menus = ND.Menus.menus();
    Object.keys(menus).forEach((name) => {
      const def = menus[name], items = typeof def === 'function' ? def() : def;
      let head = '';
      items.forEach((it) => {
        if (it.head) { head = it.head; return; }
        if (it.sep || !it.run) return;
        const check = it.check ? (it.check() ? ' ✓' : '') : '';
        const T = ND.Lang ? ND.Lang.t : (x) => x, tl = T(it.label);
        out.push({ id: 'menu:' + name + ':' + it.label, label: tl.replace(/…$/, '') + check, en: tl !== it.label ? it.label : '', cat: T(name) + (head ? ' ▸ ' + T(head) : ''), key: it.key, run: it.run, needsDoc: name !== 'File' && name !== 'Help' });
      });
    });
    App.TOOLS.forEach((t) => out.push({ id: 'tool:' + t.id, label: t.label, cat: 'Tool', key: t.key, icon: t.icon, run: () => App.setTool(t.id), needsDoc: true }));
    App.customPresets.concat(ND.Presets.LIST).forEach((p) => out.push({ id: 'brush:' + p.name, label: p.name, cat: 'Brush ▸ ' + p.cat, run: () => App.loadPreset(p) }));
    if (App.doc) {
      App.doc.allNodes().forEach((n) => out.push({ id: 'layer:' + n.id, label: n.name, cat: 'Go to layer', run: () => App.doc.setActive(n), needsDoc: true, volatile: true }));
    }
    (ND.Files && ND.Files.recentList ? ND.Files.recentList() : []).forEach((r) => out.push({ id: 'recent:' + r.name, label: r.name, cat: 'Open recent', run: () => ND.Files.openRecent(r), volatile: true }));
    return out;
  }

  // Fuzzy score: whole-word and prefix matches beat scattered letters; label beats category.
  function score(item, q) {
    if (!q) return 0;
    const L = (item.label + (item.en ? ' ' + item.en : '')).toLowerCase(), C = item.cat.toLowerCase(); // translated and English words both match
    let s = 0;
    for (const w of q.split(/\s+/).filter(Boolean)) {
      let best = -1;
      const i = L.indexOf(w);
      if (i === 0) best = 100; else if (i > 0) best = /[\s(/▸-]/.test(L[i - 1]) ? 80 : 55;
      if (best < 0 && C.includes(w)) best = 30;
      if (best < 0) {
        // letters in order (e.g. "gblr" → Gaussian blur)
        let j = 0, gaps = 0, last = -1;
        for (let k = 0; k < L.length && j < w.length; k++) if (L[k] === w[j]) { if (last >= 0 && k > last + 1) gaps++; last = k; j++; }
        if (j === w.length) best = Math.max(5, 25 - gaps * 4);
      }
      if (best < 0) return -1;
      s += best;
    }
    return s - item.label.length * 0.05;
  }

  K.isOpen = () => !!K.el;
  K.close = function () { if (K.el) { K.el.remove(); K.el = null; } };
  K.open = function (initial) {
    K.close();
    if (ND.Dialogs.isOpen()) ND.Dialogs.close();
    const items = collect();
    const input = h('input.nd-cmd-input', { type: 'text', placeholder: 'Type a command, tool, brush, filter or layer…', spellcheck: false, autocomplete: 'off' });
    const list = h('div.nd-cmd-list', { role: 'listbox' });
    const foot = h('div.nd-cmd-foot', h('span', '↑↓ choose'), h('span', 'Enter run'), h('span', 'Esc close'));
    const box = h('div.nd-cmd', { role: 'dialog', 'aria-label': 'Command palette' }, input, list, foot);
    const back = h('div.nd-cmd-back', box);
    let shown = [], sel = 0;

    const render = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        const rec = (App.state.recentCommands || []).map((id) => items.find((it) => it.id === id)).filter(Boolean);
        const tips = ['menu:Select:Select and Mask…', 'menu:Select:Select subject', 'menu:File:Save', 'menu:Filter:Gaussian Blur…', 'tool:smartsel', 'menu:Layer:New layer'];
        shown = rec.concat(tips.map((id) => items.find((it) => it.id === id)).filter((it) => it && !rec.includes(it)));
        if (!shown.length) shown = items.slice(0, 12);
      } else {
        shown = items.map((it) => ({ it, s: score(it, q) })).filter((r) => r.s >= 0).sort((a, b) => b.s - a.s).slice(0, MAX_SHOWN).map((r) => r.it);
      }
      sel = U.clamp(sel, 0, Math.max(0, shown.length - 1));
      U.clear(list);
      if (!q && shown.length) list.appendChild(h('div.nd-cmd-head', (App.state.recentCommands || []).length ? 'Recent & suggested' : 'Suggested'));
      if (!shown.length) list.appendChild(h('div.nd-cmd-empty', 'Nothing matches “' + input.value + '”'));
      shown.forEach((it, i) => {
        const row = h('div.nd-cmd-row' + (i === sel ? '.sel' : '') + (it.needsDoc && !App.doc ? '.off' : ''), { role: 'option' },
          it.icon ? ND.icon(it.icon, 15) : h('span.nd-cmd-dot'), h('span.nd-cmd-label', it.label), h('span.nd-cmd-cat', it.cat), it.key ? h('kbd', it.key) : null);
        row.addEventListener('pointerenter', () => { if (sel !== i) { sel = i; mark(); } });
        row.addEventListener('click', () => run(it));
        list.appendChild(row);
      });
    };
    const mark = () => {
      list.querySelectorAll('.nd-cmd-row').forEach((r, i) => r.classList.toggle('sel', i === sel));
      const r = list.querySelectorAll('.nd-cmd-row')[sel];
      if (r) r.scrollIntoView({ block: 'nearest' });
    };
    const run = (it) => {
      if (!it) return;
      if (it.needsDoc && !App.doc) return App.toast('Open or create a document first');
      K.close();
      if (!it.volatile) App.set('recentCommands', [it.id].concat((App.state.recentCommands || []).filter((x) => x !== it.id)).slice(0, 8));
      try { it.run(); } catch (e) { console.error(e); App.toast('Could not run “' + it.label + '”: ' + e.message, 3000); }
    };
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === 'PageDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 8); mark(); }
      else if (e.key === 'PageUp') { e.preventDefault(); sel = Math.max(0, sel - 8); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(shown[sel]); }
      else if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); K.close(); }
    });
    back.addEventListener('pointerdown', (e) => { if (e.target === back) K.close(); });
    document.body.appendChild(back);
    K.el = back;
    if (initial) input.value = initial;
    render();
    setTimeout(() => input.focus(), 0);
  };
  K._score = score; // for tests

  ND.Command = K;
})();
