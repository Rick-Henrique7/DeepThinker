import { test, expect, type Page } from '@playwright/test';
import { prepare } from './mocks';

/**
 * Responsividade: cada tela em 7 larguras, do celular pequeno ao desktop.
 *
 * Regras checadas:
 * 1. Nada de rolagem para o lado.
 * 2. O campo de mensagem do Advogado aparece inteiro e não fica embaixo do menu.
 * 3. Botões com área de toque de pelo menos 44px no celular (regra da Apple/Google).
 * Cada teste anexa um print da tela ao relatório (npx playwright show-report).
 */
// Larguras e alturas de aparelhos comuns: iPhone SE, iPhone 8, iPhone 14, iPhone Plus,
// iPad em pé, notebook pequeno e desktop.
const SCREENS: [number, number][] = [[320, 568], [375, 667], [390, 844], [414, 896], [768, 1024], [1024, 768], [1440, 900]];
const PAGES = [
  { name: 'Pensar', path: '/' },
  { name: 'Grafo', path: '/grafo' },
  { name: 'Advogado vazio', path: '/advogado' },
  { name: 'Advogado com conversa', path: '/advogado?session=teste' },
  { name: 'Painel', path: '/painel' },
  { name: 'Canvas', path: '/canvas' },
  { name: 'Leitor', path: '/leitor' },
  { name: 'Leitor PDF', path: '/leitor/72' },
  { name: 'Leitor texto', path: '/leitor/68' },
  { name: 'IA', path: '/settings' },
  { name: 'Login', path: '/', loggedOut: true },
];
const MIN_TOUCH = 44;

async function noSideScroll(page: Page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(extra, 'a página rola para o lado').toBeLessThanOrEqual(0);
}

/** O elemento está inteiro dentro da tela e nada (menu, aviso) está por cima dele. */
async function fullyVisible(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} não apareceu`).not.toBeNull();
  const vh = page.viewportSize()!.height;
  expect(box!.y + box!.height, `${selector} sai pela base da tela`).toBeLessThanOrEqual(vh);
  // Confere o meio e as bordas de baixo do elemento: é ali que o menu inferior costuma cobrir
  const points = [
    [box!.x + box!.width / 2, box!.y + box!.height / 2],
    [box!.x + box!.width * 0.3, box!.y + box!.height * 0.8],
    [box!.x + box!.width * 0.7, box!.y + box!.height * 0.8],
  ];
  const covered = await page.evaluate(({ points, sel }) => {
    const target = document.querySelector(sel)!;
    for (const [x, y] of points) {
      const top = document.elementFromPoint(x, y);
      if (top && !target.contains(top)) return top.outerHTML.slice(0, 80);
    }
    return null;
  }, { points, sel: selector });
  expect(covered, `${selector} está coberto por outro elemento`).toBeNull();
}

async function smallTouchTargets(page: Page) {
  return page.evaluate((min) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, a[href], [role="tab"], select')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.width < min || r.height < min) {
        const name = (el.getAttribute('aria-label') || el.title || el.innerText || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30);
        out.push(`${name} (${Math.round(r.width)}×${Math.round(r.height)})`);
      }
    }
    return out;
  }, MIN_TOUCH);
}

for (const [width, height] of SCREENS) {
  const mobile = width < 768;
  test.describe(`${width}×${height}`, () => {
    // Celular de verdade é toque: sem isso o Chromium finge mouse e as variantes fino: encolhem os botões.
    test.use({ viewport: { width, height }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });

    for (const pg of PAGES) {
      test(pg.name, async ({ page }, info) => {
        await prepare(page, { loggedIn: !pg.loggedOut });
        await page.goto(pg.path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
        await info.attach(`${pg.name} ${width}px`, { body: await page.screenshot(), contentType: 'image/png' });

        await noSideScroll(page);
        if (pg.path.startsWith('/advogado')) {
          await fullyVisible(page, 'textarea');
          await fullyVisible(page, 'button[aria-label="Enviar"]');
        }
        if (mobile) {
          const small = await smallTouchTargets(page);
          expect.soft(small, `botões menores que ${MIN_TOUCH}px`).toEqual([]);
        }
      });
    }
  });
}
