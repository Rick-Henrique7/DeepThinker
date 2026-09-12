import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Brain, Network, MessageSquare, Circle } from 'lucide-react';

interface HeaderProps {
  className?: string;
}

/**
 * Header fixo — minimalista iOS-style.
 * - Mobile (<lg): so logo + LLM indicator
 * - Tablet+ (lg): adiciona nav inline (3 itens)
 * BottomNav cuida do resto no mobile+tablet.
 */
export const Header: React.FC<HeaderProps> = ({ className = '' }) => {
  const [llmOnline, setLlmOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const base = import.meta.env.VITE_LMSTUDIO_BASE_URL ?? 'http://localhost:1234/v1';
        const r = await fetch(`${base}/models`, { method: 'GET' });
        if (!cancelled) setLlmOnline(r.ok);
      } catch {
        if (!cancelled) setLlmOnline(false);
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
      isActive
        ? 'bg-white text-black'
        : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60',
    ].join(' ');

  return (
    <header className={`sticky top-0 z-40 bg-black/85 backdrop-blur-xl border-b border-neutral-900 ${className}`}>
      <div className="max-w-6xl mx-auto px-3 sm:px-5 lg:px-6 h-12 sm:h-14 flex items-center justify-between gap-2 sm:gap-3">
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <span className="text-base sm:text-lg lg:text-xl font-bold text-white tracking-tight truncate">
            DeepThinker
          </span>
        </NavLink>

        {/* Nav desktop+tablet (>=lg) */}
        <nav className="hidden lg:flex items-center gap-1">
          <NavLink to="/" end className={navItemClass}>
            <Brain className="h-4 w-4" />
            Pensar
          </NavLink>
          <NavLink to="/grafo" className={navItemClass}>
            <Network className="h-4 w-4" />
            Grafo
          </NavLink>
          <NavLink to="/advogado" className={navItemClass}>
            <MessageSquare className="h-4 w-4" />
            Advogado
          </NavLink>
        </nav>

        {/* Status LLM */}
        <div
          className={`flex items-center gap-1.5 text-xs flex-shrink-0 ${
            llmOnline === null
              ? 'text-neutral-600'
              : llmOnline
              ? 'text-neutral-400'
              : 'text-neutral-500'
          }`}
          title={
            llmOnline === null
              ? 'Verificando LLM local...'
              : llmOnline
              ? 'LM Studio conectado'
              : 'LM Studio offline'
          }
        >
          <Circle
            className={`h-1.5 w-1.5 ${
              llmOnline === null
                ? 'fill-neutral-600 text-neutral-600'
                : llmOnline
                ? 'fill-emerald-500 text-emerald-500'
                : 'fill-neutral-500 text-neutral-500'
            }`}
          />
          <span className="hidden sm:inline">
            {llmOnline === null ? '...' : llmOnline ? 'LLM' : 'off'}
          </span>
        </div>
      </div>
    </header>
  );
};
