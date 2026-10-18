import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { BASE_URL } from './api';
import { authFetch, getToken } from './auth';

/**
 * Edição de nota em conjunto, ao vivo.
 *
 * O texto da nota vira um Y.Text do Yjs. O Yjs é um CRDT: cada pessoa edita a sua cópia, cada
 * edição vira uma "atualização" pequena, e as cópias se juntam sozinhas no mesmo texto, sem
 * conflito, mesmo que as atualizações cheguem em ordens diferentes.
 *
 * O servidor (backend: collab/CollabHub.java) só repassa as atualizações pelo WebSocket e guarda
 * as que já passaram, para quem entra depois. A "presença" (nome, cor e cursor de cada um)
 * usa o Awareness do y-protocols e não é guardada.
 *
 * Mensagens binárias: 1º byte = tipo (0 atualização, 1 presença, 2 retrato completo).
 */

const UPDATE = 0;
const AWARENESS = 1;
const SNAPSHOT = 2;

export interface CollabNote {
  id: number;
  title: string;
  content: string | null;
  owner_name: string;
  is_owner: boolean;
  collaborators: number;
  updated_at: string;
}

export interface ShareInfo {
  id: number;
  user_id: number;
  name: string;
  email: string | null;
  created_at: string;
}

export interface SharedNote {
  id: number;
  title: string;
  owner_name: string;
  updated_at: string;
}

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let message = `HTTP ${r.status}`;
    try {
      message = (await r.json()).message ?? message;
    } catch {
      // corpo sem JSON
    }
    throw new Error(message);
  }
  return (await r.json()) as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const collabApi = {
  show: async (id: number) => json<CollabNote>(await authFetch(`${BASE_URL}/collab/notes/${id}`)),
  save: async (id: number, content: string) =>
    json<CollabNote>(await authFetch(`${BASE_URL}/collab/notes/${id}/content`, jsonInit('PUT', { content }))),
  shares: async (id: number) => json<ShareInfo[]>(await authFetch(`${BASE_URL}/collab/notes/${id}/shares`)),
  invite: async (id: number, email: string) =>
    json<ShareInfo>(await authFetch(`${BASE_URL}/collab/notes/${id}/shares`, jsonInit('POST', { email }))),
  revoke: async (id: number, shareId: number) =>
    json<{ message: string }>(await authFetch(`${BASE_URL}/collab/notes/${id}/shares/${shareId}`, { method: 'DELETE' })),
  sharedWithMe: async () => json<SharedNote[]>(await authFetch(`${BASE_URL}/collab/shared-with-me`)),
};

/** Cor fixa por pessoa (a partir do id do Yjs), para o cursor e a bolinha de presença. */
const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316'];
export const colorFor = (n: number) => COLORS[Math.abs(n) % COLORS.length];

export interface Peer {
  clientId: number;
  name: string;
  color: string;
  /** Posição do cursor no texto (índice), se a pessoa estiver com o editor aberto. */
  anchor: number | null;
  head: number | null;
}

export type CollabStatus = 'conectando' | 'conectado' | 'reconectando' | 'removido';

interface Options {
  noteId: number;
  name: string;
  /** Texto salvo da nota: entra no documento se esta aba for a primeira da sala. */
  initial: string;
  onStatus: (s: CollabStatus) => void;
  onPeers: (peers: Peer[]) => void;
}

function wsUrl(noteId: number): string {
  const base = BASE_URL.startsWith('http') ? BASE_URL : `${location.origin}${BASE_URL}`;
  const root = base.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
  return `${root}/ws/collab/${noteId}?token=${encodeURIComponent(getToken() ?? '')}`;
}

const frame = (type: number, data: Uint8Array) => {
  const out = new Uint8Array(data.length + 1);
  out[0] = type;
  out.set(data, 1);
  return out;
};

export class CollabSession {
  readonly doc = new Y.Doc();
  readonly text = this.doc.getText('content');
  readonly awareness = new Awareness(this.doc);
  readonly color: string;

  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 1000;
  private timer = 0;
  private seeded = false;

  constructor(private opts: Options) {
    this.color = colorFor(this.doc.clientID);
    this.awareness.setLocalState({ user: { name: opts.name, color: this.color }, cursor: null });

    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'remote') this.send(frame(UPDATE, update));
    });
    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin !== 'remote') {
        const changed = [...added, ...updated, ...removed];
        this.send(frame(AWARENESS, encodeAwarenessUpdate(this.awareness, changed)));
      }
      this.emitPeers();
    });
    this.connect();
  }

  /** Guarda onde está o cursor desta pessoa (como posição relativa: sobrevive às edições dos outros). */
  setCursor(anchor: number, head: number) {
    const rel = (i: number) => Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(this.text, i));
    this.awareness.setLocalStateField('cursor', { anchor: rel(anchor), head: rel(head) });
  }

  destroy() {
    this.closed = true;
    clearTimeout(this.timer);
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'local');
    this.ws?.close();
    this.awareness.destroy();
    this.doc.destroy();
  }

  private connect() {
    this.opts.onStatus(this.ws ? 'reconectando' : 'conectando');
    const ws = new WebSocket(wsUrl(this.opts.noteId));
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onmessage = (e) => {
      if (typeof e.data === 'string') return this.onControl(e.data);
      const data = new Uint8Array(e.data as ArrayBuffer);
      const body = data.subarray(1);
      if (data[0] === UPDATE) Y.applyUpdate(this.doc, body, 'remote');
      else if (data[0] === AWARENESS) applyAwarenessUpdate(this.awareness, body, 'remote');
    };
    ws.onclose = (e) => {
      if (this.closed) return;
      if (e.code === 4403) {
        this.opts.onStatus('removido');
        return;
      }
      this.opts.onStatus('reconectando');
      this.timer = window.setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(this.retry * 2, 15_000);
    };
  }

  private onControl(raw: string) {
    let msg: { type?: string; seed?: boolean; client?: number };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'init') {
      this.retry = 1000;
      // Primeira aba da sala: põe o texto salvo da nota no documento (uma vez só)
      if (msg.seed && !this.seeded && this.text.length === 0 && this.opts.initial) {
        this.doc.transact(() => this.text.insert(0, this.opts.initial), 'seed');
      }
      this.seeded = true;
      // Reconectou numa sala que tinha esvaziado: manda tudo o que esta aba sabe (repetir não estraga nada)
      if (this.text.length > 0) this.send(frame(UPDATE, Y.encodeStateAsUpdate(this.doc)));
      this.send(JSON.stringify({ type: 'identify', client: this.doc.clientID }));
      this.sendMyPresence();
      this.opts.onStatus('conectado');
    } else if (msg.type === 'hello') {
      this.sendMyPresence();
    } else if (msg.type === 'left' && typeof msg.client === 'number') {
      removeAwarenessStates(this.awareness, [msg.client], 'remote');
    } else if (msg.type === 'compact') {
      this.send(frame(SNAPSHOT, Y.encodeStateAsUpdate(this.doc)));
    }
  }

  private sendMyPresence() {
    this.send(frame(AWARENESS, encodeAwarenessUpdate(this.awareness, [this.doc.clientID])));
  }

  private send(data: Uint8Array | string) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
  }

  private emitPeers() {
    const peers: Peer[] = [];
    const abs = (rel: unknown) => {
      if (!rel) return null;
      const pos = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(rel), this.doc);
      return pos ? pos.index : null;
    };
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId === this.doc.clientID || !state?.user) return;
      peers.push({
        clientId,
        name: String(state.user.name ?? 'Alguém'),
        color: String(state.user.color ?? colorFor(clientId)),
        anchor: abs(state.cursor?.anchor),
        head: abs(state.cursor?.head),
      });
    });
    this.opts.onPeers(peers);
  }

  /** Recalcula os cursores dos outros (as posições andam quando o texto muda). */
  refreshPeers() {
    this.emitPeers();
  }
}

/**
 * Aplica no Y.Text a diferença entre o texto antigo e o novo do <textarea>.
 * Acha o começo e o fim iguais e troca só o miolo: digitar uma letra vira "inserir 1 letra".
 */
export function applyDiff(text: Y.Text, before: string, after: string) {
  if (before === after) return;
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let end = 0;
  while (end < max - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  const removed = before.length - start - end;
  const inserted = after.slice(start, after.length - end);
  text.doc?.transact(() => {
    if (removed > 0) text.delete(start, removed);
    if (inserted) text.insert(start, inserted);
  }, 'local');
}

/** Move um índice do texto conforme uma mudança (delta do Yjs) feita por outra pessoa. */
export function transformIndex(index: number, delta: { retain?: number; insert?: unknown; delete?: number }[]): number {
  // pos anda pelo texto ANTIGO (onde o índice está): retain e delete consomem, insert não.
  let pos = 0;
  let out = index;
  for (const op of delta) {
    if (pos > index) break;
    if (op.retain) {
      pos += op.retain;
    } else if (op.insert !== undefined) {
      const len = typeof op.insert === 'string' ? op.insert.length : 1;
      if (pos <= index) out += len;
    } else if (op.delete) {
      if (pos < index) out -= Math.min(op.delete, index - pos);
      pos += op.delete;
    }
  }
  return Math.max(0, out);
}
