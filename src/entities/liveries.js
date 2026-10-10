// Painted liveries for vehicles, drawn into ONE canvas atlas so every decal on every vehicle
// shares a single material: the Hoysala's blue swoosh and 112 branding, the five BMTC bus
// liveries (Ordinary, Vajra, Vayu Vajra, electric, Metro Feeder) and LED destination boards.
import * as THREE from 'three';

const S = 2048;
const rects = {};
const rect = (name, x, y, w, h) => { rects[name] = { x, y, w, h, uv: [x / S, 1 - (y + h) / S, (x + w) / S, 1 - y / S] }; };

// Small text cells (512 x 128).
const CELLS = ['hoysalaText', 'police', 'hornOk', 'school', 'spare', 'pinkText', 'water', 'cab'];
CELLS.forEach((n, k) => rect(n, (k % 4) * 512, Math.floor(k / 4) * 128, 512, 128));
rect('hoysalaR', 0, 256, 1024, 192); rect('hoysalaL', 1024, 256, 1024, 192);
rect('pinkR', 0, 448, 1024, 192); rect('pinkL', 1024, 448, 1024, 192);
rect('bonnet', 0, 640, 512, 256);

export const BUS_LIVERIES = {
  ordinary: { body: 0x1d7fd4, frontLow: 0x1d7fd4, roof: 0x1d7fd4, ac: 0xe8e8e8, routes: [['226N', 'HAL MARKET'], ['258C', 'PEENYA 2ND STAGE'], ['171', 'KORAMANGALA']] },
  vajra: { body: 0xd71f28, frontLow: 0xd71f28, roof: 0xd71f28, ac: 0xd71f28, routes: [['500-C', 'SILK BOARD'], ['500D', 'HEBBAL']] },
  vayu: { body: 0x1d5058, frontLow: 0x1d5058, roof: 0x1d5058, ac: 0x24646c, routes: [['KIA-9', 'AIRPORT'], ['KIA-5', 'AIRPORT']] },
  ev: { body: 0xf2f3f2, frontLow: 0x3cae3c, roof: 0xf2f3f2, ac: 0x2a5ad0, routes: [['335-E', 'MAJESTIC'], ['401K', 'YESHWANTHPUR']] },
  feeder: { body: 0xf07c1e, frontLow: 0x2c5aa8, roof: 0xf07c1e, ac: 0xf07c1e, routes: [['MF-2', 'BANASHANKARI'], ['MF-1', 'INDIRANAGAR']] },
};
const LIVERY_KEYS = Object.keys(BUS_LIVERIES);
LIVERY_KEYS.forEach((k, j) => { rect(`bus_${k}_R`, 0, 1024 + j * 192, 1024, 192); rect(`bus_${k}_L`, 1024, 1024 + j * 192, 1024, 192); });
let boardIdx = 0;
for (const k of LIVERY_KEYS) {
  BUS_LIVERIES[k].boards = BUS_LIVERIES[k].routes.map((r) => {
    const name = `board${boardIdx}`;
    rect(name, 512 + (boardIdx % 3) * 512, 640 + Math.floor(boardIdx / 3) * 96, 512, 96);
    boardIdx++;
    return { name, route: r };
  });
}

export const decalUV = (name) => rects[name].uv;

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const FONT = '"Oswald", "Arial Narrow", Arial, sans-serif';
const KN = '"Noto Sans Kannada", sans-serif';

function text(ctx, s, x, y, font, color, maxW) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y, maxW);
}

// A painting frame over one atlas rect: P(u, v) maps u (0 = rear, 1 = front) and v (0 = top,
// 1 = bottom) to pixels, mirroring the artwork (but not the text) for the other side.
function frame(ctx, r, frontRight) {
  const P = (u, v) => [r.x + (frontRight ? u : 1 - u) * r.w, r.y + v * r.h];
  return P;
}

function path(ctx, P, cmds) {
  ctx.beginPath();
  for (const [op, ...pts] of cmds) {
    const xy = pts.flatMap(([u, v]) => P(u, v));
    if (op === 'M') ctx.moveTo(...xy);
    else if (op === 'L') ctx.lineTo(...xy);
    else if (op === 'Q') ctx.quadraticCurveTo(...xy);
    else if (op === 'C') ctx.bezierCurveTo(...xy);
  }
}

function cutEllipse(ctx, P, u, v, rx, ry) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const [x, y] = P(u, v);
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Bengaluru City Police Hoysala (Maruti Ertiga): white body, a royal-blue swoosh with a red
// outline across the front door and over the front wheel, a blue rear quarter, the red "112"
// roundel, "BENGALURU CITY POLICE" in blue and ಪೊಲೀಸ್ in big red letters, and the Hoysala badge.
// The rect covers the lower body side, sill to beltline, bumper to bumper (4.4 m x 0.74 m).
function drawHoysala(ctx, r, frontRight, pink) {
  const P = frame(ctx, r, frontRight);
  const blue = pink ? '#7a1450' : '#2e3192', red = pink ? '#ffffff' : '#e3262f';
  const ink = pink ? '#ffffff' : '#2e3192', kn = pink ? '#ffffff' : '#e0242c';
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.lineJoin = 'round';
  // Front-door swoosh.
  ctx.fillStyle = blue;
  path(ctx, P, [['M', [0.5, 0]], ['L', [0.7, 0]], ['C', [0.78, 0.1], [0.86, 0.42], [0.885, 0.8]], ['L', [0.885, 1]], ['L', [0.74, 1]], ['Q', [0.61, 0.5], [0.5, 0]]]);
  ctx.fill();
  ctx.strokeStyle = red; ctx.lineWidth = 5;
  path(ctx, P, [['M', [0.74, 1]], ['Q', [0.61, 0.5], [0.5, 0.01]], ['L', [0.13, 0.05]]]); ctx.stroke();
  path(ctx, P, [['M', [0.7, 0.01]], ['C', [0.78, 0.11], [0.86, 0.42], [0.885, 0.8]]]); ctx.stroke();
  // Rear quarter.
  ctx.fillStyle = blue;
  path(ctx, P, [['M', [0, 0.08]], ['L', [0.13, 0.05]], ['C', [0.115, 0.22], [0.085, 0.42], [0.035, 0.64]], ['L', [0, 0.68]]]);
  ctx.fill();
  path(ctx, P, [['M', [0.13, 0.05]], ['C', [0.115, 0.22], [0.085, 0.42], [0.035, 0.64]]]); ctx.stroke();
  // 112 roundel on the rear door.
  const pxm = r.w / 4.4, pym = r.h / 0.74; // pixels per metre
  const [cx, cy] = P(0.275, 0.5);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = pink ? '#7a1450' : '#e3262f'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(cx, cy, 0.2 * pxm, 0.2 * pym, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  text(ctx, '112', cx, cy + 8, `bold 52px ${FONT}`, '#e3262f', 0.32 * pxm);
  text(ctx, 'ನಮ್ಮ', cx, cy - 30, `bold 16px ${KN}`, '#2e3192', 0.3 * pxm);
  // Lettering.
  const [tx, ty] = P(0.445, 0.3);
  text(ctx, 'BENGALURU CITY POLICE', tx, ty, `600 31px ${FONT}`, ink, 0.24 * r.w);
  const [kx, ky] = P(0.445, 0.64);
  text(ctx, 'ಪೊಲೀಸ್', kx, ky, `bold 66px ${KN}`, kn, 0.25 * r.w);
  // Hoysala badge on the front door.
  const [bx, by] = P(0.665, 0.3);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(bx, by, 0.13 * pxm, 0.13 * pym, 0, 0, Math.PI * 2); ctx.stroke();
  text(ctx, pink ? 'PINK' : '23', bx, by - 4, `bold ${pink ? 22 : 30}px ${FONT}`, '#ffffff', 0.22 * pxm);
  text(ctx, 'HOYSALA', bx, by + 21, `bold 12px ${FONT}`, '#ffffff', 0.22 * pxm);
  // Wheel arches stay clear.
  for (const u of [0.19, 0.81]) cutEllipse(ctx, P, u, 0.96, 0.41 * pxm, 0.41 * pym);
  ctx.restore();
}

// Bonnet: police emblem and POLICE in red, reading from the front of the car.
function drawBonnet(ctx, r) {
  const cx = r.x + r.w / 2;
  ctx.fillStyle = '#2e3192';
  ctx.beginPath(); ctx.arc(cx, r.y + 78, 50, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#e3262f'; ctx.lineWidth = 8; ctx.stroke();
  ctx.strokeStyle = '#f2c200'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, r.y + 78, 36, 0, Math.PI * 2); ctx.stroke();
  // A star at the centre of the badge.
  ctx.fillStyle = '#f2c200'; ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? 10 : 24;
    ctx.lineTo(cx + Math.cos(a) * rr, r.y + 78 + Math.sin(a) * rr);
  }
  ctx.fill();
  text(ctx, 'POLICE', cx, r.y + 190, `bold 92px ${FONT}`, '#e3262f', r.w - 40);
}

// LED destination board: amber route number and destination on black.
function drawBoard(ctx, r, [num, dest]) {
  ctx.fillStyle = '#0b0b0b'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#ffae2a'; ctx.textBaseline = 'middle';
  ctx.font = `bold 58px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillText(num, r.x + 16, r.y + r.h / 2 + 3, 150);
  const nw = Math.min(150, ctx.measureText(num).width);
  ctx.textAlign = 'center';
  ctx.fillText(dest, r.x + 16 + nw + (r.w - 32 - nw) / 2 + 8, r.y + r.h / 2 + 3, r.w - nw - 50);
  // LED dot mesh.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = r.y; y < r.y + r.h; y += 4) ctx.fillRect(r.x, y, r.w, 1);
  for (let x = r.x; x < r.x + r.w; x += 4) ctx.fillRect(x, r.y, 1, r.h);
}

// BMTC bus side, covering the whole body side (11.3 m x 2.84 m). Windows (v 0.14-0.485 over the
// glass band) are left transparent so the glass geometry shows through; pillars are painted.
function drawBus(ctx, r, key, frontRight, kerb) {
  const P = frame(ctx, r, frontRight);
  const L = 11.3, H = 2.84, pxm = r.w / L, pym = r.h / H;
  const U = (z) => (z + L / 2) / L; // body z (metres from centre) to u
  const fillRect = (u0, v0, u1, v1, c) => {
    const [x0, y0] = P(u0, v0), [x1, y1] = P(u1, v1);
    ctx.fillStyle = c; ctx.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0);
  };
  const lv = BUS_LIVERIES[key];
  const body = hex(lv.body);
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  fillRect(0, 0, 1, 1, body);
  let pillar = '#101214';
  if (key === 'ordinary') {
    fillRect(0, 0.075, 1, 0.105, '#ffffff');
    fillRect(0, 0.47, 1, 0.53, '#ffffff');
    fillRect(0, 0.93, 1, 1, '#123a66');
    const [x, y] = P(0.62, 0.72);
    text(ctx, 'BMTC', x, y - 10, `bold 34px ${FONT}`, '#ffffff', 200);
    text(ctx, 'ಬೆಂ.ಮ.ಸಾ.ಸಂ', x, y + 22, `bold 20px ${KN}`, '#ffffff', 200);
  } else if (key === 'vajra') {
    ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    for (const [w, dv] of [[7, 0], [3, 0.09]]) {
      ctx.lineWidth = w;
      path(ctx, P, [['M', [0.02, 0.97 - dv]], ['C', [0.35, 0.9 - dv], [0.7, 0.62 - dv], [0.99, 0.56 - dv * 0.5]]]);
      ctx.stroke();
    }
    fillRect(0, 0.95, 1, 1, '#151515');
    const [x, y] = P(0.63, 0.66);
    text(ctx, 'VAJRA ವಜ್ರ', x, y, `italic bold 30px ${FONT}`, '#ffffff', 220);
  } else if (key === 'vayu') {
    fillRect(0, 0.5, 1, 0.535, '#3a8a90');
    fillRect(0, 0.95, 1, 1, '#0f2a2e');
    // A white bird in flight.
    const [bx, by] = P(0.6, 0.76), s = frontRight ? 1 : -1;
    ctx.fillStyle = '#ffffff'; ctx.beginPath();
    ctx.moveTo(bx - 40 * s, by + 4);
    ctx.quadraticCurveTo(bx - 10 * s, by - 34, bx + 34 * s, by - 30);
    ctx.quadraticCurveTo(bx + 4 * s, by - 16, bx + 2 * s, by);
    ctx.quadraticCurveTo(bx + 30 * s, by + 4, bx + 50 * s, by + 18);
    ctx.quadraticCurveTo(bx + 10 * s, by + 16, bx - 40 * s, by + 4);
    ctx.fill();
    const [x, y] = P(0.33, 0.72);
    text(ctx, 'VAYU VAJRA', x, y - 10, `bold 30px ${FONT}`, '#ffffff', 220);
    text(ctx, 'ವಾಯು ವಜ್ರ', x, y + 20, `bold 20px ${KN}`, '#ffffff', 220);
  } else if (key === 'ev') {
    // Green sweep up to the rear roof, blue skirt, big EV.
    ctx.fillStyle = '#3cae3c';
    path(ctx, P, [['M', [0, 0]], ['L', [0.16, 0]], ['C', [0.1, 0.3], [0.05, 0.5], [0, 0.6]]]); ctx.fill();
    ctx.strokeStyle = '#3cae3c'; ctx.lineWidth = 9;
    path(ctx, P, [['M', [0, 0.6]], ['C', [0.3, 0.68], [0.65, 0.86], [1, 0.86]]]); ctx.stroke();
    fillRect(0, 0.88, 1, 1, '#1f4ea8');
    const [x, y] = P(0.67, 0.68);
    text(ctx, 'EV', x, y, `bold 64px ${FONT}`, '#1f4ea8', 120);
    const [lx, ly] = P(0.15, 0.72);
    text(ctx, 'ELECTRIC', lx, ly, `bold 30px ${FONT}`, '#2a9a2a', 180);
    const [ax, ay] = P(0.4, 0.72);
    text(ctx, 'ಬಿಎಂಟಿಸಿ  BMTC', ax, ay, `bold 22px ${KN}`, '#1f4ea8', 220);
  } else if (key === 'feeder') {
    fillRect(0, 0.6, 1, 0.635, '#ffffff');
    fillRect(0, 0.635, 1, 1, '#2c5aa8');
    pillar = '#3a2a1a';
    const [x, y] = P(0.6, 0.8);
    text(ctx, 'METRO FEEDER', x, y - 6, `bold 30px ${FONT}`, '#ffffff', 240);
    text(ctx, 'ಮೆಟ್ರೋ ಫೀಡರ್', x, y + 22, `bold 18px ${KN}`, '#ffffff', 240);
  }
  // Window band: glass shows through, painted pillars between panes. The glass runs from
  // z = -5.25 to 4.65; ahead of it is the driver's cab window.
  const g0 = U(-5.25), g1 = U(4.65);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  fillRect(g0, 0.14, g1, 0.485, '#000');
  ctx.restore();
  for (let z = -5.25; z <= 4.66; z += 1.3) fillRect(U(z) - 0.005, 0.14, U(z) + 0.005, 0.485, pillar);
  fillRect(g1 + 0.012, 0.11, 0.995, 0.5, '#151b20');
  // Doors on the kerb side: front (ahead of the front wheel) and middle.
  if (kerb) {
    for (const z of [4.85, -0.6]) {
      const u = U(z), hw = 0.55 / L;
      fillRect(u - hw - 0.004, 0.1, u + hw + 0.004, 0.975, '#222');
      fillRect(u - hw, 0.12, u - 0.002, 0.96, '#1a242a');
      fillRect(u + 0.002, 0.12, u + hw, 0.96, '#1a242a');
      fillRect(u - hw * 0.6, 0.18, u - hw * 0.6 + 0.003, 0.9, '#e8c020'); // grab rails
      fillRect(u + hw * 0.6 - 0.003, 0.18, u + hw * 0.6, 0.9, '#e8c020');
    }
  }
  // Wheel arches are cut out so the wheels show.
  for (const z of [3.3, -2.9]) cutEllipse(ctx, P, U(z), 0.99, 0.6 * pxm, 0.6 * pym);
  ctx.restore();
}

let atlas = null;
export function decalAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const cells = {
    hoysalaText: { t: ['HOYSALA', 'ಹೊಯ್ಸಳ'], fg: '#2e3192' },
    police: { t: ['BENGALURU CITY POLICE', 'ಬೆಂಗಳೂರು ನಗರ ಪೊಲೀಸ್ · 112'], fg: '#2e3192' },
    hornOk: { t: ['HORN OK PLEASE'], fg: '#c0182a', bg: '#f2c200' },
    school: { t: ['SCHOOL BUS', 'ಶಾಲಾ ವಾಹನ'], fg: '#111' },
    pinkText: { t: ['PINK HOYSALA', 'ಹೊಯ್ಸಳ · 112'], fg: '#ffffff' },
    water: { t: ['DRINKING WATER', 'ಕುಡಿಯುವ ನೀರು'], fg: '#1a4ab0' },
    cab: { t: ['CITY CAB'], fg: '#111' },
  };
  for (const [name, cell] of Object.entries(cells)) {
    const { x, y } = rects[name];
    if (cell.bg) { ctx.fillStyle = cell.bg; ctx.fillRect(x, y, 512, 128); }
    if (cell.t.length === 1) text(ctx, cell.t[0], x + 256, y + 66, `bold 64px ${FONT}`, cell.fg, 490);
    else {
      text(ctx, cell.t[0], x + 256, y + 44, `bold 56px ${FONT}`, cell.fg, 490);
      text(ctx, cell.t[1], x + 256, y + 100, `bold 34px ${KN}`, cell.fg, 490);
    }
  }
  drawHoysala(ctx, rects.hoysalaR, true, false);
  drawHoysala(ctx, rects.hoysalaL, false, false);
  drawHoysala(ctx, rects.pinkR, true, true);
  drawHoysala(ctx, rects.pinkL, false, true);
  drawBonnet(ctx, rects.bonnet);
  for (const k of LIVERY_KEYS) {
    drawBus(ctx, rects[`bus_${k}_R`], k, true, false);
    drawBus(ctx, rects[`bus_${k}_L`], k, false, true);
    for (const b of BUS_LIVERIES[k].boards) drawBoard(ctx, rects[b.name], b.route);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  // Only the LED boards glow: a half-size copy of the atlas with just those cells.
  const e = document.createElement('canvas');
  e.width = e.height = S / 2;
  const ectx = e.getContext('2d');
  ectx.fillStyle = '#000'; ectx.fillRect(0, 0, S / 2, S / 2);
  for (const k of LIVERY_KEYS) for (const b of BUS_LIVERIES[k].boards) {
    const r = rects[b.name];
    ectx.drawImage(c, r.x, r.y, r.w, r.h, r.x / 2, r.y / 2, r.w / 2, r.h / 2);
  }
  const emissiveMap = new THREE.CanvasTexture(e);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  atlas = new THREE.MeshStandardMaterial({
    map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.1,
    alphaTest: 0.4, roughness: 0.35, metalness: 0.15,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  return atlas;
}

export function pickBusLivery(r) {
  const x = r();
  return x < 0.32 ? 'ordinary' : x < 0.52 ? 'vajra' : x < 0.62 ? 'vayu' : x < 0.84 ? 'ev' : 'feeder';
}
