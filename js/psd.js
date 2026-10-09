/* Neon Draw — Photoshop (.psd / .psb) reader.
 * Imports pixel layers, groups, layer masks, blend modes, opacity, visibility and clipping.
 * Supports RGB, greyscale and CMYK at 8 or 16 bits, with raw, RLE or ZIP compression.
 * Adjustment / smart-object layers come in as their pixels (or are skipped when they have none). */
'use strict';
(function () {
  const U = ND.U;
  const BLEND = {
    norm: 'normal', pass: 'normal', 'mul ': 'multiply', scrn: 'screen', over: 'overlay', dark: 'darken', lite: 'lighten', 'div ': 'dodge', idiv: 'burn',
    lbrn: 'linearburn', lddg: 'add', hLit: 'hardlight', sLit: 'softlight', diff: 'difference', smud: 'exclusion', fsub: 'subtract', fdiv: 'divide',
    vLit: 'vividlight', lLit: 'linearlight', pLit: 'pinlight', hMix: 'hardmix', 'hue ': 'hue', 'sat ': 'saturation', colr: 'color', 'lum ': 'luminosity',
    dkCl: 'darkercolor', lgCl: 'lightercolor', diss: 'normal',
  };
  const ADJ_KEYS = ['levl', 'curv', 'hue2', 'hue ', 'brit', 'blnc', 'vibA', 'expA', 'grdm', 'selc', 'phfl', 'nvrt', 'thrs', 'post', 'blwh', 'mixr', 'clrL', 'SoCo', 'GdFl', 'PtFl'];

  class Reader {
    constructor(buf) { this.v = new DataView(buf); this.u8 = new Uint8Array(buf); this.p = 0; }
    u8n() { return this.v.getUint8(this.p++); }
    u16() { const x = this.v.getUint16(this.p); this.p += 2; return x; }
    i16() { const x = this.v.getInt16(this.p); this.p += 2; return x; }
    u32() { const x = this.v.getUint32(this.p); this.p += 4; return x; }
    i32() { const x = this.v.getInt32(this.p); this.p += 4; return x; }
    u64() { const hi = this.u32(), lo = this.u32(); return hi * 4294967296 + lo; }
    str(n) { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8[this.p + i]); this.p += n; return s; }
    bytes(n) { const b = this.u8.subarray(this.p, this.p + n); this.p += n; return b; }
    skip32() { const n = this.u32(); this.p += n; } // note: `r.p += r.u32()` would add to the position from before the read
  }

  async function inflate(bytes) {
    if (!window.DecompressionStream) throw new Error('This browser cannot read ZIP-compressed PSD layers');
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  function unpackBits(src, out, outOff, n) {
    let i = 0, o = outOff;
    const end = outOff + n;
    while (i < src.length && o < end) {
      let c = src[i++];
      if (c > 127) c -= 256;
      if (c >= 0) { for (let k = 0; k <= c && o < end; k++) out[o++] = src[i++]; }
      else if (c !== -128) { const val = src[i++]; for (let k = 0; k < 1 - c && o < end; k++) out[o++] = val; }
    }
  }
  // Decode one channel → Uint8Array (w*h), reducing 16-bit to 8-bit.
  async function readChannel(r, w, h, depth, psb, len) {
    const start = r.p, comp = r.u16(), bpc = depth === 16 ? 2 : 1, rowBytes = w * bpc, n = w * h;
    let raw = new Uint8Array(rowBytes * h);
    if (comp === 0) raw.set(r.bytes(Math.min(rowBytes * h, len - 2)));
    else if (comp === 1) {
      const counts = [];
      for (let y = 0; y < h; y++) counts.push(psb ? r.u32() : r.u16());
      for (let y = 0; y < h; y++) { const row = r.bytes(counts[y]); unpackBits(row, raw, y * rowBytes, rowBytes); }
    } else if (comp === 2 || comp === 3) {
      raw = await inflate(r.bytes(len - 2));
      if (comp === 3) {
        // ZIP with prediction: delta per row
        if (bpc === 1) { for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) raw[y * w + x] = (raw[y * w + x] + raw[y * w + x - 1]) & 255; }
        else {
          for (let y = 0; y < h; y++) {
            let prev = 0;
            for (let x = 0; x < w; x++) { const i = (y * w + x) * 2, v = ((raw[i] << 8) | raw[i + 1]) + prev & 65535; raw[i] = v >> 8; raw[i + 1] = v & 255; prev = v; }
          }
        }
      }
    } else throw new Error('Unknown PSD compression ' + comp);
    r.p = start + len;
    if (bpc === 1) return raw.length === n ? raw : raw.subarray(0, n);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = raw[i * 2];
    return out;
  }

  function toImageData(ch, w, h, mode) {
    const img = new ImageData(Math.max(1, w), Math.max(1, h)), d = img.data, n = w * h;
    const A = ch[-1];
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      if (mode === 1) { const g = ch[0] ? ch[0][i] : 0; d[j] = d[j + 1] = d[j + 2] = g; }
      else if (mode === 4) {
        const c = ch[0] ? ch[0][i] : 255, m = ch[1] ? ch[1][i] : 255, yy = ch[2] ? ch[2][i] : 255, k = ch[3] ? ch[3][i] : 255;
        d[j] = (c * k) / 255; d[j + 1] = (m * k) / 255; d[j + 2] = (yy * k) / 255;
      } else { d[j] = ch[0] ? ch[0][i] : 0; d[j + 1] = ch[1] ? ch[1][i] : 0; d[j + 2] = ch[2] ? ch[2][i] : 0; }
      d[j + 3] = A ? A[i] : 255;
    }
    return img;
  }

  async function importPSD(buf, name) {
    const r = new Reader(buf);
    if (r.str(4) !== '8BPS') throw new Error('Not a Photoshop file');
    const version = r.u16(), psb = version === 2;
    r.p += 6;
    const nch = r.u16(), H = r.u32(), W = r.u32(), depth = r.u16(), mode = r.u16();
    if (depth !== 8 && depth !== 16) throw new Error('Only 8- and 16-bit PSD files are supported (this one is ' + depth + '-bit)');
    if (mode !== 3 && mode !== 1 && mode !== 4) throw new Error('Only RGB, greyscale and CMYK PSD files are supported');
    if (W * H > 16384 * 16384) throw new Error('Image is too large');
    r.skip32(); // colour mode data
    r.skip32(); // image resources
    const lmLen = psb ? r.u64() : r.u32(), lmEnd = r.p + lmLen;
    const doc = new ND.Doc(W, H, null);
    doc.name = (name || 'Untitled').replace(/\.[^.]+$/, '');
    doc.root.children = [];
    let skipped = 0, imported = 0;
    if (lmLen > 0) {
      const liLen = psb ? r.u64() : r.u32(), liEnd = r.p + liLen;
      if (liLen > 0) {
        const count = Math.abs(r.i16()), recs = [];
        for (let i = 0; i < count; i++) {
          const rec = { top: r.i32(), left: r.i32(), bottom: r.i32(), right: r.i32(), ch: [] };
          const n = r.u16();
          for (let c = 0; c < n; c++) rec.ch.push({ id: r.i16(), len: psb ? r.u64() : r.u32() });
          r.p += 4; // '8BIM'
          rec.blend = r.str(4); rec.opacity = r.u8n() / 255; rec.clip = r.u8n() === 1; rec.flags = r.u8n(); r.p += 1;
          const exLen = r.u32(), exEnd = r.p + exLen;
          const mLen = r.u32(), mEnd = r.p + mLen;
          if (mLen >= 18) { rec.mask = { top: r.i32(), left: r.i32(), bottom: r.i32(), right: r.i32(), def: r.u8n(), flags: r.u8n() }; }
          r.p = mEnd;
          r.skip32(); // blending ranges
          const nl = r.u8n();
          rec.name = r.str(nl);
          r.p += (4 - ((nl + 1) % 4)) % 4;
          rec.keys = [];
          while (r.p + 12 <= exEnd) {
            const sig = r.str(4);
            if (sig !== '8BIM' && sig !== '8B64') { r.p -= 3; continue; } // re-align
            const key = r.str(4), long = psb && ['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD'].includes(key);
            const len = long ? r.u64() : r.u32(), dEnd = r.p + len;
            rec.keys.push(key);
            if (key === 'luni') { const cnt = r.u32(); let s = ''; for (let k = 0; k < cnt; k++) s += String.fromCharCode(r.u16()); rec.name = s.replace(/\0+$/, '') || rec.name; }
            else if (key === 'lsct' || key === 'lsdk') { rec.section = r.u32(); if (len >= 12) { r.p += 4; rec.sectionBlend = r.str(4); } }
            r.p = dEnd;
          }
          r.p = exEnd;
          recs.push(rec);
        }
        // channel image data, in record order
        for (const rec of recs) {
          const w = rec.right - rec.left, h = rec.bottom - rec.top, chans = {};
          for (const c of rec.ch) {
            if (c.id === -2 && rec.mask) {
              const mw = rec.mask.right - rec.mask.left, mh = rec.mask.bottom - rec.mask.top;
              rec.maskData = mw > 0 && mh > 0 ? await readChannel(r, mw, mh, depth, psb, c.len) : (r.p += c.len, null);
            } else if (c.id < -2 || w <= 0 || h <= 0) r.p += c.len;
            else chans[c.id] = await readChannel(r, w, h, depth, psb, c.len);
          }
          rec.chans = chans;
        }
        // build the tree (records are bottom → top; folders close after their contents)
        const stack = [[]];
        for (const rec of recs) {
          if (rec.section === 3) { stack.push([]); continue; }
          let node;
          if (rec.section === 1 || rec.section === 2) {
            node = new ND.Group(rec.name || 'Group');
            node.children = stack.length > 1 ? stack.pop() : [];
            node.collapsed = rec.section === 2;
          } else {
            const w = rec.right - rec.left, h = rec.bottom - rec.top;
            if ((w <= 0 || h <= 0) && rec.keys.some((k) => ADJ_KEYS.includes(k))) { skipped++; continue; }
            node = new ND.Layer(rec.name || 'Layer', W, H);
            if (w > 0 && h > 0) {
              const img = toImageData(rec.chans, w, h, mode);
              U.ctx(node.canvas).putImageData(img, rec.left, rec.top);
            }
            imported++;
          }
          node.opacity = rec.opacity;
          node.blendMode = BLEND[rec.section ? rec.sectionBlend || rec.blend : rec.blend] || 'normal';
          node.visible = !(rec.flags & 2);
          node.clip = rec.clip;
          if (rec.mask && rec.maskData) {
            const m = ND.DocMask.newMask(W, H, 'rgb(' + rec.mask.def + ',' + rec.mask.def + ',' + rec.mask.def + ')');
            const mw = rec.mask.right - rec.mask.left, mh = rec.mask.bottom - rec.mask.top, img = new ImageData(mw, mh);
            for (let i = 0; i < mw * mh; i++) { const v = rec.maskData[i]; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
            U.ctx(m).putImageData(img, rec.mask.left, rec.mask.top);
            node.mask = m;
            node.maskEnabled = !(rec.mask.flags & 2);
          }
          stack[stack.length - 1].push(node);
        }
        while (stack.length > 1) { const orphan = stack.pop(); stack[stack.length - 1].push(...orphan); }
        doc.root.children = stack[0];
      }
      r.p = liEnd;
    }
    // flat files (or files without layer data): use the merged image
    if (!doc.allLayers().length) {
      r.p = lmEnd;
      const comp = r.u16(), chans = {}, bpc = depth === 16 ? 2 : 1, rowBytes = W * bpc;
      const want = mode === 1 ? 1 : mode === 4 ? 4 : 3, total = Math.min(nch, want + 1);
      if (comp === 1) {
        const counts = [];
        for (let i = 0; i < H * nch; i++) counts.push(psb ? r.u32() : r.u16());
        for (let c = 0; c < total; c++) {
          const raw = new Uint8Array(rowBytes * H);
          for (let y = 0; y < H; y++) unpackBits(r.bytes(counts[c * H + y]), raw, y * rowBytes, rowBytes);
          chans[c === want ? -1 : c] = bpc === 1 ? raw : raw.filter((_, i) => i % 2 === 0);
        }
      } else if (comp === 0) {
        for (let c = 0; c < total; c++) { const raw = r.bytes(rowBytes * H); chans[c === want ? -1 : c] = bpc === 1 ? raw : raw.filter((_, i) => i % 2 === 0); }
      } else throw new Error('Unsupported compression in the merged image');
      const L = new ND.Layer('Background', W, H);
      U.ctx(L.canvas).putImageData(toImageData(chans, W, H, mode), 0, 0);
      doc.root.children = [L];
    }
    doc.active = doc.firstLayer();
    doc.invalidateAll();
    doc.importCount = imported;
    doc.importNote = skipped ? skipped + ' adjustment/fill layer' + (skipped > 1 ? 's' : '') + ' could not be converted and were skipped' : '';
    return doc;
  }

  ND.PSD = { importPSD };
})();
