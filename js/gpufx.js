/* Neon Sparks Draw — layer styles and blurs on the graphics card (WebGL2).
 * Layer styles (drop shadow, outer glow, stroke, inner shadow, bevel, colour overlay) are worked out here in a
 * few passes instead of hundreds of canvas draws: blurs are true Gaussian blurs, and growing a shape (stroke,
 * glow spread) uses an exact distance map (jump flooding). Anything unusual — no WebGL2, a lost context,
 * a picture bigger than the card allows — returns null and the CPU version in effects.js is used instead. */
'use strict';
(function () {
  const U = ND.U;
  const X = { ok: null, enabled: true, used: 0, blurUsed: 0 };
  const NONE = 65535;
  const VS = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
  const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
`;
  // a field (0..1 in .r) from the picture's alpha, optionally shifted and inverted; `useAcc` adds what has
  // already been painted behind the layer (so the glow follows the stroke and the shadow both, as on the CPU)
  const FS_FIELD = HEAD + `uniform sampler2D src, acc; uniform vec2 off; uniform vec2 size; uniform int inv, useAcc; out vec4 o;
void main() {
  vec2 q = gl_FragCoord.xy - off;
  bool out_ = q.x < 0.0 || q.y < 0.0 || q.x > size.x || q.y > size.y;
  float a = out_ ? 0.0 : texture(src, q / size).a;
  if (useAcc == 1 && !out_) { float b = texture(acc, q / size).a; a = a + b * (1.0 - a); }
  o = vec4(inv == 1 ? 1.0 - a : a, 0.0, 0.0, 1.0);
}`;
  // one direction of a Gaussian blur of a field; outside the picture counts as empty
  const FS_BLUR = HEAD + `uniform sampler2D f; uniform vec2 dir; uniform vec2 size; uniform float sigma, stp; uniform int taps; out vec4 o;
void main() {
  vec2 p = gl_FragCoord.xy; float s = 0.0, ws = 0.0;
  for (int i = -taps; i <= taps; i++) {
    float x = float(i) * stp, w = exp(-x * x / (2.0 * sigma * sigma)); vec2 q = p + dir * x;
    ws += w;
    if (q.x < 0.0 || q.y < 0.0 || q.x > size.x || q.y > size.y) continue;
    s += w * texture(f, q / size).r;
  }
  o = vec4(s / ws, 0.0, 0.0, 1.0);
}`;
  // blur of a whole picture (premultiplied colour), used by blurCanvas
  const FS_BLUR4 = HEAD + `uniform sampler2D f; uniform vec2 dir; uniform vec2 size; uniform float sigma, stp; uniform int taps; out vec4 o;
void main() {
  vec2 p = gl_FragCoord.xy; vec4 s = vec4(0.0); float ws = 0.0;
  for (int i = -taps; i <= taps; i++) {
    float x = float(i) * stp, w = exp(-x * x / (2.0 * sigma * sigma)); vec2 q = p + dir * x;
    ws += w;
    if (q.x < 0.0 || q.y < 0.0 || q.x > size.x || q.y > size.y) continue;
    s += w * texture(f, q / size);
  }
  o = s / ws;
}`;
  // distance map (jump flooding): seeds are the pixels at least half covered
  const FS_SEED = HEAD + `uniform sampler2D f; out uvec4 o;
void main() { ivec2 p = ivec2(gl_FragCoord.xy); o = texelFetch(f, p, 0).r >= 0.5 ? uvec4(uvec2(p), 0u, 0u) : uvec4(${NONE}u, ${NONE}u, 0u, 0u); }`;
  const FS_JFA = HEAD + `uniform usampler2D j; uniform int k; uniform ivec2 isize; out uvec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy); uvec2 best = texelFetch(j, p, 0).xy;
  float bd = best.x == ${NONE}u ? 1e20 : distance(vec2(p), vec2(best));
  for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
    ivec2 q = p + ivec2(dx, dy) * k;
    if (q.x < 0 || q.y < 0 || q.x >= isize.x || q.y >= isize.y) continue;
    uvec2 s = texelFetch(j, q, 0).xy;
    if (s.x == ${NONE}u) continue;
    float d = distance(vec2(p), vec2(s));
    if (d < bd) { bd = d; best = s; }
  }
  o = uvec4(best, 0u, 0u);
}`;
  // grow a field by `grow` pixels (anti-aliased edge); `mulA` = keep it inside the picture's shape
  const FS_GROW = HEAD + `uniform sampler2D f, src; uniform usampler2D j; uniform float grow; uniform int mulA; out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy); uvec2 s = texelFetch(j, p, 0).xy;
  float d = s.x == ${NONE}u ? 1e9 : distance(vec2(p), vec2(s));
  float v = max(texelFetch(f, p, 0).r, clamp(grow + 0.5 - d, 0.0, 1.0));
  if (mulA == 1) v *= texelFetch(src, p, 0).a;
  o = vec4(v, 0.0, 0.0, 1.0);
}`;
  // paint a coloured layer from a field into an accumulation buffer (premultiplied, "over" blending)
  const FS_PAINT = HEAD + `uniform sampler2D f, src; uniform vec3 col; uniform float op; uniform int mulA; out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float a = op * texelFetch(f, p, 0).r * (mulA == 1 ? texelFetch(src, p, 0).a : 1.0);
  o = vec4(col * a, a);
}`;
  // copy a texture to the visible canvas (flipped: textures keep the picture's top row first)
  const FS_SHOW = HEAD + `uniform sampler2D t; uniform ivec2 isize; out vec4 o;
void main() { ivec2 p = ivec2(gl_FragCoord.xy); o = texelFetch(t, ivec2(p.x, isize.y - 1 - p.y), 0); }`;

  let cv = null, gl = null;
  const P = {};
  function compile(fs) {
    const sh = (type, s) => { const x = gl.createShader(type); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    const loc = {};
    const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(pr, i); loc[u.name] = gl.getUniformLocation(pr, u.name); }
    return { pr, loc };
  }
  function init() {
    if (X.ok !== null) return X.ok;
    X.ok = false;
    try {
      cv = document.createElement('canvas');
      gl = cv.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, alpha: true, depth: false, stencil: false });
      if (!gl) return false;
      P.field = compile(FS_FIELD); P.blur = compile(FS_BLUR); P.blur4 = compile(FS_BLUR4); P.seed = compile(FS_SEED);
      P.jfa = compile(FS_JFA); P.grow = compile(FS_GROW); P.paint = compile(FS_PAINT); P.show = compile(FS_SHOW);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      X.max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); X.ok = false; });
      X.ok = true;
    } catch (e) { console.warn('Graphics-card layer styles unavailable:', e.message); X.ok = false; }
    return X.ok;
  }

  /* ---------- render targets (re-made when the size changes) ---------- */
  let W = 0, H = 0;
  const T = {};
  function target(name, kind) {
    let t = T[name];
    if (t && t.w === W && t.h === H) return t;
    if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (kind === 'seed') gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16UI, W, H, 0, gl.RG_INTEGER, gl.UNSIGNED_SHORT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const filt = kind === 'seed' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer ' + name);
    T[name] = t = { tex, fb, w: W, h: H };
    return t;
  }
  function upload(src, w, h) {
    const t = target('src');
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, src.width); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    return t;
  }
  // run program `p` into target `out` with the given textures (unit order) and uniforms
  function pass(p, out, texs, uni) {
    gl.useProgram(p.pr);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null);
    gl.viewport(0, 0, W, H);
    Object.keys(texs).forEach((name, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, texs[name].tex); gl.uniform1i(p.loc[name], i); });
    for (const k in uni) {
      const v = uni[k], l = p.loc[k];
      if (l == null) continue;
      if (Array.isArray(v)) { if (v.int) gl.uniform2i(l, v[0], v[1]); else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]); else gl.uniform2f(l, v[0], v[1]); }
      else if (typeof v === 'object') gl.uniform1i(l, v.i);
      else gl.uniform1f(l, v);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  const I = (n) => ({ i: n });
  const IV = (a, b) => { const v = [a, b]; v.int = true; return v; };
  const size = () => [W, H];
  const rgb = (hex) => { const c = U.hexToRgb(hex || '#000000'); return [c[0] / 255, c[1] / 255, c[2] / 255]; };
  const blurSteps = (sigma) => { const stp = Math.max(1, sigma / 12), taps = Math.min(64, Math.ceil((3 * sigma) / stp)); return { stp, taps }; };

  // field operations (results in named targets)
  function field(out, offX, offY, inv, useAcc) { pass(P.field, target(out), { src: T.src, acc: target('accO') }, { off: [offX || 0, offY || 0], size: size(), inv: I(inv ? 1 : 0), useAcc: I(useAcc ? 1 : 0) }); }
  function blurField(name, sigma) {
    if (!(sigma > 0.4)) return;
    const b = blurSteps(sigma);
    pass(P.blur, target('tmp'), { f: T[name] }, { dir: [1, 0], size: size(), sigma, stp: b.stp, taps: I(b.taps) });
    pass(P.blur, target(name), { f: T.tmp }, { dir: [0, 1], size: size(), sigma, stp: b.stp, taps: I(b.taps) });
  }
  function grow(name, amount, mulA) {
    if (!(amount > 0)) { if (mulA) { pass(P.grow, target('tmp'), { f: T[name], src: T.src, j: target('seedA', 'seed') }, { grow: -1e6, mulA: I(1) }); swap(name, 'tmp'); } return; }
    pass(P.seed, target('seedA', 'seed'), { f: T[name] }, {});
    let a = 'seedA', b = 'seedB';
    let k = 1; while (k < amount + 1) k *= 2;
    for (; k >= 1; k = Math.floor(k / 2)) { pass(P.jfa, target(b, 'seed'), { j: T[a] }, { k: I(k), isize: IV(W, H) }); [a, b] = [b, a]; }
    pass(P.jfa, target(b, 'seed'), { j: T[a] }, { k: I(1), isize: IV(W, H) }); [a, b] = [b, a];
    pass(P.grow, target('tmp'), { f: T[name], src: T.src, j: T[a] }, { grow: amount, mulA: I(mulA ? 1 : 0) });
    swap(name, 'tmp');
  }
  function swap(a, b) { const t = T[a]; T[a] = T[b]; T[b] = t; }
  function clear(name) { const t = target(name); gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  // paint over what's in `acc` — or behind it (`behind`, like the canvas's 'destination-over')
  function paint(acc, name, colour, op, mulA, behind) {
    gl.enable(gl.BLEND);
    if (behind) gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    pass(P.paint, T[acc], { f: T[name], src: T.src }, { col: rgb(colour), op: Math.max(0, Math.min(1, op)), mulA: I(mulA ? 1 : 0) });
    gl.disable(gl.BLEND);
  }
  // copy an accumulation buffer into a new 2D canvas (w × h)
  function readOut(name) {
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    pass(P.show, null, { t: T[name] }, { isize: IV(W, H) });
    const c = U.canvas(W, H), x = U.ctx(c);
    x.drawImage(cv, 0, 0);
    return c;
  }
  const offsetOf = (angle, dist) => { const a = (angle * Math.PI) / 180; return { x: -Math.cos(a) * dist, y: Math.sin(a) * dist }; };
  /* Some computers have a very slow (or emulated) graphics chip, where the CPU is quicker. The first time it's
   * needed, one blur pass on a 1024 × 1024 area is timed (waiting for the result); if that takes longer than the
   * CPU would, layer styles and blurs stay on the CPU for this session. */
  function fastEnough() {
    if (X.speed != null) return X.speed < 30;
    try {
      W = 1024; H = 1024;
      const px = new Uint8Array(4), sync = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, target('accO').fb); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
      target('src'); target('tmp'); sync();
      const t0 = performance.now();
      pass(P.blur4, target('accO'), { f: T.src }, { dir: [1, 0], size: size(), sigma: 8, stp: 1, taps: I(24) });
      sync();
      X.speed = performance.now() - t0;
    } catch (e) { X.speed = 1e9; }
    if (X.speed >= 30) console.info('Neon Sparks Draw: the graphics card is slow here (' + Math.round(X.speed) + ' ms test) — layer styles and blurs use the CPU');
    return X.speed < 30;
  }
  // (`force` skips the speed check — used by the self tests to check the graphics-card results anyway)
  X.available = () => X.enabled && init() && !gl.isContextLost() && (X.force || fastEnough());
  X.slow = () => X.speed != null && X.speed >= 30;

  /* Layer styles for `base` (the w × h area at 0,0). Returns { inner, inside, outer } canvases (or null parts):
   *   inner  — draw 'source-atop' on the layer before clipped layers (overlay, bevel, inner shadow)
   *   inside — draw 'source-atop' after clipped layers (the inside part of a stroke)
   *   outer  — draw 'destination-over' (behind the layer: stroke, outer glow, drop shadow)
   * `merge` puts the inside stroke into `inner` (when there are no clipped layers in between). */
  X.effects = function (base, w, h, fx, merge) {
    if (!X.available() || w * h < 1024 || w > X.max || h > X.max) return null;
    try {
      W = w; H = h;
      upload(base, w, h);
      const on = (k) => fx[k] && fx[k].on;
      const out = { inner: null, inside: null, outer: null };
      // ---- inside the shape ----
      const st = fx.stroke, inStroke = on('stroke') && st.position !== 'outside';
      if (on('overlay') || on('bevel') || on('inner') || (inStroke && merge)) {
        clear('accI');
        if (on('overlay')) { field('fA'); paint('accI', 'fA', fx.overlay.color, fx.overlay.opacity, false); }
        if (on('bevel')) {
          const b = fx.bevel, o = offsetOf(b.angle, Math.max(1, b.size * 0.5)), k = Math.min(1, b.depth);
          field('fA', -o.x, -o.y, true); blurField('fA', b.size * 0.5); paint('accI', 'fA', b.shadow, k, true);
          field('fA', o.x, o.y, true); blurField('fA', b.size * 0.5); paint('accI', 'fA', b.highlight, Math.min(1, b.depth * 0.9), true);
        }
        if (on('inner')) { const s = fx.inner, o = offsetOf(s.angle, s.distance); field('fA', o.x, o.y, true); blurField('fA', s.size / 2); paint('accI', 'fA', s.color, s.opacity, true); }
        if (inStroke && merge) { field('fA', 0, 0, true); grow('fA', st.position === 'center' ? st.size / 2 : st.size, true); paint('accI', 'fA', st.color, st.opacity, false); }
        out.inner = readOut('accI');
      }
      if (inStroke && !merge) {
        clear('accI');
        field('fA', 0, 0, true); grow('fA', st.position === 'center' ? st.size / 2 : st.size, true); paint('accI', 'fA', st.color, st.opacity, false);
        out.inside = readOut('accI');
      }
      // ---- behind the shape, in the CPU version's order: stroke, then glow behind it (shaped by layer + stroke),
      //      then the shadow behind both (shaped by layer + stroke + glow) ----
      if (on('shadow') || on('glow') || (on('stroke') && st.position !== 'inside')) {
        clear('accO');
        if (on('stroke') && st.position !== 'inside') { field('fA'); grow('fA', st.position === 'center' ? st.size / 2 : st.size, false); paint('accO', 'fA', st.color, st.opacity, false, true); }
        if (on('glow')) { const g = fx.glow; field('fA', 0, 0, false, true); grow('fA', g.size * g.spread, false); blurField('fA', Math.max(1, g.size * (1 - g.spread) * 0.6)); paint('accO', 'fA', g.color, g.opacity, false, true); }
        if (on('shadow')) { const s = fx.shadow, o = offsetOf(s.angle, s.distance); field('fA', o.x, o.y, false, true); blurField('fA', s.size / 2); paint('accO', 'fA', s.color, s.opacity, false, true); }
        out.outer = readOut('accO');
      }
      X.used++;
      return out;
    } catch (e) {
      console.warn('Graphics-card layer styles failed, using the CPU:', e.message);
      X.enabled = false;
      return null;
    }
  };

  /* Gaussian blur of a whole canvas (standard deviation `sigma`, like the canvas 'blur()' filter).
   * Returns a new canvas, or null when the CPU should do it. 16-bit pictures stay on the CPU. */
  X.blur = function (src, sigma) {
    const w = src.width, h = src.height;
    if (src._nd16 || !(sigma > 0.4) || !X.available() || w * h < 4096 || w > X.max || h > X.max) return null;
    try {
      W = w; H = h;
      upload(src, w, h);
      const b = blurSteps(sigma);
      pass(P.blur4, target('tmp'), { f: T.src }, { dir: [1, 0], size: size(), sigma, stp: b.stp, taps: I(b.taps) });
      pass(P.blur4, target('accO'), { f: T.tmp }, { dir: [0, 1], size: size(), sigma, stp: b.stp, taps: I(b.taps) });
      X.blurUsed++;
      return readOut('accO');
    } catch (e) {
      console.warn('Graphics-card blur failed, using the CPU:', e.message);
      X.enabled = false;
      return null;
    }
  };
  ND.GPUFX = X;
})();
