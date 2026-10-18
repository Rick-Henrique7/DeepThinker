import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, Pause, Play, X } from 'lucide-react';
import {
  connectPilot,
  sendPilotAck,
  sendPilotResult,
  PILOT_BOARD_EVENT,
  PILOT_MOVE_EVENT,
  type PilotCommand,
  type PilotBoardDetail,
  type PilotMoveDetail,
  type PilotResult,
} from '../lib/pilot';

/**
 * Modo piloto, a parte que a pessoa vê: uma IA de fora (pelo MCP) mexendo no app ao vivo.
 *
 * - Faixa no topo: "<IA> está controlando o Deep thinker", com o botão Parar.
 * - Cursor da IA: vai até o menu, até o cartão, e arrasta o cartão até a coluna.
 * - Qualquer clique ou tecla da pessoa durante uma ação pausa a IA na hora.
 *
 * As ações em si usam os mesmos caminhos do app (navegar pela rota, mover cartão pela
 * GraphPage), então o resultado é igual ao de quem faz com o mouse.
 */

const SCREEN_NAMES: Record<string, string> = {
  pensar: 'Pensar',
  grafo: 'Grafo',
  tabela: 'Tabela',
  quadro: 'Quadro',
  advogado: 'Advogado',
  painel: 'Painel',
  canvas: 'Canvas',
  leitor: 'Leitor',
  ia: 'IA',
};
const VIEW_LABELS: Record<string, string> = { tabela: 'Tabela', quadro: 'Quadro' };
/** Some a faixa depois de tanto tempo sem comandos (se não estiver pausado). */
const IDLE_MS = 6000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function visible(el: Element): el is HTMLElement {
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** Link do menu para a rota (prefere o que está dentro de um <nav>, e não o logo). */
function navLink(path: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll(`a[href="${path}"]`)).filter(visible);
  return all.find((a) => a.closest('nav')) ?? all[all.length - 1] ?? null;
}

async function waitFor<T>(find: () => T | null, ms = 6000): Promise<T | null> {
  const end = performance.now() + ms;
  for (;;) {
    const found = find();
    if (found) return found;
    if (performance.now() > end) return null;
    await sleep(100);
  }
}

function center(el: Element): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

export function PilotLayer() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;

  const [agent, setAgent] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [paused, setPaused] = useState(false);
  const [shown, setShown] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number; ms: number; press: boolean } | null>(null);

  const pausedRef = useRef(false);
  const busyRef = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const idleTimer = useRef(0);
  const bannerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const setPausedBoth = (p: boolean) => {
    pausedRef.current = p;
    setPaused(p);
  };

  // ------------------------------------------------------------ cursor

  const cursorPos = useRef<[number, number]>([window.innerWidth / 2, 80]);
  const moveCursor = useCallback(async (x: number, y: number, ms = 600) => {
    const d = reduceMotion.current ? 0 : ms;
    cursorPos.current = [x, y];
    setCursor({ x, y, ms: d, press: false });
    await sleep(d + 30);
  }, []);
  const press = useCallback(async () => {
    setCursor((c) => (c ? { ...c, ms: 0, press: true } : c));
    await sleep(reduceMotion.current ? 0 : 180);
    setCursor((c) => (c ? { ...c, press: false } : c));
  }, []);
  const clickOn = useCallback(
    async (el: HTMLElement | null) => {
      if (!el) return;
      const [x, y] = center(el);
      await moveCursor(x, y);
      await press();
    },
    [moveCursor, press]
  );

  // ------------------------------------------------------------ ações

  const guard = () => {
    if (pausedRef.current) throw new Error('A pessoa pausou o controle da IA no Deep thinker.');
  };

  /** Vai para a rota pelo menu (com o cursor) e, se for Tabela/Quadro, clica na aba da visão. */
  const goTo = useCallback(
    async (path: string) => {
      const [base, query = ''] = path.split('?');
      const view = new URLSearchParams(query).get('view');
      const here = locationRef.current;
      if (here.pathname !== base) {
        await clickOn(navLink(base));
        guard();
        navigate(base);
        await sleep(350);
      }
      const current = new URLSearchParams(locationRef.current.search).get('view');
      if (view && current !== view) {
        const tab = await waitFor(() =>
          Array.from(document.querySelectorAll('[role="tab"], button')).find(
            (b) => visible(b) && b.textContent?.trim() === VIEW_LABELS[view]
          ) as HTMLElement | undefined ?? null
        );
        await clickOn(tab);
        guard();
        navigate(`${base}?view=${view}`);
        await sleep(300);
      }
    },
    [clickOn, navigate]
  );

  const doNavigate = async (args: Record<string, unknown>): Promise<PilotResult> => {
    const screen = String(args.screen ?? '');
    await goTo(String(args.path ?? '/'));
    return { ok: true, message: `Tela ${SCREEN_NAMES[screen] ?? screen} aberta.` };
  };

  const doOpenNote = async (args: Record<string, unknown>): Promise<PilotResult> => {
    const id = Number(args.id);
    if (locationRef.current.pathname !== '/grafo') await goTo('/grafo');
    guard();
    const params = new URLSearchParams(locationRef.current.search);
    params.set('focus', String(id));
    navigate(`/grafo?${params}`);
    await sleep(400);
    return { ok: true, message: `Nota "${String(args.title ?? id)}" aberta.` };
  };

  const doMoveCard = async (args: Record<string, unknown>): Promise<PilotResult> => {
    const id = Number(args.id);
    const value = String(args.column ?? '');
    const property = String(args.property ?? 'status');
    await goTo('/grafo?view=quadro');
    guard();
    await waitFor(() => document.querySelector('[data-column]'));
    await sleep(150);

    const card = await waitFor(() => document.querySelector<HTMLElement>(`[data-note-card="${id}"]`), 2500);
    let ghost: HTMLElement | null = null;
    if (card) {
      card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion.current ? 'auto' : 'smooth' });
      await sleep(reduceMotion.current ? 0 : 300);
      const [cx, cy] = center(card);
      await moveCursor(cx, cy);
      await press();
      guard();
      // "Fantasma" do cartão que segue o cursor, como no arrasto com o mouse
      const r = card.getBoundingClientRect();
      ghost = card.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('data-note-card');
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        margin: '0',
        zIndex: '65',
        pointerEvents: 'none',
        opacity: '0.92',
        transform: 'rotate(2deg)',
        boxShadow: '0 12px 32px rgb(0 0 0 / 0.35)',
        transition: 'none',
      });
      document.body.appendChild(ghost);
      card.style.opacity = '0.4';

      const column = document.querySelector<HTMLElement>(`[data-column="${CSS.escape(value)}"]`);
      if (column) {
        column.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion.current ? 'auto' : 'smooth' });
        await sleep(reduceMotion.current ? 0 : 300);
        const cr = column.getBoundingClientRect();
        const tx = cr.left + cr.width / 2;
        const ty = Math.min(cr.top + 70, cr.bottom - 20);
        const ms = reduceMotion.current ? 0 : 800;
        const [sx, sy] = cursorPos.current;
        ghost.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.2,1)`;
        ghost.style.transform = `translate(${tx - sx}px, ${ty - sy}px) rotate(2deg)`;
        await moveCursor(tx, ty, ms);
      }
      card.style.opacity = '';
    }

    try {
      guard();
      const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const timer = setTimeout(() => resolve({ ok: false, error: 'O Quadro não respondeu.' }), 10_000);
        const detail: PilotMoveDetail = {
          id,
          value,
          property,
          done: (ok, error) => {
            clearTimeout(timer);
            resolve({ ok, error });
          },
        };
        window.dispatchEvent(new CustomEvent(PILOT_MOVE_EVENT, { detail }));
      });
      if (!result.ok) return { ok: false, error: result.error ?? 'Não deu para mover o cartão.' };
      const label = value || `sem ${property}`;
      return { ok: true, message: `Cartão "${String(args.title ?? id)}" movido para "${label}".`, card_visible: !!card };
    } finally {
      ghost?.remove();
    }
  };

  /**
   * Ações no Quadro feitas pela IA (criar/renomear/excluir coluna, pôr/tirar cartão, cartão novo).
   * A mudança em si é feita no servidor; aqui só a parte visível:
   * - "point": o cursor vai até o lugar (coluna, cartão ou "Nova coluna") e "clica";
   * - "show": o Quadro recarrega e o que mudou fica destacado, com o cursor em cima.
   */
  const doBoard = async (args: Record<string, unknown>): Promise<PilotResult> => {
    await goTo('/grafo?view=quadro');
    guard();
    await waitFor(() => document.querySelector('[data-column], [data-add-column]'));
    const cardSel = (id: unknown) => `[data-note-card="${Number(id)}"]`;
    const colSel = (name: unknown) => `[data-column="${CSS.escape(String(name))}"]`;
    const goToEl = async (el: HTMLElement | null, top = false) => {
      if (!el) return;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion.current ? 'auto' : 'smooth' });
      await sleep(reduceMotion.current ? 0 : 250);
      const r = el.getBoundingClientRect();
      await moveCursor(r.left + r.width / 2, top ? r.top + 18 : r.top + r.height / 2);
    };

    if (args.phase === 'show') {
      const highlight = {
        card: args.card != null ? Number(args.card) : undefined,
        column: args.column ? String(args.column) : undefined,
      };
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 5000);
        const detail: PilotBoardDetail = {
          highlight,
          done: () => {
            clearTimeout(timer);
            resolve();
          },
        };
        window.dispatchEvent(new CustomEvent(PILOT_BOARD_EVENT, { detail }));
      });
      const el = highlight.card
        ? document.querySelector<HTMLElement>(cardSel(highlight.card))
        : highlight.column
          ? document.querySelector<HTMLElement>(colSel(highlight.column))
          : null;
      await goToEl(el, !highlight.card);
      return { ok: true, message: 'Quadro atualizado.' };
    }

    // "point": mostra onde a IA vai mexer, antes de mexer
    const target =
      args.card != null
        ? document.querySelector<HTMLElement>(cardSel(args.card))
        : args.add_column
          ? document.querySelector<HTMLElement>('[data-add-column]')
          : args.column
            ? document.querySelector<HTMLElement>(colSel(args.column))
            : document.querySelector<HTMLElement>('[data-column]');
    await goToEl(target, args.card == null && !args.add_column);
    if (target) await press();
    guard();
    return { ok: true, message: 'Pronto.' };
  };

  // ------------------------------------------------------------ comandos

  const describe = (c: PilotCommand) => {
    const a = c.args;
    if (c.action === 'navigate') return `Abrindo ${SCREEN_NAMES[String(a.screen)] ?? a.screen}`;
    if (c.action === 'open_note') return `Abrindo a nota "${a.title ?? a.id}"`;
    if (c.action === 'board') return a.column ? `Mexendo na coluna "${a.column}"` : 'Mexendo no Quadro';
    return `Movendo "${a.title ?? a.id}" para "${a.column || 'sem ' + a.property}"`;
  };

  const handle = useCallback(async (c: PilotCommand) => {
    clearTimeout(idleTimer.current);
    setAgent(c.agent || 'IA');
    setShown(true);
    let result: PilotResult;
    if (pausedRef.current) {
      result = { ok: false, error: 'A pessoa pausou o controle da IA no Deep thinker.' };
    } else {
      setStatus(describe(c));
      busyRef.current = true;
      try {
        if (c.action === 'navigate') result = await doNavigate(c.args);
        else if (c.action === 'open_note') result = await doOpenNote(c.args);
        else if (c.action === 'move_card') result = await doMoveCard(c.args);
        else if (c.action === 'board') result = await doBoard(c.args);
        else result = { ok: false, error: `Ação desconhecida: ${c.action}` };
      } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message : String(e) };
      } finally {
        busyRef.current = false;
      }
      setStatus(result.ok ? String(result.message ?? 'Pronto.') : String(result.error ?? 'Falhou.'));
    }
    await sendPilotResult(c.id, result).catch(() => undefined);
    idleTimer.current = window.setTimeout(() => {
      if (!pausedRef.current) {
        setShown(false);
        setCursor(null);
      }
    }, IDLE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Um comando por vez, na ordem em que chegaram
  useEffect(
    () =>
      connectPilot((c) => {
        sendPilotAck(c.id).catch(() => undefined);
        queue.current = queue.current.then(() => handle(c));
      }),
    [handle]
  );

  // A pessoa mexeu (clique ou tecla) enquanto a IA fazia algo: pausa na hora
  useEffect(() => {
    const interrupt = (e: Event) => {
      if (!busyRef.current || !e.isTrusted) return;
      if (bannerRef.current?.contains(e.target as Node)) return;
      setPausedBoth(true);
      setStatus('Pausado porque você mexeu no app.');
    };
    window.addEventListener('pointerdown', interrupt, true);
    window.addEventListener('keydown', interrupt, true);
    return () => {
      window.removeEventListener('pointerdown', interrupt, true);
      window.removeEventListener('keydown', interrupt, true);
    };
  }, []);

  useEffect(() => () => clearTimeout(idleTimer.current), []);

  if (!shown) return null;

  return (
    <>
      <div
        ref={bannerRef}
        role="status"
        aria-live="polite"
        className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-[70] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-accent/40 bg-black/85 py-1.5 pl-3 pr-1.5 text-xs text-neutral-200 shadow-lg backdrop-blur-md"
      >
        {paused ? (
          <Pause className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
        ) : (
          <Bot className="h-3.5 w-3.5 flex-shrink-0 text-accent animate-pulse" />
        )}
        <span className="truncate">
          {paused ? (
            <>Controle de <b>{agent}</b> pausado</>
          ) : (
            <>
              <b>{agent}</b> está controlando o Deep thinker
            </>
          )}
          {status && <span className="hidden sm:inline text-neutral-500"> · {status}</span>}
        </span>
        {paused ? (
          <>
            <button
              type="button"
              onClick={() => {
                setPausedBoth(false);
                setStatus('');
              }}
              className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-black"
            >
              <Play className="h-3 w-3" /> Retomar
            </button>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => {
                setShown(false);
                setCursor(null);
              }}
              className="rounded-full p-1 text-neutral-500 hover:text-neutral-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setPausedBoth(true);
              setStatus('');
            }}
            className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-black"
          >
            <Pause className="h-3 w-3" /> Parar
          </button>
        )}
      </div>

      {cursor && (
        <div
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-[70]"
          style={{
            transform: `translate(${cursor.x}px, ${cursor.y}px)`,
            transition: `transform ${cursor.ms}ms cubic-bezier(.4,0,.2,1)`,
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            className="drop-shadow-md transition-transform duration-150"
            style={{ transform: cursor.press ? 'scale(0.82)' : 'scale(1)', transformOrigin: '3px 3px' }}
          >
            <path d="M3 2.5 L20 11 L12.5 13 L9.5 20.5 Z" fill="rgb(var(--accent))" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          {cursor.press && <span className="absolute -left-2 -top-2 h-6 w-6 rounded-full border-2 border-accent animate-ping" />}
          <span className="absolute left-5 top-5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-black shadow">
            {agent}
          </span>
        </div>
      )}
    </>
  );
}
