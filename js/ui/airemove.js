/* Neon Draw — AI remove tool: paint over something (or select it) and an AI model fills the area with what
 * would be behind it. Runs on your computer (MI-GAN or LaMa, downloaded once). */
'use strict';
(function () {
  const U = ND.U, App = ND.App, AI = ND.AI;
  const V = () => ND.View;
  const R = { mask: null, busy: false };
  const S = () => App.state;
  const ensureMask = () => {
    const d = App.doc;
    if (!R.mask || R.mask.width !== d.width || R.mask.height !== d.height) { const t = U.colorType; U.colorType = 'unorm8'; R.mask = U.canvas(d.width, d.height); U.colorType = t; }
    return R.mask;
  };
  R.hasMask = () => !!(R.mask && ND.Sel.contentBBox(R.mask));
  R.clear = () => { if (R.mask) U.ctx(R.mask).clearRect(0, 0, R.mask.width, R.mask.height); V().request(); App.emit('airemove'); };
  const dab = (a, b) => {
    const x = U.ctx(ensureMask());
    x.strokeStyle = x.fillStyle = '#ff2a55'; x.lineCap = x.lineJoin = 'round'; x.lineWidth = S().airSize;
    x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
    x.beginPath(); x.arc(b.x, b.y, S().airSize / 2, 0, U.TAU); x.fill();
  };
  R.down = function (e, p) {
    if (R.busy) return true;
    if (S().airMode === 'select') { App.toast('Selection mode: select what to remove, then click Remove in the bar at the top'); return true; }
    dab(p, p);
    V().drag = { tool: 'x-airemove', last: p };
    V().request();
    return true;
  };
  R.move = function (e, p) { const dr = V().drag; dab(dr.last, p); dr.last = p; V().request(); };
  R.up = function () { App.emit('airemove'); if (S().airAuto && R.hasMask()) R.run(false); };
  R.overlay = function (cx, lw) {
    if (S().tool !== 'airemove') return;
    if (R.mask) { cx.save(); cx.globalAlpha = 0.45; cx.drawImage(R.mask, 0, 0); cx.restore(); }
    const c = V().cursor;
    if (c && c.inside && S().airMode !== 'select') { cx.save(); cx.strokeStyle = 'rgba(255,255,255,0.9)'; cx.lineWidth = lw; cx.beginPath(); cx.arc(c.x, c.y, S().airSize / 2, 0, U.TAU); cx.stroke(); cx.strokeStyle = 'rgba(0,0,0,0.6)'; cx.setLineDash([3 * lw, 3 * lw]); cx.stroke(); cx.restore(); }
  };
  async function model() {
    const why = AI.unsupported();
    if (why) { ND.Dialogs.modal('AI remove', U.h('p', why), [{ label: 'Close', primary: true }]); return null; }
    const id = AI.INPAINT.includes(S().aiInpaint) ? S().aiInpaint : 'migan';
    if (await AI.isDownloaded(id)) return id;
    return ND.AIUI.choose('AI remove — choose a model', 'Download and remove', null, AI.INPAINT, 'aiInpaint');
  }
  // Remove what is painted (or, with fromSelection, what is selected)
  R.run = async function (fromSelection) {
    const d = App.doc;
    if (R.busy) return;
    const useSel = fromSelection || S().airMode === 'select';
    const hole = useSel ? d.selectionMask : R.mask;
    if (!hole || !ND.Sel.contentBBox(hole)) return App.toast(useSel ? 'Select what to remove first (any selection tool)' : 'Paint over what you want to remove');
    if (!S().airAll && !(d.active && d.active.isPixel)) return App.toast('Pick a paint layer, or turn on “Sample all layers”');
    const id = await model();
    if (!id) return;
    R.busy = true;
    const UI = ND.AIUI;
    UI.busy('Starting AI…');
    try {
      const src = S().airAll ? U.clone(d.getProjection()) : d.active.canvas;
      const r = await AI.inpaint(id, src, hole, (t) => UI.busy(t));
      if (S().airNewLayer || !d.canPaint()) {
        d.addLayerFromCanvas('AI remove', r.patch, 0, 0);
      } else {
        const keep = d.selectionMask; d.selectionMask = null; // the patch already has the right shape
        d.paintOnActive('AI Remove', (x) => x.drawImage(r.patch, 0, 0));
        d.selectionMask = keep;
      }
      if (!useSel) R.clear();
      App.toast('Removed with ' + AI.MODELS[id].name + ' in ' + r.seconds.toFixed(1) + ' s' + (S().airNewLayer ? ' — on its own layer, so you can erase parts of it or hide it' : ''), 4000);
    } catch (e) { console.error(e); App.toast('AI remove failed: ' + e.message, 6000); } finally { R.busy = false; UI.idle(); V().request(); }
  };
  App.aiRemoveSelection = () => R.run(true);
  App.on('docchange', () => { R.mask = null; });
  App.on('tool', () => { if (S().tool !== 'airemove') V().request(); });
  ND.AIRemove = R;
})();
