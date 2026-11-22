// SOLPORT screenshot capture (retry session, 19 Nov 2026).
// Loads each ?shot= staging mode in headless Chromium, waits for the scene
// to settle, saves 1280x720 JPEG quality ~0.85 (each <= 256 KiB).
// Run with the dev server up: `node serve.ts` (http://localhost:8080).
// Usage: node tools/shots.mjs
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

// Resolve Playwright without depending on one machine's layout: prefer a
// repo-local install, then the legacy workspace path this script used to
// hardcode, then whatever Node can resolve from the repo root.
const PLAYWRIGHT_CANDIDATES = [
  join(repo, 'node_modules', 'playwright', 'package.json'),
  '/home/hatch/workspace/start-dev-competition-26/node_modules/playwright/package.json',
  join(repo, 'node_modules', 'playwright-core', 'package.json'),
];
const found = PLAYWRIGHT_CANDIDATES.find((p) => existsSync(p));
if (!found) {
  console.error('Playwright not found. Tried:\n' + PLAYWRIGHT_CANDIDATES.map((p) => '  - ' + p).join('\n'));
  console.error('Install it in the repo (`npm i -D playwright` + `npx playwright install chromium`) and retry.');
  process.exit(1);
}
const require = createRequire(found);
const { chromium } = require('playwright');
console.log(`Using Playwright from ${found}`);
// Shot list: shots.json at the repo root when present, else the built-in
// default (the four staged shots). shots.json was removed from the repo in
// the resubmit polish pass; the tool keeps working without it.
const DEFAULT_SHOTS = [
  { name: '1-chase.jpg', query: '?shot=chase&seed=1' },
  { name: '2-mission.jpg', query: '?shot=mission&seed=1' },
  { name: '3-city.jpg', query: '?shot=city&seed=1' },
  { name: '4-drive.jpg', query: '?shot=drive&seed=1' },
];
let shots = DEFAULT_SHOTS;
const shotsFile = join(repo, 'shots.json');
if (existsSync(shotsFile)) {
  const parsed = JSON.parse(readFileSync(shotsFile, 'utf8'));
  if (Array.isArray(parsed) && parsed.length > 0) shots = parsed;
}
if (!Array.isArray(shots) || shots.length === 0) {
  console.error('No shots configured (shots.json or built-in default); nothing to capture.');
  process.exit(1);
}
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
