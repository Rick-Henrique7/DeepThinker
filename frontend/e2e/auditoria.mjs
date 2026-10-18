// Auditoria visual: todas as telas e estados (menus, painéis, nota aberta) em todos os aparelhos do DevTools.
// Uso: node e2e/auditoria.mjs <pasta-saida> [filtro-de-aparelho]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const { orientations, clippedElements } = await import('./dispositivos.ts');
const { prepare } = await import('./mocks.ts');
const [out, only] = process.argv.slice(2);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5199';
fs.mkdirSync(`${out}/prints`, { recursive: true });

const STATES = [
  { name: 'Login', path: '/', loggedOut: true },
  { name: 'Pensar', path: '/' },
  { name: 'Grafo', path: '/grafo' },
  { name: 'Grafo ajustes', path: '/grafo', act: (p) => p.getByRole('button', { name: /Ajustes/ }).first().click() },
  { name: 'Grafo tabela', path: '/grafo?view=tabela' },
  { name: 'Grafo quadro', path: '/grafo?view=quadro' },
  { name: 'Nota aberta', path: '/grafo?focus=3' },
  { name: 'Advogado vazio', path: '/advogado' },
  { name: 'Advogado conversa', path: '/advogado?session=teste' },
  { name: 'Advogado modelo', path: '/advogado', act: (p) => p.locator('button[title="Trocar provedor/modelo"]').click() },
  { name: 'Painel', path: '/painel' },
  { name: 'Canvas', path: '/canvas' },
  { name: 'Canvas aberto', path: '/canvas/1' },
  { name: 'Leitor', path: '/leitor' },
  { name: 'Leitor PDF', path: '/leitor/72' },
  { name: 'Leitor texto', path: '/leitor/68' },
  { name: 'IA', path: '/settings' },
  { name: 'Menu Mais', path: '/painel', act: (p) => p.locator('button[aria-controls="mais-menu"]').click() },
  { name: 'Busca Ctrl+K', path: '/', act: (p) => p.keyboard.press('Control+k') },
];

/** No navegador: problemas que o olho pega e o teste antigo não pegava. */
function inspect() {
  const vw = innerWidth, vh = innerHeight;
  const vis = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && Number(s.opacity) > 0.05; };
  const label = (el) => (el.getAttribute('aria-label') || el.title || el.innerText || el.placeholder || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 28);
  const fixedAncestor = (el) => { for (let p = el; p; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === 'fixed' || pos === 'sticky') return p; } return null; };
  const out = { overlap: [], textOut: [], tiny: [] };
  // 1) Controles e textos um em cima do outro (fora menus fixos)
  const items = [...document.querySelectorAll('button, a[href], input, textarea, select, h1, h2, h3, label, [role="tab"]')].filter(vis);
  // Só a parte que aparece: o que rolou para baixo de um cabeçalho/rodapé fica cortado pela caixa de rolagem
  const visibleRect = (el) => {
    const r = el.getBoundingClientRect(); let { left, top, right, bottom } = r;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll|hidden)/.test(s.overflow + s.overflowX + s.overflowY)) {
        const c = p.getBoundingClientRect();
        left = Math.max(left, c.left); top = Math.max(top, c.top); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom);
      }
    }
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };
  const rects = items.map((el) => ({ el, r: visibleRect(el), fx: fixedAncestor(el) })).filter((x) => x.r.width > 2 && x.r.height > 2);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.el.contains(b.el) || b.el.contains(a.el) || a.fx !== b.fx) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w <= 0 || h <= 0) continue;
    // Um dentro do outro (ícone dentro do campo, botão sobre o cartão) é de propósito
    const inside = (x, y) => x.left >= y.left - 1 && x.right <= y.right + 1 && x.top >= y.top - 1 && x.bottom <= y.bottom + 1;
    if (inside(a.r, b.r) || inside(b.r, a.r)) continue;
    if (a.el.tagName === 'TEXTAREA' || b.el.tagName === 'TEXTAREA') { const t = a.el.tagName === 'TEXTAREA' ? a : b, o = t === a ? b : a; if (o.el.parentElement === t.el.parentElement) continue; }
    const small = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
    if ((w * h) / small > 0.3 && a.r.top < vh && b.r.top < vh) out.overlap.push(`${label(a.el)} × ${label(b.el)}`);
  }
  // 2) Texto vazando da própria caixa (sem rolagem nem reticências)
  for (const el of document.querySelectorAll('button, a, label, span, p, h1, h2, h3, td, th, div')) {
    if (!vis(el) || el.children.length > 3) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasText) continue;
    const s = getComputedStyle(el);
    if (s.overflowX !== 'visible' || s.textOverflow === 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 3 && el.clientWidth > 0) out.textOut.push(`${label(el)} (${el.scrollWidth}>${el.clientWidth})`);
  }
  // 3) Texto pequeno demais para ler no celular
  if (vw < 768) for (const el of document.querySelectorAll('span, p, button, a, label, td, th')) {
    if (!vis(el) || el.closest('.textLayer, [data-page]')) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
    if (hasText && parseFloat(getComputedStyle(el).fontSize) < 10) out.tiny.push(label(el));
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].slice(0, 6);
  return out;
}

/** Rola até o fim: o último conteúdo da página tem que ficar acima do menu inferior. */
async function bottomHidden(p) {
  return p.evaluate(async () => {
    const nav = document.querySelector('nav')?.closest('.fixed');
    if (!nav || getComputedStyle(nav).display === 'none') return null;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 150));
    const navTop = nav.getBoundingClientRect().top;
    const main = document.querySelector('main');
    if (!main) return null;
    let lowest = 0, who = '';
    for (const el of main.querySelectorAll('button, a, input, textarea, p, h2, h3, canvas')) {
      const r = el.getBoundingClientRect();
      if (r.height && r.bottom > lowest && r.bottom <= innerHeight + 2 && getComputedStyle(el).visibility !== 'hidden') { lowest = r.bottom; who = (el.innerText || el.tagName).trim().slice(0, 24); }
    }
    const navRect = nav.getBoundingClientRect();
    const r = navRect.left < 40 && navRect.width < 200 ? null : (lowest > navTop + 4 ? `${who} fica embaixo do menu (${Math.round(lowest - navTop)}px)` : null);
    window.scrollTo(0, 0);
    return r;
  });
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
const devices = orientations().filter((d) => !only || d.label.includes(only));
await Promise.all(Array.from({ length: 6 }, async (_, w) => {
  for (let i = w; i < devices.length; i += 6) {
    const d = devices[i];
    for (const st of STATES) {
      const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, isMobile: d.mobile, hasTouch: d.mobile, reducedMotion: 'reduce' });
      const p = await ctx.newPage();
      const problems = [];
      p.on('pageerror', (e) => problems.push('JS: ' + e.message.slice(0, 100)));
      await prepare(p, { loggedIn: !st.loggedOut });
      await p.goto(BASE + st.path, { waitUntil: 'networkidle' }).catch(() => {});
      await p.waitForTimeout(500);
      if (st.act) { try { await st.act(p); await p.waitForTimeout(400); } catch (e) { problems.push('não abriu: ' + e.message.split('\n')[0].slice(0, 80)); } }
      const slug = `${st.name}__${d.label}`.replace(/[^\w×]+/g, '-');
      await p.screenshot({ path: `${out}/prints/${slug}.png` });
      const side = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (side > 0) problems.push(`rola ${side}px para o lado`);
      const cut = await p.evaluate(clippedElements);
      if (cut.length) problems.push('cortado: ' + cut.join(', '));
      const ins = await p.evaluate(inspect);
      if (ins.overlap.length) problems.push('sobreposto: ' + ins.overlap.join(' | '));
      if (ins.textOut.length) problems.push('texto vazando: ' + ins.textOut.join(' | '));
      if (ins.tiny.length) problems.push('texto < 10px: ' + ins.tiny.join(' | '));
      if (!st.act) { const b = await bottomHidden(p); if (b) problems.push(b); }
      results.push({ tela: st.name, aparelho: d.label, w: d.width, h: d.height, problemas: problems, print: slug });
      await ctx.close();
    }
  }
}));
await browser.close();
fs.writeFileSync(`${out}/resultado.json`, JSON.stringify(results, null, 1));
const bad = results.filter((r) => r.problemas.length);
console.log(`${results.length} capturas, ${bad.length} com problema`);
