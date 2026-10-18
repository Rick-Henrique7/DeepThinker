import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Brain, Scale, Sparkles, MessageSquare, Send, FileUp, X, Loader2, AlertTriangle, FileText, Trash2, ChevronDown, Wrench, FilePlus, CheckCircle2, XCircle, Mic, MicOff, Network, Workflow } from 'lucide-react';
import { Modal, ConfirmModal } from '../components/Modal';
import { ChatMessage, ChatMode, LlmProvider, streamChat, estimateTokens, fetchProviders, ProviderInfo, ToolCall, ToolResult, providerLabel, MemoryNote, MEMORY_PREFIX } from '../lib/chat';
import { api } from '../lib/api';
import { useTypewriter } from '../hooks/useTypewriter';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useConfirm } from '../components/ConfirmDialog';
import { WaterLine } from '../components/WaterLine';
import { notesApi, notifyNotesChanged } from '../lib/notes';
import { uploadDocument, useDocumentMindmap } from '../lib/documents';
import { DocumentMindmapStatus } from '../components/DocumentMindmapStatus';

const MODES: { id: ChatMode; label: string; description: string; icon: React.ElementType }[] = [
  { id: 'socratic', label: 'Socrático', description: 'Faz perguntas para guiar seu pensamento.', icon: Brain },
  { id: 'critic', label: 'Crítico', description: 'Encontra falhas e vieses nos seus argumentos.', icon: Scale },
  { id: 'brainstorm', label: 'Brainstorm', description: 'Gera alternativas e conexões inesperadas.', icon: Sparkles },
];

// Sugestões do chat vazio: um clique preenche o campo (a pessoa ainda pode editar antes de enviar).
const SUGGESTIONS: Record<ChatMode, string[]> = {
  socratic: ['Devo largar o emprego para empreender?', 'Por que acredito nisso?', 'O que eu ganho mudando de cidade?'],
  critic: ['Meu plano de negócio tem furos?', 'Esse argumento convence?', 'Onde estou sendo otimista demais?'],
  brainstorm: ['Ideias para o meu próximo projeto', 'Outros usos para as minhas notas', 'Como explicar isso de outro jeito?'],
};

const STORAGE_KEY = 'deepthinker:advogado-session';
const SESSION_ID_KEY = 'deepthinker:advogado-session-id';
const AUTO_SUMMARIZE_DISMISS_KEY = 'deepthinker:advogado-auto-summarize-dismissed';
const TOOLS_ENABLED_KEY = 'deepthinker:advogado-tools-enabled';
const MEMORY_ENABLED_KEY = 'deepthinker:advogado-memory-enabled';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const confirm = useConfirm();
  // Ditado: cada frase final vai para o fim do campo de mensagem.
  const speech = useSpeechToText('pt-BR', (spoken) =>
    setInput((prev) => (prev.trim() ? `${prev.trimEnd()} ${spoken}` : spoken)),
  );
  const [streaming, setStreaming] = useState(false);
  // Resposta em andamento, revelada aos poucos (efeito de digitacao).
  const typer = useTypewriter();
  const streamBuffer = typer.text;
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
  // Memoria ligada por padrao: so desliga se o usuario escolheu desligar
  const [memoryEnabled, setMemoryEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MEMORY_ENABLED_KEY) !== '0';
    } catch {
      return true;
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
        // Usa o plugin ativo da aba IA quando nada foi escolhido aqui, ou quando o
        // escolhido antes ficou indisponivel (ex.: sem chave). Sem isso, um "openai"
        // salvo numa visita antiga continuava sendo usado mesmo depois de trocar para o Groq.
        if (!provider || !info.providers[provider]?.available) {
          setProvider(info.default);
          const p = info.providers[info.default];
          const first = p?.default_model ?? p?.models?.[0];
          if (first) setModel(first);
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
    speech.stopListening();

    const userMsg: ChatMessage = { role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setStreaming(true);
    typer.reset();

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
        memoryEnabled,
        sessionId: sessionIdRef.current,
        onChunk: typer.push,
        onMemory: (notes) => {
          // Fica na conversa (antes da resposta) para mostrar quais notas a IA leu
          setMessages((prev) => [...prev, { role: 'tool', content: MEMORY_PREFIX + JSON.stringify(notes) }]);
        },
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
      // A IA pode terminar antes da animacao: espera o texto acabar de "digitar".
      await typer.waitUntilDone();
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
      typer.reset();
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

  const toggleMemory = () => {
    setMemoryEnabledState((v) => {
      const next = !v;
      try {
        localStorage.setItem(MEMORY_ENABLED_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  const handleStop = () => {
    abortRef.current?.abort();
    typer.finish();
    setStreaming(false);
  };

  const handleClear = async () => {
    if (messages.length === 0) return;
    const ok = await confirm({
      title: 'Limpar a conversa?',
      message: 'As mensagens desta conversa somem da tela. As notas que você já criou continuam no grafo.',
      confirmText: 'Limpar',
      variant: 'danger',
    });
    if (!ok) return;
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
          // Só a conversa em si: tirando resultados de ferramentas e avisos de erro (__error__).
          messages: messages.filter(
            (m) => (m.role === 'user' || m.role === 'assistant') && !m.content.startsWith('__')
          ),
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

  // "Transformar em diagrama": a IA desenha o debate como mapa mental e vira uma nota nova.
  const [diagramBusy, setDiagramBusy] = useState(false);
  const navigate = useNavigate();
  const mindmap = useDocumentMindmap();
  const handleDiagram = async () => {
    const talk = messages.filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.content.startsWith('__'));
    if (talk.length === 0) return;
    setDiagramBusy(true);
    setFeedback(null);
    try {
      const text = talk.map((m) => `${m.role === 'user' ? 'EU' : 'ADVOGADO'}: ${m.content}`).join('\n\n');
      const { mermaid } = await notesApi.diagram({ text, kind: 'mindmap' });
      const now = new Date();
      const stamp = now.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const note = await notesApi.create(
        `Diagrama da conversa ${stamp}`,
        `Mapa mental do debate com o Advogado do Diabo (modo ${MODES.find((m) => m.id === mode)?.label ?? mode}).\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n`
      );
      notifyNotesChanged();
      navigate(`/grafo?focus=${note.id}`);
    } catch (err) {
      setFeedback({
        ok: false,
        title: 'Erro ao desenhar o diagrama',
        message: err instanceof Error ? err.message : 'desconhecido',
      });
    } finally {
      setDiagramBusy(false);
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
    setFeedback(null);
    mindmap.clear();
    try {
      const r = await uploadDocument(file);
      setFeedback({
        ok: true,
        title: 'Documento processado!',
        message: r.fallback
          ? `${file.name}: ${r.extracted_chars} caracteres extraídos. A IA não conseguiu resumir, então o texto foi guardado como veio.`
          : `${file.name}: ${r.extracted_chars} caracteres extraídos. Criadas: ${r.created}, reaproveitadas: ${r.reused}.`,
      });
      mindmap.start(r.note.id, r.note.title);
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
    <div className="flex flex-col h-[calc(100dvh-10.75rem)] sm:h-[calc(100dvh-11.75rem)] lg:h-[calc(100dvh-6rem)] baixa:h-[calc(100dvh-5.5rem)] max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto">
      {/* Topo: seletor de modo + ações */}
      <div className="pt-3 pb-3 border-b border-neutral-900 space-y-3 baixa:flex baixa:items-center baixa:gap-2 baixa:space-y-0 baixa:pt-0 baixa:pb-2">
        <div className="flex items-center justify-between gap-2 baixa:contents">
          <div className="flex items-center gap-2 min-w-0 baixa:order-1">
            <MessageSquare className="h-5 w-5 text-white flex-shrink-0" strokeWidth={1.75} />
            <h1 className="text-base sm:text-lg font-semibold text-white truncate baixa:sr-only">
              Advogado do Diabo
            </h1>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 baixa:order-3">
            {providers && provider && (
              <button
                onClick={() => setShowModelPicker(true)}
                className="flex items-center gap-1 min-h-[44px] min-w-[44px] fino:min-h-0 fino:min-w-0 justify-center px-2 py-1 rounded-full text-xs bg-neutral-900 hover:bg-neutral-800 text-neutral-300 transition-colors border border-neutral-800"
                title="Trocar provedor/modelo"
              >
                <span className="font-mono text-[10px] uppercase tracking-wide text-neutral-500 baixa:hidden">
                  {providerLabel(providers, provider)}
                </span>
                <span className="text-white max-w-[56px] sm:max-w-[120px] baixa:max-w-[72px] truncate">{model ?? 'auto'}</span>
                <ChevronDown className="h-3 w-3" strokeWidth={1.75} />
              </button>
            )}
            <button
              onClick={toggleMemory}
              className={`flex items-center gap-1 min-h-[44px] min-w-[44px] fino:min-h-0 fino:min-w-0 justify-center px-2 py-1 rounded-full text-xs transition-colors border ${
                memoryEnabled
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-white'
              }`}
              title={
                memoryEnabled
                  ? 'Memória ligada: o Advogado lê as suas notas parecidas com a conversa (trechos vão para o provedor de IA)'
                  : 'Memória desligada: o Advogado não lê as suas notas'
              }
            >
              <Network className="h-3 w-3" strokeWidth={1.75} />
              <span className="hidden sm:inline baixa:hidden">Memória</span>
            </button>
            <button
              onClick={toggleTools}
              className={`flex items-center gap-1 min-h-[44px] min-w-[44px] fino:min-h-0 fino:min-w-0 justify-center px-2 py-1 rounded-full text-xs transition-colors border ${
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
              <span className="hidden sm:inline baixa:hidden">{toolsEnabled ? 'Auto-nota' : 'Auto'}</span>
            </button>
            <button
              onClick={handleClear}
              disabled={messages.length === 0}
              className="flex items-center gap-1 min-h-[44px] min-w-[44px] fino:min-h-0 fino:min-w-0 justify-center px-2.5 py-1 rounded-full text-xs text-neutral-500 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Limpar conversa"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline baixa:hidden">Limpar</span>
            </button>
          </div>
        </div>

        {/* Modo */}
        <div className="flex bg-neutral-900 rounded-2xl p-1 gap-1 baixa:order-2 baixa:flex-1 baixa:min-w-0">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 min-h-[44px] fino:min-h-0 px-2 py-1.5 rounded-xl text-xs font-medium transition-colors ${
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
        <div className="flex items-center gap-2 text-xs text-neutral-500 baixa:hidden">
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
      <div ref={scrollRef} className="relative flex-1 min-h-0 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 && !streaming && (
          <>
            {/* Água calma só com o chat vazio; some quando a conversa começa */}
            <WaterLine level={0.72} intensity={0.6} opacity={0.75} fadeEdges />
            <div className="relative text-center py-16 px-4">
              <p className="font-serif text-2xl sm:text-[26px] leading-tight text-neutral-100">
                Qual ideia você quer pôr à prova?
              </p>
              <p className="text-xs mt-1.5 text-neutral-500">
                Modo <strong>{MODES.find((m) => m.id === mode)?.label}</strong>: {MODES.find((m) => m.id === mode)?.description}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS[mode].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setInput(s);
                      textareaRef.current?.focus();
                    }}
                    className="min-h-[44px] fino:min-h-0 rounded-full border border-accent/20 bg-accent/10 px-3.5 py-2 text-xs text-neutral-100 transition hover:bg-accent/15 active:scale-[0.97]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          const isError = m.content.startsWith('__error__');
          const isToolCall = m.content.startsWith('__tool_call__');
          const isToolResult = m.content.startsWith('__tool_result__');
          if (m.content.startsWith(MEMORY_PREFIX)) {
            let notes: MemoryNote[] = [];
            try {
              notes = JSON.parse(m.content.slice(MEMORY_PREFIX.length));
            } catch {}
            return (
              <div key={i} className="flex justify-start">
                <MemoryCard notes={notes} />
              </div>
            );
          }
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
                {display}
              </div>
            </div>
          );
        })}
        {/* Resposta chegando: o balao cresce conforme o texto e "digitado" */}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-neutral-900 text-white border border-neutral-800">
              {streamBuffer || <span className="text-neutral-500">Pensando...</span>}
              <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-neutral-400 animate-pulse" aria-hidden="true" />
            </div>
          </div>
        )}
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
            {feedback.ok && mindmap.job && (
              <DocumentMindmapStatus
                job={mindmap.job}
                onOpen={(id) => navigate(`/grafo?focus=${id}`)}
                onRetry={mindmap.start}
              />
            )}
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] fino:min-h-0 fino:min-w-0 opacity-60 hover:opacity-100 text-lg leading-none"
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
      <div className="border-t border-neutral-900 bg-black/95 py-3 space-y-2 baixa:flex baixa:items-end baixa:gap-2 baixa:space-y-0 baixa:py-2">
        {/* No celular os botões ficam numa linha só (rola para o lado se não couber): duas linhas
            de botões de 44px empurrariam o campo de mensagem para baixo do menu. */}
        <div className="flex items-center gap-2 overflow-x-auto sm:flex-wrap [scrollbar-width:none] baixa:flex-none baixa:flex-nowrap">
          <label title="Enviar PDF/TXT" className="flex items-center gap-1.5 min-h-[44px] fino:min-h-0 px-3 py-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-medium cursor-pointer transition-colors">
            <FileUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline baixa:hidden">PDF/TXT</span>
            <span className="sm:hidden">PDF</span>
            <input type="file" accept=".pdf,.txt,.md" onChange={handleUpload} className="hidden" />
          </label>
          <button
            onClick={() => setShowSummaryConfirm(true)}
            disabled={messages.length === 0 || summaryBusy}
            className="flex items-center gap-1.5 min-h-[44px] fino:min-h-0 px-3 py-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Gerar resumo e linkar ao grafo"
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span className="whitespace-nowrap baixa:hidden">Criar Resumo</span>
          </button>
          <button
            onClick={handleDiagram}
            disabled={messages.length === 0 || diagramBusy}
            className="flex items-center gap-1.5 min-h-[44px] fino:min-h-0 px-3 py-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Desenhar a conversa como mapa mental e salvar como nota"
          >
            {diagramBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Workflow className="w-3.5 h-3.5" strokeWidth={1.75} />}
            <span className="baixa:hidden">Diagrama</span>
          </button>
          {messages.length > 0 && (
            <span className="text-xs text-neutral-600 ml-auto baixa:hidden">
              {messages.filter((m) => m.role === 'user').length} msgs
            </span>
          )}
        </div>

        {(speech.isListening || speech.error) && (
          <p
            className={`px-2 pb-1.5 text-xs ${speech.error ? 'text-amber-400' : 'text-neutral-500 italic'}`}
            aria-live="polite"
          >
            {speech.error ?? (speech.interim || 'Ouvindo...')}
          </p>
        )}
        <div className="flex items-end gap-2 baixa:flex-1 baixa:min-w-0">
          {speech.supported && (
            <button
              type="button"
              onClick={speech.toggleListening}
              title={speech.isListening ? 'Parar de ditar' : 'Ditar'}
              aria-label={speech.isListening ? 'Parar de ditar' : 'Ditar'}
              className={`flex items-center justify-center w-11 h-11 fino:w-10 fino:h-10 rounded-full transition-colors flex-shrink-0 ${
                speech.isListening
                  ? 'bg-red-500 text-white hover:bg-red-400'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              {speech.isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" strokeWidth={1.75} />}
            </button>
          )}
          <textarea
            ref={textareaRef}
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
              className="flex items-center justify-center w-11 h-11 fino:w-10 fino:h-10 rounded-full bg-red-500 hover:bg-red-400 text-white transition-colors flex-shrink-0"
              aria-label="Parar"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex items-center justify-center w-11 h-11 fino:w-10 fino:h-10 rounded-full bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
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

/** Modelos sugeridos + o modelo configurado na aba IA (que pode nao estar na lista). */
function modelOptions(info: ProviderInfo['providers'][string]): string[] {
  const list = [...info.models];
  if (info.default_model && !list.includes(info.default_model)) list.unshift(info.default_model);
  return list;
}

function ModelPickerModal({ open, providers, currentProvider, currentModel, onSelect, onClose }: ModelPickerModalProps) {
  if (!open || !providers) return null;
  const entries = Object.keys(providers.providers).filter((p) => providers.providers[p]?.available);

  return (
    <Modal open={open} onClose={onClose} title="Escolher provedor e modelo" size="md">
      <div className="space-y-3">
        {entries.length === 0 && (
          <p className="text-sm text-neutral-400 text-center py-4">
            Nenhum plugin de IA configurado. Escolha um e cole a API key na aba IA.
          </p>
        )}
        {entries.map((p) => {
          const info = providers.providers[p];
          const isCurrent = p === currentProvider;
          return (
            <div key={p} className="rounded-xl bg-neutral-900 border border-neutral-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-white">
                  {providerLabel(providers, p)}
                </h4>
                {isCurrent && (
                  <span className="text-[10px] uppercase tracking-wide text-emerald-400">
                    ativo
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {modelOptions(info).map((m) => {
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

/** "Notas usadas": o que a memoria entregou para a IA antes desta resposta. */
function MemoryCard({ notes }: { notes: MemoryNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="max-w-[88%] sm:max-w-[80%] rounded-2xl border border-sky-500/30 bg-sky-950/20 px-4 py-2.5 text-xs text-sky-200">
      <div className="flex items-center gap-1.5 font-medium">
        <Network className="h-3.5 w-3.5" strokeWidth={1.75} />
        Notas que o Advogado leu
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {notes.map((n) => (
          <a
            key={n.id}
            href={`/grafo?focus=${n.id}`}
            className={`rounded-full border px-2.5 py-0.5 transition-colors hover:bg-sky-900/40 ${
              n.reason === 'linked' ? 'border-sky-500/20 text-sky-300/70' : 'border-sky-500/40 text-sky-100'
            }`}
            title={
              n.reason === 'linked'
                ? `Ligada a [[${n.via ?? '?'}]] no grafo`
                : `Parecida com a conversa (similaridade ${Math.round(n.score * 100)}%)`
            }
          >
            {n.title}
          </a>
        ))}
      </div>
    </div>
  );
}

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
