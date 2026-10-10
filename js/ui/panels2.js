/* Neon Sparks Draw — right-hand panels: Gradients, Retouch (frequency separation and the retouch tools) and Actions. */
'use strict';
(function () {
  const U = ND.U, h = U.h, C = ND.C, App = ND.App;
  const S = () => App.state;

  /* ================= Gradients ================= */
  const GP = {};
  GP.build = function (root) {
    const body = h('div.nd-gradpanel'), list = h('div.nd-gradlist');
    const render = () => {
      U.clear(list);
      App.gradientOptions().forEach(([v, label]) => {
        const c = ND.Render.gradientSwatch(v, S().fg, S().bg, 120, 16);
        const b = h('button.nd-gradbtn' + (S().gradTo === v ? '.active' : ''), { type: 'button', title: label }, c, h('span', label));
        b.addEventListener('click', () => { App.set('gradTo', v); if (S().tool !== 'gradient') App.setTool('gradient'); render(); });
        list.appendChild(b);
      });
    };
    const opts = h('div.nd-col',
      C.segmented([['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Angle'], ['diamond', 'Diamond'], ['reflected', 'Reflected']], () => S().gradType, (v) => App.set('gradType', v)),
      h('div.nd-row', C.select('Repeat', [['none', 'None'], ['repeat', 'Repeat'], ['mirror', 'Mirror']], () => S().gradRepeat, (v) => App.set('gradRepeat', v)), C.check('Reverse', () => !!S().gradReverse, (v) => App.set('gradReverse', v)), C.check('Dither', () => !!S().gradDither, (v) => App.set('gradDither', v), 'Adds subtle noise to prevent banding')),
      C.slider('Opacity', { min: 0, max: 1, step: 0.01, get: () => (S().gradOpacity == null ? 1 : S().gradOpacity), set: (v) => App.set('gradOpacity', v), fmt: (v) => Math.round(v * 100) + '%' }),
      h('div.nd-row.tight',
        C.button('New / edit…', () => ND.AdjustPanel.gradientEditor(S().gradTo), { cls: 'sm', title: 'Gradient editor — custom colour stops' }),
        C.button('Fill layer', () => { const d = App.doc; d.addAdjustment('gradientfill', Object.assign(ND.Adjust.defaults('gradientfill'), { to: S().gradTo, fg: S().fg, bg: S().bg, type: S().gradType === 'radial' ? 'radial' : 'linear', reverse: S().gradReverse ? 1 : 0 })); App.toast('Gradient fill layer added — edit it in Properties'); }, { cls: 'sm', title: 'Add an editable gradient fill layer with this gradient' }),
        C.button('Gradient map', () => { const d = App.doc; d.addAdjustment('gradientmap', Object.assign(ND.Adjust.defaults('gradientmap'), { to: S().gradTo, fg: S().fg, bg: S().bg, reverse: S().gradReverse ? 1 : 0 })); App.toast('Gradient map added — it recolours everything below by brightness'); }, { cls: 'sm', title: 'Recolour the picture below with this gradient (adjustment layer)' })),
      h('div.nd-hint', 'Pick a gradient, then drag on the canvas with the Gradient tool (G).'));
    body.append(list, opts);
    root.appendChild(C.section('gradients', 'Gradients', body));
    render();
    App.on('colour', render); App.on('gradients', render);
    App.on('state', () => { if (list.querySelector('.active') && S().gradTo !== (list.querySelector('.active') || {}).title) render(); });
  };
  ND.GradientPanel = GP;

  /* ================= Retouch ================= */
  const RP = {};
  // source pixels for a retouch action: the active paint layer, or everything visible
  const sourceCanvas = () => { const d = App.doc; return d.active && d.active.isPixel ? U.clone(d.active.canvas) : U.clone(d.getProjection()); };
  function insertGroup(label, groupName, layers) {
    const d = App.doc, G = new ND.Group(groupName);
    d.structural(label, () => {
      const a = d.active, p = (a && d.parentOf(a)) || d.root, i = a ? p.children.indexOf(a) : p.children.length - 1;
      layers.forEach((L) => G.children.push(L));
      p.children.splice(i + 1, 0, G);
      d.active = layers[layers.length - 1];
    });
    d.invalidateAll();
  }
  // the Low / High layers of the frequency separation you're working on (or the latest one)
  function fsLayers() {
    const d = App.doc, a = d.active, has = (g) => g && g.isGroup && g.children.some((c) => c.fsRole);
    let g = a && a.fsRole ? d.parentOf(a) : has(a) ? a : null;
    if (!has(g)) g = d.allNodes().reverse().find(has);
    if (!g) return null;
    return { low: g.children.find((c) => c.fsRole === 'low'), high: g.children.find((c) => c.fsRole === 'high') };
  }
  /* Set up the right layer, tool, brush and colour for one half of a frequency separation:
   *   low  — soft round brush, 20% opacity, picks up the colour under it at the start of each stroke
   *   high — spot healing brush working on the High layer's own texture */
  App.fsWork = function (which, quiet) {
    const d = App.doc, F = fsLayers(), L = F && F[which];
    if (!L) { App.toast('Run Frequency separation first'); return false; }
    d.setActive(L); d.setEditMask(false);
    const size = Math.round(U.clamp(Math.min(d.width, d.height) * 0.04, 8, 300));
    if (which === 'low') {
      const p = ND.Presets.LIST.find((q) => q.name === 'Soft Brush');
      if (p) App.loadPreset(p);
      App.setTool('brush');
      if (S().eraserMode) App.setEraser(false, true);
      App.setBrush({ size, opacity: 0.2, flow: 1, softness: 0.9 });
      L.pickEachStroke = true;
      // start with the typical colour of the picture (of the selection, if there is one)
      const c = averageColour(L.canvas, d.selectionMask);
      if (c) App.setColour(U.rgbToHex(c.r, c.g, c.b), 'fg');
      if (!quiet) App.toast('Low layer selected: soft brush at 20% that picks up the colour under it at each stroke — paint over uneven tones and blotches', 6000);
    } else {
      App.set('healMerged', false);
      App.set('healSize', size);
      App.setTool('heal');
      if (!quiet) App.toast('High layer selected with the spot healing brush — paint over spots and blemishes to fix the texture', 6000);
    }
    App.emit('brush');
    return true;
  };
  // average colour of a canvas (inside the selection if given), from a small copy
  function averageColour(src, sel) {
    const w = 64, h = Math.max(1, Math.round((64 * src.height) / src.width)), c = U.canvas(w, h), x = U.ctx(c);
    x.drawImage(src, 0, 0, w, h);
    if (sel) { x.globalCompositeOperation = 'destination-in'; x.drawImage(sel, 0, 0, w, h); }
    const p = x.getImageData(0, 0, w, h).data;
    let R = 0, G = 0, B = 0, A = 0;
    for (let i = 0; i < p.length; i += 4) { const a = p[i + 3]; R += p[i] * a; G += p[i + 1] * a; B += p[i + 2] * a; A += a; }
    return A > 0 ? { r: R / A, g: G / A, b: B / A } : null;
  }
  // Frequency separation: Low = colour & tone (blurred), High = texture (detail). Low + High in Linear Light = the original.
  App.frequencySeparation = function (radius) {
    const d = App.doc;
    radius = Math.max(1, Math.round(radius || S().fsRadius || 6));
    const { low, high } = ND.Retouch.split(sourceCanvas(), radius);
    const L = new ND.Layer('Low (colour & tone)', d.width, d.height), H2 = new ND.Layer('High (texture)', d.width, d.height);
    U.ctx(L.canvas).drawImage(low, 0, 0); U.ctx(H2.canvas).drawImage(high, 0, 0);
    H2.blendMode = 'linearlight';
    L.fsRole = 'low'; H2.fsRole = 'high';
    L.pickEachStroke = true; // painting on Low always starts with the colour under the brush
    insertGroup('Frequency Separation', 'Frequency separation (' + radius + ' px)', [L, H2]);
    // ready to work: the Low layer with a soft, low-opacity brush that picks up the right colour
    App.fsWork('low', true);
    App.toast('Frequency separation ready: the Low layer is selected with a soft brush that picks up the colour under it at each stroke — paint over uneven tones. For texture, click “Texture (High)” in the Retouch panel.', 8000);
  };
  App.highPassSharpen = function (radius) {
    const d = App.doc;
    radius = Math.max(1, Math.round(radius || 3));
    const hp = ND.Retouch.highPass(sourceCanvas(), radius);
    const L = d.addLayerFromCanvas('High-pass sharpen', hp, 0, 0);
    L.blendMode = 'overlay'; L.opacity = 0.7; d.invalidateAll(); d.emit('layers');
    App.toast('High-pass sharpen layer added (Overlay, 70%) — lower its opacity or paint its mask to sharpen only some parts');
  };
  App.dodgeBurnLayer = function () {
    const d = App.doc, c = U.canvas(d.width, d.height), x = U.ctx(c);
    x.fillStyle = '#808080'; x.fillRect(0, 0, d.width, d.height);
    const L = d.addLayerFromCanvas('Dodge & burn', c, 0, 0);
    L.blendMode = 'overlay'; d.invalidateAll(); d.emit('layers');
    App.setTool('brush');
    App.toast('Dodge & burn layer: paint white to lighten and black to darken, with a soft brush at low opacity (5–15%)', 6000);
  };
  // quick skin smoothing: frequency separation with the Low layer blurred a little more
  App.smoothSkin = function () {
    App.frequencySeparation(S().fsRadius || 6);
    const d = App.doc, g = d.parentOf(d.active), L = g && g.children[0];
    if (L) { const b = ND.Retouch.blurClamped(L.canvas, Math.max(2, Math.round((S().fsRadius || 6) * 1.5))); const x = U.ctx(L.canvas); x.clearRect(0, 0, d.width, d.height); x.drawImage(b, 0, 0); L.rev++; d.invalidateAll(); }
    App.toast('Skin smoothed — add a black mask to the group and paint white over the skin to keep eyes, hair and edges sharp', 7000);
  };
  RP.build = function (root) {
    const tool = (id, label) => { const t = App.TOOLS.find((q) => q.id === id); const b = C.iconButton(t ? t.icon : id, (t ? t.label : label), () => App.setTool(id), 'tool'); b.classList.add('nd-retool'); b.dataset.tool = id; return b; };
    const tools = h('div.nd-retools', ...['heal', 'patch', 'clone', 'redeye', 'airemove', 'camove', 'dodge', 'burn', 'smudge', 'liquify'].map((id) => tool(id)));
    const sync = () => tools.querySelectorAll('.nd-retool').forEach((b) => b.classList.toggle('active', b.dataset.tool === S().tool));
    App.on('tool', sync); sync();
    const body = h('div.nd-col', tools,
      h('div.nd-mini-title', 'Actions'),
      C.slider('Separation radius', { min: 1, max: 40, step: 1, get: () => S().fsRadius || 6, set: (v) => App.set('fsRadius', Math.round(v)), unit: 'px', title: 'Detail smaller than this goes to the High (texture) layer' }),
      h('div.nd-row.tight',
        C.button('Frequency separation', () => App.frequencySeparation(), { cls: 'sm primary', title: 'Split into a Low (colour & tone) and a High (texture) layer' }),
        C.button('Smooth skin', () => App.smoothSkin(), { cls: 'sm', title: 'Frequency separation with smoothed colour & tone' })),
      h('div.nd-row.tight',
        C.button('Colour & tone (Low)', () => App.fsWork('low'), { cls: 'sm', title: 'Select the Low layer with a soft brush that picks up the colour under it at each stroke' }),
        C.button('Texture (High)', () => App.fsWork('high'), { cls: 'sm', title: 'Select the High layer with the spot healing brush (it uses only that layer’s texture)' })),
      h('div.nd-row.tight',
        C.button('Dodge & burn layer', () => App.dodgeBurnLayer(), { cls: 'sm', title: 'A 50% grey Overlay layer to lighten and darken by painting' }),
        C.button('High-pass sharpen', () => App.highPassSharpen(3), { cls: 'sm', title: 'A detail layer in Overlay that sharpens without halos' })),
      h('div.nd-row.tight',
        C.button('Remove background (AI)', () => App.aiRemoveBackground(), { cls: 'sm' }),
        C.button('Content-aware fill', () => App.healSelection(null), { cls: 'sm', title: 'Fill the selection from its surroundings' })));
    root.appendChild(C.section('retouch', 'Retouch', body));
  };
  ND.RetouchPanel = RP;
})();
