// Orbe animado do Advogado do Diabo: o mesmo shader "Flowing Waves" usado no app
// (frontend/src/lib/shaders.ts), em WebGL puro porque é só um quadrado de 32px.

const vertex = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragment = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uTint;
varying vec2 vUv;
void main() {
  vec2 fragCoord = vUv * iResolution;
  vec2 uv = (2.0 * fragCoord - iResolution) / min(iResolution.x, iResolution.y);
  float dist = length(uv);
  if (dist > 1.0) discard;
  for (float i = 1.0; i < 10.0; i++) {
    uv.x += 0.6 / i * cos(i * 2.5 * uv.y + iTime);
    uv.y += 0.6 / i * cos(i * 1.5 * uv.x + iTime);
  }
  vec3 color = uTint / abs(sin(iTime - uv.y - uv.x));
  float edge = smoothstep(1.0, 0.94, dist);
  gl_FragColor = vec4(min(color, vec3(1.0)) * edge, edge);
}
`;

export function createOrb(canvas, { reducedMotion = false } = {}) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
  if (!gl) return;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  gl.uniform2f(gl.getUniformLocation(program, 'iResolution'), canvas.width, canvas.height);
  gl.uniform3f(gl.getUniformLocation(program, 'uTint'), 0.07, 0.12, 0.3);
  const uTime = gl.getUniformLocation(program, 'iTime');
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Só anima na tela. Fora dela o laço para de vez, em vez de acordar 60 vezes por segundo à toa.
  let visible = false;
  let raf = 0;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(draw);
  }).observe(canvas);

  const start = performance.now();
  const draw = () => {
    raf = 0;
    if (!visible) return;
    raf = requestAnimationFrame(draw);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uTime, reducedMotion ? 1.5 : (performance.now() - start) / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}
