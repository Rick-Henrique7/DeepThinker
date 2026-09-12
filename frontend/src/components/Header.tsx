import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Brain, Network, MessageSquare, Circle } from 'lucide-react';

interface HeaderProps {
  className?: string;
}

/**
 * Header fixo com navegação primária (3 páginas) + status do LLM local.
 * No mobile, a nav primária é ocultada — ela aparece como bottom nav (BottomNav).
 * No desktop (sm:), o header mostra a nav completa.
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
      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
      isActive
        ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/40'
        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent',
    ].join(' ');

  return (
    <header
      className={`sticky top-0 z-40 backdrop-blur-md bg-slate-950/85 border-b border-slate-800/80 ${className}`}
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2 group min-w-0">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30">
            <Brain className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-base font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 truncate">
              DeepThinker
            </span>
            <span className="text-[10px] text-slate-500 hidden sm:block">Segundo Cérebro</span>
          </div>
        </NavLink>

        {/* Nav desktop (>=sm) */}
        <nav className="hidden sm:flex items-center gap-1">
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
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border flex-shrink-0 ${
            llmOnline === null
              ? 'border-slate-700 text-slate-500'
              : llmOnline
              ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
              : 'border-red-500/40 text-red-300 bg-red-500/10'
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
            className={`h-2 w-2 ${
              llmOnline === null
                ? 'text-slate-500'
                : llmOnline
                ? 'fill-emerald-400 text-emerald-400'
                : 'fill-red-400 text-red-400'
            }`}
          />
          <span className="hidden sm:inline">
            {llmOnline === null ? '...' : llmOnline ? 'LLM ok' : 'LLM off'}
          </span>
        </div>
      </div>
    </header>
  );
};
