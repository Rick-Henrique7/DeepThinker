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
        message: `${file.name} processado (${r.extracted_chars} caracteres). Notas criadas: ${r.created}, reaproveitadas: ${r.reused}.`,
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
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
      {/* Hero: pensamento */}
      <section>
        <ThoughtInput onSubmitThought={handleSaveThought} isLoading={loading} />
      </section>

      {/* Ações secundárias em grid */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Grafo */}
        <Link
          to="/grafo"
          className="group flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 transition-all hover:border-indigo-500/50 hover:bg-slate-900"
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
            <Network className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-200">Ver Grafo</div>
            <div className="text-xs text-slate-500 truncate">Notas conectadas</div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
        </Link>

        {/* Advogado do Diabo */}
        <Link
          to="/advogado"
          className="group flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 transition-all hover:border-purple-500/50 hover:bg-slate-900"
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-200">Advogado</div>
            <div className="text-xs text-slate-500 truncate">Chat com IA local</div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-purple-400 transition-colors flex-shrink-0" />
        </Link>

        {/* Upload de documento */}
        <button
          onClick={handleUploadClick}
          disabled={uploadBusy}
          className="group flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 text-left transition-all hover:border-emerald-500/50 hover:bg-slate-900 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            {uploadBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-200">
              {uploadBusy ? 'Enviando...' : 'Importar'}
            </div>
            <div className="text-xs text-slate-500 truncate">PDF, TXT ou MD</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            onChange={handleUpload}
            className="hidden"
          />
        </button>
      </section>

      {/* Feedback do upload */}
      {feedback && (
        <section
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
            feedback.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          )}
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
        </section>
      )}
    </div>
  );
}

export default HomePage;
