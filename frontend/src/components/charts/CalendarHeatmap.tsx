import React, { useMemo, useState } from 'react';
import { ChartTooltip, useElementWidth } from './chartKit';
import { localIsoDate } from '../../lib/notes';

interface CalendarHeatmapProps {
  /** Quantas notas por dia, com a data no formato AAAA-MM-DD. */
  counts: Map<string, number>;
  /** Máximo de semanas (a largura da tela pode mostrar menos). */
  maxWeeks?: number;
  ariaLabel: string;
  /** Algo ao lado do calendário (ex.: os números de sequência). Sem espaço, desce para baixo dele. */
  aside?: React.ReactNode;
}

const CELL = 12;
const GAP = 3;
const LEFT = 26;
const TOP = 16;
const WEEKDAYS = ['seg', '', 'qua', '', 'sex', '', ''];

/** 0 = vazio; 1 a 4 = tons do mesmo azul (mais notas, mais forte). */
const level = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);
const fill = (lv: number) => (lv === 0 ? 'rgb(var(--neutral-800) / 0.6)' : `rgb(var(--heat-${lv}))`);

/**
 * "Dias em que você escreveu", como o calendário de contribuições do GitHub:
 * uma coluna por semana e uma linha por dia (segunda em cima). Um tom só de azul,
 * do mais fraco ao mais forte, porque aqui a cor mostra quantidade, não "quem é quem".
 */
export const CalendarHeatmap: React.FC<CalendarHeatmapProps> = ({ counts, maxWeeks = 53, ariaLabel, aside }) => {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; date: Date; n: number } | null>(null);

  // Quantas semanas cabem na largura disponível (no máximo maxWeeks; no mínimo 5, um mês).
  const weeks = Math.max(Math.min(5, maxWeeks), Math.min(maxWeeks, Math.floor((width - LEFT) / (CELL + GAP))));
  const svgWidth = LEFT + weeks * (CELL + GAP);
  const days = useMemo(() => {
    // Termina na semana de hoje; a semana começa na segunda (como no Brasil).
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const mondayOffset = (today.getDay() + 6) % 7;
    const start = new Date(today);
    start.setDate(today.getDate() - mondayOffset - (weeks - 1) * 7);
    const out: { date: Date; iso: string; col: number; row: number; future: boolean }[] = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push({ date: d, iso: localIsoDate(d), col: Math.floor(i / 7), row: i % 7, future: d > today });
    }
    return out;
  }, [weeks]);

  // Nome do mês em cima da primeira semana em que ele aparece.
  const months = days.filter((d) => d.row === 0 && d.date.getDate() <= 7);
  const height = TOP + 7 * (CELL + GAP);

  return (
    <div ref={ref} className="w-full flex flex-wrap items-start gap-x-10 gap-y-4">
      <div className="space-y-2 max-w-full overflow-x-auto" style={{ width: width > 0 ? svgWidth : undefined }}>
      <div className="relative" style={{ height, width: width > 0 ? svgWidth : undefined }}>
        {width > 0 && (
          <svg width={svgWidth} height={height} role="img" aria-label={ariaLabel} className="block">
            {months.map((m) => (
              <text key={m.iso} x={LEFT + m.col * (CELL + GAP)} y={10} className="fill-neutral-500 text-[10px]">
                {m.date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
              </text>
            ))}
            {WEEKDAYS.map((w, i) =>
              w ? (
                <text key={w} x={0} y={TOP + i * (CELL + GAP) + CELL - 2} className="fill-neutral-500 text-[10px]">
                  {w}
                </text>
              ) : null
            )}
            {days
              .filter((d) => !d.future)
              .map((d) => {
                const n = counts.get(d.iso) ?? 0;
                const x = LEFT + d.col * (CELL + GAP);
                const y = TOP + d.row * (CELL + GAP);
                return (
                  <rect
                    key={d.iso}
                    x={x}
                    y={y}
                    width={CELL}
                    height={CELL}
                    rx={3}
                    style={{ fill: fill(level(n)) }}
                    tabIndex={n > 0 ? 0 : -1}
                    aria-label={`${d.date.toLocaleDateString('pt-BR')}: ${n} ${n === 1 ? 'nota' : 'notas'}`}
                    onPointerEnter={() => setHover({ x: x + CELL / 2, y: y + CELL / 2, date: d.date, n })}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover({ x: x + CELL / 2, y: y + CELL / 2, date: d.date, n })}
                    onBlur={() => setHover(null)}
                    className="outline-none focus-visible:stroke-[rgb(var(--accent))]"
                  />
                );
              })}
          </svg>
        )}
        {hover && (
          <ChartTooltip
            x={hover.x}
            y={hover.y}
            containerWidth={svgWidth}
            title={hover.date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            rows={[{ name: hover.n === 1 ? 'nota criada ou editada' : 'notas criadas ou editadas', value: String(hover.n) }]}
          />
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-neutral-500" aria-hidden>
        menos
        {[0, 1, 2, 3, 4].map((lv) => (
          <span key={lv} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: fill(lv) }} />
        ))}
        mais
      </div>
      </div>
      {aside}
    </div>
  );
};

export default CalendarHeatmap;
