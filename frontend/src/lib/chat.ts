import { BASE_URL } from './api';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export type ChatMode = 'socratic' | 'critic' | 'brainstorm';
export type LlmProvider = 'lmstudio' | 'openai';

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

export interface ChatOptions {
  provider?: LlmProvider;
  model?: string;
  signal?: AbortSignal;
  onChunk?: (chunk: string) => void;
  onProvider?: (provider: LlmProvider) => void;
  onToolCall?: (tc: ToolCall) => void;
  onToolResult?: (tr: ToolResult) => void;
  toolsEnabled?: boolean;
  sessionId?: string;
}

export interface ProviderInfo {
  default: LlmProvider;
  providers: Record<
    LlmProvider,
    { available: boolean; models: string[]; default_model?: string }
  >;
}

/**
 * Descobre providers e modelos disponiveis via backend.
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
 * Eventos reconhecidos:
 *   { chunk, provider }         -> streaming de texto
 *   { tool_call, provider }     -> LLM chamou uma tool (criar nota, etc)
 *   { tool_result, ... }        -> resultado da tool executada pelo backend
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
      tools_enabled: options.toolsEnabled ?? false,
      session_id: options.sessionId,
      note_id: noteId,
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Stream falhou: HTTP ${response.status}`);
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
