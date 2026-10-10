/* Neon Draw — more file formats: TIFF (open / save), PDF (save), Krita .kra (open / save), and the parts of
 * Photoshop files that keep text and adjustment layers editable. All written from the published layouts. */
/* global Float16Array */
'use strict';
(function () {
  const U = ND.U, enc = new TextEncoder();
  const F = {};

  /* ---------- small helpers ---------- */
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  F.deflate = (b) => pipe(b, new CompressionStream('deflate'));
  F.inflate = (b) => pipe(b, new DecompressionStream('deflate'));
  class Buf {
    constructor(le) { this.a = []; this.n = 0; this.le = !!le; }
    u8(v) { this.a.push(Uint8Array.of(v & 255)); this.n++; return this; }
    u16(v) { const d = new DataView(new ArrayBuffer(2)); d.setUint16(0, v, this.le); return this.raw(new Uint8Array(d.buffer)); }
    i16(v) { const d = new DataView(new ArrayBuffer(2)); d.setInt16(0, v, this.le); return this.raw(new Uint8Array(d.buffer)); }
    u32(v) { const d = new DataView(new ArrayBuffer(4)); d.setUint32(0, v >>> 0, this.le); return this.raw(new Uint8Array(d.buffer)); }
    i32(v) { const d = new DataView(new ArrayBuffer(4)); d.setInt32(0, v, this.le); return this.raw(new Uint8Array(d.buffer)); }
    f32(v) { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, v, this.le); return this.raw(new Uint8Array(d.buffer)); }
    f64(v) { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, v, this.le); return this.raw(new Uint8Array(d.buffer)); }
    str(s) { return this.raw(enc.encode(s)); }
    raw(u) { this.a.push(u); this.n += u.length; return this; }
    bytes() { const o = new Uint8Array(this.n); let p = 0; for (const c of this.a) { o.set(c, p); p += c.length; } return o; }
  }
  F.Buf = Buf;
  const rgbaOf = (c) => U.ctx(c).getImageData(0, 0, c.width, c.height).data;

  /* ================= TIFF ================= */
  // LZW as used by TIFF (MSB-first codes, early change)
  function tiffLZW(src, outLen) {
    const out = new Uint8Array(outLen);
    let op = 0, bitBuf = 0, bitCnt = 0, ip = 0, size = 9, dict = [], prev = null;
    const reset = () => { dict = []; for (let i = 0; i < 256; i++) dict[i] = [i]; dict[256] = null; dict[257] = null; size = 9; prev = null; };
    reset();
    for (;;) {
      while (bitCnt < size && ip < src.length) { bitBuf = (bitBuf << 8) | src[ip++]; bitCnt += 8; }
      if (bitCnt < size) break;
      const code = (bitBuf >>> (bitCnt - size)) & ((1 << size) - 1);
      bitCnt -= size; bitBuf &= (1 << bitCnt) - 1;
      if (code === 256) { reset(); continue; }
      if (code === 257) break;
      let entry;
      if (code < dict.length && dict[code]) entry = dict[code];
      else if (prev) entry = prev.concat([prev[0]]);
      else break;
      for (const b of entry) { if (op < outLen) out[op++] = b; }
      if (prev) dict.push(prev.concat([entry[0]]));
      prev = entry;
      if (dict.length + 1 >= 1 << size && size < 12) size++;
    }
    return out;
  }
  function packBits(src, outLen) {
    const out = new Uint8Array(outLen);
    let ip = 0, op = 0;
    while (ip < src.length && op < outLen) {
      const n = (src[ip++] << 24) >> 24;
      if (n >= 0) { for (let i = 0; i <= n && op < outLen; i++) out[op++] = src[ip++]; } else if (n !== -128) { const v = src[ip++]; for (let i = 0; i < 1 - n && op < outLen; i++) out[op++] = v; }
    }
    return out;
  }
  // Open a TIFF (first image). 8 / 16-bit; grey, RGB, palette, CMYK; strips or tiles; none / LZW / Deflate / PackBits.
  F.readTIFF = async function (buf) {
    const dv = new DataView(buf), b8 = new Uint8Array(buf);
    const le = dv.getUint16(0) === 0x4949;
    if (dv.getUint16(2, le) !== 42) throw new Error('Not a TIFF file');
    const off = dv.getUint32(4, le), n = dv.getUint16(off, le), T = {};
    const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12, tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), cnt = dv.getUint32(e + 4, le), sz = (SZ[type] || 1) * cnt;
      const p = sz <= 4 ? e + 8 : dv.getUint32(e + 8, le), vals = [];
      if (tag === 34675) { T.icc = b8.slice(p, p + cnt); continue; }
      for (let k = 0; k < Math.min(cnt, 1 << 20); k++) {
        const q = p + k * (SZ[type] || 1);
        vals.push(type === 3 ? dv.getUint16(q, le) : type === 4 ? dv.getUint32(q, le) : type === 5 ? dv.getUint32(q, le) / (dv.getUint32(q + 4, le) || 1) : type === 8 ? dv.getInt16(q, le) : dv.getUint8(q));
      }
      T[tag] = vals;
    }
    const W = T[256][0], H = T[257][0], bps = (T[258] || [1])[0], spp = (T[277] || [1])[0], comp = (T[259] || [1])[0], photo = (T[262] || [2])[0];
    const planar = (T[284] || [1])[0], pred = (T[317] || [1])[0], extra = T[338] || [];
    if (![1, 8, 16].includes(bps)) throw new Error(bps + '-bit TIFFs aren’t supported');
    const tiled = !!T[322];
    const tw = tiled ? T[322][0] : W, th = tiled ? T[323][0] : (T[278] || [H])[0];
    const offs = tiled ? T[324] : T[273], cnts = tiled ? T[325] : T[279];
    const across = tiled ? Math.ceil(W / tw) : 1, planes = planar === 2 ? spp : 1;
    const full = new Uint8Array(W * H * spp), full16 = bps === 16 ? new Uint16Array(W * H * spp) : null;
    const chunkSpp = planar === 2 ? 1 : spp, rowBytes = Math.ceil((tw * chunkSpp * bps) / 8);
    const per = offs.length / planes;
    for (let ci = 0; ci < offs.length; ci++) {
      const plane = Math.floor(ci / per), idx = ci % per;
      let data = b8.subarray(offs[ci], offs[ci] + cnts[ci]);
      const want = rowBytes * th;
      if (comp === 5) data = tiffLZW(data, want);
      else if (comp === 8 || comp === 32946) data = await F.inflate(data);
      else if (comp === 32773) data = packBits(data, want);
      else if (comp !== 1) throw new Error('This TIFF uses a compression Neon Draw can’t read (' + comp + ')');
      if (pred === 2) { // horizontal differencing
        const step = chunkSpp;
        for (let r = 0; r < th; r++) {
          if (bps === 8) { for (let x = step; x < tw * step; x++) data[r * rowBytes + x] = (data[r * rowBytes + x] + data[r * rowBytes + x - step]) & 255; }
          else if (bps === 16) { const v = new DataView(data.buffer, data.byteOffset); for (let x = step; x < tw * step; x++) { const a = r * rowBytes + x * 2; v.setUint16(a, (v.getUint16(a, le) + v.getUint16(a - step * 2, le)) & 65535, le); } }
        }
      }
      const x0 = tiled ? (idx % across) * tw : 0, y0 = tiled ? Math.floor(idx / across) * th : idx * th;
      for (let r = 0; r < th && y0 + r < H; r++) {
        for (let x = 0; x < tw && x0 + x < W; x++) {
          for (let c = 0; c < chunkSpp; c++) {
            const ch = planar === 2 ? plane : c, dst = ((y0 + r) * W + x0 + x) * spp + ch;
            if (bps === 8) full[dst] = data[r * rowBytes + x * chunkSpp + c];
            else if (bps === 16) { const a = r * rowBytes + (x * chunkSpp + c) * 2, v16 = le ? data[a] | (data[a + 1] << 8) : (data[a] << 8) | data[a + 1]; full[dst] = v16 >> 8; full16[dst] = v16; }
            else full[dst] = (data[r * rowBytes + ((x * chunkSpp + c) >> 3)] >> (7 - ((x * chunkSpp + c) & 7))) & 1 ? 255 : 0;
          }
        }
      }
    }
    const c = U.canvas(W, H), x = U.ctx(c), img = x.createImageData(W, H), o = img.data, map = T[320];
    const assoc = extra[0] === 1;
    for (let i = 0; i < W * H; i++) {
      const s = i * spp, d = i * 4;
      let r, g, b, a = 255;
      if (photo === 2) { r = full[s]; g = full[s + 1]; b = full[s + 2]; if (spp > 3) a = full[s + 3]; }
      else if (photo === 5) { const C = full[s] / 255, M = full[s + 1] / 255, Y = full[s + 2] / 255, K = full[s + 3] / 255; const rgb = ND.Colour && ND.Colour.cmykToRgb ? ND.Colour.cmykToRgb(C, M, Y, K) : [(1 - C) * (1 - K) * 255, (1 - M) * (1 - K) * 255, (1 - Y) * (1 - K) * 255]; r = rgb[0]; g = rgb[1]; b = rgb[2]; if (spp > 4) a = full[s + 4]; }
      else if (photo === 3 && map) { const k = full[s], m3 = map.length / 3; r = map[k] >> 8; g = map[m3 + k] >> 8; b = map[2 * m3 + k] >> 8; }
      else { const v = photo === 0 ? 255 - full[s] : full[s]; r = g = b = v; if (spp > 1) a = full[s + 1]; }
      if (assoc && a > 0 && a < 255) { r = (r * 255) / a; g = (g * 255) / a; b = (b * 255) / a; }
      o[d] = r; o[d + 1] = g; o[d + 2] = b; o[d + 3] = a;
    }
    x.putImageData(img, 0, 0);
    // 16-bit RGB / grey: keep every bit in a 16-bit canvas
    if (full16 && (photo === 2 || photo <= 1) && ND.Deep && ND.Deep.supported()) {
      const half = new Float16Array(W * H * 4);
      for (let i = 0; i < W * H; i++) {
        const s0 = i * spp;
        if (photo === 2) { half[i * 4] = full16[s0] / 65535; half[i * 4 + 1] = full16[s0 + 1] / 65535; half[i * 4 + 2] = full16[s0 + 2] / 65535; half[i * 4 + 3] = spp > 3 ? full16[s0 + 3] / 65535 : 1; }
        else { const v = (photo === 0 ? 65535 - full16[s0] : full16[s0]) / 65535; half[i * 4] = half[i * 4 + 1] = half[i * 4 + 2] = v; half[i * 4 + 3] = spp > 1 ? full16[s0 + 1] / 65535 : 1; }
      }
      return { canvas: ND.Deep.canvasFromHalf(half, W, H), icc: T.icc || null, cmyk: false, bits: 16 };
    }
    return { canvas: c, icc: T.icc || null, cmyk: photo === 5, bits: bps };
  };
  /* Save a TIFF. opts: { cmyk: false, icc: Uint8Array|null, dpi: 72, alpha: true }.
   * RGB(A) 8-bit, or CMYK when opts.cmyk (converted with ND.Colour). Deflate-compressed with prediction. */
  F.writeTIFF = async function (canvas, opts) {
    opts = opts || {};
    const W = canvas.width, H = canvas.height, d = rgbaOf(canvas), cmyk = !!opts.cmyk, spp = cmyk ? 4 : opts.alpha === false ? 3 : 4;
    const b16 = !!opts.bits16 && !cmyk && ND.Deep && ND.Deep.is16(canvas), bytesPer = b16 ? 2 : 1;
    let raw = new Uint8Array(W * H * spp);
    if (b16) {
      // 16 bits per channel, big-endian samples are fine as long as the byte order mark says so: we write little-endian
      const f16 = ND.Deep.read16(canvas).data, r16 = new Uint8Array(W * H * 4 * 2);
      for (let i = 0; i < W * H * 4; i++) { const v = Math.round(Math.max(0, Math.min(1, f16[i])) * 65535); r16[i * 2] = v & 255; r16[i * 2 + 1] = v >> 8; }
      raw = r16;
    }
    for (let i = 0, j = 0; i < W * H && !b16; i++, j += 4) {
      if (cmyk) { const k = ND.Colour.rgbToCmyk(d[j], d[j + 1], d[j + 2], d[j + 3]); raw.set(k, i * 4); }
      else { raw[i * spp] = d[j]; raw[i * spp + 1] = d[j + 1]; raw[i * spp + 2] = d[j + 2]; if (spp === 4) raw[i * spp + 3] = d[j + 3]; }
    }
    // horizontal prediction makes Deflate much smaller for photos
    const row = W * spp * bytesPer;
    if (!b16) for (let y = 0; y < H; y++) for (let x = row - 1; x >= spp; x--) raw[y * row + x] = (raw[y * row + x] - raw[y * row + x - spp]) & 255;
    const rps = Math.max(1, Math.floor(262144 / row)), strips = [];
    for (let y = 0; y < H; y += rps) strips.push(await F.deflate(raw.subarray(y * row, Math.min(H, y + rps) * row)));
    const tags = [];
    const add = (tag, type, vals) => tags.push({ tag, type, vals: Array.isArray(vals) || vals instanceof Uint8Array ? vals : [vals] });
    const dpi = opts.dpi || 72;
    add(256, 4, W); add(257, 4, H); add(258, 3, new Array(spp).fill(b16 ? 16 : 8)); add(259, 3, 8); add(262, 3, cmyk ? 5 : 2);
    add(273, 4, strips.map(() => 0)); add(277, 3, spp); add(278, 4, rps); add(279, 4, strips.map((s) => s.length));
    add(282, 5, [dpi]); add(283, 5, [dpi]); add(284, 3, 1); add(296, 3, 2); add(305, 2, enc.encode('Neon Draw\0')); add(317, 3, b16 ? 1 : 2);
    if (spp === 4 && !cmyk) add(338, 3, 2);
    if (opts.icc) add(34675, 7, opts.icc);
    tags.sort((a, b) => a.tag - b.tag);
    const SZ = { 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };
    // layout: header, IFD, out-of-line values, strips
    const ifdSize = 2 + tags.length * 12 + 4;
    let extra = 8 + ifdSize;
    const blobs = [];
    tags.forEach((t) => { const sz = SZ[t.type] * t.vals.length; t.sz = sz; if (sz > 4) { t.at = extra; extra += sz + (sz & 1); } });
    let stripAt = extra;
    const stripOffsets = strips.map((s) => { const o = stripAt; stripAt += s.length; return o; });
    tags.find((t) => t.tag === 273).vals = stripOffsets;
    const b = new Buf(true);
    b.str('II'); b.u16(42); b.u32(8);
    b.u16(tags.length);
    const val = (bb, t, v) => { if (t.type === 3) bb.u16(v); else if (t.type === 4) bb.u32(v); else if (t.type === 5) { bb.u32(Math.round(v * 100)); bb.u32(100); } else bb.u8(v); };
    tags.forEach((t) => {
      b.u16(t.tag); b.u16(t.type); b.u32(t.vals.length);
      if (t.sz > 4) b.u32(t.at);
      else { const s = new Buf(true); t.vals.forEach((v) => val(s, t, v)); const by = s.bytes(), pad = new Uint8Array(4); pad.set(by); b.raw(pad); }
    });
    b.u32(0);
    tags.forEach((t) => { if (t.sz > 4) { t.vals.forEach((v) => val(b, t, v)); if (t.sz & 1) b.u8(0); } });
    strips.forEach((s) => b.raw(s));
    blobs.push(b.bytes());
    return new Blob(blobs, { type: 'image/tiff' });
  };

  /* ================= PDF ================= */
  /* Pages: canvases (one per page). opts: { dpi: 300, jpeg: 0.92 | 0 (lossless), title }.
   * The page is the picture's size at that dpi. Transparent pictures keep their transparency (soft mask). */
  F.writePDF = async function (pages, opts) {
    opts = opts || {};
    const dpi = opts.dpi || 300, objs = [], add = (o) => { objs.push(o); return objs.length; };
    const catalog = add(null), pagesId = add(null), kids = [];
    for (const c of pages) {
      const W = c.width, H = c.height, d = rgbaOf(c);
      let hasAlpha = false;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { hasAlpha = true; break; }
      let imgId, smaskId = null;
      if (hasAlpha) {
        const a = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) a[i] = d[i * 4 + 3];
        const z = await F.deflate(a);
        smaskId = add({ dict: '/Type /XObject /Subtype /Image /Width ' + W + ' /Height ' + H + ' /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ' + z.length, stream: z });
      }
      if (opts.jpeg) {
        const fl = U.canvas(W, H), fx = U.ctx(fl); fx.fillStyle = '#fff'; fx.fillRect(0, 0, W, H); fx.drawImage(c, 0, 0);
        const j = new Uint8Array(await (await U.canvasToBlob(fl, 'image/jpeg', opts.jpeg)).arrayBuffer());
        imgId = add({ dict: '/Type /XObject /Subtype /Image /Width ' + W + ' /Height ' + H + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode' + (smaskId ? ' /SMask ' + smaskId + ' 0 R' : '') + ' /Length ' + j.length, stream: j });
      } else {
        const rgb = new Uint8Array(W * H * 3);
        for (let i = 0; i < W * H; i++) { rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2]; }
        const z = await F.deflate(rgb);
        imgId = add({ dict: '/Type /XObject /Subtype /Image /Width ' + W + ' /Height ' + H + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode' + (smaskId ? ' /SMask ' + smaskId + ' 0 R' : '') + ' /Length ' + z.length, stream: z });
      }
      const pw = (W * 72) / dpi, ph = (H * 72) / dpi, cs = enc.encode('q ' + pw.toFixed(3) + ' 0 0 ' + ph.toFixed(3) + ' 0 0 cm /Im0 Do Q');
      const content = add({ dict: '/Length ' + cs.length, stream: cs });
      kids.push(add({ dict: '/Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + pw.toFixed(3) + ' ' + ph.toFixed(3) + '] /Resources << /XObject << /Im0 ' + imgId + ' 0 R >> >> /Contents ' + content + ' 0 R' }));
    }
    objs[catalog - 1] = { dict: '/Type /Catalog /Pages ' + pagesId + ' 0 R' };
    objs[pagesId - 1] = { dict: '/Type /Pages /Kids [' + kids.map((k) => k + ' 0 R').join(' ') + '] /Count ' + kids.length };
    const pdfStr = (s) => '(' + String(s).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '?') + ')';
    const info = add({ dict: '/Title ' + pdfStr(opts.title || 'Neon Draw') + ' /Producer (Neon Draw)' });
    const parts = [], offsets = [];
    let pos = 0;
    const put = (u) => { parts.push(u); pos += u.length; };
    put(enc.encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
    objs.forEach((o, i) => {
      offsets.push(pos);
      put(enc.encode((i + 1) + ' 0 obj\n<< ' + o.dict + ' >>\n'));
      if (o.stream) { put(enc.encode('stream\n')); put(o.stream); put(enc.encode('\nendstream\n')); }
      put(enc.encode('endobj\n'));
    });
    const xref = pos;
    put(enc.encode('xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n'));
    return new Blob(parts, { type: 'application/pdf' });
  };

  /* ================= Krita .kra ================= */
  // LZF as used by Krita's tiles
  F.lzfDecompress = function (src, outLen) {
    const out = new Uint8Array(outLen);
    let ip = 0, op = 0;
    while (ip < src.length) {
      const ctrl = src[ip++];
      if (ctrl < 32) { const n = ctrl + 1; if (op + n > outLen) return null; for (let i = 0; i < n; i++) out[op++] = src[ip++]; }
      else {
        let len = ctrl >> 5;
        let ref = op - ((ctrl & 31) << 8) - 1;
        if (len === 7) len += src[ip++];
        ref -= src[ip++];
        len += 2;
        if (ref < 0 || op + len > outLen) return null;
        for (let i = 0; i < len; i++) out[op++] = out[ref++];
      }
    }
    return op === outLen ? out : null;
  };
  F.lzfCompress = function (src) {
    const n = src.length, out = new Uint8Array(n + Math.ceil(n / 32) + 16), HT = new Int32Array(1 << 14).fill(-1);
    let ip = 0, op = 0, lit = 0, litStart = 0;
    const flushLit = () => { while (lit > 0) { const k = Math.min(32, lit); out[op++] = k - 1; out.set(src.subarray(litStart, litStart + k), op); op += k; litStart += k; lit -= k; } };
    while (ip < n) {
      if (ip + 2 < n) {
        const h = Math.imul((src[ip] << 16) | (src[ip + 1] << 8) | src[ip + 2], 2654435761) >>> 18, ref = HT[h];
        HT[h] = ip;
        const dist = ip - ref - 1;
        if (ref >= 0 && dist < 8192 && src[ref] === src[ip] && src[ref + 1] === src[ip + 1] && src[ref + 2] === src[ip + 2]) {
          let len = 3;
          const max = Math.min(264, n - ip);
          while (len < max && src[ref + len] === src[ip + len]) len++;
          flushLit();
          const L = len - 2;
          if (L < 7) out[op++] = (L << 5) | (dist >> 8);
          else { out[op++] = (7 << 5) | (dist >> 8); out[op++] = L - 7; }
          out[op++] = dist & 255;
          ip += len; litStart = ip;
          continue;
        }
      }
      if (lit === 0) litStart = ip;
      lit++; ip++;
    }
    flushLit();
    return out.subarray(0, op);
  };
  const KRA_BLEND = { normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', dodge: 'dodge', burn: 'burn', hardlight: 'hard_light', softlight: 'soft_light', difference: 'diff', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminize', add: 'add', subtract: 'subtract', divide: 'divide', linearburn: 'linear_burn', vividlight: 'vivid_light', linearlight: 'linear light', pinlight: 'pin_light', hardmix: 'hard mix', darkercolor: 'darker color', lightercolor: 'lighter color', grainextract: 'grain_extract', grainmerge: 'grain_merge' };
  const KRA_BACK = {};
  Object.keys(KRA_BLEND).forEach((k) => { KRA_BACK[KRA_BLEND[k]] = k; });
  Object.assign(KRA_BACK, { soft_light_svg: 'softlight', difference: 'difference', linear_light: 'linearlight', hard_mix: 'hardmix', darker_color: 'darkercolor', lighter_color: 'lightercolor' });
  const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // one paint device as Krita tiles (64 × 64, BGRA, channels stored one after another, LZF)
  function kraTiles(canvas, x0, y0, w, h, pixelSize, grey) {
    const d = U.ctx(canvas).getImageData(x0, y0, w, h).data, parts = [], T = 64;
    let count = 0;
    for (let ty = 0; ty < h; ty += T) {
      for (let tx = 0; tx < w; tx += T) {
        const tile = new Uint8Array(T * T * pixelSize);
        let any = false;
        for (let y = 0; y < T && ty + y < h; y++) for (let x = 0; x < T && tx + x < w; x++) {
          const s = ((ty + y) * w + tx + x) * 4, p = (y * T + x) * pixelSize;
          if (grey) { tile[p] = d[s]; if (d[s] !== 0) any = true; } else { tile[p] = d[s + 2]; tile[p + 1] = d[s + 1]; tile[p + 2] = d[s]; tile[p + 3] = d[s + 3]; if (d[s + 3]) any = true; }
        }
        if (!any && !grey) continue;
        // planar order (all of channel 0, then channel 1…) compresses better
        const lin = new Uint8Array(tile.length), plane = T * T;
        for (let c = 0; c < pixelSize; c++) for (let i = 0; i < plane; i++) lin[c * plane + i] = tile[i * pixelSize + c];
        const z = F.lzfCompress(lin);
        const body = z.length < tile.length ? concat([Uint8Array.of(1), z]) : concat([Uint8Array.of(0), tile]);
        parts.push(enc.encode((x0 + tx) + ',' + (y0 + ty) + ',LZF,' + body.length + '\n'), body);
        count++;
      }
    }
    return concat([enc.encode('VERSION 2\nTILEWIDTH 64\nTILEHEIGHT 64\nPIXELSIZE ' + pixelSize + '\nDATA ' + count + '\n')].concat(parts));
  }
  function concat(list) { let n = 0; list.forEach((u) => { n += u.length; }); const o = new Uint8Array(n); let p = 0; list.forEach((u) => { o.set(u, p); p += u.length; }); return o; }
  async function png(c) { return new Uint8Array(await (await U.canvasToBlob(c, 'image/png')).arrayBuffer()); }
  F.writeKRA = async function (doc) {
    const W = doc.width, H = doc.height, name = (doc.name || 'image').replace(/[^\w-]+/g, '_') || 'image';
    const files = [{ name: 'mimetype', data: enc.encode('application/x-krita') }];
    let n = 1, skipped = 0;
    const uuid = () => '{' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = (Math.random() * 16) | 0; return (ch === 'x' ? r : (r & 3) | 8).toString(16); }) + '}';
    const layerXml = async (nodes, ind) => {
      let out = '';
      for (const nd of nodes.slice().reverse()) { // Krita lists the top layer first
        const fn = 'layer' + n++, common = 'name="' + xmlEsc(nd.name) + '" filename="' + fn + '" visible="' + (nd.visible ? 1 : 0) + '" opacity="' + Math.round(nd.opacity * 255) + '" compositeop="' + (KRA_BLEND[nd.blendMode] || 'normal') + '" locked="' + (nd.locked ? 1 : 0) + '" uuid="' + uuid() + '" x="0" y="0" collapsed="' + (nd.collapsed ? 1 : 0) + '" colorlabel="0" channelflags="" intimeline="0" onionskin="0"';
        if (nd.isGroup) { out += ind + '<layer nodetype="grouplayer" ' + common + ' passthrough="' + (nd.blendMode === 'normal' ? 1 : 0) + '">\n' + ind + ' <layers>\n' + (await layerXml(nd.children, ind + '  ')) + ind + ' </layers>\n' + ind + '</layer>\n'; continue; }
        if (!nd.isPixel) { skipped++; continue; }
        const px = nd.effects && ND.Effects.any(nd.effects) ? doc.renderNode(Object.assign(Object.create(Object.getPrototypeOf(nd)), nd, { mask: null })) : nd.canvas;
        files.push({ name: name + '/layers/' + fn, data: kraTiles(px, 0, 0, W, H, 4, false) }, { name: name + '/layers/' + fn + '.defaultpixel', data: new Uint8Array(4) });
        let masks = '';
        if (nd.mask) {
          const mf = fn + '.mask' + n++;
          files.push({ name: name + '/layers/' + mf, data: kraTiles(nd.mask, 0, 0, W, H, 1, true) }, { name: name + '/layers/' + mf + '.defaultpixel', data: Uint8Array.of(255) });
          masks = ind + ' <masks>\n' + ind + '  <mask nodetype="transparencymask" name="Mask" filename="' + mf + '" visible="' + (nd.maskEnabled ? 1 : 0) + '" x="0" y="0" locked="0" uuid="' + uuid() + '" colorlabel="0" compositeop="normal" channelflags=""/>\n' + ind + ' </masks>\n';
        }
        out += ind + '<layer nodetype="paintlayer" ' + common + ' colorspacename="RGBA" channellockflags=""' + (nd.alphaLock ? ' alphalocked="1"' : '') + (masks ? '>\n' + masks + ind + '</layer>\n' : '/>\n');
      }
      return out;
    };
    const layers = await layerXml(doc.root.children, '   ');
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE DOC PUBLIC \'-//KDE//DTD krita 2.0//EN\' \'http://www.calligra.org/DTD/krita-2.0.dtd\'>\n<DOC xmlns="http://www.calligra.org/DTD/krita" kritaVersion="5.2.0" syntaxVersion="2.0" editor="Krita">\n <IMAGE width="' + W + '" height="' + H + '" mime="application/x-kra" name="' + xmlEsc(name) + '" description="" colorspacename="RGBA" profile="sRGB-elle-V2-srgbtrc.icc" x-res="300" y-res="300">\n  <layers>\n' + layers + '  </layers>\n </IMAGE>\n</DOC>\n';
    const flat = doc.flatCopy(), k = Math.min(1, 256 / Math.max(W, H)), pv = U.canvas(Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)));
    U.ctx(pv).drawImage(flat, 0, 0, pv.width, pv.height);
    files.push({ name: 'maindoc.xml', data: enc.encode(xml) },
      { name: 'documentinfo.xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE document-info PUBLIC \'-//KDE//DTD document-info 1.1//EN\' \'http://www.calligra.org/DTD/document-info-1.1.dtd\'>\n<document-info xmlns="http://www.calligra.org/DTD/document-info">\n <about>\n  <title>' + xmlEsc(doc.name || '') + '</title>\n  <editing-cycles>1</editing-cycles>\n </about>\n <author/>\n</document-info>\n') },
      { name: 'mergedimage.png', data: await png(flat) }, { name: 'preview.png', data: await png(pv) });
    const blob = ND.Store.zip(files);
    blob.skipped = skipped;
    return blob;
  };
  // read a Krita paint device (tiles) into a canvas
  function kraDevice(bytes, W, H, ox, oy, def) {
    let p = 0;
    const line = () => { let e = p; while (e < bytes.length && bytes[e] !== 10) e++; const s = new TextDecoder().decode(bytes.subarray(p, e)); p = e + 1; return s; };
    const head = {};
    for (let i = 0; i < 5; i++) { const [k, v] = line().split(' '); head[k] = +v; }
    const T = head.TILEWIDTH || 64, ps = head.PIXELSIZE || 4, c = U.canvas(W, H), x = U.ctx(c), img = x.createImageData(W, H), o = img.data;
    if (def) for (let i = 0; i < W * H; i++) o.set(def, i * 4);
    for (let t = 0; t < head.DATA; t++) {
      const [tx, ty, , size] = line().split(','), body = bytes.subarray(p, p + +size);
      p += +size;
      let tile;
      if (body[0] === 1) {
        const lin = F.lzfDecompress(body.subarray(1), T * T * ps);
        if (!lin) continue;
        tile = new Uint8Array(lin.length);
        const plane = T * T;
        for (let i = 0; i < plane; i++) for (let ch = 0; ch < ps; ch++) tile[i * ps + ch] = lin[ch * plane + i];
      } else tile = body.subarray(1);
      for (let y = 0; y < T; y++) {
        const Y = +ty + y + oy; if (Y < 0 || Y >= H) continue;
        for (let xx = 0; xx < T; xx++) {
          const X = +tx + xx + ox; if (X < 0 || X >= W) continue;
          const s = (y * T + xx) * ps, dd = (Y * W + X) * 4;
          if (ps === 1) { o[dd] = o[dd + 1] = o[dd + 2] = tile[s]; o[dd + 3] = 255; } else if (ps === 4) { o[dd] = tile[s + 2]; o[dd + 1] = tile[s + 1]; o[dd + 2] = tile[s]; o[dd + 3] = tile[s + 3]; } else if (ps === 8) { o[dd] = tile[s + 5]; o[dd + 1] = tile[s + 3]; o[dd + 2] = tile[s + 1]; o[dd + 3] = tile[s + 7]; }
        }
      }
    }
    x.putImageData(img, 0, 0);
    return { canvas: c, ps };
  }
  F.readKRA = async function (buf, fname) {
    const zz = await ND.Store.unzip(buf), z = {};
    for (const nm of zz.names) { if (/\.(png|xml)$/i.test(nm) || /\/layers\//.test(nm)) z[nm] = await zz.get(nm); }
    const get = (n) => z[n] || z[Object.keys(z).find((k) => k.toLowerCase() === n.toLowerCase())];
    const xmlB = get('maindoc.xml');
    if (!xmlB) throw new Error('Not a Krita file');
    const xml = new DOMParser().parseFromString(new TextDecoder().decode(xmlB), 'application/xml'), IMG = xml.getElementsByTagName('IMAGE')[0];
    const W = +IMG.getAttribute('width'), H = +IMG.getAttribute('height'), base = IMG.getAttribute('name');
    const doc = new ND.Doc(W, H, null);
    doc.name = (fname || base || 'Krita').replace(/\.kra$/i, '');
    doc.root.children = [];
    let skipped = 0, deep = 0;
    const file = (fn) => get(base + '/layers/' + fn);
    const walk = (layersEl, parent) => {
      const kids = Array.from(layersEl.children).filter((e) => e.tagName === 'layer').reverse(); // bottom first
      for (const e of kids) {
        const type = e.getAttribute('nodetype'), common = { visible: e.getAttribute('visible') !== '0', opacity: (+e.getAttribute('opacity') || 255) / 255, blendMode: KRA_BACK[e.getAttribute('compositeop')] || 'normal', locked: e.getAttribute('locked') === '1' };
        let n = null;
        if (type === 'grouplayer') {
          n = new ND.Group(e.getAttribute('name'));
          Object.assign(n, common, { collapsed: e.getAttribute('collapsed') === '1' });
          if (e.getAttribute('passthrough') === '1') n.blendMode = 'normal';
          const inner = Array.from(e.children).find((c) => c.tagName === 'layers');
          if (inner) walk(inner, n);
        } else if (type === 'paintlayer') {
          const bytes = file(e.getAttribute('filename'));
          if (!bytes) { skipped++; continue; }
          if ((e.getAttribute('colorspacename') || 'RGBA') !== 'RGBA' && !/^RGBA16/.test(e.getAttribute('colorspacename'))) deep++;
          const dev = kraDevice(bytes, W, H, +e.getAttribute('x') || 0, +e.getAttribute('y') || 0);
          n = new ND.Layer(e.getAttribute('name'), W, H);
          U.ctx(n.canvas).drawImage(dev.canvas, 0, 0);
          Object.assign(n, common, { alphaLock: e.getAttribute('alphalocked') === '1' });
          const masks = Array.from(e.children).find((c) => c.tagName === 'masks');
          const tm = masks && Array.from(masks.children).find((m) => m.getAttribute('nodetype') === 'transparencymask');
          if (tm && file(tm.getAttribute('filename'))) {
            const mb = file(tm.getAttribute('filename')), dp = file(tm.getAttribute('filename') + '.defaultpixel'), dv = dp && dp.length ? dp[0] : 255;
            n.mask = kraDevice(mb, W, H, +tm.getAttribute('x') || 0, +tm.getAttribute('y') || 0, Uint8Array.of(dv, dv, dv, 255)).canvas;
            n.maskEnabled = tm.getAttribute('visible') !== '0';
          }
        } else { skipped++; continue; }
        parent.children.push(n);
      }
    };
    walk(Array.from(IMG.children).find((c) => c.tagName === 'layers'), doc.root);
    if (!doc.allLayers().length) {
      const mi = get('mergedimage.png'), L = new ND.Layer('Image', W, H);
      if (mi) U.ctx(L.canvas).drawImage(await U.blobToImage(new Blob([mi])), 0, 0);
      doc.root.children.push(L);
    }
    doc.active = doc.firstLayer();
    doc.invalidateAll();
    doc.importNote = [skipped ? skipped + ' layer' + (skipped > 1 ? 's' : '') + ' of kinds Neon Draw doesn’t have (vector, filter, fill…) were left out' : '', deep ? 'deep-colour layers were read at 8 bits' : ''].filter(Boolean).join(' · ');
    return doc;
  };

  /* ================= Photoshop: editable adjustment & text layers ================= */
  // descriptor writer (Photoshop "action descriptor" structure)
  const idStr = (b, s) => { if (s.length === 4) { b.u32(0); b.str(s); } else { b.u32(s.length); b.str(s); } };
  const uniStr = (b, s) => { b.u32(s.length + 1); for (let i = 0; i < s.length; i++) b.u16(s.charCodeAt(i)); b.u16(0); };
  function descriptor(b, cls, items) {
    uniStr(b, ''); idStr(b, cls); b.u32(items.length);
    for (const [key, type, v] of items) {
      idStr(b, key); b.str(type);
      if (type === 'TEXT') uniStr(b, v);
      else if (type === 'enum') { idStr(b, v[0]); idStr(b, v[1]); }
      else if (type === 'doub') b.f64(v);
      else if (type === 'long') b.i32(v);
      else if (type === 'bool') b.u8(v ? 1 : 0);
      else if (type === 'tdta') { b.u32(v.length); b.raw(v); }
      else if (type === 'Objc') descriptor(b, v[0], v[1]);
      else if (type === 'UntF') { b.str(v[0]); b.f64(v[1]); }
    }
  }
  F.psdAdjust = function (n) {
    const p = n.params || {}, b = new Buf(false), cl = (v, a, z) => Math.max(a, Math.min(z, Math.round(v)));
    switch (n.kind) {
      case 'brightcon': b.u16(cl(p.b, -150, 150) & 0xffff).u16(cl(p.c, -50, 100) & 0xffff).u16(127).u8(0).u8(0); return { key: 'brit', data: b.bytes() };
      case 'levels': {
        b.u16(2);
        const rec = (L) => { L = L || { ib: 0, iw: 255, g: 1, ob: 0, ow: 255 }; b.u16(cl(L.ib, 0, 253)).u16(cl(L.iw, 2, 255)).u16(cl(L.ob, 0, 255)).u16(cl(L.ow, 0, 255)).u16(cl(L.g * 100, 10, 999)); };
        rec(p.rgb); rec(p.r); rec(p.g); rec(p.b);
        for (let i = 4; i < 29; i++) rec(null);
        return { key: 'levl', data: b.bytes() };
      }
      case 'curves': {
        const chans = [p.rgb, p.r, p.g, p.b].map((c) => (c && c.length >= 2 ? c : [[0, 0], [255, 255]]));
        b.u8(0).u16(1).u32(0b1111);
        chans.forEach((c) => { const pts = c.slice(0, 19); b.u16(pts.length); pts.forEach(([x, y]) => { b.u16(cl(y, 0, 255)).u16(cl(x, 0, 255)); }); });
        return { key: 'curv', data: b.bytes() };
      }
      case 'hsl': {
        b.u16(2).u8(p.col ? 1 : 0).u8(0);
        b.i16(cl(p.h < 0 ? p.h + 360 : p.h, 0, 360)).i16(cl(p.s, 0, 100)).i16(cl(p.l, -100, 100));
        b.i16(cl(p.h, -180, 180)).i16(cl(p.s, -100, 100)).i16(cl(p.l, -100, 100));
        const ranges = [[315, 345, 15, 45], [15, 45, 75, 105], [75, 105, 135, 165], [135, 165, 195, 225], [195, 225, 255, 285], [255, 285, 315, 345]];
        ranges.forEach((r) => { r.forEach((v) => b.i16(v)); b.i16(0).i16(0).i16(0); });
        return { key: 'hue2', data: b.bytes() };
      }
      case 'colorbalance': {
        const t = (o) => { o = o || {}; b.i16(cl(o.r || 0, -100, 100)).i16(cl(o.g || 0, -100, 100)).i16(cl(o.b || 0, -100, 100)); };
        t(p.sh); t(p.mid); t(p.hi); b.u8(p.keepLum ? 1 : 0).u8(0);
        return { key: 'blnc', data: b.bytes() };
      }
      case 'exposure': b.u16(1).f32(p.e || 0).f32(p.o || 0).f32(p.g || 1); return { key: 'expA', data: b.bytes() };
      case 'invert': return { key: 'nvrt', data: new Uint8Array(0) };
      case 'threshold': b.u16(cl(p.lvl, 1, 255)).u16(0); return { key: 'thrs', data: b.bytes() };
      case 'posterize': b.u16(cl(p.lv, 2, 255)).u16(0); return { key: 'post', data: b.bytes() };
      case 'solid': {
        const c = U.hexToRgb(p.color || '#808080');
        b.u32(16);
        descriptor(b, 'null', [['Clr ', 'Objc', ['RGBC', [['Rd  ', 'doub', c[0]], ['Grn ', 'doub', c[1]], ['Bl  ', 'doub', c[2]]]]]]);
        return { key: 'SoCo', data: b.bytes() };
      }
      default: return null;
    }
  };
  // Photoshop's "EngineData": the text engine's own description of the text and its style
  function engineData(t, text, font, rgb) {
    const parts = [];
    const s = (x) => parts.push(enc.encode(x));
    const ustr = (x) => { const u = [0x28, 0xfe, 0xff]; for (const ch of x) { const c = ch.charCodeAt(0), hi = c >> 8, lo = c & 255; [hi, lo].forEach((v) => { if (v === 0x28 || v === 0x29 || v === 0x5c) u.push(0x5c); u.push(v); }); } u.push(0x29); parts.push(Uint8Array.from(u)); };
    const len = text.length, size = t.size, J = t.align === 'center' ? 2 : t.align === 'right' ? 1 : t.align === 'justify' ? 3 : 0;
    const style = () => { s('/Font 0 /FontSize ' + size.toFixed(1) + ' /FauxBold ' + !!t.bold + ' /FauxItalic ' + !!t.italic + ' /AutoLeading false /Leading ' + (size * (t.lineHeight || 1.2)).toFixed(1) + ' /Tracking ' + Math.round(((t.spacing || 0) / size) * 1000) + ' /FillColor << /Type 1 /Values [ 1.0 ' + rgb.map((v) => (v / 255).toFixed(4)).join(' ') + ' ] >> '); };
    const res = (tag) => { s('/' + tag + ' << /KinsokuSet [ ] /MojiKumiSet [ ] /TheNormalStyleSheet 0 /TheNormalParagraphSheet 0 /ParagraphSheetSet [ << /Name '); ustr('Normal RGB'); s(' /DefaultStyleSheet 0 /Properties << /Justification 0 >> >> ] /StyleSheetSet [ << /Name '); ustr('Normal RGB'); s(' /StyleSheetData << /Font 0 /FontSize 12.0 /AutoLeading true >> >> ] /FontSet [ << /Name '); ustr(font); s(' /Script 0 /FontType 0 /Synthetic 0 >> << /Name '); ustr('AdobeInvisFont'); s(' /Script 0 /FontType 0 /Synthetic 0 >> ] /SuperscriptSize .583 /SuperscriptPosition .333 /SubscriptSize .583 /SubscriptPosition .333 /SmallCapSize .7 >> '); };
    s('\n\n<<\n/EngineDict << /Editor << /Text '); ustr(text); s(' >> ');
    s('/ParagraphRun << /DefaultRunData << /ParagraphSheet << /DefaultStyleSheet 0 /Properties << >> >> /Adjustments << /Axis [ 1.0 0.0 1.0 ] /XY [ 0.0 0.0 ] >> >> /RunArray [ << /ParagraphSheet << /DefaultStyleSheet 0 /Properties << /Justification ' + J + ' >> >> /Adjustments << /Axis [ 1.0 0.0 1.0 ] /XY [ 0.0 0.0 ] >> >> ] /RunLengthArray [ ' + len + ' ] /IsJoinable 1 >> ');
    s('/StyleRun << /DefaultRunData << /StyleSheet << /StyleSheetData << >> >> >> /RunArray [ << /StyleSheet << /StyleSheetData << '); style(); s('>> >> >> ] /RunLengthArray [ ' + len + ' ] /IsJoinable 2 >> ');
    s('/GridInfo << /GridIsOn false /ShowGrid false /GridSize 18.0 /GridLeading 22.0 /GridColor << /Type 1 /Values [ 0.0 0.0 0.0 1.0 ] >> /GridLeadingFillColor << /Type 1 /Values [ 0.0 0.0 0.0 1.0 ] >> /AlignLineHeightToGridFlags false >> /AntiAlias 4 /UseFractionalGlyphWidths true ');
    s('/Rendered << /Version 1 /Shapes << /WritingDirection 0 /Children [ << /ShapeType 0 /Procession 0 /Lines << /WritingDirection 0 /Children [ ] >> /Cookie << /Photoshop << /ShapeType 0 /PointBase [ 0.0 0.0 ] /Base << /ShapeType 0 /TransformPoint0 [ 1.0 0.0 ] /TransformPoint1 [ 0.0 1.0 ] /TransformPoint2 [ 0.0 0.0 ] >> >> >> >> ] >> >> >> ');
    res('ResourceDict'); res('DocumentResources');
    s('>>\n');
    return concat(parts);
  }
  const PS_FONTS = { 'sans-serif': 'ArialMT', Arial: 'ArialMT', Helvetica: 'Helvetica', serif: 'TimesNewRomanPSMT', 'Times New Roman': 'TimesNewRomanPSMT', monospace: 'CourierNewPSMT', 'Courier New': 'CourierNewPSMT', Georgia: 'Georgia', Verdana: 'Verdana', Tahoma: 'Tahoma', Impact: 'Impact', 'Comic Sans MS': 'ComicSansMS', 'Trebuchet MS': 'TrebuchetMS', 'Segoe UI': 'SegoeUI', 'Palatino Linotype': 'PalatinoLinotype-Roman', 'Lucida Console': 'LucidaConsole', Consolas: 'Consolas', Garamond: 'Garamond', cursive: 'ComicSansMS', fantasy: 'Impact', 'system-ui': 'ArialMT' };
  F.psdText = function (t) {
    if (!t || !t.text) return null;
    const x = U.ctx(U.canvas(1, 1));
    x.font = ND.Render.fontString(t);
    // wrapped paragraph boxes and text on a path become point text with the same line breaks
    const lines = t.boxWidth > 0 ? ND.Render.wrapText(x, t.text, t.boxWidth).map((r) => r.s) : String(t.text).split('\n');
    const text = lines.join('\r') + '\r', rgb = U.hexToRgb(t.colour || '#000000'), font = PS_FONTS[t.font] || String(t.font).replace(/\s+/g, '');
    const W0 = Math.max(10, ...lines.map((l) => x.measureText(l).width)), ax = t.align === 'center' ? W0 / 2 : t.align === 'right' ? W0 : 0;
    const b = new Buf(false);
    b.u16(1); [1, 0, 0, 1, (t.x || 0) + ax, (t.y || 0) + t.size * 0.82].forEach((v) => b.f64(v));
    b.u16(50); b.u32(16);
    descriptor(b, 'TxLr', [['Txt ', 'TEXT', text.replace(/\r$/, '')], ['textGridding', 'enum', ['textGridding', 'None']], ['Ornt', 'enum', ['Ornt', 'Hrzn']], ['AntA', 'enum', ['Annt', 'antiAliasSharp']], ['TextIndex', 'long', 0], ['EngineData', 'tdta', engineData(t, text, font, rgb)]]);
    b.u16(1); b.u32(16);
    descriptor(b, 'warp', [['warpStyle', 'enum', ['warpStyle', 'warpNone']], ['warpValue', 'doub', 0], ['warpPerspective', 'doub', 0], ['warpPerspectiveOther', 'doub', 0], ['warpRotate', 'enum', ['Ornt', 'Hrzn']]]);
    b.i32(0); b.i32(0); b.i32(0); b.i32(0);
    return { key: 'TySh', data: b.bytes(), approx: !!(t.onPath || t.warp && t.warp !== 'none') };
  };

  ND.Formats = F;
})();
