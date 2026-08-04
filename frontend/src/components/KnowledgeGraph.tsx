import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export interface NodeItem extends d3.SimulationNodeDatum {
  id: number;
  title: string;
}

export interface LinkItem extends d3.SimulationLinkDatum<NodeItem> {
  source: number | NodeItem;
  target: number | NodeItem;
}

interface KnowledgeGraphProps {
  nodes: NodeItem[];
  links: LinkItem[];
  onSelectNode?: (node: NodeItem) => void;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  nodes,
  links,
  onSelectNode,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || nodes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 500;

    // Limpa renderizações anteriores
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Cria o container principal do SVG com suporte a Zoom
    const g = svg.append('g');

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoomBehavior);

    // Cria cópia profunda dos dados para não alterar o estado React original na simulação
    const nodesCopy: NodeItem[] = nodes.map((d) => ({ ...d }));
    const linksCopy: LinkItem[] = links.map((d) => ({ ...d }));

    // Simulação de Forças do D3 (Física das Bolinhas)
    const simulation = d3
      .forceSimulation<NodeItem>(nodesCopy)
      .force(
        'link',
        d3
          .forceLink<NodeItem, LinkItem>(linksCopy)
          .id((d) => d.id)
          .distance(100)
      )
      .force('charge', d3.forceManyBody().strength(-250)) // Repulsão entre nós
      .force('center', d3.forceCenter(width / 2, height / 2)) // Atração para o centro
      .force('collide', d3.forceCollide(30)); // Evita sobreposição de nós

    // Renderiza os Links (Linhas do Grafo)
    const link = g
      .append('g')
      .attr('stroke', '#475569')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(linksCopy)
      .join('line')
      .attr('stroke-width', 1.5);

    // Renderiza o grupo dos Nós (Bolinhas + Texto)
    const node = g
      .append('g')
      .selectAll('.node')
      .data(nodesCopy)
      .join('g')
      .attr('class', 'node cursor-pointer')
      .call(
        (d3.drag<SVGGElement, NodeItem>() as any)
          .on('start', (event: any, d: NodeItem) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event: any, d: NodeItem) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event: any, d: NodeItem) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Adiciona o Círculo Neon no Nó
    node
      .append('circle')
      .attr('r', 8)
      .attr('fill', (d) => (d.id === selectedNodeId ? '#818cf8' : '#6366f1'))
      .attr('stroke', '#312e81')
      .attr('stroke-width', 2)
      .attr('class', 'transition-all duration-200 hover:scale-125');

    // Rótulos de Texto (Posicionados ACIMA do Nó)
    node
      .append('text')
      .text((d) => d.title)
      .attr('x', 0)                  // Centraliza horizontalmente em relação ao nó
      .attr('y', -16)                // Move o texto para CIMA da bolinha (como o raio é 10px, -16px dá um respiro perfeito)
      .attr('text-anchor', 'middle') // Garante que a palavra fique centralizada
      .attr('fill', '#f8fafc')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .attr('pointer-events', 'none')
      // Dica de Ouro: Adiciona um contorno escuro para o texto não embolar com as linhas de conexão do fundo
      .style('paint-order', 'stroke fill')
      .style('stroke', '#0f172a')
      .style('stroke-width', '3px')
      .style('stroke-linejoin', 'round');

    // Eventos de Clique no Nó
    node.on('click', (event, d) => {
      setSelectedNodeId(d.id);
      if (onSelectNode) onSelectNode(d);
    });

    // Atualização a cada frame do motor de física
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, links, selectedNodeId]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[550px] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
    >
      {nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm">
          <p>Nenhuma nota encontrada no grafo.</p>
          <p className="text-xs text-slate-600 mt-1">
            Crie novos pensamentos usando tags [[Nome da Nota]] para conectar.
          </p>
        </div>
      ) : (
        <svg ref={svgRef} className="w-full h-full" />
      )}

      {/* Legenda Flutuante */}
      <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-xs text-slate-400">
        💡 Arraste as bolinhas ou dê zoom com o scroll do mouse
      </div>
    </div>
  );
};