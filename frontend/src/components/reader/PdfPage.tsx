import React, { memo, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { Highlight } from '../../lib/documents';
import { loadPdfjs } from '../../lib/pdf';

interface PdfPageProps {
  doc: PDFDocumentProxy;
  number: number;
  /** Largura da página na tela, em px (já com o zoom). */
  width: number;
  /** Tamanho da página em pontos do PDF (escala 1). */
  size: { w: number; h: number };
  /** Está perto da parte visível da tela: só então desenha (economiza memória em PDFs longos). */
  near: boolean;
  highlights: Highlight[];
  activeId: number | null;
  flashId: number | null;
}

/** Limite de pixels do canvas: telas 4K com zoom alto passariam de 100 MB por página. */
const MAX_PIXELS = 16_000_000;

/**
 * Uma página do PDF: canvas (a imagem), grifos e camada de texto (para selecionar).
 * data-page fica no elemento de fora: o Leitor usa para saber em que página está a seleção.
 */
export const PdfPage = memo(function PdfPage({ doc, number, width, size, near, highlights, activeId, flashId }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'ok' | 'erro'>('idle');
  const scale = width / size.w;
  const height = Math.round(size.h * scale);

  useEffect(() => {
    if (!near) {
      // Longe da tela: solta a memória do desenho. Volta a desenhar quando chegar perto.
      const c = canvasRef.current;
      if (c) {
        c.width = 0;
        c.height = 0;
      }
      textRef.current?.replaceChildren();
      setState('idle');
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    let textLayer: { cancel: () => void } | null = null;
    (async () => {
      try {
        const [pdfjs, page] = await Promise.all([loadPdfjs(), doc.getPage(number)]);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current!;
        // Tela "retina": desenha com mais pixels do que o tamanho em CSS, senão fica borrado.
        let ratio = Math.min(window.devicePixelRatio || 1, 2);
        if (viewport.width * viewport.height * ratio * ratio > MAX_PIXELS) {
          ratio = Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height));
        }
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        task = page.render({
          canvas,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        await task.promise;
        if (cancelled) return;

        const container = textRef.current!;
        container.replaceChildren();
        const layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container, viewport });
        textLayer = layer;
        await layer.render();
        if (!cancelled) setState('ok');
      } catch (e) {
        // Cancelar (rolou para longe, mudou o zoom) não é erro.
        if (!cancelled && (e as { name?: string })?.name !== 'RenderingCancelledException') setState('erro');
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
  }, [doc, number, scale, near]);

  return (
    <div
      data-page={number}
      className="pdf-page paper relative mx-auto shadow-lg shadow-black/30 [isolation:isolate]"
      style={{ width, height, '--total-scale-factor': scale } as React.CSSProperties}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      {/* Grifos: entre o desenho e a camada de texto, para a seleção continuar funcionando por cima. */}
      <div className="absolute inset-0" aria-hidden>
        {highlights.flatMap((h) =>
          h.rects.map((r, i) => (
            <div
              key={`${h.id}-${i}`}
              data-highlight={h.id}
              className={`hl hl-${h.color} ${activeId === h.id ? 'hl-active' : ''} ${flashId === h.id ? 'hl-flash' : ''}`}
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            />
          ))
        )}
      </div>
      <div ref={textRef} className="textLayer" />
      {state !== 'ok' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500 pointer-events-none">
          {state === 'erro' ? 'Não deu para desenhar esta página.' : `Página ${number}`}
        </div>
      )}
    </div>
  );
});
