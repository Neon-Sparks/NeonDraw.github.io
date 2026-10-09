/* Neon Draw — application core: state, events, commands, files, clipboard, shortcuts. */
'use strict';
(function () {
  const U = ND.U;

  const TOOLS = [
    { id: 'brush', label: 'Brush', key: 'B', icon: 'brush', group: 'Paint' },
    { id: 'eraser', label: 'Eraser (toggle with E)', key: 'E', icon: 'eraser', group: 'Paint' },
    { id: 'line', label: 'Line / curve', key: 'V', icon: 'line', group: 'Paint' },
    { id: 'rect', label: 'Rectangle', key: 'U', icon: 'rect', group: 'Paint' },
    { id: 'ellipse', label: 'Ellipse', key: 'O', icon: 'ellipse', group: 'Paint' },
    { id: 'polygon', label: 'Polygon / star', key: 'N', icon: 'polygon', group: 'Paint' },
    { id: 'fill', label: 'Fill', key: 'F', icon: 'fill', group: 'Paint' },
    { id: 'gradient', label: 'Gradient', key: 'G', icon: 'gradient', group: 'Paint' },
    { id: 'text', label: 'Text', key: 'Y', icon: 'text', group: 'Paint' },
    { id: 'stamp', label: 'Stamp', key: 'S', icon: 'stamp', group: 'Paint' },
    { id: 'smudge', label: 'Smudge', key: '', icon: 'smudge', group: 'Paint', engine: 'smudge' },
    { id: 'dodge', label: 'Dodge (lighten)', key: '', icon: 'dodge', group: 'Paint', engine: 'dodge' },
    { id: 'burn', label: 'Burn (darken)', key: '', icon: 'burn', group: 'Paint', engine: 'burn' },
    { id: 'clone', label: 'Clone stamp (Ctrl+click sets source)', key: '', icon: 'clone', group: 'Paint', engine: 'clone' },
    { id: 'heal', label: 'Spot healing brush', key: 'J', icon: 'heal', group: 'Retouch' },
    { id: 'patch', label: 'Patch (drag a selection onto good texture)', key: '', icon: 'patch', group: 'Retouch' },
    { id: 'redeye', label: 'Red-eye removal', key: '', icon: 'redeye', group: 'Retouch' },
    { id: 'liquify', label: 'Liquify (push, bloat, pinch, twirl)', key: '', icon: 'liquify', group: 'Retouch' },
    { id: 'sel-rect', label: 'Rectangular select', key: 'R', icon: 'sel-rect', group: 'Select' },
    { id: 'sel-ellipse', label: 'Elliptical select', key: '', icon: 'sel-ellipse', group: 'Select' },
    { id: 'sel-lasso', label: 'Freehand select', key: 'L', icon: 'sel-lasso', group: 'Select' },
    { id: 'sel-poly', label: 'Polygon select', key: 'Shift+L', icon: 'sel-poly', group: 'Select' },
    { id: 'sel-wand', label: 'Magic wand / select by colour', key: 'W', icon: 'sel-wand', group: 'Select' },
    { id: 'smartsel', label: 'Quick select — paint over an object (Alt subtracts)', key: 'A', icon: 'smartsel', group: 'Select' },
    { id: 'move', label: 'Move layer (arrow keys nudge)', key: 'T', icon: 'move', group: 'Edit' },
    { id: 'transform', label: 'Transform (free / warp / distort)', key: 'K', icon: 'transform', group: 'Edit' },
    { id: 'crop', label: 'Crop', key: 'C', icon: 'crop', group: 'Edit' },
    { id: 'eyedropper', label: 'Colour sampler', key: 'P', icon: 'eyedropper', group: 'Edit' },
    { id: 'assist', label: 'Perspective & ruler assistants', key: '', icon: 'assist', group: 'Edit' },
    { id: 'pan', label: 'Pan (or hold Space)', key: 'H', icon: 'pan', group: 'View' },
    { id: 'zoom', label: 'Zoom (drag to scrub)', key: 'Z', icon: 'zoom', group: 'View' },
  ];
  const SELECT_TOOLS = ['sel-rect', 'sel-ellipse', 'sel-lasso', 'sel-poly', 'sel-wand'];
  const BRUSH_TOOLS = ['brush', 'eraser', 'smudge', 'dodge', 'burn', 'clone'];

  const DEFAULT_STATE = () => ({
    tool: 'brush',
    brush: Object.assign({}, ND.Brush.DEFAULTS),
    brushName: 'Hard Round',
    eraserMode: false,
    eraserSize: 40,
    toolSettings: {}, // per retouch tool brush settings
    fg: '#3fa7ff', bg: '#ffffff',
    recent: [],
    view: { zoom: 1, rot: 0, mirror: false, panX: 0, panY: 0 },
    selMode: 'replace', selAntialias: true, selFeather: 0,
    wandTolerance: 32, wandContiguous: true, wandMerged: true,
    fillTolerance: 32, fillContiguous: true, fillMerged: false, fillWith: 'fg', fillPattern: 'Dots', fillExpand: 1, fillPatternScale: 1, fillGap: 0,
    healSize: 40, healMerged: false, redeyeSize: 30,
    liqMode: 'push', liqSize: 120, liqStrength: 0.6,
    assistType: 'vp', snapAssist: true, showAssist: true, snapGuides: true, rulers: false, smartSize: 30,
    gradType: 'linear', gradTo: 'bg', gradRepeat: 'none', gradDither: true, gradReverse: false, gradOpacity: 1,
    shapeFill: true, shapeStroke: false, shapeWidth: 6, shapeRadius: 0, polySides: 5, polyStar: true, polyInner: 0.45, shapeUseBrush: false,
    lineUseBrush: true,
    stamp: 'Star', stampSize: 120, stampRot: 0, stampRandom: 0.3, stampMode: 'original', stampOpacity: 1, stampPaint: false, stampSpacing: 1.2,
    text: { font: 'sans-serif', size: 64, bold: false, italic: false, align: 'left', lineHeight: 1.2, spacing: 0, warp: 'none', amount: 0, outline: 0, outlineColour: '#000000', shadow: false, newLayer: true },
    pickMerged: true, pickAverage: 1,
    cropRatio: 'free',
    grid: false, gridSize: 64, pixelGrid: true, wrap: false, showSymmetry: true, hideUI: false,
    dockWidth: 300, collapsed: {},
    touchMode: 'auto',
    rightClick: 'palette', favBrushes: null, recentCommands: [], smartAI: false, aiModel: null, aiRemember: false, aiClean: true, toolboxMode: 'left', toolboxCols: 0, toolboxPos: null,
  });

  const App = {
    doc: null,
    state: DEFAULT_STATE(),
    listeners: {},
    customPresets: [],
    on(evt, fn) { (this.listeners[evt] || (this.listeners[evt] = [])).push(fn); return fn; },
    off(evt, fn) { const l = this.listeners[evt]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
    emit(evt, data) { (this.listeners[evt] || []).slice().forEach((f) => { try { f(data); } catch (e) { console.error(e); } }); },
    set(key, val) { this.state[key] = val; this.emit('state', key); this.savePrefsSoon(); },
    TOOLS, SELECT_TOOLS, BRUSH_TOOLS,
    isBrushTool: (t) => BRUSH_TOOLS.includes(t),
  };

  /* ---------------- toasts ---------------- */
  App.toast = function (msg, ms) {
    const el = document.getElementById('nd-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(App._toastT);
    App._toastT = setTimeout(() => el.classList.remove('show'), ms || 1600);
  };

  /* ---------------- brush & colours ---------------- */
  App.setBrush = function (patch, silent) {
    Object.assign(this.state.brush, patch);
    if (this.state.eraserMode && patch.size != null) this.state.eraserSize = patch.size;
    if (!silent) this.emit('brush');
    this.savePrefsSoon();
  };
  App.loadPreset = function (p) {
    const base = Object.assign({}, ND.Brush.DEFAULTS, { symmetry: this.state.brush.symmetry, symCount: this.state.brush.symCount });
    this.state.brush = ND.Brush.normalise(Object.assign(base, p.settings));
    this.state.brushName = p.name;
    const eng = this.state.brush.engine;
    // presets for retouch engines switch to the matching tool
    const toolFor = { smudge: 'smudge', dodge: 'dodge', burn: 'burn', clone: 'clone' }[eng];
    if (toolFor) this.setTool(toolFor);
    else if (eng === 'eraser' || p.settings.erase) { this.setTool('brush'); this.setEraser(true, true); }
    else { if (!this.isBrushTool(this.state.tool) || ['smudge', 'dodge', 'burn', 'clone'].includes(this.state.tool)) this.setTool('brush'); this.setEraser(false, true); }
    this.emit('brush');
    this.savePrefsSoon();
  };
  App.setEraser = function (on, keepSize) {
    const s = this.state;
    if (s.eraserMode === on) return;
    if (!keepSize) {
      if (on) { s.brushSize = s.brush.size; s.brush.size = s.eraserSize || s.brush.size; }
      else { s.eraserSize = s.brush.size; if (s.brushSize) s.brush.size = s.brushSize; }
    }
    s.eraserMode = on;
    this.emit('brush');
    this.emit('tool');
  };
  App.setColour = function (hex, which) {
    hex = U.normHex(hex);
    if (which === 'bg') this.state.bg = hex; else this.state.fg = hex;
    this.emit('colour');
    this.savePrefsSoon();
  };
  App.pushRecent = function (hex) {
    const r = this.state.recent.filter((c) => c !== hex);
    r.unshift(hex);
    this.state.recent = r.slice(0, 18);
    this.emit('recent');
    this.savePrefsSoon();
  };
  App.swapColours = function () { const s = this.state; const t = s.fg; s.fg = s.bg; s.bg = t; this.emit('colour'); };
  App.resetColours = function () { this.state.fg = '#000000'; this.state.bg = '#ffffff'; this.emit('colour'); };

  /* ---------------- tools ---------------- */
  App.setTool = function (id) {
    const s = this.state;
    if (id === 'eraser') { if (s.tool !== 'brush') this.setTool('brush'); this.setEraser(!s.eraserMode); return; }
    if (s.tool === id) { if (id === 'stamp') this.emit('pickstamp'); return; }
    this.emit('beforetool', id);
    const prev = s.tool;
    // retouch tools keep their own brush settings
    const T = TOOLS.find((t) => t.id === id);
    const prevT = TOOLS.find((t) => t.id === prev);
    if (prevT && prevT.engine) s.toolSettings[prev] = Object.assign({}, s.brush);
    else if (this.isBrushTool(prev)) s.toolSettings.brush = Object.assign({}, s.brush);
    if (T && T.engine) {
      const saved = s.toolSettings[id];
      const preset = ND.Presets.LIST.find((p) => p.settings.engine === T.engine);
      s.brush = ND.Brush.normalise(saved || (preset ? preset.settings : { engine: T.engine }));
      s.eraserMode = false;
    } else if (id === 'brush' && prevT && prevT.engine && s.toolSettings.brush) {
      s.brush = ND.Brush.normalise(s.toolSettings.brush);
    }
    s.tool = id;
    this.emit('tool');
    this.emit('brush');
    this.savePrefsSoon();
  };

  /* ---------------- documents ---------------- */
  App.setDoc = function (doc) {
    if (this.docUnsub) this.docUnsub();
    this.doc = doc;
    this.docUnsub = doc.on((type) => this.emit('doc', type));
    doc.wrapAround = this.state.wrap;
    this.emit('docchange');
    this.fitView();
    this.emit('doc', 'layers');
  };
  App.newDocument = function (w, h, bg, name, paper, paperBackground) {
    const d = new ND.Doc(w, h, bg);
    d.name = name || 'Untitled';
    if (!bg) d.root.children[0].name = 'Layer 1';
    d.paper = paper ? ND.Paper.normalise(paper) : null;
    if (d.paper && paperBackground) {
      // the background layer is the paper itself; paint goes on a layer above it
      const L = d.root.children[0];
      L.name = 'Paper';
      d.backgroundColor = d.paper.tint;
      U.ctx(L.canvas).drawImage(ND.Paper.render(d.paper, w, h), 0, 0);
      d.invalidateAll();
      const top = d.addLayer('Layer 1');
      d.history.stack.length = 0; d.history.pos = 0;
      d.active = top;
    }
    this.setDoc(d);
    this.toast('New document ' + w + ' × ' + h);
  };
  // Change the document's paper (undoable); optionally repaint the bottom layer with it.
  App.setPaper = function (pp, repaint) {
    const d = this.doc, before = d.paper, after = pp ? ND.Paper.normalise(Object.assign({}, pp)) : null;
    const L = d.root.children[0];
    if (repaint && L && L.isPixel) {
      const r = { x: 0, y: 0, w: d.width, h: d.height }, old = U.ctx(L.canvas).getImageData(0, 0, d.width, d.height);
      const x = U.ctx(L.canvas);
      x.clearRect(0, 0, d.width, d.height);
      if (after) x.drawImage(ND.Paper.render(after, d.width, d.height), 0, 0); else { x.fillStyle = '#ffffff'; x.fillRect(0, 0, d.width, d.height); }
      d.recordRegion(L, old, r, 'Paper');
      const bgBefore = d.backgroundColor;
      d.backgroundColor = after ? after.tint : '#ffffff';
      const top = d.history.stack[d.history.pos - 1], u = top.undo, rd = top.redo;
      top.undo = () => { u(); d.paper = before; d.backgroundColor = bgBefore; };
      top.redo = () => { rd(); d.paper = after; d.backgroundColor = after ? after.tint : '#ffffff'; };
      d.paper = after;
      d.invalidateAll();
    } else {
      d.paper = after;
      d.history.push({ label: 'Paper', undo: () => { d.paper = before; }, redo: () => { d.paper = after; } });
    }
    App.emit('paper');
    this.toast(after ? 'Paper: ' + ND.Paper.type(after.type).label + ' — brushes now respond to its texture' : 'Paper removed — brushes paint as on a smooth surface', 3000);
  };
  App.fitView = function () {
    const el = document.getElementById('nd-viewport');
    if (!el || !this.doc) return;
    const z = Math.min((el.clientWidth - 60) / this.doc.width, (el.clientHeight - 60) / this.doc.height, 1);
    this.setView({ zoom: Math.max(0.02, z), panX: 0, panY: 0, rot: 0 });
  };
  App.setView = function (patch) { Object.assign(this.state.view, patch); this.emit('view'); };
  App.zoomBy = function (f, sx, sy) { this.emit('zoomat', { f, sx, sy }); };

  /* ---------------- files ---------------- */
  App.openFile = async function (file, handle) {
    try {
      const n = file.name.toLowerCase();
      if (n.endsWith('.psd') || n.endsWith('.psb')) {
        this.toast('Reading Photoshop file…', 8000);
        const doc = await ND.PSD.importPSD(await file.arrayBuffer(), file.name);
        this.setDoc(doc);
        this.toast('Photoshop file opened · ' + doc.allLayers().length + ' layers' + (doc.importNote ? ' · ' + doc.importNote : ''), doc.importNote ? 5000 : 2000);
      } else if (n.endsWith('.ndraw') || n.endsWith('.pigment') || file.type === 'application/json') {
        this.setDoc(await ND.Store.deserialize(await file.text()));
        this.toast('Project opened');
      } else if (n.endsWith('.ora')) {
        this.setDoc(await ND.Store.importORA(await file.arrayBuffer(), file.name));
        this.toast('OpenRaster file opened');
      } else {
        const im = await U.blobToImage(file);
        const d = new ND.Doc(im.width, im.height, null);
        d.root.children[0].name = 'Background';
        U.ctx(d.root.children[0].canvas).drawImage(im, 0, 0);
        d.name = file.name.replace(/\.[^.]+$/, '');
        d.invalidateAll();
        this.setDoc(d);
        this.toast('Image opened');
      }
      // remember where it came from so Ctrl+S can save back (projects) and it shows under Open recent
      this.doc.fileHandle = handle || null;
      if (handle && ND.Files) ND.Files.addRecent(handle);
      this.markSaved();
    } catch (e) { console.error(e); this.toast('Could not open ' + file.name + ': ' + e.message, 3500); }
  };
  // "dirty" = changed since the last save to a file (autosave to the browser is separate)
  App.markSaved = function () { this.dirty = false; this.emit('saved'); };
  App.on('doc', (t) => { if (t === 'history' && !App.dirty) { App.dirty = true; App.emit('saved'); } });
  App.on('docchange', () => { App.dirty = false; App.emit('saved'); });
  App.importLayer = async function (file) {
    if (!this.doc) return;
    try {
      const im = await U.blobToImage(file);
      const c = U.canvas(im.width, im.height);
      U.ctx(c).drawImage(im, 0, 0);
      this.placeCanvasAsLayer(c, file.name.replace(/\.[^.]+$/, ''));
    } catch (e) { this.toast('Could not import: ' + e.message, 3000); }
  };
  // Add an image as a new layer centred in the document, then enter transform so it can be sized.
  App.placeCanvasAsLayer = function (c, name, x, y, transform) {
    const d = this.doc;
    let s = 1;
    if (c.width > d.width || c.height > d.height) s = Math.min(d.width / c.width, d.height / c.height);
    const w = c.width * s, h = c.height * s;
    const px = x != null ? x : (d.width - w) / 2, py = y != null ? y : (d.height - h) / 2;
    const tmp = U.canvas(d.width, d.height);
    U.ctx(tmp).drawImage(c, px, py, w, h);
    d.addLayerFromCanvas(name || 'Pasted', tmp, 0, 0);
    if (transform !== false) this.setTool('transform');
    this.toast('Added “' + (name || 'Pasted') + '”' + (s < 1 ? ' (scaled to fit)' : ''));
  };
  App.saveProject = async function () {
    const d = this.doc;
    this.toast('Saving…', 10000);
    const data = await ND.Store.serializeAsync(d);
    U.download(U.safeName(d.name) + '.ndraw', new Blob([data], { type: 'application/json' }));
    this.markSaved();
    this.toast('Project downloaded as ' + U.safeName(d.name) + '.ndraw');
  };
  App.exportImage = async function (fmt, quality) {
    const d = this.doc;
    let c = d.flatCopy();
    if (fmt === 'jpeg') { const j = U.canvas(c.width, c.height), x = U.ctx(j); x.fillStyle = d.backgroundColor || '#ffffff'; x.fillRect(0, 0, j.width, j.height); x.drawImage(c, 0, 0); c = j; }
    const blob = await U.canvasToBlob(c, 'image/' + fmt, quality || 0.92);
    if (!blob) { this.toast('This browser cannot export ' + fmt.toUpperCase()); return; }
    U.download(U.safeName(d.name) + '.' + (fmt === 'jpeg' ? 'jpg' : fmt), blob);
    this.toast('Exported ' + fmt.toUpperCase());
  };
  const liveNote = ' — adjustment layers can\'t be stored in this format (the merged preview includes them). Use Layer ▸ Merge visible first to keep their look.';
  App.exportORA = async function () { U.download(U.safeName(this.doc.name) + '.ora', await ND.Store.exportORA(this.doc)); this.toast('Exported OpenRaster (.ora)' + (ND.Store.hasLiveOnly(this.doc) ? liveNote : ''), ND.Store.hasLiveOnly(this.doc) ? 6000 : 1600); };
  App.exportPSD = function () { U.download(U.safeName(this.doc.name) + '.psd', ND.Store.exportPSD(this.doc)); this.toast('Exported layered PSD' + (ND.Store.hasLiveOnly(this.doc) ? liveNote : ''), ND.Store.hasLiveOnly(this.doc) ? 6000 : 1600); };
  App.exportLayerPNG = async function () {
    const n = this.doc.active;
    const c = this.doc.renderNode(n);
    U.download(U.safeName(n.name) + '.png', await U.canvasToBlob(c));
    this.toast('Exported layer “' + n.name + '”');
  };
  App.exportSelectionPNG = async function () {
    const c = this.selectionCanvas(true);
    if (!c) return this.toast('Make a selection first');
    U.download(U.safeName(this.doc.name) + '-selection.png', await U.canvasToBlob(c.canvas));
  };

  /* ---------------- clipboard ---------------- */
  // Pixels of the selection (from the active layer or merged), cropped to its bounds.
  App.selectionCanvas = function (merged) {
    const d = this.doc;
    const src = d.sampleCanvas(merged);
    let rect = { x: 0, y: 0, w: d.width, h: d.height };
    let full = U.clone(src);
    if (d.selectionMask) {
      const bb = ND.Sel.bbox(d.selectionMask, 1);
      if (!bb) return null;
      rect = bb;
      const x = U.ctx(full);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(d.selectionMask, 0, 0);
    } else {
      const bb = ND.Sel.contentBBox(full);
      if (bb) rect = bb;
    }
    const c = U.canvas(rect.w, rect.h);
    U.ctx(c).drawImage(full, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    return { canvas: c, x: rect.x, y: rect.y };
  };
  App.copy = async function (merged) {
    const sc = this.selectionCanvas(merged);
    if (!sc) return this.toast('Nothing to copy');
    this.clip = sc;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const blob = await U.canvasToBlob(sc.canvas);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      }
    } catch (e) { /* system clipboard is optional (needs https or localhost) */ }
    this.toast(merged ? 'Copied merged' : 'Copied');
  };
  App.cut = async function () {
    if (!this.doc.canPaint()) return this.blocked();
    await this.copy(false);
    this.clearSelectionArea('Cut');
  };
  App.pasteCanvas = function (c, x, y) {
    this.placeCanvasAsLayer(c, 'Pasted', x, y, true);
  };
  App.paste = async function (inPlace) {
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const t = it.types.find((q) => q.startsWith('image/'));
          if (t) {
            const blob = await it.getType(t);
            const im = await U.blobToImage(blob);
            const c = U.canvas(im.width, im.height);
            U.ctx(c).drawImage(im, 0, 0);
            // prefer the internal copy (keeps position) when it is the same image
            if (this.clip && this.clip.canvas.width === c.width && this.clip.canvas.height === c.height) break;
            return this.pasteCanvas(c);
          }
        }
      } catch (e) { /* permission denied → use internal clipboard */ }
    }
    if (this.clip) return this.pasteCanvas(this.clip.canvas, inPlace ? this.clip.x : null, inPlace ? this.clip.y : null);
    this.toast('Clipboard is empty');
  };
  App.clearSelectionArea = function (label) {
    const d = this.doc;
    if (!d.canPaint()) return this.blocked();
    const S = d.surface();
    if (S && S.kind === 'pixels' && d.isBackgroundLayer(d.active)) {
      d.paintOnActive(label || 'Clear', (x) => { x.fillStyle = this.doc.backgroundColor; x.fillRect(0, 0, d.width, d.height); });
    } else {
      d.paintOnActive(label || 'Clear', (x) => { x.fillStyle = '#000'; x.fillRect(0, 0, d.width, d.height); }, { mode: 'erase' });
    }
  };
  App.fillSelection = function (what) {
    const d = this.doc;
    if (!d.canPaint()) return this.blocked();
    d.paintOnActive(what === 'pattern' ? 'Fill Pattern' : 'Fill', (x) => {
      if (what === 'pattern') {
        const t = ND.Patterns.tileColoured(this.state.fillPattern, this.state.fg);
        const pat = x.createPattern(t, 'repeat');
        if (pat.setTransform && this.state.fillPatternScale !== 1) pat.setTransform(new DOMMatrix().scale(this.state.fillPatternScale));
        x.fillStyle = pat;
      } else x.fillStyle = what === 'bg' ? this.state.bg : this.state.fg;
      x.fillRect(0, 0, d.width, d.height);
    });
  };
  App.strokeSelection = function (width) {
    const d = this.doc;
    if (!d.selectionMask) return this.toast('Make a selection first');
    if (!d.canPaint()) return this.blocked();
    const sel = d.selectionMask;
    const grown = ND.Sel.grow(d, Math.max(1, Math.round(width / 2)));
    const shrunk = ND.Sel.shrink(d, Math.max(1, Math.round(width / 2)));
    // the stroke straddles the selection edge, so paint without the selection mask
    d.selectionMask = null;
    d.paintOnActive('Stroke Selection', (x) => {
      x.drawImage(grown, 0, 0);
      x.globalCompositeOperation = 'destination-out';
      x.drawImage(shrunk, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = this.state.fg;
      x.fillRect(0, 0, d.width, d.height);
    });
    d.selectionMask = sel;
  };
  App.layerViaCopy = function (cut) {
    const d = this.doc;
    if (!d.active.isPixel) return this.toast('Select a paint layer');
    const sc = this.selectionCanvas(false);
    if (!sc) return this.toast('Nothing selected');
    if (cut) this.clearSelectionArea('Cut');
    const full = U.canvas(d.width, d.height);
    U.ctx(full).drawImage(sc.canvas, sc.x, sc.y);
    d.addLayerFromCanvas(d.active.name + (cut ? ' (cut)' : ' (copy)'), full, 0, 0);
  };

  /* ---------------- filters ---------------- */
  App.blocked = function () { this.toast((this.doc && this.doc.paintBlocker()) || 'Nothing to paint on here'); };
  // Apply a filter to the current surface (layer pixels, or the mask while editing a mask).
  App.applyFilter = function (id, params) {
    const d = this.doc, f = ND.Filters.byId(id), S = d.surface();
    if (!S) return this.blocked();
    const env = { fg: this.state.fg, bg: this.state.bg };
    const out = ND.Filters.run(id, S.canvas, params, env);
    const full = { x: 0, y: 0, w: d.width, h: d.height };
    const before = U.ctx(S.canvas).getImageData(0, 0, d.width, d.height);
    const x = U.ctx(S.canvas);
    if (d.selectionMask) {
      const keep = U.clone(S.canvas), kx = U.ctx(keep);
      kx.globalCompositeOperation = 'destination-out';
      kx.drawImage(d.selectionMask, 0, 0);
      const ox = U.ctx(out);
      ox.globalCompositeOperation = 'destination-in';
      ox.drawImage(d.selectionMask, 0, 0);
      x.clearRect(0, 0, d.width, d.height);
      x.drawImage(keep, 0, 0);
      x.drawImage(out, 0, 0);
    } else {
      x.clearRect(0, 0, d.width, d.height);
      x.drawImage(out, 0, 0);
    }
    if (S.kind === 'pixels' && S.node.alphaLock) d.restoreAlpha(S.canvas, before, full);
    if (S.kind !== 'pixels') ND.DocMask.greyify(S.canvas, full);
    d.invalidateAll();
    d.recordSurface(S, before, full, 'Filter: ' + f.label);
    this.lastFilter = { id, params };
    this.toast(f.label + ' applied');
  };

  /* ---------------- adjustments, retouch, quick mask ---------------- */
  App.addAdjustment = function (kind) {
    const d = this.doc, p = ND.Adjust.defaults(kind);
    if (kind === 'gradientmap' || kind === 'gradientfill') { p.fg = this.state.fg; p.bg = this.state.bg; }
    if (kind === 'solid') p.color = this.state.fg;
    if (kind === 'develop') Object.assign(p, {});
    d.addAdjustment(kind, p);
    this.emit('adjust');
  };
  App.addMaskSmart = function () {
    const d = this.doc;
    if (!d.active) return;
    if (d.active.mask) { d.setEditMask(true); return; }
    d.addMask(!!d.selectionMask);
    this.toast(d.selectionMask ? 'Mask created from the selection' : 'Mask added — paint black to hide, white to reveal (X swaps colours)', 2600);
  };
  App.autoDevelop = function () {
    const d = this.doc, n = d.active;
    if (!n || !n.isAdjust || n.kind !== 'develop') return;
    const vis = n.visible;
    n.visible = false; d.invalidateAll();
    const auto = ND.Adjust.autoDevelop(d.getProjection());
    n.visible = vis;
    d.setProps(n, { params: Object.assign({}, n.params, auto) }, 'Auto Tone');
    this.emit('adjust');
  };
  // Content-aware fill / heal the selection. offset forces the source (patch tool).
  App.healSelection = function (offset, label) {
    const d = this.doc, S = d.surface();
    if (!S || S.kind !== 'pixels') return this.blocked();
    if (!d.selectionMask) return this.toast('Select the area to fill first');
    const bb = ND.Sel.bbox(d.selectionMask, 1);
    if (!bb) return this.toast('The selection is empty');
    const pre = U.clipRect({ x: bb.x - 8, y: bb.y - 8, w: bb.w + 16, h: bb.h + 16 }, d.width, d.height);
    const before = U.ctx(S.canvas).getImageData(pre.x, pre.y, pre.w, pre.h);
    const src = this.state.healMerged ? d.getProjection() : S.canvas;
    const t0 = performance.now();
    const res = ND.Heal.heal(src, S.canvas, d.selectionMask, offset, bb);
    if (!res) return this.toast('Could not find a source area — try a smaller selection');
    d.invalidate(res.rect);
    const r = res.rect, beforeR = new ImageData(r.w, r.h);
    for (let y = 0; y < r.h; y++) beforeR.data.set(before.data.subarray(((r.y - pre.y + y) * pre.w + (r.x - pre.x)) * 4, ((r.y - pre.y + y) * pre.w + (r.x - pre.x) + r.w) * 4), y * r.w * 4);
    d.recordSurface(S, beforeR, r, label || 'Content-Aware Fill');
    this.toast((label || 'Content-aware fill') + ' done' + (performance.now() - t0 > 1500 ? ' (large areas take a moment)' : ''));
  };
  // One click: find the main subject and select it.
  App.selectSubject = function () {
    const d = this.doc;
    this.toast('Finding the subject…', 6000);
    setTimeout(() => {
      const t0 = performance.now(), res = ND.Smart.selectSubject(d.getProjection());
      d.changeSelection('Select Subject', res.mask);
      this.toast('Subject selected (' + Math.round(performance.now() - t0) + ' ms) — refine it with the Quick select tool or Quick mask', 3500);
    }, 30);
  };
  // Remove the background non-destructively: the active layer gets a mask that hides it.
  App.removeBackground = function () {
    const d = this.doc, L = d.active;
    if (!L || !L.isPixel) return this.toast('Select the photo layer first');
    this.toast('Removing the background…', 6000);
    setTimeout(() => {
      d.setProps(L, { mask: ND.Smart.backgroundMask(L.canvas), maskEnabled: true }, 'Remove Background');
      d.editMask = true;
      d.emit('active');
      this.toast('Background hidden with a layer mask — paint white to bring parts back, black to hide more', 4500);
    }, 30);
  };
  // Tidy the edge of a masked paint layer (undoable): re-judge the soft edge from colour (so leftover
  // background pixels drop out) and remove the old background colour from what remains.
  App.cleanEdges = function (quiet) {
    const d = this.doc, L = d.active;
    if (!L || !L.isPixel || !L.mask) return this.toast('Select a paint layer that has a mask');
    const W = d.width, H = d.height, mk = U.ctx(L.mask).getImageData(0, 0, W, H).data;
    // only the area where the mask is partly transparent needs work
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const v = mk[(y * W + x) * 4]; if (v > 3 && v < 252) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < 0) { if (!quiet) this.toast('The mask has no soft edges to clean'); return; }
    const r = U.clipRect({ x: x0 - 24, y: y0 - 24, w: x1 - x0 + 48, h: y1 - y0 + 48 }, W, H);
    const before = U.ctx(L.canvas).getImageData(r.x, r.y, r.w, r.h), px = before.data, alpha = new Float32Array(r.w * r.h);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) alpha[y * r.w + x] = mk[((r.y + y) * W + r.x + x) * 4] / 255;
    // size the edge zone to the mask's own soft edge: soft area ÷ outline length ≈ its width
    let soft = 0, outline = 0;
    for (let i = 0; i < alpha.length; i++) {
      const v = alpha[i];
      if (v > 0.05 && v < 0.95) soft++;
      if (v >= 0.5 && i % r.w < r.w - 1 && i + r.w < alpha.length && (alpha[i + 1] < 0.5 || alpha[i + r.w] < 0.5)) outline++;
    }
    const radius = U.clamp(Math.ceil((soft / Math.max(1, outline)) * 0.6) + 2, 3, 60);
    const res = ND.Refine.run(px, alpha, r.w, r.h, { radius, decontam: true, amount: 1 });
    // updated mask (only inside the worked area)
    const m = U.clone(L.mask), mid = new ImageData(r.w, r.h);
    for (let i = 0; i < r.w * r.h; i++) { const v = res.alpha[i] * 255, j = i * 4; mid.data[j] = mid.data[j + 1] = mid.data[j + 2] = v; mid.data[j + 3] = 255; }
    U.ctx(m).putImageData(mid, r.x, r.y);
    d.setProps(L, { mask: m }, 'Refine Edge');
    const out = new ImageData(r.w, r.h);
    for (let i = 0; i < r.w * r.h; i++) { const j = i * 4; out.data[j] = res.colour[j]; out.data[j + 1] = res.colour[j + 1]; out.data[j + 2] = res.colour[j + 2]; out.data[j + 3] = px[j + 3]; }
    const keep = new ImageData(new Uint8ClampedArray(px), r.w, r.h);
    U.ctx(L.canvas).putImageData(out, r.x, r.y);
    d.recordSurface({ kind: 'pixels', node: L, canvas: L.canvas }, keep, r, 'Clean Edge Colours');
    d.invalidate(r);
    if (!quiet) this.toast('Edge colours cleaned');
  };
  App.toggleQuickMask = function () {
    const d = this.doc;
    if (ND.View.stroke) return;
    if (d.quickMask) { d.exitQuickMask(); this.toast('Quick mask off — painted area is now the selection'); }
    else { d.enterQuickMask(); this.toast('Quick mask: paint white to select, black to deselect · Q to finish', 3000); }
    this.emit('quickmask');
    ND.View.request();
  };

  /* ---------------- image operations ---------------- */
  App.cropTo = function (r, label) {
    const d = this.doc;
    r = U.clipRect(r, d.width, d.height);
    if (!r || r.w < 1 || r.h < 1) return;
    d.resizeAll(r.w, r.h, (x, src) => x.drawImage(src, -r.x, -r.y), label || 'Crop');
    this.fitView();
  };
  App.trim = function () {
    const bb = ND.Sel.contentBBox(this.doc.flatCopy());
    if (!bb) return this.toast('Nothing to trim');
    this.cropTo(bb, 'Trim');
  };
  App.cropToSelection = function () {
    const d = this.doc;
    if (!d.selectionMask) return this.toast('Make a selection first');
    this.cropTo(ND.Sel.bbox(d.selectionMask, 1), 'Crop to Selection');
  };
  App.scaleImage = function (w, h) {
    const d = this.doc;
    d.resizeAll(w, h, (x, src) => { x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h); }, 'Scale Image');
    this.fitView();
  };
  App.canvasSize = function (w, h, ax, ay) {
    const d = this.doc, ox = Math.round((w - d.width) * ax), oy = Math.round((h - d.height) * ay);
    const bgL = d.isBackgroundLayer(d.root.children[0]) ? d.root.children[0] : null, bgc = d.backgroundColor;
    d.resizeAll(w, h, (x, src, l) => { if (l === bgL && bgc) { x.fillStyle = bgc; x.fillRect(0, 0, w, h); } x.drawImage(src, ox, oy); }, 'Canvas Size');
    this.fitView();
  };
  App.flipRotateImage = function (op) {
    const d = this.doc, rot = op === 'rot90' || op === 'rot270', W = rot ? d.height : d.width, H = rot ? d.width : d.height;
    d.resizeAll(W, H, (x, src) => {
      if (op === 'flipH') { x.translate(W, 0); x.scale(-1, 1); }
      else if (op === 'flipV') { x.translate(0, H); x.scale(1, -1); }
      else if (op === 'rot90') { x.translate(W, 0); x.rotate(Math.PI / 2); }
      else if (op === 'rot180') { x.translate(W, H); x.rotate(Math.PI); }
      else { x.translate(0, H); x.rotate(-Math.PI / 2); }
      x.drawImage(src, 0, 0);
    }, op.startsWith('flip') ? 'Flip Image' : 'Rotate Image');
    if (rot) this.fitView();
  };
  App.flipLayer = function (op) {
    const d = this.doc;
    const layers = d.active.isGroup ? d.allLayers().filter((l) => d.isInside(l, d.active)) : d.active.isPixel ? [d.active] : [];
    for (const L of layers) {
      if (d.effectiveLocked(L)) continue;
      const before = U.ctx(L.canvas).getImageData(0, 0, d.width, d.height), copy = U.clone(L.canvas), x = U.ctx(L.canvas);
      x.save(); x.clearRect(0, 0, d.width, d.height);
      if (op === 'flipH') { x.translate(d.width, 0); x.scale(-1, 1); } else { x.translate(0, d.height); x.scale(1, -1); }
      x.drawImage(copy, 0, 0); x.restore();
      d.recordRegion(L, before, { x: 0, y: 0, w: d.width, h: d.height }, 'Flip Layer');
    }
    d.invalidateAll();
  };

  /* ---------------- custom presets / stamps / patterns persistence ---------------- */
  const CP = 'pigment-custom-presets', US = 'neondraw-user-stamps', UP = 'neondraw-user-patterns', UT = 'neondraw-user-tips', UG = 'neondraw-gradients';
  App.loadUserData = async function () {
    this.customPresets = ND.Store.getJSON(CP, []).map((p) => ({ name: p.name, cat: 'My Brushes', settings: ND.Brush.normalise(p.settings), custom: true }));
    for (const s of ND.Store.getJSON(US, [])) {
      try { const im = await U.loadImage(s.png); const c = U.canvas(im.width, im.height); U.ctx(c).drawImage(im, 0, 0); ND.Stamps.addUser(s.name, c); } catch (e) { /* skip */ }
    }
    for (const t of ND.Store.getJSON(UT, [])) {
      try { const im = await U.loadImage(t.png); ND.Tips.addUser(t.id, t.label, im); } catch (e) { /* skip */ }
    }
    ND.Render.customGradients = ND.Store.getJSON(UG, {});
    for (const s of ND.Store.getJSON(UP, [])) {
      try { const im = await U.loadImage(s.png); const c = U.canvas(im.width, im.height); U.ctx(c).drawImage(im, 0, 0); ND.Patterns.addCustomTile(s.name, c, !!s.mono); } catch (e) { /* skip */ }
    }
  };
  App.saveCustomPresets = function () {
    ND.Store.setJSON(CP, this.customPresets.map((p) => ({ name: p.name, settings: p.settings })));
    this.emit('presets');
  };
  App.saveBrushPreset = function (name) {
    if (!name) return;
    this.customPresets = this.customPresets.filter((p) => p.name !== name);
    this.customPresets.push({ name, cat: 'My Brushes', settings: Object.assign({}, this.state.brush), custom: true });
    this.state.brushName = name;
    this.saveCustomPresets();
    this.toast('Brush preset “' + name + '” saved');
  };
  App.deleteBrushPreset = function (name) {
    this.customPresets = this.customPresets.filter((p) => p.name !== name);
    this.saveCustomPresets();
  };
  App.exportBrushes = function () {
    const data = { app: 'neondraw-brushes', version: 1, presets: this.customPresets.map((p) => ({ name: p.name, settings: p.settings })) };
    U.download('neon-draw-brushes.json', new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  };
  App.importBrushes = async function (file) {
    try {
      const data = JSON.parse(await file.text());
      const list = data.presets || data;
      let n = 0;
      for (const p of list) {
        if (!p || !p.name || !p.settings) continue;
        this.customPresets = this.customPresets.filter((q) => q.name !== p.name);
        this.customPresets.push({ name: p.name, cat: 'My Brushes', settings: ND.Brush.normalise(p.settings), custom: true });
        n++;
      }
      this.saveCustomPresets();
      this.toast('Imported ' + n + ' brush preset' + (n === 1 ? '' : 's'));
    } catch (e) { this.toast('Not a brush file: ' + e.message, 3000); }
  };
  App.saveUserStamps = function () {
    const ok = ND.Store.setJSON(US, ND.Stamps.user.map((s) => ({ name: s.name, png: s.canvas.toDataURL('image/png') })));
    if (!ok) this.toast('Browser storage is full — stamp kept for this session only', 3000);
    this.emit('stamps');
  };
  App.stampFromSelection = function () {
    const sc = this.selectionCanvas(false);
    if (!sc) return this.toast('Select something on the layer first');
    const c = sc.canvas;
    let s = 1;
    if (Math.max(c.width, c.height) > 512) s = 512 / Math.max(c.width, c.height);
    const t = U.canvas(c.width * s, c.height * s);
    U.ctx(t).drawImage(c, 0, 0, t.width, t.height);
    const name = ND.Stamps.addUser('My Stamp', t);
    this.saveUserStamps();
    this.state.stamp = name;
    this.setTool('stamp');
    this.emit('stamps');
    this.toast('Stamp “' + name + '” created');
  };
  App.importStampImage = async function (file) {
    try {
      const im = await U.blobToImage(file);
      let s = Math.min(1, 512 / Math.max(im.width, im.height));
      const c = U.canvas(im.width * s, im.height * s);
      U.ctx(c).drawImage(im, 0, 0, c.width, c.height);
      const name = ND.Stamps.addUser(file.name.replace(/\.[^.]+$/, ''), c);
      this.saveUserStamps();
      this.state.stamp = name;
      this.emit('stamps');
      this.toast('Stamp added');
    } catch (e) { this.toast('Could not import stamp', 2500); }
  };
  App.patternFromSelection = function (mono) {
    const sc = this.selectionCanvas(false);
    if (!sc) return this.toast('Select something on the layer first');
    let c = sc.canvas;
    if (Math.max(c.width, c.height) > 512) { const s = 512 / Math.max(c.width, c.height), t = U.canvas(c.width * s, c.height * s); U.ctx(t).drawImage(c, 0, 0, t.width, t.height); c = t; }
    if (mono) { const t = U.clone(c), x = U.ctx(t); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, t.width, t.height); c = t; }
    const list = ND.Store.getJSON(UP, []);
    let name = 'My Pattern', i = 2;
    while (ND.Patterns.isTile(name)) name = 'My Pattern ' + i++;
    ND.Patterns.addCustomTile(name, c, mono);
    list.push({ name, mono: !!mono, png: c.toDataURL('image/png') });
    if (!ND.Store.setJSON(UP, list)) this.toast('Browser storage is full — pattern kept for this session only', 3000);
    this.state.fillPattern = name;
    this.emit('patterns');
    this.toast('Pattern “' + name + '” defined');
  };

  /* ---------------- custom brush tips & gradients ---------------- */
  App.saveUserTips = function () {
    const ok = ND.Store.setJSON(UT, ND.Tips.userTips().map((t) => ({ id: t.id, label: t.label, png: t.canvas.toDataURL('image/png') })));
    if (!ok) this.toast('Browser storage is full — tip kept for this session only', 3000);
    this.emit('tips');
  };
  App.addTipFromImage = function (img, label) {
    let n = 1;
    while (ND.Tips.list.find((t) => t.id === 'user' + n)) n++;
    ND.Tips.addUser('user' + n, label || 'My tip ' + n, img);
    this.saveUserTips();
    this.setBrush({ tip: 'user' + n });
    this.toast('Brush tip “' + (label || 'My tip ' + n) + '” created — dark areas paint');
  };
  App.tipFromSelection = function () {
    const sc = this.selectionCanvas(false);
    if (!sc) return this.toast('Select something on the layer first');
    // flatten onto white so transparent areas count as "no paint"
    const c = U.canvas(sc.canvas.width, sc.canvas.height), x = U.ctx(c);
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(sc.canvas, 0, 0);
    this.addTipFromImage(c);
  };
  App.importTipImage = async function (file) {
    try { this.addTipFromImage(await U.blobToImage(file), file.name.replace(/\.[^.]+$/, '').slice(0, 20)); } catch (e) { this.toast('Could not read that image'); }
  };
  App.deleteUserTip = function (id) { ND.Tips.removeUser(id); if (this.state.brush.tip === id) this.setBrush({ tip: 'round' }); this.saveUserTips(); };
  App.saveGradient = function (name, stops) {
    ND.Render.customGradients[name] = stops;
    ND.Store.setJSON(UG, ND.Render.customGradients);
    this.emit('gradients');
  };
  App.deleteGradient = function (name) {
    delete ND.Render.customGradients[name];
    ND.Store.setJSON(UG, ND.Render.customGradients);
    if (this.state.gradTo === 'custom:' + name) this.state.gradTo = 'bg';
    this.emit('gradients');
  };
  App.gradientOptions = function () {
    return [['bg', 'FG → BG'], ['transparent', 'FG → Transparent'], ...Object.keys(ND.Render.GRADIENT_PRESETS).map((k) => [k, k[0].toUpperCase() + k.slice(1)]), ...Object.keys(ND.Render.customGradients).map((k) => ['custom:' + k, '★ ' + k])];
  };

  /* ---------------- preferences ---------------- */
  App.savePrefsSoon = U.debounce(() => {
    const s = App.state;
    ND.Store.savePrefs({
      brush: s.brush, brushName: s.brushName, fg: s.fg, bg: s.bg, recent: s.recent, eraserSize: s.eraserSize, toolSettings: s.toolSettings,
      text: s.text, stamp: s.stamp, stampSize: s.stampSize, stampMode: s.stampMode, stampRandom: s.stampRandom,
      fillPattern: s.fillPattern, gradType: s.gradType, gradTo: s.gradTo, dockWidth: s.dockWidth, collapsed: s.collapsed,
      gridSize: s.gridSize, palette: App.palette, palettes: App.userPalettes, shapeFill: s.shapeFill, shapeStroke: s.shapeStroke, shapeWidth: s.shapeWidth,
      lineUseBrush: s.lineUseBrush, touchMode: s.touchMode, healSize: s.healSize, liqSize: s.liqSize, liqStrength: s.liqStrength, liqMode: s.liqMode, fillGap: s.fillGap, rulers: s.rulers,
      rightClick: s.rightClick, favBrushes: s.favBrushes, lastPaper: s.lastPaper, harmony: s.harmony, smartAI: s.smartAI, aiModel: s.aiModel, aiRemember: s.aiRemember, aiClean: s.aiClean, toolboxMode: s.toolboxMode, toolboxCols: s.toolboxCols, toolboxPos: s.toolboxPos, recentCommands: s.recentCommands, maskView: s.maskView, maskParams: s.maskParams,
    });
  }, 600);
  App.loadPrefs = function () {
    const p = ND.Store.prefs(), s = this.state;
    if (p.brush) s.brush = ND.Brush.normalise(p.brush);
    ['brushName', 'fg', 'bg', 'recent', 'eraserSize', 'toolSettings', 'stamp', 'stampSize', 'stampMode', 'stampRandom', 'fillPattern', 'gradType', 'gradTo', 'dockWidth', 'collapsed', 'gridSize', 'shapeFill', 'shapeStroke', 'shapeWidth', 'lineUseBrush', 'touchMode', 'healSize', 'liqSize', 'liqStrength', 'liqMode', 'fillGap', 'rulers', 'rightClick', 'favBrushes', 'lastPaper', 'harmony', 'smartAI', 'aiModel', 'aiRemember', 'aiClean', 'toolboxMode', 'toolboxCols', 'toolboxPos', 'recentCommands', 'maskView', 'maskParams'].forEach((k) => { if (p[k] != null) s[k] = p[k]; });
    if (p.text) Object.assign(s.text, p.text);
    if (p.palette) App.palette = p.palette;
    if (p.palettes) App.userPalettes = p.palettes;
  };

  /* ---------------- autosave ---------------- */
  // Only autosave when something changed, and never two at once.
  App.autosaveNow = async function (force) {
    if (!this.doc || this.saving || (!this.unsaved && !force)) return;
    this.saving = true;
    this.unsaved = false;
    try {
      await ND.Store.autosave(this.doc);
      // remember the file the document belongs to, so Ctrl+S still saves there after a restart
      ND.Store.idbSet('autosave-handle', this.doc.fileHandle || null);
      this.lastAutosave = Date.now(); this.emit('autosaved');
    } catch (e) { this.unsaved = true; } finally { this.saving = false; }
  };
  App.on('doc', (t) => { if (t === 'history' || t === 'layers' || t === 'resize') App.unsaved = true; });
  App.on('docchange', () => { App.unsaved = true; });

  ND.App = App;
})();
