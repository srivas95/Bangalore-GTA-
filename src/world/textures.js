// Procedurally painted canvas textures. No external image assets needed.
import * as THREE from 'three';
import { SHOP_SIGNS, LANE_W } from '../config.js';

let rng = mulberry32(1337);
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = (a = 0, b = 1) => a + (b - a) * rng();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Speckle noise for grit.
function grain(ctx, w, h, amount = 0.08, count = 6000, light = true) {
  for (let k = 0; k < count; k++) {
    const v = rng() < 0.5 ? 0 : 255;
    if (!light && v === 255) continue;
    ctx.fillStyle = `rgba(${v},${v},${v},${rand(0, amount)})`;
    const s = rand(1, 2.5);
    ctx.fillRect(rand(0, w), rand(0, h), s, s);
  }
}

// Large soft blotches so tiling is less obvious.
function blotches(ctx, w, h, count, color, maxR, alpha) {
  for (let k = 0; k < count; k++) {
    const x = rand(0, w), y = rand(0, h), r = rand(maxR * 0.3, maxR);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// Monsoon streaks running down from ledges.
function streaks(ctx, x, y, w, len, alpha = 0.12) {
  for (let k = 0; k < w / 3; k++) {
    const sx = x + rand(0, w), l = rand(len * 0.3, len);
    const g = ctx.createLinearGradient(0, y, 0, y + l);
    g.addColorStop(0, `rgba(40,35,30,${rand(alpha * 0.5, alpha)})`);
    g.addColorStop(1, 'rgba(40,35,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx, y, rand(1, 4), l);
  }
}

export function asphalt() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#4a4a4c';
  ctx.fillRect(0, 0, 512, 512);
  blotches(ctx, 512, 512, 40, '30,30,32', 90, 0.25);
  blotches(ctx, 512, 512, 25, '110,105,100', 70, 0.12);
  grain(ctx, 512, 512, 0.18, 30000);
  // Patch repairs and cracks.
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = `rgba(30,30,32,${rand(0.2, 0.4)})`;
    ctx.fillRect(rand(0, 450), rand(0, 450), rand(30, 90), rand(20, 70));
  }
  ctx.strokeStyle = 'rgba(20,20,20,0.35)';
  for (let k = 0; k < 6; k++) {
    ctx.lineWidth = rand(0.5, 1.5);
    ctx.beginPath();
    let x = rand(0, 512), y = rand(0, 512);
    ctx.moveTo(x, y);
    for (let s = 0; s < 8; s++) { x += rand(-20, 20); y += rand(-20, 20); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return c;
}

// Road surface with markings. The canvas spans the road width (u) and 12 m of length (v).
export function roadTexture(road) {
  const W = 512, H = 512, len = 12;
  const [c, ctx] = canvas(W, H);
  ctx.drawImage(asphaltCanvas(), 0, 0, W, H);
  const width = road.width;
  const px = (m) => (m / width) * W;
  // Tyre wear tracks per lane.
  const median = road.median || 0;
  for (let side = -1; side <= 1; side += 2) {
    for (let l = 0; l < road.lanes; l++) {
      const centre = width / 2 + side * (median / 2 + (l + 0.5) * LANE_W);
      for (const off of [-0.8, 0.8]) {
        ctx.fillStyle = 'rgba(25,25,25,0.18)';
        ctx.fillRect(px(centre + off) - px(0.35), 0, px(0.7), H);
      }
    }
  }
  const paint = 'rgba(235,235,225,0.85)';
  // Edge lines.
  ctx.fillStyle = paint;
  ctx.fillRect(px(0.25), 0, px(0.15), H);
  ctx.fillRect(px(width - 0.4), 0, px(0.15), H);
  // Centre.
  if (median > 0) {
    ctx.fillStyle = 'rgba(230,190,40,0.9)';
    ctx.fillRect(px(width / 2 - median / 2 - 0.25), 0, px(0.15), H);
    ctx.fillRect(px(width / 2 + median / 2 + 0.1), 0, px(0.15), H);
  } else if (road.lanes > 1) {
    ctx.fillStyle = paint;
    ctx.fillRect(px(width / 2 - 0.25), 0, px(0.12), H);
    ctx.fillRect(px(width / 2 + 0.13), 0, px(0.12), H);
  } else {
    ctx.fillStyle = paint;
    for (let y = 0; y < H; y += H / 2) ctx.fillRect(px(width / 2 - 0.07), y, px(0.14), H / 4);
  }
  // Lane dividers (dashed).
  for (let side = -1; side <= 1; side += 2) {
    for (let l = 1; l < road.lanes; l++) {
      const x = width / 2 + side * (median / 2 + l * LANE_W);
      ctx.fillStyle = paint;
      for (let y = 0; y < H; y += H / 2) ctx.fillRect(px(x) - px(0.06), y + H / 8, px(0.12), H / 4);
    }
  }
  // Paint wear.
  ctx.globalCompositeOperation = 'source-atop';
  blotches(ctx, W, H, 30, '74,74,76', 40, 0.5);
  ctx.globalCompositeOperation = 'source-over';
  grain(ctx, W, H, 0.1, 8000);
  const t = toTexture(c);
  t.userData = { length: len };
  return t;
}

let _asphalt = null;
function asphaltCanvas() {
  if (!_asphalt) _asphalt = asphalt();
  return _asphalt;
}

export function asphaltTexture() {
  return toTexture(asphaltCanvas());
}

export function zebraTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.drawImage(asphaltCanvas(), 0, 0, 256, 256);
  ctx.fillStyle = 'rgba(235,235,225,0.85)';
  for (let x = 8; x < 256; x += 32) ctx.fillRect(x, 0, 16, 256);
  ctx.globalCompositeOperation = 'source-atop';
  blotches(ctx, 256, 256, 20, '74,74,76', 30, 0.6);
  ctx.globalCompositeOperation = 'source-over';
  return toTexture(c);
}

export function paverTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#9a948c';
  ctx.fillRect(0, 0, 256, 256);
  // Interlocking pavers in alternating red/grey bands, typical of BBMP footpaths.
  const s = 32;
  for (let y = 0; y < 256; y += s) {
    for (let x = 0; x < 256; x += s) {
      const red = ((x + y) / s) % 4 < 2;
      const base = red ? [150, 95, 80] : [165, 160, 150];
      const j = rand(-14, 14);
      ctx.fillStyle = `rgb(${base[0] + j},${base[1] + j},${base[2] + j})`;
      ctx.beginPath();
      ctx.roundRect(x + 1.5, y + 1.5, s - 3, s - 3, 5);
      ctx.fill();
    }
  }
  blotches(ctx, 256, 256, 15, '60,50,40', 50, 0.2);
  grain(ctx, 256, 256, 0.12, 6000);
  return toTexture(c);
}

export function grassTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#56733a';
  ctx.fillRect(0, 0, 256, 256);
  blotches(ctx, 256, 256, 30, '90,110,50', 50, 0.4);
  blotches(ctx, 256, 256, 15, '120,100,60', 40, 0.3);
  for (let k = 0; k < 9000; k++) {
    const g = rand(70, 140);
    ctx.strokeStyle = `rgba(${g * 0.6},${g},${g * 0.35},0.5)`;
    ctx.beginPath();
    const x = rand(0, 256), y = rand(0, 256);
    ctx.moveTo(x, y);
    ctx.lineTo(x + rand(-1.5, 1.5), y - rand(2, 5));
    ctx.stroke();
  }
  return toTexture(c);
}

export function soilTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#8a5a3c';
  ctx.fillRect(0, 0, 256, 256);
  blotches(ctx, 256, 256, 30, '110,70,45', 60, 0.4);
  blotches(ctx, 256, 256, 20, '90,100,50', 40, 0.25);
  grain(ctx, 256, 256, 0.2, 12000);
  return toTexture(c);
}

export function concreteTexture(base = '#bdb8ae') {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  // Large paving slabs with slight tone variation.
  for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
    const j = rand(-10, 10);
    ctx.fillStyle = `rgba(${128 + j},${124 + j},${116 + j},0.18)`;
    ctx.fillRect(x, y, 64, 64);
  }
  blotches(ctx, 256, 256, 12, '70,68,64', 50, 0.12);
  grain(ctx, 256, 256, 0.1, 6000);
  ctx.strokeStyle = 'rgba(60,60,60,0.3)';
  for (let k = 0; k <= 256; k += 64) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, 256); ctx.moveTo(0, k); ctx.lineTo(256, k); ctx.stroke(); }
  return toTexture(c);
}

// Facade tiles. Each covers 2 bays x 2 floors = 7 m x 6.4 m unless noted.
export const FACADE_TILE = { w: 7, h: 6.4 };

export function plasterFacade() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#ece8e0';
  ctx.fillRect(0, 0, 512, 512);
  blotches(ctx, 512, 512, 20, '180,170,155', 80, 0.25);
  for (let f = 0; f < 2; f++) {
    for (let b = 0; b < 2; b++) {
      const x = b * 256 + 58, y = f * 256 + 78, w = 140, h = 116;
      // Window: glass, frame, grill.
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#3c4954'); g.addColorStop(1, '#1e262d');
      ctx.fillStyle = '#f6f4ef';
      ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      if (rng() < 0.4) { // curtains
        ctx.fillStyle = ['#b04a3a', '#d8b46a', '#5a7a9a', '#e8e0d0'][Math.floor(rand(0, 4))];
        ctx.fillRect(x, y, w * rand(0.2, 0.5), h);
      }
      ctx.fillStyle = '#e8e6e0';
      ctx.fillRect(x + w / 2 - 3, y, 6, h);
      ctx.strokeStyle = 'rgba(30,30,30,0.8)';
      ctx.lineWidth = 2;
      for (let gx = x + 12; gx < x + w; gx += 16) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
      // Chajja (sunshade) above the window, with its shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x - 24, y - 16, w + 48, 14);
      ctx.fillStyle = '#d4cfc4';
      ctx.fillRect(x - 24, y - 30, w + 48, 14);
      streaks(ctx, x - 24, y - 16, w + 48, 50, 0.1);
      streaks(ctx, x, y + h + 8, w, 60, 0.08);
      // Split AC units are everywhere.
      if (rng() < 0.35) {
        ctx.fillStyle = '#f2f2f0';
        ctx.fillRect(x + w + 14, y + h - 40, 34, 26);
        ctx.fillStyle = '#999';
        ctx.beginPath(); ctx.arc(x + w + 31, y + h - 27, 9, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Floor slab line.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, f * 256 + 250, 512, 6);
  }
  grain(ctx, 512, 512, 0.1, 15000);
  return toTexture(c);
}

export function apartmentFacade() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#ece6dc';
  ctx.fillRect(0, 0, 512, 512);
  blotches(ctx, 512, 512, 15, '170,160,150', 80, 0.25);
  const clothes = ['#c0392b', '#2980b9', '#f1c40f', '#8e44ad', '#16a085', '#ecf0f1', '#e67e22'];
  for (let f = 0; f < 2; f++) {
    for (let b = 0; b < 2; b++) {
      const x = b * 256, y = f * 256;
      // Recessed balcony.
      ctx.fillStyle = '#2b2a28';
      ctx.fillRect(x + 30, y + 50, 196, 170);
      ctx.fillStyle = '#4d4a45';
      ctx.fillRect(x + 50, y + 70, 70, 150);
      ctx.fillStyle = '#3a4650';
      ctx.fillRect(x + 140, y + 80, 70, 80);
      // Clothes line.
      if (rng() < 0.6) {
        ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 30, y + 75); ctx.lineTo(x + 226, y + 75); ctx.stroke();
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = clothes[Math.floor(rand(0, clothes.length))];
          ctx.fillRect(x + 40 + k * 36 + rand(-5, 5), y + 75, rand(16, 26), rand(30, 60));
        }
      }
      // Balcony parapet with railing.
      ctx.fillStyle = '#e4ddd0';
      ctx.fillRect(x + 22, y + 160, 212, 64);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(x + 22, y + 160, 212, 6);
      streaks(ctx, x + 22, y + 224, 212, 30, 0.1);
      // Potted plants.
      for (let k = 0; k < 3; k++) {
        if (rng() < 0.5) continue;
        const px = x + 40 + k * 70;
        ctx.fillStyle = '#9a4a2a'; ctx.fillRect(px, y + 146, 18, 14);
        ctx.fillStyle = '#3d7a2a'; ctx.beginPath(); ctx.arc(px + 9, y + 140, 14, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  grain(ctx, 512, 512, 0.1, 15000);
  return toTexture(c);
}

export const GLASS_TILE = { w: 8, h: 12.8 };
export function glassFacade() {
  const [c, ctx] = canvas(512, 512);
  for (let f = 0; f < 4; f++) {
    for (let b = 0; b < 4; b++) {
      const g = ctx.createLinearGradient(0, f * 128, 0, f * 128 + 128);
      const t = rand(-12, 12);
      g.addColorStop(0, `rgb(${120 + t},${150 + t},${170 + t})`);
      g.addColorStop(1, `rgb(${70 + t},${95 + t},${115 + t})`);
      ctx.fillStyle = g;
      ctx.fillRect(b * 128, f * 128, 128, 128);
      if (rng() < 0.25) { // lit/occupied panel
        ctx.fillStyle = 'rgba(255,240,210,0.15)';
        ctx.fillRect(b * 128, f * 128 + 20, 128, 90);
      }
    }
    // Spandrel band.
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(0, f * 128 + 108, 512, 20);
  }
  ctx.fillStyle = '#c4ccd2';
  for (let x = 0; x <= 512; x += 128) ctx.fillRect(x - 3, 0, 6, 512);
  for (let y = 0; y <= 512; y += 128) ctx.fillRect(0, y - 2, 512, 4);
  return toTexture(c);
}

export function heritageFacade() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#ddd3c2';
  ctx.fillRect(0, 0, 512, 512);
  // Stone courses.
  ctx.strokeStyle = 'rgba(120,100,80,0.25)';
  for (let y = 0; y < 512; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
    for (let x = (y / 32) % 2 ? 0 : 32; x < 512; x += 64) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke(); }
  }
  for (let f = 0; f < 2; f++) {
    for (let b = 0; b < 2; b++) {
      const x = b * 256 + 78, y = f * 256 + 60, w = 100, h = 150;
      ctx.fillStyle = '#c9bca6';
      ctx.fillRect(x - 40, f * 256, 20, 256); // pilaster
      ctx.fillStyle = '#e8e0d0';
      ctx.beginPath();
      ctx.moveTo(x - 10, y + h + 10); ctx.lineTo(x - 10, y + 40); ctx.arc(x + w / 2, y + 40, w / 2 + 10, Math.PI, 0); ctx.lineTo(x + w + 10, y + h + 10); ctx.fill();
      ctx.fillStyle = '#2a2622';
      ctx.beginPath();
      ctx.moveTo(x, y + h); ctx.lineTo(x, y + 40); ctx.arc(x + w / 2, y + 40, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.fill();
      ctx.fillStyle = 'rgba(80,110,90,0.6)'; // green shutters
      ctx.fillRect(x, y + 60, w / 2 - 2, h - 60);
    }
    ctx.fillStyle = '#c6b9a2';
    ctx.fillRect(0, f * 256 + 236, 512, 20);
  }
  blotches(ctx, 512, 512, 20, '120,110,90', 70, 0.2);
  grain(ctx, 512, 512, 0.1, 12000);
  return toTexture(c);
}

// Ground-floor shops: 8 m wide x 4 m tall, two shop fronts.
export const SHOP_TILE = { w: 8, h: 4 };
export function shopfrontTexture() {
  const [c, ctx] = canvas(512, 256);
  ctx.fillStyle = '#d8d2c6';
  ctx.fillRect(0, 0, 512, 256);
  const goods = ['#e74c3c', '#f39c12', '#27ae60', '#2980b9', '#8e44ad', '#f1c40f', '#ecf0f1'];
  for (let s = 0; s < 2; s++) {
    const x = s * 256 + 14, w = 228, y = 34, h = 222;
    const open = rng() < 0.75;
    // Interior.
    ctx.fillStyle = open ? '#3a3026' : '#777';
    ctx.fillRect(x, y, w, h);
    if (open) {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, 'rgba(255,230,170,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      for (let sh = 0; sh < 4; sh++) {
        for (let k = 0; k < 10; k++) {
          ctx.fillStyle = goods[Math.floor(rand(0, goods.length))];
          ctx.fillRect(x + 8 + k * 22, y + 60 + sh * 38, rand(10, 18), rand(16, 28));
        }
        ctx.fillStyle = '#5a4630'; ctx.fillRect(x + 4, y + 88 + sh * 38, w - 8, 4);
      }
    }
    // Rolling shutter (partly up when open).
    const sh = open ? rand(30, 55) : h;
    ctx.fillStyle = '#8c9094';
    ctx.fillRect(x, y, w, sh);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let yy = y; yy < y + sh; yy += 6) ctx.fillRect(x, yy, w, 1.5);
    if (!open && rng() < 0.5) { // posters/graffiti on closed shutters
      ctx.fillStyle = goods[Math.floor(rand(0, goods.length))];
      ctx.fillRect(x + rand(20, 120), y + rand(60, 140), 60, 80);
    }
    // Pillars.
    ctx.fillStyle = '#cfc8ba';
    ctx.fillRect(s * 256, 0, 14, 256);
  }
  ctx.fillStyle = '#bfb8aa';
  ctx.fillRect(0, 0, 512, 34);
  streaks(ctx, 0, 34, 512, 40, 0.15);
  grain(ctx, 512, 256, 0.1, 8000);
  return toTexture(c);
}

export function roofTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#a8a49e';
  ctx.fillRect(0, 0, 256, 256);
  blotches(ctx, 256, 256, 20, '60,60,58', 50, 0.18);
  blotches(ctx, 256, 256, 10, '150,120,90', 40, 0.12);
  ctx.strokeStyle = 'rgba(70,70,70,0.25)';
  for (let k = 0; k <= 256; k += 64) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, 256); ctx.moveTo(0, k); ctx.lineTo(256, k); ctx.stroke(); }
  grain(ctx, 256, 256, 0.15, 10000);
  return toTexture(c);
}

// Atlas of shop signs: 4 columns x 16 rows, each 512 x 128. Real brands use their own colours.
export const SIGN_COLS = 4, SIGN_ROWS = 16;
export function signAtlas() {
  const [c, ctx] = canvas(2048, 2048);
  const bgs = [['#c0392b', '#fff'], ['#f1c40f', '#7a1010'], ['#1e7a3c', '#fff'], ['#1f4e8c', '#ffe066'],
    ['#e67e22', '#fff'], ['#fafafa', '#b0151f'], ['#6a1b9a', '#fff'], ['#111', '#f5c518']];
  const W = 512, H = 128;
  for (let k = 0; k < SIGN_COLS * SIGN_ROWS; k++) {
    const sign = SHOP_SIGNS[k % SHOP_SIGNS.length];
    const [bg, fg] = sign.brand ? [sign.bg, sign.fg] : bgs[(k * 7 + Math.floor(k / SHOP_SIGNS.length)) % bgs.length];
    const x = (k % SIGN_COLS) * W, y = Math.floor(k / SIGN_COLS) * H;
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (sign.brand) {
      // Clean brand panel: thin inner keyline, the name large, tagline underneath.
      ctx.strokeStyle = fg; ctx.globalAlpha = 0.5; ctx.lineWidth = 3;
      ctx.strokeRect(x + 8, y + 8, W - 16, H - 16);
      ctx.globalAlpha = 1;
      ctx.fillStyle = fg;
      const serif = /Bhavan|Coffee Bar|MTR|CTR|Empire/.test(sign.en);
      const short = sign.en.length <= 5;
      ctx.font = `${serif ? 'bold' : '700'} ${short ? 70 : 54}px ${serif ? 'Georgia, "Times New Roman", serif' : '"Oswald", "Arial Narrow", Arial, sans-serif'}`;
      fitText(ctx, sign.en, x + W / 2, y + 50, W - 40);
      ctx.font = '600 22px "Noto Sans Kannada", "Oswald", Arial, sans-serif';
      fitText(ctx, sign.kn, x + W / 2, y + 102, W - 50);
      continue;
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 8;
    ctx.strokeRect(x + 4, y + 4, W - 8, H - 8);
    ctx.fillStyle = fg;
    ctx.font = 'bold 52px "Noto Sans Kannada", "Arial Narrow", Arial, sans-serif';
    fitText(ctx, sign.en.toUpperCase(), x + W / 2, y + 48, W - 32);
    ctx.font = '32px "Noto Sans Kannada", sans-serif';
    fitText(ctx, sign.kn, x + W / 2, y + 100, W - 32);
  }
  const t = toTexture(c, { repeat: false });
  return t;
}

export function fitText(ctx, text, x, y, maxW) {
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(maxW / w, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  } else ctx.fillText(text, x, y);
}

export function signUV(k) {
  const col = k % SIGN_COLS, row = Math.floor(k / SIGN_COLS) % SIGN_ROWS;
  const u0 = col / SIGN_COLS, u1 = (col + 1) / SIGN_COLS;
  const v1 = 1 - row / SIGN_ROWS, v0 = 1 - (row + 1) / SIGN_ROWS;
  return [u0, v0, u1, v1];
}

// fonts: optional per-line fonts (e.g. a big brand name over a small tagline).
// scale: paint the w x h layout into a smaller canvas (signs far smaller than 1024 px on screen).
// Lines of centred text on a plain board, laid out on a w x h canvas and painted into a
// cw x ch box at the context's origin.
export function paintText(ctx, lines, cw, ch, { w = 512, h = 128, bg = '#1f4e8c', fg = '#fff', font = 'bold 44px "Noto Sans Kannada", Arial, sans-serif', fonts } = {}) {
  ctx.save();
  ctx.scale(cw / w, ch / h);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, k) => { ctx.font = fonts?.[k] ?? font; fitText(ctx, l, w / 2, (h / (lines.length + 1)) * (k + 1), w - 20); });
  ctx.restore();
}

export function textTexture(lines, { w = 512, h = 128, scale = 1, ...opts } = {}) {
  const [c, ctx] = canvas(Math.max(16, Math.round(w * scale)), Math.max(8, Math.round(h * scale)));
  paintText(ctx, lines, c.width, c.height, { w, h, ...opts });
  const t = toTexture(c, { repeat: false });
  // Static signs: drop the canvas pixels once they're on the GPU.
  t.onUpdate = () => { c.width = c.height = 1; };
  return t;
}

// Gentle ripple normal map for lake water.
export function waterNormal() {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const img = ctx.createImageData(S, S);
  const h = new Float32Array(S * S);
  const waves = Array.from({ length: 12 }, () => ({ kx: Math.round(rand(-6, 6)), ky: Math.round(rand(-6, 6)), p: rand(0, 6.28), a: rand(0.3, 1) }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const w of waves) v += w.a * Math.sin(((w.kx * x + w.ky * y) / S) * Math.PI * 2 + w.p);
    h[y * S + x] = v;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
    const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const nx = -dx * 0.5, ny = -dy * 0.5, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const i = (y * S + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

export function resetRandom(seed = 1337) {
  rng = mulberry32(seed);
}

// Night-time emissive maps: the same window layout as each facade texture, with a random
// mix of warm incandescent and cool tubelight-lit rooms.
export function windowGlow(style) {
  const shop = style === 'shop';
  const [c, ctx] = canvas(512, shop ? 256 : 512);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 512, shop ? 256 : 512);
  const lit = () => rng() < 0.45;
  const colour = () => (rng() < 0.4 ? '#cfe2ff' : rng() < 0.5 ? '#ffd9a0' : '#ffe8c0');
  const rect = (x, y, w, h) => { ctx.fillStyle = colour(); ctx.globalAlpha = rand(0.55, 1); ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; };
  if (style === 'plaster') {
    for (let f = 0; f < 2; f++) for (let b = 0; b < 2; b++) if (lit()) rect(b * 256 + 58, f * 256 + 78, 140, 116);
  } else if (style === 'apartment') {
    for (let f = 0; f < 2; f++) for (let b = 0; b < 2; b++) {
      if (lit()) rect(b * 256 + 50, f * 256 + 70, 70, 90);
      if (lit()) rect(b * 256 + 140, f * 256 + 80, 70, 80);
    }
  } else if (style === 'heritage') {
    for (let f = 0; f < 2; f++) for (let b = 0; b < 2; b++) if (lit()) rect(b * 256 + 78, f * 256 + 80, 100, 130);
  } else if (style === 'glass') {
    for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) if (rng() < 0.55) rect(b * 128 + 4, f * 128 + 4, 120, 100);
  } else if (shop) {
    for (let s = 0; s < 2; s++) { if (rng() < 0.25) continue; ctx.fillStyle = rng() < 0.5 ? '#ffe2a8' : '#dfefff'; ctx.globalAlpha = rand(0.4, 0.9); ctx.fillRect(s * 256 + 24, 100, 208, 150); ctx.globalAlpha = 1; }
  }
  return toTexture(c);
}

// Soft pool of light cast by a street lamp, drawn additively on the road at night.
export function lightPoolTexture() {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,214,150,0.9)');
  g.addColorStop(0.4, 'rgba(255,190,120,0.35)');
  g.addColorStop(1, 'rgba(255,170,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, { repeat: false });
}

// Normal map from a painted texture's brightness (dark window panes read as recessed, light
// frames, sills and ledges as raised), so facades catch the sun without extra geometry.
export function normalFromTexture(tex, strength = 2.5, size = 512) {
  const src = tex.image;
  const [c, ctx] = canvas(size, size);
  ctx.drawImage(src, 0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  const h = new Float32Array(size * size);
  for (let k = 0; k < size * size; k++) h[k] = (d[k * 4] * 0.3 + d[k * 4 + 1] * 0.59 + d[k * 4 + 2] * 0.11) / 255;
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Sobel gradient (the texture tiles, so wrap at the edges).
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    // Canvas y runs down, texture v up.
    const nx = -gx * strength, ny = gy * strength, nz = 1, l = Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}
