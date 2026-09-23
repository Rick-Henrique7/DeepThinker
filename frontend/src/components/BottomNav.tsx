import React from 'react';
import { NavLink } from 'react-router-dom';
import { Brain, Network, MessageSquare, Settings as SettingsIcon } from 'lucide-react';

/**
 * Bottom nav estilo iOS — pill flutuante centralizada,
 * não full-width. Padrão mobile-first premium.
 */
export const BottomNav: React.FC = () => {
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-2xl transition-colors',
      isActive ? 'text-white bg-neutral-800/80' : 'text-neutral-500 hover:text-neutral-300',
    ].join(' ');

  return (
    <div className="lg:hidden fixed bottom-3 left-3 right-3 z-40 safe-area-pb">
      <nav className="bg-neutral-900/90 backdrop-blur-xl border border-neutral-800/80 rounded-2xl shadow-2xl shadow-black/50">
        <div className="flex items-stretch p-1">
          <NavLink to="/" end className={itemClass}>
            <Brain className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-[10px] font-medium">Pensar</span>
          </NavLink>
          <NavLink to="/grafo" className={itemClass}>
            <Network className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-[10px] font-medium">Grafo</span>
          </NavLink>
          <NavLink to="/advogado" className={itemClass}>
            <MessageSquare className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-[10px] font-medium">Advogado</span>
          </NavLink>
          <NavLink to="/settings" className={itemClass}>
            <SettingsIcon className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-[10px] font-medium">IA</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
};
