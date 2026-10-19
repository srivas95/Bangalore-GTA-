# Graphics engine options (review, October 2026)

**Question:** should the game move to a different graphics engine or rendering model to fix how it looks
and runs?

**Short answer:** keep Three.js. The poor look came from content and lighting, not from WebGL or Three.js:
- **Candy colours.** A candy palette was multiplied over whole facades, frames and glass included.
- **Trees.** They were lumpy single-colour blobs.
- **Repeated tiles.** One shop-front tile was used everywhere, and the ground was uniform.
- **Sky.** Three's Preetham sky went black the moment the sun set.

Choppiness came from the frame loop:
- the sky's lighting was rebuilt every 3 seconds;
- the shadow map was redrawn every frame;
- 17,000 scene objects were updated every frame;
- vehicles were built on the main thread while driving;
- there was a lot of per-frame garbage.

Another engine would draw the same content and inherit the same loop. The fixes in v0.8.0 (below) address
both causes directly. The "new model" worth adopting later is Three.js's own WebGPU renderer, which falls back
to WebGL2 by itself.

## Options

| Option | Platforms (web · Android · Windows) | Visual ceiling | Mid-range Android | Engine size | Licence | Migration for this codebase |
|---|---|---|---|---|---|---|
| **Three.js, upgraded in place** (recommended) | Web/PWA · WebView APK · Electron; WebGPU with automatic WebGL2 fallback | High: GTAO, SSR, TRAA, bloom, LUT grading in the node post-processing | Good once draw calls are kept down | ~0.2–0.3 MB gz | MIT | Incremental. Bump r170 → current in days, then port 6 custom shaders to TSL and switch to WebGPURenderer in 2–4 weeks. Gameplay untouched. |
| Babylon.js 9 | Same as Three.js | High, more built in (frame graph, clustered lights, SSAO2/SSR/TAA, Havok) | Similar, heavier JS | 1.5–3 MB min | Apache-2.0 | Rewrite the render layer (27 files), 1–3 months, for roughly the same picture. |
| PlayCanvas 2.x | Same as Three.js | Medium-high | Good | ~0.6 MB gz | MIT (Editor is paid SaaS) | As big a port as Babylon; no gain for a code-first procedural game. |
| Godot 4.x | Web is WebGL2 only (no WebGPU), ~40 MB · native · native | Web medium; native high | Native good, web weak | ~40 MB web | MIT | Full rewrite in GDScript (mesh generation, UI, audio, physics), 4–8 months. |
| Unity 6 | Web (WebGPU opt-in) · native · native | Web medium-high; native high | Native very good; web heavy (~200 MB RAM) | 3–6 MB empty web build | Free under $200k revenue; Pro paid per seat | Full C# rewrite with the editor pipeline, 6+ months. |
| Unreal Engine 5 | No web target · native · native | Very high | Demanding | 100+ MB | 5% royalty over $1M | Full rewrite, 9+ months; wrong tool for a browser-first game. |

**WebGPU reach in 2026.**
- **Android:** about three in four Android browsers have WebGPU, against about 99% for WebGL2. Chrome and the
  Android System WebView (which the Capacitor app uses) have it on Android 12+ with Qualcomm/ARM GPUs, plus a
  compatibility mode on recent versions for older phones.
- **iOS and Electron:** Safari 26 shipped it, and Electron inherits it from Chromium.
- **Upshot:** a WebGL2 path stays mandatory, which Three.js's WebGPURenderer provides automatically.

## Rendering style

- **Stylised PBR with procedural textures (the base).** This keeps the tiny download, offline play and phone
  performance. It needs art direction to avoid looking plastic, which is what v0.8.0 adds: weathered palette,
  grime, varied shop fronts, leaf trees, real sky light.
- **CC0 photo textures and HDRIs** (Poly Haven, ambientCG) as a small, KTX2-compressed detail layer: about
  5–15 MB for ground, pavers and foliage. A good next step for close-up realism. Fixed HDRI skies don't suit the
  day/night cycle, so the procedural sky stays.
- **Toon/cel:** cheap and readable, but off-genre for a GTA-style city.

## Recommended path

1. **Done in v0.8.0:** performance fixes and an art and lighting pass in the current WebGL2 renderer (see "Look"
   in the README).
2. **Next:** upgrade three.js to the current release, still on WebGLRenderer. Re-check shadows (PCFSoftShadowMap
   was removed upstream), the energy-conserving PBR change, and Clock → Timer.
3. **Then:** port the custom shaders (`ao.js`, `blobs.js`, `surface.js`, `meshBuilder.js` PBR, `halos.js`,
   `sky.js`, particles) to TSL node materials and switch to WebGPURenderer with its WebGL2 fallback. Add tiered
   post-processing:
   - phones: bloom and LUT grading;
   - desktop: GTAO, TRAA and SSR.
4. **Only if native-quality mobile becomes the goal:** prototype a native Godot build alongside the web game.

Sources: [three.js WebGPURenderer manual](https://threejs.org/manual/pages/webgpurenderer.html),
[gpuweb implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status),
[web3dsurvey](https://web3dsurvey.com/), [Godot web export docs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html),
[Unity WebGPU](https://docs.unity3d.com/6000.6/Documentation/Manual/WebGPU.html),
[Babylon.js docs](https://doc.babylonjs.com/), [PlayCanvas plans](https://playcanvas.com/plans).
