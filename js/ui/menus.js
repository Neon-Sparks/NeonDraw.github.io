/* Neon Sparks Draw — menu bar. */
'use strict';
(function () {
  const U = ND.U, h = U.h, App = ND.App;
  const M = {};
  const doc = () => App.doc;
  const D = () => ND.Dialogs;
  const needSel = (fn) => () => { if (!doc().selectionMask) return App.toast('Make a selection first'); fn(); };
  const selOp = (label, fn) => needSel(async () => { const v = await D().number(label, 'Pixels', 5, 1, 500, 'px'); if (v) { const m = fn(doc(), v); if (m) doc().changeSelection(label, m); } });

  // File ▸ recent files (only where the browser can reopen files by itself)
  const recentItems = () => {
    const list = ND.Files.recentList();
    if (!list.length) return [];
    return [{ head: 'Open recent' }, ...list.map((r) => ({ label: r.name, run: () => ND.Files.openRecent(r) })), { label: 'Clear recent files', run: () => ND.Files.clearRecent() }, { sep: true }];
  };
  M.menus = () => ({
    File: () => [
      { label: 'New…', key: 'Ctrl+N', run: () => D().newDoc() },
      { label: 'Open…', key: 'Ctrl+O', run: () => ND.Files.open() },
      { label: 'Close document', key: 'Ctrl+Alt+W', run: () => App.closeDoc() },
      { label: 'Place image as smart object…', run: () => App.placeSmart() },
      { label: 'Next document', key: 'Alt+PgDn', run: () => App.cycleDoc(1) },
      { label: 'Previous document', key: 'Alt+PgUp', run: () => App.cycleDoc(-1) },
      ...recentItems(),
      { label: 'Import image as layer…', key: 'Ctrl+Shift+O', run: () => document.getElementById('nd-import').click() },
      { sep: true },
      { label: ND.Files.supported ? 'Save' : 'Save project (download .ndraw)', key: 'Ctrl+S', run: () => ND.Files.save() },
      ...(ND.Files.supported ? [
        { label: 'Save as…', key: 'Ctrl+Alt+S', run: () => ND.Files.saveAs() },
        { label: 'Download a copy (.ndraw)', run: () => App.saveProject() },
      ] : []),
      { sep: true },
      { label: 'Export PNG', key: 'Ctrl+Shift+S', run: () => App.exportImage('png') },
      { label: 'Export JPEG', run: () => App.exportImage('jpeg', 0.92) },
      { label: 'Export WebP', run: () => App.exportImage('webp', 0.92) },
      { label: 'Export layered PSD', run: () => App.exportPSD() },
      { label: 'Export OpenRaster (.ora — Krita/GIMP)', run: () => App.exportORA() },
      { label: 'Export Krita (.kra)', run: () => App.exportKRA() },
      { label: 'Export TIFF', run: () => App.exportTIFF(false) },
      { label: 'Export CMYK TIFF (for print)', run: () => App.exportTIFF(true) },
      { label: 'Export PDF…', run: () => D().pdf() },
      { label: 'Export active layer as PNG', run: () => App.exportLayerPNG() },
      { label: 'Export selection as PNG', run: () => App.exportSelectionPNG() },
      { label: 'Export animation (GIF / video / PNG frames)…', run: () => ND.Timeline.exportDialog() },
      { sep: true },
      { label: 'Save autosave now', run: async () => { await App.autosaveNow(true); App.toast('Saved to browser storage'); } },
      { label: 'Clear autosave', run: async () => { await ND.Store.clearAutosave(); App.toast('Autosave cleared'); } },
    ],
    Edit: [
      { label: 'Undo', key: 'Ctrl+Z', run: () => doc().history.undo() },
      { label: 'Redo', key: 'Ctrl+Shift+Z', run: () => doc().history.redo() },
      { sep: true },
      { label: 'Cut', key: 'Ctrl+X', run: () => App.cut() },
      { label: 'Copy', key: 'Ctrl+C', run: () => App.copy(false) },
      { label: 'Copy merged', key: 'Ctrl+Shift+C', run: () => App.copy(true) },
      { label: 'Paste as new layer', key: 'Ctrl+V', run: () => App.paste(false) },
      { label: 'Paste in place', key: 'Ctrl+Shift+V', run: () => App.paste(true) },
      { sep: true },
      { label: 'Clear', key: 'Delete', run: () => App.clearSelectionArea('Clear') },
      { label: 'Fill with foreground', key: 'Alt+Backspace', run: () => App.fillSelection('fg') },
      { label: 'Fill with background', key: 'Ctrl+Backspace', run: () => App.fillSelection('bg') },
      { label: 'Fill with pattern', run: () => App.fillSelection('pattern') },
      { label: 'Content-aware fill', key: 'Shift+Backspace', run: () => App.healSelection(null) },
      { label: 'Stroke selection…', run: needSel(async () => { const v = await D().number('Stroke selection', 'Width', 4, 1, 200, 'px'); if (v) App.strokeSelection(v); }) },
      { sep: true },
      { label: 'Define stamp from selection', run: () => App.stampFromSelection() },
      { label: 'Define pattern from selection', run: () => App.patternFromSelection(false) },
      { label: 'Define colourable pattern from selection', run: () => App.patternFromSelection(true) },
    ],
    Image: [
      { label: 'Scale image…', run: () => D().scaleImage() },
      { label: 'Enlarge with AI (2× / 4×)…', run: () => App.aiUpscale() },
      { label: 'Extend canvas with AI…', run: () => App.aiExtendDialog() },
      { label: 'Mode: 8 bits per channel', check: () => (doc().depth || 8) === 8, run: () => { const m = ND.Deep.convert(doc(), 8); App.toast(m || 'Converted to 8 bits per channel'); App.emit('tabs'); } },
      { label: 'Mode: 16 bits per channel', check: () => doc().depth === 16, run: () => { const m = ND.Deep.convert(doc(), 16); App.toast(m || 'Converted to 16 bits per channel — smoother tones from now on (existing pixels keep their 8-bit values)', 5000); App.emit('tabs'); } },
      { label: 'Canvas size…', run: () => D().canvasSize() },
      { label: 'Crop to selection', run: () => App.cropToSelection() },
      { label: 'Trim transparent edges', run: () => App.trim() },
      { sep: true },
      { label: 'Flip horizontal', run: () => App.flipRotateImage('flipH') },
      { label: 'Flip vertical', run: () => App.flipRotateImage('flipV') },
      { label: 'Rotate 90° clockwise', run: () => App.flipRotateImage('rot90') },
      { label: 'Rotate 90° anticlockwise', run: () => App.flipRotateImage('rot270') },
      { label: 'Rotate 180°', run: () => App.flipRotateImage('rot180') },
      { sep: true },
      { head: 'Adjustment layers (editable)' },
      ...ND.Adjust.KINDS.map((k) => ({ label: k.label + (k.fill ? ' fill' : ''), run: () => App.addAdjustment(k.id) })),
      { sep: true },
      { label: 'Paper & texture…', run: () => D().paper() },
      { label: 'Set background colour from BG', run: () => { doc().backgroundColor = App.state.bg; App.toast('Eraser on the background layer now paints ' + App.state.bg); } },
      { label: 'Flatten image', run: () => doc().flattenImage() },
    ],
    Layer: [
      { label: 'New layer', key: 'Ctrl+Shift+N', run: () => doc().addLayer() },
      { label: 'New group', run: () => doc().addGroup() },
      { label: 'Duplicate layer', run: () => doc().duplicateLayer() },
      { label: 'Layer via copy', key: 'Ctrl+J', run: () => (doc().selectionMask ? App.layerViaCopy(false) : doc().duplicateLayer()) },
      { label: 'Layer via cut', key: 'Ctrl+Shift+J', run: () => App.layerViaCopy(true) },
      { label: 'Delete layer', run: () => doc().deleteLayer() },
      { sep: true },
      { label: 'Merge down', key: 'Ctrl+E', run: () => { if (doc().mergeDown() === false) App.toast('Nothing to merge into'); } },
      { label: 'Merge visible', key: 'Ctrl+Shift+E', run: () => doc().mergeVisible() },
      { label: 'Group layer', key: 'Ctrl+G', run: () => doc().groupActive() },
      { label: 'Ungroup', key: 'Ctrl+Shift+G', run: () => doc().ungroupActive() },
      { sep: true },
      { label: 'Convert to smart object', run: () => App.convertToSmart() },
      { label: 'Edit smart object contents', run: () => App.editSmart() },
      { label: 'Rasterize smart object', run: () => App.rasterizeSmart() },
      { label: 'Remove selection with AI', run: () => App.aiRemoveSelection() },
      { label: 'Colourise line art (lazy brush)…', run: () => App.startColourise() },
      { label: 'Vector shape from path', run: () => App.pathToShape() },
      { sep: true },
      { label: 'Remove background with AI…', run: () => App.aiRemoveBackground() },
      { label: 'Remove background (quick, no AI)', run: () => App.removeBackground() },
      { label: 'AI mask: hide the background…', run: () => App.aiMask(false) },
      { label: 'AI mask: hide the subject…', run: () => App.aiMask(true) },
      { label: 'Refine & clean edges (layer mask)', run: () => App.cleanEdges() },
      { label: 'Add layer mask', run: () => App.addMaskSmart() },
      { label: 'Add mask (hide all)', run: () => doc().addMask(false, true) },
      { label: 'Edit mask / layer', key: '\\', run: () => doc().setEditMask(!doc().editMask) },
      { label: 'Invert mask', run: () => doc().invertMask() },
      { label: 'Apply mask', run: () => { if (!doc().applyMask()) App.toast('Select a paint layer with a mask'); } },
      { label: 'Delete mask', run: () => doc().deleteMask() },
      { label: 'Mask to selection', run: () => doc().selectionFromMask() },
      { label: 'Layer style…', run: () => ND.AdjustPanel.layerStyle(doc().active) },
      { label: 'Clear layer style', run: () => doc().setProps(doc().active, { effects: null }, 'Clear Layer Style') },
      { sep: true },
      { label: 'Toggle clipping mask', key: 'Ctrl+Alt+G', run: () => { const n = doc().active; doc().setProps(n, { clip: !n.clip }, 'Clipping Mask'); } },
      { label: 'Toggle alpha lock', run: () => { const n = doc().active; doc().setProps(n, { alphaLock: !n.alphaLock }, 'Alpha Lock'); } },
      { label: 'Toggle lock', run: () => { const n = doc().active; doc().setProps(n, { locked: !n.locked }, 'Lock Layer'); } },
      { sep: true },
      { label: 'Move layer up', key: 'Ctrl+]', run: () => doc().moveActive(1) },
      { label: 'Move layer down', key: 'Ctrl+[', run: () => doc().moveActive(-1) },
      { label: 'Flip layer horizontal', run: () => App.flipLayer('flipH') },
      { label: 'Flip layer vertical', run: () => App.flipLayer('flipV') },
      { label: 'Clear layer', run: () => { const d = doc(), s = d.selectionMask; d.selectionMask = null; App.clearSelectionArea('Clear Layer'); d.selectionMask = s; } },
    ],
    Select: [
      { label: 'Select all', key: 'Ctrl+A', run: () => { const d = doc(), b = d.selectionMask; d.selectAll(); const a = d.selectionMask; d.history.push({ label: 'Select All', undo: () => d.setSelection(b), redo: () => d.setSelection(a) }); } },
      { label: 'Deselect', key: 'Ctrl+D', run: () => doc().changeSelection('Deselect', null) },
      { label: 'Reselect', key: 'Ctrl+Shift+D', run: () => { if (App.lastSelection) doc().changeSelection('Reselect', App.lastSelection); } },
      { label: 'Invert selection', key: 'Ctrl+Shift+I', run: () => { const d = doc(), b = d.selectionMask; d.invertSelection(); const a = d.selectionMask; d.history.push({ label: 'Invert Selection', undo: () => d.setSelection(b), redo: () => d.setSelection(a) }); } },
      { label: 'Select subject', run: () => App.selectSubject() },
      { label: 'Select subject with AI…', run: () => App.aiSelect(false) },
      { label: 'Select background with AI…', run: () => App.aiSelect(true) },
      { label: 'Select and Mask…', key: 'Ctrl+Alt+R', run: () => ND.SelectMask.open() },
      { label: 'Quick select tool', key: 'A', run: () => App.setTool('smartsel') },
      { label: 'Select opaque (active layer)', run: () => doc().changeSelection('Select Opaque', ND.Sel.opaque(doc(), doc().active)) },
      { sep: true },
      { label: 'Grow…', run: selOp('Grow selection', (d, v) => ND.Sel.grow(d, v)) },
      { label: 'Shrink…', run: selOp('Shrink selection', (d, v) => ND.Sel.shrink(d, v)) },
      { label: 'Border…', run: selOp('Border selection', (d, v) => ND.Sel.border(d, v)) },
      { label: 'Feather…', run: selOp('Feather selection', (d, v) => ND.Sel.feather(d, v)) },
      { label: 'Smooth', run: needSel(() => doc().changeSelection('Smooth Selection', ND.Sel.smooth(doc()))) },
      { sep: true },
      { label: 'Transform selection', key: 'Ctrl+T', run: () => App.setTool('transform') },
      { label: 'Quick mask (paint a selection)', key: 'Q', check: () => !!(doc() && doc().quickMask), run: () => App.toggleQuickMask() },
    ],
    Filter: () => {
      const items = [];
      if (App.lastFilter) items.push({ label: 'Repeat ' + ND.Filters.byId(App.lastFilter.id).label, key: 'Ctrl+F', run: () => App.applyFilter(App.lastFilter.id, App.lastFilter.params) }, { sep: true });
      items.push({ label: 'New filter layer (editable, smart filter)', run: () => App.addFilterLayer(App.lastFilter ? App.lastFilter.id : 'blur', App.lastFilter ? App.lastFilter.params : {}, true) }, { sep: true });
      ND.Filters.CATS.forEach((c) => {
        items.push({ head: c });
        ND.Filters.list.filter((f) => f.cat === c).forEach((f) => items.push({ label: f.label + (f.params.length ? '…' : ''), run: () => D().filter(f.id) }));
      });
      return items;
    },
    View: [
      { label: 'Zoom in', key: 'Ctrl+=', run: () => App.zoomBy(1.25) },
      { label: 'Zoom out', key: 'Ctrl+-', run: () => App.zoomBy(0.8) },
      { label: 'Fit to view', key: '1', run: () => App.fitView() },
      { label: 'Actual pixels (100%)', key: '2', run: () => App.setView({ zoom: 1 }) },
      { sep: true },
      { label: 'Mirror view', key: 'M', check: () => App.state.view.mirror, run: () => App.setView({ mirror: !App.state.view.mirror }) },
      { label: 'Reset rotation', key: '5', run: () => App.setView({ rot: 0 }) },
      { sep: true },
      { label: 'Grid', check: () => App.state.grid, run: () => App.set('grid', !App.state.grid) },
      { label: 'Grid size…', run: async () => { const v = await D().number('Grid size', 'Spacing', App.state.gridSize, 4, 2000, 'px'); if (v) { App.set('gridSize', v); App.set('grid', true); } } },
      { label: 'Pixel grid at high zoom', check: () => App.state.pixelGrid, run: () => App.set('pixelGrid', !App.state.pixelGrid) },
      { label: 'Symmetry guides', check: () => App.state.showSymmetry, run: () => App.set('showSymmetry', !App.state.showSymmetry) },
      { label: 'Rulers', key: 'Ctrl+R', check: () => App.state.rulers, run: () => App.set('rulers', !App.state.rulers) },
      { label: 'Snap to guides & grid', check: () => App.state.snapGuides, run: () => App.set('snapGuides', !App.state.snapGuides) },
      { label: 'Clear guides', run: () => { const d = doc(), b = d.guides; d.guides = []; d.history.push({ label: 'Clear Guides', undo: () => { d.guides = b; }, redo: () => { d.guides = []; } }); ND.View.request(); } },
      { label: '1-point perspective assistant', run: () => ND.Tools2.addPerspective(1) },
      { label: '2-point perspective assistant', run: () => ND.Tools2.addPerspective(2) },
      { label: '3-point perspective assistant', run: () => ND.Tools2.addPerspective(3) },
      { label: 'Edit perspective guides', run: () => { App.set('showAssist', true); App.setTool('assist'); } },
      { label: 'Show perspective guides', check: () => App.state.showAssist && doc().assistants.length > 0, run: () => {
        if (!doc().assistants.length) { ND.Tools2.addPerspective(2); return; } // nothing to show yet: add a 2-point perspective
        App.set('showAssist', !App.state.showAssist);
        if (!App.state.showAssist && App.state.tool === 'assist') App.setTool('brush'); // the edit tool would show them again
        ND.View.request();
        App.toast(App.state.showAssist ? 'Perspective guides shown' : 'Perspective guides hidden (strokes don’t snap while hidden)');
      } },
      { label: 'Snap strokes to perspective', check: () => App.state.snapAssist, run: () => App.set('snapAssist', !App.state.snapAssist) },
      { label: 'Remove perspective guides', run: () => ND.Tools2.clearAssistants() },
      { label: 'Wrap-around mode (seamless tiles)', key: 'Shift+W', check: () => App.state.wrap, run: () => M.toggleWrap() },
      { sep: true },
      { label: 'Reference image…', run: () => ND.Reference.open() },
      { label: 'Right-click opens the pop-up palette', check: () => App.state.rightClick !== 'pick', run: () => { App.set('rightClick', App.state.rightClick === 'pick' ? 'palette' : 'pick'); App.toast(App.state.rightClick === 'pick' ? 'Right-click now picks a colour' : 'Right-click now opens the pop-up palette (Alt+right-click picks a colour)', 3000); } },
      { label: 'Hide panels', key: 'Tab', check: () => App.state.hideUI, run: () => M.toggleUI() },
      { label: 'Animation timeline', check: () => !!App.state.showTimeline, run: () => ND.Timeline.toggle() },
      { head: 'Print colours' },
      { label: 'Print preview (CMYK proof)', key: 'Ctrl+Alt+Y', check: () => !!App.state.proofView, run: () => App.toggleProof('proofView') },
      { label: 'Gamut warning (colours that won’t print)', key: 'Ctrl+Alt+Shift+Y', check: () => !!App.state.gamutWarn, run: () => App.toggleProof('gamutWarn') },
      { label: 'Load printer profile (.icc)…', run: () => App.loadProofProfile() },
      { label: 'Use the built-in press profile', check: () => !ND.Colour.proof, run: () => App.resetProofProfile() },
      { label: 'Predict pen movement (less lag)', check: () => App.state.predictPoints !== false, run: () => App.set('predictPoints', App.state.predictPoints === false) },
      { label: 'Use graphics card for blend modes', check: () => ND.GPU.enabled, run: () => { ND.GPU.enabled = !ND.GPU.enabled; App.doc.invalidateAll(); ND.View.request(); App.toast(ND.GPU.enabled ? (ND.GPU.ok === false ? 'No WebGL2 here — blending stays on the CPU' : 'Special blend modes use the graphics card') : 'Special blend modes use the CPU'); } },
      { head: 'Tool panel' },
      { label: 'Columns: automatic (fit the window)', check: () => !(App.state.toolboxCols >= 1), run: () => { App.set('toolboxCols', 0); ND.Toolbar.layoutToolbox(); } },
      { label: '1 column', check: () => App.state.toolboxCols === 1, run: () => { App.set('toolboxCols', 1); ND.Toolbar.layoutToolbox(); } },
      { label: '2 columns', check: () => App.state.toolboxCols === 2, run: () => { App.set('toolboxCols', 2); ND.Toolbar.layoutToolbox(); } },
      { label: '3 columns', check: () => App.state.toolboxCols === 3, run: () => { App.set('toolboxCols', 3); ND.Toolbar.layoutToolbox(); } },
      { label: 'Docked on the left', check: () => (App.state.toolboxMode || 'left') === 'left', run: () => ND.Toolbar.setToolboxMode('left') },
      { label: 'Docked on the right', check: () => App.state.toolboxMode === 'right', run: () => ND.Toolbar.setToolboxMode('right') },
      { label: 'Floating (drag it by its top bar)', check: () => App.state.toolboxMode === 'float', run: () => ND.Toolbar.setToolboxMode('float') },
      { head: 'Right panels' },
      { label: '1 column', check: () => App.state.dockCols !== 2, run: () => ND.Dock.setCols(1) },
      { label: '2 columns', check: () => App.state.dockCols === 2, run: () => { ND.Dock.setCols(2); if (ND.Dock.colsNow() !== 2) App.toast('Two panel columns need a window at least 1000 px wide', 3000); else App.toast('Drag a panel by its title bar to move it to the other column', 3500); } },
      { label: 'Reset panel arrangement', run: () => ND.Dock.reset() },
      { label: 'Full screen', key: 'F11', run: () => M.fullscreen() },
      { sep: true },
      { head: 'Touch input' },
      { label: 'Touch paints (auto: pans once a pen is used)', check: () => App.state.touchMode === 'auto', run: () => App.set('touchMode', 'auto') },
      { label: 'Touch always paints', check: () => App.state.touchMode === 'paint', run: () => App.set('touchMode', 'paint') },
      { label: 'Touch only pans & zooms', check: () => App.state.touchMode === 'pan', run: () => App.set('touchMode', 'pan') },
    ],
    Options: () => {
      const s = App.state, O = ND.Options, AI = ND.AI, ws = Object.keys(O.workspaces());
      const pick = (label, cur, val, run) => ({ label, check: () => cur() === val, run });
      return [
        { head: 'AI — which model to use' },
        pick('Remove background: ask each time', O.bgModel, 'ask', () => O.setBgModel('ask')),
        ...AI.ORDER.map((id) => pick('Remove background: ' + AI.MODELS[id].name + ' (' + AI.MODELS[id].title + ')', O.bgModel, id, () => O.setBgModel(id))),
        pick('Enlarge: ask each time', () => (s.aiUpscaleAsk !== false ? 'ask' : s.aiUpscaler), 'ask', () => App.set('aiUpscaleAsk', true)),
        ...AI.UPSCALERS.map((id) => pick('Enlarge: ' + AI.MODELS[id].name, () => (s.aiUpscaleAsk !== false ? 'ask' : s.aiUpscaler), id, () => { App.set('aiUpscaler', id); App.set('aiUpscaleAsk', false); })),
        pick('AI remove: ask each time', () => (s.aiInpaintAsk ? 'ask' : s.aiInpaint), 'ask', () => App.set('aiInpaintAsk', true)),
        ...AI.INPAINT.map((id) => pick('AI remove: ' + AI.MODELS[id].name + ' (' + AI.MODELS[id].title + ')', () => (s.aiInpaintAsk ? 'ask' : s.aiInpaint), id, () => { App.set('aiInpaint', id); App.set('aiInpaintAsk', false); })),
        { label: 'AI models manager (download / delete)…', run: () => ND.AIUI.manager() },
        { head: 'Brushes' },
        { label: 'Import brushes (Photoshop .abr, Krita .kpp / .bundle, GIMP .gbr / .gih)…', run: () => App.chooseBrushFiles() },
        ...App.brushSets().map((set) => ({ label: 'Remove brush set: ' + set, run: () => { if (window.confirm('Remove the brush set “' + set + '” and its tips?')) App.deleteBrushSet(set); } })),
        { head: 'Graphics card (GPU)' },
        { label: 'Use the graphics card for adjustment layers (less lag)', check: () => s.gpuAdjust !== false, run: () => { App.set('gpuAdjust', s.gpuAdjust === false); O.applyGPU(); } },
        { label: 'Use the graphics card for layer styles and blurs', check: () => s.gpuFx !== false, run: () => { App.set('gpuFx', s.gpuFx === false); O.applyGPU(); } },
        { label: 'Use the graphics card for special blend modes', check: () => s.gpuBlend !== false, run: () => { App.set('gpuBlend', s.gpuBlend === false); O.applyGPU(); } },
        { label: 'Use the graphics card for AI (WebGPU)', check: () => s.gpuAI !== false, run: () => { App.set('gpuAI', s.gpuAI === false); O.applyGPU(); } },
        { label: 'Graphics card status…', run: () => O.gpuStatus() },
        { head: 'Workspace' },
        { label: 'Lock the tool panel (no accidental dragging)', check: () => !!s.lockToolbox, run: () => { App.set('lockToolbox', !s.lockToolbox); App.emit('locks'); } },
        { label: 'Lock the right-hand panels', check: () => !!s.lockPanels, run: () => { App.set('lockPanels', !s.lockPanels); App.emit('locks'); } },
        { label: 'Save workspace layout…', run: () => O.saveWorkspace() },
        ...ws.map((n) => ({ label: 'Layout: ' + n, run: () => O.loadWorkspace(n) })),
        ws.length ? { label: 'Delete a saved layout…', run: () => O.deleteWorkspace() } : null,
        { label: 'Reset to the default layout', run: () => O.resetLayout() },
        { head: 'Language' },
        ...Object.keys(ND.Lang.NAMES).map((code) => ({ label: ND.Lang.NAMES[code], check: () => (s.lang || 'en') === code, run: () => O.setLanguage(code) })),
        { head: 'Pen' },
        { label: 'Use pen pressure', check: () => s.pressureOn !== false, run: () => App.set('pressureOn', s.pressureOn === false) },
        { label: 'Predict pen movement (less lag)', check: () => s.predictPoints === true, run: () => App.set('predictPoints', !s.predictPoints) },
      ].filter(Boolean);
    },
    Help: [
      { label: 'Shortcuts & tips', key: 'F1', run: () => D().help() },
      { label: 'Command palette…', key: 'Ctrl+K', run: () => ND.Command.open() },
      { label: 'AI models (download & manage)…', run: () => ND.AIUI.manager() },
      { label: 'Install Neon Sparks Draw as an app…', run: () => App.pwa.install() },
      { label: 'About Neon Sparks Draw', run: () => D().about() },
    ],
  });
  M.toggleWrap = function () {
    App.set('wrap', !App.state.wrap);
    doc().wrapAround = App.state.wrap;
    doc().invalidateAll();
    App.toast(App.state.wrap ? 'Wrap-around on — strokes continue across the edges' : 'Wrap-around off');
  };
  M.toggleUI = function () {
    App.set('hideUI', !App.state.hideUI);
    document.body.classList.toggle('nd-hide-ui', App.state.hideUI);
    if (App.state.hideUI) App.toast('Panels hidden — press Tab or the button at the top right to bring them back', 3000);
    setTimeout(() => { if (!App.state.hideUI && ND.Toolbar.layoutToolbox) ND.Toolbar.layoutToolbox(); ND.View.request(); }, 50);
  };
  M.fullscreen = function () { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); };

  // after a language change: new names on the menu bar (menu entries are translated each time they open)
  M.relabel = () => document.querySelectorAll('.nd-menu-btn[data-menu]').forEach((b) => { b.textContent = ND.Lang ? ND.Lang.t(b.dataset.menu) : b.dataset.menu; });
  M.build = function (bar) {
    let open = null;
    const close = () => { if (open) { open.menu.remove(); open.btn.classList.remove('open'); open = null; } };
    const show = (name, btn) => {
      close();
      const def = M.menus()[name], items = typeof def === 'function' ? def() : def;
      const menu = h('div.nd-menu');
      items.forEach((it) => {
        if (it.sep) { menu.appendChild(h('div.nd-menu-sep')); return; }
        if (it.head) { menu.appendChild(h('div.nd-menu-head', ND.Lang ? ND.Lang.t(it.head) : it.head)); return; }
        const chk = it.check ? (it.check() ? '✓' : '') : null;
        const b = h('button.nd-menu-item', { type: 'button' }, h('span.nd-menu-chk', chk == null ? '' : chk), h('span.nd-menu-label', ND.Lang ? ND.Lang.t(it.label) : it.label), it.key ? h('span.nd-shortcut', it.key) : null);
        b.addEventListener('click', (e) => { e.stopPropagation(); close(); if (App.doc || name === 'File' || name === 'Help') { if (ND.Actions) ND.Actions.wrapRun(name, it); else it.run(); } });
        menu.appendChild(b);
      });
      btn.parentNode.appendChild(menu);
      const r = btn.getBoundingClientRect();
      menu.style.left = r.left + 'px';
      menu.style.top = r.bottom + 'px';
      menu.style.maxHeight = window.innerHeight - r.bottom - 12 + 'px';
      btn.classList.add('open');
      open = { menu, btn, name };
    };
    Object.keys(M.menus()).forEach((name) => {
      const btn = h('button.nd-menu-btn', { type: 'button', 'data-menu': name }, ND.Lang ? ND.Lang.t(name) : name);
      btn.addEventListener('click', (e) => { e.stopPropagation(); if (open && open.name === name) close(); else show(name, btn); });
      btn.addEventListener('pointerenter', () => { if (open && open.name !== name) show(name, btn); });
      bar.appendChild(btn);
    });
    document.addEventListener('pointerdown', (e) => { if (open && !open.menu.contains(e.target) && !e.target.classList.contains('nd-menu-btn')) close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { close(); e.stopPropagation(); } }, true);
    M.close = close;
  };

  ND.Menus = M;
})();
