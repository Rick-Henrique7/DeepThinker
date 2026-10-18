/**
 * Importar documentos (PDF, TXT, MD) e, logo depois, desenhar o mapa mental deles.
 *
 * Por que em duas chamadas e não numa só? O upload já espera a IA resumir o documento; se o
 * mapa mental viesse junto, você esperaria o dobro olhando para um "Enviando...". Assim o
 * documento aparece na hora e o mapa chega um pouco depois, gravado na própria nota.
 */
import { useCallback, useState } from 'react';
import { api, BASE_URL } from './api';
import { authFetch } from './auth';
import { notesApi, notifyNotesChanged, type NoteDetail } from './notes';

export interface UploadResult {
  note: NoteDetail;
  extracted_chars: number;
  created?: number;
  reused?: number;
  /** A IA não conseguiu resumir: o texto foi guardado como veio. */
  fallback?: boolean;
}

export function uploadDocument(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  return api.post<UploadResult>('/documents/upload', form);
}

export type MindmapJob =
  | { noteId: number; noteTitle: string; status: 'drawing' }
  | { noteId: number; noteTitle: string; status: 'done' }
  | { noteId: number; noteTitle: string; status: 'failed'; error: string };

/**
 * Guarda o andamento do mapa mental do último documento importado.
 * start() pode ser chamado de novo (botão "Tentar de novo").
 */
export function useDocumentMindmap() {
  const [job, setJob] = useState<MindmapJob | null>(null);

  const start = useCallback((noteId: number, noteTitle: string) => {
    setJob({ noteId, noteTitle, status: 'drawing' });
    notesApi
      .mindmap(noteId)
      .then(() => {
        notifyNotesChanged(); // o grafo e a gaveta da nota mostram o mapa sem recarregar
        setJob((j) => (j?.noteId === noteId ? { noteId, noteTitle, status: 'done' } : j));
      })
      .catch((e) => {
        const error = e instanceof Error ? e.message : 'erro desconhecido';
        setJob((j) => (j?.noteId === noteId ? { noteId, noteTitle, status: 'failed', error } : j));
      });
  }, []);

  const clear = useCallback(() => setJob(null), []);
  return { job, start, clear };
}

// ------------------------------------------------------------------ Leitor e destaques

/** Um documento importado. kind null = o arquivo original não foi guardado (importado antes do Leitor). */
export interface DocumentItem {
  id: number;
  title: string;
  filename: string | null;
  kind: 'pdf' | 'text' | null;
  size: number | null;
  highlights: number;
  created_at: string;
}

/** Retângulo de um grifo em frações da página (0 a 1): não depende do zoom nem da tela. */
export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const HIGHLIGHT_COLORS = [
  { key: 'amarelo', label: 'Amarelo' },
  { key: 'verde', label: 'Verde' },
  { key: 'azul', label: 'Azul' },
  { key: 'rosa', label: 'Rosa' },
] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]['key'];

/**
 * Um destaque. Ele é uma nota (id = id da nota); "note" é o que você escreveu nela além do
 * trecho. PDF usa page + rects; TXT/MD usa start/end (posição no texto).
 */
export interface Highlight {
  id: number;
  title: string;
  quote: string;
  note: string;
  page: number | null;
  rects: HighlightRect[];
  start: number | null;
  end: number | null;
  color: HighlightColor;
  created_at: string;
}

export interface NewHighlight {
  quote: string;
  page?: number;
  rects?: HighlightRect[];
  start?: number;
  end?: number;
  color: HighlightColor;
  comment?: string;
}

/** O arquivo original: o PDF em bytes, ou o texto. null = não está guardado. */
export type DocumentFile = { kind: 'pdf'; data: Uint8Array; filename: string } | { kind: 'text'; text: string; filename: string };

function filenameOf(response: Response): string {
  const cd = response.headers.get('Content-Disposition') ?? '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) return decodeURIComponent(star[1]);
  return /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? 'documento';
}

export const documentsApi = {
  list: () => api.get<DocumentItem[]>('/documents'),
  /** Os dados de um documento: kind diz se o arquivo original está guardado (e de que tipo). */
  get: (id: number) => api.get<DocumentItem>(`/documents/${id}`),

  /** Não passa pelo api.get porque a resposta não é JSON: são os bytes do arquivo. */
  async file(id: number): Promise<DocumentFile | null> {
    const response = await authFetch(`${BASE_URL}/documents/${id}/file`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Não deu para abrir o arquivo (HTTP ${response.status}).`);
    const filename = filenameOf(response);
    if ((response.headers.get('Content-Type') ?? '').startsWith('application/pdf')) {
      return { kind: 'pdf', data: new Uint8Array(await response.arrayBuffer()), filename };
    }
    return { kind: 'text', text: await response.text(), filename };
  },

  /** Guardar o original de um documento antigo (importado antes do Leitor). */
  attachFile(id: number, file: File) {
    const form = new FormData();
    form.append('file', file);
    return api.post<DocumentItem>(`/documents/${id}/file`, form);
  },

  highlights: (id: number) => api.get<Highlight[]>(`/documents/${id}/highlights`),
  addHighlight: (id: number, body: NewHighlight) => api.post<Highlight>(`/documents/${id}/highlights`, body),
  removeHighlight: (id: number, highlightId: number) => api.delete<{ ok: boolean }>(`/documents/${id}/highlights/${highlightId}`),
};
