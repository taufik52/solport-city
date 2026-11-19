// SOLPORT police: wanted stars, chasing cruisers, foot cops, busts, decay
// and the Spray Shop that launders a hot car for cash.
import * as THREE from 'three';
import { makeCarMesh } from './vehicles.js';
import { clamp, dist2d } from './utils.js';

function makeCopMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.85, 3, 8),
    new THREE.MeshLambertMaterial({ color: 0x1a2f6e }));
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd9a986 }));
  head.position.y = 2.0; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.16, 10),
    new THREE.MeshLambertMaterial({ color: 0x0d1a3a }));
  cap.position.y = 2.25; g.add(cap);
  return g;
}

export class Police {
  constructor(scene, city) {
    this.scene = scene; this.city = city;
    this.wanted = 0; this.cars = []; this.cops = [];
    this.bustTimer = 0; this.decayTimer = 0; this.flashT = 0;
  }
  addWanted(n, why) {
    if (this.wanted >= 5) return;
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.decayTimer = 12;
    if (this.wanted > 0) this._syncCars();
  }
  _syncCars() {
    const want = Math.min(this.wanted, 4);
    while (this.cars.length < want) {
      const mesh = makeCarMesh(0xf2f2f2, { police: true });
      this.scene.add(mesh);
      this.cars.push({ mesh, x: 0, z: 0, yaw: 0, speed: 0, spawned: false });
    }
  }
  clearWanted(silent) {
    this.wanted = 0; this.bustTimer = 0;
    for (const c of this.cars) { this.scene.remove(c.mesh); }
    this.cars = [];
    for (const c of this.cops) { this.scene.remove(c.mesh); }
    this.cops = [];
    return silent;
  }
  setWanted(n) { this.wanted = clamp(n, 0, 5); this.decayTimer = 12; if (n > 0) this._syncCars(); else this.clearWanted(true); }
  update(G, dt) {
    if (this.wanted <= 0) { G.audio.setSiren(false); return; }
    G.audio.setSiren(true); G.audio.sirenTick(dt);
    this.flashT += dt;
    const px = G.player.inCar ? G.player.car.x : G.player.x;
    const pz = G.player.inCar ? G.player.car.z : G.player.z;
    // Wanted decay: stay out of trouble and the heat fades, one star at a time.
    this.decayTimer -= dt;
    if (this.decayTimer <= 0) {
      this.wanted--; this.decayTimer = 14;
      if (this.wanted <= 0) { this.clearWanted(true); G.hud.banner('CLEAN', 'You lost the cops.'); return; }
      G.hud.setObjective(G.missions.objectiveText());
    }
    // Cruisers: spawn off-screen, chase, ram. Light bars flash red/blue.
    for (const car of this.cars) {
      if (!car.spawned) {
        const a = Math.random() * Math.PI * 2;
        car.x = px + Math.sin(a) * 70; car.z = pz + Math.cos(a) * 70;
        [car.x, car.z] = this.city.clampToWorld(car.x, car.z);
        car.spawned = true;
      }
      const d = dist2d(car.x, car.z, px, pz);
      // Screenshot staging: cruisers hold formation instead of chasing,
      // so the staged chase stays in frame for the capture.
      if (G.shotMode) {
        // Hold formation with the player's car so the staged chase stays framed.
        const hold = G.player.inCar ? Math.abs(G.player.car.speed) : 20;
        car.x += Math.sin(car.yaw) * hold * dt; car.z += Math.cos(car.yaw) * hold * dt;
        car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.yaw;
        const bar = car.mesh.userData.lightBar;
        if (bar) bar.children[0].material.color.setHex(Math.floor(this.flashT * 4) % 2 ? 0xff2222 : 0x551111);
        if (bar) bar.children[1].material.color.setHex(Math.floor(this.flashT * 4) % 2 ? 0x111155 : 0x2244ff);
        continue;
      }
      const wantYaw = Math.atan2(px - car.x, pz - car.z);
      let dy = wantYaw - car.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      car.yaw += clamp(dy, -2.6 * dt, 2.6 * dt);
      const sp = d > 30 ? 26 : 15 + this.wanted * 1.5;
      car.x += Math.sin(car.yaw) * sp * dt; car.z += Math.cos(car.yaw) * sp * dt;
      car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.yaw;
      const bar = car.mesh.userData.lightBar;
      if (bar) bar.children[0].material.color.setHex(Math.floor(this.flashT * 4) % 2 ? 0xff2222 : 0x551111);
      if (bar) bar.children[1].material.color.setHex(Math.floor(this.flashT * 4) % 2 ? 0x111155 : 0x2244ff);
      // Ram the player's car; bump the player on foot.
      if (d < 3.4) {
        if (G.player.inCar) { G.player.car.speed *= 0.55; G.player.hp = Math.max(5, G.player.hp - 2); G.audio.crash(); }
        else { G.player.hp = Math.max(5, G.player.hp - 6); G.player.x += Math.sin(car.yaw) * 2; G.player.z += Math.cos(car.yaw) * 2; }
      }
    }
    // Foot cops: one steps out when the player is on foot and a cruiser is close.
    if (!G.player.inCar && this.cops.length < Math.min(2, this.wanted)) {
      const near = this.cars.find(c => c.spawned && dist2d(c.x, c.z, px, pz) < 16);
      if (near) {
        const mesh = makeCopMesh(); this.scene.add(mesh);
        this.cops.push({ mesh, x: near.x, z: near.z, yaw: 0, hp: 60 });
      }
    }
    for (const cop of this.cops) {
      const d = dist2d(cop.x, cop.z, px, pz);
      const wantYaw = Math.atan2(px - cop.x, pz - cop.z);
      cop.yaw = wantYaw;
      const sp = d > 3 ? 6.5 : 0;
      cop.x += Math.sin(cop.yaw) * sp * dt; cop.z += Math.cos(cop.yaw) * sp * dt;
      cop.mesh.position.set(cop.x, 0, cop.z); cop.mesh.rotation.y = cop.yaw;
      if (d < 2.6) {
        this.bustTimer += dt;
        G.hud.setBust(this.bustTimer / 3);
        if (this.bustTimer >= 3) { G.busted(); return; }
      } else this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
    if (this.cops.length === 0) G.hud.setBust(0);
    // Spray Shop: press E near it in a car to clear the wanted level for cash.
    const s = this.city.spots.spray;
    if (G.player.inCar && dist2d(px, pz, s.x, s.z) < 12) {
      G.hud.setPrompt('E — Spray Shop: clear wanted for $150');
      if (G.input.wasPressed('KeyE')) {
        if (G.player.cash >= 150) {
          G.player.cash -= 150; this.clearWanted(true);
          G.audio.chime(); G.hud.banner('CLEAN RIDE', 'Fresh paint. The PD lost your trail.');
        } else G.hud.banner('NO CASH', 'The Spray Shop wants $150. You are short.');
      }
    }
  }
}
