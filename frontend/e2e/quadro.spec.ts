import { test, expect, type Page, type Route } from '@playwright/test';
import { prepare } from './mocks';

/**
 * Quadro (Kanban): só as notas que a pessoa mandou para lá, colunas editáveis pela tela
 * (criar, renomear, mudar de lugar, excluir com confirmação), cartão novo direto no Quadro
 * e "Tirar do Quadro" sem apagar a nota. O servidor é simulado com estado.
 */

interface Card { id: number; title: string; tags: string[]; board_only: boolean }
interface Col { id: number; name: string; position: number; cards: Card[] }

async function fakeBoard(page: Page) {
  let seq = 100;
  const calls: string[] = [];
  const cols: Col[] = [
    { id: 1, name: 'a fazer', position: 0, cards: [{ id: 11, title: 'Abrir a loja', tags: [], board_only: false }] },
    { id: 2, name: 'fazendo', position: 1, cards: [{ id: 12, title: 'Comprar máquina', tags: [], board_only: false }] },
  ];
  const board = () => ({ property: 'status', columns: cols.map((c, i) => ({ ...c, position: i })) });
  const handle = async (r: Route) => {
    const req = r.request();
    const path = new URL(req.url()).pathname.replace(/^.*\/api/, '');
    const body = req.postData() ? req.postDataJSON() : {};
    calls.push(`${req.method()} ${path}`);
    let m: RegExpExecArray | null;
    if (path === '/board' && req.method() === 'GET') return r.fulfill({ json: board() });
    if (path === '/board/columns' && req.method() === 'POST') {
      const c = { id: ++seq, name: body.name, position: cols.length, cards: [] };
      cols.push(c);
      return r.fulfill({ status: 201, json: c });
    }
    if ((m = /^\/board\/columns\/(\d+)$/.exec(path))) {
      const i = cols.findIndex((c) => c.id === Number(m![1]));
      if (req.method() === 'DELETE') {
        const [c] = cols.splice(i, 1);
        return r.fulfill({ json: { message: 'ok', cards_removed: c.cards.length } });
      }
      if (body.name) cols[i].name = body.name;
      if (body.position !== undefined) cols.splice(body.position, 0, ...cols.splice(i, 1));
      return r.fulfill({ json: board() });
    }
    if (path === '/board/cards') {
      const c = cols.find((x) => x.name === body.column)!;
      const card = { id: ++seq, title: body.title, tags: [], board_only: true };
      c.cards.unshift(card);
      return r.fulfill({ status: 201, json: card });
    }
    if ((m = /^\/board\/notes\/(\d+)$/.exec(path))) {
      const id = Number(m[1]);
      const card = cols.flatMap((c) => c.cards).find((c) => c.id === id);
      cols.forEach((c) => (c.cards = c.cards.filter((x) => x.id !== id)));
      if (req.method() === 'PUT') {
        const target = cols.find((c) => c.name === body.column) ?? cols[0];
        target.cards.unshift(card ?? { id, title: `Nota ${id}`, tags: [], board_only: false });
        return r.fulfill({ json: { id, column: target.name } });
      }
      return r.fulfill({ json: { id, message: 'ok' } });
    }
    return r.fallback();
  };
  await page.route(/\/api\/board/, handle);
  return { calls, cols };
}

test('mostra só os cartões do Quadro e edita as colunas', async ({ page }) => {
  await prepare(page);
  const { calls } = await fakeBoard(page);
  await page.goto('/grafo?view=quadro');

  await expect(page.locator('[data-column="a fazer"]')).toContainText('Abrir a loja');
  await expect(page.locator('[data-column]')).toHaveCount(2);
  await expect(page.getByText('Sem status')).toHaveCount(0);

  // Nova coluna
  await page.getByRole('button', { name: 'Nova coluna' }).click();
  await page.getByLabel('Nome da nova coluna').fill('Revisão');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-column="Revisão"]')).toBeVisible();

  // Renomear pelo menu da coluna
  await page.getByRole('button', { name: 'Opções da coluna Revisão' }).click();
  await page.getByRole('menuitem', { name: 'Renomear' }).click();
  await page.getByLabel('Novo nome da coluna Revisão').fill('Revisar');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-column="Revisar"]')).toBeVisible();

  // Mover para a esquerda
  await page.getByRole('button', { name: 'Opções da coluna Revisar' }).click();
  await page.getByRole('menuitem', { name: 'Mover para a esquerda' }).click();
  await expect(page.locator('[data-column]').nth(1)).toHaveAttribute('data-column', 'Revisar');

  // Excluir pede confirmação e avisa que nenhuma nota é apagada
  await page.getByRole('button', { name: 'Opções da coluna fazendo' }).click();
  await page.getByRole('menuitem', { name: 'Excluir coluna' }).click();
  await expect(page.getByText(/Nenhuma nota é apagada/)).toBeVisible();
  await page.getByRole('button', { name: 'Excluir coluna' }).last().click();
  await expect(page.locator('[data-column="fazendo"]')).toHaveCount(0);
  expect(calls).toContain('DELETE /board/columns/2');
});

test('cartão novo no Quadro e "Tirar do Quadro" sem apagar a nota', async ({ page }) => {
  await prepare(page);
  const { calls } = await fakeBoard(page);
  await page.goto('/grafo?view=quadro');

  const col = page.locator('[data-column="a fazer"]');
  await col.getByRole('button', { name: 'Adicionar cartão' }).click();
  await page.getByLabel('Título do novo cartão em a fazer').fill('Ligar para o fornecedor');
  await page.keyboard.press('Enter');
  await expect(col).toContainText('Ligar para o fornecedor');
  await expect(col).toContainText('só no Quadro');

  await col.getByRole('button', { name: 'Tirar "Abrir a loja" do Quadro', exact: true }).click();
  await expect(col).not.toContainText('Abrir a loja');
  expect(calls).toContain('DELETE /board/notes/11');
  expect(calls.filter((c) => c.startsWith('DELETE /notes'))).toHaveLength(0);
});

test('nota fora do Quadro ganha "Enviar para o Kanban"', async ({ page }) => {
  await prepare(page);
  const { calls } = await fakeBoard(page);
  let status: string | null = null;
  await page.route(/\/api\/notes\/5$/, (r) =>
    r.fulfill({
      json: { id: 5, title: 'Ideia solta', content: 'Texto.', tags: [], properties: status ? { status } : {}, source_type: null,
        created_at: '2026-10-17T10:00:00Z', updated_at: '2026-10-17T10:00:00Z' },
    })
  );
  await page.route(/\/api\/board\/notes\/5$/, (r) => {
    calls.push(`${r.request().method()} /board/notes/5`);
    status = r.request().method() === 'PUT' ? 'a fazer' : null;
    return r.fulfill({ json: { id: 5, column: 'a fazer' } });
  });
  await page.goto('/grafo?focus=5');
  await page.getByRole('button', { name: 'Enviar para o Kanban' }).click();
  await expect(page.getByText('No Quadro, em')).toBeVisible();
  await page.getByRole('button', { name: 'Tirar do Quadro' }).click();
  await expect(page.getByRole('button', { name: 'Enviar para o Kanban' })).toBeVisible();
  expect(calls).toEqual(expect.arrayContaining(['PUT /board/notes/5', 'DELETE /board/notes/5']));
});

test('o cartão MCP explica como usar e lista as ferramentas', async ({ page }) => {
  await prepare(page);
  await page.goto('/settings');
  await page.getByText('Como usar').click();
  const tools = page.locator('[data-mcp-tools]');
  for (const t of ['create_column', 'delete_column', 'add_to_board', 'remove_from_board', 'create_card', 'move_card']) {
    await expect(tools).toContainText(t);
  }
});
