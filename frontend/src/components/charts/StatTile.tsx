import React from 'react';
import { formatCompact } from './chartKit';

interface StatTileProps {
  label: string;
  value: number;
  /** Linha de baixo, em texto secundário (ex.: "de 340 no total"). */
  detail?: string;
  onClick?: () => void;
}

/**
 * Um número que se explica sozinho: rótulo, valor grande e um detalhe.
 * O valor usa números proporcionais (não "tabulares"): em tamanho grande ficam mais bonitos.
 */
export const StatTile: React.FC<StatTileProps> = ({ label, value, detail, onClick }) => {
  const body = (
    <>
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="mt-1 text-2xl sm:text-3xl baixa:text-xl font-semibold text-white whitespace-nowrap">{formatCompact(value)}</div>
      {detail && <div className="mt-0.5 text-xs text-neutral-500 truncate">{detail}</div>}
    </>
  );
  const cls = 'rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 baixa:px-3 text-left min-w-0';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:border-neutral-600 focus:outline-none focus-visible:border-accent`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
};

export default StatTile;
