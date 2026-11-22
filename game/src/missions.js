// SOLPORT — missions.js (resubmit rewrite, 22 Nov 2026)
// Data-driven mission engine for Jax Marlowe vs the Harbor Kings.
//
// Design: missions are declarative data (see config.js MISSIONS); this file
// is a small runner, not five hand-written scripts. A handler registry maps
// each step kind to a behaviour object {enter, tick, leave}, and the runner
// keeps one per-step context object that tracks sub-phases (a fight step,
// for example, flows seek -> combat -> fetch -> deliver without ever
// rewriting the step data itself). The runner only ever talks to the shared
// state S through a narrow surface: beacon, cash, wanted, banners, audio.

import * as THREE from 'three';
import { MISSIONS, MARA_HOME } from './config.js';
import { dist2 } from './utils.js';
import { makePersonMesh } from './pedestrians.js';
import { createCarMesh, makePlayerCar } from './vehicles.js';

// --- Step handlers -------------------------------------------------------
// Every handler gets (S, run, step, dt) and may read/write run.ctx, the
// per-step scratch object. enter() stages the step's actors and beacon;
// tick() returns 'done' when the step completes, 'stay' otherwise.

function pointBeacon(S, x, z, label) {
  S.city.beacon.visible = true;
  S.city.beacon.position.set(x, 0, z);
}

function arriveAt(px, pz, x, z, radius) {
  return dist2(px, pz, x, z) < radius;
}

const HANDLERS = {
  goto: {
    enter(S, run, step) {
      run.ctx.target = { x: step.pos[0], z: step.pos[1] };
      pointBeacon(S, step.pos[0], step.pos[1], step.label);
    },
    tick(S, run, step) {
      const t = run.ctx.target;
      return arriveAt(S.player.x, S.player.z, t.x, t.z, 6) ? 'done' : 'stay';
    },
  },

  steal: {
    enter(S, run, step) {
      const mesh = createCarMesh(0xe8c832, { sport: true });
      mesh.position.set(step.pos[0], 0, step.pos[1]);
      S.scene.add(mesh);
      run.comet = { mesh, x: step.pos[0], z: step.pos[1], angle: 0 };
      pointBeacon(S, step.pos[0], step.pos[1], step.label);
    },
    tick() { return 'stay'; }, // completes via trySteal() when the player presses E
    leave(S, run) {
      if (run.comet) { S.scene.remove(run.comet.mesh); run.comet = null; }
    },
  },

  fight: {
    enter(S, run, step) {
      run.ctx.phase = 'combat';
      run.ctx.dock = { x: step.pos[0], z: step.pos[1] };
      const count = step.gang || 3;
      for (let i = 0; i < count; i++) {
        const mesh = makePersonMesh(0x8a2a2a, 0xd9a077);
        const gx = step.pos[0] + (i - 1.5) * 4;
        const gz = step.pos[1] + (i % 2 ? 4 : -4);
        mesh.position.set(gx, 0, gz);
        S.scene.add(mesh);
        run.gang.push({ mesh, x: gx, z: gz, hp: 60 });
      }
      pointBeacon(S, step.pos[0], step.pos[1], step.label);
    },
    tick(S, run, step, dt) {
      if (run.ctx.phase === 'combat') {
        run.updateGang(dt, S);
        if (run.gang.length === 0) {
          // Gang down: the briefcase drops at the dock, then goes to Mara.
          const dock = run.ctx.dock;
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.35, 0.9),
            new THREE.MeshStandardMaterial({ color: 0x6a4a1a, roughness: 0.4, metalness: 0.5 })
          );
          box.position.set(dock.x, 0.5, dock.z);
          S.scene.add(box);
          run.briefcase = box;
          run.ctx.phase = 'fetch';
          run.ctx.pickup = dock;
          run.ctx.deliver = { x: MARA_HOME[0], z: MARA_HOME[1] };
          run.objective = { x: dock.x, z: dock.z, label: 'Grab the briefcase' };
          pointBeacon(S, dock.x, dock.z, 'Grab the briefcase');
          S.hudFlash('Briefcase dropped — grab it!');
        }
        return 'stay';
      }
      if (run.ctx.phase === 'fetch') {
        const p = run.ctx.pickup;
        if (arriveAt(S.player.x, S.player.z, p.x, p.z, 4)) {
          if (run.briefcase) { S.scene.remove(run.briefcase); run.briefcase = null; }
          run.ctx.phase = 'deliver';
          const d = run.ctx.deliver;
          run.objective = { x: d.x, z: d.z, label: 'Bring the briefcase to Mara' };
          pointBeacon(S, d.x, d.z, 'Bring the briefcase to Mara');
          S.audio.chime();
        }
        return 'stay';
      }
      // 'deliver' phase: arrive at Mara's with the case.
      const d = run.ctx.deliver;
      return arriveAt(S.player.x, S.player.z, d.x, d.z, 6) ? 'done' : 'stay';
    },
    leave(S, run) {
      for (const g of run.gang) S.scene.remove(g.mesh);
      run.gang = [];
      if (run.briefcase) { S.scene.remove(run.briefcase); run.briefcase = null; }
    },
  },

  timed: {
    enter(S, run, step) {
      run.ctx.left = step.seconds;
      run.timer = step.seconds;
      S.wanted = Math.max(S.wanted, step.wanted || 0);
      pointBeacon(S, step.pos[0], step.pos[1], step.label);
    },
    tick(S, run, step, dt) {
      run.ctx.left -= dt;
      run.timer = Math.max(0, run.ctx.left);
      if (run.ctx.left <= 0) {
        S.banner('TOO SLOW', 'The safehouse window closed. Try the run again.', 4);
        S.audio.fail();
        run.restartStep(S); // retry the same step, timer reset
        return 'stay';
      }
      return arriveAt(S.player.x, S.player.z, step.pos[0], step.pos[1], 6) ? 'done' : 'stay';
    },
  },

  clear: {
    enter(S, run, step) {
      pointBeacon(S, step.pos[0], step.pos[1], step.label);
    },
    tick(S, run, step) {
      if (arriveAt(S.player.x, S.player.z, step.pos[0], step.pos[1], 8)) {
        S.wanted = 0;
        return 'done';
      }
      return 'stay';
    },
  },

  intercept: {
    enter(S, run, step) {
      const mesh = createCarMesh(0xdddddd);
      mesh.scale.set(1.2, 1.1, 1.4);
      mesh.position.set(-170, 0, 20);
      S.scene.add(mesh);
      run.transport = { mesh, x: -170, z: 20, angle: Math.PI / 2, hp: 120, speed: 12 };
      pointBeacon(S, -170, 20, step.label);
    },
    tick(S, run, step, dt) {
      const t = run.transport;
      if (!t) return 'stay';
      // The transport loops east along the coastal highway (z = 20).
      t.x += Math.sin(t.angle) * t.speed * dt;
      t.z += Math.cos(t.angle) * t.speed * dt;
      if (t.x > 175) t.x = -175;
      t.mesh.position.set(t.x, 0, t.z);
      t.mesh.rotation.y = t.angle;
      run.objective = { x: t.x, z: t.z, label: 'Stop the Reserve transport' };
      S.city.beacon.position.set(t.x, 0, t.z);
      if (t.hp <= 0) {
        S.cash += 250;
        S.hudFlash('Transport stopped — haul secured +$250!');
        S.scene.remove(t.mesh);
        run.transport = null;
        return 'done';
      }
      return 'stay';
    },
    leave(S, run) {
      if (run.transport) { S.scene.remove(run.transport.mesh); run.transport = null; }
    },
  },
};

// --- Runner ---------------------------------------------------------------

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.index = 0;          // mission index into MISSIONS
    this.step = 0;           // step index inside the mission
    this.done = false;       // whole chain finished
    this.timer = 0;          // timed-step countdown (mirrored for the HUD)
    this.gang = [];          // spawned gang members {mesh,x,z,hp}
    this.transport = null;   // intercept target {mesh,x,z,angle,hp,speed}
    this.comet = null;       // steal target car {mesh,x,z,angle}
    this.briefcase = null;   // pickup marker mesh
    this.objective = null;   // {x, z, label}
    this.ctx = {};           // per-step scratch (phases, countdowns, targets)
  }

  current() { return MISSIONS[this.index]; }
  currentStep() { return this.current()?.steps[this.step]; }

  label() {
    if (this.done) return 'All missions complete — Solport is yours, Jax.';
    const m = this.current();
    const s = this.currentStep();
    const p = this.progress();
    return `M${p.mission}/${p.missions} · ${m.name}: ${s.label}`;
  }

  // Chain progress for the HUD: how many steps are done out of the whole
  // five-mission chain, and which mission Jax is on.
  progress() {
    const total = MISSIONS.reduce((n, m) => n + m.steps.length, 0);
    const banked = MISSIONS.slice(0, this.index).reduce((n, m) => n + m.steps.length, 0);
    return { done: banked + this.step, total, mission: this.index + 1, missions: MISSIONS.length };
  }

  // Fresh chain from mission 1 (used by New Game).
  reset() {
    this.index = 0;
    this.step = 0;
    this.done = false;
    this.timer = 0;
    this.ctx = {};
  }

  // Resume a saved chain at a mission (used by Continue).
  restore(index) {
    this.reset();
    this.index = Math.min(index || 0, MISSIONS.length - 1);
  }

  start(S) {
    this._enterStep(S);
    S.banner(`${this.current().name}`, this.current().intro, 5);
    S.audio.sting();
  }

  _handler(step) {
    return HANDLERS[step?.kind] || HANDLERS.goto;
  }

  _clearActors() {
    for (const g of this.gang) this.scene.remove(g.mesh);
    this.gang = [];
    if (this.transport) { this.scene.remove(this.transport.mesh); this.transport = null; }
    if (this.comet) { this.scene.remove(this.comet.mesh); this.comet = null; }
    if (this.briefcase) { this.scene.remove(this.briefcase); this.briefcase = null; }
  }

  _enterStep(S) {
    this._clearActors();
    this.ctx = {};
    const step = this.currentStep();
    if (!step) { this._finishMission(S); return; }
    this.objective = { x: step.pos[0], z: step.pos[1], label: step.label };
    this._handler(step).enter(S, this, step);
    S.hudFlash(step.label);
  }

  // Re-stage the current step from scratch (timed-step retry).
  restartStep(S) {
    this._enterStep(S);
  }

  _leaveStep(S) {
    const step = this.currentStep();
    this._handler(step).leave?.(S, this, step);
  }

  _completeStep(S) {
    const step = this.currentStep();
    this._leaveStep(S);
    if (step?.reward) {
      S.cash += step.reward;
      S.hudFlash(`+$${step.reward}`);
    }
    S.audio.sting();
    this.step += 1;
    if (this.step >= this.current().steps.length) this._finishMission(S);
    else this._enterStep(S);
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
    this._enterStep(S);
  }

  // Called when the player presses E near a steal target.
  trySteal(S) {
    if (!this.comet) return false;
    if (dist2(S.player.x, S.player.z, this.comet.x, this.comet.z) > 6) return false;
    // Swap the parked Comet in as the player's car.
    if (S.car) this.scene.remove(S.car.mesh);
    S.car = makePlayerCar(this.scene, this.comet.x, this.comet.z, 0xe8c832, true);
    this.scene.remove(this.comet.mesh);
    this.comet = null;
    S.player.onFoot = false;
    S.wanted = Math.max(S.wanted, 2);
    S.hudFlash('Comet GT stolen — the cops are coming!');
    S.audio.sting();
    this._completeStep(S);
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
    const step = this.currentStep();
    if (!step) return;
    const verdict = this._handler(step).tick(S, this, step, dt);
    if (verdict === 'done') this._completeStep(S);
  }
}
