import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import {
  NOTES_CHANGED_EVENT,
  extractSection,
  findLinkedNote,
  normalize,
  parseWikiLink,
  splitFrontmatter,
  type NoteDetail,
} from '../lib/notes';
import { cachedNote, cachedTitles } from '../lib/noteCache';
import { NoteMarkdown } from './NoteMarkdown';

/** Até 2 níveis: uma nota dentro de outra dentro de outra. Mais que isso vira só um link. */
const MAX_DEPTH = 2;

interface NoteEmbedProps {
  /** O que estava entre ![[ e ]]: "Nota" ou "Nota#Seção". */
  target: string;
  /** Títulos (normalizados) das notas que já estão abertas por fora, da mais externa para a mais interna. */
  stack: string[];
  knownTitles?: Set<string>;
  onOpenTitle?: (title: string) => void;
  onOpenTag?: (tag: string) => void;
}

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ok'; note: NoteDetail; heading: string | null };

/**
 * ![[Nota]]: mostra a outra nota aqui dentro, como no Obsidian. É uma "janela": o texto continua
 * morando na nota original, então editar lá muda aqui também. ![[Nota#Seção]] mostra só aquela seção.
 *
 * Dois cuidados:
 * - ciclo: se A embute B e B embute A, sem proteção isso seria infinito. Por isso cada nível
 *   recebe a lista (stack) de quem já está aberto por fora e para se a nota já estiver nela;
 * - profundidade: no máximo 2 níveis, para a nota continuar legível.
 */
export const NoteEmbed: React.FC<NoteEmbedProps> = ({ target, stack, knownTitles, onOpenTitle, onOpenTag }) => {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  // Se alguma nota mudar (inclusive a embutida), busca de novo.
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(NOTES_CHANGED_EVENT, bump);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, bump);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const titles = await cachedTitles();
        const ref = findLinkedNote(titles, target);
        if (!ref) {
          if (!cancelled) setState({ status: 'missing' });
          return;
        }
        const note = await cachedNote(ref.id);
        // "C# na prática" é o título inteiro (sem seção); "Nota#Prós" é a nota "Nota", seção "Prós".
        const heading = normalize(ref.title) === normalize(target) ? null : parseWikiLink(target).heading;
        if (!cancelled) setState({ status: 'ok', note, heading });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'erro' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, version]);

  const { label, note: noteName } = parseWikiLink(target);
  const open = () => onOpenTitle?.(target);
  const frame = 'my-3 rounded-xl border border-neutral-800 border-l-2 border-l-[rgb(var(--accent)/0.6)] bg-neutral-900/40';

  const header = (title: string) => (
    <button
      type="button"
      onClick={open}
      title={`Abrir "${title}"`}
      className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-white"
    >
      <FileText className="w-3.5 h-3.5" />
      {title}
    </button>
  );

  if (state.status === 'loading') return <div className={`${frame} h-16 animate-pulse`} />;

  if (state.status === 'missing') {
    return (
      <div className={`${frame} px-4 py-3 text-sm text-neutral-400`}>
        A nota "{noteName}" ainda não existe.{' '}
        <button type="button" onClick={open} className="text-accent underline underline-offset-2">
          Criar agora
        </button>
      </div>
    );
  }

  if (state.status === 'error') {
    return <div className={`${frame} px-4 py-3 text-sm text-neutral-400`}>Não deu para abrir "{label}": {state.message}</div>;
  }

  const { note, heading } = state;
  const key = normalize(note.title);
  const title = heading ? `${note.title} › ${heading}` : note.title;
  if (stack.includes(key)) {
    return (
      <div className={`${frame} px-4 py-3 space-y-1`}>
        {header(title)}
        <p className="text-sm text-neutral-500">Esta nota já aparece aqui por fora; mostrar de novo faria um ciclo sem fim.</p>
      </div>
    );
  }
  if (stack.length > MAX_DEPTH) {
    return <div className={`${frame} px-4 py-3`}>{header(title)}</div>;
  }

  const body = splitFrontmatter(note.content ?? '').body;
  const section = heading ? extractSection(body, heading) : body;
  return (
    <div className={`${frame} px-4 py-3 space-y-2`}>
      {header(title)}
      {section === null ? (
        <p className="text-sm text-neutral-500">Não achei a seção "{heading}" nessa nota.</p>
      ) : section.trim() ? (
        <div className="max-h-[28rem] overflow-y-auto">
          <NoteMarkdown
            content={section}
            knownTitles={knownTitles}
            onOpenTitle={onOpenTitle}
            onOpenTag={onOpenTag}
            embedStack={[...stack, key]}
          />
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Nota vazia.</p>
      )}
    </div>
  );
};

export default NoteEmbed;
