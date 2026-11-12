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
| `world/city.js` | `Render/City.cs`, `Render/InstancedForest.cs`, `Render/CityMaterials.cs` | Mostly: see below |
| `world/infrastructure.js` | in `Render/City.cs` | Done except the railway |
| `systems/colliders.js` | `World/Colliders.cs` | Done |
| `world/ao.js` (baked ground shading) | | Not yet |
| `entities/vehicle.js` | `Entities/Vehicle.cs` (physics, damage), `Entities/VehicleView.cs` | Done (dents and fire effects to come) |
| `entities/vehicleModels.js`, `carBodies.js`, `liveries.js` | Baked by `tools/unity/bake/models.mjs` to `Resources/Models/vehicles.*`, built by `Render/ModelLibrary.cs` | Done (123 variants of all 27 types) |
| `entities/packVehicles.js` | | Not yet (the GLB traffic-cars pack) |
| `entities/human.js` | Baked to `Resources/Models/humans.*`; poses in `Entities/Human.cs` | Done (78 people) |
| `entities/player.js` | `Entities/Player.cs` | On foot, jumping, wading, getting in and out, driving; weapons and fighting to come |
| `systems/cameraRig.js`, `input.js` | `Systems/CameraRig.cs`, `Systems/GameInput.cs` | Done |
| `main.js` (start-up, parking, vehicle contacts, `__game.step`) | `Game.cs` | In part |
| `entities/traffic.js` | `Entities/Traffic.cs` | Done (level crossings wait for the railway port) |
| `systems/signals.js` | `Systems/Signals.cs` | Done |
| `systems/environment.js`, `world/sky.js` (colours) | `Systems/Environment.cs`, `Resources/Shaders/Sky.shader` | Done (live weather to come) |
| `entities/pedestrians.js` | `Entities/StreetLife.cs` | Done (cows have square edges; bus-platform crowds wait for the landmarks) |
| `ui/hud.js` | | Phase 4 (next) |
| `systems/audio.js`, `audioSynth.js`, `police.js`, `weapons.js`, `particles.js`, `entities/gangs.js` | | Phase 5 |
| `systems/missions.js`, `story.js`, `rides.js`, `route.js`, `autoDuty.js`, `metroRide.js`, `garages.js`, `gps.js`, `settings.js`, `liveWeather.js`, `ui/touch.js` | | Phase 6 |
| `world/landmarks.js`, `metro.js`, `railway.js`, `signboards.js`, `props.js`, `halos.js`, `blobs.js` | | Phase 2 and 6 |

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

Still to come for the city, each tracked below:
- Landmark builders (`landmarks.js`): their sites are reserved and paved, nothing stands there yet.
- Cubbon Park's walks, lamps and railings (its trees are there).
- The railway, and the metro viaducts and their clearances.
- Text signs (street, underpass, hotel crowns, fuel totems): collected, not drawn yet.
- Poly Haven street props (`props.js`): positions are collected; needs a glTF importer.
- Baked ground shading (`ao.js`), lamp light pools at night.

Each of the first four draws random numbers in the JS, so until they're in, the building
choices after the first of them differ from the web game's (the layout and lots don't).

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
