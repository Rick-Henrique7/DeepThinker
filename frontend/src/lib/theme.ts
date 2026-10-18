/**
 * Tema visual do app: Abismo (padrão), Glaciar (claro) ou Grafite.
 *
 * Como funciona: o tema escolhido vira um atributo no <html> (data-theme="glaciar").
 * O src/index.css tem as cores de cada tema nesse seletor, e o Tailwind lê essas cores.
 * A escolha fica salva no navegador (localStorage), por aparelho.
 */
export type ThemeId = 'abismo' | 'glaciar' | 'grafite';

export const THEMES: { id: ThemeId; label: string; description: string; swatches: string[] }[] = [
  {
    id: 'abismo',
    label: 'Abismo',
    description: 'Escuro, o azul de baixo d’água. É o padrão.',
    swatches: ['#02070d', '#072f4e', '#0f3a5f', '#9cc9f5', '#e8f1f9'],
  },
  {
    id: 'glaciar',
    label: 'Glaciar',
    description: 'Claro, papel gelo com tinta azul. Bom para ler muito.',
    swatches: ['#eef3f7', '#ffffff', '#d5e0e9', '#1d6fb8', '#072f4e'],
  },
  {
    id: 'grafite',
    label: 'Grafite',
    description: 'Escuro neutro, mais próximo do visual antigo.',
    swatches: ['#07090c', '#11161d', '#2f343c', '#7fb0e6', '#ececef'],
  },
];

const STORAGE_KEY = 'deepthinker.theme';
/** Evento disparado ao trocar de tema; canvas (grafo, água) escutam para redesenhar. */
export const THEME_EVENT = 'deepthinker:theme';

const isTheme = (v: unknown): v is ThemeId => v === 'abismo' || v === 'glaciar' || v === 'grafite';

export function getTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    // navegador sem localStorage (modo privado etc.): fica no padrão
  }
  return 'abismo';
}

export function applyTheme(theme: ThemeId = getTheme()) {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: ThemeId) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // sem localStorage o tema vale só até fechar a aba
  }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

/**
 * Lê uma cor do tema atual para usar em canvas, que não entende classes do Tailwind.
 * Ex.: themeColor('graph-label', 0.9) -> "rgba(232, 241, 249, 0.9)".
 */
export function themeColor(name: string, alpha = 1): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  const [r, g, b] = raw.split(/\s+/).map(Number);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(128, 128, 128, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Lê um número do tema atual (ex.: a opacidade da água). */
export function themeNumber(name: string, fallback: number): number {
  const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--${name}`));
  return Number.isNaN(n) ? fallback : n;
}
