import { replaceDrawing } from '../../lib/drawing';
import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, Globe, Plus } from 'lucide-react';
import {
  NOTES_CHANGED_EVENT,
  extractSection,
  findLinkedNote,
  notesApi,
  notifyNotesChanged,
  splitFrontmatter,
  type NoteDetail,
  type NoteRef,
} from '../../lib/notes';
import { cachedNote } from '../../lib/noteCache';
import { fileTitle, type FileNode, type LinkNode, type TextNode } from '../../lib/canvas';
import { NoteMarkdown } from '../NoteMarkdown';

/** O que os cartões precisam saber das notas (vem da página do Canvas). */
export interface NotesContext {
  titles: NoteRef[];
  knownTitles: Set<string>;
  onOpenTitle: (title: string) => void;
  onOpenTag: (tag: string) => void;
}

/** O texto some embaixo com um degradê quando não cabe no cartão (em vez de cortar seco). */
const FADE = '[mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]';

// ------------------------------------------------------------------ texto

interface TextBodyProps {
  node: TextNode;
  editing: boolean;
  notes: NotesContext;
  onDone: (text: string) => void;
}

/** Cartão de texto: Markdown formatado; com dois cliques (ou "Editar") vira uma caixa de texto. */
export const TextBody: React.FC<TextBodyProps> = ({ node, editing, notes, onDone }) => {
  const [draft, setDraft] = useState(node.text);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(node.text);
      // O foco vai para o fim do texto, como quem continua escrevendo.
      requestAnimationFrame(() => {
        const el = area.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    }
  }, [editing, node.text]);

  if (editing) {
    return (
      <textarea
        ref={area}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onDone(draft)}
        onKeyDown={(e) => {
          // Esc ou Ctrl+Enter terminam a edição; o resto das teclas é do texto.
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
          e.stopPropagation();
        }}
        aria-label="Texto do cartão"
        placeholder="Escreva aqui. Dá para usar Markdown e [[links]]."
        className="block w-full h-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-600"
      />
    );
  }
  if (!node.text.trim()) {
    return <p className="px-4 py-3 text-sm text-neutral-600">Cartão vazio. Dois cliques para escrever.</p>;
  }
  return (
    <div className={`h-full overflow-hidden px-4 py-3 text-sm ${FADE}`}>
      <NoteMarkdown
        content={node.text}
        knownTitles={notes.knownTitles}
        onOpenTitle={notes.onOpenTitle}
        onOpenTag={notes.onOpenTag}
        onChangeDrawing={(index, json) => onDone(replaceDrawing(node.text, index, json))}
      />
    </div>
  );
};

// ------------------------------------------------------------------ nota

/** Cartão de nota: o título e o texto da nota de verdade (mudou a nota, muda aqui). */
export const FileBody: React.FC<{ node: FileNode; notes: NotesContext }> = ({ node, notes }) => {
  const title = fileTitle(node.file);
  const ref = findLinkedNote(notes.titles, title);
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(NOTES_CHANGED_EVENT, bump);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, bump);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!ref) {
      setNote(null);
      return;
    }
    cachedNote(ref.id)
      .then((n) => !cancelled && setNote(n))
      .catch(() => !cancelled && setNote(null));
    return () => {
      cancelled = true;
    };
  }, [ref?.id, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = (
    <div className="flex items-center gap-1.5 border-b border-neutral-800 px-4 py-2">
      <FileText className="w-4 h-4 flex-shrink-0 text-neutral-500" />
      <button
        type="button"
        onClick={() => notes.onOpenTitle(title)}
        className="min-w-0 truncate text-left text-sm font-semibold text-white hover:underline underline-offset-2"
        title={`Abrir "${title}"`}
      >
        {title}
        {node.subpath && <span className="font-normal text-neutral-500"> › {node.subpath.replace(/^#/, '')}</span>}
      </button>
    </div>
  );

  if (!ref) {
    const create = async () => {
      setCreating(true);
      try {
        await notesApi.create(title, '');
        notifyNotesChanged();
      } finally {
        setCreating(false);
      }
    };
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="px-4 py-3 text-sm text-neutral-400 space-y-2">
          <p>Não existe uma nota com esse título.</p>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={create}
            disabled={creating}
            className="inline-flex items-center gap-1 text-accent underline underline-offset-2 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Criar a nota
          </button>
        </div>
      </div>
    );
  }

  const body = splitFrontmatter(note?.content ?? '').body;
  const shown = node.subpath ? extractSection(body, node.subpath.replace(/^#/, '')) ?? '' : body;
  return (
    <div className="flex h-full flex-col">
      {header}
      <div className={`flex-1 min-h-0 overflow-hidden px-4 py-3 text-sm ${FADE}`}>
        {!note ? (
          <div className="h-10 rounded-lg bg-neutral-800/60 animate-pulse" />
        ) : shown.trim() ? (
          <NoteMarkdown
            content={shown}
            knownTitles={notes.knownTitles}
            onOpenTitle={notes.onOpenTitle}
            onOpenTag={notes.onOpenTag}
            embedStack={[]}
          />
        ) : (
          <p className="text-neutral-600">Nota vazia.</p>
        )}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ link

/**
 * Cartão de link. O Obsidian mostra o site dentro do cartão (iframe), mas muitos sites
 * bloqueiam isso e um site embutido roda código dele aqui dentro. Então mostramos o endereço
 * e um botão para abrir numa aba nova, que é mais seguro.
 */
export const LinkBody: React.FC<{ node: LinkNode }> = ({ node }) => {
  let host = node.url;
  let rest = '';
  try {
    const u = new URL(node.url);
    host = u.hostname.replace(/^www\./, '');
    rest = (u.pathname + u.search).replace(/^\/$/, '');
  } catch {
    // endereço estranho: mostra como veio
  }
  return (
    <div className="flex h-full flex-col justify-center gap-1 px-4 py-3 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <Globe className="w-4 h-4 flex-shrink-0 text-neutral-500" />
        <span className="truncate text-sm font-semibold text-white">{host}</span>
      </div>
      {rest && <p className="truncate text-xs text-neutral-500">{rest}</p>}
      <a
        href={node.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex w-fit items-center gap-1 text-xs text-accent underline underline-offset-2"
      >
        Abrir o site <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
};
