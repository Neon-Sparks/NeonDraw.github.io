/* Neon Sparks Draw — filter worker: runs the same filter code as the page, off the main thread, so big pictures
 * don't freeze the app while a filter is previewed or applied. Uses OffscreenCanvas instead of <canvas>.
 * Messages: init {scripts}, source {key, image}, run {fid, key | image, params, env}. */
/* global importScripts */
'use strict';
self.window = self;
let cached = null, cachedKey = null;
const toCanvas = (img) => { const c = new OffscreenCanvas(img.width, img.height); c.getContext('2d', { willReadFrequently: true }).putImageData(img, 0, 0); return c; };
self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      importScripts(m.scripts[0]);
      // canvases in a worker are OffscreenCanvas
      self.ND.U.canvas = (w, h) => new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      for (let i = 1; i < m.scripts.length; i++) importScripts(m.scripts[i]);
      self.postMessage({ id: m.id, ok: !!(self.ND.Filters && self.ND.Filters.run) });
    } else if (m.type === 'source') {
      cached = toCanvas(m.image); cachedKey = m.key;
      self.postMessage({ id: m.id, ok: true });
    } else if (m.type === 'run') {
      const src = m.key && m.key === cachedKey ? cached : toCanvas(m.image);
      const t0 = performance.now();
      const out = self.ND.Filters.run(m.fid, src, m.params, m.env || {});
      const img = self.ND.U.ctx(out).getImageData(0, 0, out.width, out.height);
      self.postMessage({ id: m.id, image: img, ms: performance.now() - t0 }, [img.data.buffer]);
    }
  } catch (err) {
    self.postMessage({ id: m.id, error: String((err && err.message) || err) });
  }
};
