/* Neon Sparks Draw — Actions: record a series of steps once and play them again on any picture, or on a whole batch
 * of files. Recorded: filters (with their settings), adjustment layers (with their final settings), image
 * size / canvas size / crop / flip / rotate, retouch actions and menu commands. Brush strokes are not recorded. */
'use strict';
(function () {
  const U = ND.U, h = U.h, C = ND.C, App = ND.App;
  const KEY = 'nd-actions';
  const A = { list: ND.Store.getJSON(KEY, []), rec: null, depth: 0, sel: 0 };
  const save = () => ND.Store.setJSON(KEY, A.list);
  // App commands that are recorded (with their arguments) when called directly, e.g. from a dialog
  const CALLS = {
    applyFilter: (id, p) => 'Filter: ' + ((ND.Filters.byId(id) || {}).label || id) + summary(p),
    addFilterLayer: (id, p) => 'Filter layer: ' + ((ND.Filters.byId(id) || {}).label || id) + summary(p),
    scaleImage: (w, hh) => 'Image size ' + w + ' × ' + hh,
    canvasSize: (w, hh) => 'Canvas size ' + w + ' × ' + hh,
    flipRotateImage: (op) => ({ flipH: 'Flip horizontal', flipV: 'Flip vertical', rot90: 'Rotate 90° clockwise', rot270: 'Rotate 90° anticlockwise', rot180: 'Rotate 180°' })[op] || op,
    cropTo: (r) => 'Crop to ' + r.w + ' × ' + r.h,
    frequencySeparation: (r) => 'Frequency separation' + (r ? ' (' + r + ' px)' : ''),
    highPassSharpen: () => 'High-pass sharpen', dodgeBurnLayer: () => 'Dodge & burn layer', smoothSkin: () => 'Smooth skin',
  };
  function summary(p) { const k = p ? Object.keys(p) : []; return k.length ? ' (' + k.slice(0, 3).map((q) => q + ' ' + (typeof p[q] === 'number' ? Math.round(p[q] * 100) / 100 : p[q])).join(', ') + ')' : ''; }
  Object.keys(CALLS).forEach((fn) => {
    const orig = App[fn];
    if (typeof orig !== 'function') return;
    App[fn] = function (...args) {
      if (A.rec && A.depth === 0) A.rec.steps.push({ t: 'call', fn, args: JSON.parse(JSON.stringify(args)), label: CALLS[fn](...args) });
      A.depth++;
      try { return orig.apply(this, args); } finally { A.depth--; }
    };
  });
  // adjustment layers: recorded with the settings they have when recording stops
  const addAdj = ND.Doc.prototype.addAdjustment;
  ND.Doc.prototype.addAdjustment = function (kind, params) {
    const n = addAdj.call(this, kind, params);
    if (A.rec && A.depth === 0) A.rec.steps.push({ t: 'adj', kind, params: JSON.parse(JSON.stringify(params || {})), node: n, label: 'Adjustment layer: ' + ND.Adjust.label(kind) });
    return n;
  };
  // menu commands (not the ones that open a window — what those windows do is recorded above)
  const SKIP = ['File', 'Help', 'Options', 'View'];
  A.menuCommand = function (menu, it) {
    const label = it.label || '';
    if (!A.rec || SKIP.includes(menu) || /…$/.test(label) || /^(Undo|Redo|Repeat)/.test(label)) return false;
    A.rec.steps.push({ t: 'menu', menu, label, labelShow: menu + ' ▸ ' + label });
    return true;
  };
  A.wrapRun = function (menu, it) {
    const recorded = A.menuCommand(menu, it);
    if (recorded) A.depth++;
    try { return it.run(); } finally { if (recorded) A.depth--; }
  };

  A.start = function () {
    const name = window.prompt('Name for the new action', 'My action ' + (A.list.length + 1));
    if (!name) return;
    A.rec = { name, steps: [] };
    App.toast('Recording “' + name + '” — use filters, adjustments, image and layer commands, then press Stop', 5000);
    render();
  };
  A.stop = function () {
    if (!A.rec) return;
    A.rec.steps.forEach((s) => { if (s.node) { s.params = JSON.parse(JSON.stringify(s.node.params || s.params)); s.opacity = s.node.opacity; delete s.node; } });
    if (A.rec.steps.length) { A.list.push(A.rec); A.sel = A.list.length - 1; save(); App.toast('Action “' + A.rec.name + '” saved with ' + A.rec.steps.length + ' step' + (A.rec.steps.length > 1 ? 's' : '')); }
    else App.toast('Nothing was recorded');
    A.rec = null;
    render();
  };
  const findMenuItem = (menu, label) => { const def = ND.Menus.menus()[menu]; const items = typeof def === 'function' ? def() : def || []; return items.find((i) => i.label === label); };
  A.play = async function (action, quiet) {
    action = action || A.list[A.sel];
    if (!action || !App.doc) return false;
    let done = 0;
    A.depth++;
    try {
      for (const s of action.steps) {
        if (s.t === 'call' && typeof App[s.fn] === 'function') await App[s.fn](...JSON.parse(JSON.stringify(s.args)));
        else if (s.t === 'adj') { const n = App.doc.addAdjustment(s.kind, JSON.parse(JSON.stringify(s.params))); if (s.opacity != null) n.opacity = s.opacity; }
        else if (s.t === 'menu') { const it = findMenuItem(s.menu, s.label); if (it) await it.run(); }
        done++;
        App.doc.invalidateAll();
      }
    } catch (e) { console.error(e); App.toast('Action stopped at step ' + (done + 1) + ': ' + e.message, 5000); return false; } finally { A.depth--; }
    ND.View.request();
    if (!quiet) App.toast('Played “' + action.name + '” (' + done + ' step' + (done === 1 ? '' : 's') + ')');
    return true;
  };
  // Batch: open each file, play the action, save the result, all into one .zip
  A.batch = function () {
    const action = A.list[A.sel];
    if (!action) return App.toast('Record or pick an action first');
    let fmt = 'png';
    const body = h('div.nd-col', h('p', 'Plays “' + action.name + '” on every file you pick and saves the results in one .zip file. Your open documents aren’t changed.'),
      C.segmented([['png', 'PNG'], ['jpeg', 'JPEG'], ['webp', 'WebP']], () => fmt, (v) => { fmt = v; }));
    ND.Dialogs.modal('Batch process', body, [{ label: 'Cancel' }, { label: 'Choose files…', primary: true, action: () => {
      const inp = h('input', { type: 'file', accept: 'image/*,.psd,.ora,.kra,.tif,.tiff,.ndraw', multiple: true });
      inp.addEventListener('change', () => run(Array.from(inp.files), action, fmt));
      inp.click();
    } }]);
  };
  async function run(files, action, fmt) {
    if (!files.length) return;
    const back = App.doc, UI = ND.AIUI, out = [];
    let cancelled = false;
    UI.busy('Batch…', () => { cancelled = true; });
    for (let i = 0; i < files.length && !cancelled; i++) {
      UI.busy('Batch — ' + (i + 1) + ' of ' + files.length + ': ' + files[i].name, () => { cancelled = true; });
      const before = App.docs.length;
      await App.openFile(files[i]);
      if (App.docs.length === before && App.doc === back) continue; // could not open
      const d = App.doc;
      await A.play(action, true);
      let c = d.flatCopy();
      if (fmt === 'jpeg') { const j = U.canvas(c.width, c.height), x = U.ctx(j); x.fillStyle = '#fff'; x.fillRect(0, 0, j.width, j.height); x.drawImage(c, 0, 0); c = j; }
      const blob = await U.canvasToBlob(c, 'image/' + fmt, 0.92);
      out.push({ name: files[i].name.replace(/\.[^.]+$/, '') + '.' + (fmt === 'jpeg' ? 'jpg' : fmt), data: new Uint8Array(await blob.arrayBuffer()) });
      App.closeDoc(d, true);
    }
    UI.idle();
    if (back && App.docs.includes(back)) App.showDoc(back);
    if (out.length) { U.download(U.safeName(action.name) + '-batch.zip', ND.Store.zip(out)); App.toast('Batch done — ' + out.length + ' file' + (out.length > 1 ? 's' : '') + ' saved in the .zip'); }
  }

  /* ---------- panel ---------- */
  let listEl = null, stepsEl = null, recBtn = null;
  function render() {
    if (!listEl) return;
    U.clear(listEl); U.clear(stepsEl);
    if (!A.list.length) listEl.appendChild(h('div.nd-hint', 'No actions yet. Press Record, do the steps (filters, adjustments, image size…), then Stop.'));
    A.list.forEach((a, i) => {
      const row = h('div.nd-path-row' + (i === A.sel ? '.active' : ''), ND.icon('play', 13), h('span.nd-layer-name', a.name), h('span.nd-tag', a.steps.length + ''));
      row.addEventListener('click', () => { A.sel = i; render(); });
      row.addEventListener('dblclick', () => { const n = window.prompt('Action name', a.name); if (n) { a.name = n; save(); render(); } });
      listEl.appendChild(row);
    });
    const a = A.rec || A.list[A.sel];
    if (a) a.steps.forEach((s, i) => {
      const x = h('span.nd-tab-x', { title: 'Remove this step' }, '×');
      x.addEventListener('click', () => { a.steps.splice(i, 1); if (!A.rec) save(); render(); });
      stepsEl.appendChild(h('div.nd-actstep', h('span', (i + 1) + '. ' + (s.labelShow || s.label)), A.rec ? null : x));
    });
    recBtn.lastChild.textContent = A.rec ? 'Stop' : 'Record';
    recBtn.classList.toggle('rec', !!A.rec);
  }
  A.build = function (root) {
    listEl = h('div.nd-paths'); stepsEl = h('div.nd-actsteps');
    recBtn = C.button('Record', () => (A.rec ? A.stop() : A.start()), { cls: 'sm', icon: 'pin', title: 'Start / stop recording a new action' });
    const body = h('div.nd-col',
      h('div.nd-row.tight', recBtn,
        C.button('Play', () => A.play(), { cls: 'sm primary', icon: 'play', title: 'Play the selected action on this picture' }),
        C.button('Batch…', () => A.batch(), { cls: 'sm', title: 'Play the action on many files and save them all' }),
        C.iconButton('trash', 'Delete the selected action', () => { const x = A.list[A.sel]; if (x && window.confirm('Delete the action “' + x.name + '”?')) { A.list.splice(A.sel, 1); A.sel = 0; save(); render(); } }, 'tiny')),
      listEl, h('div.nd-mini-title', 'Steps'), stepsEl);
    root.appendChild(C.section('actions', 'Actions', body));
    render();
  };
  ND.Actions = A;
})();
