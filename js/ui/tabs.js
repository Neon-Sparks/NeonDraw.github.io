/* Neon Draw — document tabs in the top bar: click to switch, double-click to rename, × or middle-click to close,
 * + for a new document, drag to reorder. */
'use strict';
(function () {
  const U = ND.U, h = U.h, App = ND.App;
  let bar = null;
  function build() {
    const name = document.getElementById('nd-docname');
    if (!name || bar) return;
    bar = h('div.nd-tabs', { role: 'tablist' });
    name.parentNode.insertBefore(bar, name);
    name.style.display = 'none';
    render();
  }
  function render() {
    if (!bar) return build();
    U.clear(bar);
    App.docs.forEach((d) => {
      const active = d === App.doc, mark = d._fileDirty && d.fileHandle ? '● ' : '';
      const close = h('span.nd-tab-x', { title: 'Close (Ctrl+Alt+W)' }, '×');
      const tab = h('div.nd-tab' + (active ? '.active' : '') + (d.smartParent ? '.smart' : ''), { role: 'tab', draggable: 'true', title: d.name + ' — ' + d.width + ' × ' + d.height + (d.fileHandle ? '\nSaved as ' + d.fileHandle.name : '') + (d.smartParent ? '\nSmart object contents — save (Ctrl+S) or close this tab to update the layer' : '') + (active ? '\nDouble-click to rename' : '') },
        h('span.nd-tab-name', mark + d.name), h('span.nd-tab-size', d.width + '×' + d.height), close);
      tab.addEventListener('click', (e) => { if (e.target === close) { App.closeDoc(d); return; } App.showDoc(d); });
      tab.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); App.closeDoc(d); } });
      tab.addEventListener('dblclick', (e) => { if (e.target === close || !active) return; const n = window.prompt('Document name', d.name); if (n) { d.name = n; render(); App.emit('saved'); } });
      tab.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/nd-tab', String(App.docs.indexOf(d))); });
      tab.addEventListener('dragover', (e) => { if (Array.from(e.dataTransfer.types).includes('text/nd-tab')) e.preventDefault(); });
      tab.addEventListener('drop', (e) => {
        const from = +e.dataTransfer.getData('text/nd-tab'), to = App.docs.indexOf(d);
        if (isNaN(from) || from === to) return;
        e.preventDefault(); e.stopPropagation();
        const [m] = App.docs.splice(from, 1); App.docs.splice(to, 0, m); App.tabsChanged = true; render();
      });
      bar.appendChild(tab);
      if (active) setTimeout(() => tab.scrollIntoView({ block: 'nearest', inline: 'nearest' }), 0);
    });
    const plus = h('button.nd-tab-new', { type: 'button', title: 'New document (opens in a new tab)' }, '+');
    plus.addEventListener('click', () => ND.Dialogs.newDoc());
    bar.appendChild(plus);
  }
  App.on('tabs', render);
  App.on('saved', render);
  App.on('doc', (t) => { if (t === 'resize') render(); });
  ND.Tabs = { render };
  setTimeout(build, 0);
})();
