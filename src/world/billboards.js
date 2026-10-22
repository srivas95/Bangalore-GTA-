// Hoardings for Indian brands, and for the city's own cricket team. Painted on a canvas from
// scratch: each brand's name and colours with lines written for the game, never its artwork.
// Every painter draws a 1000 x 450 board, scaled to whatever slot it's given.
import { fitText } from './textures.js';

const OS = '"Oswald", Arial, sans-serif';
const KN = '"Noto Sans Kannada", Arial, sans-serif';
export const AD_ASPECT = 0.45; // height / width

function text(c, s, x, y, size, color, { weight = 700, font = OS, align = 'center', maxW = 900, stroke } = {}) {
  c.font = `${weight} ${size}px ${font}`;
  c.textAlign = align;
  c.textBaseline = 'middle';
  if (stroke) { c.lineJoin = 'round'; c.lineWidth = stroke[1]; c.strokeStyle = stroke[0]; c.save(); c.textAlign = align; strokeFit(c, s, x, y, maxW); c.restore(); }
  c.fillStyle = color;
  if (align === 'center') fitText(c, s, x, y, maxW);
  else c.fillText(s, x, y, maxW);
}

function strokeFit(c, s, x, y, maxW) {
  const w = c.measureText(s).width;
  c.translate(x, y);
  if (w > maxW) c.scale(maxW / w, 1);
  c.strokeText(s, 0, 0);
}

function grad(c, top, bottom, x0 = 0, y0 = 0, x1 = 0, y1 = 450) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, 0, 1000, 450);
}

function rrect(c, x, y, w, h, r, fill, stroke, lw = 6) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
}

function circle(c, x, y, r, fill, stroke, lw = 6) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
}

function frame(c, color, lw = 14) {
  c.lineWidth = lw; c.strokeStyle = color;
  c.strokeRect(lw / 2, lw / 2, 1000 - lw, 450 - lw);
}

// A two-wheeler side view (scooters and motorcycles).
function bike(c, x, y, s, body, wheel = '#111', scooter = true) {
  for (const dx of [-60, 60]) { circle(c, x + dx * s, y, 30 * s, wheel); circle(c, x + dx * s, y, 12 * s, '#888'); }
  c.fillStyle = body;
  c.beginPath();
  if (scooter) {
    c.moveTo(x - 85 * s, y - 15 * s); c.lineTo(x - 30 * s, y - 55 * s); c.lineTo(x + 20 * s, y - 55 * s);
    c.lineTo(x + 45 * s, y - 20 * s); c.lineTo(x + 50 * s, y - 95 * s); c.lineTo(x + 70 * s, y - 95 * s);
    c.lineTo(x + 85 * s, y - 15 * s); c.closePath();
  } else {
    c.moveTo(x - 75 * s, y - 25 * s); c.lineTo(x - 40 * s, y - 70 * s); c.lineTo(x + 30 * s, y - 75 * s);
    c.lineTo(x + 70 * s, y - 60 * s); c.lineTo(x + 60 * s, y - 25 * s); c.closePath();
  }
  c.fill();
}

// A bottle silhouette.
function bottle(c, x, y, s, fill, label) {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(x - 12 * s, y - 150 * s); c.lineTo(x + 12 * s, y - 150 * s); c.lineTo(x + 14 * s, y - 100 * s);
  c.quadraticCurveTo(x + 40 * s, y - 80 * s, x + 40 * s, y - 40 * s); c.lineTo(x + 40 * s, y + 60 * s);
  c.quadraticCurveTo(x + 40 * s, y + 75 * s, x + 25 * s, y + 75 * s); c.lineTo(x - 25 * s, y + 75 * s);
  c.quadraticCurveTo(x - 40 * s, y + 75 * s, x - 40 * s, y + 60 * s); c.lineTo(x - 40 * s, y - 40 * s);
  c.quadraticCurveTo(x - 40 * s, y - 80 * s, x - 14 * s, y - 100 * s); c.closePath(); c.fill();
  if (label) { c.fillStyle = label; c.fillRect(x - 40 * s, y - 20 * s, 80 * s, 40 * s); }
}

// ---------- Royal Challengers Bengaluru ----------
function rcb(c, v) {
  c.fillStyle = '#111111'; c.fillRect(0, 0, 1000, 450);
  c.fillStyle = '#c8102e';
  c.beginPath(); c.moveTo(0, 0); c.lineTo(640, 0); c.lineTo(450, 450); c.lineTo(0, 450); c.fill();
  c.strokeStyle = '#d4a52a'; c.lineWidth = 16;
  c.beginPath(); c.moveTo(640, 0); c.lineTo(450, 450); c.stroke();
  // A crest of our own: a gold-edged shield with the initials and a little crown.
  const sx = 790, sy = 235;
  c.beginPath();
  c.moveTo(sx - 115, sy - 140); c.lineTo(sx + 115, sy - 140); c.lineTo(sx + 115, sy + 20);
  c.quadraticCurveTo(sx + 110, sy + 120, sx, sy + 175); c.quadraticCurveTo(sx - 110, sy + 120, sx - 115, sy + 20); c.closePath();
  c.fillStyle = '#1a1a1a'; c.fill(); c.lineWidth = 12; c.strokeStyle = '#d4a52a'; c.stroke();
  c.fillStyle = '#d4a52a';
  c.beginPath(); c.moveTo(sx - 60, sy - 160); c.lineTo(sx - 40, sy - 205); c.lineTo(sx - 15, sy - 170); c.lineTo(sx, sy - 215);
  c.lineTo(sx + 15, sy - 170); c.lineTo(sx + 40, sy - 205); c.lineTo(sx + 60, sy - 160); c.closePath(); c.fill();
  text(c, 'RCB', sx, sy - 20, 120, '#d4a52a', { maxW: 200 });
  c.fillStyle = '#c8102e'; c.fillRect(sx - 80, sy + 50, 160, 14);
  text(c, 'ROYAL CHALLENGERS', 290, 70, 62, '#d4a52a', { maxW: 540 });
  text(c, 'BENGALURU', 280, 135, 62, '#ffffff', { maxW: 500 });
  if (v === 'chant') {
    text(c, 'EE SALA CUP NAMDE!', 250, 255, 84, '#ffffff', { maxW: 460 });
    text(c, 'ಈ ಸಲ ಕಪ್ ನಮ್ದೇ', 230, 360, 64, '#ffd75a', { font: KN, maxW: 400 });
  } else if (v === 'champs') {
    text(c, 'IPL CHAMPIONS', 255, 250, 82, '#ffffff', { maxW: 470 });
    text(c, '2025', 235, 330, 76, '#ffd75a', { maxW: 300 });
    text(c, 'ಈ ಸಲ ಕಪ್ ನಮ್ದು!', 215, 405, 46, '#ffffff', { font: KN, maxW: 380 });
  } else {
    text(c, 'MATCH DAY', 255, 250, 88, '#ffffff', { maxW: 470 });
    text(c, 'Chinnaswamy · Red & Gold, every ball', 225, 345, 40, '#ffd75a', { weight: 500, maxW: 400 });
  }
}

// ---------- The brands ----------
const PAINT = {
  rcbChant: (c) => rcb(c, 'chant'),
  rcbChamps: (c) => rcb(c, 'champs'),
  rcbMatch: (c) => rcb(c, 'match'),
  nandini: (c) => {
    grad(c, '#ffffff', '#dbe8fb');
    c.fillStyle = '#1d4fa0';
    c.beginPath(); c.moveTo(0, 330); c.bezierCurveTo(250, 280, 450, 400, 1000, 320); c.lineTo(1000, 450); c.lineTo(0, 450); c.fill();
    text(c, 'NANDINI', 330, 110, 150, '#1d4fa0', { maxW: 560 });
    text(c, 'ನಂದಿನಿ', 330, 225, 70, '#1d4fa0', { font: KN, maxW: 400 });
    text(c, 'Pure milk from Karnataka\'s farms · ಶುದ್ಧ ಹಾಲು', 400, 395, 40, '#ffffff', { weight: 500, maxW: 720 });
    rrect(c, 735, 60, 170, 250, 30, '#ffffff', '#1d4fa0', 10);
    c.fillStyle = '#1d4fa0'; c.fillRect(735, 200, 170, 60);
    circle(c, 820, 130, 38, '#1d4fa0');
    text(c, 'MILK', 820, 230, 40, '#ffffff', { maxW: 140 });
  },
  sandal: (c) => {
    grad(c, '#0b6b3a', '#064424');
    frame(c, '#d8b45a', 16);
    text(c, 'MYSORE SANDAL SOAP', 380, 95, 82, '#f2d27a', { maxW: 660 });
    text(c, 'ಮೈಸೂರು ಸ್ಯಾಂಡಲ್ ಸೋಪ್', 380, 195, 54, '#ffffff', { font: KN, maxW: 600 });
    text(c, 'Pure sandalwood oil · Made in Bengaluru since 1916', 380, 300, 34, '#f2d27a', { weight: 500, maxW: 640 });
    c.save(); c.translate(840, 260); c.rotate(-0.25);
    c.beginPath(); c.ellipse(0, 0, 115, 70, 0, 0, Math.PI * 2); c.fillStyle = '#e9cf9a'; c.fill();
    c.lineWidth = 6; c.strokeStyle = '#b8924a'; c.stroke();
    text(c, 'SANDAL', 0, 0, 40, '#8a6a2a', { maxW: 170 });
    c.restore();
  },
  mtr: (c) => {
    c.fillStyle = '#c8102e'; c.fillRect(0, 0, 1000, 450);
    c.fillStyle = '#ffd200'; c.fillRect(0, 300, 1000, 150);
    rrect(c, 60, 50, 330, 210, 24, '#ffffff', '#ffd200', 12);
    text(c, 'MTR', 225, 160, 150, '#c8102e', { maxW: 290 });
    text(c, 'Rava Idli. Since 1924.', 680, 110, 64, '#ffffff', { maxW: 560 });
    text(c, 'ಬೆಳಗಿನ ತಿಂಡಿ, ಬೆಂಗಳೂರಿನ ಶೈಲಿ', 680, 210, 44, '#ffe9a0', { font: KN, maxW: 560 });
    text(c, 'Breakfast, the Bengaluru way', 500, 375, 60, '#c8102e', { maxW: 880 });
  },
  amul: (c) => {
    c.fillStyle = '#e4232b'; c.fillRect(0, 0, 1000, 450);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    for (let y = 30; y < 450; y += 70) for (let x = 640 + ((y / 70) % 2) * 35; x < 1000; x += 70) { c.beginPath(); c.arc(x, y, 14, 0, Math.PI * 2); c.fill(); }
    text(c, 'AMUL BUTTER', 330, 120, 104, '#ffffff', { maxW: 600 });
    text(c, 'Spread a little happiness', 330, 240, 52, '#ffe9a0', { weight: 500, maxW: 600 });
    text(c, 'on every Bengaluru breakfast', 330, 310, 40, '#ffffff', { weight: 400, maxW: 600 });
    rrect(c, 710, 150, 220, 140, 14, '#ffd84a', '#ffffff', 8);
    c.fillStyle = '#e4232b'; c.fillRect(710, 150, 220, 40);
    text(c, 'BUTTER', 820, 240, 46, '#e4232b', { maxW: 190 });
  },
  parle: (c) => {
    c.fillStyle = '#ffd200'; c.fillRect(0, 0, 1000, 450);
    c.fillStyle = '#e1251b'; c.fillRect(0, 0, 1000, 70); c.fillRect(0, 380, 1000, 70);
    text(c, 'PARLE-G', 350, 190, 150, '#e1251b', { maxW: 600, stroke: ['#ffffff', 14] });
    text(c, 'Chai\'s best friend', 350, 310, 56, '#3a2a10', { weight: 500, maxW: 600 });
    for (const [x, y, a] of [[790, 200, -0.2], [850, 260, 0.15]]) {
      c.save(); c.translate(x, y); c.rotate(a);
      rrect(c, -100, -60, 200, 120, 12, '#d9a24a', '#a8742a', 6);
      c.fillStyle = '#a8742a'; for (let k = 0; k < 8; k++) { c.beginPath(); c.arc(-70 + (k % 4) * 46, -25 + Math.floor(k / 4) * 50, 6, 0, 7); c.fill(); }
      c.restore();
    }
  },
  flipkart: (c) => {
    c.fillStyle = '#2874f0'; c.fillRect(0, 0, 1000, 450);
    text(c, 'Flipkart', 360, 150, 150, '#ffe11b', { maxW: 600, font: OS });
    text(c, 'Delivered tomorrow.', 360, 285, 60, '#ffffff', { maxW: 620 });
    text(c, 'Made in Bengaluru', 360, 365, 44, '#ffe11b', { weight: 500, maxW: 600 });
    rrect(c, 730, 120, 200, 220, 20, '#ffe11b');
    c.lineWidth = 14; c.strokeStyle = '#ffe11b'; c.beginPath(); c.arc(830, 120, 55, Math.PI, 0); c.stroke();
    text(c, 'f', 830, 235, 170, '#2874f0', { maxW: 150 });
  },
  swiggy: (c) => {
    c.fillStyle = '#fc8019'; c.fillRect(0, 0, 1000, 450);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(820, 180, 95, Math.PI, 0); c.quadraticCurveTo(915, 260, 820, 390); c.quadraticCurveTo(725, 260, 725, 180); c.fill();
    circle(c, 820, 180, 38, '#fc8019');
    text(c, 'Swiggy', 350, 140, 150, '#ffffff', { maxW: 600 });
    text(c, 'Hot food, fast.', 350, 270, 64, '#3a1a00', { maxW: 600 });
    text(c, 'ಬಿಸಿ ಬಿಸಿ ಊಟ, ಬೇಗ ಬೇಗ', 350, 365, 48, '#ffffff', { font: KN, maxW: 600 });
  },
  ather: (c) => {
    grad(c, '#24292e', '#111315');
    c.fillStyle = '#3cc47c'; c.fillRect(0, 395, 1000, 12);
    text(c, 'A T H E R', 320, 120, 110, '#ffffff', { maxW: 560 });
    text(c, 'Electric scooters', 320, 235, 56, '#3cc47c', { maxW: 560 });
    text(c, 'Built in Bengaluru · Charge, ride, repeat', 320, 320, 36, '#cfd6dc', { weight: 400, maxW: 580 });
    bike(c, 790, 300, 1.25, '#e9ecef', '#0a0a0a', true);
  },
  enfield: (c) => {
    c.fillStyle = '#0d0d0d'; c.fillRect(0, 0, 1000, 450);
    frame(c, '#c9a14a', 12);
    text(c, 'ROYAL ENFIELD', 360, 110, 96, '#c9a14a', { maxW: 640 });
    text(c, 'Classic 350', 360, 225, 70, '#ffffff', { maxW: 560 });
    text(c, 'Since 1901 · Thump through the traffic', 360, 320, 36, '#c9a14a', { weight: 400, maxW: 600 });
    bike(c, 800, 300, 1.3, '#6a1010', '#0a0a0a', false);
    c.fillStyle = '#c9a14a'; c.fillRect(750, 200, 60, 12);
  },
  thumsup: (c) => {
    c.fillStyle = '#d71920'; c.fillRect(0, 0, 1000, 450);
    c.fillStyle = '#14378c';
    c.beginPath(); c.moveTo(620, 0); c.lineTo(1000, 0); c.lineTo(1000, 450); c.lineTo(470, 450); c.fill();
    text(c, 'THUMS UP', 300, 140, 124, '#ffffff', { maxW: 520 });
    text(c, 'Strong cola.', 290, 265, 62, '#ffe9a0', { maxW: 480 });
    text(c, 'Thunder-cold.', 280, 345, 62, '#ffffff', { maxW: 460 });
    bottle(c, 790, 260, 1.15, '#2a0a06', '#d71920');
  },
  jio: (c) => {
    c.fillStyle = '#0f3cc9'; c.fillRect(0, 0, 1000, 450);
    circle(c, 230, 225, 160, '#e30613');
    text(c, 'Jio', 230, 220, 140, '#ffffff', { maxW: 260 });
    text(c, 'True 5G', 650, 140, 110, '#ffffff', { maxW: 560 });
    text(c, 'From Majestic to Whitefield', 650, 260, 46, '#cfe0ff', { weight: 500, maxW: 580 });
    text(c, 'ಎಲ್ಲೆಡೆ 5G', 650, 345, 50, '#ffffff', { font: KN, maxW: 500 });
  },
  kingfisher: (c) => {
    c.fillStyle = '#c8102e'; c.fillRect(0, 0, 1000, 450);
    c.fillStyle = '#ffffff'; c.fillRect(0, 330, 1000, 120);
    text(c, 'KINGFISHER', 380, 130, 130, '#ffffff', { maxW: 680 });
    text(c, 'Packaged Drinking Water', 380, 250, 54, '#ffe9a0', { weight: 500, maxW: 640 });
    text(c, 'Cool, clear, and only water. Honest.', 450, 390, 38, '#c8102e', { weight: 500, maxW: 820 });
    bottle(c, 850, 210, 1.05, 'rgba(220,240,255,0.95)', '#c8102e');
  },
  tanishq: (c) => {
    grad(c, '#7a1020', '#4a0812');
    frame(c, '#d9b25a', 10);
    text(c, 'TANISHQ', 330, 125, 120, '#e8c46a', { maxW: 560 });
    text(c, 'Wedding gold, made to be handed down', 330, 250, 38, '#ffffff', { weight: 400, maxW: 580 });
    text(c, 'Commercial Street · Jayanagar · Malleshwaram', 330, 330, 30, '#e8c46a', { weight: 400, maxW: 580 });
    c.lineWidth = 10; c.strokeStyle = '#e8c46a';
    c.beginPath(); c.arc(810, 150, 120, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    for (let k = 0; k < 9; k++) { const a = 0.18 * Math.PI + (k / 8) * 0.64 * Math.PI; circle(c, 810 + Math.cos(a) * 120, 150 + Math.sin(a) * 120, k === 4 ? 26 : 14, k === 4 ? '#c8102e' : '#e8c46a'); }
  },
  asian: (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1000, 450);
    const cols = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#6a4c93'];
    cols.forEach((col, k) => { c.fillStyle = col; c.fillRect(640 + k * 60, 0, 60, 450); });
    text(c, 'asian paints', 320, 140, 100, '#d6202a', { maxW: 560 });
    text(c, 'Colour your home', 320, 260, 60, '#333333', { maxW: 560 });
    text(c, 'ಮನೆಗೆ ಹೊಸ ಬಣ್ಣ', 320, 350, 50, '#2a9d8f', { font: KN, maxW: 520 });
  },
  fevicol: (c) => {
    c.fillStyle = '#ff8c00'; c.fillRect(0, 0, 1000, 450);
    c.fillStyle = '#0a3d91'; c.fillRect(0, 0, 1000, 90); c.fillRect(0, 360, 1000, 90);
    text(c, 'FEVICOL', 340, 210, 150, '#0a3d91', { maxW: 600, stroke: ['#ffffff', 12] });
    text(c, 'Bonds that never break', 500, 405, 50, '#ffffff', { maxW: 880 });
    text(c, 'Even Silk Board traffic can\'t pull it apart', 500, 45, 38, '#ffffff', { weight: 500, maxW: 900 });
    rrect(c, 740, 140, 120, 190, 18, '#ffffff', '#0a3d91', 8);
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(770, 140); c.lineTo(800, 100); c.lineTo(830, 140); c.fill();
    c.fillStyle = '#0a3d91'; c.fillRect(740, 200, 120, 50);
  },
  karnataka: (c) => {
    grad(c, '#0e7c86', '#0a4c57');
    c.fillStyle = '#f2c14e';
    // A palace skyline of our own: domes on a long facade.
    c.fillRect(600, 300, 360, 80);
    for (const [x, r] of [[640, 30], [720, 38], [780, 60], [840, 38], [920, 30]]) {
      c.beginPath(); c.arc(x, 300, r, Math.PI, 0); c.fill(); c.fillRect(x - 3, 300 - r - 40, 6, 40);
    }
    text(c, 'ಕರ್ನಾಟಕ', 300, 110, 96, '#f2c14e', { font: KN, maxW: 520 });
    text(c, 'KARNATAKA', 300, 220, 86, '#ffffff', { maxW: 520 });
    text(c, 'One State. Many Worlds.', 300, 330, 46, '#f2c14e', { weight: 500, maxW: 520 });
  },
  metro: (c) => {
    c.fillStyle = '#6a2c91'; c.fillRect(0, 0, 1000, 450);
    c.fillStyle = '#3aa64c'; c.fillRect(0, 300, 1000, 22);
    text(c, 'Namma Metro', 330, 120, 112, '#ffffff', { maxW: 600 });
    text(c, 'ನಮ್ಮ ಮೆಟ್ರೋ', 330, 230, 62, '#ffd84a', { font: KN, maxW: 520 });
    text(c, 'Skip the jam. Ride above it.', 500, 385, 52, '#ffffff', { weight: 500, maxW: 880 });
    rrect(c, 700, 90, 240, 150, 30, '#e8e8e8', '#3aa64c', 8);
    c.fillStyle = '#2a3a4a'; for (let k = 0; k < 3; k++) c.fillRect(720 + k * 72, 115, 56, 60);
    c.fillStyle = '#6a2c91'; c.fillRect(700, 190, 240, 22);
  },
};

// Which boards go where: weights, with the team taking over round Chinnaswamy.
export const BRANDS = [
  { id: 'rcbChant', w: 1.2, rcb: true }, { id: 'rcbChamps', w: 0.9, rcb: true }, { id: 'rcbMatch', w: 0.6, rcb: true },
  { id: 'nandini', w: 1.4 }, { id: 'sandal', w: 1.2 }, { id: 'mtr', w: 1.2 }, { id: 'amul', w: 1 }, { id: 'parle', w: 1 },
  { id: 'flipkart', w: 1.1 }, { id: 'swiggy', w: 1.1 }, { id: 'ather', w: 1 }, { id: 'enfield', w: 1 }, { id: 'thumsup', w: 1 },
  { id: 'jio', w: 1 }, { id: 'kingfisher', w: 0.8 }, { id: 'tanishq', w: 0.9 }, { id: 'asian', w: 0.9 }, { id: 'fevicol', w: 0.8 },
  { id: 'karnataka', w: 0.7 }, { id: 'metro', w: 0.8 },
];

export function pickBrand(rng, rcbBoost = 1, avoid = null) {
  let total = 0;
  for (const b of BRANDS) if (b.id !== avoid) total += b.w * (b.rcb ? rcbBoost : 1);
  let r = rng() * total;
  for (const b of BRANDS) { if (b.id === avoid) continue; if ((r -= b.w * (b.rcb ? rcbBoost : 1)) <= 0) return b.id; }
  return BRANDS[0].id;
}

// paint(ctx, pw, ph) for a slot of that size.
export function adPainter(id) {
  const p = PAINT[id];
  return (ctx, pw, ph) => { ctx.save(); ctx.scale(pw / 1000, ph / 450); p(ctx); ctx.restore(); };
}
