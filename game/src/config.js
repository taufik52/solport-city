// SOLPORT — config.js (retry session, 19 Nov 2026)
// Central tuning + world layout + mission data for the open-world crime game.
// Nothing here references Rockstar/GTA: Solport, Jax Marlowe and Mara Voss
// are original names created for this entry.

export const CONFIG = {
  title: 'SOLPORT',
  saveKey: 'solport-save-v1',
  // City layout: road grid, step 40, roads at -160..160 on both axes.
  roadStep: 40,
  roadHalf: 160,
  roadWidth: 10,
  blockSize: 30,
  groundHalf: 200,
  // Player
  walkSpeed: 7,
  runSpeed: 11,
  playerHp: 100,
  startCash: 250,
  // Driving
  carAccel: 22,
  carBrake: 34,
  carMaxSpeed: 38,
  carReverseMax: 12,
  carTurn: 1.9,
  // Combat
  pistolDamage: 34,
  smgDamage: 20,
  pistolRange: 70,
  // Wanted
  wantedDecayDelay: 6, // seconds out of sight before a star decays
  sprayCost: 125,
  hospitalCost: 200,
  bailCost: 150,
  // World population
  trafficCount: 16,
  pedCount: 24,
  maxPoliceCars: 5,
};

export const DISTRICTS = [
  { name: 'Marina Bay', x: -160, z: -40, note: 'waterfront, yachts, palms' },
  { name: 'Old Town', x: -40, z: -120, note: 'narrow streets' },
  { name: 'Northside', x: 80, z: -120, note: 'residential' },
  { name: 'Portside', x: 120, z: 120, note: 'docks and warehouses' },
  { name: 'The Strip', x: -40, z: 80, note: 'neon downtown' },
];

// Mission chain. Each mission is a list of steps; a step completes by
// reaching its marker, killing its targets, or a timer, then advances.
export const MISSIONS = [
  {
    id: 1,
    name: 'First Pickup',
    intro: "Mara Voss needs a package moved across town. No questions, Jax. Drive it like you own the road.",
    steps: [
      { kind: 'goto', label: 'Pick up the package at Marina Bay', pos: [-140, -60] },
      { kind: 'goto', label: 'Deliver the package to Old Town', pos: [-60, -140], reward: 400 },
    ],
  },
  {
    id: 2,
    name: 'Hot Wheels',
    intro: 'A Comet GT is sitting in the Northside lot. Take it — and lose the cops before they box you in.',
    steps: [
      { kind: 'steal', label: 'Steal the Comet GT from the Northside lot', pos: [100, -100], reward: 300 },
      { kind: 'clear', label: 'Lose the cops — reach the Spray Shop', pos: [-20, 100], reward: 350 },
    ],
  },
  {
    id: 3,
    name: 'Dockside Deal',
    intro: 'The Harbor Kings are moving product at Portside. Crash the deal, take the briefcase.',
    steps: [
      // One step that becomes a two-leg delivery once the gang is down:
      // grab the briefcase at the docks, then bring it to Mara.
      { kind: 'fight', label: 'Take out the Harbor Kings at the docks', pos: [140, 140], gang: 4, reward: 1100 },
    ],
  },
  {
    id: 4,
    name: 'Getaway',
    intro: 'Three stars, roadblocks everywhere. Get to the safehouse before the timer runs out.',
    steps: [
      { kind: 'timed', label: 'Reach the Northside safehouse in time', pos: [120, -140], seconds: 90, wanted: 3, reward: 800 },
    ],
  },
  {
    id: 5,
    name: 'The Big One',
    intro: 'The Solport Reserve transport is rolling down the coastal highway. Stop it, take the haul, bring it home.',
    steps: [
      { kind: 'intercept', label: 'Stop the Reserve transport on the highway', pos: [-160, 20], reward: 1000 },
      { kind: 'goto', label: 'Deliver the haul to Mara Voss', pos: [-40, 60], reward: 1500 },
    ],
  },
];

export const SUN_PACKAGES = [
  [-150, -20], [-100, 140], [-20, -160], [60, -60], [100, 60],
  [140, -100], [-140, 100], [20, 140], [160, 20], [-60, 20],
];

export const SPRAY_SHOP = [-20, 100];
export const HOSPITAL = [60, 160];
export const MARA_HOME = [-40, 60];

export const WEAPONS = {
  fists: { name: 'Fists', damage: 15, range: 2.5, auto: false },
  pistol: { name: 'Pistol', damage: 34, range: 70, auto: false, ammo: 24 },
  smg: { name: 'SMG', damage: 20, range: 55, auto: true, ammo: 90 },
};
