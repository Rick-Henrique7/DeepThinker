import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Mesma config, com o Chromium já instalado no ambiente (CHROMIUM_PATH). */
export default defineConfig({
  ...base,
  reporter: [['line']],
  workers: 6,
  use: { ...base.use, launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
});
