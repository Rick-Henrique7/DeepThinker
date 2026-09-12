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
    if (!transcript || typeof transcript !== 'string') return;

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
    <div className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 p-3 sm:p-5">
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="Título (opcional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-xl bg-black border-0 px-3 py-2 sm:px-4 sm:py-2.5 text-sm sm:text-base text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-700"
        />

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite ou dite uma ideia. Use [[Título]] para conectar notas..."
            rows={6}
            className="w-full resize-none rounded-xl bg-black border-0 px-3 py-2.5 sm:px-4 sm:py-3 min-h-[110px] sm:min-h-[160px] md:min-h-[200px] text-sm sm:text-base leading-relaxed text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-700"
          />

          {isListening && (
            <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-1 text-xs text-red-400 animate-pulse">
              <span className="h-2 w-2 animate-ping rounded-full bg-red-500" />
              Gravando
            </div>
          )}

          <button
            type="button"
            onClick={handleInsertLink}
            title="Inserir link [[ ]]"
            className="absolute bottom-2 right-2 rounded-md px-2 py-1 text-xs font-mono text-neutral-500 hover:text-white transition-colors"
          >
            [[ ]]
          </button>

          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0}
            title="Desfazer"
            className="absolute bottom-2 left-2 rounded-md p-1 text-neutral-500 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Undo2 className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-400">
            ⚠️ {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={handleToggleMic}
            className={`flex items-center justify-center gap-2 rounded-full px-3 py-2 sm:px-4 text-sm font-medium transition-all flex-shrink-0 ${
              isListening
                ? 'bg-red-500 text-white'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" strokeWidth={1.75} />}
            <span className="hidden xs:inline sm:inline">{isListening ? 'Pausar' : 'Ditar'}</span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            {(text || title) && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-full p-2 text-neutral-500 hover:text-white transition-colors flex-shrink-0"
                title="Limpar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}

            <button
              type="submit"
              disabled={!text.trim() || isLoading}
              className="flex items-center gap-1.5 rounded-full bg-white text-black px-3 py-2 sm:px-4 text-sm font-semibold transition-all hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
            >
              {isLoading ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black border-t-transparent" />
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline sm:inline">Salvar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};