/**
 * Cache pequeno para as notas embutidas (![[Nota]]): uma nota com 5 embutidas não deve fazer
 * 5 vezes a mesma busca da lista de títulos. Quando alguma nota muda (NOTES_CHANGED_EVENT),
 * o cache é jogado fora e a próxima leitura busca de novo no servidor.
 */
import { NOTES_CHANGED_EVENT, notesApi, type NoteDetail, type NoteRef } from './notes';

let titles: Promise<NoteRef[]> | null = null;
const details = new Map<number, Promise<NoteDetail>>();

if (typeof window !== 'undefined') {
  window.addEventListener(NOTES_CHANGED_EVENT, () => {
    titles = null;
    details.clear();
  });
}

export function cachedTitles(): Promise<NoteRef[]> {
  if (!titles) {
    titles = notesApi.titles().catch((e) => {
      titles = null; // deu erro: não guarda o erro, tenta de novo na próxima vez
      throw e;
    });
  }
  return titles;
}

export function cachedNote(id: number): Promise<NoteDetail> {
  let p = details.get(id);
  if (!p) {
    p = notesApi.get(id).catch((e) => {
      details.delete(id);
      throw e;
    });
    details.set(id, p);
  }
  return p;
}
