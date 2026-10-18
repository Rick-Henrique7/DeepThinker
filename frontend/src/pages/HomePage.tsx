import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Network, ArrowRight, FileUp, MessageSquare, Loader2, CheckCircle2, AlertCircle, CalendarDays } from 'lucide-react';
import { notesApi } from '../lib/notes';
import { ThoughtInput } from '../components/ThoughtInput';
import { api, type ApiError } from '../lib/api';
import { uploadDocument, useDocumentMindmap } from '../lib/documents';
import { DocumentMindmapStatus } from '../components/DocumentMindmapStatus';

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
  const mindmap = useDocumentMindmap();
  const feedbackRef = useRef<HTMLElement | null>(null);

  // O aviso fica embaixo do campo de nota: rola até ele para você ver o resultado (e o mapa mental chegando).
  useEffect(() => {
    if (feedback) feedbackRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [feedback]);

  const handleSaveThought = async (title: string, content: string) => {
    setLoading(true);
    try {
      await api.post('/notes', { title, content });
      navigate('/grafo');
    } catch (err) {
      // Mostra no mesmo aviso usado pelo upload, com a mensagem do backend
      // (ex.: "Já existe uma nota com este título.").
      const body = (err as ApiError).body as { message?: string } | undefined;
      setFeedback({
        ok: false,
        title: 'Não foi possível salvar',
        message: body?.message ?? 'Verifique se o backend está rodando e tente de novo.',
      });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Nota de hoje: o backend cria na primeira vez (com a pergunta do dia) e depois só devolve a mesma.
  const openDaily = async () => {
    try {
      const note = await notesApi.daily();
      navigate(`/grafo?focus=${note.id}`);
    } catch (err) {
      setFeedback({ ok: false, title: 'Não abri a nota de hoje', message: err instanceof Error ? err.message : 'desconhecido' });
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadBusy(true);
    setFeedback(null);
    mindmap.clear();

    try {
      const r = await uploadDocument(file);
      setFeedback({
        ok: true,
        title: r.note.title,
        message: r.fallback
          ? `${file.name} processado (${r.extracted_chars} caracteres). A IA não conseguiu resumir, então o texto foi guardado como veio.`
          : `${file.name} processado (${r.extracted_chars} caracteres). Criadas: ${r.created}, reaproveitadas: ${r.reused}.`,
      });
      // O documento já está salvo; o mapa mental vem em seguida, sem prender a tela.
      mindmap.start(r.note.id, r.note.title);
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
    // No celular: campo em cima e atalhos embaixo. No computador: atalhos numa barra lateral à esquerda
    // e o campo de nota no centro da tela (a terceira coluna, vazia, equilibra a barra para centralizar de verdade).
    <div className="max-w-2xl md:max-w-3xl mx-auto flex flex-col gap-5 sm:gap-6 lg:max-w-none lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_15rem] xl:grid-cols-[16rem_minmax(0,1fr)_16rem] lg:gap-8 lg:items-start">
      {/* Hero */}
      <div className="lg:col-start-2 lg:row-start-1 w-full max-w-3xl mx-auto lg:min-h-[calc(100dvh-10rem)] flex flex-col justify-center gap-5 sm:gap-6">
        <section>
          <ThoughtInput onSubmitThought={handleSaveThought} isLoading={loading} />
        </section>

        {/* Feedback */}
        {feedback && (
          <section
            ref={feedbackRef}
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
          </section>
        )}
      </div>

      {/* Ações secundárias — barra lateral no computador */}
      <aside className="space-y-2 lg:col-start-1 lg:row-start-1 lg:sticky lg:top-20">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium px-1">
          Atalhos
        </h2>
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 divide-y divide-neutral-800 overflow-hidden">
          <button
            type="button"
            onClick={openDaily}
            className="group w-full flex items-center gap-3 p-3 sm:p-4 text-left hover:bg-neutral-800/50 transition-colors"
          >
            <CalendarDays className="h-5 w-5 text-neutral-400 group-hover:text-white transition-colors flex-shrink-0" strokeWidth={1.75} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm sm:text-base text-white">Nota de hoje</span>
              <span className="block text-xs text-neutral-500">Uma pergunta do dia para pensar</span>
            </span>
            <ArrowRight className="h-4 w-4 text-neutral-500 group-hover:text-white transition-colors flex-shrink-0" />
          </button>

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
      </aside>
    </div>
  );
}

export default HomePage;
