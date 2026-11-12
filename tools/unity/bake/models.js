// Builds the web game's vehicle models with its own procedural builders (several seeded variants
// per type; the traffic-cars GLB pack isn't loaded, so every model is procedural) and packs them
// for Unity: vertices de-duplicated, positions float32, normals int8, colour and PBR uint8, one
// rigid bone per vertex. models.mjs writes the result.
import { buildVehicleModel, VEHICLE_TYPES } from '/src/entities/vehicleModels.js';
import { decalAtlas } from '/src/entities/liveries.js';
import { createHuman, B as BONES } from '/src/entities/human.js';
import { mulberry32 } from '/src/world/textures.js';

// garages.js FOR_SALE: [type, model].
const GARAGE = [['scooter', 'activa'], ['scooter', 'ola'], ['scooter', 'ather'], ['bike', null], ['sportBike', null], ['auto', null], ['van', 'omni'], ['van', 'eeco'],
  ['hatch', 'alto'], ['hatch', 'tiago'], ['hatch', 'i10'], ['hatch', 'swift'], ['hatch', 'baleno'], ['hatch', 'i20'], ['sedan', 'dzire'], ['sedan', 'etios'], ['suv', 'punch'],
  ['sedan', 'city'], ['suv', 'venue'], ['suv', 'brezza'], ['suv', 'innova'], ['suv', 'creta'], ['suv', 'seltos'], ['suv', 'carens'], ['suv', 'scorpio'], ['suv', 'thar'],
  ['suv', 'hector'], ['suv', 'xuv700'], ['suv', 'fortuner']];
const VARIANTS = { default: 4, hatch: 8, sedan: 8, taxi: 4, suv: 6, scooter: 6, bike: 5, auto: 4, bus: 6, cityBus: 4, ksrtc: 4 };

function pack(geo, withPbr, withSkin) {
  const P = geo.attributes.position, N = geo.attributes.normal, C = geo.attributes.color, U = geo.attributes.uv, R = geo.attributes.pbr, S = geo.attributes.skinIndex;
  const map = new Map(), pos = [], nor = [], col = [], uv = [], pbr = [], bone = [], idx = [];
  for (let i = 0; i < P.count; i++) {
    const v = [P.getX(i), P.getY(i), P.getZ(i)], n = [N.getX(i), N.getY(i), N.getZ(i)];
    const c = C ? [C.getX(i), C.getY(i), C.getZ(i)] : [1, 1, 1], t = U ? [U.getX(i), U.getY(i)] : [0, 0];
    const p = withPbr && R ? [R.getX(i), R.getY(i), R.getZ(i)] : [0.6, 0, 0], b = withSkin && S ? S.getX(i) : 0;
    const key = [...v, ...n, ...c, ...t, ...p, b].map((x) => Math.round(x * 4096)).join(',');
    let k = map.get(key);
    if (k === undefined) {
      k = pos.length / 3; map.set(key, k);
      pos.push(...v); nor.push(...n.map((x) => Math.round(Math.max(-1, Math.min(1, x)) * 127)));
      col.push(...c.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255)));
      uv.push(...t); pbr.push(Math.round(p[0] * 255), Math.round(p[1] * 255), Math.round(Math.min(2, p[2]) / 2 * 255)); bone.push(b);
    }
    idx.push(k);
  }
  return { pos, nor, col, uv, pbr, bone, idx };
}

window.bake = async () => {
  try { await Promise.race([document.fonts.load('800 40px "Baloo Tamma 2"', 'ಕನ್ನಡ Aa'), new Promise((r) => setTimeout(r, 4000))]); } catch { /* ignore */ }
  const models = [];
  const add = (type, seed, m, extra = {}) => {
    const sk = m.mesh.skeleton;
    const bones = sk.bones.map((b) => ({ parent: sk.bones.indexOf(b.parent), p: [b.position.x, b.position.y, b.position.z] }));
    models.push({
      type, seed, spec: m.spec, color: m.color ?? null, modelKey: m.modelKey ?? null, livery: m.livery?.name ?? m.livery ?? null,
      driverSeat: m.driverSeat ?? null, lightBar: m.lightBar ?? null,
      bones, wheels: m.wheels.map((w) => ({ steer: w.steer ? sk.bones.indexOf(w.steer) : -1, spin: sk.bones.indexOf(w.spin), r: w.r })),
      body: pack(m.mesh.geometry, true, true),
      decal: m.decalMesh ? pack(m.decalMesh.geometry, false, false) : null,
      ...extra,
    });
  };
  for (const type of Object.keys(VEHICLE_TYPES)) {
    const n = VARIANTS[type] || VARIANTS.default;
    for (let k = 0; k < n; k++) {
      const seed = 1000 + k * 7919 + type.length * 31;
      add(type, seed, buildVehicleModel(type, mulberry32(seed)));
    }
  }
  // Garage stock: one of every model Chikka Motors sells (and the red Activa you start with), in
  // the base paint 0xb01c22, flagged so traffic never picks them. The port repaints them by
  // swapping that colour's vertices, as garages.js recolor() does.
  for (const [type, model] of GARAGE) add(type, 4242, buildVehicleModel(type, mulberry32(4242), { model: model ?? undefined, color: 0xb01c22 }), { garage: true, modelKey: model });
  // People: the player, then seeded passers-by in every outfit (and police, riders, hawkers).
  const humans = [];
  const bakeHuman = (name, opts, seed) => {
    const h = createHuman(opts, mulberry32(seed));
    const sk = h.mesh.skeleton;
    humans.push({ name, outfit: h.outfit, female: h.female, gait: h.gait, bones: sk.bones.map((b) => ({ parent: sk.bones.indexOf(b.parent), p: [b.position.x, b.position.y, b.position.z] })), boneNames: Object.keys(BONES), body: pack(h.mesh.geometry, false, true) });
  };
  bakeHuman('player', { outfit: 'shirt', top: 0x3a6ea5, bottom: 0x22304a, skin: 0xa8693c, shoes: 0xeeeeee, female: false }, 1);
  for (let k = 0; k < 48; k++) bakeHuman('ped' + k, {}, 5000 + k * 104729);
  for (const outfit of ['shirt', 'tshirt', 'kurta', 'saree', 'lungi', 'office', 'churidar']) for (let k = 0; k < 3; k++) bakeHuman(`${outfit}${k}`, { outfit }, 9000 + k * 31 + outfit.length);
  for (let k = 0; k < 4; k++) bakeHuman('police' + k, { outfit: 'police', lathi: k % 2 === 0 }, 12000 + k);
  for (let k = 0; k < 4; k++) bakeHuman('helmet' + k, { helmet: true }, 13000 + k * 7);
  const mat = decalAtlas();
  return { models, humans, decalAtlas: mat.map.image.toDataURL('image/png'), decalGlow: mat.emissiveMap ? mat.emissiveMap.image.toDataURL('image/png') : null };
};
window.ready = true;
