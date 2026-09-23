import React, { useState, useEffect } from 'react';
import {
  X,
  Trash2,
  Save,
  FileText,
  Sparkles,
  MessageSquare,
  FileUp,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';

interface Note {
  id: number;
  title: string;
  content: string;
  summary?: string | null;
  source_type?: string | null;
  source_meta?: Record<string, unknown> | null;
  created_at?: string;
}

interface NoteDrawerProps {
  noteId: number | null;
  onClose: () => void;
  onUpdateNote: (id: number, title: string, content: string) => void;
  onDeleteNote: (id: number) => void;
}

export const NoteDrawer: React.FC<NoteDrawerProps> = ({
  noteId,
  onClose,
  onUpdateNote,
  onDeleteNote,
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [note, setNote] = useState<Note | null>(null);
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Busca o conteúdo completo da nota ao selecionar um nó do grafo
  useEffect(() => {
    if (!noteId) return;

    const fetchNoteDetail = async () => {
      setLoading(true);
      setSourceExpanded(false);
      try {
        const data = await api.get<Note>(`/notes/${noteId}`);
        setNote(data);
        setTitle(data.title || '');
        setContent(data.content || '');
      } catch (err) {
        console.error('Erro ao buscar detalhes da nota:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchNoteDetail();
  }, [noteId]);

  if (!noteId) return null;

  const handleSave = async () => {
    setIsSaving(true);
    await onUpdateNote(noteId, title, content);
    setIsSaving(false);
  };

  // Função para renderizar links [[Exemplo]] destacados no texto
  const renderFormattedContent = (text: string) => {
    const parts = text.split(/(\[\[.*?\]\])/g);
    return parts.map((part, index) => {
      if (part.startsWith('[[') && part.endsWith(']]')) {
        const linkTitle = part.slice(2, -2);
        return (
          <span
            key={index}
            className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 my-0.5 cursor-pointer hover:underline"
          >
            <Sparkles className="w-3 h-3" />
            {linkTitle}
          </span>
        );
      }
      return part;
    });
  };

  const source = note?.source_meta ?? null;
  const isConversation = note?.source_type === 'conversation';
  const isDocument = note?.source_type === 'document';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-md flex justify-end transition-opacity">
      {/* Container do Drawer que desliza da direita */}
      <div className="w-full sm:max-w-md md:max-w-lg bg-neutral-950 border-l border-neutral-900 h-full p-4 sm:p-5 md:p-6 flex flex-col shadow-2xl justify-between overflow-y-auto">
        {/* Cabeçalho */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
            <div className="flex items-center gap-2 text-neutral-400 text-sm font-medium">
              <FileText className="w-4 h-4" />
              <span>Nota #{noteId}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
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

              {/* Edição de Título */}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-neutral-950 text-white text-xl font-bold px-3 py-2 rounded-xl border border-neutral-800 focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="Título da Nota..."
              />

              {/* Resumo (se existir) */}
              {note?.summary && (
                <div className="text-sm text-neutral-400 leading-relaxed px-1 border-l-2 border-neutral-800 pl-3">
                  {note.summary}
                </div>
              )}

              {/* Destaque das Conexões Encontradas */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800/80 text-sm leading-relaxed text-neutral-300 min-h-[100px]">
                <div className="text-xs text-neutral-500 mb-2 font-medium">
                  PRE-VISUALIZACAO DAS CONEXOES:
                </div>
                {renderFormattedContent(content || 'Sem conteudo...')}
              </div>

              {/* Editor de Conteúdo Raw */}
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Conteudo Markdown:
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  className="w-full bg-neutral-950 text-neutral-200 p-3 rounded-xl border border-neutral-800 focus:outline-none focus:border-emerald-500 text-sm font-mono leading-relaxed resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Botões de Ação */}
        <div className="pt-4 border-t border-neutral-800 flex items-center justify-between">
          <button
            onClick={() => onDeleteNote(noteId)}
            className="flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors text-sm font-medium"
          >
            <Trash2 className="w-4 h-4" />
            Excluir Nota
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 bg-white hover:bg-neutral-200 text-black rounded-xl text-sm font-medium transition-all shadow-lg shadow-white/10"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Salvando...' : 'Salvar Alteracoes'}
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
