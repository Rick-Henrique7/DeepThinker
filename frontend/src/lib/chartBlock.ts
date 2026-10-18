/**
 * Gráficos escritos dentro da nota, como no Obsidian: um bloco de código com uma "linguagem"
 * especial vira desenho na hora de mostrar a nota.
 *
 * Dois formatos são aceitos e viram a mesma coisa (um ChartSpec):
 *
 * 1. ```grafico (o nosso, pensado para quem escreve em português): opções no topo e depois
 *    uma tabela simples, separada por vírgula, ponto e vírgula ou tab (colar do Excel funciona):
 *
 *      tipo: colunas
 *      título: Vendas por mês
 *      mês; loja A; loja B
 *      jan; 10,5; 12
 *      fev; 14; 9
 *
 *    Com ; ou tab, a vírgula vira a casa decimal (10,5), como no Brasil.
 *
 * 2. ```chart (o do plugin Obsidian Charts), em YAML: para notas que vieram do Obsidian
 *    continuarem mostrando os gráficos aqui.
 */

export type ChartKind = 'colunas' | 'barras' | 'linha' | 'partes';

export interface ChartSpec {
  kind: ChartKind;
  title?: string;
  labels: string[];
  series: { name: string; values: number[] }[];
  /** Aviso que aparece embaixo do gráfico (ex.: "a pizza virou barra de partes"). */
  note?: string;
}

export type ChartParse = { ok: true; spec: ChartSpec } | { ok: false; error: string };

const MAX_SERIES = 8;
const MAX_ROWS = 100;

const PIE_NOTE = 'Pizza desenhada como uma barra de partes: fica mais fácil comparar o tamanho das fatias.';

/** "pizza", "Barras", "linhas"... vira um dos 4 tipos que sabemos desenhar. */
function kindOf(raw: string | undefined): { kind: ChartKind; note?: string } | null {
  const k = (raw ?? 'colunas').trim().toLowerCase();
  if (['colunas', 'coluna', 'vertical'].includes(k)) return { kind: 'colunas' };
  if (['barras', 'barra', 'horizontal'].includes(k)) return { kind: 'barras' };
  if (['linha', 'linhas', 'tempo'].includes(k)) return { kind: 'linha' };
  if (['partes', 'parte', 'pizza', 'rosca', 'setores', 'torta'].includes(k)) {
    return { kind: 'partes', note: ['pizza', 'rosca', 'setores', 'torta'].includes(k) ? PIE_NOTE : undefined };
  }
  return null;
}

/**
 * Lê um número escrito por gente: "1.234,5", "10,5", "R$ 30", "45%", "-2".
 * decimalComma = true quando a tabela usa ; ou tab (aí a vírgula é decimal).
 */
export function parseNumber(raw: string, decimalComma: boolean): number | null {
  let s = raw.trim().replace(/^R\$\s*/i, '').replace(/%$/, '').replace(/\s+/g, '');
  if (!s) return null;
  if (decimalComma) {
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.234 = mil duzentos e trinta e quatro
  }
  if (!/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const OPTION = /^(tipo|type|t[íi]tulo|title)\s*:\s*(.*)$/i;

export function parseGrafico(text: string): ChartParse {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'));
  const options: Record<string, string> = {};
  while (lines.length && OPTION.test(lines[0])) {
    const [, key, value] = OPTION.exec(lines.shift()!)!;
    const k = key.toLowerCase();
    options[k === 'type' ? 'tipo' : k.startsWith('t') && k !== 'tipo' ? 'titulo' : k] = value.trim();
  }
  const kind = kindOf(options.tipo);
  if (!kind) return { ok: false, error: `Não conheço o tipo "${options.tipo}". Use colunas, barras, linha ou pizza.` };

  // Tabela de Markdown (| a | b |) também vale: tira as bordas e a linha |---|.
  const markdownTable = lines.length > 0 && lines.every((l) => l.startsWith('|'));
  const rows = markdownTable
    ? lines.filter((l) => !/^\|[\s:|-]+\|?$/.test(l)).map((l) => l.replace(/^\||\|$/g, '').split('|'))
    : (() => {
        const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes(';')) ? ';' : ',';
        return lines.map((l) => l.split(sep));
      })();
  const decimalComma = markdownTable || lines.some((l) => l.includes('\t') || l.includes(';'));
  const cells = rows.map((r) => r.map((c) => c.trim()));
  if (cells.length === 0) return { ok: false, error: 'Faltam os dados: uma linha por item, como "jan, 10".' };

  // A primeira linha é cabeçalho se, tirando a 1ª coluna, nada nela é número.
  const first = cells[0];
  const hasHeader = first.length > 1 && first.slice(1).every((c) => parseNumber(c, decimalComma) === null);
  const header = hasHeader ? cells.shift()! : null;
  if (cells.length === 0) return { ok: false, error: 'Só achei o cabeçalho. Coloque os dados nas linhas de baixo.' };
  if (cells.length > MAX_ROWS) return { ok: false, error: `São ${cells.length} linhas; o máximo é ${MAX_ROWS}.` };

  const width = Math.max(...cells.map((r) => r.length));
  if (width < 2) return { ok: false, error: 'Cada linha precisa de um nome e de um número, como "jan, 10".' };
  const seriesCount = Math.min(width - 1, MAX_SERIES);
  const labels: string[] = [];
  const values: number[][] = Array.from({ length: seriesCount }, () => []);
  for (let i = 0; i < cells.length; i++) {
    const row = cells[i];
    labels.push(row[0] || `${i + 1}`);
    for (let j = 0; j < seriesCount; j++) {
      const cell = row[j + 1] ?? '';
      const n = parseNumber(cell, decimalComma);
      if (n === null && cell !== '') {
        return { ok: false, error: `Na linha "${row.join(', ')}", "${cell}" não é um número.` };
      }
      values[j].push(n ?? 0);
    }
  }
  const series = values.map((v, j) => ({
    name: header?.[j + 1] || (seriesCount === 1 ? 'Valor' : `Série ${j + 1}`),
    values: v,
  }));
  const notes = [kind.note, width - 1 > MAX_SERIES ? `Mostrando só as ${MAX_SERIES} primeiras colunas de números.` : undefined].filter(Boolean);
  return {
    ok: true,
    spec: { kind: kind.kind, title: options.titulo || undefined, labels, series, note: notes.join(' ') || undefined },
  };
}

/** O YAML só é baixado quando uma nota tem um bloco ```chart (deixa o app mais leve). */
export async function parseObsidianChart(text: string): Promise<ChartParse> {
  let data: unknown;
  try {
    const { parse } = await import('yaml');
    data = parse(text, { maxAliasCount: 20 });
  } catch (e) {
    return { ok: false, error: `O YAML do gráfico tem um erro: ${e instanceof Error ? e.message.split('\n')[0].replace(/:\s*$/, '') : e}` };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'Esperava "type", "labels" e "series".' };
  const d = data as Record<string, unknown>;
  const type = String(d.type ?? 'bar').toLowerCase();
  let kind: ChartKind;
  let note: string | undefined;
  if (type === 'bar') kind = String(d.indexAxis ?? '').toLowerCase() === 'y' ? 'barras' : 'colunas';
  else if (type === 'line') kind = 'linha';
  else if (['pie', 'doughnut', 'polararea'].includes(type)) {
    kind = 'partes';
    note = PIE_NOTE;
  } else if (type === 'radar') {
    kind = 'colunas';
    note = 'Radar desenhado como colunas: comparar alturas lado a lado é mais fácil que comparar pontas de uma teia.';
  } else return { ok: false, error: `O tipo "${type}" ainda não é desenhado aqui. Use bar, line ou pie.` };

  const labels = Array.isArray(d.labels) ? d.labels.map((l) => String(l)) : null;
  if (!labels || labels.length === 0) return { ok: false, error: 'Faltou a lista "labels".' };
  if (!Array.isArray(d.series) || d.series.length === 0) return { ok: false, error: 'Faltou a lista "series".' };
  const series: ChartSpec['series'] = [];
  for (const [i, s] of d.series.slice(0, MAX_SERIES).entries()) {
    const item = (s ?? {}) as Record<string, unknown>;
    if (!Array.isArray(item.data)) return { ok: false, error: `A série ${i + 1} não tem "data".` };
    const values = item.data.map((v) => (typeof v === 'number' ? v : parseNumber(String(v ?? ''), false) ?? 0));
    series.push({ name: String(item.title ?? `Série ${i + 1}`), values: labels.map((_, j) => values[j] ?? 0) });
  }
  if (labels.length > MAX_ROWS) return { ok: false, error: `São ${labels.length} rótulos; o máximo é ${MAX_ROWS}.` };
  return { ok: true, spec: { kind, title: typeof d.title === 'string' ? d.title : undefined, labels, series, note } };
}
