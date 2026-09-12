import { BASE_URL } from './api';

export type ChatRole = 'system' | 'user' | 'assistant';
export type ChatMode = 'socratic' | 'critic' | 'brainstorm';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatStreamCallbacks {
  onChunk?: (chunk: string) => void;
  onDone?: (fullReply: string) => void;
  onError?: (err: Error) => void;
  signal?: AbortSignal;
}

/**
 * Consome o endpoint SSE /api/chat/stream e streama chunks para o callback.
 * Retorna a resposta completa quando o stream termina.
 */
export async function streamChat(
  messages: ChatMessage[],
  mode: ChatMode,
  callbacks: ChatStreamCallbacks = {},
  noteId?: number
): Promise<string> {
  const url = `${BASE_URL}/chat/stream`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ messages, mode, note_id: noteId }),
    signal: callbacks.signal,
  });

  if (!response.ok || !response.body) {
    const err = new Error(`Stream falhou: HTTP ${response.status}`);
    callbacks.onError?.(err);
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
            const err = new Error(parsed.error);
            callbacks.onError?.(err);
            throw err;
          }
          if (parsed.chunk) {
            fullReply += parsed.chunk;
            callbacks.onChunk?.(parsed.chunk);
          }
          if (parsed.done) {
            // não sai do loop — espera o servidor fechar
          }
        } catch (e) {
          if (e instanceof Error && e.message) {
            // erro real vindo do backend (parse acima)
            if (callbacks.onError) {
              callbacks.onError(e);
              throw e;
            }
          }
        }
      }
    }
  }

  callbacks.onDone?.(fullReply);
  return fullReply;
}

/**
 * Estimador simples de tokens (heurística: ~4 chars/token ou ~0.75 palavras).
 * Igual ao estimateTokens() do backend.
 */
export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, Math.ceil(words.length / 0.75));
}
