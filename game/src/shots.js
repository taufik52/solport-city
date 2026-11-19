// SOLPORT deterministic screenshot staging (?shot=<name>).
// Each mode stages a real gameplay moment on a ROAD (never inside a block),
// with the camera looking down the street so the city, traffic and systems
// all read in one frame. Banners are hidden for the capture; the HUD
// (stars, objective, minimap, speedometer) stays visible.
import { makeCarMesh } from './vehicles.js';

function hideBanner(G) {
  G.hud._bannerT = 0;
  G.hud.bannerEl.classList.add('hidden');
}
function stageTraffic(G, spots) {
  // Park a few AI cars on the same road, ahead of the player, for life.
  spots.forEach(([x, z, yaw], i) => {
    const c = G.traffic.cars[i % G.traffic.cars.length];
    c.x = x; c.z = z; c.yaw = yaw; c.target = { x: x + 60, z };
    c.mesh.position.set(x, 0, z); c.mesh.rotation.y = yaw;
  });
}
function stagePeds(G, spots) {
  spots.forEach(([x, z], i) => {
    const p = G.peds.list[i % G.peds.list.length];
    p.x = x; p.z = z; p.fleeing = 0;
    p.mesh.position.set(x, 0, z);
  });
}

export function applyShot(G, name) {
  const P = G.player;
  const placeInCar = (x, z, yaw, speed) => {
    const mesh = makeCarMesh(0xffd23f); G.scene.add(mesh);
    const car = { mesh, x, z, yaw, speed, name: 'Comet GT' };
    mesh.position.set(x, 0, z); mesh.rotation.y = yaw;
    G.parkedCars.push(car);
    P.inCar = true; P.car = car; P.mesh.visible = false;
    P.x = x; P.z = z; P.yaw = yaw;
    return car;
  };
  if (name === 'chase') {
    // COVER: Comet GT eastbound on the z=22 road, 3 wanted stars, cruisers
    // flanking ahead in frame, traffic ahead, minimap + speedometer live.
    G.missions.start(G, 1); G.missions.step = 1;
    placeInCar(-110, 22, Math.PI / 2, 26);
    G.police.setWanted(3);
    G.police.cars.forEach((c, i) => {
      c.spawned = true;
      // Ahead of the player, offset to either side of the road — in frame.
      c.x = -84 + i * 8; c.z = 22 + (i % 2 === 0 ? -4 : 5);
      c.yaw = Math.PI / 2;
      c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.yaw;
    });
    stageTraffic(G, [[-60, 22, Math.PI / 2], [-40, 18, Math.PI / 2]]);
    G.hud.setObjective('Lose the cops!');
  } else if (name === 'mission') {
    // Dock shootout: player on foot 15 m from the Harbor Kings, facing them,
    // briefcase beacon behind the gang, 2 stars, objective marker visible.
    G.missions.start(G, 2);
    P.x = 140; P.z = 150; P.yaw = 0.9; P.camYaw = 0.9;
    P.mesh.position.set(P.x, 0, P.z);
    P.weapon = 'pistol';
    G.police.setWanted(2);
    G.hud.setObjective('Clear the dock and grab the briefcase');
  } else if (name === 'city') {
    // On foot at the Marina Bay intersection, facing west down the street:
    // skyline, palms, beach and water ahead, traffic and peds in frame.
    P.x = -154; P.z = -22; P.yaw = -Math.PI / 2; P.camYaw = -Math.PI / 2;
    P.mesh.position.set(P.x, 0, P.z);
    stageTraffic(G, [[-132, -22, -Math.PI / 2], [-110, -18, -Math.PI / 2]]);
    stagePeds(G, [[-170, -12], [-168, -32], [-182, -20]]);
    G.missions.start(G, 0);
    G.hud.setObjective('Drive the package to the Old Town drop-off');
  } else if (name === 'drive') {
    // Coastal highway at sunset, eastbound on the wide z=-66 road:
    // street + skyline ahead, traffic in front, speedometer up.
    const sun = G.city.sun;
    sun.position.set(-260, 55, -80);
    G.scene.background.set(0xe8a35c);
    G.scene.fog.color.set(0xe8a35c);
    placeInCar(-154, -66, Math.PI / 2, 34);
    stageTraffic(G, [[-110, -66, Math.PI / 2], [-88, -62, Math.PI / 2], [-66, -70, Math.PI / 2]]);
    G.hud.setObjective('Cruise the coastal highway');
  }
  hideBanner(G);
  G.time = 1.2;
}
