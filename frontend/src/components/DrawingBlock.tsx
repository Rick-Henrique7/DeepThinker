import React, { Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Loader2, PenLine, X, Check } from 'lucide-react';
import { drawingTheme, loadExcalidraw, parseScene, EMPTY_DRAWING } from '../lib/drawing';

type ExcalidrawModule = Awaited<ReturnType<typeof loadExcalidraw>>;

/**
 * Bloco ```excalidraw no modo Ler: mostra o desenho como imagem (SVG).
 * Com onChange, ganha o botão "Editar desenho", que abre o editor em tela cheia.
 */
export function DrawingBlock({ code, onChange }: { code: string; onChange?: (json: string) => void }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'carregando' | 'pronto' | 'vazio' | 'erro'>('carregando');

  useEffect(() => {
    const scene = parseScene(code);
    if (!scene) {
      setState('erro');
      return;
    }
    if (scene.elements.length === 0) {
      setState('vazio');
      return;
    }
    let alive = true;
    setState('carregando');
    loadExcalidraw()
      .then(async (x) => {
        const svg = await x.exportToSvg({
          elements: scene.elements as Parameters<ExcalidrawModule['exportToSvg']>[0]['elements'],
          appState: { ...(scene.appState ?? {}), exportBackground: false, exportWithDarkMode: drawingTheme() === 'dark' },
          files: (scene.files ?? {}) as Parameters<ExcalidrawModule['exportToSvg']>[0]['files'],
          exportPadding: 12,
        });
        if (!alive || !box.current) return;
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Desenho');
        svg.style.maxWidth = '100%';
        svg.style.height = 'auto';
        svg.style.maxHeight = '480px';
        box.current.replaceChildren(svg);
        setState('pronto');
      })
      .catch(() => alive && setState('erro'));
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <figure className="my-3 rounded-xl border border-neutral-800 bg-neutral-950/60 p-2" data-drawing>
      {state === 'carregando' && (
        <div className="flex h-32 items-center justify-center text-neutral-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {state === 'vazio' && <p className="px-2 py-6 text-center text-xs text-neutral-500">Desenho em branco.</p>}
      {state === 'erro' && <p className="px-2 py-6 text-center text-xs text-rose-300">Não deu para ler este desenho.</p>}
      <div ref={box} className={`flex justify-center ${state === 'pronto' ? '' : 'hidden'}`} />
      {onChange && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            // No Canvas, apertar o botão não pode começar a arrastar o cartão
            onPointerDown={(e) => e.stopPropagation()}
            onClick={async () => {
              const json = await editDrawing(code);
              if (json !== null) onChange(json);
            }}
            className="flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 min-h-[44px] sm:min-h-[32px] text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
          >
            <PenLine className="h-3.5 w-3.5" /> Editar desenho
          </button>
        </div>
      )}
    </figure>
  );
}

const LazyExcalidraw = React.lazy(() => loadExcalidraw().then((m) => ({ default: m.Excalidraw })));

/**
 * Abre o editor de desenho em tela cheia e espera: devolve o JSON salvo, ou null se cancelou.
 *
 * Roda numa "raiz" React própria, presa direto no <body>: assim o editor não fica preso dentro
 * de um cartão do Canvas (que tem zoom), e as teclas do desenho não chegam aos atalhos de lá.
 */
export function editDrawing(initial: string = EMPTY_DRAWING): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (json: string | null) => {
      root.unmount();
      host.remove();
      resolve(json);
    };
    root.render(<DrawingEditor initial={initial} onSave={(json) => close(json)} onCancel={() => close(null)} />);
  });
}

/** Editor do Excalidraw em tela cheia. Salvar devolve o JSON da cena (compacto). */
function DrawingEditor({ initial = EMPTY_DRAWING, onSave, onCancel }: {
  initial?: string;
  onSave: (json: string) => void;
  onCancel: () => void;
}) {
  const api = useRef<{ getSceneElements: () => readonly unknown[]; getAppState: () => unknown; getFiles: () => unknown } | null>(null);
  const [saving, setSaving] = useState(false);
  const scene = parseScene(initial) ?? { elements: [] };

  // Sem rolar a página de trás enquanto desenha
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const save = async () => {
    if (!api.current) return;
    setSaving(true);
    const x = await loadExcalidraw();
    const raw = x.serializeAsJSON(
      api.current.getSceneElements() as Parameters<typeof x.serializeAsJSON>[0],
      api.current.getAppState() as Parameters<typeof x.serializeAsJSON>[1],
      api.current.getFiles() as Parameters<typeof x.serializeAsJSON>[2],
      'local'
    );
    // Uma linha só: o bloco fica menor dentro da nota
    onSave(JSON.stringify(JSON.parse(raw)));
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Editor de desenho" className="fixed inset-0 z-[80] flex flex-col bg-neutral-950">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
          <PenLine className="h-4 w-4" /> Desenho
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 min-h-[44px] text-sm text-neutral-300 hover:bg-neutral-800"
          >
            <X className="h-4 w-4" /> Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-full bg-white px-4 min-h-[44px] text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar desenho
          </button>
        </div>
      </div>
      <div className="relative flex-1" data-drawing-editor>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center gap-2 text-sm text-neutral-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Abrindo o editor de desenho...
            </div>
          }
        >
          <LazyExcalidraw
            excalidrawAPI={(a) => {
              api.current = a as unknown as typeof api.current;
            }}
            initialData={{
              elements: scene.elements as never,
              appState: { ...(scene.appState ?? {}), theme: drawingTheme() } as never,
              files: (scene.files ?? {}) as never,
            }}
            theme={drawingTheme()}
            langCode="pt-BR"
            UIOptions={{
              tools: { image: false },
              canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: true },
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
