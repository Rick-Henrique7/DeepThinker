import React, { useState } from 'react';
import { formatNumber } from './chartKit';

export interface StackItem {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface StackedBarProps {
  items: StackItem[];
  ariaLabel: string;
}

const pct = (v: number, total: number) => (total ? Math.round((v / total) * 100) : 0);

/**
 * Parte do todo numa barra só (melhor que pizza para comparar fatias parecidas).
 * As fatias ficam separadas por 2px da cor do fundo, sem borda desenhada.
 * A legenda embaixo sempre mostra nome, quantidade e porcentagem: a cor nunca fala sozinha.
 */
export const StackedBar: React.FC<StackedBarProps> = ({ items, ariaLabel }) => {
  const [hover, setHover] = useState<string | null>(null);
  const total = items.reduce((s, i) => s + i.value, 0);
  const visible = items.filter((i) => i.value > 0);
  return (
    <div className="space-y-3">
      <div role="img" aria-label={ariaLabel} className="flex h-4 w-full gap-[2px]">
        {visible.map((it, i) => (
          <div
            key={it.key}
            title={`${it.label}: ${formatNumber(it.value)} (${pct(it.value, total)}%)`}
            onPointerEnter={() => setHover(it.key)}
            onPointerLeave={() => setHover(null)}
            className={`h-full transition-opacity ${i === visible.length - 1 ? 'rounded-r-[4px]' : ''}`}
            style={{
              flexGrow: it.value,
              flexBasis: 0,
              minWidth: 3,
              background: it.color,
              opacity: hover === null || hover === it.key ? 1 : 0.5,
            }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {items.map((it) => (
          <li
            key={it.key}
            onPointerEnter={() => setHover(it.key)}
            onPointerLeave={() => setHover(null)}
            className="flex items-center gap-2 min-w-0"
          >
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] flex-shrink-0" style={{ background: it.color }} />
            <span className="text-neutral-300 truncate">{it.label}</span>
            <span className="ml-auto text-neutral-400 whitespace-nowrap">
              <span className="font-medium text-neutral-200">{formatNumber(it.value)}</span> · {pct(it.value, total)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default StackedBar;
