// SOLPORT — city.js (resubmit rewrite, 22 Nov 2026)
// District-driven procedural coastal city.
//
// Design: the map is carved into districts by nearest-anchor zoning. Each
// district owns a building profile (height band, palette, lot plan, props),
// and every block asks its district how it should be filled. Roads form a
// regular avenue/street lattice; blocks sit inside the lattice cells.
// One seeded stream drives everything, so every load renders the same city.

import * as THREE from 'three';
import { mulberry32, pick } from './utils.js';
import { CONFIG } from './config.js';

// District anchors: the zoning map is "nearest anchor wins", with the
// western beach strip forced to Marina Bay no matter the distance.
const ZONES = [
  { name: 'Marina Bay', ax: -165, az: -40, kind: 'marina' },
  { name: 'Old Town', ax: -40, az: -125, kind: 'oldtown' },
  { name: 'Northside', ax: 85, az: -125, kind: 'northside' },
  { name: 'Portside', ax: 125, az: 125, kind: 'portside' },
  { name: 'The Strip', ax: -40, az: 85, kind: 'strip' },
  { name: 'Downtown', ax: 5, az: 5, kind: 'downtown' },
];

// Per-kind building profile: height band, facade palette, how many lots a
// block gets, and which lot plan fills it.
const PROFILES = {
  downtown: { hMin: 26, hMax: 58, lots: [2, 3], plan: 'towers', palette: ['#7d9bb5', '#5d7d8c', '#8a7f8d', '#6f8f7a'] },
  strip: { hMin: 16, hMax: 36, lots: [2, 3], plan: 'towers', palette: ['#c96f4a', '#d9a441', '#a8513f', '#b5b0a1'] },
  marina: { hMin: 5, hMax: 14, lots: [1, 2], plan: 'villas', palette: ['#d9a441', '#e8dcc0', '#7d9bb5', '#c96f4a'] },
  oldtown: { hMin: 8, hMax: 20, lots: [2, 3], plan: 'rows', palette: ['#a8513f', '#8a6f5a', '#b5b0a1', '#6f8f7a'] },
  northside: { hMin: 6, hMax: 16, lots: [2, 3], plan: 'rows', palette: ['#b5b0a1', '#d9a441', '#7d9bb5', '#8a7f8d'] },
  portside: { hMin: 7, hMax: 11, lots: [1, 1], plan: 'sheds', palette: ['#8a6f5a'] },
};

// Which district owns a world point. Beach strip first, then nearest anchor.
function zoneAt(x, z) {
  if (x < -130) return ZONES[0];
  let best = ZONES[0];
  let bestD = Infinity;
  for (const zone of ZONES) {
    const dx = x - zone.ax;
    const dz = z - zone.az;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = zone; }
  }
  return best;
}

export function districtAt(x, z) {
  return zoneAt(x, z).name;
}

// Facade texture: lit windows on a flat base colour, drawn once per
// building so no two towers share a window pattern.
function facadeTexture(base, rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 6; col++) {
      const lit = rng() < 0.38;
      g.fillStyle = lit ? '#ffd98a' : 'rgba(14,18,28,0.92)';
      g.fillRect(8 + col * 20, 10 + row * 24, 12, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Floating district label.
function districtSign(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,12,22,0.55)';
  g.beginPath(); g.roundRect(10, 26, 492, 76, 16); g.fill();
  g.fillStyle = color;
  g.font = 'bold 46px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(34, 8.5, 1);
  return spr;
}

// Lot plans: given a block centre and a profile, return the footprints to
// raise. Each footprint is {w, d, h, ox, oz, shade, glazed}.
function planLots(kind, profile, rng) {
  const lots = [];
  const count = profile.lots[0] + Math.floor(rng() * (profile.lots[1] - profile.lots[0] + 1));
  if (kind === 'sheds') {
    lots.push({ w: 24, d: 18, h: profile.hMin + rng() * (profile.hMax - profile.hMin), ox: 0, oz: 0, glazed: false });
    return lots;
  }
  if (kind === 'villas') {
    for (let i = 0; i < count; i++) {
      lots.push({
        w: 9 + rng() * 6, d: 9 + rng() * 6,
        h: profile.hMin + rng() * (profile.hMax - profile.hMin),
        ox: count === 1 ? 0 : (rng() - 0.5) * 14,
        oz: count === 1 ? 0 : (rng() - 0.5) * 14,
        glazed: true,
      });
    }
    return lots;
  }
  // 'towers' and 'rows': staggered footprints so neighbours never align.
  for (let i = 0; i < count; i++) {
    const wide = kind === 'towers' ? 9 + rng() * 8 : 8 + rng() * 9;
    lots.push({
      w: wide, d: 8 + rng() * 9,
      h: profile.hMin + rng() * (profile.hMax - profile.hMin),
      ox: (i % 2 === 0 ? -1 : 1) * (3 + rng() * 5),
      oz: (i < 2 ? -1 : 1) * (3 + rng() * 5),
      glazed: true,
    });
  }
  return lots;
}

export function buildCity(scene) {
  const rng = mulberry32(1337);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // Sky, fog, key light.
  scene.background = new THREE.Color(0x9fc8e8);
  scene.fog = new THREE.Fog(0xa8c8e0, 180, 520);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9));
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.2);
  sun.position.set(120, 160, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(sun.target);

  // Sea plane underneath, land slab above it, sand along the west edge.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ color: 0x2a7fa8, roughness: 0.25, metalness: 0.1 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.8;
  group.add(water);
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(420, 1, 420),
    new THREE.MeshStandardMaterial({ color: 0x9a9a8e, roughness: 1 })
  );
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  group.add(ground);
  const beach = new THREE.Mesh(
    new THREE.BoxGeometry(24, 1.1, 420),
    new THREE.MeshStandardMaterial({ color: 0xe0c98f, roughness: 1 })
  );
  beach.position.set(-198, -0.45, 0);
  beach.receiveShadow = true;
  group.add(beach);

  // Avenue/street lattice: one instanced strip per grid line, both ways.
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.95 });
  const lines = [];
  for (let v = -CONFIG.roadHalf; v <= CONFIG.roadHalf; v += CONFIG.roadStep) lines.push(v);
  const stripGeo = new THREE.BoxGeometry(2 * CONFIG.groundHalf + 20, 0.08, CONFIG.roadWidth);
  const strips = new THREE.InstancedMesh(stripGeo, roadMat, lines.length * 2);
  const m4 = new THREE.Matrix4();
  lines.forEach((v, i) => {
    m4.makeRotationY(0); m4.setPosition(0, 0.04, v);
    strips.setMatrixAt(i * 2, m4);
    m4.makeRotationY(Math.PI / 2); m4.setPosition(v, 0.04, 0);
    strips.setMatrixAt(i * 2 + 1, m4);
  });
  strips.receiveShadow = true;
  group.add(strips);

  // Dashed centre lines, also instanced: one dash every 12 units per road.
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d0, roughness: 0.8 });
  const dashSpots = [];
  for (const v of lines) {
    for (let u = -CONFIG.roadHalf; u <= CONFIG.roadHalf; u += 12) {
      dashSpots.push([u, v, 0], [v, u, 1]);
    }
  }
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.06, 3), dashMat, dashSpots.length);
  dashSpots.forEach(([a, b, turn], i) => {
    m4.makeRotationY(turn ? Math.PI / 2 : 0);
    m4.setPosition(turn ? b : a, 0.1, turn ? a : b);
    dashes.setMatrixAt(i, m4);
  });
  group.add(dashes);

  // Blocks: sidewalk slab, then the district's lot plan raised on it.
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x7e7e74, roughness: 1 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 1 });
  const shedMat = new THREE.MeshStandardMaterial({ color: 0x8a6f5a, roughness: 0.95 });
  for (let bx = -CONFIG.roadHalf; bx < CONFIG.roadHalf; bx += CONFIG.roadStep) {
    for (let bz = -CONFIG.roadHalf; bz < CONFIG.roadHalf; bz += CONFIG.roadStep) {
      const cx = bx + CONFIG.roadStep / 2;
      const cz = bz + CONFIG.roadStep / 2;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.blockSize, 0.3, CONFIG.blockSize), slabMat);
      slab.position.set(cx, 0.15, cz);
      slab.receiveShadow = true;
      group.add(slab);
      const zone = zoneAt(cx, cz);
      const profile = PROFILES[zone.kind];
      // A few residential blocks become pocket parks instead of buildings:
      // lawn, shade trees, benches — open ground with no colliders.
      if ((zone.kind === 'northside' || zone.kind === 'oldtown') && rng() < 0.15) {
        const lawn = new THREE.Mesh(
          new THREE.BoxGeometry(CONFIG.blockSize - 4, 0.34, CONFIG.blockSize - 4),
          new THREE.MeshStandardMaterial({ color: 0x5d8a4a, roughness: 1 })
        );
        lawn.position.set(cx, 0.17, cz);
        lawn.receiveShadow = true;
        group.add(lawn);
        const treeTrunk = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
        const treeTop = new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 1 });
        const treeCount = 3 + Math.floor(rng() * 3);
        for (let t = 0; t < treeCount; t++) {
          const tx = cx + (rng() - 0.5) * 20;
          const tz = cz + (rng() - 0.5) * 20;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.6, 6), treeTrunk);
          trunk.position.set(tx, 1.6, tz);
          trunk.castShadow = true;
          group.add(trunk);
          const crown = new THREE.Mesh(new THREE.SphereGeometry(1.8 + rng() * 0.7, 8, 6), treeTop);
          crown.position.set(tx, 3.8, tz);
          crown.castShadow = true;
          group.add(crown);
        }
        for (let b = 0; b < 2; b++) {
          const bench = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 0.5, 0.8),
            new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 })
          );
          bench.position.set(cx + (b ? 7 : -7), 0.6, cz + (b ? -6 : 6));
          bench.rotation.y = b ? Math.PI / 2 : 0;
          group.add(bench);
        }
        continue;
      }
      for (const lot of planLots(zone.kind, profile, rng)) {
        const shade = pick(rng, profile.palette);
        const mat = lot.glazed
          ? new THREE.MeshStandardMaterial({ map: facadeTexture(shade, rng), color: 0xffffff, roughness: 0.9 })
          : shedMat;
        const tower = new THREE.Mesh(unitBox, mat);
        tower.scale.set(lot.w, lot.h, lot.d);
        tower.position.set(cx + lot.ox, lot.h / 2 + 0.3, cz + lot.oz);
        tower.castShadow = true; tower.receiveShadow = true;
        group.add(tower);
        colliders.push({
          minX: cx + lot.ox - lot.w / 2, maxX: cx + lot.ox + lot.w / 2,
          minZ: cz + lot.oz - lot.d / 2, maxZ: cz + lot.oz + lot.d / 2,
        });
        if (lot.h > 22) {
          const crown = new THREE.Mesh(unitBox, roofMat);
          crown.scale.set(lot.w * 0.4, 2.5, lot.d * 0.4);
          crown.position.set(cx + lot.ox, lot.h + 1.5, cz + lot.oz);
          group.add(crown);
        }
      }
    }
  }

  // Palms down the beach, a few spilling into Marina Bay.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f8f4a, roughness: 1 });
  for (let z = -180; z <= 180; z += 24) {
    const x = -186 + rng() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 6), trunkMat);
    trunk.position.set(x, 3.5, z);
    trunk.castShadow = true;
    group.add(trunk);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.4, 5), frondMat);
      frond.position.set(x + Math.cos(a) * 1.4, 7.4, z + Math.sin(a) * 1.4);
      frond.rotation.z = Math.cos(a) * 0.9;
      frond.rotation.x = -Math.sin(a) * 0.9;
      group.add(frond);
    }
  }

  // Street lamps ringing the Strip and the coastal highway.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.7, metalness: 0.4 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 1.4 });
  const lampSpots = [];
  for (let v = -160; v <= 160; v += 80) {
    lampSpots.push([v, 76], [v, -84], [-156, v]);
  }
  for (const [x, z] of lampSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6, 6), poleMat);
    pole.position.set(x, 3, z);
    group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), bulbMat);
    bulb.position.set(x, 6.2, z);
    group.add(bulb);
  }

  // District signs floating over their anchors.
  const signDefs = [
    ['Marina Bay', -150, -40, '#7fd4ff'], ['Old Town', -40, -130, '#ffd98a'],
    ['Northside', 90, -130, '#b8f0a0'], ['Portside', 130, 130, '#ff9a7a'],
    ['The Strip', -40, 90, '#ff8ad4'], ['Downtown', 10, 10, '#ffffff'],
  ];
  for (const [name, x, z, color] of signDefs) {
    const spr = districtSign(name, color);
    spr.position.set(x, 26, z);
    group.add(spr);
  }

  // Objective beacon: translucent column + ground ring, hidden until a
  // mission points at something.
  const beacon = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  column.position.y = 30;
  beacon.add(column);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.6, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  beacon.add(ring);
  beacon.visible = false;
  group.add(beacon);

  // Sun-package collectibles: gold orbs; main.js places the meshes, the
  // geometry/material live here so both sides agree on the look.
  const pkgGeo = new THREE.SphereGeometry(0.9, 12, 10);
  const pkgMat = new THREE.MeshStandardMaterial({ color: 0xffd23c, emissive: 0xffb300, emissiveIntensity: 1.6 });
  const packages = [];

  // Breathing pulse for the beacon ring; main.js calls this every frame.
  function pulseBeacon(t) {
    if (!beacon.visible) return;
    const s = 1 + Math.sin(t * 3) * 0.15;
    ring.scale.set(s, s, 1);
  }

  return {
    group, colliders, beacon, ring, sun, packages, pkgGeo, pkgMat,
    setTimeOfDay, pulseBeacon, districtAt,
    districts: ZONES.map((z) => ({ name: z.name, x: z.ax, z: z.az })),
  };
}

// Golden-hour day vs orange sunset; shots use sunset for the drive shot.
export function setTimeOfDay(scene, sun, preset) {
  if (preset === 'sunset') {
    scene.background = new THREE.Color(0xe8905a);
    scene.fog = new THREE.Fog(0xd98a5a, 150, 480);
    sun.position.set(-180, 55, 40);
    sun.color.set(0xff9a4d);
    sun.intensity = 1.9;
  } else {
    scene.background = new THREE.Color(0x9fc8e8);
    scene.fog = new THREE.Fog(0xa8c8e0, 180, 520);
    sun.position.set(120, 160, 60);
    sun.color.set(0xffe0b0);
    sun.intensity = 2.2;
  }
}
