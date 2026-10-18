// Grafo de conhecimento em 3D (three.js) que fica atrás do título.
//
// As cores são as mesmas do grafo do app: cada nó vai do violeta (poucas ligações)
// ao verde-água e ao amarelo (muito ligado). Elas vêm das variáveis --graph-* do
// styles.css, então trocar de tema (Abismo, Glaciar, Grafite) recolore o grafo.
//
// Ideia: cada ponto é uma "nota" e cada linha é um [[link]] entre notas.
// Os pontos se agrupam em alguns clusters (assuntos), como no grafo real do app,
// e pequenos "pulsos" de luz correm pelas linhas para sugerir pensamento acontecendo.

import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  NormalBlending,
  BufferGeometry,
  Clock,
  Group,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';

export function createGraph(canvas, { reducedMotion = false } = {}) {
  const isSmall = window.innerWidth < 700;
  const NODE_COUNT = isSmall ? 90 : 160;
  const CLUSTERS = 7;
  const PULSES = isSmall ? 14 : 28;

  // --- Cena, câmera e renderizador -------------------------------------
  // Desempenho: o grafo ocupa a tela inteira, então o custo é quase todo "pintar pixels".
  //  - antialias (MSAA) desenha cada pixel 4 vezes e guarda 4 cópias na memória da placa
  //    de vídeo. Em telas retina os pixels já são tão pequenos que ele não faz falta.
  //  - pixelRatio: telas retina têm 2 ou 3 pixels por ponto; desenhar em até 1,5 quase
  //    não muda o visual e corta metade (ou mais) do trabalho e da memória.
  //  - Se mesmo assim o aparelho não aguentar, a resolução desce sozinha (ver frame()).
  const dpr = window.devicePixelRatio || 1;
  const renderer = new WebGLRenderer({ canvas, antialias: dpr < 1.5, alpha: true, powerPreference: 'low-power' });
  let pixelRatio = Math.min(dpr, 1.5);
  renderer.setPixelRatio(pixelRatio);

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 15);

  const group = new Group();
  scene.add(group);

  // --- Posições dos nós ---------------------------------------------------
  // Um gerador aleatório com semente fixa: o grafo sai igual em toda visita.
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;

  const centers = Array.from({ length: CLUSTERS }, (_, i) => {
    const a = (i / CLUSTERS) * Math.PI * 2 + rand();
    const r = 3.5 + rand() * 2.5;
    return new Vector3(Math.cos(a) * r * 1.4, Math.sin(a) * r * 0.75, (rand() - 0.5) * 4);
  });

  const nodes = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const c = centers[i % CLUSTERS];
    const spread = 1.6;
    nodes.push(
      new Vector3(c.x + gauss() * spread, c.y + gauss() * spread, c.z + gauss() * spread),
    );
  }

  // --- Ligações: cada nó se liga aos 2 vizinhos mais próximos ------------
  const edges = [];
  const seen = new Set();
  nodes.forEach((p, i) => {
    const nearest = nodes
      .map((q, j) => ({ j, d: i === j ? Infinity : p.distanceToSquared(q) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    nearest.forEach(({ j }) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([i, j]);
      }
    });
  });
  // Algumas pontes entre clusters: ideias de assuntos diferentes que se encontram.
  for (let k = 0; k < CLUSTERS; k++) {
    const a = k;
    const b = ((k + 2) % CLUSTERS) + CLUSTERS * Math.floor(rand() * 3);
    if (b < NODE_COUNT) edges.push([a, b]);
  }

  // --- Linhas ---------------------------------------------------------------
  const linePositions = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], i) => {
    nodes[a].toArray(linePositions, i * 6);
    nodes[b].toArray(linePositions, i * 6 + 3);
  });
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new BufferAttribute(linePositions, 3));
  const lineMat = new LineBasicMaterial({
    color: 0x3fb8b0,
    transparent: true,
    opacity: 0.22,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  group.add(new LineSegments(lineGeo, lineMat));

  // --- Pontos (shader próprio para cada nó virar um brilho redondo) -------
  // Contar quantas ligações cada nó tem: nós "hub" ficam maiores, como no app.
  const degree = new Array(NODE_COUNT).fill(0);
  edges.forEach(([a, b]) => {
    degree[a]++;
    degree[b]++;
  });

  const pointPositions = new Float32Array(NODE_COUNT * 3);
  const sizes = new Float32Array(NODE_COUNT);
  const phases = new Float32Array(NODE_COUNT);
  // "Densidade" de 0 a 1 de cada nó (como a cor "por densidade" do app)
  const maxDeg = Math.max(...degree);
  const density = degree.map((d) => (d - 1) / Math.max(1, maxDeg - 1));
  const colors = new Float32Array(NODE_COUNT * 3);
  nodes.forEach((p, i) => {
    p.toArray(pointPositions, i * 3);
    sizes[i] = 0.9 + Math.min(degree[i], 6) * 0.35;
    phases[i] = rand() * Math.PI * 2;
  });
  const pointGeo = new BufferGeometry();
  pointGeo.setAttribute('position', new BufferAttribute(pointPositions, 3));
  pointGeo.setAttribute('aSize', new BufferAttribute(sizes, 1));
  pointGeo.setAttribute('aPhase', new BufferAttribute(phases, 1));
  pointGeo.setAttribute('aColor', new BufferAttribute(colors, 3));

  const pointMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uOpacity: { value: 1 },
      uLight: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vTwinkle;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vTwinkle = 0.65 + 0.35 * sin(uTime * 1.2 + aPhase);
        gl_PointSize = aSize * 9.0 * uPixelRatio * (10.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform float uLight;
      varying float vTwinkle;
      varying vec3 vColor;
      void main() {
        // Distância do centro do ponto: centro forte, borda que some suave.
        float d = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.5, 0.0, d);
        float glow = pow(core, 3.0);
        // Fundo escuro: brilho somado (o miolo fica quase branco).
        // Fundo claro (Glaciar): bolinha sólida na cor do nó, sem brilho.
        vec3 color = mix(mix(vColor, vec3(1.0), glow * 0.55), vColor, uLight);
        float dot = smoothstep(0.2, 0.15, d);
        float a = mix(glow * 0.9 + core * 0.25, dot * 0.85, uLight);
        gl_FragColor = vec4(color, a * mix(vTwinkle, 1.0, uLight) * uOpacity);
      }
    `,
  });
  group.add(new Points(pointGeo, pointMat));

  // --- Pulsos que viajam pelas ligações -----------------------------------
  const pulseGeo = new BufferGeometry();
  const pulsePositions = new Float32Array(PULSES * 3);
  pulseGeo.setAttribute('position', new BufferAttribute(pulsePositions, 3));
  const pulses = Array.from({ length: PULSES }, () => ({
    edge: Math.floor(rand() * edges.length),
    t: rand(),
    speed: 0.15 + rand() * 0.35,
  }));
  const pulseMat = new PointsMaterial({
    color: 0xffffff,
    size: 0.09,
    transparent: true,
    opacity: 0.9,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  group.add(new Points(pulseGeo, pulseMat));

  // --- Estrelas ---------------------------------------------------------------
  // Pontinhos distantes e fixos que fazem do fundo preto um céu profundo.
  // Ficam fora do grupo do grafo: não giram com ele, só derivam bem devagar.
  const STARS = isSmall ? 350 : 700;
  const starPositions = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    const r = 30 + rand() * 30;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
    starPositions[i * 3 + 2] = -Math.abs(r * Math.cos(phi));
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute('position', new BufferAttribute(starPositions, 3));
  const starMat = new PointsMaterial({
    color: 0xcfe0f2,
    size: 0.12,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const stars = new Points(starGeo, starMat);
  scene.add(stars);

  // --- Cores do tema --------------------------------------------------------
  // Lê "R G B" das variáveis CSS (as mesmas do app) e recolore tudo.
  const cssColor = (name) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
    const [r, g, b] = v.split(/\s+/).map(Number);
    return new Color(r / 255, g / 255, b / 255);
  };
  const tmpColor = new Color();
  function applyTheme() {
    const light = document.documentElement.dataset.theme === 'glaciar';
    const [c1, c2, c3] = ['graph-node-1', 'graph-node-2', 'graph-node-3'].map(cssColor);
    density.forEach((t, i) => {
      // 0 → 0.5: violeta → verde-água; 0.5 → 1: verde-água → amarelo
      if (t < 0.5) tmpColor.copy(c1).lerp(c2, t * 2);
      else tmpColor.copy(c2).lerp(c3, (t - 0.5) * 2);
      tmpColor.toArray(colors, i * 3);
    });
    pointGeo.attributes.aColor.needsUpdate = true;
    // Ligações na cor própria do topo (no Glaciar o topo é azul-escuro, então são claras)
    lineMat.color.copy(cssColor('hero-link'));
    // No claro, "somar luz" some no papel branco: usamos mistura normal.
    const blending = light ? NormalBlending : AdditiveBlending;
    [lineMat, pointMat, pulseMat].forEach((m) => {
      m.blending = blending;
      m.needsUpdate = true;
    });
    pointMat.uniforms.uLight.value = light ? 1 : 0;
    // No Glaciar as estrelas aparecem só na parte escura do alto do céu (são brancas)
    starMat.opacity = Number(getComputedStyle(document.documentElement).getPropertyValue('--star-a')) || 0.5;
    pulseMat.color.set(0xffffff);
  }
  applyTheme();
  window.addEventListener('deepthinker:theme', applyTheme);

  const tmp = new Vector3();
  function updatePulses(dt) {
    pulses.forEach((p, i) => {
      p.t += p.speed * dt;
      if (p.t > 1) {
        p.t = 0;
        p.edge = Math.floor(Math.random() * edges.length);
      }
      const [a, b] = edges[p.edge];
      tmp.lerpVectors(nodes[a], nodes[b], p.t).toArray(pulsePositions, i * 3);
    });
    pulseGeo.attributes.position.needsUpdate = true;
  }

  // --- Interação com o mouse (inclina o grafo suavemente) -----------------
  const pointer = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

  // --- Tamanho ---------------------------------------------------------------
  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Em telas estreitas a câmera recua para o grafo não ser cortado.
    camera.position.z = w < 700 ? 20 : 15;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // --- Laço de animação -----------------------------------------------------
  // Só desenha quando o hero está visível: rolar para baixo não gasta GPU à toa.
  // Fora da tela o laço PARA de vez (nem agenda o próximo quadro) e volta ao reaparecer.
  let visible = true;
  let raf = 0;
  const clock = new Clock();
  let rotation = 0;
  const run = () => {
    if (!raf && visible) {
      clock.getDelta(); // descarta o tempo parado, senão o grafo "pula" ao voltar
      raf = requestAnimationFrame(frame);
    }
  };
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) run();
  }).observe(canvas);

  // Qualidade adaptável: mede a média de 40 quadros. Se passar de ~22 ms (menos de
  // 45 quadros por segundo), baixa a resolução um degrau, até o mínimo de 1 (abaixo
  // disso o grafo ficaria borrado). Um aparelho fraco perde um pouco de nitidez, mas não trava.
  // Os primeiros 30 quadros não contam: é quando a página ainda está carregando.
  let slowSum = 0;
  let slowCount = -30;
  function adapt(dt) {
    if (++slowCount <= 0) return;
    slowSum += dt;
    if (slowCount < 40) return;
    const avg = slowSum / slowCount;
    slowSum = 0;
    slowCount = 0;
    if (avg <= 0.022) return;
    if (pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      pointMat.uniforms.uPixelRatio.value = pixelRatio;
      resize();
    } else {
      // Último recurso: desenha o grafo um quadro sim, um não (30 por segundo).
      // Ele gira bem devagar, então quase não se nota, e a rolagem da página fica livre.
      halfRate = true;
    }
  }
  let halfRate = false;
  let odd = false;

  function frame() {
    raf = 0;
    if (!visible) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (!document.hidden) adapt(dt);

    if (!reducedMotion) {
      rotation += dt * 0.05;
      // "lerp": a inclinação anda 4% do caminho até o mouse por quadro, por isso é macia.
      tilt.x += (pointer.y * 0.25 - tilt.x) * 0.04;
      tilt.y += (pointer.x * 0.35 - tilt.y) * 0.04;
      updatePulses(dt);
    }
    group.rotation.set(tilt.x, rotation + tilt.y, 0);
    stars.rotation.y = rotation * 0.2;
    pointMat.uniforms.uTime.value = reducedMotion ? 0 : t;
    odd = !odd;
    if (halfRate && odd) return;
    renderer.render(scene, camera);
  }
  run();

  // Devolve alavancas para o GSAP animar (entrada e rolagem).
  return { group, camera, pointMat, lineMat, pulseMat };
}
