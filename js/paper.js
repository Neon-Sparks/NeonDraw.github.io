/* Neon Draw — papers and canvases. A document can sit on a paper: its tint and texture are painted
 * into the background layer, and its tooth changes how each kind of brush behaves:
 *   dry media (pencil, charcoal, pastel, crayon) catch only the peaks of the grain, more on rough paper;
 *   watercolour granulates into the valleys and spreads further on absorbent paper;
 *   oil / acrylic bristles skip the valleys of canvas weave; inks, airbrush and patterns barely notice. */
'use strict';
(function () {
  const U = ND.U;
  const P = {};

  // id, label, texture (ND.Textures id or null), grain 0..1 (roughness), tint, absorb 0..1, note
  P.TYPES = [
    { id: 'none', label: 'Digital (no texture)', texture: null, grain: 0, tint: '#ffffff', absorb: 0, note: 'Perfectly smooth — brushes behave as they always have' },
    { id: 'bristol', label: 'Smooth Bristol', texture: 'paper', grain: 0.18, tint: '#fbfaf7', absorb: 0.1, note: 'Hard, smooth surface for ink and fine pencil' },
    { id: 'cartridge', label: 'Cartridge / drawing', texture: 'paper', grain: 0.38, tint: '#fdfcf8', absorb: 0.3, note: 'Everyday drawing paper with a light tooth' },
    { id: 'sketch', label: 'Sketchbook', texture: 'paper', grain: 0.5, tint: '#f7f3ea', absorb: 0.45, note: 'Off-white sketch paper — pencil grain shows nicely' },
    { id: 'newsprint', label: 'Newsprint', texture: 'paper', grain: 0.42, tint: '#e9e4d6', absorb: 0.8, note: 'Cheap, absorbent, slightly grey' },
    { id: 'hotpress', label: 'Hot-press watercolour', texture: 'paper', grain: 0.28, tint: '#fbf9f4', absorb: 0.45, note: 'Smooth watercolour paper — crisp washes' },
    { id: 'coldpress', label: 'Cold-press watercolour', texture: 'watercolour', grain: 0.62, tint: '#f8f5ee', absorb: 0.6, note: 'The classic: visible tooth, granulating washes' },
    { id: 'rough', label: 'Rough watercolour', texture: 'rough', grain: 0.85, tint: '#f6f2e8', absorb: 0.7, note: 'Heavy texture — dry-brush sparkle, strong granulation' },
    { id: 'charcoal', label: 'Laid charcoal paper', texture: 'charcoal', grain: 0.72, tint: '#efe9dc', absorb: 0.35, note: 'Fine laid lines that catch charcoal and pastel' },
    { id: 'pastel', label: 'Pastel paper (toned)', texture: 'sand', grain: 0.75, tint: '#c9bba4', absorb: 0.3, note: 'Toothy toned paper for pastel and chalk' },
    { id: 'sanded', label: 'Sanded pastel card', texture: 'sand', grain: 0.95, tint: '#d8cdb8', absorb: 0.2, note: 'Very gritty — grabs lots of dry pigment' },
    { id: 'kraft', label: 'Kraft / brown paper', texture: 'paper', grain: 0.5, tint: '#c49a6c', absorb: 0.55, note: 'Brown wrapping paper — great with white chalk' },
    { id: 'toned-grey', label: 'Toned grey', texture: 'paper', grain: 0.45, tint: '#b9b8b4', absorb: 0.4, note: 'Mid-grey — draw darks and lights' },
    { id: 'black', label: 'Black card', texture: 'paper', grain: 0.3, tint: '#1e1e22', absorb: 0.2, note: 'For gel pens, chalk and neon' },
    { id: 'canvas', label: 'Primed canvas', texture: 'canvas', grain: 0.7, tint: '#f1ede4', absorb: 0.15, note: 'Cotton canvas weave for oils and acrylics' },
    { id: 'linen', label: 'Linen canvas', texture: 'linen', grain: 0.6, tint: '#e9e2d3', absorb: 0.15, note: 'Finer, irregular weave' },
    { id: 'board', label: 'Gessoed board', texture: 'concrete', grain: 0.35, tint: '#f4f2ec', absorb: 0.1, note: 'Smooth panel with a faint brushy texture' },
  ];
  P.TINTS = [
    ['#ffffff', 'White'], ['#fdfcf8', 'Bright white'], ['#f8f4ea', 'Cream'], ['#f3ecdb', 'Ivory'], ['#ebe1cc', 'Natural'],
    ['#e2d3b5', 'Buff'], ['#d6c4a0', 'Sand'], ['#c49a6c', 'Kraft'], ['#d9d9d6', 'Light grey'], ['#b9b8b4', 'Mid grey'],
    ['#8f9399', 'Slate'], ['#c9d3dc', 'Blue-grey'], ['#e6d6cf', 'Blush'], ['#d8e0cf', 'Sage'], ['#3a3a40', 'Charcoal'], ['#1e1e22', 'Black'],
  ];
  P.type = (id) => P.TYPES.find((t) => t.id === id) || P.TYPES[0];
  // A document's paper: { type, tint, grain, show, scale, texture, absorb }
  P.make = function (id, o) {
    const t = P.type(id);
    return Object.assign({ type: t.id, texture: t.texture, tint: t.tint, grain: t.grain, absorb: t.absorb, show: 0.6, scale: 1 }, o || {});
  };
  P.normalise = function (p) {
    if (!p || !p.type) return null;
    const t = P.type(p.type);
    return Object.assign({ texture: t.texture, absorb: t.absorb, grain: t.grain, tint: t.tint, show: 0.6, scale: 1 }, p, { texture: t.texture });
  };
  P.hasTexture = (p) => !!(p && p.texture && p.grain > 0);

  /* ---------- how a brush responds to the paper ---------- */
  const DRY_TIPS = ['pencil', 'chalk', 'charcoal', 'crayon', 'dry', 'sponge', 'pastel', 'spatter'];
  // 0 = ignores the paper, 1 = fully follows its tooth
  P.autoResponse = function (s, engine) {
    if (s.pattern || s.fillPattern) return 0; // pattern / scatter brushes print their own image
    switch (engine) {
      case 'watercolor': return 0.85;
      case 'bristle': return 0.6;
      case 'mixer': return 0.45;
      case 'airbrush': return 0.12;
      case 'pixel': {
        if (s.texture) return 1; // pencils, charcoal, pastels, crayons…
        if (DRY_TIPS.includes(s.tip)) return 0.8;
        if (s.blend === 'multiply' || s.softness > 0.6) return 0.25; // markers, soft brushes
        return 0.18; // inks and hard brushes: a hint of tooth on rough paper only
      }
      default: return 0; // sketchy lines, smudge, clone, dodge/burn, glow, pixel art
    }
  };
  P.response = (s, engine) => (s.paperResponse != null && s.paperResponse >= 0 ? s.paperResponse : P.autoResponse(s, engine));

  /* Texture a stroke should use on this paper, or null.
   * Returns { tex, strength (0..1 coverage strength), scale (texture scale), absorb } */
  P.forStroke = function (doc, s, engine, erasing) {
    const pp = doc && doc.paper;
    if (!P.hasTexture(pp) || erasing) return null;
    const resp = P.response(s, engine);
    if (resp <= 0.01) return null;
    const tex = ND.Textures.get(pp.texture);
    if (!tex) return null;
    let strength;
    if (s.texture && engine !== 'watercolor') {
      // brushes with their own grain keep their character but follow the paper's roughness
      strength = U.clamp(s.textureStrength * (0.55 + pp.grain * 0.75) * Math.max(resp, 0.6), 0, 1);
    } else strength = U.clamp(resp * (0.2 + pp.grain * 0.85), 0, 1);
    if (strength < 0.04) return null;
    return { tex, strength, scale: pp.scale || 1, absorb: pp.absorb || 0, grain: pp.grain };
  };

  /* ---------- rendering the paper ---------- */
  // one seamless tile of the paper surface (tint + lit texture), size 256 × scale
  P.tile = function (pp) {
    const scale = U.clamp(pp.scale || 1, 0.25, 6), T = Math.max(8, Math.round(256 * scale)), c = U.canvas(T, T), x = U.ctx(c);
    const rgb = U.hexToRgb(pp.tint || '#ffffff');
    const tex = pp.texture ? ND.Textures.get(pp.texture) : null;
    if (!tex || !(pp.show > 0)) { x.fillStyle = pp.tint || '#ffffff'; x.fillRect(0, 0, T, T); return c; }
    const N = tex.size, d = tex.data, id = x.createImageData(T, T), o = id.data;
    const at = (xx, yy) => d[(((yy % N) + N) % N) * N + (((xx % N) + N) % N)];
    const show = U.clamp(pp.show, 0, 1), depth = (0.08 + pp.grain * 0.22) * show, dark = rgb[0] + rgb[1] + rgb[2] < 200;
    for (let y = 0; y < T; y++) {
      for (let xx = 0; xx < T; xx++) {
        const u = xx / scale, v = y / scale, ix = u | 0, iy = v | 0, fx = u - ix, fy = v - iy;
        // bilinear height and a light from the top-left for a gentle emboss
        const hgt = (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
        const slope = at(ix - 1, iy - 1) - at(ix + 1, iy + 1);
        let k = 1 - depth * (1 - hgt) + slope * depth * 0.9;
        if (dark) k = 1 + (k - 1) * 2.2; // texture needs more contrast to read on dark papers
        const j = (y * T + xx) * 4;
        o[j] = U.clamp(rgb[0] * k, 0, 255); o[j + 1] = U.clamp(rgb[1] * k, 0, 255); o[j + 2] = U.clamp(rgb[2] * k * 0.995, 0, 255); o[j + 3] = 255;
      }
    }
    x.putImageData(id, 0, 0);
    return c;
  };
  // the paper over a whole canvas
  P.render = function (pp, w, h) {
    const c = U.canvas(w, h), x = U.ctx(c);
    x.fillStyle = x.createPattern(P.tile(pp), 'repeat');
    x.fillRect(0, 0, w, h);
    return c;
  };
  // small swatch for pickers
  P.preview = function (pp, w, h) {
    const c = U.canvas(w, h), x = U.ctx(c), t = P.tile(Object.assign({}, pp, { scale: 0.5, show: Math.max(0.5, pp.show || 0) }));
    x.fillStyle = x.createPattern(t, 'repeat');
    x.fillRect(0, 0, w, h);
    return c;
  };

  ND.Paper = P;
})();
