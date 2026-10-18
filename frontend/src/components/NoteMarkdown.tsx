import React, { useMemo } from 'react';
import ReactMarkdown, { type Components, defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EMBED_LANG, TAG_HREF, WIKI_HREF, normalize, parseWikiLink, splitFrontmatter, wikiToMarkdown } from '../lib/notes';
import { MermaidBlock } from './MermaidBlock';
import { NoteChart } from './charts/NoteChart';
import { NoteEmbed } from './NoteEmbed';
import { DrawingBlock } from './DrawingBlock';
import { DRAWING_LANG } from '../lib/drawing';

/** Blocos de código que viram desenho (e por isso não ganham a caixa de código em volta). */
const DRAWN = ['mermaid', 'grafico', 'gráfico', 'chart', EMBED_LANG, DRAWING_LANG];

interface NoteMarkdownProps {
  content: string;
  /** Títulos que existem, para pintar links quebrados (nota ainda não criada) de outro jeito. */
  knownTitles?: Set<string>;
  /** Clique num [[link]]: recebe o título da nota. */
  onOpenTitle?: (title: string) => void;
  /** Clique numa #tag. */
  onOpenTag?: (tag: string) => void;
  /**
   * Títulos (normalizados) das notas abertas "por fora": a nota da gaveta e, dentro de uma nota
   * embutida, as de cima. Serve para o ![[Nota]] não entrar em ciclo (ver NoteEmbed).
   */
  embedStack?: string[];
  /**
   * Desenho (```excalidraw) editado: recebe qual (0 = o primeiro do texto) e o JSON novo.
   * Sem isto, o desenho aparece só para ver (ex.: no histórico de versões).
   */
  onChangeDrawing?: (index: number, json: string) => void;
}

/**
 * Mostra a nota formatada: títulos, listas, negrito, tabelas e tarefas (remark-gfm),
 * links [[...]] clicáveis e blocos ```mermaid como diagramas.
 *
 * Como funciona o react-markdown: ele lê o texto e monta uma árvore (títulos, parágrafos, links...).
 * Em "components" dizemos como desenhar alguns tipos de nó com os nossos componentes React.
 */
export const NoteMarkdown: React.FC<NoteMarkdownProps> = ({ content, knownTitles, onOpenTitle, onOpenTag, embedStack = [], onChangeDrawing }) => {
  // O cabeçalho --- (propriedades) não aparece no texto: o painel de propriedades mostra ele.
  const source = useMemo(() => wikiToMarkdown(splitFrontmatter(content).body), [content]);

  // Os blocos são desenhados na ordem do texto: o contador diz qual desenho é qual.
  let drawingIndex = 0;

  const components: Components = {
    a: ({ href, children }) => {
      if (href?.startsWith(TAG_HREF)) {
        const tag = decodeURIComponent(href.slice(TAG_HREF.length));
        return (
          <button
            type="button"
            onClick={() => onOpenTag?.(tag)}
            title={`Ver as notas com #${tag}`}
            className="tag-chip"
          >
            {children}
          </button>
        );
      }
      if (href?.startsWith(WIKI_HREF)) {
        const title = decodeURIComponent(href.slice(WIKI_HREF.length));
        const exists =
          !knownTitles || knownTitles.has(normalize(title)) || knownTitles.has(normalize(parseWikiLink(title).note));
        return (
          <button
            type="button"
            onClick={() => onOpenTitle?.(title)}
            title={exists ? `Abrir "${title}"` : `"${title}" ainda não existe. Clique para criar.`}
            className={
              exists
                ? 'text-accent font-medium underline decoration-accent/40 underline-offset-2 hover:decoration-accent'
                : 'text-neutral-400 underline decoration-dashed decoration-neutral-600 underline-offset-2 hover:text-neutral-200'
            }
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer noopener" className="text-accent underline underline-offset-2">
          {children}
        </a>
      );
    },
    // ```mermaid, ```grafico e ```chart viram desenho, então não queremos a caixa de código (<pre>) em volta.
    pre: ({ node, children }) => {
      const first = node?.children?.[0];
      const cls = first && 'properties' in first ? String(first.properties?.className ?? '') : '';
      return DRAWN.some((l) => cls.includes(`language-${l}`)) ? <>{children}</> : <pre>{children}</pre>;
    },
    code: ({ className, children }) => {
      const lang = /language-([\p{L}\w-]+)/u.exec(className ?? '')?.[1];
      const text = String(children ?? '');
      if (lang === 'mermaid') return <MermaidBlock code={text} />;
      if (lang === DRAWING_LANG) {
        const index = drawingIndex++;
        return <DrawingBlock code={text.trim()} onChange={onChangeDrawing && ((json) => onChangeDrawing(index, json))} />;
      }
      if (lang === 'grafico' || lang === 'gráfico') return <NoteChart code={text.replace(/\n$/, '')} format="grafico" />;
      if (lang === 'chart') return <NoteChart code={text.replace(/\n$/, '')} format="chart" />;
      if (lang === EMBED_LANG) {
        return (
          <NoteEmbed
            target={text.trim()}
            stack={embedStack}
            knownTitles={knownTitles}
            onOpenTitle={onOpenTitle}
            onOpenTag={onOpenTag}
          />
        );
      }
      return <code className={className}>{children}</code>;
    },
  };

  return (
    <div className="note-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        // Por segurança o react-markdown apaga links com "protocolos" estranhos; o nosso #wiki: é liberado aqui.
        urlTransform={(url) => (url.startsWith(WIKI_HREF) ? url : defaultUrlTransform(url))}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
};

export default NoteMarkdown;
