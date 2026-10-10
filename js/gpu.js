/* Neon Draw — graphics-card (WebGL2) blending for the blend modes the browser's canvas can't do itself
 * (Linear Burn, Vivid Light, Pin Light, Divide, Grain Merge…). Same maths as ND.Blend.blendImageData;
 * anything unusual (no WebGL2, lost context, huge areas) falls back to the CPU version. */
'use strict';
(function () {
  const U = ND.U;
  const G = { ok: null, used: 0, enabled: true };
  // mode numbers used by the shader
  const IDS = ['linearburn', 'darkercolor', 'add', 'lightercolor', 'vividlight', 'linearlight', 'pinlight', 'hardmix', 'subtract', 'divide', 'grainextract', 'grainmerge'];
  const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
  const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D dstT, srcT; uniform int mode; uniform float op;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float vivid(float b, float s) { return s <= 0.5 ? (s <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b) / (2.0 * s))) : (s >= 1.0 ? 1.0 : min(1.0, b / (2.0 * (1.0 - s)))); }
float pin(float b, float s) { return s <= 0.5 ? min(b, 2.0 * s) : max(b, 2.0 * (s - 0.5)); }
float dvd(float b, float s) { return s <= 0.0 ? 1.0 : min(1.0, b / s); }
vec3 mixc(vec3 b, vec3 s) {
  if (mode == 0) return max(vec3(0.0), b + s - 1.0);
  if (mode == 1) return lum(s) < lum(b) ? s : b;
  if (mode == 2) return min(vec3(1.0), b + s);
  if (mode == 3) return lum(s) > lum(b) ? s : b;
  if (mode == 4) return vec3(vivid(b.r, s.r), vivid(b.g, s.g), vivid(b.b, s.b));
  if (mode == 5) return min(vec3(1.0), max(vec3(0.0), b + 2.0 * s - 1.0));
  if (mode == 6) return vec3(pin(b.r, s.r), pin(b.g, s.g), pin(b.b, s.b));
  if (mode == 7) return vec3(b.r + s.r >= 1.0 ? 1.0 : 0.0, b.g + s.g >= 1.0 ? 1.0 : 0.0, b.b + s.b >= 1.0 ? 1.0 : 0.0);
  if (mode == 8) return max(vec3(0.0), b - s);
  if (mode == 9) return vec3(dvd(b.r, s.r), dvd(b.g, s.g), dvd(b.b, s.b));
  if (mode == 10) return min(vec3(1.0), max(vec3(0.0), b - s + 0.5));
  return min(vec3(1.0), max(vec3(0.0), b + s - 0.5));
}
void main() {
  vec4 b = texture(dstT, uv), s = texture(srcT, uv);
  float as = s.a * op, ab = b.a;
  if (as <= 0.0) { o = b; return; }
  vec3 m = mixc(b.rgb, s.rgb);
  float ao = as + ab * (1.0 - as);
  o = vec4(((1.0 - as) * ab * b.rgb + (1.0 - ab) * as * s.rgb + as * ab * m) / ao, ao);
}`;
  let cv = null, gl = null, prog = null, loc = null, texD = null, texS = null;
  function init() {
    if (G.ok !== null) return G.ok;
    G.ok = false;
    try {
      cv = document.createElement('canvas');
      gl = cv.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: true });
      if (!gl) return false;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const p = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
      loc = { dst: gl.getUniformLocation(prog, 'dstT'), src: gl.getUniformLocation(prog, 'srcT'), mode: gl.getUniformLocation(prog, 'mode'), op: gl.getUniformLocation(prog, 'op') };
      const tex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); ['TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER'].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, gl[k], gl.NEAREST)); ['TEXTURE_WRAP_S', 'TEXTURE_WRAP_T'].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, gl[k], gl.CLAMP_TO_EDGE)); return t; };
      texD = tex(0); texS = tex(1);
      gl.uniform1i(loc.dst, 0); gl.uniform1i(loc.src, 1);
      G.max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.ok = false; });
      G.ok = true;
    } catch (e) { console.warn('GPU blending unavailable:', e.message); G.ok = false; }
    return G.ok;
  }
  G.supports = (mode) => IDS.includes(mode);
  // Blend the (sx, sy, w, h) area of `src` over `ctx` at (dx, dy). Returns false when it couldn't (use the CPU then).
  G.blend = function (ctx, dx, dy, src, sx, sy, w, h, mode, opacity) {
    if (!G.enabled || !IDS.includes(mode) || w * h < 4096 || !init() || w > G.max || h > G.max || gl.isContextLost()) return false;
    try {
      cv.width = w; cv.height = h;
      gl.viewport(0, 0, w, h);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      const up = (unit, t, source, x, y) => {
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y); gl.pixelStorei(gl.UNPACK_ROW_LENGTH, source.width);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      };
      up(0, texD, ctx.canvas, dx, dy);
      up(1, texS, src, sx, sy);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0); gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.uniform1i(loc.mode, IDS.indexOf(mode)); gl.uniform1f(loc.op, opacity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ctx.save();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(dx, dy, w, h);
      ctx.drawImage(cv, 0, 0, w, h, dx, dy, w, h);
      ctx.restore();
      G.used++;
      return true;
    } catch (e) { console.warn('GPU blend failed, using the CPU:', e.message); G.enabled = false; return false; }
  };
  // CPU fallback with the same signature
  G.blendCPU = function (ctx, dx, dy, src, sx, sy, w, h, mode, opacity) {
    const d = ctx.getImageData(dx, dy, w, h), s = U.ctx(src).getImageData(sx, sy, w, h);
    ND.Blend.blendImageData(d, s, mode, opacity, false);
    ctx.putImageData(d, dx, dy);
  };
  G.blendAny = function (ctx, dx, dy, src, sx, sy, w, h, mode, opacity) {
    if (!G.blend(ctx, dx, dy, src, sx, sy, w, h, mode, opacity)) G.blendCPU(ctx, dx, dy, src, sx, sy, w, h, mode, opacity);
  };
  ND.GPU = G;
})();
