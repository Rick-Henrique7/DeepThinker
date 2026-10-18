/**
 * Cliente HTTP centralizado.
 * Usa VITE_API_URL do .env (default: http://localhost:8000/api); no app desktop, a porta do backend local.
 * Toda chamada leva o token de login (ver lib/auth.ts).
 */

import { authFetch } from './auth';
import { apiBaseUrl } from './desktop';

const BASE_URL = apiBaseUrl();

export interface ApiError extends Error {
  status?: number;
  body?: unknown;
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers = {
    Accept: 'application/json',
    ...(init.body && !(init.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...init.headers,
  };

  const response = await authFetch(url, { ...init, headers });

  if (!response.ok) {
    const err: ApiError = new Error(`HTTP ${response.status}`);
    err.status = response.status;
    try {
      err.body = await response.json();
      // O backend explica o erro em "message"; mostrar isso ajuda mais que "HTTP 502".
      const message = (err.body as { message?: unknown } | null)?.message;
      if (typeof message === 'string' && message) err.message = message;
    } catch {
      // body não era JSON
    }
    throw err;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body ?? {}),
    }),
  /** PATCH = mudar só uma parte de um recurso (ex.: as propriedades de uma nota). */
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body ?? {}),
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export { BASE_URL };
