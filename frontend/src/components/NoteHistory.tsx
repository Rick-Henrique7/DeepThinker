import React, { useEffect, useMemo, useState } from 'react';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { notesApi, splitFrontmatter, type NoteDetail, type NoteVersionDetail, type NoteVersionItem } from '../lib/notes';
import { collapse, diffLines } from '../lib/diff';
import { useConfirm } from './ConfirmDialog';
import { NoteMarkdown } from './NoteMarkdown';

interface NoteHistoryProps {
  noteId: number;
  currentTitle: string;
  currentContent: string;
  /** Há texto editado e ainda não salvo (restaurar jogaria fora). */
  dirty: boolean;
  onRestored: (note: NoteDetail, titleRestored: boolean) => void;
}

/** O que causou a mudança DEPOIS daquela versão (o backend grava em "reason"). */
const REASONS: Record<string, string> = {
  edicao: 'Antes de uma edição',
  propriedades: 'Antes de mudar propriedades',
  link: 'Antes de ligar uma menção',
  restauracao: 'Antes de restaurar uma versão',
  'mapa-mental': 'Antes do mapa mental',
};

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Hoje, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Ontem, ${time}`;
  return `${d.toLocaleDateString('pt-BR')}, ${time}`;
}

const DiffView: React.FC<{ before: string; after: string }> = ({ before, after }) => {
  const chunks = useMemo(() => {
    const lines = diffLines(before, after);
    return lines ? collapse(lines) : null;
  }, [before, after]);
  if (!chunks) return <p className="text-sm text-neutral-500">As duas versões são diferentes demais para comparar linha a linha. Veja o texto completo.</p>;
  if (chunks.every((c) => c.kind === 'same' || c.kind === 'skip')) {
    return <p className="text-sm text-neutral-500">O texto é igual ao de agora (mudou só o título).</p>;
  }
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap gap-x-4 text-[11px] text-neutral-500">
        <span>
          <span className="font-mono text-red-300">−</span> só nesta versão
        </span>
        <span>
          <span className="font-mono text-emerald-300">+</span> só na nota de agora
        </span>
      </p>
      <div className="max-h-80 overflow-auto rounded-xl border border-neutral-800 bg-neutral-950 py-1 font-mono text-xs leading-relaxed">
        {chunks.map((c, i) =>
          c.kind === 'skip' ? (
            <div key={i} className="px-3 py-0.5 text-neutral-600 italic">
              ⋯ {c.count} {c.count === 1 ? 'linha igual' : 'linhas iguais'}
            </div>
          ) : (
            <div
              key={i}
              className={`flex gap-2 px-3 whitespace-pre-wrap break-words ${
                c.kind === 'removed' ? 'bg-red-500/10 text-red-200' : c.kind === 'added' ? 'bg-emerald-500/10 text-emerald-200' : 'text-neutral-400'
              }`}
            >
              <span aria-hidden className="select-none w-3 flex-shrink-0">
                {c.kind === 'removed' ? '−' : c.kind === 'added' ? '+' : ' '}
              </span>
              <span className="min-w-0">
                <span className="sr-only">{c.kind === 'removed' ? 'Removida: ' : c.kind === 'added' ? 'Adicionada: ' : ''}</span>
                {c.text || ' '}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
};

/**
 * Histórico de versões (como o "File recovery" do Obsidian e o histórico do Notion):
 * cada mudança guarda como a nota estava antes. Aqui dá para comparar com a nota de agora
 * e restaurar. Restaurar também é uma mudança, então a nota de agora fica guardada e dá para voltar.
 */
export const NoteHistory: React.FC<NoteHistoryProps> = ({ noteId, currentTitle, currentContent, dirty, onRestored }) => {
  const confirm = useConfirm();
  const [items, setItems] = useState<NoteVersionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<NoteVersionDetail | null>(null);
  const [tab, setTab] = useState<'diff' | 'texto'>('diff');
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setOpenId(null);
    notesApi
      .versions(noteId)
      .then((list) => !cancelled && setItems(list))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Não deu para carregar o histórico.'));
    return () => {
      cancelled = true;
    };
  }, [noteId, currentContent, currentTitle]);

  const toggle = async (id: number) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    setTab('diff');
    try {
      setDetail(await notesApi.version(noteId, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu para abrir a versão.');
    }
  };

  const restore = async (v: NoteVersionDetail) => {
    const ok = await confirm({
      title: 'Restaurar esta versão?',
      message: dirty
        ? 'Você tem um texto editado que ainda não foi salvo; ele será descartado. A nota de agora fica guardada no histórico.'
        : 'A nota volta a ficar como nesta versão. A nota de agora fica guardada no histórico, então dá para desfazer.',
      confirmText: 'Restaurar',
    });
    if (!ok) return;
    setRestoring(true);
    setError(null);
    try {
      const result = await notesApi.restoreVersion(noteId, v.id);
      onRestored(result.note, result.title_restored);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu para restaurar.');
    } finally {
      setRestoring(false);
    }
  };

  if (error && !items) return <p className="text-sm text-red-300">{error}</p>;
  if (!items) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-neutral-500">
        <History className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          Cada vez que a nota muda, a versão anterior fica guardada aqui (as 100 mais recentes). Mudanças pequenas e
          seguidas, como mexer no Quadro, viram uma versão só.
        </p>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {items.length === 0 ? (
        <p className="rounded-xl border border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">
          Ainda não há versões antigas. Elas aparecem a partir da próxima mudança nesta nota.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((v) => {
            const open = openId === v.id;
            return (
              <li key={v.id} className={`rounded-xl border ${open ? 'border-neutral-700 bg-neutral-900/40' : 'border-neutral-800'}`}>
                <button
                  type="button"
                  onClick={() => toggle(v.id)}
                  aria-expanded={open}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-neutral-200">{when(v.created_at)}</span>
                    <span className="block text-xs text-neutral-500 truncate">
                      {REASONS[v.reason] ?? v.reason}
                      {v.title !== currentTitle && ` · título: ${v.title}`}
                    </span>
                  </span>
                  <span className="text-xs text-neutral-500 whitespace-nowrap">{v.size.toLocaleString('pt-BR')} caracteres</span>
                </button>
                {open && (
                  <div className="px-3 pb-3 space-y-3">
                    {!detail ? (
                      <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
                    ) : (
                      <>
                        <div className="flex items-center gap-1 rounded-lg bg-neutral-900 p-0.5 w-fit text-xs">
                          {(['diff', 'texto'] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setTab(t)}
                              aria-pressed={tab === t}
                              className={`px-2.5 py-1 rounded-md ${tab === t ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}
                            >
                              {t === 'diff' ? 'O que mudou' : 'Texto desta versão'}
                            </button>
                          ))}
                        </div>
                        {tab === 'diff' ? (
                          <DiffView before={detail.content ?? ''} after={currentContent} />
                        ) : splitFrontmatter(detail.content ?? '').body.trim() ? (
                          <div className="max-h-80 overflow-auto rounded-xl border border-neutral-800 p-3">
                            <NoteMarkdown content={detail.content ?? ''} />
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-500">Esta versão estava vazia.</p>
                        )}
                        <button
                          type="button"
                          onClick={() => restore(detail)}
                          disabled={restoring}
                          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-white text-black text-sm font-medium hover:bg-neutral-200 disabled:opacity-60"
                        >
                          {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                          Restaurar esta versão
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default NoteHistory;
