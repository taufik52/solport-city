// SOLPORT — missions.js (retry session, 19 Nov 2026)
// The 5-mission chain for Jax Marlowe vs the Harbor Kings.
// Steps: goto / steal / fight / clear / timed / intercept, then a reward
// and the next mission's intro banner.

import * as THREE from 'three';
import { MISSIONS, MARA_HOME } from './config.js';
import { dist2 } from './utils.js';
import { makePersonMesh } from './pedestrians.js';
import { createCarMesh, makePlayerCar } from './vehicles.js';

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.index = 0;          // mission index into MISSIONS
    this.step = 0;           // step index inside the mission
    this.done = false;       // whole chain finished
    this.timer = 0;          // timed-step countdown
    this.gang = [];          // spawned gang members {mesh,x,z,hp}
    this.transport = null;   // intercept target {mesh,x,z,angle,hp,speed}
    this.comet = null;       // steal target car {mesh,x,z,angle}
    this.briefcase = null;   // pickup marker mesh
    this.objective = null;   // {x, z, label}
  }

  current() { return MISSIONS[this.index]; }
  currentStep() { return this.current()?.steps[this.step]; }

  label() {
    if (this.done) return 'All missions complete — Solport is yours, Jax.';
    const m = this.current();
    const s = this.currentStep();
    return `${m.name}: ${s.label}`;
  }

  start(S) {
    this._setupStep(S);
    S.banner(`${this.current().name}`, this.current().intro, 5);
    S.audio.sting();
  }

  _clearStepObjects(S) {
    for (const g of this.gang) this.scene.remove(g.mesh);
    this.gang = [];
    if (this.transport) { this.scene.remove(this.transport.mesh); this.transport = null; }
    if (this.comet) { this.scene.remove(this.comet.mesh); this.comet = null; }
    if (this.briefcase) { this.scene.remove(this.briefcase); this.briefcase = null; }
  }

  _setupStep(S) {
    this._clearStepObjects(S);
    const s = this.currentStep();
    if (!s) { this._finishMission(S); return; }
    this.objective = { x: s.pos[0], z: s.pos[1], label: s.label };
    S.city.beacon.visible = true;
    S.city.beacon.position.set(s.pos[0], 0, s.pos[1]);

    if (s.kind === 'fight') {
      for (let i = 0; i < (s.gang || 3); i++) {
        const mesh = makePersonMesh(0x8a2a2a, 0xd9a077);
        mesh.position.set(s.pos[0] + (i - 1.5) * 4, 0, s.pos[1] + (i % 2 ? 4 : -4));
        this.scene.add(mesh);
        this.gang.push({ mesh, x: mesh.position.x, z: mesh.position.z, hp: 60 });
      }
    }
    if (s.kind === 'steal') {
      const mesh = createCarMesh(0xe8c832, { sport: true });
      mesh.position.set(s.pos[0], 0, s.pos[1]);
      this.scene.add(mesh);
      this.comet = { mesh, x: s.pos[0], z: s.pos[1], angle: 0 };
    }
    if (s.kind === 'timed') {
      this.timer = s.seconds;
      S.wanted = Math.max(S.wanted, s.wanted || 0);
    }
    if (s.kind === 'intercept') {
      const mesh = createCarMesh(0xdddddd);
      mesh.scale.set(1.2, 1.1, 1.4);
      mesh.position.set(-170, 0, 20);
      this.scene.add(mesh);
      this.transport = { mesh, x: -170, z: 20, angle: Math.PI / 2, hp: 120, speed: 12 };
    }
    S.hudFlash(s.label);
  }

  _finishStep(S) {
    const s = this.currentStep();
    if (s?.reward) {
      S.cash += s.reward;
      S.hudFlash(`+$${s.reward}`);
    }
    S.audio.sting();
    this.step += 1;
    if (this.step >= this.current().steps.length) this._finishMission(S);
    else this._setupStep(S);
  }

  _finishMission(S) {
    S.saveData.respect += 20;
    if (this.index >= MISSIONS.length - 1) {
      this.done = true;
      this.objective = null;
      S.city.beacon.visible = false;
      S.banner('SOLPORT IS YOURS', 'All five missions complete. Mara Voss owes you one, Jax.', 6);
      S.audio.sting();
      return;
    }
    this.index += 1;
    this.step = 0;
    S.banner(`${this.current().name}`, this.current().intro, 5);
    this._setupStep(S);
  }

  // Called when the player presses E near a steal target.
  trySteal(S) {
    if (!this.comet) return false;
    const d = dist2(S.player.x, S.player.z, this.comet.x, this.comet.z);
    if (d > 6) return false;
    // Swap the parked Comet in as the player's car.
    if (S.car) this.scene.remove(S.car.mesh);
    S.car = makePlayerCar(this.scene, this.comet.x, this.comet.z, 0xe8c832, true);
    this.scene.remove(this.comet.mesh);
    this.comet = null;
    S.player.onFoot = false;
    S.wanted = Math.max(S.wanted, 2);
    S.hudFlash('Comet GT stolen — the cops are coming!');
    S.audio.sting();
    this._finishStep(S);
    return true;
  }

  // Gang AI: seek the player and shoot (inaccurate), take damage via hits.
  updateGang(dt, S) {
    for (const g of this.gang) {
      const d = dist2(g.x, g.z, S.player.x, S.player.z);
      const a = Math.atan2(S.player.x - g.x, S.player.z - g.z);
      if (d > 8) {
        g.x += Math.sin(a) * 4.5 * dt;
        g.z += Math.cos(a) * 4.5 * dt;
      } else if (Math.random() < dt * 0.7) {
        // Inaccurate return fire.
        if (Math.random() < 0.35) S.player.hp -= 8;
        S.audio.shot();
      }
      g.mesh.position.set(g.x, 0, g.z);
      g.mesh.rotation.y = a;
    }
  }

  update(dt, S) {
    if (this.done) return;
    const s = this.currentStep();
    if (!s) return;
    const px = S.player.x, pz = S.player.z;

    if (s.kind === 'fight') {
      this.updateGang(dt, S);
      if (this.gang.length === 0) {
        // Drop the briefcase where the fight happened; pick it up, then
        // deliver it to Mara. Two legs, one step.
        const dock = [s.pos[0], s.pos[1]];
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.35, 0.9),
          new THREE.MeshStandardMaterial({ color: 0x6a4a1a, roughness: 0.4, metalness: 0.5 })
        );
        b.position.set(dock[0], 0.5, dock[1]);
        this.scene.add(b);
        this.briefcase = b;
        this._pickupAt = dock;
        this._deliverAt = MARA_HOME;
        s.kind = 'goto';
        s.label = 'Grab the briefcase and bring it to Mara';
        s.pos = MARA_HOME;
        this.objective = { x: dock[0], z: dock[1], label: 'Grab the briefcase' };
        S.city.beacon.position.set(dock[0], 0, dock[1]);
        S.hudFlash('Briefcase dropped — grab it!');
      }
      return;
    }

    if (s.kind === 'timed') {
      this.timer -= dt;
      if (this.timer <= 0) {
        S.banner('TOO SLOW', 'The safehouse window closed. Try the run again.', 4);
        S.audio.fail();
        this._setupStep(S); // retry the same step
        return;
      }
    }

    if (s.kind === 'intercept' && this.transport) {
      const t = this.transport;
      // Transport loops east along the coastal highway (z = 20).
      t.x += Math.sin(t.angle) * t.speed * dt;
      t.z += Math.cos(t.angle) * t.speed * dt;
      if (t.x > 175) { t.x = -175; }
      t.mesh.position.set(t.x, 0, t.z);
      t.mesh.rotation.y = t.angle;
      this.objective = { x: t.x, z: t.z, label: 'Stop the Reserve transport' };
      S.city.beacon.position.set(t.x, 0, t.z);
      if (t.hp <= 0) {
        // Haul secured on the spot; the step reward (mission 5, $1000)
        // still pays out when the step finishes below.
        S.cash += 250;
        S.hudFlash('Transport stopped — haul secured +$250!');
        this.scene.remove(t.mesh);
        this.transport = null;
        this._finishStep(S);
      }
      return;
    }

    if (s.kind === 'clear') {
      // Objective: reach the spray shop while wanted; arrival clears it.
      if (dist2(px, pz, s.pos[0], s.pos[1]) < 8) {
        S.wanted = 0;
        this._finishStep(S);
      }
      return;
    }

    if (s.kind === 'goto') {
      // Briefcase pickup leg (mission 3 second half).
      if (this._pickupAt) {
        if (dist2(px, pz, this._pickupAt[0], this._pickupAt[1]) < 4) {
          if (this.briefcase) { this.scene.remove(this.briefcase); this.briefcase = null; }
          this._pickupAt = null;
          this.objective = { x: this._deliverAt[0], z: this._deliverAt[1], label: 'Bring the briefcase to Mara' };
          S.city.beacon.position.set(this._deliverAt[0], 0, this._deliverAt[1]);
          S.audio.chime();
        }
        return;
      }
      if (dist2(px, pz, s.pos[0], s.pos[1]) < 6) this._finishStep(S);
      return;
    }
  }
}
