/**
 * Canvas: um quadro infinito com cartões e setas, como o Canvas do Obsidian.
 *
 * O desenho é guardado no formato aberto JSON Canvas (https://jsoncanvas.org). Um exemplo:
 *   { "nodes": [ { "id": "a1", "type": "text", "x": 0, "y": 0, "width": 250, "height": 60, "text": "Oi" } ],
 *     "edges": [ { "id": "e1", "fromNode": "a1", "toNode": "b2" } ] }
 * Por ser um formato aberto, dá para exportar um .canvas daqui e abrir no Obsidian.
 *
 * Os 4 tipos de cartão: text (texto com Markdown), file (uma nota; o formato chama de "arquivo"
 * e guarda "Título.md"), link (um endereço da web) e group (uma moldura que junta cartões).
 */
import { api } from './api';

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type End = 'none' | 'arrow';

interface BaseNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** "1" a "6" (cores do Obsidian) ou "#rrggbb". */
  color?: string;
}
export interface TextNode extends BaseNode {
  type: 'text';
  text: string;
}
export interface FileNode extends BaseNode {
  type: 'file';
  file: string;
  subpath?: string;
}
export interface LinkNode extends BaseNode {
  type: 'link';
  url: string;
}
export interface GroupNode extends BaseNode {
  type: 'group';
  label?: string;
}
export type CanvasNode = TextNode | FileNode | LinkNode | GroupNode;

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: Side;
  fromEnd?: End;
  toNode: string;
  toSide?: Side;
  toEnd?: End;
  color?: string;
  label?: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasItem {
  id: number;
  title: string;
  cards: number;
  updated_at: string;
}

export interface CanvasDetail {
  id: number;
  title: string;
  data: CanvasData;
  revision: number;
  created_at: string;
  updated_at: string;
}

export const canvasApi = {
  list: () => api.get<CanvasItem[]>('/canvases'),
  get: (id: number) => api.get<CanvasDetail>(`/canvases/${id}`),
  create: (title: string, data?: CanvasData) => api.post<CanvasDetail>('/canvases', { title, data }),
  /** revision = a versão que você abriu. Se alguém salvou antes, o servidor responde 409. */
  save: (id: number, body: { title?: string; data?: CanvasData; revision: number }) =>
    api.put<CanvasDetail>(`/canvases/${id}`, body),
  remove: (id: number) => api.delete<{ ok: boolean }>(`/canvases/${id}`),
};

export const emptyCanvas = (): CanvasData => ({ nodes: [], edges: [] });

/** Id aleatório de 16 letras hexadecimais, igual aos que o Obsidian gera. */
export function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------------ notas

/** No JSON Canvas uma nota é um arquivo: "Abrir uma loja.md". */
export const noteFile = (title: string) => `${title}.md`;

/** "Pasta/Abrir uma loja.md" → "Abrir uma loja" (o Obsidian guarda o caminho; aqui vale o nome). */
export function fileTitle(file: string): string {
  const base = file.split('/').pop() ?? file;
  return base.replace(/\.md$/i, '');
}

// ------------------------------------------------------------------ cores

export const CANVAS_COLORS = [
  { id: '1', name: 'Vermelho' },
  { id: '2', name: 'Laranja' },
  { id: '3', name: 'Amarelo' },
  { id: '4', name: 'Verde' },
  { id: '5', name: 'Ciano' },
  { id: '6', name: 'Roxo' },
] as const;

/**
 * A cor como "R G B" para usar em rgb(... / transparência). As 6 do Obsidian vêm do tema
 * (variáveis --canvas-1 a 6); uma cor #rrggbb de um arquivo importado é convertida.
 */
export function colorTriple(color?: string): string | null {
  if (!color) return null;
  if (/^[1-6]$/.test(color)) return `var(--canvas-${color})`;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  return m ? m.slice(1).map((h) => parseInt(h, 16)).join(' ') : null;
}

export function colorName(color?: string): string {
  return CANVAS_COLORS.find((c) => c.id === color)?.name ?? (color ? 'Cor própria' : 'Sem cor');
}

// ------------------------------------------------------------------ geometria

export interface Point {
  x: number;
  y: number;
}

const NORMAL: Record<Side, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

/** O meio do lado do cartão, onde a seta encosta. */
export function anchor(n: CanvasNode, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: n.x + n.width / 2, y: n.y };
    case 'bottom':
      return { x: n.x + n.width / 2, y: n.y + n.height };
    case 'left':
      return { x: n.x, y: n.y + n.height / 2 };
    default:
      return { x: n.x + n.width, y: n.y + n.height / 2 };
  }
}

const center = (n: CanvasNode): Point => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });

/** Sem lado salvo na seta: usa os lados que se olham (um à direita do outro → right/left). */
export function facingSides(a: CanvasNode, b: CanvasNode): [Side, Side] {
  const ca = center(a);
  const cb = center(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  if (Math.abs(dx) * a.height > Math.abs(dy) * a.width) return dx > 0 ? ['right', 'left'] : ['left', 'right'];
  return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** O lado do cartão mais perto de um ponto (onde você soltou a seta). */
export function nearestSide(n: CanvasNode, p: Point): Side {
  const d: [Side, number][] = [
    ['top', Math.abs(p.y - n.y)],
    ['bottom', Math.abs(p.y - (n.y + n.height))],
    ['left', Math.abs(p.x - n.x)],
    ['right', Math.abs(p.x - (n.x + n.width))],
  ];
  return d.sort((a, b) => a[1] - b[1])[0][0];
}

/**
 * Em qual cartão (e por qual lado) a seta que está sendo puxada vai encaixar, se soltar em `p`.
 * A conta é pela posição (e não pelo elemento debaixo do mouse) e com uma folga de `tol` em
 * volta de cada cartão: assim dá para soltar em cima da bolinha da borda, um pouco para fora
 * do cartão, e a seta ainda encaixa (igual ao n8n). Cartões ganham dos grupos; um grupo só
 * encaixa perto da moldura, porque soltar no miolo dele é para criar um cartão ali dentro.
 */
export function dropTarget(nodes: CanvasNode[], from: CanvasNode, p: Point, tol: number): { node: CanvasNode; side: Side } | null {
  const near = (n: CanvasNode) => p.x >= n.x - tol && p.x <= n.x + n.width + tol && p.y >= n.y - tol && p.y <= n.y + n.height + tol;
  const { groups, cards } = drawOrder(nodes.filter((n) => n.id !== from.id));
  // O último desenhado fica por cima: procura de trás para frente.
  for (const n of [...cards].reverse()) {
    if (!near(n)) continue;
    // Soltou no miolo: chega pelo lado virado para a origem. Perto de uma borda: por ela.
    const middle = p.x > n.x + n.width * 0.25 && p.x < n.x + n.width * 0.75 && p.y > n.y + n.height * 0.25 && p.y < n.y + n.height * 0.75;
    return { node: n, side: middle ? facingSides(from, n)[1] : nearestSide(n, p) };
  }
  for (const n of [...groups].reverse()) {
    const side = nearestSide(n, p);
    const a = anchor(n, side);
    const offBorder = side === 'top' || side === 'bottom' ? Math.abs(p.y - a.y) : Math.abs(p.x - a.x);
    if (near(n) && offBorder <= tol) return { node: n, side };
  }
  return null;
}

/**
 * A curva da seta: uma curva de Bézier que sai "para fora" do lado de origem e chega "de fora"
 * no lado de destino, como no Obsidian. Devolve o caminho SVG e o ponto do meio (para o rótulo).
 */
export function edgeCurve(from: Point, fromSide: Side, to: Point, toSide?: Side): { d: string; mid: Point } {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const k = Math.max(40, Math.min(160, dist * 0.4));
  const n1 = NORMAL[fromSide];
  const c1 = { x: from.x + n1.x * k, y: from.y + n1.y * k };
  const n2 = toSide ? NORMAL[toSide] : { x: 0, y: 0 };
  const c2 = { x: to.x + n2.x * k, y: to.y + n2.y * k };
  // Ponto em t = 0,5 da curva cúbica: (p0 + 3c1 + 3c2 + p3) / 8
  const mid = { x: (from.x + 3 * c1.x + 3 * c2.x + to.x) / 8, y: (from.y + 3 * c1.y + 3 * c2.y + to.y) / 8 };
  return { d: `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`, mid };
}

export function bounds(nodes: CanvasNode[]): { x: number; y: number; width: number; height: number } | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** O cartão está inteiro dentro do grupo? (Arrastar o grupo leva junto quem está dentro.) */
export function inside(group: CanvasNode, n: CanvasNode): boolean {
  return n.id !== group.id && n.x >= group.x && n.y >= group.y && n.x + n.width <= group.x + group.width && n.y + n.height <= group.y + group.height;
}

/** Grupos ficam atrás de tudo; o maior mais atrás, para um grupo dentro de outro aparecer. */
export function drawOrder(nodes: CanvasNode[]): { groups: GroupNode[]; cards: CanvasNode[] } {
  const groups = nodes.filter((n): n is GroupNode => n.type === 'group').sort((a, b) => b.width * b.height - a.width * a.height);
  return { groups, cards: nodes.filter((n) => n.type !== 'group') };
}

// ------------------------------------------------------------------ arquivo .canvas

const SIDE_SET = new Set<Side>(['top', 'right', 'bottom', 'left']);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined);

/**
 * A mesma limpeza que o servidor faz (CanvasFormat.java), feita também aqui antes de mostrar
 * um arquivo importado: um link "javascript:" num .canvas de fora não pode virar um clique
 * perigoso nem por um segundo, antes de salvar.
 */
export function sanitizeCanvas(raw: { nodes?: unknown[]; edges?: unknown[] }): CanvasData {
  const nodes: CanvasNode[] = [];
  const ids = new Set<string>();
  for (const item of raw.nodes ?? []) {
    const n = item as Record<string, unknown>;
    const type = n?.type;
    let id = str(n?.id, 128);
    if (!id || (type !== 'text' && type !== 'file' && type !== 'link' && type !== 'group')) continue;
    if (ids.has(id)) id = newId();
    const base = {
      id,
      x: isNum(n.x) ? Math.round(n.x) : 0,
      y: isNum(n.y) ? Math.round(n.y) : 0,
      width: isNum(n.width) && n.width > 0 ? Math.round(n.width) : 250,
      height: isNum(n.height) && n.height > 0 ? Math.round(n.height) : 60,
      ...(colorTriple(str(n.color, 16)) ? { color: str(n.color, 16) } : {}),
    };
    if (type === 'text') nodes.push({ ...base, type, text: str(n.text, 100_000) ?? '' });
    else if (type === 'file') {
      const file = str(n.file, 1024);
      if (!file) continue;
      const subpath = str(n.subpath, 512);
      nodes.push({ ...base, type, file, ...(subpath ? { subpath } : {}) });
    } else if (type === 'link') {
      const url = str(n.url, 2048)?.trim();
      if (!url || !/^https?:\/\/\S+$/i.test(url)) continue;
      nodes.push({ ...base, type, url });
    } else {
      const label = str(n.label, 512);
      nodes.push({ ...base, type, ...(label ? { label } : {}) });
    }
    ids.add(id);
  }
  const edges: CanvasEdge[] = [];
  const edgeIds = new Set<string>();
  for (const item of raw.edges ?? []) {
    const e = item as Record<string, unknown>;
    const id = str(e?.id, 128);
    const fromNode = str(e?.fromNode, 128);
    const toNode = str(e?.toNode, 128);
    if (!id || !fromNode || !toNode || !ids.has(fromNode) || !ids.has(toNode) || edgeIds.has(id)) continue;
    edgeIds.add(id);
    const edge: CanvasEdge = { id, fromNode, toNode };
    if (SIDE_SET.has(e.fromSide as Side)) edge.fromSide = e.fromSide as Side;
    if (SIDE_SET.has(e.toSide as Side)) edge.toSide = e.toSide as Side;
    if (e.fromEnd === 'none' || e.fromEnd === 'arrow') edge.fromEnd = e.fromEnd;
    if (e.toEnd === 'none' || e.toEnd === 'arrow') edge.toEnd = e.toEnd;
    const color = str(e.color, 16);
    if (colorTriple(color)) edge.color = color;
    const label = str(e.label, 512);
    if (label) edge.label = label;
    edges.push(edge);
  }
  return { nodes, edges };
}

/** Lê um arquivo .canvas (do Obsidian ou exportado daqui) e já limpa (ver sanitizeCanvas). */
export function parseCanvasFile(text: string): CanvasData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Esse arquivo não é um .canvas válido (não é JSON).');
  }
  const obj = raw as { nodes?: unknown; edges?: unknown } | null;
  if (!obj || typeof obj !== 'object' || (obj.nodes !== undefined && !Array.isArray(obj.nodes)) || (obj.edges !== undefined && !Array.isArray(obj.edges))) {
    throw new Error('Esse arquivo não tem o formato do JSON Canvas (listas "nodes" e "edges").');
  }
  return sanitizeCanvas(obj as { nodes?: unknown[]; edges?: unknown[] });
}

/** O Obsidian grava o .canvas com tabulação; fazemos igual, para o arquivo ficar idêntico. */
export const toCanvasFile = (data: CanvasData) => JSON.stringify(data, null, '\t');

// ------------------------------------------------------------------ "Abrir no Canvas"

export const NOTE_CARD = { width: 320, height: 220 };

/**
 * Monta um canvas com a nota no meio e as notas ligadas a ela em volta (um círculo),
 * com uma seta do centro para cada vizinha, e também as ligações entre as vizinhas.
 */
export function canvasFromNote(
  center: { id: number; title: string },
  neighbors: { id: number; title: string }[],
  links: [number, number][]
): CanvasData {
  const ids = new Map<number, string>();
  const node = (title: string, x: number, y: number): FileNode => ({
    id: newId(),
    type: 'file',
    file: noteFile(title),
    x: Math.round(x - NOTE_CARD.width / 2),
    y: Math.round(y - NOTE_CARD.height / 2),
    ...NOTE_CARD,
  });
  const middle = node(center.title, 0, 0);
  middle.color = '5';
  ids.set(center.id, middle.id);
  const nodes: CanvasNode[] = [middle];
  const radius = Math.max(480, (neighbors.length * (NOTE_CARD.width + 60)) / (2 * Math.PI));
  neighbors.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, neighbors.length) - Math.PI / 2;
    const card = node(n.title, Math.cos(angle) * radius, Math.sin(angle) * radius * 0.7);
    ids.set(n.id, card.id);
    nodes.push(card);
  });
  const edges: CanvasEdge[] = [];
  const seen = new Set<string>();
  for (const [a, b] of links) {
    const from = ids.get(a);
    const to = ids.get(b);
    const key = [from, to].sort().join('|');
    if (!from || !to || from === to || seen.has(key)) continue;
    seen.add(key);
    edges.push({ id: newId(), fromNode: from, toNode: to, toEnd: 'arrow' });
  }
  return { nodes, edges };
}
