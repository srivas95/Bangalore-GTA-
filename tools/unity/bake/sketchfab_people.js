// Retargets rigged Sketchfab characters (CC0 / CC BY; picked in sketchfab_people.json, downloaded by
// sketchfab_fetch.py) onto the game's own 13-bone human skeleton (human.js: root, hips, spine,
// chest, neck, shoulders and elbows, hips and knees), which Human.cs animates in code:
//  - the rig's bones are recognised from the rig itself: arms and legs by name (upper arm, forearm,
//    thigh, shin in any of the usual spellings), left and right by where they are, the hips as the
//    joint both thighs hang from, the chest as the one both arms hang from, the neck as the start of
//    the chain to the top of the head; every other joint (hands, fingers, feet, toes, twist bones,
//    clavicles, the head) goes with the nearest of those above it;
//  - the character is turned to face +z and posed as the game's rest pose (arms and legs hanging
//    straight down), then scaled so its hips are at the game's hip height (0.92 m);
//  - the posed mesh is skinned onto the game's bones, placed at the character's own joints, with
//    up to four weights per vertex (from the rig's own weights);
//  - its textures go into one atlas (sketchfab.js bakeMaterials).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeMaterials } from './sketchfab.js';

export const GAME_BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'shL', 'elL', 'shR', 'elR', 'thL', 'knL', 'thR', 'knR'];
const PARENT = [-1, 0, 1, 2, 3, 3, 5, 3, 7, 1, 9, 1, 11];
const HIP_Y = 0.92;

// A joint's name without rig prefixes and the exporter's _<n> suffix, lower case.
const clean = (n) => (n || '').replace(/^(mixamorig\d*[:_]?|girlBone_|CC_Base_|DEF[-_.]|ORG[-_.])/i, '').replace(/_\d+$/, '').replace(/_Armature$/i, '').toLowerCase();
const isForearm = (n) => /forearm|lower_?arm|lowarm|elbow/.test(n);
const isUpperArm = (n) => !isForearm(n) && !/armature/.test(n) && /(upper_?arm|uparm|(^|[._\s-]|left|right)arm($|[._\s-]))/.test(n);
const isThigh = (n) => /upleg|up_leg|thigh|upper_?leg/.test(n);
const isShin = (n) => !isThigh(n) && /(calf|shin|lower_?leg|lowleg|knee|(^|[._\s-]|left|right)leg($|[._\s-]))/.test(n);

function worldPos(o) { return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); }

// Turn joint `a` (world space) so the direction to its child `b` points along `dir`.
function aim(a, b, dir) {
  const pa = worldPos(a), pb = worldPos(b);
  const cur = pb.sub(pa).normalize();
  if (cur.lengthSq() < 1e-8) return;
  const q = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
  const wq = new THREE.Quaternion(); a.getWorldQuaternion(wq);
  const pq = new THREE.Quaternion(); if (a.parent) a.parent.getWorldQuaternion(pq);
  a.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
  a.updateMatrixWorld(true);
}

const pathUp = (j, stop) => { const p = []; for (let o = j; o && o !== stop; o = o.parent) p.push(o); return p; };
function lca(a, b) { const s = new Set(pathUp(a)); for (let o = b; o; o = o.parent) if (s.has(o)) return o; return null; }

export async function bakePerson(cfg) {
  const gltf = await new GLTFLoader().loadAsync(`/tools/unity/bake/sketchfab_cache/${cfg.uid}.glb`);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const skinned = [], rigid = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); else if (o.isMesh) rigid.push(o); });
  if (!skinned.length) throw new Error('not rigged');
  // The rig: every bone of every skin, in bind pose.
  const joints = [...new Set(skinned.flatMap((m) => m.skeleton.bones))];
  // (The nodes as loaded are the rest pose. Skeleton.pose() would take a root bone's bind matrix as
  // its local transform, dropping the armature node's own scale and turn that Sketchfab exports have.)
  scene.updateMatrixWorld(true);
  const named = joints.map((j) => [j, clean(j.name)]);
  const pick = (test) => named.filter(([, n]) => test(n)).map(([j]) => j);
  const ups = pick(isUpperArm), fores = pick(isForearm), thighs = pick(isThigh), shins = pick(isShin);
  // The topmost of each kind on each side (twist and helper bones come below their limb bone).
  const depth = (j) => pathUp(j).length;
  const twoSides = (list, label) => {
    const top = list.filter((j) => !list.some((k) => k !== j && pathUp(j).includes(k)));
    if (top.length < 2) throw new Error(`no ${label} pair (${list.map((j) => j.name).join(', ')})`);
    // The pair furthest apart sideways (the rig is still unturned: use the larger horizontal spread).
    let best = [top[0], top[1]], bd = -1;
    for (const a of top) for (const b of top) { if (a === b) continue; const d = worldPos(a).sub(worldPos(b)); d.y = 0; if (d.length() > bd && Math.abs(depth(a) - depth(b)) <= 1) { bd = d.length(); best = [a, b]; } }
    return best;
  };
  const [ua, ub] = twoSides(ups, 'upper arm'), [ta, tb] = twoSides(thighs, 'thigh');
  // Facing: the character's left is +x when it faces +z.
  const left = worldPos(ua).sub(worldPos(ub)); left.y = 0;
  const fwd = new THREE.Vector3().crossVectors(left, new THREE.Vector3(0, 1, 0)).normalize();
  // (cross(left, up) faces +z when left is +x)
  scene.rotation.y = -Math.atan2(fwd.x, fwd.z); // turns fwd onto +z
  scene.updateMatrixWorld(true);
  const [uL, uR] = worldPos(ua).x > worldPos(ub).x ? [ua, ub] : [ub, ua];
  const [tL, tR] = worldPos(ta).x > worldPos(tb).x ? [ta, tb] : [tb, ta];
  const below = (top, list) => list.filter((j) => j !== top && pathUp(j).includes(top)).sort((a, b) => depth(a) - depth(b))[0];
  const fL = below(uL, fores) || uL.children.find((c) => c.isBone), fR = below(uR, fores) || uR.children.find((c) => c.isBone);
  const sL = below(tL, shins) || tL.children.find((c) => c.isBone), sR = below(tR, shins) || tR.children.find((c) => c.isBone);
  const hips = lca(tL, tR), chest = lca(uL, uR);
  if (!hips || !chest || !fL || !fR || !sL || !sR) throw new Error('rig not recognised');
  // Neck: chest's child on the way to the highest joint that isn't in an arm.
  const armSet = new Set([...pathUp(uL), ...pathUp(uR)].filter((j) => !pathUp(chest).includes(j)));
  let top = null;
  chest.traverse((o) => { if (o.isBone && o !== chest && !armSet.has(o) && ![...armSet].some((a) => pathUp(o).includes(a)) && (!top || worldPos(o).y > worldPos(top).y)) top = o; });
  const chestToTop = top ? pathUp(top, chest).reverse() : [];
  const neck = chestToTop.find((j) => /neck/.test(clean(j.name))) || chestToTop[0] || chest;
  // Spine: between the hips and the chest, the joint nearest 40% of the way up (if there is one).
  const mids = pathUp(chest, hips).slice(1);
  const hy = worldPos(hips).y, cy = worldPos(chest).y;
  const spine = mids.length ? mids.reduce((b, j) => (Math.abs(worldPos(j).y - (hy + 0.4 * (cy - hy))) < Math.abs(worldPos(b).y - (hy + 0.4 * (cy - hy))) ? j : b)) : null;

  // Pose as the game's rest pose: arms and legs hanging straight down (the arms a touch out from the body).
  const childToward = (j, hint) => j.children.find((c) => c.isBone && hint(clean(c.name))) || j.children.find((c) => c.isBone);
  aim(uL, fL, new THREE.Vector3(0.07, -1, 0)); aim(uR, fR, new THREE.Vector3(-0.07, -1, 0));
  const hL = childToward(fL, (n) => /hand|wrist/.test(n)), hR = childToward(fR, (n) => /hand|wrist/.test(n));
  if (hL) aim(fL, hL, new THREE.Vector3(0.04, -1, 0)); if (hR) aim(fR, hR, new THREE.Vector3(-0.04, -1, 0));
  aim(tL, sL, new THREE.Vector3(0, -1, 0)); aim(tR, sR, new THREE.Vector3(0, -1, 0));
  const kL = childToward(sL, (n) => /foot|ankle/.test(n)), kR = childToward(sR, (n) => /foot|ankle/.test(n));
  if (kL) aim(sL, kL, new THREE.Vector3(0, -1, 0)); if (kR) aim(sR, kR, new THREE.Vector3(0, -1, 0));
  scene.updateMatrixWorld(true);

  // Which game bone each rig joint (and anything hanging off it) goes with.
  const role = new Map([[hips, 1], [chest, 3], [neck, 4], [uL, 5], [fL, 6], [uR, 7], [fR, 8], [tL, 9], [sL, 10], [tR, 11], [sR, 12]]);
  if (spine) role.set(spine, 2);
  const boneOf = (o) => { for (let p = o; p; p = p.parent) if (role.has(p)) return role.get(p); return 1; };

  // The posed mesh, skinned by hand (three's skinning: bindMatrixInverse · Σ w · boneMatrix · bindMatrix).
  const parts = [];
  const tmp = new THREE.Vector3(), nrm = new THREE.Vector3(), acc = new THREE.Matrix4(), bm = new THREE.Matrix4();
  for (const m of skinned) {
    const g0 = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const P = g0.attributes.position, N = g0.attributes.normal, SI = g0.attributes.skinIndex, SW = g0.attributes.skinWeight, n = P.count;
    const sk = m.skeleton, bones = sk.bones.map((b, k) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[k]));
    const toWorld = new THREE.Matrix4().multiplyMatrices(m.matrixWorld, m.bindMatrixInverse);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), si = new Uint8Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const e = acc.elements; e.fill(0);
      const wsum = new Map();
      for (let c = 0; c < 4; c++) {
        const w = SW.getComponent(i, c); if (w <= 0) continue;
        const k = SI.getComponent(i, c);
        const be = bones[k].elements;
        for (let q = 0; q < 16; q++) e[q] += be[q] * w;
        const gb = boneOf(sk.bones[k]);
        wsum.set(gb, (wsum.get(gb) || 0) + w);
      }
      bm.multiplyMatrices(toWorld, acc).multiply(m.bindMatrix);
      tmp.fromBufferAttribute(P, i).applyMatrix4(bm); pos.set([tmp.x, tmp.y, tmp.z], i * 3);
      nrm.fromBufferAttribute(N, i).transformDirection(bm); nor.set([nrm.x, nrm.y, nrm.z], i * 3);
      const top4 = [...wsum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), tot = top4.reduce((t, [, w]) => t + w, 0) || 1;
      top4.forEach(([b, w], c) => { si[i * 4 + c] = b; sw[i * 4 + c] = w / tot; });
      if (!top4.length) { si[i * 4] = 1; sw[i * 4] = 1; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    for (const k of ['uv', 'color']) if (g0.attributes[k]) { const a = g0.attributes[k], arr = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c); geo.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize)); }
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    // (One part per material group.)
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const groups = Array.isArray(m.material) && g0.groups.length ? g0.groups : [{ start: 0, count: n, materialIndex: 0 }];
    for (const gr of groups) {
      const sub = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(geo.attributes)) sub.setAttribute(k, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
      parts.push({ geo: sub, mat: mats[gr.materialIndex] || mats[0] });
    }
  }
  // Rigid pieces (a hat or glasses parented to a bone) go with that bone.
  for (const m of rigid) {
    if (m.visible === false) continue;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count, b = boneOf(m.parent), si = new Uint8Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = b; sw[i * 4] = 1; }
    const geo = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'color']) if (g.attributes[k]) { const a = g.attributes[k], arr = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c); geo.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize)); }
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    parts.push({ geo, mat: Array.isArray(m.material) ? m.material[0] : m.material });
  }

  // Stray pieces (a prop left at the origin, a ground plane) far from the body are dropped.
  const hp = worldPos(hips), reach = 1.6 * Math.max(0.01, (top ? worldPos(top).y : worldPos(neck).y) - hp.y);
  for (let i = parts.length - 1; i >= 0; i--) {
    parts[i].geo.computeBoundingBox();
    if (parts[i].geo.boundingBox.getCenter(new THREE.Vector3()).distanceTo(hp) > reach) parts.splice(i, 1);
  }
  // ... and so are flat pieces wider than the body (a floor the character stands on).
  const bodyH = Math.max(0.01, (top ? worldPos(top).y : worldPos(neck).y) - hp.y) * 2;
  for (let i = parts.length - 1; i >= 0; i--) {
    const sz = parts[i].geo.boundingBox.getSize(new THREE.Vector3());
    if (sz.y < 0.03 * bodyH && Math.max(sz.x, sz.z) > 0.8 * bodyH) parts.splice(i, 1);
  }
  if (!parts.length) throw new Error('no body mesh near the skeleton');
  // Scale and place: hips at the game's hip height, feet on y = 0, centred on the hips.
  const box = new THREE.Box3(); parts.forEach((p) => box.union(p.geo.boundingBox));
  const s = HIP_Y / Math.max(0.05, hp.y - box.min.y);
  const T = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-hp.x, -box.min.y, -hp.z));
  parts.forEach((p) => { p.geo.applyMatrix4(T); });
  const J = (o) => (o ? worldPos(o).applyMatrix4(T) : null);
  // The game skeleton at the character's joints (identity rotations, as human.js builds it).
  const at = [new THREE.Vector3(0, 0, 0), J(hips), null, J(chest), J(neck), J(uL), J(fL), J(uR), J(fR), J(tL), J(sL), J(tR), J(sR)];
  at[1].set(0, HIP_Y, 0);
  at[2] = spine ? J(spine) : at[1].clone().lerp(at[3], 0.4);
  const bones = at.map((p, k) => ({ parent: PARENT[k], p: (PARENT[k] < 0 ? p : p.clone().sub(at[PARENT[k]])).toArray() }));
  const atlas = bakeMaterials(parts);
  const geometry = mergeGeometries(parts.map((p) => p.geo));
  const height = box.getSize(new THREE.Vector3()).y * s;
  if (height < 1.3 || height > 2.1) throw new Error(`implausible height ${height.toFixed(2)} m (rig and mesh disagree)`);
  return { name: 'sf:' + cfg.uid, bones, geometry, atlas: atlas.canvas, height, dbg: { hipY: +hp.y.toFixed(3), minY: +box.min.y.toFixed(3), maxY: +box.max.y.toFixed(3), headY: top ? +worldPos(top).y.toFixed(3) : null }, map: { hips: hips.name, spine: spine?.name, chest: chest.name, neck: neck.name, uL: uL.name, fL: fL.name, tL: tL.name, sL: sL.name } };
}

// Review picture: the baked person on the game skeleton in its rest pose, front and side.
export function reviewPerson(t, renderer) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdddddd);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.4));
  const d = new THREE.DirectionalLight(0xffffff, 1.4); d.position.set(2, 4, 5); scene.add(d);
  const tex = new THREE.CanvasTexture(t.atlas); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.8 });
  for (const [x, ry] of [[-0.55, 0], [0.55, Math.PI / 2]]) { const m = new THREE.Mesh(t.geometry, mat); m.position.x = x; m.rotation.y = ry; scene.add(m); }
  const cam = new THREE.PerspectiveCamera(30, 3 / 4, 0.1, 50); cam.position.set(0, 1.0, 4.6); cam.lookAt(0, 0.9, 0);
  renderer.setSize(240, 320); renderer.render(scene, cam);
  return renderer.domElement.toDataURL('image/jpeg', 0.85);
}
