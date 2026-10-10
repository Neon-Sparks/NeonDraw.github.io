/* Neon Draw — AI worker: runs ONNX segmentation models off the main thread so the app never freezes.
 * Messages: init {ortScript, wasmPaths: {mjs, wasm}}, load {key, bytes, preferGpu}, run {data, dims}, release. */
/* global importScripts */
'use strict';
let RT = null, session = null, sessionKey = null, provider = null;

function reply(id, data, transfer) { self.postMessage(Object.assign({ id }, data), transfer || []); }

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      if (!RT) {
        importScripts(m.ortScript); // defines the global `ort`
        RT = self.ort;
        RT.env.wasm.numThreads = 1; // multi-threading needs special server headers GitHub Pages can't send
        RT.env.wasm.wasmPaths = m.wasmPaths;
        RT.env.logLevel = 'error';
      }
      let gpu = false;
      if (self.navigator && self.navigator.gpu) { try { gpu = !!(await self.navigator.gpu.requestAdapter()); } catch (err) { gpu = false; } }
      self.gpuOK = gpu;
      reply(m.id, { gpu });
    } else if (m.type === 'load') {
      if (session && sessionKey === m.key) { reply(m.id, { provider, cached: true }); return; }
      if (session) { try { await session.release(); } catch (err) { /* already gone */ } session = null; sessionKey = null; }
      const opts = { graphOptimizationLevel: 'all' };
      const bytes = new Uint8Array(m.bytes);
      if (m.preferGpu && self.gpuOK) {
        // a failed WebGPU start leaves the runtime unusable in this worker, so report it and let the app restart on CPU
        try { session = await RT.InferenceSession.create(bytes, Object.assign({ executionProviders: ['webgpu'] }, opts)); provider = 'webgpu'; } catch (err) { reply(m.id, { error: 'GPU_FAILED ' + ((err && err.message) || err) }); return; }
      } else { session = await RT.InferenceSession.create(bytes, Object.assign({ executionProviders: ['wasm'] }, opts)); provider = 'wasm'; }
      sessionKey = m.key;
      reply(m.id, { provider, inputs: session.inputNames, outputs: session.outputNames });
    } else if (m.type === 'run') {
      const t0 = performance.now();
      let feeds;
      if (m.feeds) { feeds = {}; m.feeds.forEach((f, i) => { feeds[session.inputNames[i]] = new RT.Tensor(f.type || 'float32', f.data, f.dims); }); } // several inputs (e.g. picture + mask)
      else feeds = { [session.inputNames[0]]: new RT.Tensor('float32', m.data, m.dims) };
      const out = await session.run(feeds);
      const o = out[session.outputNames[0]];
      const data = m.feeds ? o.data : o.data instanceof Float32Array ? o.data : Float32Array.from(o.data);
      reply(m.id, { data, dims: o.dims, ms: performance.now() - t0, provider }, [data.buffer]);
    } else if (m.type === 'release') {
      if (session) { try { await session.release(); } catch (err) { /* ignore */ } }
      session = null; sessionKey = null;
      reply(m.id, {});
    }
  } catch (err) {
    reply(m.id, { error: String((err && err.message) || err) });
  }
};
