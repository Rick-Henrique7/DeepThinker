import { test, expect, type Page } from '@playwright/test';
import { prepare } from './mocks';
import { PLUGIN_EXAMPLES } from '../src/lib/pluginExamples';

/**
 * Plugins da comunidade: rodam isolados (iframe sem a origem do app, sem rede) e só fazem
 * o que as permissões deixam. Os comandos aparecem no Ctrl+K.
 */

const installed = (list: { id: string; name: string; permissions?: string[]; code: string }[]) =>
  list.map((m, i) => ({
    id: i + 1, key: m.id, name: m.name, version: '1.0.0', description: null, author: null,
    permissions: m.permissions ?? [], code: m.code, enabled: true, updated_at: '2026-10-17T10:00:00Z',
  }));

async function withPlugins(page: Page, list: Parameters<typeof installed>[0]) {
  await prepare(page);
  await page.route(/\/api\/plugins$/, (r) => r.fulfill({ json: installed(list) }));
}

async function runCommand(page: Page, title: string) {
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox').last().fill(title);
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
}

test('comandos dos exemplos aparecem no Ctrl+K e agem na nota aberta', async ({ page }) => {
  await withPlugins(page, PLUGIN_EXAMPLES);
  await page.goto('/grafo?focus=1');
  await expect(page.getByRole('heading', { level: 1 }).or(page.locator('h2')).first()).toBeVisible();
  await page.waitForTimeout(500); // os iframes registram os comandos

  await runCommand(page, 'Contar palavras');
  await expect(page.getByRole('status').filter({ hasText: 'palavras' })).toBeVisible();

  await runCommand(page, 'Inserir data e hora');
  const editor = page.locator('[data-note-editor] textarea');
  await expect(editor).toHaveValue(/\*\*\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\*\* — /);
});

test('plugin não vê o login, a página nem a rede, e não lê a nota sem permissão', async ({ page }) => {
  const spy = `deepthinker.registerCommand('espiar', 'Espiar o app', async () => {
    const r = [];
    try { r.push('token=' + localStorage.getItem('deepthinker.token')); } catch (e) { r.push('token=bloqueado'); }
    try { r.push('pagina=' + parent.document.title); } catch (e) { r.push('pagina=bloqueado'); }
    try { await fetch('http://localhost:5199/api/notes'); r.push('rede=aberta'); } catch (e) { r.push('rede=bloqueado'); }
    try { await deepthinker.getActiveNote(); r.push('nota=lida'); } catch (e) { r.push('nota=bloqueado'); }
    try { await deepthinker.insertText('x'); r.push('escrita=feita'); } catch (e) { r.push('escrita=bloqueado'); }
    deepthinker.notify(r.join(' '));
  });`;
  await withPlugins(page, [{ id: 'espiao', name: 'Espião', permissions: ['commands'], code: spy }]);
  await page.goto('/grafo?focus=1');
  await page.waitForTimeout(500);
  await runCommand(page, 'Espiar o app');
  await expect(page.getByRole('status').filter({ hasText: 'token=' })).toHaveText(
    /token=bloqueado pagina=bloqueado rede=bloqueado nota=bloqueado escrita=bloqueado/
  );
});

test('instalar um exemplo mostra as permissões antes', async ({ page }) => {
  await prepare(page);
  const posted: unknown[] = [];
  let list: ReturnType<typeof installed> = [];
  await page.route(/\/api\/plugins$/, async (r) => {
    if (r.request().method() === 'POST') {
      const m = r.request().postDataJSON();
      posted.push(m);
      list = installed([m]);
      return r.fulfill({ status: 201, json: list[0] });
    }
    return r.fulfill({ json: list });
  });
  await page.goto('/settings');
  const card = page.locator('section').filter({ hasText: 'Plugins adicionam comandos' });
  await card.getByRole('button', { name: 'Instalar', exact: true }).first().click();
  await expect(page.getByText(/Ele poderá: Ler a nota que está aberta/)).toBeVisible();
  await page.getByRole('button', { name: 'Instalar', exact: true }).last().click();
  await expect(card.getByText('Contador de palavras').first()).toBeVisible();
  expect(posted).toHaveLength(1);
  await expect(card.getByRole('switch', { name: /Desligar Contador/ })).toBeVisible();
});
