/* Neon Sparks Draw — animation timeline: frames grid, playback, onion skin controls and export (GIF / WebM / PNGs). */
'use strict';
(function () {
  const U = ND.U, h = U.h, App = ND.App, A = ND.Anim;
  const TL = { playing: false };
  let el = null, grid = null, info = null, playBtn = null, timer = 0, cols = [], motion = null, motionOpen = false;
  const doc = () => App.doc;
  const S = () => A.state(doc());

  TL.toggle = function (show) {
    if (show === undefined) show = !App.state.showTimeline;
    App.set('showTimeline', !!show);
    if (!doc() || !document.getElementById('nd-viewport')) return; // opened again once a document exists
    if (show) { build(); A.state(doc()); render(); App.toast('Timeline: paint on a frame, then pick another frame and paint again. Space plays while the timeline has focus · , and . step frames', 5000); }
    if (el) el.style.display = show ? 'flex' : 'none';
    if (!show) TL.stop();
  };
  /* ---------- sound track ---------- */
  let audioEl = null, audioSrc = null;
  const audio = () => { const a = S().audio; if (!a) return null; if (!audioEl || audioSrc !== a.data) { audioEl = new Audio(a.data); audioSrc = a.data; } return audioEl; };
  const syncAudio = () => { const a = audio(); if (!a) return; const s = S(); a.currentTime = Math.max(0, s.frame / s.fps - (s.audio.offset || 0)); if (s.frame / s.fps >= (s.audio.offset || 0)) a.play().catch(() => {}); };
  TL.loadAudio = function () {
    const inp = h('input', { type: 'file', accept: 'audio/*' });
    inp.addEventListener('change', () => {
      const f = inp.files[0]; if (!f) return;
      if (f.size > 25e6) { App.toast('That sound file is over 25 MB — use a shorter or compressed one (MP3, OGG, M4A)'); return; }
      const r = new FileReader();
      r.onload = () => { const s = S(), before = s.audio; s.audio = { name: f.name, data: r.result, offset: 0 }; const after = s.audio; doc().history.push({ label: 'Sound Track', undo: () => { S().audio = before; render(); }, redo: () => { S().audio = after; render(); } }); App.unsaved = true; render(); App.toast('Sound track added — it plays with the animation and goes into video exports'); };
      r.readAsDataURL(f);
    });
    inp.click();
  };
  TL.removeAudio = function () { const s = S(), before = s.audio; if (!before) return; s.audio = null; doc().history.push({ label: 'Remove Sound', undo: () => { S().audio = before; render(); }, redo: () => { S().audio = null; render(); } }); if (audioEl) audioEl.pause(); render(); };
  TL.play = function () {
    if (TL.playing) return TL.stop();
    TL.playing = true;
    if (playBtn) playBtn.classList.add('active');
    syncAudio();
    let last = performance.now();
    const tick = (now) => {
      if (!TL.playing) return;
      const s = S();
      if (now - last >= 1000 / s.fps) {
        last = now;
        if (!s.loop && s.frame >= s.length - 1) { TL.stop(); return; }
        A.goto(doc(), s.frame + 1);
        if (s.frame === 0 && s.audio) syncAudio(); // looped back to the start
        ND.View.request();
      }
      timer = requestAnimationFrame(tick);
    };
    timer = requestAnimationFrame(tick);
  };
  TL.stop = function () { TL.playing = false; cancelAnimationFrame(timer); if (audioEl) audioEl.pause(); if (playBtn) playBtn.classList.remove('active'); ND.View.request(); };
  TL.step = (n) => { A.goto(doc(), S().frame + n); ND.View.request(); };

  /* ---------- panel ---------- */
  function build() {
    if (el) return;
    const C = ND.C, vp = document.getElementById('nd-viewport');
    el = h('div.nd-timeline', { tabIndex: -1 });
    playBtn = C.iconButton('play', 'Play / stop (Space)', () => TL.play(), 'tiny');
    info = h('span.nd-tl-info');
    const num = (label, get, set, min, max, title) => {
      const i = h('input.nd-field.nd-tl-num', { type: 'number', min, max, value: get(), title });
      i.addEventListener('change', () => { set(U.clamp(parseInt(i.value, 10) || min, min, max)); i.value = get(); render(); ND.View.request(); });
      i.refresh = () => { if (document.activeElement !== i) i.value = get(); };
      return h('label.nd-tl-lab', label, i);
    };
    const nums = [
      num('FPS', () => S().fps, (v) => { S().fps = v; }, 1, 60, 'Frames per second'),
      num('Frames', () => S().length, (v) => { S().length = v; if (S().frame >= v) A.goto(doc(), v - 1); }, 1, 2000, 'Length of the animation'),
      num('Before', () => S().onionBefore, (v) => { S().onionBefore = v; }, 0, 5, 'Onion skin: earlier drawings (red)'),
      num('After', () => S().onionAfter, (v) => { S().onionAfter = v; }, 0, 5, 'Onion skin: later drawings (green)'),
    ];
    const onion = C.check('Onion skin', () => S().onion, (v) => { S().onion = v; ND.View.request(); });
    const loop = C.check('Loop', () => S().loop, (v) => { S().loop = v; });
    const auto = C.select('Auto key', [['blank', 'New blank drawing'], ['copy', 'Copy drawing'], ['off', 'Off (edit held)']], () => S().autoKey, (v) => { S().autoKey = v; });
    auto.title = 'What happens when you paint on a frame that has no drawing of its own';
    const bar = h('div.nd-tl-bar',
      C.iconButton('first', 'First frame', () => { A.goto(doc(), 0); ND.View.request(); }, 'tiny'),
      C.iconButton('prev', 'Previous frame (,)', () => TL.step(-1), 'tiny'), playBtn,
      C.iconButton('next', 'Next frame (.)', () => TL.step(1), 'tiny'), info, ...nums.slice(0, 2), loop, onion, ...nums.slice(2), auto,
      C.button('New drawing', () => key('blank'), { cls: 'sm', icon: 'plus', title: 'Blank keyframe on this frame' }),
      C.button('Duplicate', () => key('copy'), { cls: 'sm', title: 'Copy the held drawing to this frame' }),
      C.button('Delete', () => { if (!A.deleteKey(doc(), doc().active)) App.toast('No drawing starts on this frame'); render(); }, { cls: 'sm', icon: 'trash' }),
      C.button('Motion', () => { motionOpen = !motionOpen; render(); }, { cls: 'sm', title: 'Move, scale, rotate or fade the layer between frames (tweening)' }),
      C.button('Sound…', () => TL.loadAudio(), { cls: 'sm', title: 'Add a sound track (plays with the animation, included in video export)' }),
      C.button('Export…', () => TL.exportDialog(), { cls: 'sm primary' }),
      C.iconButton('close', 'Hide the timeline', () => TL.toggle(false), 'tiny'));
    motion = h('div.nd-tl-bar.nd-tl-motion');
    grid = h('div.nd-tl-grid');
    el.append(bar, motion, grid);
    el.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); TL.play(); } });
    el.refreshNums = () => { nums.forEach((n) => n.lastChild.refresh()); [onion, loop, auto].forEach((c) => c.refresh && c.refresh()); };
    vp.appendChild(el);
  }
  function key(mode) {
    const L = doc().active;
    if (!L || !L.isPixel) return App.toast('Pick a paint layer');
    if (!A.addKey(doc(), L, mode)) App.toast('This frame already has its own drawing');
    render(); ND.View.request();
  }
  // one row per animated layer (plus the active layer if it isn't animated yet)
  function render() {
    if (!el || !grid || !doc() || (el.style.display === 'none' && !App.state.showTimeline)) return;
    const d = doc(), s = S();
    U.clear(grid);
    cols = [];
    renderMotion();
    const rows = d.allLayers().slice().reverse().filter((L) => L.frames || L === d.active);
    const head = h('div.nd-tl-row.nd-tl-head', h('div.nd-tl-name', ''));
    for (let f = 0; f < s.length; f++) { const c = h('div.nd-tl-cell.nd-tl-n', f % 5 === 0 || f === s.length - 1 ? String(f + 1) : ''); c.addEventListener('click', () => { A.goto(d, f); ND.View.request(); }); head.appendChild(c); (cols[f] = cols[f] || []).push(c); }
    grid.appendChild(head);
    rows.forEach((L) => {
      const name = h('div.nd-tl-name' + (L === d.active ? '.active' : ''), h('span', L.name));
      if (L.frames) {
        // per-layer onion skin: follow the global setting (active layer only) / always / never
        const mode = (L.onion && L.onion.mode) || 'auto';
        const ob = h('button.nd-tl-onion.' + mode, { type: 'button', title: 'Onion skin for this layer: ' + { auto: 'when it is the active layer', on: 'always', off: 'never' }[mode] + ' (click to change · right-click for settings)' }, mode === 'off' ? '○' : mode === 'on' ? '●' : '◐');
        ob.addEventListener('click', (e) => { e.stopPropagation(); L.onion = Object.assign({}, L.onion, { mode: { auto: 'on', on: 'off', off: 'auto' }[mode] }); App.unsaved = true; render(); ND.View.request(); });
        ob.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); onionDialog(L); });
        name.appendChild(ob);
      }
      if (!L.frames) name.appendChild(ND.C.button('Animate', () => { A.animate(d, L); render(); }, { cls: 'sm', title: 'Make this layer animated (its picture becomes frame ' + (s.frame + 1) + ')' }));
      name.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') { d.setActive(L); } });
      const row = h('div.nd-tl-row', name), keys = A.keys(L);
      for (let f = 0; f < s.length; f++) {
        const isKey = !!(L.frames && L.frames[f]), held = L.frames ? A.keyAt(L, f) !== null : true, mk = !!(L.tween && L.tween.keys[f]);
        const c = h('div.nd-tl-cell' + (isKey ? '.key' : held && L.frames ? '.held' : '') + (!L.frames ? '.still' : ''), { title: 'Frame ' + (f + 1) + (isKey ? ' — drawing (drag to move)' : '') });
        if (isKey && keys.indexOf(f) === keys.length - 1 && f < s.length - 1) c.classList.add('last');
        if (mk) { c.classList.add('mkey'); c.title += ' — motion key'; }
        c.addEventListener('pointerdown', (e) => {
          d.setActive(L); A.goto(d, f); ND.View.request();
          if (!isKey) return;
          // drag a drawing to another frame
          const from = f, move = (ev) => { const t = document.elementFromPoint(ev.clientX, ev.clientY); grid.querySelectorAll('.drop').forEach((q) => q.classList.remove('drop')); if (t && t.dataset.f && t.parentNode === row) t.classList.add('drop'); };
          const up = (ev) => {
            window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
            const t = document.elementFromPoint(ev.clientX, ev.clientY);
            if (t && t.dataset.f && t.parentNode === row && +t.dataset.f !== from) { A.moveKey(d, L, from, +t.dataset.f); A.goto(d, +t.dataset.f); }
            render();
          };
          window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
          e.preventDefault();
        });
        c.addEventListener('dblclick', () => { if (!isKey) { d.setActive(L); A.goto(d, f); key('blank'); } });
        c.dataset.f = f;
        row.appendChild(c);
        (cols[f] = cols[f] || []).push(c);
      }
      grid.appendChild(row);
    });
    highlight();
    if (el.refreshNums) el.refreshNums();
  }
  // the Motion row: values of the active layer on this frame; changing one sets a motion key here
  let pendingBefore = null;
  const commitMotion = U.debounce(() => {
    const d = doc(), L = d.active;
    if (!pendingBefore || !L) return;
    const before = pendingBefore.tween, after = L.tween ? JSON.parse(JSON.stringify(L.tween)) : null, LL = pendingBefore.L;
    pendingBefore = null;
    d.history.push({ label: 'Motion Key', undo: () => { LL.tween = before ? JSON.parse(JSON.stringify(before)) : null; A.apply(d, true); d.emit('layers'); }, redo: () => { LL.tween = after ? JSON.parse(JSON.stringify(after)) : null; A.apply(d, true); d.emit('layers'); } });
    App.unsaved = true;
    render();
  }, 400);
  function setMotion(k, v) {
    const d = doc(), L = d.active, s = S();
    if (!L || !L.isPixel) return;
    if (!pendingBefore || pendingBefore.L !== L) pendingBefore = { L, tween: L.tween ? JSON.parse(JSON.stringify(L.tween)) : null };
    if (!L.tween) { const bb = ND.Sel.contentBBox(L.canvas) || { x: 0, y: 0, w: d.width, h: d.height }; L.tween = { cx: bb.x + bb.w / 2, cy: bb.y + bb.h / 2, ease: 'ease', keys: {} }; }
    const cur = A.tweenAt(L, s.frame) || { x: 0, y: 0, s: 1, r: 0, o: 1 };
    L.tween.keys[s.frame] = Object.assign({}, cur, L.tween.keys[s.frame] || {}, { [k]: v });
    A.apply(d, true); ND.View.request();
    commitMotion();
  }
  function renderMotion() {
    if (!motion) return;
    motion.style.display = motionOpen ? 'flex' : 'none';
    U.clear(motion);
    if (!motionOpen) return;
    const C = ND.C, d = doc(), L = d.active, s = S();
    if (!L || !L.isPixel) { motion.appendChild(C.hint('Pick a paint layer to animate its position, size, rotation or opacity')); return; }
    const v = A.tweenAt(L, s.frame) || { x: 0, y: 0, s: 1, r: 0, o: 1 }, here = !!(L.tween && L.tween.keys[s.frame]);
    motion.append(h('b.nd-tl-mlabel', '◆ ' + L.name + ' · frame ' + (s.frame + 1)),
      C.slider('Move X', { min: -d.width, max: d.width, get: () => v.x, set: (x) => setMotion('x', Math.round(x)), unit: 'px' }),
      C.slider('Move Y', { min: -d.height, max: d.height, get: () => v.y, set: (x) => setMotion('y', Math.round(x)), unit: 'px' }),
      C.slider('Scale', { min: 0.05, max: 4, step: 0.01, get: () => v.s, set: (x) => setMotion('s', x), fmt: (x) => Math.round(x * 100) + '%' }),
      C.slider('Rotate', { min: -360, max: 360, get: () => v.r, set: (x) => setMotion('r', Math.round(x)), unit: '°' }),
      C.slider('Opacity', { min: 0, max: 1, step: 0.01, get: () => v.o, set: (x) => setMotion('o', x), fmt: (x) => Math.round(x * 100) + '%' }),
      C.select('Ease', [['ease', 'Ease in/out'], ['linear', 'Linear']], () => (L.tween ? L.tween.ease : 'ease'), (e) => { if (L.tween) { L.tween.ease = e; A.apply(d, true); ND.View.request(); App.unsaved = true; } }),
      here ? C.button('Remove key', () => { A.deleteTweenKey(d, L, s.frame); render(); ND.View.request(); }, { cls: 'sm', icon: 'trash' }) : C.hint(L.tween ? 'Change a value to add a motion key here' : 'Change a value to add the first motion key — then go to another frame and change it again'));
    const au = s.audio;
    if (au) {
      const off = h('input.nd-field.nd-tl-num', { type: 'number', step: 0.1, value: au.offset || 0, title: 'Start the sound this many seconds into the animation' });
      off.addEventListener('change', () => { au.offset = parseFloat(off.value) || 0; App.unsaved = true; });
      motion.append(h('span.nd-tl-audio', '♪ ' + au.name), h('label.nd-tl-lab', 'Starts at', off, 's'), C.button('Remove sound', () => TL.removeAudio(), { cls: 'sm' }));
    }
  }
  function onionDialog(L) {
    const s = S(), o = Object.assign({ mode: 'auto', before: s.onionBefore, after: s.onionAfter, opacity: s.onionOpacity, colBefore: '#ff3b5c', colAfter: '#2fd67b' }, L.onion || {}), C = ND.C;
    const body = h('div.nd-col',
      C.select('Show', [['auto', 'When this is the active layer'], ['on', 'Always'], ['off', 'Never']], () => o.mode, (v) => { o.mode = v; }),
      C.slider('Drawings before', { min: 0, max: 5, step: 1, get: () => o.before, set: (v) => { o.before = Math.round(v); } }),
      C.slider('Drawings after', { min: 0, max: 5, step: 1, get: () => o.after, set: (v) => { o.after = Math.round(v); } }),
      C.slider('Strength', { min: 0.05, max: 1, step: 0.01, get: () => o.opacity, set: (v) => { o.opacity = v; }, fmt: (v) => Math.round(v * 100) + '%' }),
      h('div.nd-row', C.colourInput(() => o.colBefore, (v) => { o.colBefore = v; }, 'Colour before'), h('span', 'before'), C.colourInput(() => o.colAfter, (v) => { o.colAfter = v; }, 'Colour after'), h('span', 'after')));
    ND.Dialogs.modal('Onion skin — ' + L.name, body, [{ label: 'Use the timeline settings', action: () => { L.onion = null; render(); ND.View.request(); } }, { label: 'OK', primary: true, action: () => { L.onion = o; App.unsaved = true; render(); ND.View.request(); } }]);
  }
  function highlight() {
    if (!el || !grid || !doc()) return;
    const s = S();
    grid.querySelectorAll('.cur').forEach((c) => c.classList.remove('cur'));
    (cols[s.frame] || []).forEach((c) => c.classList.add('cur'));
    info.textContent = 'Frame ' + (s.frame + 1) + ' / ' + s.length;
    const c = cols[s.frame] && cols[s.frame][0];
    if (c && TL.playing) { const gl = grid.getBoundingClientRect(), cl = c.getBoundingClientRect(); if (cl.right > gl.right || cl.left < gl.left + 120) grid.scrollLeft += cl.left - gl.left - 160; }
  }
  App.on('frame', () => { highlight(); if (motionOpen && !TL.playing) renderMotion(); });
  App.on('doc', (t) => { if (App.state.showTimeline && (t === 'layers' || t === 'active' || t === 'history')) { clearTimeout(TL._t); TL._t = setTimeout(render, 30); } });
  App.on('docchange', () => { TL.stop(); if (App.state.showTimeline) { const first = !el; build(); if (first) el.style.display = 'flex'; render(); } });

  /* ---------- export ---------- */
  const frames = () => { const d = doc(), s = S(), out = []; for (let f = 0; f < s.length; f++) out.push(A.renderFrame(d, f)); return out; };
  const scaled = (list, k) => (k === 1 ? list : list.map((c) => { const o = U.canvas(Math.max(1, Math.round(c.width * k)), Math.max(1, Math.round(c.height * k))), x = U.ctx(o); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, o.width, o.height); return o; }));
  TL.exportGIF = function (k) {
    const s = S(), list = scaled(frames(), k || 1);
    return A.encodeGIF(list, Math.max(2, Math.round(100 / s.fps)), s.loop);
  };
  TL.exportWebM = async function (k) {
    const s = S(), list = scaled(frames(), k || 1);
    const au = s.audio;
    const types = (au ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'] : []).concat(['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']);
    const type = typeof MediaRecorder !== 'undefined' ? types.find((t) => MediaRecorder.isTypeSupported(t)) : null;
    if (!type) throw new Error('This browser cannot record video — export a GIF or PNG frames instead');
    const cv = U.canvas(list[0].width, list[0].height), x = U.ctx(cv), stream = cv.captureStream(0), track = stream.getVideoTracks()[0];
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 }), chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { rec.onstop = res; });
    // sound track: decoded and played into the recording, in step with the frames
    let actx = null, snd = null;
    if (au) {
      try {
        actx = new AudioContext();
        const buf = await actx.decodeAudioData(await (await fetch(au.data)).arrayBuffer()), dest = actx.createMediaStreamDestination();
        snd = actx.createBufferSource(); snd.buffer = buf; snd.connect(dest);
        stream.addTrack(dest.stream.getAudioTracks()[0]);
      } catch (e) { console.warn('sound not added to the video:', e.message); snd = null; }
    }
    rec.start();
    if (snd) { const off = au.offset || 0; if (off >= 0) snd.start(actx.currentTime + off); else snd.start(0, -off); }
    for (const c of list) {
      x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(c, 0, 0);
      if (track.requestFrame) track.requestFrame();
      await new Promise((r) => setTimeout(r, 1000 / s.fps));
    }
    rec.stop();
    await done;
    if (snd) { try { snd.stop(); } catch (e) { /* already ended */ } actx.close(); }
    return new Blob(chunks, { type: type.split(';')[0] });
  };
  TL.exportPNGs = async function (k) {
    const list = scaled(frames(), k || 1), files = [];
    for (let i = 0; i < list.length; i++) files.push({ name: 'frame_' + String(i + 1).padStart(4, '0') + '.png', data: new Uint8Array(await (await U.canvasToBlob(list[i], 'image/png')).arrayBuffer()) });
    return ND.Store.zip(files);
  };
  TL.exportDialog = function () {
    const d = doc(), s = S();
    if (!A.isAnimated(d)) return App.toast('Nothing is animated yet — open the timeline and add drawings on a few frames');
    let fmt = 'gif', k = d.width > 1200 ? 0.5 : 1;
    const C = ND.C;
    const body = h('div.nd-col',
      C.segmented([['gif', 'GIF'], ['webm', 'Video (WebM)'], ['png', 'PNG frames (.zip)']], () => fmt, (v) => { fmt = v; }),
      C.select('Size', [[1, '100%'], [0.75, '75%'], [0.5, '50%'], [0.25, '25%']], () => k, (v) => { k = +v; }),
      h('p.nd-hint', s.length + ' frames at ' + s.fps + ' fps (' + (s.length / s.fps).toFixed(1) + ' s). GIFs use 256 colours; video records in real time.'));
    ND.Dialogs.modal('Export animation', body, [{ label: 'Cancel' }, { label: 'Export', primary: true, action: () => { run(fmt, k); } }]);
  };
  async function run(fmt, k) {
    const name = (doc().name || 'animation').replace(/[^\w-]+/g, '_');
    App.toast('Exporting…', 60000);
    try {
      await new Promise((r) => setTimeout(r, 30));
      if (fmt === 'gif') U.download(name + '.gif', TL.exportGIF(k));
      else if (fmt === 'webm') { const b = await TL.exportWebM(k); U.download(name + (b.type.includes('mp4') ? '.mp4' : '.webm'), b); }
      else U.download(name + '-frames.zip', await TL.exportPNGs(k));
      App.toast('Animation exported');
    } catch (e) { App.toast('Export failed: ' + e.message, 5000); }
  }

  ND.Timeline = TL;
  setTimeout(() => { if (App.state.showTimeline && doc() && document.getElementById('nd-viewport')) TL.toggle(true); }, 0);
})();
