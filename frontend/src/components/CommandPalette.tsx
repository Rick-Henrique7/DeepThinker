import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Brain, CalendarDays, CornerDownLeft, FileText, Hash, Headphones, KanbanSquare, LayoutTemplate, MessageSquare, Network, Plus, Search, Settings as SettingsIcon, Table2, LayoutDashboard, BookOpen, Puzzle, Users } from 'lucide-react';
import { normalize, notesApi, notifyNotesChanged, type NoteRef, type TagCount } from '../lib/notes';
import { TEMPLATES } from '../lib/templates';
import { pluginCommandStore, runPluginCommand } from '../lib/plugins';
import { collabApi, type SharedNote } from '../lib/collab';

/** Outras telas abrem a paleta disparando este evento (ex.: o botão de busca do topo). */
export const OPEN_PALETTE_EVENT = 'deepthinker:open-palette';
export const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));

interface Item {
  key: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => Promise<void> | void;
}

/**
 * Paleta de comandos (Ctrl+K ou Cmd+K), mistura da "troca rápida" (Ctrl+O) e da
 * "paleta de comandos" (Ctrl+P) do Obsidian: digite para achar uma nota, criar uma nota
 * (com ou sem modelo), abrir a nota do dia ou ir para outra tela, tudo sem tirar a mão do teclado.
 */
export const CommandPalette: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [titles, setTitles] = useState<NoteRef[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [shared, setShared] = useState<SharedNote[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Comandos que os plugins instalados registraram (ver lib/plugins.ts)
  const pluginCommands = useSyncExternalStore(pluginCommandStore.subscribe, pluginCommandStore.get);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  // A cada abertura: limpa a busca e recarrega a lista de títulos (podem ter mudado).
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setError(null);
    setActive(0);
    notesApi.titles().then(setTitles).catch(() => setTitles([]));
    notesApi.tags().then(setTags).catch(() => setTags([]));
    // Notas de outras pessoas compartilhadas comigo (edição em conjunto)
    collabApi.sharedWithMe().then((l) => setShared(Array.isArray(l) ? l : [])).catch(() => setShared([]));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const close = () => setOpen(false);

  const openNote = (id: number) => {
    close();
    navigate(`/grafo?focus=${id}`);
  };

  const createNote = async (title: string, content: string) => {
    const note = await notesApi.create(title, content);
    notifyNotesChanged();
    openNote(note.id);
  };

  const items = useMemo<Item[]>(() => {
    // "#ide" procura só tags; sem # as tags aparecem junto com as notas.
    const tagOnly = query.trim().startsWith('#');
    const q = normalize(query.replace(/^\s*#/, ''));
    const pages: Item[] = [
      { key: 'p-daily', label: 'Nota de hoje', hint: 'diário com a pergunta do dia', icon: <CalendarDays className="w-4 h-4" />,
        run: async () => {
          const note = await notesApi.daily();
          notifyNotesChanged();
          openNote(note.id);
        } },
      { key: 'p-home', label: 'Ir para Pensar', icon: <Brain className="w-4 h-4" />, run: () => { close(); navigate('/'); } },
      { key: 'p-graph', label: 'Ir para o Grafo', icon: <Network className="w-4 h-4" />, run: () => { close(); navigate('/grafo'); } },
      { key: 'p-table', label: 'Ver as notas em tabela', hint: 'propriedades em colunas', icon: <Table2 className="w-4 h-4" />, run: () => { close(); navigate('/grafo?view=tabela'); } },
      { key: 'p-board', label: 'Quadro (Kanban) das notas', hint: 'arraste para mudar o status', icon: <KanbanSquare className="w-4 h-4" />, run: () => { close(); navigate('/grafo?view=quadro'); } },
      { key: 'p-painel', label: 'Abrir o Painel', hint: 'seu pensamento em números, gráficos', icon: <BarChart3 className="w-4 h-4" />, run: () => { close(); navigate('/painel'); } },
      { key: 'p-audio', label: 'Ouvir o resumo das notas', hint: 'resumo em áudio, como um podcast', icon: <Headphones className="w-4 h-4" />, run: () => { close(); navigate('/painel#resumo-audio'); } },
      { key: 'p-canvas', label: 'Abrir o Canvas', hint: 'quadro sem fim com cartões e setas', icon: <LayoutDashboard className="w-4 h-4" />, run: () => { close(); navigate('/canvas'); } },
      { key: 'p-leitor', label: 'Abrir o Leitor', hint: 'ler os documentos importados e grifar trechos', icon: <BookOpen className="w-4 h-4" />, run: () => { close(); navigate('/leitor'); } },
      { key: 'p-adv', label: 'Conversar com o Advogado do Diabo', icon: <MessageSquare className="w-4 h-4" />, run: () => { close(); navigate('/advogado'); } },
      { key: 'p-ia', label: 'Configurações de IA', icon: <SettingsIcon className="w-4 h-4" />, run: () => { close(); navigate('/settings'); } },
      ...pluginCommands.map((c) => ({
        key: `x-${c.pluginId}-${c.id}`,
        label: c.title,
        hint: `plugin ${c.pluginName}`,
        icon: <Puzzle className="w-4 h-4" />,
        run: () => {
          close();
          runPluginCommand(c);
        },
      })),
    ];

    const notes: Item[] = titles
      .map((t) => ({ t, n: normalize(t.title) }))
      .filter(({ n }) => !q || n.includes(q))
      .sort((a, b) => Number(b.n.startsWith(q)) - Number(a.n.startsWith(q)) || a.n.length - b.n.length)
      .slice(0, q ? 8 : 5)
      .map(({ t }) => ({ key: `n-${t.id}`, label: t.title, hint: 'nota', icon: <FileText className="w-4 h-4" />, run: () => openNote(t.id) }));

    const sharedItems: Item[] = shared
      .filter((n) => !q || normalize(n.title).includes(q))
      .slice(0, q ? 5 : 3)
      .map((n) => ({
        key: `s-${n.id}`,
        label: n.title,
        hint: `compartilhada por ${n.owner_name}`,
        icon: <Users className="w-4 h-4" />,
        run: () => {
          close();
          navigate(`/compartilhada/${n.id}`);
        },
      }));

    const tagItems: Item[] = tags
      .filter((t) => !q || normalize(t.tag).includes(q))
      .slice(0, tagOnly ? 10 : 3)
      .map((t) => ({
        key: `t-${t.tag}`,
        label: `#${t.tag}`,
        hint: `${t.count} ${t.count === 1 ? 'nota' : 'notas'}`,
        icon: <Hash className="w-4 h-4" />,
        run: () => {
          close();
          navigate(`/grafo?view=tabela&tag=${encodeURIComponent(t.tag)}`);
        },
      }));

    if (tagOnly) return tagItems;
    if (!q) return [...pages.slice(0, 1), ...notes, ...sharedItems, ...pages.slice(1)];

    const exact = titles.some((t) => normalize(t.title) === q);
    const title = query.trim();
    const create: Item[] = exact
      ? []
      : [
          { key: 'c-blank', label: `Criar nota "${title}"`, icon: <Plus className="w-4 h-4" />, run: () => createNote(title, '') },
          ...TEMPLATES.map((tpl) => ({
            key: `c-${tpl.id}`,
            label: `Criar "${title}" com modelo ${tpl.label}`,
            hint: tpl.description,
            icon: <LayoutTemplate className="w-4 h-4" />,
            run: () => createNote(title, tpl.content),
          })),
        ];
    // A dica também conta na busca: "grafico" acha o Painel, "audio" acha o resumo em áudio.
    const matchingPages = pages.filter((p) => normalize(`${p.label} ${p.hint ?? ''}`).includes(q));
    // As telas vêm antes de "Criar nota": quem digita "painel" e aperta Enter quer abrir o Painel,
    // não criar uma nota chamada "painel". Criar fica por último, como no Obsidian.
    return [...notes, ...sharedItems, ...tagItems, ...matchingPages, ...create];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, titles, tags, pluginCommands, shared]);

  if (!open) return null;

  const runItem = async (item: Item) => {
    setBusy(true);
    setError(null);
    try {
      await item.run();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu certo.');
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      runItem(items[active]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-start justify-center px-3 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
    >
      <div className="w-full max-w-xl rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl overflow-hidden" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 px-4 border-b border-neutral-800">
          <Search className="w-4 h-4 text-neutral-500 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Buscar nota, #tag, criar nota ou ir para..."
            className="flex-1 bg-transparent py-3.5 text-base text-white placeholder:text-neutral-500 focus:outline-none"
          />
          <kbd className="hidden sm:inline text-[11px] text-neutral-500 border border-neutral-700 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        {error && <div className="px-4 py-2 text-sm text-red-300 border-b border-neutral-800">{error}</div>}
        <ul className="max-h-[50vh] overflow-y-auto py-1" role="listbox">
          {items.map((item, i) => (
            <li key={item.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                disabled={busy}
                onMouseEnter={() => setActive(i)}
                onClick={() => runItem(item)}
                className={`w-full flex items-center gap-3 px-4 min-h-[44px] text-left ${
                  i === active ? 'bg-accent/15 text-white' : 'text-neutral-300'
                }`}
              >
                <span className="text-neutral-400">{item.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm">{item.label}</span>
                  {item.hint && <span className="block truncate text-xs text-neutral-500">{item.hint}</span>}
                </span>
                {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-neutral-500" />}
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">Nada encontrado.</li>}
        </ul>
      </div>
    </div>
  );
};

export default CommandPalette;
