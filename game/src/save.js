// SOLPORT save: cash, mission progress, respect, stats and sun-packages
// in localStorage. Nothing leaves the browser.
const KEY = 'solport-save-v1';
export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || !s) return null;
    return s;
  } catch (_) { return null; }
}
export function writeSave(G) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: Math.round(G.player.cash), mission: G.missions.index, respect: G.player.respect,
      packages: [...G.sunCollected], stats: G.stats, weapon: G.player.weapon,
      savedAt: new Date().toISOString(),
    }));
  } catch (_) { /* storage full / private mode: play on without saving */ }
}
export function clearSave() { try { localStorage.removeItem(KEY); } catch (_) { /* noop */ } }
