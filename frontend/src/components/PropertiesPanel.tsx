import React, { useRef, useState } from 'react';
import { Loader2, Plus, Tag, X } from 'lucide-react';
import {
  formatPropertyValue,
  isDateString,
  parsePropertyInput,
  type Properties,
  type PropertyValue,
} from '../lib/notes';

interface PropertiesPanelProps {
  /** Todas as tags da nota (cabeçalho + #tags do texto). */
  tags: string[];
  /** Propriedades do cabeçalho. A chave "tags" traz só as tags do cabeçalho (as que dá para tirar daqui). */
  properties: Properties;
  /** Tags e nomes de propriedade que já existem em outras notas, para sugerir. */
  knownTags?: string[];
  knownKeys?: string[];
  busy?: boolean;
  /** Merge patch: { status: 'feito' } troca, { prazo: null } apaga. */
  onChange: (patch: Properties) => Promise<void>;
  onOpenTag: (tag: string) => void;
}

/** Nomes comuns para sugerir quando a pessoa cria a primeira propriedade. */
const COMMON_KEYS = ['status', 'tipo', 'prioridade', 'prazo', 'confiança', 'fonte', 'autor', 'nota'];

/**
 * Painel de propriedades, como o do Obsidian: mostra o cabeçalho YAML como uma tabelinha
 * editável, sem a pessoa precisar saber YAML. Cada mudança vira um PATCH no backend,
 * que reescreve o cabeçalho e mantém o resto do texto como estava.
 */
export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  tags,
  properties,
  knownTags = [],
  knownKeys = [],
  busy = false,
  onChange,
  onOpenTag,
}) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newTag, setNewTag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Enter e clicar fora salvam pelo mesmo caminho (o onBlur); Esc marca "cancelar" antes de sair do campo.
  const cancelRef = useRef(false);
  const finish = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      cancelRef.current = true;
      e.currentTarget.blur();
    }
  };
  const cancelled = () => {
    const c = cancelRef.current;
    cancelRef.current = false;
    return c;
  };

  const headerTags = Array.isArray(properties.tags) ? properties.tags.map(String) : [];
  const entries = Object.entries(properties).filter(([k]) => k !== 'tags');

  const run = async (patch: Properties) => {
    setError(null);
    try {
      await onChange(patch);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu para salvar a propriedade.');
      return false;
    }
  };

  const startEdit = (key: string, value: PropertyValue) => {
    setEditing(key);
    setDraft(Array.isArray(value) ? value.join(', ') : value === null ? '' : String(value));
  };

  const commitEdit = async (key: string, original: PropertyValue) => {
    setEditing(null);
    if (cancelled()) return;
    const next = parsePropertyInput(draft, Array.isArray(original));
    if (JSON.stringify(next) !== JSON.stringify(original)) await run({ [key]: next });
  };

  const addProperty = async () => {
    const key = newKey.trim();
    if (!key) return;
    if (await run({ [key]: parsePropertyInput(newValue) })) {
      setNewKey('');
      setNewValue('');
      setAdding(false);
    }
  };

  const addTag = async () => {
    const tag = (newTag ?? '').trim().replace(/^#+/, '');
    setNewTag(null);
    if (cancelled() || !tag || headerTags.includes(tag.toLowerCase())) return;
    await run({ tags: [...headerTags, tag] });
  };

  const keySuggestions = Array.from(new Set([...knownKeys, ...COMMON_KEYS])).filter(
    (k) => k !== 'tags' && !(k in properties)
  );

  return (
    <section aria-label="Propriedades" className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2.5 space-y-2 text-sm">
      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag className="w-3.5 h-3.5 text-neutral-500" aria-hidden />
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center">
            <button type="button" className="tag-chip" onClick={() => onOpenTag(t)} title={`Ver as notas com #${t}`}>
              #{t}
            </button>
            {headerTags.includes(t) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run({ tags: headerTags.filter((x) => x !== t) })}
                aria-label={`Tirar a tag ${t}`}
                className="ml-0.5 p-0.5 rounded text-neutral-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        {newTag === null ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setNewTag('')}
            className="inline-flex items-center gap-1 min-h-[28px] px-2 rounded-full text-xs text-neutral-400 hover:text-white"
          >
            <Plus className="w-3 h-3" /> tag
          </button>
        ) : (
          <input
            autoFocus
            value={newTag}
            list="dt-known-tags"
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={finish}
            onBlur={addTag}
            placeholder="nova tag"
            aria-label="Nova tag"
            className="w-28 bg-neutral-950 border border-neutral-700 rounded-full px-2.5 py-0.5 text-xs text-white focus:outline-none focus:border-accent"
          />
        )}
        <datalist id="dt-known-tags">
          {knownTags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-500 ml-auto" />}
      </div>

      {/* Propriedades */}
      {entries.length > 0 && (
        <dl className="divide-y divide-neutral-800/70">
          {entries.map(([key, value]) => (
            <div key={key} className="group flex items-center gap-2 py-1 min-h-[34px]">
              <dt className="w-28 flex-shrink-0 truncate text-neutral-500" title={key}>
                {key}
              </dt>
              <dd className="flex-1 min-w-0">
                {typeof value === 'boolean' ? (
                  <label className="inline-flex items-center gap-2 cursor-pointer text-neutral-200">
                    <input
                      type="checkbox"
                      checked={value}
                      disabled={busy}
                      onChange={(e) => run({ [key]: e.target.checked })}
                      className="accent-[rgb(var(--accent))]"
                    />
                    {value ? 'sim' : 'não'}
                  </label>
                ) : editing === key ? (
                  <input
                    autoFocus
                    type={isDateString(value) ? 'date' : 'text'}
                    value={isDateString(value) ? draft.slice(0, 10) : draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={finish}
                    onBlur={() => commitEdit(key, value)}
                    aria-label={`Valor de ${key}`}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-accent"
                  />
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startEdit(key, value)}
                    title="Clique para mudar"
                    className={`w-full text-left truncate rounded-lg px-2 py-1 -mx-2 hover:bg-neutral-800/60 ${
                      value === null || value === '' ? 'text-neutral-600' : 'text-neutral-200'
                    }`}
                  >
                    {formatPropertyValue(value)}
                  </button>
                )}
              </dd>
              <button
                type="button"
                disabled={busy}
                onClick={() => run({ [key]: null })}
                aria-label={`Apagar a propriedade ${key}`}
                className="p-1 rounded text-neutral-600 hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </dl>
      )}

      {adding ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={newKey}
            list="dt-known-keys"
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
            placeholder="nome (ex.: status)"
            aria-label="Nome da propriedade"
            className="w-36 bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-accent"
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addProperty();
              if (e.key === 'Escape') setAdding(false);
            }}
            placeholder="valor"
            aria-label="Valor da propriedade"
            className="flex-1 min-w-[8rem] bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={!newKey.trim() || busy}
            onClick={addProperty}
            className="min-h-[32px] px-3 rounded-lg bg-accent/15 border border-accent/40 text-sm text-white disabled:opacity-40"
          >
            Adicionar
          </button>
          <datalist id="dt-known-keys">
            {keySuggestions.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 min-h-[30px] text-xs text-neutral-400 hover:text-white"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar propriedade
        </button>
      )}

      {error && <p className="text-xs text-red-300">{error}</p>}
    </section>
  );
};

export default PropertiesPanel;
