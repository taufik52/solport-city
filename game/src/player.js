// SOLPORT player: on-foot third-person movement, entering/exiting cars,
// punching, hitscan shooting, pickups, taxi fares and death/respawn.
import * as THREE from 'three';
import { updatePlayerCar } from './vehicles.js';
import { clamp, dist2d, collideCircleBox } from './utils.js';

export function makePlayerMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 3, 8),
    new THREE.MeshLambertMaterial({ color: 0x2e7f8f }));
  body.position.y = 1.1; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd9a986 }));
  head.position.y = 2.1; g.add(head);
  const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.5, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x1c2733 }));
  jacket.position.y = 1.45; g.add(jacket);
  return g;
}

export function updatePlayer(G, dt) {
  const P = G.player, inp = G.input;
  if (P.inCar && P.car) { updatePlayerCar(G, dt); P.x = P.car.x; P.z = P.car.z; P.yaw = P.car.yaw; }
  else {
    // Camera-relative WASD.
    const fwd = (inp.down('KeyW') || inp.down('ArrowUp') ? 1 : 0) - (inp.down('KeyS') || inp.down('ArrowDown') ? 1 : 0);
    const strafe = (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0) - (inp.down('KeyA') || inp.down('ArrowLeft') ? 1 : 0);
    const run = inp.down('ShiftLeft') || inp.down('ShiftRight');
    const sp = run ? G.cfg.player.runSpeed : G.cfg.player.walkSpeed;
    const len = Math.hypot(fwd, strafe) || 1;
    const mx = (Math.sin(P.camYaw) * fwd + Math.cos(P.camYaw) * strafe) / len;
    const mz = (Math.cos(P.camYaw) * fwd - Math.sin(P.camYaw) * strafe) / len;
    P.x += mx * sp * dt; P.z += mz * sp * dt;
    if (fwd || strafe) P.yaw = Math.atan2(mx, mz);
    for (const b of G.city.colliders) { const [nx, nz] = collideCircleBox(P.x, P.z, 0.7, b); P.x = nx; P.z = nz; }
    [P.x, P.z] = G.city.clampToWorld(P.x, P.z);
    P.mesh.position.set(P.x, 0, P.z); P.mesh.rotation.y = P.yaw;
    const bob = (fwd || strafe) ? Math.abs(Math.sin(performance.now() * 0.012)) * 0.08 : 0;
    P.mesh.position.y = bob;
    G.audio.setEngine(0, false);
  }
  // Camera orbit from mouse.
  const [mdx, mdy] = inp.consumeMouse();
  P.camYaw -= mdx * 0.0032;
  P.camPitch = clamp(P.camPitch + mdy * 0.0022, -0.15, 0.9);

  // E — enter / exit car (the Spray Shop claims E while a wanted car is parked there).
  if (inp.wasPressed('KeyE')) enterExitCar(G);
  // F — punch.
  if (inp.wasPressed('KeyF') && !P.inCar) punch(G);
  // Click — shoot.
  if (inp.consumeClick() && !P.inCar) shoot(G);
  // Sun-packages.
  for (const pkg of G.city.packages) {
    if (!pkg.taken && dist2d(P.x, P.z, pkg.x, pkg.z) < 2.4) {
      pkg.taken = true; pkg.mesh.visible = false;
      G.sunCollected.add(G.city.packages.indexOf(pkg));
      P.cash += 60; G.stats.packages++;
      G.audio.chime(); G.hud.banner('SUN-PACKAGE', '+$60 — ' + G.stats.packages + ' of 10 found.');
    }
  }
  // Health packs.
  for (const hp of G.pickups) {
    if (!hp.taken && dist2d(P.x, P.z, hp.x, hp.z) < 2.2) {
      hp.taken = true; hp.mesh.visible = false;
      P.hp = Math.min(100, P.hp + 40); G.audio.chime();
      G.hud.banner('HEALTH +40', 'Patched up.');
      setTimeout(() => { hp.taken = false; hp.mesh.visible = true; }, 60000);
    }
  }
  // Taxi: stand near a waiting fare pedestrian and press E on foot.
  if (!P.inCar && G.taxi && !G.taxi.active) {
    const t = G.taxi;
    if (dist2d(P.x, P.z, t.x, t.z) < 3) {
      G.hud.setPrompt('E — Pick up the taxi fare');
      if (inp.wasPressed('KeyE')) { t.active = true; t.marker.visible = true; G.hud.banner('TAXI FARE', 'Drive the passenger to the marker.'); }
    }
  }
  if (G.taxi && G.taxi.active && P.inCar && dist2d(P.x, P.z, G.taxi.dx, G.taxi.dz) < 9) {
    P.cash += 45; G.stats.fares++; G.audio.chime();
    G.hud.banner('FARE PAID', '+$45 — ' + G.stats.fares + ' fares done.');
    G.taxi.active = false; G.taxi.marker.visible = false;
    G.taxi.respawn();
  }
  if (P.hp <= 0) G.wasted();
}

function nearestCar(G, maxD) {
  let best = null, bd = maxD;
  const consider = (c) => { const d = dist2d(G.player.x, G.player.z, c.x, c.z); if (d < bd) { bd = d; best = c; } };
  for (const c of G.parkedCars) consider(c);
  for (const c of G.traffic.cars) consider(c);
  for (const c of G.police.cars) consider(c);
  return best;
}

function enterExitCar(G) {
  const P = G.player;
  // Spray Shop has priority on E: a wanted car parked at the shop gets painted, not exited.
  if (P.inCar && G.police.wanted > 0) {
    const s = G.city.spots.spray;
    if (dist2d(P.car.x, P.car.z, s.x, s.z) < 12 && P.cash >= 150) return;
  }
  if (P.inCar) {
    const car = P.car;
    P.inCar = false; P.car = null;
    P.x = car.x + Math.sin(car.yaw + Math.PI / 2) * 3; P.z = car.z + Math.cos(car.yaw + Math.PI / 2) * 3;
    P.mesh.visible = true;
    return;
  }
  const car = nearestCar(G, 4.5);
  if (!car) return;
  // Stealing a stranger's car (or a cop car) is a crime.
  const wasTraffic = G.traffic.cars.includes(car);
  const wasPolice = G.police.cars.includes(car);
  const wasParked = G.parkedCars.includes(car) && !car.isMission;
  if (wasTraffic) {
    G.traffic.cars = G.traffic.cars.filter(c => c !== car);
    G.police.addWanted(1, 'stole a car');
    G.hud.banner('CAR STOLEN', 'That was somebody\'s ride. Wanted +1.');
  } else if (wasParked) {
    G.parkedCars = G.parkedCars.filter(c => c !== car);
    G.police.addWanted(1, 'stole a parked car');
    G.hud.banner('CAR STOLEN', 'That was somebody\'s ride. Wanted +1.');
  } else if (wasPolice) {
    G.police.cars = G.police.cars.filter(c => c !== car);
    G.police.addWanted(2, 'stole a police cruiser');
  }
  P.inCar = true; P.car = car; P.mesh.visible = false;
  car.speed = 0;
  G.audio.ensure();
}

function punch(G) {
  const P = G.player;
  G.audio.punch();
  const targets = [];
  for (const e of G.missions.enemies) if (!e.dead) targets.push({ x: e.x, z: e.z, hp: e.hp, set: (v) => { e.hp = v; }, kill: () => { e.dead = true; e.mesh.visible = false; G.stats.kills++; } });
  for (const c of G.police.cops) targets.push({ x: c.x, z: c.z, hp: c.hp, set: (v) => { c.hp = v; }, kill: () => { c.hp = 0; G.scene.remove(c.mesh); G.police.cops = G.police.cops.filter(o => o !== c); G.police.addWanted(2, 'attacked a cop'); } });
  const ped = G.peds.nearest(P.x, P.z, 2.2);
  if (ped) { G.peds.killPed(G, ped, 'punched'); return; }
  for (const t of targets) {
    if (dist2d(P.x, P.z, t.x, t.z) < 2.2) {
      const hp = t.hp - G.cfg.player.punchDmg; t.set(hp);
      if (hp <= 0) t.kill();
      return;
    }
  }
}

function shoot(G) {
  const P = G.player;
  if (P.weapon === 'fists') { punch(G); return; }
  const now = performance.now();
  const rate = P.weapon === 'smg' ? 110 : 320;
  if (now - (P.lastShot || 0) < rate) return;
  if (P.weapon === 'smg') {
    if (P.ammo <= 0) { P.weapon = 'pistol'; G.hud.banner('SMG EMPTY', 'Back to the pistol.'); return; }
    P.ammo--;
  }
  P.lastShot = now;
  G.audio.shot();
  G.shotsFiredAt = { x: P.x + Math.sin(P.camYaw) * 10, z: P.z + Math.cos(P.camYaw) * 10 };
  // Hitscan: nearest damageable target roughly in front of the camera.
  const fx = Math.sin(P.camYaw), fz = Math.cos(P.camYaw);
  let best = null, bd = 48;
  const consider = (x, z, obj) => {
    const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
    if (d > bd || d < 0.5) return;
    const dot = (dx * fx + dz * fz) / d;
    if (dot < 0.82) return;
    bd = d; best = obj;
  };
  for (const e of G.missions.enemies) if (!e.dead) consider(e.x, e.z, { kind: 'gang', ref: e });
  for (const c of G.police.cops) consider(c.x, c.z, { kind: 'cop', ref: c });
  const ped = G.peds.nearest(P.x + fx * 8, P.z + fz * 8, 10);
  if (ped) consider(ped.x, ped.z, { kind: 'ped', ref: ped });
  if (!best) {
    // A shot near a cop still draws heat.
    if (G.police.cops.some(c => dist2d(c.x, c.z, P.x, P.z) < 30) || G.police.cars.some(c => dist2d(c.x, c.z, P.x, P.z) < 30)) {
      G.police.addWanted(1, 'shots fired near police');
    }
    return;
  }
  const dmg = P.weapon === 'smg' ? G.cfg.player.smgDmg : G.cfg.player.pistolDmg;
  if (best.kind === 'gang') {
    best.ref.hp -= dmg;
    if (best.ref.hp <= 0) { best.ref.dead = true; best.ref.mesh.visible = false; G.stats.kills++; G.audio.chime(); }
  } else if (best.kind === 'cop') {
    best.ref.hp -= dmg;
    if (best.ref.hp <= 0) {
      G.scene.remove(best.ref.mesh);
      G.police.cops = G.police.cops.filter(o => o !== best.ref);
      G.stats.kills++; G.police.addWanted(2, 'shot a cop');
    }
  } else if (best.kind === 'ped') {
    G.peds.killPed(G, best.ref, 'shot');
  }
}
