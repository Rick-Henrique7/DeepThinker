import React, { memo, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { BoardCardItem, BoardColumnData } from '../lib/board';

interface NotesBoardProps {
  columns: BoardColumnData[];
  onOpen: (id: number) => void;
  onOpenTag: (tag: string) => void;
  /** Muda o cartão de coluna (o status da nota vira o nome da coluna). */
  onMove: (id: number, column: string) => Promise<void> | void;
  /** Tira o cartão do Quadro (a nota continua existindo). */
  onRemove: (id: number) => void;
  onCreateCard: (column: string, title: string) => Promise<void> | void;
  onCreateColumn: (name: string) => Promise<void> | void;
  onRenameColumn: (id: number, name: string) => Promise<void> | void;
  /** Muda a coluna de lugar: -1 para a esquerda, +1 para a direita. */
  onShiftColumn: (id: number, delta: number) => void;
  onDeleteColumn: (column: BoardColumnData) => void;
  /** Cartão ou coluna em destaque (acabou de mudar, ex.: pela IA no modo ao vivo). */
  highlight?: { card?: number; column?: string } | null;
}

/**
 * O que o React precisa saber do arrasto. A posição do dedo ou do mouse NÃO fica aqui: ela muda
 * dezenas de vezes por segundo e, se fosse estado, o quadro inteiro renderizaria a cada movimento
 * (era isso que fazia o arrasto engasgar). A posição vai direto no estilo do cartão fantasma.
 */
interface DragState {
  id: number;
  from: string;
  width: number;
  over: string | null;
}

/** Funções que os cartões chamam. Ficam num ref para os cartões não renderizarem à toa. */
interface Handlers {
  startDrag: (e: React.PointerEvent<HTMLDivElement>, item: BoardCardItem, from: string) => void;
  open: (id: number) => void;
  openTag: (tag: string) => void;
  move: (id: number, value: string) => void;
  remove: (id: number) => void;
}

/**
 * Quadro (Kanban), como o plugin Kanban do Obsidian e a visão "Board" do Notion.
 * As colunas vêm do servidor (nome e ordem editáveis) e só aparecem as notas que a pessoa
 * pôs no Quadro. Arrastar um cartão para outra coluna muda o "status" da nota.
 *
 * O arrastar usa Pointer Events (mouse, caneta e dedo com o mesmo código). No celular o
 * arrasto começa com um toque longo, para não brigar com a rolagem da tela.
 */
export const NotesBoard: React.FC<NotesBoardProps> = ({
  columns,
  onOpen,
  onOpenTag,
  onMove,
  onRemove,
  onCreateCard,
  onCreateColumn,
  onRenameColumn,
  onShiftColumn,
  onDeleteColumn,
  highlight,
}) => {
  const [adding, setAdding] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  // Onde o fantasma deve estar (canto superior esquerdo). Escrito no pointermove, aplicado no rAF.
  const ghostPos = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const columnNames = columns.map((c) => c.name);

  // Assim que o fantasma aparece, ele já nasce no lugar certo (antes do navegador pintar).
  useLayoutEffect(() => {
    const g = ghostRef.current;
    if (g) g.style.transform = `translate3d(${ghostPos.current.x}px, ${ghostPos.current.y}px, 0) rotate(2deg)`;
  }, [drag?.id]);

  // ------------------------------------------------------------ arrastar
  const startDrag = (e: React.PointerEvent<HTMLDivElement>, item: BoardCardItem, from: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, select, input, a')) return;
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    const offset = { x: start.x - rect.left, y: start.y - rect.top };
    const touch = e.pointerType === 'touch';
    let active = false;
    let over: string | null = from;
    let timer: number | undefined;
    let last = start;
    let moved = false;
    let raf = 0;

    const columnAt = (x: number, y: number) =>
      (document.elementFromPoint(x, y)?.closest('[data-column]') as HTMLElement | null)?.dataset.column ?? null;

    // Um laço por quadro de animação faz todo o trabalho do arrasto: mover o fantasma, rolar o
    // quadro perto da borda e descobrir a coluna embaixo do cursor. O pointermove só anota a
    // posição. Assim, mesmo que o mouse dispare 200 eventos por segundo, o trabalho é feito no
    // máximo uma vez por quadro, e o React só é avisado quando a coluna de destino muda.
    const frame = () => {
      let changed = moved;
      moved = false;

      // Perto da borda, o quadro rola sozinho (e mais rápido quanto mais perto) para dar para soltar
      // em colunas fora da tela. Roda mesmo com o dedo parado: no celular a pessoa encosta o
      // cartão na borda e espera, sem precisar ficar balançando o dedo.
      const board = boardRef.current;
      if (board) {
        const b = board.getBoundingClientRect();
        const EDGE = 56;
        const speed =
          last.x < b.left + EDGE ? -Math.ceil((b.left + EDGE - last.x) / 3) : last.x > b.right - EDGE ? Math.ceil((last.x - (b.right - EDGE)) / 3) : 0;
        if (speed) {
          board.scrollLeft += speed;
          changed = true;
        }
      }

      if (changed) {
        ghostPos.current = { x: last.x - offset.x, y: last.y - offset.y };
        const g = ghostRef.current;
        if (g) g.style.transform = `translate3d(${ghostPos.current.x}px, ${ghostPos.current.y}px, 0) rotate(2deg)`;
        const now = columnAt(last.x, last.y);
        if (now !== over) {
          over = now;
          setDrag((d) => (d ? { ...d, over: now } : d));
        }
      }
      raf = requestAnimationFrame(frame);
    };

    const activate = () => {
      active = true;
      ghostPos.current = { x: last.x - offset.x, y: last.y - offset.y };
      setDrag({ id: item.id, from, width: rect.width, over });
      raf = requestAnimationFrame(frame);
      if (touch) navigator.vibrate?.(10);
    };

    const onMoveEvt = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY };
      if (!active) {
        const dist = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
        if (touch && dist > 8) cleanup(); // o dedo andou antes do toque longo: é rolagem, não arrasto
        else if (!touch && dist > 5) activate();
        return;
      }
      moved = true;
    };

    const onUp = () => {
      const wasActive = active;
      cleanup();
      if (wasActive) {
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 0);
        if (over !== null && over !== from) onMove(item.id, over);
      }
    };

    // Enquanto arrasta no celular, impedir que o dedo role a página.
    const blockScroll = (ev: TouchEvent) => active && ev.preventDefault();

    function cleanup() {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMoveEvt);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancel);
      document.removeEventListener('touchmove', blockScroll);
      if (active) setDrag(null);
      active = false;
    }
    function cancel() {
      over = null;
      cleanup();
    }

    window.addEventListener('pointermove', onMoveEvt);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
    document.addEventListener('touchmove', blockScroll, { passive: false });
    if (touch) timer = window.setTimeout(activate, 280);
  };

  // Os cartões recebem sempre o mesmo objeto (o ref), e ele aponta para as funções da última
  // renderização. Assim o memo dos cartões funciona mesmo que a página mande funções novas.
  const handlers = useRef<Handlers>(null as unknown as Handlers);
  handlers.current = {
    startDrag,
    open: (id) => !suppressClick.current && onOpen(id),
    openTag: onOpenTag,
    move: (id, value) => void onMove(id, value),
    remove: onRemove,
  };

  const addColumn = async () => {
    const v = (adding ?? '').trim();
    setAdding(null);
    if (v) await onCreateColumn(v);
  };

  const dragged = drag ? columns.flatMap((c) => c.cards).find((i) => i.id === drag.id) : null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        Só aparecem as notas que você mandou para o Quadro. Arraste os cartões entre as colunas; no menu{' '}
        <MoreHorizontal className="inline h-3.5 w-3.5" aria-hidden /> de cada coluna dá para renomear, mudar de lugar ou excluir.
      </p>

      <div
        ref={boardRef}
        className={`flex gap-3 overflow-x-auto pb-3 ${drag ? 'snap-none' : 'snap-x snap-mandatory sm:snap-none'}`}
      >
        {columns.map((col, i) => (
          <BoardColumnView
            key={col.id}
            col={col}
            first={i === 0}
            last={i === columns.length - 1}
            columnNames={columnNames}
            dropping={!!drag && drag.over === col.name && drag.from !== col.name}
            dragId={drag?.id ?? null}
            highlight={highlight}
            handlers={handlers}
            onCreateCard={onCreateCard}
            onRename={(name) => onRenameColumn(col.id, name)}
            onShift={(d) => onShiftColumn(col.id, d)}
            onDelete={() => onDeleteColumn(col)}
          />
        ))}

        <div className="snap-start flex-shrink-0 w-48">
          {adding === null ? (
            <button
              type="button"
              data-add-column
              onClick={() => setAdding('')}
              className="w-full inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-2xl border border-dashed border-neutral-800 text-sm text-neutral-400 hover:text-white hover:border-neutral-600"
            >
              <Plus className="w-4 h-4" /> Nova coluna
            </button>
          ) : (
            <input
              autoFocus
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setAdding(null);
              }}
              onBlur={addColumn}
              maxLength={60}
              placeholder="nome da coluna"
              aria-label="Nome da nova coluna"
              className="w-full min-h-[44px] rounded-2xl border border-neutral-700 bg-neutral-950 px-3 text-sm text-white focus:outline-none focus:border-accent"
            />
          )}
        </div>
      </div>

      {/* O cartão "fantasma" que segue o dedo ou o mouse. Fica em (0,0) e é movido por
          transform, que o navegador anima na GPU sem recalcular o layout da página. */}
      {drag && dragged && (
        <div
          ref={ghostRef}
          aria-hidden
          className="fixed left-0 top-0 z-[70] pointer-events-none will-change-transform rounded-xl border border-accent/60 bg-neutral-900 px-3 py-2 shadow-2xl"
          style={{ width: drag.width }}
        >
          <div className="text-sm font-medium text-neutral-100 line-clamp-2">{dragged.title}</div>
        </div>
      )}
    </div>
  );
};

interface ColumnViewProps {
  col: BoardColumnData;
  first: boolean;
  last: boolean;
  columnNames: string[];
  dropping: boolean;
  dragId: number | null;
  highlight?: { card?: number; column?: string } | null;
  handlers: React.MutableRefObject<Handlers>;
  onCreateCard: (column: string, title: string) => Promise<void> | void;
  onRename: (name: string) => Promise<void> | void;
  onShift: (delta: number) => void;
  onDelete: () => void;
}

/** Uma coluna: nome, menu (renomear, mudar de lugar, excluir), cartões e "Adicionar cartão". */
function BoardColumnView({ col, first, last, columnNames, dropping, dragId, highlight, handlers, onCreateCard, onRename, onShift, onDelete }: ColumnViewProps) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newCard, setNewCard] = useState<string | null>(null);
  const lit = highlight?.column === col.name;

  const finishRename = async () => {
    const v = (renaming ?? '').trim();
    setRenaming(null);
    if (v && v !== col.name) await onRename(v);
  };
  const finishCard = async () => {
    const v = (newCard ?? '').trim();
    setNewCard(null);
    if (v) await onCreateCard(col.name, v);
  };
  const itemClass = 'flex w-full items-center gap-2 px-3 min-h-[44px] sm:min-h-[36px] text-left text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40';

  return (
    <section
      data-column={col.name}
      aria-label={col.name}
      className={`snap-start flex-shrink-0 w-[78vw] sm:w-64 rounded-2xl border p-2 transition-colors ${
        dropping || lit ? 'border-accent/60 bg-accent/10' : 'border-neutral-800 bg-neutral-950/60'
      }`}
    >
      <header className="relative flex items-center justify-between gap-1 px-1.5 py-1 text-xs">
        {renaming === null ? (
          <span className="truncate font-medium text-neutral-200">{col.name}</span>
        ) : (
          <input
            autoFocus
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setRenaming(null);
            }}
            onBlur={finishRename}
            maxLength={60}
            aria-label={`Novo nome da coluna ${col.name}`}
            className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white focus:outline-none focus:border-accent"
          />
        )}
        <span className="flex items-center gap-1">
          <span className="tabular-nums text-neutral-500">{col.cards.length}</span>
          <button
            type="button"
            aria-label={`Opções da coluna ${col.name}`}
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            className="flex h-11 w-11 sm:h-7 sm:w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-800 hover:text-white"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </span>
        {menu && (
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 py-1 shadow-xl"
            onMouseLeave={() => setMenu(false)}
          >
            <button type="button" role="menuitem" className={itemClass} onClick={() => { setMenu(false); setRenaming(col.name); }}>
              <Pencil className="h-4 w-4" /> Renomear
            </button>
            <button type="button" role="menuitem" className={itemClass} disabled={first} onClick={() => { setMenu(false); onShift(-1); }}>
              <ArrowLeft className="h-4 w-4" /> Mover para a esquerda
            </button>
            <button type="button" role="menuitem" className={itemClass} disabled={last} onClick={() => { setMenu(false); onShift(1); }}>
              <ArrowRight className="h-4 w-4" /> Mover para a direita
            </button>
            <button type="button" role="menuitem" className={`${itemClass} text-rose-300`} onClick={() => { setMenu(false); onDelete(); }}>
              <Trash2 className="h-4 w-4" /> Excluir coluna
            </button>
          </div>
        )}
      </header>
      <ul className="mt-1 space-y-2 min-h-[56px]">
        {col.cards.map((item) => (
          <BoardCard
            key={item.id}
            item={item}
            column={col.name}
            columnNames={columnNames}
            dragging={dragId === item.id}
            lit={highlight?.card === item.id}
            handlers={handlers}
          />
        ))}
      </ul>
      {newCard === null ? (
        <button
          type="button"
          onClick={() => setNewCard('')}
          className="mt-2 flex w-full items-center gap-1.5 rounded-xl px-2 min-h-[44px] sm:min-h-[32px] text-xs text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar cartão
        </button>
      ) : (
        <input
          autoFocus
          value={newCard}
          onChange={(e) => setNewCard(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setNewCard(null);
          }}
          onBlur={finishCard}
          maxLength={255}
          placeholder="título do cartão"
          aria-label={`Título do novo cartão em ${col.name}`}
          className="mt-2 w-full min-h-[44px] rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-sm text-white focus:outline-none focus:border-accent"
        />
      )}
    </section>
  );
}

interface BoardCardProps {
  item: BoardCardItem;
  column: string;
  columnNames: string[];
  dragging: boolean;
  lit: boolean;
  handlers: React.MutableRefObject<Handlers>;
}

/**
 * Um cartão do quadro. Com memo, ele só renderiza de novo quando os próprios dados mudam:
 * durante o arrasto, apenas o cartão arrastado (que fica apagado) e as colunas renderizam.
 */
const BoardCard = memo(function BoardCard({ item, column, columnNames, dragging, lit, handlers }: BoardCardProps) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        data-note-card={item.id}
        onPointerDown={(e) => handlers.current.startDrag(e, item, column)}
        onClick={() => handlers.current.open(item.id)}
        onKeyDown={(e) => e.key === 'Enter' && handlers.current.open(item.id)}
        className={`group select-none [-webkit-touch-callout:none] cursor-grab active:cursor-grabbing rounded-xl border bg-neutral-900/80 px-3 py-2 hover:border-neutral-600 focus:outline-none focus-visible:border-accent ${
          lit ? 'border-accent ring-2 ring-accent/40' : 'border-neutral-800'
        } ${dragging ? 'opacity-40' : ''}`}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="text-sm font-medium text-neutral-100 line-clamp-2">{item.title}</div>
          <button
            type="button"
            aria-label={`Tirar "${item.title}" do Quadro`}
            title="Tirar do Quadro (a nota não é apagada)"
            onClick={(e) => {
              e.stopPropagation();
              handlers.current.remove(item.id);
            }}
            className="-mr-1 -mt-0.5 flex h-11 w-11 sm:h-6 sm:w-6 flex-shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-white [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {item.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((t) => (
              <button key={t} type="button" className="tag-chip" onClick={() => handlers.current.openTag(t)}>
                #{t}
              </button>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-neutral-500">
          <span>{item.board_only ? 'só no Quadro' : 'nota'}</span>
          {/* Alternativa ao arrastar (teclado, leitor de tela, ou quem preferir) */}
          <select
            aria-label={`Mover "${item.title}" para`}
            value={column}
            onChange={(e) => handlers.current.move(item.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="max-w-[7.5rem] truncate bg-transparent text-neutral-500 hover:text-neutral-200 focus:outline-none [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            {columnNames.map((v) => (
              <option key={v} value={v}>
                {v === column ? 'mover para…' : v}
              </option>
            ))}
          </select>
        </div>
      </div>
    </li>
  );
});

export default NotesBoard;
