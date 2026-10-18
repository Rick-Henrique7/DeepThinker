import { test, expect } from '@playwright/test';
import * as Y from 'yjs';
import { prepare } from './mocks';

/**
 * Edição em conjunto: a tela fala com o servidor por WebSocket (simulado aqui).
 * Confere que o texto salvo entra no editor, que o que a pessoa digita sai como atualização
 * do Yjs, que a edição de outra pessoa aparece sem perder a do usuário, e que salva sozinho.
 */
test('edita junto: semeia, manda e recebe edições e salva sozinho', async ({ page }) => {
  await prepare(page);
  const saved: string[] = [];
  await page.route(/\/api\/collab\/notes\/7$/, (r) =>
    r.fulfill({ json: { id: 7, title: 'Plano da cafeteria', content: 'Ideias:\n', owner_name: 'Rick', is_owner: true, collaborators: 1, updated_at: '2026-10-17T10:00:00Z' } })
  );
  await page.route(/\/api\/collab\/notes\/7\/content$/, async (r) => {
    saved.push(r.request().postDataJSON().content);
    return r.fulfill({ json: { id: 7, title: 'Plano da cafeteria', content: saved.at(-1), owner_name: 'Rick', is_owner: true, collaborators: 1, updated_at: '2026-10-17T10:00:01Z' } });
  });
  await page.route(/\/api\/collab\/notes\/7\/shares$/, (r) =>
    r.fulfill({ json: [{ id: 1, user_id: 2, name: 'Ana', email: 'ana@teste.dev', created_at: '2026-10-17T10:00:00Z' }] })
  );

  // O "servidor": guarda o documento que a tela manda e permite empurrar edições de outra pessoa
  const server = new Y.Doc();
  let socket: import('@playwright/test').WebSocketRoute | null = null;
  await page.routeWebSocket(/\/ws\/collab\/7/, (ws) => {
    socket = ws;
    expect(ws.url()).toContain('token=teste');
    ws.send(JSON.stringify({ type: 'init', seed: true, peers: 1 }));
    ws.onMessage((m) => {
      if (typeof m === 'string') return;
      const data = new Uint8Array(m);
      if (data[0] === 0) Y.applyUpdate(server, data.subarray(1));
    });
  });

  await page.goto('/compartilhada/7');
  const editor = page.locator('[data-collab-editor]');
  await expect(editor).toHaveValue('Ideias:\n');
  await expect.poll(() => server.getText('content').toString()).toBe('Ideias:\n');

  // A pessoa digita: a atualização chega ao "servidor"
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('- café de bairro');
  await expect.poll(() => server.getText('content').toString()).toBe('Ideias:\n- café de bairro');

  // Outra pessoa escreve um título no começo: aparece aqui, sem apagar o que foi digitado
  const before = Y.encodeStateVector(server);
  server.getText('content').insert(0, '# Cafeteria\n');
  const update = Y.encodeStateAsUpdate(server, before);
  socket!.send(Buffer.from([0, ...update]));
  await expect(editor).toHaveValue('# Cafeteria\nIdeias:\n- café de bairro');

  // E continua digitando no mesmo lugar (o cursor andou junto com a edição de cima)
  await page.keyboard.type('!');
  await expect(editor).toHaveValue('# Cafeteria\nIdeias:\n- café de bairro!');

  // Salva sozinho depois de parar de digitar
  await expect.poll(() => saved.at(-1), { timeout: 6000 }).toBe('# Cafeteria\nIdeias:\n- café de bairro!');
  await expect(page.getByRole('status').filter({ hasText: 'Salvo' })).toBeVisible();
  await expect(page.getByText('ana@teste.dev')).toBeVisible();
});
