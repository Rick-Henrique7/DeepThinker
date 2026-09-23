import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Brain, Scale, Sparkles, MessageSquare, Send, FileUp, X, Loader2, AlertTriangle, FileText, Trash2, ChevronDown, Wrench, FilePlus, CheckCircle2, XCircle } from 'lucide-react';
import { Modal, ConfirmModal } from '../components/Modal';
import { ChatMessage, ChatMode, LlmProvider, streamChat, estimateTokens, fetchProviders, ProviderInfo, ToolCall, ToolResult } from '../lib/chat';
import { api } from '../lib/api';

const MODES: { id: ChatMode; label: string; description: string; icon: React.ElementType }[] = [
  { id: 'socratic', label: 'Socrático', description: 'Faz perguntas para guiar seu pensamento.', icon: Brain },
  { id: 'critic', label: 'Crítico', description: 'Encontra falhas e vieses nos seus argumentos.', icon: Scale },
  { id: 'brainstorm', label: 'Brainstorm', description: 'Gera alternativas e conexões inesperadas.', icon: Sparkles },
];

const STORAGE_KEY = 'deepthinker:advogado-session';
const SESSION_ID_KEY = 'deepthinker:advogado-session-id';
const AUTO_SUMMARIZE_DISMISS_KEY = 'deepthinker:advogado-auto-summarize-dismissed';
const TOOLS_ENABLED_KEY = 'deepthinker:advogado-tools-enabled';
const AUTO_SUMMARIZE_THRESHOLD = 8;

function generateSessionId(): string {
  // UUID v4 simples via crypto.randomUUID
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOrCreateSessionId(): string {
  try {
    let sid = localStorage.getItem(SESSION_ID_KEY);
    if (!sid) {
      sid = generateSessionId();
      localStorage.setItem(SESSION_ID_KEY, sid);
    }
    return sid;
  } catch {
    return generateSessionId();
  }
}

interface PersistedSession {
  mode: ChatMode;
  provider?: LlmProvider;
  model?: string;
  messages: ChatMessage[];
}

function loadSession(): PersistedSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { mode: 'socratic', messages: [] };
}

function saveSession(s: PersistedSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // localStorage pode estar cheio/desabilitado
  }
}

export function AdvogadoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = loadSession();
  const [mode, setMode] = useState<ChatMode>(initial.mode);
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [showTokenWarning, setShowTokenWarning] = useState(false);
  const [showSummaryConfirm, setShowSummaryConfirm] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; title: string; message: string } | null>(null);
  const [providers, setProviders] = useState<ProviderInfo | null>(null);
  const [provider, setProvider] = useState<LlmProvider | null>(initial.provider ?? null);
  const [model, setModel] = useState<string | null>(initial.model ?? null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [autoSummarizeDismissed, setAutoSummarizeDismissed] = useState(false);
  const [toolsEnabled, setToolsEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TOOLS_ENABLED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const sessionIdRef = useRef<string>(getOrCreateSessionId());
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Suporte a ?session=UUID vindo do NoteDrawer (link reverso)
  useEffect(() => {
    const sid = searchParams.get('session');
    if (sid && sid !== sessionIdRef.current) {
      sessionIdRef.current = sid;
      try {
        localStorage.setItem(SESSION_ID_KEY, sid);
      } catch {}
      // Carrega mensagens dessa sessao do backend
      (async () => {
        try {
          const r = await api.get<Array<{ role: string; content: string }>>(
            `/conversations?session_id=${encodeURIComponent(sid)}`
          );
          const loaded: ChatMessage[] = r
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role as ChatMessage['role'], content: m.content }));
          if (loaded.length > 0) {
            setMessages(loaded);
            setFeedback({
              ok: true,
              title: 'Conversa carregada',
              message: `${loaded.length} mensagens restauradas desta sessao.`,
            });
          }
        } catch (e) {
          console.warn('Falha ao carregar sessao:', e);
        }
      })();
      // Limpa o param da URL pra nao re-executar em F5
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const contextWindow = 8192;
  const totalTokens = messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
  const usagePct = Math.min(100, (totalTokens / contextWindow) * 100);
  const overLimit = totalTokens > contextWindow;

  // Carregar providers na montagem
  useEffect(() => {
    fetchProviders()
      .then((info) => {
        setProviders(info);
        // Auto-selecionar provider default se nenhum escolhido
        if (!provider) {
          setProvider(info.default);
          const models = info.providers[info.default]?.models ?? [];
          if (models[0]) setModel(models[0]);
        }
      })
      .catch(() => {
        // silencioso se falhar
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Banner auto-summarize: aparece apos N msgs do usuario, a menos que dismiss recente
  const userMessageCount = messages.filter((m) => m.role === 'user').length;
  useEffect(() => {
    if (autoSummarizeDismissed) return;
    try {
      const dismissedAt = Number(localStorage.getItem(AUTO_SUMMARIZE_DISMISS_KEY) || 0);
      const now = Date.now();
      // Dismiss vale por 1 hora
      if (dismissedAt && now - dismissedAt < 3600_000) {
        setAutoSummarizeDismissed(true);
      }
    } catch {}
  }, [autoSummarizeDismissed]);
  const showAutoSummarizeBanner =
    !streaming &&
    !summaryBusy &&
    userMessageCount >= AUTO_SUMMARIZE_THRESHOLD &&
    !autoSummarizeDismissed;

  // Persistir sessão (incluindo provider/modelo)
  useEffect(() => {
    saveSession({
      mode,
      provider: provider ?? undefined,
      model: model ?? undefined,
      messages: messages.filter((m) => !m.content.startsWith('__')),
    });
  }, [mode, provider, model, messages]);

  // Aviso + truncamento quando excede
  useEffect(() => {
    if (overLimit && !showTokenWarning) {
      setShowTokenWarning(true);
      setMessages((prev) => {
        if (prev.length <= 2) return prev;
        const head = prev[0];
        const tail: ChatMessage[] = [];
        let budget = contextWindow;
        for (let i = prev.length - 1; i >= 1; i--) {
          const t = estimateTokens(prev[i].content);
          if (budget - t <= 0) break;
          budget -= t;
          tail.unshift(prev[i]);
        }
        return [head, ...tail];
      });
    }
  }, [overLimit, showTokenWarning, contextWindow]);

  // Auto-scroll ao final
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming, streamBuffer]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setStreaming(true);
    setStreamBuffer('');

    // Persistir msg do usuario (best-effort, fire-and-forget)
    try {
      api.post('/conversations', {
        role: 'user',
        content: text,
        session_id: sessionIdRef.current,
      });
    } catch {}

    abortRef.current = new AbortController();
    try {
      const reply = await streamChat(next, mode, {
        provider: provider ?? undefined,
        model: model ?? undefined,
        toolsEnabled,
        sessionId: sessionIdRef.current,
        onChunk: (chunk) => setStreamBuffer((buf) => buf + chunk),
        onToolCall: (tc) => {
          setMessages((prev) => [
            ...prev,
            {
              role: 'tool',
              content: '__tool_call__' + JSON.stringify(tc),
            },
          ]);
        },
        onToolResult: (tr) => {
          setMessages((prev) => {
            // Atualiza a ultima tool_call correspondente
            const idx = [...prev].reverse().findIndex(
              (m) => m.role === 'tool' && m.content.startsWith('__tool_call__')
            );
            if (idx === -1) return prev;
            const realIdx = prev.length - 1 - idx;
            const updated = [...prev];
            updated[realIdx] = {
              role: 'tool',
              content: '__tool_result__' + JSON.stringify(tr),
            };
            return updated;
          });
        },
        signal: abortRef.current.signal,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      // Persistir resposta do Advogado
      try {
        api.post('/conversations', {
          role: 'assistant',
          content: reply,
          session_id: sessionIdRef.current,
        });
      } catch {}
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '__error__' + (err instanceof Error ? err.message : 'Erro desconhecido.') },
      ]);
    } finally {
      setStreaming(false);
      setStreamBuffer('');
      abortRef.current = null;
    }
  };

  const toggleTools = () => {
    setToolsEnabledState((v) => {
      const next = !v;
      try {
        localStorage.setItem(TOOLS_ENABLED_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const handleClear = () => {
    if (messages.length === 0) return;
    if (!confirm('Limpar toda a conversa?')) return;
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const handleSummarize = async () => {
    setShowSummaryConfirm(false);
    if (messages.length === 0) return;

    setSummaryBusy(true);
    setFeedback(null);
    try {
      const result = await api.post<{ note: { title: string }; created: number; reused: number }>(
        '/notes/summarize',
        {
          messages,
          mode,
          session_id: sessionIdRef.current,
          provider: provider ?? undefined,
          model: model ?? undefined,
        }
      );
      setFeedback({
        ok: true,
        title: 'Resumo criado!',
        message: `Nota: ${result.note.title}. Criadas: ${result.created}, reaproveitadas: ${result.reused}.`,
      });
    } catch (err) {
      setFeedback({
        ok: false,
        title: 'Erro ao resumir',
        message: err instanceof Error ? err.message : 'desconhecido',
      });
    } finally {
      setSummaryBusy(false);
    }
  };

  const handleAutoSummarizeDismiss = () => {
    setAutoSummarizeDismissed(true);
    try {
      localStorage.setItem(AUTO_SUMMARIZE_DISMISS_KEY, String(Date.now()));
    } catch {}
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setFeedback(null);
    try {
      const r = await api.post<{ note: { title: string }; extracted_chars: number; created: number; reused: number }>(
        '/documents/upload',
        form
      );
      setFeedback({
        ok: true,
        title: 'Documento processado!',
        message: `${file.name}: ${r.extracted_chars} chars extraídos. Criadas: ${r.created}, reaproveitadas: ${r.reused}.`,
      });
    } catch (err) {
      setFeedback({
        ok: false,
        title: 'Erro no upload',
        message: err instanceof Error ? err.message : 'desconhecido',
      });
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-6rem)] max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto">
      {/* Topo: seletor de modo + ações */}
      <div className="pt-3 pb-3 border-b border-neutral-900 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="h-5 w-5 text-white flex-shrink-0" strokeWidth={1.75} />
            <h1 className="text-base sm:text-lg font-semibold text-white truncate">
              Advogado do Diabo
            </h1>
          </div>
          <div className="flex items-center gap-1">
            {providers && provider && (
              <button
                onClick={() => setShowModelPicker(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-neutral-900 hover:bg-neutral-800 text-neutral-300 transition-colors border border-neutral-800"
                title="Trocar provedor/modelo"
              >
                <span className="font-mono text-[10px] uppercase tracking-wide text-neutral-500">
                  {provider === 'openai' ? 'OpenAI' : 'LM Studio'}
                </span>
                <span className="text-white max-w-[120px] truncate">{model ?? 'auto'}</span>
                <ChevronDown className="h-3 w-3" strokeWidth={1.75} />
              </button>
            )}
            <button
              onClick={toggleTools}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors border ${
                toolsEnabled
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-white'
              }`}
              title={
                toolsEnabled
                  ? 'Advogado pode criar notas sozinho (ligado)'
                  : 'Permitir Advogado criar notas sozinho (desligado)'
              }
            >
              <Wrench className="h-3 w-3" strokeWidth={1.75} />
              <span className="hidden sm:inline">{toolsEnabled ? 'Auto-nota' : 'Auto'}</span>
            </button>
            <button
              onClick={handleClear}
              disabled={messages.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-neutral-500 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Limpar conversa"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Limpar</span>
            </button>
          </div>
        </div>

        {/* Modo */}
        <div className="flex bg-neutral-900 rounded-2xl p-1 gap-1">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  active ? 'bg-white text-black' : 'text-neutral-500 hover:text-white'
                }`}
                title={m.description}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="truncate">{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tokens */}
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <div className="flex-1 h-1 bg-neutral-900 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                usagePct > 80 ? 'bg-red-500' : usagePct > 50 ? 'bg-amber-500' : 'bg-white'
              }`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <span className={overLimit ? 'text-red-400 font-semibold' : ''}>
            {Math.round(totalTokens)} / {contextWindow}
          </span>
        </div>
      </div>

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-neutral-600 text-sm py-16">
            <Brain className="w-10 h-10 mx-auto mb-3 text-neutral-800" strokeWidth={1.5} />
            <p>Comece uma conversa.</p>
            <p className="text-xs mt-1 text-neutral-700">
              Modo <strong>{MODES.find((m) => m.id === mode)?.label}</strong> ativo.
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          const isError = m.content.startsWith('__error__');
          const isToolCall = m.content.startsWith('__tool_call__');
          const isToolResult = m.content.startsWith('__tool_result__');
          const isLastAssistant = !isUser && i === messages.length - 1 && streaming;
          let display = m.content;
          if (isError) display = display.replace(/^__error__/, '');
          if (isToolCall) {
            const tc: ToolCall = JSON.parse(display.replace(/^__tool_call__/, ''));
            return (
              <div key={i} className="flex justify-start">
                <ToolCallCard tc={tc} />
              </div>
            );
          }
          if (isToolResult) {
            const tr: ToolResult = JSON.parse(display.replace(/^__tool_result__/, ''));
            return (
              <div key={i} className="flex justify-start">
                <ToolResultCard tr={tr} />
              </div>
            );
          }
          return (
            <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  isUser
                    ? 'bg-white text-black'
                    : isError
                    ? 'bg-red-950/50 text-red-300 border border-red-900/50'
                    : 'bg-neutral-900 text-white border border-neutral-800'
                }`}
              >
                {isLastAssistant ? streamBuffer || '...' : display}
              </div>
            </div>
          );
        })}
      </div>

      {feedback && (
        <div
          className={`mb-2 flex items-start gap-3 rounded-2xl border p-3 text-sm ${
            feedback.ok
              ? 'border-emerald-900/50 bg-emerald-950/30 text-emerald-300'
              : 'border-red-900/50 bg-red-950/30 text-red-300'
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="font-medium">{feedback.title}</div>
            <div className="text-xs opacity-80 mt-0.5">{feedback.message}</div>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="opacity-60 hover:opacity-100 text-lg leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
      )}

      {showAutoSummarizeBanner && (
        <div className="mb-2 flex items-start gap-2 rounded-2xl border border-emerald-900/40 bg-emerald-950/20 p-3 text-sm">
          <Sparkles className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" strokeWidth={1.75} />
          <div className="flex-1 min-w-0">
            <div className="text-emerald-100 font-medium">
              {userMessageCount} mensagens suas nessa conversa.
            </div>
            <p className="text-xs text-emerald-300/80 mt-0.5">
              Quer consolidar em uma nota linkada ao grafo?
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setShowSummaryConfirm(true)}
              className="text-xs font-medium bg-emerald-500 hover:bg-emerald-400 text-black px-3 py-1.5 rounded-full transition-colors"
            >
              Sim, criar
            </button>
            <button
              onClick={handleAutoSummarizeDismiss}
              className="text-xs text-neutral-400 hover:text-white px-2 py-1.5 transition-colors"
            >
              Agora nao
            </button>
          </div>
        </div>
      )}

      {/* Rodapé */}
      <div className="border-t border-neutral-900 bg-black/95 py-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-medium cursor-pointer transition-colors">
            <FileUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">PDF/TXT</span>
            <span className="sm:hidden">PDF</span>
            <input type="file" accept=".pdf,.txt,.md" onChange={handleUpload} className="hidden" />
          </label>
          <button
            onClick={() => setShowSummaryConfirm(true)}
            disabled={messages.length === 0 || summaryBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Gerar resumo e linkar ao grafo"
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
            Criar Resumo
          </button>
          {messages.length > 0 && (
            <span className="text-xs text-neutral-600 ml-auto">
              {messages.filter((m) => m.role === 'user').length} msgs
            </span>
          )}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              mode === 'socratic'
                ? 'Compartilhe uma ideia ou problema...'
                : mode === 'critic'
                ? 'Apresente seu argumento para análise...'
                : 'Me conte o tema e vamos expandir juntos...'
            }
            rows={2}
            className="flex-1 resize-none bg-neutral-900 text-white placeholder-neutral-600 rounded-2xl border border-neutral-800 px-4 py-2.5 text-sm focus:border-neutral-700 focus:outline-none"
          />
          {streaming ? (
            <button
              onClick={handleStop}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-red-500 hover:bg-red-400 text-white transition-colors flex-shrink-0"
              aria-label="Parar"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              aria-label="Enviar"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Modais */}
      <Modal open={showTokenWarning} onClose={() => setShowTokenWarning(false)} title="Limite de contexto atingido" size="sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-neutral-300 leading-relaxed">
            <p>A conversa ultrapassou a janela de contexto do modelo ({contextWindow} tokens).</p>
            <p className="mt-2">As mensagens mais antigas foram removidas automaticamente para liberar espaço.</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={() => setShowTokenWarning(false)}
            className="px-4 py-2 text-sm rounded-full bg-white text-black hover:bg-neutral-200 transition-colors"
          >
            Entendi
          </button>
        </div>
      </Modal>

      <ConfirmModal
        open={showSummaryConfirm}
        title="Criar resumo da conversa?"
        message={`Vou enviar ${messages.length} mensagens para o LLM processar, extrair pontos-chave e criar notas linkadas ao grafo (reaproveitando chaves existentes quando possível).`}
        confirmText="Gerar resumo"
        cancelText="Cancelar"
        onConfirm={handleSummarize}
        onCancel={() => setShowSummaryConfirm(false)}
      />

      <ModelPickerModal
        open={showModelPicker}
        providers={providers}
        currentProvider={provider}
        currentModel={model}
        onSelect={(p, m) => {
          setProvider(p);
          setModel(m);
          setShowModelPicker(false);
        }}
        onClose={() => setShowModelPicker(false)}
      />

      {summaryBusy && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl px-6 py-5 flex items-center gap-3 shadow-2xl">
            <Loader2 className="w-5 h-5 text-white animate-spin" />
            <span className="text-sm text-white">Gerando resumo e linkando ao grafo...</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface ModelPickerModalProps {
  open: boolean;
  providers: ProviderInfo | null;
  currentProvider: LlmProvider | null;
  currentModel: string | null;
  onSelect: (provider: LlmProvider, model: string) => void;
  onClose: () => void;
}

function ModelPickerModal({ open, providers, currentProvider, currentModel, onSelect, onClose }: ModelPickerModalProps) {
  if (!open || !providers) return null;
  const entries = (['lmstudio', 'openai'] as LlmProvider[]).filter((p) => providers.providers[p]?.available);

  return (
    <Modal open={open} onClose={onClose} title="Escolher provedor e modelo" size="md">
      <div className="space-y-3">
        {entries.length === 0 && (
          <p className="text-sm text-neutral-400 text-center py-4">
            Nenhum provedor disponível. Configure OPENAI_API_KEY no .env ou inicie o LM Studio.
          </p>
        )}
        {entries.map((p) => {
          const info = providers.providers[p];
          const isCurrent = p === currentProvider;
          return (
            <div key={p} className="rounded-xl bg-neutral-900 border border-neutral-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-white">
                  {p === 'openai' ? 'OpenAI (cloud)' : 'LM Studio (local)'}
                </h4>
                {isCurrent && (
                  <span className="text-[10px] uppercase tracking-wide text-emerald-400">
                    ativo
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {info.models.map((m) => {
                  const selected = p === currentProvider && m === currentModel;
                  return (
                    <button
                      key={m}
                      onClick={() => onSelect(p, m)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-mono text-left transition-colors ${
                        selected
                          ? 'bg-white text-black'
                          : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                      }`}
                      title={m}
                    >
                      <span className="block truncate">{m}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export default AdvogadoPage;

function ToolCallCard({ tc }: { tc: ToolCall }) {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(tc.function.arguments);
  } catch {
    parsed = { raw: tc.function.arguments };
  }
  const title = (parsed.title as string) || tc.function.name;
  const summary = (parsed.summary as string) || (parsed.content as string)?.slice(0, 120);

  return (
    <div className="max-w-[88%] sm:max-w-[80%] rounded-2xl border border-amber-500/40 bg-amber-950/20 px-4 py-2.5 text-xs text-amber-200">
      <div className="flex items-center gap-1.5 font-medium">
        <FilePlus className="h-3.5 w-3.5" strokeWidth={1.75} />
        Advogado chamou: <code className="text-amber-300">{tc.function.name}</code>
        <Loader2 className="h-3 w-3 animate-spin ml-auto" />
      </div>
      <div className="mt-1.5 text-amber-100/90 truncate">
        <strong>{title}</strong>
        {summary && <span className="text-amber-300/70"> — {summary}</span>}
      </div>
    </div>
  );
}

function ToolResultCard({ tr }: { tr: ToolResult }) {
  if (tr.ok) {
    const result = tr.result ?? {};
    const title = (result.title as string) || tr.name;
    const noteId = result.note_id as number | undefined;
    const msg = (result.message as string) || '';
    return (
      <a
        href={noteId ? `/grafo?focus=${noteId}` : '#'}
        className="max-w-[88%] sm:max-w-[80%] rounded-2xl border border-emerald-500/40 bg-emerald-950/20 px-4 py-2.5 text-xs text-emerald-200 block hover:bg-emerald-950/30 transition-colors"
      >
        <div className="flex items-center gap-1.5 font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          Tool executada com sucesso
          {noteId && (
            <span className="ml-auto text-emerald-400">abrir no grafo →</span>
          )}
        </div>
        <div className="mt-1.5 text-emerald-100/90 truncate">
          <strong>{title}</strong>
          {msg && <span className="text-emerald-300/70"> — {msg}</span>}
        </div>
      </a>
    );
  }
  return (
    <div className="max-w-[88%] sm:max-w-[80%] rounded-2xl border border-red-500/40 bg-red-950/20 px-4 py-2.5 text-xs text-red-200">
      <div className="flex items-center gap-1.5 font-medium">
        <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
        Tool {tr.name} falhou
      </div>
      <div className="mt-1 text-red-300/80 break-words">{tr.error ?? 'erro desconhecido'}</div>
    </div>
  );
}
