import { BASE_URL } from './api';

export type ChatRole = 'system' | 'user' | 'assistant';
export type ChatMode = 'socratic' | 'critic' | 'brainstorm';
export type LlmProvider = 'lmstudio' | 'openai';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  provider?: LlmProvider;
  model?: string;
  signal?: AbortSignal;
  onChunk?: (chunk: string) => void;
  onProvider?: (provider: LlmProvider) => void;
}

export interface ProviderInfo {
  default: LlmProvider;
  providers: Record<
    LlmProvider,
    { available: boolean; models: string[] }
  >;
}

/**
 * Descobre providers e modelos disponiveis via backend.
 * Backend le env (LMSTUDIO_*, OPENAI_*) e retorna catalogo.
 */
export async function fetchProviders(): Promise<ProviderInfo> {
  const r = await fetch(`${BASE_URL}/chat/providers`, {
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`providers HTTP ${r.status}`);
  return (await r.json()) as ProviderInfo;
}

/**
 * Consome o endpoint SSE /api/chat/stream e streama chunks para o callback.
 * Retorna a resposta completa quando o stream termina.
 */
export async function streamChat(
  messages: ChatMessage[],
  mode: ChatMode,
  options: ChatOptions = {},
  noteId?: number,
): Promise<string> {
  const url = `${BASE_URL}/chat/stream`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      messages,
      mode,
      provider: options.provider,
      model: options.model,
      note_id: noteId,
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const err = new Error(`Stream falhou: HTTP ${response.status}`);
    throw err;
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
        try {
          const parsed = JSON.parse(json);
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
        } catch (e) {
          if (e instanceof Error && e.message) throw e;
        }
      }
    }
  }

  return fullReply;
}

/**
 * Estimador simples de tokens (heuristica: ~0.75 palavras).
 * Igual ao estimateTokens() do backend.
 */
export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, Math.ceil(words.length / 0.75));
}
