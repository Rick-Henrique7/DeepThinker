import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Sparkles, Trash2 } from 'lucide-react';
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
  const { isListening, transcript, error, startListening, stopListening, resetTranscript } =
    useSpeechToText('pt-BR');

  useEffect(() => {
    if (!transcript) return;

    setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    resetTranscript();
  }, [transcript, resetTranscript]);

  const handleToggleMic = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleClear = () => {
    setTitle('');
    setText('');
    resetTranscript();
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
    <div className="w-full max-w-3xl mx-auto rounded-3xl border border-slate-800/80 bg-slate-900/90 p-4 shadow-2xl shadow-black/30 backdrop-blur">
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="Título do Pensamento (Opcional)..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-indigo-500 focus:outline-none"
        />

        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite ou clique no microfone para ditar sua ideia. Use [[Título]] para conectar notas..."
            rows={5}
            className="w-full resize-none rounded-2xl border border-slate-800 bg-slate-950 p-4 leading-relaxed text-slate-100 placeholder-slate-500 transition-colors focus:border-indigo-500 focus:outline-none"
          />

          {isListening && (
            <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 animate-pulse">
              <span className="h-2 w-2 animate-ping rounded-full bg-red-500" />
              Gravando voz...
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-400">
            ⚠️ {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleToggleMic}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              isListening
                ? 'animate-pulse bg-red-600 text-white shadow-lg shadow-red-600/30 hover:bg-red-700'
                : 'border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-indigo-400" />}
            {isListening ? 'Pausar Dito' : 'Ditar Pensamento'}
          </button>

          <div className="flex items-center gap-2">
            {(text || title) && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:text-red-400"
                title="Limpar texto"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}

            <button
              type="submit"
              disabled={!text.trim() || isLoading}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
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