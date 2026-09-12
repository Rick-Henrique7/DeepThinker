import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { useSpeechToText } from '../hooks/useSpeechToText';

interface ThoughtInputProps {
  onSubmitThought: (title: string, content: string) => void;
  isLoading?: boolean;
}

export const ThoughtInput: React.FC<ThoughtInputProps> = ({
  onSubmitThought,
  isLoading = false,
}) => {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Histórico de estados anteriores para desfazer a última ação
  const [history, setHistory] = useState<{ title: string; text: string }[]>([]);
  const { isListening, transcript, error, startListening, stopListening, resetTranscript } =
    useSpeechToText('pt-BR');

  useEffect(() => {
    if (!transcript) return;

    setHistory((prev) => [...prev, { title, text }]);
    setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    resetTranscript();
  }, [transcript, resetTranscript, title, text]);

  const handleToggleMic = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleClear = () => {
    setHistory((prev) => [...prev, { title, text }]);
    setTitle('');
    setText('');
    resetTranscript();
  };

  // Desfaz a última ação (inserção de link, ditado por voz ou limpeza)
  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setTitle(prev.title);
    setText(prev.text);
    setHistory(history.slice(0, -1));
  };

  // Insere [[ ]] (ou envolve o texto selecionado) na posição do cursor do textarea
  const handleInsertLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? text.length;
    const selected = text.slice(start, end);

    setHistory((prev) => [...prev, { title, text }]);
    const inserted = selected ? `[[${selected}]]` : '[[ ]]';
    setText(text.slice(0, start) + inserted + text.slice(end));

    setTimeout(() => {
      textarea.focus();
      const caret = selected ? start + selected.length + 2 : start + 2;
      textarea.setSelectionRange(caret, caret);
    }, 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    const finalTitle =
      title.trim() ||
      `Insight - ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;

    onSubmitThought(finalTitle, text);
    handleClear();
  };

  return (
    <div className="w-full max-w-4xl mx-auto rounded-3xl  border border-slate-800/80 bg-slate-900/90 p-6 shadow-2xl shadow-black/30 backdrop-blur">
      <form onSubmit={handleSubmit} className="space-y-4 ">
        <input
          type="text"
          placeholder="Título do Pensamento (Opcional)..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-xl h-100 border border-slate-800 bg-slate-950 px-5 py-3 text-base text-slate-100 placeholder-slate-500 transition-colors focus:border-indigo-500 focus:outline-none"
        />

        <div className="relative ">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite ou clique no microfone para ditar sua ideia. Use [[Título]] para conectar notas..."
            rows={8}
            className="w-full resize-none rounded-2xl min-h-[200px] sm:min-h-[280px] border border-slate-800 bg-slate-950 p-5 text-base leading-relaxed text-slate-100 placeholder-slate-500 transition-colors focus:border-indigo-500 focus:outline-none"
          />

          {isListening && (
            <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-sm text-red-400 animate-pulse">
              <span className="h-2.5 w-2.5 animate-ping rounded-full bg-red-500" />
              Gravando voz...
            </div>
          )}

          {/* Botão para inserir [[ ]] no texto */}
          <button
            type="button"
            onClick={handleInsertLink}
            title="Inserir link [[ ]]"
            className="absolute bottom-3 right-3 rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-sm font-mono text-slate-300 shadow-lg transition-colors hover:border-indigo-500/60 hover:bg-slate-700/90 hover:text-indigo-300"
          >
            [[ ]]
          </button>

          {/* Botão para desfazer a última ação */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0}
            title="Desfazer última ação"
            className="absolute bottom-3 left-3 rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-slate-300 shadow-lg transition-colors hover:border-indigo-500/60 hover:bg-slate-700/90 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-400">
            ⚠️ {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleToggleMic}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-base font-medium transition-all ${
              isListening
                ? 'animate-pulse bg-red-600 text-white shadow-lg shadow-red-600/30 hover:bg-red-700'
                : 'border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5 text-indigo-400" />}
            {isListening ? 'Pausar Dito' : 'Ditar Pensamento'}
          </button>

          <div className="flex items-center gap-2">
            {(text || title) && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg p-2.5 text-slate-400 transition-colors hover:text-red-400"
                title="Limpar texto"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}

            <button
              type="submit"
              disabled={!text.trim() || isLoading}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-base font-medium text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Salvar no Cérebro
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};