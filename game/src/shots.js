// SOLPORT — shots.js (retry session, 19 Nov 2026)
// Deterministic ?shot= staging for the four screenshots. Each mode places
// the player, cars, wanted level and mission text, fixes the camera, and
// freezes gameplay so the render is identical on every run.
//   ?shot=chase   — Comet GT chase, 3 stars, 2 police cars, "Lose the cops!"
//   ?shot=mission — dock shootout, muzzle flash, gang, 2 stars
//   ?shot=city    — on foot in Marina Bay, skyline + palms + water
//   ?shot=drive   — coastal highway speed, sunset, speedometer

import * as THREE from 'three';
import { createCarMesh, makePlayerCar } from './vehicles.js';
import { makePersonMesh } from './pedestrians.js';
import { setTimeOfDay } from './city.js';

export const SHOT_NAMES = ['chase', 'mission', 'city', 'drive'];

export function applyShot(S, name) {
  S.shotMode = name;
  S.frozen = true;
  const scene = S.scene;
  // Clear traffic near the staged area for a clean frame.
  S.traffic.cars.forEach((c) => { c.mesh.visible = false; });
  S.peds.list.forEach((p) => { p.mesh.visible = false; });

  if (name === 'chase') {
    S.wanted = 3;
    S.player.onFoot = false;
    if (S.car) scene.remove(S.car.mesh);
    // On the road z = 0 (a real grid road), Comet heading east, camera
    // behind it ON the same road so no tower fills the frame.
    S.car = makePlayerCar(scene, -40, 0, 0xe8c832, true);
    S.car.angle = Math.PI / 2; S.car.speed = 26;
    S.car.mesh.rotation.y = S.car.angle;
    S.player.mesh.visible = false;
    S.player.x = S.car.x; S.player.z = S.car.z;
    S.missions.index = 1; S.missions.step = 1;
    S.missions.objective = { x: -20, z: 100, label: 'Lose the cops — reach the Spray Shop' };
    S.city.beacon.visible = true;
    S.city.beacon.position.set(-20, 0, 100);
    S.police.sync(scene, 3, S.car.x, S.car.z);
    // Police flank the Comet from behind, on the road.
    S.police.cars.forEach((c, i) => {
      c.x = S.car.x - 11 - i * 6; c.z = S.car.z + (i ? -3 : 3);
      c.angle = Math.PI / 2;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.angle;
    });
    // A little traffic ahead for the chase feel.
    S.traffic.cars.slice(0, 3).forEach((c, i) => {
      c.mesh.visible = true;
      c.axis = 'x'; c.line = 0; c.along = 12 + i * 24; c.dir = 1;
      c.mesh.position.set(c.along, 0, 0); c.mesh.rotation.y = Math.PI / 2;
    });
    S.camera.position.set(S.car.x - 24, 8, S.car.z);
    S.camera.lookAt(S.car.x + 22, 1.5, S.car.z + 1);
    S.hud.banner('HOT WHEELS', 'Lose the cops!', 999);
  }

  if (name === 'mission') {
    S.wanted = 2;
    S.player.onFoot = true;
    S.player.mesh.visible = true;
    // Stage on the open road z = 120 east of the Portside intersection,
    // camera ON the same road so no tower blocks the view.
    S.player.x = 104; S.player.z = 120; S.player.angle = Math.PI * 0.5;
    S.player.mesh.position.set(104, 0, 120);
    S.player.weapon = 'pistol';
    S.missions.index = 2; S.missions.step = 0;
    S.missions.objective = { x: 132, z: 120, label: 'Take out the Harbor Kings at the docks' };
    S.city.beacon.visible = true;
    S.city.beacon.position.set(132, 0, 120);
    const gangSpots = [[126, 123], [132, 117], [138, 124], [128, 117]];
    for (let i = 0; i < 4; i++) {
      const mesh = makePersonMesh(0x8a2a2a, 0xd9a077);
      const [gx, gz] = gangSpots[i];
      mesh.position.set(gx, 0, gz);
      mesh.rotation.y = Math.atan2(S.player.x - gx, S.player.z - gz);
      scene.add(mesh);
      S.missions.gang.push({ mesh, x: gx, z: gz, hp: 60 });
    }
    // Persistent tracer + muzzle flash (the fading combat effects would be
    // gone by screenshot time, so stage these as plain scene objects).
    const from = new THREE.Vector3(S.player.x, 1.5, S.player.z);
    const to = new THREE.Vector3(132, 1.4, 120);
    const tracerGeo = new THREE.BufferGeometry().setFromPoints([from, to]);
    scene.add(new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a0 })));
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdf6a })
    );
    flash.position.copy(from).add(new THREE.Vector3(0.6, 0.1, 0.6));
    scene.add(flash);
    S.camera.position.set(94, 6, 120);
    S.camera.lookAt(132, 1.5, 120);
    S.hud.banner('DOCKSIDE DEAL', 'Take out the Harbor Kings!', 999);
  }

  if (name === 'city') {
    S.wanted = 0;
    S.player.onFoot = true;
    S.player.mesh.visible = true;
    S.player.x = -150; S.player.z = -30; S.player.angle = Math.PI * 0.5;
    S.player.mesh.position.set(-150, 0, -30);
    S.missions.index = 0; S.missions.step = 0;
    S.missions.objective = { x: -140, z: -60, label: 'Pick up the package at Marina Bay' };
    S.city.beacon.visible = true;
    S.city.beacon.position.set(-140, 0, -60);
    // Pedestrians strolling the marina + traffic on the coastal road.
    S.peds.list.slice(0, 8).forEach((p, i) => {
      p.mesh.visible = true;
      p.x = -170 + (i % 4) * 8; p.z = -50 + Math.floor(i / 4) * 14;
      p.mesh.position.set(p.x, 0, p.z);
    });
    S.traffic.cars.slice(0, 4).forEach((c, i) => {
      c.mesh.visible = true;
      c.axis = 'z'; c.line = -160; c.along = -60 + i * 30; c.dir = 1;
      c.mesh.position.set(-160, 0, c.along); c.mesh.rotation.y = 0;
    });
    S.camera.position.set(-168, 9, -62);
    S.camera.lookAt(-110, 4, -10);
    S.hud.banner('MARINA BAY', 'Solport — where the sun never clocks out', 999);
  }

  if (name === 'drive') {
    S.wanted = 0;
    S.player.onFoot = false;
    if (S.car) scene.remove(S.car.mesh);
    // Coastal highway: the beach road (x = -160) heading north, water and
    // palms on the left, sunset ahead — no tower blocks the road here.
    S.car = makePlayerCar(scene, -160, 0, 0xc23b2e, false);
    S.car.angle = 0; S.car.speed = 34;
    S.car.mesh.rotation.y = S.car.angle;
    S.player.mesh.visible = false;
    S.player.x = S.car.x; S.player.z = S.car.z;
    S.missions.index = 3; S.missions.step = 0;
    S.missions.objective = { x: 120, z: -140, label: 'Reach the Northside safehouse in time' };
    S.city.beacon.visible = true;
    S.city.beacon.position.set(120, 0, -140);
    S.traffic.cars.slice(0, 4).forEach((c, i) => {
      c.mesh.visible = true;
      c.axis = 'z'; c.line = -160; c.along = 34 + i * 26; c.dir = 1;
      c.mesh.position.set(-160, 0, c.along); c.mesh.rotation.y = 0;
    });
    setTimeOfDay(scene, S.city.sun, 'sunset');
    // A parked convertible watching the sunset from the beach side,
    // so the highway is not empty in the foreground.
    const parked = createCarMesh(0xe07b39, { sport: true });
    parked.position.set(-172, 0, 34);
    parked.rotation.y = Math.PI / 2;
    scene.add(parked);
    S.camera.position.set(-160, 7, -24);
    S.camera.lookAt(-160, 2, 40);
    S.hud.banner('COASTAL HIGHWAY', 'Sunset run — 109 mph', 999);
  }

  // Screenshots read better without the big centre banner covering the
  // scene; the mission stays visible in the objective line (bottom-left).
  S.hud.el.banner.classList.add('hidden');
  // Objective text + HUD refresh for the staged state.
  S.hud.update(0, S);
}
