/* Neon Draw — 16-bit documents. A 16-bit document keeps every layer, mask and work buffer in 16-bit floating
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
  ND.Deep = D;
})();
