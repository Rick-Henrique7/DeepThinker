// Shaders GLSL usados pelo ShaderOrb.
// Adaptado do "Flowing Waves" do arquivo "Shader Reminder" (Figma Community).
//
// Como funciona: o vertex shader so desenha um quadrado cobrindo o canvas.
// O fragment shader roda uma vez para CADA pixel, a cada quadro, e devolve a cor
// daquele pixel a partir da posicao dele (vUv) e do tempo (iTime).

export const orbVertexShader = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5; // de [-1,1] para [0,1]
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const flowingWavesShader = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uTint;
varying vec2 vUv;

void main() {
  vec2 fragCoord = vUv * iResolution;
  vec2 uv = (2.0 * fragCoord - iResolution) / min(iResolution.x, iResolution.y);

  // Mascara circular: fora do circulo o pixel fica transparente.
  float dist = length(uv);
  if (dist > 1.0) discard;

  // Distorce as coordenadas varias vezes para criar as ondas.
  for (float i = 1.0; i < 10.0; i++) {
    uv.x += 0.6 / i * cos(i * 2.5 * uv.y + iTime);
    uv.y += 0.6 / i * cos(i * 1.5 * uv.x + iTime);
  }

  // Linhas brilhantes onde o seno chega perto de zero.
  vec3 color = uTint / abs(sin(iTime - uv.y - uv.x));

  // Borda suave para o circulo nao ficar serrilhado.
  float edge = smoothstep(1.0, 0.94, dist);
  gl_FragColor = vec4(min(color, vec3(1.0)) * edge, edge);
}
`;
