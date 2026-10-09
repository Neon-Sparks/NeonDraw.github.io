/* Neon Draw — small reusable UI controls. Each control exposes refresh() to pull its value from state. */
'use strict';
(function () {
  const U = ND.U, h = U.h;
  const C = {};

  /* slider with an editable number. o: {min,max,step,get,set,fmt,unit,log,title,wide} */
  C.slider = function (label, o) {
    const toPos = (v) => (o.log ? (Math.log(v) - Math.log(o.min)) / (Math.log(o.max) - Math.log(o.min)) * 1000 : v);
    const fromPos = (p) => (o.log ? Math.exp(Math.log(o.min) + (p / 1000) * (Math.log(o.max) - Math.log(o.min))) : +p);
    const range = h('input', { type: 'range', min: o.log ? 0 : o.min, max: o.log ? 1000 : o.max, step: o.log ? 1 : o.step || 1 });
    const num = h('input.nd-num', { type: 'text', inputmode: 'decimal', title: 'Type a value, or drag the slider' });
    const fmt = o.fmt || ((v) => String(Math.round(v * 100) / 100));
    const el = h('label.nd-slider' + (o.wide ? '.wide' : ''), { title: o.title || '' }, h('span.nd-lbl', label), range, num, o.unit ? h('span.nd-unit', o.unit) : null);
    const set = (v) => { v = U.clamp(v, o.min, o.max); if (o.step && !o.log) v = Math.round(v / o.step) * o.step; o.set(v); };
    range.addEventListener('input', () => { const v = fromPos(range.value); set(o.log ? (v < 10 ? Math.round(v * 10) / 10 : Math.round(v)) : v); num.value = fmt(o.get()); });
    num.addEventListener('change', () => { const v = parseFloat(num.value); if (!isNaN(v)) set(o.toValue ? o.toValue(v) : v); el.refresh(); });
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') num.blur(); e.stopPropagation(); });
    // drag on the number to scrub
    let sx = null, sv = 0;
    num.addEventListener('pointerdown', (e) => { if (document.activeElement === num) return; sx = e.clientX; sv = o.get(); num.setPointerCapture(e.pointerId); });
    num.addEventListener('pointermove', (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 2) { e.preventDefault(); const span = o.max - o.min; set(o.log ? sv * Math.pow(1.01, dx) : sv + (dx / 200) * span); el.refresh(); num.dataset.dragged = '1'; }
    });
    num.addEventListener('pointerup', () => { if (sx !== null && !num.dataset.dragged) num.focus(), num.select(); sx = null; delete num.dataset.dragged; });
    el.refresh = () => { const v = o.get(); if (document.activeElement !== range) range.value = toPos(v); if (document.activeElement !== num) num.value = fmt(v); };
    el.refresh();
    return el;
  };

  C.check = function (label, get, set, title) {
    const box = h('input', { type: 'checkbox' });
    const el = h('label.nd-check', { title: title || '' }, box, h('span', label));
    box.addEventListener('change', () => set(box.checked));
    el.refresh = () => { box.checked = !!get(); };
    el.refresh();
    return el;
  };

  // options: [[value, label], …] or [{value,label,group}]
  C.select = function (label, options, get, set, title) {
    const sel = h('select');
    let grp = null, cur = null;
    options.forEach((o) => {
      const v = Array.isArray(o) ? o[0] : o.value, l = Array.isArray(o) ? o[1] : o.label, g = Array.isArray(o) ? null : o.group;
      const opt = h('option', { value: v }, l);
      if (g) { if (g !== cur) { cur = g; grp = h('optgroup', { label: g }); sel.appendChild(grp); } grp.appendChild(opt); }
      else sel.appendChild(opt);
    });
    sel.addEventListener('change', () => set(sel.value));
    sel.addEventListener('keydown', (e) => e.stopPropagation());
    const el = label ? h('label.nd-select', { title: title || '' }, h('span.nd-lbl', label), sel) : h('span.nd-select', { title: title || '' }, sel);
    el.refresh = () => { sel.value = get() == null ? '' : String(get()); };
    el.sel = sel;
    el.refresh();
    return el;
  };

  // Segmented buttons. items: [[value, label|iconName, title]]
  C.segmented = function (items, get, set, icons) {
    const el = h('div.nd-seg');
    const btns = items.map(([v, l, t]) => {
      const b = h('button.nd-btn.sm', { title: t || l, type: 'button' }, icons && ND.hasIcon(l) ? ND.icon(l, 16) : l);
      b.addEventListener('click', () => { set(v); el.refresh(); });
      b.dataset.v = v;
      el.appendChild(b);
      return b;
    });
    el.refresh = () => btns.forEach((b) => b.classList.toggle('active', String(get()) === b.dataset.v));
    el.refresh();
    return el;
  };

  C.button = function (label, onClick, o) {
    o = o || {};
    const b = h('button.nd-btn' + (o.cls ? '.' + o.cls : ''), { type: 'button', title: o.title || (typeof label === 'string' ? label : '') });
    if (o.icon) b.appendChild(ND.icon(o.icon, o.iconSize || 16));
    if (label) b.appendChild(h('span', label));
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
    return b;
  };
  C.iconButton = function (icon, title, onClick, cls) {
    const b = h('button.nd-ibtn' + (cls ? '.' + cls : ''), { type: 'button', title });
    b.appendChild(ND.icon(icon, 16));
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
    return b;
  };
  C.colourInput = function (get, set, title) {
    const inp = h('input.nd-colour', { type: 'color', title: title || 'Pick a colour' });
    inp.addEventListener('input', () => set(inp.value));
    inp.refresh = () => { inp.value = get(); };
    inp.refresh();
    return inp;
  };
  // Collapsible section with a persisted open/closed state.
  C.section = function (id, title, body, extra) {
    const st = ND.App.state;
    const head = h('div.nd-sec-head', h('span.nd-caret', '▾'), h('span', title), extra || null);
    const el = h('div.nd-section', head, body);
    const apply = () => el.classList.toggle('collapsed', !!st.collapsed[id]);
    head.addEventListener('click', (e) => { if (e.target.closest('button,input,select')) return; st.collapsed[id] = !st.collapsed[id]; apply(); ND.App.savePrefsSoon(); });
    apply();
    return el;
  };
  C.hint = (t) => h('span.nd-hint', t);
  C.sep = () => h('span.nd-vsep');

  /* simple popover anchored to an element */
  C.popover = function (anchor, content, o) {
    C.closePopover();
    o = o || {};
    const pop = h('div.nd-popover' + (o.cls ? '.' + o.cls : ''), content);
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = r.left, y = r.bottom + 6;
    if (x + pw > window.innerWidth - 8) x = window.innerWidth - pw - 8;
    if (y + ph > window.innerHeight - 8) y = Math.max(8, r.top - ph - 6);
    pop.style.left = Math.max(8, x) + 'px';
    pop.style.top = y + 'px';
    const close = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) C.closePopover(); };
    setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
    C._pop = { pop, close };
    return pop;
  };
  C.closePopover = function () {
    if (!C._pop) return;
    document.removeEventListener('pointerdown', C._pop.close, true);
    C._pop.pop.remove();
    C._pop = null;
  };

  ND.C = C;
})();
