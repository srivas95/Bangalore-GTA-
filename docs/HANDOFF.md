# Handoff: Namma Bengaluru

This file lets a new Claude session (or a person) carry on with the project without the earlier
conversations. Start by reading it, then `README.md` (what the game has) and `docs/GAME_OUTLINE.md`.

## 1. Where things stand

- **Repo:** `srivas95/Bangalore-GTA-`. **Working branch:** `claude/clever-carson-z0m3zn` (all work
  below is pushed there; nothing is merged into `main` yet and no PR has been opened).
- **Version:** 0.10.0 (`package.json`, `apps/desktop`, `apps/mobile`, Android `versionCode 12`,
  service-worker cache `namma-bengaluru-v8` in `public/sw.js`). Bump all of these together.
- **CI:** `.github/workflows/build-apps.yml` ("Build apps") builds the web bundle, a Windows exe
  (Electron) and an Android APK (Capacitor) on every push to `main`, `master` or `claude/**`.
  Commits that touch only `docs/**` or `*.md` don't trigger it. The last code commit (`9bf66b4`) is green.
- **History note:** the branch has several "Work in progress … (checkpoint)" commits from the last
  round, made while background agents were mid-task. They all build; the finished state is at the tip.

## 2. The project in one paragraph

An open-world, GTA-style game set in Bengaluru, in **three.js r186**, bundled with **Vite 5**. The city,
people, signs and most vehicles are generated in code. The assets are: fonts, recorded sounds
(`SOUND_CREDITS.md`), the "Bus Simulator India - Traffic Cars" vehicle pack (CC BY 4.0) and Poly Haven
street props and textures (CC0), all credited in `MODEL_CREDITS.md` and on the start screen. The city is built on Bengaluru's real road network, compressed
around Majestic. It has traffic that keeps left and weaves, Namma Metro and BMTC bus rides, hired
autos, an auto-driver job, food-delivery gigs, police (Hoysala) chases with wanted stars, weapons,
garages, a monsoon with floods, day and night, and a story (Act I). It runs in the browser and ships
as a Windows exe and an Android APK.

## 3. Running and building

```bash
npm ci
npm run dev        # dev server
npm run build      # -> dist/
npm run preview    # serves dist/ on :4173 (what the headless tests use)
```

App builds: `npm run app:windows`, `npm run app:android` (see `docs/BUILDING.md`).

**Debug hook:** `window.__game` exposes `{ audio, city, story, metroRide, rides, autoDuty, gangs,
pickups, particles, metro, scene, player, traffic, layout, renderer, camera, rig, missions, hud,
streetLife, free, input, step(n), police, env, signals, world, ... }`. `step(n)` advances n frames
of 1/60 s. Set `window.__freeCam = true` to place `__game.camera` yourself. `?detail=lite` (or the
settings) selects the phone detail level.

## 4. Code map

| Path | What it is |
| --- | --- |
| `src/main.js` | Start-up, the main loop, the world object, vehicle-vehicle contacts (`resolveVehicleContacts`), parking, `__game` |
| `src/config.js` | Constants, shop signs and brands (`SHOP_SIGNS`), fuel brands, dialogue |
| `src/world/mapdata.js` | **Real geography**: `SCALE`, `geo(lat, lon)`, `WORLD` bounds, `URBAN` areas, arterials (incl. NICE Road), metro lines and stations, railway, parks, lakes, districts, `SPECIAL_BLOCKS` (landmark sites), `HOTEL_SITES`, `AIRPORT`, `AIRBASE`, police stations, hospitals, flyovers, underpasses, spawn |
| `src/world/roadnet.js` | Builds the road network: arterials plus a generated street grid (`gridWorld` keeps the grid anchored when the world grows) |
| `src/world/layout.js` | Junctions, traffic edges, blocks, landmark/hotel block assignment (`assignSpecials`, the `NEED` size table), spatial queries |
| `src/world/city.js` | Builds the city: kerbs, lots, buildings, shops, parks (Cubbon), trees, lamps, tanks, text signs, distance culling |
| `src/world/landmarks.js` | One builder per landmark (`LANDMARKS`), e.g. Vidhana Soudha, KBS, airport, air force station, the 10 new ones |
| `src/world/infrastructure.js` | Roads, junctions, underpasses, flyovers, NICE Road toll plaza |
| `src/world/railway.js`, `metro.js` | Indian Railways lines and stations (KSR, Yeshwanthpur...), Namma Metro |
| `src/world/signboards.js`, `textures.js` | Canvas-painted shop signboards (flex/painted/ACP, brand logos), facades, atlases |
| `src/world/ao.js` | Baked top-down ground shading (rasterised into a byte array, capped at 4096 px) |
| `src/entities/vehicle.js` | **Vehicle physics** (San Andreas-style handling table), damage, fire, visuals |
| `src/entities/vehicleModels.js`, `carBodies.js`, `liveries.js` | Vehicle types (`VEHICLE_TYPES`), builders, real Indian car models (`CAR_MODELS`, `TYPE_MODELS`), liveries |
| `src/entities/packVehicles.js` | The traffic-cars pack (`public/models/traffic-cars.glb`, built by `tools/models/prepare_traffic_cars.py`): `PACK_TYPES` maps each pack vehicle to a game type, `PACK_SHARE` how often a type uses the pack; each vehicle is baked at load into one skinned mesh (wheel bones) with one atlas material |
| `src/world/props.js` | Poly Haven street props (`public/models/street-props.glb`, `tools/models/prepare_polyhaven.py`); `city.js` `streetProps()` lays them out, one instanced mesh per kind holds the nearest |
| `src/entities/traffic.js` | **AI traffic** (kinematic lane-following, junction reservation, contacts and crashes) |
| `src/entities/player.js`, `pedestrians.js`, `human.js`, `gangs.js` | Player, street life, people, rowdies |
| `src/systems/*` | Police, missions, story, rides (autos and buses), auto duty, metro ride, garages, GPS, audio, environment (weather, time), signals, weapons, settings |
| `src/ui/hud.js`, `touch.js` | HUD, minimap, map, touch controls |
| `tools/headless/` | Headless test scripts (section 7) |

## 5. Things to know before changing code

- **Map scale.** `SCALE = 3` in `mapdata.js`: real distances divided by 3 around Majestic
  (`x = (lon − 77.5713) · 108600 / SCALE`, `z = (12.9767 − lat) · 110600 / SCALE`, +x east, +z
  south). Everything placed on the map is given in lat/lon and follows `SCALE`; sizes of shapes
  drawn at the old 1:5 scale use `S5 = 5 / SCALE`. Buildings and landmarks are real size. The street
  grid spacing is `STREET_SPACING = 200` m. `WORLD` is about 11.6 × 13.5 km of game space.
  Fares, delivery pay and the timed story run use `SCALE` so they stay real-world.
- **Load cost.** Load time and memory grow with map area (JS heap ~700–800 MB on high detail).
  1:2.5 was tried and rejected (about 200 s load and ~900 MB in the test container, too much for phones).
  A bigger map really needs the city generated and freed by region (streaming), which isn't done.
- **Landmarks.** Add a site to `SPECIAL_BLOCKS` (`zone: 'landmark', landmark: '<name>'`), a minimum
  inner size to `NEED` in `layout.js`, and a builder in `LANDMARKS` that returns `{ name, x, z }`
  (that makes it a map POI). A landmark goes in the block containing its point, else the nearest
  block that fits. Park landmarks are listed on the park (`PARKS[...].landmarks`). Hotels and malls
  go in `HOTEL_SITES` and are assigned nearest-first to blocks that can take a tower.
- **Distance culling** (`city.js`) uses world-space bounding-sphere centres; meshes placed by
  transform (text signs) depend on that. Keep it if you change culling.
- **Traffic** (`traffic.js`) is kinematic: each agent follows a lane path (`a.path`, `a.s`, lateral
  offset `a.lat`) with speed from `gapAhead()`. Before the stop line it plans its turn (`planTurn`)
  and waits while the turn would cut across someone in the junction (`junctionClear`), while the
  exit is full (`exitClear`), or for someone arriving sooner (`approachClear`); after 10 s it creeps in.
  It follows at stopping distance. `resolveContacts()` stops pass-through: within 160 m of the player
  a contact closing faster than 5 m/s is a crash (dents, sparks, riders thrown off, the lighter
  vehicle released into physics as a `temp` wreck that is recycled once 340 m away); slower contacts
  push the striker back. Vehicles only "ghost" through each other out of sight (> 140 m) to break jams.
  Agents with `keep` (a hired auto or a bus carrying the player) are never released.
- **Handling** (`vehicle.js`): a `HANDLING` table per type (traction, traction loss, bias, drive F/R/4,
  turn mass, drag, brake bias, steering lock and falloff, cg height, handbrake grip), with
  `handlingFor()` defaults for unknown types and `spec.handling` overrides. It's our own model
  inspired by GTA San Andreas' handling settings; no Rockstar code or data.
- **New vehicle types** need entries in `VEHICLE_TYPES`, the builder dispatch, traffic `BASE_MIX`
  (and `HEAVY` if big), `TOUGHNESS` in `vehicle.js`, and a check of type lists in `player.js`
  (conductor line), `cameraRig.js` (bus camera height) and `main.js` (heavy list in contacts).
  `spec.siren` gives a non-police vehicle a siren (the ambulance).
- **Conventions:** match the surrounding code (concise comments that explain why, same idioms);
  descriptive commit messages that say what changed and why, with numbers where tests were run;
  never put AI model names in code, comments or commits.

- **Pack vehicles** have `model.pack` set and no `model.color` (garage resprays skip them). A new
  pack vehicle needs a `PACK_TYPES` entry; a pack-only type needs a procedural fallback in
  `buildVehicleModel` (used if the GLB fails to load). `opts.pack` (template name) forces one.
- **Photo textures** (`textures.js` `loadPhotos`, `photo()`) are loaded before the city is built and
  drawn under the painted asphalt, concrete and plaster; without them the textures are as before.
- **Starting money:** every game starts with `START_MONEY` (₹1000); the story save keeps progress only.

## 6. History of requests (oldest first)

1. Foundations: skinned models, vehicles (Hoysala Ertiga, horns), expanded map (Yeshwantpur, Peenya,
   Koramangala, Indiranagar, Silk Board), dense traffic, signals, crowds, police, combat, day/night,
   monsoon floods, HUD, outline doc.
2. Erratic autos and two-wheelers, BMTC/Hoysala/metro liveries from photos, real brands, tyre-model
   driving, damage, real car models, weapons, rebuild on the real road network, usable Namma Metro,
   story Act I, settings and touch controls, garages, level crossings, airport road and Whitefield.
3. Windows exe and Android APK; Android memory crash fix; graphics passes (AO, halos, tone mapping,
   phone shadows, normal maps, colour cast, night brightness, trees); FPS; map zoom on mobile;
   animations; metro portals; GPS; mass-based crashes; sound realism; graphics-engine analysis
   (WebGPU benchmarked ~2× CPU cost on the WebGL2 fallback, deferred).
4. v0.9.0–0.9.2: real recorded voices, auto-driver duty, bus and auto rides, three.js r186; smoother
   driving and camera; faster hired autos; start with ₹1000; Sonniss GDC 2026 sounds; traffic
   stacking fixes; hailing autos fixed (walk while waiting); realistic Kannada-first signboards and
   brand logos (bundled OFL fonts); tighter cornering; Cubbon Park and Majestic detail (KBS buses,
   crowds, KSR clock tower); Platinum City moved; Taj Yeshwantpur, Vaishnavi Sapphire, Yeshwanthpur
   Jn., Sheraton Grand added; landmark signs that vanished far from Majestic fixed.
5. **v0.10.0 (latest request):** "Make the scale of the map much larger… areas are overlapping";
   "copy vehicle physics from GTA San Andreas"; "add more landmarks and NICE Road, the air force
   station in Yelahanka and 10 other landmarks"; "add more vehicle models"; "AI vehicles are still
   driving through each other, and not crashing". All five done (details in README and the commits).

## 7. Testing (headless)

The game is tested in headless Chromium with software WebGL (SwiftShader), driven through
`window.__game`. Scripts are in `tools/headless/`; run them against `npm run preview` (port 4173).

- Playwright: `npm i -D playwright` locally, or point `PLAYWRIGHT` at an existing install (in Claude
  Code cloud containers: `PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.mjs`, browser
  already installed). Launch args used: `--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
- **Run one browser at a time.** With SwiftShader the browser process can reach ~10 GB RSS; two at
  once got OOM-killed. Loading takes ~85–140 s in a cloud container. Add `page.on('crash')` handling
  and a timeout so a dead renderer can't hang a run.
- Screenshot outputs go to `OUT` (default `out/`).

| Script | Use |
| --- | --- |
| `layout-stats.mjs` | Node: block/edge counts and zones for the current map (fast; no browser) |
| `landmark-placement.mjs` | Node: where each landmark landed vs its real site, NICE Road dead ends, roads inside the airport/air base |
| `handling-bench.mjs` | Node: physics bench (turning radius and g, 0–100, braking, handbrake, slalom) per type: `node tools/headless/handling-bench.mjs "" hatch sedan suv` |
| `traffic.mjs` | Rush-hour minute at two spots (`SPOTS=0,40`): overlaps, deep overlaps, crashes, average speed, jammed vehicles and why |
| `bus-ride.mjs`, `auto-hail.mjs` | Take a BMTC bus; wave down autos at several roadsides and ride |
| `police-nav.mjs` | 8 Hoysalas route to a standing player; compares against the old physics in `oldstep.json` |
| `views.mjs` | Screenshots from fixed lat/lon camera positions (`VIEWS=kbs_aerial,cubbon_aerial,...`) |
| `landmark-shots.mjs`, `vehicle-shots.mjs` | Close-ups of every landmark / every car model and type |
| `load-probe.mjs`, `load-cpu-profile.mjs` | Load time, heap, geometry counts; CPU profile of the load |

Latest results (v0.10.0, rush hour, one game minute): deep overlaps 77 → 1 (Majestic) and 142 → 0
(second spot); crashes 5 and 0; average speed 8.9 → 6.7 and 7.8 → 5.3 m/s; vehicles stuck over 10 s
38 and 12 (was 1). Bus ride works; 4/4 auto hails work. Handling bench: hatchback 1.55 g at full
lock, 0–100 km/h 5.3 s, 26.7 m from 100 km/h.

## 8. Open issues and next steps

1. **Traffic flow** is 25–35 % slower than before the collision work and jams build at busy junctions
   (jam reasons in `traffic.mjs` output: mostly vehicles queued behind a turning vehicle, and
   vehicles waiting for the junction). Tune junction waiting, exits and gap acceptance without
   bringing back pass-through.
2. **SUV/MPV windscreen glitch** (older bug): on lofted SUVs and MPVs (Innova, Bolero, Fortuner...)
   the windscreen reads as a dark raised flap from low front-3/4 views. In `carBodies.js` (loft).
3. **Landmarks:** some sit in big, mostly empty blocks (Bull Temple, Town Hall, Kanteerava, whose
   block paving shows); Kanteerava and Ulsoor Gurudwara are ~590 m from their real sites (their own
   blocks are park and lake). NICE Road meets streets at plain junctions (not access-controlled).
   High aerial views of the air base are washed out by fog.
4. **Handling:** not yet tried by hand on keyboard or touch. Buses turn wide at speed by design
   (`HANDLING.bus` traction). Police cornering speed in `police.js` is still its own formula, and
   police route-finding gets stuck at some spots (seen in `police-nav.mjs`).
5. **Memory and load** on phones with the larger map are untested on real devices.
6. **Docs:** `docs/map.png` and other README screenshots predate the 1:3 map.
7. **Undecided:** WebGPU renderer (benchmarked ~2× CPU cost on the WebGL2 fallback; needs the
   owner's decision).
8. When ready: open a PR from `claude/clever-carson-z0m3zn` to `main`.
9. Poly Haven has no character models (its only creature is a rat), so people are still procedural.

## 9. Prompt to start a new session

> I'm continuing work on my game in `srivas95/Bangalore-GTA-`, branch `claude/clever-carson-z0m3zn`.
> Read `docs/HANDOFF.md` first, then `README.md`. Build with `npm run build`, test headless with the
> scripts in `tools/headless/` (one browser at a time). Next I'd like to: <your request>.
