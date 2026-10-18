/**
 * Regras compartilhadas pelas visões Tabela e Quadro (e pelo filtro da página de notas).
 * Tudo roda no navegador em cima de GET /notes/index: com milhares de notas, filtrar e ordenar
 * um array em JavaScript leva poucos milissegundos.
 */
import { formatPropertyValue, isDateString, matchesTag, normalize, type NoteIndexItem, type PropertyValue } from './notes';

export interface NoteFilters {
  tag: string | null;
  search: string;
  /** Filtro por propriedade: só as notas em que propKey vale propValue ('' = sem valor). */
  propKey: string | null;
  propValue: string | null;
}

/** Nomes de propriedade usados nas notas, dos mais usados para os menos (sem "tags", que tem coluna própria). */
export function propertyKeys(items: NoteIndexItem[]): string[] {
  const count = new Map<string, number>();
  for (const item of items) {
    for (const key of Object.keys(item.properties)) {
      if (key !== 'tags') count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([k]) => k);
}

/** Texto usado para agrupar e filtrar: listas viram "a, b"; vazio vira ''. */
export function valueKey(v: PropertyValue | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v)) return v.map((x) => valueKey(x)).join(', ');
  return String(v);
}

/** Os valores distintos de uma propriedade, com quantas notas usam cada um. */
export function distinctValues(items: NoteIndexItem[], key: string): { value: string; count: number }[] {
  const count = new Map<string, number>();
  for (const item of items) {
    const v = valueKey(item.properties[key]);
    count.set(v, (count.get(v) ?? 0) + 1);
  }
  return [...count.entries()].map(([value, c]) => ({ value, count: c }));
}

export function filterNotes(items: NoteIndexItem[], f: NoteFilters): NoteIndexItem[] {
  const q = normalize(f.search);
  return items.filter(
    (item) =>
      (!f.tag || matchesTag(item.tags, f.tag)) &&
      (!q || normalize(item.title).includes(q)) &&
      (!f.propKey || f.propValue === null || valueKey(item.properties[f.propKey]) === f.propValue)
  );
}

/**
 * Ordena valores de tipos misturados: vazio sempre por último, números como números,
 * datas pela data, sim/não e texto em ordem alfabética do português (sem ligar para acento).
 */
export function compareValues(a: PropertyValue | undefined, b: PropertyValue | undefined): number {
  const emptyA = valueKey(a) === '';
  const emptyB = valueKey(b) === '';
  if (emptyA || emptyB) return Number(emptyA) - Number(emptyB);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (isDateString(a) && isDateString(b)) return a.localeCompare(b);
  return valueKey(a).localeCompare(valueKey(b), 'pt-BR', { sensitivity: 'base', numeric: true });
}

/**
 * Ordem "natural" das colunas do Quadro para os status mais comuns. O resto vem depois,
 * em ordem alfabética. Assim "a fazer" fica antes de "feito" sem ninguém precisar configurar.
 */
const NATURAL_ORDER = [
  'ideia',
  'a fazer',
  'a ler',
  'em aberto',
  'explorando',
  'fazendo',
  'lendo',
  'em andamento',
  'em análise',
  'revisar',
  'feito',
  'lido',
  'decidido',
  'decidida',
  'concluído',
  'concluída',
  'arquivado',
];

const NATURAL = NATURAL_ORDER.map(normalize);

export function boardOrder(values: string[]): string[] {
  const rank = (v: string) => {
    const i = NATURAL.indexOf(normalize(v));
    return i < 0 ? NATURAL.length : i;
  };
  return [...values].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

/** Rótulo de um valor para mostrar ("" vira "Sem status", por exemplo). */
export const valueLabel = (value: string, key: string) => (value === '' ? `Sem ${key}` : formatPropertyValue(value));
