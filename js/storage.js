/* Neon Sparks Draw — saving, loading and exporting.
 *  .ndraw  project files (JSON, compatible with earlier versions)
 *  .ora    OpenRaster (opens in Krita, GIMP, MyPaint) — export and import
 *  .psd    layered Photoshop export
 *  IndexedDB autosave + localStorage preferences */
'use strict';
(function () {
  const U = ND.U;
  const IDB = 'pigment-store', KEY = 'autosave';

  /* ---------------- .ndraw ---------------- */
  function flatList(doc) {
    const out = [];
    const rec = (g, depth) => {
      for (const n of g.children) {
        out.push({ node: n, depth });
        if (n.isGroup) rec(n, depth + 1);
      }
    };
    rec(doc.root, 0);
    return out;
  }
  // Project object; `enc(canvas)` turns pixels into a string (data URL, or a reference to a stored blob).
  function project(doc, enc) {
    const smartOut = (sm) => (sm ? { png: enc(sm.src), m: sm.m, mesh: sm.mesh, g: sm.g || 0, contents: sm.contents ? project(sm.contents, enc) : null } : null);
    return {
      app: 'pigment', version: 3, depth: doc.depth || 8, width: doc.width, height: doc.height, name: doc.name, backgroundColor: doc.backgroundColor,
      guides: doc.guides, assistants: doc.assistants, paper: doc.paper || null, paths: doc.paths || [], activePath: doc.activePath || null, anim: doc.anim || null,
      channels: (doc.alphaChannels || []).map((c) => ({ name: c.name, png: enc(c.canvas) })),
      layers: flatList(doc).map(({ node: n, depth }) => ({
        type: n.type, name: n.name, visible: n.visible, opacity: n.opacity, blendMode: n.blendMode, isGroup: n.isGroup, depth,
        locked: n.locked, alphaLock: n.alphaLock, clip: n.clip, collapsed: !!n.collapsed,
        png: n.isPixel ? enc(n.canvas) : '',
        mask: n.mask ? enc(n.mask) : null, maskEnabled: n.maskEnabled,
        effects: n.effects || null, kind: n.kind || null, params: n.params || null, textData: n.textData || null, shapeData: n.shapeData || null, colorizeData: n.colorizeData || null, fsRole: n.fsRole || null, pickEachStroke: n.pickEachStroke || null,
        frames: n.isPixel && n.frames ? Object.keys(n.frames).map((k) => ({ at: +k, png: enc(n.frames[k]) })) : null,
        smart: n.isPixel ? smartOut(n.smart) : null,
        tween: n.tween || null, onion: n.onion || null,
      })),
    };
  }
  function serialize(doc) { return JSON.stringify(project(doc, (c) => (ND.Deep && ND.Deep.is16(c) ? ND.Deep.encodeSync(c) : c.toDataURL('image/png')))); }
  const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
  // Same file format, but PNG encoding runs asynchronously so big documents don't freeze the page.
  async function serializeAsync(doc) {
    const list = [], obj = project(doc, (c) => { list.push(c); return '#' + (list.length - 1); });
    const urls = await Promise.all(list.map(async (c) => blobToDataURL(await (ND.Deep ? ND.Deep.blobFor(c) : U.canvasToBlob(c, 'image/png')))));
    const fix = (v) => (typeof v === 'string' && v[0] === '#' ? urls[+v.slice(1)] : v);
    const fixAll = (o) => o.layers.forEach((l) => { l.png = fix(l.png); l.mask = fix(l.mask); if (l.frames) l.frames.forEach((f) => { f.png = fix(f.png); }); if (l.smart) { l.smart.png = fix(l.smart.png); if (l.smart.contents) fixAll(l.smart.contents); } });
    fixAll(obj);
    (obj.channels || []).forEach((c) => { c.png = fix(c.png); });
    return JSON.stringify(obj);
  }
  async function deserialize(text, blobs) {
    const s = typeof text === 'string' ? JSON.parse(text) : text;
    const load = async (ref) => {
      // 16-bit pixels are stored losslessly in their own format
      if (ND.Deep) {
        const b = blobs && typeof ref === 'string' && ref[0] === '#' ? blobs[+ref.slice(1)] : null;
        if (b && b.type === 'application/x-nd16') return ND.Deep.loadRef(b);
        if (ND.Deep.isRef(ref)) return ND.Deep.loadRef(ref);
      }
      if (blobs && typeof ref === 'string' && ref[0] === '#') return U.blobToImage(blobs[+ref.slice(1)]);
      return U.loadImage(ref);
    };
    if (s.app !== 'pigment') throw new Error('Not a Neon Sparks Draw project');
    const prevType = U.colorType;
    if (ND.Deep) ND.Deep.use(s.depth === 16 ? 16 : 8);
    const doc = new ND.Doc(s.width, s.height, null);
    doc.depth = s.depth === 16 && ND.Deep && ND.Deep.supported() ? 16 : 8;
    doc.name = s.name || 'Untitled';
    doc.backgroundColor = s.backgroundColor || null;
    doc.guides = Array.isArray(s.guides) ? s.guides : [];
    doc.assistants = Array.isArray(s.assistants) ? s.assistants : [];
    doc.paper = ND.Paper ? ND.Paper.normalise(s.paper) : null;
    doc.paths = Array.isArray(s.paths) ? s.paths : [];
    doc.activePath = s.activePath || null;
    // alpha channels (saved selections)
    doc.alphaChannels = [];
    for (const c of Array.isArray(s.channels) ? s.channels : []) {
      if (!c || !c.png) continue;
      const g = U.canvas(s.width, s.height), gx = U.ctx(g);
      gx.fillStyle = '#000'; gx.fillRect(0, 0, s.width, s.height);
      gx.drawImage(await load(c.png), 0, 0);
      doc.alphaChannels.push({ id: 'ch' + doc.alphaChannels.length + Date.now().toString(36), name: c.name || 'Alpha', canvas: g });
    }
    doc.root.children = [];
    const stack = [doc.root];
    for (const e of s.layers || []) {
      const d = U.clamp(e.depth || 0, 0, stack.length - 1);
      stack.length = d + 1;
      const parent = stack[d], type = e.type || (e.isGroup ? 'group' : 'layer');
      let n;
      if (type === 'group') { n = new ND.Group(e.name); n.collapsed = !!e.collapsed; }
      else if (type === 'adjust') { n = new ND.AdjustLayer(e.kind, Object.assign(ND.Adjust.defaults(e.kind), e.params || {})); n.name = e.name; }
      else {
        n = new ND.Layer(e.name, s.width, s.height);
        if (e.png) U.ctx(n.canvas).drawImage(await load(e.png), 0, 0);
        n.textData = e.textData || null;
        n.shapeData = e.shapeData || null;
        n.colorizeData = e.colorizeData || null;
        n.fsRole = e.fsRole || null; n.pickEachStroke = !!e.pickEachStroke;
        n.tween = e.tween || null; n.onion = e.onion || null;
        if (e.smart && e.smart.png) {
          const im = await load(e.smart.png), src = U.canvas(im.width, im.height);
          U.ctx(src).drawImage(im, 0, 0);
          n.smart = { src, m: e.smart.m || [1, 0, 0, 1, 0, 0], mesh: e.smart.mesh || null, g: e.smart.g || 0, contents: e.smart.contents ? await deserialize(e.smart.contents, blobs) : null };
        }
        if (Array.isArray(e.frames) && e.frames.length) {
          n.frames = {};
          for (const f of e.frames) { const c = U.canvas(s.width, s.height); U.ctx(c).drawImage(await load(f.png), 0, 0); n.frames[f.at] = c; }
        }
      }
      Object.assign(n, { visible: e.visible !== false, opacity: e.opacity == null ? 1 : e.opacity, blendMode: e.blendMode || 'normal', locked: !!e.locked, alphaLock: !!e.alphaLock, clip: !!e.clip, maskEnabled: e.maskEnabled !== false });
      if (e.mask) { const m = U.canvas(s.width, s.height); U.ctx(m).drawImage(await load(e.mask), 0, 0); n.mask = m; }
      if (e.effects) n.effects = ND.Effects.normalise(e.effects);
      parent.children.push(n);
      if (n.isGroup) stack.push(n);
    }
    if (!doc.allLayers().length) doc.root.children.push(new ND.Layer('Background', s.width, s.height));
    doc.active = doc.firstLayer();
    if (ND.Anim && s.anim) { doc.anim = ND.Anim.normalise(s.anim); ND.Anim.apply(doc); }
    doc.invalidateAll();
    U.colorType = prevType;
    return doc;
  }
  // Pixels for interchange formats: masks and layer effects are baked in.
  function bakedPixels(doc, n) { return n.mask || (n.effects && ND.Effects.any(n.effects)) ? doc.renderNode(n) : n.canvas; }
  function hasLiveOnly(doc) { return doc.allNodes().some((n) => n.isAdjust || (n.isGroup && (n.mask || (n.effects && ND.Effects.any(n.effects))))); }

  /* ---------------- autosave (IndexedDB) ---------------- */
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(IDB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('docs');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  // Autosave stores layer PNGs as Blobs (encoded off the main thread) instead of one giant JSON string.
  async function autosaveRecord(doc) {
    const list = [], meta = project(doc, (c) => { list.push(c); return '#' + (list.length - 1); });
    const blobs = await Promise.all(list.map((c) => (ND.Deep ? ND.Deep.blobFor(c) : U.canvasToBlob(c, 'image/png'))));
    return { format: 'ndraw-parts', meta, blobs };
  }
  async function autosave(doc) {
    const rec = await autosaveRecord(doc), blobs = rec.blobs;
    const db = await idb();
    return new Promise((res, rej) => {
      const t = db.transaction('docs', 'readwrite');
      t.objectStore('docs').put(rec, KEY);
      t.oncomplete = () => res(blobs.reduce((a, b) => a + b.size, 0));
      t.onerror = () => rej(t.error);
    });
  }
  // all open tabs: { format: 'ndraw-tabs', docs: [record + handle], active }
  async function autosaveAll(docs, active, changed) {
    for (const d of docs) if (!d._autoRec || changed.has(d)) d._autoRec = await autosaveRecord(d);
    const rec = { format: 'ndraw-tabs', active, docs: docs.map((d) => Object.assign({}, d._autoRec, { handle: d.fileHandle || null })) };
    const db = await idb();
    return new Promise((res, rej) => {
      const t = db.transaction('docs', 'readwrite');
      t.objectStore('docs').put(rec, KEY);
      t.oncomplete = () => res(true);
      t.onerror = () => rej(t.error);
    });
  }
  // Returns { docs: [Doc], active } for any autosave format (older versions saved one document).
  async function restoreAll(saved) {
    if (saved && saved.format === 'ndraw-tabs') {
      const docs = [];
      for (const r of saved.docs) { try { const d = await restore(r); d.fileHandle = r.handle || null; docs.push(d); } catch (e) { console.warn('a tab could not be restored', e); } }
      return { docs, active: Math.min(saved.active || 0, Math.max(0, docs.length - 1)) };
    }
    const d = await restore(saved);
    d.fileHandle = (await idbGet('autosave-handle')) || null;
    return { docs: [d], active: 0 };
  }
  async function restore(saved) {
    if (saved && saved.format === 'ndraw-parts') return deserialize(saved.meta, saved.blobs);
    return deserialize(saved);
  }
  async function loadAutosave() {
    try {
      const db = await idb();
      return await new Promise((res) => {
        const r = db.transaction('docs', 'readonly').objectStore('docs').get(KEY);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => res(null);
      });
    } catch (e) { return null; }
  }
  // small key/value helpers on the same database (used for recent-file handles)
  async function idbGet(key) {
    try {
      const db = await idb();
      return await new Promise((res) => { const r = db.transaction('docs', 'readonly').objectStore('docs').get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });
    } catch (e) { return undefined; }
  }
  async function idbSet(key, val) {
    try {
      const db = await idb();
      await new Promise((res, rej) => { const t = db.transaction('docs', 'readwrite'); t.objectStore('docs').put(val, key); t.oncomplete = res; t.onerror = () => rej(t.error); });
      return true;
    } catch (e) { return false; }
  }
  async function clearAutosave() {
    try {
      const db = await idb();
      db.transaction('docs', 'readwrite').objectStore('docs').delete(KEY);
    } catch (e) { /* ignore */ }
  }

  /* ---------------- zip (store) writer & reader ---------------- */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  const enc = new TextEncoder();
  function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true);
      h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0, true); c.setUint16(10, 0, true);
      c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true);
      c.setUint32(38, 0, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cSize = central.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cSize, true); e.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
  }
  async function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), out = {};
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not a zip file');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    for (let i = 0; i < count; i++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true);
      const xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      const ds = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const raw = u8.subarray(ds, ds + csize);
      out[name] = { method, raw };
      p += 46 + nlen + xlen + clen;
    }
    return {
      names: Object.keys(out),
      async get(name) {
        const f = out[name];
        if (!f) return null;
        if (f.method === 0) return f.raw;
        if (f.method === 8 && window.DecompressionStream) {
          const s = new Blob([f.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return new Uint8Array(await new Response(s).arrayBuffer());
        }
        throw new Error('Unsupported zip compression in ' + name);
      },
    };
  }

  /* ---------------- OpenRaster ---------------- */
  const ORA_OP = {
    normal: 'svg:src-over', multiply: 'svg:multiply', screen: 'svg:screen', overlay: 'svg:overlay', darken: 'svg:darken', lighten: 'svg:lighten',
    dodge: 'svg:color-dodge', burn: 'svg:color-burn', hardlight: 'svg:hard-light', softlight: 'svg:soft-light', difference: 'svg:difference',
    exclusion: 'svg:exclusion', hue: 'svg:hue', saturation: 'svg:saturation', color: 'svg:color', luminosity: 'svg:luminosity', add: 'svg:plus',
  };
  const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  async function pngBytes(c) { return new Uint8Array(await (await U.canvasToBlob(c, 'image/png')).arrayBuffer()); }
  async function exportORA(doc) {
    const files = [{ name: 'mimetype', data: enc.encode('image/openraster') }];
    let n = 0;
    const rec = async (g, ind) => {
      let xml = '';
      for (let i = g.children.length - 1; i >= 0; i--) {
        const c = g.children[i];
        const attrs = 'name="' + xmlEsc(c.name) + '" opacity="' + c.opacity.toFixed(3) + '" visibility="' + (c.visible ? 'visible' : 'hidden') + '" composite-op="' + (ORA_OP[c.blendMode] || 'svg:src-over') + '"' + (c.locked ? ' edit-locked="true"' : '');
        if (c.isAdjust) continue;
        if (c.isGroup) {
          xml += ind + '<stack ' + attrs + ' isolation="' + (c.blendMode === 'passthrough' ? 'auto' : 'isolate') + '">\n' + (await rec(c, ind + '  ')) + ind + '</stack>\n';
        } else {
          const src = 'data/layer' + n++ + '.png';
          files.push({ name: src, data: await pngBytes(bakedPixels(doc, c)) });
          xml += ind + '<layer ' + attrs + ' src="' + src + '" x="0" y="0"' + (c.alphaLock ? ' alpha-preserve="true"' : '') + '/>\n';
        }
      }
      return xml;
    };
    const body = await rec(doc.root, '    ');
    const stack = '<?xml version="1.0" encoding="UTF-8"?>\n<image version="0.0.3" w="' + doc.width + '" h="' + doc.height + '" xres="72" yres="72">\n  <stack>\n' + body + '  </stack>\n</image>\n';
    files.splice(1, 0, { name: 'stack.xml', data: enc.encode(stack) });
    const flat = doc.flatCopy();
    files.push({ name: 'mergedimage.png', data: await pngBytes(flat) });
    const s = Math.min(1, 256 / Math.max(doc.width, doc.height)), th = U.canvas(doc.width * s, doc.height * s);
    U.ctx(th).drawImage(flat, 0, 0, th.width, th.height);
    files.push({ name: 'Thumbnails/thumbnail.png', data: await pngBytes(th) });
    return zip(files);
  }
  async function importORA(buf, name) {
    const z = await unzip(buf);
    const xmlBytes = await z.get('stack.xml');
    if (!xmlBytes) throw new Error('stack.xml missing');
    const xml = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), 'application/xml');
    const img = xml.querySelector('image');
    const W = +img.getAttribute('w'), H = +img.getAttribute('h');
    const doc = new ND.Doc(W, H, null);
    doc.name = (name || 'Untitled').replace(/\.[^.]+$/, '');
    doc.root.children = [];
    const opFor = (op) => { for (const k in ORA_OP) if (ORA_OP[k] === op) return k; return 'normal'; };
    const common = (n, el) => {
      n.opacity = el.hasAttribute('opacity') ? +el.getAttribute('opacity') : 1;
      n.visible = el.getAttribute('visibility') !== 'hidden';
      n.blendMode = opFor(el.getAttribute('composite-op') || 'svg:src-over');
      n.locked = el.getAttribute('edit-locked') === 'true';
      n.alphaLock = el.getAttribute('alpha-preserve') === 'true';
    };
    const rec = async (el, group) => {
      const kids = Array.from(el.children).filter((c) => c.tagName === 'stack' || c.tagName === 'layer').reverse();
      for (const c of kids) {
        if (c.tagName === 'stack') {
          const g = new ND.Group(c.getAttribute('name') || 'Group');
          common(g, c);
          // isolation="auto" on a Normal stack: its layers blend with what's below (Pass Through)
          if (c.getAttribute('isolation') === 'auto' && g.blendMode === 'normal') g.blendMode = 'passthrough';
          group.children.push(g);
          await rec(c, g);
        } else {
          const L = new ND.Layer(c.getAttribute('name') || 'Layer', W, H);
          common(L, c);
          const bytes = await z.get(c.getAttribute('src'));
          if (bytes) {
            const im = await U.blobToImage(new Blob([bytes], { type: 'image/png' }));
            U.ctx(L.canvas).drawImage(im, +(c.getAttribute('x') || 0), +(c.getAttribute('y') || 0));
          }
          group.children.push(L);
        }
      }
    };
    await rec(img.querySelector('stack'), doc.root);
    if (!doc.allLayers().length) doc.root.children.push(new ND.Layer('Background', W, H));
    doc.active = doc.firstLayer();
    doc.invalidateAll();
    return doc;
  }

  /* ---------------- layered PSD export ---------------- */
  const PSD_KEY = {
    normal: 'norm', multiply: 'mul ', screen: 'scrn', overlay: 'over', darken: 'dark', lighten: 'lite', dodge: 'div ', burn: 'idiv',
    linearburn: 'lbrn', add: 'lddg', hardlight: 'hLit', softlight: 'sLit', difference: 'diff', exclusion: 'smud', subtract: 'fsub',
    divide: 'fdiv', vividlight: 'vLit', linearlight: 'lLit', pinlight: 'pLit', hardmix: 'hMix', hue: 'hue ', saturation: 'sat ',
    color: 'colr', luminosity: 'lum ', darkercolor: 'dkCl', lightercolor: 'lgCl',
  };
  class W8 {
    constructor() { this.chunks = []; this.len = 0; }
    u8(v) { this.raw(new Uint8Array([v & 255])); }
    u16(v) { const b = new DataView(new ArrayBuffer(2)); b.setUint16(0, v); this.raw(new Uint8Array(b.buffer)); }
    i16(v) { const b = new DataView(new ArrayBuffer(2)); b.setInt16(0, v); this.raw(new Uint8Array(b.buffer)); }
    u32(v) { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, v >>> 0); this.raw(new Uint8Array(b.buffer)); }
    i32(v) { const b = new DataView(new ArrayBuffer(4)); b.setInt32(0, v); this.raw(new Uint8Array(b.buffer)); }
    str(s) { this.raw(enc.encode(s)); }
    raw(u) { this.chunks.push(u); this.len += u.length; }
    blob() { return new Blob(this.chunks); }
    bytes() { const o = new Uint8Array(this.len); let p = 0; for (const c of this.chunks) { o.set(c, p); p += c.length; } return o; }
  }
  function pascal(w, name) {
    const ascii = String(name).replace(/[^\x20-\x7e]/g, '_').slice(0, 255);
    const b = enc.encode(ascii), total = 1 + b.length, pad = (4 - (total % 4)) % 4;
    w.u8(b.length); w.raw(b); for (let i = 0; i < pad; i++) w.u8(0);
  }
  function unicodeBlock(w, name) {
    const s = String(name), inner = new W8();
    inner.u32(s.length);
    for (let i = 0; i < s.length; i++) inner.u16(s.charCodeAt(i));
    if (inner.len % 2) inner.u8(0);
    w.str('8BIM'); w.str('luni'); w.u32(inner.len); w.raw(inner.bytes());
  }
  function sectionBlock(w, type, blend) {
    w.str('8BIM'); w.str('lsct'); w.u32(12); w.u32(type); w.str('8BIM'); w.str(blend);
  }
  function exportPSD(doc) {
    const W = doc.width, H = doc.height, deep = doc.depth === 16 && ND.Deep && ND.Deep.supported(), bpc = deep ? 2 : 1;
    // A, R, G, B channel bytes for an area (2 bytes per value, big-endian, in 16-bit documents)
    const channels = (px, bb) => {
      const n = bb.w * bb.h, ch = [0, 1, 2, 3].map(() => new Uint8Array(n * bpc));
      if (!n) return ch;
      if (deep && ND.Deep.is16(px)) {
        const d = ND.Deep.read16(px, bb.x, bb.y, bb.w, bb.h).data, ord = [3, 0, 1, 2];
        for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) { const v = Math.round(Math.max(0, Math.min(1, d[i * 4 + ord[c]])) * 65535); ch[c][i * 2] = v >> 8; ch[c][i * 2 + 1] = v & 255; }
      } else {
        const d = U.ctx(px).getImageData(bb.x, bb.y, bb.w, bb.h).data;
        for (let i = 0, j = 0; i < n; i++, j += 4) { const vals = [d[j + 3], d[j], d[j + 1], d[j + 2]]; for (let c = 0; c < 4; c++) { if (bpc === 2) { ch[c][i * 2] = vals[c]; ch[c][i * 2 + 1] = vals[c]; } else ch[c][i] = vals[c]; } }
      }
      return ch;
    };
    const records = [], lost = []; // bottom → top
    const rec = (g) => {
      for (const n of g.children) {
        if (n.isAdjust) {
          // adjustment layers stay editable in Photoshop when it has the same kind
          const blk = ND.Formats ? ND.Formats.psdAdjust(n) : null;
          if (blk) records.push({ kind: 'adjust', node: n, blk }); else lost.push(n.name);
          continue;
        }
        if (n.isGroup) {
          records.push({ kind: 'end', node: n });
          rec(n);
          records.push({ kind: 'group', node: n });
        } else records.push({ kind: 'layer', node: n });
      }
    };
    rec(doc.root);
    // channel data per record
    for (const r of records) {
      if (r.kind === 'adjust' && r.node.mask) {
        const md = U.ctx(r.node.mask).getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) m[i] = md[i * 4];
        r.mask = bpc === 2 ? Uint8Array.from({ length: W * H * 2 }, (_, k) => m[k >> 1]) : m;
      }
      if (r.kind !== 'layer') { r.rect = { x: 0, y: 0, w: 0, h: 0 }; r.ch = [new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0)]; if (r.mask) r.ch.push(r.mask); continue; }
      // text layers keep their text, font, size and colour (Photoshop re-renders them)
      if (r.node.textData && ND.Formats) r.blk = ND.Formats.psdText(Object.assign({}, r.node.textData));
      const px = bakedPixels(doc, r.node);
      const bb = ND.Sel.contentBBox(px) || { x: 0, y: 0, w: 0, h: 0 };
      r.rect = bb;
      r.ch = channels(px, bb);
    }
    const li = new W8();
    li.i16(records.length);
    for (const r of records) {
      const n = r.node, b = r.rect;
      li.i32(b.y); li.i32(b.x); li.i32(b.y + b.h); li.i32(b.x + b.w);
      li.u16(r.ch.length);
      [-1, 0, 1, 2, -2].slice(0, r.ch.length).forEach((id, k) => { li.i16(id); li.u32(2 + r.ch[k].length); });
      li.str('8BIM');
      const key = r.kind === 'end' ? 'norm' : r.kind === 'group' && n.blendMode === 'passthrough' ? 'pass' : PSD_KEY[n.blendMode] || 'norm'; // isolated groups are 'norm'
      li.str(key);
      li.u8(r.kind === 'end' ? 255 : Math.round(n.opacity * 255));
      li.u8(n.clip && r.kind !== 'end' ? 1 : 0);
      li.u8((r.kind !== 'end' && !n.visible ? 2 : 0) | 8 | (r.kind === 'layer' || r.kind === 'adjust' ? 0 : 16));
      li.u8(0);
      const extra = new W8();
      if (r.mask) { extra.u32(20); extra.i32(0); extra.i32(0); extra.i32(H); extra.i32(W); extra.u8(0); extra.u8(n.maskEnabled === false ? 2 : 0); extra.u16(0); } else extra.u32(0);
      extra.u32(0);
      const nm = r.kind === 'end' ? '</Layer group>' : n.name;
      pascal(extra, nm);
      unicodeBlock(extra, nm);
      if (r.kind === 'group') sectionBlock(extra, n.collapsed ? 2 : 1, key === 'pass' ? 'pass' : key);
      if (r.kind === 'end') sectionBlock(extra, 3, 'norm');
      if (r.blk) { const dd = r.blk.data, len = dd.length + (dd.length & 1); extra.str('8BIM'); extra.str(r.blk.key); extra.u32(len); extra.raw(dd); if (dd.length & 1) extra.u8(0); }
      li.u32(extra.len); li.raw(extra.bytes());
    }
    for (const r of records) for (const c of r.ch) { li.u16(0); li.raw(c); }
    if (li.len % 2) li.u8(0);

    const out = new W8();
    out.str('8BPS'); out.u16(1); for (let i = 0; i < 6; i++) out.u8(0);
    out.u16(3); out.u32(H); out.u32(W); out.u16(deep ? 16 : 8); out.u16(3);
    out.u32(0); // colour mode data
    out.u32(0); // image resources
    out.u32(4 + li.len + 4); // layer & mask info length
    out.u32(li.len); out.raw(li.bytes());
    out.u32(0); // global mask info
    // merged composite (flattened over white)
    const flat = U.canvas(W, H), fx = U.ctx(flat);
    fx.fillStyle = '#fff'; fx.fillRect(0, 0, W, H); fx.drawImage(doc.flatCopy(), 0, 0);
    out.u16(0);
    const fc = channels(flat, { x: 0, y: 0, w: W, h: H });
    for (let c = 1; c < 4; c++) out.raw(fc[c]);
    const blob = new Blob(out.chunks, { type: 'image/vnd.adobe.photoshop' });
    blob.lost = lost;
    return blob;
  }

  /* ---------------- preferences ---------------- */
  const PREF = 'neondraw-prefs';
  function prefs() { try { return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch (e) { return {}; } }
  function savePrefs(p) { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch (e) { /* quota */ } }
  function getJSON(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function setJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } }

  ND.Store = { hasLiveOnly, serialize, serializeAsync, restore, restoreAll, autosaveAll, deserialize, autosave, autosaveRecord, idbGet, idbSet, loadAutosave, clearAutosave, exportORA, importORA, exportPSD, zip, unzip, prefs, savePrefs, getJSON, setJSON };
})();
