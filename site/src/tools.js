// Vitrine das Ferramentas: abas à esquerda, janela do app em miniatura à direita.
//
// Quem anima as cenas é o CSS (tools.css): cada cena tem animações presas à classe
// .is-on. Aqui só decidimos QUAL cena está ligada e QUANDO trocar:
//   - enquanto a seção está na tela, troca sozinha (a barrinha da aba é o relógio:
//     quando a animação dela termina, vamos para a próxima);
//   - o mouse sobre a janela pausa; sair da tela pausa;
//   - um clique ou tecla numa aba assume o controle e para a troca automática.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initTools(root) {
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];

  const tabList = $('[role="tablist"]');
  const tabs = $$('[data-tx-tab]');
  const scenes = new Map($$('[data-tx-scene]').map((s) => [s.dataset.txScene, s]));
  const title = $('[data-tx-title]');
  const caption = $('[data-tx-caption]');
  const win = $('[data-tx-window]');
  let current = null;
  let started = false;

  buildHeatmap($('[data-tx-heat]'));

  function select(id, { focus = false } = {}) {
    const tab = tabs.find((t) => t.dataset.txTab === id);
    current = id;
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    title.textContent = tab.querySelector('.tx__label').textContent;
    caption.textContent = tab.querySelector('.tx__desc').textContent.trim();
    if (focus) tab.focus({ preventScroll: true });

    // No celular as abas rolam para o lado: traz a ativa para dentro da fileira,
    // mexendo só na fileira (scrollIntoView rolaria a página inteira junto).
    if (tabList.scrollWidth > tabList.clientWidth) {
      const left = tab.offsetLeft - (tabList.clientWidth - tab.offsetWidth) / 2;
      tabList.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' });
    }
    if (started) play(id);
  }

  // Liga a cena do zero. Tirar a classe, forçar um "reflow" e pôr de volta faz o
  // navegador reiniciar as animações CSS mesmo quando é a mesma cena.
  function play(id) {
    scenes.forEach((s, key) => key !== id && s.classList.remove('is-on'));
    const scene = scenes.get(id);
    scene.classList.remove('is-on');
    void scene.offsetWidth;
    if (id === 'vivo') placeCursor(scene);
    if (id === 'canvas') placeWires(scene);
    scene.classList.add('is-on');
  }

  const next = () => {
    const i = tabs.findIndex((t) => t.dataset.txTab === current);
    select(tabs[(i + 1) % tabs.length].dataset.txTab);
  };

  // A barrinha da aba ativa terminou de encher: próxima ferramenta.
  root.addEventListener('animationend', (e) => {
    if (e.animationName === 'tx-progress' && root.classList.contains('is-auto')) next();
  });

  const takeOver = () => root.classList.remove('is-auto');
  tabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      takeOver();
      select(tab.dataset.txTab);
    }),
  );

  // Teclado, como em qualquer lista de abas: setas, Home e End.
  tabList.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    let to = null;
    if (e.key in keys) to = (i + keys[e.key] + tabs.length) % tabs.length;
    if (e.key === 'Home') to = 0;
    if (e.key === 'End') to = tabs.length - 1;
    if (to === null) return;
    e.preventDefault();
    takeOver();
    select(tabs[to].dataset.txTab, { focus: true });
  });

  win.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && root.classList.add('is-paused'));
  win.addEventListener('pointerleave', () => root.classList.remove('is-paused'));

  // Só começa quando a vitrine aparece na tela; fora dela, pausa a troca.
  new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && !started) {
        started = true;
        if (!reducedMotion) root.classList.add('is-auto');
        play(current);
      }
      root.classList.toggle('is-offscreen', !entry.isIntersecting);
      if (!entry.isIntersecting) root.classList.add('is-paused');
      else if (!win.matches(':hover')) root.classList.remove('is-paused');
    },
    { threshold: 0.35 },
  ).observe(win);

  window.addEventListener('resize', () => {
    if (current === 'vivo') placeCursor(scenes.get('vivo'));
    if (current === 'canvas') placeWires(scenes.get('canvas'));
  });

  select(tabs[0].dataset.txTab);
}

// O cursor da IA vai até o cartão e o leva para a outra coluna. As posições
// dependem da largura da janela, então são medidas e passadas ao CSS.
function placeCursor(scene) {
  const box = scene.getBoundingClientRect();
  const card = scene.querySelector('.sc-vivo__card').getBoundingClientRect();
  const [colA, colB] = [...scene.querySelectorAll('.board__col')].map((c) => c.getBoundingClientRect());
  const x = card.left - box.left + card.width * 0.55;
  const y = card.top - box.top + card.height * 0.35;
  const dx = colB.left - colA.left;
  const cursor = scene.querySelector('.sc-vivo__cursor');
  cursor.style.setProperty('--cur-a', `translate(${x}px, ${y}px)`);
  cursor.style.setProperty('--cur-b', `translate(${x + dx}px, ${y}px)`);
}

// Setas do Canvas: medidas a partir da posição real das notas (que mudam com a
// largura da tela). Sai da borda de uma nota e chega na borda da outra, pelo lado
// que estiver mais de frente; as alças da curva seguem esse mesmo eixo.
function placeWires(scene) {
  const box = scene.getBoundingClientRect();
  const svg = scene.querySelector('[data-tx-wires]');
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  const notes = [...scene.querySelectorAll('.sc-canvas__note')].map((n) => {
    const r = n.getBoundingClientRect();
    return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
  });
  const mid = (n) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
  svg.querySelectorAll('path').forEach((path) => {
    const a = notes[path.dataset.from];
    const b = notes[path.dataset.to];
    const ca = mid(a);
    const cb = mid(b);
    const dx = cb.x - ca.x;
    const dy = cb.y - ca.y;
    let p1, p2, c1, c2;
    if (Math.abs(dx) > Math.abs(dy)) {
      const s = Math.sign(dx);
      p1 = { x: ca.x + (s * a.w) / 2, y: ca.y };
      p2 = { x: cb.x - (s * b.w) / 2, y: cb.y };
      const k = (p2.x - p1.x) / 2;
      c1 = { x: p1.x + k, y: p1.y };
      c2 = { x: p2.x - k, y: p2.y };
    } else {
      const s = Math.sign(dy);
      // Sai um pouco para o lado da outra nota, para a curva não ficar reta demais
      const sx = Math.sign(dx);
      p1 = { x: ca.x + sx * Math.min(Math.abs(dx), a.w * 0.3), y: ca.y + (s * a.h) / 2 };
      p2 = { x: cb.x - sx * Math.min(Math.abs(dx), b.w * 0.3), y: cb.y - (s * b.h) / 2 };
      const k = (p2.y - p1.y) / 2;
      c1 = { x: p1.x, y: p1.y + k };
      c2 = { x: p2.x, y: p2.y - k };
    }
    const r = (v) => Math.round(v * 10) / 10;
    path.setAttribute('d', `M${r(p1.x)} ${r(p1.y)} C${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(p2.x)} ${r(p2.y)}`);
  });
}

// Mapa de dias escritos do Painel: 7 linhas (dias) x 20 semanas. Os níveis vêm de
// uma conta fixa (não aleatória) para o desenho ser sempre o mesmo, com mais
// escrita nas semanas recentes, como alguém que pegou o hábito.
function buildHeatmap(el) {
  if (!el) return;
  const weeks = 20;
  const frag = document.createDocumentFragment();
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const cell = document.createElement('i');
      const v = (Math.sin(w * 12.9898 + d * 78.233) * 43758.5453) % 1;
      const r = Math.abs(v) + (w / weeks) * 0.55;
      const level = r > 1.15 ? 3 : r > 0.9 ? 2 : r > 0.62 ? 1 : 0;
      if (level) cell.dataset.l = level;
      cell.style.setProperty('--w', w);
      frag.append(cell);
    }
  }
  el.append(frag);
}
