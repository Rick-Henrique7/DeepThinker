import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, Download, Loader2, Redo2, Undo2 } from 'lucide-react';
import { CanvasBoard } from '../components/canvas/CanvasBoard';
import type { NotesContext } from '../components/canvas/CanvasCards';
import { NoteDrawer } from '../components/NoteDrawer';
import { useConfirm } from '../components/ConfirmDialog';
import { api, type ApiError } from '../lib/api';
import { canvasApi, emptyCanvas, toCanvasFile, type CanvasData, type CanvasDetail } from '../lib/canvas';
import { cachedTitles } from '../lib/noteCache';
import type { LinkItem, NodeItem } from '../components/KnowledgeGraph';
import { NOTES_CHANGED_EVENT, findLinkedNote, normalize, notesApi, notifyNotesChanged, type NoteRef } from '../lib/notes';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

/** Quanto tempo esperar depois da última mudança para salvar (agrupa mudanças seguidas). */
const SAVE_DELAY = 800;
const MAX_UNDO = 100;

/**
 * A página de um canvas: o título, o salvamento automático, o desfazer/refazer e a gaveta
 * da nota (abrir um cartão de nota mostra a nota aqui mesmo, sem sair do canvas).
 *
 * Salvar: cada mudança marca "tem coisa para salvar" e, 0,8 s depois da última, manda tudo.
 * O servidor recebe junto a revision que esta tela conhece; se outra aba salvou antes, ele
 * responde 409 e a tela pergunta qual versão manter, em vez de uma apagar a outra.
 */
export function CanvasPage() {
  const { id } = useParams();
  const canvasId = Number(id);
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<CanvasData>(emptyCanvas);
  const [title, setTitle] = useState('');
  const [state, setState] = useState<SaveState>('saved');
  const [conflict, setConflict] = useState<CanvasDetail | null>(null);
  const [titles, setTitles] = useState<NoteRef[]>([]);
  const [openNoteId, setOpenNoteId] = useState<number | null>(null);
  const [graph, setGraph] = useState<{ nodes: NodeItem[]; links: LinkItem[] } | null>(null);
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  // Refs: o salvamento roda fora do ciclo do React e precisa sempre do valor mais novo.
  const dataRef = useRef(data);
  const titleRef = useRef(title);
  const revision = useRef(0);
  const dirty = useRef(false);
  const saving = useRef(false);
  const blocked = useRef(false); // conflito aberto: não salva até você escolher
  const timer = useRef<number | undefined>(undefined);
  const past = useRef<CanvasData[]>([]);
  const future = useRef<CanvasData[]>([]);
  dataRef.current = data;
  titleRef.current = title;

  // ------------------------------------------------------------ abrir

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    canvasApi
      .get(canvasId)
      .then((c) => {
        if (cancelled) return;
        setData(c.data);
        setTitle(c.title);
        revision.current = c.revision;
        past.current = [];
        future.current = [];
        dirty.current = false;
        setState('saved');
        setReady(true);
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : 'Não deu para abrir o canvas.'));
    return () => {
      cancelled = true;
    };
  }, [canvasId]);

  useEffect(() => {
    const load = () => cachedTitles().then(setTitles).catch(() => undefined);
    load();
    window.addEventListener(NOTES_CHANGED_EVENT, load);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, load);
  }, []);

  // A gaveta da nota mostra o grafo local: busca o grafo só quando abre uma nota.
  useEffect(() => {
    if (openNoteId === null) return;
    const load = () => api.get<{ nodes: NodeItem[]; links: LinkItem[] }>('/graph').then(setGraph).catch(() => undefined);
    if (!graph) load();
    window.addEventListener(NOTES_CHANGED_EVENT, load);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, load);
  }, [openNoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------ salvar

  const save = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    if (saving.current || !dirty.current || blocked.current) return;
    saving.current = true;
    dirty.current = false;
    setState('saving');
    try {
      const saved = await canvasApi.save(canvasId, { title: titleRef.current, data: dataRef.current, revision: revision.current });
      revision.current = saved.revision;
      setState(dirty.current ? 'dirty' : 'saved');
    } catch (e) {
      dirty.current = true;
      const err = e as ApiError;
      if (err.status === 409) {
        blocked.current = true;
        setConflict((err.body as { current?: CanvasDetail } | undefined)?.current ?? null);
        setState('conflict');
      } else {
        setState('error');
        timer.current = window.setTimeout(save, 5000); // sem internet? tenta de novo daqui a pouco
      }
    } finally {
      saving.current = false;
      if (dirty.current && !blocked.current) timer.current = window.setTimeout(save, SAVE_DELAY);
    }
  }, [canvasId]);

  const markDirty = useCallback(() => {
    dirty.current = true;
    if (blocked.current) return;
    setState('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, SAVE_DELAY);
  }, [save]);

  // Fechar a aba com coisa por salvar: o navegador pergunta antes.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || saving.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // Saiu da página pelo menu com mudança pendente: salva na hora (sem esperar os 0,8 s).
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (dirty.current && !blocked.current && !saving.current) {
        canvasApi.save(canvasId, { title: titleRef.current, data: dataRef.current, revision: revision.current }).catch(() => undefined);
      }
    },
    [canvasId]
  );

  // ------------------------------------------------------------ desfazer

  const preview = useCallback((next: CanvasData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const commit = useCallback(
    (next: CanvasData, before: CanvasData = dataRef.current) => {
      if (next === before) return;
      past.current.push(before);
      if (past.current.length > MAX_UNDO) past.current.shift();
      future.current = [];
      dataRef.current = next;
      setData(next);
      markDirty();
      rerender();
    },
    [markDirty]
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(dataRef.current);
    dataRef.current = prev;
    setData(prev);
    markDirty();
    rerender();
  }, [markDirty]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(dataRef.current);
    dataRef.current = next;
    setData(next);
    markDirty();
    rerender();
  }, [markDirty]);

  // ------------------------------------------------------------ conflito

  const keepMine = () => {
    if (!conflict) return;
    revision.current = conflict.revision;
    blocked.current = false;
    setConflict(null);
    dirty.current = true;
    save();
  };

  const useTheirs = () => {
    if (!conflict) return;
    revision.current = conflict.revision;
    blocked.current = false;
    dirty.current = false;
    past.current = [];
    future.current = [];
    setConflict(null);
    setData(conflict.data);
    setTitle(conflict.title);
    setState('saved');
  };

  // ------------------------------------------------------------ notas

  const openTitle = useCallback(
    async (target: string) => {
      const found = findLinkedNote(titles, target);
      if (found) {
        setOpenNoteId(found.id);
        return;
      }
      // [[Nota que não existe]] num cartão: igual ao resto do app, oferece criar.
      const ok = await confirm({
        title: `Criar a nota "${target}"?`,
        message: 'Ainda não existe uma nota com esse título.',
        confirmText: 'Criar',
      });
      if (!ok) return;
      const created = await notesApi.create(target, '');
      notifyNotesChanged();
      setOpenNoteId(created.id);
    },
    [titles, confirm]
  );

  const notes = useMemo<NotesContext>(
    () => ({
      titles,
      knownTitles: new Set(titles.map((t) => normalize(t.title))),
      onOpenTitle: openTitle,
      onOpenTag: (tag) => navigate(`/grafo?view=tabela&tag=${encodeURIComponent(tag)}`),
    }),
    [titles, openTitle, navigate]
  );

  /**
   * Editar a nota pela gaveta. Se o título mudar, o servidor atualiza os cartões dos canvas
   * (ver CanvasService.onNoteRenamed). Por isso: salva o canvas antes e, depois, busca de novo
   * a versão do servidor, já com o título novo.
   */
  const updateNote = async (noteId: number, newTitle: string, content: string) => {
    const before = titles.find((t) => t.id === noteId)?.title;
    if (before !== undefined && before !== newTitle) await save();
    const saved = await notesApi.update(noteId, newTitle, content);
    notifyNotesChanged();
    if (before !== undefined && before !== newTitle && !blocked.current) {
      const fresh = await canvasApi.get(canvasId);
      revision.current = fresh.revision;
      dataRef.current = fresh.data;
      setData(fresh.data);
    }
    return saved;
  };

  const deleteNote = async (noteId: number) => {
    const ok = await confirm({
      title: 'Excluir esta nota?',
      message: 'A nota e as ligações dela no grafo serão apagadas. O cartão dela no canvas fica avisando que a nota não existe.',
      confirmText: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    await api.delete(`/notes/${noteId}`);
    setOpenNoteId(null);
    notifyNotesChanged();
  };

  // ------------------------------------------------------------ exportar

  const exportFile = () => {
    const blob = new Blob([toCanvasFile(dataRef.current)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(titleRef.current || 'canvas').replace(/[\\/:*?"<>|]+/g, '-')}.canvas`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ------------------------------------------------------------ tela

  if (loadError) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-3">
        <p className="text-neutral-300">{loadError}</p>
        <Link to="/canvas" className="text-accent underline underline-offset-2">
          Voltar para os canvas
        </Link>
      </div>
    );
  }

  const status: Record<SaveState, React.ReactNode> = {
    saved: (
      <>
        <Check className="w-3.5 h-3.5" /> Salvo
      </>
    ),
    dirty: 'Mudanças não salvas',
    saving: (
      <>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...
      </>
    ),
    error: (
      <>
        <AlertTriangle className="w-3.5 h-3.5" /> Não salvou. Tentando de novo...
      </>
    ),
    conflict: (
      <>
        <AlertTriangle className="w-3.5 h-3.5" /> Conflito
      </>
    ),
  };

  return (
    <div className="max-w-[1600px] mx-auto flex flex-col gap-2 h-[calc(100dvh-10.5rem)] sm:h-[calc(100dvh-11.75rem)] lg:h-[calc(100dvh-7.5rem)] baixa:h-[calc(100dvh-5.5rem)]">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/canvas"
          aria-label="Voltar para a lista de canvas"
          title="Todos os canvas"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value.slice(0, 255));
            markDirty();
          }}
          aria-label="Nome do canvas"
          placeholder="Canvas sem título"
          className="min-w-0 flex-1 basis-40 rounded-lg bg-transparent px-2 py-1 text-base sm:text-lg font-semibold text-white outline-none hover:bg-neutral-900 focus:bg-neutral-900"
        />
        <span
          role="status"
          className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${state === 'error' || state === 'conflict' ? 'text-amber-300' : 'text-neutral-500'}`}
        >
          {status[state]}
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton label="Desfazer (Ctrl+Z)" onClick={undo} disabled={past.current.length === 0}>
            <Undo2 className="w-4 h-4" />
          </IconButton>
          <IconButton label="Refazer (Ctrl+Shift+Z)" onClick={redo} disabled={future.current.length === 0}>
            <Redo2 className="w-4 h-4" />
          </IconButton>
          <IconButton label="Baixar como arquivo .canvas (abre no Obsidian)" onClick={exportFile} disabled={!ready}>
            <Download className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      {conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
          <span className="flex-1 min-w-[12rem]">Este canvas foi mudado em outro lugar (outra aba ou outro aparelho) enquanto você editava.</span>
          <button type="button" onClick={keepMine} className="min-h-[32px] px-3 rounded-lg bg-white text-black font-medium">
            Ficar com o meu
          </button>
          <button type="button" onClick={useTheirs} className="min-h-[32px] px-3 rounded-lg border border-amber-700/60 text-amber-100 hover:bg-amber-900/30">
            Usar o de lá
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        {ready ? (
          <CanvasBoard data={data} preview={preview} commit={commit} notes={notes} onUndo={undo} onRedo={redo} keyboard={openNoteId === null} />
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl border border-neutral-800">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
          </div>
        )}
      </div>

      <NoteDrawer
        noteId={openNoteId}
        onClose={() => setOpenNoteId(null)}
        onUpdateNote={updateNote}
        onDeleteNote={deleteNote}
        onOpenNote={setOpenNoteId}
        onOpenTag={notes.onOpenTag}
        graphNodes={graph?.nodes}
        graphLinks={graph?.links}
      />
    </div>
  );
}

const IconButton: React.FC<{ label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ label, onClick, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
  >
    {children}
  </button>
);

export default CanvasPage;
