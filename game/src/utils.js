// Small math + RNG helpers shared by every SOLPORT module.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
// Push a circle (x,z,r) out of an axis-aligned box {minX,maxX,minZ,maxZ}. Returns corrected [x,z].
export function collideCircleBox(x, z, r, b) {
  const cx = clamp(x, b.minX, b.maxX), cz = clamp(z, b.minZ, b.maxZ);
  const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return [x, z];
  if (d2 > 1e-6) { const d = Math.sqrt(d2); return [cx + (dx / d) * r, cz + (dz / d) * r]; }
  // Center inside the box: push out along the smallest penetration axis.
  const pl = x - b.minX, pr = b.maxX - x, pt = z - b.minZ, pb = b.maxZ - z;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return [b.minX - r, z];
  if (m === pr) return [b.maxX + r, z];
  if (m === pt) return [x, b.minZ - r];
  return [x, b.maxZ + r];
}
export function fmtCash(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
export function fmtTime(s) { const m = Math.floor(s / 60); const r = Math.floor(s % 60); return m + ':' + String(r).padStart(2, '0'); }
