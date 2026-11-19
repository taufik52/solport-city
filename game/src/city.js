// SOLPORT city: procedural low-poly coastal city. Road grid, varied blocks,
// waterfront + beach + coastal highway, palms, lamps, sun-packages, landmarks.
// All geometry is original; districts are named in config.js.
import * as THREE from 'three';
import { mulberry32, pick, clamp } from './utils.js';

function buildingTexture(rng, base) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) for (let x = 6; x < 58; x += 12) {
    const lit = rng() < 0.45;
    g.fillStyle = lit ? '#ffd98a' : '#20283a';
    g.fillRect(x, y, 7, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCity(scene, seed) {
  const rng = mulberry32(seed || 1337);
  const H = 220, SP = 44;
  const lines = []; for (let v = -198; v <= 198; v += SP) lines.push(v);

  scene.background = new THREE.Color(0x9fc8e8);
  scene.fog = new THREE.Fog(0xa8c8e0, 180, 520);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
  sun.position.set(120, 180, 60); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 600; scene.add(sun); scene.add(sun.target);

  const city = { colliders: [], intersections: [], packages: [], spots: {}, sun, rng };

  // Ground: grass-green base for the whole island.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 80, H * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0x5d8a4a }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 0); ground.receiveShadow = true; scene.add(ground);

  // Water (west) + sand beach + coastal highway.
  const water = new THREE.Mesh(new THREE.PlaneGeometry(160, H * 2 + 120),
    new THREE.MeshLambertMaterial({ color: 0x1e6f8f }));
  water.rotation.x = -Math.PI / 2; water.position.set(-300, 0.1, 0); scene.add(water);
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(22, H * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0xd9c08a }));
  beach.rotation.x = -Math.PI / 2; beach.position.set(-211, 0.02, 0); beach.receiveShadow = true; scene.add(beach);
  const highway = new THREE.Mesh(new THREE.PlaneGeometry(14, H * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0x2c2f36 }));
  highway.rotation.x = -Math.PI / 2; highway.position.set(-197, 0.03, 0); highway.receiveShadow = true; scene.add(highway);

  // Roads: asphalt strips on the grid + centre dashes.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x33363d });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
  for (const v of lines) {
    // East-west road: long in X, centred on z=v. North-south: long in Z, centred on x=v.
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, 11), roadMat);
    ew.rotation.x = -Math.PI / 2; ew.position.set(0, 0.04, v); ew.receiveShadow = true; scene.add(ew);
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(11, H * 2), roadMat);
    ns.rotation.x = -Math.PI / 2; ns.position.set(v, 0.04, 0); ns.receiveShadow = true; scene.add(ns);
    for (let d = -198; d <= 198; d += 22) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(d, 0.06, v); scene.add(dash);
    }
  }
  for (const x of lines) for (const z of lines) city.intersections.push({ x, z });

  // Buildings: one or two per block, window-lit canvas textures, varied heights.
  const palette = ['#b08a5a', '#7a8aa0', '#a07a7a', '#8aa07a', '#c0a060', '#6a7a8a', '#b0b0a0', '#907a9a'];
  const textures = palette.map(c => buildingTexture(rng, c));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  for (let ix = 0; ix < lines.length - 1; ix++) for (let iz = 0; iz < lines.length - 1; iz++) {
    const cx = (lines[ix] + lines[ix + 1]) / 2, cz = (lines[iz] + lines[iz + 1]) / 2;
    if (cx < -190) continue; // beach / highway strip stays open
    const n = rng() < 0.55 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const w = 12 + rng() * 12, d = 12 + rng() * 12, h = 8 + rng() * rng() * 42;
      const ox = n === 1 ? 0 : (k === 0 ? -8 : 8), oz = n === 1 ? 0 : (k === 0 ? -8 : 8);
      const tex = pick(rng, textures);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ map: tex }));
      m.position.set(cx + ox, h / 2, cz + oz); m.castShadow = true; m.receiveShadow = true; scene.add(m);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), roofMat);
      roof.position.set(cx + ox, h + 0.4, cz + oz); scene.add(roof);
      city.colliders.push({ minX: cx + ox - w / 2 - 0.5, maxX: cx + ox + w / 2 + 0.5, minZ: cz + oz - d / 2 - 0.5, maxZ: cz + oz + d / 2 + 0.5 });
      // A few rooftop AC boxes for silhouette variety.
      if (rng() < 0.5) {
        const ac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3), roofMat);
        ac.position.set(cx + ox + w / 4, h + 1.6, cz + oz); scene.add(ac);
      }
    }
  }

  // Palms along the beach + scattered in Marina Bay; lamps at intersections.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a34 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f, side: THREE.DoubleSide });
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
    trunk.position.y = 3.5; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.4), leafMat);
      leaf.position.y = 7.2; leaf.rotation.y = (i / 6) * Math.PI * 2;
      leaf.rotation.x = -0.7; leaf.translateZ(1.6); g.add(leaf);
    }
    g.position.set(x, 0, z); scene.add(g);
  }
  for (let z = -200; z <= 200; z += 28) { palm(-204 + rng() * 4, z + rng() * 8); if (rng() < 0.4) palm(-176 + rng() * 6, z + rng() * 10); }
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const p of city.intersections) {
    if (rng() < 0.35) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), poleMat);
    pole.position.set(p.x + 7, 3, p.z + 7); scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampMat);
    bulb.position.set(p.x + 7, 6.2, p.z + 7); scene.add(bulb);
  }

  // Landmarks: spray shop (clears wanted), hospital (respawn), Mara's house.
  function landmark(x, z, color, label) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 12),
      new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, 3.5, z); m.castShadow = true; scene.add(m);
    city.colliders.push({ minX: x - 8, maxX: x + 8, minZ: z - 6, maxZ: z + 6 });
    return { x, z, label };
  }
  city.spots.spray = landmark(-154, 154, 0x2f9e6e, 'Spray Shop');
  city.spots.hospital = landmark(154, -154, 0xe8e8e8, 'Hospital');
  city.spots.mara = landmark(-176, 66, 0xc06a8a, "Mara's House");
  city.spots.dock = { x: 176, z: 176, label: 'Portside Dock' };
  city.spots.oldTownDrop = { x: -66, z: 66, label: 'Old Town Drop' };
  city.spots.northLot = { x: 66, z: -154, label: 'Northside Lot' };
  city.spots.safehouse = { x: -154, z: -154, label: 'Marina Safehouse' };
  city.spots.start = { x: -154, z: 22, label: 'Start' };
  city.spots.transport = { x: -197, z: -120, label: 'Reserve Transport' };

  // Objective beacon: a tall glowing cylinder, moved by missions.js.
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  beacon.position.set(0, 30, -500); scene.add(beacon);
  city.beacon = beacon;
  const marker = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.4, 4),
    new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  marker.rotation.x = Math.PI; marker.position.set(0, 8, -500); scene.add(marker);
  city.marker = marker;

  // 10 hidden sun-packages: golden octahedra, floating + spinning.
  const pkgMat = new THREE.MeshBasicMaterial({ color: 0xffc93f });
  const pkgSpots = [[-176, -22], [-110, 110], [-22, 154], [22, -66], [110, 22], [154, 110], [66, 154], [-66, -110], [154, -66], [-154, -154]];
  for (const [x, z] of pkgSpots) {
    const p = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), pkgMat);
    p.position.set(x, 2.2, z); scene.add(p);
    city.packages.push({ mesh: p, x, z, taken: false });
  }

  city.districtAt = (x, z) => {
    for (const d of [{ name: 'Marina Bay', x: [-220, -130], z: [-220, 220] }, { name: 'Old Town', x: [-130, -20], z: [-60, 120] }, { name: 'Northside', x: [-130, 60], z: [-220, -60] }, { name: 'Portside', x: [60, 220], z: [60, 220] }, { name: 'The Strip', x: [-20, 220], z: [-220, 60] }]) {
      if (x >= d.x[0] && x < d.x[1] && z >= d.z[0] && z < d.z[1]) return d.name;
    }
    return 'Solport';
  };
  city.setBeacon = (x, z) => {
    city.beacon.position.set(x, 30, z); city.marker.position.set(x, 8, z);
    city.beacon.visible = true; city.marker.visible = true;
  };
  city.hideBeacon = () => { city.beacon.visible = false; city.marker.visible = false; };
  city.update = (dt, t) => {
    for (const p of city.packages) if (!p.taken) { p.mesh.rotation.y += dt * 2; p.mesh.position.y = 2.2 + Math.sin(t * 2 + p.x) * 0.4; }
    city.marker.rotation.y += dt * 1.5;
    city.marker.position.y = 8 + Math.sin(t * 3) * 0.6;
  };
  city.clampToWorld = (x, z) => [clamp(x, -215, 215), clamp(z, -215, 215)];
  return city;
}
