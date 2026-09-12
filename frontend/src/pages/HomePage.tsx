import React, { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Network, ArrowRight, FileUp, MessageSquare, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ThoughtInput } from '../components/ThoughtInput';
import { api } from '../lib/api';

interface UploadFeedback {
  ok: boolean;
  title: string;
  message: string;
}

export function HomePage() {
  const [loading, setLoading] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [feedback, setFeedback] = useState<UploadFeedback | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const handleSaveThought = async (title: string, content: string) => {
    setLoading(true);
    try {
      await api.post('/notes', { title, content });
      navigate('/grafo');
    } catch (err) {
      alert('Erro ao salvar no servidor Laravel.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadBusy(true);
    setFeedback(null);

    const form = new FormData();
    form.append('file', file);

    try {
      const r = await api.post<{ note: { title: string }; extracted_chars: number; created: number; reused: number }>(
        '/documents/upload',
        form
      );
      setFeedback({
        ok: true,
        title: r.note.title,
        message: `${file.name} processado (${r.extracted_chars} caracteres). Criadas: ${r.created}, reaproveitadas: ${r.reused}.`,
      });
    } catch (err) {
      setFeedback({
        ok: false,
        title: 'Falha no upload',
        message: err instanceof Error ? err.message : 'desconhecido',
      });
    } finally {
      setUploadBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto space-y-5 sm:space-y-6 lg:space-y-8">
      {/* Hero */}
      <section>
        <ThoughtInput onSubmitThought={handleSaveThought} isLoading={loading} />
      </section>

      {/* Ações secundárias — estilo iOS list */}
      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium px-1">
          Atalhos
        </h2>
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 divide-y divide-neutral-800 overflow-hidden">
          <Link
            to="/grafo"
            className="group flex items-center gap-3 p-3 sm:p-4 hover:bg-neutral-800/50 transition-colors"
          >
            <Network className="h-5 w-5 text-neutral-400 group-hover:text-white transition-colors flex-shrink-0" strokeWidth={1.75} />
            <span className="flex-1 text-sm sm:text-base text-white">Grafo de Conhecimento</span>
            <ArrowRight className="h-4 w-4 text-neutral-500 group-hover:text-white transition-colors flex-shrink-0" />
          </Link>

          <Link
            to="/advogado"
            className="group flex items-center gap-3 p-3 sm:p-4 hover:bg-neutral-800/50 transition-colors"
          >
            <MessageSquare className="h-5 w-5 text-neutral-400 group-hover:text-white transition-colors flex-shrink-0" strokeWidth={1.75} />
            <span className="flex-1 text-sm sm:text-base text-white">Advogado do Diabo</span>
            <ArrowRight className="h-4 w-4 text-neutral-500 group-hover:text-white transition-colors flex-shrink-0" />
          </Link>

          <button
            onClick={handleUploadClick}
            disabled={uploadBusy}
            className="group w-full flex items-center gap-3 p-3 sm:p-4 text-left hover:bg-neutral-800/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {uploadBusy ? (
              <Loader2 className="h-5 w-5 text-neutral-400 animate-spin flex-shrink-0" />
            ) : (
              <FileUp className="h-5 w-5 text-neutral-400 group-hover:text-white transition-colors flex-shrink-0" strokeWidth={1.75} />
            )}
            <span className="flex-1 text-sm sm:text-base text-white">
              {uploadBusy ? 'Enviando...' : 'Importar Documento'}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md"
              onChange={handleUpload}
              className="hidden"
            />
          </button>
        </div>
      </section>

      {/* Feedback */}
      {feedback && (
        <section
          className={`flex items-start gap-3 rounded-2xl border p-3 text-sm ${
            feedback.ok
              ? 'border-emerald-700/40 bg-emerald-950/30 text-emerald-300'
              : 'border-red-700/40 bg-red-950/30 text-red-300'
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          )}
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
        </section>
      )}
    </div>
  );
}

export default HomePage;
