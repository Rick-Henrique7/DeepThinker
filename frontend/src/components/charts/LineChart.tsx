import React, { useMemo, useState } from 'react';
import * as d3 from 'd3';
import {
  AXIS_COLOR,
  ChartTooltip,
  GRID_COLOR,
  Legend,
  SURFACE_COLOR,
  formatCompact,
  formatNumber,
  seriesColor,
  useElementWidth,
} from './chartKit';

export interface LinePoint {
  /** Posição no eixo X: data em milissegundos (xType "time") ou índice da categoria. */
  x: number;
  y: number;
  /** Texto extra no tooltip (ex.: o título da nota). */
  label?: string;
  id?: number;
}

export interface LineSeries {
  name: string;
  points: LinePoint[];
  colorIndex?: number;
}

interface LineChartProps {
  series: LineSeries[];
  xType: 'time' | 'category';
  /** Nomes das categorias, quando xType = "category". */
  categories?: string[];
  height?: number;
  ariaLabel: string;
  /** Clique num ponto (ex.: abrir a nota). */
  onSelectPoint?: (p: LinePoint) => void;
  /**
   * Ligar os pontos com uma linha? Só faz sentido quando cada X tem um valor (ex.: o humor de
   * cada dia). Com várias notas no mesmo dia, a linha faria um zigue-zague vertical sem sentido:
   * aí ficam só os pontos.
   */
  connect?: boolean;
}

const MARGIN = { top: 16, right: 24, bottom: 24 };
const DAY = 86_400_000;
const fullDate = (ms: number) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
const hour = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** O rótulo do eixo depende do intervalo: horas (menos de 2 dias), dias, ou mês/ano (mais de 10 meses). */
function timeFormat(span: number): (ms: number) => string {
  if (span < 2 * DAY) return hour;
  if (span < 300 * DAY) return (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  return (ms) => new Date(ms).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
}

/**
 * Linhas de 2px com pontos de 8px (com um anel da cor do fundo, para aparecerem quando
 * cruzam outra linha). Uma linha vertical fina segue o mouse e "gruda" no X mais perto;
 * o tooltip mostra o valor de todas as séries naquele ponto.
 */
export const LineChart: React.FC<LineChartProps> = ({ series, xType, categories = [], height = 220, ariaLabel, onSelectPoint, connect = true }) => {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hoverX, setHoverX] = useState<number | null>(null);

  const geo = useMemo(() => {
    const pts = series.flatMap((s) => s.points);
    const ys = pts.map((p) => p.y);
    const y = d3
      .scaleLinear()
      .domain([Math.min(0, ...ys), Math.max(1, ...ys)])
      .nice(4);
    const ticks = y.ticks(4);
    const left = Math.max(...ticks.map((t) => formatCompact(t).length)) * 7 + 10;
    const innerW = Math.max(0, width - left - MARGIN.right);
    const innerH = height - MARGIN.top - MARGIN.bottom;
    y.range([innerH, 0]);
    const xs = Array.from(new Set(pts.map((p) => p.x))).sort((a, b) => a - b);
    let x: (v: number) => number;
    let xTicks: { v: number; label: string }[];
    let span = 0;
    if (xType === 'time') {
      const [a, b] = d3.extent(xs) as [number, number];
      span = b - a;
      const pad = a === b ? DAY : 0; // um ponto só: abre um dia para cada lado
      const t = d3.scaleTime().domain([a - pad, b + pad]).range([0, innerW]);
      x = (v) => t(v);
      const count = Math.max(2, Math.floor(innerW / 90));
      const fmt = timeFormat(span + 2 * pad);
      // Rótulos repetidos seguidos (ex.: dois ticks no mesmo dia) aparecem uma vez só.
      xTicks = t
        .ticks(count)
        .map((d) => ({ v: d.getTime(), label: fmt(d.getTime()) }))
        .filter((tk, i, all) => i === 0 || tk.label !== all[i - 1].label);
    } else {
      const p = d3.scalePoint<number>().domain(categories.map((_, i) => i)).range([0, innerW]).padding(0.3);
      x = (v) => p(v) ?? 0;
      const longest = Math.max(...categories.map((c) => c.length), 1);
      const step = Math.max(1, Math.ceil((longest * 6.2 + 8) / Math.max(1, p.step())));
      xTicks = categories.map((c, i) => ({ v: i, label: c })).filter((_, i) => i % step === 0);
    }
    return { y, ticks, left, innerW, innerH, x, xs, xTicks, span };
  }, [series, xType, categories, width, height]);

  const { y, ticks, left, innerW, innerH, x, xs, xTicks, span } = geo;
  const line = d3
    .line<LinePoint>()
    .x((p) => x(p.x))
    .y((p) => y(p.y));

  // O ponteiro escolhe o X mais perto (não precisa acertar a linha de 2px).
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best: number | null = null;
    let dist = Infinity;
    for (const v of xs) {
      const d = Math.abs(x(v) - px);
      if (d < dist) {
        dist = d;
        best = v;
      }
    }
    setHoverX(best);
  };

  // Rótulos no fim das linhas: se dois ficam colados (ex.: 8 e 7,5), um desce para não encavalar.
  const endLabels = new Map<number, number>();
  if (connect && series.length <= 4) {
    const ends = series
      .map((s, si) => {
        const last = [...s.points].sort((a, b) => a.x - b.x).pop();
        return last ? { si, y: y(last.y) } : null;
      })
      .filter((e): e is { si: number; y: number } => e !== null)
      .sort((a, b) => a.y - b.y);
    ends.forEach((e, i) => {
      const prev = i > 0 ? endLabels.get(ends[i - 1].si)! : -Infinity;
      endLabels.set(e.si, Math.max(e.y, prev + 12));
    });
  }

  const hovered = hoverX === null ? [] : series.flatMap((s, si) => s.points.filter((p) => p.x === hoverX).map((p) => ({ s, si, p })));
  const xTitle = (v: number) => (xType === 'time' ? (span < 2 * DAY ? `${fullDate(v)}, ${hour(v)}` : fullDate(v)) : categories[v] ?? '');

  return (
    <div className="space-y-2">
      {series.length > 1 && <Legend shape="line" items={series.map((s, i) => ({ name: s.name, color: seriesColor(s.colorIndex ?? i) }))} />}
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
            <g transform={`translate(${left},${MARGIN.top})`}>
              {ticks.map((t) => (
                <g key={t} transform={`translate(0,${y(t)})`}>
                  <line x1={0} x2={innerW} stroke={t === 0 ? AXIS_COLOR : GRID_COLOR} shapeRendering="crispEdges" />
                  <text x={-8} dy="0.32em" textAnchor="end" className="fill-neutral-500 text-[11px] tabular-nums">
                    {formatCompact(t)}
                  </text>
                </g>
              ))}
              {xTicks.map((t) => (
                <text key={t.v} x={x(t.v)} y={innerH + 16} textAnchor="middle" className="fill-neutral-500 text-[11px]">
                  {t.label}
                </text>
              ))}

              {hoverX !== null && <line x1={x(hoverX)} x2={x(hoverX)} y1={0} y2={innerH} stroke={AXIS_COLOR} />}

              {series.map((s, si) => {
                const pts = [...s.points].sort((a, b) => a.x - b.x);
                const color = seriesColor(s.colorIndex ?? si);
                return (
                  <g key={s.name}>
                    {connect && pts.length > 1 && (
                      <path d={line(pts) ?? ''} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    )}
                    {pts.map((p, i) => (
                      <circle
                        key={`${p.x}-${i}`}
                        cx={x(p.x)}
                        cy={y(p.y)}
                        r={hoverX === p.x ? 5 : 4}
                        fill={color}
                        stroke={SURFACE_COLOR}
                        strokeWidth={2}
                      />
                    ))}
                    {/* Rótulo direto no fim da linha (com várias séries, a legenda também diz quem é quem) */}
                    {connect && pts.length > 0 && series.length <= 4 && (
                      <text
                        x={Math.min(innerW, x(pts[pts.length - 1].x)) + 8}
                        y={endLabels.get(si) ?? y(pts[pts.length - 1].y)}
                        dy="0.32em"
                        className="fill-neutral-300 text-[11px] font-medium"
                      >
                        {formatCompact(pts[pts.length - 1].y)}
                      </text>
                    )}
                  </g>
                );
              })}

              <rect
                x={0}
                y={0}
                width={innerW}
                height={innerH}
                fill="transparent"
                onPointerMove={onMove}
                onPointerDown={onMove}
                onPointerLeave={() => setHoverX(null)}
                onClick={() => hovered[0] && onSelectPoint?.(hovered[0].p)}
                style={{ cursor: onSelectPoint && hovered.length ? 'pointer' : 'default' }}
              />
            </g>
          </svg>
        )}
        {hoverX !== null && hovered.length > 0 && (
          <ChartTooltip
            x={left + x(hoverX)}
            y={MARGIN.top + y(hovered[0].p.y)}
            containerWidth={width}
            title={xTitle(hoverX)}
            rows={hovered.slice(0, 6).map(({ s, si, p }) => ({
              name: p.label ?? s.name,
              value: formatNumber(p.y),
              color: seriesColor(s.colorIndex ?? si),
            }))}
          />
        )}
      </div>
    </div>
  );
};

export default LineChart;
