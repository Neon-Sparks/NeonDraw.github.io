/* Neon Draw — colour management: ICC profiles, print (CMYK) proofing, gamut warning and conversions.
 * Reads ICC v2 / v4 profiles: matrix + curve RGB profiles (Adobe RGB, ProPhoto, Display P3…) and LUT-based
 * CMYK printer profiles (lut8 / lut16 / lutAtoB / lutBtoA). Without a loaded printer profile a built-in
 * approximation of a coated offset press is used. The working colour space is sRGB, 8 bits per channel. */
'use strict';
(function () {
  const U = ND.U;
  const C = { proof: null, profileName: 'Generic coated press (built in, approximate)' };

  /* ---------- sRGB, XYZ, Lab ---------- */
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const gam = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  // sRGB (D65) ↔ XYZ D50 (Bradford-adapted, as ICC uses)
  const M_SRGB_D50 = [0.4360747, 0.3850649, 0.1430804, 0.2225045, 0.7168786, 0.0606169, 0.0139322, 0.0971045, 0.7141733];
  const M_D50_SRGB = [3.1338561, -1.6168667, -0.4906146, -0.9787684, 1.9161415, 0.0334540, 0.0719453, -0.2289914, 1.4052427];
  const mul = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  const WP = [0.9642, 1, 0.8249];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116), fi = (t) => (t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27));
  C.xyzToLab = (x) => { const a = f(x[0] / WP[0]), b = f(x[1] / WP[1]), c = f(x[2] / WP[2]); return [116 * b - 16, 500 * (a - b), 200 * (b - c)]; };
  C.labToXyz = (L) => { const fy = (L[0] + 16) / 116, fx = fy + L[1] / 500, fz = fy - L[2] / 200; return [fi(fx) * WP[0], fi(fy) * WP[1], fi(fz) * WP[2]]; };
  C.srgbToXyz = (r, g, b) => mul(M_SRGB_D50, [lin(r / 255), lin(g / 255), lin(b / 255)]);
  C.xyzToSrgb = (x) => mul(M_D50_SRGB, x).map((v) => Math.round(255 * Math.max(0, Math.min(1, gam(Math.max(0, v))))));
  C.srgbToLab = (r, g, b) => C.xyzToLab(C.srgbToXyz(r, g, b));

  /* ---------- ICC profile reader ---------- */
  C.parseICC = function (buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const s4 = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    if (b.length < 132 || s4(36) !== 'acsp') throw new Error('Not an ICC colour profile');
    const P = { space: s4(16).trim(), pcs: s4(20).trim(), cls: s4(12), version: b[8], tags: {} };
    const n = dv.getUint32(128);
    for (let i = 0; i < n; i++) { const o = 132 + i * 12; P.tags[s4(o)] = { off: dv.getUint32(o + 4), len: dv.getUint32(o + 8) }; }
    const tag = (sig) => P.tags[sig];
    const s15 = (o) => dv.getInt32(o) / 65536;
    // description
    const d = tag('desc');
    if (d) {
      const t = s4(d.off);
      if (t === 'desc') { const L = dv.getUint32(d.off + 8); P.name = new TextDecoder().decode(b.subarray(d.off + 12, d.off + 12 + L - 1)); }
      else if (t === 'mluc') { const so = dv.getUint32(d.off + 20), sl = dv.getUint32(d.off + 24); let s = ''; for (let k = 0; k < sl; k += 2) s += String.fromCharCode(dv.getUint16(d.off + so + k)); P.name = s; }
    }
    // tone curves: curv (gamma or table) or para
    const curve = (o) => {
      const t = s4(o);
      if (t === 'curv') {
        const cnt = dv.getUint32(o + 8);
        if (cnt === 0) { const id = (x) => x; id.len = 12; return id; }
        if (cnt === 1) { const g = dv.getUint16(o + 12) / 256, gf = (x) => Math.pow(x, g); gf.len = 14; return gf; }
        const tb = []; for (let k = 0; k < cnt; k++) tb.push(dv.getUint16(o + 12 + k * 2) / 65535);
        const fn = (x) => { const p = Math.max(0, Math.min(1, x)) * (cnt - 1), i = Math.floor(p); return i >= cnt - 1 ? tb[cnt - 1] : tb[i] + (tb[i + 1] - tb[i]) * (p - i); };
        fn.len = 12 + cnt * 2;
        return fn;
      }
      if (t === 'para') {
        const ft = dv.getUint16(o + 8), p = []; for (let k = 0; k < 7; k++) p.push(s15(o + 12 + k * 4));
        const [g, a, bb, c, dd, e, ff] = p;
        const fn = ft === 0 ? (x) => Math.pow(x, g) : ft === 1 ? (x) => (x >= -bb / a ? Math.pow(a * x + bb, g) : 0) : ft === 2 ? (x) => (x >= -bb / a ? Math.pow(a * x + bb, g) + c : c) : ft === 3 ? (x) => (x >= dd ? Math.pow(a * x + bb, g) : c * x) : (x) => (x >= dd ? Math.pow(a * x + bb, g) + e : c * x + ff);
        fn.len = 12 + [1, 3, 4, 5, 7][ft] * 4;
        return fn;
      }
      return (x) => x;
    };
    const xyz = (sig) => { const t = tag(sig); return t ? [s15(t.off + 8), s15(t.off + 12), s15(t.off + 16)] : null; };
    if (P.space === 'RGB' && tag('rXYZ') && tag('rTRC')) {
      const r = xyz('rXYZ'), g = xyz('gXYZ'), bl = xyz('bXYZ');
      P.matrix = [r[0], g[0], bl[0], r[1], g[1], bl[1], r[2], g[2], bl[2]];
      P.trc = ['rTRC', 'gTRC', 'bTRC'].map((k) => curve(tag(k).off));
      P.toXYZ = (rgb) => mul(P.matrix, rgb.map((v, i) => P.trc[i](v)));
    }
    // LUT-based transforms: lut8 (mft1), lut16 (mft2), lutAtoB (mAB ), lutBtoA (mBA )
    const lut = (sig) => {
      const t = tag(sig); if (!t) return null;
      const o = t.off, type = s4(o);
      if (type === 'mft1' || type === 'mft2') {
        const ni = b[o + 8], no = b[o + 9], g = b[o + 10], w = type === 'mft2' ? 2 : 1, rd = (q) => (w === 2 ? dv.getUint16(q) / 65535 : b[q] / 255);
        let p = o + 48, inN = 256, outN = 256;
        if (w === 2) { inN = dv.getUint16(o + 48); outN = dv.getUint16(o + 50); p = o + 52; }
        const inT = []; for (let c = 0; c < ni; c++) { const a = []; for (let k = 0; k < inN; k++) { a.push(rd(p)); p += w; } inT.push(a); }
        const grid = Math.pow(g, ni) * no, clut = new Float32Array(grid); for (let k = 0; k < grid; k++) { clut[k] = rd(p); p += w; }
        const outT = []; for (let c = 0; c < no; c++) { const a = []; for (let k = 0; k < outN; k++) { a.push(rd(p)); p += w; } outT.push(a); }
        const tab = (a, x) => { const q = Math.max(0, Math.min(1, x)) * (a.length - 1), i = Math.floor(q); return i >= a.length - 1 ? a[a.length - 1] : a[i] + (a[i + 1] - a[i]) * (q - i); };
        return { ni, no, legacyLab: w === 2, run: (v) => { const x = v.map((q, i) => tab(inT[i], q)), y = interp(clut, g, ni, no, x); return y.map((q, i) => tab(outT[i], q)); } };
      }
      if (type === 'mAB ' || type === 'mBA ') {
        const ni = b[o + 8], no = b[o + 9], offB = dv.getUint32(o + 12), offC = dv.getUint32(o + 24), offA = dv.getUint32(o + 28);
        const curves = (off, nC) => { if (!off) return null; let q = o + off; const out = []; for (let k = 0; k < nC; k++) { const c = curve(q); out.push(c); q += (c.len || 12); q += (4 - (q % 4)) % 4; } return out; };
        const ab = type === 'mAB ', A = curves(offA, ab ? ni : no), B = curves(offB, ab ? no : ni);
        let g = [], clut = null, prec = 1, cq = 0;
        if (offC) { cq = o + offC; for (let k = 0; k < ni; k++) g.push(b[cq + k]); prec = b[cq + 16]; const n2 = g.reduce((m, x) => m * x, 1) * no; clut = new Float32Array(n2); for (let k = 0; k < n2; k++) clut[k] = prec === 2 ? dv.getUint16(cq + 20 + k * 2) / 65535 : b[cq + 20 + k] / 255; }
        const run = (v) => {
          let x = v.slice();
          if (ab) { if (A) x = x.map((q, i) => A[i](q)); if (clut) x = interp(clut, g[0], ni, no, x, g); if (B) x = x.map((q, i) => B[i](q)); }
          else { if (B) x = x.map((q, i) => B[i](q)); if (clut) x = interp(clut, g[0], ni, no, x, g); if (A) x = x.map((q, i) => A[i](q)); }
          return x;
        };
        return { ni, no, legacyLab: false, run };
      }
      return null;
    };
    P.A2B = lut('A2B1') || lut('A2B0');
    P.B2A = lut('B2A1') || lut('B2A0');
    return P;
  };
  // multilinear interpolation in a CLUT with ni inputs (grid g, or per-input grids gs)
  function interp(clut, g, ni, no, x, gs) {
    gs = gs || new Array(ni).fill(g);
    const base = [], frac = [];
    for (let i = 0; i < ni; i++) { const q = Math.max(0, Math.min(1, x[i])) * (gs[i] - 1); base[i] = Math.min(gs[i] - 2, Math.floor(q)); if (gs[i] === 1) base[i] = 0; frac[i] = gs[i] === 1 ? 0 : q - base[i]; }
    const out = new Array(no).fill(0), strides = []; let st = no;
    for (let i = ni - 1; i >= 0; i--) { strides[i] = st; st *= gs[i]; }
    for (let corner = 0; corner < 1 << ni; corner++) {
      let w = 1, idx = 0;
      for (let i = 0; i < ni; i++) { const bit = (corner >> (ni - 1 - i)) & 1; w *= bit ? frac[i] : 1 - frac[i]; idx += (base[i] + bit) * strides[i]; }
      if (w === 0) continue;
      for (let k = 0; k < no; k++) out[k] += w * clut[idx + k];
    }
    return out;
  }
  // PCS values (0–1 encoded) ↔ Lab
  const pcsToLab = (v, legacy) => (legacy ? [v[0] * 65535 / 65280 * 100, v[1] * 65535 / 256 - 128, v[2] * 65535 / 256 - 128] : [v[0] * 100, v[1] * 255 - 128, v[2] * 255 - 128]);
  const labToPcs = (L, legacy) => (legacy ? [L[0] / 100 * 65280 / 65535, (L[1] + 128) * 256 / 65535, (L[2] + 128) * 256 / 65535] : [L[0] / 100, (L[1] + 128) / 255, (L[2] + 128) / 255]);
  const pcsToXyz = (v) => v.map((q) => q * 65535 / 32768); // PCS XYZ encoding (u1Fixed15)
  const xyzToPcs = (x) => x.map((q) => q * 32768 / 65535);

  /* ---------- RGB profiles: convert pixels to sRGB ---------- */
  C.convertToSRGB = function (canvas, profile) {
    const P = profile && profile.space ? profile : C.parseICC(profile);
    const toXYZ = P.toXYZ || (P.A2B && P.space === 'RGB' ? (v) => (P.pcs === 'Lab' ? C.labToXyz(pcsToLab(P.A2B.run(v), P.A2B.legacyLab)) : pcsToXyz(P.A2B.run(v))) : null);
    if (!toXYZ) return false;
    const x = U.ctx(canvas), img = x.getImageData(0, 0, canvas.width, canvas.height), d = img.data, cache = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const key = ((d[i] >> 2) << 12) | ((d[i + 1] >> 2) << 6) | (d[i + 2] >> 2);
      let o = cache.get(key);
      if (!o) { o = C.xyzToSrgb(toXYZ([(d[i] >> 2) / 63, (d[i + 1] >> 2) / 63, (d[i + 2] >> 2) / 63])); cache.set(key, o); }
      d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2];
    }
    x.putImageData(img, 0, 0);
    return true;
  };

  /* ---------- CMYK ---------- */
  // built-in approximation of a coated offset press: GCR black, 300% ink limit, ink colours measured like SWOP-ish primaries
  const INK = { c: [0, 158, 224], m: [228, 0, 124], y: [255, 237, 0], k: [35, 31, 32] };
  const builtInCmykToRgb = (c, m, y, k) => {
    const out = [255, 255, 255];
    [[c, INK.c], [m, INK.m], [y, INK.y], [k, INK.k]].forEach(([a, ink]) => { for (let i = 0; i < 3; i++) out[i] *= 1 - a * (1 - ink[i] / 255); });
    return out.map((v) => Math.max(0, Math.min(255, Math.round(v))));
  };
  const builtInRgbToCmyk = (r, g, b) => {
    // start from a simple separation, then refine against the ink model so the proof round-trips
    let k = 1 - Math.max(r, g, b) / 255;
    k = Math.max(0, (k - 0.12) / 0.88) * 0.95; // GCR: no black in light colours
    let c = 0, m = 0, y = 0;
    for (let it = 0; it < 12; it++) {
      const p = builtInCmykToRgb(c, m, y, k);
      c = Math.max(0, Math.min(1, c + (p[0] - r) / 255 * 0.9));
      m = Math.max(0, Math.min(1, m + (p[1] - g) / 255 * 0.9));
      y = Math.max(0, Math.min(1, y + (p[2] - b) / 255 * 0.9));
    }
    const sum = c + m + y + k;
    if (sum > 3) { const s = (3 - k) / (c + m + y); c *= s; m *= s; y *= s; } // total ink limit 300%
    return [c, m, y, k];
  };
  C.setProfile = function (buf, name) {
    if (!buf) { C.proof = null; C.profileName = 'Generic coated press (built in, approximate)'; C.lut = null; return true; }
    const P = C.parseICC(buf);
    if (P.space !== 'CMYK' || !P.A2B || !P.B2A) throw new Error('That profile isn’t a CMYK printer profile (it’s ' + P.space + ')');
    C.proof = P; C.profileName = P.name || name || 'CMYK profile'; C.lut = null;
    return true;
  };
  C.rgbToCmyk01 = function (r, g, b) {
    const P = C.proof;
    if (!P) return builtInRgbToCmyk(r, g, b);
    const pcs = P.pcs === 'Lab' ? labToPcs(C.srgbToLab(r, g, b), P.B2A.legacyLab) : xyzToPcs(C.srgbToXyz(r, g, b));
    return P.B2A.run(pcs).map((v) => Math.max(0, Math.min(1, v)));
  };
  C.cmykToRgb = function (c, m, y, k) {
    const P = C.proof;
    if (!P) return builtInCmykToRgb(c, m, y, k);
    const v = P.A2B.run([c, m, y, k]);
    return C.xyzToSrgb(P.pcs === 'Lab' ? C.labToXyz(pcsToLab(v, P.A2B.legacyLab)) : pcsToXyz(v));
  };
  // 8-bit CMYK for files (alpha is flattened onto white paper)
  C.rgbToCmyk = function (r, g, b, a) {
    if (a !== undefined && a < 255) { const t = a / 255; r = r * t + 255 * (1 - t); g = g * t + 255 * (1 - t); b = b * t + 255 * (1 - t); }
    return Uint8Array.from(C.rgbToCmyk01(r, g, b).map((v) => Math.round(v * 255)));
  };
  /* A 64-level 3D table sRGB → proofed sRGB (+ out-of-gamut flag), so the proof view is fast enough to update
   * while painting. Built once per profile. */
  C.proofLUT = function () {
    if (C.lut) return C.lut;
    const N = 64, lut = new Uint8Array(N * N * N * 4);
    for (let r = 0; r < N; r++) for (let g = 0; g < N; g++) for (let b = 0; b < N; b++) {
      const R = (r * 255) / (N - 1), G = (g * 255) / (N - 1), B = (b * 255) / (N - 1), k = C.rgbToCmyk01(R, G, B), p = C.cmykToRgb(k[0], k[1], k[2], k[3]);
      const L1 = C.srgbToLab(R, G, B), L2 = C.srgbToLab(p[0], p[1], p[2]), dE = Math.hypot(L1[0] - L2[0], L1[1] - L2[1], L1[2] - L2[2]);
      const i = ((r * N + g) * N + b) * 4;
      lut[i] = p[0]; lut[i + 1] = p[1]; lut[i + 2] = p[2]; lut[i + 3] = dE > 6 ? 1 : 0;
    }
    C.lut = lut;
    return lut;
  };
  // proof (and/or mark out-of-gamut colours) in an area of a 2D context
  C.proofRegion = function (ctx, r, proof, gamut) {
    const lut = C.proofLUT(), img = ctx.getImageData(r.x, r.y, r.w, r.h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const j = (((d[i] >> 2) * 64 + (d[i + 1] >> 2)) * 64 + (d[i + 2] >> 2)) * 4;
      if (gamut && lut[j + 3]) { const s = ((i >> 2) % 7) < 3; d[i] = s ? 110 : 150; d[i + 1] = s ? 110 : 150; d[i + 2] = s ? 110 : 150; continue; }
      if (proof) { d[i] = lut[j]; d[i + 1] = lut[j + 1]; d[i + 2] = lut[j + 2]; }
    }
    ctx.putImageData(img, r.x, r.y);
  };

  /* ---------- an sRGB ICC profile to embed in exported files ---------- */
  C.srgbICC = function () {
    if (C._srgb) return C._srgb;
    const tags = [], add = (sig, bytes) => tags.push({ sig, bytes });
    const B = () => new ND.Formats.Buf(false);
    const s15 = (b, v) => b.i32(Math.round(v * 65536));
    const xyzTag = (v) => { const b = B(); b.str('XYZ '); b.u32(0); v.forEach((q) => s15(b, q)); return b.bytes(); };
    const desc = (() => { const t = 'sRGB IEC61966-2.1 (Neon Draw)', b = B(); b.str('desc'); b.u32(0); b.u32(t.length + 1); b.str(t); b.u8(0); b.u32(0); b.u32(0); b.u16(0); b.u8(0); for (let i = 0; i < 67; i++) b.u8(0); return b.bytes(); })();
    const trc = (() => { const b = B(); b.str('curv'); b.u32(0); b.u32(1024); for (let i = 0; i < 1024; i++) b.u16(Math.round(lin(i / 1023) * 65535)); return b.bytes(); })();
    const cprt = (() => { const t = 'No copyright, use freely', b = B(); b.str('text'); b.u32(0); b.str(t); b.u8(0); return b.bytes(); })();
    add('desc', desc); add('cprt', cprt); add('wtpt', xyzTag(WP));
    add('rXYZ', xyzTag([M_SRGB_D50[0], M_SRGB_D50[3], M_SRGB_D50[6]])); add('gXYZ', xyzTag([M_SRGB_D50[1], M_SRGB_D50[4], M_SRGB_D50[7]])); add('bXYZ', xyzTag([M_SRGB_D50[2], M_SRGB_D50[5], M_SRGB_D50[8]]));
    add('rTRC', trc); add('gTRC', trc); add('bTRC', trc);
    let off = 128 + 4 + tags.length * 12;
    const placed = tags.map((t) => { const o = off; off += t.bytes.length; off += (4 - (off % 4)) % 4; return o; });
    const total = off, b = B();
    b.u32(total); b.str('none'); b.u32(0x02100000); b.str('mntr'); b.str('RGB '); b.str('XYZ ');
    for (let i = 0; i < 6; i++) b.u16(0);
    b.str('acsp'); b.str('APPL'); b.u32(0); b.u32(0); b.u32(0); b.u32(0); b.u32(0); b.u32(0);
    s15(b, WP[0]); s15(b, WP[1]); s15(b, WP[2]); b.u32(0);
    for (let i = 0; i < 44; i++) b.u8(0);
    b.u32(tags.length);
    tags.forEach((t, i) => { b.str(t.sig); b.u32(placed[i]); b.u32(t.bytes.length); });
    tags.forEach((t, i) => { while (b.n < placed[i]) b.u8(0); b.raw(t.bytes); });
    while (b.n < total) b.u8(0);
    return (C._srgb = b.bytes());
  };
  // put an sRGB marker into PNGs and an ICC profile into JPEGs so other apps show the colours as intended
  C.tagExport = async function (blob, type) {
    const u = new Uint8Array(await blob.arrayBuffer());
    if (type === 'image/png' && u[0] === 0x89) {
      const crc = (bytes) => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) { c ^= bytes[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; };
      const chunk = new Uint8Array(13), dv = new DataView(chunk.buffer);
      dv.setUint32(0, 1); chunk.set([0x73, 0x52, 0x47, 0x42], 4); chunk[8] = 0; dv.setUint32(9, crc(chunk.subarray(4, 9)));
      return new Blob([u.subarray(0, 33), chunk, u.subarray(33)], { type });
    }
    if (type === 'image/jpeg' && u[0] === 0xff && u[1] === 0xd8) {
      const icc = C.srgbICC(), head = new TextEncoder().encode('ICC_PROFILE\0'), len = 2 + head.length + 2 + icc.length;
      const seg = new Uint8Array(4 + head.length + 2 + icc.length);
      seg.set([0xff, 0xe2, len >> 8, len & 255]); seg.set(head, 4); seg[4 + head.length] = 1; seg[5 + head.length] = 1; seg.set(icc, 6 + head.length);
      return new Blob([u.subarray(0, 2), seg, u.subarray(2)], { type });
    }
    return blob;
  };

  ND.Colour = C;
})();
