// Duas cenas do bento de Recursos:
//   initNotesTree  card 01 "Notas ligadas": uma árvore de notas que cresce de cima
//                  para baixo; cada [[link]] puxa uma linha até a nota citada.
//   initMiniGraph  card 02 "Grafo de conhecimento": um grafo pequeno que se organiza
//                  sozinho em grupos (clusters), com as ideias soltas à parte.
//
// As duas seguem a mesma regra de desempenho do resto do site: animação só enquanto
// o card está na tela, e nada rodando em laço quando não há nada mudando.

import { gsap } from 'gsap';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const svgNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs, parent) => {
  const node = document.createElementNS(svgNS, tag);
  Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
  parent?.append(node);
  return node;
};

// Observa se o elemento está na tela e chama onChange(true/false).
const watchVisible = (el, onChange) =>
  new IntersectionObserver(([e]) => onChange(e.isIntersecting)).observe(el);

// ---------------------------------------------------------------------------
// Notas ligadas: árvore de cima para baixo
// ---------------------------------------------------------------------------
export function initNotesTree(box) {
  if (!box) return;
  const svg = box.querySelector('[data-wires]');
  const note = (id) => box.querySelector(`[data-note="${id}"]`);
  const mark = (from, to) => note(from).querySelector(`[data-mark="${to}"]`);

  // [quem cita, quem é citado, nível]. O nível diz em que "onda" a linha cresce.
  const links = [
    ['habitos', 'rotina', 1],
    ['habitos', 'foco', 1],
    ['habitos', 'disciplina', 1],
    ['rotina', 'manha', 2],
    ['foco', 'sono', 2],
    ['disciplina', 'sono', 2],
  ];
  // Cada ligação tem duas linhas no mesmo caminho: a fixa e a "luz" que corre por cima.
  const wires = links.map(() => svgEl('path', {}, svg));
  const flows = links.map(() => svgEl('path', { class: 'flow' }, svg));

  // Sai do meio da borda de baixo da nota de cima e chega no meio da borda de cima da
  // nota de baixo. As alças da curva ficam na vertical, então ela "cai" como um galho.
  // offsetLeft/offsetTop ignoram o transform da entrada: medimos onde a nota vai parar.
  function layout() {
    links.forEach(([from, to], i) => {
      const a = note(from);
      const b = note(to);
      const x1 = a.offsetLeft + a.offsetWidth / 2;
      const y1 = a.offsetTop + a.offsetHeight;
      const x2 = b.offsetLeft + b.offsetWidth / 2;
      const y2 = b.offsetTop;
      const my = (y1 + y2) / 2;
      const d = `M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
      wires[i].setAttribute('d', d);
      flows[i].setAttribute('d', d);
    });
  }
  layout();
  document.fonts?.ready.then(layout);
  new ResizeObserver(layout).observe(box);

  if (reducedMotion) return;

  const all = [...box.querySelectorAll('[data-note]')];
  const lit = (el) => {
    el.classList.add('is-lit');
    gsap.delayedCall(0.9, () => el.classList.remove('is-lit'));
  };
  // Esconde a linha inteira: tracejado do tamanho dela, deslocado o mesmo tanto.
  const hide = (p) => {
    const len = p.getTotalLength();
    gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
  };

  gsap.set(all, { opacity: 0, y: -10, scale: 0.96 });
  wires.forEach(hide);

  const pop = { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'expo.out' };
  const grow = gsap.timeline({
    paused: true,
    onStart: () => wires.forEach(hide), // o layout pode ter mudado até aqui
    onComplete: () => {
      gsap.set(wires, { strokeDasharray: 'none' });
      startFlow();
    },
  });
  grow.to(note('habitos'), pop);
  // Uma onda por nível: o link acende na nota de cima, a linha desce e a nota de
  // baixo aparece quando a linha chega nela.
  [1, 2].forEach((level) => {
    const at = level === 1 ? '+=0.1' : '+=0.05';
    grow.addLabel(`l${level}`, at);
    links.forEach(([from, to, l], i) => {
      if (l !== level) return;
      const offset = (i % 3) * 0.12;
      grow.call(() => lit(mark(from, to)), null, `l${level}+=${offset}`);
      grow.to(wires[i], { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' }, `l${level}+=${offset}`);
      grow.to(note(to), pop, `l${level}+=${offset + 0.55}`);
      grow.call(() => lit(note(to)), null, `l${level}+=${offset + 0.6}`);
    });
  });

  let visible = false;
  let flowing = false;
  watchVisible(box, (v) => {
    visible = v;
    if (v && grow.progress() === 0) grow.play();
    if (v && flowing) nextFlow.resume();
    if (!v && flowing) nextFlow.pause();
  });

  // Depois de crescer, de tempos em tempos uma luz desce por um caminho da raiz até
  // uma folha e volta subindo. É o "funciona nos dois sentidos": quem cita e quem é citado.
  const paths = [
    [0, 3], // Hábitos > Rotina > Manhã
    [1, 4], // Hábitos > Foco > Sono
    [2, 5], // Hábitos > Disciplina > Sono
  ];
  let turn = 0;
  let nextFlow = gsap.delayedCall(0, () => {});
  function runFlow() {
    const [top, bottom] = paths[turn++ % paths.length];
    const seg = 26;
    const tl = gsap.timeline({ onComplete: () => (nextFlow = gsap.delayedCall(2.2, runFlow)) });
    const down = (i) => {
      const len = flows[i].getTotalLength();
      tl.set(flows[i], { strokeDasharray: `${seg} ${len + seg}`, strokeDashoffset: seg, opacity: 1 });
      tl.to(flows[i], { strokeDashoffset: -len, duration: 0.8, ease: 'power1.inOut' });
      tl.call(() => lit(note(links[i][1])));
      tl.set(flows[i], { opacity: 0 });
    };
    const up = (i) => {
      const len = flows[i].getTotalLength();
      tl.set(flows[i], { strokeDasharray: `${seg} ${len + seg}`, strokeDashoffset: -len, opacity: 1 });
      tl.to(flows[i], { strokeDashoffset: seg, duration: 0.8, ease: 'power1.inOut' });
      tl.call(() => lit(note(links[i][0])));
      tl.set(flows[i], { opacity: 0 });
    };
    down(top);
    down(bottom);
    tl.to({}, { duration: 0.3 });
    up(bottom);
    up(top);
    if (!visible) tl.pause();
    nextFlow = tl;
  }
  function startFlow() {
    flowing = true;
    nextFlow = gsap.delayedCall(1, runFlow);
    if (!visible) nextFlow.pause();
  }
}

// ---------------------------------------------------------------------------
// Grafo de conhecimento: grupos que se formam sozinhos
// ---------------------------------------------------------------------------
// É uma simulação de forças, a mesma ideia do grafo do app (d3-force), feita à mão:
//   - todo nó empurra os outros (repulsão), para ninguém ficar em cima de ninguém;
//   - cada ligação é uma mola que puxa os dois nós para perto;
//   - uma força fraca puxa tudo para o centro, para o grafo não fugir do card.
// Os nós começam embolados no meio. Com as molas, os que se ligam se juntam e os
// grupos aparecem sozinhos; os que não têm ligação nenhuma ficam afastados.
// A simulação roda só ~3 s e para (sem laço infinito); depois ficam só transições CSS.
export function initMiniGraph(svg) {
  if (!svg) return;
  const W = 200;
  const H = 120;

  // Números "aleatórios" fixos: o desenho sai sempre igual.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  // Três grupos de ideias e três ideias soltas.
  const groups = [10, 8, 6];
  const nodes = [];
  const edges = [];
  groups.forEach((size, g) => {
    const first = nodes.length;
    for (let k = 0; k < size; k++) {
      const i = nodes.length;
      nodes.push({ g });
      if (k === 0) continue;
      // Liga ao primeiro do grupo (o "tema") ou a outro já existente do grupo.
      const target = k < 3 || rand() < 0.35 ? first : first + Math.floor(rand() * k);
      edges.push([i, target]);
      if (rand() < 0.3 && k > 2) edges.push([i, first + 1 + Math.floor(rand() * (k - 1))]);
    }
  });
  // Pontes entre grupos: um grafo de verdade nunca tem ilhas perfeitas.
  edges.push([2, 11], [13, 19], [5, 21]);
  for (let k = 0; k < 3; k++) nodes.push({ g: -1 }); // ideias soltas

  // Grau = número de ligações. Cor por grau, igual ao app: pouco violeta, médio
  // verde-água, muito amarelo. O tamanho também cresce com o grau.
  nodes.forEach((n, i) => {
    n.deg = edges.filter(([a, b]) => a === i || b === i).length;
    n.tone = n.deg >= 5 ? 3 : n.deg >= 2 ? 2 : 1;
    n.r = n.g < 0 ? 1.6 : 1.5 + Math.min(n.deg, 7) * 0.32;
    n.x = W / 2 + (rand() - 0.5) * 30;
    n.y = H / 2 + (rand() - 0.5) * 20;
    n.vx = 0;
    n.vy = 0;
    n.links = [];
  });
  // Pontos de encontro: um por grupo, e as ideias soltas espalhadas pelas bordas.
  const homes = [[62, 58], [145, 36], [140, 92]];
  const looseHomes = [[18, 18], [186, 64], [90, 108]];
  let li = 0;
  nodes.forEach((n) => {
    [n.hx, n.hy] = n.g < 0 ? looseHomes[li++] : homes[n.g];
  });
  edges.forEach(([a, b], e) => {
    nodes[a].links.push(e);
    nodes[b].links.push(e);
  });

  const edgeLayer = svgEl('g', { class: 'mg-edges' }, svg);
  const nodeLayer = svgEl('g', { class: 'mg-nodes' }, svg);
  const edgeEls = edges.map(() => svgEl('line', {}, edgeLayer));
  const nodeEls = nodes.map((n) => {
    const g = svgEl('g', { class: `mg-node t${n.tone}${n.g < 0 ? ' is-loose' : ''}` }, nodeLayer);
    // Um halo grande e transparente atrás do ponto faz o "brilho" sem filtro de blur
    // (filtros SVG são caros de redesenhar; um círculo com opacidade é de graça).
    svgEl('circle', { class: 'mg-halo', r: n.r * 2.6 }, g);
    svgEl('circle', { class: 'mg-dot', r: n.r }, g);
    if (n.g < 0) svgEl('circle', { class: 'mg-ring', r: n.r + 3 }, g);
    return g;
  });

  function draw() {
    nodes.forEach((n, i) => nodeEls[i].setAttribute('transform', `translate(${n.x.toFixed(2)} ${n.y.toFixed(2)})`));
    edges.forEach(([a, b], e) => {
      const l = edgeEls[e];
      l.setAttribute('x1', nodes[a].x.toFixed(2));
      l.setAttribute('y1', nodes[a].y.toFixed(2));
      l.setAttribute('x2', nodes[b].x.toFixed(2));
      l.setAttribute('y2', nodes[b].y.toFixed(2));
    });
  }

  // Um passo da simulação. alpha começa em 1 e cai até 0: as forças vão perdendo
  // força e o grafo "assenta", como no d3-force.
  function step(alpha) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d2 = Math.max(dx * dx + dy * dy, 4);
        // Nós de grupos diferentes se empurram mais: é isso que separa os grupos.
        const k = (a.g >= 0 && b.g >= 0 && a.g !== b.g ? 3 : 1) / d2;
        dx *= k * alpha;
        dy *= k * alpha;
        a.vx -= dx; a.vy -= dy;
        b.vx += dx; b.vy += dy;
      }
    }
    edges.forEach(([ia, ib]) => {
      const a = nodes[ia];
      const b = nodes[ib];
      const same = a.g === b.g;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const rest = same ? 14 : 36; // ponte entre grupos é uma mola mais comprida
      const f = ((d - rest) / d) * (same ? 0.12 : 0.03) * alpha;
      a.vx += dx * f; a.vy += dy * f;
      b.vx -= dx * f; b.vy -= dy * f;
    });
    nodes.forEach((n) => {
      // Cada grupo tem um "ponto de encontro" fraco no card, para eles não se
      // sobreporem nem fugirem da borda.
      n.vx += (n.hx - n.x) * 0.03 * alpha;
      n.vy += (n.hy - n.y) * 0.03 * alpha;
      n.vx *= 0.78; // atrito
      n.vy *= 0.78;
      n.x = Math.min(W - 6, Math.max(6, n.x + n.vx));
      n.y = Math.min(H - 6, Math.max(6, n.y + n.vy));
    });
  }

  // Destaca um nó, os vizinhos e as ligações dele (como passar o mouse no app).
  const neighborsOf = (i) => nodes[i].links.map((e) => (edges[e][0] === i ? edges[e][1] : edges[e][0]));
  function focus(i) {
    svg.classList.toggle('is-focus', i !== null);
    nodeEls.forEach((g) => g.classList.remove('is-hot', 'is-near'));
    edgeEls.forEach((l) => l.classList.remove('is-hot'));
    if (i === null) return;
    nodeEls[i].classList.add('is-hot');
    neighborsOf(i).forEach((j) => nodeEls[j].classList.add('is-near'));
    nodes[i].links.forEach((e) => edgeEls[e].classList.add('is-hot'));
  }

  if (reducedMotion) {
    for (let k = 0; k < 300; k++) step(1 - k / 300);
    draw();
    return;
  }

  // Começa embolado e escondido; ao entrar na tela, roda a simulação ao vivo.
  draw();
  gsap.set(svg, { opacity: 0 });
  let settled = false;
  let visible = false;
  let raf = 0;
  let alpha = 1;
  let started = false;
  const frame = () => {
    raf = 0;
    if (!visible) return;
    // 2 passos por quadro: assenta em ~2,5 s a 60 fps.
    step(alpha);
    step(alpha);
    alpha *= 0.985;
    draw();
    if (alpha > 0.02) raf = requestAnimationFrame(frame);
    else settled = true;
  };
  watchVisible(svg, (v) => {
    visible = v;
    if (v && !started) {
      started = true;
      gsap.to(svg, { opacity: 1, duration: 0.6, ease: 'power2.out' });
    }
    if (v && !settled && !raf) raf = requestAnimationFrame(frame);
    tour[v && settled ? 'resume' : 'pause']();
  });

  // Depois de assentar, a cada poucos segundos um nó "acende" com os vizinhos: um
  // passeio pelos grupos. Só troca classes; quem anima é o CSS (transições).
  const hubs = nodes.map((n, i) => i).filter((i) => nodes[i].deg >= 3);
  let h = 0;
  let pointerOn = false;
  const tour = gsap.delayedCall(3.2, function next() {
    if (!pointerOn) focus(settled ? hubs[h++ % hubs.length] : null);
    gsap.delayedCall(h % 3 === 0 ? 2.6 : 1.8, () => {
      if (!pointerOn) focus(null);
      tour.restart(true);
    });
  });
  tour.pause();
  const checkSettled = gsap.delayedCall(0.5, function poll() {
    if (settled) tour.resume();
    else checkSettled.restart(true);
  });

  // Com mouse: passar por um ponto destaca ele e os vizinhos.
  nodeEls.forEach((g, i) => {
    g.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      pointerOn = true;
      focus(i);
    });
    g.addEventListener('pointerleave', () => {
      pointerOn = false;
      focus(null);
    });
  });
}
