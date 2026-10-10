// Namma Metro Purple Line viaduct above MG Road, with a station and running trains.
import * as THREE from 'three';
import { BuilderSet } from './meshBuilder.js';
import { put } from './landmarks.js';
import { textTexture } from './textures.js';
import { WORLD_MIN, WORLD_MAX } from '../config.js';

const DECK_Y = 9.5;
const STATION = { x0: -55, x1: 55 };

export function buildMetro(scene, layout, colliders) {
  const road = layout.zRoads.find((r) => r.metro);
  if (!road) return { update() {} };
  const z = road.pos;
  const group = new THREE.Group();
  group.name = 'metro';
  scene.add(group);
  const B = new BuilderSet();
  const con = B.get('concrete');
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 16);
  const concrete = 0xbfbab0;

  // Deck and parapets.
  con.box(0, DECK_Y, z, WORLD_MAX - WORLD_MIN, 1.6, 9.5, concrete, { bottom: true });
  con.box(0, DECK_Y + 1.6, z - 4.6, WORLD_MAX - WORLD_MIN, 1.1, 0.3, 0xd8d4cc);
  con.box(0, DECK_Y + 1.6, z + 4.6, WORLD_MAX - WORLD_MIN, 1.1, 0.3, 0xd8d4cc);
  // Purple stripe on the parapet.
  B.get('paint').box(0, DECK_Y + 1.0, z - 4.76, WORLD_MAX - WORLD_MIN, 0.35, 0.02, 0x6a2c91, { top: false });
  B.get('paint').box(0, DECK_Y + 1.0, z + 4.76, WORLD_MAX - WORLD_MIN, 0.35, 0.02, 0x6a2c91, { top: false });
  // Rails.
  for (const tz of [-2.2, 2.2]) for (const o of [-0.75, 0.75]) B.get('metal').box(0, DECK_Y + 1.6, z + tz + o, WORLD_MAX - WORLD_MIN, 0.15, 0.1, 0x7a7a7a);

  // Piers in the median, skipping junctions.
  for (let x = WORLD_MIN + 15; x < WORLD_MAX - 10; x += 30) {
    const nearJunction = layout.xRoads.some((r) => Math.abs(x - r.pos) < r.width / 2 + 2);
    if (nearJunction) continue;
    put(con, cyl, x, DECK_Y / 2, z, concrete, 0, 0.95, DECK_Y, 0.95);
    con.box(x, DECK_Y - 1.2, z, 2.4, 1.2, 7, concrete);
    colliders.addCentered(x, z, 1.9, 1.9, DECK_Y, 'pier');
  }

  // MG Road station: concourse box spanning the road, with stairs down to the footpaths.
  const sw = STATION.x1 - STATION.x0, scx = (STATION.x0 + STATION.x1) / 2;
  con.box(scx, DECK_Y - 1.5, z, sw, 1.5, 22, 0xd0ccc4, { bottom: true });
  B.get('glass').box(scx, DECK_Y + 2.7, z, sw, 4.5, 21, 0x9fb8c8, { top: false });
  B.get('paint').box(scx, DECK_Y + 7.2, z, sw + 2, 0.6, 24, 0xf2f2f2);
  B.get('paint').box(scx, DECK_Y + 0.0, z - 11.05, sw, 1.2, 0.1, 0x6a2c91, { top: false });
  B.get('paint').box(scx, DECK_Y + 0.0, z + 11.05, sw, 1.2, 0.1, 0x6a2c91, { top: false });
  for (const sx of [-1, 1]) {
    const px = scx + sx * (sw / 2 - 6);
    for (const sz of [-1, 1]) {
      const pz = z + sz * (road.width / 2 + 2);
      put(con, cyl, px, DECK_Y / 2, pz, concrete, 0, 0.7, DECK_Y, 0.7);
      colliders.addCentered(px, pz, 1.4, 1.4, DECK_Y, 'pier');
    }
  }
  // Station name boards.
  const boardMat = new THREE.MeshBasicMaterial({ map: textTexture(['ಎಂ.ಜಿ. ರಸ್ತೆ', 'M.G. ROAD'], { bg: '#6a2c91', w: 1024, h: 256 }), toneMapped: false });
  for (const [bz, ry] of [[z - 12.1, Math.PI], [z + 12.1, 0]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), boardMat);
    m.position.set(scx, DECK_Y + 5.5, bz);
    m.rotation.y = ry;
    group.add(m);
  }

  const mats = {
    concrete: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.6 }),
  };
  B.buildAll(mats, group);

  // Trains.
  const trains = [makeTrain(mats, z - 2.2, 1, -300), makeTrain(mats, z + 2.2, -1, 250)];
  trains.forEach((t) => group.add(t.group));

  const update = (dt) => {
    for (const t of trains) {
      if (t.wait > 0) {
        t.wait -= dt;
        if (t.wait <= 0) t.speed = 0;
        continue;
      }
      const atStation = Math.abs(t.x - scx) < 1 && !t.stopped;
      if (atStation) { t.wait = 12; t.stopped = true; continue; }
      if (Math.abs(t.x - scx) > 5) t.stopped = false;
      // Accelerate, and brake for the station.
      const toStation = (scx - t.x) * t.dir;
      const target = toStation > 0 && toStation < 120 && !t.stopped ? Math.max(2, toStation * 0.18) : 20;
      t.speed += Math.sign(target - t.speed) * Math.min(Math.abs(target - t.speed), 2.5 * dt);
      t.x += t.speed * t.dir * dt;
      if (t.x > WORLD_MAX + 80) t.x = WORLD_MIN - 80;
      if (t.x < WORLD_MIN - 80) t.x = WORLD_MAX + 80;
      t.group.position.x = t.x;
    }
  };
  return { update, group };
}

function makeTrain(mats, z, dir, x) {
  const B = new BuilderSet();
  const p = B.get('paint'), g = B.get('glass');
  const cars = 3, len = 20;
  for (let k = 0; k < cars; k++) {
    const cx = (k - 1) * (len + 0.6);
    p.box(cx, DECK_Y + 2.0, 0, len, 3.0, 2.9, 0xd8dade);
    p.box(cx, DECK_Y + 2.3, 0, len + 0.02, 0.5, 2.92, 0x6a2c91, { top: false });
    g.box(cx, DECK_Y + 3.0, 0, len - 1, 1.1, 2.94, 0x1a2228, { top: false });
    p.box(cx, DECK_Y + 1.7, 0, len - 2, 0.35, 2.4, 0x333333, { top: false });
  }
  // Cab front.
  const ends = [-(len * 1.5 + 0.6), len * 1.5 + 0.6];
  for (const e of ends) p.box(e + Math.sign(-e) * 0.2, DECK_Y + 2.0, 0, 0.5, 3.0, 2.7, 0x6a2c91);
  const group = new THREE.Group();
  B.buildAll(mats, group);
  group.position.set(x, 0, z);
  return { group, x, dir, speed: 20, wait: 0, stopped: false };
}
