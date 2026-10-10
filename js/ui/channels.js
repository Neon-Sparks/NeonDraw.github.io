/* Neon Sparks Draw — Channels panel (a tab next to Layers, Paths and History).
 *   RGB / Red / Green / Blue: click a channel to paint on it alone (and see it in greyscale); Shift+click adds or
 *   removes it; the eye shows or hides it; RGB goes back to all three.
 *   Alpha channels: selections saved in the document — load them as a selection, paint on them, delete them. */
'use strict';
(function () {
  const U = ND.U, h = U.h, C = ND.C, App = ND.App, CH = ND.Channels;
  const P = {};
  const TW = 44, TH = 30;

  function thumbOf(d, k) {
    const ar = d.width / d.height, w = ar >= TW / TH ? TW : Math.round(TH * ar), hh = ar >= TW / TH ? Math.round(TW / ar) : TH;
    if (k === 'rgb') { const c = U.canvas(Math.max(1, w), Math.max(1, hh)), x = U.ctx(c); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(d.getProjection(), 0, 0, c.width, c.height); return c; }
    return CH.thumb(d.getProjection(), k, Math.max(1, w), Math.max(1, hh));
  }
  function refresh() { App.doc.invalidateAll(); App.doc.displayDirty = { x: 0, y: 0, w: App.doc.width, h: App.doc.height }; ND.View.request(); App.emit('channels'); }

  // click on a colour channel: edit (and see) only it; with Shift: add / remove it
  P.pick = function (k, add) {
    const d = App.doc;
    if (k === 'rgb') { d.chanEdit = { r: true, g: true, b: true }; d.chanView = { r: true, g: true, b: true }; refresh(); return; }
    if (add) {
      const e = Object.assign({}, d.chanEdit); e[k] = !e[k];
      if (!e.r && !e.g && !e.b) return; // keep at least one
      d.chanEdit = e; d.chanView = Object.assign({}, e);
    } else {
      d.chanEdit = { r: false, g: false, b: false }; d.chanEdit[k] = true;
      d.chanView = Object.assign({}, d.chanEdit);
    }
    if (d.qmChannel) d.exitQuickMask();
    refresh();
  };
  P.toggleView = function (k) {
    const d = App.doc;
    if (k === 'rgb') { const allOn = d.chanView.r && d.chanView.g && d.chanView.b; d.chanView = allOn ? Object.assign({}, d.chanEdit) : { r: true, g: true, b: true }; }
    else d.chanView = Object.assign({}, d.chanView, { [k]: !d.chanView[k] });
    refresh();
  };

  P.render = function (body) {
    const d = App.doc;
    if (!d) return;
    const list = h('div.nd-channels');
    const row = (k, label) => {
      const on = k === 'rgb' ? !CH.limited(d) : d.chanEdit[k] && CH.limited(d), seen = k === 'rgb' ? !CH.viewLimited(d) : d.chanView[k];
      const eye = C.iconButton(seen ? 'eye' : 'eye-off', 'Show / hide this channel', (e) => { e.stopPropagation(); P.toggleView(k); }, 'tiny');
      const th = thumbOf(d, k === 'rgb' ? 'rgb' : k);
      const r = h('div.nd-path-row.nd-chan-row' + (on ? '.active' : ''), eye, th ? h('span.nd-chan-thumb', th) : null, h('span.nd-chan-name', label));
      r.title = k === 'rgb' ? 'Paint on and see all colour channels' : 'Click: paint on this channel only (Shift+click adds or removes it)';
      r.addEventListener('click', (e) => P.pick(k, e.shiftKey));
      return r;
    };
    list.append(row('rgb', 'RGB'), row('r', 'Red'), row('g', 'Green'), row('b', 'Blue'));
    if (CH.limited(d)) list.appendChild(h('div.nd-hint', 'Painting, fills and filters change only the highlighted channels of the active layer.'));
    // alpha channels
    list.appendChild(h('div.nd-mini-title', 'Alpha channels'));
    if (!d.alphaChannels.length) list.appendChild(h('div.nd-hint', 'Save a selection here to keep it with the document: make a selection, then click Save selection.'));
    d.alphaChannels.forEach((ch) => {
      const editing = d.qmChannel === ch;
      const th = U.canvas(TW, TH), tx = U.ctx(th);
      tx.fillStyle = '#000'; tx.fillRect(0, 0, TW, TH);
      const ar = d.width / d.height, w = ar >= TW / TH ? TW : Math.round(TH * ar), hh = ar >= TW / TH ? Math.round(TW / ar) : TH;
      tx.drawImage(ch.canvas, (TW - w) / 2, (TH - hh) / 2, w, hh);
      const load = C.iconButton('sel-rect', 'Load as selection (Shift: add · Alt: subtract · Shift+Alt: intersect)', (e) => { e.stopPropagation(); d.loadChannelSelection(ch, e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace'); }, 'tiny');
      const edit = C.button(editing ? 'Done' : 'Paint on it', (e) => { e.stopPropagation(); if (editing) d.exitQuickMask(); else { d.editChannel(ch); App.setTool('brush'); App.toast('Painting on “' + ch.name + '”: white adds, black removes — press Q or click Done when finished', 5000); } }, { cls: 'sm' + (editing ? ' primary' : ''), title: 'Paint on this channel (white = selected, black = not)' });
      const del = C.iconButton('trash', 'Delete this channel', (e) => { e.stopPropagation(); d.deleteChannel(ch); }, 'tiny');
      const r = h('div.nd-path-row.nd-chan-row' + (editing ? '.active' : ''), h('span.nd-chan-thumb', th), h('span.nd-chan-name', ch.name), load, edit, del);
      r.title = 'Double-click to rename · Ctrl+click loads it as a selection';
      r.addEventListener('click', (e) => { if (e.ctrlKey || e.metaKey) d.loadChannelSelection(ch, 'replace'); });
      r.addEventListener('dblclick', () => { const n = window.prompt('Channel name', ch.name); if (n) { ch.name = n.trim() || ch.name; App.emit('channels'); } });
      list.appendChild(r);
    });
    const bar = h('div.nd-row.tight.nd-paths-bar',
      C.button('Save selection', () => { if (!d.selectionMask) { App.toast('Make a selection first'); return; } d.saveSelectionAsChannel(); }, { cls: 'sm', icon: 'plus', title: 'Save the selection as a new alpha channel' }));
    body.append(list, bar);
  };
  ND.ChannelsPanel = P;
})();
