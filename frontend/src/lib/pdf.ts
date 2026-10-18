/**
 * PDF no navegador com o pdf.js (o mesmo leitor de PDF que vem dentro do Firefox).
 *
 * Como ele funciona, em três camadas por página:
 *   1. canvas: a página desenhada como imagem (é o que você vê);
 *   2. camada de texto: o texto da página em <span> transparentes, cada um em cima da palavra
 *      desenhada. É ela que deixa selecionar texto com o mouse ou o dedo;
 *   3. a nossa camada de grifos, entre as duas, com os retângulos coloridos.
 *
 * O pdf.js é grande (~1 MB), então só é baixado quando o Leitor abre um PDF (import dinâmico).
 * Usamos a versão "legacy", que funciona também em navegadores e WebViews mais antigos
 * (o app desktop usa o WebView do sistema).
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { HighlightRect } from './documents';

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let loading: Promise<Pdfjs> | null = null;

export function loadPdfjs(): Promise<Pdfjs> {
  loading ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    // ?url: o Vite entrega só o endereço do arquivo. O "worker" lê o PDF numa thread separada,
    // para a página não travar enquanto um PDF grande é aberto.
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return loading;
}

/** Arquivos de apoio do pdf.js, servidos em /pdfjs/ (ver o plugin no vite.config.ts). */
const ASSETS = `${import.meta.env.BASE_URL}pdfjs/`;

export async function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({
    data,
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
  }).promise;
}

const round = (v: number) => Math.round(v * 100_000) / 100_000;

/** Duas caixas estão na mesma linha se a altura delas se sobrepõe em mais da metade. */
function sameLine(a: HighlightRect, b: HighlightRect) {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return bottom - top > 0.5 * Math.min(a.h, b.h);
}

/**
 * O navegador devolve uma caixa para cada pedacinho de texto selecionado (o pdf.js quebra as
 * linhas em vários <span>). Aqui juntamos as caixas da mesma linha que se tocam: o grifo fica
 * com um retângulo por linha, como um marca-texto de verdade.
 */
export function mergeRects(rects: HighlightRect[]): HighlightRect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: HighlightRect[] = [];
  const GAP = 0.012; // ~1% da largura da página: o espaço entre duas palavras
  for (const r of sorted) {
    const line = out.find((o) => sameLine(o, r) && r.x <= o.x + o.w + GAP && r.x + r.w >= o.x - GAP);
    if (!line) {
      out.push({ ...r });
      continue;
    }
    const x = Math.min(line.x, r.x);
    const y = Math.min(line.y, r.y);
    line.w = Math.max(line.x + line.w, r.x + r.w) - x;
    line.h = Math.max(line.y + line.h, r.y + r.h) - y;
    line.x = x;
    line.y = y;
  }
  return out.map((r) => ({ x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }));
}

/**
 * Onde está a seleção, em FRAÇÕES da página. Guardar frações (e não pixels) faz o grifo cair
 * no mesmo lugar com qualquer zoom e em qualquer tela.
 */
export function selectionRects(range: Range, page: HTMLElement): HighlightRect[] {
  const box = page.getBoundingClientRect();
  if (!box.width || !box.height) return [];
  const rects = Array.from(range.getClientRects())
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) => ({
      x: Math.max(0, (r.left - box.left) / box.width),
      y: Math.max(0, (r.top - box.top) / box.height),
      w: r.width / box.width,
      h: r.height / box.height,
    }))
    // Caixas enormes são de elementos de apoio do pdf.js, não de texto.
    .filter((r) => r.h < 0.2 && r.x < 1 && r.y < 1)
    .map((r) => ({ ...r, w: Math.min(r.w, 1 - r.x), h: Math.min(r.h, 1 - r.y) }));
  return mergeRects(rects);
}

/**
 * Limpa o texto copiado do PDF: as quebras de linha do fim de cada linha viram espaço
 * (o servidor junta) e a palavra hifenizada na quebra volta a ser uma só ("estra-\ntégia").
 */
export function cleanQuote(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** O ponto (em frações da página) cai dentro de algum retângulo do grifo? */
export function hitsRects(rects: HighlightRect[], x: number, y: number, slop = 0.004): boolean {
  return rects.some((r) => x >= r.x - slop && x <= r.x + r.w + slop && y >= r.y - slop && y <= r.y + r.h + slop);
}
