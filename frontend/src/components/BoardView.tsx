import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NotesBoard } from './NotesBoard';
import { useConfirm } from './ConfirmDialog';
import { boardApi, BOARD_CHANGED_EVENT, type BoardColumnData, type BoardData } from '../lib/board';
import { normalize, notifyNotesChanged, NOTES_CHANGED_EVENT } from '../lib/notes';
import { PILOT_BOARD_EVENT, PILOT_MOVE_EVENT, type PilotBoardDetail, type PilotMoveDetail } from '../lib/pilot';

interface BoardViewProps {
  /** Filtros da página: tag e busca pelo título. ids: só estes (filtro por propriedade). */
  tag: string | null;
  search: string;
  ids: Set<number> | null;
  onOpen: (id: number) => void;
  onOpenTag: (tag: string) => void;
}

/**
 * A visão Quadro da página das notas: busca o Quadro no servidor e liga as ações da tela
 * (arrastar, criar cartão, colunas) às rotas /api/board. Também atende o modo piloto
 * (IA de fora pelo MCP): move cartões e mostra, destacado, o que a IA acabou de mudar.
 */
export function BoardView({ tag, search, ids, onOpen, onOpenTag }: BoardViewProps) {
  const confirm = useConfirm();
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{ card?: number; column?: string } | null>(null);
  const highlightTimer = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await boardApi.get();
      const ok = data && Array.isArray(data.columns) ? data : { property: 'status', columns: [] };
      setBoard(ok);
      return ok;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu para abrir o Quadro.');
      setBoard((b) => b ?? { property: 'status', columns: [] });
      return null;
    }
  }, []);

  useEffect(() => {
    load();
    const reload = () => void load();
    window.addEventListener(NOTES_CHANGED_EVENT, reload);
    window.addEventListener(BOARD_CHANGED_EVENT, reload);
    return () => {
      window.removeEventListener(NOTES_CHANGED_EVENT, reload);
      window.removeEventListener(BOARD_CHANGED_EVENT, reload);
      clearTimeout(highlightTimer.current);
    };
  }, [load]);

  const flash = (h: { card?: number; column?: string } | null) => {
    clearTimeout(highlightTimer.current);
    setHighlight(h);
    if (h) highlightTimer.current = window.setTimeout(() => setHighlight(null), 2500);
  };

  /** Roda uma ação e recarrega o Quadro; erro aparece em cima. */
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      notifyNotesChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu certo.');
    }
    await load();
  };

  /** Mudar de coluna: o cartão anda na hora ("otimista") e volta se o servidor recusar. */
  const move = async (id: number, column: string): Promise<string | null> => {
    const before = board;
    setBoard((b) => {
      if (!b) return b;
      const card = b.columns.flatMap((c) => c.cards).find((c) => c.id === id);
      if (!card) return b;
      return {
        ...b,
        columns: b.columns.map((c) => ({
          ...c,
          cards: c.name === column ? [card, ...c.cards.filter((x) => x.id !== id)] : c.cards.filter((x) => x.id !== id),
        })),
      };
    });
    setError(null);
    try {
      await boardApi.place(id, column);
      notifyNotesChanged();
      return null;
    } catch (e) {
      setBoard(before);
      const message = e instanceof Error ? e.message : 'Não deu para mover o cartão.';
      setError(message);
      return message;
    }
  };

  // Modo piloto: mover (com o arrasto animado da PilotLayer) e mostrar o que mudou.
  const moveRef = useRef(move);
  moveRef.current = move;
  useEffect(() => {
    const onMove = (e: Event) => {
      const d = (e as CustomEvent<PilotMoveDetail>).detail;
      moveRef.current(d.id, d.value).then((err) => d.done(err === null, err ?? undefined));
    };
    const onShow = (e: Event) => {
      const d = (e as CustomEvent<PilotBoardDetail>).detail;
      load().then(() => {
        flash(d.highlight ?? null);
        requestAnimationFrame(() => d.done());
      });
    };
    window.addEventListener(PILOT_MOVE_EVENT, onMove);
    window.addEventListener(PILOT_BOARD_EVENT, onShow);
    return () => {
      window.removeEventListener(PILOT_MOVE_EVENT, onMove);
      window.removeEventListener(PILOT_BOARD_EVENT, onShow);
    };
  }, [load]);

  const deleteColumn = async (col: BoardColumnData) => {
    const n = col.cards.length;
    const ok = await confirm({
      title: `Excluir a coluna "${col.name}"?`,
      message:
        n === 0
          ? 'A coluna está vazia.'
          : `${n === 1 ? 'O cartão dela sai' : `Os ${n} cartões dela saem`} do Quadro. Nenhuma nota é apagada: elas continuam no grafo (e os cartões criados no Quadro continuam existindo).`,
      confirmText: 'Excluir coluna',
      variant: 'danger',
    });
    if (ok) await run(() => boardApi.deleteColumn(col.id));
  };

  const shiftColumn = (id: number, delta: number) => {
    const cols = board?.columns ?? [];
    const i = cols.findIndex((c) => c.id === id);
    if (i < 0) return;
    void run(() => boardApi.moveColumn(id, Math.max(0, i + delta)));
  };

  const columns = useMemo(() => {
    const q = normalize(search);
    const t = tag ? normalize(tag) : null;
    return (board?.columns ?? []).map((c) => ({
      ...c,
      cards: c.cards.filter(
        (card) =>
          (!q || normalize(card.title).includes(q)) &&
          (!t || card.tags.some((x) => normalize(x) === t)) &&
          (!ids || card.board_only || ids.has(card.id))
      ),
    }));
  }, [board, search, tag, ids]);

  if (!board) return <div className="h-64 rounded-2xl bg-neutral-900/50 animate-pulse" />;

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <NotesBoard
        columns={columns}
        highlight={highlight}
        onOpen={onOpen}
        onOpenTag={onOpenTag}
        onMove={(id, column) => void move(id, column)}
        onRemove={(id) => void run(() => boardApi.remove(id))}
        onCreateCard={(column, title) => run(() => boardApi.createCard(title, column))}
        onCreateColumn={(name) => run(() => boardApi.createColumn(name))}
        onRenameColumn={(id, name) => run(() => boardApi.renameColumn(id, name))}
        onShiftColumn={shiftColumn}
        onDeleteColumn={deleteColumn}
      />
    </div>
  );
}

export default BoardView;
