// SOLPORT — vehicles.js (retry session, 19 Nov 2026)
// Car meshes (boxes + cylinder wheels, no imported models) and traffic AI:
// cars drive the road grid, turn at intersections, and respawn far away.
// Also the player's arcade car physics: accelerate / brake / steer / drift.

import * as THREE from 'three';
import { mulberry32, clamp, angleLerp } from './utils.js';
import { CONFIG } from './config.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3aa655, 0xdddddd, 0x222831, 0x8a4fc2, 0xe07b39];

export function createCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.15, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4.2), bodyMat);
  body.position.y = 0.65; body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.1), glassMat);
  cabin.position.set(0, 1.25, -0.2); cabin.castShadow = true;
  g.add(cabin);
  if (opts.sport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.5), bodyMat);
    spoiler.position.set(0, 1.15, -2); g.add(spoiler);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.38, z);
    g.add(w); wheels.push(w);
  }
  // Headlights (emissive, read well at sunset).
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 1.2 });
  for (const x of [-0.6, 0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), lightMat);
    l.position.set(x, 0.7, 2.12);
    g.add(l);
  }
  g.userData.wheels = wheels;
  return g;
}

export function makePlayerCar(scene, x, z, color = 0xc23b2e, sport = false) {
  const mesh = createCarMesh(color, { sport });
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return { mesh, x, z, angle: 0, speed: 0, steer: 0 };
}

// Arcade driving: W/S speed, A/D steer (stronger at speed), Space drift.
export function updatePlayerCar(car, input, dt, collide) {
  const fwd = input.down('w') || input.down('arrowup');
  const back = input.down('s') || input.down('arrowdown');
  const left = input.down('a') || input.down('arrowleft');
  const right = input.down('d') || input.down('arrowright');
  const drift = input.down(' ');
  if (fwd) car.speed += CONFIG.carAccel * dt;
  else if (back) car.speed -= (car.speed > 0.5 ? CONFIG.carBrake : CONFIG.carAccel * 0.6) * dt;
  else car.speed -= Math.sign(car.speed) * 8 * dt;
  if (Math.abs(car.speed) < 0.2 && !fwd && !back) car.speed = 0;
  car.speed = clamp(car.speed, -CONFIG.carReverseMax, CONFIG.carMaxSpeed);
  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const grip = drift ? 0.45 : 1;
  car.angle += car.steer * CONFIG.carTurn * grip * dt * clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed < 0 ? -1 : 1);
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  const hit = collide(nx, nz, 2.2);
  if (!hit) { car.x = nx; car.z = nz; }
  else { car.speed *= 0.4; }
  car.x = clamp(car.x, -196, 196); car.z = clamp(car.z, -196, 196);
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
  const spin = car.speed * dt * 2.6;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  return Math.abs(car.speed) > 0.5;
}

export class Traffic {
  constructor(scene) {
    this.rng = mulberry32(4242);
    this.cars = [];
    for (let i = 0; i < CONFIG.trafficCount; i++) {
      const color = CAR_COLORS[i % CAR_COLORS.length];
      const mesh = createCarMesh(color);
      scene.add(mesh);
      this.cars.push(this._spawn(mesh, true));
    }
  }

  _spawn(mesh, anywhere) {
    const rng = this.rng;
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = (Math.floor(rng() * 9) - 4) * CONFIG.roadStep;
    const along = anywhere ? (rng() * 2 - 1) * 160 : (rng() < 0.5 ? -170 : 170);
    const dir = rng() < 0.5 ? 1 : -1;
    const c = { mesh, axis, line, along, dir, speed: 6 + rng() * 5 };
    this._place(c);
    return c;
  }

  _place(c) {
    if (c.axis === 'x') { c.mesh.position.set(c.along, 0, c.line); c.mesh.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { c.mesh.position.set(c.line, 0, c.along); c.mesh.rotation.y = c.dir > 0 ? 0 : Math.PI; }
  }

  update(dt, playerPos) {
    for (const c of this.cars) {
      // Yield: crawl when the player is right in front of this car,
      // so traffic does not blindly rear-end a stopped player car.
      const px = c.axis === 'x' ? c.along : c.line;
      const pz = c.axis === 'x' ? c.line : c.along;
      const dPlayer = Math.hypot(px - playerPos.x, pz - playerPos.z);
      const speed = dPlayer < 12 ? c.speed * 0.45 : c.speed;
      c.along += c.dir * speed * dt;
      // Turn at an intersection sometimes; otherwise keep straight.
      if (Math.abs(c.along % CONFIG.roadStep) < c.speed * dt * 0.6 && this.rng() < 0.25) {
        // Crossing point: current along becomes the new road line,
        // current line becomes the new along coordinate.
        const at = Math.round(c.along / CONFIG.roadStep) * CONFIG.roadStep;
        const oldLine = c.line;
        c.line = at;
        c.along = oldLine;
        c.axis = c.axis === 'x' ? 'z' : 'x';
        c.dir = this.rng() < 0.5 ? 1 : -1;
      }
      if (Math.abs(c.along) > 185) this._respawn(c, playerPos);
      this._place(c);
      const spin = c.speed * dt * 2.6;
      for (const w of c.mesh.userData.wheels) w.rotation.x += spin;
    }
  }

  _respawn(c, playerPos) {
    const keep = c.mesh;
    const fresh = this._spawn(keep, false);
    Object.assign(c, fresh);
    // Don't respawn on top of the player.
    const d = Math.hypot(c.mesh.position.x - playerPos.x, c.mesh.position.z - playerPos.z);
    if (d < 30) { c.along = -c.along; this._place(c); }
  }

  // Nearest traffic car within range (for entering / stealing).
  nearest(x, z, range) {
    let best = null; let bd = range;
    for (const c of this.cars) {
      const d = Math.hypot(c.mesh.position.x - x, c.mesh.position.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best ? { car: best, dist: bd } : null;
  }
}
