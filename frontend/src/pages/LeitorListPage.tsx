import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, FileText, Highlighter, Loader2, Upload } from 'lucide-react';
import { documentsApi, uploadDocument, useDocumentMindmap, type DocumentItem } from '../lib/documents';
import { NOTES_CHANGED_EVENT, notifyNotesChanged } from '../lib/notes';

function when(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? `hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('pt-BR');
}

function sizeLabel(bytes: number | null): string {
  if (bytes === null) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

const KIND: Record<string, string> = { pdf: 'PDF', text: 'Texto' };

/** /leitor: os documentos importados, para abrir no Leitor e grifar. */
export function LeitorListPage() {
  const navigate = useNavigate();
  const mindmap = useDocumentMindmap();
  const [items, setItems] = useState<DocumentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = () =>
      documentsApi
        .list()
        .then(setItems)
        .catch((e) => setError(e instanceof Error ? e.message : 'Não deu para carregar os documentos.'));
    load();
    window.addEventListener(NOTES_CHANGED_EVENT, load);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, load);
  }, []);

  // Igual à tela Pensar: importa, a IA resume e liga as ideias, e o mapa mental vem logo depois.
  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await uploadDocument(file);
      notifyNotesChanged();
      mindmap.start(result.note.id, result.note.title);
      navigate(`/leitor/${result.note.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para importar o documento.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl md:max-w-4xl lg:max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-white">Leitor</h1>
          <p className="text-sm text-neutral-500">Leia os documentos que você importou e grife os trechos importantes. Cada grifo vira uma nota.</p>
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 min-h-[44px] fino:min-h-[40px] px-3 rounded-xl bg-white text-black text-sm font-medium hover:bg-neutral-200 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {busy ? 'A IA está lendo o documento...' : 'Importar documento'}
        </button>
        <input ref={input} type="file" accept=".pdf,.txt,.md" onChange={importFile} className="hidden" />
      </div>

      {error && <p className="rounded-xl border border-red-700/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">{error}</p>}

      {!items ? (
        !error && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
          </div>
        )
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-800 px-6 py-12 text-center space-y-2">
          <BookOpen className="w-8 h-8 mx-auto text-neutral-600" />
          <p className="text-neutral-300">Você ainda não importou nenhum documento.</p>
          <p className="text-sm text-neutral-500">Importe um PDF, TXT ou MD aqui ou na tela Pensar. Ele abre no Leitor para você grifar.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((d) => (
            <li key={d.id}>
              <Link
                to={`/leitor/${d.id}`}
                className="flex h-full gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-4 hover:border-neutral-600 transition-colors"
              >
                <FileText className="w-5 h-5 mt-0.5 flex-shrink-0 text-neutral-500" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-white">{d.title}</span>
                  <span className="block truncate text-xs text-neutral-500 mt-0.5">{d.filename ?? 'documento'}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
                    {d.kind ? (
                      <span className="rounded-md bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
                        {KIND[d.kind]} {sizeLabel(d.size)}
                      </span>
                    ) : (
                      <span className="rounded-md bg-amber-950/40 px-1.5 py-0.5 text-amber-300" title="Importado antes do Leitor: o arquivo original não foi guardado">
                        só o texto
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Highlighter className="w-3.5 h-3.5" /> {d.highlights === 1 ? '1 grifo' : `${d.highlights} grifos`}
                    </span>
                    <span>· {when(d.created_at)}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LeitorListPage;
