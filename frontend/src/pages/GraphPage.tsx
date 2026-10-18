import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { KanbanSquare, Network, Search, Table2, X } from 'lucide-react';
import { KnowledgeGraph, NodeItem, LinkItem } from '../components/KnowledgeGraph';
import { NoteDrawer } from '../components/NoteDrawer';
import { NotesTable } from '../components/NotesTable';
import { BoardView } from '../components/BoardView';
import { api } from '../lib/api';
import { useConfirm } from '../components/ConfirmDialog';
import {
  NOTES_CHANGED_EVENT,
  matchesTag,
  normalize,
  notesApi,
  type NoteIndexItem,
  type TagCount,
} from '../lib/notes';
import { distinctValues, filterNotes, propertyKeys, valueLabel } from '../lib/noteViews';

type View = 'grafo' | 'tabela' | 'quadro';

const VIEWS: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'grafo', label: 'Grafo', icon: <Network className="w-4 h-4" /> },
  { id: 'tabela', label: 'Tabela', icon: <Table2 className="w-4 h-4" /> },
  { id: 'quadro', label: 'Quadro', icon: <KanbanSquare className="w-4 h-4" /> },
];

/**
 * A página das notas, com três jeitos de ver as mesmas notas:
 * - Grafo: as ligações [[...]] entre as ideias;
 * - Tabela: uma linha por nota, uma coluna por propriedade;
 * - Quadro: só as notas que a pessoa mandou para lá, em colunas editáveis (ver BoardView).
 *
 * A visão e a tag escolhidas ficam na URL (/grafo?view=tabela&tag=ideia): dá para voltar
 * com o botão do navegador, e outras telas (a paleta Ctrl+K, um clique numa #tag) abrem já filtrado.
 */
export function GraphPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get('view');
  const view: View = rawView === 'tabela' || rawView === 'quadro' ? rawView : 'grafo';
  const tag = searchParams.get('tag');

  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [index, setIndex] = useState<NoteIndexItem[] | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [search, setSearch] = useState('');
  const [prop, setProp] = useState<{ key: string; value: string | null } | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  // Digitar na busca não pode travar o grafo: o filtro usa o valor "atrasado" (React 18).
  const deferredSearch = useDeferredValue(search);
  const indexWanted = useRef(false);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true }
      ),
    [setSearchParams]
  );

  const fetchGraphData = useCallback(async () => {
    try {
      const data = await api.get<{ nodes: NodeItem[]; links: LinkItem[] }>('/graph');
      setNodes(data.nodes || []);
      setLinks(data.links || []);
    } catch (err) {
      console.error('Erro ao buscar grafo:', err);
    }
  }, []);

  const fetchIndex = useCallback(async () => {
    indexWanted.current = true;
    try {
      setIndex(await notesApi.index());
    } catch (err) {
      console.error('Erro ao buscar o índice das notas:', err);
      setIndex((old) => old ?? []);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      setTags(await notesApi.tags());
    } catch {
      setTags([]);
    }
  }, []);

  // Recarrega o que já está em uso depois de qualquer mudança nas notas.
  const refresh = useCallback(() => {
    fetchGraphData();
    fetchTags();
    if (indexWanted.current) fetchIndex();
  }, [fetchGraphData, fetchTags, fetchIndex]);

  useEffect(() => {
    refresh();
    // Notas criadas pela paleta (Ctrl+K), por um [[link]] novo ou ao ligar uma menção.
    window.addEventListener(NOTES_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, refresh);
  }, [refresh]);

  // A Tabela e o Quadro precisam do índice (tags e propriedades de todas as notas): só busca quando abre.
  useEffect(() => {
    if (view !== 'grafo' && index === null) fetchIndex();
  }, [view, index, fetchIndex]);

  // Suporte a ?focus=ID vindo do Advogado (tool result criou uma nota) e da paleta
  useEffect(() => {
    const focus = searchParams.get('focus');
    if (focus) {
      const id = Number(focus);
      if (Number.isFinite(id) && id > 0) setSelectedNoteId(id);
      // limpa só o focus (para não reabrir no F5) e mantém a visão e a tag
      setParam('focus', null);
    }
  }, [searchParams, setParam]);

  // ------------------------------------------------------------ filtros
  const graph = useMemo(() => {
    const q = normalize(deferredSearch);
    if (!tag && !q) return { nodes, links };
    const keep = new Set(
      nodes.filter((n) => (!tag || matchesTag(n.tags, tag)) && (!q || normalize(n.title).includes(q))).map((n) => n.id)
    );
    const idOf = (v: number | NodeItem) => (typeof v === 'object' ? v.id : v);
    return {
      nodes: nodes.filter((n) => keep.has(n.id)),
      links: links.filter((l) => keep.has(idOf(l.source)) && keep.has(idOf(l.target))),
    };
  }, [nodes, links, tag, deferredSearch]);

  const keys = useMemo(() => propertyKeys(index ?? []), [index]);
  const filtered = useMemo(
    () =>
      filterNotes(index ?? [], {
        tag,
        search: deferredSearch,
        propKey: prop?.key ?? null,
        propValue: prop?.value ?? null,
      }),
    [index, tag, deferredSearch, prop]
  );
  const propValues = useMemo(
    () => (prop ? distinctValues(index ?? [], prop.key).sort((a, b) => b.count - a.count) : []),
    [index, prop]
  );

  // Uma tag-mãe vinda de um link (#projeto) pode não estar na lista; mostramos ela mesmo assim.
  const tagOptions = tag && !tags.some((t) => t.tag === tag) ? [{ tag, count: 0 }, ...tags] : tags;
  const hasFilters = !!tag || !!search || !!prop;

  // ------------------------------------------------------------ ações
  const handleUpdateNote = async (id: number, title: string, content: string) => {
    const saved = await notesApi.update(id, title, content);
    refresh();
    return saved;
  };

  const handleDeleteNote = async (id: number) => {
    const ok = await confirm({
      title: 'Excluir esta nota?',
      message: 'A nota e as ligações dela no grafo serão apagadas. Não dá para desfazer.',
      confirmText: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/notes/${id}`);
      setSelectedNoteId(null);
      refresh();
    } catch (err) {
      console.error('Erro ao excluir nota:', err);
    }
  };

  const openTag = (t: string) => {
    setSelectedNoteId(null);
    setParam('tag', t);
  };

  const selectClass =
    'min-h-[44px] fino:min-h-[40px] max-w-[12rem] rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 text-sm text-neutral-200 focus:outline-none focus:border-accent';

  return (
    <div className="max-w-2xl md:max-w-4xl lg:max-w-6xl mx-auto space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between gap-3">
        {/* No celular o título sai da tela (fica só para leitor de tela) e as três abas dividem a largura:
            assim cabem em 320px com área de toque de 44px. */}
        <h2 className="sr-only sm:not-sr-only text-xs uppercase tracking-wider text-neutral-500 font-medium px-1">Suas notas</h2>
        <div role="tablist" aria-label="Jeito de ver as notas" className="flex flex-1 sm:flex-none items-center gap-1 rounded-xl bg-neutral-900 p-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setParam('view', v.id === 'grafo' ? null : v.id)}
              className={`inline-flex flex-1 sm:flex-none justify-center items-center gap-1.5 min-h-[44px] fino:min-h-[36px] px-2 sm:px-3 rounded-lg text-sm transition-colors ${
                view === v.id ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              {v.icon}
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros: valem para as três visões (a propriedade só na Tabela e no Quadro) */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[10rem]">
          <span className="sr-only">Buscar pelo título</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pelo título..."
            className="w-full min-h-[44px] fino:min-h-[40px] rounded-xl border border-neutral-800 bg-neutral-950 pl-9 pr-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-accent"
          />
        </label>
        <select aria-label="Filtrar por tag" value={tag ?? ''} onChange={(e) => setParam('tag', e.target.value || null)} className={selectClass}>
          <option value="">Todas as tags</option>
          {tagOptions.map((t) => (
            <option key={t.tag} value={t.tag}>
              #{t.tag}
              {t.count ? ` (${t.count})` : ''}
            </option>
          ))}
        </select>
        {view !== 'grafo' && keys.length > 0 && (
          <>
            <select
              aria-label="Filtrar por propriedade"
              value={prop?.key ?? ''}
              onChange={(e) => setProp(e.target.value ? { key: e.target.value, value: null } : null)}
              className={selectClass}
            >
              <option value="">Qualquer propriedade</option>
              {keys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            {prop && (
              <select
                aria-label={`Valor de ${prop.key}`}
                value={prop.value ?? '__todos'}
                onChange={(e) => setProp({ key: prop.key, value: e.target.value === '__todos' ? null : e.target.value })}
                className={selectClass}
              >
                <option value="__todos">qualquer valor</option>
                {propValues.map((v) => (
                  <option key={v.value || '__vazio'} value={v.value}>
                    {valueLabel(v.value, prop.key)} ({v.count})
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setProp(null);
              setParam('tag', null);
            }}
            className="inline-flex items-center gap-1 min-h-[44px] fino:min-h-[40px] px-2.5 rounded-xl text-sm text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" /> Limpar
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {view === 'grafo' && (
        <KnowledgeGraph nodes={graph.nodes} links={graph.links} onSelectNode={(node) => setSelectedNoteId(node.id)} />
      )}
      {view === 'tabela' && index === null && <div className="h-64 rounded-2xl bg-neutral-900/50 animate-pulse" />}
      {view === 'tabela' && index !== null && (
        <NotesTable items={filtered} onOpen={setSelectedNoteId} onOpenTag={openTag} />
      )}
      {view === 'quadro' && (
        <BoardView
          tag={tag}
          search={deferredSearch}
          // Filtro por propriedade: vale só para as notas comuns (o índice não tem os cartões do Quadro)
          ids={prop ? new Set(filtered.map((n) => n.id)) : null}
          onOpen={setSelectedNoteId}
          onOpenTag={openTag}
        />
      )}

      <NoteDrawer
        noteId={selectedNoteId}
        onClose={() => setSelectedNoteId(null)}
        onUpdateNote={handleUpdateNote}
        onDeleteNote={handleDeleteNote}
        onOpenNote={setSelectedNoteId}
        onOpenTag={openTag}
        graphNodes={nodes}
        graphLinks={links}
      />
    </div>
  );
}

export default GraphPage;
