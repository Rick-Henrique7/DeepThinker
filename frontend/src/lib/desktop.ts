/**
 * Modo desktop (app Tauri da pasta ../desktop).
 *
 * Quando o Deep thinker roda como programa no PC, a janela Tauri sobe o backend
 * Java numa porta livre e injeta, antes da página carregar:
 *
 *   window.__DEEPTHINKER_DESKTOP__ = { apiUrl: 'http://127.0.0.1:PORTA/api', key: '...' }
 *
 * No navegador comum esse objeto não existe, e tudo funciona como antes.
 */

interface DesktopConfig {
  apiUrl: string;
  key: string;
}

declare global {
  interface Window {
    __DEEPTHINKER_DESKTOP__?: DesktopConfig;
  }
}

export function desktopConfig(): DesktopConfig | null {
  return typeof window !== 'undefined' ? window.__DEEPTHINKER_DESKTOP__ ?? null : null;
}

export function isDesktop(): boolean {
  return desktopConfig() !== null;
}

/** Endereço da API: o do app desktop, senão VITE_API_URL, senão o backend local de desenvolvimento. */
export function apiBaseUrl(): string {
  return desktopConfig()?.apiUrl ?? import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
}
