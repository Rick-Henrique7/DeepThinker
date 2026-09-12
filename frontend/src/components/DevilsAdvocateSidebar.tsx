import React, { useEffect, useRef, useState } from 'react';
import { Brain, Sparkles, Scale, MessageSquare, Send, FileUp, X, Loader2, AlertTriangle } from 'lucide-react';
import { Modal, ConfirmModal } from './Modal';
import { ChatMessage, ChatMode, streamChat, estimateTokens } from '../lib/chat';
import { api } from '../lib/api';

interface DevilsAdvocateSidebarProps {
  open: boolean;
  onClose: () => void;
}

const MODES: { id: ChatMode; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  {
    id: 'socratic',
    label: 'Socrático',
    icon: Brain,
    description: 'Faz perguntas para guiar seu pensamento.',
  },
  {
    id: 'critic',
    label: 'Crítico',
    icon: Scale,
    description: 'Encontra falhas e vieses nos seus argumentos.',
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    icon: Sparkles,
    description: 'Gera alternativas e conexões inesperadas.',
  },
];

export const DevilsAdvocateSidebar: React.FC<DevilsAdvocateSidebarProps> = ({ open, onClose }) => {
  const [mode, setMode] = useState<ChatMode>('socratic');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [showTokenWarning, setShowTokenWarning] = useState(false);
  const [showSummaryConfirm, setShowSummaryConfirm] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const contextWindow = 8192;
  const totalTokens = messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
  const usagePct = Math.min(100, (totalTokens / contextWindow) * 100);
  const overLimit = totalTokens > contextWindow;

  useEffect(() => {
    if (overLimit && !showTokenWarning) {
      setShowTokenWarning(true);
      // Truncar mensagens mais antigas mantendo o system + últimas
      setMessages((prev) => {
        if (prev.length <= 2) return prev;
        // Mantém primeira (system) e últimas N que cabem
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);
    setStreamBuffer('');

    const acc: ChatMessage[] = [...messages, userMsg];
    let reply = '';

    abortRef.current = new AbortController();
    try {
      reply = await streamChat(acc, mode, {
        onChunk: (chunk) => {
          setStreamBuffer((buf) => buf + chunk);
        },
        signal: abortRef.current.signal,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '__error__' + (err instanceof Error ? err.message : 'Erro desconhecido.'),
        },
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

  const handleSummarize = async () => {
    setShowSummaryConfirm(false);
    if (messages.length === 0) return;

    setSummaryBusy(true);
    try {
      const result = await api.post<{ note: { id: number; title: string }; created: number; reused: number }>(
        '/notes/summarize',
        { messages, mode }
      );
      // Feedback simples — pode evoluir para um toast futuramente.
      alert(
        `Resumo criado!\nNota: ${result.note.title}\nNós criados: ${result.created}\nReaproveitados: ${result.reused}`
      );
      // Fecha a sidebar para o usuário ver o grafo atualizar
      onClose();
    } catch (err) {
      alert('Erro ao gerar resumo: ' + (err instanceof Error ? err.message : 'desconhecido'));
    } finally {
      setSummaryBusy(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await api.post<{ note: { id: number; title: string }; extracted_chars: number }>(
        '/documents/upload',
        form
      );
      alert(
        `Documento processado!\nNota: ${r.note.title}\nCaracteres extraídos: ${r.extracted_chars}`
      );
      onClose();
    } catch (err) {
      alert('Erro ao processar documento: ' + (err instanceof Error ? err.message : 'desconhecido'));
    } finally {
      e.target.value = '';
    }
  };

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col transform transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">Advogado do Diabo</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 rounded-lg transition-colors"
            aria-label="Fechar sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode selector */}
        <div className="px-5 py-3 border-b border-slate-800 space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Modo de conversa
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/40'
                      : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-800'
                  }`}
                  title={m.description}
                >
                  <Icon className="w-4 h-4" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Token usage bar */}
        <div className="px-5 py-2 border-b border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Tokens usados</span>
            <span className={overLimit ? 'text-red-400 font-semibold' : ''}>
              {Math.round(totalTokens)} / {contextWindow}
            </span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                usagePct > 80 ? 'bg-red-500' : usagePct > 50 ? 'bg-amber-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-slate-500 text-sm py-12">
              <Brain className="w-10 h-10 mx-auto mb-3 text-slate-700" />
              <p>Comece uma conversa.</p>
              <p className="text-xs mt-1 text-slate-600">
                O modo <strong>{MODES.find((m) => m.id === mode)?.label}</strong> está ativo.
              </p>
            </div>
          )}
          {messages.map((m, i) => {
            const isUser = m.role === 'user';
            const isError = m.content.startsWith('__error__');
            const display = m.content.replace(/^__(error|streaming)__/, '');
            const isLastAssistant = !isUser && i === messages.length - 1 && streaming;
            return (
              <div
                key={i}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
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

        {/* Footer: input + actions */}
        <div className="border-t border-slate-800 p-3 space-y-2 bg-slate-900/95">
          {/* Document upload */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer transition-colors border border-slate-700">
              <FileUp className="w-3.5 h-3.5" />
              Anexar PDF/TXT
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
          </div>

          {/* Message input */}
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
              placeholder="Pergunte ou compartilhe uma ideia..."
              rows={2}
              className="flex-1 resize-none bg-slate-950 text-slate-100 placeholder-slate-500 rounded-xl border border-slate-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            {streaming ? (
              <button
                onClick={handleStop}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors"
                aria-label="Parar"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Enviar"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Token limit warning modal */}
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

      {/* Summary confirm modal */}
      <ConfirmModal
        open={showSummaryConfirm}
        title="Criar resumo da conversa?"
        message={`Vou enviar ${messages.length} mensagens para o LLM processar, extrair pontos-chave e criar notas linkadas ao grafo (reaproveitando chaves existentes quando possível).`}
        confirmText="Gerar resumo"
        cancelText="Cancelar"
        onConfirm={handleSummarize}
        onCancel={() => setShowSummaryConfirm(false)}
      />

      {/* Loading overlay during summarize */}
      {summaryBusy && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-5 flex items-center gap-3 shadow-2xl">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
            <span className="text-sm text-slate-100">Gerando resumo e linkando ao grafo...</span>
          </div>
        </div>
      )}
    </>
  );
};
