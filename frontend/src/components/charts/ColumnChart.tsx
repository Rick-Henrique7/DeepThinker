import React, { useMemo, useState } from 'react';
import * as d3 from 'd3';
import {
  AXIS_COLOR,
  ChartTooltip,
  GRID_COLOR,
  Legend,
  barPath,
  formatCompact,
  formatNumber,
  seriesColor,
  useElementWidth,
} from './chartKit';

export interface ColumnSeries {
  name: string;
  values: number[];
  /** Posição fixa da cor (a cor segue a série, não a ordem em que aparece). */
  colorIndex?: number;
}

interface ColumnChartProps {
  labels: string[];
  series: ColumnSeries[];
  /** Altura total, já contando a faixa dos rótulos do eixo X. */
  height?: number;
  /** Texto completo para o tooltip de cada coluna (ex.: "Semana de 6 a 12 out"). */
  tooltipTitle?: (i: number) => string;
  /** Unidade no tooltip ("notas"). */
  unit?: (n: number) => string;
  ariaLabel: string;
}

const MARGIN = { top: 18, right: 8, bottom: 24 };

/**
 * Colunas (uma ou várias séries lado a lado), desenhadas em SVG com as escalas do d3.
 * - colunas finas (até 24px) com a ponta arredondada e 2px de espaço entre vizinhas;
 * - grade em linhas finas e discretas;
 * - rótulo direto só no maior valor e no último (nunca um número em cada coluna);
 * - passar o mouse ou o foco do teclado numa coluna mostra o tooltip com todas as séries.
 */
export const ColumnChart: React.FC<ColumnChartProps> = ({ labels, series, height = 200, tooltipTitle, unit, ariaLabel }) => {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const all = series.flatMap((s) => s.values);
    const max = Math.max(0, ...all);
    const min = Math.min(0, ...all);
    const y = d3.scaleLinear().domain([min, max || 1]).nice(4);
    const ticks = y.ticks(4);
    const left = Math.max(...ticks.map((t) => formatCompact(t).length)) * 7 + 10;
    const innerW = Math.max(0, width - left - MARGIN.right);
    const innerH = height - MARGIN.top - MARGIN.bottom;
    y.range([innerH, 0]);
    const x = d3.scaleBand<number>().domain(labels.map((_, i) => i)).range([0, innerW]).paddingInner(0.25).paddingOuter(0.1);
    const groupW = Math.min(x.bandwidth(), 24 * series.length + 2 * (series.length - 1));
    const barW = Math.max(1, (groupW - 2 * (series.length - 1)) / series.length);
    // Mostra só um rótulo a cada "step" colunas para os textos não se encostarem.
    const longest = Math.max(...labels.map((l) => l.length), 1);
    const step = Math.max(1, Math.ceil((longest * 6.2 + 8) / Math.max(1, x.step())));
    return { y, ticks, left, innerW, innerH, x, groupW, barW, step };
  }, [labels, series, width, height]);

  const { y, ticks, left, innerH, x, groupW, barW, step } = geo;
  const base = y(0);
  const single = series.length === 1;
  const values0 = series[0]?.values ?? [];
  const maxIndex = values0.length ? values0.indexOf(Math.max(...values0)) : -1;
  const labelled = new Set(single ? [maxIndex, values0.length - 1] : []);

  return (
    <div className="space-y-2">
      {!single && <Legend items={series.map((s, i) => ({ name: s.name, color: seriesColor(s.colorIndex ?? i) }))} />}
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
            <g transform={`translate(${left},${MARGIN.top})`}>
              {/* Grade e eixo Y */}
              {ticks.map((t) => (
                <g key={t} transform={`translate(0,${y(t)})`}>
                  <line x1={0} x2={geo.innerW} stroke={t === 0 ? AXIS_COLOR : GRID_COLOR} strokeWidth={1} shapeRendering="crispEdges" />
                  <text x={-8} dy="0.32em" textAnchor="end" className="fill-neutral-500 text-[11px] tabular-nums">
                    {formatCompact(t)}
                  </text>
                </g>
              ))}

              {labels.map((label, i) => {
                const bx = (x(i) ?? 0) + (x.bandwidth() - groupW) / 2;
                const active = hover === i;
                return (
                  <g key={i}>
                    {series.map((s, si) => {
                      const v = s.values[i] ?? 0;
                      const d = barPath(bx + si * (barW + 2), barW, base, y(v));
                      return d ? (
                        <path
                          key={s.name}
                          d={d}
                          style={{ fill: seriesColor(s.colorIndex ?? si), opacity: hover === null || active ? 1 : 0.55 }}
                        />
                      ) : null;
                    })}
                    {/* Rótulo direto: só no maior e no último valor (série única) */}
                    {labelled.has(i) && values0[i] > 0 && (
                      <text
                        x={bx + groupW / 2}
                        y={y(values0[i]) - 5}
                        textAnchor="middle"
                        className="fill-neutral-300 text-[11px] font-medium"
                      >
                        {formatCompact(values0[i])}
                      </text>
                    )}
                    {i % step === 0 && (
                      <text x={(x(i) ?? 0) + x.bandwidth() / 2} y={innerH + 16} textAnchor="middle" className="fill-neutral-500 text-[11px]">
                        {label}
                      </text>
                    )}
                    {/* Área de toque: a faixa inteira da coluna, maior que a própria barra */}
                    <rect
                      x={(x(i) ?? 0) - (x.step() - x.bandwidth()) / 2}
                      y={0}
                      width={x.step()}
                      height={innerH}
                      fill="transparent"
                      tabIndex={0}
                      role="graphics-symbol"
                      aria-label={`${tooltipTitle ? tooltipTitle(i) : label}: ${series
                        .map((s) => `${s.name} ${formatNumber(s.values[i] ?? 0)}`)
                        .join(', ')}`}
                      onPointerEnter={() => setHover(i)}
                      onPointerLeave={() => setHover(null)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                      className="outline-none focus-visible:stroke-[rgb(var(--accent))]"
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        {hover !== null && width > 0 && (
          <ChartTooltip
            x={left + (x(hover) ?? 0) + x.bandwidth() / 2}
            y={MARGIN.top + Math.min(innerH / 2, y(Math.max(...series.map((s) => s.values[hover] ?? 0))))}
            containerWidth={width}
            title={tooltipTitle ? tooltipTitle(hover) : labels[hover]}
            rows={series.map((s, si) => ({
              name: single ? (unit ? unit(s.values[hover] ?? 0) : s.name) : s.name,
              value: formatNumber(s.values[hover] ?? 0),
              color: seriesColor(s.colorIndex ?? si),
            }))}
          />
        )}
      </div>
    </div>
  );
};

export default ColumnChart;
