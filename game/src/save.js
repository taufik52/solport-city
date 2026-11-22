// SOLPORT — save.js (retry session, 19 Nov 2026)
// localStorage save: cash, mission progress, stats, collected sun-packages.
// Plain JSON, versioned key so a future build never misreads an old save.

import { CONFIG, SUN_PACKAGES } from './config.js';

const WEAPON_NAMES = ['fists', 'pistol', 'smg'];
const PACKAGE_KEYS = new Set(SUN_PACKAGES.map(([x, z]) => `${x},${z}`));

// A save from an older build, a tampered file, or a stray localStorage
// entry must never crash the game or warp progress: coerce every field
// back into range and drop anything unrecognised.
function sanitize(data) {
  const clean = defaultSave();
  if (typeof data.cash === 'number' && Number.isFinite(data.cash)) {
    clean.cash = Math.max(0, Math.min(999999, Math.floor(data.cash)));
  }
  if (Number.isInteger(data.missionIndex)) {
    clean.missionIndex = Math.max(0, Math.min(4, data.missionIndex));
  }
  if (typeof data.respect === 'number' && Number.isFinite(data.respect)) {
    clean.respect = Math.max(0, Math.floor(data.respect));
  }
  if (Array.isArray(data.packages)) {
    clean.packages = [...new Set(data.packages.filter((k) => PACKAGE_KEYS.has(k)))];
  }
  if (data.stats && typeof data.stats === 'object') {
    for (const k of Object.keys(clean.stats)) {
      if (Number.isInteger(data.stats[k]) && data.stats[k] >= 0) clean.stats[k] = data.stats[k];
    }
  }
  if (WEAPON_NAMES.includes(data.weapon)) clean.weapon = data.weapon;
  if (data.ammo && typeof data.ammo === 'object') {
    for (const k of ['pistol', 'smg']) {
      if (Number.isInteger(data.ammo[k]) && data.ammo[k] >= 0) {
        clean.ammo[k] = Math.min(999, data.ammo[k]);
      }
    }
  }
  return clean;
}

export function defaultSave() {
  return {
    version: 1,
    cash: CONFIG.startCash,
    missionIndex: 0,
    respect: 0,
    packages: [],
    stats: { kills: 0, deaths: 0, busted: 0, fares: 0 },
    weapon: 'pistol',
    ammo: { pistol: 24, smg: 0 },
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return sanitize(data);
  } catch (e) { return null; }
}

export function writeSave(data) {
  try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(data)); } catch (e) { /* storage full/blocked: play on */ }
}

export function clearSave() {
  try { localStorage.removeItem(CONFIG.saveKey); } catch (e) { /* ignore */ }
}
