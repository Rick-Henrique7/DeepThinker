import React, { useEffect, useState } from 'react';
import { KnowledgeGraph, NodeItem, LinkItem } from '../components/KnowledgeGraph';
import { NoteDrawer } from '../components/NoteDrawer';
import { api } from '../lib/api';

export function GraphPage() {
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
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
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
