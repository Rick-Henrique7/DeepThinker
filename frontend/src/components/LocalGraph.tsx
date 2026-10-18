import React, { useMemo } from 'react';
import * as d3 from 'd3';
import type { NodeItem, LinkItem } from './KnowledgeGraph';

interface LocalGraphProps {
  centerId: number;
  nodes: NodeItem[];
  links: LinkItem[];
  /** Quantos passos de distância mostrar (o Obsidian chama de "profundidade"). */
  depth?: 1 | 2;
  onOpen: (id: number) => void;
}

const MAX_NODES = 40;
const W = 460;
const H = 210;

type Pos = { id: number; title: string; level: number; x?: number; y?: number };

const idOf = (end: number | NodeItem) => (typeof end === 'number' ? end : end.id);

/**
 * Grafo local, como o do Obsidian: só a nota aberta e as vizinhas.
 *
 * 1. Busca em largura (BFS) a partir da nota: nível 1 = ligadas direto, nível 2 = vizinhas das vizinhas.
 * 2. Roda a física do d3-force 300 vezes de uma vez (sem animação) para achar posições.
 * 3. Desenha em SVG, que é leve para poucas dezenas de nós e fica nítido em qualquer zoom.
 */
export const LocalGraph: React.FC<LocalGraphProps> = ({ centerId, nodes, links, depth = 2, onOpen }) => {
  const layout = useMemo(() => {
    const neighbors = new Map<number, Set<number>>();
    const add = (a: number, b: number) => {
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      neighbors.get(a)!.add(b);
    };
    for (const l of links) {
      const s = idOf(l.source);
      const t = idOf(l.target);
      add(s, t);
      add(t, s);
    }

    const level = new Map<number, number>([[centerId, 0]]);
    let frontier = [centerId];
    for (let d = 1; d <= depth && level.size < MAX_NODES; d++) {
      const next: number[] = [];
      for (const id of frontier) {
        for (const n of neighbors.get(id) ?? []) {
          if (!level.has(n) && level.size < MAX_NODES) {
            level.set(n, d);
            next.push(n);
          }
        }
      }
      frontier = next;
    }

    const titles = new Map(nodes.map((n) => [n.id, n.title]));
    const pos: Pos[] = [...level.entries()]
      .filter(([id]) => titles.has(id))
      .map(([id, lv]) => ({ id, title: titles.get(id)!, level: lv }));
    const inside = new Set(pos.map((p) => p.id));
    const edges = links
      .map((l) => ({ source: idOf(l.source), target: idOf(l.target) }))
      .filter((l) => inside.has(l.source) && inside.has(l.target));

    const center = pos.find((p) => p.id === centerId);
    if (center) {
      center.x = 0;
      center.y = 0;
    }
    const sim = d3
      .forceSimulation(pos as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(edges.map((e) => ({ ...e }))).id((d) => (d as Pos).id).distance(60))
      .force('charge', d3.forceManyBody().strength(-180))
      .force('x', d3.forceX(0).strength(0.08))
      .force('y', d3.forceY(0).strength(0.12))
      .stop();
    if (center) {
      (center as d3.SimulationNodeDatum).fx = 0;
      (center as d3.SimulationNodeDatum).fy = 0;
    }
    sim.tick(300);

    // Encaixa tudo dentro da caixa, com margem para os nomes.
    const xs = pos.map((p) => p.x ?? 0);
    const ys = pos.map((p) => p.y ?? 0);
    const spanX = Math.max(1, Math.max(...xs.map(Math.abs))) * 2;
    const spanY = Math.max(1, Math.max(...ys.map(Math.abs))) * 2;
    const k = Math.min((W - 120) / spanX, (H - 50) / spanY, 1.6);
    const at = new Map(pos.map((p) => [p.id, { x: W / 2 + (p.x ?? 0) * k, y: H / 2 + (p.y ?? 0) * k }]));
    return { pos, edges, at };
  }, [centerId, nodes, links, depth]);

  if (layout.pos.length <= 1) {
    return (
      <p className="text-sm text-neutral-500 px-1">
        Esta nota ainda não se liga a nenhuma outra. Escreva [[ no texto para criar a primeira ligação.
      </p>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl border border-neutral-800 bg-neutral-950" role="img" aria-label="Grafo local da nota">
      <g stroke="rgb(var(--neutral-700))" strokeWidth={1}>
        {layout.edges.map((e, i) => {
          const a = layout.at.get(e.source)!;
          const b = layout.at.get(e.target)!;
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
        })}
      </g>
      {layout.pos.map((p) => {
        const { x, y } = layout.at.get(p.id)!;
        const isCenter = p.level === 0;
        const r = isCenter ? 8 : p.level === 1 ? 5.5 : 4;
        const label = p.title.length > 22 ? p.title.slice(0, 21) + '…' : p.title;
        return (
          <g
            key={p.id}
            className={isCenter ? '' : 'cursor-pointer'}
            onClick={() => !isCenter && onOpen(p.id)}
          >
            <title>{p.title}</title>
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={isCenter ? 'rgb(var(--accent))' : p.level === 1 ? 'rgb(var(--neutral-300))' : 'rgb(var(--neutral-600))'}
            />
            {p.level <= 1 || layout.pos.length <= 15 ? (
              <text
                x={x}
                y={y + r + 12}
                textAnchor="middle"
                fontSize={isCenter ? 12 : 10.5}
                fontWeight={isCenter ? 600 : 400}
                fill={isCenter ? 'rgb(var(--white))' : 'rgb(var(--neutral-400))'}
              >
                {label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
};

export default LocalGraph;
