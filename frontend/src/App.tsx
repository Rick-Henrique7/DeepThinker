import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { HomePage } from './pages/HomePage';
import { GraphPage } from './pages/GraphPage';
import { AdvogadoPage } from './pages/AdvogadoPage';
import { PainelPage } from './pages/PainelPage';
import { CanvasListPage } from './pages/CanvasListPage';
import { CanvasPage } from './pages/CanvasPage';
import { LeitorListPage } from './pages/LeitorListPage';
import { LeitorPage } from './pages/LeitorPage';
import { SettingsPage } from './pages/SettingsPage';
import { CollabNotePage } from './pages/CollabNotePage';
import { LoginPage } from './pages/LoginPage';
import { ConfirmProvider } from './components/ConfirmDialog';
import { getStoredUser, loginDesktop, LOGOUT_EVENT, type AuthUser } from './lib/auth';
import { isDesktop } from './lib/desktop';
import { Logo } from './components/Logo';
import { WaterLine } from './components/WaterLine';
import { WelcomeToast } from './components/WelcomeToast';
import { CommandPalette } from './components/CommandPalette';
import { PilotLayer } from './components/PilotLayer';
import { PluginHost } from './components/PluginHost';

function Shell({ user }: { user: AuthUser }) {
  return (
    <div className="min-h-screen flex flex-col text-neutral-100">
      <Header user={user} />
      <main className="flex-1 px-3 pt-3 sm:px-5 sm:pt-5 md:px-6 md:pt-6 lg:pt-8 pb-28 lg:pb-8 baixa:pl-[6.5rem] baixa:pb-3">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/grafo" element={<GraphPage />} />
          <Route path="/advogado" element={<AdvogadoPage />} />
          <Route path="/painel" element={<PainelPage />} />
          <Route path="/canvas" element={<CanvasListPage />} />
          <Route path="/canvas/:id" element={<CanvasPage />} />
          <Route path="/leitor" element={<LeitorListPage />} />
          <Route path="/leitor/:id" element={<LeitorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/compartilhada/:id" element={<CollabNotePage />} />
        </Routes>
      </main>
      <BottomNav />
      <CommandPalette />
      {/* IA de fora mexendo no app ao vivo (servidor MCP + modo piloto) */}
      <PilotLayer />
      {/* Plugins da comunidade, cada um isolado num iframe (lib/plugins.ts) */}
      <PluginHost />
    </div>
  );
}

/**
 * App desktop: em vez da tela de login, entra sozinho na conta local.
 * Enquanto o backend Java sobe (alguns segundos), mostra o logo.
 */
function DesktopStart({ onLoggedIn }: { onLoggedIn: (user: AuthUser) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loginDesktop()
      .then((user) => !cancelled && onLoggedIn(user))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [attempt, onLoggedIn]);

  return (
    <div className="relative overflow-hidden min-h-screen flex flex-col items-center justify-center text-neutral-300">
      <WaterLine level={0.56} intensity={0.8} />
      <div className="relative flex flex-col items-center gap-4">
      <Logo className="h-10 w-10 text-neutral-200" />
      {error ? (
        <>
          <p className="text-sm text-neutral-400">Não consegui iniciar o Deep thinker: {error}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded-full border border-neutral-700 px-4 py-1.5 text-sm hover:bg-neutral-800"
          >
            Tentar de novo
          </button>
        </>
      ) : (
        <p className="text-sm text-neutral-500">Abrindo suas notas...</p>
      )}
      </div>
    </div>
  );
}

export function App() {
  // Sem usuario salvo, mostra a tela de login no lugar do app.
  const [user, setUser] = useState<AuthUser | null>(getStoredUser);

  // lib/auth.ts dispara este evento ao sair ou quando o token vence (401).
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener(LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(LOGOUT_EVENT, onLogout);
  }, []);

  // Aviso que aparece logo depois de entrar (some sozinho).
  const [welcome, setWelcome] = useState<string | null>(null);
  const closeWelcome = useCallback(() => setWelcome(null), []);
  const handleLoggedIn = (u: AuthUser, isNew: boolean) => {
    setUser(u);
    const first = u.name.split(' ')[0];
    setWelcome(isNew ? `Conta criada. Bem-vindo(a), ${first}!` : `Bem-vindo(a) de volta, ${first}.`);
  };

  if (!user) {
    return isDesktop() ? <DesktopStart onLoggedIn={setUser} /> : <LoginPage onLoggedIn={handleLoggedIn} />;
  }

  return (
    <BrowserRouter>
      {/* key: trocar de conta remonta as paginas, sem sobrar dado da conta anterior */}
      <ConfirmProvider>
        <Shell key={user.id} user={user} />
        {welcome && <WelcomeToast message={welcome} onClose={closeWelcome} />}
      </ConfirmProvider>
    </BrowserRouter>
  );
}

export default App;
