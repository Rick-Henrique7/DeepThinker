import React, { useState, useEffect } from 'react';
import { ThoughtInput } from './components/ThoughtInput';
import { KnowledgeGraph, NodeItem, LinkItem } from './components/KnowledgeGraph';
import { NoteDrawer } from './components/NoteDrawer';

export function App() {
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);

  // Busca dados atualizados do Grafo do Laravel
  const fetchGraphData = async () => {
    try {
      const response = await fetch('http://localhost/api/graph');
      if (response.ok) {
        const data = await response.json();
        setNodes(data.nodes || []);
        setLinks(data.links || []);
      }
    } catch (err) {
      console.error('Erro ao buscar grafo:', err);
    }
  };

  useEffect(() => {
    fetchGraphData();
  }, []);

  const handleUpdateNote = async (id: number, title: string, content: string) => {
    try {
      const response = await fetch(`http://localhost/api/notes/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, content }),
      });

      if (response.ok) {
        await fetchGraphData();
      }
    } catch (err) {
      console.error('Erro ao atualizar nota:', err);
    }
  };

  const handleDeleteNote = async (id: number) => {
    if (!confirm('Deseja realmente excluir esta nota?')) return;

    try {
      const response = await fetch(`http://localhost/api/notes/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSelectedNoteId(null);
        await fetchGraphData();
      }
    } catch (err) {
      console.error('Erro ao excluir nota:', err);
    }
  };

  const handleSaveThought = async (title: string, content: string) => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ title, content }),
      });

      if (response.ok) {
        // Atualiza o Grafo imediatamente após a inclusão!
        await fetchGraphData();
      } else {
        alert('Erro ao salvar no servidor Laravel.');
      }
    } catch (err) {
      console.error('Erro de conexão:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <header className="mb-6 text-center space-y-1">
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
          DeepThinker
        </h1>
        <p className="text-slate-400 text-xs">
          Segundo Cérebro • Visualizador de Grafo Interativo
        </p>
      </header>

      <main className="max-w-6xl mx-auto space-y-6">
        {/* Caixa de Entrada com Reconhecimento de Voz */}
        <ThoughtInput onSubmitThought={handleSaveThought} isLoading={loading} />

        {/* Visualizador do Grafo com D3.js */}
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
      </main>

      {/* Drawer com Detalhes da Nota ao clicar no Nó */}
      <NoteDrawer
        noteId={selectedNoteId}
        onClose={() => setSelectedNoteId(null)}
        onUpdateNote={handleUpdateNote}
        onDeleteNote={handleDeleteNote}
      />
    </div>
  );
}

export default App;