import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Brain, Network, MessageSquare, Settings as SettingsIcon, LogOut, Search, BarChart3, LayoutDashboard, BookOpen } from 'lucide-react';
import { openPalette } from './CommandPalette';
import { fetchProviders, providerLabel } from '../lib/chat';
import { logout, type AuthUser } from '../lib/auth';
import { isDesktop } from '../lib/desktop';
import { Logo } from './Logo';

interface HeaderProps {
  className?: string;
  user?: AuthUser;
}

/**
 * Header fixo — minimalista iOS-style.
 * - Mobile (<lg): so logo + LLM indicator
 * - Tablet+ (lg): adiciona nav inline (3 itens)
 * BottomNav cuida do resto no mobile+tablet.
 */
export const Header: React.FC<HeaderProps> = ({ className = '', user }) => {
  const [llmOnline, setLlmOnline] = useState<boolean | null>(null);
  const [llmName, setLlmName] = useState('IA');

  // Pergunta ao backend se o plugin de IA ativo esta pronto (chave configurada, servidor no ar).
  // Antes o navegador chamava o LM Studio direto, o que nao funciona com a app publicada.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const info = await fetchProviders();
        if (cancelled) return;
        setLlmName(providerLabel(info, info.default));
        setLlmOnline(info.providers[info.default]?.available ?? false);
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
        <NavLink to="/" className="flex items-center gap-2.5 min-h-[44px] fino:min-h-0 min-w-0 flex-shrink-0 text-neutral-100">
          <Logo className="h-6 w-6 flex-shrink-0" />
          <span className="text-base sm:text-[17px] font-semibold tracking-[-0.01em] truncate">
            Deep thinker
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
          <NavLink to="/painel" className={navItemClass}>
            <BarChart3 className="h-4 w-4" />
            Painel
          </NavLink>
          <NavLink to="/canvas" className={navItemClass}>
            <LayoutDashboard className="h-4 w-4" />
            Canvas
          </NavLink>
          <NavLink to="/leitor" className={navItemClass}>
            <BookOpen className="h-4 w-4" />
            Leitor
          </NavLink>
          <NavLink to="/settings" className={navItemClass}>
            <SettingsIcon className="h-4 w-4" />
            IA
          </NavLink>
        </nav>

        <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
          {/* Busca rápida (Ctrl+K) */}
          <button
            type="button"
            onClick={openPalette}
            aria-label="Buscar notas e comandos (Ctrl+K)"
            title="Buscar notas e comandos (Ctrl+K)"
            className="flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] fino:min-h-[36px] fino:min-w-0 px-2 sm:px-3 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800/60 transition-colors"
          >
            <Search className="h-4 w-4" />
            <kbd className="hidden lg:inline text-[11px] text-neutral-500 border border-neutral-700 rounded px-1.5">Ctrl K</kbd>
          </button>
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
                ? 'Verificando IA...'
                : llmOnline
                ? `${llmName} pronto`
                : `${llmName} indisponivel: configure na aba IA`
            }
          >
            <span>
              {llmOnline === null ? '...' : llmOnline ? 'LLM' : 'off'}
            </span>
          </div>

          {/* Sair (no app desktop não há login, então não há botão de sair) */}
          {!isDesktop() && (
            <button
              type="button"
              onClick={logout}
              title={user ? `Sair (${user.email})` : 'Sair'}
              aria-label="Sair"
              className="flex items-center justify-center h-11 w-11 lg:h-auto lg:w-auto lg:p-1.5 rounded-full text-neutral-500 hover:text-white hover:bg-neutral-800/60 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
