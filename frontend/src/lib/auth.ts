/**
 * Login no frontend.
 *
 * O backend devolve um token (JWT) no login. Guardamos no localStorage e mandamos
 * em toda chamada como "Authorization: Bearer <token>". Sair = apagar o token.
 *
 * Se o backend responder 401 (token vencido ou invalido), apagamos o token e
 * avisamos o App com o evento "deepthinker:logout", que volta para a tela de login.
 */

import { apiBaseUrl, desktopConfig } from './desktop';

const BASE_URL = apiBaseUrl();
const TOKEN_KEY = 'deepthinker.token';
const USER_KEY = 'deepthinker.user';
export const LOGOUT_EVENT = 'deepthinker:logout';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
}

interface Session {
  token: string;
  user: AuthUser;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  if (!getToken()) return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session): AuthUser {
  try {
    localStorage.setItem(TOKEN_KEY, s.token);
    localStorage.setItem(USER_KEY, JSON.stringify(s.user));
  } catch {
    // modo privado sem storage: o login vale so ate fechar a aba
  }
  return s.user;
}

export function logout(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // nada a fazer
  }
  window.dispatchEvent(new Event(LOGOUT_EVENT));
}

/**
 * fetch com o token. Use no lugar de fetch() para qualquer rota da API.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401 && token) {
    logout();
  }
  return response;
}

async function postSession(path: string, body: unknown): Promise<AuthUser> {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Formato do backend: { message, errors?: { campo: [msg] } }
    throw new Error(data?.message ?? `Erro HTTP ${r.status}`);
  }
  return saveSession(data as Session);
}

export function login(email: string, password: string): Promise<AuthUser> {
  return postSession('/auth/login', { email, password });
}

export function register(name: string, email: string, password: string): Promise<AuthUser> {
  return postSession('/auth/register', { name, email, password });
}

/**
 * App desktop: entra sozinho na conta local, sem tela de login.
 * O backend demora alguns segundos para subir quando o programa abre,
 * então tentamos de novo até ele responder.
 */
export async function loginDesktop(maxWaitMs = 60_000): Promise<AuthUser> {
  const config = desktopConfig();
  if (!config) throw new Error('Não está no app desktop.');
  const deadline = Date.now() + maxWaitMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE_URL}/auth/local`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-Desktop-Key': config.key },
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) return saveSession(data as Session);
      throw new Error(data?.message ?? `Erro HTTP ${r.status}`);
    } catch (e) {
      // "Failed to fetch" = backend ainda subindo. Espera meio segundo e tenta de novo.
      lastError = e;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('O backend não respondeu.');
}
