import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Ban,
  ExternalLink,
  FileText,
  Group,
  Link2,
  Maximize2,
  Minus,
  MoveRight,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Type,
  PenLine,
} from 'lucide-react';
import {
  CANVAS_COLORS,
  anchor,
  colorName,
  colorTriple,
  drawOrder,
  edgeCurve,
  facingSides,
  fileTitle,
  inside,
  dropTarget,
  newId,
  noteFile,
  NOTE_CARD,
  bounds,
  type CanvasData,
  type CanvasEdge,
  type CanvasNode,
  type Point,
  type Side,
} from '../../lib/canvas';
import { normalize } from '../../lib/notes';
import { Modal } from '../Modal';
import { FileBody, LinkBody, TextBody, type NotesContext } from './CanvasCards';
import { editDrawing } from '../DrawingBlock';
import { insertDrawing } from '../../lib/drawing';

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;
const MIN_W = 120;
const MIN_H = 50;
const TEXT_CARD = { width: 260, height: 120 };
/** Andou menos que isso (em pixels da tela) = foi um clique, não um arrasto. */
const CLICK_SLOP = 4;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

type Selection = { kind: 'node' | 'edge'; id: string } | null;
interface View {
  x: number;
  y: number;
  zoom: number;
}

/** Guarda sempre o valor mais novo, para os "ouvintes" de arrasto (que vivem fora do React) lerem. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

interface CanvasBoardProps {
  data: CanvasData;
  /** Mudança no meio de um arrasto: só redesenha (não entra no "desfazer"). */
  preview: (next: CanvasData) => void;
  /** Mudança terminada: entra no "desfazer" e é salva. before = como estava antes do arrasto. */
  commit: (next: CanvasData, before?: CanvasData) => void;
  notes: NotesContext;
  onUndo: () => void;
  onRedo: () => void;
  /** false quando algo está aberto por cima (a gaveta da nota): as teclas não são do canvas. */
  keyboard: boolean;
}

/**
 * O quadro infinito. Como funciona por dentro:
 *
 * - Tudo tem coordenadas do "mundo" (as do arquivo .canvas). A tela mostra o mundo com um
 *   deslocamento (x, y) e um zoom: um único `transform: translate() scale()` no elemento de
 *   fora. Por isso mover e dar zoom é rápido mesmo com muitos cartões.
 * - Arrastar (cartão, fundo, alça de seta) usa eventos de ponteiro, que valem igual para
 *   mouse, caneta e dedo. Com dois dedos na tela vira "pinça" (zoom).
 * - Enquanto arrasta, cada movimento chama preview(); só ao soltar chama commit(), então
 *   desfazer volta o arrasto inteiro de uma vez.
 */
export const CanvasBoard: React.FC<CanvasBoardProps> = ({ data, preview, commit, notes, onUndo, onRedo, keyboard }) => {
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [sel, setSel] = useState<Selection>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<{ from: string; side: Side; to: Point; target?: { id: string; side: Side } } | null>(null);
  const [picker, setPicker] = useState<'note' | 'link' | null>(null);
  const dataRef = useLatest(data);
  const viewRef = useLatest(view);
  const gesture = useRef<{ cancel: () => void } | null>(null);
  const touches = useRef(new Map<number, Point>());
  /**
   * Depois de arrastar um cartão, o navegador ainda manda um "clique" ao soltar. Sem isso,
   * arrastar uma nota pelo título também abriria a nota. Então o clique logo depois de um
   * arrasto é engolido.
   */
  const swallowClick = useRef(false);
  const afterDrag = () => {
    swallowClick.current = true;
    setTimeout(() => (swallowClick.current = false), 0);
  };
  /**
   * O primeiro clique (ou toque) num cartão só escolhe o cartão; os links e botões de dentro
   * dele só respondem quando ele já estava escolhido. Sem isso, no celular, com o zoom baixo,
   * quem tenta tocar num cartão acaba abrindo sem querer um [[link]] miúdo. Guarda o id do
   * cartão que acabou de ser escolhido, até o próximo toque.
   */
  const justSelected = useRef<string | null>(null);

  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);
  const { groups, cards } = useMemo(() => drawOrder(data.nodes), [data.nodes]);
  const selectedNode = sel?.kind === 'node' ? byId.get(sel.id) : undefined;
  const selectedEdge = sel?.kind === 'edge' ? data.edges.find((e) => e.id === sel.id) : undefined;

  // A seleção pode sumir com um "desfazer": aí ela é limpa.
  useEffect(() => {
    if (sel && !(sel.kind === 'node' ? byId.has(sel.id) : data.edges.some((e) => e.id === sel.id))) setSel(null);
  }, [sel, byId, data.edges]);

  // ------------------------------------------------------------ coordenadas e zoom

  const toWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const r = viewport.current!.getBoundingClientRect();
      const v = viewRef.current;
      return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
    },
    [viewRef]
  );

  /** Zoom mantendo parado o ponto (sx, sy) da tela, como no Google Maps. */
  const zoomAround = useCallback((sx: number, sy: number, factor: number) => {
    setView((v) => {
      const zoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const wx = (sx - v.x) / v.zoom;
      const wy = (sy - v.y) / v.zoom;
      return { zoom, x: sx - wx * zoom, y: sy - wy * zoom };
    });
  }, []);

  const zoomCenter = (factor: number) => {
    const el = viewport.current;
    if (el) zoomAround(el.clientWidth / 2, el.clientHeight / 2, factor);
  };

  /** Enquadra todos os cartões na tela. */
  const fit = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const b = bounds(dataRef.current.nodes);
    if (!b) {
      setView({ x: w / 2, y: h / 2, zoom: 1 });
      return;
    }
    // Folga dos lados para as barras de ferramentas (esquerda) e de zoom (direita) não cobrirem os cartões
    const zoom = clamp(Math.min((w - 176) / b.width, (h - 96) / b.height), MIN_ZOOM, 1.1);
    setView({ zoom, x: w / 2 - (b.x + b.width / 2) * zoom, y: h / 2 - (b.y + b.height / 2) * zoom });
  }, [dataRef]);

  // Ao abrir: enquadra o que já existe.
  useLayoutEffect(() => {
    fit();
  }, [fit]);

  /** O meio da tela, em coordenadas do mundo (onde entram os cartões novos). */
  const centerSpot = (w: number, h: number): Point => {
    const el = viewport.current!;
    const v = viewRef.current;
    let x = Math.round((el.clientWidth / 2 - v.x) / v.zoom - w / 2);
    let y = Math.round((el.clientHeight / 2 - v.y) / v.zoom - h / 2);
    // Não empilhar exatamente em cima de outro cartão novo.
    while (dataRef.current.nodes.some((n) => n.x === x && n.y === y)) {
      x += 30;
      y += 30;
    }
    return { x, y };
  };

  // Roda do mouse / trackpad: rolar move, Ctrl + rolar (ou a pinça do trackpad) dá zoom.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('textarea, [data-ui]')) return;
      e.preventDefault();
      // deltaMode 1 = o navegador mede em "linhas" (Firefox); convertemos para pixels.
      const unit = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        // Um "dente" da roda do mouse vale ~100; a pinça do trackpad manda valores pequenos.
        // Limitar o passo deixa os dois confortáveis (cerca de 25% por dente).
        const step = clamp(e.deltaY * unit, -30, 30);
        zoomAround(e.clientX - r.left, e.clientY - r.top, Math.exp(-step * 0.01));
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX * unit, y: v.y - e.deltaY * unit }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAround]);

  // ------------------------------------------------------------ arrastos

  /**
   * Acompanha um ponteiro até ele soltar. Os ouvintes ficam na janela (e não no cartão)
   * para o arrasto continuar mesmo se o dedo sair de cima do cartão.
   */
  const track = useCallback(
    (e: React.PointerEvent, onMove: (ev: PointerEvent) => void, onEnd: (ev: PointerEvent | null, cancelled: boolean) => void) => {
      gesture.current?.cancel();
      const id = e.pointerId;
      const move = (ev: PointerEvent) => ev.pointerId === id && onMove(ev);
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        stop();
        onEnd(ev, ev.type === 'pointercancel');
      };
      const stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        gesture.current = null;
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      gesture.current = {
        cancel: () => {
          stop();
          onEnd(null, true);
        },
      };
    },
    []
  );

  // Dedos na tela: com dois, cancela o arrasto e vira pinça (zoom + mover juntos).
  useEffect(() => {
    const move = (e: PointerEvent) => touches.current.has(e.pointerId) && touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const up = (e: PointerEvent) => touches.current.delete(e.pointerId);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);

  const startPinch = () => {
    gesture.current?.cancel();
    const el = viewport.current!;
    const r = el.getBoundingClientRect();
    const pts = () => [...touches.current.values()];
    const [a, b] = pts();
    const d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const v0 = viewRef.current;
    const m0 = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
    const world = { x: (m0.x - v0.x) / v0.zoom, y: (m0.y - v0.y) / v0.zoom };
    const move = () => {
      if (touches.current.size < 2) return;
      const [p, q] = pts();
      const zoom = clamp((v0.zoom * Math.hypot(p.x - q.x, p.y - q.y)) / d0, MIN_ZOOM, MAX_ZOOM);
      const m = { x: (p.x + q.x) / 2 - r.left, y: (p.y + q.y) / 2 - r.top };
      setView({ zoom, x: m.x - world.x * zoom, y: m.y - world.y * zoom });
    };
    const up = () => touches.current.size < 2 && stop();
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      gesture.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    gesture.current = { cancel: stop };
  };

  const onTouchDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) startPinch();
  };

  /** Arrastar o fundo move a tela; um clique no fundo tira a seleção. */
  const onBackgroundDown = (e: React.PointerEvent) => {
    if ((e.button !== 0 && e.button !== 1) || touches.current.size > 1) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const v0 = viewRef.current;
    let moved = false;
    track(
      e,
      (ev) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < CLICK_SLOP) return;
        moved = true;
        setView({ ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy });
      },
      (_ev, cancelled) => {
        if (!moved && !cancelled) setSel(null);
      }
    );
  };

  /** Dois cliques no vazio: um cartão de texto novo ali, já pronto para escrever. */
  const onBackgroundDouble = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node-id], [data-edge-id], [data-ui]')) return;
    const p = toWorld(e.clientX, e.clientY);
    const card: CanvasNode = {
      id: newId(),
      type: 'text',
      text: '',
      x: Math.round(p.x - TEXT_CARD.width / 2),
      y: Math.round(p.y - TEXT_CARD.height / 2),
      ...TEXT_CARD,
    };
    commit({ ...dataRef.current, nodes: [...dataRef.current.nodes, card] });
    setSel({ kind: 'node', id: card.id });
    setEditing(card.id);
  };

  // As ações dos cartões ficam num objeto que nunca muda (ref), para o React.memo dos
  // cartões funcionar: arrastar um cartão não redesenha os outros.
  const actions = useRef<CardActions>(null!);
  actions.current = {
    down: (e, node) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (touches.current.size > 1) return;
      if (!(sel?.kind === 'node' && sel.id === node.id)) justSelected.current = node.id;
      setSel({ kind: 'node', id: node.id });
      if (editing === node.id) return;
      const before = dataRef.current;
      const start = toWorld(e.clientX, e.clientY);
      const sx = e.clientX;
      const sy = e.clientY;
      // Arrastar um grupo leva junto os cartões que estão dentro dele.
      const moving = node.type === 'group' ? [node, ...before.nodes.filter((n) => inside(node, n))] : [node];
      const orig = new Map(moving.map((n) => [n.id, { x: n.x, y: n.y }]));
      let moved = false;
      let last = before;
      track(
        e,
        (ev) => {
          if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < CLICK_SLOP) return;
          moved = true;
          const p = toWorld(ev.clientX, ev.clientY);
          const dx = Math.round(p.x - start.x);
          const dy = Math.round(p.y - start.y);
          last = {
            ...before,
            nodes: before.nodes.map((n) => {
              const o = orig.get(n.id);
              return o ? { ...n, x: o.x + dx, y: o.y + dy } : n;
            }),
          };
          preview(last);
        },
        (_ev, cancelled) => {
          if (!moved) return;
          afterDrag();
          if (cancelled) preview(before);
          else commit(last, before);
        }
      );
    },
    resizeDown: (e, node) => {
      e.stopPropagation();
      const before = dataRef.current;
      const start = toWorld(e.clientX, e.clientY);
      let last = before;
      track(
        e,
        (ev) => {
          const p = toWorld(ev.clientX, ev.clientY);
          const width = Math.max(MIN_W, Math.round(node.width + p.x - start.x));
          const height = Math.max(MIN_H, Math.round(node.height + p.y - start.y));
          last = { ...before, nodes: before.nodes.map((n) => (n.id === node.id ? { ...n, width, height } : n)) };
          preview(last);
        },
        (_ev, cancelled) => {
          if (cancelled) preview(before);
          else if (last !== before) commit(last, before);
        }
      );
    },
    handleDown: (e, node, side) => {
      e.stopPropagation();
      if (touches.current.size > 1) return;
      // Em qual cartão a seta encaixaria se soltasse aqui. Folga de ~24px da tela em volta de
      // cada cartão, para dar para mirar na bolinha da borda (veja dropTarget).
      const snap = (ev: { clientX: number; clientY: number }) => {
        const p = toWorld(ev.clientX, ev.clientY);
        return { p, hit: dropTarget(dataRef.current.nodes, node, p, 24 / viewRef.current.zoom) };
      };
      setConnecting({ from: node.id, side, to: toWorld(e.clientX, e.clientY) });
      track(
        e,
        (ev) => {
          const { p, hit } = snap(ev);
          setConnecting((c) => c && { ...c, to: p, target: hit ? { id: hit.node.id, side: hit.side } : undefined });
        },
        (ev, cancelled) => {
          setConnecting(null);
          if (cancelled || !ev) return;
          const d = dataRef.current;
          const { p, hit } = snap(ev);
          if (hit) {
            const edge: CanvasEdge = { id: newId(), fromNode: node.id, fromSide: side, toNode: hit.node.id, toSide: hit.side, toEnd: 'arrow' };
            commit({ ...d, edges: [...d.edges, edge] });
            setSel({ kind: 'edge', id: edge.id });
            return;
          }
          const a = anchor(node, side);
          if (Math.hypot(p.x - a.x, p.y - a.y) * viewRef.current.zoom < 30) return; // mal saiu do lugar
          // Soltou no vazio: cria ali um cartão de texto já ligado (igual ao Obsidian).
          const { width: w, height: h } = TEXT_CARD;
          const pos =
            side === 'right' ? { x: p.x, y: p.y - h / 2 } : side === 'left' ? { x: p.x - w, y: p.y - h / 2 } : side === 'bottom' ? { x: p.x - w / 2, y: p.y } : { x: p.x - w / 2, y: p.y - h };
          const card: CanvasNode = { id: newId(), type: 'text', text: '', x: Math.round(pos.x), y: Math.round(pos.y), width: w, height: h };
          const edge: CanvasEdge = { id: newId(), fromNode: node.id, fromSide: side, toNode: card.id, toSide: OPPOSITE[side], toEnd: 'arrow' };
          commit({ nodes: [...d.nodes, card], edges: [...d.edges, edge] });
          setSel({ kind: 'node', id: card.id });
          setEditing(card.id);
        }
      );
    },
    dbl: (node) => {
      if (node.type === 'text' || node.type === 'group') setEditing(node.id);
      else if (node.type === 'file') notes.onOpenTitle(fileTitle(node.file));
      else if (node.type === 'link') window.open(node.url, '_blank', 'noopener,noreferrer');
    },
    doneText: (id, text) => {
      setEditing((cur) => (cur === id ? null : cur));
      const d = dataRef.current;
      const n = d.nodes.find((x) => x.id === id);
      if (n && n.type === 'text' && n.text !== text) {
        commit({ ...d, nodes: d.nodes.map((x) => (x.id === id ? { ...x, text } : x)) });
      }
    },
    doneLabel: (id, label) => {
      setEditing((cur) => (cur === id ? null : cur));
      const d = dataRef.current;
      const n = d.nodes.find((x) => x.id === id);
      const clean = label.trim() || undefined;
      if (n && n.type === 'group' && (n.label ?? undefined) !== clean) {
        commit({ ...d, nodes: d.nodes.map((x) => (x.id === id ? { ...x, label: clean } : x)) });
      }
    },
    focus: (node) => setSel({ kind: 'node', id: node.id }),
  };
  const stableActions = useMemo<CardActions>(
    () => ({
      down: (e, n) => actions.current.down(e, n),
      resizeDown: (e, n) => actions.current.resizeDown(e, n),
      handleDown: (e, n, s) => actions.current.handleDown(e, n, s),
      dbl: (n) => actions.current.dbl(n),
      doneText: (id, t) => actions.current.doneText(id, t),
      doneLabel: (id, l) => actions.current.doneLabel(id, l),
      focus: (n) => actions.current.focus(n),
    }),
    []
  );

  // ------------------------------------------------------------ mudanças pela barra

  const patchNode = (id: string, patch: Partial<CanvasNode>) => {
    const d = dataRef.current;
    commit({ ...d, nodes: d.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as CanvasNode) : n)) });
  };
  const patchEdge = (id: string, patch: Partial<CanvasEdge>) => {
    const d = dataRef.current;
    commit({ ...d, edges: d.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  };

  const deleteSelection = useCallback(() => {
    const d = dataRef.current;
    if (!sel) return;
    if (sel.kind === 'node') {
      // Apagar um grupo apaga só a moldura; os cartões de dentro ficam.
      commit({ nodes: d.nodes.filter((n) => n.id !== sel.id), edges: d.edges.filter((e) => e.fromNode !== sel.id && e.toNode !== sel.id) });
    } else {
      commit({ ...d, edges: d.edges.filter((e) => e.id !== sel.id) });
    }
    setSel(null);
  }, [sel, commit, dataRef]);

  const addNode = (node: CanvasNode) => {
    commit({ ...dataRef.current, nodes: [...dataRef.current.nodes, node] });
    setSel({ kind: 'node', id: node.id });
  };

  const addText = () => {
    const card: CanvasNode = { id: newId(), type: 'text', text: '', ...centerSpot(TEXT_CARD.width, TEXT_CARD.height), ...TEXT_CARD };
    addNode(card);
    setEditing(card.id);
  };

  /** Desenho à mão livre: abre o editor e, ao salvar, vira um cartão de texto com o bloco ```excalidraw. */
  const addDrawing = async () => {
    const json = await editDrawing();
    if (json === null) return;
    addNode({ id: newId(), type: 'text', text: insertDrawing('', json), ...centerSpot(360, 280), width: 360, height: 280 });
  };

  /** Com um cartão escolhido, o grupo nasce em volta dele; senão, uma moldura vazia no meio. */
  const addGroup = () => {
    const pad = 40;
    const around = selectedNode && selectedNode.type !== 'group' ? selectedNode : null;
    const box = around
      ? { x: around.x - pad, y: around.y - pad - 10, width: around.width + pad * 2, height: around.height + pad * 2 + 10 }
      : { ...centerSpot(600, 400), width: 600, height: 400 };
    addNode({ id: newId(), type: 'group', label: 'Grupo', ...box });
  };

  const addNotes = (titles: string[]) => {
    const d = dataRef.current;
    const start = centerSpot(NOTE_CARD.width, NOTE_CARD.height);
    const added: CanvasNode[] = titles.map((t, i) => ({
      id: newId(),
      type: 'file',
      file: noteFile(t),
      x: start.x + i * (NOTE_CARD.width + 40),
      y: start.y,
      ...NOTE_CARD,
    }));
    commit({ ...d, nodes: [...d.nodes, ...added] });
    if (added.length) setSel({ kind: 'node', id: added[added.length - 1].id });
  };

  const addLink = (url: string) => {
    addNode({ id: newId(), type: 'link', url, ...centerSpot(300, 110), width: 300, height: 110 });
  };

  /** A seta tem 3 jeitos: → (padrão), ↔ (dupla) e — (sem ponta). */
  const cycleEnds = (edge: CanvasEdge) => {
    const to = edge.toEnd ?? 'arrow';
    const from = edge.fromEnd ?? 'none';
    if (to === 'arrow' && from === 'none') patchEdge(edge.id, { fromEnd: 'arrow', toEnd: 'arrow' });
    else if (to === 'arrow' && from === 'arrow') patchEdge(edge.id, { fromEnd: 'none', toEnd: 'none' });
    else patchEdge(edge.id, { fromEnd: 'none', toEnd: 'arrow' });
  };

  // ------------------------------------------------------------ teclado

  useEffect(() => {
    if (!keyboard || picker) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        onRedo();
        return;
      }
      if (mod) return;
      if (e.key === '+' || e.key === '=') return zoomCenter(1.2);
      if (e.key === '-') return zoomCenter(1 / 1.2);
      if (!sel) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'Escape') {
        setSel(null);
      } else if (e.key === 'Enter' && selectedNode) {
        e.preventDefault();
        actions.current.dbl(selectedNode);
      } else if (selectedNode && e.key.startsWith('Arrow')) {
        // Setas do teclado empurram o cartão (com Shift, mais longe): dá para montar sem mouse.
        e.preventDefault();
        const step = e.shiftKey ? 50 : 10;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        patchNode(selectedNode.id, { x: selectedNode.x + dx, y: selectedNode.y + dy });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ------------------------------------------------------------ desenho

  const grid = 24 * view.zoom;
  const knownColors = useMemo(() => {
    const s = new Set<string>(['none', 'selected']);
    data.edges.forEach((e) => e.color && colorTriple(e.color) && s.add(e.color));
    return [...s];
  }, [data.edges]);
  const strokeOf = (color?: string) => {
    const t = colorTriple(color);
    return t ? `rgb(${t})` : 'rgb(var(--neutral-500))';
  };
  const markerKey = (c: string) => c.replace('#', 'h');

  const edgeShapes = data.edges.flatMap((e) => {
    const a = byId.get(e.fromNode);
    const b = byId.get(e.toNode);
    if (!a || !b) return [];
    const [fs, ts] = facingSides(a, b);
    const fromSide = e.fromSide ?? fs;
    const toSide = e.toSide ?? ts;
    return [{ edge: e, ...edgeCurve(anchor(a, fromSide), fromSide, anchor(b, toSide), toSide) }];
  });

  const connectFrom = connecting ? byId.get(connecting.from) : undefined;
  // Encaixando num cartão: a seta tracejada já gruda na bolinha dele.
  const connectTo = connecting?.target ? byId.get(connecting.target.id) : undefined;
  /** O que cada cartão mostra enquanto se puxa uma seta: as bolinhas de entrada, e qual acende. */
  const portsOf = (n: CanvasNode): Side | 'all' | undefined =>
    !connecting || n.id === connecting.from ? undefined : connecting.target?.id === n.id ? connecting.target.side : 'all';
  const touchHint = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  return (
    <>
    <div
      ref={viewport}
      className="relative h-full w-full overflow-hidden touch-none select-none rounded-2xl border border-neutral-800 cursor-grab active:cursor-grabbing outline-none"
      style={{
        background: 'rgb(var(--graph-bg))',
        backgroundImage: 'radial-gradient(circle, rgb(var(--neutral-600) / 0.35) 1px, transparent 1.2px)',
        backgroundSize: `${grid}px ${grid}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDownCapture={(e) => {
        justSelected.current = null;
        onTouchDown(e);
      }}
      onClickCapture={(e) => {
        const fresh = justSelected.current;
        if (swallowClick.current || (fresh && (e.target as Element).closest(`[data-node-id="${fresh}"]`))) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onPointerDown={onBackgroundDown}
      onDoubleClick={onBackgroundDouble}
      aria-label="Canvas"
      role="application"
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        {groups.map((n) => (
          <CardView key={n.id} node={n} selected={sel?.id === n.id} editing={editing === n.id} zoom={view.zoom} notes={notes} actions={stableActions} ports={portsOf(n)} />
        ))}

        <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width="1" height="1" aria-hidden>
          <defs>
            {knownColors.map((c) => (
              <marker key={c} id={`dt-arrow-${markerKey(c)}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={c === 'selected' ? 'rgb(var(--accent))' : strokeOf(c === 'none' ? undefined : c)} />
              </marker>
            ))}
          </defs>
          {edgeShapes.map(({ edge, d }) => {
            const selected = sel?.id === edge.id;
            const key = selected ? 'selected' : edge.color && colorTriple(edge.color) ? edge.color : 'none';
            const marker = `url(#dt-arrow-${markerKey(key)})`;
            return (
              <g key={edge.id} data-edge-id={edge.id}>
                <path
                  d={d}
                  fill="none"
                  stroke={selected ? 'rgb(var(--accent))' : strokeOf(edge.color)}
                  strokeWidth={selected ? 3 : 2}
                  markerEnd={(edge.toEnd ?? 'arrow') === 'arrow' ? marker : undefined}
                  markerStart={edge.fromEnd === 'arrow' ? marker : undefined}
                />
                {/* Linha grossa invisível por cima: fica fácil clicar numa seta fina. */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(14, 14 / view.zoom)}
                  pointerEvents="stroke"
                  className="cursor-pointer"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSel({ kind: 'edge', id: edge.id });
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSel({ kind: 'edge', id: edge.id });
                    setEditing(`edge:${edge.id}`);
                  }}
                />
              </g>
            );
          })}
          {connecting && connectFrom && (
            <path
              d={
                connectTo
                  ? edgeCurve(anchor(connectFrom, connecting.side), connecting.side, anchor(connectTo, connecting.target!.side), connecting.target!.side).d
                  : edgeCurve(anchor(connectFrom, connecting.side), connecting.side, connecting.to).d
              }
              fill="none"
              stroke="rgb(var(--accent))"
              strokeWidth={2}
              strokeDasharray="6 4"
              markerEnd="url(#dt-arrow-selected)"
            />
          )}
        </svg>

        {cards.map((n) => (
          <CardView key={n.id} node={n} selected={sel?.id === n.id} editing={editing === n.id} zoom={view.zoom} notes={notes} actions={stableActions} ports={portsOf(n)} />
        ))}

        {edgeShapes.map(({ edge, mid }) =>
          editing === `edge:${edge.id}` ? (
            <EdgeLabelInput
              key={edge.id}
              at={mid}
              initial={edge.label ?? ''}
              onDone={(label) => {
                setEditing(null);
                const clean = label.trim() || undefined;
                if (clean !== edge.label) patchEdge(edge.id, { label: clean });
              }}
            />
          ) : edge.label ? (
            <div
              key={edge.id}
              data-edge-id={edge.id}
              className={`absolute -translate-x-1/2 -translate-y-1/2 max-w-[220px] truncate rounded-md border px-2 py-0.5 text-xs cursor-pointer ${
                sel?.id === edge.id ? 'border-accent text-white' : 'border-neutral-700 text-neutral-300'
              } bg-neutral-950`}
              style={{ left: mid.x, top: mid.y }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSel({ kind: 'edge', id: edge.id });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditing(`edge:${edge.id}`);
              }}
            >
              {edge.label}
            </div>
          ) : null
        )}
      </div>

      {data.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm text-center space-y-2">
            <p className="text-base font-medium text-neutral-200">Canvas vazio</p>
            <p className="text-sm text-neutral-500">
              {touchHint ? 'Toque duas vezes' : 'Dê dois cliques'} em qualquer lugar para criar um cartão de texto, ou use os
              botões à esquerda para trazer notas, links e grupos. Puxe a bolinha da borda de um cartão para ligar a outro.
            </p>
          </div>
        </div>
      )}

      {/* Ferramentas: cartões novos */}
      <div
        data-ui
        className="absolute left-3 top-3 flex flex-col gap-1 rounded-xl border border-neutral-800 bg-neutral-950/90 p-1 shadow-lg backdrop-blur cursor-default"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <ToolButton label="Cartão de texto" onClick={addText}>
          <Type className="w-5 h-5" />
        </ToolButton>
        <ToolButton label="Desenho à mão livre" onClick={addDrawing}>
          <PenLine className="w-5 h-5" />
        </ToolButton>
        <ToolButton label="Cartão de nota" onClick={() => setPicker('note')}>
          <FileText className="w-5 h-5" />
        </ToolButton>
        <ToolButton label="Cartão de link" onClick={() => setPicker('link')}>
          <Link2 className="w-5 h-5" />
        </ToolButton>
        <ToolButton label={selectedNode && selectedNode.type !== 'group' ? 'Agrupar o cartão escolhido' : 'Grupo'} onClick={addGroup}>
          <Group className="w-5 h-5" />
        </ToolButton>
      </div>

      {/* Zoom */}
      <div
        data-ui
        className="absolute right-3 bottom-3 flex flex-col items-stretch gap-1 rounded-xl border border-neutral-800 bg-neutral-950/90 p-1 shadow-lg backdrop-blur cursor-default"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <ToolButton label="Aproximar" onClick={() => zoomCenter(1.25)}>
          <Plus className="w-5 h-5" />
        </ToolButton>
        <button
          type="button"
          onClick={() => zoomCenter(1 / view.zoom)}
          title="Voltar para 100%"
          className="h-8 rounded-lg text-[11px] tabular-nums text-neutral-400 hover:text-white hover:bg-neutral-800"
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <ToolButton label="Afastar" onClick={() => zoomCenter(1 / 1.25)}>
          <Minus className="w-5 h-5" />
        </ToolButton>
        <ToolButton label="Mostrar tudo" onClick={fit}>
          <Maximize2 className="w-4 h-4" />
        </ToolButton>
      </div>

      {/* O que dá para fazer com o que está escolhido */}
      {(selectedNode || selectedEdge) && (
        <div className="pointer-events-none absolute bottom-3 left-3 right-16 flex justify-center">
          <div
            data-ui
            className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-xl border border-neutral-800 bg-neutral-950/95 p-1 shadow-lg backdrop-blur cursor-default"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            role="toolbar"
            aria-label={selectedNode ? 'Cartão escolhido' : 'Seta escolhida'}
          >
            <ColorPicker
              value={(selectedNode ?? selectedEdge)!.color}
              onChange={(color) => (selectedNode ? patchNode(selectedNode.id, { color }) : patchEdge(selectedEdge!.id, { color }))}
            />
            <span className="mx-1 h-6 w-px bg-neutral-800" aria-hidden />
            {selectedNode?.type === 'text' && (
              <BarButton onClick={() => setEditing(selectedNode.id)}>
                <Pencil className="w-4 h-4" /> Editar
              </BarButton>
            )}
            {selectedNode?.type === 'group' && (
              <BarButton onClick={() => setEditing(selectedNode.id)}>
                <Pencil className="w-4 h-4" /> Renomear
              </BarButton>
            )}
            {selectedNode?.type === 'file' && (
              <BarButton onClick={() => notes.onOpenTitle(fileTitle(selectedNode.file))}>
                <FileText className="w-4 h-4" /> Abrir nota
              </BarButton>
            )}
            {selectedNode?.type === 'link' && (
              <a
                href={selectedNode.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg text-sm text-neutral-300 hover:text-white hover:bg-neutral-800"
              >
                <ExternalLink className="w-4 h-4" /> Abrir
              </a>
            )}
            {selectedEdge && (
              <>
                <BarButton onClick={() => setEditing(`edge:${selectedEdge.id}`)}>
                  <Tag className="w-4 h-4" /> Rótulo
                </BarButton>
                <BarButton onClick={() => cycleEnds(selectedEdge)} title="Trocar as pontas: → , ↔ ou sem ponta">
                  {(selectedEdge.toEnd ?? 'arrow') === 'arrow' && selectedEdge.fromEnd === 'arrow' ? (
                    <ArrowLeftRight className="w-4 h-4" />
                  ) : (selectedEdge.toEnd ?? 'arrow') === 'arrow' ? (
                    <MoveRight className="w-4 h-4" />
                  ) : (
                    <Minus className="w-4 h-4" />
                  )}
                  Pontas
                </BarButton>
              </>
            )}
            <BarButton onClick={deleteSelection} danger>
              <Trash2 className="w-4 h-4" /> {selectedNode?.type === 'file' ? 'Tirar do canvas' : 'Apagar'}
            </BarButton>
          </div>
        </div>
      )}

    </div>
    {/* Fora do quadro: senão os cliques no formulário "vazariam" para o fundo do canvas. */}
    <NotePicker open={picker === 'note'} onClose={() => setPicker(null)} titles={notes.titles} onPick={(t) => (addNotes(t), setPicker(null))} />
    <LinkForm open={picker === 'link'} onClose={() => setPicker(null)} onAdd={(url) => (addLink(url), setPicker(null))} />
    </>
  );
};

// ================================================================= cartão

interface CardActions {
  down: (e: React.PointerEvent, node: CanvasNode) => void;
  resizeDown: (e: React.PointerEvent, node: CanvasNode) => void;
  handleDown: (e: React.PointerEvent, node: CanvasNode, side: Side) => void;
  dbl: (node: CanvasNode) => void;
  doneText: (id: string, text: string) => void;
  doneLabel: (id: string, label: string) => void;
  focus: (node: CanvasNode) => void;
}

interface CardViewProps {
  node: CanvasNode;
  selected: boolean;
  editing: boolean;
  zoom: number;
  notes: NotesContext;
  actions: CardActions;
  /** Puxando uma seta de outro cartão: 'all' mostra as bolinhas de entrada; um lado = ela vai encaixar ali. */
  ports?: Side | 'all';
}

const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const HANDLE_POS: Record<Side, string> = {
  top: 'left-1/2 top-0',
  right: 'left-full top-1/2',
  bottom: 'left-1/2 top-full',
  left: 'left-0 top-1/2',
};

const TYPE_LABEL: Record<CanvasNode['type'], string> = { text: 'Cartão de texto', file: 'Nota', link: 'Link', group: 'Grupo' };

/** Um cartão. memo: só redesenha se o próprio cartão (ou o zoom) mudou. */
const CardView = memo(function CardView({ node, selected, editing, zoom, notes, actions, ports }: CardViewProps) {
  const tint = colorTriple(node.color);
  const snapping = ports !== undefined && ports !== 'all';
  const ring =
    selected || snapping ? { outline: `${2 / zoom}px ${snapping ? 'dashed' : 'solid'} rgb(var(--accent))`, outlineOffset: `${2 / zoom}px` } : {};
  const handleSize = 14 / zoom;

  // Bolinhas de entrada, só para ver (não pegam o clique): aparecem em todos os cartões
  // enquanto se puxa uma seta, e a do lado onde ela vai encaixar fica maior e acesa.
  const inPorts = ports && (
    <>
      {SIDES.map((side) => {
        const on = ports === side;
        const size = (on ? 16 : 10) / zoom;
        return (
          <span
            key={side}
            data-port={side}
            data-port-active={on || undefined}
            className={`absolute ${HANDLE_POS[side]} -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none ${
              on ? 'bg-accent' : 'bg-neutral-500/80'
            }`}
            style={{ width: size, height: size, border: `${2 / zoom}px solid rgb(var(--graph-bg))` }}
          />
        );
      })}
    </>
  );

  // Alças: as 4 bolinhas para puxar setas e o canto para mudar o tamanho.
  const handles = selected && !editing && (
    <>
      {SIDES.map((side) => (
        <button
          key={side}
          type="button"
          aria-label={`Puxar uma seta pelo lado ${{ top: 'de cima', right: 'direito', bottom: 'de baixo', left: 'esquerdo' }[side]}`}
          className={`absolute ${HANDLE_POS[side]} -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[rgb(var(--graph-bg))] bg-accent cursor-crosshair pointer-events-auto`}
          style={{ width: handleSize, height: handleSize, borderWidth: 2 / zoom }}
          onPointerDown={(e) => actions.handleDown(e, node, side)}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      ))}
      <div
        role="presentation"
        className="absolute right-0 bottom-0 translate-x-1/2 translate-y-1/2 rounded-sm bg-accent cursor-nwse-resize pointer-events-auto"
        style={{ width: handleSize, height: handleSize }}
        onPointerDown={(e) => actions.resizeDown(e, node)}
        onDoubleClick={(e) => e.stopPropagation()}
      />
    </>
  );

  if (node.type === 'group') {
    // O miolo do grupo deixa o clique passar (para dar para mover a tela por dentro dele);
    // pega-se o grupo pelo nome ou pela borda.
    const edge = 10 / zoom;
    return (
      <div
        data-node-id={node.id}
        className="absolute rounded-2xl pointer-events-none"
        style={{
          left: node.x,
          top: node.y,
          width: node.width,
          height: node.height,
          border: `${2 / Math.max(zoom, 0.5)}px solid ${tint ? `rgb(${tint} / 0.75)` : 'rgb(var(--neutral-600) / 0.8)'}`,
          background: tint ? `rgb(${tint} / 0.08)` : 'rgb(var(--neutral-500) / 0.05)',
          ...ring,
        }}
      >
        {(['top', 'right', 'bottom', 'left'] as Side[]).map((s) => (
          <div
            key={s}
            className="absolute pointer-events-auto cursor-move"
            style={
              s === 'top' || s === 'bottom'
                ? { left: 0, right: 0, height: edge, [s]: -edge / 2 }
                : { top: 0, bottom: 0, width: edge, [s]: -edge / 2 }
            }
            onPointerDown={(e) => actions.down(e, node)}
          />
        ))}
        <div
          className="absolute left-0 bottom-full mb-1 pointer-events-auto origin-bottom-left"
          style={{ transform: `scale(${1 / Math.max(zoom, 0.6)})` }}
        >
          {editing ? (
            <LabelInput initial={node.label ?? ''} onDone={(label) => actions.doneLabel(node.id, label)} />
          ) : (
            <button
              type="button"
              className={`rounded-lg px-2.5 py-1 text-sm font-medium cursor-move ${selected ? 'bg-accent/20 text-white' : 'bg-neutral-900/80 text-neutral-300'}`}
              onPointerDown={(e) => actions.down(e, node)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                actions.dbl(node);
              }}
              onFocus={() => actions.focus(node)}
              aria-label={`Grupo ${node.label || 'sem nome'}`}
            >
              {node.label || 'Grupo'}
            </button>
          )}
        </div>
        {handles}
        {inPorts}
      </div>
    );
  }

  return (
    <div
      data-node-id={node.id}
      tabIndex={0}
      role="group"
      aria-label={`${TYPE_LABEL[node.type]}${node.type === 'file' ? `: ${fileTitle(node.file)}` : ''}${node.color ? `, cor ${colorName(node.color).toLowerCase()}` : ''}`}
      className="absolute rounded-xl shadow-lg shadow-black/20 cursor-default focus:outline-none"
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        border: `1px solid ${tint ? `rgb(${tint} / 0.85)` : 'rgb(var(--neutral-700))'}`,
        background: tint ? `linear-gradient(rgb(${tint} / 0.14), rgb(${tint} / 0.14)), rgb(var(--neutral-900))` : 'rgb(var(--neutral-900))',
        ...ring,
      }}
      onPointerDown={(e) => actions.down(e, node)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        actions.dbl(node);
      }}
      onFocus={(e) => e.target === e.currentTarget && actions.focus(node)}
    >
      <div className="h-full w-full overflow-hidden rounded-xl">
        {node.type === 'text' && <TextBody node={node} editing={editing} notes={notes} onDone={(t) => actions.doneText(node.id, t)} />}
        {node.type === 'file' && <FileBody node={node} notes={notes} />}
        {node.type === 'link' && <LinkBody node={node} />}
      </div>
      {handles}
      {inPorts}
    </div>
  );
});

// ================================================================= peças pequenas

const ToolButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800"
  >
    {children}
  </button>
);

const BarButton: React.FC<{ onClick: () => void; children: React.ReactNode; danger?: boolean; title?: string }> = ({ onClick, children, danger, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg text-sm hover:bg-neutral-800 ${
      danger ? 'text-red-300 hover:text-red-200' : 'text-neutral-300 hover:text-white'
    }`}
  >
    {children}
  </button>
);

/** As 6 cores (e "sem cor"). O nome de cada uma fica no aria-label e no título, não só a cor. */
const ColorPicker: React.FC<{ value?: string; onChange: (c: string | undefined) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Cor">
    <button
      type="button"
      role="radio"
      aria-checked={!value}
      aria-label="Sem cor"
      title="Sem cor"
      onClick={() => onChange(undefined)}
      className={`flex h-8 w-8 items-center justify-center rounded-lg ${!value ? 'bg-neutral-800' : 'hover:bg-neutral-800'}`}
    >
      <Ban className="w-4 h-4 text-neutral-500" />
    </button>
    {CANVAS_COLORS.map((c) => (
      <button
        key={c.id}
        type="button"
        role="radio"
        aria-checked={value === c.id}
        aria-label={c.name}
        title={c.name}
        onClick={() => onChange(c.id)}
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${value === c.id ? 'bg-neutral-800' : 'hover:bg-neutral-800'}`}
      >
        <span
          className="h-4 w-4 rounded-full"
          style={{ background: `rgb(var(--canvas-${c.id}))`, boxShadow: value === c.id ? '0 0 0 2px rgb(var(--white))' : undefined }}
        />
      </button>
    ))}
  </div>
);

const LabelInput: React.FC<{ initial: string; onDone: (v: string) => void }> = ({ initial, onDone }) => {
  const [v, setV] = useState(initial);
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label="Nome do grupo"
      className="w-56 rounded-lg border border-accent bg-neutral-950 px-2.5 py-1 text-sm text-white outline-none"
    />
  );
};

const EdgeLabelInput: React.FC<{ at: Point; initial: string; onDone: (v: string) => void }> = ({ at, initial, onDone }) => {
  const [v, setV] = useState(initial);
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      placeholder="Rótulo da seta"
      aria-label="Rótulo da seta"
      className="absolute -translate-x-1/2 -translate-y-1/2 w-48 rounded-md border border-accent bg-neutral-950 px-2 py-1 text-xs text-white outline-none"
      style={{ left: at.x, top: at.y }}
    />
  );
};

/** Escolher notas para pôr no canvas (dá para escolher várias e pôr de uma vez). */
const NotePicker: React.FC<{ open: boolean; onClose: () => void; titles: { id: number; title: string }[]; onPick: (titles: string[]) => void }> = ({
  open,
  onClose,
  titles,
  onPick,
}) => {
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      setQ('');
      setChosen([]);
    }
  }, [open]);
  const list = useMemo(() => {
    const n = normalize(q);
    return titles.filter((t) => !n || normalize(t.title).includes(n)).slice(0, 60);
  }, [q, titles]);
  const toggle = (t: string) => setChosen((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]));
  return (
    <Modal open={open} onClose={onClose} title="Pôr notas no canvas">
      <div className="space-y-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && list[0]) onPick(chosen.length ? chosen : [list[0].title]);
          }}
          placeholder="Buscar pelo título..."
          aria-label="Buscar nota"
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-neutral-600"
        />
        <ul className="max-h-72 overflow-y-auto space-y-0.5" role="listbox" aria-multiselectable>
          {list.length === 0 && <li className="px-2 py-3 text-sm text-neutral-500">Nenhuma nota com esse título.</li>}
          {list.map((t) => {
            const on = chosen.includes(t.title);
            return (
              <li key={t.id} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => toggle(t.title)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${on ? 'bg-accent/15 text-white' : 'text-neutral-300 hover:bg-neutral-900'}`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-accent bg-accent text-neutral-950' : 'border-neutral-600'}`}>
                    {on && '✓'}
                  </span>
                  <span className="truncate">{t.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[36px] px-3 rounded-xl text-sm text-neutral-400 hover:text-white">
            Cancelar
          </button>
          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => onPick(chosen)}
            className="min-h-[36px] px-3 rounded-xl bg-white text-black text-sm font-medium disabled:opacity-40"
          >
            {chosen.length > 1 ? `Pôr ${chosen.length} notas` : 'Pôr a nota'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const LinkForm: React.FC<{ open: boolean; onClose: () => void; onAdd: (url: string) => void }> = ({ open, onClose, onAdd }) => {
  const [v, setV] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setV('');
      setError(null);
    }
  }, [open]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = v.trim();
    // "exemplo.com" vira "https://exemplo.com"; só aceitamos http e https.
    const url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
      onAdd(u.toString());
    } catch {
      setError('Esse endereço não parece um link da web (http ou https).');
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Pôr um link no canvas" size="sm">
      <form onSubmit={submit} className="space-y-3">
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="https://..."
          aria-label="Endereço do link"
          inputMode="url"
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-neutral-600"
        />
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[36px] px-3 rounded-xl text-sm text-neutral-400 hover:text-white">
            Cancelar
          </button>
          <button type="submit" disabled={!v.trim()} className="min-h-[36px] px-3 rounded-xl bg-white text-black text-sm font-medium disabled:opacity-40">
            Pôr o link
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CanvasBoard;
