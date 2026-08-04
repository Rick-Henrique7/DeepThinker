import React, { useState, useEffect } from 'react';
import { X, Trash2, Save, FileText, Sparkles, ExternalLink } from 'lucide-react';

interface Note {
  id: number;
  title: string;
  content: string;
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
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Busca o conteúdo completo da nota ao selecionar um nó do grafo
  useEffect(() => {
    if (!noteId) return;

    const fetchNoteDetail = async () => {
      setLoading(true);
      try {
        const response = await fetch(`http://localhost/api/notes/${noteId}`);
        if (response.ok) {
          const data = await response.json();
          setTitle(data.title || '');
          setContent(data.content || '');
        }
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
            className="inline-flex items-center gap-1 text-indigo-400 font-semibold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/30 my-0.5 cursor-pointer hover:underline"
          >
            <Sparkles className="w-3 h-3" />
            {linkTitle}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-sm flex justify-end transition-opacity animate-fade-in">
      {/* Container do Drawer que desliza da direita */}
      <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 h-full p-6 flex flex-col shadow-2xl justify-between overflow-y-auto">
        {/* Cabeçalho */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2 text-indigo-400 text-sm font-medium">
              <FileText className="w-4 h-4" />
              <span>Nota #{noteId}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Edição de Título */}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-950 text-slate-100 text-xl font-bold px-3 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="Título da Nota..."
              />

              {/* Destaque das Conexões Encontradas */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-sm leading-relaxed text-slate-300 min-h-[100px]">
                <div className="text-xs text-slate-500 mb-2 font-medium">
                  PRÉ-VISUALIZAÇÃO DAS CONEXÕES:
                </div>
                {renderFormattedContent(content || 'Sem conteúdo...')}
              </div>

              {/* Editor de Conteúdo Raw */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Conteúdo Markdown:
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  className="w-full bg-slate-950 text-slate-200 p-3 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 text-sm font-mono leading-relaxed resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Botões de Ação */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
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
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-600/25"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
};