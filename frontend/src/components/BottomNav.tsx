import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Brain, Network, MessageSquare, Settings as SettingsIcon, BarChart3, LayoutDashboard, MoreHorizontal, BookOpen } from 'lucide-react';

/** Páginas que moram no "Mais" (não cabem 6 botões numa barra de celular). */
const MORE = [
  { to: '/canvas', label: 'Canvas', icon: LayoutDashboard },
  { to: '/leitor', label: 'Leitor (PDFs e grifos)', icon: BookOpen },
  { to: '/settings', label: 'IA e configurações', icon: SettingsIcon },
];

/**
 * Bottom nav estilo iOS — pill flutuante centralizada,
 * não full-width. Padrão mobile-first premium.
 */
export const BottomNav: React.FC = () => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const moreActive = MORE.some((m) => pathname.startsWith(m.to));

  // Fecha o menu ao trocar de página e ao tocar fora dele.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 baixa:py-1 rounded-2xl transition-colors',
      isActive ? 'text-white bg-neutral-800/80' : 'text-neutral-500 hover:text-neutral-300',
    ].join(' ');

  return (
    <div ref={box} className="lg:hidden fixed bottom-3 left-3 right-3 z-40 safe-area-pb baixa:right-auto baixa:top-[4.25rem] baixa:w-[5.5rem]">
      {open && (
        <div
          id="mais-menu"
          role="menu"
          className="absolute bottom-full right-0 mb-2 baixa:bottom-0 baixa:right-auto baixa:left-full baixa:mb-0 baixa:ml-2 w-56 rounded-2xl border border-neutral-800 bg-neutral-900/95 p-1 shadow-2xl shadow-black/50 backdrop-blur-xl"
        >
          {MORE.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              role="menuitem"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${isActive ? 'bg-neutral-800 text-white' : 'text-neutral-300 hover:bg-neutral-800/60'}`
              }
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </div>
      )}
      <nav className="bg-neutral-900/90 backdrop-blur-xl border border-neutral-800/80 rounded-2xl shadow-2xl shadow-black/50 baixa:h-full">
        <div className="flex items-stretch p-1 baixa:h-full baixa:flex-col">
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
          <NavLink to="/painel" className={itemClass}>
            <BarChart3 className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-[10px] font-medium">Painel</span>
          </NavLink>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mais-menu"
            aria-haspopup="menu"
            className={itemClass({ isActive: moreActive || open })}
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-[10px] font-medium">Mais</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
