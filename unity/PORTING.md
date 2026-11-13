# Porting Namma Bengaluru to Unity

The Unity version lives in `unity/NammaBengaluru` (Unity 6000.6.9f1, URP). It is a port of the
web game in `src/`, not a remake: the same city is generated from the same data with the same
algorithms, and the game's own physics (tyre model, colliders, kinematic traffic) are ported
as they are, so it drives and behaves the same. Unity does the rendering, input, audio, UI and
builds.

## Conventions

- Game logic keeps the web game's coordinates: right-handed, +x east, +z south, +y up, metres.
  Only rendering converts, at the boundary: Unity position = (x, y, -z), and a three.js yaw `a`
  is a Unity yaw of `-a`. Seen in Unity's left-handed space that is the same picture three.js
  draws, so meshes keep three's triangle order reversed (three winds front faces
  counter-clockwise, Unity clockwise). `Game.ToUnity` does the conversion.
- Colours: vertex colours are linear, as three.js stores them (`LinColor.Hex` converts sRGB hex).
- Seeded randomness uses `Mulberry32`, bit for bit the JS one, and the same seeds.

## How it's structured

- `Assets/Scripts/World/` is the world core. It has no `UnityEngine` dependency, so it also
  compiles in plain .NET.
- Data tables come from the JS source: `node tools/unity/export_data.mjs` writes
  `Assets/Resources/Data/{mapdata,config}.json` from `src/world/mapdata.js` and `src/config.js`,
  plus `layout_fingerprint.json`, a fingerprint of the JS road network. Re-run it after
  changing either JS file.
- `tools/unity/LayoutCheck` builds the C# world core with the .NET SDK that ships with Unity and
  checks it against that fingerprint:

  ```bash
  cd tools/unity/LayoutCheck
  D=~/Unity/Hub/Editor/6000.6.9f1/Editor/Data/DotNetSdk/dotnet
  $D run -p:NewtonsoftDll=$(ls ../../../unity/NammaBengaluru/Library/PackageCache/com.unity.nuget.newtonsoft-json@*/Runtime/Newtonsoft.Json.dll)
  ```

## Status

| JS module | C# | State |
| --- | --- | --- |
| `world/mapdata.js` | `World/MapData.cs` (+ JSON) | Done |
| `config.js` | `World/GameConfig.cs` (+ JSON) | Done |
| `world/roadnet.js` | `World/RoadNet.cs` | Done, identical output |
| `world/layout.js` | `World/Layout.cs` | Done, identical output |
| `world/meshBuilder.js`, `geom.js` | `Render/MeshBuilder.cs`, `Render/Geom.cs`, `World/Earcut.cs`, `World/Primitives.cs` | Done |
| `world/textures.js`, `signboards.js` | Baked to `Resources/Baked/*.png` by `tools/unity/bake` | Done (painted by the JS itself) |
| `world/surface.js` | `Resources/Shaders/City.shader` (+ `Instanced`, `Glow`) | Done |
| `world/city.js` | `Render/City.cs`, `Render/InstancedForest.cs`, `Render/CityMaterials.cs` | Done |
| `world/infrastructure.js` | in `Render/City.cs` | Done |
| `systems/colliders.js` | `World/Colliders.cs` | Done |
| `world/ao.js` (baked ground shading) | `Render/GroundShading.cs`, `Resources/Shaders/GroundAO.hlsl` | Done |
| `entities/vehicle.js` | `Entities/Vehicle.cs` (physics, damage), `Entities/VehicleView.cs` (dents, smoke, fire, scorch) | Done |
| `entities/vehicleModels.js`, `carBodies.js`, `liveries.js` | Baked by `tools/unity/bake/models.mjs` to `Resources/Models/vehicles.*`, built by `Render/ModelLibrary.cs` | Done (variants of all 27 types, plus the garage stock) |
| `entities/packVehicles.js` | Baked with the other vehicles by `tools/unity/bake/models.mjs` (+ `Baked/pack_atlas*.png`); picked in `Render/ModelLibrary.cs` | Done (31 vehicles, 7 atlases) |
| `entities/human.js` | Baked to `Resources/Models/humans.*`; poses in `Entities/Human.cs` | Done (78 people) |
| `entities/player.js` | `Entities/Player.cs` | Done (on foot, driving, punching, kicking, weapons, aiming, the GUNDA cheat) |
| `systems/cameraRig.js`, `input.js` | `Systems/CameraRig.cs`, `Systems/GameInput.cs` | Done |
| `main.js` (start-up, parking, vehicle contacts, `__game.step`) | `Game.cs` | In part |
| `entities/traffic.js` | `Entities/Traffic.cs` | Done |
| `systems/signals.js` | `Systems/Signals.cs` | Done |
| `systems/environment.js`, `world/sky.js` (colours) | `Systems/Environment.cs`, `Resources/Shaders/Sky.shader` | Done |
| `entities/pedestrians.js` | `Entities/StreetLife.cs` | Done (cows have square edges; bus-platform crowds wait for the landmarks) |
| `ui/hud.js` | `UI/Hud.cs` (uGUI + TextMeshPro; Oswald and DejaVu Sans in `Resources/Fonts`) | Done (metro and railway lines, GPS route and garages join the map with their ports) |
| `systems/audio.js`, `audioSynth.js` (cues and radio), `soundBank.json` | `Systems/GameAudio.cs`, the 261 recordings in `Resources/Audio` | Done (no convolution reverb) |
| `systems/particles.js` | `Systems/Particles.cs`, `Resources/Shaders/Particle.shader` | Done |
| `systems/weapons.js` | `Systems/Weapons.cs` (stats, models, ray tests, NPC fire, pickups) | Done |
| `systems/police.js` | `Systems/Police.cs` | Done |
| `entities/gangs.js` | `Systems/Gangs.cs` | Done |
| `systems/route.js`, `gps.js` | `Systems/Route.cs` (A*, lane paths, drive plans, GPS) | Done |
| `systems/missions.js` | `Systems/Missions.cs` (deliveries, markers) | Done |
| `systems/garages.js` | `Systems/Garages.cs` | Done (saves in PlayerPrefs) |
| text signs (`buildTextSigns`, garage and metro boards) | `Render/TextSigns.cs`, baked by `tools/unity/bake/signs.mjs` | Done |
| `systems/autoDuty.js` | `Systems/AutoDuty.cs` | Done |
| `systems/rides.js` | `Systems/Rides.cs` (hired autos, BMTC buses and shelters) | Done |
| `world/metro.js`, `path.js` | `World/MetroRoutes.cs` (routes, ramps), `Render/Metro.cs` (structures, trains) | Done |
| `systems/metroRide.js` | `Systems/MetroRide.cs` | Done |
| `world/railway.js` | `Render/City.Railway.cs` | Done |
| `systems/story.js` | `Systems/Story.cs`, missions exported by `tools/unity/export_story.mjs` to `Resources/Data/story.json` | Done |
| `systems/settings.js`, the pause screen (`#help`) | `Systems/Settings.cs`, `UI/Menus.cs` | Done (world detail levels and dynamic resolution aren't ported) |
| `systems/liveWeather.js` | `Systems/LiveWeather.cs` | Done |
| `ui/touch.js` | `UI/Menus.cs` (touch controls) | Done |
| `world/landmarks.js` | `Render/City.Landmarks.cs`, `Resources/Models/landmarks.json` | Done (baked from the JS builders; airport and air-force animations not replayed) |
| `world/props.js` | `Render/StreetProps.cs`, meshes baked by `tools/unity/bake/models.mjs` to `Resources/Models/props.json` | Done |
| `world/halos.js`, `blobs.js` | `Render/Glows.cs`, `Resources/Shaders/Halo.shader`, `Blob.shader` | Done |

### Phase 1 check (world core)

C# and JS agree on all of it: 755 roads, 2,510 junctions (44 with signals, 32 named), 8,728
directed traffic edges, 1,919 blocks and 26 islands with the same zones and coordinate sums,
all 23 landmark sites and 11 hotels in the same blocks, 41 underpasses, 28 level crossings,
both flyovers, 9,261,151 filled raster cells, and the same answers to spatial queries. The C#
build takes 1.9 s (JS: 2.8 s).

### Phase 2 (city rendering)

The city builds in about 25 s in the Editor: 1,919 blocks, 136,029 trees, 22,499 street lamps,
194,019 rooftop water tanks and 455,542 colliders, the same counts the JS builds where the
ported parts reach. Roads, junctions with zebra crossings, raised medians, underpasses, the
flyovers, the NICE Road toll plaza, footpaths with painted kerbs, and every zone's buildings
(street blocks, markets, commercial, towers with hotels and malls, government, residential,
industrial sheds, fuel stations, lakes, rural fields) are drawn with the web game's own textures
and its world-space surface shading. See `docs/unity/city-street.png` and `city-aerial.png`.

Landmarks, Cubbon Park, the railway, the metro and the text signs came in phases 6a to 6e. The
city's random choices now follow the web game's all the way through.

The street props, light halos, contact shadows and baked ground shading came in phase 7.

### Phase 3 (playable)

You can walk around Majestic, get on the scooter, bike or auto parked at the start (F), and
drive anything parked around town: 120 vehicles are parked as in the web game, lorries outside
the Peenya factories. The handling is the web game's tyre model, ported line for line. Vehicles
and people are the web game's own procedural models, baked by its builders. `Game.Step(n)`
advances the simulation without rendering, like `window.__game.step(n)`: a scripted ride from the
spawn reaches 67 km/h on the scooter in 4 s. See `docs/unity/on-foot.png` and `riding.png`.

Controls so far: WASD walk/drive, mouse look (click to capture, Esc to release), Shift run,
Space jump/handbrake, F get in/out, C look behind, G siren.

### Phase 4 so far (traffic and signals)

Traffic is the web game's own AI, ported whole: 170 vehicles streamed around the player with
the Bengaluru mix (scooters, autos, hatchbacks, BMTC buses, lorries at night), keeping left,
weaving, riding the wrong side, honking, planning each turn before the stop line, waiting for
a clear junction, and crashing hard enough to be knocked loose. Signals phase each junction
(green 18 s, amber 3, all-red 2, then a 10 s pedestrian phase), and named junctions have a
traffic constable on his platform. Carjacking works (F on any traffic vehicle). A 34 s run from
the spawn: 170 vehicles, 153 moving, 33 waiting at signals or junctions, mean 31 km/h, two
crashes; simulated in 3.1 s. See `docs/unity/majestic-circle.png`.

### Phase 4b (day, night and the monsoon)

`Systems/Environment.cs` ports environment.js line for line: a 24-minute day, the sun's arc
and colour, a bright blue moon at night, ambient light and fog taken from the sky's own colour
keys (sky.js), exposure lifted after dark, and rain that arrives on its own every few minutes
(K forces it, T runs the clock 30× faster). Heavy rain brings lightning, wet roads and, after a
long shower, a metre of water in the underpasses and then a few centimetres over the roads.
`Game.WaterDepth` now returns real depths, so scooters drown in flooded underpasses as they do
in the web game. Headlights come on at night. See `docs/unity/night.png`, `sunset.png` and `rain.png`.

### Phase 4c (street life)

`Entities/StreetLife.cs` ports pedestrians.js: about 110 walkers on loops round the blocks
(streamed within 230 m), crowds of 3 to 6 at each corner of the three nearest signals that
cross on the walk phase (the impatient spill onto the road and jaywalk), three regulars at
each of the 276 chai stalls, and up to eight cows ambling along the kerb that traffic honks
off the road. Hit by a vehicle, people go down (or die above 15 m/s). Hit by the player, they
stagger, flee or, sometimes, fight back. A carjacked driver, or a rider thrown off a two-wheeler
in a crash, bolts. Traffic yields to anyone standing in the carriageway. See
`docs/unity/pedestrians.png`.

### Phase 4d (HUD)

`UI/Hud.cs` rebuilds the web game's heads-up display in uGUI with TextMeshPro, at the same CSS
sizes on a 1440x810 reference screen: the round minimap that turns with the camera, inside
the health ring; clock and weather, money (Indian digit grouping) and wanted stars; district
toasts; the speedometer with the vehicle's name and condition bar; street, junction and
district names; prompts ("F  Get in the Scooter", "F  \"Borrow\" the …"), subtitles, the radio
station when you get on, mission and phone panels, the damage flash and the WASTED screen. M opens
the big map (scroll to zoom, drag to pan, click for a waypoint once the GPS is ported), with
district, landmark and fuel-station labels that never overlap. The map picture is drawn at
start-up exactly as `renderMap` draws it (0.32 px per metre, about 3700x4300, DXT1-compressed).
The font is the game's own Oswald (converted from `public/fonts/oswald-latin.woff2`), with DejaVu
Sans standing in for system-ui and for the ₹, ★ and weather symbols. Emoji the fonts lack are
replaced (☂ for rain, ☾ for night, ♪ for the radio). See `docs/unity/hud.png`, `hud-riding.png`
and `big-map.png`.

### Phase 5a (sound)

`Systems/GameAudio.cs` ports audio.js with the same 261 recordings (copied to
`Resources/Audio`, imported at the web game's decode rates by `Editor/GameAudioImporter.cs`) and
the same mix: the RPM-layer engines (yours and the eight nearest in traffic, with Doppler), every
horn profile (bursts, the lorry's tune, the held horn on H or Q), the siren pair, ambience beds by
hour, weather and place (parks, lakes, crowds, rain, storms, dogs after dark), tyres, scraping and
road roar, footsteps on the walk cycle, doors, crashes and glass, voices for hits, deaths and
screams, thunder with the lightning, cows, and the synthesised ping, cash, sting and radio (R).
Each Web Audio voice becomes an AudioSource panned in 2D through an AudioLowPassFilter, with
gain, pan and air absorption computed exactly as `place()` does. Loop and sustain regions are
cut into clips of their own at load, and an `Envelope` filter gives scheduled horn blasts their
attack and release on the audio thread. The small convolution reverb is left out.

### Phase 5b (combat, police, gangs, damage)

- **Particles.** `Systems/Particles.cs` ports particles.js. Smoke, black smoke, dust, spray, fire, sparks, muzzle flash, blast and blood keep their own lifetimes, sizes, colours, drag and lift. They are drawn as camera-facing quads in two dynamic meshes, one alpha-blended and one additive, with the point sprites' soft round falloff.
- **Weapons.** `Systems/Weapons.cs` has the nine weapons with the web game's stats, their hand-held models (built with the same `put` calls, held in the right fist), the bullet ray test against people, vehicles, walls and the ground, NPC gunfire, and pickups that turn over a glowing ring.
- **Pickups.** They are placed as main.js does: bats and lathis in the parks, blades in the markets, machetes and kattas in the industrial yards, and the revolver at the Yeshwanthpur APMC yard.
- **The player.** The player can punch, kick (the cow is unimpressed), swing, stab, shoot from the hip or aim with the right mouse button, reload, and cycle weapons (Tab or 1–9). Typing GUNDA gives every weapon.
- **Crime and the police.** Crimes raise the wanted level, as in police.js. Hoysala units route through the junction graph with pure pursuit, brake for corners, ram and unstick themselves. Constables get out with lathis and draw revolvers at three stars. Staying out of sight drops a star every 12 s. Being pinned down means BUSTED, a fine and a police station. Dying means WASTED, a hospital bill and a hospital.
- **Gangs.** Rowdies loiter around markets and yards after dark: brawlers with blades and chains, and gunners with kattas. They alert their crew and drop their weapons when they go down.
- **Vehicle damage.** Vehicles dent where they're hit, smoke as their health falls, catch fire, explode (blast damage, knockback, scorched shell) and are repaired back to factory condition when they return to the traffic pool.

See `docs/unity/wasted.png`, `vehicle-fire.png` and `explosion.png`.

### Phase 6a (deliveries, GPS, garages, text signs)

- **Deliveries.** Food delivery offers come in on the phone (J to accept), with a beam-and-ring marker over the restaurant and then the customer, a timer, speed bonuses, tips and a rating.
- **GPS.** Click the big map to set a waypoint (click it again to clear it). A purple route line, A* over the junctions as in route.js, is drawn on the minimap and the big map, with the distance left.
- **Garages.** The 13 roadside stalls and Chikka Motors are where garages.js puts them. Drive into the cyan bay, or walk up and press E, for repairs and resprays (a respray loses up to three stars if no Hoysala saw you drive in). Chikka's showroom sells all 29 models. What you buy is saved in PlayerPrefs, parked outside, and can be called to any garage. The showroom models are baked as garage stock in a base paint and repainted by swapping that colour, as `recolor()` does.
- **The start scooter.** It is now the red Activa the web game starts you on.
- **Text signs.** The boards over underpasses, flyovers and toll plazas, at fuel stations, on heritage buildings and over the garages are painted by the web game's own `textTexture()`, so the Kannada is shaped properly.
- **Rebuilding the boards.** To rebuild them after a change:
  1. In Play mode, choose Tools > Namma Bengaluru > Export text signs.
  2. Run `node tools/unity/bake/signs.mjs`.
- **Kannada in the HUD.** Menus and the HUD leave out Kannada text, because TextMeshPro can't shape the script.

See `docs/unity/garage.png`.

### Phase 6b (autos and buses)

- **Auto duty.** In any auto, J puts you on duty. Walkers ahead wave you down (more often in rain and at rush hour). The passenger walks round and climbs into the back, says where they're going, and the GPS takes over. The meter runs at the Bengaluru tariff (₹30 for the first 2 km, ₹15 a km after that, 1.5× at night). Scare a passenger and they bail out; drive gently and they tip.
- **Hiring an auto.** H at any roadside waves down an auto, which is the traffic AI's own vehicle, sent to pull in beside you. Pick a district or your waypoint and ride along with the camera behind it. The driver rushes through the traffic, and you pay the meter (sometimes ₹20 over).
- **BMTC buses.** There are nine real routes, run both ways, with 154 shelters along them (shared where routes overlap) and named after junctions and districts. E at a shelter shows the stops ahead and their fares. The bus comes up the route, stopping at every stop, and you ring the bell (E) or skip to your stop (T).

See `docs/unity/auto-ride.png`.

### Phase 6c (Namma Metro and the railway)

- **Metro routes.** `World/MetroRoutes.cs` ports `metroRoutes()`. Stations sit on straight runs. The ramps between elevated and underground stretches are placed so their street-level part is on land, and where none fits, the line bends sideways into the next block. The city now keeps the ground clear under the viaducts, ramps and stations, as city.js does, which brings building placement there in line with the web game.
- **Metro structures.** `Render/Metro.cs` builds the viaducts, the piers (kept out of junctions and traffic lanes), the covered ramps and tunnel portals, the elevated and underground stations, the 117 street entrances and the name boards.
- **Metro trains.** Twelve three-car BEML trains run both ways, with an 11 s dwell at every station.
- **Riding the metro.** Press E at an entrance to buy a token (change at Majestic for the other line), wait on the platform for a real train, then ride with the camera on the platform, alongside on the viaduct, or low in the tunnel, where the screen darkens. T skips the wait or the ride.
- **The railway.** `Render/City.Railway.cs` ports railway.js: ballasted double track, overhead masts, boundary walls, five stations (KSR Bengaluru City with its clock tower), and WAP-7 rakes that run push-pull between the ends and honk.
- **Level crossings.** The 28 level crossings drop their booms and flash when a train is near, and traffic now waits at them.
- **Static caches.** The project enters Play mode without a domain reload, so `StaticReset.cs` clears the static caches of meshes, materials and textures as each session starts. Without it, the second session in an Editor run failed.

See `docs/unity/metro-station.png`, `metro-ride.png` and `railway.png`.

### Phase 6d (the story)

- **The missions.** All 15 story missions across the three acts are ported: Fast Delivery to The Deal, Majestic to the airport and back.
- **How they're exported.** `tools/unity/export_story.mjs` evaluates story.js's own MISSIONS table with the step helpers swapped for recording ones. It runs every callback (handing over a machete, setting the clock to 9:30 pm, parking the lorry at the APMC yard, the shopkeepers' lines) against a fake context and writes the result to `Resources/Data/story.json`. Every line and action is therefore exactly the web game's. `Systems/Story.cs` runs the steps as story.js does: talk (E skips a line), go (with timers and "get back in the lorry"), collect, fight a crew (bosses marked on the map), wanted, escape, stop a getaway cab, get in, and become.
- **Around the missions.** Mission givers wait at their markers, and MISSION PASSED or FAILED shows when a mission ends. Collections come in from Majestic once Act I is done. Progress saves to PlayerPrefs, and being wasted or busted fails the mission.
- **Act III.** Act III is played as Vinay, who is baked with the other people now. Passers-by are looked up by name (`ModelLibrary.Ped(k)`).

See `docs/unity/mission-passed.png`. Re-export after editing the story: `node tools/unity/export_story.mjs`.

### Phase 6e (landmarks and Cubbon Park)

- **How they're baked.** `tools/unity/bake/landmarks.mjs` runs the real `buildCity` in headless Chromium and wraps every `LANDMARKS[key]` call. Each call draws into its own builder set, so its meshes (per material), colliders, signs (`ctx.sign` and `signs.push`, in world space) and tree scatters are recorded and written to `Resources/Models/landmarks.json`.
- **How they're replayed.** `Render/City.Landmarks.cs` replays each call by key and call index: meshes (mirrored into Unity space), colliders, text signs and the tree scatters, which go through the ported `ScatterTrees`. The RNG therefore advances exactly as in the JS, and the buildings after a landmark match the web game's. All 25 landmarks are in: the Vidhana Soudha, the High Court, the cathedral, the towers, the stadium, the temples, the airport terminal and the rest.
- **Cubbon Park.** Cubbon Park's walks, lamps, benches, bamboo, canopy and railing are a direct port of its builder.
- **Signs.** The landmark signs were added to the text-sign bake (331 boards now).
- **Not yet.** The airport's and air-force station's moving parts (taxiing planes, the radar) are drawn still.

See `docs/unity/vidhana-soudha.png`. Re-bake after editing landmarks.js: `node tools/unity/bake/landmarks.mjs`, then export and re-bake the text signs.

### Phase 6f (pause screen, settings, live weather, touch)

- **Pause screen.** The game opens on the pause screen, the web game's `#help` card with the full key list. Play (or Enter) starts it, and Esc pauses.
- **Settings.** The settings panel has the same options and presets as settings.js (resolution, shadows off, near or full, bloom, draw distance, traffic, pedestrians, look sensitivity, invert, live weather, volume, touch controls) and saves to PlayerPrefs. The sliders are − / + steppers, and a select cycles when you tap it.
- **Performance mode.** O toggles the Low preset and back.
- **Where settings go.** They're applied to the URP asset (render scale and shadow distance, put back when Play mode ends), the camera (shadows, draw distance), the post-processing volume (bloom), traffic density, the walker count, the camera rig and the audio.
- **Live weather.** The weather polls Open-Meteo every 10 minutes and sets the rain to Bengaluru's real sky. The clock shows it, for example "Overcast 27°C · live". K takes over the weather for the session.
- **Touch controls.** The touch controls are touch.js's: a floating joystick on the left, drag to look on the right, and context buttons that change between on foot and driving, plus the strip along the top (pause, map, accept, duty, skip, get off, leave). With touch controls on, the HUD moves aside as style.css does.

See `docs/unity/pause.png`, `settings.png` and `touch.png`.

### Phase 7 (street props, the car pack, halos, contact shadows, ground shading)

- **Baked ground shading** (`ao.js`). `Render/GroundShading.cs` paints the same top-down map at load as the JS: shade next to buildings, walls and piers, under trees and under the metro viaducts, then blurred. The City and Instanced shaders darken the ground by it near street level, and darken walls towards their foot (`Resources/Shaders/GroundAO.hlsl`). The lit signs, water and leaves are left out, as in the web game.
- **Contact shadows** (`blobs.js`). Every vehicle, person and cow standing in the world gets a soft rounded shadow, drawn as one mesh per frame.
- **Halos** (`halos.js`). Glows round the street lamps (at night), the lit signal bulbs, headlights and tail lights at dusk and night, and police light bars while the siren is on. They're camera-facing quads built in the vertex shader and blended additively, with the web game's gain for a linear frame.
- **The traffic-cars pack** (`packVehicles.js`). `models.mjs` loads `public/models/traffic-cars.glb` after the procedural variants, so those bake unchanged. It builds each pack vehicle with `buildPackModel` and bakes it like the others (one skinned mesh, wheels as bones), with its texture atlas as `Baked/pack_atlas*.png`. `ModelLibrary.Pick` gives a type the pack's vehicles at the JS's `PACK_SHARE` rate. They're drawn on the vehicle shader with its `_BASEMAP` variant, and dents, scorching and fire work on them as on the rest.
- **Street props** (`props.js`). The Poly Haven benches, chairs, utility boxes, barrels, tyres, planters and rubbish bags are baked from `public/models/street-props.glb` (their meshes into `Resources/Models/props.json`, the texture into `Baked/props.png`). `Render/StreetProps.cs` draws the nearest 30 of each kind round the camera, refilled every 0.3 s, as an instanced draw per kind.

Both GLBs keep their licences (CC-BY-4.0 for the car pack, CC0 for the props): see `MODEL_CREDITS.md`.

See `docs/unity/ground-shading.png`, `halos-night.png`, `pack-vehicle.png` and `street-props.png`. Re-bake after changing either GLB or the vehicle builders: `node --max-old-space-size=6144 tools/unity/bake/models.mjs`.
