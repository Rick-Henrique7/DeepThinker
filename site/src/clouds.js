// Nuvens da descida (céu → mar), desenhadas uma vez só num canvas 2D.
//
// Como funciona: "ruído fractal" (fbm). Somamos várias camadas de ruído suave, cada
// uma com o dobro de detalhe e metade da força. O resultado parece nuvem/fumaça.
// O ruído se repete na horizontal (é "periódico"), então a textura pode ser desenhada
// duas vezes lado a lado e andar para a esquerda sem emenda (animação no styles.css).
// Desenhamos em baixa resolução e o navegador amplia: fica macio e custa pouco.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();

// Ruído de valor com repetição a cada `period` unidades em x.
function makeNoise(seed) {
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const SIZE = 256;
  const table = Array.from({ length: SIZE * SIZE }, rand);
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y, period) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const v = (i, j) => table[(((i % period) + period) % period) + (((j % SIZE) + SIZE) % SIZE) * SIZE];
    const a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * fx;
    const b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * fx;
    return a + (b - a) * fy;
  };
}

export function createClouds(canvas, { seed = 3, scale = 1, cover = 0.5 } = {}) {
  const noise = makeNoise(seed);
  // Resolução baixa de propósito: 2 metades de 240 px de largura
  const W = 480;
  const H = 120;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const half = W / 2;
  // Quantas "células" de ruído cabem em meia largura. Precisa ser inteiro para a repetição fechar.
  const base = Math.max(2, Math.round(6 * scale));

  // Densidade de cada pixel (0 a 1), calculada uma vez
  const density = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = ((x % half) / half) * base;
      const v = (y / H) * base * 0.5;
      let sum = 0;
      let amp = 0.5;
      let freq = 1;
      for (let o = 0; o < 5; o++) {
        sum += noise(u * freq, v * freq * 1.8, base * freq) * amp;
        amp *= 0.5;
        freq *= 2;
      }
      // Corta o ruído abaixo de `cover`: sobra céu aberto entre as nuvens
      const d = Math.max(0, (sum - cover) / (1 - cover));
      density[y * W + x] = Math.pow(d, 1.4);
    }
  }

  function paint() {
    const [r, g, b] = css('cloud-rgb').split(/\s+/).map(Number);
    const alpha = Number(css('cloud-a')) || 0.15;
    for (let i = 0; i < density.length; i++) {
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.min(255, density[i] * alpha * 255 * 2.2);
    }
    ctx.putImageData(img, 0, 0);
  }
  paint();
  window.addEventListener('deepthinker:theme', paint);
}
