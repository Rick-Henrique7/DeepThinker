// Página do Guia. Bem mais leve que a página inicial: sem three.js nem GSAP,
// só o tema salvo, o menu com fundo de vidro e o índice que acompanha a leitura.

import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles.css';
import './sections.css';
import './docs.css';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// Cor da barra do navegador no celular, de acordo com o tema salvo.
const THEME_COLOR = { abismo: '#02070d', glaciar: '#eef3f7', grafite: '#07090c' };
$('meta[name="theme-color"]').content = THEME_COLOR[document.documentElement.dataset.theme || 'abismo'];

// Menu: ganha fundo de vidro depois que a página rola um pouco.
const nav = $('[data-nav]');
const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// Índice: no celular começa fechado (para não empurrar o texto para baixo);
// ao escolher um item, fecha de novo.
const toc = $('[data-toc]');
const small = window.matchMedia('(max-width: 900px)');
const syncToc = () => (toc.open = !small.matches);
syncToc();
small.addEventListener('change', syncToc);
$$('a', toc).forEach((a) => a.addEventListener('click', () => small.matches && (toc.open = false)));

// Marca no índice a seção que está no topo da tela. O IntersectionObserver avisa
// quando cada seção entra ou sai de uma faixa perto do topo, sem calcular nada na rolagem.
const links = new Map($$('a', toc).map((a) => [a.getAttribute('href').slice(1), a]));
const visible = new Set();
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
    // A primeira seção (na ordem da página) que está na faixa é a atual.
    const current = [...links.keys()].find((id) => visible.has(id));
    if (!current) return;
    links.forEach((a, id) => a.classList.toggle('is-active', id === current));
  },
  { rootMargin: '-100px 0px -60% 0px' },
);
$$('.doc__section').forEach((s) => observer.observe(s));
