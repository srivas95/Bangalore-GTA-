// World-space detail added to the city's standard materials (all of them run withAO() first, which
// provides the world position and normal varyings used here). Costs a few ALU ops per pixel and no
// extra textures: weathering and per-building variation on facades, a wall mask so the paint
// colour lands on plaster but not on window frames and glass, randomly lit windows at night,
// macro variation that hides tiling on the ground, painted kerbs, and the shop-front atlas.
import { DETAIL } from './detail.js';

const NOISE = /* glsl */`
float svHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float svNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(svHash(i), svHash(i + vec2(1.0, 0.0)), u.x), mix(svHash(i + vec2(0.0, 1.0)), svHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float svFbm(vec2 p) {
  #ifdef SV_LITE
    return svNoise(p);
  #else
    return 0.5 * svNoise(p) + 0.3 * svNoise(p * 2.03 + 7.1) + 0.2 * svNoise(p * 4.1 + 3.3);
  #endif
}
`;

function patch(mat, tag, fn) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${DETAIL.lite ? '#define SV_LITE\n' : ''}${NOISE}`);
    fn(s);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}+sv-${tag}`;
  return mat;
}

// Lit windows at night: the emissive map has every window lit, and each window picks for itself
// whether it's on and whether it's a warm bulb or a cool tubelight. grid: windows per texture tile.
const windowLights = (grid) => /* glsl */`
#ifdef USE_EMISSIVEMAP
{
  vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
  vec2 wc = floor( vEmissiveMapUv * vec2( ${grid[0].toFixed(1)}, ${grid[1].toFixed(1)} ) );
  float seed = dot( floor( vAOPos.xz / 40.0 ), vec2( 7.13, 3.71 ) );
  float h = fract( sin( dot( wc, vec2( 12.9898, 78.233 ) ) + seed * 1.7 ) * 43758.5453 );
  vec3 wt = mix( vec3( 1.0, 0.8, 0.55 ), vec3( 0.8, 0.92, 1.0 ), step( 0.6, fract( h * 13.7 ) ) );
  totalEmissiveRadiance *= emissiveColor.rgb * step( h, 0.42 ) * wt * ( 0.55 + 0.9 * fract( h * 7.1 ) );
}
#endif
`;

// Painted facades (plaster, apartment, heritage). Wall texels are mid-light grey in the textures;
// window glass is dark and frames are near-white, so a luminance band picks out the wall.
export function facadeSurface(mat, grid = [2, 2]) {
  return patch(mat, `facade${grid}`, (s) => {
    s.fragmentShader = s.fragmentShader
      .replace('#include <color_fragment>', /* glsl */`
float svGlass = 0.0;
#ifdef USE_COLOR
{
  float lum = dot( sampledDiffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
  svGlass = 1.0 - smoothstep( 0.03, 0.12, lum );
  float wall = smoothstep( 0.24, 0.42, lum ) * ( 1.0 - smoothstep( 0.78, 0.88, lum ) );
  float bh = fract( sin( dot( vColor.rgb, vec3( 12.989, 78.233, 37.719 ) ) ) * 43758.5453 );
  vec3 tint = mix( vec3( dot( vColor.rgb, vec3( 0.3, 0.59, 0.11 ) ) ), vColor.rgb, 0.8 ) * mix( 0.9, 1.06, bh ) * mix( 0.9, 1.05, svNoise( vAOPos.xz * 0.02 ) );
  diffuseColor.rgb *= mix( vec3( 1.0 ), tint, wall );
  // Monsoon streaks running down the walls, and splash grime along the foot.
  float streak = svFbm( vec2( ( vAOPos.x + vAOPos.z ) * 1.7, vAOPos.y * 0.12 + bh * 9.0 ) );
  float grime = smoothstep( 0.48, 0.9, streak ) * 0.34 + ( 1.0 - smoothstep( 0.3, 2.4, vAOPos.y ) ) * 0.22;
  diffuseColor.rgb *= 1.0 - grime * ( 0.35 + 0.65 * wall );
}
#endif
`)
      .replace('#include <emissivemap_fragment>', windowLights(grid))
      // Window glass (the darkest texels) is smooth and a little metallic: it mirrors the sky.
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix( roughnessFactor, 0.1, svGlass );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix( metalnessFactor, 0.55, svGlass );');
  });
}

// Glass towers and anything else that just needs the per-window lights.
export function windowSurface(mat, grid) {
  return patch(mat, `win${grid}`, (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', windowLights(grid));
  });
}

// Shop fronts: an atlas of COLS x ROWS shop types; each 8 m tile picks one from the box's seed
// (vertex colour red) and its position along the frontage. Sampled with explicit gradients so
// the atlas cells don't seam where the UVs wrap.
export function shopSurface(mat, cols, rows) {
  const n = cols * rows;
  const sample = (tex, out) => /* glsl */`
  {
    float vi = floor( fract( vColor.r * 7.13 + floor( vMapUv.x ) * 0.618 + floor( vMapUv.y ) * 0.31 ) * ${n.toFixed(1)} );
    vec2 cell = vec2( mod( vi, ${cols.toFixed(1)} ), floor( vi / ${cols.toFixed(1)} ) );
    vec2 sc = vec2( ${(1 / cols).toFixed(6)}, ${(1 / rows).toFixed(6)} );
    vec2 suv = ( clamp( fract( vMapUv ), 0.004, 0.996 ) + cell ) * sc;
    ${out} = textureGrad( ${tex}, suv, dFdx( vMapUv ) * sc, dFdy( vMapUv ) * sc );
  }`;
  return patch(mat, `shop${cols}x${rows}`, (s) => {
    s.fragmentShader = s.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
#ifdef USE_MAP
  vec4 sampledDiffuseColor;
  ${sample('map', 'sampledDiffuseColor')}
  diffuseColor *= sampledDiffuseColor;
#endif
`)
      .replace('#include <color_fragment>', /* glsl */`
  diffuseColor.rgb *= mix( 0.86, 1.04, svNoise( vAOPos.xz * 0.05 ) ) * ( 1.0 - ( 1.0 - smoothstep( 0.3, 1.6, vAOPos.y ) ) * 0.18 );
`)
      .replace('#include <emissivemap_fragment>', /* glsl */`
#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor;
  ${sample('emissiveMap', 'emissiveColor')}
  totalEmissiveRadiance *= emissiveColor.rgb;
#endif
`);
  });
}

// Ground surfaces: two scales of world-space variation so tiles never visibly repeat. kerb: paint
// the kerb faces black and yellow (or leave them bare concrete in some neighbourhoods).
export function groundSurface(mat, { kerb = false, strength = 1 } = {}) {
  return patch(mat, `ground${kerb ? 'K' : ''}${strength}`, (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', /* glsl */`
#include <color_fragment>
  diffuseColor.rgb *= mix( 1.0, mix( 0.8, 1.08, svFbm( vAOPos.xz / 23.0 ) ) * mix( 0.93, 1.04, svNoise( vAOPos.xz / 3.1 ) ), ${strength.toFixed(2)} );
  ${kerb ? /* glsl */`
  if ( vAONy < 0.5 && vAOPos.y < 0.35 ) {
    float paint = step( 0.38, svNoise( vAOPos.xz / 70.0 ) );
    float st = step( 0.5, fract( ( vAOPos.x + vAOPos.z ) * 0.5 ) );
    vec3 kc = mix( vec3( 0.02 ), vec3( 0.62, 0.42, 0.02 ), st );
    diffuseColor.rgb = mix( vec3( 0.42, 0.4, 0.37 ), kc, paint ) * mix( 0.7, 1.0, svNoise( vAOPos.xz * 2.0 ) );
  }` : ''}
`);
  });
}
