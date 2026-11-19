// SOLPORT screenshot capture (retry session, 19 Nov 2026).
// Loads each ?shot= staging mode in headless Chromium, waits for the scene
// to settle, saves 1280x720 JPEG quality ~0.85 (each <= 256 KiB).
// Run with the dev server up: `node serve.ts` (http://localhost:8080).
// Usage: node tools/shots.mjs
import { createRequire } from 'node:module';
import { readFileSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const require = createRequire('/home/hatch/workspace/start-dev-competition-26/node_modules/playwright/package.json');
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8'));
mkdirSync(join(repo, 'screenshots'), { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));

for (const s of shots) {
  const url = 'http://localhost:8080/' + s.query;
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.SOLPORT_READY === true, null, { timeout: 60000 });
  await page.waitForTimeout(3000); // let the staged scene settle / animate in
  const out = join(repo, 'screenshots', s.name);
  let quality = 85;
  await page.screenshot({ path: out, type: 'jpeg', quality });
  let size = statSync(out).size;
  while (size > 256 * 1024 && quality > 50) {
    quality -= 10;
    await page.screenshot({ path: out, type: 'jpeg', quality });
    size = statSync(out).size;
  }
  console.log(s.name, size, 'bytes, quality', quality);
}
await browser.close();
console.log('done');
