/* Neon Sparks Draw — live interface translation.
 * Watches the page and swaps English interface text (labels, buttons, tooltips, hints, dialog text)
 * for the chosen language, using the hand-written dictionaries in lang.js and lang-ui.js.
 * Only exact, known phrases are replaced, so layer names and other things you type are left alone.
 * The original English is remembered for every piece of text, so switching languages
 * (including back to English) always starts from the source wording. */
(function () {
  const L = ND.Lang, I = {};
  const ATTRS = ['title', 'placeholder', 'aria-label'];
  // never touched: code, typing areas, and names you gave things (layers, paths, documents)
  const SKIP = 'script,style,textarea,[contenteditable="true"],[data-no-i18n],.nd-layer-name,.nd-tab-name';
  const src = new WeakMap();   // text node -> its English source
  const shown = new WeakMap(); // text node -> the text we last put there
  const asrc = new WeakMap();  // element -> { attr: { en, out } }
  let obs = null, used = false;
  const cjk = () => /^(zh|ja)$/.test(L.code());

  // sentence templates such as "… restored from autosave: {n} documents …"
  let tpls = null;
  function template(core) {
    if (!L.UI_TPL) return null;
    if (!tpls) tpls = Object.keys(L.UI_TPL).map((en) => {
      const keys = [], src = en.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(\w+)\\?\}/g, (m, k) => { keys.push(k); return '(.+?)'; });
      return { en, keys, re: new RegExp('^' + src + '$') };
    });
    for (const p of tpls) {
      const m = p.re.exec(core), tr = m && L.UI_TPL[p.en][L.code()];
      if (tr) return tr.replace(/\{(\w+)\}/g, (x, k) => m[p.keys.indexOf(k) + 1]);
    }
    return null;
  }
  // one phrase: exact match, or a known phrase with a shortcut / colon / number attached
  function one(core) {
    let t = L.t(core);
    if (t !== core) return t;
    const tp = template(core);
    if (tp) return tp;
    let k = /^(.*?\S)(\s*\([^()]{1,14}\))$/.exec(core); // "Brush (B)", "Fit to view (1)"
    if (k) { const a = L.t(k[1]); if (a !== k[1]) return a + k[2]; }
    if (/:$/.test(core)) { const a = L.t(core.slice(0, -1)); if (a !== core.slice(0, -1)) return a + (cjk() ? '：' : ':'); } // "Size:"
    k = /^(\D*?[A-Za-z])\s+(-?[\d.,]+\s?(?:%|px|°|×)?)$/.exec(core); // "Softness 80%", "Brush size 20 px"
    if (k) { const a = L.t(k[1]); if (a !== k[1]) return a + ' ' + k[2]; }
    k = /^(\d+) (\D+?) (\d+)$/.exec(core); // "3 columns — click for 1"
    if (k) { const a = L.t(k[2]); if (a !== k[2]) return k[1] + ' ' + a + ' ' + k[3]; }
    return core;
  }
  // translate one string; returns it unchanged when it isn't a known phrase
  I.tr = function (s) {
    if (!s || L.code() === 'en') return s;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), core = m[2];
    if (!core || !/[A-Za-z]/.test(core)) return s;
    let t = one(core);
    if (t === core && /\n| — | · /.test(core)) { // "Pencil — Sketch", "Untitled — 1920 × 1080\nDouble-click to rename"
      // pieces alternate text / separator; translate the longest run of pieces that is a known phrase
      const parts = core.split(/(\n| — | · )/), out = [];
      let changed = false;
      for (let i = 0; i < parts.length; i += 2) {
        let done = false;
        for (let j = parts.length - 1; j > i && !done; j -= 2) {
          const run = parts.slice(i, j + 1).join(''), tr = one(run);
          if (tr !== run) { out.push(tr); changed = true; done = true; i = j; }
        }
        if (!done) { const tr = one(parts[i]); if (tr !== parts[i]) changed = true; out.push(tr); }
        if (i + 1 < parts.length) out.push(parts[i + 1]);
      }
      if (changed) t = out.join('');
    }
    return t === core ? s : m[1] + t + m[3];
  };

  function doText(n) {
    const p = n.parentElement;
    if (!p || p.closest(SKIP)) return;
    const cur = n.data;
    if (shown.get(n) !== cur) src.set(n, cur); // the app wrote new (English) text here
    const t = I.tr(src.get(n));
    if (t !== cur) n.data = t;
    shown.set(n, t);
  }
  function doAttrs(el) {
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      let rec = asrc.get(el);
      if (!rec) asrc.set(el, rec = {});
      if (!rec[a] || rec[a].out !== cur) rec[a] = { en: cur };
      const t = I.tr(rec[a].en);
      rec[a].out = t;
      if (t !== cur) el.setAttribute(a, t);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || root.closest(SKIP)) return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    let n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  function onMut(list) {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') doText(m.target);
      else if (m.target.nodeType === 1 && !m.target.closest(SKIP)) doAttrs(m.target);
    }
    obs.takeRecords(); // drop the records caused by our own edits
  }

  // (re)translate the whole page for the current language and keep watching for new text
  I.apply = function () {
    if (!document.body || typeof MutationObserver === 'undefined') return;
    const on = L.code() !== 'en';
    if (on || used) { walk(document.body); if (obs) obs.takeRecords(); }
    if (on && !obs) {
      obs = new MutationObserver(onMut);
      obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    } else if (!on && obs) { obs.disconnect(); obs = null; }
    used = used || on;
  };
  // English source of a translated node (used by tests)
  I.source = (n) => src.get(n);

  L.DOM = I;
  if (document.body) I.apply();
})();
