import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { useConfirm } from '../components/ConfirmDialog';
import { canvasApi, parseCanvasFile, type CanvasItem } from '../lib/canvas';

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `hoje, ${time}`;
  return d.toLocaleDateString('pt-BR');
}

/** /canvas: todos os seus canvas, criar um novo e importar um .canvas do Obsidian. */
export function CanvasListPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [items, setItems] = useState<CanvasItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = () =>
    canvasApi
      .list()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Não deu para carregar os canvas.'));

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const c = await canvasApi.create('');
      navigate(`/canvas/${c.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu para criar o canvas.');
      setBusy(false);
    }
  };

  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const data = parseCanvasFile(await file.text());
      const c = await canvasApi.create(file.name.replace(/\.canvas$/i, ''), data);
      navigate(`/canvas/${c.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para importar o arquivo.');
      setBusy(false);
    }
  };

  const remove = async (c: CanvasItem) => {
    const ok = await confirm({
      title: `Apagar "${c.title}"?`,
      message: 'O canvas some, mas as notas que estavam nele continuam no grafo.',
      confirmText: 'Apagar',
      variant: 'danger',
    });
    if (!ok) return;
    await canvasApi.remove(c.id);
    load();
  };

  return (
    <div className="max-w-2xl md:max-w-4xl lg:max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-white">Canvas</h1>
          <p className="text-sm text-neutral-500">Um quadro sem fim para espalhar notas, ideias soltas e links, e ligar tudo com setas.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 min-h-[44px] fino:min-h-[40px] px-3 rounded-xl border border-neutral-800 text-sm text-neutral-300 hover:text-white hover:border-neutral-600 disabled:opacity-50"
            title="Abrir um arquivo .canvas do Obsidian"
          >
            <Upload className="w-4 h-4" /> Importar .canvas
          </button>
          <input ref={fileInput} type="file" accept=".canvas,application/json" onChange={importFile} className="hidden" />
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="inline-flex items-center gap-1.5 min-h-[44px] fino:min-h-[40px] px-3 rounded-xl bg-white text-black text-sm font-medium hover:bg-neutral-200 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Novo canvas
          </button>
        </div>
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
          <LayoutDashboard className="w-8 h-8 mx-auto text-neutral-600" />
          <p className="text-neutral-300">Você ainda não tem nenhum canvas.</p>
          <p className="text-sm text-neutral-500">
            Crie um novo, importe um do Obsidian, ou abra uma nota e use "Abrir no Canvas" para começar com ela e as ligações dela.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <li key={c.id} className="group relative rounded-2xl border border-neutral-800 bg-neutral-900/40 hover:border-neutral-600 transition-colors">
              <Link to={`/canvas/${c.id}`} className="block px-4 py-4 pr-12">
                <span className="block truncate font-medium text-white">{c.title}</span>
                <span className="block text-xs text-neutral-500 mt-1">
                  {c.cards === 1 ? '1 cartão' : `${c.cards} cartões`} · mudou {when(c.updated_at)}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => remove(c)}
                aria-label={`Apagar ${c.title}`}
                title="Apagar"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-neutral-500 hover:text-red-300 hover:bg-neutral-800"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CanvasListPage;
