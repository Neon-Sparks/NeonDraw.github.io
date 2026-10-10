/* Neon Sparks Draw — Options menu helpers: AI defaults, graphics card settings and status, saved workspace layouts. */
'use strict';
(function () {
  const U = ND.U, h = U.h, App = ND.App;
  const O = {};
  const WS_KEY = 'nd-workspaces';
  // the parts of the state that make up the window layout
  const LAYOUT = ['toolboxMode', 'toolboxCols', 'toolboxPos', 'dockCols', 'dockLayout', 'dockWidth', 'collapsed', 'showTimeline', 'rulers', 'lockToolbox', 'lockPanels', 'hideUI'];
  const DEFAULT_LAYOUT = {};
  LAYOUT.forEach((k) => { DEFAULT_LAYOUT[k] = JSON.parse(JSON.stringify(App.state[k] === undefined ? null : App.state[k])); }); // before saved prefs are loaded
  O.workspaces = () => ND.Store.getJSON(WS_KEY, {});
  O.saveWorkspace = function () {
    const name = window.prompt('Name for this workspace layout', 'My layout');
    if (!name) return;
    const all = O.workspaces(), snap = {};
    LAYOUT.forEach((k) => { snap[k] = JSON.parse(JSON.stringify(App.state[k] === undefined ? null : App.state[k])); });
    all[name] = snap;
    ND.Store.setJSON(WS_KEY, all);
    App.toast('Workspace “' + name + '” saved — Options ▸ Workspace to switch to it');
  };
  // apply a layout: saved as preferences, then the window is rebuilt (your work is autosaved first)
  O.applyLayout = async function (snap, label) {
    LAYOUT.forEach((k) => { if (k in snap) App.state[k] = JSON.parse(JSON.stringify(snap[k])); });
    App.savePrefs();
    App.toast('Switching to ' + label + '…', 4000);
    await App.autosaveNow(true);
    setTimeout(() => location.reload(), 150);
  };
  O.loadWorkspace = (name) => { const s = O.workspaces()[name]; if (s) O.applyLayout(s, '“' + name + '”'); };
  O.deleteWorkspace = function () {
    const names = Object.keys(O.workspaces());
    if (!names.length) return App.toast('No saved layouts yet');
    const n = window.prompt('Delete which layout? (' + names.join(', ') + ')', names[0]);
    if (!n) return;
    const all = O.workspaces();
    if (!all[n]) return App.toast('No layout called “' + n + '”');
    delete all[n]; ND.Store.setJSON(WS_KEY, all); App.toast('Layout “' + n + '” deleted');
  };
  O.resetLayout = () => O.applyLayout(DEFAULT_LAYOUT, 'the default layout');

  /* ---------- graphics card ---------- */
  O.applyGPU = function () {
    const s = App.state;
    if (ND.GPU) { ND.GPU.enabled = s.gpuBlend !== false || s.gpuAdjust !== false; ND.GPU.blendOn = s.gpuBlend !== false; ND.GPU.adjustEnabled = s.gpuAdjust !== false; }
    if (ND.AI) ND.AI.noGpu = s.gpuAI === false;
    ND.Doc.gpuFx = s.gpuFx !== false;
    if (ND.GPUFX && s.gpuFx !== false) ND.GPUFX.enabled = true; // turning it back on retries the graphics card
    // layer-style results were made the other way: work them out again
    for (const d of App.docs || [App.doc]) if (d) for (const n of d.walk()) n._fxc = null;
    if (App.doc) { App.doc.invalidateAll(); ND.View.request(); }
  };
  O.gpuStatus = function () {
    let renderer = 'unknown', webgl2 = false, soft = false;
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl2');
      webgl2 = !!gl;
      if (gl) { const ext = gl.getExtension('WEBGL_debug_renderer_info'); renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); soft = /swiftshader|llvmpipe|software|basic render/i.test(renderer); }
    } catch (e) { /* none */ }
    const webgpu = !!navigator.gpu, row = (k, v, good) => h('div.nd-row', h('b', k), h('span', { style: { color: good ? '#6be08a' : '#ffb347' } }, v));
    const body = h('div.nd-col',
      row('Graphics card: ', renderer, webgl2 && !soft),
      row('WebGL 2 (blend modes, adjustments, layer styles, blurs): ', webgl2 ? (soft ? 'software only — slow' : 'yes') : 'not available', webgl2 && !soft),
      row('WebGPU (fast AI): ', webgpu ? 'yes' : 'not available', webgpu),
      row('16-bit canvases: ', ND.Deep && ND.Deep.supported() ? 'yes' : 'no', ND.Deep && ND.Deep.supported()),
      h('p.nd-hint', soft || !webgl2
        ? 'Your browser is drawing without the graphics card. In Chrome or Edge open Settings ▸ System and turn on “Use graphics acceleration when available”, then restart the browser. Also check that your graphics driver is up to date.'
        : 'The graphics card is in use. Neon Sparks Draw uses it for special blend modes, adjustment layers, layer styles and blurs (Options ▸ Graphics card), and for AI models when WebGPU is available.'),
      ND.GPUFX && ND.GPUFX.slow() ? h('p.nd-hint', 'This graphics card is slower than the processor here, so layer styles and blurs use the processor.') : null,
      ND.GPUFX && ND.GPUFX.used + ND.GPUFX.blurUsed ? h('p.nd-hint', 'Layer styles worked out on the graphics card this session: ' + ND.GPUFX.used + ' · blurs: ' + ND.GPUFX.blurUsed) : null);
    ND.Dialogs.modal('Graphics card status', body, [{ label: 'Close', primary: true }]);
  };

  /* ---------- AI defaults ---------- */
  O.setBgModel = (id) => { if (id === 'ask') App.set('aiRemember', false); else { App.set('aiModel', id); App.set('aiRemember', true); } };
  O.bgModel = () => (App.state.aiRemember ? App.state.aiModel : 'ask');

  App.on('ready', O.applyGPU);
  setTimeout(O.applyGPU, 0);
  // menu language: saved, then the window reloads (your work is autosaved first)
  // menu language: changes straight away and is remembered
  O.setLanguage = function (code) {
    App.state.lang = code;
    App.savePrefs();
    ND.Lang.set(code);
    if (ND.Menus.relabel) ND.Menus.relabel();
    App.toast(ND.Lang.t('Language') + ': ' + ND.Lang.NAMES[code], 2500);
  };
  ND.Options = O;
})();
