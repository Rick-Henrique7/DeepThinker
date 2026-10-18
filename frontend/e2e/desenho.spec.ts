import { test, expect } from '@playwright/test';
import { prepare } from './mocks';

/**
 * Desenho à mão livre (Excalidraw): desenha na nota, o bloco ```excalidraw entra no texto
 * e no modo Ler vira a imagem do desenho. O Canvas ganha o botão de desenho.
 */
test('insere um desenho na nota e mostra como imagem no modo Ler', async ({ page }) => {
  test.setTimeout(90_000); // o Excalidraw é grande: a primeira carga demora
  await prepare(page);
  await page.goto('/grafo?focus=1');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();

  await page.getByRole('button', { name: 'Inserir um desenho' }).click();
  const editor = page.locator('[data-drawing-editor]');
  const canvas = editor.locator('canvas.interactive');
  await expect(canvas).toBeVisible({ timeout: 60_000 });

  // Ferramenta Retângulo e um arrasto no quadro
  await editor.getByTitle(/Retângulo/).first().click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 60);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Salvar desenho' }).click();
  await expect(editor).toHaveCount(0);

  const text = page.locator('[data-note-editor] textarea');
  await expect(text).toHaveValue(/```excalidraw\n\{.*"type":"rectangle".*\}\n```/s);

  await page.getByRole('button', { name: 'Ler', exact: true }).click();
  const drawing = page.locator('[data-drawing]');
  await expect(drawing.getByRole('img', { name: 'Desenho' })).toBeVisible({ timeout: 30_000 });

  // Editar desenho abre o editor de novo, com o retângulo; Cancelar não muda nada
  await drawing.getByRole('button', { name: 'Editar desenho' }).click();
  await expect(page.locator('[data-drawing-editor] canvas.interactive')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('[data-drawing-editor]')).toHaveCount(0);
});

test('o Canvas tem o botão de desenho à mão livre', async ({ page }) => {
  await prepare(page);
  await page.goto('/canvas/1');
  await expect(page.getByRole('button', { name: 'Desenho à mão livre' })).toBeVisible();
});
