/* Neon Sparks Draw — AI user interface: model picker, Help ▸ AI models manager, and the AI commands
 * (remove background, subject / background masks, AI selections). */
'use strict';
(function () {
  const U = ND.U, h = U.h, C = ND.C, App = ND.App, AI = ND.AI;
  const UI = {};
  const D = () => ND.Dialogs;
  const MB = (b) => Math.round(b / 1e6) + ' MB';

  /* ---------- busy overlay ---------- */
  let busyEl = null;
  UI.busy = function (text, onCancel) {
    if (!busyEl) { busyEl = h('div.nd-busy', h('div.nd-busy-card', h('div.nd-spinner'), h('div.nd-busy-text'), h('div.nd-busy-btns'))); document.body.appendChild(busyEl); }
    busyEl.querySelector('.nd-busy-text').textContent = text;
    const b = busyEl.querySelector('.nd-busy-btns');
    if (onCancel !== undefined) { U.clear(b); if (onCancel) b.appendChild(C.button('Cancel', onCancel, { cls: 'sm' })); }
    busyEl.classList.add('show');
  };
  UI.idle = function () { if (busyEl) { busyEl.classList.remove('show'); U.clear(busyEl.querySelector('.nd-busy-btns')); } };

  /* ---------- a model card (used by the picker and the manager) ---------- */
  function card(id, o) {
    const M = AI.MODELS[id];
    const status = h('span.nd-ai-status'), bar = h('div.nd-ai-bar', h('div')), btns = h('div.nd-row.tight.nd-ai-btns');
    const radio = o.pick ? h('input', { type: 'radio', name: 'nd-ai-model', value: id }) : null;
    const el = h((o.pick ? 'label' : 'div') + '.nd-ai-card' + (M.commercial ? '' : '.nc'),
      h('div.nd-ai-head', radio, h('b', M.name), h('span.nd-ai-title', ' — ' + M.title), h('span.grow'), h('span.nd-ai-size', MB(M.size))),
      h('div.nd-ai-best', M.best + (M.speed ? ' · ' + M.speed : '')),
      h('div.nd-ai-licence', h('span.nd-ai-badge' + (M.commercial ? '.ok' : '.nc'), M.commercial ? 'Free for commercial use' : 'Non-commercial use only'), h('span', ' ' + M.licence + '. ' + M.licenceNote)),
      h('div.nd-row.tight', status, h('span.grow'), btns), bar);
    el.radio = radio;
    el.refresh = async () => {
      const job = AI.downloads[id], have = await AI.isDownloaded(id);
      U.clear(btns);
      bar.style.display = job ? '' : 'none';
      if (job) {
        status.textContent = 'Downloading… ' + Math.round((job.done / job.total) * 100) + '%';
        bar.firstChild.style.width = (job.done / job.total) * 100 + '%';
        btns.appendChild(C.button('Cancel', (e) => { e.preventDefault(); AI.cancel(id); }, { cls: 'sm' }));
        if (!job.listeners) job.listeners = [];
        if (!job.listeners.includes(el.tick)) job.listeners.push(el.tick);
      } else if (have) {
        status.textContent = '✓ Downloaded — works offline';
        if (o.manage) btns.appendChild(C.button('Delete', async () => { if (window.confirm('Delete ' + M.name + ' from this browser? You can download it again any time.')) { await AI.remove(id); el.refresh(); if (o.onChange) o.onChange(); } }, { cls: 'sm' }));
      } else {
        status.textContent = 'Not downloaded';
        if (o.manage) btns.appendChild(C.button('Download', () => UI.download(id).then(() => o.onChange && o.onChange()).catch(() => {}).finally(() => el.refresh()), { cls: 'sm primary', icon: 'download' }));
      }
    };
    el.tick = (done, total) => { status.textContent = 'Downloading… ' + Math.round((done / total) * 100) + '% (' + MB(done) + ' of ' + MB(total) + ')'; bar.firstChild.style.width = (done / total) * 100 + '%'; };
    el.refresh();
    return el;
  }
  // start (or join) a download with error reporting
  UI.download = function (id) {
    const p = AI.download(id);
    p.then(() => App.toast(AI.MODELS[id].name + ' downloaded — it now works offline'), (e) => { if (!/cancel/i.test(e.message)) App.toast('Download failed: ' + e.message, 5000); else App.toast('Download cancelled'); });
    setTimeout(() => document.querySelectorAll('.nd-ai-card').forEach((c) => c.refresh && c.refresh()), 50);
    return p;
  };
  function unsupportedBox(why) {
    return h('div.nd-ai-warn', h('b', 'AI isn’t available here. '), why);
  }

  /* ---------- Help ▸ AI models ---------- */
  UI.manager = async function () {
    const why = AI.unsupported();
    const usage = h('div.nd-hint');
    const showUsage = async () => {
      const est = await AI.storage();
      usage.textContent = est ? 'This site is using ' + MB(est.usage || 0) + ' of browser storage (about ' + Math.round((est.quota || 0) / 1e9) + ' GB available).' : '';
    };
    const cards = AI.ORDER.map((id) => card(id, { manage: true, onChange: showUsage }));
    const upCards = AI.UPSCALERS.map((id) => card(id, { manage: true, onChange: showUsage })), inCards = AI.INPAINT.map((id) => card(id, { manage: true, onChange: showUsage }));
    const body = h('div.nd-ai',
      h('p', 'AI models find the subject of a photo for Remove background, AI masks and AI selections, and enlarge pictures (Image ▸ Enlarge with AI). Download the ones you want once; they are stored in this browser and then work offline. Images are processed on your own computer and are never uploaded.'),
      why ? unsupportedBox(why) : null,
      h('h4.nd-ai-sec', 'Subject finders'),
      ...cards,
      h('h4.nd-ai-sec', 'Upscalers (enlarge pictures)'),
      ...upCards,
      h('h4.nd-ai-sec', 'Object removal (AI remove tool)'),
      ...inCards,
      h('div.nd-hint', 'Speed: with a graphics card that supports WebGPU (Chrome, Edge) a picture takes about a second; on the CPU expect 2–3 s for MODNet and 10–40 s for ISNet / RMBG. ISNet always uses the CPU for now. If a model ever fails on the graphics card, Neon Sparks Draw switches it to the CPU automatically.'),
      usage);
    if (why) cards.concat(upCards, inCards).forEach((c) => c.querySelectorAll('button').forEach((b) => { b.disabled = true; }));
    showUsage();
    D().modal('AI models', body, [{ label: 'Close', primary: true }], { wide: true, noFocus: true });
  };

  /* ---------- picker ---------- */
  // Resolves to a model id (downloaded and ready) or null.
  UI.choose = function (title, action, extra, list, pref) {
    list = list || AI.ORDER; pref = pref || 'aiModel';
    return new Promise((resolve) => {
      const why = AI.unsupported();
      if (why) { D().modal(title, unsupportedBox(why), [{ label: 'Close', primary: true }]); resolve(null); return; }
      let sel = list.includes(App.state[pref]) ? App.state[pref] : list[0];
      const cards = list.map((id) => card(id, { pick: true }));
      const warn = h('div.nd-ai-warn');
      const sync = () => {
        cards.forEach((c, i) => { c.radio.checked = list[i] === sel; c.classList.toggle('sel', list[i] === sel); });
        warn.style.display = AI.MODELS[sel].commercial ? 'none' : '';
        warn.textContent = 'RMBG-1.4 gives the highest quality, but its licence only allows non-commercial use. Don’t use images processed with it in anything you sell or use commercially — choose ISNet or MODNet for that.';
      };
      cards.forEach((c, i) => c.radio.addEventListener('change', () => { sel = list[i]; sync(); }));
      let remember = pref === 'aiModel' && !!App.state.aiRemember;
      const body = h('div.nd-ai', h('p', 'Choose the AI model to use. Models you haven’t downloaded yet are downloaded first (once).'), ...cards, warn,
        extra || null,
        pref === 'aiModel' ? C.check('Use this model next time without asking', () => remember, (v) => { remember = v; }) : null);
      sync();
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      D().modal(title, body, [
        { label: 'Cancel', action: () => finish(null) },
        { label: action, primary: true, action: () => {
          App.set(pref, sel); if (pref === 'aiModel') App.set('aiRemember', remember);
          AI.isDownloaded(sel).then((have) => {
            if (have) { D().close(); finish(sel); return; }
            UI.download(sel).then(() => { D().close(); finish(sel); }).catch(() => {});
          });
          return false; // keep the dialog open while downloading
        } },
      ], { wide: true, noFocus: true, onCancel: () => finish(null) });
    });
  };
  // The remembered model, if it's downloaded; otherwise ask.
  UI.model = async function (title, action, extra) {
    const m = App.state.aiModel;
    if (App.state.aiRemember && m && AI.MODELS[m] && !AI.unsupported() && (await AI.isDownloaded(m))) return m;
    return UI.choose(title, action, extra);
  };

  /* ---------- running a model ---------- */
  UI.segment = async function (id, src) {
    UI.busy('Starting AI…');
    try {
      const t0 = performance.now();
      const out = await AI.segment(id, src, (t) => UI.busy(t));
      out.seconds = (performance.now() - t0) / 1000;
      return out;
    } finally { UI.idle(); }
  };
  const noteFor = (id) => (AI.MODELS[id].commercial ? '' : ' · RMBG result: non-commercial use only');
  // greyscale layer mask from a selection: white where the subject is (or black, when inverted)
  const maskCanvas = (sel, invert) => {
    const d = App.doc, m = ND.DocMask.newMask(d.width, d.height, invert ? '#fff' : '#000');
    let src = sel;
    if (invert) { src = U.clone(sel); const x = U.ctx(src); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#000'; x.fillRect(0, 0, src.width, src.height); }
    U.ctx(m).drawImage(src, 0, 0);
    ND.DocMask.greyify(m, { x: 0, y: 0, w: d.width, h: d.height });
    return m;
  };
  // the picture the AI should look at for a node: a paint layer's own pixels, otherwise the whole image
  const sourceFor = (n) => (n && n.isPixel ? n.canvas : App.doc.getProjection());

  // Remove background: the active paint layer gets a mask that hides everything except the subject
  App.aiRemoveBackground = async function () { return App.aiMask(false, 'Remove background with AI', 'Remove background', true); };
  // AI layer mask on the active layer, group or adjustment layer. invert = hide the subject instead.
  App.aiMask = async function (invert, title, action, offerClean) {
    const d = this.doc, n = d.active;
    if (!n) return;
    // removing a background from a paint layer can also clean the old background colour out of the edges
    const canClean = offerClean && n.isPixel;
    const cleanChk = canClean ? C.check('Also refine & clean the edges (fixes hair edges and removes the old background’s colour fringe)', () => App.state.aiClean !== false, (v) => App.set('aiClean', v)) : null;
    const id = await UI.model(title || (invert ? 'AI mask — hide the subject' : 'AI mask — hide the background'), action || 'Add mask', cleanChk);
    if (!id) return;
    try {
      const out = await UI.segment(id, sourceFor(n));
      d.setProps(n, { mask: maskCanvas(out.mask, invert), maskEnabled: true }, invert ? 'AI Mask (background)' : n.isPixel && !invert ? 'Remove Background (AI)' : 'AI Mask (subject)');
      d.setEditMask(true);
      if (canClean && App.state.aiClean !== false) App.cleanEdges(true);
      App.toast((invert ? 'Subject hidden' : 'Background hidden') + ' with an AI mask (' + AI.MODELS[id].name + ', ' + out.seconds.toFixed(1) + ' s). Paint the mask to adjust, or use Select and Mask for edges' + noteFor(id), 5000);
    } catch (e) { console.error(e); App.toast('AI failed: ' + e.message, 5000); }
  };
  // AI selection of the subject (or everything but the subject)
  App.aiSelect = async function (invert) {
    const d = this.doc;
    const id = await UI.model(invert ? 'Select background with AI' : 'Select subject with AI', 'Select');
    if (!id) return;
    try {
      const out = await UI.segment(id, d.getProjection());
      let sel = out.mask;
      if (invert) { const c = U.canvas(d.width, d.height), x = U.ctx(c); x.fillStyle = '#fff'; x.fillRect(0, 0, d.width, d.height); x.globalCompositeOperation = 'destination-out'; x.drawImage(out.mask, 0, 0); sel = c; }
      d.changeSelection(invert ? 'Select Background (AI)' : 'Select Subject (AI)', sel);
      App.toast((invert ? 'Background' : 'Subject') + ' selected (' + AI.MODELS[id].name + ', ' + out.seconds.toFixed(1) + ' s)' + noteFor(id), 4000);
    } catch (e) { console.error(e); App.toast('AI failed: ' + e.message, 5000); }
  };
  // Quick select with AI: strokes pick whole AI-detected objects.
  App.aiQuickSelect = async function (stroke, subtract, session) {
    const d = this.doc;
    if (!session.ai) {
      const id = await UI.model('Quick select with AI', 'Use');
      if (!id) return null;
      const out = await UI.segment(id, session.src);
      session.ai = { id, regions: AI.regions(out.small), chosen: new Set() };
    }
    const S = session.ai, hit = AI.regionsUnder(S.regions, stroke);
    if (!hit.size && !subtract) App.toast('No object found under that stroke — try painting over the object itself');
    hit.forEach((r) => (subtract ? S.chosen.delete(r) : S.chosen.add(r)));
    return S.chosen.size ? AI.regionMask(S.regions, S.chosen, d.width, d.height) : null;
  };

  /* ---------- Image ▸ Enlarge with AI ---------- */
  App.aiUpscale = async function () {
    const d = this.doc, n = d.active;
    let every = false;
    const pixelLayers = d.allLayers().filter((l) => l.isPixel);
    const scope = pixelLayers.length > 1 ? C.segmented([['one', 'Active layer with AI'], ['all', 'Every paint layer with AI (slower)']], () => (every ? 'all' : 'one'), (v) => { every = v === 'all'; }) : null;
    const extra = h('div.nd-col', scope, h('div.nd-hint', 'The whole document gets bigger. ' + (scope ? 'Other layers and masks are enlarged smoothly without AI. ' : '') + 'Undo puts it back. Speed: about 1–2 s per 100 × 100 px area on the CPU, much faster with a WebGPU graphics card.'));
    // Options ▸ AI: a chosen default model skips the question (whole picture / active layer)
    const skip = App.state.aiUpscaleAsk === false && AI.UPSCALERS.includes(App.state.aiUpscaler) && !AI.unsupported() && (await AI.isDownloaded(App.state.aiUpscaler));
    const id = skip ? App.state.aiUpscaler : await UI.choose('Enlarge with AI', 'Enlarge', extra, AI.UPSCALERS, 'aiUpscaler');
    if (!id) return;
    const s = AI.MODELS[id].scale;
    if (d.width * d.height * s * s > AI.MAX_UPSCALE_PIXELS) return App.toast('The result would be ' + d.width * s + ' × ' + d.height * s + ' px — too big. Crop or shrink the picture first (limit about 40 megapixels).', 6000);
    const targets = every ? pixelLayers : n && n.isPixel ? [n] : [];
    if (!targets.length) return App.toast('Pick a paint layer to enlarge');
    let cancelled = false;
    const big = new Map();
    UI.busy('Starting AI…', () => { cancelled = true; UI.busy('Stopping…', null); });
    const t0 = performance.now();
    try {
      for (let i = 0; i < targets.length; i++) {
        const L = targets[i], pre = targets.length > 1 ? 'Layer ' + (i + 1) + ' of ' + targets.length + ' · ' : '';
        big.set(L.canvas, await AI.upscale(id, L.canvas, (t) => UI.busy(pre + t), () => cancelled));
      }
    } catch (e) {
      UI.idle();
      if (/cancel/i.test(e.message)) return App.toast('Enlarging cancelled — nothing was changed');
      console.error(e); return App.toast('AI failed: ' + e.message, 6000);
    }
    UI.idle();
    d.resizeAll(d.width * s, d.height * s, (x, c) => { const b = big.get(c); if (b) x.drawImage(b, 0, 0); else { x.imageSmoothingEnabled = true; x.drawImage(c, 0, 0, c.width * s, c.height * s); } }, 'Enlarge ' + s + '× (AI)');
    App.fitView();
    App.toast('Enlarged ' + s + '× to ' + d.width + ' × ' + d.height + ' with ' + AI.MODELS[id].name + ' (' + Math.round((performance.now() - t0) / 1000) + ' s)', 5000);
  };

  ND.AIUI = UI;
})();
