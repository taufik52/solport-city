// SOLPORT — utils.js (retry session, 19 Nov 2026)
// Small math + deterministic RNG helpers shared by every module.

// Deterministic RNG (mulberry32) so ?shot= scenes stage identically.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
// Shortest-arc angle lerp, for smooth turning.
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// Nearest road coordinate (roads run every 40 units, centred on 0).
export function snapRoad(v, step = 40) { return Math.round(v / step) * step; }
export function onRoad(x, z, step = 40, width = 10) {
  const dx = Math.abs(x - snapRoad(x, step));
  const dz = Math.abs(z - snapRoad(z, step));
  return dx < width / 2 + 1 || dz < width / 2 + 1;
}
