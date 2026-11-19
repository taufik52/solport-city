// SOLPORT — save.js (retry session, 19 Nov 2026)
// localStorage save: cash, mission progress, stats, collected sun-packages.
// Plain JSON, versioned key so a future build never misreads an old save.

import { CONFIG } from './config.js';

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
    return { ...defaultSave(), ...data, stats: { ...defaultSave().stats, ...(data.stats || {}) } };
  } catch (e) { return null; }
}

export function writeSave(data) {
  try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(data)); } catch (e) { /* storage full/blocked: play on */ }
}

export function clearSave() {
  try { localStorage.removeItem(CONFIG.saveKey); } catch (e) { /* ignore */ }
}
