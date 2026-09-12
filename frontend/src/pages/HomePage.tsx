import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Network, ArrowRight } from 'lucide-react';
import { ThoughtInput } from '../components/ThoughtInput';
import { api } from '../lib/api';

export function HomePage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSaveThought = async (title: string, content: string) => {
    setLoading(true);
    try {
      await api.post('/notes', { title, content });
      navigate('/grafo');
    } catch (err) {
      alert('Erro ao salvar no servidor Laravel.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="w-full max-w-3xl mx-auto">
        <Link
          to="/grafo"
          className="group flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 sm:p-5 transition-all hover:border-indigo-500/50 hover:bg-slate-900"
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
              <Network className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-200">Grafo de Conhecimento</div>
              <div className="text-xs text-slate-500">Visualize todas as notas conectadas em um grafo interativo</div>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-indigo-400" />
        </Link>
      </div>

      <ThoughtInput onSubmitThought={handleSaveThought} isLoading={loading} />
    </div>
  );
}

export default HomePage;
