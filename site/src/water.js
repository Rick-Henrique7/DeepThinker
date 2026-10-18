// Linha d'água animada: a mesma do app (frontend/src/components/WaterLine.tsx),
// reescrita em JavaScript puro porque o site não usa React.
//
// Desenha em canvas 2D, sem bibliotecas. As cores vêm das variáveis --water-* do
// styles.css, então acompanham o tema. Devolve um objeto com `level` (0 = topo,
// 1 = base) que o GSAP pode animar: no topo do site, a água sobe quando você rola.
//
// Cuidados: com "reduzir movimento" desenha um quadro parado; pausa quando a aba
// fica oculta ou o canvas sai da tela (economiza bateria).

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
const rgba = (name, a) => `rgb(${css(name)} / ${a})`;

export function createWater(canvas, { level = 0.62, intensity = 1, speed = 1, reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  // Até 1,5 pixel por ponto: numa linha d'água macia a diferença para 2 ou 3 não aparece.
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const state = { level, intensity };
  let w = 0;
  let h = 0;
  let t = 0;
  let raf = 0;
  let visible = true;
  let colors;

  const readColors = () => {
    colors = {
      clear: rgba('water-body', 0),
      body: rgba('water-body', css('water-a1') || 0.55),
      deep: rgba('water-deep', css('water-a2') || 0.9),
      line: (a) => rgba('water-line', a),
    };
  };

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const base = h * state.level;
    const amp = state.intensity;

    // Corpo da água: o azul da marca (#072f4e) escurecendo até o fundo.
    const g = ctx.createLinearGradient(0, base - 40, 0, h);
    g.addColorStop(0, colors.clear);
    g.addColorStop(0.15, colors.body);
    g.addColorStop(1, colors.deep);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w + 8; x += 8) {
      ctx.lineTo(x, base + (Math.sin(x * 0.012 + t) * 5 + Math.sin(x * 0.031 - t * 1.3) * 2.5) * amp);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Reflexos: 4 linhas finas na cor de destaque, cada vez mais fracas e lentas.
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = colors.line(0.22 - i * 0.045);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w + 8; x += 8) {
        const y = base + 10 + i * 14 + Math.sin(x * (0.014 + i * 0.003) + t * (1 + i * 0.25)) * (3 + i) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function resize() {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  const loop = () => {
    t += 0.012 * speed;
    draw();
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (reducedMotion || raf || !visible || document.hidden) return;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  readColors();
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible ? start() : stop();
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  window.addEventListener('deepthinker:theme', () => {
    readColors();
    draw();
  });

  resize();
  start();
  // Com o movimento reduzido não há laço: quem mudar `level` chama redraw().
  state.redraw = draw;
  return state;
}
