import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { KnowledgeGraph, NodeItem, LinkItem } from '../components/KnowledgeGraph';
import { NoteDrawer } from '../components/NoteDrawer';
import { api } from '../lib/api';

export function GraphPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);

  const fetchGraphData = async () => {
    try {
      const data = await api.get<{ nodes: NodeItem[]; links: LinkItem[] }>('/graph');
      setNodes(data.nodes || []);
      setLinks(data.links || []);
    } catch (err) {
      console.error('Erro ao buscar grafo:', err);
    }
  };

  useEffect(() => {
    fetchGraphData();
  }, []);

  // Suporte a ?focus=ID vindo do Advogado (tool result criou uma nota)
  useEffect(() => {
    const focus = searchParams.get('focus');
    if (focus) {
      const id = Number(focus);
      if (Number.isFinite(id) && id > 0) {
        setSelectedNoteId(id);
        // limpa o param pra nao re-abrir em F5
        setSearchParams({}, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleUpdateNote = async (id: number, title: string, content: string) => {
    try {
      await api.put(`/notes/${id}`, { title, content });
      await fetchGraphData();
    } catch (err) {
      console.error('Erro ao atualizar nota:', err);
    }
  };

  const handleDeleteNote = async (id: number) => {
    if (!confirm('Deseja realmente excluir esta nota?')) return;
    try {
      await api.delete(`/notes/${id}`);
      setSelectedNoteId(null);
      await fetchGraphData();
    } catch (err) {
      console.error('Erro ao excluir nota:', err);
    }
  };

  return (
    <div className="max-w-2xl md:max-w-4xl lg:max-w-6xl mx-auto space-y-3 sm:space-y-5">
      <div className="space-y-2">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium px-1">
          Grafo de Conhecimento
        </h2>
        <KnowledgeGraph
          nodes={nodes}
          links={links}
          onSelectNode={(node) => setSelectedNoteId(node.id)}
        />
      </div>

      <NoteDrawer
        noteId={selectedNoteId}
        onClose={() => setSelectedNoteId(null)}
        onUpdateNote={handleUpdateNote}
        onDeleteNote={handleDeleteNote}
      />
    </div>
  );
}

export default GraphPage;
