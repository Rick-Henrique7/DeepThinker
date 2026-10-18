import React, { forwardRef, memo, useMemo } from 'react';
import type { Highlight } from '../../lib/documents';

/** Um grifo já localizado no texto (start/end conferidos com o texto de agora). */
export interface PlacedHighlight {
  highlight: Highlight;
  start: number;
  end: number;
}

/**
 * Confere onde cada grifo está no texto. O normal é o texto da posição guardada ser igual ao
 * trecho; se o texto mudou (por exemplo, a nota do documento foi editada), procura o trecho e
 * fica com a ocorrência mais perto da posição antiga. Se não achar, o grifo fica só na lista.
 */
export function placeHighlights(text: string, highlights: Highlight[]): PlacedHighlight[] {
  const placed: PlacedHighlight[] = [];
  for (const h of highlights) {
    if (h.start === null || h.end === null) continue;
    if (text.slice(h.start, h.end) === h.quote) {
      placed.push({ highlight: h, start: h.start, end: h.end });
      continue;
    }
    let best = -1;
    for (let i = text.indexOf(h.quote); i >= 0; i = text.indexOf(h.quote, i + 1)) {
      if (best < 0 || Math.abs(i - h.start) < Math.abs(best - h.start)) best = i;
    }
    if (best >= 0) placed.push({ highlight: h, start: best, end: best + h.quote.length });
  }
  return placed;
}

/** Posição (em caracteres) de um ponto da seleção dentro do texto inteiro. */
export function offsetIn(container: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(container);
  r.setEnd(node, offset);
  return r.toString().length;
}

interface TextDocumentProps {
  text: string;
  placed: PlacedHighlight[];
  activeId: number | null;
  flashId: number | null;
}

/**
 * Um TXT ou MD (ou o texto extraído de um documento antigo) como uma página de papel.
 * O texto aparece exatamente como está no arquivo (white-space: pre-wrap), e os grifos são
 * <mark>. Assim a posição de cada letra na tela bate com a posição no texto guardado.
 */
export const TextDocument = memo(
  forwardRef<HTMLDivElement, TextDocumentProps>(function TextDocument({ text, placed, activeId, flashId }, ref) {
    // Corta o texto em pedaços nas bordas dos grifos. Se dois grifos se sobrepõem,
    // o pedaço em comum fica com a cor do mais recente.
    const parts = useMemo(() => {
      const cuts = new Set<number>([0, text.length]);
      for (const p of placed) {
        cuts.add(p.start);
        cuts.add(p.end);
      }
      const points = [...cuts].filter((c) => c >= 0 && c <= text.length).sort((a, b) => a - b);
      const out: { from: number; to: number; h: Highlight | null }[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const from = points[i];
        const to = points[i + 1];
        const covering = placed.filter((p) => p.start <= from && p.end >= to);
        const top = covering.sort((a, b) => b.highlight.id - a.highlight.id)[0]?.highlight ?? null;
        out.push({ from, to, h: top });
      }
      return out;
    }, [text, placed]);

    return (
      <div
        ref={ref}
        data-text-document
        className="paper mx-auto max-w-[46rem] rounded-sm px-5 py-6 sm:px-10 sm:py-10 shadow-lg shadow-black/30 whitespace-pre-wrap break-words text-[15px] sm:text-base leading-[1.75] selection:bg-[rgb(0_90_255/0.25)]"
      >
        {parts.map((p) =>
          p.h ? (
            <mark
              key={p.from}
              data-highlight={p.h.id}
              className={`hl-text hl-${p.h.color} ${activeId === p.h.id ? 'hl-active' : ''} ${flashId === p.h.id ? 'hl-flash' : ''}`}
            >
              {text.slice(p.from, p.to)}
            </mark>
          ) : (
            <React.Fragment key={p.from}>{text.slice(p.from, p.to)}</React.Fragment>
          )
        )}
      </div>
    );
  })
);
