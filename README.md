# SOLPORT — open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/taufik52/solport-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/taufik52/solport-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game for make.fun **gta6-01 "Make GTA 6"**, built
in a desktop browser from static files — no network, no Rockstar content.
Everything (city, characters, story, art, sound) is original and made for
this entry. (Rebuilt fresh in the 19 Nov 2026 retry session after the first
submission attempt lost its recording receipt.)

**Solport** is a sun-soaked fictional coastal city. Jax Marlowe, a driver
pulled back in by fixer **Mara Voss**, runs five story missions against the
rival **Harbor Kings** crew — across Marina Bay, Old Town, Northside,
Portside and The Strip.

## Play

Serve `game/` with any static server (`node serve.ts`, then
http://localhost:8080) and open it in a desktop browser.

- **WASD** move / drive · **Mouse drag** orbit camera · **Shift** run
- **E** enter / exit car · **Click** shoot · **F** punch · **Space** handbrake
- **R** change radio station (while driving) · **1 / 2** pistol / SMG
- **Esc / P** pause · **M** mute

## Polish pass (22 Nov 2026 resubmit)

- **Respawn is fair now**: after WASTED / BUSTED, Jax keeps at least 12
  pistol rounds (Mara slips him a fresh mag with the bill), the car stops,
  and a NEW GAME in the same tab un-hides sun-packages collected before.
- **Pause actually pauses the noise**: sirens and the engine hum stop on
  the pause screen instead of wailing underneath it.
- **Traffic yields**: AI cars crawl when the player is right ahead of them
  instead of rear-ending a stopped car.
- **Fists matter**: punching a cop knocks him down (and raises heat, as it
  should). Pedestrians panic longer the closer the gunshot was.
- **Balance**: Spray Shop $150 → $125, Getaway timer 75s → 90s, more
  traffic (14 → 16) and pedestrians (20 → 24) for a livelier city.
- **Saves are validated**: a corrupt or tampered localStorage save is
  sanitised field-by-field (cash, mission, packages, ammo) instead of
  crashing the game or warping progress.
- **Deterministic city**: lit windows now use the seeded RNG, so every load
  (and every `?shot=` screenshot) looks identical.
- **Accessibility**: HUD status text, wanted stars, minimap and flash
  messages carry ARIA roles/labels; menu buttons are explicit buttons.
- **Tooling**: `main.ts` fails loudly on a missing `game/` or
  `screenshots/` and validates the dossier; `tools/shots.mjs` resolves
  Playwright from the repo first with a legacy-path fallback; `serve.ts`
  refuses non-GET/HEAD requests and sends security headers.

## New systems

Three systems added in the resubmit rewrite round — each one is a real,
playable system in `game/src/`, not a cosmetic toggle.

- **Dynamic weather** (`weather.js`): Solport's sky changes on its own
  schedule between **clear**, **heavy rain** and **thick fog**, and missions
  can force a change. Conditions blend over a few seconds instead of
  snapping, so a storm visibly closes in. Rain is a particle cloud that
  follows the player; fog pulls the scene fog in close. Weather is not
  just looks: rain cuts road grip to 0.55, so the car slides more under
  the same steering, and fog drops visibility to about 110 metres, so
  beacons, traffic and roadblocks appear much later. Clear skies stay the
  most likely roll, rain shows up often enough to matter, fog is the rare
  one — plan getaways accordingly.
- **Procedural car radio** (`radio.js`): three WebAudio stations, sequenced
  live with no audio files — bass line, lead voice and (on the ambient
  station) slow pads, driven by a lookahead scheduler so the groove stays
  steady while you drive. **SOLPORT FM 88.4** (92 BPM, mellow cruise),
  **NEON DRIVE 101.2** (132 BPM, fast synth drive) and **DUSK AMBIENT
  94.7** (60 BPM, slow pads). Press **R** while driving to switch
  stations; the radio only plays inside a car and cuts out on foot, on
  pause, on mute, and in staged screenshot mode.
- **Stunt scoring** (`stunts.js`): showing off pays cash. Hold a **drift**
  (Space) to bank value the longer you hold it, thread traffic at speed
  for a **near-miss** payout, or pin the car near its top speed for a
  **top-speed run** bonus. A stunt only pays when it ends cleanly — a drift
  you hold, a near miss you survive — so finishing the move is rewarded,
  not farming the middle of it. Payouts land as cash with a HUD flash
  line, and only count while actually driving in live play.

## Systems

- **Open city**: procedural low-poly Solport — road grid, waterfront, beach,
  coastal highway, palms, lamps, lit windows, golden-hour sun + fog.
- **On foot and by car**: third-person walking, arcade driving with drift,
  enter/exit any car (stealing one raises your wanted level).
- **Traffic & pedestrians**: AI cars on the road graph, sidewalk walkers who
  flee gunfire and near-misses.
- **Wanted 0–5 stars**: stealing, killing and shooting near cops raise it.
  Police cruisers chase and ram; foot cops bust you on a timer. Heat decays
  out of sight; the Spray Shop clears it for cash.
- **5 story missions**: package run, car theft + escape, dock shootout,
  timed getaway through roadblocks, and intercepting the Solport Reserve
  transport — with intro cards, objective tracker and beacon.
- **Side activities**: taxi fares, 10 hidden sun-packages, health packs,
  weapon pickups (pistol → SMG), cash + respect progression.
- **HUD**: health/cash, wanted stars, live minimap (roads, player arrow,
  mission marker, police blips), objective + prompts, speedometer,
  WASTED / BUSTED / mission banners.
- **Save**: progress (cash, mission, respect, packages) in localStorage;
  continue from the start screen.
- **Sound**: 100% WebAudio synth — engine hum, gunshots, two-tone siren,
  pickup chime, mission stings. No audio files.

## Tech

- three.js 0.170.0 vendored under `game/vendor/` (ES module build), loaded
  via an import map. No CDN, no network requests at runtime.
- Plain ES modules, one job per file under `game/src/`
  (`main`, `city`, `player`, `vehicles`, `pedestrians`, `police`,
  `missions`, `hud`, `audio`, `input`, `save`, `shots`, `utils`, `config`,
  `weather`, `radio`, `stunts`).
- Deterministic screenshot staging: `?shot=chase|mission|city|drive`
  stages a real gameplay moment; `tools/shots.mjs` (Playwright) captures
  the four 1280×720 JPEGs in `screenshots/`.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
