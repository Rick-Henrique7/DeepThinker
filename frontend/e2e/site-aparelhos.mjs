// Site nos aparelhos do DevTools: uso `node e2e/site-aparelhos.mjs <url> <pasta-saida>`
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [url, out] = process.argv.slice(2);
const { orientations, clippedElements } = await import('./dispositivos.ts').catch(() => import('./dispositivos.mjs'));
fs.mkdirSync(`${out}/prints`, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
for (const d of orientations()) {
  const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, isMobile: d.mobile, hasTouch: d.mobile, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  const problems = [];
  p.on('pageerror', (e) => problems.push('JS: ' + e.message.slice(0, 120)));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const slug = d.label.replace(/[^\w×]+/g, '-');
  await p.screenshot({ path: `${out}/prints/${slug}.png` });
  await p.screenshot({ path: `${out}/prints/${slug}-inteira.png`, fullPage: true });
  if (await p.locator('vite-error-overlay').count()) problems.push('erro do Vite na tela');
  const side = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (side > 0) problems.push(`rola ${side}px para o lado`);
  const cut = await p.evaluate(clippedElements);
  if (cut.length) problems.push(`cortado na lateral: ${cut.join(', ')}`);
  results.push({ aparelho: d.label, problemas: problems });
  console.log(problems.length ? 'FALHA' : 'OK   ', d.label, problems.join(' | '));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${out}/resultado.json`, JSON.stringify(results, null, 2));
