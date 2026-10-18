import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { THEME_EVENT, getTheme } from '../lib/theme';

/** Lê uma cor do tema (ex.: "--accent" = "156 201 245") e devolve em hex, que é o que o mermaid entende. */
function cssHex(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return '#888888';
  return '#' + parts.slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** Texto escuro ou claro, o que ler melhor em cima dessa cor (fórmula de luminância da WCAG). */
function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.35 ? '#0a1a2b' : '#ffffff';
}

/**
 * As cores do diagrama saem do tema do app (Abismo, Glaciar, Grafite), para ele não
 * parecer colado de outro site. Cada ramo do mapa mental pega uma cor de cScale0..3.
 */
function themeVariables() {
  const text = cssHex('white');
  const branches = [cssHex('neutral-800'), cssHex('sky-800'), cssHex('emerald-800'), cssHex('amber-800')];
  const vars: Record<string, string> = {
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: '14px',
    primaryColor: cssHex('neutral-800'),
    primaryTextColor: text,
    primaryBorderColor: cssHex('accent'),
    secondaryColor: cssHex('neutral-900'),
    tertiaryColor: cssHex('neutral-900'),
    lineColor: cssHex('neutral-500'),
    textColor: text,
    mainBkg: cssHex('neutral-800'),
    nodeBorder: cssHex('neutral-600'),
    // A raiz do mapa mental usa git0 (sem isso ela sai preta): fica com a cor de destaque do tema.
    git0: cssHex('accent'),
    gitBranchLabel0: readableOn(cssHex('accent')),
  };
  for (let i = 0; i < 12; i++) {
    vars[`cScale${i}`] = branches[i % branches.length];
    vars[`cScaleLabel${i}`] = text;
    vars[`cScalePeer${i}`] = cssHex('neutral-600');
  }
  return vars;
}

/**
 * O mermaid desenha usando um elemento temporário no <body> e mede os textos nele.
 * Dois desenhos AO MESMO TEMPO atrapalham um ao outro (às vezes sai um diagrama com altura 0),
 * e isso acontece fácil: uma nota com vários diagramas, ou o React em modo de desenvolvimento,
 * que roda cada efeito duas vezes. Por isso os desenhos entram numa fila e saem um de cada vez,
 * cada um com um id novo.
 */
let queue: Promise<unknown> = Promise.resolve();
let seq = 0;

function renderInQueue(code: string): Promise<string> {
  const run = async () => {
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: themeVariables(),
    });
    const id = `mmd-${++seq}`;
    try {
      return (await mermaid.render(id, code)).svg;
    } finally {
      // Quando falha, o mermaid deixa o elemento temporário (ou um aviso de erro) solto no <body>.
      document.getElementById('d' + id)?.remove();
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/**
 * Desenha um bloco ```mermaid como diagrama, igual ao Obsidian.
 *
 * A biblioteca mermaid.js é grande (~1 MB), então ela só é baixada quando
 * a primeira nota com diagrama aparece na tela (import() dinâmico, "lazy loading").
 * securityLevel 'strict' impede que um diagrama rode scripts ou links perigosos.
 */
export const MermaidBlock: React.FC<{ code: string }> = ({ code }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setThemeState] = useState(getTheme());
  const box = useRef<HTMLDivElement>(null);

  // Diagrama largo numa gaveta estreita: encolher tudo deixaria o texto minúsculo. Então ele
  // encolhe até 75% do tamanho natural e, se ainda não couber, rola para o lado, começando
  // pelo meio (onde fica a raiz do mapa mental).
  useLayoutEffect(() => {
    const el = box.current;
    const node = el?.querySelector('svg');
    if (!el || !node) return;
    const natural = parseFloat(node.style.maxWidth);
    if (natural > 0) node.style.minWidth = `${Math.round(natural * 0.75)}px`;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [svg]);

  useEffect(() => {
    const onTheme = () => setThemeState(getTheme());
    window.addEventListener(THEME_EVENT, onTheme);
    return () => window.removeEventListener(THEME_EVENT, onTheme);
  }, []);

  useEffect(() => {
    let cancelled = false;
    renderInQueue(code.trim()).then(
      (out) => {
        if (cancelled) return;
        setSvg(out);
        setError(null);
      },
      (e) => {
        if (cancelled) return;
        setSvg(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [code, theme]);

  if (error) {
    return (
      <div className="my-3 rounded-xl border border-red-700/40 bg-red-950/20 p-3 text-xs">
        <div className="text-red-300 font-medium mb-1">Não consegui desenhar este diagrama</div>
        <pre className="whitespace-pre-wrap text-neutral-400 font-mono">{code}</pre>
      </div>
    );
  }
  if (!svg) {
    return <div className="my-3 h-24 rounded-xl border border-neutral-800 bg-neutral-900/40 animate-pulse" />;
  }
  return (
    <div
      ref={box}
      className="my-3 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 [&_svg]:mx-auto [&_svg]:max-w-full [&_svg]:h-auto"
      // O SVG vem do mermaid em modo 'strict', que já limpa scripts e eventos.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export default MermaidBlock;
