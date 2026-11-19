// SOLPORT — city.js (retry session, 19 Nov 2026)
// Procedural low-poly coastal city: road grid, blocks, varied buildings with
// lit-window canvas textures, water, palms, lamps, district signs.
// Deterministic: one seeded RNG, so every load (and every ?shot=) looks alike.

import * as THREE from 'three';
import { mulberry32, pick } from './utils.js';
import { CONFIG } from './config.js';

const PALETTE = ['#c96f4a', '#d9a441', '#7d9bb5', '#8a7f8d', '#b5b0a1', '#6f8f7a', '#a8513f', '#5d7d8c'];
const WINDOW_LIT = '#ffd98a';

function windowTexture(base) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  for (let y = 14; y < 246; y += 26) {
    for (let x = 10; x < 118; x += 22) {
      g.fillStyle = Math.random() < 0.4 ? WINDOW_LIT : 'rgba(18,22,32,0.9)';
      g.fillRect(x, y, 13, 15);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function textSprite(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,14,24,0.55)';
  g.beginPath(); g.roundRect(6, 22, 500, 84, 18); g.fill();
  g.fillStyle = color;
  g.font = 'bold 52px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(36, 9, 1);
  return spr;
}

export function buildCity(scene) {
  const rng = mulberry32(1337);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // Sky, fog, lights.
  scene.background = new THREE.Color(0x9fc8e8);
  scene.fog = new THREE.Fog(0xa8c8e0, 180, 520);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.2);
  sun.position.set(120, 160, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(sun.target);

  // Water: big plane under everything, visible past the western beach.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ color: 0x2a7fa8, roughness: 0.25, metalness: 0.1 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.8;
  group.add(water);

  // Ground slab (city land) + sandy beach strip on the west edge.
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

  // Roads: dark strips on every grid line + dashed centre lines.
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.95 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d0, roughness: 0.8 });
  const dashGeo = new THREE.BoxGeometry(0.6, 0.06, 3);
  const dashes = [];
  for (let v = -CONFIG.roadHalf; v <= CONFIG.roadHalf; v += CONFIG.roadStep) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(2 * CONFIG.groundHalf + 20, 0.08, CONFIG.roadWidth), roadMat);
      road.position.set(0, 0.04, 0);
      if (horizontal) { road.position.set(0, 0.04, v); }
      else { road.rotation.y = Math.PI / 2; road.position.set(v, 0.04, 0); }
      road.receiveShadow = true;
      group.add(road);
    }
    for (let u = -CONFIG.roadHalf; u <= CONFIG.roadHalf; u += 12) {
      dashes.push([u, v, true], [v, u, false]);
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
  const m4 = new THREE.Matrix4();
  dashes.forEach(([a, b, horiz], i) => {
    m4.makeRotationY(horiz ? 0 : Math.PI / 2);
    m4.setPosition(horiz ? a : b, 0.1, horiz ? b : a);
    dashMesh.setMatrixAt(i, m4);
  });
  group.add(dashMesh);

  // Blocks: sidewalk slab + 1-3 buildings each, with AABB colliders.
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x7e7e74, roughness: 1 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let bx = -CONFIG.roadHalf; bx < CONFIG.roadHalf; bx += CONFIG.roadStep) {
    for (let bz = -CONFIG.roadHalf; bz < CONFIG.roadHalf; bz += CONFIG.roadStep) {
      const cx = bx + CONFIG.roadStep / 2;
      const cz = bz + CONFIG.roadStep / 2;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.blockSize, 0.3, CONFIG.blockSize), blockMat);
      slab.position.set(cx, 0.15, cz);
      slab.receiveShadow = true;
      group.add(slab);
      // Marina Bay blocks (west column) stay low + palms; Portside gets warehouses.
      const west = cx < -120;
      const port = cx > 100 && cz > 100;
      const n = port ? 1 : 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const w = port ? 24 : 8 + rng() * 10;
        const d = port ? 18 : 8 + rng() * 10;
        const h = port ? 7 + rng() * 4 : west ? 6 + rng() * 10 : 8 + rng() * 30;
        const ox = n === 1 ? 0 : (rng() - 0.5) * 12;
        const oz = n === 1 ? 0 : (rng() - 0.5) * 12;
        const color = port ? '#8a6f5a' : pick(rng, PALETTE);
        const mat = new THREE.MeshStandardMaterial({
          map: port ? null : windowTexture(color), color: port ? 0x8a6f5a : 0xffffff, roughness: 0.9,
        });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(cx + ox, h / 2 + 0.3, cz + oz);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        colliders.push({
          minX: cx + ox - w / 2, maxX: cx + ox + w / 2,
          minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2,
        });
        // Rooftop box for taller towers.
        if (h > 22) {
          const roof = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 1 }));
          roof.scale.set(w * 0.4, 2.5, d * 0.4);
          roof.position.set(cx + ox, h + 1.5, cz + oz);
          group.add(roof);
        }
      }
    }
  }

  // Palms along the beach + Marina Bay.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f8f4a, roughness: 1 });
  for (let z = -180; z <= 180; z += 24) {
    const x = -186 + rng() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 6), trunkMat);
    trunk.position.set(x, 3.5, z); trunk.castShadow = true;
    group.add(trunk);
    for (let k = 0; k < 5; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.4, 5), leafMat);
      const a = (k / 5) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.4, 7.4, z + Math.sin(a) * 1.4);
      leaf.rotation.z = Math.cos(a) * 0.9;
      leaf.rotation.x = -Math.sin(a) * 0.9;
      group.add(leaf);
    }
  }

  // Street lamps along the Strip + coastal highway.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.7, metalness: 0.4 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 1.4 });
  for (let v = -160; v <= 160; v += 80) {
    for (const [x, z] of [[v, 76], [v, -84], [-156, v]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6, 6), poleMat);
      pole.position.set(x, 3, z);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), bulbMat);
      bulb.position.set(x, 6.2, z);
      group.add(bulb);
    }
  }

  // District signs (floating sprites, readable in screenshots).
  const signs = [
    ['Marina Bay', -150, -40, '#7fd4ff'], ['Old Town', -40, -130, '#ffd98a'],
    ['Northside', 90, -130, '#b8f0a0'], ['Portside', 130, 130, '#ff9a7a'],
    ['The Strip', -40, 90, '#ff8ad4'],
  ];
  for (const [name, x, z, color] of signs) {
    const spr = textSprite(name, color);
    spr.position.set(x, 26, z);
    group.add(spr);
  }

  // Objective beacon: tall translucent column + pulsing ring.
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
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3;
  beacon.add(ring);
  beacon.visible = false;
  group.add(beacon);

  // Sun-packages: small glowing suns to collect.
  const pkgGeo = new THREE.SphereGeometry(0.9, 12, 10);
  const pkgMat = new THREE.MeshStandardMaterial({ color: 0xffd23c, emissive: 0xffb300, emissiveIntensity: 1.6 });
  const packages = [];
  return { group, colliders, beacon, ring, sun, packages, pkgGeo, pkgMat, setTimeOfDay };
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
