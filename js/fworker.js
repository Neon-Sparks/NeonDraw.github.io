/* Neon Sparks Draw — runs filters in a background worker when the browser allows it (web / installed app);
 * otherwise (file:// or the single-file version) they simply run on the page as before. */
'use strict';
(function () {
  const U = ND.U, F = ND.Filters;
  const W = { failed: false, scripts: null, workerURL: null, jobs: 0 };
  let worker = null, seq = 0, ready = null, srcCanvas = null, srcKey = null, keySeq = 0;
  const pending = new Map();
  W.available = () => !W.failed && !window.ND_SINGLE_FILE && location.protocol !== 'file:' && !!window.Worker && typeof OffscreenCanvas !== 'undefined';
  function call(msg, transfer) {
    return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); worker.postMessage(Object.assign({ id }, msg), transfer || []); });
  }
  function start() {
    if (ready) return ready;
    const abs = (p) => new URL(p, location.href).href;
    worker = new Worker(W.workerURL || abs('js/filter-worker.js'));
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); if (e.data.error) p.rej(new Error(e.data.error)); else p.res(e.data); };
    worker.onerror = (e) => { W.failed = true; pending.forEach((p) => p.rej(new Error(e.message || 'filter worker failed'))); pending.clear(); };
    ready = call({ type: 'init', scripts: W.scripts || [abs('js/util.js'), abs('js/filters.js')] }).then((r) => { if (!r.ok) throw new Error('filters did not load in the worker'); });
    return ready;
  }
  /* Like ND.Filters.run but returns a Promise and doesn't block the page.
   * o.cache: the source canvas won't change between calls (live previews), so it is sent only once. */
  F.runAsync = async function (id, src, params, env, o) {
    o = o || {};
    if (!W.available() || (ND.Deep && ND.Deep.is16(src))) return F.run(id, src, params, env); // 16-bit stays on the page (the worker is 8-bit)
    try {
      await start();
      const msg = { type: 'run', fid: id, params: Object.assign({}, params), env: { fg: env && env.fg, bg: env && env.bg } };
      if (o.cache) {
        if (srcCanvas !== src) { srcCanvas = src; srcKey = 'k' + ++keySeq; const img = U.ctx(src).getImageData(0, 0, src.width, src.height); await call({ type: 'source', key: srcKey, image: img }, [img.data.buffer]); }
        msg.key = srcKey;
      } else msg.image = U.ctx(src).getImageData(0, 0, src.width, src.height);
      W.jobs++;
      const r = await call(msg, msg.image ? [msg.image.data.buffer] : []);
      const c = U.canvas(r.image.width, r.image.height);
      U.ctx(c).putImageData(r.image, 0, 0);
      W.lastMs = r.ms;
      return c;
    } catch (e) {
      console.warn('Filter worker unavailable, filtering on the page instead:', e.message);
      W.failed = true;
      return F.run(id, src, params, env);
    }
  };
  F.asyncAvailable = W.available;
  ND.FilterWorker = W;
})();
