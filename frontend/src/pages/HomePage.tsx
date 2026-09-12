import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Network, ArrowRight, FileUp, Loader2, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
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

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

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
      const msg = err instanceof Error ? err.message : 'Erro desconhecido.';
      setFeedback({ ok: false, title: 'Falha no upload', message: msg });
    } finally {
      setUploadBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Acesso rápido ao Grafo */}
      <div className="w-full max-w-3xl mx-auto">
        <Link
          to="/grafo"
          className="group flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 sm:p-5 transition-all hover:border-indigo-500/50 hover:bg-slate-900"
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
              <Network className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-200">Grafo de Conhecimento</div>
              <div className="text-xs text-slate-500">Visualize todas as notas conectadas em um grafo interativo</div>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-indigo-400" />
        </Link>
      </div>

      {/* Caixa de Entrada com Reconhecimento de Voz */}
      <ThoughtInput onSubmitThought={handleSaveThought} isLoading={loading} />

      {/* Upload de Documento (PDF/TXT/MD) — link visível sem precisar abrir a sidebar */}
      <div className="w-full max-w-3xl mx-auto rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <FileUp className="h-5 w-5" />
            </div>
            <div className="text-left min-w-0">
              <div className="text-sm font-semibold text-slate-200">Importar Documento</div>
              <div className="text-xs text-slate-500 truncate">
                Envie PDF, TXT ou MD. O texto é extraído, resumido pela IA e linkado ao grafo.
              </div>
            </div>
          </div>
          <button
            onClick={handleUploadClick}
            disabled={uploadBusy}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3 sm:px-4 py-2 text-sm font-medium transition-colors shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            {uploadBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Enviando...</span>
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                <span>Escolher arquivo</span>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            onChange={handleUpload}
            className="hidden"
          />
        </div>

        {feedback && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
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
          </div>
        )}
      </div>
    </div>
  );
}

export default HomePage;
