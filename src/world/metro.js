// Namma Metro: elevated viaducts with stations and running trains, one per line in METRO_LINES.
import * as THREE from 'three';
import { BuilderSet } from './meshBuilder.js';
import { put } from './landmarks.js';
import { textTexture } from './textures.js';
import { METRO_LINES } from '../config.js';

const DECK_Y = 9.5;
const ST_HALF = 55;

export function buildMetro(scene, layout, colliders) {
  const group = new THREE.Group();
  group.name = 'metro';
  scene.add(group);
  const mats = {
    concrete: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.6 }),
  };
  const trains = [];
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 16);
  for (const line of METRO_LINES) {
    const road = layout.findRoad(line.road);
    if (!road) continue;
    const z = road.pos;
    const B = new BuilderSet();
    const con = B.get('concrete');
    const concrete = 0xbfbab0;
    const L = line.to - line.from, mid = (line.from + line.to) / 2;
    con.box(mid, DECK_Y, z, L, 1.6, 9.5, concrete, { bottom: true });
    for (const s of [-1, 1]) {
      con.box(mid, DECK_Y + 1.6, z + s * 4.6, L, 1.1, 0.3, 0xd8d4cc);
      B.get('paint').box(mid, DECK_Y + 1.0, z + s * 4.76, L, 0.35, 0.02, line.color, { top: false });
    }
    for (const tz of [-2.2, 2.2]) for (const o of [-0.75, 0.75]) B.get('metal').box(mid, DECK_Y + 1.6, z + tz + o, L, 0.15, 0.1, 0x7a7a7a);
    // Piers in the median, skipping junctions.
    for (let x = line.from + 15; x < line.to - 10; x += 30) {
      if (layout.xRoads.some((r) => Math.abs(x - r.pos) < r.width / 2 + 2)) continue;
      put(con, cyl, x, DECK_Y / 2, z, concrete, 0, 0.95, DECK_Y, 0.95);
      con.box(x, DECK_Y - 1.2, z, 2.4, 1.2, 7, concrete);
      colliders.addCentered(x, z, 1.9, 1.9, DECK_Y, 'pier');
    }
    // Stations.
    for (const st of line.stations) {
      const sx = st.at;
      con.box(sx, DECK_Y - 1.5, z, ST_HALF * 2, 1.5, 22, 0xd0ccc4, { bottom: true });
      B.get('glass').box(sx, DECK_Y + 2.7, z, ST_HALF * 2, 4.5, 21, 0x9fb8c8, { top: false });
      B.get('paint').box(sx, DECK_Y + 7.2, z, ST_HALF * 2 + 2, 0.6, 24, 0xf2f2f2);
      for (const s of [-1, 1]) B.get('paint').box(sx, DECK_Y, z + s * 11.05, ST_HALF * 2, 1.2, 0.1, line.color, { top: false });
      for (const px of [sx - ST_HALF + 6, sx + ST_HALF - 6]) {
        for (const s of [-1, 1]) {
          const pz = z + s * (road.width / 2 + 2);
          put(con, cyl, px, DECK_Y / 2, pz, concrete, 0, 0.7, DECK_Y, 0.7);
          colliders.addCentered(px, pz, 1.4, 1.4, DECK_Y, 'pier');
        }
      }
      const board = new THREE.MeshBasicMaterial({ map: textTexture([st.kn, st.en], { bg: '#' + line.color.toString(16).padStart(6, '0'), w: 1024, h: 256 }), toneMapped: false });
      for (const [bz, ry] of [[z - 12.1, Math.PI], [z + 12.1, 0]]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), board);
        m.position.set(sx, DECK_Y + 5.5, bz);
        m.rotation.y = ry;
        group.add(m);
      }
    }
    B.buildAll(mats, group);
    const t1 = makeTrain(mats, z - 2.2, 1, line.from + L * 0.3, line);
    const t2 = makeTrain(mats, z + 2.2, -1, line.from + L * 0.7, line);
    for (const t of [t1, t2]) { group.add(t.group); trains.push(t); }
  }

  const update = (dt) => {
    for (const t of trains) {
      if (t.wait > 0) { t.wait -= dt; continue; }
      const next = t.line.stations.map((s) => s.at).filter((a) => (a - t.x) * t.dir > 0.5).sort((a, b) => (a - b) * t.dir)[0];
      let target = 20;
      if (next !== undefined) { const d = (next - t.x) * t.dir; if (d < 120) target = Math.max(1.5, d * 0.18); if (d < 0.8) { t.wait = 12; t.speed = 0; t.x = next; continue; } }
      t.speed += Math.sign(target - t.speed) * Math.min(Math.abs(target - t.speed), 2.5 * dt);
      t.x += t.speed * t.dir * dt;
      if (t.x > t.line.to + 80) t.x = t.line.from - 80;
      if (t.x < t.line.from - 80) t.x = t.line.to + 80;
      t.group.position.x = t.x;
    }
  };
  return { update, group, trains };
}

// Namma Metro (BEML) trainset: brushed-stainless cars with a stripe in the line colour along the
// lower body, glazed doors, and cab ends whose windscreen and dark nose panel sit in a frame
// painted in the line colour (purple or green).
function makeTrain(mats, z, dir, x, line) {
  const B = new BuilderSet();
  const p = B.get('paint'), g = B.get('glass'), m = B.get('metal');
  const cars = 3, len = 20, Y = DECK_Y;
  const steel = 0xb8bcc0, doorCol = 0xa2a6aa, dark = 0x3a3d42;
  for (let k = 0; k < cars; k++) {
    const cx = (k - 1) * (len + 0.6);
    m.box(cx, Y + 2.3, 0, len, 2.7, 2.9, steel, { bottom: true });
    p.box(cx, Y + 2.0, 0, len, 0.32, 2.86, 0x55595e, { top: false }); // skirt
    p.box(cx, Y + 5.0, 0, len - 0.4, 0.1, 2.5, 0x8a8e92); // roof
    for (const rx of [-5, 3]) p.box(cx + rx, Y + 5.1, 0, 2.4, 0.3, 1.6, 0x9a9ea2); // roof equipment
    p.box(cx, Y + 2.95, 0, len, 0.14, 2.94, line.color, { top: false }); // line-colour stripe
    // Doors (four a side) with tall glazing; windows between them.
    for (const dx of [-7.5, -2.5, 2.5, 7.5]) {
      p.box(cx + dx, Y + 2.33, 0, 1.4, 2.3, 2.92, doorCol, { top: false });
      p.box(cx + dx, Y + 2.95, 0, 1.4, 0.14, 2.95, line.color, { top: false });
      for (const o of [-0.33, 0.33]) g.box(cx + dx + o, Y + 3.25, 0, 0.5, 1.15, 2.96, 0x161c22, { top: false });
    }
    for (const wx of [-5, 0, 5]) g.box(cx + wx, Y + 3.3, 0, 2.6, 1.0, 2.94, 0x161c22, { top: false });
    for (const wx of [-9.2, 9.2]) g.box(cx + wx, Y + 3.3, 0, 1.0, 1.0, 2.94, 0x161c22, { top: false });
    // Bogies and the gangway to the next car.
    for (const bx of [-6.5, 6.5]) p.box(cx + bx, Y + 1.7, 0, 2.6, 0.45, 2.2, 0x2a2a2a, { top: false });
    if (k < cars - 1) p.box(cx + len / 2 + 0.3, Y + 2.3, 0, 0.7, 2.6, 2.2, 0x2a2a2a);
  }
  // Cab ends.
  for (const sg of [-1, 1]) {
    const e = sg * (len * 1.5 + 0.6);
    const at = (d) => e + sg * d;
    m.box(at(0.25), Y + 2.0, 0, 0.5, 0.6, 2.8, steel); // silver nose
    p.box(at(0.4), Y + 2.05, 0, 0.3, 0.25, 0.6, 0x2a2a2a); // coupler
    p.box(at(0.12), Y + 2.6, 0, 0.24, 2.4, 2.9, line.color); // the coloured frame
    p.box(at(0.25), Y + 2.7, 0, 0.06, 0.75, 2.4, dark); // nose panel
    g.box(at(0.25), Y + 3.55, 0, 0.06, 1.25, 2.3, 0x10161c); // windscreen
    p.box(at(0.29), Y + 4.6, 0, 0.03, 0.18, 0.9, 0xffa020); // destination LED
    for (const hz of [-0.95, -0.72, 0.72, 0.95]) p.box(at(0.29), Y + 2.95, hz, 0.03, 0.13, 0.13, 0xf8f6ee); // headlamps
  }
  const group = new THREE.Group();
  B.buildAll(mats, group);
  group.position.set(x, 0, z);
  return { group, x, dir, speed: 20, wait: 0, line };
}
