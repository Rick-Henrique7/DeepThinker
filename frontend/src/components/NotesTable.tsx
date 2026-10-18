import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Columns3 } from 'lucide-react';
import { formatPropertyValue, type NoteIndexItem, type PropertyValue } from '../lib/notes';
import { compareValues, propertyKeys } from '../lib/noteViews';

interface NotesTableProps {
  items: NoteIndexItem[];
  onOpen: (id: number) => void;
  onOpenTag: (tag: string) => void;
}

type SortKey = 'title' | 'links' | 'words' | 'updated_at' | 'created_at' | `prop:${string}`;

const COLUMNS_KEY = 'deepthinker.table.columns';
const PAGE = 200;

function loadColumns(): string[] | null {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/**
 * Visão em tabela, como as "Bases" do Obsidian e as databases do Notion: uma linha por nota
 * e uma coluna por propriedade. Clique no nome da coluna para ordenar.
 * As colunas de propriedade aparecem sozinhas, a partir do que as suas notas usam.
 */
export const NotesTable: React.FC<NotesTableProps> = ({ items, onOpen, onOpenTag }) => {
  const keys = useMemo(() => propertyKeys(items), [items]);
  const [chosen, setChosen] = useState<string[] | null>(loadColumns);
  const [picking, setPicking] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'updated_at', dir: -1 });
  const [limit, setLimit] = useState(PAGE);

  // Sem escolha salva: as 4 propriedades mais usadas.
  const columns = (chosen ?? keys.slice(0, 4)).filter((k) => keys.includes(k));

  useEffect(() => {
    if (chosen === null) return;
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(chosen));
    } catch {
      // sem localStorage: a escolha vale só até fechar a página
    }
  }, [chosen]);

  useEffect(() => setLimit(PAGE), [items]);

  const sorted = useMemo(() => {
    const value = (item: NoteIndexItem): PropertyValue => {
      switch (sort.key) {
        case 'title':
          return item.title;
        case 'links':
          return item.links_in + item.links_out;
        case 'words':
          return item.words;
        case 'updated_at':
        case 'created_at':
          return item[sort.key];
        default:
          return item.properties[sort.key.slice(5)];
      }
    };
    return [...items].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const empty = (v: PropertyValue) => v === null || v === undefined || v === '';
      // Vazio fica sempre no fim, nas duas direções.
      if (empty(va) || empty(vb)) return compareValues(va, vb);
      return compareValues(va, vb) * sort.dir;
    });
  }, [items, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'title' ? 1 : -1 }));

  // Função comum (e não um componente criado aqui dentro): assim o React não recria o botão a cada render.
  const header = (k: SortKey, children: React.ReactNode, className = '') => (
    <th
      key={k}
      scope="col"
      aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      className={`px-3 py-2 text-left font-medium text-neutral-400 whitespace-nowrap ${className}`}
    >
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-white">
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-neutral-800 text-xs text-neutral-500">
        <span>
          {items.length} {items.length === 1 ? 'nota' : 'notas'}
        </span>
        {keys.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setPicking((p) => !p)}
              aria-expanded={picking}
              className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 rounded-lg hover:text-white hover:bg-neutral-800/60"
            >
              <Columns3 className="w-3.5 h-3.5" /> Colunas
            </button>
            {picking && (
              <div className="absolute right-0 top-full mt-1 z-20 w-56 max-h-72 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-2 shadow-2xl">
                <div className="px-1 pb-1 text-[11px] uppercase tracking-wider text-neutral-500">Propriedades</div>
                {keys.map((k) => (
                  <label key={k} className="flex items-center gap-2 px-1 py-1.5 text-sm text-neutral-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={columns.includes(k)}
                      onChange={(e) =>
                        setChosen(e.target.checked ? [...columns, k] : columns.filter((c) => c !== k))
                      }
                      className="accent-[rgb(var(--accent))]"
                    />
                    <span className="truncate">{k}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-neutral-500">Nenhuma nota com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-900/70">
              <tr>
                {header('title', 'Título', 'sticky left-0 z-10 bg-neutral-900')}
                <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-400">
                  Tags
                </th>
                {columns.map((k) => header(`prop:${k}`, k))}
                {header('links', 'Ligações')}
                {header('words', 'Palavras')}
                {header('updated_at', 'Atualizada')}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/70">
              {sorted.slice(0, limit).map((item) => (
                <tr key={item.id} className="group hover:bg-neutral-900/60">
                  <td className="sticky left-0 z-10 bg-neutral-950 group-hover:bg-neutral-900 px-3 py-2 max-w-[16rem]">
                    <button
                      type="button"
                      onClick={() => onOpen(item.id)}
                      className="block w-full truncate text-left font-medium text-neutral-100 hover:text-accent"
                      title={item.title}
                    >
                      {item.title}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 max-w-[14rem] overflow-hidden">
                      {item.tags.slice(0, 3).map((t) => (
                        <button key={t} type="button" className="tag-chip whitespace-nowrap" onClick={() => onOpenTag(t)}>
                          #{t}
                        </button>
                      ))}
                      {item.tags.length > 3 && <span className="text-xs text-neutral-500">+{item.tags.length - 3}</span>}
                    </div>
                  </td>
                  {columns.map((k) => (
                    <td key={k} className="px-3 py-2 whitespace-nowrap text-neutral-300 max-w-[14rem] truncate">
                      {formatPropertyValue(item.properties[k])}
                    </td>
                  ))}
                  <td className="px-3 py-2 tabular-nums text-neutral-400">{item.links_in + item.links_out}</td>
                  <td className="px-3 py-2 tabular-nums text-neutral-400">{item.words.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums text-neutral-400">{shortDate(item.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > limit && (
            <div className="p-3 text-center">
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE)}
                className="min-h-[36px] px-4 rounded-xl border border-neutral-800 text-sm text-neutral-300 hover:text-white"
              >
                Mostrar mais ({sorted.length - limit} restantes)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotesTable;
