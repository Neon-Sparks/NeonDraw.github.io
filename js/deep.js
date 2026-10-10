/* Neon Sparks Draw — 16-bit documents. A 16-bit document keeps every layer, mask and work buffer in 16-bit floating
 * point canvases (where the browser supports them), so painting, blending, opacity, masks, gradients,
 * transforms and layer compositing keep smooth tones without banding. Projects store the 16-bit pixels
 * losslessly; 16-bit TIFF and PNG can be opened / saved. */
/* global Float16Array */
'use strict';
(function () {
  const U = ND.U;
  const D = {};
  let ok = null;
  D.supported = function () {
    if (ok !== null) return ok;
    try {
      const c = document.createElement('canvas'); c.width = c.height = 1;
      const x = c.getContext('2d', { colorType: 'float16' });
      ok = !!(x && x.getContextAttributes && x.getContextAttributes().colorType === 'float16' && typeof Float16Array !== 'undefined');
      if (ok) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 1, 1); ok = x.getImageData(0, 0, 1, 1, { pixelFormat: 'rgba-float16' }).data instanceof Float16Array; }
    } catch (e) { ok = false; }
    return ok;
  };
  D.is16 = (c) => !!(c && c._nd16);
  // new canvases follow the document that is being edited
  D.use = function (depth) { U.colorType = depth === 16 && D.supported() ? 'float16' : 'unorm8'; };
  D.read16 = (c, x, y, w, h) => U.ctx(c).getImageData(x || 0, y || 0, w || c.width, h || c.height, { pixelFormat: 'rgba-float16' });
  D.canvasFromHalf = function (half, w, h) {
    const prev = U.colorType; U.colorType = 'float16';
    const c = U.canvas(w, h); U.colorType = prev;
    U.ctx(c).putImageData(new ImageData(half, w, h, { pixelFormat: 'rgba-float16' }), 0, 0);
    return c;
  };
  /* ---------- lossless 16-bit storage: "ND16" + w + h + deflated half floats ---------- */
  const header = (w, h) => { const b = new Uint8Array(12), v = new DataView(b.buffer); b.set([78, 68, 49, 54]); v.setUint32(4, w, true); v.setUint32(8, h, true); return b; };
  D.encode = async function (c) {
    const d = D.read16(c).data, bytes = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
    return new Blob([header(c.width, c.height), await ND.Formats.deflate(bytes)], { type: 'application/x-nd16' });
  };
  D.encodeSync = function (c) { // uncompressed (only used by the synchronous project writer)
    const d = D.read16(c).data, bytes = new Uint8Array(d.buffer, d.byteOffset, d.byteLength), all = new Uint8Array(12 + bytes.length);
    all.set(header(c.width, c.height)); all.set(bytes, 12);
    let s = ''; for (let i = 0; i < all.length; i += 32768) s += String.fromCharCode.apply(null, all.subarray(i, i + 32768));
    return 'data:application/x-nd16-raw;base64,' + btoa(s);
  };
  D.decode = async function (u8, compressed) {
    const v = new DataView(u8.buffer, u8.byteOffset), w = v.getUint32(4, true), h = v.getUint32(8, true);
    let body = u8.subarray(12);
    if (compressed) body = await ND.Formats.inflate(body);
    const half = new Float16Array(body.buffer.slice(body.byteOffset, body.byteOffset + w * h * 8));
    return D.canvasFromHalf(half, w, h);
  };
  D.isRef = (ref) => typeof ref === 'string' && ref.startsWith('data:application/x-nd16');
  D.loadRef = async function (ref) {
    if (ref instanceof Blob) return D.decode(new Uint8Array(await ref.arrayBuffer()), true);
    const raw = ref.startsWith('data:application/x-nd16-raw');
    const bin = atob(ref.slice(ref.indexOf(',') + 1)), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return D.decode(u, !raw);
  };
  // the right encoder for any canvas (16-bit ones losslessly, others as PNG)
  D.blobFor = (c) => (D.is16(c) ? D.encode(c) : U.canvasToBlob(c, 'image/png'));

  /* ---------- converting a document ---------- */
  D.convert = function (doc, depth) {
    if (depth === 16 && !D.supported()) return 'This browser can’t do 16-bit canvases yet (Chrome / Edge can)';
    if ((doc.depth || 8) === depth) return '';
    const before = doc.depth || 8;
    D.use(depth);
    doc.resizeAll(doc.width, doc.height, (x, src) => x.drawImage(src, 0, 0), depth === 16 ? 'Convert to 16-bit' : 'Convert to 8-bit');
    const top = doc.history.stack[doc.history.pos - 1], u = top.undo, r = top.redo;
    top.undo = () => { D.use(before); u(); doc.depth = before; };
    top.redo = () => { D.use(depth); r(); doc.depth = depth; };
    doc.depth = depth;
    doc.pool = [];
    doc.invalidateAll();
    return '';
  };

  /* ---------- 16-bit PNG ---------- */
  D.png16 = async function (c) {
    const W = c.width, H = c.height, d = D.read16(c).data, raw = new Uint8Array(H * (1 + W * 8));
    for (let y = 0; y < H; y++) {
      const o = y * (1 + W * 8);
      for (let x = 0; x < W * 4; x++) { const v = Math.round(Math.max(0, Math.min(1, d[y * W * 4 + x])) * 65535); raw[o + 1 + x * 2] = v >> 8; raw[o + 2 + x * 2] = v & 255; }
    }
    const crcT = new Uint32Array(256).map((_, n) => { let c2 = n; for (let k = 0; k < 8; k++) c2 = c2 & 1 ? 0xedb88320 ^ (c2 >>> 1) : c2 >>> 1; return c2 >>> 0; });
    const crc = (b) => { let c2 = 0xffffffff; for (let i = 0; i < b.length; i++) c2 = crcT[(c2 ^ b[i]) & 255] ^ (c2 >>> 8); return (c2 ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const b = new Uint8Array(12 + data.length), v = new DataView(b.buffer); v.setUint32(0, data.length); b.set(new TextEncoder().encode(type), 4); b.set(data, 8); v.setUint32(8 + data.length, crc(b.subarray(4, 8 + data.length))); return b; };
    const ihdr = new Uint8Array(13), iv = new DataView(ihdr.buffer);
    iv.setUint32(0, W); iv.setUint32(4, H); ihdr[8] = 16; ihdr[9] = 6;
    return new Blob([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', ihdr), chunk('sRGB', Uint8Array.of(0)), chunk('IDAT', await ND.Formats.deflate(raw)), chunk('IEND', new Uint8Array(0))], { type: 'image/png' });
  };
  /* ---------- adjustments and filters at 16-bit precision ---------- */
  // apply a colour table (RGBA 8-bit grid N³, built by ND.GPU.lutFor) to float pixels with trilinear interpolation
  function applyLUT(d, lut, N, op, md) {
    const L = new Float32Array(lut.length), s = N - 1;
    for (let i = 0; i < lut.length; i++) L[i] = lut[i] / 255;
    const idx = (r, g, b) => ((b * N + g) * N + r) * 4;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      if (d[i + 3] <= 0) continue;
      const k = op * (md ? md[p * 4 + 3] / 255 : 1);
      if (k <= 0) continue;
      const x = Math.min(Math.max(d[i], 0), 1) * s, y = Math.min(Math.max(d[i + 1], 0), 1) * s, z = Math.min(Math.max(d[i + 2], 0), 1) * s;
      const x0 = Math.min(s - 1, Math.floor(x)), y0 = Math.min(s - 1, Math.floor(y)), z0 = Math.min(s - 1, Math.floor(z)), fx = x - x0, fy = y - y0, fz = z - z0;
      for (let c = 0; c < 3; c++) {
        const c00 = L[idx(x0, y0, z0) + c] * (1 - fx) + L[idx(x0 + 1, y0, z0) + c] * fx, c10 = L[idx(x0, y0 + 1, z0) + c] * (1 - fx) + L[idx(x0 + 1, y0 + 1, z0) + c] * fx;
        const c01 = L[idx(x0, y0, z0 + 1) + c] * (1 - fx) + L[idx(x0 + 1, y0, z0 + 1) + c] * fx, c11 = L[idx(x0, y0 + 1, z0 + 1) + c] * (1 - fx) + L[idx(x0 + 1, y0 + 1, z0 + 1) + c] * fx;
        const v = (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
        d[i + c] = d[i + c] + (v - d[i + c]) * k;
      }
    }
  }
  // run 8-bit pixel code on high-precision numbers (0–255 with fractions); null if the code can't cope
  function runFloat(fn, half, w, h) {
    const f = new Float32Array(half.length);
    for (let i = 0; i < f.length; i++) f[i] = half[i] * 255;
    const fake = { data: f, width: w, height: h, colorSpace: 'srgb' };
    let res;
    try { res = fn(fake) || fake; } catch (e) { return null; }
    const out = res.data;
    for (let i = 0; i < out.length; i += 97) if (out[i] !== out[i]) return null; // NaN: the code needs real 8-bit data
    const o = new Float32Array(out.length);
    for (let i = 0; i < out.length; i++) o[i] = Math.min(1, Math.max(0, out[i] / 255));
    return o;
  }
  // an adjustment layer on a 16-bit area; false = let the normal code do it
  D.adjust16 = function (ctx, n, r, env, maskCanvas) {
    const img = D.read16(ctx.canvas, 0, 0, r.w, r.h), d = img.data;
    const md = maskCanvas ? U.ctx(maskCanvas).getImageData(0, 0, r.w, r.h).data : null;
    if (ND.GPU && ND.GPU.pointwise(n.kind)) applyLUT(d, ND.GPU.lutFor(n, env), ND.GPU.LUTN, n.opacity, md);
    else {
      const out = runFloat((im) => ND.Adjust.apply(n.kind, im, n.params, env), d, r.w, r.h);
      if (!out) return false;
      for (let i = 0, p = 0; i < d.length; i += 4, p++) { if (d[i + 3] <= 0) continue; const k = n.opacity * (md ? md[p * 4 + 3] / 255 : 1); for (let c = 0; c < 3; c++) d[i + c] += (out[i + c] - d[i + c]) * k; }
    }
    ctx.putImageData(img, 0, 0);
    return true;
  };
  // a filter on a 16-bit canvas; null = run it the normal way
  const NOT_TABLE = ['autocontrast', 'colortoalpha'];
  D.filter16 = function (f, src, p, env) {
    const w = src.width, h = src.height, img = D.read16(src), d = img.data;
    if (f.cat === 'Adjust' && !NOT_TABLE.includes(f.id)) {
      // colour filters: a colour table built from the filter itself
      const N = ND.GPU ? ND.GPU.LUTN : 33, t = new ImageData(N * N, N), td = t.data;
      for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) { const i = ((b * N + g) * N + r) * 4; td[i] = Math.round((r * 255) / (N - 1)); td[i + 1] = Math.round((g * 255) / (N - 1)); td[i + 2] = Math.round((b * 255) / (N - 1)); td[i + 3] = 255; }
      const res = f.px(t, p, env) || t;
      applyLUT(d, res.data, N, 1, null);
    } else {
      const out = runFloat((im) => f.px(im, p, env), d, w, h);
      if (!out) return null;
      for (let i = 0; i < d.length; i++) d[i] = out[i];
    }
    const prev = U.colorType; U.colorType = 'float16';
    const c = U.canvas(w, h); U.colorType = prev;
    U.ctx(c).putImageData(img, 0, 0);
    return c;
  };
  ND.Deep = D;
})();
