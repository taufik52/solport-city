// SOLPORT — shared tuning constants. Original fictional city, no Rockstar content.
export const CFG = {
  world: { half: 220, roadSpacing: 44, roadHalf: 5 },
  player: { walkSpeed: 7, runSpeed: 11, hp: 100, punchDmg: 12, pistolDmg: 34, smgDmg: 18 },
  car: { accel: 22, reverseAccel: 14, maxSpeed: 42, maxReverse: 12, steer: 1.9, grip: 6, brake: 30 },
  traffic: { count: 14, speed: 9 },
  peds: { count: 20, speed: 1.6 },
  police: { maxCars: 4, chaseSpeed: 15, bustTime: 3, decayDelay: 12 },
  wanted: { stealCar: 1, killPed: 1, killCop: 2, shootNearCop: 1, max: 5 },
  economy: { taxiFare: 45, packageReward: 60, deliveryReward: 120, sprayCost: 150, hospitalLoss: 0.15 },
  missions: [
    { id: 1, name: 'First Pickup', intro: 'Mara Voss needs a package moved across town. Take the Comet parked outside and drive it to the Old Town drop-off. Keep it clean — the Solport PD is watching.', objective: 'Drive the package to the Old Town drop-off' },
    { id: 2, name: 'Hot Wheels', intro: 'The Harbor Kings parked a Comet GT in the Northside lot. Take it. When the sirens start, lose them before you bring it to Mara.', objective: 'Steal the Comet GT, then lose the cops' },
    { id: 3, name: 'Dockside Deal', intro: 'The Harbor Kings are moving product through Portside. Go in on foot, clear the dock, and grab the briefcase.', objective: 'Clear the dock and grab the briefcase' },
    { id: 4, name: 'Getaway', intro: 'Three stars and a city full of roadblocks. Drive the briefcase to the Marina safehouse before the timer runs out.', objective: 'Reach the Marina safehouse in time' },
    { id: 5, name: 'The Big One', intro: 'The Solport Reserve transport rolls down the coastal highway at dusk. Intercept it, take the haul, and deliver it to Mara. Four stars. No mistakes.', objective: 'Intercept the transport and deliver the haul' },
  ],
  districts: [
    { name: 'Marina Bay', x: [-220, -130], z: [-220, 220], color: 0x2e7f8f },
    { name: 'Old Town', x: [-130, -20], z: [-60, 120], color: 0xb08a4f },
    { name: 'Northside', x: [-130, 60], z: [-220, -60], color: 0x6f9e5a },
    { name: 'Portside', x: [60, 220], z: [60, 220], color: 0x8a6f5a },
    { name: 'The Strip', x: [-20, 220], z: [-220, 60], color: 0x9e5a8a },
  ],
  sunPackages: 10,
  startCash: 120,
};
export const DISTRICT_NAMES = CFG.districts.map(d => d.name);
