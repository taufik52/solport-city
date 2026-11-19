// SOLPORT — police.js (retry session, 19 Nov 2026)
// Wanted 0-5: police cars spawn and chase/ram the player; on foot, cops
// chase and "bust" on a proximity timer. Wanted decays when the player
// stays out of sight; the Spray Shop clears it for cash.

import * as THREE from 'three';
import { createCarMesh } from './vehicles.js';
import { makePersonMesh } from './pedestrians.js';
import { clamp, angleLerp, dist2 } from './utils.js';
import { CONFIG, SPRAY_SHOP } from './config.js';

export class Police {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];   // {mesh, x, z, angle, speed}
    this.cops = [];   // on-foot {mesh, x, z, angle}
    this.bustTimer = 0;
    this.decayTimer = 0;
    this.sirenWanted = 0;
  }

  wantedCount(wanted) { return Math.min(wanted, CONFIG.maxPoliceCars); }

  // Keep spawned units matched to the wanted level.
  sync(scene, wanted, px, pz) {
    const want = this.wantedCount(wanted);
    while (this.cars.length < want) {
      const mesh = createCarMesh(0x1a2a44);
      // White doors stripe via a thin box.
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(2.05, 0.25, 2.2),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
      );
      stripe.position.y = 0.85;
      mesh.add(stripe);
      const beacon = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.18, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 })
      );
      beacon.position.y = 1.62;
      mesh.add(beacon);
      mesh.userData.beacon = beacon;
      scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      this.cars.push({ mesh, x: px + Math.sin(a) * 60, z: pz + Math.cos(a) * 60, angle: a, speed: 0 });
    }
    while (this.cars.length > want) {
      const c = this.cars.pop();
      scene.remove(c.mesh);
    }
    // On-foot cops only when wanted >= 2 and the player is on foot.
    const wantCops = wanted >= 2 ? Math.min(2, wanted - 1) : 0;
    while (this.cops.length < wantCops) {
      const mesh = makePersonMesh(0x1a2a44, 0xc98a5a);
      scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      this.cops.push({ mesh, x: px + Math.sin(a) * 25, z: pz + Math.cos(a) * 25, angle: a });
    }
    while (this.cops.length > wantCops) {
      const c = this.cops.pop();
      scene.remove(c.mesh);
    }
  }

  update(dt, S) {
    const px = S.player.x, pz = S.player.z;
    const driving = !S.player.onFoot && S.car;
    const targetX = driving ? S.car.x : px;
    const targetZ = driving ? S.car.z : pz;
    let anyNear = false;

    for (const c of this.cars) {
      const d = dist2(c.x, c.z, targetX, targetZ);
      const wantAngle = Math.atan2(targetX - c.x, targetZ - c.z);
      c.angle = angleLerp(c.angle, wantAngle, Math.min(1, dt * 2.2));
      const targetSpeed = d > 6 ? (S.wanted >= 4 ? 30 : 24) : 10;
      c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 1.5);
      c.x += Math.sin(c.angle) * c.speed * dt;
      c.z += Math.cos(c.angle) * c.speed * dt;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.angle;
      // Flashing beacon.
      c.mesh.userData.beacon.material.emissive.setHex(Math.floor(performance.now() / 250) % 2 ? 0xff2222 : 0x2266ff);
      // Ram: contact damages the player / car.
      if (d < 3.4) {
        anyNear = true;
        if (driving) {
          S.car.speed *= 0.55;
          S.player.hp -= 6 * dt * 10 * 0.1;
        } else {
          S.player.hp -= 12 * dt;
        }
        S.audio.crash();
      }
      if (d < 40) anyNear = true;
    }

    for (const c of this.cops) {
      const d = dist2(c.x, c.z, px, pz);
      const wantAngle = Math.atan2(px - c.x, pz - c.z);
      c.angle = angleLerp(c.angle, wantAngle, Math.min(1, dt * 3));
      const sp = d > 3 ? 6.5 : 0;
      c.x += Math.sin(c.angle) * sp * dt;
      c.z += Math.cos(c.angle) * sp * dt;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.angle;
      if (d < 3.2) anyNear = true;
    }

    // Bust timer: on foot, a cop within 3.2m builds the bust.
    if (!driving && this.cops.some((c) => dist2(c.x, c.z, px, pz) < 3.2)) {
      this.bustTimer += dt;
      if (this.bustTimer > 2.5) { S.busted = true; this.bustTimer = 0; }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt);
    }

    // Wanted decay: out of sight of every police unit for a while.
    if (S.wanted > 0 && !anyNear) {
      this.decayTimer += dt;
      if (this.decayTimer > CONFIG.wantedDecayDelay) {
        S.wanted -= 1;
        this.decayTimer = 0;
        S.hudFlash('Wanted level dropped');
      }
    } else {
      this.decayTimer = 0;
    }

    // Spray shop clears wanted for cash.
    if (S.wanted > 0 && dist2(px, pz, SPRAY_SHOP[0], SPRAY_SHOP[1]) < 8 && S.cash >= CONFIG.sprayCost) {
      S.cash -= CONFIG.sprayCost;
      S.wanted = 0;
      S.hudFlash(`Spray Shop: wanted cleared (-$${CONFIG.sprayCost})`);
      S.audio.chime();
    }
  }

  clearAll(scene) {
    for (const c of this.cars) scene.remove(c.mesh);
    for (const c of this.cops) scene.remove(c.mesh);
    this.cars = []; this.cops = [];
    this.bustTimer = 0;
  }
}
