import { defineConfig } from '@playwright/test';

/**
 * Testes de tela com Playwright (npm run test:e2e).
 *
 * Sobe o app com o Vite numa porta própria e responde a API com dados de exemplo
 * (ver e2e/mocks.ts), então não precisa do backend Java rodando.
 * Relatório com prints de cada tela: npx playwright show-report
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5199',
    // Sem animação: os prints saem iguais toda vez
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
