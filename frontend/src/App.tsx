import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Network, House, MessageSquare } from 'lucide-react';
import { HomePage } from './pages/HomePage';
import { GraphPage } from './pages/GraphPage';
import { DevilsAdvocateSidebar } from './components/DevilsAdvocateSidebar';

// Ícone fixo no canto superior direito para navegar entre as páginas
function TopRightNav() {
  const location = useLocation();
  const isGraphPage = location.pathname === '/grafo';

  return (
    <Link
      to={isGraphPage ? '/' : '/grafo'}
      title={isGraphPage ? 'Voltar ao Início' : 'Grafo de Conhecimento'}
      aria-label={isGraphPage ? 'Voltar ao Início' : 'Abrir Grafo de Conhecimento'}
      className="fixed top-4 right-4 sm:top-5 sm:right-5 z-[60] flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/80 text-slate-300 shadow-xl shadow-black/40 backdrop-blur transition-all hover:scale-105 hover:border-indigo-500/60 hover:text-indigo-300"
    >
      {isGraphPage ? <House className="h-5 w-5" /> : <Network className="h-5 w-5" />}
    </Link>
  );
}

// Botão flutuante do Advogado do Diabo (canto inferior direito)
function DevilsAdvocateButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Abrir Advogado do Diabo"
      aria-label="Abrir Advogado do Diabo"
      className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-[60] flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-2xl shadow-indigo-600/40 backdrop-blur transition-all hover:scale-105 active:scale-95"
    >
      <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
    </button>
  );
}

function Shell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-4 sm:px-6 sm:py-6">
      <header className="mb-4 sm:mb-6 text-center space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
          DeepThinker
        </h1>
        <p className="text-slate-400 text-xs">
          Segundo Cérebro • Visualizador de Grafo Interativo
        </p>
      </header>

      <main key={location.pathname} className="max-w-6xl mx-auto">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/grafo" element={<GraphPage />} />
        </Routes>
      </main>

      <TopRightNav />
      <DevilsAdvocateButton onClick={() => setSidebarOpen(true)} />
      <DevilsAdvocateSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}

export default App;
