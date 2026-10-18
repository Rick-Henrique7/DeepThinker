/**
 * Peças comuns dos gráficos do Deep thinker (Painel e blocos ```grafico).
 *
 * Regras que valem para todos (vindas de um guia de visualização de dados):
 * - cor de série vem de uma paleta fixa e conferida para daltonismo; a série 1 é sempre azul;
 * - texto nunca usa a cor da série (fica ilegível): a cor vai num traço ou quadradinho ao lado;
 * - todo gráfico tem "Ver como tabela", para quem não enxerga cor ou usa leitor de tela;
 * - o tooltip só complementa: o mesmo número está na tabela.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';

/** Cor da série i (0 a 7). Passou de 8? Junte o resto em "Outras" em vez de inventar cor. */
export const seriesColor = (i: number) => `rgb(var(--series-${Math.min(i, 7) + 1}))`;
/** Cinza para "Outras" e para o que fica de fundo. */
export const OTHER_COLOR = 'rgb(var(--neutral-600))';
export const GRID_COLOR = 'rgb(var(--neutral-800))';
export const AXIS_COLOR = 'rgb(var(--neutral-700))';
export const SURFACE_COLOR = 'rgb(var(--neutral-950))';

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** 1.284 / 12,9 mil / 4,2 mi */
export const formatCompact = (n: number) => (Math.abs(n) >= 10_000 ? compact.format(n) : plain.format(n));
export const formatNumber = (n: number) => plain.format(n);

/** Largura do elemento, atualizada quando a tela muda de tamanho (o SVG se ajusta). */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Barra com a ponta arredondada (4px) e a base reta, crescendo a partir da linha de base. */
export function barPath(x: number, width: number, base: number, end: number): string {
  const h = Math.abs(base - end);
  const r = Math.min(4, width / 2, h);
  if (h < 0.5) return '';
  if (end <= base) {
    // para cima
    return `M${x},${base}V${end + r}Q${x},${end} ${x + r},${end}H${x + width - r}Q${x + width},${end} ${x + width},${end + r}V${base}Z`;
  }
  // valor negativo: a ponta fica embaixo
  return `M${x},${base}V${end - r}Q${x},${end} ${x + r},${end}H${x + width - r}Q${x + width},${end} ${x + width},${end - r}V${base}Z`;
}

export interface TooltipRow {
  name: string;
  value: string;
  color?: string;
}

/** Caixa do tooltip: o valor em destaque, o nome da série mais apagado, um traço com a cor. */
export const ChartTooltip: React.FC<{ x: number; y: number; title: string; rows: TooltipRow[]; containerWidth: number }> = ({
  x,
  y,
  title,
  rows,
  containerWidth,
}) => {
  // Perto da borda direita, o tooltip abre para a esquerda.
  const left = x > containerWidth - 180 ? x - 12 : x + 12;
  const transform = x > containerWidth - 180 ? 'translate(-100%, -50%)' : 'translate(0, -50%)';
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 min-w-[8rem] max-w-[16rem] rounded-xl border border-neutral-700 bg-neutral-900/95 px-3 py-2 shadow-xl backdrop-blur"
      style={{ left, top: y, transform }}
    >
      <div className="text-[11px] text-neutral-400 truncate">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="mt-1 flex items-center gap-2">
          {r.color && <span aria-hidden className="h-[3px] w-3 rounded-full flex-shrink-0" style={{ background: r.color }} />}
          <span className="text-sm font-semibold text-white">{r.value}</span>
          <span className="text-xs text-neutral-400 truncate">{r.name}</span>
        </div>
      ))}
    </div>
  );
};

/** Legenda: sempre que há 2 séries ou mais. O símbolo imita a marca (barra = quadrado, linha = traço). */
export const Legend: React.FC<{ items: { name: string; color: string }[]; shape?: 'rect' | 'line' }> = ({ items, shape = 'rect' }) => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-300">
    {items.map((it) => (
      <li key={it.name} className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className={shape === 'rect' ? 'h-2.5 w-2.5 rounded-[3px]' : 'h-[3px] w-3.5 rounded-full'}
          style={{ background: it.color }}
        />
        {it.name}
      </li>
    ))}
  </ul>
);

export interface TableData {
  columns: string[];
  rows: (string | number)[][];
}

/** A "tabela gêmea" do gráfico: os mesmos números, lidos sem depender de cor nem de mouse. */
export const DataTable: React.FC<{ data: TableData }> = ({ data }) => (
  <div className="max-h-80 overflow-auto rounded-xl border border-neutral-800">
    <table className="min-w-full text-sm">
      <thead className="bg-neutral-900 sticky top-0">
        <tr>
          {data.columns.map((c) => (
            <th key={c} scope="col" className="px-3 py-1.5 text-left font-medium text-neutral-400 whitespace-nowrap">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-800/70">
        {data.rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td
                key={j}
                className={`px-3 py-1.5 whitespace-nowrap ${typeof cell === 'number' ? 'tabular-nums text-neutral-200' : 'text-neutral-300'}`}
              >
                {typeof cell === 'number' ? formatNumber(cell) : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

interface ChartCardProps {
  title: string;
  subtitle?: string;
  table?: TableData;
  className?: string;
  /** Algo à direita do título (ex.: um seletor). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/** O "cartão" de cada gráfico: título, subtítulo e o botão que troca gráfico por tabela. */
export const ChartCard: React.FC<ChartCardProps> = ({ title, subtitle, table, className = '', actions, children }) => {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className={`rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-3 min-w-0 ${className}`}>
      <figcaption className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-white">{title}</h3>
          {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {actions}
          {table && (
            <button
              type="button"
              onClick={() => setAsTable((v) => !v)}
              aria-pressed={asTable}
              className="inline-flex items-center gap-1.5 min-h-[44px] fino:min-h-[32px] px-2.5 rounded-lg text-xs text-neutral-400 whitespace-nowrap hover:text-white hover:bg-neutral-800/60"
            >
              {asTable ? <BarChart3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
              {asTable ? 'Ver gráfico' : 'Ver como tabela'}
            </button>
          )}
        </div>
      </figcaption>
      {asTable && table ? <DataTable data={table} /> : children}
    </figure>
  );
};

/** Quando não há dado suficiente: diz o que fazer para o gráfico aparecer. */
export const ChartEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="py-8 text-center text-sm text-neutral-500">{children}</p>
);
