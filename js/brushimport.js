/* Neon Sparks Draw — reading brushes made for other programs.
 *   Photoshop .abr (versions 1, 2 and 6–10: sampled tips, plus the brush settings in the 'desc' block)
 *   Krita .kpp presets and .bundle files (presets with their tips), GIMP/Krita .gbr and .gih tips, .png tips
 * Everything is turned into this app's terms: a set of presets (engine, size, spacing, angle, roundness,
 * softness, opacity, flow, pressure…) and the brush tips they use. Brush engines that only exist in the other
 * program are mapped to the closest one here. This file only reads and converts; app.js stores the result. */
'use strict';
(function () {
  const ND = (typeof window !== 'undefined' ? window : globalThis).ND || ((typeof window !== 'undefined' ? window : globalThis).ND = {});
  const BI = {};
  const td8 = new TextDecoder('utf-8'), td16 = new TextDecoder('utf-16be');
  const latin1 = (u) => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return s; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  class R {
    constructor(u8, p) { this.b = u8; this.v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); this.p = p || 0; }
    u8() { return this.b[this.p++]; }
    i8() { const v = this.v.getInt8(this.p); this.p += 1; return v; }
    u16() { const v = this.v.getUint16(this.p); this.p += 2; return v; }
    i16() { const v = this.v.getInt16(this.p); this.p += 2; return v; }
    u32() { const v = this.v.getUint32(this.p); this.p += 4; return v; }
    i32() { const v = this.v.getInt32(this.p); this.p += 4; return v; }
    f64() { const v = this.v.getFloat64(this.p); this.p += 8; return v; }
    bytes(n) { if (n < 0 || this.p + n > this.b.length) throw new Error('file ends early'); const s = this.b.subarray(this.p, this.p + n); this.p += n; return s; }
    str4() { return latin1(this.bytes(4)); }
    left() { return this.b.length - this.p; }
  }

  /* ---------------- Photoshop .abr ---------------- */
  // grey pixels of a sampled tip: raw or PackBits (RLE, one byte-count per row first); 16-bit keeps the high byte
  function abrPixels(r, w, h, depth, comp) {
    const bpp = Math.max(1, depth >> 3), rowBytes = w * bpp, raw = new Uint8Array(rowBytes * h);
    if (!comp) raw.set(r.bytes(rowBytes * h));
    else {
      const counts = [];
      for (let y = 0; y < h; y++) counts.push(r.u16());
      for (let y = 0; y < h; y++) {
        const end = r.p + counts[y];
        let o = y * rowBytes;
        const rowEnd = o + rowBytes;
        while (r.p < end && o < rowEnd) {
          let n = r.i8();
          if (n === -128) continue;
          if (n < 0) { n = 1 - n; const v = r.u8(); for (let i = 0; i < n && o < rowEnd; i++) raw[o++] = v; }
          else { n += 1; for (let i = 0; i < n && o < rowEnd; i++) raw[o++] = r.u8(); }
        }
        r.p = end;
      }
    }
    if (bpp === 1) return raw;
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = raw[i * bpp];
    return out;
  }
  // Photoshop "action descriptor" (the brush settings)
  function ustr(r) { const n = r.u32(); return n ? td16.decode(r.bytes(n * 2)).replace(/\0+$/, '') : ''; }
  function idKey(r) { const n = r.u32(); return latin1(r.bytes(n || 4)); }
  function descriptor(r) {
    ustr(r);
    const o = { _class: idKey(r) }, n = r.u32();
    for (let i = 0; i < n; i++) { const k = idKey(r); o[k] = dvalue(r, r.str4()); }
    return o;
  }
  function dvalue(r, t) {
    switch (t) {
      case 'Objc': case 'GlbO': return descriptor(r);
      case 'VlLs': { const n = r.u32(), a = []; for (let i = 0; i < n; i++) a.push(dvalue(r, r.str4())); return a; }
      case 'doub': return r.f64();
      case 'UntF': { const unit = r.str4(); return { unit, value: r.f64() }; }
      case 'UnFl': { const unit = r.str4(), n = r.u32(), values = []; for (let i = 0; i < n; i++) values.push(r.f64()); return { unit, values }; }
      case 'TEXT': return ustr(r);
      case 'enum': { const type = idKey(r); return { type, value: idKey(r) }; }
      case 'long': return r.i32();
      case 'comp': { const hi = r.i32(), lo = r.u32(); return hi * 4294967296 + lo; }
      case 'bool': return !!r.u8();
      case 'type': case 'GlbC': ustr(r); return idKey(r);
      case 'alis': case 'tdta': case 'Pth ': return r.bytes(r.u32());
      case 'obj ': {
        const n = r.u32();
        for (let i = 0; i < n; i++) {
          const k = r.str4();
          if (k === 'prop') { ustr(r); idKey(r); idKey(r); } else if (k === 'Clss') { ustr(r); idKey(r); } else if (k === 'Enmr') { ustr(r); idKey(r); idKey(r); idKey(r); } else if (k === 'rele') { ustr(r); idKey(r); r.u32(); } else if (k === 'Idnt' || k === 'indx') r.u32(); else if (k === 'name') { ustr(r); idKey(r); ustr(r); } else throw new Error('reference ' + k);
        }
        return null;
      }
      default: throw new Error('unknown setting type “' + t + '”');
    }
  }
  const num = (v, d) => (v == null ? d : typeof v === 'number' ? v : v.value != null ? v.value : d);
  // a Photoshop brush preset → settings here
  function abrSettings(p, b, tipSize) {
    const s = { engine: 'pixel' };
    const dia = num(b && b.Dmtr, tipSize || 30);
    s.size = clamp(Math.round(dia), 1, 1000);
    if (b) {
      if (b.Spcn != null && b.Intr !== false) s.spacing = clamp(num(b.Spcn, 25) / 100, 0.01, 2);
      if (b.Angl != null) s.angle = num(b.Angl, 0);
      if (b.Rndn != null) s.roundness = clamp(num(b.Rndn, 100) / 100, 0.05, 1);
      if (b.Hrdn != null) s.softness = clamp(1 - num(b.Hrdn, 100) / 100, 0, 1);
    }
    // Photoshop's "control" numbers: 0 off, 1 fade, 2 pen pressure, 3 pen tilt, 4 stylus wheel, 5 rotation,
    // 6 initial direction, 7 direction
    const ctl = (v) => (v && typeof v === 'object' ? v.bVTy : 0), jit = (v) => (v && v.jitter != null ? clamp(num(v.jitter, 0) / 100, 0, 1) : 0);
    // Shape dynamics: size, angle and roundness
    if (p.useTipDynamics) {
      s.pressureSize = ctl(p.szVr) === 2 || ctl(p.szVr) === 3; // tilt has no direct match here: pressure is the closest
      s.sizeJitter = jit(p.szVr);
      if (p.minimumDiameter != null) s.minSize = clamp(num(p.minimumDiameter, 0) / 100, 0, 1);
      s.angleJitter = jit(p.angleDynamics);
      const ac = ctl(p.angleDynamics);
      if (ac === 6 || ac === 7) s.angleMode = 'direction';
      else if (ac === 3) s.angleMode = 'tilt';
      s.roundnessJitter = jit(p.roundnessDynamics);
      if (p.minimumRoundness != null) s.minRoundness = clamp(num(p.minimumRoundness, 5) / 100, 0.05, 1);
    } else s.pressureSize = false;
    // Transfer: opacity and flow, each from pen pressure and/or jitter
    if (p.usePaintDynamics) {
      s.pressureOpacity = ctl(p.opVr) === 2;
      s.pressureFlow = ctl(p.prVr) === 2;
      s.opacityJitter = Math.max(jit(p.opVr), jit(p.prVr));
    }
    // Scattering: how far (percent of the diameter), both axes or only across the stroke, and how many dabs
    if (p.useScatter) {
      const sc = p.scatterDynamics && p.scatterDynamics.jitter != null ? num(p.scatterDynamics.jitter, 0) : 0;
      if (sc) s.scatter = clamp(sc / 150, 0, 3);
      s.scatterBoth = p.bothAxes === true;
      if (p['Cnt '] > 1) s.count = clamp(Math.round(p['Cnt ']), 1, 16);
      s.countJitter = jit(p.countDynamics);
    }
    // Build-up = airbrush; wet edges
    if (p['Rpt ']) { s.engine = 'airbrush'; s.flow = 0.3; }
    if (p.Wtdg) s.wetEdges = 0.5;
    return s;
  }
  BI.readABR = function (bytes, setName) {
    const r = new R(bytes), version = r.u16(), out = { name: setName, presets: [], tips: [], notes: [] };
    if (version === 1 || version === 2) {
      const count = r.u16();
      for (let k = 0; k < count && r.left() > 6; k++) {
        const type = r.u16(), size = r.u32(), end = r.p + size;
        try {
          if (type === 2) {
            r.u32();
            const spacing = r.u16();
            let name = '';
            if (version === 2) name = ustr(r);
            r.u8(); r.bytes(8);
            const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32(), depth = r.u16(), comp = r.u8();
            const w = right - left, h = bottom - top;
            if (w > 0 && h > 0 && w * h < 4e7) {
              const ref = 'abr' + k;
              out.tips.push({ ref, label: name || setName + ' ' + (k + 1), kind: 'grey', w, h, data: abrPixels(r, w, h, depth, comp) });
              out.presets.push({ name: name || setName + ' ' + (k + 1), tip: ref, settings: { engine: 'pixel', size: clamp(Math.max(w, h), 1, 1000), spacing: clamp(spacing / 100, 0.01, 2) } });
            }
          } else if (type === 1) {
            r.u32();
            const spacing = r.u16(), diameter = r.u16(), roundness = r.u16(), angle = r.i16(), hardness = r.u16();
            out.presets.push({ name: setName + ' ' + (k + 1), tip: null, settings: { engine: 'pixel', size: clamp(diameter, 1, 1000), spacing: clamp(spacing / 100, 0.01, 2), roundness: clamp(roundness / 100, 0.05, 1), angle, softness: clamp(1 - hardness / 100, 0, 1) } });
          }
        } catch (e) { out.notes.push('brush ' + (k + 1) + ' could not be read'); }
        r.p = end;
      }
      return out;
    }
    if (version < 6 || version > 10) throw new Error('This .abr version (' + version + ') is not supported');
    const sub = r.u16(), sections = {};
    while (r.left() >= 12) {
      if (r.str4() !== '8BIM') break;
      const key = r.str4(), len = r.u32();
      sections[key] = { start: r.p, len };
      r.p += len;
    }
    // sampled tips, each with an id (“$…”) that the settings refer to
    const byId = {};
    if (sections.samp) {
      const s = sections.samp, end = s.start + s.len;
      r.p = s.start;
      let k = 0;
      while (r.p + 4 < end) {
        const size = r.u32(), start = r.p, next = start + size + ((4 - (size % 4)) % 4);
        try {
          const idLen = r.u8(), id = latin1(r.bytes(idLen));
          r.p = start + 1 + idLen;
          r.p += sub === 1 ? 10 : 264;
          const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32(), depth = r.u16(), comp = r.u8();
          const w = right - left, h = bottom - top;
          if (w > 0 && h > 0 && w * h < 4e7) {
            const ref = 'samp' + k;
            out.tips.push({ ref, label: setName + ' ' + (k + 1), kind: 'grey', w, h, data: abrPixels(r, w, h, depth, comp) });
            byId[id] = ref;
          }
        } catch (e) { out.notes.push('tip ' + (k + 1) + ' could not be read'); }
        r.p = next; k++;
      }
    }
    // presets (names and settings)
    let desc = null;
    if (sections.desc) {
      try { r.p = sections.desc.start; r.u32(); desc = descriptor(r); } catch (e) { out.notes.push('brush settings could not be read (' + e.message + ') — tips imported with plain settings'); }
    }
    const list = desc && Array.isArray(desc.Brsh) ? desc.Brsh : [];
    const used = new Set();
    for (const p of list) {
      if (!p || typeof p !== 'object') continue;
      const b = p.Brsh || null, name = p['Nm  '] || (b && b['Nm  ']) || setName;
      let tip = null;
      if (b && b._class === 'sampledBrush') { tip = byId[b.sampledData] || null; if (!tip) continue; }
      const t = tip && out.tips.find((q) => q.ref === tip);
      if (tip) { used.add(tip); if (t && name) t.label = name; }
      const pr = { name, tip, settings: abrSettings(p, b, t ? Math.max(t.w, t.h) : 30) };
      // Dual brush: a second sampled tip (this app paints only where its scattered copies land)
      const db = p.dualBrush;
      if (db && db.useDualBrush && db.Brsh && byId[db.Brsh.sampledData]) {
        pr.dualTip = byId[db.Brsh.sampledData];
        pr.settings.dualSize = clamp(num(db.Brsh.Dmtr, 30) / Math.max(1, pr.settings.size), 0.05, 2);
        pr.settings.dualCount = clamp(Math.round(db['Cnt '] || 3), 1, 16);
      }
      out.presets.push(pr);
    }
    // tips without a preset of their own still become presets
    for (const t of out.tips) if (!used.has(t.ref)) out.presets.push({ name: t.label, tip: t.ref, settings: { engine: 'pixel', size: clamp(Math.max(t.w, t.h), 1, 1000), spacing: 0.25 } });
    return out;
  };

  /* ---------------- GIMP / Krita .gbr and .gih ---------------- */
  // one .gbr image starting at `p`; returns { tip, end }
  function gbrAt(bytes, p, fallbackName) {
    const r = new R(bytes, p), hs = r.u32(), ver = r.u32(), w = r.u32(), h = r.u32(), depth = r.u32();
    if (!w || !h || w * h > 4e7 || (depth !== 1 && depth !== 4)) throw new Error('not a .gbr brush');
    let spacing = 25;
    if (ver >= 2) { r.u32(); spacing = r.u32(); }
    const nameBytes = bytes.subarray(r.p, p + hs);
    const name = td8.decode(nameBytes).replace(/\0[\s\S]*$/, '').trim() || fallbackName;
    const px = bytes.subarray(p + hs, p + hs + w * h * depth);
    if (px.length < w * h * depth) throw new Error('.gbr ends early');
    let data, colour = null;
    if (depth === 1) {
      // GIMP stores coverage (255 = paint)
      data = new Uint8Array(px);
    } else {
      // colour brush: alpha is the shape; keep the colours too
      data = new Uint8Array(w * h); colour = new Uint8ClampedArray(px);
      let opaque = true;
      for (let i = 0; i < w * h; i++) { data[i] = px[i * 4 + 3]; if (data[i] < 250) opaque = false; }
      // a fully opaque colour image: dark areas paint (as with an opaque .png tip)
      if (opaque) for (let i = 0; i < w * h; i++) data[i] = 255 - Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
    }
    return { tip: { label: name, kind: 'grey', w, h, data, colour, spacing: spacing / 100 }, end: p + hs + w * h * depth };
  }
  BI.readGBR = (bytes, name) => gbrAt(bytes, 0, name).tip;
  BI.readGIH = function (bytes, name) {
    // two text lines (name, then cell count and parameters), followed by the cells as .gbr images
    let p = 0, lines = 0;
    while (p < bytes.length && lines < 2) { if (bytes[p] === 10) lines++; p++; }
    const head = td8.decode(bytes.subarray(0, p)).split('\n');
    const cells = [];
    while (p + 28 < bytes.length && cells.length < 64) {
      try { const g = gbrAt(bytes, p, head[0] || name); cells.push(g.tip); p = g.end; } catch (e) { break; }
    }
    if (!cells.length) throw new Error('no images in the .gih file');
    cells[0].label = (head[0] || name).trim() || name;
    cells[0].variants = cells.length;
    // all the images: each dab picks one (Krita's pencils and textured brushes rely on this)
    cells[0].frames = cells.slice(1);
    return cells[0];
  };

  /* ---------------- Krita .kpp and .bundle ---------------- */
  // the text stored under `key` in a PNG (tEXt, zTXt or iTXt)
  BI.pngText = async function (bytes, key, inflate) {
    if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
    const r = new R(bytes, 8);
    while (r.left() >= 12) {
      const n = r.u32(), t = r.str4(), d = r.bytes(n);
      r.u32();
      const z = d.indexOf(0), k = latin1(d.subarray(0, z < 0 ? 0 : z));
      if (z < 0 || k !== key) { if (t === 'IEND') break; continue; }
      if (t === 'tEXt') return td8.decode(d.subarray(z + 1));
      if (t === 'zTXt') return td8.decode(await inflate(d.subarray(z + 2)));
      if (t === 'iTXt') {
        const comp = d[z + 1];
        let q = z + 3;
        q = d.indexOf(0, q) + 1; q = d.indexOf(0, q) + 1; // language tag, translated keyword
        const body = d.subarray(q);
        return td8.decode(comp ? await inflate(body) : body);
      }
    }
    return null;
  };
  const attrs = (s) => { const o = {}; s.replace(/([\w:-]+)\s*=\s*"([^"]*)"/g, (m, k, v) => { o[k] = v; }); return o; };
  const xmlUnescape = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  function kppParams(xml) {
    const out = {};
    xml.replace(/<param\b([^>]*)>(?:\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*|([^<]*))<\/param>/g, (m, a, cdata, plain) => { const k = attrs(a).name; if (k) out[k] = cdata != null ? cdata : xmlUnescape(plain || ''); });
    return out;
  }
  const ENGINE = { paintbrush: 'pixel', roundmarker: 'pixel', colorsmudge: 'mixer', hairybrush: 'bristle', spraybrush: 'spray', sketchbrush: 'sketchy', hatchingbrush: 'hatch', duplicate: 'clone' };
  // Krita preset XML → { name, settings, tipFile, tipEmbedded, approx }
  BI.kppSettings = function (xml, fallbackName) {
    const top = attrs((xml.match(/<Preset\b([^>]*)>/) || ['', ''])[1]), P = kppParams(xml);
    const op = top.paintopid || P.paintop || 'paintbrush', s = { engine: ENGINE[op] || 'pixel' };
    const f = (k, d) => { const v = parseFloat(P[k]); return isFinite(v) ? v : d; };
    const on = (k) => P[k] === 'true';
    s.opacity = clamp(f('OpacityValue', f('Krita/opacity', 1)), 0.01, 1);
    s.flow = clamp(f('FlowValue', 1), 0.01, 1);
    if (on('EraserMode') || P.CompositeOp === 'erase' || P['Krita/erase'] === 'true') s.erase = true;
    // Each Krita option (size, opacity, flow, rotation, scatter…) reacts to "sensors" — pen pressure, random
    // (fuzzy), drawing direction, speed, tilt… — each with its own curve. Opacity and flow are always on.
    const sensors = (opt) => {
      const enabled = opt === 'Opacity' || opt === 'Flow' ? P[opt + 'UseCurve'] !== 'false' : on('Pressure' + opt);
      if (!enabled) return {};
      const xml = P[opt + 'Sensor'] || '', res = {};
      const common = P[opt + 'commonCurve'];
      xml.replace(/<(?:params|ChildSensor)\b([^>]*?)(\/?)>(?:\s*<curve>([^<]*)<\/curve>)?/g, (m, a, selfClose, curve) => {
        const id = attrs(a).id;
        if (!id || id === 'sensorslist') return m;
        const c = curve || (P[opt + 'UseSameCurve'] === 'true' ? common : null) || common || '0,0;1,1;';
        res[id] = c.split(';').filter(Boolean).map((q) => q.split(',').map(Number)).filter((q) => q.length === 2 && q.every(isFinite));
        return m;
      });
      return res;
    };
    const flat = (c) => !c || c.every((q) => Math.abs(q[1] - c[0][1]) < 0.02); // a curve that doesn't change anything
    const lin = (c) => c && c.length === 2 && Math.abs(c[0][1]) < 0.01 && Math.abs(c[1][1] - 1) < 0.01;
    const sz = sensors('Size'), opS = sensors('Opacity'), fl = sensors('Flow'), rot = sensors('Rotation');
    s.pressureSize = !!sz.pressure && !flat(sz.pressure);
    if (s.pressureSize && !lin(sz.pressure)) s.sizeCurve = sz.pressure;
    if (s.pressureSize && lin(sz.pressure)) s.minSize = 0;
    if (sz.fuzzy || sz.fuzzystroke) s.sizeJitter = 0.4;
    if (sz.speed) s.speedSize = 0.5;
    s.pressureOpacity = !!opS.pressure && !flat(opS.pressure);
    if (s.pressureOpacity && !lin(opS.pressure)) s.opacityCurve = opS.pressure;
    s.pressureFlow = !!fl.pressure && !flat(fl.pressure);
    if (s.pressureFlow && !lin(fl.pressure)) s.flowCurve = fl.pressure;
    if (opS.fuzzy || opS.fuzzystroke || fl.fuzzy || fl.fuzzystroke) s.opacityJitter = 0.4;
    if (rot.drawingangle) s.angleMode = 'direction';
    else if (rot.tilt || rot.ascension || rot.declination) s.angleMode = 'tilt';
    if (rot.fuzzy || rot.fuzzystroke) s.angleJitter = clamp(f('RotationValue', 1), 0, 1);
    if (on('PressureScatter')) {
      s.scatter = clamp(f('ScatterValue', 1) / 1.5, 0, 3);
      s.scatterBoth = P['Scattering/AxisX'] !== 'false' && P['Scattering/AxisY'] !== 'false';
    }
    if (on('AirbrushOption/isAirbrushing') && s.engine === 'pixel') s.engine = 'airbrush';
    // Krita's smudge brushes: how strongly they smear the paint already on the canvas
    if (op === 'colorsmudge') s.bleed = clamp(f('SmudgeRateValue', 0.5) * 0.9, 0, 1);
    let tipFile = null, tipEmbedded = null, tipScale = 1;
    const bd = P.brush_definition || '';
    const B = attrs((bd.match(/<Brush\b([^>]*)>/) || ['', ''])[1]);
    const type = B.type || 'auto_brush';
    s.spacing = clamp(B.useAutoSpacing === '1' ? 0.1 * (parseFloat(B.autoSpacingCoeff) || 1) : parseFloat(B.spacing) || 0.1, 0.01, 2);
    const ang = parseFloat(B.angle) || 0;
    s.angle = Math.round(Math.abs(ang) <= 6.3 ? (ang * 180) / Math.PI : ang); // Krita keeps radians
    if (type === 'auto_brush') {
      const M = attrs((bd.match(/<MaskGenerator\b([^>]*)>/) || ['', ''])[1]);
      s.size = clamp(Math.round(parseFloat(M.diameter) || 20), 1, 1000);
      s.roundness = clamp(parseFloat(M.ratio) || 1, 0.05, 1);
      // Krita's "fade": for the default and soft masks 1 = hard edge; the Gaussian mask works the other way round
      const fade = Math.min(parseFloat(M.hfade || 1), parseFloat(M.vfade || 1));
      s.softness = clamp(M.id === 'gauss' ? fade : 1 - fade, 0, 1);
      s.tip = M.type === 'rect' ? 'square' : 'round';
    } else {
      tipFile = B.filename || null;
      tipScale = parseFloat(B.scale) || 1;
      // newer Krita versions can keep the tip inside the preset
      const em = xml.match(/<resource\b([^>]*)>([A-Za-z0-9+/=\s]+)<\/resource>/);
      if (em) tipEmbedded = { name: attrs(em[1]).filename || tipFile, base64: em[2].replace(/\s+/g, '') };
    }
    // Krita names presets like “b)_Basic-5_Size”: show “Basic-5 Size”
    const nice = (n) => (n || '').replace(/^[a-z0-9]{1,2}\)[_ ]?/i, '').replace(/_/g, ' ').trim() || n;
    return { name: nice(top.name || fallbackName), settings: s, tipFile, tipScale, tipEmbedded, approx: !ENGINE[op], op };
  };
  const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  // a tip file from Krita / GIMP / an image, by its extension
  function tipFromFile(bytes, file, label) {
    const ext = (file.match(/\.([a-z0-9]+)$/i) || ['', ''])[1].toLowerCase();
    if (ext === 'gbr') return BI.readGBR(bytes, label);
    if (ext === 'gih') return BI.readGIH(bytes, label);
    if (ext === 'png' || ext === 'svg' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return { label, kind: 'image', mime: ext === 'svg' ? 'image/svg+xml' : 'image/' + (ext === 'jpg' ? 'jpeg' : ext), bytes };
    return null;
  }
  BI.readKPP = async function (bytes, setName, inflate, findFile) {
    const xml = await BI.pngText(bytes, 'preset', inflate);
    if (!xml) throw new Error('no Krita preset inside this file');
    const k = BI.kppSettings(xml, setName);
    const out = { name: setName, presets: [], tips: [], notes: [] };
    let tip = null;
    if (k.tipFile || k.tipEmbedded) {
      let t = null;
      try {
        if (k.tipEmbedded) t = tipFromFile(b64(k.tipEmbedded.base64), k.tipEmbedded.name || k.tipFile || 'tip.gbr', k.name);
        else if (findFile) { const fb = await findFile(k.tipFile); if (fb) t = tipFromFile(fb, k.tipFile, k.tipFile.replace(/\.[^.]+$/, '')); }
      } catch (e) { t = null; }
      if (t) {
        tip = 'tip:' + (k.tipFile || k.name);
        t.ref = tip;
        out.tips.push(t);
        if (t.w) k.settings.size = clamp(Math.round(Math.max(t.w, t.h) * k.tipScale), 1, 1000);
        else k.settings.size = k.settings.size || clamp(Math.round(100 * k.tipScale), 1, 1000);
      } else {
        out.notes.push('“' + k.name + '” uses the tip “' + (k.tipFile || '?') + '”, which isn’t in the file — a round tip is used');
        k.settings.size = clamp(Math.round(100 * k.tipScale), 1, 1000);
      }
    }
    if (k.approx) out.notes.push('“' + k.name + '” uses Krita’s ' + k.op + ' engine, which works differently here');
    out.presets.push({ name: k.name, tip, settings: k.settings, krita: k.op, tipScale: k.tipScale });
    return out;
  };
  // a Krita .bundle (zip): all its presets and their tips; tips nobody uses become presets too
  BI.readBundle = async function (zipEntries, setName, inflate) {
    const out = { name: setName, presets: [], tips: [], notes: [] };
    const names = zipEntries.names, get = zipEntries.get;
    const byBase = {};
    names.forEach((n) => { byBase[n.split('/').pop()] = n; });
    // the bundle's own name, if it has one
    if (byBase['meta.xml']) {
      try { const m = td8.decode(await get(byBase['meta.xml'])).match(/<meta:generator>|<dc:title>([^<]+)<\/dc:title>|<meta:name>([^<]+)<\/meta:name>/); if (m && (m[1] || m[2])) out.name = (m[1] || m[2]).trim(); } catch (e) { /* keep the file name */ }
    }
    const tipByRef = {};
    const findFile = async (f) => (f && byBase[f] ? get(byBase[f]) : null);
    for (const n of names.filter((q) => /^paintoppresets\/.+\.kpp$/i.test(q)).sort()) {
      try {
        const k = await BI.readKPP(await get(n), n.split('/').pop().replace(/\.kpp$/i, ''), inflate, findFile);
        for (const t of k.tips) if (!tipByRef[t.ref]) { tipByRef[t.ref] = t; out.tips.push(t); }
        out.presets.push(...k.presets);
        out.notes.push(...k.notes);
      } catch (e) { out.notes.push(n.split('/').pop() + ': ' + e.message); }
    }
    for (const n of names.filter((q) => /^brushes\/.+\.(gbr|gih|png)$/i.test(q)).sort()) {
      const base = n.split('/').pop(), ref = 'tip:' + base;
      if (tipByRef[ref]) continue;
      try {
        const t = tipFromFile(await get(n), base, base.replace(/\.[^.]+$/, ''));
        if (!t) continue;
        t.ref = ref; tipByRef[ref] = t; out.tips.push(t);
        out.presets.push({ name: t.label, tip: ref, settings: { engine: 'pixel', size: t.w ? clamp(Math.max(t.w, t.h), 1, 1000) : 60, spacing: clamp(t.spacing || 0.15, 0.01, 2) } });
      } catch (e) { out.notes.push(base + ': ' + e.message); }
    }
    return out;
  };
  // a single tip file (.gbr / .gih / image) → a set with one preset
  BI.readTipFile = function (bytes, file) {
    const label = file.replace(/\.[^.]+$/, '');
    const t = tipFromFile(bytes, file, label);
    if (!t) throw new Error('not a brush tip');
    t.ref = 'tip:' + file;
    return { name: label, tips: [t], notes: [], presets: [{ name: t.label || label, tip: t.ref, settings: { engine: 'pixel', size: t.w ? clamp(Math.max(t.w, t.h), 1, 1000) : 60, spacing: clamp(t.spacing || 0.15, 0.01, 2) } }] };
  };
  ND.BrushImport = BI;
})();
