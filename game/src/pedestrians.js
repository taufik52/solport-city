// SOLPORT — pedestrians.js (retry session, 19 Nov 2026)
// Sidewalk walkers: capsule people strolling the blocks, fleeing gunfire
// and near-misses, plus taxi-fare pickups (walk to a waving ped, earn cash).

import * as THREE from 'three';
import { mulberry32, clamp } from './utils.js';
import { CONFIG } from './config.js';

const SHIRTS = [0xd94f4f, 0x4f7dd9, 0x4fd97a, 0xd9c24f, 0x9a4fd9, 0xe8e8e8, 0x333333];

function makePersonMesh(shirt, skin = 0xd9a077) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2c3240, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 8), shirtMat);
  body.position.y = 1.05; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skinMat);
  head.position.y = 1.85; head.castShadow = true;
  g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.3), pantsMat);
  legs.position.y = 0.28;
  g.add(legs);
  return g;
}

export class Pedestrians {
  constructor(scene) {
    this.rng = mulberry32(777);
    this.list = [];
    for (let i = 0; i < CONFIG.pedCount; i++) {
      const mesh = makePersonMesh(SHIRTS[i % SHIRTS.length]);
      scene.add(mesh);
      const p = {
        mesh, x: 0, z: 0, angle: this.rng() * Math.PI * 2,
        speed: 1 + this.rng() * 1.2, flee: 0, fare: false,
      };
      this._placeRandom(p);
      this.list.push(p);
    }
    // One fare customer waves near the Strip.
    this.fare = this.list[0];
    this.fare.fare = true;
    this.fare.x = -30; this.fare.z = 70;
  }

  _placeRandom(p) {
    // Sidewalk: just off a road line, inside a block edge.
    const road = (Math.floor(this.rng() * 9) - 4) * CONFIG.roadStep;
    const along = (this.rng() * 2 - 1) * 150;
    if (this.rng() < 0.5) { p.x = along; p.z = road + 7; }
    else { p.x = road + 7; p.z = along; }
    p.mesh.position.set(p.x, 0, p.z);
  }

  scare(x, z, radius = 18) {
    for (const p of this.list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) {
        p.flee = 3;
        p.angle = Math.atan2(p.x - x, p.z - z);
      }
    }
  }

  update(dt) {
    for (const p of this.list) {
      if (p.flee > 0) {
        p.flee -= dt;
        p.speed = 5;
      } else {
        p.speed = p.fare ? 0 : 1.4;
      }
      if (p.fare) {
        // Wave: bob the arm-less body gently so the fare is visible.
        p.mesh.position.y = Math.abs(Math.sin(performance.now() / 300)) * 0.15;
        continue;
      }
      p.x += Math.sin(p.angle) * p.speed * dt;
      p.z += Math.cos(p.angle) * p.speed * dt;
      if (Math.abs(p.x) > 190 || Math.abs(p.z) > 190 || this.rng() < dt * 0.02) {
        p.angle = this.rng() * Math.PI * 2;
        p.x = clamp(p.x, -190, 190); p.z = clamp(p.z, -190, 190);
      }
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.angle;
    }
  }

  // Fare customer picked up: teleport them into a new fare spot, pay out.
  completeFare() {
    const p = this.fare;
    p.fare = false;
    const next = this.list[(this.list.indexOf(p) + 5) % this.list.length];
    next.fare = true;
    this.fare = next;
    next.x = (Math.floor(this.rng() * 9) - 4) * CONFIG.roadStep + 7;
    next.z = (Math.floor(this.rng() * 9) - 4) * CONFIG.roadStep;
    next.mesh.position.set(next.x, 0, next.z);
  }
}

export { makePersonMesh };
