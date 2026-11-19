// SOLPORT vehicles: car meshes, road traffic AI and arcade driving physics.
import * as THREE from 'three';
import { mulberry32, pick, clamp, dist2d, collideCircleBox } from './utils.js';

export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.2), bodyMat);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.1),
    new THREE.MeshLambertMaterial({ color: opts.police ? 0x111418 : 0x1a2a3a }));
  cabin.position.set(0, 1.12, -0.25); cabin.castShadow = true; g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.38, wz); g.add(w); wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const wx of [-0.65, 0.65]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    l.position.set(wx, 0.6, 2.12); g.add(l);
  }
  let lightBar = null;
  if (opts.police) {
    lightBar = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    r.position.x = -0.35; lightBar.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    b.position.x = 0.35; lightBar.add(b);
    lightBar.position.y = 1.55; g.add(lightBar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.22), new THREE.MeshLambertMaterial({ color: 0x111418 }));
    stripe.position.y = 0.72; g.add(stripe);
  }
  g.userData = { wheels, lightBar };
  return g;
}

// --- Traffic: AI cars cruising the road graph, despawn/respawn far away. ---
export class Traffic {
  constructor(scene, city, count) {
    this.scene = scene; this.city = city; this.cars = [];
    const rng = mulberry32(4242);
    const colors = [0xc0392b, 0x2980b9, 0xe6c34a, 0x7f8c8d, 0x27ae60, 0x8e44ad, 0xd35400, 0xeeeeee];
    for (let i = 0; i < count; i++) {
      const p = pick(rng, city.intersections);
      const mesh = makeCarMesh(pick(rng, colors));
      scene.add(mesh);
      this.cars.push({ mesh, x: p.x, z: p.z, yaw: pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]), speed: 7 + rng() * 4, target: pick(rng, city.intersections), wait: 0 });
    }
  }
  _nextTarget(car) {
    const same = this.city.intersections.filter(p => (p.x === car.target.x || p.z === car.target.z) && !(p.x === car.target.x && p.z === car.target.z));
    car.target = pick(mulberry32((Math.random() * 1e9) | 0), same.length ? same : this.city.intersections);
  }
  update(G, dt) {
    for (const car of this.cars) {
      const dx = car.target.x - car.x, dz = car.target.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d < 2) { this._nextTarget(car); continue; }
      const wantYaw = Math.atan2(dx, dz);
      let dy = wantYaw - car.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      car.yaw += clamp(dy, -2.2 * dt, 2.2 * dt);
      // Slow down for the player car or a car ahead.
      let sp = car.speed;
      const px = G.player.inCar ? G.player.car.x : G.player.x;
      const pz = G.player.inCar ? G.player.car.z : G.player.z;
      if (dist2d(car.x, car.z, px, pz) < 9) sp = Math.min(sp, 3);
      for (const o of this.cars) if (o !== car && dist2d(car.x, car.z, o.x, o.z) < 7) { sp = Math.min(sp, 2); break; }
      car.x += Math.sin(car.yaw) * sp * dt; car.z += Math.cos(car.yaw) * sp * dt;
      car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.yaw;
      for (const w of car.mesh.userData.wheels) w.rotation.x += sp * dt * 2;
    }
  }
}

// --- Player driving: arcade physics, building + traffic collision. ---
export function updatePlayerCar(G, dt) {
  const car = G.player.car; const inp = G.input; const C = G.cfg.car;
  const fwd = inp.down('KeyW') || inp.down('ArrowUp');
  const back = inp.down('KeyS') || inp.down('ArrowDown');
  const left = inp.down('KeyA') || inp.down('ArrowLeft');
  const right = inp.down('KeyD') || inp.down('ArrowRight');
  const brake = inp.down('Space');
  if (fwd) car.speed += C.accel * dt;
  if (back) car.speed -= (car.speed > 0.5 ? C.brake : C.reverseAccel) * dt;
  // Screenshot staging holds its speed so the staged chase stays framed.
  if (!fwd && !back && !G.shotMode) car.speed -= Math.sign(car.speed) * C.grip * dt * 0.6;
  if (brake) { car.speed -= Math.sign(car.speed) * C.brake * 1.4 * dt; car.drifting = Math.abs(car.speed) > 8; }
  else car.drifting = false;
  car.speed = clamp(car.speed, -C.maxReverse, C.maxSpeed);
  if (Math.abs(car.speed) < 0.15) car.speed = 0;
  const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
  const steerAmt = steerInput * C.steer * clamp(Math.abs(car.speed) / 10, 0, 1) * (car.drifting ? 1.6 : 1);
  car.yaw += steerAmt * dt * Math.sign(car.speed || 1) * (car.speed < 0 ? -1 : 1);
  car.x += Math.sin(car.yaw) * car.speed * dt;
  car.z += Math.cos(car.yaw) * car.speed * dt;
  // Buildings: push out, bleed speed, thud on hard hits.
  for (const b of G.city.colliders) {
    const [nx, nz] = collideCircleBox(car.x, car.z, 2.1, b);
    if (nx !== car.x || nz !== car.z) {
      if (Math.abs(car.speed) > 10) { G.audio.crash(); G.player.hp = Math.max(5, G.player.hp - 4); }
      car.speed *= 0.45; car.x = nx; car.z = nz;
    }
  }
  [car.x, car.z] = G.city.clampToWorld(car.x, car.z);
  // Bump traffic cars aside (and slow down).
  for (const t of G.traffic.cars) {
    if (dist2d(car.x, car.z, t.x, t.z) < 3.6) {
      const d = Math.max(0.1, dist2d(car.x, car.z, t.x, t.z));
      const push = (3.6 - d);
      t.x += ((t.x - car.x) / d) * push; t.z += ((t.z - car.z) / d) * push;
      car.speed *= 0.85;
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.yaw;
  car.mesh.rotation.z = car.drifting ? steerInput * 0.06 : 0;
  for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2;
  G.audio.setEngine(Math.abs(car.speed) / C.maxSpeed, true);
}
