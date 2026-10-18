import { api } from './api';

/**
 * Quadro (Kanban). O servidor guarda as colunas (nome e ordem) e diz quais notas estão em cada
 * uma (backend: board/BoardService.java). Um cartão é uma nota com "status" igual ao nome da
 * coluna; nota sem status não aparece no Quadro.
 */

export interface BoardCardItem {
  id: number;
  title: string;
  tags: string[];
  /** Criado direto no Quadro: vive só aqui (fora do grafo, das listas e da memória). */
  board_only: boolean;
}

export interface BoardColumnData {
  id: number;
  name: string;
  position: number;
  cards: BoardCardItem[];
}

export interface BoardData {
  property: string;
  columns: BoardColumnData[];
}

/** A página do Quadro escuta este evento para recarregar (o modo piloto usa para mostrar mudanças). */
export const BOARD_CHANGED_EVENT = 'deepthinker:board-changed';

export const boardApi = {
  get: () => api.get<BoardData>('/board'),
  createColumn: (name: string) => api.post<BoardColumnData>('/board/columns', { name }),
  renameColumn: (id: number, name: string) => api.patch<BoardData>(`/board/columns/${id}`, { name }),
  moveColumn: (id: number, position: number) => api.patch<BoardData>(`/board/columns/${id}`, { position }),
  deleteColumn: (id: number) => api.delete<{ message: string; cards_removed: number }>(`/board/columns/${id}`),
  createCard: (title: string, column: string, content = '') =>
    api.post<BoardCardItem>('/board/cards', { title, column, content }),
  /** Põe a nota no Quadro (ou muda de coluna). Sem coluna: a primeira. */
  place: (noteId: number, column?: string) => api.put<{ id: number; column: string }>(`/board/notes/${noteId}`, { column }),
  remove: (noteId: number) => api.delete<{ id: number; message: string }>(`/board/notes/${noteId}`),
};
