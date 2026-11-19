// SOLPORT missions: 5 chained story missions with objectives, enemy gang
// shooters, mission cars, timers and rewards. Original story, original names.
import * as THREE from 'three';
import { makeCarMesh } from './vehicles.js';
import { CFG } from './config.js';
import { dist2d, clamp } from './utils.js';

function makeGangMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.44, 0.85, 3, 8),
    new THREE.MeshLambertMaterial({ color: 0x7a1f2b }));
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xc98a5a }));
  head.position.y = 2.0; g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.3, 1.3, 0.4); g.add(gun);
  return g;
}

export class Missions {
  constructor(scene, city) {
    this.scene = scene; this.city = city;
    this.index = 0; // 0..4 active, 5 = all done
    this.step = 0; this.timer = 0; this.enemies = [];
    this.missionCar = null; this.transport = null; this.briefcase = null;
    this.done = false;
  }
  get def() { return CFG.missions[this.index]; }
  objectiveText() {
    if (this.done) return 'All missions complete — free roam Solport. Taxi fares, sun-packages and deliveries still pay.';
    const m = this.def; if (!m) return '';
    const steps = {
      0: ['Get in the Comet outside Mara\'s house', 'Steal the Comet GT from the Northside lot', 'Reach the Portside dock on foot', 'Get in a car — the clock is running', 'Intercept the Reserve transport on the coastal highway'],
      1: ['Drive the package to the Old Town drop-off', 'Lose the cops, then bring the Comet GT to Mara', 'Clear the dock of Harbor Kings', 'Drive the briefcase to the Marina safehouse', 'Take the haul to Mara\'s house'],
      2: ['Grab the briefcase', 'Drive the haul to Mara\'s house', '', '', ''],
    };
    return (steps[this.step] && steps[this.step][this.index]) || m.objective;
  }
  start(G, idx) {
    this.index = idx; this.step = 0; this.timer = 0;
    this.clearEnemies();
    if (this.missionCar) {
      this.scene.remove(this.missionCar.mesh);
      if (G.parkedCars) G.parkedCars = G.parkedCars.filter(c => c !== this.missionCar);
      this.missionCar = null;
    }
    if (this.transport) { this.scene.remove(this.transport.mesh); this.transport = null; }
    const m = this.def;
    G.hud.showMissionCard(m.name, m.intro);
    G.audio.sting();
    this._placeBeacon(G);
    if (idx === 1) this._spawnMissionCar(G, G.city.spots.northLot.x, G.city.spots.northLot.z, 0xffd23f, 'Comet GT');
    if (idx === 2) this._spawnGang(G);
    if (idx === 3) { this.timer = 90; G.police.setWanted(3); }
    if (idx === 4) this._spawnTransport(G);
    if (idx === 0) this._spawnMissionCar(G, -168, 30, 0x27ae60, 'Comet');
  }
  _placeBeacon(G) {
    const targets = [
      [-168, 30], [G.city.spots.northLot.x, G.city.spots.northLot.z],
      [G.city.spots.dock.x, G.city.spots.dock.z], [G.city.spots.safehouse.x, G.city.spots.safehouse.z],
      [G.city.spots.transport.x, G.city.spots.transport.z],
    ];
    const t = targets[this.index] || [0, 0];
    G.city.setBeacon(t[0], t[1]);
  }
  _spawnMissionCar(G, x, z, color, name) {
    const mesh = makeCarMesh(color); this.scene.add(mesh);
    this.missionCar = { mesh, x, z, yaw: 0, speed: 0, color, name, isMission: true };
    mesh.position.set(x, 0, z);
    G.parkedCars.push(this.missionCar);
  }
  _spawnTransport(G) {
    const mesh = makeCarMesh(0x2c3e50); this.scene.add(mesh);
    this.transport = { mesh, x: -197, z: -180, yaw: 0, speed: 11, name: 'Reserve Transport', isMission: true };
    mesh.position.set(-197, 0, -180);
  }
  _spawnGang(G) {
    // Gang + briefcase staged ON the roads around the dock intersection,
    // never inside a building block.
    const gangSpots = [[144, 168], [164, 148], [148, 138], [172, 164]];
    for (let i = 0; i < 4; i++) {
      const mesh = makeGangMesh(); this.scene.add(mesh);
      const [x, z] = gangSpots[i];
      mesh.position.set(x, 0, z);
      this.enemies.push({ mesh, x, z, yaw: 0, hp: 70, shootT: 1 + i * 0.4, dead: false });
    }
    // The briefcase, glowing on the road at the dock.
    const bc = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    bc.position.set(154, 1.2, 172); this.scene.add(bc);
    this.briefcase = { mesh: bc, x: 154, z: 172, taken: false };
  }
  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
    if (this.briefcase) { this.scene.remove(this.briefcase.mesh); this.briefcase = null; }
  }
  completeMission(G) {
    const rewards = [250, 400, 500, 700, 1500];
    const r = rewards[this.index] || 200;
    G.player.cash += r; G.player.respect += 20;
    G.stats.missions++;
    G.hud.banner('MISSION PASSED', this.def.name + ' — +' + '$' + r + '  •  Respect +20');
    G.audio.sting(); G.city.hideBeacon();
    this.clearEnemies();
    this.index++;
    if (this.index >= 5) {
      this.done = true;
      G.hud.showMissionCard('SOLPORT IS YOURS', 'All five missions complete. Jax Marlowe runs this city now — free roam, collect the sun-packages, and keep the cash coming.');
      G.hud.setObjective(this.objectiveText());
      return;
    }
    this.start(G, this.index);
    G.hud.setObjective(this.objectiveText());
  }
  failMission(G, why) {
    G.hud.banner('MISSION FAILED', why + ' — try again.');
    G.audio.fail();
    this.start(G, this.index);
  }
  update(G, dt) {
    if (this.done) return;
    const px = G.player.inCar ? G.player.car.x : G.player.x;
    const pz = G.player.inCar ? G.player.car.z : G.player.z;
    // Transport drives the coastal highway; beacon follows it.
    if (this.transport) {
      this.transport.z += this.transport.speed * dt;
      if (this.transport.z > 200) this.transport.z = -200;
      this.transport.mesh.position.set(this.transport.x, 0, this.transport.z);
      this.transport.mesh.rotation.y = 0;
      G.city.setBeacon(this.transport.x, this.transport.z);
      if (this.index === 4 && this.step === 0 && dist2d(px, pz, this.transport.x, this.transport.z) < 8) {
        this.step = 1; G.police.setWanted(4);
        G.hud.banner('HAUL SECURED', 'Four stars! Deliver the haul to Mara\'s house.');
        G.city.setBeacon(G.city.spots.mara.x, G.city.spots.mara.z);
        this.scene.remove(this.transport.mesh); this.transport = null;
        G.player.cash += 0;
      }
    }
    // Gang AI: close in and shoot with inaccuracy.
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist2d(e.x, e.z, G.player.x, G.player.z);
      const want = Math.atan2(G.player.x - e.x, G.player.z - e.z);
      e.yaw = want;
      if (d > 14) { e.x += Math.sin(want) * 4 * dt; e.z += Math.cos(want) * 4 * dt; }
      e.mesh.position.set(e.x, 0, e.z); e.mesh.rotation.y = e.yaw;
      e.shootT -= dt;
      if (e.shootT <= 0 && d < 42 && !G.player.inCar) {
        e.shootT = 1.1 + Math.random() * 0.7;
        G.audio.enemyShot();
        if (Math.random() < 0.38) {
          G.player.hp -= 7 + Math.random() * 6;
          G.hud.flashDamage();
          if (G.player.hp <= 0) G.wasted();
        }
      }
    }
    // Briefcase pickup.
    if (this.briefcase && !this.briefcase.taken && this.enemies.every(e => e.dead)) {
      if (dist2d(px, pz, this.briefcase.x, this.briefcase.z) < 3) {
        this.briefcase.taken = true; this.scene.remove(this.briefcase.mesh);
        this.step = 2; G.hud.banner('BRIEFCASE SECURED', 'Take it to Mara\'s house.');
        G.city.setBeacon(G.city.spots.mara.x, G.city.spots.mara.z);
        G.player.weapon = 'smg'; G.player.ammo = 120;
        G.hud.banner('WEAPON', 'Picked up an SMG — 120 rounds.');
      }
    }
    // Per-mission step logic.
    const S = this.city.spots;
    if (this.index === 0) {
      if (this.step === 0 && G.player.inCar && G.player.car === this.missionCar) {
        this.step = 1; G.city.setBeacon(S.oldTownDrop.x, S.oldTownDrop.z);
        G.hud.setObjective(this.objectiveText());
      } else if (this.step === 1 && G.player.inCar && dist2d(px, pz, S.oldTownDrop.x, S.oldTownDrop.z) < 9) {
        this.completeMission(G);
      }
    } else if (this.index === 1) {
      if (this.step === 0 && G.player.inCar && G.player.car === this.missionCar) {
        this.step = 1; G.police.addWanted(2, 'stole the Comet GT');
        G.hud.banner('WANTED', 'The Comet GT is hot — lose the cops, then see Mara.');
        G.city.hideBeacon();
        G.hud.setObjective(this.objectiveText());
      } else if (this.step === 1 && G.police.wanted === 0) {
        this.step = 2; G.city.setBeacon(S.mara.x, S.mara.z);
        G.hud.setObjective(this.objectiveText());
      } else if (this.step === 2 && dist2d(px, pz, S.mara.x, S.mara.z) < 10) this.completeMission(G);
    } else if (this.index === 2) {
      if (this.step === 0 && this.enemies.every(e => e.dead) && !this.briefcase) { /* waiting for pickup handled above */ }
      else if (this.step === 0 && this.enemies.every(e => e.dead) && this.briefcase && !this.briefcase.taken) {
        G.city.setBeacon(this.briefcase.x, this.briefcase.z);
      }
      if (this.step === 2 && dist2d(px, pz, S.mara.x, S.mara.z) < 10) this.completeMission(G);
    } else if (this.index === 3) {
      this.timer -= dt;
      G.hud.setTimer(this.timer);
      if (this.timer <= 0) { this.failMission(G, 'Out of time. The safehouse went cold.'); return; }
      if (this.step === 0 && G.player.inCar) this.step = 1;
      if (dist2d(px, pz, S.safehouse.x, S.safehouse.z) < 9) { G.hud.setTimer(0); this.completeMission(G); }
    } else if (this.index === 4) {
      if (this.step === 1 && dist2d(px, pz, S.mara.x, S.mara.z) < 10) this.completeMission(G);
    }
  }
}
