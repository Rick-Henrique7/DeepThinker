import React from 'react';
import { NavLink } from 'react-router-dom';
import { Brain, Network, MessageSquare } from 'lucide-react';

/**
 * Bottom navigation para mobile (<sm).
 * Padrão de UX mobile-first: libera o header e dá acesso ao polegar.
 */
export const BottomNav: React.FC = () => {
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
      isActive ? 'text-indigo-300' : 'text-slate-500 hover:text-slate-300',
    ].join(' ');

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80 safe-area-pb">
      <div className="flex items-stretch">
        <NavLink to="/" end className={itemClass}>
          <Brain className="h-5 w-5" />
          <span className="text-[10px] font-medium">Pensar</span>
        </NavLink>
        <NavLink to="/grafo" className={itemClass}>
          <Network className="h-5 w-5" />
          <span className="text-[10px] font-medium">Grafo</span>
        </NavLink>
        <NavLink to="/advogado" className={itemClass}>
          <MessageSquare className="h-5 w-5" />
          <span className="text-[10px] font-medium">Advogado</span>
        </NavLink>
      </div>
    </nav>
  );
};
