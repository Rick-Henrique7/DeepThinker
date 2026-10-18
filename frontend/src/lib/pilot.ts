import { BASE_URL } from './api';
import { authFetch } from './auth';

/**
 * Modo piloto: a aba ouve os comandos que uma IA de fora manda pelo servidor MCP
 * (ver backend: pilot/PilotHub.java e mcp/McpTools.java) e devolve o resultado.
 *
 * O stream usa fetch e não EventSource porque o EventSource não manda o cabeçalho
 * Authorization. Se a conexão cair (servidor reiniciou, rede), tenta de novo sozinho.
 */

export type PilotAction = 'navigate' | 'open_note' | 'move_card' | 'board';

export interface PilotCommand {
  type: 'command';
  id: string;
  action: PilotAction;
  args: Record<string, unknown>;
  agent: string;
}

export interface PilotResult {
  ok: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

/** Eventos que o piloto manda para a página do Quadro (GraphPage), que é quem sabe mover cartões. */
export const PILOT_MOVE_EVENT = 'deepthinker:pilot-move';
export const PILOT_GROUP_EVENT = 'deepthinker:pilot-group';
/** Recarrega o Quadro e destaca o que a IA mudou (cartão ou coluna). */
export const PILOT_BOARD_EVENT = 'deepthinker:pilot-board';

export interface PilotBoardDetail {
  highlight?: { card?: number; column?: string } | null;
  done: () => void;
}

export interface PilotMoveDetail {
  id: number;
  value: string;
  property: string;
  /** A página chama ao terminar de salvar: true se deu certo. */
  done: (ok: boolean, error?: string) => void;
}

/** "Recebi": avisa na hora, antes da animação, para o servidor saber que esta aba está viva. */
export function sendPilotAck(id: string): Promise<Response> {
  return authFetch(`${BASE_URL}/pilot/acks/${encodeURIComponent(id)}`, { method: 'POST' });
}

export function sendPilotResult(id: string, result: PilotResult): Promise<Response> {
  return authFetch(`${BASE_URL}/pilot/results/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  });
}

/** Abre o stream e chama onCommand para cada comando. Devolve a função que fecha tudo. */
export function connectPilot(onCommand: (c: PilotCommand) => void): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let retry = 1000;
  let timer = 0;

  const run = async () => {
    controller = new AbortController();
    try {
      const r = await authFetch(`${BASE_URL}/pilot/stream`, {
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      if (r.status === 401) return; // saiu da conta: não insiste
      if (!r.ok || !r.body) throw new Error(`pilot HTTP ${r.status}`);
      retry = 1000;
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        // Eventos SSE terminam com uma linha em branco; "data:" traz o JSON
        let end: number;
        while ((end = buffer.search(/\r?\n\r?\n/)) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, '');
          const data = block
            .split(/\r?\n/)
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
            .join('\n');
          if (!data) continue; // comentário ":ping"
          try {
            const msg = JSON.parse(data);
            if (msg?.type === 'command') onCommand(msg as PilotCommand);
          } catch {
            // evento malformado: ignora
          }
        }
      }
    } catch {
      // abortado ou caiu: reconecta abaixo
    }
    if (!stopped) {
      timer = window.setTimeout(run, retry);
      retry = Math.min(retry * 2, 30_000);
    }
  };
  run();

  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
  };
}

// ------------------------------------------------------------ tokens de acesso (MCP)

export interface AccessTokenInfo {
  id: number;
  name: string;
  prefix: string;
  can_write: boolean;
  created_at: string;
  last_used_at: string | null;
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

export const accessTokens = {
  list: async () => json<AccessTokenInfo[]>(await authFetch(`${BASE_URL}/mcp/tokens`)),
  create: async (name: string, canWrite: boolean) =>
    json<{ info: AccessTokenInfo; token: string }>(
      await authFetch(`${BASE_URL}/mcp/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, can_write: canWrite }),
      })
    ),
  revoke: async (id: number) =>
    json<{ message: string }>(await authFetch(`${BASE_URL}/mcp/tokens/${id}`, { method: 'DELETE' })),
};

/** Endereço do servidor MCP: o mesmo backend, em /mcp no lugar de /api. */
export function mcpUrl(): string {
  return BASE_URL.replace(/\/api\/?$/, '') + '/mcp';
}
