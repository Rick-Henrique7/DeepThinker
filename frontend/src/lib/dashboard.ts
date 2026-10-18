/**
 * Contas do Painel "Seu pensamento em números". Tudo sai de GET /notes/index
 * (uma linha por nota) e é calculado aqui no navegador, em funções puras: recebem a
 * lista de notas e devolvem números prontos para os gráficos.
 */
import { localIsoDate, matchesTag, type NoteIndexItem } from './notes';

export type Period = 30 | 90 | 365 | null;

export const PERIODS: { value: Period; label: string }[] = [
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 365, label: '12 meses' },
  { value: null, label: 'Tudo' },
];

const DAY = 86_400_000;

/** Início do período (meia-noite de N dias atrás) ou null para "Tudo". */
export function periodStart(period: Period, now = new Date()): Date | null {
  if (period === null) return null;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (period - 1));
  return d;
}

/** As notas que o Painel conta: criadas no período e (se houver) com a tag escolhida. */
export function scopeNotes(items: NoteIndexItem[], period: Period, tag: string | null, now = new Date()) {
  const start = periodStart(period, now);
  return items.filter((n) => (!start || new Date(n.created_at) >= start) && (!tag || matchesTag(n.tags, tag)));
}

export interface Bin {
  label: string;
  title: string;
  value: number;
}

/** Segunda-feira da semana da data (a semana começa na segunda, como no Brasil). */
function mondayOf(d: Date): Date {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

const shortDay = (d: Date) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');

/**
 * Notas criadas por semana (até 90 dias) ou por mês (12 meses e Tudo).
 * Semanas e meses sem nota entram com zero: um buraco no gráfico também é informação.
 */
export function creationBins(items: NoteIndexItem[], period: Period, now = new Date()): Bin[] {
  const dates = items.map((n) => new Date(n.created_at));
  const start = periodStart(period, now) ?? (dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : now);
  if (period !== null && period <= 90) {
    const bins: Bin[] = [];
    for (let w = mondayOf(start); w <= now; w = new Date(w.getTime() + 7 * DAY)) {
      const end = new Date(w.getTime() + 6 * DAY);
      const value = dates.filter((d) => d >= w && d < new Date(w.getTime() + 7 * DAY)).length;
      bins.push({ label: shortDay(w), title: `Semana de ${shortDay(w)} a ${shortDay(end)}`, value });
    }
    return bins;
  }
  const bins: Bin[] = [];
  const first = new Date(start.getFullYear(), start.getMonth(), 1);
  const multiYear = first.getFullYear() !== now.getFullYear();
  for (let m = first; m <= now; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const value = dates.filter((d) => d >= m && d < next).length;
    const month = m.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    bins.push({
      label: multiYear ? `${month}/${String(m.getFullYear()).slice(2)}` : month,
      title: m.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      value,
    });
  }
  return bins;
}

/** Quantas notas foram criadas ou editadas em cada dia (cada nota conta uma vez por dia). */
export function activityByDay(items: NoteIndexItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of items) {
    const days = new Set([localIsoDate(new Date(n.created_at)), localIsoDate(new Date(n.updated_at))]);
    days.forEach((d) => counts.set(d, (counts.get(d) ?? 0) + 1));
  }
  return counts;
}

const WEEKDAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export interface WritingStats {
  /** Dias com pelo menos uma nota criada ou editada, dentro da janela. */
  activeDays: number;
  windowDays: number;
  /** Dias seguidos até hoje (ou até ontem, se hoje ainda não teve nota: o dia não acabou). */
  current: number;
  longest: number;
  busiestWeekday: string | null;
}

/**
 * Os números ao lado do calendário: em quantos dias você escreveu, a sequência atual,
 * a maior sequência e o dia da semana em que você mais escreve.
 */
export function writingStats(counts: Map<string, number>, windowDays: number, today = new Date()): WritingStats {
  const base = new Date(today);
  base.setHours(12, 0, 0, 0);
  const countAt = (daysAgo: number) => {
    const d = new Date(base);
    d.setDate(base.getDate() - daysAgo);
    return { d, n: counts.get(localIsoDate(d)) ?? 0 };
  };
  let activeDays = 0;
  let longest = 0;
  let run = 0;
  const weekday = new Array(7).fill(0);
  // Do dia mais antigo da janela até hoje.
  for (let i = windowDays - 1; i >= 0; i--) {
    const { d, n } = countAt(i);
    if (n > 0) {
      activeDays++;
      run++;
      longest = Math.max(longest, run);
      weekday[d.getDay()] += n;
    } else run = 0;
  }
  let current = 0;
  const start = countAt(0).n > 0 ? 0 : 1;
  while (current < 3660 && countAt(start + current).n > 0) current++;
  const max = Math.max(...weekday);
  return { activeDays, windowDays, current, longest: Math.max(longest, Math.min(current, windowDays)), busiestWeekday: max > 0 ? WEEKDAY_NAMES[weekday.indexOf(max)] : null };
}

export function topTags(items: NoteIndexItem[], limit = 10): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  items.forEach((n) => n.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pt-BR'))
    .slice(0, limit);
}

/**
 * De onde vêm as notas. Cada origem tem a SUA cor fixa (a cor segue a origem, não a posição
 * no ranking): filtrar por uma tag não repinta as fatias que sobram.
 */
export const SOURCES: { key: string; label: string; colorIndex: number }[] = [
  { key: 'manual', label: 'Escritas por você', colorIndex: 0 },
  { key: 'conversation', label: 'Conversas com o Advogado', colorIndex: 1 },
  { key: 'document', label: 'Documentos importados', colorIndex: 2 },
  { key: 'daily', label: 'Notas do dia', colorIndex: 3 },
  { key: 'highlight', label: 'Destaques de leitura', colorIndex: 4 },
];

export function sourceCounts(items: NoteIndexItem[]): { key: string; label: string; colorIndex: number | null; value: number }[] {
  const known = new Map(SOURCES.map((s) => [s.key, 0]));
  let other = 0;
  for (const n of items) {
    const key = n.source_type || 'manual';
    if (known.has(key)) known.set(key, known.get(key)! + 1);
    else other++;
  }
  const rows: { key: string; label: string; colorIndex: number | null; value: number }[] = SOURCES.map((s) => ({
    ...s,
    value: known.get(s.key)!,
  })).filter((r) => r.value > 0);
  if (other > 0) rows.push({ key: 'other', label: 'Outras', colorIndex: null, value: other });
  return rows;
}

export const linksOf = (n: NoteIndexItem) => n.links_in + n.links_out;

/** Propriedades com número (confiança: 3, nota: 8...), das mais usadas para as menos. */
export function numericKeys(items: NoteIndexItem[]): string[] {
  const counts = new Map<string, number>();
  for (const n of items) {
    for (const [k, v] of Object.entries(n.properties)) {
      if (typeof v === 'number' && Number.isFinite(v)) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}
