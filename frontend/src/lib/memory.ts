import { api, type ApiError } from './api';

/** Uma opcao de modelo para a memoria da IA (vem do EmbeddingCatalog do backend). */
export interface MemoryOption {
  id: string;
  label: string;
  description: string;
  /** Plugin de IA de onde vem a chave (null = nao usa chave). */
  plugin: string | null;
  default_model: string;
  models: string[];
  base_url_editable: boolean;
  default_base_url: string | null;
  local: boolean;
  /** Passo a passo de como conectar. */
  guide: string[];
}

export interface MemoryStatus {
  enabled: boolean;
  embedding: string;
  model: string;
  semantic: boolean;
  state: string;
  detail: string;
  problem?: string | null;
  indexed: number;
  total: number;
}

export interface MemorySettings {
  embedding: string;
  model: string;
  base_url?: string | null;
  options: MemoryOption[];
  status: MemoryStatus;
}

export interface MemoryTestResult {
  ok: boolean;
  model?: string;
  dimensions?: number;
  ms?: number;
  error?: string;
}

export const getMemorySettings = () => api.get<MemorySettings>('/memory/settings');

export const getMemoryStatus = () => api.get<MemoryStatus>('/memory/status');

export const saveMemorySettings = (payload: { embedding: string; model?: string; base_url?: string }) =>
  api.put<MemorySettings>('/memory/settings', payload);

/** O backend responde 400/502 com { ok: false, error } quando o teste falha. */
export async function testMemory(): Promise<MemoryTestResult> {
  try {
    return await api.post<MemoryTestResult>('/memory/test');
  } catch (e) {
    const body = (e as ApiError).body as MemoryTestResult | undefined;
    if (body && typeof body.ok === 'boolean') return body;
    return { ok: false, error: (e as Error).message };
  }
}
