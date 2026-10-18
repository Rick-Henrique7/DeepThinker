import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { THEME_EVENT, themeColor, themeNumber } from '../lib/theme';
import { Play, RotateCcw, SlidersHorizontal, X } from 'lucide-react';

export interface NodeItem extends d3.SimulationNodeDatum {
  id: number;
  title: string;
  /** Tags da nota (para filtrar o grafo por tag). */
  tags?: string[];
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

/**
 * Os mesmos controles do painel do grafo do Obsidian ("Forças" e "Exibição"),
 * nas mesmas escalas e com os mesmos valores padrão.
 */
export interface GraphSettings {
  centerStrength: number; // Força do centro, 0 a 1
  repelStrength: number; // Força de repulsão, 0 a 20
  linkStrength: number; // Força das ligações, 0 a 1
  linkDistance: number; // Distância das ligações, 30 a 500
  nodeSize: number; // Tamanho dos nós, 0,1 a 5
  linkThickness: number; // Espessura das ligações, 0,1 a 5
  textFade: number; // A partir de qual zoom os nomes aparecem, -3 a 3
  colorBy: 'densidade' | 'ligacoes';
  floating: boolean; // Nós flutuam de leve, como na água, depois que o grafo assenta
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  centerStrength: 0.52,
  repelStrength: 10,
  linkStrength: 1,
  linkDistance: 250,
  nodeSize: 1,
  linkThickness: 1,
  textFade: 0,
  colorBy: 'densidade',
  floating: true,
};

const SETTINGS_KEY = 'deepthinker.graph.settings';

function loadSettings(): GraphSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_GRAPH_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // sem localStorage (aba anônima, por exemplo): fica o padrão
  }
  return DEFAULT_GRAPH_SETTINGS;
}

/*
 * Os sliders usam a escala do Obsidian (repulsão 0–20, centro 0–1...). O d3-force usa
 * outras unidades, então convertemos com estas constantes, calibradas para o grafo ter
 * a cara do Obsidian: um disco redondo, aglomerados e "flores" de notas em volta das
 * notas mais citadas.
 */
const REPEL_SCALE = 60; // repulsão 10 -> carga -600
const CENTER_SCALE = 0.5; // centro 0,52 -> mola de 0,26 puxando para o meio
const LINK_SCALE = 0.5; // distância 250 -> molas de 125 unidades

/** Comprimento da mola, em unidades do grafo. */
const linkLength = (s: GraphSettings) => s.linkDistance * LINK_SCALE;

/** Raio igual ao do Obsidian: cresce com a raiz do número de ligações, entre 8 e 30. */
const baseRadius = (degree: number) => Math.max(8, Math.min(3 * Math.sqrt(degree + 1), 30));

/** Flutuação: quantos pixels de tela cada nó balança, e a velocidade. */
const FLOAT_PX = 3;
const FLOAT_SPEED = 0.55;

/** Tamanho do nome em relação ao comprimento das molas: cresce e diminui junto com o zoom. */
const LABEL_SCALE = 0.1;
/** Quanto tempo depois do último movimento as ligações voltam a ser desenhadas nítidas (ms). */
const CRISP_DELAY = 200;

/**
 * Cor por densidade ou por ligações: roxo (pouco), verde-água (médio), amarelo (muito).
 * As três cores vêm do tema (--graph-node-1/2/3), porque no tema claro precisam ser mais escuras.
 */
const makePalette = () =>
  d3.interpolateRgbBasis([themeColor('graph-node-1'), themeColor('graph-node-2'), themeColor('graph-node-3')]);

interface SimNode extends NodeItem {
  degree: number;
  /** 0 a 1: quanto a região em volta do nó está cheia de outros nós. */
  density: number;
  /** 0 a 1: posição do nó no ranking de número de ligações. */
  degreeRank: number;
  /** Posição desenhada: a da física mais a flutuação (a física não é alterada). */
  px?: number;
  py?: number;
}

type SimLink = d3.SimulationLinkDatum<SimNode>;

interface Engine {
  update: (prev: GraphSettings, next: GraphSettings) => void;
  animate: () => void;
}

/**
 * Grafo de conhecimento no estilo do Obsidian ("force-directed graph").
 *
 * A física tem só três forças, como no Obsidian:
 * 1. Repulsão (lei de Coulomb): todos os nós se empurram. O d3 usa o algoritmo
 *    Barnes-Hut, que trata grupos distantes como um nó só (O(N log N) em vez de O(N²)).
 * 2. Ligações (lei de Hooke): cada ligação é uma mola que puxa as duas notas.
 * 3. Centro: uma mola fraca puxa tudo para o meio, formando o disco redondo.
 * O atrito (velocityDecay) freia os nós a cada quadro até o grafo parar.
 *
 * O desenho é feito em <canvas>: com milhares de notas, o SVG criaria milhares de
 * elementos na página e travaria.
 *
 * Interação: clicar numa nota destaca ela e as vizinhas e abre a nota. Clicar no
 * fundo tira o destaque. Passar o mouse não faz nada.
 */
export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ nodes, links, onSelectNode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Ref para o clique chamar sempre a versão mais nova do callback sem reiniciar a física.
  const onSelectRef = useRef(onSelectNode);
  onSelectRef.current = onSelectNode;

  const [settings, setSettings] = useState<GraphSettings>(loadSettings);
  const [panelOpen, setPanelOpen] = useState(false);
  const settingsRef = useRef(settings);
  const engineRef = useRef<Engine | null>(null);

  // Memória entre recargas dos dados (por exemplo, depois de editar uma nota):
  // as posições, a câmera e a nota em destaque continuam onde estavam.
  const positionsRef = useRef(new Map<number, { x: number; y: number }>());
  const viewRef = useRef({ transform: d3.zoomIdentity, userMoved: false });
  const focusIdRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = settingsRef.current;
    settingsRef.current = settings;
    engineRef.current?.update(prev, settings);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // sem localStorage: os ajustes valem só até fechar a página
    }
  }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || nodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = ctx;
    // Camada das ligações (ver o desenho): fora da tela, colada no canvas a cada quadro
    const linkCanvas = document.createElement('canvas');
    const lc = linkCanvas.getContext('2d')!;
    let lastMotion = 0;
    let crispTimer = 0;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = container.clientWidth;
    let height = container.clientHeight || 500;

    // ---------- Dados ----------
    // Cópias: a simulação escreve x/y nos objetos, e o estado do React não deve mudar.
    const saved = positionsRef.current;
    const simNodes: SimNode[] = nodes.map((d) => {
      const p = saved.get(d.id);
      return { ...d, x: p?.x, y: p?.y, vx: 0, vy: 0, degree: 0, density: 0, degreeRank: 0 };
    });
    const byId = new Map(simNodes.map((d) => [d.id, d]));
    const idOf = (v: number | NodeItem) => (typeof v === 'object' ? v.id : v);
    const simLinks: SimLink[] = [];
    for (const l of links) {
      const s = byId.get(idOf(l.source));
      const t = byId.get(idOf(l.target));
      if (s && t && s !== t) simLinks.push({ source: s, target: t });
    }

    // Grau (número de ligações) e vizinhos de cada nota
    const neighbors = new Map<number, Set<number>>(simNodes.map((n) => [n.id, new Set<number>()]));
    for (const l of simLinks) {
      const s = l.source as SimNode;
      const t = l.target as SimNode;
      s.degree++;
      t.degree++;
      neighbors.get(s.id)!.add(t.id);
      neighbors.get(t.id)!.add(s.id);
    }
    const degrees = simNodes.map((n) => n.degree).sort(d3.ascending);
    for (const n of simNodes) {
      n.degreeRank = d3.bisectLeft(degrees, n.degree) / Math.max(1, degrees.length - 1);
    }

    // Posição inicial em espiral (a mesma ideia do d3), na escala da distância das ligações
    const golden = Math.PI * (3 - Math.sqrt(5));
    const spiral = (n: SimNode, i: number) => {
      const r = linkLength(settingsRef.current) * 0.3 * Math.sqrt(0.5 + i);
      n.x = r * Math.cos(i * golden);
      n.y = r * Math.sin(i * golden);
      n.vx = 0;
      n.vy = 0;
    };
    const knownCount = simNodes.filter((n) => n.x !== undefined).length;
    simNodes.forEach((n, i) => {
      if (n.x !== undefined) return;
      // Nota nova num grafo que já existia: nasce perto de uma vizinha
      const near = [...neighbors.get(n.id)!].map((id) => byId.get(id)!).find((m) => m.x !== undefined);
      if (near && knownCount > 0) {
        const jitter = linkLength(settingsRef.current) * 0.5;
        n.x = near.x! + (Math.random() - 0.5) * jitter;
        n.y = near.y! + (Math.random() - 0.5) * jitter;
      } else {
        spiral(n, i);
      }
    });

    const radius = (n: SimNode, s: GraphSettings) => s.nodeSize * baseRadius(n.degree);

    // ---------- Física ----------
    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force('charge', d3.forceManyBody<SimNode>().theta(0.9)) // 1. repulsão (Barnes-Hut)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks)) // 2. molas
      .force('x', d3.forceX<SimNode>(0)) // 3. centro
      .force('y', d3.forceY<SimNode>(0))
      .velocityDecay(0.4) // atrito: tira 40% da velocidade a cada quadro
      // Esfria devagar (~700 quadros, uns 11 segundos): dá tempo de chegar ao equilíbrio redondo
      .alphaDecay(0.01)
      .stop();

    const applyForces = (s: GraphSettings) => {
      (simulation.force('charge') as d3.ForceManyBody<SimNode>).strength(-s.repelStrength * REPEL_SCALE);
      (simulation.force('link') as d3.ForceLink<SimNode, SimLink>)
        .distance(linkLength(s))
        // Mola um pouco mais fraca entre notas muito ligadas, para o grafo não tremer
        .strength(
          (l) =>
            s.linkStrength /
            Math.sqrt(Math.max(1, Math.min((l.source as SimNode).degree, (l.target as SimNode).degree)))
        );
      (simulation.force('x') as d3.ForceX<SimNode>).strength(s.centerStrength * CENTER_SCALE);
      (simulation.force('y') as d3.ForceY<SimNode>).strength(s.centerStrength * CENTER_SCALE);
    };
    applyForces(settingsRef.current);

    // Densidade local: quantos nós estão perto de cada nó (busca rápida com quadtree).
    const measureDensity = () => {
      const R = linkLength(settingsRef.current) * 1.5;
      const tree = d3
        .quadtree<SimNode>()
        .x((d) => d.x!)
        .y((d) => d.y!)
        .addAll(simNodes);
      const counts = simNodes.map((n) => {
        let count = 0;
        tree.visit((q, x0, y0, x1, y1) => {
          if (!q.length) {
            let leaf: d3.QuadtreeLeaf<SimNode> | undefined = q as d3.QuadtreeLeaf<SimNode>;
            do {
              const dx = leaf.data.x! - n.x!;
              const dy = leaf.data.y! - n.y!;
              if (dx * dx + dy * dy < R * R) count++;
            } while ((leaf = leaf.next));
          }
          return x0 > n.x! + R || x1 < n.x! - R || y0 > n.y! + R || y1 < n.y! - R;
        });
        return count;
      });
      // Posição no ranking (0 = região mais vazia, 1 = mais cheia): usa a paleta inteira
      const sorted = [...counts].sort(d3.ascending);
      simNodes.forEach((n, i) => {
        const target = d3.bisectLeft(sorted, counts[i]) / Math.max(1, sorted.length - 1);
        n.density += (target - n.density) * 0.5; // suaviza para a cor não piscar
      });
    };

    const savePositions = () => {
      positionsRef.current = new Map(simNodes.map((n) => [n.id, { x: n.x!, y: n.y! }]));
    };

    // ---------- Câmera (zoom e arrasto do fundo) ----------
    const sel = d3.select(canvas);
    let transform = viewRef.current.transform;
    let userMoved = viewRef.current.userMoved;
    let fitting = false;

    const fitTransform = () => {
      const [x0, x1] = d3.extent(simNodes, (d) => d.x!) as [number, number];
      const [y0, y1] = d3.extent(simNodes, (d) => d.y!) as [number, number];
      const pad = 40;
      const k = Math.min(
        1.4,
        (width - pad * 2) / Math.max(1, x1 - x0),
        (height - pad * 2) / Math.max(1, y1 - y0)
      );
      return d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(k)
        .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    };

    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.01, 8])
      .on('zoom', (event) => {
        transform = event.transform;
        if (fitting) return;
        lastMotion = performance.now();
        // Depois que a pessoa mexe no zoom, paramos de enquadrar o grafo sozinhos
        if (event.sourceEvent) userMoved = true;
        viewRef.current = { transform, userMoved };
        requestDraw();
      });

    // ---------- Clique e arrasto de nós ----------
    let focused: SimNode | null = focusIdRef.current != null ? byId.get(focusIdRef.current) ?? null : null;
    const setFocus = (n: SimNode | null) => {
      focused = n;
      focusIdRef.current = n?.id ?? null;
      requestDraw();
    };

    /** Nó embaixo do ponteiro (coordenadas da tela), com pelo menos 8px de área de clique. */
    const nodeAt = (px: number, py: number) => {
      const [x, y] = transform.invert([px, py]);
      const s = settingsRef.current;
      let best: SimNode | null = null;
      let bestDist = Infinity;
      for (const n of simNodes) {
        const r = Math.max(radius(n, s), 8 / transform.k);
        const d = (n.x! - x) ** 2 + (n.y! - y) ** 2;
        if (d < r * r && d < bestDist) {
          best = n;
          bestDist = d;
        }
      }
      return best;
    };

    // O "sujeito" do arrasto fica em coordenadas de TELA (x, y), com o nó guardado dentro.
    interface DragSubject {
      node: SimNode;
      x: number;
      y: number;
    }
    let downAt: [number, number] | null = null;
    const drag = d3
      .drag<HTMLCanvasElement, unknown, DragSubject | null>()
      .subject((event) => {
        const n = nodeAt(event.x, event.y);
        if (!n) return null; // sem nó embaixo: quem cuida é o zoom (arrasta o fundo)
        const [x, y] = transform.apply([n.x!, n.y!]);
        return { node: n, x, y };
      })
      .on('start', (event) => {
        const n = event.subject!.node;
        downAt = [event.x, event.y];
        if (!event.active && !reduceMotion) simulation.alphaTarget(0.3).restart();
        n.fx = n.x;
        n.fy = n.y;
      })
      .on('drag', (event) => {
        const n = event.subject!.node;
        const [x, y] = transform.invert([event.x, event.y]);
        lastMotion = performance.now();
        n.fx = x;
        n.fy = y;
        if (reduceMotion) {
          n.x = x;
          n.y = y;
          requestDraw();
        }
      })
      .on('end', (event) => {
        const n = event.subject!.node;
        if (!event.active) simulation.alphaTarget(0);
        n.fx = null;
        n.fy = null;
        // Moveu menos de 4px? Então foi um clique: destaca e abre a nota.
        if (downAt && Math.hypot(event.x - downAt[0], event.y - downAt[1]) < 4) {
          setFocus(n);
          onSelectRef.current?.(n);
        }
        downAt = null;
        savePositions();
      });

    // Ordem importa: o arrasto de nó vem antes do zoom, que fica com os cliques no fundo.
    sel.call(drag).call(zoom).on('dblclick.zoom', null);
    if (userMoved) sel.call(zoom.transform, transform);

    // Clique no fundo (sem arrastar) tira o destaque.
    sel.on('click.focus', (event: MouseEvent) => {
      const [px, py] = d3.pointer(event);
      if (focused && !nodeAt(px, py)) setFocus(null);
    });

    // ---------- Desenho ----------
    type ThemeCache = { col: ReturnType<typeof readCol>; palette: (t: number) => string };
    const readCol = () => ({
      halo: themeColor('graph-halo', 0.9),
        label: themeColor('graph-label', 0.9),
        focus: themeColor('graph-focus'),
        accent: themeColor('accent'),
        accentLink: themeColor('accent', 0.9),
        link: themeColor('graph-link', themeNumber('graph-link-a', 0.3)),
        linkDim: themeColor('graph-link', 0.05),
        ring: themeColor('graph-bg', themeNumber('graph-ring-a', 0)),
        hasRing: themeNumber('graph-ring-a', 0) > 0,
    });
    const readTheme = (): ThemeCache => ({ col: readCol(), palette: makePalette() });
    let theme: ThemeCache | null = null;
    const onTheme = () => {
      theme = null;
      requestDraw();
    };
    let frame = 0;
    const requestDraw = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const draw = () => {
      frame = 0;
      const s = settingsRef.current;
      if (!userMoved) {
        fitting = true;
        sel.call(zoom.transform, fitTransform());
        fitting = false;
      }
      const k = transform.k;
      // Cores do tema: lidas do CSS só quando o tema muda (com a flutuação, o desenho roda todo quadro)
      if (!theme) theme = readTheme();
      const { col, palette } = theme;

      // Flutuação: cada nó balança num ritmo próprio (fase tirada do id), só no desenho.
      // Assim o grafo parece vivo sem mexer na física nem gastar CPU com a simulação.
      const floating = s.floating && !reduceMotion && !document.hidden;
      const t = performance.now() / 1000 * FLOAT_SPEED;
      const amp = floating ? FLOAT_PX / k : 0;
      for (const n of simNodes) {
        const ph = n.id * 2.399;
        n.px = n.x! + Math.sin(t + ph) * amp;
        n.py = n.y! + Math.cos(t * 0.8 + ph * 1.7) * amp;
      }

      // Ligações: são o que mais pesa no desenho (milhares de linhas finas e translúcidas).
      // Enquanto algo se mexe (arrasto, zoom, física, flutuação) elas vão numa camada à parte
      // com densidade 1x, que custa 4x menos numa tela retina; parado, voltam nítidas.
      const busy = floating || performance.now() - lastMotion < CRISP_DELAY;
      const ls = busy ? 1 : dpr;
      if (linkCanvas.width !== Math.round(width * ls) || linkCanvas.height !== Math.round(height * ls)) {
        linkCanvas.width = Math.round(width * ls);
        linkCanvas.height = Math.round(height * ls);
      }
      lc.setTransform(ls, 0, 0, ls, 0, 0);
      lc.clearRect(0, 0, width, height);
      lc.translate(transform.x, transform.y);
      lc.scale(k, k);
      lc.lineWidth = Math.max(s.linkThickness * 1.2, 0.8 / k);
      lc.strokeStyle = focused ? col.linkDim : col.link;
      lc.beginPath();
      for (const l of simLinks) {
        const a = l.source as SimNode;
        const b = l.target as SimNode;
        lc.moveTo(a.px!, a.py!);
        lc.lineTo(b.px!, b.py!);
      }
      lc.stroke();

      if (focused) {
        lc.lineWidth = Math.max(s.linkThickness * 2, 1.2 / k);
        lc.strokeStyle = col.accentLink;
        lc.beginPath();
        for (const l of simLinks) {
          const a = l.source as SimNode;
          const b = l.target as SimNode;
          if (a === focused || b === focused) {
            lc.moveTo(a.px!, a.py!);
            lc.lineTo(b.px!, b.py!);
          }
        }
        lc.stroke();
      }
      // Parou de mexer: redesenha uma vez com as ligações nítidas
      clearTimeout(crispTimer);
      if (busy && !floating && ls !== dpr) crispTimer = window.setTimeout(requestDraw, CRISP_DELAY);

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, width, height);
      c.drawImage(linkCanvas, 0, 0, width, height);
      c.save();
      c.translate(transform.x, transform.y);
      c.scale(k, k);

      // Só desenha o que está na tela
      const [vx0, vy0] = transform.invert([0, 0]);
      const [vx1, vy1] = transform.invert([width, height]);
      const margin = 40 / k;
      const onScreen = (n: SimNode) =>
        n.px! > vx0 - margin && n.px! < vx1 + margin && n.py! > vy0 - margin && n.py! < vy1 + margin;

      const focusSet = focused ? neighbors.get(focused.id)! : null;
      const lit = (n: SimNode) => !focused || n === focused || focusSet!.has(n.id);

      // Nós
      for (const n of simNodes) {
        if (!onScreen(n)) continue;
        const t = s.colorBy === 'ligacoes' ? n.degreeRank : n.density;
        c.globalAlpha = lit(n) ? 1 : 0.12;
        c.fillStyle = n === focused ? col.focus : palette(t);
        c.beginPath();
        c.arc(n.px!, n.py!, Math.max(radius(n, s), 1.3 / k), 0, Math.PI * 2);
        c.fill();
        if (col.hasRing) {
          // Só no tema claro: contorno da cor do fundo, para o nó não se misturar às linhas
          c.strokeStyle = col.ring;
          c.lineWidth = 1.2 / k;
          c.stroke();
        }
      }
      c.globalAlpha = 1;
      if (focused) {
        c.strokeStyle = col.accent;
        c.lineWidth = 2 / k;
        c.beginPath();
        c.arc(focused.px!, focused.py!, Math.max(radius(focused, s), 1.3 / k) + 4 / k, 0, Math.PI * 2);
        c.stroke();
      }

      // Nomes embaixo dos nós, como no Obsidian. Eles têm tamanho no "mundo" do grafo
      // e aparecem aos poucos conforme o zoom aumenta. Com uma nota em destaque,
      // só ela e as vizinhas mostram o nome, sempre legível.
      // O nome aparece quando passa de ~6px na tela; o slider muda esse limite.
      const labelWorld = linkLength(s) * LABEL_SCALE;
      const minPx = 6 - s.textFade * 1.5;
      const fade = Math.min(1, Math.max(0, (labelWorld * k - minPx) / 3));
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.lineJoin = 'round';
      c.strokeStyle = col.halo;
      for (const n of simNodes) {
        if (!onScreen(n)) continue;
        const isLit = focused !== null && lit(n);
        const alpha = focused ? (isLit ? 1 : 0) : fade;
        if (alpha < 0.02) continue;
        let size = Math.min(labelWorld, 13 / k); // no máximo 13px na tela
        if (isLit) size = Math.max(size, 12 / k);
        c.globalAlpha = alpha;
        c.font = `500 ${size}px 'Geist Variable', system-ui, sans-serif`;
        c.lineWidth = size * 0.3;
        c.fillStyle = n === focused ? col.focus : col.label;
        const y = n.py! + Math.max(radius(n, s), 1.3 / k) + size * 0.3;
        c.strokeText(n.title, n.px!, y);
        c.fillText(n.title, n.px!, y);
      }
      c.globalAlpha = 1;
      c.restore();
      // Com flutuação ligada, pede o próximo quadro (o rAF pausa sozinho com a aba oculta)
      if (floating) requestDraw();
    };

    // ---------- Liga tudo ----------
    let ticks = 0;
    simulation.on('tick', () => {
      lastMotion = performance.now();
      if (ticks++ % 5 === 0) measureDensity();
      requestDraw();
    });
    simulation.on('end', () => {
      measureDensity();
      savePositions();
      requestDraw();
    });

    const settle = () => {
      // Sem animação (prefers-reduced-motion): calcula o equilíbrio de uma vez
      for (let i = 0; i < 700; i++) simulation.tick();
      for (let i = 0; i < 3; i++) measureDensity();
      savePositions();
      requestDraw();
    };

    const resize = () => {
      width = container.clientWidth;
      height = container.clientHeight || 500;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      requestDraw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    // Trocou o tema em Configurações: só redesenha com as cores novas (a física não muda)
    window.addEventListener(THEME_EVENT, onTheme);

    if (reduceMotion) {
      settle();
    } else {
      // Grafo que já estava na tela (dados recarregados) só se acomoda; grafo novo "explode" do centro
      simulation.alpha(knownCount > simNodes.length / 2 ? 0.3 : 1).restart();
    }

    engineRef.current = {
      update(prev, next) {
        const physicsChanged =
          prev.centerStrength !== next.centerStrength ||
          prev.repelStrength !== next.repelStrength ||
          prev.linkStrength !== next.linkStrength ||
          prev.linkDistance !== next.linkDistance;
        if (physicsChanged) {
          applyForces(next);
          if (reduceMotion) settle();
          else simulation.alpha(Math.max(simulation.alpha(), 0.3)).restart();
        }
        requestDraw();
      },
      // Igual ao botão "Animar" do Obsidian: recomeça do zero e o grafo se organiza de novo
      animate() {
        simNodes.forEach(spiral);
        userMoved = false;
        viewRef.current = { transform, userMoved };
        if (reduceMotion) settle();
        else simulation.alpha(1).restart();
      },
    };

    return () => {
      engineRef.current = null;
      simulation.stop();
      savePositions();
      ro.disconnect();
      window.removeEventListener(THEME_EVENT, onTheme);
      cancelAnimationFrame(frame);
      clearTimeout(crispTimer);
      sel.on('.zoom', null).on('.drag', null).on('click.focus', null);
    };
  }, [nodes, links]);

  const set = <K extends keyof GraphSettings>(key: K) => (value: GraphSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[calc(100dvh-18.5rem)] sm:h-[calc(100dvh-19.5rem)] lg:h-[calc(100dvh-15rem)] min-h-[320px] baixa:h-[calc(100dvh-1.5rem)] baixa:min-h-[260px] graph-backdrop border border-white/[0.08] rounded-2xl overflow-hidden touch-none"
    >
      {nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-neutral-500 text-sm">
          <p>Nenhuma nota encontrada no grafo.</p>
          <p className="text-xs text-neutral-600 mt-1">
            Crie pensamentos usando [[Título da Nota]] para conectar.
          </p>
        </div>
      ) : (
        <>
          <canvas ref={canvasRef} className="block w-full h-full" />

          {/* Painel de ajustes, como o do Obsidian. No celular em pé ele vira uma folha embaixo,
              para o grafo continuar aparecendo em cima enquanto a pessoa mexe nos controles. */}
          <div
            className={`absolute pointer-events-none flex flex-col ${
              panelOpen
                ? 'left-2 right-2 bottom-2 top-[40%] justify-end sm:justify-start sm:right-auto sm:top-3 sm:left-3 sm:bottom-3 baixa:justify-start baixa:right-auto baixa:top-2'
                : 'top-3 left-3 bottom-3'
            }`}
          >
            {panelOpen ? (
              <div className="pointer-events-auto w-full sm:w-60 baixa:w-60 max-h-full overflow-y-auto rounded-xl border border-white/[0.08] bg-black/80 backdrop-blur-md p-3 space-y-4 text-neutral-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Ajustes do grafo</span>
                  <button
                    type="button"
                    onClick={() => setPanelOpen(false)}
                    aria-label="Fechar ajustes"
                    className="p-1 -m-1 rounded-md text-neutral-500 hover:text-neutral-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <PanelSection title="Forças">
                  <Slider label="Força do centro" min={0} max={1} step={0.01} value={settings.centerStrength} onChange={set('centerStrength')} />
                  <Slider label="Força de repulsão" min={0} max={20} step={0.1} value={settings.repelStrength} onChange={set('repelStrength')} />
                  <Slider label="Força das ligações" min={0} max={1} step={0.01} value={settings.linkStrength} onChange={set('linkStrength')} />
                  <Slider label="Distância das ligações" min={30} max={500} step={1} value={settings.linkDistance} onChange={set('linkDistance')} />
                </PanelSection>

                <PanelSection title="Exibição">
                  <Slider label="Tamanho dos nós" min={0.1} max={5} step={0.1} value={settings.nodeSize} onChange={set('nodeSize')} />
                  <Slider label="Espessura das ligações" min={0.1} max={5} step={0.1} value={settings.linkThickness} onChange={set('linkThickness')} />
                  <Slider label="Mostrar nomes (menos ↔ mais)" min={-3} max={3} step={0.1} value={settings.textFade} onChange={set('textFade')} />
                  <div className="space-y-1.5">
                    <span className="block text-[11px] text-neutral-400">Cor dos nós por</span>
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.04] p-0.5">
                      {(['densidade', 'ligacoes'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => set('colorBy')(mode)}
                          className={`rounded-md py-1 text-[11px] transition-colors ${
                            settings.colorBy === mode ? 'bg-white text-black' : 'text-neutral-400 hover:text-neutral-100'
                          }`}
                        >
                          {mode === 'densidade' ? 'Densidade' : 'Ligações'}
                        </button>
                      ))}
                    </div>
                  </div>
                </PanelSection>

                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.floating}
                  onClick={() => set('floating')(!settings.floating)}
                  className="w-full flex items-center justify-between rounded-lg border border-white/[0.12] px-2.5 py-1.5 text-[11px] text-neutral-300 hover:text-neutral-100"
                >
                  <span>Flutuar</span>
                  <span className={settings.floating ? 'text-accent' : 'text-neutral-500'}>
                    {settings.floating ? 'Ligado' : 'Desligado'}
                  </span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => engineRef.current?.animate()}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white text-black py-1.5 text-[11px] font-medium"
                  >
                    <Play className="h-3 w-3" /> Animar
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings(DEFAULT_GRAPH_SETTINGS)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.12] py-1.5 text-[11px] text-neutral-300 hover:text-neutral-100"
                  >
                    <RotateCcw className="h-3 w-3" /> Padrão
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="pointer-events-auto self-start flex items-center gap-1.5 min-h-[44px] fino:min-h-0 rounded-full border border-white/[0.08] bg-black/60 backdrop-blur-md px-3 py-1.5 text-xs text-neutral-300 hover:text-neutral-100"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Ajustes
              </button>
            )}
          </div>

          <div className="absolute bottom-3 right-3 hidden sm:block rounded-full border border-white/[0.08] bg-black/60 backdrop-blur-md px-3 py-1.5 text-xs text-neutral-500 pointer-events-none">
            {nodes.length} notas · {links.length} ligações
          </div>
        </>
      )}
    </div>
  );
};

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-[10px] uppercase tracking-wider text-neutral-500">{title}</h3>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex justify-between gap-2 text-[11px] text-neutral-400">
        <span>{label}</span>
        <span className="tabular-nums text-neutral-500">{Math.round(value * 100) / 100}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-[rgb(var(--accent))] cursor-pointer"
      />
    </label>
  );
}
