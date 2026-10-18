import { BASE_URL } from './api';
import { authFetch } from './auth';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export type ChatMode = 'socratic' | 'critic' | 'brainstorm';
/** Id de um plugin de IA (openai, anthropic, gemini, groq, custom, lmstudio...). */
export type LlmProvider = string;

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  call_id: string;
  name: string;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

/** Nota que a memoria da IA usou para responder (evento { memory: [...] }). */
export interface MemoryNote {
  id: number;
  title: string;
  score: number;
  /** similar = parecida com a conversa; linked = ligada por [[link]] a uma parecida */
  reason: 'similar' | 'linked';
  via?: string;
}

/** Prefixo das mensagens que so existem na tela (o backend tambem as ignora). */
export const MEMORY_PREFIX = '__memory__';

export interface ChatOptions {
  provider?: LlmProvider;
  model?: string;
  signal?: AbortSignal;
  onChunk?: (chunk: string) => void;
  onProvider?: (provider: LlmProvider) => void;
  onToolCall?: (tc: ToolCall) => void;
  onToolResult?: (tr: ToolResult) => void;
  onMemory?: (notes: MemoryNote[]) => void;
  toolsEnabled?: boolean;
  /** Busca as notas parecidas e mostra para a IA (padrao: ligado). */
  memoryEnabled?: boolean;
  sessionId?: string;
}

export interface ProviderInfo {
  default: LlmProvider;
  providers: Record<
    LlmProvider,
    { available: boolean; models: string[]; default_model?: string; label?: string }
  >;
}

/** Nome legivel do plugin (o backend antigo nao manda label). */
export function providerLabel(info: ProviderInfo | null, id: LlmProvider): string {
  return info?.providers[id]?.label ?? id;
}

/**
 * Descobre providers e modelos disponiveis via backend.
 */
export async function fetchProviders(): Promise<ProviderInfo> {
  const r = await authFetch(`${BASE_URL}/chat/providers`, {
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`providers HTTP ${r.status}`);
  return (await r.json()) as ProviderInfo;
}

/**
 * Consome o endpoint SSE /api/chat/stream e streama chunks para o callback.
 * Eventos reconhecidos:
 *   { chunk, provider }         -> streaming de texto
 *   { tool_call, provider }     -> LLM chamou uma tool (criar nota, etc)
 *   { tool_result, ... }        -> resultado da tool executada pelo backend
 *   { memory: [...] }           -> notas do usuario que a IA recebeu como contexto
 *   { done }                    -> stream terminou
 *   { error }                   -> erro fatal
 */
export async function streamChat(
  messages: ChatMessage[],
  mode: ChatMode,
  options: ChatOptions = {},
  noteId?: number,
): Promise<string> {
  const url = `${BASE_URL}/chat/stream`;
  const response = await authFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      messages: messages.filter((m) => !m.content.startsWith(MEMORY_PREFIX)),
      mode,
      provider: options.provider,
      model: options.model,
      tools_enabled: options.toolsEnabled ?? false,
      memory_enabled: options.memoryEnabled ?? true,
      session_id: options.sessionId,
      note_id: noteId,
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    // O backend explica o erro num evento "data: {"error": "..."}" (ex.: plugin sem chave).
    const text = await response.text().catch(() => '');
    const match = text.match(/data:\s*(\{.*\})/);
    let message = `Stream falhou: HTTP ${response.status}`;
    try {
      if (match) message = JSON.parse(match[1]).error ?? message;
    } catch {
      // corpo inesperado: fica a mensagem generica
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullReply = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const json = line.slice(5).trim();
        if (json === '[DONE]') continue;
        let parsed: any;
        try {
          parsed = JSON.parse(json);
        } catch {
          continue;
        }
        if (parsed.error) {
          throw new Error(parsed.error);
        }
        if (parsed.chunk) {
          fullReply += parsed.chunk;
          options.onChunk?.(parsed.chunk);
        }
        if (parsed.provider && options.onProvider) {
          options.onProvider(parsed.provider);
        }
        if (parsed.tool_call && options.onToolCall) {
          options.onToolCall(parsed.tool_call as ToolCall);
        }
        if (parsed.memory && options.onMemory) {
          options.onMemory(parsed.memory as MemoryNote[]);
        }
        if (parsed.tool_result && options.onToolResult) {
          options.onToolResult(parsed.tool_result as ToolResult);
        }
      }
    }
  }

  return fullReply;
}

/**
 * Estimador simples de tokens (heuristica: ~0.75 palavras).
 */
export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, Math.ceil(words.length / 0.75));
}
