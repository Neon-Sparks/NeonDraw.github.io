/* Neon Draw — AI background removal and masking with downloadable models.
 * Models are downloaded once from Hugging Face into this browser's storage (Cache Storage) and then
 * work offline. Inference runs in a Web Worker with ONNX Runtime Web (WebGPU when available, else CPU).
 * Nothing is uploaded: images never leave the computer. */
'use strict';
(function () {
  const U = ND.U;
  const CACHE = 'nd-ai-models'; // must not start with "neondraw-" (the service worker clears those on update)
  const HF = 'https://huggingface.co/';

  const MODELS = {
    isnet: {
      id: 'isnet', name: 'ISNet', title: 'General objects',
      best: 'Products, animals, objects and people — a good all-rounder',
      url: HF + 'jellybox/isnet-general-use/resolve/main/isnet-general-use_1024.onnx', size: 178648008,
      licence: 'Apache 2.0', commercial: true, licenceNote: 'Free to use on any image, including commercial work.',
      prep: { w: 1024, h: 1024, mean: 0.5, std: 1 }, post: 'minmax',
      // uses MaxPool with ceil_mode, which the WebGPU engine can't run yet ("not yet implemented")
      gpu: false, speed: 'Runs on the CPU (about 10–40 s): the graphics-card engine can’t run one of its layers yet.',
    },
    modnet: {
      id: 'modnet', name: 'MODNet', title: 'People & portraits',
      best: 'People, faces and hair — smallest and fastest; weaker on objects that are not people',
      url: HF + 'Xenova/modnet/resolve/main/onnx/model.onnx', size: 25888640,
      licence: 'Apache 2.0', commercial: true, licenceNote: 'Free to use on any image, including commercial work.',
      prep: { short: 512, div: 32, max: 1536, mean: 0.5, std: 0.5 }, post: 'clamp',
    },
    rmbg: {
      id: 'rmbg', name: 'RMBG-1.4', title: 'Highest quality',
      best: 'Usually the cleanest edges on any subject',
      url: HF + 'briaai/RMBG-1.4/resolve/main/onnx/model.onnx', size: 176153355,
      licence: 'BRIA RMBG-1.4 licence', commercial: false,
      licenceNote: 'Non-commercial use only: images you process with it must not be sold or used commercially (BRIA offers paid licences).',
      prep: { w: 1024, h: 1024, mean: 0.5, std: 1 }, post: 'minmax',
    },
    // upscalers (Swin2SR by Conde et al., Apache 2.0 — ONNX conversions by Xenova)
    sr2: {
      id: 'sr2', kind: 'upscale', scale: 2, name: 'Swin2SR ×2', title: 'Fast 2× enlarge',
      best: 'Doubles the size with sharp, clean detail — drawings, graphics and good-quality photos',
      url: HF + 'Xenova/swin2SR-lightweight-x2-64/resolve/main/onnx/model.onnx', size: 8078888,
      licence: 'Apache 2.0', commercial: true, licenceNote: 'Free to use on any image, including commercial work.',
    },
    sr4: {
      id: 'sr4', kind: 'upscale', scale: 4, name: 'Swin2SR ×4 photo', title: '4× enlarge for real photos',
      best: 'Makes photos four times bigger and cleans up blur, noise and JPEG blocks (slower)',
      url: HF + 'Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr/resolve/main/onnx/model.onnx', size: 52772645,
      licence: 'Apache 2.0', commercial: true, licenceNote: 'Free to use on any image, including commercial work.',
    },
  };
  const ORDER = ['isnet', 'modnet', 'rmbg'];
  const UPSCALERS = ['sr2', 'sr4'];

  const AI = { MODELS, ORDER, UPSCALERS, downloads: {} };

  // Models that must run on the CPU: known ones, plus any that failed on the graphics card here before.
  const CPU_KEY = 'nd-ai-cpu-models';
  const learnedCpu = () => { try { return JSON.parse(localStorage.getItem(CPU_KEY) || '[]'); } catch (e) { return []; } };
  AI.cpuOnly = (id) => MODELS[id].gpu === false || learnedCpu().includes(id);
  AI.markCpuOnly = (id) => { try { const l = learnedCpu(); if (!l.includes(id)) { l.push(id); localStorage.setItem(CPU_KEY, JSON.stringify(l)); } } catch (e) { /* storage off */ } };

  // Why AI can't run here, or '' when it can.
  AI.unsupported = function () {
    if (window.ND_SINGLE_FILE) return 'The single-file version can’t run AI models. Use the web version (e.g. on GitHub Pages) or the installed app.';
    if (location.protocol === 'file:') return 'Browsers don’t allow AI models from a file opened on disk. Open Neon Draw from its website (e.g. GitHub Pages) or the installed app.';
    if (!window.Worker || !window.caches || !window.WebAssembly) return 'This browser is missing features the AI models need (Web Workers, Cache Storage or WebAssembly).';
    return '';
  };

  /* ---------- storage ---------- */
  async function cache() { return caches.open(CACHE); }
  AI.isDownloaded = async function (id) {
    if (AI.unsupported()) return false;
    try { return !!(await (await cache()).match(MODELS[id].url)); } catch (e) { return false; }
  };
  AI.status = async function () {
    const out = {};
    for (const id of ORDER.concat(UPSCALERS)) out[id] = { downloaded: await AI.isDownloaded(id), downloading: !!AI.downloads[id] };
    return out;
  };
  AI.storage = async function () {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try { return await navigator.storage.estimate(); } catch (e) { return null; }
  };
  // Download a model with progress. onProgress(done, total). Returns when it's stored.
  AI.download = async function (id, onProgress) {
    const why = AI.unsupported();
    if (why) throw new Error(why);
    const M = MODELS[id];
    if (AI.downloads[id]) return AI.downloads[id].promise;
    const ctrl = new AbortController();
    const job = { ctrl, done: 0, total: M.size };
    job.promise = (async () => {
      try {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        // big files over flaky connections: if the transfer drops, carry on from where it stopped
        const chunks = [];
        let total = M.size, tries = 0;
        for (;;) {
          try {
            const headers = job.done > 0 ? { Range: 'bytes=' + job.done + '-' } : {};
            const res = await fetch(M.url, { signal: ctrl.signal, mode: 'cors', headers });
            if (!res.ok) throw new Error('download failed (' + res.status + ')');
            if (job.done > 0 && res.status !== 206) { chunks.length = 0; job.done = 0; } // server ignored the range: start over
            if (job.done === 0) total = +res.headers.get('content-length') || M.size;
            job.total = total;
            const reader = res.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              job.done += value.length;
              if (onProgress) onProgress(job.done, total);
              if (job.listeners) job.listeners.forEach((f) => f(job.done, total));
            }
            if (job.done >= total) break;
            throw new Error('connection closed early');
          } catch (e) {
            if (ctrl.signal.aborted) throw new Error('cancelled');
            if (++tries > 5) throw new Error('the download kept failing (' + e.message + ') — check your connection and try again');
            await new Promise((r) => setTimeout(r, 1000 * tries));
          }
        }
        const blob = new Blob(chunks, { type: 'application/octet-stream' });
        chunks.length = 0;
        await (await cache()).put(M.url, new Response(blob, { headers: { 'content-type': 'application/octet-stream' } }));
        await cacheRuntime().catch(() => {});
        return true;
      } finally { delete AI.downloads[id]; }
    })();
    AI.downloads[id] = job;
    return job.promise;
  };
  AI.cancel = function (id) { const j = AI.downloads[id]; if (j) j.ctrl.abort(); };
  AI.remove = async function (id) {
    if (AI.loadedKey === id) { await AI.call({ type: 'release' }).catch(() => {}); AI.loadedKey = null; }
    AI.lastResult = null;
    return (await cache()).delete(MODELS[id].url);
  };

  /* ---------- worker ---------- */
  let worker = null, seq = 0;
  const pending = new Map();
  AI.call = function (msg, transfer) {
    return new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      worker.postMessage(Object.assign({ id }, msg), transfer || []);
    });
  };
  // bundled ONNX Runtime Web (MIT); the folder is versioned so cached copies never mix versions
  const RT = 'vendor/ort-1.30.0/';
  AI.runtime = { ortScript: RT + 'ort.min.js', mjs: RT + 'ort-wasm-simd-threaded.jsep.mjs', wasm: RT + 'ort-wasm-simd-threaded.jsep.wasm', worker: 'js/ai-worker.js' };
  // keep the runtime next to the models so AI works offline even after the app updates
  async function cacheRuntime() {
    if (AI.runtime.wasmURL) return; // test harness
    const c = await cache();
    for (const p of [AI.runtime.ortScript, AI.runtime.mjs, AI.runtime.wasm]) {
      const url = new URL(p, location.href).href;
      if (!(await c.match(url))) { const r = await fetch(url); if (r.ok) await c.put(url, r); }
    }
  }
  async function ensureWorker() {
    if (worker) return;
    const abs = (p) => new URL(p, location.href).href;
    worker = new Worker(AI.runtime.workerURL || abs(AI.runtime.worker));
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.rej(new Error(e.data.error)); else p.res(e.data);
    };
    worker.onerror = (e) => { pending.forEach((p) => p.rej(new Error(e.message || 'AI worker failed to start'))); pending.clear(); worker = null; };
    const wasmPaths = { mjs: AI.runtime.mjsURL || abs(AI.runtime.mjs), wasm: AI.runtime.wasmURL || abs(AI.runtime.wasm) };
    const info = await AI.call({ type: 'init', ortScript: AI.runtime.ortURL || abs(AI.runtime.ortScript), wasmPaths });
    AI.gpuAvailable = info.gpu && !AI.noGpu;
  }
  function resetWorker() { if (worker) worker.terminate(); worker = null; AI.loadedKey = null; pending.forEach((p) => p.rej(new Error('restarted'))); pending.clear(); }
  async function load(id, status) {
    await ensureWorker();
    if (AI.loadedKey === id) return;
    status('Loading ' + MODELS[id].name + '…');
    const r = await (await cache()).match(MODELS[id].url);
    if (!r) throw new Error(MODELS[id].name + ' is not downloaded');
    const bytes = await r.clone().arrayBuffer();
    let info;
    try {
      info = await AI.call({ type: 'load', key: id, bytes, preferGpu: !AI.noGpu && !AI.cpuOnly(id) }, [bytes]);
    } catch (e) {
      if (!/GPU_FAILED/.test(e.message)) throw e;
      // graphics card couldn't be used: start a fresh worker on the CPU
      AI.noGpu = true;
      resetWorker();
      await ensureWorker();
      const again = await r.clone().arrayBuffer();
      info = await AI.call({ type: 'load', key: id, bytes: again, preferGpu: false }, [again]);
    }
    AI.loadedKey = id;
    AI.provider = info.provider;
  }

  /* ---------- pre / post processing ---------- */
  function inputSize(M, W, H) {
    const p = M.prep;
    if (p.w) return [p.w, p.h];
    // MODNet: short side 512, both sides multiples of 32, long side capped
    let s = p.short / Math.min(W, H);
    if (Math.max(W, H) * s > p.max) s = p.max / Math.max(W, H);
    const w = Math.max(p.div, Math.round((W * s) / p.div) * p.div), h = Math.max(p.div, Math.round((H * s) / p.div) * p.div);
    return [w, h];
  }
  function toTensor(src, M) {
    const [w, h] = inputSize(M, src.width, src.height), c = U.canvas(w, h), x = U.ctx(c);
    // transparent areas are shown to the model as white
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, n = w * h, out = new Float32Array(n * 3), { mean, std } = M.prep;
    for (let i = 0; i < n; i++) {
      out[i] = (d[i * 4] / 255 - mean) / std;
      out[n + i] = (d[i * 4 + 1] / 255 - mean) / std;
      out[2 * n + i] = (d[i * 4 + 2] / 255 - mean) / std;
    }
    return { data: out, dims: [1, 3, h, w], w, h };
  }
  function usable(a) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < a.length; i += 7) { const v = a[i]; if (!(v === v)) return false; if (v < mn) mn = v; if (v > mx) mx = v; }
    return mx - mn > 1e-3;
  }
  function toAlpha(res, M) {
    const a = res.data, n = a.length;
    if (M.post === 'minmax') {
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < n; i++) { if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; }
      const d = mx - mn || 1;
      for (let i = 0; i < n; i++) a[i] = (a[i] - mn) / d;
    } else for (let i = 0; i < n; i++) a[i] = a[i] < 0 ? 0 : a[i] > 1 ? 1 : a[i];
    return a;
  }

  /* Segment the main subject of `src` (a canvas).
   * Returns { mask: doc-sized white canvas whose alpha is the subject, small: {alpha,w,h}, model, provider, ms } */
  AI.segment = async function (id, src, status) {
    status = status || (() => {});
    const M = MODELS[id];
    await load(id, status);
    const t = toTensor(src, M);
    status(AI.provider === 'webgpu' ? 'Finding the subject (graphics card)…' : 'Finding the subject (CPU — this can take 10–60 seconds)…');
    const input = AI.provider === 'webgpu' ? t.data.slice() : null; // kept in case the GPU result is unusable
    let res;
    try {
      res = await AI.call({ type: 'run', data: t.data, dims: t.dims }, [t.data.buffer]);
    } catch (e) {
      if (!input) throw e;
      // the graphics-card engine can't run something in this model: use the CPU for it from now on
      console.warn('AI: ' + MODELS[id].name + ' failed on WebGPU, using the CPU instead —', e.message);
      AI.markCpuOnly(id);
      resetWorker();
      await load(id, status);
      status('Finding the subject (CPU — this can take 10–60 seconds)…');
      res = await AI.call({ type: 'run', data: input.slice(), dims: t.dims }, [/* copy kept for the check below */]);
    }
    if (res.provider === 'webgpu' && !usable(res.data)) {
      // some graphics drivers return blank results: switch to the CPU for good and run again
      AI.noGpu = true;
      resetWorker();
      await load(id, status);
      status('Finding the subject (CPU — this can take 10–60 seconds)…');
      res = await AI.call({ type: 'run', data: input, dims: t.dims }, [input.buffer]);
    }
    const h = res.dims[2], w = res.dims[3], alpha = toAlpha(res, M);
    const small = U.canvas(w, h), sx = U.ctx(small), id2 = sx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const j = i * 4; id2.data[j] = id2.data[j + 1] = id2.data[j + 2] = 255; id2.data[j + 3] = alpha[i] * 255; }
    sx.putImageData(id2, 0, 0);
    const mask = U.canvas(src.width, src.height), mx = U.ctx(mask);
    mx.imageSmoothingEnabled = true; mx.imageSmoothingQuality = 'high';
    mx.drawImage(small, 0, 0, src.width, src.height);
    const out = { mask, small: { alpha, w, h }, model: id, provider: res.provider, ms: res.ms };
    AI.lastResult = { src, model: id, out };
    return out;
  };
  // Reuse the last result when the same picture is processed with the same model.
  AI.segmentCached = async function (id, src, stamp, status) {
    const L = AI.lastResult;
    if (L && L.model === id && L.src === src && L.stamp === stamp) return L.out;
    const out = await AI.segment(id, src, status);
    AI.lastResult.stamp = stamp;
    return out;
  };

  /* ---------- AI upscaling ---------- */
  // Run one tile, falling back to the CPU if the graphics card fails or returns a blank result.
  async function runTile(id, data, dims, status, checkBlank) {
    const copy = AI.provider === 'webgpu' ? data.slice() : null;
    let res;
    try {
      res = await AI.call({ type: 'run', data, dims }, [data.buffer]);
    } catch (e) {
      if (!copy) throw e;
      console.warn('AI: ' + MODELS[id].name + ' failed on WebGPU, using the CPU instead —', e.message);
      AI.markCpuOnly(id); resetWorker(); await load(id, status);
      return AI.call({ type: 'run', data: copy, dims }, [copy.buffer]);
    }
    if (copy && checkBlank && !usable(res.data)) {
      AI.noGpu = true; resetWorker(); await load(id, status);
      res = await AI.call({ type: 'run', data: copy, dims }, [copy.buffer]);
    }
    return res;
  }
  AI.MAX_UPSCALE_PIXELS = 40e6;
  AI.TILE = 96; AI.TILE_OVERLAP = 8;
  // Tile layout along one side: tile starts plus the part of the output each tile owns.
  AI.tiles = function (L, T, ov) {
    const step = T - 2 * ov, starts = [];
    for (let p = 0; ; p += step) { if (p + T >= L) { starts.push(Math.max(0, L - T)); break; } starts.push(p); }
    const list = [...new Set(starts)];
    return list.map((p, i) => ({ p, a: i === 0 ? 0 : Math.round((p + list[i - 1] + T) / 2), b: i === list.length - 1 ? L : Math.round((list[i + 1] + p + T) / 2) }));
  };
  /* Enlarge `src` (a canvas) with an upscaler model. Works in overlapping tiles so any size fits in memory.
   * status(text) reports progress; isCancelled() can stop it. Returns a new canvas scale× bigger. */
  AI.upscale = async function (id, src, status, isCancelled) {
    status = status || (() => {});
    const M = MODELS[id], s = M.scale, T = AI.TILE, ov = AI.TILE_OVERLAP;
    const W = src.width, H = src.height;
    if (W * H * s * s > AI.MAX_UPSCALE_PIXELS) throw new Error('the result would be ' + W * s + ' × ' + H * s + ' — too big for the browser. Crop or shrink the picture first (the limit is about 40 megapixels)');
    await load(id, status);
    // the model sees the picture over white, with the edges stretched out to fill a whole tile
    const PW = Math.max(W, T), PH = Math.max(H, T), pad = U.canvas(PW, PH), px = U.ctx(pad);
    px.fillStyle = '#fff'; px.fillRect(0, 0, PW, PH); px.drawImage(src, 0, 0);
    if (PW > W) px.drawImage(pad, W - 1, 0, 1, PH, W, 0, PW - W, PH);
    if (PH > H) px.drawImage(pad, 0, H - 1, PW, 1, 0, H, PW, PH - H);
    const pd = px.getImageData(0, 0, PW, PH).data, sd = U.ctx(src).getImageData(0, 0, W, H).data;
    let transparent = false;
    for (let i = 3; i < sd.length; i += 4) if (sd[i] < 255) { transparent = true; break; }
    const xs = AI.tiles(PW, T, ov), ys = AI.tiles(PH, T, ov), OW = W * s, OH = H * s, ST = T * s, plane = ST * ST;
    const out = U.canvas(OW, OH), ox = U.ctx(out), img = ox.createImageData(OW, OH), o = img.data;
    const total = xs.length * ys.length, t0 = performance.now();
    let n = 0, checked = false;
    for (const ty of ys) {
      for (const tx of xs) {
        if (isCancelled && isCancelled()) throw new Error('cancelled');
        const data = new Float32Array(3 * T * T);
        let mn = 1, mx = 0;
        for (let y = 0; y < T; y++) {
          for (let x = 0; x < T; x++) {
            const i = ((ty.p + y) * PW + tx.p + x) * 4, j = y * T + x;
            data[j] = pd[i] / 255; data[T * T + j] = pd[i + 1] / 255; data[2 * T * T + j] = pd[i + 2] / 255;
            if (data[j] < mn) mn = data[j]; if (data[j] > mx) mx = data[j];
          }
        }
        // only judge "blank GPU output" on a tile that actually has detail
        const check = !checked && mx - mn > 0.05;
        if (check) checked = true;
        const res = await runTile(id, data, [1, 3, T, T], status, check);
        const r = res.data, y0 = ty.a * s, y1 = Math.min(ty.b, H) * s, x0 = tx.a * s, x1 = Math.min(tx.b, W) * s;
        for (let Y = y0; Y < y1; Y++) {
          const ry = (Y - ty.p * s) * ST;
          for (let X = x0; X < x1; X++) {
            const k = ry + X - tx.p * s, q = (Y * OW + X) * 4;
            o[q] = r[k] * 255 + 0.5; o[q + 1] = r[plane + k] * 255 + 0.5; o[q + 2] = r[2 * plane + k] * 255 + 0.5; o[q + 3] = 255;
          }
        }
        n++;
        const left = ((performance.now() - t0) / n) * (total - n) / 1000;
        status('Enlarging ' + s + '× — part ' + n + ' of ' + total + (n > 1 ? ' · about ' + (left > 90 ? Math.round(left / 60) + ' min' : Math.max(1, Math.round(left)) + ' s') + ' left' : '') + (AI.provider === 'webgpu' ? ' (graphics card)' : ' (CPU)'));
      }
    }
    ox.putImageData(img, 0, 0);
    if (transparent) {
      // transparency: enlarge the alpha smoothly and apply it
      const a = U.canvas(OW, OH), ax = U.ctx(a);
      ax.imageSmoothingEnabled = true; ax.imageSmoothingQuality = 'high'; ax.drawImage(src, 0, 0, OW, OH);
      ox.globalCompositeOperation = 'destination-in'; ox.drawImage(a, 0, 0); ox.globalCompositeOperation = 'source-over';
    }
    return out;
  };

  /* AI quick select: paint over things and get the AI-detected objects under the strokes.
   * Works on the connected regions of the AI mask; soft edges are kept. */
  AI.regions = function (small) {
    const { alpha, w, h } = small, n = w * h, lab = new Int32Array(n).fill(-1), stack = [];
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (alpha[i] < 0.5 || lab[i] >= 0) continue;
      lab[i] = count; stack.push(i);
      while (stack.length) {
        const j = stack.pop(), x = j % w;
        const nb = [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j >= w ? j - w : -1, j + w < n ? j + w : -1];
        for (const k of nb) if (k >= 0 && lab[k] < 0 && alpha[k] >= 0.5) { lab[k] = count; stack.push(k); }
      }
      count++;
    }
    // give the soft edge pixels to their neighbouring region
    for (let pass = 0; pass < 6; pass++) {
      const prev = lab.slice();
      for (let i = 0; i < n; i++) {
        if (prev[i] >= 0 || alpha[i] < 0.02) continue;
        const x = i % w, nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i + w < n ? i + w : -1];
        for (const k of nb) if (k >= 0 && prev[k] >= 0) { lab[i] = prev[k]; break; }
      }
    }
    return { lab, count, w, h, alpha };
  };
  // regions: from AI.regions; chosen: Set of region ids → doc-sized selection canvas
  AI.regionMask = function (regions, chosen, W, H) {
    const { lab, w, h, alpha } = regions, c = U.canvas(w, h), x = U.ctx(c), id = x.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const j = i * 4; id.data[j] = id.data[j + 1] = id.data[j + 2] = 255; id.data[j + 3] = lab[i] >= 0 && chosen.has(lab[i]) ? alpha[i] * 255 : 0; }
    x.putImageData(id, 0, 0);
    const out = U.canvas(W, H), ox = U.ctx(out);
    ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high';
    ox.drawImage(c, 0, 0, W, H);
    return out;
  };
  // which regions a stroke canvas (doc-sized) touches
  AI.regionsUnder = function (regions, stroke) {
    const { lab, w, h } = regions, c = U.canvas(w, h), x = U.ctx(c);
    x.drawImage(stroke, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, hit = new Set();
    for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 20 && lab[i] >= 0) hit.add(lab[i]);
    return hit;
  };

  ND.AI = AI;
})();
