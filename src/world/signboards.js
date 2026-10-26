// Shop boards the way they look on a Bengaluru street, painted into the sign atlas.
//  - Neighbourhood shops: printed flex boards (gradient, a picture of what they sell in a roundel,
//    the name in Kannada on top and bigger than the English, a phone number, a sponsor strip from
//    a cola, telecom or paint company), hand-painted boards, or newer aluminium panels with raised
//    letters. Karnataka wants signs at least 60 % Kannada, so the Kannada line leads.
//  - Chains: each in its own colours and lettering, with an emblem drawn in the spirit of theirs
//    (approximations, not their artwork).
//  - Then the street gets at them: sun fade, dust, rain streaks, a dented frame, bolts.

const KN = '"Baloo Tamma 2", "Noto Sans Kannada", sans-serif';
const BALOO = '"Baloo Tamma 2", "Noto Sans Kannada", "Arial Black", sans-serif';
const ANTON = 'Anton, Oswald, "Arial Narrow", Impact, sans-serif';
const OSWALD = 'Oswald, "Arial Narrow", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const SCRIPT = 'Yellowtail, "Brush Script MT", cursive';

// Flex board colour schemes: [top, bottom, Kannada fill, English fill, outline].
const FLEX = [
  ['#e8231d', '#9a0f0c', '#ffffff', '#ffe14a', '#3a0000'],
  ['#ffd31a', '#f08c00', '#b0100c', '#1a2a8a', '#ffffff'],
  ['#1d4fb8', '#0b2466', '#ffffff', '#ffd31a', '#000a30'],
  ['#1f8f3a', '#0b4a1c', '#ffffff', '#fff2a0', '#002a08'],
  ['#c2187e', '#6a0a44', '#ffffff', '#ffe14a', '#2a0018'],
  ['#ffffff', '#e8e4dc', '#c0100c', '#1a3a9a', '#ffffff'],
  ['#ff7a00', '#c23c00', '#ffffff', '#1a1a5a', '#4a1400'],
  ['#5a1fa8', '#2a0a5e', '#ffffff', '#7ff0ff', '#12002a'],
];
const PAINTED = [['#f4ead2', '#b0140c', '#1a3a8a'], ['#ffe066', '#9a0c0c', '#123a7a'], ['#ffffff', '#0c4a9a', '#b0140c'], ['#d9f0ff', '#0a3a7a', '#a0100c'], ['#e8f4e0', '#0a5a2a', '#9a0c0c']];
const SPONSORS = {
  pepsi: { bg: '#0b3d91', fg: '#ffffff', text: 'Pepsi' },
  coke: { bg: '#e41e2b', fg: '#ffffff', text: 'Coca-Cola' },
  airtel: { bg: '#e40000', fg: '#ffffff', text: 'airtel' },
  jio: { bg: '#0f3cc9', fg: '#ffffff', text: 'Jio' },
  paints: { bg: '#ffffff', fg: '#d6001c', text: 'Asian Paints' },
  havells: { bg: '#e2001a', fg: '#ffffff', text: 'HAVELLS' },
};

export function drawSignboard(ctx, sign, W, H, rnd) {
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let kind;
  if (sign.brand) { drawBrand(ctx, sign, W, H, rnd); kind = sign.look?.painted ? 'painted' : sign.look?.lit ? 'lit' : 'flex'; }
  else {
    const r = rnd();
    kind = sign.industrial ? (r < 0.6 ? 'painted' : 'flex') : r < 0.58 ? 'flex' : r < 0.82 ? 'painted' : 'acp';
    if (kind === 'flex') drawFlex(ctx, sign, W, H, rnd);
    else if (kind === 'painted') drawPainted(ctx, sign, W, H, rnd);
    else drawAcp(ctx, sign, W, H, rnd);
  }
  weather(ctx, W, H, rnd, kind);
  ctx.restore();
}

// ---------- neighbourhood shops ----------
function drawFlex(ctx, s, W, H, rnd) {
  const [c0, c1, knFill, enFill, stroke] = FLEX[Math.floor(rnd() * FLEX.length)];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // A swoosh of lighter colour behind the text, as every flex printer adds.
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.moveTo(W * 0.18, H); ctx.quadraticCurveTo(W * 0.55, H * 0.1, W, H * 0.25); ctx.lineTo(W, H * 0.55); ctx.quadraticCurveTo(W * 0.6, H * 0.4, W * 0.3, H); ctx.fill();
  const sp = s.sponsor && SPONSORS[s.sponsor];
  const strip = sp ? 20 : 0;
  // The picture: a roundel at the left.
  const R = (H - strip) * 0.36, ex = R + 12, ey = (H - strip) / 2;
  ctx.fillStyle = '#ffffff'; circle(ctx, ex, ey, R + 3);
  ctx.fillStyle = c1; circle(ctx, ex, ey, R);
  icon(ctx, s.cat, ex, ey, R * 0.78, '#ffffff', c1);
  const x0 = ex + R + 10, tw = W - x0 - 10, cx = x0 + tw / 2;
  // Kannada name: big, white or coloured, with a fat outline.
  outlined(ctx, s.kn, cx, (H - strip) * 0.33, `800 46px ${KN}`, knFill, stroke, 6, tw);
  outlined(ctx, s.en.toUpperCase(), cx, (H - strip) * 0.66, `30px ${ANTON}`, enFill, stroke, 4, tw - 20);
  ctx.font = `600 13px ${OSWALD}`;
  ctx.fillStyle = knFill;
  fit(ctx, `${s.sub || ''}${s.sub ? '   ·   ' : ''}Ph: ${phone(rnd)}`, cx, (H - strip) * 0.9, tw);
  if (sp) {
    ctx.fillStyle = sp.bg; ctx.fillRect(0, H - strip, W, strip);
    ctx.fillStyle = sp.fg; ctx.font = `bold italic 17px ${OSWALD}`;
    for (const x of [W * 0.12, W * 0.5, W * 0.88]) ctx.fillText(sp.text, x, H - strip / 2 + 1);
  }
}

function drawPainted(ctx, s, W, H, rnd) {
  const [bg, a, b] = PAINTED[Math.floor(rnd() * PAINTED.length)];
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // A painted border line inset from the edge.
  ctx.strokeStyle = a; ctx.lineWidth = 3; ctx.strokeRect(9, 9, W - 18, H - 18);
  // Hand lettering: each glyph a little off, with a black drop shadow.
  handLetter(ctx, s.kn, W / 2, H * 0.36, `700 44px ${KN}`, a, W - 40, rnd);
  handLetter(ctx, s.en.toUpperCase(), W / 2, H * 0.72, `bold 30px ${SERIF}`, b, W - 50, rnd);
  if (rnd() < 0.5) { ctx.font = `12px ${OSWALD}`; ctx.fillStyle = a; ctx.fillText(phone(rnd), W - 70, H - 16); }
}

function drawAcp(ctx, s, W, H, rnd) {
  const dark = rnd() < 0.6;
  ctx.fillStyle = dark ? '#1c1d20' : '#e8e8e4'; ctx.fillRect(0, 0, W, H);
  // Brushed aluminium grain.
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)';
  for (let y = 0; y < H; y += 2) if (rnd() < 0.5) ctx.fillRect(0, y, W, 1);
  const face = dark ? (rnd() < 0.5 ? '#ffffff' : '#f0c040') : (rnd() < 0.5 ? '#c0100c' : '#123a8a');
  // Raised channel letters: a darker extrusion under the face.
  for (const [txt, y, font] of [[s.kn, H * 0.36, `800 40px ${KN}`], [s.en.toUpperCase(), H * 0.72, `28px ${ANTON}`]]) {
    ctx.font = font;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; fit(ctx, txt, W / 2 + 2, y + 3, W - 40);
    ctx.fillStyle = face; fit(ctx, txt, W / 2, y, W - 40);
  }
}

// ---------- chains ----------
function drawBrand(ctx, s, W, H, rnd) {
  const L = s.look || {}, bg = s.bg, fg = s.fg;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (L.lit) { // light box: brighter in the middle
    const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (L.border) { ctx.strokeStyle = L.border; ctx.lineWidth = 4; ctx.strokeRect(7, 7, W - 14, H - 14); }
  let x0 = 14;
  if (L.emblem) {
    const R = H * 0.34, ex = R + 16, ey = H / 2;
    emblem(ctx, L.emblem, ex, ey, R, s, L);
    x0 = ex + R + 12;
  }
  const tw = W - x0 - 14, cx = x0 + tw / 2;
  const fonts = {
    heavy: `800 52px ${BALOO}`, serif: `bold 50px ${SERIF}`, condensed: `60px ${ANTON}`, script: `62px ${SCRIPT}`,
    spaced: `600 50px ${OSWALD}`, rounded: `800 50px ${BALOO}`, thin: `300 46px ${OSWALD}`, serifSpaced: `44px ${SERIF}`,
    sans: `700 48px ${OSWALD}`, lower: `800 54px ${BALOO}`, italic: `italic bold 60px ${SERIF}`,
  };
  const title = L.title || s.en;
  const name = L.font === 'lower' ? title.toLowerCase() : L.font === 'spaced' || L.font === 'serifSpaced' ? title.toUpperCase().split('').join(' ') : title;
  const knLine = s.knName || '';
  ctx.fillStyle = fg;
  if (L.knFirst) {
    ctx.font = `800 40px ${KN}`; fit(ctx, knLine, cx, H * 0.3, tw);
    ctx.font = (fonts[L.font] || fonts.sans).replace(/\d+px/, (m) => `${Math.round(parseInt(m) * 0.62)}px`); fit(ctx, name, cx, H * 0.64, tw);
    ctx.font = `500 14px ${OSWALD}`; ctx.globalAlpha = 0.85; fit(ctx, s.kn, cx, H * 0.88, tw); ctx.globalAlpha = 1;
  } else {
    ctx.font = fonts[L.font] || fonts.sans;
    if (L.accent && s.en.includes(' ')) { // two-colour wordmark (Apollo | Pharmacy)
      const [a, ...rest] = s.en.split(' ');
      ctx.textAlign = 'right'; ctx.fillStyle = fg; fit(ctx, a + ' ', cx + 10, H * 0.44, tw / 2 + 40, 'right');
      ctx.textAlign = 'left'; ctx.fillStyle = L.accent; ctx.font = `600 34px ${OSWALD}`; fit(ctx, rest.join(' ').toUpperCase(), cx + 14, H * 0.47, tw / 2, 'left');
      ctx.textAlign = 'center'; ctx.fillStyle = fg;
    } else fit(ctx, name, cx, H * 0.44, tw);
    ctx.font = `600 17px ${KN}`; ctx.globalAlpha = 0.95; fit(ctx, knLine, cx, H * 0.8, tw * 0.5 - 6, 'center', cx - tw * 0.25);
    ctx.font = `500 15px ${OSWALD}`; fit(ctx, s.kn, cx + tw * 0.25, H * 0.8, tw * 0.5 - 6);
    ctx.globalAlpha = 1;
  }
  if (L.atm) { // ATM box at the right end
    ctx.fillStyle = '#ffd200'; ctx.fillRect(W - 74, H - 40, 62, 28);
    ctx.fillStyle = '#0b4ea2'; ctx.font = `bold 20px ${OSWALD}`; ctx.fillText('ATM', W - 43, H - 25);
  }
}

function emblem(ctx, kind, x, y, R, s, L) {
  const fg = s.fg, bg = s.bg;
  switch (kind) {
    case 'tile': // a bright tile with the initials (A2B)
      ctx.fillStyle = fg; roundRect(ctx, x - R, y - R, R * 2, R * 2, R * 0.3); ctx.fill();
      ctx.fillStyle = bg; ctx.font = `800 ${Math.round(R * 0.9)}px ${BALOO}`; fit(ctx, s.en, x, y + 2, R * 1.8); break;
    case 'bubble': // a speech bubble (CCD)
      ctx.fillStyle = fg; roundRect(ctx, x - R, y - R * 0.8, R * 2, R * 1.5, R * 0.45); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - R * 0.3, y + R * 0.6); ctx.lineTo(x - R * 0.7, y + R * 1.05); ctx.lineTo(x + R * 0.1, y + R * 0.65); ctx.fill();
      ctx.fillStyle = bg; ctx.font = `800 ${Math.round(R * 0.62)}px ${BALOO}`; ctx.fillText('café', x, y - R * 0.05); break;
    case 'waves':
      ctx.strokeStyle = fg; ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); for (let t = 0; t <= 1; t += 0.05) { const px = x - R + t * 2 * R, py = y - R * 0.5 + k * R * 0.5 + Math.sin(t * Math.PI * 3) * R * 0.15; t ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); }
      break;
    case 'ring': // a ring roundel (Apollo)
      ctx.strokeStyle = fg; ctx.lineWidth = R * 0.22; ctx.beginPath(); ctx.arc(x, y, R * 0.8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = L.accent || fg; circle(ctx, x, y, R * 0.35); break;
    case 'triangle': // a triangle mark in a roundel (Canara)
      ctx.fillStyle = fg; circle(ctx, x, y, R);
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(x, y - R * 0.62); ctx.lineTo(x + R * 0.6, y + R * 0.45); ctx.lineTo(x - R * 0.6, y + R * 0.45); ctx.fill(); break;
    case 'drop': // a milk drop in a roundel (Nandini)
      ctx.fillStyle = fg; circle(ctx, x, y, R);
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(x, y - R * 0.7); ctx.bezierCurveTo(x + R * 0.6, y, x + R * 0.5, y + R * 0.6, x, y + R * 0.6); ctx.bezierCurveTo(x - R * 0.5, y + R * 0.6, x - R * 0.6, y, x, y - R * 0.7); ctx.fill(); break;
    case 'leaf':
      ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(x, y, R * 0.55, R, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = bg; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - R * 0.5, y + R * 0.7); ctx.lineTo(x + R * 0.5, y - R * 0.7); ctx.stroke(); break;
    default: // a picture in a roundel
      ctx.fillStyle = fg; circle(ctx, x, y, R);
      icon(ctx, kind, x, y, R * 0.75, bg, fg);
  }
}

// ---------- pictures ----------
function icon(ctx, cat, x, y, r, fg, bg) {
  ctx.save();
  ctx.fillStyle = fg; ctx.strokeStyle = fg; ctx.lineWidth = Math.max(2, r * 0.12); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const P = (pts) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(x + a * r, y + b * r) : ctx.moveTo(x + a * r, y + b * r))); };
  switch (cat) {
    case 'phone': roundRect(ctx, x - r * 0.42, y - r * 0.8, r * 0.84, r * 1.6, r * 0.14); ctx.fill(); ctx.fillStyle = bg; ctx.fillRect(x - r * 0.32, y - r * 0.6, r * 0.64, r * 1.05); circle(ctx, x, y + r * 0.62, r * 0.08); break;
    case 'medical': ctx.fillRect(x - r * 0.22, y - r * 0.75, r * 0.44, r * 1.5); ctx.fillRect(x - r * 0.75, y - r * 0.22, r * 1.5, r * 0.44); break;
    case 'print': ctx.fillRect(x - r * 0.75, y - r * 0.25, r * 1.5, r * 0.65); ctx.fillStyle = bg; ctx.fillRect(x - r * 0.45, y + r * 0.1, r * 0.9, r * 0.6); ctx.fillStyle = fg; ctx.fillRect(x - r * 0.4, y - r * 0.8, r * 0.8, r * 0.5); ctx.fillRect(x - r * 0.38, y + r * 0.15, r * 0.76, r * 0.6); break;
    case 'coffee': case 'cup':
      P([[-0.55, -0.3], [0.4, -0.3], [0.32, 0.5], [-0.47, 0.5]]); ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 0.45, y + r * 0.05, r * 0.2, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.fillRect(x - r * 0.75, y + r * 0.55, r * 1.4, r * 0.12);
      for (const dx of [-0.25, 0.05]) { ctx.beginPath(); ctx.moveTo(x + dx * r, y - r * 0.45); ctx.quadraticCurveTo(x + (dx + 0.15) * r, y - r * 0.65, x + dx * r, y - r * 0.85); ctx.stroke(); }
      break;
    case 'meals': // a banana leaf with a dosa
      ctx.fillStyle = '#3aa040'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.95, r * 0.55, -0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8a83a'; ctx.beginPath(); ctx.moveTo(x - r * 0.7, y + r * 0.15); ctx.quadraticCurveTo(x, y - r * 0.75, x + r * 0.7, y - r * 0.25); ctx.quadraticCurveTo(x, y + r * 0.1, x - r * 0.7, y + r * 0.15); ctx.fill();
      ctx.fillStyle = '#ffffff'; circle(ctx, x + r * 0.35, y + r * 0.25, r * 0.15); break;
    case 'biryani': // a handi
      P([[-0.7, -0.15], [0.7, -0.15], [0.55, 0.6], [-0.55, 0.6]]); ctx.fill(); ctx.fillRect(x - r * 0.8, y - r * 0.28, r * 1.6, r * 0.16);
      ctx.fillStyle = '#f0c040'; ctx.beginPath(); ctx.arc(x, y - r * 0.3, r * 0.55, Math.PI, 0); ctx.fill(); break;
    case 'bakery': // a cake slice on a stand
      P([[-0.6, 0.35], [0.6, 0.35], [0.6, -0.15], [-0.6, -0.45]]); ctx.fill(); ctx.fillStyle = '#e83a6a'; P([[-0.6, -0.45], [0.6, -0.15], [0.6, -0.3], [-0.6, -0.6]]); ctx.fill();
      ctx.fillStyle = fg; ctx.fillRect(x - r * 0.8, y + r * 0.45, r * 1.6, r * 0.1); ctx.fillStyle = '#e8231d'; circle(ctx, x - r * 0.3, y - r * 0.68, r * 0.13); break;
    case 'book': P([[-0.8, -0.5], [0, -0.35], [0, 0.6], [-0.8, 0.45]]); ctx.fill(); P([[0.8, -0.5], [0, -0.35], [0, 0.6], [0.8, 0.45]]); ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1; break;
    case 'craft': // a diya with its flame
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.3, r * 0.75, r * 0.3, 0, 0, Math.PI); ctx.fill(); ctx.fillRect(x - r * 0.75, y + r * 0.22, r * 1.5, r * 0.1);
      ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.moveTo(x, y - r * 0.75); ctx.quadraticCurveTo(x + r * 0.3, y - r * 0.1, x, y + r * 0.15); ctx.quadraticCurveTo(x - r * 0.3, y - r * 0.1, x, y - r * 0.75); ctx.fill(); break;
    case 'beer': ctx.fillRect(x - r * 0.45, y - r * 0.5, r * 0.75, r * 1.15); ctx.beginPath(); ctx.arc(x + r * 0.4, y + r * 0.05, r * 0.25, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.fillStyle = '#ffffff'; for (const dx of [-0.35, -0.08, 0.2]) circle(ctx, x + dx * r, y - r * 0.55, r * 0.2); break;
    case 'laptop': ctx.fillRect(x - r * 0.6, y - r * 0.55, r * 1.2, r * 0.8); ctx.fillStyle = bg; ctx.fillRect(x - r * 0.5, y - r * 0.47, r, r * 0.62); ctx.fillStyle = fg; P([[-0.85, 0.35], [0.85, 0.35], [0.7, 0.55], [-0.7, 0.55]]); ctx.fill(); break;
    case 'tools': // a spanner
      ctx.lineWidth = r * 0.24; ctx.beginPath(); ctx.moveTo(x - r * 0.55, y + r * 0.55); ctx.lineTo(x + r * 0.3, y - r * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.45, r * 0.35, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = bg; ctx.fillRect(x + r * 0.35, y - r * 0.85, r * 0.22, r * 0.45); break;
    case 'gear': {
      ctx.beginPath();
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, rr = k % 2 ? r * 0.62 : r * 0.85; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.fill(); ctx.fillStyle = bg; circle(ctx, x, y, r * 0.28); break;
    }
    case 'bolt': P([[0.15, -0.85], [-0.45, 0.1], [-0.02, 0.1], [-0.15, 0.85], [0.45, -0.15], [0.02, -0.15]]); ctx.fill(); break;
    case 'game': roundRect(ctx, x - r * 0.8, y - r * 0.35, r * 1.6, r * 0.75, r * 0.35); ctx.fill(); ctx.fillStyle = bg; ctx.fillRect(x - r * 0.55, y - r * 0.06, r * 0.36, r * 0.12); ctx.fillRect(x - r * 0.43, y - r * 0.18, r * 0.12, r * 0.36); circle(ctx, x + r * 0.4, y - r * 0.08, r * 0.09); circle(ctx, x + r * 0.55, y + r * 0.08, r * 0.09); break;
    case 'momo': for (const [dx, dy] of [[-0.35, 0.2], [0.35, 0.2], [0, -0.2]]) { ctx.beginPath(); ctx.ellipse(x + dx * r, y + dy * r, r * 0.38, r * 0.3, 0, 0, Math.PI * 2); ctx.fill(); } break;
    case 'bed': // a bed with a pillow
      ctx.fillRect(x - r * 0.85, y - r * 0.05, r * 1.7, r * 0.4); ctx.fillRect(x - r * 0.85, y - r * 0.6, r * 0.16, r * 1.35); ctx.fillRect(x + r * 0.69, y + r * 0.1, r * 0.16, r * 0.65);
      roundRect(ctx, x - r * 0.62, y - r * 0.36, r * 0.5, r * 0.28, r * 0.1); ctx.fill(); break;
    case 'bus': // a coach seen from the front
      roundRect(ctx, x - r * 0.62, y - r * 0.8, r * 1.24, r * 1.45, r * 0.2); ctx.fill(); ctx.fillStyle = bg;
      ctx.fillRect(x - r * 0.48, y - r * 0.6, r * 0.96, r * 0.6); circle(ctx, x - r * 0.36, y + r * 0.36, r * 0.1); circle(ctx, x + r * 0.36, y + r * 0.36, r * 0.1);
      ctx.fillStyle = fg; ctx.fillRect(x - r * 0.55, y + r * 0.65, r * 0.25, r * 0.2); ctx.fillRect(x + r * 0.3, y + r * 0.65, r * 0.25, r * 0.2); break;
    case 'cone': P([[-0.32, -0.05], [0.32, -0.05], [0, 0.85]]); ctx.fillStyle = '#d8a050'; ctx.fill(); ctx.fillStyle = fg; circle(ctx, x, y - r * 0.3, r * 0.38); break;
    default: circle(ctx, x, y, r * 0.5);
  }
  ctx.restore();
}

// ---------- wear ----------
function weather(ctx, W, H, rnd, kind) {
  // Sun fade (painted boards and old flex the most).
  const fade = kind === 'painted' ? 0.12 + rnd() * 0.18 : kind === 'flex' ? rnd() * 0.12 : kind === 'lit' ? 0 : rnd() * 0.06;
  if (fade) { ctx.fillStyle = `rgba(255,250,235,${fade})`; ctx.fillRect(0, 0, W, H); }
  // Dust settling towards the bottom, rain streaks running down from the top edge.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(60,50,40,0)'); g.addColorStop(1, `rgba(60,50,40,${0.12 + rnd() * 0.14})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const n = kind === 'lit' ? 4 : 10 + Math.floor(rnd() * 14);
  for (let k = 0; k < n; k++) {
    const x = rnd() * W, len = H * (0.2 + rnd() * 0.8), w = 1 + rnd() * 4;
    const sg = ctx.createLinearGradient(0, 0, 0, len);
    sg.addColorStop(0, `rgba(40,32,24,${0.12 + rnd() * 0.18})`); sg.addColorStop(1, 'rgba(40,32,24,0)');
    ctx.fillStyle = sg; ctx.fillRect(x, 0, w, len);
  }
  // Speckle.
  for (let k = 0; k < 260; k++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)'; ctx.fillRect(rnd() * W, rnd() * H, 1.5, 1.5); }
  if (kind === 'flex' && rnd() < 0.25) { // a torn, curling corner
    const x = rnd() < 0.5 ? 0 : W, s = x ? -1 : 1, y = rnd() < 0.5 ? 0 : H, t = y ? -1 : 1, L = 14 + rnd() * 18;
    ctx.fillStyle = 'rgba(30,26,22,0.85)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * L, y); ctx.lineTo(x, y + t * L * 0.8); ctx.fill();
  }
  // Frame and bolts.
  if (kind !== 'painted') {
    ctx.strokeStyle = kind === 'lit' ? 'rgba(200,200,200,0.9)' : 'rgba(90,90,92,0.95)'; ctx.lineWidth = kind === 'lit' ? 6 : 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    if (kind === 'flex') for (const [bx, by] of [[8, 8], [W - 8, 8], [8, H - 8], [W - 8, H - 8], [W / 2, 8], [W / 2, H - 8]]) { ctx.fillStyle = '#9a9a9a'; circle(ctx, bx, by, 2.4); ctx.fillStyle = 'rgba(90,40,10,0.5)'; ctx.fillRect(bx - 1, by + 2, 2, 6 + rnd() * 10); }
  } else {
    // Old paint: blistered patches showing the board underneath.
    for (let k = 0; k < 6; k++) { ctx.fillStyle = `rgba(150,120,90,${0.15 + rnd() * 0.2})`; ctx.beginPath(); ctx.ellipse(rnd() * W, rnd() * H, 4 + rnd() * 14, 3 + rnd() * 6, rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
  }
}

// ---------- helpers ----------
function phone(rnd) {
  const d = () => Math.floor(rnd() * 10);
  return rnd() < 0.5 ? `98${d()}${d()}${d()} ${d()}${d()}${d()}${d()}${d()}` : `080-2${d()}${d()}${d()} ${d()}${d()}${d()}${d()}`;
}
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// Text squeezed horizontally to fit maxW (as sign painters do).
function fit(ctx, text, x, y, maxW, align = 'center', ax = x) {
  if (!text) return;
  const w = ctx.measureText(text).width;
  ctx.save();
  ctx.textAlign = align;
  ctx.translate(align === 'center' ? ax : x, y);
  if (w > maxW) ctx.scale(maxW / w, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
function outlined(ctx, text, x, y, font, fill, stroke, sw, maxW) {
  // The outline always contrasts with the letters (dark letters get a white edge).
  if (lum(fill) < 0.35 && lum(stroke) < 0.35) stroke = '#ffffff';
  ctx.save();
  ctx.font = font;
  const w = ctx.measureText(text).width;
  ctx.translate(x, y);
  if (w > maxW) ctx.scale(maxW / w, 1);
  ctx.lineJoin = 'round'; ctx.lineWidth = sw; ctx.strokeStyle = stroke;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillText(text, 2, 3);
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
  ctx.restore();
}
function handLetter(ctx, text, x, y, font, fill, maxW, rnd) {
  ctx.save();
  ctx.font = font;
  const w = ctx.measureText(text).width, k = w > maxW ? maxW / w : 1;
  ctx.translate(x, y); ctx.scale(k, 1); ctx.rotate((rnd() - 0.5) * 0.02);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(text, 2.5, 2.5);
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
  ctx.restore();
}
