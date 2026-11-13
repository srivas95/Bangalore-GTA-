# Unity Asset Store packs

The Unity build can use free packs from the Unity Asset Store. Their licence allows shipping them inside a built game, not publishing their files. So everything taken from them goes into `unity/NammaBengaluru/Assets/StoreAssets/`, which is gitignored. Without that folder the game builds and plays as before.

## The scripts

These read a package straight from a share link. A `.unitypackage` is a gzipped tar, so a pack doesn't need importing whole.

- `pkglist.py <drive file id> <out.json>`: lists a package's assets and their sizes.
- `pkgget.py <drive file id> <out dir> <file name>…`: extracts only the named assets.
- `store_audio.py`: turns the extracted recordings into sound-bank entries. It writes `StoreAssets/Resources/StoreAudio/<key>.ogg` and `bank.json`. Each clip is matched in loudness to the game's own clip under the same key, or to the pool it joins.
  - Ambience beds become seamless 45 s loops.
  - The engine loops and the horn get their pitch (f0) and the horn its sustain region.
  - `GameAudio` merges `bank.json` over the game's own bank.

## In the game

- **Sounds:** ambience and rain beds, thunder, the car engine and horn, doors, guns, plus extra voices, punches, crashes, metal, glass, explosions and footsteps. They come from Gregor Quendel, InspectorJ Audio, NoxSound and Olivier Girardot packs.
- **Decoration:** Polytope Studio's "Low Poly Environment – Nature Free" supplies shrubs, grass, poppies, rocks and a few fruit trees in the parks, and rocks along the lakes (`Render/StoreDecor.cs`). The meshes and textures are in `StoreAssets/Resources/Polytope/`.
