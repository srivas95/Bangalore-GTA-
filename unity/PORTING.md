# Porting Namma Bengaluru to Unity

The Unity version lives in `unity/NammaBengaluru` (Unity 6000.6.9f1, URP). It is a port of the
web game in `src/`, not a remake: the same city is generated from the same data with the same
algorithms, and the game's own physics (tyre model, colliders, kinematic traffic) are ported
as they are, so it drives and behaves the same. Unity does the rendering, input, audio, UI and
builds.

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
| `world/city.js`, `meshBuilder.js`, `textures.js`, `surface.js`, `geom.js`, `ao.js`, `infrastructure.js` | | Phase 2 |
| `systems/colliders.js` | | Phase 2 |
| `entities/player.js`, `human.js`, `vehicle.js`, `vehicleModels.js`, `carBodies.js`, `liveries.js`, `packVehicles.js` | | Phase 3 |
| `systems/cameraRig.js`, `input.js` | | Phase 3 |
| `entities/traffic.js`, `pedestrians.js`, `systems/signals.js`, `environment.js`, `ui/hud.js` | | Phase 4 |
| `systems/audio.js`, `audioSynth.js`, `police.js`, `weapons.js`, `particles.js`, `entities/gangs.js` | | Phase 5 |
| `systems/missions.js`, `story.js`, `rides.js`, `route.js`, `autoDuty.js`, `metroRide.js`, `garages.js`, `gps.js`, `settings.js`, `liveWeather.js`, `ui/touch.js` | | Phase 6 |
| `world/landmarks.js`, `metro.js`, `railway.js`, `signboards.js`, `props.js`, `halos.js`, `blobs.js`, `sky.js` | | Phase 2 and 6 |

### Phase 1 check (world core)

C# and JS agree on all of it: 755 roads, 2,510 junctions (44 with signals, 32 named), 8,728
directed traffic edges, 1,919 blocks and 26 islands with the same zones and coordinate sums,
all 23 landmark sites and 11 hotels in the same blocks, 41 underpasses, 28 level crossings,
both flyovers, 9,261,151 filled raster cells, and the same answers to spatial queries. The C#
build takes 1.9 s (JS: 2.8 s).
