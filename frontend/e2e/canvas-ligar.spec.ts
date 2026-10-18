import { test, expect, type Page } from '@playwright/test';
import { prepare } from './mocks';

/**
 * Ligar cartões no Canvas puxando a bolinha da borda (igual ao n8n): soltar em cima de
 * outro cartão liga os dois; só soltar no vazio cria um cartão novo.
 */
const cards = (page: Page) => page.locator('[data-node-id]');
const edges = (page: Page) => page.locator('g[data-edge-id]');

async function open(page: Page) {
  await prepare(page);
  await page.goto('/canvas/1');
  await expect(cards(page)).toHaveCount(4);
  await expect(edges(page)).toHaveCount(2);
}

/** Seleciona o cartão e arrasta a bolinha de um lado dele até (x, y) da tela. */
async function dragHandle(page: Page, nodeId: string, side: string, to: { x: number; y: number }) {
  await page.locator(`[data-node-id="${nodeId}"]`).click({ position: { x: 20, y: 100 } });
  const handle = page.locator(`[data-node-id="${nodeId}"]`).getByRole('button', { name: `Puxar uma seta pelo lado ${side}` });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move((box.x + to.x) / 2, (box.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

test('soltar a bolinha em cima de outro cartão liga os dois', async ({ page }) => {
  await open(page);
  const d = (await page.locator('[data-node-id="d"]').boundingBox())!;
  await dragHandle(page, 'c', 'direito', { x: d.x + d.width / 2, y: d.y + d.height / 2 });
  await expect(edges(page)).toHaveCount(3);
  await expect(cards(page)).toHaveCount(4);
});

test('soltar a bolinha na bolinha de entrada do outro cartão também liga', async ({ page }) => {
  await open(page);
  const d = (await page.locator('[data-node-id="d"]').boundingBox())!;
  // Bem em cima da borda esquerda (onde fica a porta de entrada), até um pouco para fora.
  await dragHandle(page, 'c', 'direito', { x: d.x - 6, y: d.y + d.height / 2 });
  await expect(edges(page)).toHaveCount(3);
  await expect(cards(page)).toHaveCount(4);
});

test('enquanto puxa, a bolinha de entrada do cartão de destino acende', async ({ page }) => {
  await open(page);
  await page.locator('[data-node-id="c"]').click({ position: { x: 20, y: 100 } });
  const handle = page.locator('[data-node-id="c"]').getByRole('button', { name: 'Puxar uma seta pelo lado direito' });
  const box = (await handle.boundingBox())!;
  const d = (await page.locator('[data-node-id="d"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x - 6, d.y + d.height / 2, { steps: 8 });
  await expect(page.locator('[data-node-id="d"] [data-port-active]')).toHaveAttribute('data-port', 'left');
  await page.mouse.up();
  await expect(page.locator('[data-port]')).toHaveCount(0);
});

test('soltar a bolinha no vazio cria um cartão novo ligado', async ({ page }) => {
  await open(page);
  const d = (await page.locator('[data-node-id="d"]').boundingBox())!;
  await dragHandle(page, 'd', 'direito', { x: d.x + d.width + 200, y: d.y + d.height / 2 });
  await expect(cards(page)).toHaveCount(5);
  await expect(edges(page)).toHaveCount(3);
});
