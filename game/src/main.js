// SOLPORT — main.js (retry session, 19 Nov 2026)
// Boot + game loop + state machine for the open-world crime game.
// Menu -> playing -> paused / wasted / busted; ?shot= stages a frozen
// deterministic scene for screenshots instead of playing.

import * as THREE from 'three';
import { CONFIG, SUN_PACKAGES, HOSPITAL } from './config.js';
import { buildCity } from './city.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Traffic, makePlayerCar, updatePlayerCar } from './vehicles.js';
import { Weather } from './weather.js';
import { CarRadio } from './radio.js';
import { StuntTracker } from './stunts.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { createPlayer, updateOnFoot, tryEnterExit, shoot, punch } from './player.js';
import { applyShot, SHOT_NAMES } from './shots.js';
import { loadSave, writeSave, clearSave, defaultSave } from './save.js';
import { dist2 } from './utils.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(-30, 12, -30);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Shared state (S) passed to every module ----
const S = {
  scene, camera, renderer,
  input: new Input(canvas),
  audio: new AudioSys(),
  hud: null, city: null, traffic: null, peds: null, police: null, missions: null,
  weather: null, radio: null, stunts: null,
  player: null, car: null,
  cash: CONFIG.startCash, wanted: 0,
  saveData: loadSave() || defaultSave(),
  packageSpots: SUN_PACKAGES,
  mode: 'menu', // menu | playing | paused | wasted | busted
  frozen: false, shotMode: null, busted: false,
  district: null, // last flashed district name (city.districtAt)
  time: 0, saveTimer: 0,
  effects: [], // {mesh|light, ttl}
  packageMeshes: [], healthMeshes: [], weaponMeshes: [],
};
S.hud = new HUD();
S.banner = (t, s, sec) => S.hud.banner(t, s, sec);
S.hudFlash = (t) => S.hud.flash(t);

// Collision: circle vs building AABBs.
S.collide = (x, z, r) => {
  for (const b of S.city.colliders) {
    if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true;
  }
  return false;
};

// Hitscan tracer + muzzle flash (faded out in the loop).
S.tracer = (from, to) => {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95 }));
  scene.add(line);
  S.effects.push({ obj: line, ttl: 0.12, max: 0.12, fade: true });
};
S.muzzle = (pos) => {
  const light = new THREE.PointLight(0xffc860, 60, 18);
  light.position.copy(pos);
  scene.add(light);
  S.effects.push({ obj: light, ttl: 0.09, max: 0.09, fade: false });
};

// ---- World ----
S.city = buildCity(scene);
S.traffic = new Traffic(scene);
S.peds = new Pedestrians(scene);
S.police = new Police(scene);
S.missions = new Missions(scene);
S.weather = new Weather(scene);
S.radio = new CarRadio();
S.stunts = new StuntTracker();
S.player = createPlayer(scene, -140, -40);
S.player.hp = CONFIG.playerHp;
S.player.weapon = S.saveData.weapon || 'pistol';
S.player.ammo = { ...S.player.ammo, ...(S.saveData.ammo || {}) };
S.cash = S.saveData.cash;
S.car = makePlayerCar(scene, -137, -38, 0xc23b2e, false);

// Sun-package meshes (collected ones stay hidden).
{
  const geo = new THREE.SphereGeometry(0.9, 12, 10);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd23c, emissive: 0xffb300, emissiveIntensity: 1.6 });
  for (const [x, z] of SUN_PACKAGES) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 1.2, z);
    scene.add(m);
    S.packageMeshes.push({ mesh: m, x, z, key: `${x},${z}` });
    if (S.saveData.packages.includes(`${x},${z}`)) m.visible = false;
  }
}
// Health packs (green cross boxes) + weapon pickups.
function addPickup(x, z, kind) {
  const color = kind === 'health' ? 0x2ecc71 : 0x9a4fd9;
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.4, 1.4),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4 })
  );
  m.position.set(x, 0.9, z);
  scene.add(m);
  (kind === 'health' ? S.healthMeshes : S.weaponMeshes).push({ mesh: m, x, z, kind });
}
addPickup(60, 150, 'health'); addPickup(-120, 120, 'health'); addPickup(100, -140, 'health'); addPickup(-160, -100, 'health');
addPickup(140, 120, 'smg'); addPickup(-40, 90, 'smg');

// ---- Camera ----
function updateCamera(dt) {
  const p = S.player;
  if (S.shotMode) return; // shots fix the camera themselves
  if (!p.onFoot && S.car) {
    const a = S.car.angle;
    const tx = S.car.x - Math.sin(a) * 11;
    const tz = S.car.z - Math.cos(a) * 11;
    camera.position.lerp(new THREE.Vector3(tx, 4.5, tz), Math.min(1, dt * 5));
    camera.lookAt(S.car.x + Math.sin(a) * 6, 1.5, S.car.z + Math.cos(a) * 6);
  } else {
    p.camAngle += S.input.mouseDX * 0.005;
    p.camPitch = THREE.MathUtils.clamp(p.camPitch + S.input.mouseDY * 0.003, 0.05, 1.1);
    const dist = 8.5;
    const cx = p.x - Math.sin(p.camAngle) * Math.cos(p.camPitch) * dist;
    const cz = p.z - Math.cos(p.camAngle) * Math.cos(p.camPitch) * dist;
    const cy = 1.8 + Math.sin(p.camPitch) * dist;
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 8));
    camera.lookAt(p.x, 1.8, p.z);
  }
}

// ---- Death / bust ----
function respawn(reason) {
  S.player.hp = CONFIG.playerHp;
  S.wanted = 0;
  S.busted = false;
  S.saveTimer = 0;
  // Getting back on the streets with an empty pistol is a soft-lock:
  // Mara slips Jax a fresh mag with the hospital bill / bail.
  if ((S.player.ammo.pistol || 0) < 12) S.player.ammo.pistol = 12;
  S.police.clearAll(scene);
  S.player.x = HOSPITAL[0]; S.player.z = HOSPITAL[1];
  S.player.onFoot = true;
  S.player.mesh.visible = true;
  if (S.car) { scene.remove(S.car.mesh); S.car = null; }
  S.car = makePlayerCar(scene, HOSPITAL[0] + 6, HOSPITAL[1], 0xc23b2e, false);
  S.mode = 'playing';
  S.hud.hideEnd();
  S.banner(reason === 'wasted' ? 'WASTED' : 'BUSTED', reason === 'wasted' ? 'Mara paid the hospital bill.' : 'Mara posted your bail.', 4);
}
function die(reason) {
  if (S.mode !== 'playing') return;
  S.mode = reason;
  // Freeze the car so the WASTED/BUSTED screen does not sit over a crash.
  if (S.car) S.car.speed = 0;
  const cost = reason === 'wasted' ? CONFIG.hospitalCost : CONFIG.bailCost;
  S.cash = Math.max(0, S.cash - cost);
  if (reason === 'wasted') S.saveData.stats.deaths += 1;
  else S.saveData.stats.busted += 1;
  S.audio.fail();
  S.audio.siren(false);
  S.hud.showEnd(
    reason === 'wasted' ? 'WASTED' : 'BUSTED',
    `${reason === 'wasted' ? 'Hospital bill' : 'Bail'} -$${cost}. Cash $${S.cash}. Click to get back on the streets.`
  );
}

// ---- Pickups / fares ----
function updatePickups() {
  const p = S.player;
  for (const pkg of S.packageMeshes) {
    if (!pkg.mesh.visible) continue;
    pkg.mesh.rotation.y += 0.03;
    if (dist2(p.x, p.z, pkg.x, pkg.z) < 2.5) {
      pkg.mesh.visible = false;
      S.saveData.packages.push(pkg.key);
      S.cash += 100;
      S.hudFlash(`Sun-package found! +$100 (${S.saveData.packages.length}/10)`);
      S.audio.chime();
    }
  }
  for (const h of S.healthMeshes) {
    h.mesh.rotation.y += 0.02;
    if (dist2(p.x, p.z, h.x, h.z) < 2.5 && p.hp < CONFIG.playerHp) {
      p.hp = Math.min(CONFIG.playerHp, p.hp + 40);
      h.mesh.visible = false;
      setTimeout(() => { h.mesh.visible = true; }, 30000);
      S.hudFlash('Health +40');
      S.audio.chime();
    }
  }
  for (const w of S.weaponMeshes) {
    w.mesh.rotation.y += 0.02;
    if (dist2(p.x, p.z, w.x, w.z) < 2.5) {
      if (w.kind === 'smg') {
        p.weapon = 'smg';
        p.ammo.smg = (p.ammo.smg || 0) + 60;
        S.saveData.weapon = 'smg';
        S.hudFlash('Picked up the SMG!');
      }
      w.mesh.visible = false;
      setTimeout(() => { w.mesh.visible = true; }, 45000);
      S.audio.chime();
    }
  }
  // Taxi fare: drive up to the waving customer.
  if (!p.onFoot && S.car) {
    const f = S.peds.fare;
    if (dist2(S.car.x, S.car.z, f.x, f.z) < 6) {
      S.peds.completeFare();
      S.cash += 60;
      S.saveData.stats.fares += 1;
      S.hudFlash('Fare complete +$60');
      S.audio.chime();
    }
  }
}

// ---- Main loop ----
const clock = new THREE.Clock();
let firstFrame = true;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  S.time += dt;

  if (S.mode === 'playing' && !S.frozen) {
    // Edge-triggered keys.
    if (S.input.pressed('escape') || S.input.pressed('p')) {
      S.mode = 'paused';
      S.audio.siren(false); // sirens must not keep wailing over the pause screen
      S.audio.setEngine(0, false);
      S.hud.showPause(true);
    }
    if (S.input.pressed('m')) S.hudFlash(S.audio.toggleMute() ? 'Muted' : 'Sound on');
    if (S.input.pressed('r') && !S.player.onFoot) S.hudFlash(S.radio.nextStation());
    if (S.input.pressed('e')) tryEnterExit(S);
    if (S.input.pressed('f') && S.player.onFoot) punch(S);
    if (S.input.pressed('1')) { S.player.weapon = 'pistol'; S.saveData.weapon = 'pistol'; }
    if (S.input.pressed('2') && (S.player.ammo.smg || 0) > 0) { S.player.weapon = 'smg'; S.saveData.weapon = 'smg'; }
    if (S.input.clickQueued && S.player.onFoot && S.player.weapon !== 'fists') shoot(S);

    if (S.player.onFoot) updateOnFoot(S, dt);
    else if (S.car) updatePlayerCar(S.car, S.input, dt, S.collide, S.weather.gripFactor());

    S.traffic.update(dt, S.player);
    S.peds.update(dt);
    S.police.sync(scene, S.wanted, S.player.x, S.player.z);
    S.police.update(dt, S);
    S.missions.update(dt, S);
    updatePickups();

    // Weather, radio and stunts: each returns a HUD line when something
    // worth announcing happened (a storm rolling in, a new song, a payout).
    const wx = S.weather.update(dt, S);
    if (wx) S.hudFlash(wx);
    const tune = S.radio.update(dt, S);
    if (tune) S.hudFlash(tune);
    const stunt = S.stunts.update(dt, S);
    if (stunt) S.hudFlash(stunt);

    // Engine hum + siren follow state.
    S.audio.setEngine(S.car && !S.player.onFoot ? Math.abs(S.car.speed) / CONFIG.carMaxSpeed : 0, !S.player.onFoot);
    S.audio.siren(S.wanted > 0);

    // Beacon pulse + district signpost: the city announces each new
    // district the first time Jax crosses into it.
    S.city.pulseBeacon(S.time);
    const here = S.city.districtAt(S.player.x, S.player.z);
    if (here !== S.district) {
      S.district = here;
      S.hudFlash(`— ${here} —`);
    }

    // Death / bust.
    if (S.player.hp <= 0) die('wasted');
    else if (S.busted) { S.busted = false; die('busted'); }

    // Autosave.
    S.saveTimer += dt;
    if (S.saveTimer > 10) {
      S.saveTimer = 0;
      S.saveData.cash = S.cash;
      S.saveData.missionIndex = S.missions.index;
      S.saveData.ammo = S.player.ammo;
      writeSave(S.saveData);
    }
  }

  // The radio cuts out the moment play stops (pause / menu / wasted),
  // even though the rest of the loop keeps rendering the scene.
  S.radio.update(dt, S);

  // Fade tracer / muzzle effects.
  for (let i = S.effects.length - 1; i >= 0; i--) {
    const e = S.effects[i];
    e.ttl -= dt;
    if (e.fade && e.obj.material) e.obj.material.opacity = Math.max(0, e.ttl / e.max);
    if (e.ttl <= 0) {
      scene.remove(e.obj);
      if (e.obj.geometry) e.obj.geometry.dispose();
      S.effects.splice(i, 1);
    }
  }

  updateCamera(dt);
  S.hud.update(dt, S);
  S.input.endFrame();
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.SOLPORT_READY = true;
    document.getElementById('loading').classList.add('hidden');
  }
}

// ---- Menus ----
function startGame(fresh) {
  S.audio.ensure();
  if (fresh) {
    clearSave();
    S.saveData = defaultSave();
    S.cash = CONFIG.startCash;
    // A fresh run in the same page load must un-hide packages collected
    // in the previous run; boot-time visibility was set from the old save.
    for (const pkg of S.packageMeshes) pkg.mesh.visible = true;
    S.missions.reset();
    S.district = null;
    S.player.hp = CONFIG.playerHp;
    S.player.x = -140; S.player.z = -40;
    S.player.weapon = 'pistol'; S.player.ammo = { pistol: 24, smg: 0 };
    S.wanted = 0;
  } else {
    S.cash = S.saveData.cash;
    S.missions.restore(S.saveData.missionIndex || 0);
    S.player.weapon = S.saveData.weapon || 'pistol';
    S.player.ammo = { ...S.player.ammo, ...(S.saveData.ammo || {}) };
  }
  S.mode = 'playing';
  S.hud.hideMenu();
  S.hud.hideEnd();
  S.hud.showPause(false);
  S.missions.start(S);
}

document.getElementById('btn-new').addEventListener('click', () => { S.audio.ensure(); S.audio.uiClick(); startGame(true); });
document.getElementById('btn-continue').addEventListener('click', () => { S.audio.ensure(); S.audio.uiClick(); startGame(false); });
document.getElementById('btn-resume').addEventListener('click', () => {
  S.audio.uiClick();
  S.mode = 'playing';
  S.hud.showPause(false);
});
document.getElementById('end-btn').addEventListener('click', () => { S.audio.uiClick(); respawn(S.mode); });
document.getElementById('menu').addEventListener('click', (e) => {
  if (e.target.id === 'menu') S.audio.ensure();
});
// Continue button only makes sense with a save.
if (!loadSave()) document.getElementById('btn-continue').classList.add('hidden');

// ---- Shot mode: deterministic staged scene, no gameplay ----
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot && SHOT_NAMES.includes(shot)) {
  S.audio.ensure = () => {};
  S.mode = 'playing';
  S.hud.hideMenu();
  S.missions.index = 0;
  applyShot(S, shot);
}

tick();
