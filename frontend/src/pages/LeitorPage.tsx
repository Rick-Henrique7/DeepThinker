import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  AlertTriangle,
  ArrowLeft,
  FileText,
  Highlighter,
  Loader2,
  MessageSquarePlus,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { NoteDrawer } from '../components/NoteDrawer';
import { useConfirm } from '../components/ConfirmDialog';
import { PdfPage } from '../components/reader/PdfPage';
import { TextDocument, offsetIn, placeHighlights } from '../components/reader/TextDocument';
import type { LinkItem, NodeItem } from '../components/KnowledgeGraph';
import { api } from '../lib/api';
import {
  HIGHLIGHT_COLORS,
  documentsApi,
  type DocumentFile,
  type Highlight,
  type HighlightColor,
  type HighlightRect,
} from '../lib/documents';
import { NOTES_CHANGED_EVENT, extractSection, notesApi, notifyNotesChanged, splitFrontmatter, type NoteDetail } from '../lib/notes';
import { cleanQuote, hitsRects, openPdf, selectionRects } from '../lib/pdf';

/** O que está aberto no menu que flutua perto da seleção. */
type Menu =
  | { kind: 'novo'; quote: string; page?: number; rects?: HighlightRect[]; start?: number; end?: number; anchor: () => DOMRect | null }
  | { kind: 'aviso'; text: string; anchor: () => DOMRect | null }
  | { kind: 'grifo'; highlight: Highlight; anchor: () => DOMRect | null };

const MAX_QUOTE = 3000;
const NO_HIGHLIGHTS: Highlight[] = [];
const PAGE_MAX = 880; // largura máxima da página com zoom 100%
const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
const COLOR_KEY = 'deepthinker.highlightColor';

function savedColor(): HighlightColor {
  try {
    const c = localStorage.getItem(COLOR_KEY);
    if (HIGHLIGHT_COLORS.some((h) => h.key === c)) return c as HighlightColor;
  } catch {
    // modo anônimo ou armazenamento bloqueado: fica o amarelo
  }
  return 'amarelo';
}

/** Mesma ordem do servidor: página, altura na página, posição no texto. */
function byReadingOrder(a: Highlight, b: Highlight) {
  return (
    (a.page ?? Infinity) - (b.page ?? Infinity) ||
    (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0) ||
    (a.start ?? 0) - (b.start ?? 0) ||
    a.id - b.id
  );
}

/**
 * /leitor/:id — o documento importado, para ler e grifar.
 *
 * PDF: as páginas de verdade, desenhadas pelo pdf.js. TXT/MD: o texto do arquivo como uma página.
 * Documentos importados antes do Leitor (sem o arquivo guardado) mostram o texto extraído.
 *
 * Selecione um trecho e escolha uma cor: o grifo vira uma nota ligada ao documento,
 * com o trecho em citação. Clicar num grifo mostra a nota dele.
 */
export function LeitorPage() {
  const { id } = useParams();
  const docId = Number(id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [file, setFile] = useState<DocumentFile | null | undefined>(undefined);
  const [pdf, setPdf] = useState<{ doc: PDFDocumentProxy; sizes: { w: number; h: number }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [zoom, setZoom] = useState(1);
  const [columnWidth, setColumnWidth] = useState(0);
  const [near, setNear] = useState<Set<number>>(() => new Set([1, 2]));
  const [currentPage, setCurrentPage] = useState(1);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [color, setColor] = useState<HighlightColor>(savedColor);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; noteId: number } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [openNoteId, setOpenNoteId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [graph, setGraph] = useState<{ nodes: NodeItem[]; links: LinkItem[] } | null>(null);

  const column = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const attachInput = useRef<HTMLInputElement>(null);
  /** Enquanto a pessoa mexe no menu, a seleção pode sumir (toque no celular): não fecha o menu. */
  const inMenu = useRef(false);

  // ------------------------------------------------------------ carregar

  useEffect(() => {
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;
    setNote(null);
    setFile(undefined);
    setPdf(null);
    setError(null);
    (async () => {
      try {
        const n = await notesApi.get(docId);
        if (cancelled) return;
        if (n.source_type !== 'document') {
          setError('Esta nota não é um documento importado. O Leitor abre os PDFs, TXTs e MDs que você importou.');
          return;
        }
        setNote(n);
        // Primeiro os dados do documento: se o original não está guardado (kind null), nem pede o
        // arquivo. Assim um documento antigo não gera um erro 404 no console.
        const [info, hs] = await Promise.all([documentsApi.get(docId), documentsApi.highlights(docId)]);
        const f = info.kind ? await documentsApi.file(docId) : null;
        if (cancelled) return;
        setHighlights(hs);
        setFile(f);
        if (f?.kind === 'pdf') {
          const doc = await openPdf(f.data);
          opened = doc;
          if (cancelled) return;
          // O tamanho de cada página antes de desenhar: assim a rolagem já tem a altura certa.
          const sizes = await Promise.all(
            Array.from({ length: doc.numPages }, (_, i) =>
              doc.getPage(i + 1).then((p) => {
                const v = p.getViewport({ scale: 1 });
                return { w: v.width, h: v.height };
              })
            )
          );
          if (!cancelled) setPdf({ doc, sizes });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Não deu para abrir o documento.');
      }
    })();
    return () => {
      cancelled = true;
      opened?.loadingTask.destroy(); // libera o worker e a memória do PDF
    };
  }, [docId, reloadKey]);

  // Destaque apagado ou editado pela gaveta da nota: a lista acompanha.
  useEffect(() => {
    const reload = () =>
      documentsApi
        .highlights(docId)
        .then(setHighlights)
        .catch(() => undefined);
    window.addEventListener(NOTES_CHANGED_EVENT, reload);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, reload);
  }, [docId]);

  useEffect(() => {
    // Busca de novo a cada nota aberta: um grifo novo já aparece no grafo local.
    if (openNoteId === null) return;
    api.get<{ nodes: NodeItem[]; links: LinkItem[] }>('/graph').then(setGraph).catch(() => undefined);
  }, [openNoteId]);

  /** O texto mostrado quando não é PDF. Sem o arquivo: o texto da nota, sem o cabeçalho e o mapa mental. */
  const text = useMemo(() => {
    if (file?.kind === 'text') return file.text;
    if (file !== null || !note) return '';
    const body = splitFrontmatter(note.content ?? '').body;
    const map = extractSection(body, 'Mapa mental');
    return (map ? body.replace(map, '') : body).replace(/^\n+/, '');
  }, [file, note]);
  const mode: 'pdf' | 'texto' | null = file === undefined ? null : file?.kind === 'pdf' ? 'pdf' : 'texto';
  const placed = useMemo(() => (mode === 'texto' ? placeHighlights(text, highlights) : []), [mode, text, highlights]);
  const missing = mode === 'texto' ? highlights.filter((h) => !placed.some((p) => p.highlight.id === h.id)) : [];
  // Os grifos de cada página. A mesma lista vazia para todas as páginas sem grifo: assim o
  // React.memo da página não redesenha as 300 páginas a cada rolagem.
  const byPage = useMemo(() => {
    const m = new Map<number, Highlight[]>();
    for (const h of highlights) if (h.page !== null) m.set(h.page, [...(m.get(h.page) ?? []), h]);
    return m;
  }, [highlights]);

  // ------------------------------------------------------------ largura, páginas visíveis, página atual

  useLayoutEffect(() => {
    const el = column.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setColumnWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const pageWidth = Math.max(240, Math.round(Math.min(columnWidth || PAGE_MAX, PAGE_MAX) * zoom));

  // Ao mudar o zoom, continua no mesmo ponto do documento (e não pula para outra página).
  const scrollRatio = useRef<number | null>(null);
  const changeZoom = (next: number) => {
    const el = column.current;
    if (el && el.scrollHeight > 0) scrollRatio.current = (el.scrollTop + el.clientHeight / 2) / el.scrollHeight;
    setZoom(next);
  };
  useLayoutEffect(() => {
    const el = column.current;
    if (!el || scrollRatio.current === null) return;
    el.scrollTop = scrollRatio.current * el.scrollHeight - el.clientHeight / 2;
    scrollRatio.current = null;
  }, [pageWidth]);

  useEffect(() => {
    if (!pdf || !column.current) return;
    const pages = Array.from(column.current.querySelectorAll<HTMLElement>('[data-page]'));
    // "Perto": a até uma tela e meia de distância. Só essas páginas ficam desenhadas.
    const nearObs = new IntersectionObserver(
      (entries) =>
        setNear((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        }),
      { root: column.current, rootMargin: '150% 0px' }
    );
    const ratios = new Map<number, number>();
    const currentObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio);
        let best = 1;
        let bestRatio = -1;
        ratios.forEach((r, n) => {
          if (r > bestRatio) {
            best = n;
            bestRatio = r;
          }
        });
        setCurrentPage(best);
      },
      { root: column.current, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );
    pages.forEach((p) => {
      nearObs.observe(p);
      currentObs.observe(p);
    });
    return () => {
      nearObs.disconnect();
      currentObs.disconnect();
    };
  }, [pdf, pageWidth]);

  // ------------------------------------------------------------ seleção -> menu

  const readSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      if (!inMenu.current && !commenting) setMenu((m) => (m?.kind === 'grifo' ? m : null));
      return;
    }
    // Uma cópia: a seleção do navegador muda (some ao tocar no menu), a cópia não.
    const range = sel.getRangeAt(0).cloneRange();
    const elementOf = (n: Node) => (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement);
    const anchor = () => {
      const r = range.getBoundingClientRect();
      return r.width || r.height ? r : null;
    };

    if (mode === 'pdf') {
      const startPage = elementOf(range.startContainer)?.closest<HTMLElement>('[data-page]');
      const endPage = elementOf(range.endContainer)?.closest<HTMLElement>('[data-page]');
      if (!startPage || !column.current?.contains(startPage)) return;
      if (startPage !== endPage) {
        setMenu({ kind: 'aviso', text: 'Grife dentro de uma página por vez.', anchor });
        return;
      }
      const quote = cleanQuote(sel.toString());
      const rects = selectionRects(range, startPage);
      if (!quote || !rects.length) return;
      if (quote.length > MAX_QUOTE) {
        setMenu({ kind: 'aviso', text: 'Trecho grande demais para um grifo só. Escolha um pedaço menor.', anchor });
        return;
      }
      setMenu({ kind: 'novo', quote, page: Number(startPage.dataset.page), rects, anchor });
    } else if (mode === 'texto') {
      const box = textRef.current;
      if (!box || !box.contains(range.startContainer) || !box.contains(range.endContainer)) return;
      let start = offsetIn(box, range.startContainer, range.startOffset);
      let end = offsetIn(box, range.endContainer, range.endOffset);
      // Sem espaços nas pontas: o trecho guardado é exatamente o texto grifado.
      while (start < end && /\s/.test(text[start])) start++;
      while (end > start && /\s/.test(text[end - 1])) end--;
      if (end <= start) return;
      if (end - start > MAX_QUOTE) {
        setMenu({ kind: 'aviso', text: 'Trecho grande demais para um grifo só. Escolha um pedaço menor.', anchor });
        return;
      }
      setMenu({ kind: 'novo', quote: text.slice(start, end), start, end, anchor });
    }
  }, [mode, text, commenting]);

  useEffect(() => {
    let t: number | undefined;
    const onChange = () => {
      window.clearTimeout(t);
      t = window.setTimeout(readSelection, 140); // espera a pessoa terminar de arrastar
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('selectionchange', onChange);
    };
  }, [readSelection]);

  // Menu novo: começa sem comentário e sem erro.
  useEffect(() => {
    if (menu?.kind !== 'novo') {
      setCommenting(false);
      setComment('');
    }
    setMenuError(null);
  }, [menu]);

  /** Clique sem seleção: caiu em cima de um grifo? Então mostra o grifo. */
  const onColumnClick = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    let hit: Highlight | undefined;
    let anchor: (() => DOMRect | null) | null = null;
    const page = (e.target as Element).closest<HTMLElement>('[data-page]');
    if (page) {
      const box = page.getBoundingClientRect();
      const x = (e.clientX - box.left) / box.width;
      const y = (e.clientY - box.top) / box.height;
      const n = Number(page.dataset.page);
      hit = [...highlights].reverse().find((h) => h.page === n && hitsRects(h.rects, x, y));
      const line = hit?.rects.find((r) => hitsRects([r], x, y));
      // O menu fica embaixo da linha clicada, no ponto do clique (e acompanha a rolagem).
      if (line) {
        anchor = () => {
          const b = page.getBoundingClientRect();
          return new DOMRect(b.left + x * b.width, b.top + line.y * b.height, 1, line.h * b.height);
        };
      }
    } else {
      const mark = (e.target as Element).closest('[data-highlight]');
      hit = highlights.find((h) => h.id === Number(mark?.getAttribute('data-highlight')));
      if (mark) anchor = () => mark.getBoundingClientRect();
    }
    if (!hit || !anchor) {
      setActiveId(null);
      if (menu?.kind === 'grifo') setMenu(null);
      return;
    }
    setActiveId(hit.id);
    setMenu({ kind: 'grifo', highlight: hit, anchor });
  };

  // ------------------------------------------------------------ criar e apagar

  const pickColor = (c: HighlightColor) => {
    setColor(c);
    try {
      localStorage.setItem(COLOR_KEY, c);
    } catch {
      // sem armazenamento: a cor vale só agora
    }
  };

  const create = async (c: HighlightColor) => {
    if (menu?.kind !== 'novo' || saving) return;
    pickColor(c);
    setSaving(true);
    setMenuError(null);
    try {
      const { quote, page, rects, start, end } = menu;
      const h = await documentsApi.addHighlight(docId, {
        quote,
        color: c,
        comment: comment.trim() || undefined,
        ...(page !== undefined ? { page, rects } : { start, end }),
      });
      setHighlights((hs) => [...hs, h].sort(byReadingOrder));
      window.getSelection()?.removeAllRanges();
      setMenu(null);
      setNotice({ text: `Grifo salvo como a nota ${h.title}`, noteId: h.id });
      notifyNotesChanged();
    } catch (e) {
      setMenuError(e instanceof Error ? e.message : 'Não deu para salvar o grifo.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (h: Highlight) => {
    const ok = await confirm({
      title: 'Apagar este grifo?',
      message: `A nota ${h.title} também é apagada.`,
      confirmText: 'Apagar',
      variant: 'danger',
    });
    if (!ok) return;
    await documentsApi.removeHighlight(docId, h.id);
    setHighlights((hs) => hs.filter((x) => x.id !== h.id));
    setMenu(null);
    setActiveId(null);
    if (notice?.noteId === h.id) setNotice(null);
    notifyNotesChanged();
  };

  // ------------------------------------------------------------ ir até um grifo

  const goTo = useCallback(
    (h: Highlight, smooth = true) => {
      const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';
      if (h.page !== null) {
        const box = column.current;
        const page = box?.querySelector<HTMLElement>(`[data-page="${h.page}"]`);
        if (!box || !page) return;
        const top = page.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
        box.scrollTo({ top: Math.max(0, top + (h.rects[0]?.y ?? 0) * page.offsetHeight - box.clientHeight / 3), behavior });
      } else {
        textRef.current?.querySelector(`[data-highlight="${h.id}"]`)?.scrollIntoView({ block: 'center', behavior });
      }
      setActiveId(h.id);
      setFlashId(h.id);
      window.setTimeout(() => setFlashId((f) => (f === h.id ? null : f)), 1300);
      setPanelOpen(false);
    },
    []
  );

  // /leitor/12?destaque=34 (botão "Ver no documento" da nota do grifo): rola até ele.
  const wanted = Number(params.get('destaque'));
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!wanted || handled.current === wanted) return;
    if (mode === null || (mode === 'pdf' && !pdf)) return;
    const h = highlights.find((x) => x.id === wanted);
    if (!h) return;
    handled.current = wanted;
    requestAnimationFrame(() => goTo(h, false));
  }, [wanted, mode, pdf, highlights, goTo]);

  // ------------------------------------------------------------ zoom e teclado

  const zoomStep = (dir: 1 | -1) => {
    const i = ZOOMS.findIndex((v) => v >= zoom - 0.001);
    changeZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? ZOOMS.length - 1 : i) + dir))]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menu && openNoteId === null) {
        setMenu(null);
        setActiveId(null);
        window.getSelection()?.removeAllRanges();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, openNoteId]);

  // ------------------------------------------------------------ guardar o original de um documento antigo

  const attach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setAttaching(true);
    try {
      await documentsApi.attachFile(docId, f);
      setReloadKey((k) => k + 1); // abre de novo, agora com o arquivo
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para enviar o arquivo.');
    } finally {
      setAttaching(false);
    }
  };

  // ------------------------------------------------------------ gaveta da nota

  const updateNote = async (noteId: number, title: string, content: string) => {
    const saved = await notesApi.update(noteId, title, content);
    if (noteId === docId) setNote(saved);
    notifyNotesChanged();
    return saved;
  };

  const deleteNote = async (noteId: number) => {
    const isDoc = noteId === docId;
    const ok = await confirm({
      title: 'Excluir esta nota?',
      message: isDoc
        ? 'O documento e o arquivo original serão apagados. Os grifos continuam como notas.'
        : 'A nota e as ligações dela no grafo serão apagadas.',
      confirmText: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    await api.delete(`/notes/${noteId}`);
    setOpenNoteId(null);
    notifyNotesChanged();
    if (isDoc) navigate('/leitor');
  };

  // ------------------------------------------------------------ tela

  if (error) {
    return (
      <div className="max-w-xl mx-auto space-y-4 py-8">
        <p className="flex items-start gap-2 rounded-xl border border-red-700/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
        </p>
        <Link to="/leitor" className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Voltar para os documentos
        </Link>
      </div>
    );
  }

  const loading = !note || mode === null || (mode === 'pdf' && !pdf);
  // O nome do arquivo vem da nota: o cabeçalho Content-Disposition não chega ao navegador quando
  // o backend está em outro endereço (CORS só deixa ler alguns cabeçalhos).
  const meta = note?.source_meta as { filename?: unknown } | null | undefined;
  const sourceName = typeof meta?.filename === 'string' ? meta.filename : null;
  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    // Altura da tela inteira menos o cabeçalho do app (igual ao Canvas): quem rola são as
    // páginas, e a lista de grifos fica sempre à vista ao lado.
    <div className="max-w-2xl md:max-w-4xl lg:max-w-6xl mx-auto flex flex-col gap-2 h-[calc(100dvh-10.5rem)] sm:h-[calc(100dvh-11.75rem)] lg:h-[calc(100dvh-7.5rem)] baixa:h-[calc(100dvh-5.5rem)]">
      {/* Cabeçalho: voltar, nome, página, zoom, grifos */}
      {/* No celular os botões têm 44px (área de toque) e o "100%" do zoom some para caber em 320px. */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Link to="/leitor" aria-label="Voltar para os documentos" title="Todos os documentos" className="flex h-11 w-11 sm:h-9 sm:w-9 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <button type="button" onClick={() => note && setOpenNoteId(note.id)} className="min-w-0 flex-1 min-h-[44px] fino:min-h-0 text-left" title="Abrir a nota do documento">
          <span className="block truncate text-sm sm:text-base font-semibold text-white">{note?.title ?? 'Abrindo...'}</span>
          {(sourceName || file) && <span className="block truncate text-xs text-neutral-500">{sourceName ?? file?.filename}</span>}
        </button>
        {mode === 'pdf' && pdf && (
          <>
            <span className="hidden sm:inline text-xs text-neutral-500 whitespace-nowrap tabular-nums" aria-live="polite">
              Página {currentPage} de {pdf.sizes.length}
            </span>
            <div className="flex items-center rounded-lg border border-neutral-800">
              <button type="button" onClick={() => zoomStep(-1)} disabled={zoom <= ZOOMS[0]} aria-label="Diminuir" title="Diminuir" className="flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center text-neutral-400 hover:text-white disabled:opacity-30">
                <ZoomOut className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => changeZoom(1)} title="Ajustar à largura" className="hidden sm:block h-8 min-w-[3.25rem] px-1 text-xs text-neutral-300 hover:text-white tabular-nums">
                {zoomLabel}
              </button>
              <button type="button" onClick={() => zoomStep(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} aria-label="Aumentar" title="Aumentar" className="flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center text-neutral-400 hover:text-white disabled:opacity-30">
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="lg:hidden inline-flex flex-shrink-0 items-center gap-1.5 h-11 sm:h-9 px-3 rounded-lg border border-neutral-800 text-sm text-neutral-300 hover:text-white"
          aria-label={`Grifos (${highlights.length})`}
        >
          <Highlighter className="w-4 h-4" /> {highlights.length}
        </button>
      </div>

      <div className="flex-1 min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-5">
        <div className="relative h-full min-w-0">
          {/* As páginas. Com zoom maior que a tela, dá para rolar também para o lado. */}
          <div
            ref={column}
            onClick={onColumnClick}
            className="h-full overflow-auto overscroll-contain rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3 sm:p-5"
          >
            {file === null && note && (
              <div className="mb-4 mx-auto max-w-[46rem] rounded-xl border border-amber-700/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200 space-y-2">
                <p>
                  Este documento foi importado antes do Leitor, então o arquivo original não ficou guardado. Dá para grifar o
                  texto extraído abaixo, ou enviar o arquivo de novo para ver as páginas como no original.
                </p>
                <button
                  type="button"
                  onClick={() => attachInput.current?.click()}
                  disabled={attaching}
                  className="inline-flex items-center gap-1.5 min-h-[44px] fino:min-h-[36px] px-3 rounded-lg border border-amber-700/50 text-amber-100 hover:bg-amber-900/30 disabled:opacity-50"
                >
                  {attaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Enviar o arquivo original
                </button>
                <input ref={attachInput} type="file" accept=".pdf,.txt,.md" onChange={attach} className="hidden" />
              </div>
            )}
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-24 text-sm text-neutral-500">
                <Loader2 className="w-6 h-6 animate-spin" /> Abrindo o documento...
              </div>
            ) : mode === 'pdf' && pdf ? (
              <div className="flex flex-col items-center gap-4 w-max min-w-full">
                {pdf.sizes.map((size, i) => (
                  <PdfPage
                    key={i}
                    doc={pdf.doc}
                    number={i + 1}
                    width={pageWidth}
                    size={size}
                    near={near.has(i + 1)}
                    highlights={byPage.get(i + 1) ?? NO_HIGHLIGHTS}
                    activeId={activeId}
                    flashId={flashId}
                  />
                ))}
              </div>
            ) : text.trim() ? (
              <TextDocument ref={textRef} text={text} placed={placed} activeId={activeId} flashId={flashId} />
            ) : (
              <p className="py-16 text-center text-sm text-neutral-500">Este documento não tem texto para mostrar.</p>
            )}
          </div>

          {/* Aviso de grifo salvo: flutua em cima das páginas, sem empurrar nada. */}
          {notice && (
            <div
              role="status"
              className="absolute bottom-3 left-1/2 z-10 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900/95 px-3 py-2 text-xs text-neutral-200 shadow-xl"
            >
              <Highlighter className="w-3.5 h-3.5 flex-shrink-0 text-emerald-300" />
              <span className="min-w-0 truncate">{notice.text}</span>
              <button type="button" onClick={() => setOpenNoteId(notice.noteId)} className="flex-shrink-0 font-medium text-white underline underline-offset-2">
                Abrir
              </button>
              <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="flex-shrink-0 text-neutral-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Lista de grifos: coluna ao lado no PC, painel que sobe de baixo no celular. */}
        <aside
          className={`${panelOpen ? 'fixed flex' : 'hidden'} inset-x-0 bottom-0 z-50 max-h-[75dvh] rounded-t-2xl border-t border-neutral-800 bg-neutral-950 shadow-2xl lg:static lg:z-auto lg:flex lg:max-h-none lg:h-full lg:min-h-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none flex-col`}
          aria-label="Grifos deste documento"
        >
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2 lg:px-0 lg:pt-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Highlighter className="w-4 h-4 text-accent" /> Grifos ({highlights.length})
            </h2>
            <button type="button" onClick={() => setPanelOpen(false)} aria-label="Fechar grifos" className="lg:hidden flex h-11 w-11 items-center justify-center rounded-lg text-neutral-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 lg:px-0 lg:pb-2 safe-area-pb">
            {highlights.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">
                Selecione um trecho do documento e escolha uma cor. Cada grifo vira uma nota ligada a este documento.
              </p>
            ) : (
              <ul className="space-y-2">
                {highlights.map((h, i) => {
                  const newPage = h.page !== null && h.page !== highlights[i - 1]?.page;
                  const lost = missing.includes(h);
                  return (
                    <li key={h.id}>
                      {newPage && <p className={`${i ? 'mt-3' : ''} mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500`}>Página {h.page}</p>}
                      <div className={`rounded-xl border ${activeId === h.id ? 'border-neutral-600 bg-neutral-900/70' : 'border-neutral-800 bg-neutral-900/30'}`}>
                        <button type="button" onClick={() => (lost ? setOpenNoteId(h.id) : goTo(h))} className="flex w-full gap-2.5 px-3 pt-2.5 pb-1.5 text-left">
                          <span aria-hidden className="mt-0.5 w-1 flex-shrink-0 self-stretch rounded-full" style={{ background: `rgb(var(--hl-${h.color}))` }} />
                          <span className="min-w-0">
                            <span className="block text-sm leading-snug text-neutral-200 line-clamp-4">{h.quote}</span>
                            {h.note && <span className="mt-1 block text-xs text-neutral-400 line-clamp-3">{h.note}</span>}
                            {lost && <span className="mt-1 block text-xs text-amber-300">Não achei este trecho no texto de agora.</span>}
                          </span>
                        </button>
                        <div className="flex items-center justify-end gap-1 px-2 pb-1.5">
                          <button type="button" onClick={() => setOpenNoteId(h.id)} className="inline-flex items-center gap-1 min-h-[44px] lg:min-h-0 rounded-lg px-3 lg:px-2 py-1 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800">
                            <FileText className="w-3.5 h-3.5" /> Nota
                          </button>
                          <button type="button" onClick={() => remove(h)} aria-label={`Apagar o grifo ${h.title}`} className="inline-flex items-center gap-1 min-h-[44px] lg:min-h-0 rounded-lg px-3 lg:px-2 py-1 text-xs text-neutral-500 hover:text-red-300 hover:bg-neutral-800">
                            <Trash2 className="w-3.5 h-3.5" /> Apagar
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
      {panelOpen && <div className="fixed inset-0 z-[45] bg-black/50 lg:hidden" onClick={() => setPanelOpen(false)} aria-hidden />}

      {menu && (
        <FloatingMenu menuRef={menuRef} anchor={menu.anchor} onPointerDown={() => (inMenu.current = true)} onPointerUp={() => window.setTimeout(() => (inMenu.current = false), 400)}>
          {menu.kind === 'aviso' && <p className="px-3 py-2 text-sm text-neutral-300">{menu.text}</p>}
          {menu.kind === 'novo' && (
            <div className="p-1.5 space-y-1.5">
              {/* Em telas de 320px as 4 cores + "Comentar" não cabem com botões de 44px: lá o texto
                  "Comentar" fica só para o leitor de tela e o botão mostra o ícone. */}
              <div className="flex items-center gap-0.5 sm:gap-1">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => (commenting ? pickColor(c.key) : create(c.key))}
                    disabled={saving}
                    aria-label={commenting ? `Cor ${c.label.toLowerCase()}` : `Grifar de ${c.label.toLowerCase()}`}
                    aria-pressed={commenting ? color === c.key : undefined}
                    title={commenting ? c.label : `Grifar de ${c.label.toLowerCase()}`}
                    className={`flex h-11 w-11 fino:h-10 fino:w-10 items-center justify-center rounded-lg hover:bg-neutral-800 disabled:opacity-50 ${commenting && color === c.key ? 'bg-neutral-800' : ''}`}
                  >
                    <span className={`block h-5 w-5 rounded-full ring-2 ring-offset-2 ring-offset-neutral-900 ${color === c.key ? 'ring-white' : 'ring-transparent'}`} style={{ background: `rgb(var(--hl-${c.key}))` }} />
                  </button>
                ))}
                <span className="mx-0.5 h-6 w-px bg-neutral-800" aria-hidden />
                {!commenting ? (
                  <button type="button" onClick={() => setCommenting(true)} className="inline-flex h-11 fino:h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800">
                    <MessageSquarePlus className="w-4 h-4" /> <span className="max-[359px]:sr-only">Comentar</span>
                  </button>
                ) : (
                  <button type="button" onClick={() => setMenu(null)} className="inline-flex h-11 fino:h-10 items-center rounded-lg px-2.5 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800">
                    Cancelar
                  </button>
                )}
                {saving && <Loader2 className="ml-1 w-4 h-4 animate-spin text-neutral-400" />}
              </div>
              {commenting && (
                <div className="space-y-1.5 px-1 pb-1">
                  <textarea
                    autoFocus
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) create(color);
                    }}
                    rows={3}
                    maxLength={5000}
                    placeholder="O que você pensou ao ler isso? (fica na nota do grifo)"
                    aria-label="Comentário do grifo"
                    className="w-72 max-w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => create(color)}
                    disabled={saving}
                    className="w-full inline-flex items-center justify-center gap-1.5 min-h-[44px] fino:min-h-[38px] rounded-lg bg-white text-black text-sm font-medium hover:bg-neutral-200 disabled:opacity-60"
                  >
                    <Highlighter className="w-4 h-4" /> Salvar grifo
                  </button>
                </div>
              )}
              {menuError && <p className="px-2 pb-1 text-xs text-red-300">{menuError}</p>}
            </div>
          )}
          {menu.kind === 'grifo' && (
            <div className="w-72 max-w-full p-3 space-y-2">
              <p className="text-sm font-medium text-white line-clamp-2">{menu.highlight.title}</p>
              {menu.highlight.note && <p className="text-xs text-neutral-400 line-clamp-3">{menu.highlight.note}</p>}
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setOpenNoteId(menu.highlight.id)} className="inline-flex flex-1 items-center justify-center gap-1.5 min-h-[44px] fino:min-h-[36px] rounded-lg bg-white text-black text-sm font-medium hover:bg-neutral-200">
                  <FileText className="w-4 h-4" /> Abrir a nota
                </button>
                <button type="button" onClick={() => remove(menu.highlight)} className="inline-flex items-center justify-center gap-1.5 min-h-[44px] fino:min-h-[36px] px-3 rounded-lg border border-neutral-800 text-sm text-red-300 hover:bg-red-950/30">
                  <Trash2 className="w-4 h-4" /> Apagar
                </button>
              </div>
            </div>
          )}
        </FloatingMenu>
      )}

      <NoteDrawer
        noteId={openNoteId}
        onClose={() => setOpenNoteId(null)}
        onUpdateNote={updateNote}
        onDeleteNote={deleteNote}
        onOpenNote={setOpenNoteId}
        onOpenTag={(tag) => navigate(`/grafo?view=tabela&tag=${encodeURIComponent(tag)}`)}
        graphNodes={graph?.nodes}
        graphLinks={graph?.links}
      />
    </div>
  );
}

/**
 * O menu que flutua embaixo da seleção (em cima, se não couber). Embaixo porque, no celular,
 * o próprio sistema mostra o menu de copiar EM CIMA da seleção. Segue a seleção ao rolar.
 */
const FloatingMenu: React.FC<{
  anchor: () => DOMRect | null;
  menuRef: React.RefObject<HTMLDivElement>;
  onPointerDown: () => void;
  onPointerUp: () => void;
  children: React.ReactNode;
}> = ({ anchor, menuRef, onPointerDown, onPointerUp, children }) => {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    let raf = 0;
    const place = () => {
      const a = anchor();
      const el = menuRef.current;
      if (!a || !el) {
        setPos(null);
        return;
      }
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const bottomSafe = window.innerWidth < 1024 ? 96 : 16; // a barra de baixo do celular
      let top = a.bottom + 10;
      if (top + h > window.innerHeight - bottomSafe) top = Math.max(64, a.top - h - 10);
      const left = Math.min(Math.max(8, a.left + a.width / 2 - w / 2), window.innerWidth - w - 8);
      setPos({ left, top });
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    place();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [anchor, menuRef, children]);

  return (
    <div
      ref={menuRef}
      role="dialog"
      aria-label="Grifar o trecho"
      onPointerDown={(e) => {
        onPointerDown();
        // Clicar num botão do menu não pode desfazer a seleção do texto.
        if (!(e.target as HTMLElement).closest('textarea')) e.preventDefault();
      }}
      onPointerUp={onPointerUp}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 max-w-[calc(100vw-16px)] rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl shadow-black/50"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      {children}
    </div>
  );
};

export default LeitorPage;
