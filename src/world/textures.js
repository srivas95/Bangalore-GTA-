// Procedurally painted canvas textures. No external image assets needed.
import * as THREE from 'three';
import { SHOP_SIGNS, LANE_W } from '../config.js';
import { drawSignboard } from './signboards.js';

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
  ctx.fillStyle = '#6e6a64';
  ctx.fillRect(0, 0, 256, 256);
  // Interlocking pavers, mostly weathered grey with the odd faded red band (BBMP footpaths).
  const bw = 32, bh = 16;
  for (let row = 0; row < 256 / bh; row++) {
    const red = row % 6 === 2 || row % 6 === 3;
    for (let x = (row % 2) * (bw / 2) - bw; x < 256; x += bw) {
      const base = red ? [128, 92, 78] : [150, 146, 138];
      const j = rand(-16, 12);
      ctx.fillStyle = `rgb(${base[0] + j},${base[1] + j},${base[2] + j})`;
      ctx.beginPath();
      ctx.roundRect(x + 1.2, row * bh + 1.2, bw - 2.4, bh - 2.4, 3);
      ctx.fill();
    }
  }
  blotches(ctx, 256, 256, 18, '50,44,36', 50, 0.22);
  blotches(ctx, 256, 256, 6, '120,100,70', 30, 0.18);
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
  // Wall plaster is mid-light grey (the facade shader paints it with the building's colour);
  // frames, sills and AC units stay near-white and glass dark, so they're left unpainted.
  ctx.fillStyle = '#d6d0c5';
  ctx.fillRect(0, 0, 512, 512);
  blotches(ctx, 512, 512, 20, '150,140,125', 80, 0.25);
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
  ctx.fillStyle = '#d6cfc3';
  ctx.fillRect(0, 0, 512, 512);
  blotches(ctx, 512, 512, 15, '140,130,120', 80, 0.25);
  const clothes = ['#9a3a2e', '#3a6a92', '#c8a43a', '#6a4a7a', '#3a7a6a', '#e4e0d8', '#b8703a'];
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
      ctx.fillStyle = '#d2cbbf';
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

// Atlas of shop signs: 4 columns x 16 rows, each 512 x 128 (see signboards.js for how they're
// drawn). Each shop appears more than once, each time as a different board.
export const SIGN_COLS = 4, SIGN_ROWS = 16;
export function signAtlas() {
  const [c, ctx] = canvas(2048, 2048);
  const W = 512, H = 128;
  for (let k = 0; k < SIGN_COLS * SIGN_ROWS; k++) {
    const sign = SHOP_SIGNS[k % SHOP_SIGNS.length];
    const x = (k % SIGN_COLS) * W, y = Math.floor(k / SIGN_COLS) * H;
    const rnd = mulberry32(1013 + k * 7919);
    ctx.save();
    ctx.translate(x, y);
    drawSignboard(ctx, sign, W, H, rnd);
    ctx.restore();
  }
  return toTexture(c, { repeat: false });
}

function fitText(ctx, text, x, y, maxW) {
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
export function textTexture(lines, { w = 512, h = 128, bg = '#1f4e8c', fg = '#fff', font = 'bold 44px "Noto Sans Kannada", Arial, sans-serif', fonts, scale = 1 } = {}) {
  const [c, ctx] = canvas(Math.max(16, Math.round(w * scale)), Math.max(8, Math.round(h * scale)));
  ctx.scale(c.width / w, c.height / h);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, k) => { ctx.font = fonts?.[k] ?? font; fitText(ctx, l, w / 2, (h / (lines.length + 1)) * (k + 1), w - 20); });
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
  const lit = () => true;
  const rect = (x, y, w, h) => { ctx.fillStyle = '#fff4e4'; ctx.fillRect(x, y, w, h); };
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
    for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) rect(b * 128 + 4, f * 128 + 4, 120, 100);
  } else if (shop) {
    for (let s = 0; s < 2; s++) { if (rng() < 0.25) continue; ctx.fillStyle = rng() < 0.5 ? '#ffe2a8' : '#dfefff'; ctx.globalAlpha = rand(0.4, 0.9); ctx.fillRect(s * 256 + 24, 100, 208, 150); ctx.globalAlpha = 1; }
  }
  return toTexture(c);
}

// Soft pool of light cast by a street lamp, drawn additively on the road at night.
export function lightPoolTexture() {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,214,150,0.75)');
  g.addColorStop(0.3, 'rgba(255,200,135,0.42)');
  g.addColorStop(0.65, 'rgba(255,184,115,0.13)');
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

// ---------- Shop fronts: an atlas of 8 shop types (4 x 2 cells, each an 8 m x 4 m tile holding
// two shops) and a matching night-glow atlas. Goods are kept muted and interiors dark. ----------
export const SHOP_ATLAS = { cols: 4, rows: 2 };
const SHOP_TYPES = ['kirana', 'shutters', 'darshini', 'pharmacy', 'textile', 'mobile', 'hardware', 'bakery'];
const GOODS = ['#7a4a3a', '#9a7a42', '#4a644a', '#3a5470', '#664a62', '#8a8250', '#b8b0a0', '#5a5650', '#a05a3a'];

function shutterPaint(ctx, x, y, w, h, posters) {
  ctx.fillStyle = '#7d8186';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (let yy = y; yy < y + h; yy += 6) ctx.fillRect(x, yy, w, 1.6);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let yy = y + 3; yy < y + h; yy += 6) ctx.fillRect(x, yy, w, 1);
  if (posters) {
    for (let k = 0; k < 3; k++) {
      if (rng() < 0.4) continue;
      ctx.fillStyle = GOODS[Math.floor(rand(0, GOODS.length))];
      ctx.globalAlpha = rand(0.5, 0.85);
      ctx.fillRect(x + rand(8, w - 70), y + rand(10, Math.max(12, h - 90)), rand(40, 64), rand(50, 80));
      ctx.globalAlpha = 1;
    }
    if (rng() < 0.5) { // a padlock and the lifting handle
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x + w / 2 - 5, y + h - 16, 10, 10);
    }
  }
  streaks(ctx, x, y, w, h * 0.6, 0.1);
}

function interiorPaint(ctx, ex, x, y, w, h, warm = true, glow = 0.8) {
  ctx.fillStyle = '#26211c';
  ctx.fillRect(x, y, w, h);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, warm ? 'rgba(255,220,160,0.28)' : 'rgba(220,235,255,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ex.fillStyle = warm ? '#ffd9a0' : '#e6f0ff';
  ex.globalAlpha = glow;
  ex.fillRect(x, y, w, h);
  ex.globalAlpha = 1;
}

function shelvesPaint(ctx, x, y, w, h, palette, rows = 4, itemW = [8, 16]) {
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const yy = y + r * rh;
    for (let xx = x + 6; xx < x + w - 10;) {
      const iw = rand(itemW[0], itemW[1]), ih = rand(rh * 0.45, rh * 0.85);
      ctx.fillStyle = palette[Math.floor(rand(0, palette.length))];
      ctx.fillRect(xx, yy + rh - ih - 4, iw, ih);
      xx += iw + rand(1, 4);
    }
    ctx.fillStyle = '#4a3c2c'; ctx.fillRect(x + 2, yy + rh - 4, w - 4, 4);
  }
}

function shopCell(ctx, ex, type) {
  ctx.fillStyle = '#b9b2a6';
  ctx.fillRect(0, 0, 512, 256);
  for (let s = 0; s < 2; s++) {
    const x = s * 256 + 14, w = 228, y = 34, h = 222;
    const closed = type === 'shutters' || (rng() < 0.18 && type !== 'darshini');
    if (closed) { shutterPaint(ctx, x, y, w, h, true); continue; }
    const up = rand(26, 46); // the shutter rolled up into its box
    switch (type) {
      case 'kirana':
        interiorPaint(ctx, ex, x, y + up, w, h - up, true, 0.75);
        shelvesPaint(ctx, x, y + up + 10, w, h - up - 60, GOODS, 3);
        for (let k = 0; k < 9; k++) { // sachet strips hanging at the front
          ctx.fillStyle = GOODS[Math.floor(rand(0, GOODS.length))];
          ctx.fillRect(x + 10 + k * 24, y + up, 7, rand(30, 60));
        }
        for (let k = 0; k < 4; k++) { ctx.fillStyle = '#b8a888'; ctx.beginPath(); ctx.ellipse(x + 30 + k * 52, y + h - 18, 22, 16, 0, 0, Math.PI * 2); ctx.fill(); }
        break;
      case 'darshini': {
        interiorPaint(ctx, ex, x, y + up, w, h - up, true, 0.95);
        ctx.fillStyle = '#1e1a16'; ctx.fillRect(x + 20, y + up + 12, 90, 50); // menu board
        ctx.fillStyle = 'rgba(230,220,190,0.75)';
        for (let k = 0; k < 6; k++) ctx.fillRect(x + 28, y + up + 18 + k * 7, rand(40, 75), 2);
        const cg = ctx.createLinearGradient(0, y + h - 70, 0, y + h - 30); // steel counter
        cg.addColorStop(0, '#d8dcde'); cg.addColorStop(1, '#8a8e92');
        ctx.fillStyle = cg; ctx.fillRect(x + 6, y + h - 70, w - 12, 40);
        ctx.fillStyle = '#c8b090';
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + 40 + k * 48, y + h - 76, 9, Math.PI, 0); ctx.fill(); }
        break;
      }
      case 'pharmacy':
        interiorPaint(ctx, ex, x, y + up, w, h - up, false, 0.9);
        ctx.fillStyle = '#dcdedc'; ctx.fillRect(x + 4, y + up + 4, w - 8, h - up - 8);
        shelvesPaint(ctx, x + 6, y + up + 12, w - 12, h - up - 70, ['#e8e8e4', '#4a7aa8', '#3a8a5a', '#c8c8c0', '#d84a3a'], 4, [6, 12]);
        ctx.fillStyle = '#1f9a4a'; // green cross
        ctx.fillRect(x + w - 44, y + up + 10, 30, 10); ctx.fillRect(x + w - 34, y + up, 10, 30);
        ex.fillStyle = '#40ff80'; ex.fillRect(x + w - 44, y + up + 10, 30, 10); ex.fillRect(x + w - 34, y + up, 10, 30);
        ctx.strokeStyle = '#6a6e70'; ctx.lineWidth = 4; ctx.strokeRect(x + 70, y + up + 30, 88, h - up - 32);
        break;
      case 'textile':
        interiorPaint(ctx, ex, x, y + up, w, h - up, true, 0.85);
        shelvesPaint(ctx, x, y + up + 6, w, h - up - 40, ['#7a2232', '#b8862a', '#2a6a6a', '#8a2a6a', '#3a3a7a', '#c86a3a', '#6a7a3a'], 4, [12, 18]);
        // a mannequin in a sari
        ctx.fillStyle = '#c89a7a'; ctx.beginPath(); ctx.arc(x + w - 40, y + up + 30, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9a2242'; ctx.beginPath(); ctx.moveTo(x + w - 56, y + h); ctx.lineTo(x + w - 46, y + up + 40); ctx.lineTo(x + w - 34, y + up + 40); ctx.lineTo(x + w - 22, y + h); ctx.fill();
        break;
      case 'mobile':
        interiorPaint(ctx, ex, x, y + up, w, h - up, false, 1.0);
        ctx.fillStyle = '#e8eaec'; ctx.fillRect(x + 4, y + up + 4, w - 8, h - up - 8);
        for (let k = 0; k < 4; k++) { // poster wall
          ctx.fillStyle = ['#1e4a9a', '#c82a2a', '#2a2a2a', '#e0a020'][k];
          ctx.fillRect(x + 10 + k * 54, y + up + 10, 48, 64);
          ctx.fillStyle = '#d8dce0'; ctx.fillRect(x + 26 + k * 54, y + up + 22, 16, 30);
        }
        ctx.fillStyle = 'rgba(150,190,210,0.55)'; ctx.fillRect(x + 8, y + h - 70, w - 16, 44); // glass counter
        ctx.fillStyle = '#4a4e52'; ctx.fillRect(x + 8, y + h - 26, w - 16, 26);
        break;
      case 'hardware':
        interiorPaint(ctx, ex, x, y + up, w, h - up, true, 0.55);
        for (let k = 0; k < 14; k++) { ctx.fillStyle = ['#7a7e82', '#3a5a8a', '#c8c8c0', '#8a6a3a'][k % 4]; ctx.fillRect(x + 8, y + up + 10 + k * 8, w * rand(0.5, 0.9), 5); }
        for (let k = 0; k < 5; k++) { ctx.fillStyle = ['#2a6ab0', '#c83a2a', '#e0b020', '#3a8a3a', '#8a8a8a'][k]; ctx.fillRect(x + 12 + k * 42, y + h - 52, 30, 40); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 12 + k * 42, y + h - 52, 30, 5); }
        break;
      case 'bakery': {
        interiorPaint(ctx, ex, x, y + up, w, h - up, true, 1.0);
        shelvesPaint(ctx, x, y + up + 8, w, 80, ['#c8964a', '#a8662a', '#e8c88a', '#8a4a2a'], 2, [10, 18]);
        const gg = ctx.createLinearGradient(0, y + h - 90, 0, y + h - 20); // lit glass cabinet
        gg.addColorStop(0, 'rgba(255,240,210,0.85)'); gg.addColorStop(1, 'rgba(200,170,120,0.85)');
        ctx.fillStyle = gg; ctx.fillRect(x + 8, y + h - 90, w - 16, 70);
        for (let k = 0; k < 10; k++) { ctx.fillStyle = ['#b8742a', '#e0b060', '#8a3a2a', '#f0e0c0'][k % 4]; ctx.beginPath(); ctx.ellipse(x + 24 + k * 20, y + h - 52 + (k % 2) * 18, 8, 5, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#5a5e62'; ctx.fillRect(x + 8, y + h - 20, w - 16, 20);
        break;
      }
      default: break;
    }
    // The shutter box and the rolled-up shutter at the top.
    shutterPaint(ctx, x, y, w, up, false);
  }
  // Lintel band and pillars, with monsoon streaks.
  ctx.fillStyle = '#a8a196';
  ctx.fillRect(0, 0, 512, 34);
  ctx.fillStyle = '#b0a99e';
  ctx.fillRect(0, 0, 14, 256); ctx.fillRect(256, 0, 14, 256); ctx.fillRect(498, 0, 14, 256);
  streaks(ctx, 0, 34, 512, 40, 0.15);
  grain(ctx, 512, 256, 0.08, 7000);
}

export function shopfrontAtlas(scale = 1) {
  const { cols, rows } = SHOP_ATLAS;
  const CW = Math.round(512 * scale), CH = Math.round(256 * scale);
  const [c, ctx] = canvas(CW * cols, CH * rows);
  const [e, ex] = canvas(CW * cols, CH * rows);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, CW * cols, CH * rows);
  SHOP_TYPES.forEach((type, i) => {
    const ox = (i % cols) * CW, oy = Math.floor(i / cols) * CH;
    for (const g of [ctx, ex]) { g.save(); g.translate(ox, oy); g.scale(scale, scale); g.beginPath(); g.rect(0, 0, 512, 256); g.clip(); }
    shopCell(ctx, ex, type);
    ctx.restore(); ex.restore();
  });
  return { map: toTexture(c), emissive: toTexture(e), cols, rows };
}

// Leaf clusters on a transparent card, painted light so each tree's instance colour sets the hue.
export function leafAtlas(size = 256) {
  const [c, ctx] = canvas(size, size);
  ctx.clearRect(0, 0, size, size);
  const r = mulberry32(4242), R = (a, b) => a + (b - a) * r();
  const k = size / 256;
  // Four leaf clusters, one per quarter, each a few overlapping lobes kept clear of the quarter's
  // edges, so a card shows a whole cluster with a ragged leafy outline, never a straight cut.
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * 128 + 64, oy = (cell >> 1) * 128 + 64;
    for (let lobe = 0; lobe < 4; lobe++) {
      const a0 = r() * Math.PI * 2, d0 = lobe ? R(10, 20) : 0, rad = R(20, 28);
      const cx = ox + Math.cos(a0) * d0, cy = oy + Math.sin(a0) * d0;
      for (let n = 0; n < 130; n++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
        ctx.fillStyle = `hsl(${R(60, 100)}, ${R(8, 28)}%, ${R(58, 96)}%)`;
        ctx.save(); ctx.translate((cx + Math.cos(a) * d) * k, (cy + Math.sin(a) * d) * k); ctx.rotate(r() * Math.PI);
        ctx.beginPath(); ctx.ellipse(0, 0, R(3.5, 7) * k, R(1.8, 3.4) * k, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }
  const t = toTexture(c, { repeat: false, aniso: 4 });
  t.premultiplyAlpha = false;
  return t;
}
