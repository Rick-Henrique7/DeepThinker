/**
 * Desenho à mão livre (Excalidraw) dentro das notas e dos cartões do Canvas.
 *
 * O desenho é guardado no próprio texto, num bloco de código:
 *
 *   ```excalidraw
 *   {"type":"excalidraw","elements":[...],"appState":{...}}
 *   ```
 *
 * Assim ele vai junto para o histórico de versões, para a edição em conjunto e para o Canvas,
 * sem tabela nova. No modo Ler o bloco vira a imagem do desenho (ver DrawingBlock).
 */

export const DRAWING_LANG = 'excalidraw';

/** Onde ficam as fontes do Excalidraw (copiadas para public/, sem depender de CDN). */
export const EXCALIDRAW_ASSETS = `${import.meta.env.BASE_URL}excalidraw/`;

export const EMPTY_DRAWING = JSON.stringify({ type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} });

const BLOCK = /```excalidraw[^\n]*\n([\s\S]*?)\n?```/g;

/** O JSON de cada bloco de desenho, na ordem em que aparecem no texto. */
export function drawingsIn(content: string): string[] {
  return [...content.matchAll(BLOCK)].map((m) => m[1]);
}

/** Troca o JSON do n-ésimo bloco de desenho (0 = o primeiro). */
export function replaceDrawing(content: string, index: number, json: string): string {
  let i = -1;
  return content.replace(BLOCK, (whole) => {
    i++;
    return i === index ? '```excalidraw\n' + json + '\n```' : whole;
  });
}

/** Põe um bloco de desenho no fim do texto (ou no ponto indicado). */
export function insertDrawing(content: string, json: string, at?: number): string {
  const block = '```excalidraw\n' + json + '\n```';
  if (at === undefined || at < 0 || at > content.length) {
    return `${content.replace(/\s*$/, '')}${content.trim() ? '\n\n' : ''}${block}\n`;
  }
  const before = content.slice(0, at).replace(/[ \t]*$/, '');
  const after = content.slice(at);
  return `${before}${before && !before.endsWith('\n') ? '\n\n' : ''}${block}\n${after.startsWith('\n') ? '' : '\n'}${after}`;
}

export interface Scene {
  elements: readonly unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

export function parseScene(json: string): Scene | null {
  try {
    const s = JSON.parse(json);
    return s && Array.isArray(s.elements) ? s : null;
  } catch {
    return null;
  }
}

/** Tema do app → tema do Excalidraw. */
export function drawingTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'glaciar' ? 'light' : 'dark';
}

/** Carrega o Excalidraw só quando precisa (é grande): a primeira vez demora um pouco. */
export async function loadExcalidraw() {
  (window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = EXCALIDRAW_ASSETS;
  const [mod] = await Promise.all([import('@excalidraw/excalidraw'), import('@excalidraw/excalidraw/index.css')]);
  return mod;
}
