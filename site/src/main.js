// Ponto de entrada do site. O Vite junta tudo isto (e as bibliotecas do npm)
// num único arquivo otimizado quando você roda `npm run build`.
//
// Quem faz o quê:
//   three.js  → o grafo 3D do topo (graph.js)
//   GSAP      → entrada do título e tudo que reage à rolagem (ScrollTrigger)
//   anime.js  → micro-animações em sequência: digitação da IA, mini grafo, chips dos provedores

import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles.css';
import './sections.css';
import './tools.css';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { animate, stagger } from 'animejs';
import { createOrb } from './orb.js';
import { createWater } from './water.js';
import { createClouds } from './clouds.js';
import { initTools } from './tools.js';
import { initFilm } from './film.js';
import { initNotesTree, initMiniGraph } from './bento.js';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

// Respeita a preferência "reduzir movimento" do sistema operacional.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// ---------------------------------------------------------------------------
// Utilitário: quebra o texto de um elemento em <span>s (por palavra ou letra)
// sem destruir tags internas como <mark>.
// ---------------------------------------------------------------------------
function splitText(el, mode, className) {
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = mode === 'word' ? child.textContent.split(/(\s+)/) : [...child.textContent];
        const frag = document.createDocumentFragment();
        parts.forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            frag.append(document.createTextNode(part));
          } else {
            const span = document.createElement('span');
            span.className = className;
            span.textContent = part;
            frag.append(span);
          }
        });
        child.replaceWith(frag);
      } else {
        walk(child);
      }
    });
  };
  walk(el);
  return $$(`.${className}`, el);
}

// ---------------------------------------------------------------------------
// Navegação: ganha fundo de vidro depois que a página rola um pouco.
// ---------------------------------------------------------------------------
const nav = $('[data-nav]');
const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// ---------------------------------------------------------------------------
// Temas (os mesmos três do app). O tema vira data-theme no <html>; as cores estão
// todas em variáveis no styles.css. Os desenhos em canvas (grafo, água) escutam o
// evento "deepthinker:theme" para reler as cores.
//
// A troca usa a View Transitions API: o navegador tira uma "foto" da página antiga e
// revela a nova num círculo que cresce a partir do clique.
// ---------------------------------------------------------------------------
const THEME_COLOR = { abismo: '#02070d', glaciar: '#eef3f7', grafite: '#07090c' };
const themeButtons = $$('[data-theme-pick]');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('deepthinker.theme', theme);
  } catch {}
  themeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themePick === theme)));
  $('meta[name="theme-color"]').content = THEME_COLOR[theme];
  window.dispatchEvent(new Event('deepthinker:theme'));
}
applyTheme(document.documentElement.dataset.theme || 'abismo');

themeButtons.forEach((btn) =>
  btn.addEventListener('click', (e) => {
    const theme = btn.dataset.themePick;
    if (theme === document.documentElement.dataset.theme) return;
    if (!document.startViewTransition || reducedMotion) return applyTheme(theme);
    const x = e.clientX || window.innerWidth / 2;
    const y = e.clientY || window.innerHeight / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(() => applyTheme(theme)).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 700, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    });
  }),
);

// ---------------------------------------------------------------------------
// Descida: do céu preto do topo, passando pelas nuvens, até o mar.
// As duas camadas de nuvem sobem em velocidades diferentes ao rolar (parallax):
// a de perto corre mais, como quando se desce de avião.
// ---------------------------------------------------------------------------
const descent = $('[data-descent]');
createClouds($('[data-clouds="far"]'), { seed: 11, scale: 0.8, cover: 0.48 });
createClouds($('[data-clouds="near"]'), { seed: 5, scale: 1.1, cover: 0.52 });
const seaLevel = () => parseFloat(getComputedStyle(descent).getPropertyValue('--sea')) || 0.7;
const water = createWater($('[data-water]'), { level: seaLevel(), reducedMotion });

if (!reducedMotion) {
  const scrub = { trigger: descent, start: 'top bottom', end: 'bottom top', scrub: true };
  gsap.fromTo('.descent__clouds--far', { y: 60 }, { y: -80, ease: 'none', scrollTrigger: scrub });
  gsap.fromTo('.descent__clouds--near', { y: 160 }, { y: -220, ease: 'none', scrollTrigger: scrub });
}

// ---------------------------------------------------------------------------
// Nome no céu: "Deep thinker" se revela da esquerda para a direita quando chega na
// tela e, um pouco depois, o subtítulo aparece letra por letra, também da esquerda.
// A rolagem é a normal do navegador: antes um deslize automático levava do topo ao
// iceberg, mas no celular ele "prendia" o primeiro gesto (era preciso passar o dedo
// duas vezes). Rolagem livre é sempre mais confiável que rolagem sequestrada.
//
// O efeito da esquerda para a direita é um clip-path: um retângulo que recorta o
// texto e vai abrindo. É barato porque o navegador só muda o recorte (sem relayout).
// ---------------------------------------------------------------------------
{
  const name = $('[data-brand-name]');
  const sub = $('[data-brand-sub]');
  // Cada letra vira um <span> para poder animar uma de cada vez (espaços viram
  // espaço fixo, senão o span vazio some).
  const letters = [...sub.textContent].map((ch) => {
    const span = document.createElement('span');
    span.textContent = ch === ' ' ? '\u00a0' : ch;
    return span;
  });
  sub.replaceChildren(...letters);
  if (!reducedMotion) {
    gsap.set(name, { clipPath: 'inset(0 100% 0 0)', x: -24 });
    gsap.set(letters, { opacity: 0, x: -6 });
    ScrollTrigger.create({
      trigger: name,
      start: 'top 78%',
      once: true,
      onEnter: () => {
        gsap.to(name, { clipPath: 'inset(0 0% 0 0)', x: 0, duration: 1.4, ease: 'power3.out' });
        animate(letters, { opacity: [0, 1], x: [-6, 0], duration: 420, ease: 'outQuad', delay: stagger(38, { start: 1300 }) });
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Medidor: no céu mostra a altitude (2.000 m até 0); depois da linha do mar, a
// profundidade (0 até 3.800 m, a profundidade média do oceano). Conta a partir do
// meio da tela. Só aparece em telas largas (ver styles.css).
// ---------------------------------------------------------------------------
const depthKind = $('[data-depth-kind]');
const depthValue = $('[data-depth-value]');
const depthMark = $('[data-depth-mark]');
const fmt = (m) => (Math.round(m / 10) * 10).toLocaleString('pt-BR');
// Desempenho: medir a página (offsetTop, scrollHeight) obriga o navegador a recalcular
// o layout. Medimos só quando a janela muda de tamanho e, na rolagem, juntamos todos
// os eventos de um quadro numa única atualização (requestAnimationFrame).
let seaY = 0;
let pageH = 0;
const measureMeter = () => {
  seaY = descent.offsetTop + descent.offsetHeight * seaLevel();
  pageH = document.documentElement.scrollHeight;
};
let meterQueued = false;
const queueMeter = () => {
  if (meterQueued) return;
  meterQueued = true;
  requestAnimationFrame(() => {
    meterQueued = false;
    updateMeter();
  });
};
function updateMeter() {
  const center = window.scrollY + window.innerHeight / 2;
  const bottom = pageH - window.innerHeight / 2;
  if (center < seaY) {
    depthKind.textContent = 'altitude';
    depthValue.textContent = fmt((1 - center / seaY) * 2000);
  } else {
    depthKind.textContent = 'profundidade';
    depthValue.textContent = fmt(Math.min(1, (center - seaY) / (bottom - seaY)) * 3800);
  }
  const p = window.scrollY / Math.max(1, pageH - window.innerHeight);
  depthMark.style.transform = `translateY(${p * 153}px)`;
}
measureMeter();
updateMeter();
window.addEventListener('scroll', queueMeter, { passive: true });
window.addEventListener('resize', () => {
  measureMeter();
  queueMeter();
});
// A altura da página muda quando fontes e imagens terminam de carregar.
new ResizeObserver(() => {
  measureMeter();
  queueMeter();
}).observe(document.body);
gsap.to('[data-depth]', { opacity: 1, duration: 0.8, delay: 1.2 });

// ---------------------------------------------------------------------------
// Hero: grafo 3D + título que sobe de dentro da máscara.
// ---------------------------------------------------------------------------
// As entradas ficam pausadas até a tela de carregamento sair (ver "Carregamento").
const intros = [];
if (!reducedMotion) {
  intros.push(
    gsap
      .timeline({ paused: true, defaults: { ease: 'expo.out' } })
      .from('[data-hero-title] .line > span', { yPercent: 110, duration: 1.4, stagger: 0.12 }, 0.15)
      .from('[data-hero-item]', { y: 16, opacity: 0, duration: 1.1, stagger: 0.1 }, 0.5),
  );

  gsap.to('.hero__content', {
    y: -80,
    opacity: 0,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
}

// O three.js é a parte mais pesada do site (~150 KB). Com import() dinâmico o Vite
// separa ele num arquivo próprio: o texto aparece na hora e o grafo chega logo depois.
const graphReady = import('./graph.js').then(({ createGraph }) => {
  const graph = createGraph($('[data-graph]'), { reducedMotion });
  if (reducedMotion) return;

  intros.push(
    gsap
    .timeline({ paused: true })
    .from(graph.camera.position, { z: '+=11', duration: 2.6, ease: 'power3.out' }, 0)
    .from(graph.pointMat.uniforms.uOpacity, { value: 0, duration: 1.6, ease: 'power2.out' }, 0)
    .from(graph.lineMat, { opacity: 0, duration: 2, ease: 'power2.out' }, 0.3),
  );

  // Ao rolar, o grafo sobe devagar (efeito parallax): o conteúdo de baixo assume o foco.
  gsap.to(graph.group.position, {
    y: 3,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
});

// ---------------------------------------------------------------------------
// Carregamento: o iceberg no centro da tela (index.html) fica até as fontes, o
// grafo 3D e o primeiro quadro estarem prontos. Assim ninguém vê a página "pela
// metade". Espera no mínimo 0,7 s (para não piscar) e no máximo 6 s (se algo
// falhar, a página aparece mesmo assim). Depois some e as entradas começam.
// ---------------------------------------------------------------------------
const loader = $('[data-loader]');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const loaded = new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })));
Promise.race([
  Promise.all([document.fonts?.ready, graphReady.catch(() => {}), loaded, wait(700)]).then(nextFrames),
  wait(6000),
]).then(() => {
  ScrollTrigger.refresh();
  document.documentElement.classList.remove('is-loading');
  loader.classList.add('is-done');
  loader.addEventListener('transitionend', () => loader.remove(), { once: true });
  setTimeout(() => loader.remove(), 1200);
  intros.forEach((tl) => tl.play());
});

// ---------------------------------------------------------------------------
// Manifesto: cada palavra acende conforme você rola ("scrub" = preso à rolagem).
// ---------------------------------------------------------------------------
const words = splitText($('[data-manifesto]'), 'word', 'word');
if (!reducedMotion) {
  gsap.to(words, {
    opacity: 1,
    stagger: 0.1,
    ease: 'none',
    scrollTrigger: { trigger: '.manifesto', start: 'top 75%', end: 'bottom 55%', scrub: true },
  });
}

// ---------------------------------------------------------------------------
// Revelações genéricas: tudo com [data-reveal] sobe e aparece ao entrar na tela.
// batch() agrupa elementos que entram juntos e aplica um pequeno atraso entre eles.
// ---------------------------------------------------------------------------
if (!reducedMotion) {
  gsap.set('[data-reveal]', { opacity: 0, y: 28 });
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 88%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.08 }),
  });
}

// ---------------------------------------------------------------------------
// Bento de Recursos: a árvore de notas ligadas e o mini grafo (bento.js).
// ---------------------------------------------------------------------------
initNotesTree($('[data-notes]'));
initMiniGraph($('[data-mini-graph]'));

// ---------------------------------------------------------------------------
// Advogado do Diabo: a tela do app em miniatura.
//
// Roteiro de cada modo: a pergunta em serifa e as sugestões (estado vazio do app),
// a sugestão escolhida vira a mensagem, a resposta é "digitada" letra por letra
// (anime.js), e aparecem as "Notas usadas" (memória da IA) e a nota criada.
// As abas funcionam: clicar num modo troca a conversa.
//
// Movimento no estilo do Emil Kowalski: mensagens entram em 200 ms subindo 8 px e
// saindo de um desfoque de 4 px; o sublinhado da aba desliza em 220 ms.
// ---------------------------------------------------------------------------
const CONVERSAS = {
  socratico: {
    hint: 'Modo Socrático: faz perguntas para guiar seu pensamento.',
    text: 'O que você chama de produtividade: entregar mais tarefas ou fazer um trabalho melhor? Sua nota [[Foco]] diz que você rende mais em silêncio. Isso vale para quem ainda está aprendendo com os colegas?',
    used: ['Foco', 'Rotina'],
    tool: 'Produtividade · o que eu meço?',
  },
  critico: {
    hint: 'Modo Crítico: procura o ponto fraco do argumento.',
    text: '“Todo mundo” é uma palavra forte. Sua nota [[Foco]] diz que você rende mais com silêncio, mas quem mora com crianças pequenas? E quem está no primeiro emprego e aprende observando os colegas? Que evidência mudaria a sua opinião?',
    used: ['Foco', 'Sono', 'Rotina'],
    tool: 'Trabalho remoto · contra-argumentos',
  },
  brainstorm: {
    hint: 'Modo Brainstorm: abre caminhos e ideias novas.',
    text: 'Três jeitos de testar isso: compare duas semanas suas, uma em casa e outra no escritório, usando a nota [[Rotina]]. Separe tarefas de foco das de conversa. E pergunte a quem está no primeiro emprego como foi para ela.',
    used: ['Rotina', 'Hábitos'],
    tool: 'Experimento · duas semanas',
  },
};

const chatEl = $('[data-chat]');
const empty = $('[data-empty]');
const emptyHint = $('[data-empty-hint]');
const pickChip = $$('[data-empty-chips] span')[1];
const userMsg = $('[data-user]');
const aiMsg = $('[data-ai]');
const typed = $('[data-typed]');
const used = $('[data-used]');
const tool = $('[data-tool]');
const toolName = $('[data-tool-name]');
const modeTabs = $$('[data-mode]');
const modeBar = $('[data-modes-bar]');
const chatWater = createWater($('[data-chat-water]'), { level: 0.8, intensity: 0.7, reducedMotion });

createOrb($('[data-orb]'), { reducedMotion });

let chatTl = null;
let typing = null;

function renderAnswer(c) {
  // [[Nota]] vira um <mark>, como no app
  typed.innerHTML = c.text.replace(/\[\[(.+?)\]\]/g, '<mark>[[$1]]</mark>');
  used.innerHTML =
    '<span>Notas usadas</span>' + c.used.map((n) => `<span class="chip">${n}</span>`).join('');
  toolName.textContent = c.tool;
}

function playConversation(mode) {
  const c = CONVERSAS[mode];
  chatTl?.kill();
  typing?.pause();
  emptyHint.textContent = c.hint;
  renderAnswer(c);

  if (reducedMotion) {
    empty.hidden = true;
    userMsg.hidden = aiMsg.hidden = false;
    chatWater.level = 1.2;
    chatWater.redraw();
    return;
  }

  // Volta ao estado vazio
  empty.hidden = false;
  userMsg.hidden = aiMsg.hidden = true;
  pickChip.classList.remove('is-picked');
  gsap.set(empty, { opacity: 1, y: 0 });
  gsap.set([used, tool], { opacity: 0 });
  const chars = splitText(typed, 'char', 'char');
  const enter = { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.2, ease: 'power2.out' };
  const water = { level: chatWater.level };

  chatTl = gsap
    .timeline()
    .call(() => pickChip.classList.add('is-picked'), null, 0.5)
    .to(empty, { opacity: 0, y: -8, duration: 0.25, ease: 'power2.in' }, 1.1)
    .to(water, { level: 1.2, duration: 0.9, ease: 'power2.inOut', onUpdate: () => (chatWater.level = water.level) }, 1.1)
    .call(() => {
      empty.hidden = true;
      userMsg.hidden = false;
    })
    .fromTo(userMsg, { opacity: 0, y: 8, filter: 'blur(4px)' }, enter)
    .call(() => (aiMsg.hidden = false), null, '+=0.35')
    .fromTo(aiMsg, { opacity: 0, y: 8, filter: 'blur(4px)' }, enter)
    .call(() => {
      typing = animate(chars, {
        opacity: [0, 1],
        duration: 60,
        ease: 'linear',
        delay: stagger(12),
        onComplete: () => {
          animate(used, { opacity: [0, 1], translateY: [6, 0], duration: 400, ease: 'outExpo' });
          animate(used.querySelectorAll('.chip'), {
            opacity: [0, 1],
            scale: [0.96, 1],
            duration: 400,
            ease: 'outExpo',
            delay: stagger(40),
          });
          animate(tool, { opacity: [0, 1], translateY: [8, 0], duration: 500, ease: 'outExpo', delay: 350 });
        },
      });
    });
}

function selectMode(mode, animateBar = true) {
  const i = modeTabs.findIndex((t) => t.dataset.mode === mode);
  modeTabs.forEach((t, j) => t.setAttribute('aria-selected', String(i === j)));
  gsap.to(modeBar, { xPercent: i * 100, duration: animateBar && !reducedMotion ? 0.22 : 0, ease: 'power3.out' });
}

selectMode('critico', false);
modeTabs.forEach((t) =>
  t.addEventListener('click', () => {
    selectMode(t.dataset.mode);
    playConversation(t.dataset.mode);
  }),
);
if (reducedMotion) {
  playConversation('critico');
} else {
  renderAnswer(CONVERSAS.critico);
  ScrollTrigger.create({
    trigger: chatEl,
    start: 'top 70%',
    once: true,
    onEnter: () => playConversation('critico'),
  });
}


// ---------------------------------------------------------------------------
// Provedores de IA: chips entram a partir do centro (anime.js stagger "from center").
// ---------------------------------------------------------------------------
const chips = $$('[data-providers] li');
if (!reducedMotion) {
  chips.forEach((c) => (c.style.opacity = 0));
  ScrollTrigger.create({
    trigger: '[data-providers]',
    start: 'top 85%',
    once: true,
    onEnter: () =>
      animate(chips, {
        opacity: [0, 1],
        translateY: [16, 0],
        scale: [0.96, 1],
        duration: 700,
        ease: 'outExpo',
        delay: stagger(55, { from: 'center' }),
      }),
  });
}

// ---------------------------------------------------------------------------
// Passos: os números entram em sequência.
// ---------------------------------------------------------------------------
if (!reducedMotion) {
  gsap.from('[data-steps] li', {
    opacity: 0,
    y: 32,
    duration: 1,
    ease: 'expo.out',
    stagger: 0.12,
    scrollTrigger: { trigger: '[data-steps]', start: 'top 82%', once: true },
  });
}

// ---------------------------------------------------------------------------
// Luz que segue o mouse dentro dos cards (só atualiza duas variáveis CSS).
// ---------------------------------------------------------------------------
$$('.card').forEach((card) => {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
});

// ---------------------------------------------------------------------------
// Botão "Copiar" do terminal.
// ---------------------------------------------------------------------------
const copyBtn = $('[data-copy]');
copyBtn.addEventListener('click', async () => {
  const text = $('.terminal code')
    .innerText.split('\n')
    .filter((l) => l.startsWith('$'))
    .map((l) => l.replace(/^\$\s*/, ''))
    .join('\n');
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = 'Copiado';
  } catch {
    copyBtn.textContent = 'Selecione e copie';
  }
  setTimeout(() => (copyBtn.textContent = 'Copiar'), 1800);
});

// ---------------------------------------------------------------------------
// Ferramentas: a vitrine com a janela do app em miniatura (tools.js + tools.css).
// ---------------------------------------------------------------------------
initTools($('[data-tx]'));
initFilm($('[data-film]'));
