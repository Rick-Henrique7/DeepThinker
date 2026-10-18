import { useEffect, useRef } from 'react';
import { flowingWavesShader, orbVertexShader } from '../lib/shaders';

interface ShaderOrbProps {
  /** Tamanho em pixels CSS (largura = altura). */
  size?: number;
  /** Cor base das ondas, em RGB de 0 a 1. Padrao: azul. */
  tint?: [number, number, number];
  className?: string;
}

// Orbe animado em WebGL. Usado no chat enquanto a IA gera a resposta.
export function ShaderOrb({ size = 32, tint = [0.1, 0.3, 0.6], className = '' }: ShaderOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: true });
    if (!gl) return; // Sem WebGL: o orbe simplesmente nao aparece.

    // Canvas nitido em telas de alta densidade (retina, celular).
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const program = createProgram(gl, orbVertexShader, flowingWavesShader);
    if (!program) return;
    gl.useProgram(program);

    // Dois triangulos cobrindo o canvas inteiro.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, 'iResolution');
    const uTime = gl.getUniformLocation(program, 'iTime');
    const uTint = gl.getUniformLocation(program, 'uTint');
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform3f(uTint, tint[0], tint[1], tint[2]);

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let frame = 0;

    const render = () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!reduceMotion) frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      // Libera o contexto: o navegador so permite alguns contextos WebGL ao mesmo tempo.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [size, tint[0], tint[1], tint[2]]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`rounded-full flex-shrink-0 ${className}`}
      style={{ width: size, height: size, boxShadow: '0 0 18px rgba(66, 153, 225, 0.35)' }}
    />
  );
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Erro ao compilar shader:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Erro ao linkar shader:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}
