/* Neon Sparks Draw — channels.
 * Colour channels: choose which of Red, Green and Blue you paint on (the others are left exactly as they were),
 * and which ones you see (one channel alone shows as greyscale, as in Photoshop and Krita).
 * Alpha channels: selections saved in the document, which can be loaded again or painted on like a quick mask. */
'use strict';
(function () {
  const U = ND.U, C = {};
  C.KEYS = ['r', 'g', 'b'];
  C.LABELS = { r: 'Red', g: 'Green', b: 'Blue' };
  const all = (o) => !o || (o.r && o.g && o.b);
  C.limited = (d) => !!d && !all(d.chanEdit);    // painting only on some colour channels?
  C.viewLimited = (d) => !!d && !all(d.chanView); // seeing only some colour channels?
  // put back the channels that aren't being edited (both ImageData of the same area; `now` is changed)
  C.mix = function (now, before, edit) {
    const a = before.data, b = now.data, kr = !edit.r, kg = !edit.g, kb = !edit.b;
    for (let i = 0; i < b.length; i += 4) {
      if (kr) b[i] = a[i];
      if (kg) b[i + 1] = a[i + 1];
      if (kb) b[i + 2] = a[i + 2];
    }
    return now;
  };
  // after an edit of `rect` on `canvas`: keep only the edited channels (before = ImageData of rect)
  C.restore = function (canvas, before, rect, edit) {
    const x = U.ctx(canvas), now = x.getImageData(rect.x, rect.y, rect.w, rect.h);
    x.putImageData(C.mix(now, before, edit), rect.x, rect.y);
  };
  // show only some channels on the screen copy (`ctx`, area r): one channel = greyscale, two = the other one dark
  C.viewRegion = function (ctx, r, view) {
    const img = ctx.getImageData(r.x, r.y, r.w, r.h), d = img.data, on = C.KEYS.map((k) => !!view[k]);
    const n = on.filter(Boolean).length;
    if (n === 3) return;
    const one = n === 1 ? on.indexOf(true) : -1;
    for (let i = 0; i < d.length; i += 4) {
      if (n === 0) { d[i] = d[i + 1] = d[i + 2] = 0; continue; }
      if (one >= 0) { const v = d[i + one]; d[i] = d[i + 1] = d[i + 2] = v; continue; }
      if (!on[0]) d[i] = 0;
      if (!on[1]) d[i + 1] = 0;
      if (!on[2]) d[i + 2] = 0;
    }
    ctx.putImageData(img, r.x, r.y);
  };
  // small greyscale picture of one channel of `src` ('r' / 'g' / 'b', or a grey alpha-channel canvas with k = 'grey')
  C.thumb = function (src, k, w, h) {
    const c = U.canvas(w, h), x = U.ctx(c);
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    x.drawImage(src, 0, 0, w, h);
    if (k === 'grey') return c;
    const img = x.getImageData(0, 0, w, h), d = img.data, o = C.KEYS.indexOf(k);
    for (let i = 0; i < d.length; i += 4) { const v = d[i + o]; d[i] = d[i + 1] = d[i + 2] = v; }
    x.putImageData(img, 0, 0);
    return c;
  };
  ND.Channels = C;
})();
