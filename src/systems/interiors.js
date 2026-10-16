// Walk-in shops: every shopfront in the city has a door you can walk through (look for the
// yellow arrow on the footpath and walk into it). Inside, at the counter (E):
//  - darshinis, biryani houses, cafés, bakeries, sweet shops and pubs: eat to get your health back;
//  - pharmacies: first aid;
//  - hardware shops: lathis, bats, chains, sickles and machetes, and a katta under the counter;
//  - clothes and silk shops: a new look, and the police lose your description;
//  - any shop at all: with a weapon in your hand, rob the till (they'll call the police).
// The rooms are built once per kind of shop, off the edge of the map, and drawn on a camera layer
// of their own while you're inside, so none of the city is drawn behind the walls. The street
// outside carries on as normal; the police wait for you to come out.
import * as THREE from 'three';
import { MeshBuilder, makePbrMaterial } from '../world/meshBuilder.js';
import { put } from '../world/landmarks.js';
import { textTexture, mulberry32 } from '../world/textures.js';
import { createHuman, poseIdle, poseSit, poseHandsUp } from '../entities/human.js';
import { WEAPONS, equip } from './weapons.js';
import { WORLD } from '../world/mapdata.js';

const LAYER = 1;
const RW = 12, RD = 10, RH = 4.2; // room width (x), depth (z), height
const FLOOR = 0.15;
const OUTFIT_KEY = 'namma-bengaluru-outfit-v1';
const PB = { matte: [0.85, 0, 0], wood: [0.6, 0, 0], steel: [0.25, 0.9, 0], glass: [0.05, 0.4, 0.15], lamp: [0.3, 0, 2.2], tile: [0.35, 0, 0], cloth: [0.95, 0, 0], gold: [0.25, 1, 0.5], glow: [0.4, 0, 1.4] };
const UV0 = [0, 0, 1, 1];
const ease = (k, dt) => 1 - Math.exp(-k * dt);

// What kind of shop a signboard is.
function kindOf(s) {
  const n = s.en;
  if (/Pharmacy|Medicals/.test(n)) return 'pharmacy';
  if (/Hardware|Electricals|Engg|Lathe|Tools|Components/.test(n)) return 'hardware';
  if (/Silk|Bata|Handicrafts/.test(n)) return 'clothes';
  if (/Titan|Tanishq/.test(n)) return 'jewellery';
  if (s.food || s.pub) return 'food';
  return 'store';
}
function foodStyle(s) {
  const n = s.en;
  if (s.pub || /Toit|Brew|Bar|Pub|Lounge/.test(n)) return 'pub';
  if (/Biryani|Meghana|Empire|Andhra|Kodava/.test(n)) return 'biryani';
  if (/Coffee|Café|Chai|Kaapi/.test(n)) return 'cafe';
  if (/Bakery|Iyengar/.test(n)) return 'bakery';
  if (/Corner House|Polar|Nandini/.test(n)) return 'sweets';
  if (/Truffles|Rolls|Momos/.test(n)) return 'fast';
  return 'tiffin';
}

// [name, Kannada, price ₹, health]
const MENUS = {
  tiffin: [['Idli Vada', 'ಇಡ್ಲಿ ವಡೆ', 40, 25], ['Masala Dose', 'ಮಸಾಲೆ ದೋಸೆ', 60, 40], ['Benne Masala Dose', 'ಬೆಣ್ಣೆ ಮಸಾಲೆ ದೋಸೆ', 85, 50], ['Rava Idli', 'ರವೆ ಇಡ್ಲಿ', 50, 30], ['Chow Chow Bath', 'ಚೌ ಚೌ ಬಾತ್', 55, 35], ['Full South Indian Meals', 'ಊಟ', 120, 100], ['Filter Coffee', 'ಫಿಲ್ಟರ್ ಕಾಫಿ', 25, 10]],
  biryani: [['Chicken Biryani', 'ಚಿಕನ್ ಬಿರಿಯಾನಿ', 220, 80], ['Mutton Biryani', 'ಮಟನ್ ಬಿರಿಯಾನಿ', 320, 100], ['Ghee Rice and Kurma', 'ತುಪ್ಪದ ಅನ್ನ', 150, 60], ['Chicken 65', 'ಚಿಕನ್ 65', 180, 45], ['Fresh Lime Soda', 'ಲೈಮ್ ಸೋಡಾ', 40, 10]],
  cafe: [['Filter Coffee', 'ಫಿಲ್ಟರ್ ಕಾಫಿ', 30, 10], ['Masala Chai', 'ಮಸಾಲಾ ಚಹಾ', 25, 10], ['Cappuccino', 'ಕ್ಯಾಪುಚಿನೋ', 140, 12], ['Bun Maska', 'ಬನ್ ಮಸ್ಕಾ', 50, 20], ['Veg Puff', 'ವೆಜ್ ಪಫ್', 35, 18]],
  bakery: [['Veg Puff', 'ವೆಜ್ ಪಫ್', 30, 18], ['Egg Puff', 'ಎಗ್ ಪಫ್', 35, 20], ['Honey Cake', 'ಹನಿ ಕೇಕ್', 40, 20], ['Dil Pasand', 'ದಿಲ್ ಪಸಂದ್', 45, 25], ['Benne Biscuit', 'ಬೆಣ್ಣೆ ಬಿಸ್ಕತ್', 40, 15], ['Tea', 'ಟೀ', 15, 6]],
  sweets: [['Death by Chocolate', 'ಡೆತ್ ಬೈ ಚಾಕಲೇಟ್', 220, 30], ['Gadbad Ice Cream', 'ಗಡ್‌ಬಡ್', 120, 25], ['Badam Milk', 'ಬಾದಾಮಿ ಹಾಲು', 50, 20], ['Mysore Pak', 'ಮೈಸೂರು ಪಾಕ್', 60, 25], ['Milk Peda', 'ಪೇಡ', 40, 12]],
  pub: [['Craft Beer (pint)', 'ಬಿಯರ್', 380, 10], ['Chilli Chicken', 'ಚಿಲ್ಲಿ ಚಿಕನ್', 350, 45], ['Masala Peanuts', 'ಕಡಲೆಕಾಯಿ', 150, 20], ['Nachos', 'ನಾಚೋಸ್', 300, 40], ['Fresh Lime Soda', 'ಲೈಮ್ ಸೋಡಾ', 90, 10]],
  fast: [['Burger', 'ಬರ್ಗರ್', 250, 45], ['Kathi Roll', 'ಕಾಠಿ ರೋಲ್', 140, 35], ['Momos', 'ಮೊಮೊಸ್', 120, 30], ['Fries', 'ಫ್ರೈಸ್', 120, 20], ['Thick Shake', 'ಶೇಕ್', 180, 25]],
  pharmacy: [['Paracetamol strip', 'ಮಾತ್ರೆ', 30, 20], ['ORS and glucose', 'ಒಆರ್‌ಎಸ್', 60, 35], ['Bandages and Dettol', 'ಬ್ಯಾಂಡೇಜ್', 150, 60], ['First-aid kit', 'ಪ್ರಥಮ ಚಿಕಿತ್ಸೆ', 350, 100]],
  store: [['Banana', 'ಬಾಳೆಹಣ್ಣು', 10, 6], ['Parle-G', 'ಪಾರ್ಲೆ-ಜಿ', 10, 5], ['Bottle of water', 'ನೀರು', 20, 6], ['Packet of chips', 'ಚಿಪ್ಸ್', 20, 8], ['Mobile recharge (1.5 GB/day)', 'ರೀಚಾರ್ಜ್', 199, 0]],
};
// [weapon, price, rounds]; the katta only from under the counter.
const HARDWARE = [['lathi', 150], ['bat', 450], ['chain', 250], ['knife', 300], ['sickle', 350], ['machete', 800], ['katta', 3500, 3]];
const OUTFITS = [
  ['Mysore silk shirt', 1200, { outfit: 'shirt', top: 0x8a1a5a, bottom: 0x1a1a1a, shoes: 0x2a2018 }],
  ['Kurta and veshti', 800, { outfit: 'kurta', bottom: 0xf4f0e8, shoes: 0x6a4a2a }],
  ['Lungi and banian', 250, { outfit: 'lungi', top: 0xf4f0e8, shoes: 0x2a2018 }],
  ['Office formals', 1500, { outfit: 'office', top: 0xd0d8e8, bottom: 0x2a2a2a, shoes: 0x111111 }],
  ['Delivery partner T-shirt', 300, { outfit: 'tshirt', top: 0xe8601a, bottom: 0x2a3040, shoes: 0xe8e8e8 }],
  ['RCB jersey', 600, { outfit: 'tshirt', top: 0xc8102e, bottom: 0x1a1a1a, shoes: 0xe8e8e8 }],
  ['Your old blue shirt', 0, { outfit: 'shirt', top: 0x3a6ea5, bottom: 0x22304a, shoes: 0xeeeeee }],
];
const TILL = { food: [250, 800], store: [400, 1100], pharmacy: [400, 1000], hardware: [500, 1200], clothes: [600, 1600], jewellery: [2500, 5500] };

// A quad whose winding is fixed up to face `n`.
function face(b, a, p, q, d, n, color, pbr) {
  b.pbr = pbr;
  const ux = p[0] - a[0], uy = p[1] - a[1], uz = p[2] - a[2], vx = q[0] - a[0], vy = q[1] - a[1], vz = q[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) b.quad(d, q, p, a, n, UV0, color); else b.quad(a, p, q, d, n, UV0, color);
}

const G = { cyl: new THREE.CylinderGeometry(1, 1, 1, 14), cone: new THREE.ConeGeometry(1, 1, 4) };

// ---------- rooms ----------
// Each room: local origin in the middle of the floor, the door in the front wall (+z). Returns
// the mesh, solid rectangles (local [x0, x1, z0, z1, height]), and where things are.
function buildRoom(kind, rng) {
  const b = new MeshBuilder({ pbr: true });
  const solid = [];
  const box = (x, y, z, w, h, d, col, pbr, collide = false) => {
    b.pbr = pbr; b.box(x, y, z, w, h, d, col);
    if (collide) solid.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2, y + h]);
  };
  const style = {
    food: { floor: [0x2a2a2a, 0xe8e4dc], dado: 0x8fc0a0, wall: 0xf2e8cc },
    store: { floor: [0xd8d4cc, 0xc8c4bc], dado: 0xb8c8d8, wall: 0xf4f2ec },
    hardware: { floor: [0x8a8a86, 0x7a7a76], dado: 0x6a7a8a, wall: 0xe0dcd0 },
    pharmacy: { floor: [0xf4f4f4, 0xe0e8e4], dado: 0x2a9a5a, wall: 0xf8faf8 },
    clothes: { floor: [0x8a5a3a, 0x7a4a2e], dado: 0x7a2a4a, wall: 0xf8ecd8 },
    jewellery: { floor: [0x6a1a2a, 0x5a1424], dado: 0x3a1a10, wall: 0xf4e4c0 },
  }[kind];
  const hx = RW / 2, hz = RD / 2;
  // Floor tiles, ceiling, walls (a tiled dado, painted above), the door opening.
  for (let x = -hx; x < hx; x += 1) for (let z = -hz; z < hz; z += 1) {
    const c = style.floor[(Math.round(x) + Math.round(z)) & 1];
    face(b, [x, FLOOR, z], [x + 1, FLOOR, z], [x + 1, FLOOR, z + 1], [x, FLOOR, z + 1], [0, 1, 0], c, PB.tile);
  }
  face(b, [-hx, RH, -hz], [hx, RH, -hz], [hx, RH, hz], [-hx, RH, hz], [0, -1, 0], 0xf2f0ea, PB.matte);
  const wall = (ax, az, bx, bz, n, y0, y1, col, pbr = PB.matte) => face(b, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], n, col, pbr);
  const DOOR = 0.9, DH = 2.7;
  for (const [ax, az, bx, bz, n] of [[-hx, -hz, hx, -hz, [0, 0, 1]], [-hx, -hz, -hx, hz, [1, 0, 0]], [hx, -hz, hx, hz, [-1, 0, 0]]]) {
    wall(ax, az, bx, bz, n, FLOOR, 1.3, style.dado, PB.tile);
    wall(ax, az, bx, bz, n, 1.3, RH, style.wall);
  }
  for (const [x0, x1] of [[-hx, -DOOR], [DOOR, hx]]) { wall(x0, hz, x1, hz, [0, 0, -1], FLOOR, 1.3, style.dado, PB.tile); wall(x0, hz, x1, hz, [0, 0, -1], 1.3, RH, style.wall); }
  wall(-DOOR, hz, DOOR, hz, [0, 0, -1], DH, RH, style.wall);
  // The street through the open door: daylight glare.
  wall(-DOOR, hz + 0.3, DOOR, hz + 0.3, [0, 0, -1], FLOOR, DH, 0xe8eef4, PB.glow);
  for (const sx of [-1, 1]) box(sx * (DOOR + 0.05), FLOOR, hz - 0.05, 0.1, DH, 0.12, 0x5a3a20, PB.wood);
  // Walls and the ceiling are solid (for you and for the camera).
  solid.push([-hx - 1, -hx, -hz - 1, hz + 1, RH + 3], [hx, hx + 1, -hz - 1, hz + 1, RH + 3], [-hx - 1, hx + 1, -hz - 1, -hz, RH + 3]);
  solid.push([-hx - 1, -DOOR, hz, hz + 1, RH + 3], [DOOR, hx + 1, hz, hz + 1, RH + 3], [-DOOR, DOOR, hz + 0.25, hz + 1, RH + 3]);
  solid.push([-hx - 1, hx + 1, -hz - 1, hz + 1, RH + 6, RH - 0.15]); // the ceiling (stops the camera; you walk under it)
  // Tube lights.
  for (const x of [-3.5, 0, 3.5]) for (const z of [-2.5, 2]) box(x, RH - 0.08, z, 1.3, 0.06, 0.12, 0xfffcf0, PB.lamp);
  // A framed picture (a deity, or the founder) and a calendar.
  box(hx - 0.05, 2.3, 1.5, 0.06, 0.9, 0.7, 0xc8a040, PB.gold);
  box(hx - 0.08, 2.38, 1.5, 0.04, 0.74, 0.54, [0xc0402a, 0x2a6ac0, 0xe0a020][Math.floor(rng() * 3)], PB.matte);
  box(-hx + 0.05, 2.2, 2.5, 0.04, 0.8, 0.55, 0xf4f4f4, PB.matte);
  box(-hx + 0.08, 2.75, 2.5, 0.03, 0.18, 0.55, 0xc8102e, PB.matte);

  const spots = { counter: { x: -2.5, z: -2.5 }, cashier: { x: -2.5, z: -4.15, h: 0 }, seats: [], stands: [], fans: [] };
  // The counter at the back, and the till.
  const counterCol = kind === 'jewellery' ? 0x3a1a10 : kind === 'pharmacy' ? 0xf4f4f4 : kind === 'food' ? 0x7a4a2a : 0x8a6a4a;
  box(-2.5, FLOOR, -3.4, 4.2, 0.95, 0.8, counterCol, PB.wood, true);
  box(-2.5, FLOOR + 0.95, -3.4, 4.3, 0.06, 0.9, kind === 'food' ? 0xc8ccd0 : 0x2a2a2a, kind === 'food' ? PB.steel : PB.wood);
  box(-3.9, FLOOR + 1.01, -3.45, 0.45, 0.22, 0.35, 0x2a2a2a, PB.matte); // till
  box(-3.9, FLOOR + 1.23, -3.55, 0.3, 0.22, 0.05, 0x40c0ff, PB.glow); // its screen
  spots.board = { x: -2.5, y: 2.9, z: -hz + 0.04, w: 4.2, h: 1.5 };

  if (kind === 'food') {
    // A darshini: glass case of sweets, steel standing tables, a couple of tables with plastic chairs, fans.
    box(-0.6, FLOOR + 1.01, -3.4, 1.2, 0.5, 0.7, 0x9fc8d8, PB.glass);
    for (let k = 0; k < 8; k++) box(-0.95 + (k % 4) * 0.23, FLOOR + 1.05 + Math.floor(k / 4) * 0.22, -3.4, 0.18, 0.08, 0.5, [0xf0b020, 0xe86a20, 0xf8e8c0, 0xc06a2a][k % 4], PB.matte);
    for (const [x, z] of [[2.2, -1.4], [4.3, 0.6], [1.8, 1.8]]) {
      put(b, G.cyl, x, FLOOR + 0.52, z, 0xc8ccd0, 0, 0.42, 1.04, 0.42);
      put(b, G.cyl, x + 0.12, FLOOR + 1.12, z, 0xd8dce0, 0, 0.05, 0.14, 0.05);
      solid.push([x - 0.45, x + 0.45, z - 0.45, z + 0.45, 1.2]);
      spots.stands.push({ x: x - 0.75, z, h: Math.PI / 2 });
    }
    for (const [x, z] of [[-4, 0.5], [-1.6, 2.2]]) {
      box(x, FLOOR + 0.72, z, 1.2, 0.05, 0.8, 0xf0f0f0, PB.matte);
      for (const [lx, lz] of [[-0.5, -0.32], [0.5, -0.32], [-0.5, 0.32], [0.5, 0.32]]) box(x + lx, FLOOR, z + lz, 0.05, 0.72, 0.05, 0x9a9a9a, PB.steel);
      solid.push([x - 0.62, x + 0.62, z - 0.42, z + 0.42, 0.8]);
      for (const sz of [-1, 1]) {
        box(x, FLOOR + 0.42, z + sz * 0.75, 0.45, 0.05, 0.45, 0xc0201a, PB.matte);
        box(x, FLOOR + 0.42, z + sz * 0.96, 0.45, 0.45, 0.05, 0xc0201a, PB.matte);
        spots.seats.push({ x, z: z + sz * 0.72, h: sz > 0 ? Math.PI : 0 });
      }
    }
    // The kitchen hatch, lit, with a stack of steel plates.
    box(3.4, 1.0, -hz + 0.02, 2.4, 1.3, 0.04, 0x2a2a2a, PB.matte);
    box(3.4, 1.05, -hz + 0.05, 2.2, 1.2, 0.03, 0xffe0a0, PB.glow);
    for (let k = 0; k < 6; k++) put(b, G.cyl, 2.7, FLOOR + 1.0 + k * 0.025, -hz + 0.35, 0xd0d4d8, 0, 0.18, 0.02, 0.18);
    box(3.4, FLOOR, -hz + 0.35, 2.6, 1.0, 0.6, 0xc8ccd0, PB.steel, true);
    spots.fans.push({ x: 1.5, z: -0.5 }, { x: -2.5, z: 1.5 });
  } else {
    // Shelves along both side walls, a display stand in the middle.
    const shelfCol = kind === 'pharmacy' ? 0xf4f4f4 : kind === 'hardware' ? 0x5a6a7a : kind === 'jewellery' ? 0x3a1a10 : 0x8a6a4a;
    for (const sx of [-1, 1]) {
      const x = sx * (hx - 0.35);
      for (let z = -3.2; z <= 3.2; z += 2.1) {
        // An open shelf unit: back panel against the wall, sides, four boards.
        box(x + sx * 0.27, FLOOR, z, 0.06, 2.3, 1.9, shelfCol, PB.wood);
        for (const ez of [-0.95, 0.95]) box(x, FLOOR, z + ez, 0.6, 2.3, 0.05, shelfCol, PB.wood);
        solid.push([x - 0.3, x + 0.3, z - 0.98, z + 0.98, FLOOR + 2.3]);
        for (let lv = 0; lv < 4; lv++) {
          const y = FLOOR + 0.25 + lv * 0.55;
          box(x, y - 0.03, z, 0.6, 0.03, 1.9, shelfCol, PB.wood);
          for (let k = 0; k < 6; k++) {
            const pz = z - 0.8 + k * 0.32;
            const col = kind === 'pharmacy' ? [0xffffff, 0x3a7ad0, 0x2a9a5a, 0xf0f0e0][(k + lv) % 4]
              : kind === 'hardware' ? [0x8a8e92, 0xe86a1a, 0x3a3a3a, 0xc8a020, 0x2a5aa0][(k * 3 + lv) % 5]
              : kind === 'jewellery' ? 0xd4a64a
              : kind === 'clothes' ? [0xc0182a, 0xe8a020, 0x1a7a4a, 0x8a1a7a, 0x2a4ac0, 0xf06a9a][(k + lv * 2) % 6]
              : [0xe8302a, 0xf0c020, 0x2a8ad0, 0x3ab04a, 0xf08a2a, 0xffffff][(k * 5 + lv) % 6];
            const hgt = kind === 'clothes' ? 0.14 : 0.18 + ((k * 7 + lv * 3) % 4) * 0.06;
            box(x + sx * 0.04, y, pz, 0.4, hgt, 0.24, col, kind === 'jewellery' ? PB.gold : kind === 'hardware' && col === 0x8a8e92 ? PB.steel : PB.matte);
          }
        }
      }
    }
    if (kind === 'clothes') {
      // Racks of hanging shirts and saris, a mirror, a trial room.
      for (const [x, z] of [[1.0, -0.5], [1.0, 1.8], [3.4, 0.6]]) {
        box(x, FLOOR + 1.55, z, 0.04, 0.04, 1.8, 0x9a9a9a, PB.steel);
        for (const sz of [-1, 1]) box(x, FLOOR, z + sz * 0.9, 0.05, 1.6, 0.05, 0x9a9a9a, PB.steel);
        for (let k = 0; k < 9; k++) box(x, FLOOR + 0.7, z - 0.8 + k * 0.2, 0.42, 0.85, 0.04, [0xc0182a, 0xe8a020, 0x1a7a4a, 0x8a1a7a, 0x2a4ac0, 0xf06a9a, 0xffffff, 0x2a2a2a, 0xe05a1a][(k + Math.round(x)) % 9], PB.cloth);
        solid.push([x - 0.3, x + 0.3, z - 1, z + 1, 1.6]);
      }
      box(-hx + 0.05, FLOOR + 0.3, -0.6, 0.04, 2.0, 1.0, 0xd8e0e8, PB.steel); // mirror
      box(hx - 1.2, FLOOR, -hz + 1.0, 1.8, 2.4, 0.06, 0x7a1a3a, PB.cloth); // trial room curtain
    } else if (kind === 'jewellery') {
      for (const x of [0.5, 3.0]) {
        box(x, FLOOR, 0.2, 1.8, 0.9, 0.8, 0x3a1a10, PB.wood, true);
        box(x, FLOOR + 0.9, 0.2, 1.8, 0.35, 0.8, 0xbcd8e8, PB.glass);
        for (let k = 0; k < 6; k++) put(b, G.cyl, x - 0.65 + k * 0.26, FLOOR + 0.95, 0.2, 0xe8c04a, 0, 0.09, 0.02, 0.09);
      }
      box(0, FLOOR + 0.002, 1.8, 6, 0.01, 2.4, 0x8a1020, PB.cloth); // carpet
    } else {
      // A gondola of goods in the middle.
      box(1.8, FLOOR, 0.6, 3.2, 1.3, 0.9, shelfCol, PB.wood, true);
      for (let k = 0; k < 10; k++) box(0.45 + k * 0.3, FLOOR + 1.3, 0.6, 0.22, 0.18 + (k % 3) * 0.08, 0.5, kind === 'hardware' ? [0x8a8e92, 0xe86a1a, 0xc8a020][k % 3] : kind === 'pharmacy' ? [0xffffff, 0x3a7ad0, 0x2a9a5a][k % 3] : [0xe8302a, 0xf0c020, 0x2a8ad0, 0x3ab04a][k % 4], PB.matte);
      if (kind === 'hardware') {
        for (let k = 0; k < 5; k++) put(b, G.cyl, 3.6 + (k % 2) * 0.5, FLOOR + 0.25, -1.6 + Math.floor(k / 2) * 0.5, [0xe03a2a, 0x2a6ac0, 0xf0c020, 0x2a9a4a, 0xffffff][k], 0, 0.2, 0.5, 0.2); // paint tins
        box(1.5, 1.6, -hz + 0.04, 3.4, 1.4, 0.04, 0xc8a878, PB.wood); // pegboard
        for (let k = 0; k < 7; k++) box(0.1 + k * 0.45, 1.75 + (k % 2) * 0.4, -hz + 0.1, 0.08, 0.5, 0.06, 0x6a6e72, PB.steel);
      }
      if (kind === 'pharmacy') {
        box(1.5, 3.1, -hz + 0.04, 0.9, 0.3, 0.05, 0x10c060, PB.glow); // the green cross
        box(1.5, 2.8, -hz + 0.04, 0.3, 0.9, 0.05, 0x10c060, PB.glow);
      }
    }
  }
  return { b, solid, spots };
}

// The menu board / name board: a canvas texture.
function boardTexture(title, sub, lines, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 366;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = fg; x.textAlign = 'center';
  x.font = 'bold 64px "Oswald", Arial, sans-serif';
  x.fillText(title, 512, 74);
  x.font = '30px "Noto Sans Kannada", Arial, sans-serif';
  x.fillText(sub || '', 512, 116);
  x.font = '30px "Noto Sans Kannada", Arial, sans-serif';
  x.textAlign = 'left';
  lines.slice(0, 8).forEach((l, i) => { x.fillText(l, i < 4 ? 50 : 540, 172 + (i % 4) * 46); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Interiors {
  constructor(scene, layout, colliders, hud, audio, missions, world, pois) {
    Object.assign(this, { scene, layout, colliders, hud, audio, missions, world });
    this.shops = (pois.shops || []).map((s) => ({ ...s, kind: kindOf(s.sign), style: s.sign.food || s.sign.pub ? foodStyle(s.sign) : null }));
    // A coarse grid of entrances, for finding the doors near you.
    this.cells = new Map();
    for (const s of this.shops) {
      const k = `${Math.floor(s.x / 60)},${Math.floor(s.z / 60)}`;
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(s);
    }
    this.material = makePbrMaterial({ envMapIntensity: 0.4 });
    this.rooms = {};
    this.active = null; // the shop you're in
    this.menu = null;
    this.fade = 0;
    this.cool = 0;
    this.near = [];
    this.scanT = 0;
    this.buildMarkers();
    this.buildDom();
    this.robbed = new Map();
  }

  // ---------- door markers ----------
  buildMarkers() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc830, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const arrow = new THREE.ConeGeometry(0.3, 0.55, 4);
    arrow.rotateX(Math.PI);
    const ring = new THREE.RingGeometry(0.5, 0.68, 24);
    ring.rotateX(-Math.PI / 2);
    const beam = new THREE.CylinderGeometry(0.55, 0.55, 2.2, 16, 1, true);
    beam.translate(0, 1.1, 0);
    this.markers = [];
    for (let k = 0; k < 8; k++) {
      const g = new THREE.Group();
      const a = new THREE.Mesh(arrow, mat), r = new THREE.Mesh(ring, ringMat), b = new THREE.Mesh(beam, beamMat);
      a.position.y = 1.5;
      g.add(a, r, b);
      g.visible = false;
      g.userData.arrow = a;
      this.scene.add(g);
      this.markers.push(g);
    }
    // The way out, inside: a green ring.
    const exitMat = new THREE.MeshBasicMaterial({ color: 0x40e070, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    this.exitRing = new THREE.Mesh(ring, exitMat);
    this.exitRing.layers.set(LAYER);
    this.exitRing.visible = false;
    this.scene.add(this.exitRing);
  }

  buildDom() {
    const el = document.createElement('div');
    el.id = 'shop-menu';
    document.getElementById('hud').appendChild(el);
    el.addEventListener('click', (e) => {
      const it = e.target.closest('.gm-item');
      if (it) { this.sel = +it.dataset.i; this.tap = true; }
      if (e.target.closest('.gm-foot')) this.tapClose = true;
    });
    this.el = el;
    const f = document.createElement('div');
    f.id = 'fade';
    document.body.appendChild(f);
    this.fadeEl = f;
  }

  // The doors within reach of (x, z), nearest first.
  doorsNear(x, z, r) {
    const out = [];
    const cx = Math.floor(x / 60), cz = Math.floor(z / 60);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const s of this.cells.get(`${cx + i},${cz + j}`) || []) {
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < r) out.push({ s, d });
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }

  // ---------- rooms ----------
  room(kind) {
    const tpl = kind === 'food' ? 'food' : kind;
    if (this.rooms[tpl]) return this.rooms[tpl];
    const idx = Object.keys(this.rooms).length;
    const ox = WORLD.maxX + 600, oz = WORLD.minZ + 200 + idx * 40;
    const { b, solid, spots } = buildRoom(tpl, mulberry32(77 + idx));
    const mesh = b.build(this.material);
    mesh.position.set(ox, 0, oz);
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.layers.set(LAYER);
    this.scene.add(mesh);
    for (const [x0, x1, z0, z1, h, y0 = -1] of solid) this.colliders.add(ox + x0, ox + x1, oz + z0, oz + z1, h, 'building', y0);
    this.layout.floors.push({ minX: ox - RW / 2 - 1, maxX: ox + RW / 2 + 1, minZ: oz - RD / 2 - 1, maxZ: oz + RD / 2 + 1, y: FLOOR });
    // The name board over the counter (its texture changes with the shop).
    const sp = spots.board;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(sp.w, sp.h), new THREE.MeshBasicMaterial({ toneMapped: false }));
    board.position.set(ox + sp.x, sp.y, oz + sp.z + 0.02);
    board.layers.set(LAYER);
    this.scene.add(board);
    // Ceiling fans that turn.
    const fans = spots.fans.map((f) => {
      const fb = new MeshBuilder({ pbr: true });
      fb.pbr = PB.steel;
      put(fb, G.cyl, 0, -0.1, 0, 0x8a6a4a, 0, 0.12, 0.12, 0.12);
      for (let k = 0; k < 3; k++) put(fb, new THREE.BoxGeometry(1, 1, 1), Math.cos(k * 2.09) * 0.45, -0.1, Math.sin(k * 2.09) * 0.45, 0x8a6a4a, -k * 2.09, 0.8, 0.02, 0.14);
      const m = fb.build(this.material);
      m.position.set(ox + f.x, RH - 0.3, oz + f.z);
      m.layers.set(LAYER);
      this.scene.add(m);
      return m;
    });
    return (this.rooms[tpl] = { ox, oz, spots, board, fans });
  }

  // ---------- going in and out ----------
  enter(shop) {
    const w = this.world, pl = w.player, P = w.police;
    const R = this.room(shop.kind);
    this.active = shop;
    this.R = R;
    // Did the police see you go in? (Then a change of clothes won't help.)
    this.seen = P.level > 0 && (P.units.some((u) => Math.hypot(u.v.x - shop.x, u.v.z - shop.z) < 70) || P.cops.some((c) => Math.hypot(c.x - shop.x, c.z - shop.z) < 40));
    const items = shop.kind === 'food' ? MENUS[shop.style] : MENUS[shop.kind] || [];
    R.board.material.map?.dispose();
    const bg = shop.sign.bg || (shop.kind === 'pharmacy' ? '#0b7a3e' : '#1a1a1a'), fg = shop.sign.fg || '#ffffff';
    R.board.material.map = boardTexture(shop.name, shop.kn, items.map(([n, , p]) => `${n}  ₹${p}`), bg, fg);
    R.board.material.needsUpdate = true;
    // People: the one behind the counter, and a few customers in a restaurant.
    const rng = mulberry32((shop.x * 31 + shop.z * 17) | 0);
    this.people = [];
    const add = (opts, x, z, h, pose) => {
      const hm = createHuman(opts, rng);
      hm.group.position.set(R.ox + x, FLOOR + (pose === 'sit' ? 0.02 : 0), R.oz + z);
      hm.group.rotation.y = h;
      if (pose === 'sit') { poseSit(hm); hm.group.position.y = FLOOR + 0.47 - 0.86; } else poseIdle(hm, 0);
      hm.group.traverse((o) => o.layers.set(LAYER));
      this.scene.add(hm.group);
      const who = { h: hm, x: R.ox + x, z: R.oz + z, female: hm.female, pose, t: rng() * 10 };
      this.people.push(who);
      return who;
    };
    const c = R.spots.cashier;
    this.cashier = add({ outfit: shop.kind === 'pharmacy' ? 'office' : shop.kind === 'food' ? 'shirt' : undefined }, c.x, c.z, 0, 'stand');
    if (shop.kind === 'food') {
      const seats = R.spots.seats.slice().sort(() => rng() - 0.5).slice(0, 1 + Math.floor(rng() * 3));
      for (const s of seats) add({}, s.x, s.z, s.h, 'sit');
      for (const s of R.spots.stands) if (rng() < 0.5) add({}, s.x, s.z, s.h, 'stand');
    }
    // You, just inside the door.
    pl.x = R.ox; pl.z = R.oz + RD / 2 - 1.6; pl.y = FLOOR; pl.vy = 0; pl.heading = Math.PI;
    pl.human.group.traverse((o) => o.layers.enable(LAYER));
    w.camRig.first = true;
    w.camRig.yaw = 0;
    w.camera.layers.set(LAYER);
    this.exitRing.position.set(R.ox, FLOOR + 0.03, R.oz + RD / 2 - 0.5);
    this.exitRing.visible = true;
    this.cool = 1.2;
    this.greet = 1.0;
    for (const m of this.markers) m.visible = false;
  }

  exit() {
    const w = this.world, pl = w.player, s = this.active;
    for (const p of this.people) { this.scene.remove(p.h.group); p.h.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.skeleton?.dispose(); } }); }
    this.people = [];
    this.closeMenu();
    this.exitRing.visible = false;
    w.camera.layers.set(0);
    // Back on the footpath, facing the road.
    pl.x = s.x - s.ix * 1.3; pl.z = s.z - s.iz * 1.3; pl.y = w.layout.groundHeight(pl.x, pl.z); pl.vy = 0;
    pl.heading = Math.atan2(-s.ix, -s.iz);
    w.camRig.first = true;
    w.camRig.yaw = pl.heading + Math.PI; // behind you
    this.active = null;
    this.cool = 2;
    this.lastDoor = s;
  }

  // Fade to black, then run `fn`, then fade back.
  transition(fn) {
    if (this.fading) return;
    this.fading = true;
    this.fadeEl.classList.add('on');
    setTimeout(() => { fn(); this.fadeEl.classList.remove('on'); this.fading = false; }, 280);
  }

  // ---------- the counter ----------
  items() {
    const s = this.active, pl = this.world.player, money = this.missions.money;
    const out = [];
    const robbed = (this.robbed.get(s) || 0) > performance.now();
    if (robbed) out.push({ label: 'The shopkeeper is hiding behind the counter.', off: true });
    else if (s.kind === 'food' || s.kind === 'pharmacy' || s.kind === 'store') {
      const list = s.kind === 'food' ? MENUS[s.style] : MENUS[s.kind];
      for (const [name, kn, price, heal] of list) out.push({ label: `${name} <small>${kn}</small>`, price, act: 'eat', name, heal });
    } else if (s.kind === 'hardware') {
      for (const [key, price, rounds] of HARDWARE) {
        const w = WEAPONS[key], have = pl.weapons.has(key);
        if (key === 'katta') {
          out.push({ label: have ? 'Under the counter: katta rounds ×4' : `Under the counter: a ${w.name} (+${rounds} rounds)`, price: have ? 500 : price, act: 'weapon', key, rounds: have ? 4 : rounds, ammo: have });
        } else out.push({ label: `${w.name}${w.kn ? ` <small>${w.kn}</small>` : ''}${have ? ' (you have one)' : ''}`, price, act: 'weapon', key, off: have });
      }
      if (pl.weapons.has('revolver')) out.push({ label: 'Under the counter: .32 rounds ×12', price: 1200, act: 'weapon', key: 'revolver', rounds: 12, ammo: true });
    } else if (s.kind === 'clothes') {
      for (const [name, price, opts] of OUTFITS) out.push({ label: name, price, act: 'outfit', opts, name });
    } else if (s.kind === 'jewellery') {
      out.push({ label: 'Gold chain (look, don\'t touch)', price: 85000, act: 'browse' });
      out.push({ label: 'Mangalsutra', price: 120000, act: 'browse' });
    }
    const wpn = WEAPONS[pl.weapon];
    if (!robbed && pl.weapon !== 'fists') out.push({ label: `${wpn.kind === 'gun' ? '🔫' : '🔪'} Rob the till`, act: 'rob', danger: true });
    out.push({ label: 'Leave the counter', act: 'close' });
    for (const it of out) if (it.price > money) it.off = true;
    return out;
  }

  openMenu() {
    this.menu = true;
    this.sel = 0;
    this.el.classList.add('show');
    this.render();
  }

  closeMenu() {
    this.menu = null;
    this.el.classList.remove('show');
  }

  render() {
    const its = this.items(), s = this.active;
    this.sel = Math.min(this.sel, its.length - 1);
    const icon = { food: '🍛', pharmacy: '💊', hardware: '🔨', clothes: '👕', jewellery: '💍', store: '🛒' }[s.kind];
    this.el.innerHTML = `<div class="gm-head">${icon} <b>${s.name}</b><span>${s.kn || ''} · ${s.district}</span></div>` +
      its.map((it, i) => `<div class="gm-item${i === this.sel ? ' sel' : ''}${it.off ? ' off' : ''}${it.danger ? ' danger' : ''}" data-i="${i}"><span>${it.label}</span><em>${it.price ? '₹' + it.price.toLocaleString('en-IN') : ''}</em></div>`).join('') +
      `<div class="gm-foot">W/S choose · E select · Q leave <u>(tap here to leave)</u> · You have ₹${this.missions.money.toLocaleString('en-IN')} · Health ${Math.round(this.world.player.health)}%</div>`;
  }

  choose(it) {
    const w = this.world, pl = w.player, s = this.active;
    if (it.off) { this.audio.click?.(); return; }
    switch (it.act) {
      case 'close': this.closeMenu(); return;
      case 'browse': this.hud.say('The salesman smiles politely and keeps a hand near the alarm.', 2.5); return;
      case 'eat': {
        this.missions.addMoney(-it.price);
        this.audio.cash?.();
        const before = pl.health;
        pl.health = Math.min(100, pl.health + it.heal);
        pl.hurtCooldown = 0;
        const gained = Math.round(pl.health - before);
        this.hud.say(it.heal ? `${it.name}. ${gained > 0 ? `+${gained} health.` : 'You were already feeling fine.'}` : `${it.name}. Unlimited calls, 1.5 GB a day.`, 2.5);
        if (Math.random() < 0.5) w.voices?.speak('thanks', this.cashier, { dur: 2.5 });
        break;
      }
      case 'weapon': {
        this.missions.addMoney(-it.price);
        this.audio.cash?.();
        if (it.ammo) { pl.ammo[it.key] = (pl.ammo[it.key] || 0) + it.rounds; this.hud.say(`${WEAPONS[it.key].name}: +${it.rounds} rounds. "You didn't get these from me."`, 3); }
        else {
          pl.give(it.key, it.rounds || 0, true);
          this.hud.say(it.key === 'katta' ? 'He wraps it in yesterday\'s Prajavani. "Never seen you before in my life."' : `${WEAPONS[it.key].name} bought. Tab to switch weapons.`, 3);
        }
        break;
      }
      case 'outfit': {
        this.missions.addMoney(-it.price);
        this.audio.cash?.();
        this.wear(it.opts, true);
        const P = w.police;
        if (P.level > 0 && !this.seen) {
          if (P.level <= 2) { P.clear(); this.hud.say(`New look: ${it.name}. The police are looking for someone else now.`, 3.5); }
          else { P.level--; P.hud.setStars(P.level, true); this.hud.say('New clothes. They\'ll look twice now, not once (one star less).', 3.5); }
        } else if (P.level > 0) this.hud.say('A constable watched you walk in. New clothes won\'t fool him.', 3);
        else this.hud.say(`${it.name}. Looking sharp.`, 2.5);
        break;
      }
      case 'rob': this.rob(); this.closeMenu(); return;
    }
    this.render();
  }

  // Robbing the till: cash, the shopkeeper cowers, and the police are on their way (2 stars;
  // 3 for a jeweller's).
  rob() {
    const w = this.world, s = this.active, P = w.police;
    const [lo, hi] = TILL[s.kind] || TILL.store;
    const cash = Math.round((lo + Math.random() * (hi - lo)) / 10) * 10;
    this.missions.addMoney(cash);
    this.audio.cash?.();
    this.robbed.set(s, performance.now() + 300000);
    this.cashier.pose = 'hands';
    for (const p of this.people) if (p !== this.cashier) p.pose = 'hands';
    w.voices?.speak('robbed', this.cashier, { priority: true, dur: 3 });
    setTimeout(() => this.hud.say(`You empty the till: ₹${cash.toLocaleString('en-IN')}. Someone's already on the phone to 112.`, 3.5), 1600);
    const stars = s.kind === 'jewellery' ? 3 : 2;
    P.crime('Robbery', s.x, s.z, stars, w);
    if (P.level < stars) { P.level = stars; P.hud.setStars(stars, false); }
    P.lastKnown = { x: s.x, z: s.z }; P.seenT = 0;
  }

  // ---------- your clothes ----------
  wear(opts, save) {
    const pl = this.world.player, old = pl.human;
    const h = createHuman({ ...opts, skin: 0xa8693c, female: false }, mulberry32(9));
    h.group.position.copy(old.group.position);
    h.group.rotation.copy(old.group.rotation);
    h.group.visible = old.group.visible;
    if (old.group.parent) { old.group.parent.add(h.group); old.group.parent.remove(old.group); } else this.scene.add(h.group);
    old.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.skeleton?.dispose(); } });
    pl.human = h;
    equip(h, pl.weapon);
    if (this.active) h.group.traverse((o) => o.layers.enable(LAYER));
    if (save) try { localStorage.setItem(OUTFIT_KEY, JSON.stringify(opts)); } catch { /* ignore */ }
  }

  restoreOutfit() {
    try { const o = JSON.parse(localStorage.getItem(OUTFIT_KEY) || 'null'); if (o) this.wear(o, false); } catch { /* ignore */ }
  }

  // Inside: soft indoor light from the ceiling (called after the day/night update every frame).
  light(env) {
    if (!this.active) return;
    env.sun.intensity = 0;
    env.hemi.intensity = 1.25;
    env.hemi.color.setHex(0xfff2dc);
    env.hemi.groundColor.setHex(0x7a6a58);
    env.scene.environmentIntensity = 0.3;
    env.renderer.toneMappingExposure = 1.0;
    const R = this.R, h = env.headlight;
    h.position.set(R.ox, RH - 0.2, R.oz);
    env.headTarget.position.set(R.ox, 0, R.oz);
    h.angle = 1.15; h.penumbra = 0.9; h.distance = 22; h.decay = 1; h.intensity = 30;
    this.lit = true;
  }

  // The spot borrowed for the ceiling goes back to being your headlights.
  unlight(env) {
    if (!this.lit) return;
    this.lit = false;
    const h = env.headlight;
    h.angle = 0.55; h.penumbra = 0.5; h.distance = 70; h.decay = 1.2; h.intensity = 0;
  }

  // ---------- every frame ----------
  // Outside: show the doors near you and walk in. Returns true while it's handling the frame.
  update(dt, input) {
    const w = this.world, pl = w.player;
    if (this.cool > 0) this.cool -= dt;
    this.prompt = '';
    this.useNear = false;
    const t = performance.now() / 1000;
    if (!this.active) {
      // Door markers, refreshed a few times a second.
      if ((this.scanT -= dt) <= 0) { this.scanT = 0.3; this.near = pl.vehicle || pl.dead ? [] : this.doorsNear(pl.x, pl.z, 40).slice(0, this.markers.length); }
      this.markers.forEach((m, i) => {
        const n = this.near[i];
        m.visible = !!n;
        if (n) { m.position.set(n.s.x, pl.y > 1 ? pl.y : 0.16, n.s.z); m.userData.arrow.position.y = 1.45 + Math.sin(t * 3 + i) * 0.12; m.userData.arrow.rotation.y = t * 1.5; }
      });
      if (pl.vehicle || pl.transition || pl.dead || this.fading) return false;
      const d0 = this.near[0];
      if (!d0) return false;
      const s = d0.s, d = Math.hypot(pl.x - s.x, pl.z - s.z);
      if (this.lastDoor === s && d > 1.8) this.lastDoor = null;
      if (d < 2.6) { this.prompt = `Walk in · ${s.name}`; this.useNear = true; }
      // Walk into the door (facing it), or press E beside it.
      const facing = Math.sin(pl.heading) * s.ix + Math.cos(pl.heading) * s.iz;
      const walkIn = d < 0.75 && (pl.speed || 0) > 0.5 && facing > 0.35 && this.lastDoor !== s;
      if (this.cool <= 0 && (walkIn || (d < 2.6 && input.hit('KeyE')))) {
        input.pressed.delete('KeyE');
        this.transition(() => this.enter(s));
      }
      return false;
    }
    // Inside.
    for (const f of this.R.fans) f.rotation.y += dt * 9;
    this.exitRing.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    for (const p of this.people) {
      if (p.pose === 'hands') poseHandsUp(p.h, t);
      else if (p.pose === 'stand') poseIdle(p.h, t + p.t);
    }
    if (this.greet > 0 && (this.greet -= dt) <= 0) w.voices?.speak(this.active.kind === 'food' ? 'foodGreet' : 'shopGreet', this.cashier, { dur: 3 });
    if (this.menu) {
      const its = this.items();
      if (input.hit('KeyW', 'ArrowUp')) { this.sel = (this.sel - 1 + its.length) % its.length; this.render(); }
      if (input.hit('KeyS', 'ArrowDown')) { this.sel = (this.sel + 1) % its.length; this.render(); }
      if (input.hit('KeyQ', 'Backspace', 'Escape') || this.tapClose) { this.tapClose = false; this.closeMenu(); return true; }
      if (input.hit('KeyE', 'Enter') || this.tap) { this.tap = false; const it = its[this.sel]; if (it) this.choose(it); }
      return true;
    }
    const R = this.R;
    const cx = R.ox + R.spots.counter.x, cz = R.oz + R.spots.counter.z;
    const atCounter = Math.hypot(pl.x - cx, pl.z - cz) < 1.7;
    const ex = R.ox, ez = R.oz + RD / 2 - 0.5, de = Math.hypot(pl.x - ex, pl.z - ez);
    if (atCounter) { this.prompt = 'E  At the counter'; this.useNear = true; }
    else if (de < 2) { this.prompt = 'Walk out · E'; this.useNear = true; }
    if (atCounter && input.hit('KeyE')) { input.pressed.delete('KeyE'); this.openMenu(); return true; }
    const facingOut = Math.cos(pl.heading) > 0.35;
    if (this.cool <= 0 && !this.fading && ((de < 0.8 && facingOut && (pl.speed || 0) > 0.5) || (de < 2 && input.hit('KeyE')))) {
      input.pressed.delete('KeyE');
      this.transition(() => this.exit());
    }
    return false;
  }

  // Where to show you on the map while you're inside: at the shop's door.
  get door() { return this.active ? { x: this.active.x, z: this.active.z } : null; }
}
