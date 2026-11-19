// SOLPORT pedestrians: sidewalk walkers who flee gunfire and near-misses.
import * as THREE from 'three';
import { mulberry32, pick, dist2d, clamp } from './utils.js';

function makePedMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.85, 3, 8),
    new THREE.MeshLambertMaterial({ color }));
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd9a986 }));
  head.position.y = 2.0; head.castShadow = true; g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2a2f38 }));
  legs.position.y = 0.3; g.add(legs);
  return g;
}

export class Pedestrians {
  constructor(scene, city, count) {
    this.scene = scene; this.city = city; this.list = [];
    const rng = mulberry32(777);
    const colors = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xecf0f1, 0xfd79a8];
    for (let i = 0; i < count; i++) {
      const p = pick(rng, city.intersections);
      const mesh = makePedMesh(pick(rng, colors));
      scene.add(mesh);
      this.list.push({
        mesh, x: p.x + 8 + rng() * 4, z: p.z + (rng() - 0.5) * 20,
        yaw: rng() * Math.PI * 2, speed: 1.2 + rng() * 0.9,
        target: pick(rng, city.intersections), fleeing: 0, dead: false, hp: 30,
      });
    }
  }
  nearest(x, z, maxD) {
    let best = null, bd = maxD;
    for (const p of this.list) if (!p.dead) { const d = dist2d(x, z, p.x, p.z); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  update(G, dt) {
    const px = G.player.inCar ? G.player.car.x : G.player.x;
    const pz = G.player.inCar ? G.player.car.z : G.player.z;
    for (const p of this.list) {
      if (p.dead) continue;
      // Flee: gunfire nearby, or a car bearing down.
      if (G.shotsFiredAt && dist2d(p.x, p.z, G.shotsFiredAt.x, G.shotsFiredAt.z) < 26) p.fleeing = 2.5;
      const carNear = dist2d(p.x, p.z, px, pz) < 6 && G.player.inCar && Math.abs(G.player.car.speed) > 6;
      if (carNear) p.fleeing = 2;
      let tx, tz, sp = p.speed;
      if (p.fleeing > 0) {
        p.fleeing -= dt; sp = 5.5;
        const dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz) || 1;
        tx = p.x + (dx / d) * 10; tz = p.z + (dz / d) * 10;
      } else {
        tx = p.target.x + 8; tz = p.target.z;
        if (dist2d(p.x, p.z, tx, tz) < 2) p.target = pick(mulberry32((Math.random() * 1e9) | 0), this.city.intersections);
      }
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d > 0.2) {
        const want = Math.atan2(dx, dz);
        let dy = want - p.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        p.yaw += clamp(dy, -3 * dt, 3 * dt);
        p.x += Math.sin(p.yaw) * sp * dt; p.z += Math.cos(p.yaw) * sp * dt;
      }
      [p.x, p.z] = this.city.clampToWorld(p.x, p.z);
      p.mesh.position.set(p.x, 0, p.z); p.mesh.rotation.y = p.yaw;
      // Walk bob.
      p.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.006 + p.x)) * 0.06;
      // Run over by a fast car: fatal, raises wanted.
      if (G.player.inCar && Math.abs(G.player.car.speed) > 8 && dist2d(p.x, p.z, px, pz) < 2.2) {
        this.killPed(G, p, 'run over');
      }
    }
  }
  killPed(G, p, how) {
    if (p.dead) return;
    p.dead = true; p.mesh.visible = false;
    G.stats.kills++; G.police.addWanted(1, 'pedestrian ' + how);
    G.hud.banner('WANTED +1', 'A pedestrian was ' + how + '. The PD is on its way.');
    setTimeout(() => { p.dead = false; p.mesh.visible = true; p.hp = 30; p.x = G.player.x + 60; p.z = G.player.z + 40; }, 45000);
  }
}
