// Baked ambient shading (port of src/world/ao.js): walls darken towards their foot, and the
// ground darkens next to buildings and walls, under trees and under the metro viaducts, from the
// top-down map painted at load by Render/GroundShading.cs. Positions are game coordinates.
#ifndef NB_GROUND_AO
#define NB_GROUND_AO
TEXTURE2D(_NB_AOMap); SAMPLER(sampler_NB_AOMap);
float4 _NB_AOXform;  // world minX, minZ, 1/width, 1/depth (zero until the map is baked)
float _NB_AOWall;    // how much darker the foot of a wall is (1 - uAOWall; zero until set)

half NBGroundAO(float3 gp, half ny)
{
    // Walls: darker over the first couple of metres above street level.
    float wh = saturate(abs(gp.y - 0.15) / 3.5);
    half wall = lerp(1.0 - _NB_AOWall, 1.0, sqrt(wh));
    // Ground: the shading map, only near street level (not on roofs or decks).
    half g = 1;
    if (_NB_AOXform.z > 0) g = SAMPLE_TEXTURE2D(_NB_AOMap, sampler_NB_AOMap, (gp.xz - _NB_AOXform.xy) * _NB_AOXform.zw).r;
    half low = smoothstep(-1.6, -0.8, gp.y) * (1.0 - smoothstep(0.8, 2.5, gp.y));
    half flatness = smoothstep(0.55, 0.85, abs(ny));
    return lerp(wall, lerp(1.0, g, low), flatness);
}
#endif
