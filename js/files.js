/* Neon Draw — files on your computer: Open, Save in place, Save as, and recent files.
 * Uses the File System Access API (Chrome, Edge, Opera and the installed app) so Ctrl+S writes
 * straight back to the same .ndraw file. Other browsers fall back to the file picker + download. */
'use strict';
(function () {
  const U = ND.U, App = ND.App;
  const RECENT_KEY = 'recent-files', MAX_RECENT = 8;
  const F = { recent: [] };

  F.supported = typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';
  const NDRAW_TYPE = { description: 'Neon Draw project', accept: { 'application/x-neondraw+json': ['.ndraw'] } };
  const OPEN_TYPES = [
    { description: 'Projects and images', accept: { 'application/x-neondraw+json': ['.ndraw'], 'image/vnd.adobe.photoshop': ['.psd', '.psb'], 'image/openraster': ['.ora'], 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'] } },
  ];
  const isAbort = (e) => e && (e.name === 'AbortError' || e.name === 'SecurityError');
  const isProject = (name) => /\.ndraw$/i.test(name || '');

  /* ---------- recent files ---------- */
  F.loadRecent = async function () {
    if (!F.supported) return;
    const list = await ND.Store.idbGet(RECENT_KEY);
    F.recent = Array.isArray(list) ? list.filter((r) => r && r.handle && r.name) : [];
  };
  F.recentList = () => F.recent.slice();
  async function saveRecent() { await ND.Store.idbSet(RECENT_KEY, F.recent); }
  F.addRecent = async function (handle) {
    if (!F.supported || !handle || handle.kind !== 'file') return;
    const same = await Promise.all(F.recent.map((r) => r.handle.isSameEntry(handle).catch(() => false)));
    F.recent = [{ name: handle.name, handle, time: Date.now() }].concat(F.recent.filter((r, i) => !same[i])).slice(0, MAX_RECENT);
    await saveRecent();
  };
  F.forget = async function (r) { F.recent = F.recent.filter((q) => q !== r); await saveRecent(); };
  F.clearRecent = async function () { F.recent = []; await saveRecent(); App.toast('Recent files cleared'); };

  // Browsers ask again for permission after a restart; this must run from a click or key press.
  async function permission(handle, mode) {
    const o = { mode };
    if ((await handle.queryPermission(o)) === 'granted') return true;
    return (await handle.requestPermission(o)) === 'granted';
  }
  F.openRecent = async function (r) {
    try {
      if (!(await permission(r.handle, 'readwrite')) && !(await permission(r.handle, 'read'))) return App.toast('Permission to open “' + r.name + '” was refused');
      const file = await r.handle.getFile();
      await App.openFile(file, r.handle);
    } catch (e) {
      if (e && e.name === 'NotFoundError') { await F.forget(r); App.toast('“' + r.name + '” has been moved or deleted', 3000); } else if (!isAbort(e)) App.toast('Could not open “' + r.name + '”: ' + e.message, 3500);
    }
  };

  /* ---------- open ---------- */
  F.open = async function () {
    if (!F.supported) { document.getElementById('nd-open').click(); return; }
    try {
      const [handle] = await window.showOpenFilePicker({ types: OPEN_TYPES, excludeAcceptAllOption: false, multiple: false });
      await App.openFile(await handle.getFile(), handle);
    } catch (e) { if (!isAbort(e)) App.toast('Could not open: ' + e.message, 3500); }
  };

  /* ---------- save ---------- */
  async function writeTo(handle, doc) {
    if (!(await permission(handle, 'readwrite'))) throw new Error('permission to write was refused');
    App.toast('Saving…', 15000);
    const data = await ND.Store.serializeAsync(doc);
    const w = await handle.createWritable();
    await w.write(new Blob([data], { type: 'application/json' }));
    await w.close();
    doc.fileHandle = handle;
    doc.name = handle.name.replace(/\.[^.]+$/, '');
    App.markSaved();
    F.addRecent(handle);
    App.toast('Saved ' + handle.name + ' (' + U.fmtBytes(data.length) + ')');
  }
  // Ctrl+S: write back to the open .ndraw file, or ask where to save the first time.
  F.save = async function () {
    const d = App.doc;
    if (!d) return;
    if (!F.supported) return App.saveProject();
    if (d.fileHandle && isProject(d.fileHandle.name)) {
      try { await writeTo(d.fileHandle, d); return; } catch (e) {
        if (isAbort(e)) return;
        App.toast('Could not save in place (' + e.message + ') — choose where to save', 3500);
      }
    }
    return F.saveAs();
  };
  F.saveAs = async function () {
    const d = App.doc;
    if (!d) return;
    if (!F.supported) return App.saveProject();
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: U.safeName(d.name) + '.ndraw', types: [NDRAW_TYPE], excludeAcceptAllOption: true });
      await writeTo(handle, d);
    } catch (e) { if (!isAbort(e)) App.toast('Could not save: ' + e.message, 3500); }
  };

  // Drag & drop: grab file handles while the drop event is still alive (Chrome/Edge only).
  F.handlesFromDrop = function (dt) {
    const items = Array.from((dt && dt.items) || []).filter((it) => it.kind === 'file');
    return items.map((it) => (typeof it.getAsFileSystemHandle === 'function' ? it.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null)));
  };

  ND.Files = F;
})();
