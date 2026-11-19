// SOLPORT — boot, game loop, camera, menus, death/bust flow and save wiring.
// Jax Marlowe, driver for fixer Mara Voss, in the fictional coastal city Solport.
import * as THREE from 'three';
import { CFG } from './config.js';
import { mulberry32, pick } from './utils.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { buildCity } from './city.js';
import { Traffic, makeCarMesh } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { makePlayerMesh, updatePlayer } from './player.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 1337);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

const G = {
  cfg: CFG, scene, camera, renderer,
  state: 'menu', // menu | playing | paused | wasted | busted
  time: 0, hasSave: false, shotsFiredAt: null,
  stats: { kills: 0, missions: 0, fares: 0, packages: 0 },
  sunCollected: new Set(), parkedCars: [], pickups: [],
};
G.audio = new AudioSys();
G.input = new Input(renderer.domElement);
G.city = buildCity(scene, SEED);
G.traffic = new Traffic(scene, G.city, CFG.traffic.count);
G.peds = new Pedestrians(scene, G.city, CFG.peds.count);
G.police = new Police(scene, G.city);
G.missions = new Missions(scene, G.city);
G.hud = new HUD(G);

// Player.
G.player = {
  mesh: makePlayerMesh(), x: G.city.spots.start.x, z: G.city.spots.start.z,
  yaw: 0, camYaw: Math.PI, camPitch: 0.32, hp: 100, cash: CFG.startCash,
  respect: 0, weapon: 'pistol', ammo: 0, inCar: false, car: null, lastShot: 0,
};
scene.add(G.player.mesh);
G.player.mesh.position.set(G.player.x, 0, G.player.z);

// Parked civilian cars (stealable — stealing one is a crime).
{
  const rng = mulberry32(99);
  const spots = [[-110, 26], [22, -62], [110, 114], [-22, -110], [154, 26]];
  const colors = [0xc0392b, 0x2980b9, 0xe6c34a, 0x7f8c8d, 0x27ae60];
  spots.forEach(([x, z], i) => {
    const mesh = makeCarMesh(colors[i]); scene.add(mesh);
    const car = { mesh, x, z, yaw: rng() * Math.PI * 2, speed: 0, name: 'Sedan' };
    mesh.position.set(x, 0, z); mesh.rotation.y = car.yaw;
    G.parkedCars.push(car);
  });
}

// Health packs: green crosses at hospital, Mara's, dock, safehouse.
for (const [x, z] of [[154, -146], [-168, 58], [168, 168], [-168, -146]]) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  g.add(box);
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.1), new THREE.MeshBasicMaterial({ color: 0x27ae60 }));
  c1.position.z = 0.62; g.add(c1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.1), new THREE.MeshBasicMaterial({ color: 0x27ae60 }));
  c2.position.z = 0.62; g.add(c2);
  g.position.set(x, 0.8, z); scene.add(g);
  G.pickups.push({ mesh: g, x, z, taken: false });
}

// Taxi fares: a waiting pedestrian + green destination beacon.
G.taxi = {
  x: -110, z: 30, dx: 66, dz: 66, active: false,
  marker: new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 40, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })),
  respawn() {
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const a = pick(rng, G.city.intersections), b = pick(rng, G.city.intersections);
    this.x = a.x + 8; this.z = a.z; this.dx = b.x; this.dz = b.z;
    this.marker.position.set(this.dx, 20, this.dz);
  },
};
G.taxi.marker.position.set(G.taxi.dx, 20, G.taxi.dz);
G.taxi.marker.visible = false;
scene.add(G.taxi.marker);

// --- Flow ---------------------------------------------------------------
G.hasSave = !!loadSave();
function applyLoadedSave(s) {
  G.player.cash = s.cash ?? CFG.startCash;
  G.player.respect = s.respect ?? 0;
  G.stats = { ...G.stats, ...(s.stats || {}) };
  G.player.weapon = s.weapon || 'pistol';
  (s.packages || []).forEach(i => {
    const p = G.city.packages[i];
    if (p) { p.taken = true; p.mesh.visible = false; G.sunCollected.add(i); }
  });
  return s.mission ?? 0;
}
G.startGame = (cont) => {
  G.audio.ensure();
  G.state = 'playing';
  G.hud.hideMenu();
  const s = cont ? loadSave() : null;
  const missionIdx = s ? applyLoadedSave(s) : 0;
  G.missions.start(G, missionIdx);
  G.hud.setObjective(G.missions.objectiveText());
  G.hud.banner('SOLPORT', G.city.districtAt(G.player.x, G.player.z) + ' — ' + G.missions.objectiveText());
};
G.resumeGame = () => { G.state = 'playing'; G.hud.hideMenu(); };
G.restartGame = () => {
  clearSave();
  G.player.hp = 100; G.player.cash = CFG.startCash; G.player.respect = 0;
  G.player.weapon = 'pistol'; G.player.x = G.city.spots.start.x; G.player.z = G.city.spots.start.z;
  G.stats = { kills: 0, missions: 0, fares: 0, packages: 0 };
  G.police.clearWanted(true);
  G.missions.start(G, 0);
  G.state = 'playing'; G.hud.hideMenu();
  G.hud.setObjective(G.missions.objectiveText());
};
G.toMenu = () => { G.state = 'menu'; G.showStartMenu(); };
G.showStartMenu = () => {
  G.hud.showMenu('start', 'SOLPORT', `
    <p class="story">Solport. Sun, salt air, and everybody owes somebody. Jax Marlowe came back to drive
    for fixer <b>Mara Voss</b> — five jobs, one city, and the Harbor Kings in the way.</p>
    <p><b>WASD</b> move / drive &nbsp;•&nbsp; <b>Mouse</b> camera &nbsp;•&nbsp; <b>Shift</b> run &nbsp;•&nbsp;
    <b>E</b> enter / exit car &nbsp;•&nbsp; <b>Click</b> shoot &nbsp;•&nbsp; <b>F</b> punch &nbsp;•&nbsp;
    <b>Space</b> handbrake &nbsp;•&nbsp; <b>Esc</b> pause &nbsp;•&nbsp; <b>M</b> mute</p>
    <p class="dim">Steal cars, dodge the PD, run taxi fares, find 10 sun-packages. An original game —
    no Rockstar content, all art / sound / story made for this entry.</p>`);
};
G.wasted = () => {
  if (G.state !== 'playing') return;
  G.state = 'wasted'; G.audio.fail();
  const lost = Math.round(G.player.cash * CFG.economy.hospitalLoss);
  G.player.cash -= lost;
  G.player.hp = 100; G.player.x = G.city.spots.hospital.x; G.player.z = G.city.spots.hospital.z;
  G.player.inCar = false; G.player.car = null; G.player.mesh.visible = true;
  G.police.clearWanted(true);
  G.hud.showMenu('end', 'WASTED', `<p>You woke up at Solport General. The hospital took $${lost}.</p><p>Cash: $${G.player.cash} — Missions: ${G.stats.missions}/5</p>`);
};
G.busted = () => {
  if (G.state !== 'playing') return;
  G.state = 'busted'; G.audio.fail();
  const fine = Math.min(200, Math.round(G.player.cash * 0.1));
  G.player.cash -= fine;
  G.player.hp = 100; G.player.x = G.city.spots.hospital.x; G.player.z = G.city.spots.hospital.z;
  G.player.inCar = false; G.player.car = null; G.player.mesh.visible = true;
  G.police.clearWanted(true);
  G.hud.showMenu('end', 'BUSTED', `<p>The PD booked you and took a $${fine} fine.</p><p>Cash: $${G.player.cash} — Missions: ${G.stats.missions}/5</p>`);
};

// Pause / mute keys.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (G.state === 'playing') { G.state = 'paused'; G.hud.showMenu('pause', 'PAUSED', `<p>Mission ${Math.min(G.missions.index + 1, 5)}/5 — ${G.missions.def ? G.missions.def.name : 'Free roam'}</p><p>Cash $${G.player.cash} • Respect ${G.player.respect} • Kills ${G.stats.kills}</p>`); }
    else if (G.state === 'paused') G.resumeGame();
  }
  if (e.code === 'KeyM') { const m = G.audio.toggleMute(); G.hud.setPrompt(m ? 'Muted (M to unmute)' : ''); }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Camera: third-person orbit, behind the car when driving. ----------
function updateCamera(dt) {
  const P = G.player;
  const dist = P.inCar ? 11.5 : 8;
  const height = P.inCar ? 4.2 : 3.4;
  const yaw = P.inCar ? P.car.yaw : P.camYaw;
  // The camera sits behind the facing direction (car heading, or mouse orbit on foot).
  const tx = P.x - Math.sin(yaw) * dist;
  const tz = P.z - Math.cos(yaw) * dist;
  const ty = height + P.camPitch * 6;
  if (G.shotMode) { camera.position.set(tx, ty, tz); } // snap: no settle time in captures
  else {
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 6);
    camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 6);
  }
  camera.lookAt(P.x, P.inCar ? 1.6 : 1.8, P.z);
}

// --- Main loop ----------------------------------------------------------
let last = performance.now(), saveT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.state === 'playing') {
    G.time += dt;
    updatePlayer(G, dt);
    G.traffic.update(G, dt);
    G.peds.update(G, dt);
    G.police.update(G, dt);
    G.missions.update(G, dt);
    G.city.update(dt, G.time);
    G.hud.update(dt);
    saveT += dt;
    if (saveT > 10) { saveT = 0; writeSave(G); }
  }
  updateCamera(dt);
  renderer.render(scene, camera);
  G.input.endFrame();
  if (G.shotsFiredAt) G.shotsFiredAt = null;
}

// Debug handle for play-testing (harmless in the shipped game).
window.__G = G;

// --- Boot ---------------------------------------------------------------
G.showStartMenu();
if (SHOT) {
  // Deterministic screenshot staging: skip the menu, stage the scene.
  G.shotMode = true;
  G.startGame(false);
  applyShot(G, SHOT);
  G.hud.hideMenu();
}
requestAnimationFrame(loop);
