import React, { useEffect, useRef, useState } from 'react';
import { Brain, Scale, Sparkles, MessageSquare, Send, FileUp, X, Loader2, AlertTriangle, FileText, Trash2 } from 'lucide-react';
import { Modal, ConfirmModal } from '../components/Modal';
import { ChatMessage, ChatMode, streamChat, estimateTokens } from '../lib/chat';
import { api } from '../lib/api';

const MODES: { id: ChatMode; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'socratic', label: 'Socrático', description: 'Faz perguntas para guiar seu pensamento.', icon: Brain },
  { id: 'critic', label: 'Crítico', description: 'Encontra falhas e vieses nos seus argumentos.', icon: Scale },
  { id: 'brainstorm', label: 'Brainstorm', description: 'Gera alternativas e conexões inesperadas.', icon: Sparkles },
];

const STORAGE_KEY = 'deepthinker:advogado-session';

interface PersistedSession {
  mode: ChatMode;
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
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const contextWindow = 8192;
  const totalTokens = messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
  const usagePct = Math.min(100, (totalTokens / contextWindow) * 100);
  const overLimit = totalTokens > contextWindow;

  // Persistir sessão
  useEffect(() => {
    saveSession({ mode, messages: messages.filter((m) => !m.content.startsWith('__')) });
  }, [mode, messages]);

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

    abortRef.current = new AbortController();
    try {
      const reply = await streamChat(next, mode, {
        onChunk: (chunk) => setStreamBuffer((buf) => buf + chunk),
        signal: abortRef.current.signal,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
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
        { messages, mode }
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
    <div className="flex flex-col h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] max-w-4xl mx-auto">
      {/* Topo: seletor de modo + ações */}
      <div className="px-1 sm:px-0 pt-3 pb-3 border-b border-slate-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="h-5 w-5 text-indigo-400 flex-shrink-0" />
            <h1 className="text-base sm:text-lg font-semibold text-slate-100 truncate">
              Advogado do Diabo
            </h1>
          </div>
          <button
            onClick={handleClear}
            disabled={messages.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-400 hover:text-red-400 hover:bg-slate-800/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Limpar conversa"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Limpar</span>
          </button>
        </div>

        {/* Modo */}
        <div className="grid grid-cols-3 gap-1.5">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/40'
                    : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-800'
                }`}
                title={m.description}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="truncate">{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tokens */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                usagePct > 80 ? 'bg-red-500' : usagePct > 50 ? 'bg-amber-500' : 'bg-indigo-500'
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 sm:px-0 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 text-sm py-12">
            <Brain className="w-10 h-10 mx-auto mb-3 text-slate-700" />
            <p>Comece uma conversa.</p>
            <p className="text-xs mt-1 text-slate-600">
              Modo <strong>{MODES.find((m) => m.id === mode)?.label}</strong> ativo.
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          const isError = m.content.startsWith('__error__');
          const display = m.content.replace(/^__error__/, '');
          const isLastAssistant = !isUser && i === messages.length - 1 && streaming;
          return (
            <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  isUser
                    ? 'bg-indigo-600 text-white'
                    : isError
                    ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                    : 'bg-slate-800 text-slate-100 border border-slate-700'
                }`}
              >
                {isLastAssistant ? streamBuffer || '...' : display}
              </div>
            </div>
          );
        })}
      </div>

      {/* Feedback inline (sucesso/erro) */}
      {feedback && (
        <div
          className={`mx-1 sm:mx-0 mb-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
            feedback.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="font-medium">{feedback.title}</div>
            <div className="text-xs opacity-90">{feedback.message}</div>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="opacity-60 hover:opacity-100 text-xs"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
      )}

      {/* Rodapé fixo: ações + input */}
      <div className="border-t border-slate-800 bg-slate-950/95 px-1 sm:px-0 py-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer transition-colors border border-slate-700">
            <FileUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Anexar PDF/TXT</span>
            <span className="sm:hidden">PDF</span>
            <input type="file" accept=".pdf,.txt,.md" onChange={handleUpload} className="hidden" />
          </label>
          <button
            onClick={() => setShowSummaryConfirm(true)}
            disabled={messages.length === 0 || summaryBusy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-medium transition-colors border border-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Gerar resumo e linkar ao grafo"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Criar Resumo
          </button>
          {messages.length > 0 && (
            <span className="text-xs text-slate-500 ml-auto">
              {messages.filter((m) => m.role === 'user').length} msg(ns)
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
            className="flex-1 resize-none bg-slate-950 text-slate-100 placeholder-slate-500 rounded-xl border border-slate-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          {streaming ? (
            <button
              onClick={handleStop}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors flex-shrink-0"
              aria-label="Parar"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
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
          <div className="text-sm text-slate-300 leading-relaxed">
            <p>A conversa ultrapassou a janela de contexto do modelo ({contextWindow} tokens).</p>
            <p className="mt-2">As mensagens mais antigas foram removidas automaticamente para liberar espaço.</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={() => setShowTokenWarning(false)}
            className="px-4 py-2 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
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

      {summaryBusy && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-5 flex items-center gap-3 shadow-2xl">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
            <span className="text-sm text-slate-100">Gerando resumo e linkando ao grafo...</span>
          </div>
        </div>
      )}

      {messages.length === 0 && (
        <p className="text-xs text-slate-600 text-center pb-2">
          💡 Dica: as conversas ficam salvas no seu navegador (localStorage).
        </p>
      )}
    </div>
  );
}

export default AdvogadoPage;
