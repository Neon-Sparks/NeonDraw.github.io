/* Neon Draw — bootstrap: builds the UI, wires keyboard shortcuts, drag & drop, paste and autosave. */
'use strict';
(function () {
  const U = ND.U, h = U.h, App = ND.App;

  /* ---------------- reference image window ---------------- */
  ND.Reference = {
    open() {
      const old = document.querySelector('.nd-ref');
      if (old) { old.remove(); }
      const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      const img = h('canvas.nd-ref-img', { width: 1, height: 1, title: 'Click to pick a colour · wheel to zoom · drag to pan' });
      let scale = 1, ox = 0, oy = 0, src = null;
      const view = h('div.nd-ref-view', img);
      const head = h('div.nd-ref-head', h('span', 'Reference'), h('span.grow'), ND.C.button('Open…', () => file.click(), { cls: 'sm' }), ND.C.iconButton('close', 'Close', () => win.remove(), 'tiny'));
      const op = h('input', { type: 'range', min: 20, max: 100, value: 100, title: 'Window opacity' });
      op.addEventListener('input', () => { win.style.opacity = op.value / 100; });
      const win = h('div.nd-ref', head, view, h('div.nd-ref-foot', h('span.nd-hint', 'Click to pick colour'), op), file);
      document.body.appendChild(win);
      const draw = () => {
        if (!src) return;
        img.width = view.clientWidth; img.height = view.clientHeight;
        const x = img.getContext('2d');
        x.fillStyle = '#16171b'; x.fillRect(0, 0, img.width, img.height);
        x.drawImage(src, ox, oy, src.width * scale, src.height * scale);
      };
      const load = async (f) => {
        src = await U.blobToImage(f);
        scale = Math.min(view.clientWidth / src.width, view.clientHeight / src.height);
        ox = (view.clientWidth - src.width * scale) / 2; oy = (view.clientHeight - src.height * scale) / 2;
        draw();
      };
      file.addEventListener('change', () => { if (file.files[0]) load(file.files[0]); });
      view.addEventListener('wheel', (e) => { e.preventDefault(); const r = img.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = e.deltaY < 0 ? 1.15 : 1 / 1.15; ox = mx - (mx - ox) * f; oy = my - (my - oy) * f; scale *= f; draw(); }, { passive: false });
      let drag = null;
      img.addEventListener('pointerdown', (e) => { img.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, ox, oy, moved: false }; });
      img.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; if (drag.moved) { ox = drag.ox + dx; oy = drag.oy + dy; draw(); } });
      img.addEventListener('pointerup', (e) => {
        if (drag && !drag.moved && src) {
          const r = img.getBoundingClientRect(), p = img.getContext('2d').getImageData(Math.floor(e.clientX - r.left), Math.floor(e.clientY - r.top), 1, 1).data;
          App.setColour(U.rgbToHex(p[0], p[1], p[2]), e.altKey ? 'bg' : 'fg');
          App.pushRecent(App.state.fg);
        }
        drag = null;
      });
      // drag the window by its header; resize from the corner (CSS resize)
      head.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        const sx = e.clientX, sy = e.clientY, r = win.getBoundingClientRect();
        const mv = (ev) => { win.style.left = r.left + ev.clientX - sx + 'px'; win.style.top = r.top + ev.clientY - sy + 'px'; win.style.right = 'auto'; };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
      new ResizeObserver(draw).observe(view);
      file.click();
    },
  };

  /* ---------------- keyboard ---------------- */
  function typing(e) { const t = e.target && e.target.tagName; return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || (e.target && e.target.isContentEditable); }
  function onKey(e) {
    if (ND.Dialogs.isOpen() || typing(e)) return;
    const d = App.doc;
    if (!d) return;
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey, V = ND.View, M = ND.Menus;
    const run = (fn) => { e.preventDefault(); fn(); };
    if (ctrl) {
      if (k === 'z' && !e.shiftKey) return run(() => { if (!V.cancelPending()) d.history.undo(); });
      if ((k === 'z' && e.shiftKey) || k === 'y') return run(() => d.history.redo());
      if (k === 'a') return run(() => M.menus().Select[0].run());
      if (k === 'd' && !e.shiftKey) return run(() => d.changeSelection('Deselect', null));
      if (k === 'd' && e.shiftKey) return run(() => M.menus().Select[2].run());
      if (k === 'i' && e.shiftKey) return run(() => M.menus().Select[3].run());
      if (k === 's' && e.shiftKey) return run(() => App.exportImage('png'));
      if (k === 's') return run(() => App.saveProject());
      if (k === 'o' && e.shiftKey) return run(() => document.getElementById('nd-import').click());
      if (k === 'o') return run(() => document.getElementById('nd-open').click());
      if (k === 'n' && e.shiftKey) return run(() => d.addLayer());
      if (k === 'n') return run(() => ND.Dialogs.newDoc());
      if (k === 'c') return run(() => App.copy(e.shiftKey));
      if (k === 'x') return run(() => App.cut());
      // Ctrl+V is handled by the paste event so images from other apps work everywhere
      if (k === 'v' && e.shiftKey) return run(() => App.paste(true));
      if (k === 'j') return run(() => (e.shiftKey ? App.layerViaCopy(true) : d.selectionMask ? App.layerViaCopy(false) : d.duplicateLayer()));
      if (k === 'e' && e.shiftKey) return run(() => d.mergeVisible());
      if (k === 'e') return run(() => { if (d.mergeDown() === false) App.toast('Nothing to merge into'); });
      if (k === 'g' && e.altKey) return run(() => d.setProps(d.active, { clip: !d.active.clip }, 'Clipping Mask'));
      if (k === 'g' && e.shiftKey) return run(() => d.ungroupActive());
      if (k === 'g') return run(() => d.groupActive());
      if (k === 't') return run(() => App.setTool('transform'));
      if (k === 'r') return run(() => App.set('rulers', !App.state.rulers));
      if (k === 'f' && App.lastFilter) return run(() => App.applyFilter(App.lastFilter.id, App.lastFilter.params));
      if (k === ']') return run(() => d.moveActive(1));
      if (k === '[') return run(() => d.moveActive(-1));
      if (k === '=' || k === '+') return run(() => App.zoomBy(1.25));
      if (k === '-') return run(() => App.zoomBy(0.8));
      if (k === '0') return run(() => App.fitView());
      if (k === '1') return run(() => App.setView({ zoom: 1 }));
      if (k === 'backspace') return run(() => App.fillSelection('bg'));
      return;
    }
    if (e.altKey && k === 'backspace') return run(() => App.fillSelection('fg'));
    if (e.altKey) return;
    if (k === 'enter') {
      if (V.text && (e.ctrlKey || e.metaKey)) return run(() => V.commitText());
      if (V.commitPending()) return e.preventDefault();
      return;
    }
    if (k === 'escape') {
      if (V.cancelPending()) return e.preventDefault();
      if (d.selectionMask) d.changeSelection('Deselect', null);
      return;
    }
    if (k === 'backspace' && V.poly) { V.poly.pts.pop(); V.request(); return e.preventDefault(); }
    if (k === 'backspace' && e.shiftKey) return run(() => App.healSelection(null));
    if (k === 'delete' || k === 'backspace') return run(() => App.clearSelectionArea('Clear'));
    if (k === 'q' && !e.shiftKey) return run(() => App.toggleQuickMask());
    if (k === '\\') return run(() => { if (d.active.mask) d.setEditMask(!d.editMask); });
    if (k === 'tab') return run(() => M.toggleUI());
    if (k === 'f1') return run(() => ND.Dialogs.help());
    if (k === 'f11') return run(() => M.fullscreen());
    if (k.startsWith('arrow') && App.state.tool === 'move') return run(() => nudge(k, e.shiftKey ? 10 : 1));
    if (k === '[' || k === ']') {
      const up = k === ']';
      if (e.shiftKey) return run(() => App.setBrush({ softness: U.clamp(App.state.brush.softness + (up ? 0.1 : -0.1), 0, 1) }));
      if (App.state.tool === 'stamp') return run(() => App.set('stampSize', U.clamp(App.state.stampSize * (up ? 1.15 : 0.87), 8, 2000)));
      return run(() => App.setBrush({ size: U.clamp(App.state.brush.size * (up ? 1.15 : 0.87), 1, 1000) }));
    }
    if (k === 'x') return run(() => App.swapColours());
    if (k === 'd') return run(() => App.resetColours());
    if (k === 'm') return run(() => App.setView({ mirror: !App.state.view.mirror }));
    if (k === '1') return run(() => App.fitView());
    if (k === '2') return run(() => App.setView({ zoom: 1 }));
    if (k === '3') return run(() => App.setView({ zoom: 2 }));
    if (k === '4') return run(() => App.setView({ rot: App.state.view.rot - Math.PI / 12 }));
    if (k === '6') return run(() => App.setView({ rot: App.state.view.rot + Math.PI / 12 }));
    if (k === '5') return run(() => App.setView({ rot: 0, mirror: false }));
    if (k === 'i') return run(() => App.setTool('eyedropper'));
    if (k === 'w' && e.shiftKey) return run(() => M.toggleWrap());
    if (k === 'l' && e.shiftKey) return run(() => App.setTool('sel-poly'));
    const t = App.TOOLS.find((q) => q.key && q.key.length === 1 && q.key.toLowerCase() === k);
    if (t && !e.shiftKey) return run(() => App.setTool(t.id));
  }
  function nudge(k, n) {
    const d = App.doc;
    if (!d.active.isGroup && !d.active.isPixel) return App.toast('Select a paint layer to nudge');
    const dx = k === 'arrowleft' ? -n : k === 'arrowright' ? n : 0, dy = k === 'arrowup' ? -n : k === 'arrowdown' ? n : 0;
    const layers = d.active.isGroup ? d.allLayers().filter((L) => d.isInside(L, d.active)) : [d.active];
    layers.forEach((L) => {
      const before = U.ctx(L.canvas).getImageData(0, 0, d.width, d.height), c = U.clone(L.canvas), x = U.ctx(L.canvas);
      x.clearRect(0, 0, d.width, d.height); x.drawImage(c, dx, dy);
      d.recordRegion(L, before, { x: 0, y: 0, w: d.width, h: d.height }, 'Nudge');
    });
    d.invalidateAll();
  }

  /* ---------------- text editor overlay ---------------- */
  function buildTextEditor(vp) {
    const ta = h('textarea.nd-text-input', { placeholder: 'Type your text…  (Ctrl+Enter places it)', rows: 3 });
    const box = h('div.nd-text-editor', h('div.nd-mini-title', 'Text'), ta, h('div.nd-row.tight', ND.C.button('Place', () => ND.View.commitText(), { cls: 'primary sm' }), ND.C.button('Cancel', () => ND.View.cancelText(), { cls: 'sm' }), h('span.nd-hint', 'Drag the text on the canvas to move it')));
    vp.appendChild(box);
    ta.addEventListener('input', () => { if (ND.View.text) { ND.View.text.text = ta.value; ND.View.request(); } });
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ND.View.commitText(); }
      if (e.key === 'Escape') { e.preventDefault(); ND.View.cancelText(); }
    });
    App.on('textstart', (txt) => { box.classList.add('show'); ta.value = typeof txt === 'string' ? txt : ''; setTimeout(() => { ta.focus(); ta.select(); }, 20); });
    App.on('textend', () => box.classList.remove('show'));
  }

  /* ---------------- dock resizing ---------------- */
  function dockResizer(handle, dock) {
    handle.addEventListener('pointerdown', (e) => {
      handle.setPointerCapture(e.pointerId);
      const sx = e.clientX, w0 = dock.offsetWidth;
      const mv = (ev) => { const w = U.clamp(w0 - (ev.clientX - sx), 240, 560); dock.style.width = w + 'px'; App.state.dockWidth = w; ND.View.request(); };
      const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); App.savePrefsSoon(); };
      handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up);
    });
  }

  /* ---------------- installable app (PWA) ---------------- */
  // Offline caching and installing only work over http(s); from file:// the app simply runs as a page.
  const PWA = { prompt: null, waiting: null };
  App.pwa = PWA;
  PWA.standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  PWA.install = async function () {
    if (PWA.standalone()) return App.toast('Neon Draw is already running as an installed app');
    if (PWA.prompt) {
      PWA.prompt.prompt();
      const r = await PWA.prompt.userChoice;
      PWA.prompt = null; PWA.refresh();
      if (r.outcome === 'accepted') App.toast('Installing Neon Draw…');
      return;
    }
    ND.Dialogs.installHelp(location.protocol === 'file:' || !!window.ND_SINGLE_FILE);
  };
  PWA.update = async function () {
    if (!PWA.waiting) return;
    await App.autosaveNow(true);
    PWA.waiting.postMessage('skipWaiting');
  };
  function setupPWA() {
    const right = document.querySelector('.nd-menubar-right');
    const inst = U.h('button.nd-pill.nd-install', { type: 'button', title: 'Install Neon Draw as an app — opens in its own window and works offline' }, ND.icon('download', 15), U.h('span', 'Install app'));
    const upd = U.h('button.nd-pill.nd-update', { type: 'button', title: 'A new version of Neon Draw is ready — your work is saved first' }, ND.icon('refresh', 15), U.h('span', 'Update ready'));
    inst.addEventListener('click', () => PWA.install());
    upd.addEventListener('click', () => PWA.update());
    right.insertBefore(upd, right.firstChild); right.insertBefore(inst, right.firstChild);
    PWA.refresh = () => { inst.hidden = !PWA.prompt || PWA.standalone(); upd.hidden = !PWA.waiting; };
    PWA.refresh();
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); PWA.prompt = e; PWA.refresh(); });
    window.addEventListener('appinstalled', () => { PWA.prompt = null; PWA.refresh(); App.toast('Neon Draw installed — find it in your Start menu / apps'); });
    if (PWA.standalone()) document.body.classList.add('nd-standalone');
    // files opened with the installed app ("Open with → Neon Draw")
    if ('launchQueue' in window) {
      window.launchQueue.setConsumer(async (params) => {
        for (const h of (params.files || [])) { try { App.openFile(await h.getFile()); } catch (e) { App.toast('Could not open that file'); } }
      });
    }
    if (window.ND_SINGLE_FILE || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const watch = (w) => {
        if (!w) return;
        const check = () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { PWA.waiting = w; PWA.refresh(); App.toast('A new version of Neon Draw is ready — click “Update ready” to switch', 5000); } };
        check(); w.addEventListener('statechange', check);
      };
      watch(reg.waiting);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch((e) => console.warn('offline mode unavailable', e));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (PWA.waiting && !reloading) { reloading = true; location.reload(); } });
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    App.loadPrefs();
    await App.loadUserData();
    const $ = (id) => document.getElementById(id);
    ND.Menus.build($('nd-menus'));
    ND.Toolbar.buildToolbox($('nd-toolbox'));
    ND.Toolbar.buildOptions($('nd-options'));
    const dock = $('nd-dock');
    dock.style.width = (App.state.dockWidth || 300) + 'px';
    dockResizer($('nd-dock-resize'), dock);
    ND.ColourPanel.build($('nd-dock-scroll'));
    ND.BrushPanel.build($('nd-dock-scroll'));
    ND.AdjustPanel.build($('nd-dock-scroll'));
    App.on('adjust', () => { const el = document.querySelector('.nd-props'); if (el && el.parentNode) { const sec = el.closest('.nd-section'); if (sec) { sec.classList.remove('collapsed'); App.state.collapsed.properties = false; sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } });
    ND.LayersPanel.build($('nd-dock-layers'));
    const vp = $('nd-viewport');
    ND.View.init(vp);
    buildTextEditor(vp);
    ND.Tools2.buildBar(vp);
    ND.Toolbar.buildStatus($('nd-status'));
    setupPWA();

    // undo / redo buttons and document name
    const undo = $('nd-undo'), redo = $('nd-redo'), docName = $('nd-docname');
    undo.appendChild(ND.icon('undo', 18)); redo.appendChild(ND.icon('redo', 18));
    undo.addEventListener('click', () => App.doc && App.doc.history.undo());
    redo.addEventListener('click', () => App.doc && App.doc.history.redo());
    docName.addEventListener('click', () => { const n = window.prompt('Document name', App.doc.name); if (n) { App.doc.name = n; refreshTop(); } });
    const refreshTop = () => {
      const d = App.doc; if (!d) return;
      undo.disabled = !d.history.canUndo; redo.disabled = !d.history.canRedo;
      undo.title = d.history.canUndo ? 'Undo ' + d.history.stack[d.history.pos - 1].label + ' (Ctrl+Z)' : 'Nothing to undo';
      redo.title = d.history.canRedo ? 'Redo ' + d.history.stack[d.history.pos].label + ' (Ctrl+Shift+Z)' : 'Nothing to redo';
      docName.textContent = d.name + ' — ' + d.width + '×' + d.height;
      document.title = d.name + ' — Neon Draw';
    };
    App.on('doc', refreshTop); App.on('docchange', refreshTop);
    App.on('doc', (t) => { if (t === 'selection' && App.doc.selectionMask) App.lastSelection = App.doc.selectionMask; });

    App.on('pickstamp', () => ND.Dialogs.stampPicker());
    // file inputs
    const open = $('nd-open'), imp = $('nd-import');
    open.addEventListener('change', () => { if (open.files[0]) App.openFile(open.files[0]); open.value = ''; });
    imp.addEventListener('change', () => { Array.from(imp.files).forEach((f) => App.importLayer(f)); imp.value = ''; });

    window.addEventListener('keydown', onKey);
    // paste images from other apps / screenshots
    window.addEventListener('paste', (e) => {
      if (typing(e) || ND.Dialogs.isOpen() || !App.doc) return;
      const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
      const it = items.find((i) => i.type.startsWith('image/'));
      e.preventDefault();
      if (it) {
        const f = it.getAsFile();
        U.blobToImage(f).then((im) => {
          const c = U.canvas(im.width, im.height); U.ctx(c).drawImage(im, 0, 0);
          if (App.clip && App.clip.canvas.width === c.width && App.clip.canvas.height === c.height) App.pasteCanvas(App.clip.canvas);
          else App.pasteCanvas(c);
        });
      } else if (App.clip) App.pasteCanvas(App.clip.canvas);
      else App.toast('Clipboard has no image');
    });
    // drag & drop files
    document.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); document.body.classList.add('nd-dropping'); } });
    document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('nd-dropping'); });
    document.addEventListener('drop', (e) => {
      document.body.classList.remove('nd-dropping');
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (!files.length) return;
      e.preventDefault();
      files.forEach((f, i) => {
        const n = f.name.toLowerCase();
        if (n.endsWith('.ndraw') || n.endsWith('.ora') || n.endsWith('.psd') || n.endsWith('.psb') || n.endsWith('.pigment') || !App.doc || (i === 0 && e.shiftKey)) App.openFile(f);
        else App.importLayer(f);
      });
    });

    // restore the last session or start fresh
    const saved = await ND.Store.loadAutosave();
    let restored = false;
    if (saved) {
      try { const doc = await ND.Store.restore(saved); App.setDoc(doc); App.unsaved = false; restored = true; ND.Dialogs.recovered(doc); } catch (e) { console.warn('autosave unreadable', e); }
    }
    if (!restored) { App.newDocument(1920, 1080, '#ffffff', 'Untitled'); ND.Dialogs.newDoc(); }
    App.emit('tool'); App.emit('brush'); App.emit('colour');
    setInterval(() => App.autosaveNow(), 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') App.autosaveNow(); });
    window.addEventListener('resize', () => ND.View.request());
    document.body.classList.remove('nd-loading');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
