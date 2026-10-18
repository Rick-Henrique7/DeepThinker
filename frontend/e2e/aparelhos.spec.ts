import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { prepare } from './mocks';
import { orientations, clippedElements, smallTouchTargets } from './dispositivos';

/**
 * Responsividade em todos os aparelhos do DevTools do Chrome, em pé e deitado.
 *
 * Falha quando: a página rola para o lado, algo sai cortado pela lateral,
 * ou o campo de mensagem do Advogado some ou fica embaixo do menu.
 * Botões menores que 44px só entram no relatório (não falham o teste).
 * Prints em e2e-aparelhos/prints, resumo em e2e-aparelhos/resultados.
 */
const OUT = 'e2e-aparelhos';
const PAGES = [
  { name: 'Login', path: '/', loggedOut: true },
  { name: 'Pensar', path: '/' },
  { name: 'Grafo', path: '/grafo' },
  { name: 'Grafo tabela', path: '/grafo?view=tabela' },
  { name: 'Grafo quadro', path: '/grafo?view=quadro' },
  { name: 'Advogado vazio', path: '/advogado' },
  { name: 'Advogado com conversa', path: '/advogado?session=teste' },
  { name: 'Painel', path: '/painel' },
  { name: 'Canvas', path: '/canvas' },
  { name: 'Leitor', path: '/leitor' },
  { name: 'Leitor PDF', path: '/leitor/72' },
  { name: 'Leitor texto', path: '/leitor/68' },
  { name: 'IA', path: '/settings' },
];

async function coveredOrCut(page: Page, selector: string): Promise<string | null> {
  const box = await page.locator(selector).first().boundingBox().catch(() => null);
  if (!box) return `${selector} não apareceu`;
  const vh = page.viewportSize()!.height;
  if (box.y + box.height > vh + 1) return `${selector} sai pela base da tela`;
  return page.evaluate(({ box, sel }) => {
    const target = document.querySelector(sel)!;
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.8], [0.7, 0.8]]) {
      const top = document.elementFromPoint(box.x + box.width * fx, box.y + box.height * fy);
      if (top && !target.contains(top)) return `${sel} coberto por ${top.tagName.toLowerCase()}.${String(top.className).slice(0, 40)}`;
    }
    return null;
  }, { box, sel: selector });
}

for (const d of orientations()) {
  test.describe(d.label, () => {
    test.use({ viewport: { width: d.width, height: d.height }, isMobile: d.mobile, hasTouch: d.mobile, deviceScaleFactor: 1 });
    for (const pg of PAGES) {
      test(pg.name, async ({ page }, info) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push('JS: ' + e.message.slice(0, 120)));
        await prepare(page, { loggedIn: !pg.loggedOut });
        await page.goto(pg.path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(600);
        const slug = `${d.label} ${pg.name}`.replace(/[^\w×]+/g, '-');
        fs.mkdirSync(`${OUT}/prints`, { recursive: true });
        fs.mkdirSync(`${OUT}/resultados`, { recursive: true });
        await page.screenshot({ path: `${OUT}/prints/${slug}.png` });

        const problems: string[] = [...errors];
        const side = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (side > 0) problems.push(`rola ${side}px para o lado`);
        const cut = await page.evaluate(clippedElements);
        if (cut.length) problems.push(`cortado na lateral: ${cut.join(', ')}`);
        if (pg.path.startsWith('/advogado')) {
          for (const sel of ['textarea', 'button[aria-label="Enviar"]']) {
            const p = await coveredOrCut(page, sel);
            if (p) problems.push(p);
          }
        }
        const small = d.mobile ? await page.evaluate(smallTouchTargets, 44) : [];
        fs.writeFileSync(`${OUT}/resultados/${slug}.json`, JSON.stringify({ aparelho: d.label, largura: d.width, altura: d.height, tela: pg.name, problemas: problems, toquePequeno: small, print: `prints/${slug}.png` }));
        expect(problems, 'problemas de layout').toEqual([]);
      });
    }
  });
}
