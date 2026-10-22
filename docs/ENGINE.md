# Rendering engine: decision record

**Decision (October 2026): stay on three.js with `WebGLRenderer`.** Don't port the game to
three.js's `WebGPURenderer`, Babylon.js, PlayCanvas or Godot for now.

## Why

The drop in frame rate that prompted the question was in the game's own code, not in the
engine. Profiled on the same scenes before and after the fixes:

| | Before | After |
|---|---|---|
| Draw calls per frame, phone settings | ~690–700 | ~430–470 |
| Triangles per frame, phone settings | 1.06–1.13 M | 0.65–0.75 M |
| Draw calls per frame, desktop | 871–941 | 572–615 |
| Simulation CPU per frame (headless desktop) | ~14 ms | ~6 ms |

The causes were: the sky light map rebuilt (and reallocated) every 3 s; every shop sign drawn
everywhere with its own texture, because their distance culling measured from the world origin;
trees switching detail a 320 m chunk at a time, with every tree in the chunk casting shadows;
every pedestrian drawn into the shadow map; off-screen metro parts drawn; nothing culled by the
fog; and traffic re-scanning its neighbours a dozen times per car per frame. None of that would
have improved with a different engine, and all of it would have been ported along.

A port would also cost frame rate where it matters most:

- three.js's `WebGPURenderer` falls back to its own WebGL 2 backend wherever WebGPU isn't
  available, and that path currently spends more CPU per draw call than `WebGLRenderer`.
- WebGPU isn't available in the Android System WebView on many devices yet, so the Android
  app would run on that slower fallback.
- Babylon.js, PlayCanvas or Godot would mean rewriting the ~17,000 lines that build the city,
  vehicles and people, for no measured gain.

## If we revisit it

Do it when WebGPU is broadly available in Android WebView and three.js's WebGPU backend has
lower per-draw overhead than `WebGLRenderer` on our scene. The port is contained to these
custom shader sites, each of which needs a TSL (node material) version:

| File | What | TSL replacement |
|---|---|---|
| `world/meshBuilder.js` `makePbrMaterial` | Per-vertex roughness / metalness / glow | `MeshStandardNodeMaterial` with `roughnessNode`, `metalnessNode`, `emissiveNode` from `attribute('pbr')` |
| `world/ao.js` `withAO` | Wall-foot darkening and the baked ground shading map | `colorNode = materialColor × aoFactor(positionWorld, normalWorld, texture(aoMap))` |
| `world/blobs.js` | Rounded-rectangle contact shadows | `MeshBasicNodeMaterial` with an `opacityNode` from `uv()` |
| `world/halos.js` | Lamp and headlight halos (`ShaderMaterial`) | Instanced `SpriteNodeMaterial` |
| `systems/particles.js` | Smoke, fire, sparks as sized points | Instanced sprites (WebGPU points are always 1 px) |
| `systems/environment.js` | Rain streaks, night dome, `Sky`, PMREM | TSL `positionNode` for rain, `SkyMesh`, the WebGPU `PMREMGenerator` |
| `main.js` | Bloom via `EffectComposer` | `PostProcessing` with TSL `bloom()` |

Renderer API differences to handle: `await renderer.init()`, `renderer.info.render.drawCalls`,
`getMaxAnisotropy()`, the shadow map's manual update flags, and the context-loss handler.
