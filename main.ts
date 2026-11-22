// SOLPORT — gta6-01 entrypoint, rewritten in the retry session (19 Nov 2026):
// copies game/ + screenshots/ to the output dir and writes dossier.json with
// the vendored make.fun library. SOLPORT is a 100%-original open-world crime
// game: the fictional coastal city of Solport, five story missions for driver
// Jax Marlowe against the Harbor Kings, traffic, pedestrians, a 0-5 star
// wanted system with police chases, combat, a minimap HUD, synth sound and
// localStorage saves — three.js vendored under game/vendor/, no network
// references anywhere. Put 4 JPEG screenshots in screenshots/ (the first by
// name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR?.trim() ? process.env.MAKEFUN_OUTPUT_DIR : '/output';

// Fail loudly instead of shipping a half-copied entry: game/ is the whole
// entry, and screenshots/ must exist (even if a shot is later regenerated).
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
if (!existsSync(gameDir)) {
  console.error(`SOLPORT build failed: ${gameDir} is missing — nothing to ship.`);
  process.exit(1);
}
if (!existsSync(shotsDir)) {
  console.error(`SOLPORT build failed: ${shotsDir} is missing — add the 4 JPEG screenshots first.`);
  process.exit(1);
}
// The entry is a static game: index.html must exist, and screenshots/ must
// hold 1-4 real JPEG files (the scorer refuses anything else, so refuse
// here first with a readable message instead of a cryptic dossier error).
const entryHtml = join(gameDir, 'index.html');
if (!existsSync(entryHtml)) {
  console.error(`SOLPORT build failed: ${entryHtml} is missing — the game has no entrypoint.`);
  process.exit(1);
}
const shotFiles = readdirSync(shotsDir).filter((f) => /\.(jpe?g)$/i.test(f));
const oversized = shotFiles.filter((f) => statSync(join(shotsDir, f)).size > 262144);
if (shotFiles.length < 1 || shotFiles.length > 4) {
  console.error(`SOLPORT build failed: screenshots/ holds ${shotFiles.length} JPEG(s), expected 1-4.`);
  process.exit(1);
}
if (oversized.length > 0) {
  console.error(`SOLPORT build failed: screenshot(s) over 256 KiB: ${oversized.join(', ')}.`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
let dossier;
try {
  dossier = buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
} catch (err) {
  console.error('SOLPORT build failed: buildDossier refused the output —', err instanceof Error ? err.message : err);
  process.exit(1);
}
if (!dossier || dossier.length < 10) {
  console.error('SOLPORT build failed: buildDossier returned an empty dossier.');
  process.exit(1);
}
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`SOLPORT build OK: game/ + screenshots/ copied to ${out}, dossier.json written (${dossier.length} bytes).`);
