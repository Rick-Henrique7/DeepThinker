import React, { useEffect, useRef } from 'react';
import { THEME_EVENT, themeColor, themeNumber } from '../lib/theme';

/**
 * Linha d'água animada (a mesma do painel de referências).
 *
 * Fica atrás do conteúdo, ocupando o elemento pai inteiro: o pai precisa ter
 * `position: relative` (classe `relative` do Tailwind). Desenha em canvas 2D,
 * sem bibliotecas, então custa pouco.
 *
 * Cuidados com quem usa:
 * - Com "reduzir movimento" ligado no sistema, desenha um quadro parado.
 * - Pausa quando a aba fica oculta ou quando sai da tela (economiza bateria).
 * - pointer-events: none, então nunca atrapalha cliques.
 */
interface WaterLineProps {
  /** Altura da linha d'água, de 0 (topo) a 1 (base). Padrão 0.62. */
  level?: number;
  /** Força das ondas: 1 = como no painel; 0.5 = mais calma. */
  intensity?: number;
  /** Velocidade das ondas: 1 = como no painel; 2 = o dobro. */
  speed?: number;
  /** Opacidade geral, para usar mais discreta dentro de telas de trabalho. */
  opacity?: number;
  /** Esmaece as laterais, para quando a água não ocupa a tela toda (ex.: área do chat). */
  fadeEdges?: boolean;
  className?: string;
}

export const WaterLine: React.FC<WaterLineProps> = ({ level = 0.62, intensity = 1, speed = 1, opacity = 1, fadeEdges = false, className = '' }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let t = 0;
    let raf = 0;
    let visible = true;

    // Cores do tema atual (variáveis --water-* do index.css); relidas quando o tema muda
    let colors = { clear: '', body: '', deep: '', line: (_a: number) => '' };
    const readColors = () => {
      colors = {
        clear: themeColor('water-body', 0),
        body: themeColor('water-body', themeNumber('water-a1', 0.55)),
        deep: themeColor('water-deep', themeNumber('water-a2', 0.9)),
        line: (a: number) => themeColor('water-line', a),
      };
    };
    readColors();

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const base = h * level;
      const amp = intensity;

      // Corpo da água: no Abismo, o azul da marca (#072f4e) escurecendo até o fundo.
      const g = ctx.createLinearGradient(0, base - 40, 0, h);
      g.addColorStop(0, colors.clear);
      g.addColorStop(0.15, colors.body);
      g.addColorStop(1, colors.deep);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        ctx.lineTo(x, base + (Math.sin(x * 0.012 + t) * 5 + Math.sin(x * 0.031 - t * 1.3) * 2.5) * amp);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      // Reflexos: 4 linhas finas na cor de destaque do tema, cada vez mais fracas e lentas.
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = colors.line(0.22 - i * 0.045);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const y = base + 10 + i * 14 + Math.sin(x * (0.014 + i * 0.003) + t * (1 + i * 0.25)) * (3 + i) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    const loop = () => {
      t += 0.012 * speed;
      draw();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (reduce || raf || !visible || document.hidden) return;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);
    const onTheme = () => {
      readColors();
      draw();
    };
    window.addEventListener(THEME_EVENT, onTheme);

    resize();
    start();
    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener(THEME_EVENT, onTheme);
    };
  }, [level, intensity, speed]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      style={{
        opacity,
        ...(fadeEdges && {
          maskImage: 'linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)',
        }),
      }}
    />
  );
};
