import React from 'react';
import { Legend, formatNumber, seriesColor } from './chartKit';

export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Texto extra à direita do valor (ex.: "notas"). */
  hint?: string;
  /** Com várias séries (gráfico da nota): um valor por série, na ordem de seriesNames. */
  values?: number[];
}

interface BarListProps {
  items: BarItem[];
  /** Clique numa linha (ex.: abrir a tag ou a nota). */
  onSelect?: (item: BarItem) => void;
  ariaLabel: string;
  /** Nomes das séries, quando cada item tem mais de um valor (aparece a legenda). */
  seriesNames?: string[];
}

/**
 * Ranking em barras horizontais: o nome à esquerda, a barra fina (com a ponta arredondada)
 * e o valor logo depois da ponta. É uma série só, então todas as barras têm a mesma cor
 * (a da série 1): pintar cada uma de um jeito só repetiria o que o comprimento já mostra.
 * Feito em HTML, não em SVG: nomes longos quebram linha sozinhos e cada linha é um botão.
 */
export const BarList: React.FC<BarListProps> = ({ items, onSelect, ariaLabel, seriesNames }) => {
  const multi = (seriesNames?.length ?? 0) > 1;
  const valuesOf = (i: BarItem) => (multi ? i.values ?? [i.value] : [i.value]);
  const max = Math.max(1, ...items.flatMap((i) => valuesOf(i)));
  const bar = (value: number, color: string, hint?: string, key?: number) => (
    <span key={key} className="mt-1 flex items-center gap-2">
      <span
        className="h-2.5 rounded-r-[4px]"
        style={{ width: `max(${(Math.max(0, value) / max) * 100}%, 3px)`, maxWidth: 'calc(100% - 4.5rem)', background: color }}
      />
      <span className="text-xs text-neutral-400 whitespace-nowrap">
        <span className="font-medium text-neutral-200">{formatNumber(value)}</span>
        {hint ? ` ${hint}` : ''}
      </span>
    </span>
  );
  return (
    <div className="space-y-2">
    {multi && <Legend items={seriesNames!.map((name, i) => ({ name, color: seriesColor(i) }))} />}
    <ul aria-label={ariaLabel} className="space-y-1">
      {items.map((item) => {
        const content = (
          <>
            <span className="block text-sm text-neutral-200 truncate text-left">{item.label}</span>
            {multi
              ? valuesOf(item).map((v, j) => bar(v, seriesColor(j), undefined, j))
              : bar(item.value, seriesColor(0), item.hint)}
          </>
        );
        return (
          <li key={item.key}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="w-full rounded-lg px-2 py-1.5 -mx-2 hover:bg-neutral-900 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              >
                {content}
              </button>
            ) : (
              <div className="px-2 py-1.5 -mx-2">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
    </div>
  );
};

export default BarList;
