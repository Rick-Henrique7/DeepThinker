import React, { useEffect, useState } from 'react';
import { parseGrafico, parseObsidianChart, type ChartParse } from '../../lib/chartBlock';
import { ChartCard, OTHER_COLOR, seriesColor } from './chartKit';
import { ColumnChart } from './ColumnChart';
import { LineChart } from './LineChart';
import { BarList } from './BarList';
import { StackedBar } from './StackedBar';

interface NoteChartProps {
  /** O texto de dentro do bloco de código. */
  code: string;
  /** "grafico" (o nosso formato) ou "chart" (o do Obsidian Charts). */
  format: 'grafico' | 'chart';
}

/**
 * Desenha um bloco ```grafico ou ```chart de uma nota com as mesmas peças do Painel
 * (mesmas cores, tooltip e "Ver como tabela"). Se o texto tiver um erro, mostra o erro e o
 * texto original, para a pessoa corrigir: um gráfico quebrado nunca some em silêncio.
 */
export const NoteChart: React.FC<NoteChartProps> = ({ code, format }) => {
  const [parsed, setParsed] = useState<ChartParse | null>(() => (format === 'grafico' ? parseGrafico(code) : null));

  useEffect(() => {
    if (format === 'grafico') {
      setParsed(parseGrafico(code));
      return;
    }
    let cancelled = false;
    parseObsidianChart(code).then((r) => !cancelled && setParsed(r));
    return () => {
      cancelled = true;
    };
  }, [code, format]);

  if (!parsed) return <div className="my-3 h-40 rounded-2xl bg-neutral-900/50 animate-pulse" />;
  if (!parsed.ok) {
    return (
      <div className="my-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 not-prose">
        <p className="text-sm text-amber-200">Não consegui desenhar este gráfico. {parsed.error}</p>
        <pre className="text-xs text-neutral-400 whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  const { spec } = parsed;
  const table = {
    columns: ['', ...spec.series.map((s) => s.name)],
    rows: spec.labels.map((l, i) => [l, ...spec.series.map((s) => s.values[i] ?? 0)]),
  };
  const title = spec.title ?? (spec.series.length === 1 && spec.series[0].name !== 'Valor' ? spec.series[0].name : 'Gráfico');

  let chart: React.ReactNode;
  if (spec.kind === 'colunas') {
    chart = <ColumnChart ariaLabel={title} labels={spec.labels} series={spec.series} />;
  } else if (spec.kind === 'linha') {
    chart = (
      <LineChart
        ariaLabel={title}
        xType="category"
        categories={spec.labels}
        series={spec.series.map((s) => ({ name: s.name, points: s.values.map((y, x) => ({ x, y })) }))}
      />
    );
  } else if (spec.kind === 'barras') {
    chart = (
      <BarList
        ariaLabel={title}
        seriesNames={spec.series.map((s) => s.name)}
        items={spec.labels.map((label, i) => ({
          key: `${i}`,
          label,
          value: spec.series[0].values[i] ?? 0,
          values: spec.series.map((s) => s.values[i] ?? 0),
        }))}
      />
    );
  } else {
    // Partes de um todo: uma cor por fatia, na ordem fixa da paleta. Da 8ª em diante vira "Outras".
    const values = spec.series[0].values;
    const items = spec.labels.slice(0, 7).map((label, i) => ({ key: `${i}`, label, value: values[i] ?? 0, color: seriesColor(i) }));
    const rest = values.slice(7).reduce((s, v) => s + v, 0);
    if (spec.labels.length > 7) items.push({ key: 'outras', label: 'Outras', value: rest, color: OTHER_COLOR });
    chart = <StackedBar ariaLabel={title} items={items} />;
  }

  return (
    <div className="my-3 not-prose">
      <ChartCard title={title} table={table}>
        {chart}
        {spec.note && <p className="text-xs text-neutral-500">{spec.note}</p>}
      </ChartCard>
    </div>
  );
};

export default NoteChart;
