# SOLPORT — open-world crime game

![gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/taufik52/solport-city/rank.svg)
![reward](https://make.fun/badge/gta6-01/taufik52/solport-city/reward.svg)

An original open-world crime game for make.fun **gta6-01 "Make GTA 6"**, built
in a desktop browser from static files — no network, no Rockstar content.
Everything (city, characters, story, art, sound) is original and made for
this entry.

**Solport** is a sun-soaked fictional coastal city. Jax Marlowe, a driver
pulled back in by fixer **Mara Voss**, runs five story missions against the
rival **Harbor Kings** crew — across Marina Bay, Old Town, Northside,
Portside and The Strip.

## Play

Serve `game/` with any static server (`node serve.ts`, then
http://localhost:8080) and open it in a desktop browser.

- **WASD** move / drive · **Mouse** orbit camera · **Shift** run
- **E** enter / exit car · **Click** shoot · **F** punch · **Space** handbrake
- **Esc / P** pause · **M** mute

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
  `missions`, `hud`, `audio`, `input`, `save`, `shots`, `utils`, `config`).
- Deterministic screenshot staging: `?shot=chase|mission|city|drive`
  stages a real gameplay moment; `tools/shots.mjs` (Playwright) captures
  the four 1280×720 JPEGs in `screenshots/`.

## License

MIT — see `LICENSE`.
