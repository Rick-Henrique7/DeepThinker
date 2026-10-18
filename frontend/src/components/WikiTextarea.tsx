import React, { useMemo, useRef, useState } from 'react';
import { normalize, type NoteRef } from '../lib/notes';

interface WikiTextareaProps {
  value: string;
  onChange: (value: string) => void;
  titles: NoteRef[];
  /** Tags que já existem, para completar ao digitar #. */
  tags?: string[];
  rows?: number;
  className?: string;
  placeholder?: string;
}

/** O que está sendo completado agora: um [[link]] ou uma #tag, e o que já foi digitado dele. */
type Completion = { kind: 'link' | 'tag'; query: string } | null;

interface Option {
  key: string;
  label: string;
  insert: string;
}

/**
 * Caixa de texto com autocompletar, como no Obsidian:
 * - ao digitar [[ aparece a lista de notas; Enter ou Tab completa com [[Título]];
 * - ao digitar # aparece a lista de tags que você já usa.
 */
export const WikiTextarea: React.FC<WikiTextareaProps> = ({
  value,
  onChange,
  titles,
  tags = [],
  rows = 10,
  className = '',
  placeholder,
}) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [completion, setCompletion] = useState<Completion>(null);
  const [active, setActive] = useState(0);

  // O que foi digitado depois do último [[ ainda aberto (ou da última #), antes do cursor.
  const updateQuery = (el: HTMLTextAreaElement) => {
    const before = el.value.slice(0, el.selectionStart);
    const link = /\[\[([^\]\n|]*)$/.exec(before);
    const tag = link ? null : /(?:^|\s)#([\p{L}\p{N}_/-]*)$/u.exec(before);
    setCompletion(link ? { kind: 'link', query: link[1] } : tag ? { kind: 'tag', query: tag[1] } : null);
    setActive(0);
  };

  const options = useMemo<Option[]>(() => {
    if (!completion) return [];
    const q = normalize(completion.query);
    // Quem começa com o que você digitou aparece primeiro.
    const rank = <T,>(items: T[], text: (t: T) => string) =>
      items
        .map((t) => ({ t, n: normalize(text(t)) }))
        .filter(({ n }) => n.includes(q))
        .sort((a, b) => Number(b.n.startsWith(q)) - Number(a.n.startsWith(q)) || a.n.length - b.n.length)
        .slice(0, 8)
        .map(({ t }) => t);
    if (completion.kind === 'link') {
      return rank(titles, (t) => t.title).map((t) => ({ key: `n-${t.id}`, label: t.title, insert: t.title }));
    }
    return rank(tags, (t) => t)
      .filter((t) => t !== completion.query.toLowerCase())
      .map((t) => ({ key: `t-${t}`, label: `#${t}`, insert: t }));
  }, [completion, titles, tags]);

  const choose = (option: Option) => {
    const el = ref.current;
    if (!el || !completion) return;
    const caret = el.selectionStart;
    const start = caret - completion.query.length;
    const after = value.slice(caret);
    // Link fecha com ]]; tag ganha um espaço para seguir escrevendo.
    const closing = completion.kind === 'link' ? (after.startsWith(']]') ? '' : ']]') : after.startsWith(' ') ? '' : ' ';
    const next = value.slice(0, start) + option.insert + closing + after;
    onChange(next);
    setCompletion(null);
    const pos = start + option.insert.length + (completion.kind === 'link' ? 2 : 1);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!completion || options.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setCompletion(null);
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          updateQuery(e.target);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => updateQuery(e.currentTarget)}
        onBlur={() => setTimeout(() => setCompletion(null), 150)}
        className={className}
      />
      {completion && options.length > 0 && (
        <ul
          role="listbox"
          aria-label={completion.kind === 'link' ? 'Notas para ligar' : 'Tags'}
          className="absolute left-0 right-0 top-full mt-1 z-10 max-h-56 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl py-1"
        >
          <li className="px-3 py-1 text-[11px] uppercase tracking-wider text-neutral-500">
            {completion.kind === 'link' ? 'Ligar a uma nota' : 'Tags que você já usa'}
          </li>
          {options.map((o, i) => (
            <li key={o.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                className={`w-full text-left px-3 py-2 text-sm truncate ${
                  i === active ? 'bg-accent/15 text-white' : 'text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default WikiTextarea;
