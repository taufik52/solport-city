// SOLPORT — player.js (retry session, 19 Nov 2026)
// Jax Marlowe on foot and behind the wheel: WASD movement, camera orbit,
// E enter/exit car, click to shoot, F punch, health + weapon pickups,
// death (hospital respawn) and bust handling live in main.js.

import * as THREE from 'three';
import { makePersonMesh } from './pedestrians.js';
import { createCarMesh } from './vehicles.js';
import { CONFIG, WEAPONS } from './config.js';
import { clamp, angleLerp, dist2 } from './utils.js';

export function createPlayer(scene, x, z) {
  const mesh = makePersonMesh(0x2e6fc2, 0xc98a5a);
  // Jax wears a dark jacket over the blue shirt.
  mesh.children[0].material = new THREE.MeshStandardMaterial({ color: 0x1f2a3a, roughness: 0.85 });
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return {
    mesh, x, z, angle: 0, camAngle: 0, camPitch: 0.35,
    hp: CONFIG.playerHp, onFoot: true,
    weapon: 'pistol', ammo: { pistol: 24, smg: 0 },
    speed: 0,
  };
}

// Move on foot, relative to the camera angle. Returns speed for animation.
export function updateOnFoot(S, dt) {
  const p = S.player;
  const input = S.input;
  const fwd = (input.down('w') || input.down('arrowup') ? 1 : 0) - (input.down('s') || input.down('arrowdown') ? 1 : 0);
  const strafe = (input.down('d') || input.down('arrowright') ? 1 : 0) - (input.down('a') || input.down('arrowleft') ? 1 : 0);
  const run = input.down('shift');
  const speed = run ? CONFIG.runSpeed : CONFIG.walkSpeed;
  const ca = p.camAngle;
  let mx = 0, mz = 0;
  if (fwd || strafe) {
    mx = Math.sin(ca) * fwd + Math.cos(ca) * strafe;
    mz = Math.cos(ca) * fwd - Math.sin(ca) * strafe;
    const len = Math.hypot(mx, mz) || 1;
    mx /= len; mz /= len;
    p.angle = angleLerp(p.angle, Math.atan2(mx, mz), Math.min(1, dt * 10));
  }
  const nx = p.x + mx * speed * dt;
  const nz = p.z + mz * speed * dt;
  if (!S.collide(nx, p.z, 0.6)) p.x = nx;
  if (!S.collide(p.x, nz, 0.6)) p.z = nz;
  p.x = clamp(p.x, -196, 196); p.z = clamp(p.z, -196, 196);
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.angle;
  // Walk bob.
  const moving = Math.abs(mx) + Math.abs(mz) > 0;
  p.mesh.position.y = moving ? Math.abs(Math.sin(performance.now() / 130)) * 0.08 : 0;
  return moving ? speed : 0;
}

// E: enter the nearest car (traffic or parked) / exit the current car.
export function tryEnterExit(S) {
  const p = S.player;
  if (!p.onFoot) {
    // Exit: step out beside the car.
    p.onFoot = true;
    p.x = S.car.x + Math.sin(S.car.angle + Math.PI / 2) * 2.5;
    p.z = S.car.z + Math.cos(S.car.angle + Math.PI / 2) * 2.5;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.visible = true;
    S.car.speed = 0;
    return true;
  }
  // Near the mission Comet? Missions handles the steal.
  if (S.missions.trySteal(S)) return true;
  // Near your own parked car? Get back in.
  if (S.car && dist2(p.x, p.z, S.car.x, S.car.z) < 5.5) {
    p.onFoot = false;
    p.mesh.visible = false;
    S.car.speed = 0;
    return true;
  }
  const near = S.traffic.nearest(p.x, p.z, 4.5);
  if (near) {
    const t = near.car;
    S.scene.remove(t.mesh);
    S.traffic.cars.splice(S.traffic.cars.indexOf(t), 1);
    if (S.car) S.scene.remove(S.car.mesh);
    S.car = { mesh: createCarMesh(0xdddddd), x: t.mesh.position.x, z: t.mesh.position.z, angle: 0, speed: 0, steer: 0 };
    S.car.mesh.position.set(S.car.x, 0, S.car.z);
    S.scene.add(S.car.mesh);
    p.onFoot = false;
    p.mesh.visible = false;
    S.wanted = Math.max(S.wanted, 1);
    S.hudFlash('Car jacked — wanted level up!');
    return true;
  }
  return false;
}

// Hitscan shooting from the camera: nearest enemy in a narrow cone.
export function shoot(S) {
  const p = S.player;
  const w = WEAPONS[p.weapon];
  if (!w || p.weapon === 'fists') return;
  if ((p.ammo[p.weapon] || 0) <= 0) {
    S.hudFlash('Out of ammo — find a weapon pickup');
    S.audio.fail();
    return;
  }
  p.ammo[p.weapon] -= 1;
  S.audio.shot();
  S.peds.scare(p.x, p.z, 22);
  // Muzzle flash + tracer from the player toward the camera forward.
  const dir = new THREE.Vector3();
  S.camera.getWorldDirection(dir);
  const from = new THREE.Vector3(p.x, 1.5, p.z);
  const to = from.clone().add(dir.clone().multiplyScalar(w.range));
  S.tracer(from, to);
  S.muzzle(from);

  // Targets: gang members, cops, transport.
  let best = null; let bd = w.range;
  const consider = (x, z, obj, kind) => {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > bd) return;
    const ang = Math.atan2(x - p.x, z - p.z);
    const camAng = Math.atan2(dir.x, dir.z);
    let diff = Math.abs(ang - camAng);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff < 0.22 || d < 4) { bd = d; best = { obj, kind }; }
  };
  for (const g of S.missions.gang) consider(g.x, g.z, g, 'gang');
  for (const c of S.police.cops) consider(c.x, c.z, c, 'cop');
  if (S.missions.transport) consider(S.missions.transport.x, S.missions.transport.z, S.missions.transport, 'transport');
  if (!best) {
    // Stray shots near cops still raise heat.
    if (S.police.cars.length && Math.random() < 0.4) S.wanted = Math.min(5, S.wanted + 1);
    return;
  }
  if (best.kind === 'gang') {
    best.obj.hp -= w.damage;
    if (best.obj.hp <= 0) {
      S.scene.remove(best.obj.mesh);
      S.missions.gang.splice(S.missions.gang.indexOf(best.obj), 1);
      S.saveData.stats.kills += 1;
      S.wanted = Math.min(5, S.wanted + 1);
      S.hudFlash('Harbor King down');
    }
  } else if (best.kind === 'cop') {
    S.police.cops.splice(S.police.cops.indexOf(best.obj), 1);
    S.scene.remove(best.obj.mesh);
    S.saveData.stats.kills += 1;
    S.wanted = Math.min(5, S.wanted + 1);
    S.hudFlash('Cop down — wanted level up!');
  } else if (best.kind === 'transport') {
    best.obj.hp -= w.damage;
    S.hudFlash(`Transport armor: ${Math.max(0, best.obj.hp)}`);
  }
}

// F: punch the nearest person (gang / cop / ped) within reach.
export function punch(S) {
  const p = S.player;
  S.audio.punch();
  for (const g of S.missions.gang) {
    if (dist2(p.x, p.z, g.x, g.z) < 2.5) {
      g.hp -= WEAPONS.fists.damage;
      if (g.hp <= 0) {
        S.scene.remove(g.mesh);
        S.missions.gang.splice(S.missions.gang.indexOf(g), 1);
        S.saveData.stats.kills += 1;
      }
      return;
    }
  }
}
