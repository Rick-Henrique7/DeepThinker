import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Trash2,
  Save,
  FileText,
  MessageSquare,
  FileUp,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BookOpen,
  Pencil,
  Link2,
  Workflow,
  Loader2,
  CalendarDays,
  AlertTriangle,
  History,
  Network,
  LayoutDashboard,
  Users,
  KanbanSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  extractSection,
  findLinkedNote,
  normalize,
  notesApi,
  plainSnippet,
  notifyNotesChanged,
  parseWikiLink,
  splitFrontmatter,
  type Backlinks,
  type NoteDetail,
  type NoteRef,
  type Properties,
} from '../lib/notes';
import { TEMPLATES } from '../lib/templates';
import { api } from '../lib/api';
import { canvasApi, canvasFromNote } from '../lib/canvas';
import type { NodeItem, LinkItem } from './KnowledgeGraph';
import { NoteMarkdown } from './NoteMarkdown';
import { WikiTextarea } from './WikiTextarea';
import { LocalGraph } from './LocalGraph';
import { MermaidBlock } from './MermaidBlock';
import { PropertiesPanel } from './PropertiesPanel';
import { NoteHistory } from './NoteHistory';
import { setActiveNote } from '../lib/plugins';
import { boardApi } from '../lib/board';
import { insertDrawing, replaceDrawing } from '../lib/drawing';
import { editDrawing } from './DrawingBlock';


/** Modelo do botão "Inserir um gráfico": troque os nomes e números (vírgula decimal vale). */
const CHART_TEMPLATE = '```grafico\ntipo: colunas\ntítulo: Meu gráfico\nitem; valor\nA; 3\nB; 5,5\nC; 2\n```\n';

interface NoteDrawerProps {
  noteId: number | null;
  onClose: () => void;
  /** Salva título e texto. Devolvendo a nota salva, o painel mostra as tags e propriedades novas. */
  onUpdateNote: (id: number, title: string, content: string) => Promise<NoteDetail | void> | void;
  onDeleteNote: (id: number) => void;
  /** Abre outra nota no mesmo painel (clique num [[link]], backlink ou grafo local). */
  onOpenNote: (id: number) => void;
  /** Clique numa #tag: a tela mostra as notas com essa tag. */
  onOpenTag?: (tag: string) => void;
  /** Dados do grafo inteiro, para desenhar o grafo local sem outra chamada à API. */
  graphNodes?: NodeItem[];
  graphLinks?: LinkItem[];
}

type Mode = 'ler' | 'editar' | 'historico';
type DiagramKind = 'mindmap' | 'flowchart';

/**
 * Painel da nota, no estilo do Obsidian:
 * - "Ler": Markdown formatado, [[links]] clicáveis e diagramas Mermaid.
 * - "Editar": texto puro com autocompletar ao digitar [[ e modelos prontos.
 * Embaixo: backlinks (quem cita esta nota), menções sem link e o grafo local.
 */
export const NoteDrawer: React.FC<NoteDrawerProps> = ({
  noteId,
  onClose,
  onUpdateNote,
  onDeleteNote,
  onOpenNote,
  onOpenTag,
  graphNodes = [],
  graphLinks = [],
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [mode, setMode] = useState<Mode>('ler');
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [titles, setTitles] = useState<NoteRef[]>([]);
  const [backlinks, setBacklinks] = useState<Backlinks | null>(null);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [diagram, setDiagram] = useState<{ kind: DiagramKind; code?: string; error?: string; busy: boolean } | null>(null);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [propsBusy, setPropsBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restoredMsg, setRestoredMsg] = useState<string | null>(null);
  const [docMap, setDocMap] = useState<{ busy: boolean; error?: string } | null>(null);
  const [canvasBusy, setCanvasBusy] = useState(false);

  const loadBacklinks = useCallback(async (id: number) => {
    try {
      setBacklinks(await notesApi.backlinks(id));
    } catch (err) {
      console.error('Erro ao buscar backlinks:', err);
      setBacklinks({ linked: [], unlinked: [] });
    }
  }, []);

  // Busca o conteúdo completo da nota ao selecionar um nó do grafo
  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    setLoading(true);
    setSourceExpanded(false);
    setBacklinks(null);
    setDiagram(null);
    setSaveError(null);
    setRestoredMsg(null);
    setDocMap(null);
    (async () => {
      try {
        const [data, allTitles] = await Promise.all([notesApi.get(noteId), notesApi.titles()]);
        if (cancelled) return;
        setNote(data);
        setTitle(data.title || '');
        setContent(data.content || '');
        setTitles(allTitles);
        // Nota vazia abre direto no modo de edição.
        setMode(data.content?.trim() ? 'ler' : 'editar');
      } catch (err) {
        console.error('Erro ao buscar detalhes da nota:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    loadBacklinks(noteId);
    // Para sugerir tags (no painel e ao digitar #). Se falhar, só fica sem sugestão.
    notesApi
      .tags()
      .then((list) => !cancelled && setKnownTags(list.map((t) => t.tag)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [noteId, loadBacklinks]);

  const knownTitles = useMemo(() => new Set(titles.map((t) => normalize(t.title))), [titles]);
  const dirty = note !== null && (title !== note.title || content !== (note.content || ''));

  // Plugins (lib/plugins.ts): a nota aberta fica disponível para quem tem permissão.
  // insert só mexe no editor; quem grava é a pessoa, com o botão Salvar.
  const editorRef = useRef<HTMLDivElement | null>(null);
  const live = useRef({ noteId, title, content, note, mode });
  live.current = { noteId, title, content, note, mode };
  useEffect(() => {
    if (!noteId || !note) return;
    setActiveNote({
      get: () => {
        const l = live.current;
        return { id: noteId, title: l.title, content: l.content, tags: l.note?.tags ?? [], properties: l.note?.properties ?? {} };
      },
      insert: (text) => {
        const area = live.current.mode === 'editar' ? editorRef.current?.querySelector('textarea') : null;
        if (area) {
          // No editor aberto: entra onde está o cursor (ou no lugar do trecho selecionado)
          const start = area.selectionStart ?? area.value.length;
          const end = area.selectionEnd ?? start;
          setContent((c) => c.slice(0, start) + text + c.slice(end));
        } else {
          setMode('editar');
          setContent((c) => `${c.replace(/\s*$/, '')}${c.trim() ? '\n\n' : ''}${text}`);
        }
      },
    });
    return () => setActiveNote(null);
  }, [noteId, note]);

  if (!noteId) return null;

  /** Salva título e texto. Devolve false (e mostra o motivo) se o backend recusar. */
  const save = async (nextContent = content): Promise<boolean> => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = await onUpdateNote(noteId, title, nextContent);
      // A nota salva vem com as tags e propriedades recalculadas pelo backend.
      setNote((n) => (saved ? saved : n ? { ...n, title, content: nextContent } : n));
      setContent(nextContent);
      setMode('ler');
      loadBacklinks(noteId);
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Não deu para salvar a nota.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Mudança no painel de propriedades. Se há texto ainda não salvo, salva ele antes.
  const changeProperties = async (patch: Properties) => {
    setPropsBusy(true);
    try {
      if (dirty && !(await save())) return;
      const updated = await notesApi.setProperties(noteId, patch);
      setNote(updated);
      setContent(updated.content || '');
      notifyNotesChanged();
    } finally {
      setPropsBusy(false);
    }
  };

  // "Enviar para o Kanban" (entra na primeira coluna) ou "Tirar do Quadro" (apaga só o status).
  const toBoard = async (add: boolean) => {
    setPropsBusy(true);
    try {
      if (dirty && !(await save())) return;
      if (add) await boardApi.place(noteId);
      else await boardApi.remove(noteId);
      const updated = await notesApi.get(noteId);
      setNote(updated);
      setContent(updated.content || '');
      notifyNotesChanged();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Não deu para mudar o Quadro.');
    } finally {
      setPropsBusy(false);
    }
  };

  // Clique num [[link]]: abre a nota; se ela ainda não existe, cria vazia (como o Obsidian faz).
  const openTitle = async (target: string) => {
    const found = findLinkedNote(titles, target);
    if (found) {
      onOpenNote(found.id);
      return;
    }
    try {
      // [[Nota#Seção]] de uma nota que não existe cria a "Nota", sem o pedaço da seção.
      const created = await notesApi.create(parseWikiLink(target).note, '');
      notifyNotesChanged();
      onOpenNote(created.id);
    } catch (err) {
      console.error('Erro ao criar nota do link:', err);
    }
  };

  const linkMention = async (sourceId: number) => {
    setLinkingId(sourceId);
    try {
      await notesApi.linkMention(noteId, sourceId);
      notifyNotesChanged();
      await loadBacklinks(noteId);
    } catch (err) {
      console.error('Erro ao ligar menção:', err);
    } finally {
      setLinkingId(null);
    }
  };

  const makeDiagram = async (kind: DiagramKind) => {
    setDiagram({ kind, busy: true });
    try {
      // Se você mudou o texto e ainda não salvou, o diagrama usa o texto da tela.
      const r = dirty
        ? await notesApi.diagram({ text: `# ${title}\n\n${content}`, kind })
        : await notesApi.diagram({ note_id: noteId, kind });
      setDiagram({ kind, code: r.mermaid, busy: false });
    } catch (err) {
      setDiagram({ kind, busy: false, error: err instanceof Error ? err.message : 'Falha ao gerar o diagrama.' });
    }
  };

  const addDiagramToNote = async () => {
    if (!diagram?.code) return;
    const block = '\n\n## Diagrama\n\n```mermaid\n' + diagram.code + '\n```\n';
    if (await save(content.trimEnd() + block)) setDiagram(null);
  };

  /** Documento importado: a IA desenha o mapa mental e o servidor grava no topo da nota. */
  const drawDocumentMap = async () => {
    setDocMap({ busy: true });
    try {
      const updated = await notesApi.mindmap(noteId);
      setNote(updated);
      setTitle(updated.title);
      setContent(updated.content || '');
      setDocMap(null);
      setMode('ler');
      notifyNotesChanged();
    } catch (err) {
      setDocMap({ busy: false, error: err instanceof Error ? err.message : 'Falha ao desenhar o mapa mental.' });
    }
  };

  /**
   * "Abrir no Canvas": um canvas novo com esta nota no meio e as ligadas a ela em volta,
   * já com as setas. Usa o grafo que a tela já tem; se não tiver (ex.: dentro do Canvas), busca.
   */
  const openInCanvas = async () => {
    setCanvasBusy(true);
    setSaveError(null);
    try {
      let nodes = graphNodes;
      let links = graphLinks;
      if (!nodes.length) {
        const g = await api.get<{ nodes: NodeItem[]; links: LinkItem[] }>('/graph');
        nodes = g.nodes ?? [];
        links = g.links ?? [];
      }
      // O d3 troca source/target por objetos depois de desenhar o grafo; aqui só importa o id.
      const idOf = (v: number | NodeItem) => (typeof v === 'number' ? v : v.id);
      const pairs = links.map((l) => [idOf(l.source), idOf(l.target)] as [number, number]);
      const near = new Set<number>();
      pairs.forEach(([a, b]) => {
        if (a === noteId) near.add(b);
        if (b === noteId) near.add(a);
      });
      const neighbors = nodes.filter((n) => near.has(n.id)).slice(0, 16).map((n) => ({ id: n.id, title: n.title }));
      const keep = new Set([noteId, ...neighbors.map((n) => n.id)]);
      const data = canvasFromNote({ id: noteId, title }, neighbors, pairs.filter(([a, b]) => keep.has(a) && keep.has(b)));
      const created = await canvasApi.create(`Canvas: ${title}`, data);
      onClose();
      navigate(`/canvas/${created.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Não deu para criar o canvas.');
    } finally {
      setCanvasBusy(false);
    }
  };

  const source = note?.source_meta ?? null;
  const isConversation = note?.source_type === 'conversation';
  const isDocument = note?.source_type === 'document';
  const isDaily = note?.source_type === 'daily';
  const isHighlight = note?.source_type === 'highlight';
  const highlightDoc = isHighlight ? Number((source as { document_id?: unknown } | null)?.document_id) || null : null;
  // O mesmo critério do servidor: um título "## Mapa mental" fora de bloco de código.
  const hasDocMap = isDocument && extractSection(splitFrontmatter(note?.content || '').body, 'Mapa mental') !== null;

  const tabClass = (m: Mode) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
      mode === m ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-md flex justify-end transition-opacity"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Container do Drawer que desliza da direita */}
      <div className="w-full sm:max-w-md md:max-w-lg lg:max-w-xl bg-neutral-950 border-l border-neutral-900 h-full flex flex-col shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-4 sm:px-5 md:px-6 py-3 baixa:py-1">
          <div className="flex items-center gap-1 rounded-xl bg-neutral-900 p-1">
            <button type="button" className={tabClass('ler')} onClick={() => setMode('ler')}>
              <BookOpen className="w-4 h-4" /> Ler
            </button>
            <button type="button" className={tabClass('editar')} onClick={() => setMode('editar')}>
              <Pencil className="w-4 h-4" /> Editar
            </button>
            <button type="button" className={tabClass('historico')} onClick={() => setMode('historico')} title="Histórico de versões">
              <History className="w-4 h-4" /> <span className="hidden sm:inline">Histórico</span>
            </button>
          </div>
          <div className="flex items-center gap-2 text-neutral-500 text-xs">
            {isDaily ? <CalendarDays className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            <span>{isDaily ? 'Nota do dia' : `Nota #${noteId}`}</span>
            <button
              type="button"
              onClick={() => navigate(`/compartilhada/${noteId}`)}
              aria-label="Editar junto com outras pessoas"
              title="Editar junto (compartilhar)"
              className="flex items-center justify-center h-11 w-11 sm:h-8 sm:w-8 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800"
            >
              <Users className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              aria-label="Fechar nota"
              className="ml-1 p-2 text-neutral-400 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 md:px-6 py-4 space-y-5 baixa:py-2 baixa:space-y-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Origem da nota */}
              {(isConversation || isDocument) && (
                <SourceBadge
                  type={note!.source_type!}
                  meta={source}
                  expanded={sourceExpanded}
                  onToggle={() => setSourceExpanded((v) => !v)}
                  onJumpConversation={() => {
                    const sid = (source as { session_id?: string })?.session_id;
                    if (sid) {
                      navigate(`/advogado?session=${encodeURIComponent(sid)}`);
                      onClose();
                    }
                  }}
                />
              )}

              {mode === 'historico' && note ? (
                <div className="space-y-3">
                  <h1 className="text-xl font-semibold text-white leading-tight">{note.title}</h1>
                  {restoredMsg && (
                    <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                      {restoredMsg}
                    </p>
                  )}
                  <NoteHistory
                    noteId={noteId}
                    currentTitle={note.title}
                    currentContent={note.content || ''}
                    dirty={dirty}
                    onRestored={(restored, titleRestored) => {
                      setNote(restored);
                      setTitle(restored.title);
                      setContent(restored.content || '');
                      setRestoredMsg(
                        titleRestored
                          ? 'Versão restaurada. A nota de antes ficou guardada no histórico.'
                          : 'Texto restaurado. O título antigo já é de outra nota, então o título de agora continua.'
                      );
                      notifyNotesChanged();
                      loadBacklinks(noteId);
                    }}
                  />
                </div>
              ) : mode === 'ler' ? (
                <div className="space-y-3">
                  <h1 className="text-xl sm:text-2xl font-semibold text-white leading-tight">{title}</h1>
                  {note?.summary && (
                    <div className="text-sm text-neutral-400 leading-relaxed border-l-2 border-neutral-800 pl-3">
                      {note.summary}
                    </div>
                  )}
                  {note?.frontmatter_error ? (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        O cabeçalho entre as linhas <code>---</code> no topo da nota não está num formato válido, então as
                        propriedades não aparecem. Corrija no modo Editar (cada linha no formato <code>nome: valor</code>).
                      </span>
                    </div>
                  ) : (
                    <PropertiesPanel
                      tags={note?.tags ?? []}
                      properties={note?.properties ?? {}}
                      knownTags={knownTags}
                      busy={propsBusy}
                      onChange={changeProperties}
                      onOpenTag={(t) => onOpenTag?.(t)}
                    />
                  )}
                  {/* Quadro (Kanban): só entra quem a pessoa manda. Tirar não apaga a nota. */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    <KanbanSquare className="h-4 w-4" />
                    {note?.properties?.status ? (
                      <>
                        <span>
                          No Quadro, em <b className="text-neutral-300">{String(note.properties.status)}</b>
                        </span>
                        <button
                          type="button"
                          disabled={propsBusy}
                          onClick={() => toBoard(false)}
                          className="rounded-full border border-neutral-700 px-3 min-h-[44px] sm:min-h-[30px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                        >
                          Tirar do Quadro
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={propsBusy}
                        onClick={() => toBoard(true)}
                        className="rounded-full border border-neutral-700 px-3 min-h-[44px] sm:min-h-[30px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                      >
                        Enviar para o Kanban
                      </button>
                    )}
                  </div>
                  {splitFrontmatter(content).body.trim() ? (
                    <NoteMarkdown
                      content={content}
                      knownTitles={knownTitles}
                      onOpenTitle={openTitle}
                      onOpenTag={(t) => onOpenTag?.(t)}
                      embedStack={[normalize(title)]}
                      // Desenho editado no modo Ler: salva a nota na hora (vai para o histórico)
                      onChangeDrawing={(index, json) => save(replaceDrawing(content, index, json))}
                    />
                  ) : (
                    <p className="text-sm text-neutral-500">Nota vazia. Toque em Editar para escrever.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    aria-label="Título da nota"
                    className="w-full bg-neutral-950 text-white text-xl font-bold px-3 py-2 rounded-xl border border-neutral-800 focus:outline-none focus:border-accent transition-colors"
                    placeholder="Título da Nota..."
                  />
                  {!content.trim() && (
                    <div className="space-y-2">
                      <div className="text-xs text-neutral-500">Começar com um modelo:</div>
                      <div className="flex flex-wrap gap-2">
                        {TEMPLATES.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            title={t.description}
                            onClick={() => setContent(t.content)}
                            className="min-h-[36px] px-3 rounded-full border border-neutral-700 text-sm text-neutral-300 hover:text-white hover:border-neutral-500"
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={editorRef} data-note-editor>
                    <WikiTextarea
                      value={content}
                      onChange={setContent}
                      titles={titles.filter((t) => t.id !== noteId)}
                      tags={knownTags}
                      rows={14}
                      placeholder="Escreva em Markdown. Digite [[ para ligar a outra nota e # para uma tag."
                      className="w-full bg-neutral-950 text-neutral-200 p-3 rounded-xl border border-neutral-800 focus:outline-none focus:border-accent text-sm font-mono leading-relaxed resize-y"
                    />
                  </div>
                  <p className="text-xs text-neutral-500">
                    Dica: <code className="text-neutral-400"># Título</code>, <code className="text-neutral-400">**negrito**</code>,{' '}
                    <code className="text-neutral-400">- [ ] tarefa</code>, <code className="text-neutral-400">#tag</code> e blocos{' '}
                    <code className="text-neutral-400">```mermaid</code> e <code className="text-neutral-400">```grafico</code> viram
                    formatação e desenho no modo Ler. <code className="text-neutral-400">![[Nota]]</code> numa linha mostra a outra
                    nota aqui dentro. As linhas entre <code className="text-neutral-400">---</code> no topo são as propriedades.{' '}
                    <button
                      type="button"
                      onClick={() => setContent((c) => `${c.replace(/\s*$/, '')}${c.trim() ? '\n\n' : ''}${CHART_TEMPLATE}`)}
                      className="text-accent underline underline-offset-2"
                    >
                      Inserir um gráfico
                    </button>{' '}
                    ·{' '}
                    <button
                      type="button"
                      onClick={async () => {
                        // Guarda onde estava o cursor: o desenho entra ali quando salvar o editor
                        const area = editorRef.current?.querySelector('textarea');
                        // Cursor nunca posto (0) = fim do texto
                        const at = area && area.selectionStart > 0 ? area.selectionStart : undefined;
                        const json = await editDrawing();
                        if (json !== null) setContent((c) => insertDrawing(c, json, at));
                      }}
                      className="text-accent underline underline-offset-2"
                    >
                      Inserir um desenho
                    </button>
                  </p>
                </div>
              )}


              {/* No histórico, só o histórico: o resto (diagrama, grafo, backlinks) volta no Ler e no Editar. */}
              {mode !== 'historico' && (
              <>
              {/* Grifo de um documento: volta para o trecho no Leitor. */}
              {highlightDoc && (
                <button
                  type="button"
                  onClick={() => {
                    navigate(`/leitor/${highlightDoc}?destaque=${noteId}`);
                    onClose();
                  }}
                  className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-xl border border-neutral-800 text-sm text-neutral-300 hover:text-white hover:border-neutral-600"
                >
                  <BookOpen className="w-4 h-4" /> Ver no documento
                </button>
              )}

              {/* Mapa mental do documento (só para documentos importados) */}
              {isDocument && (
                <section className="space-y-1.5">
                  <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigate(`/leitor/${noteId}`);
                      onClose();
                    }}
                    className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-xl border border-neutral-800 text-sm text-neutral-300 hover:text-white hover:border-neutral-600"
                  >
                    <BookOpen className="w-4 h-4" /> Ler e grifar
                  </button>
                  <button
                    type="button"
                    onClick={drawDocumentMap}
                    disabled={docMap?.busy || dirty}
                    title={dirty ? 'Salve a nota antes: o mapa é gravado no texto salvo.' : undefined}
                    className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-xl border border-neutral-800 text-sm text-neutral-300 hover:text-white hover:border-neutral-600 disabled:opacity-40"
                  >
                    {docMap?.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Network className="w-4 h-4" />}
                    {docMap?.busy
                      ? 'Desenhando o mapa mental...'
                      : hasDocMap
                        ? 'Refazer o mapa mental do documento'
                        : 'Mapa mental do documento'}
                  </button>
                  </div>
                  {docMap?.error && <p className="text-sm text-red-300">{docMap.error}</p>}
                  {hasDocMap && !docMap && (
                    <p className="text-xs text-neutral-500">O mapa fica no topo da nota. O anterior vai para o Histórico.</p>
                  )}
                </section>
              )}

              {/* Transformar em diagrama */}
              <section className="space-y-2">
                {!diagram ? (
                  <button
                    type="button"
                    onClick={() => makeDiagram('mindmap')}
                    disabled={!content.trim()}
                    className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-xl border border-neutral-800 text-sm text-neutral-300 hover:text-white hover:border-neutral-600 disabled:opacity-40"
                  >
                    <Workflow className="w-4 h-4" />
                    Transformar em diagrama
                  </button>
                ) : (
                  <div className="rounded-xl border border-neutral-800 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs uppercase tracking-wider text-neutral-500">Diagrama pela IA</div>
                      <div className="flex gap-1 text-xs">
                        {(['mindmap', 'flowchart'] as DiagramKind[]).map((k) => (
                          <button
                            key={k}
                            type="button"
                            disabled={diagram.busy}
                            onClick={() => makeDiagram(k)}
                            className={`px-2.5 py-1 rounded-full border ${
                              diagram.kind === k ? 'border-accent text-white' : 'border-neutral-700 text-neutral-400'
                            }`}
                          >
                            {k === 'mindmap' ? 'Mapa mental' : 'Fluxograma'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {diagram.busy && (
                      <div className="flex items-center gap-2 text-sm text-neutral-400">
                        <Loader2 className="w-4 h-4 animate-spin" /> A IA está desenhando...
                      </div>
                    )}
                    {diagram.error && <p className="text-sm text-red-300">{diagram.error}</p>}
                    {diagram.code && <MermaidBlock code={diagram.code} />}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setDiagram(null)}
                        className="min-h-[36px] px-3 rounded-xl text-sm text-neutral-400 hover:text-white"
                      >
                        Descartar
                      </button>
                      <button
                        type="button"
                        disabled={!diagram.code || isSaving}
                        onClick={addDiagramToNote}
                        className="min-h-[36px] px-3 rounded-xl bg-accent/15 border border-accent/40 text-sm text-white disabled:opacity-40"
                      >
                        Adicionar à nota
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Grafo local */}
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Grafo local</h3>
                  <button
                    type="button"
                    onClick={openInCanvas}
                    disabled={canvasBusy}
                    title="Criar um canvas com esta nota e as ligadas a ela"
                    className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white disabled:opacity-50"
                  >
                    {canvasBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LayoutDashboard className="w-3.5 h-3.5" />}
                    Abrir no Canvas
                  </button>
                </div>
                <LocalGraph centerId={noteId} nodes={graphNodes} links={graphLinks} onOpen={onOpenNote} />
              </section>

              {/* Backlinks */}
              <section className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
                  Citam esta nota {backlinks ? `(${backlinks.linked.length})` : ''}
                </h3>
                {!backlinks ? (
                  <div className="h-10 rounded-xl bg-neutral-900/50 animate-pulse" />
                ) : backlinks.linked.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nenhuma nota tem um [[link]] para esta ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {backlinks.linked.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => onOpenNote(m.id)}
                          className="w-full text-left rounded-xl border border-neutral-800 px-3 py-2 hover:border-neutral-600"
                        >
                          <div className="text-sm font-medium text-white">{m.title}</div>
                          <div className="text-xs text-neutral-500 line-clamp-2">{plainSnippet(m.snippet)}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {backlinks && backlinks.unlinked.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h3 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
                      Mencionam sem link ({backlinks.unlinked.length})
                    </h3>
                    <ul className="space-y-2">
                      {backlinks.unlinked.map((m) => (
                        <li key={m.id} className="flex items-start gap-2 rounded-xl border border-dashed border-neutral-800 px-3 py-2">
                          <button type="button" onClick={() => onOpenNote(m.id)} className="flex-1 min-w-0 text-left">
                            <div className="text-sm font-medium text-neutral-200">{m.title}</div>
                            <div className="text-xs text-neutral-500 line-clamp-2">{plainSnippet(m.snippet)}</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => linkMention(m.id)}
                            disabled={linkingId === m.id}
                            title="Transformar esta menção em [[link]]"
                            className="flex-shrink-0 inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
                          >
                            {linkingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                            Ligar
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
              </>
              )}
            </>
          )}
        </div>

        {/* Rodapé com Botões de Ação */}
        {saveError && (
          <p role="alert" className="px-4 sm:px-5 md:px-6 pt-3 text-sm text-red-300 border-t border-neutral-800">
            {saveError}
          </p>
        )}
        <div className="px-4 sm:px-5 md:px-6 py-3 baixa:py-1 border-t border-neutral-800 flex items-center justify-between">
          <button
            onClick={() => onDeleteNote(noteId)}
            className="flex items-center gap-2 min-h-[44px] px-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors text-sm font-medium"
          >
            <Trash2 className="w-4 h-4" />
            Excluir
          </button>

          <button
            onClick={() => save()}
            disabled={isSaving || !dirty}
            className="flex items-center gap-2 min-h-[44px] px-5 bg-white hover:bg-neutral-200 text-black rounded-xl text-sm font-medium transition-all disabled:opacity-40"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Salvando...' : dirty ? 'Salvar' : 'Salvo'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface SourceBadgeProps {
  type: string;
  meta: Record<string, unknown> | null;
  expanded: boolean;
  onToggle: () => void;
  onJumpConversation: () => void;
}

const SourceBadge: React.FC<SourceBadgeProps> = ({ type, meta, expanded, onToggle, onJumpConversation }) => {
  const isConv = type === 'conversation';
  const Icon = isConv ? MessageSquare : FileUp;
  const label = isConv ? 'Conversa Advogado do Diabo' : 'Documento';

  const meta2 = (meta ?? {}) as Record<string, unknown>;
  const sessionId = (meta2.session_id as string) || null;
  const mode = (meta2.mode as string) || null;
  const userMsgs = (meta2.user_messages as number) ?? null;
  const asstMsgs = (meta2.assistant_messages as number) ?? null;
  const filename = (meta2.filename as string) || null;
  const chars = (meta2.extracted_chars as number) ?? null;
  const provider = (meta2.provider as string) || null;
  const model = (meta2.model as string) || null;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-neutral-300 hover:bg-neutral-900"
      >
        <Icon className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" strokeWidth={1.75} />
        <span className="font-medium text-neutral-200">{label}</span>
        {isConv && (
          <span className="text-neutral-500 truncate">
            · modo {mode ?? 'socratic'} · {(userMsgs ?? 0) + (asstMsgs ?? 0)} msgs
          </span>
        )}
        {!isConv && filename && (
          <span className="text-neutral-500 truncate">· {filename}</span>
        )}
        <span className="ml-auto text-neutral-500">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-neutral-800 text-xs text-neutral-400 space-y-1">
          {isConv && (
            <>
              <Row k="Modo" v={mode ?? 'socratic'} />
              <Row k="Mensagens" v={`${userMsgs ?? 0} suas · ${asstMsgs ?? 0} do Advogado`} />
              {provider && <Row k="Provider" v={`${provider}${model ? ' · ' + model : ''}`} />}
              {sessionId && <Row k="Sessao" v={sessionId.slice(0, 8) + '...'} />}
            </>
          )}
          {!isConv && (
            <>
              {filename && <Row k="Arquivo" v={filename} />}
              {chars != null && <Row k="Caracteres" v={chars.toLocaleString('pt-BR')} />}
              {Boolean(meta2.mime) && <Row k="Tipo" v={String(meta2.mime)} />}
            </>
          )}
          {isConv && sessionId && (
            <button
              type="button"
              onClick={onJumpConversation}
              className="mt-2 inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-xs font-medium"
            >
              <ExternalLink className="h-3 w-3" />
              Abrir conversa original
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex items-baseline gap-2">
    <span className="text-neutral-500 uppercase tracking-wider text-[10px]">{k}</span>
    <span className="text-neutral-300">{v}</span>
  </div>
);

export default NoteDrawer;
