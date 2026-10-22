// Real Indian cars, modelled from their published dimensions and rough body proportions.
// A body is lofted through cross-sections along its length: a lower body (bumpers, bonnet,
// doors, boot, with the wheel arches cut out of its bottom edge) and a glasshouse whose
// segments are glass or pillars. Units are metres; the car faces +z, its left (kerb) side is +x.

// L/W/H/WB: length, width, height, wheelbase. hood: bonnet height at the windscreen base.
// belt: beltline (bottom of the side windows). hoodLen: nose to windscreen base. ws/rear:
// windscreen and rear-glass rake lengths. boot: boot length (sedans). taper: roof width
// relative to the beltline. pillars: positions (fraction from the windscreen top to the rear
// glass) of the B (and C/D) pillars. Lights/grille are styled per car.
export const CAR_MODELS = {
  alto: { label: 'Maruti Suzuki Alto', L: 3.53, W: 1.49, H: 1.52, WB: 2.38, wr: 0.27, hood: 0.86, belt: 0.95, hoodLen: 0.78, ws: 0.62, rear: 0.22, taper: 0.84, style: 'hatch', pillars: [0.52], lights: 'swept', grille: 'slim' },
  wagonr: { label: 'Maruti Suzuki WagonR', L: 3.66, W: 1.62, H: 1.68, WB: 2.44, wr: 0.28, hood: 0.92, belt: 1.0, hoodLen: 0.72, ws: 0.48, rear: 0.12, taper: 0.9, style: 'hatch', pillars: [0.5], lights: 'tall', grille: 'slim' },
  swift: { label: 'Maruti Suzuki Swift', L: 3.85, W: 1.735, H: 1.53, WB: 2.45, wr: 0.3, hood: 0.9, belt: 0.99, hoodLen: 0.95, ws: 0.72, rear: 0.3, taper: 0.8, style: 'hatch', pillars: [0.5], lights: 'swept', grille: 'hex', blackPillars: true },
  i10: { label: 'Hyundai Grand i10', L: 3.77, W: 1.66, H: 1.52, WB: 2.43, wr: 0.29, hood: 0.88, belt: 0.98, hoodLen: 0.86, ws: 0.68, rear: 0.26, taper: 0.82, style: 'hatch', pillars: [0.5], lights: 'swept', grille: 'cascade' },
  dzire: { label: 'Maruti Suzuki Swift Dzire', L: 3.995, W: 1.735, H: 1.515, WB: 2.45, wr: 0.3, hood: 0.9, belt: 0.99, hoodLen: 0.92, ws: 0.7, rear: 0.5, boot: 0.62, taper: 0.8, style: 'sedan', pillars: [0.46], lights: 'swept', grille: 'chromeBar' },
  etios: { label: 'Toyota Etios', L: 4.265, W: 1.695, H: 1.51, WB: 2.55, wr: 0.3, hood: 0.92, belt: 1.0, hoodLen: 0.98, ws: 0.72, rear: 0.5, boot: 0.82, taper: 0.8, style: 'sedan', pillars: [0.47], lights: 'square', grille: 'toyota' },
  city: { label: 'Honda City', L: 4.55, W: 1.75, H: 1.49, WB: 2.6, wr: 0.31, hood: 0.88, belt: 0.98, hoodLen: 1.08, ws: 0.85, rear: 0.62, boot: 0.82, taper: 0.78, style: 'sedan', pillars: [0.47], lights: 'swept', grille: 'chromeBar', blackPillars: true },
  verna: { label: 'Hyundai Verna', L: 4.44, W: 1.73, H: 1.475, WB: 2.6, wr: 0.31, hood: 0.86, belt: 0.97, hoodLen: 1.06, ws: 0.88, rear: 0.7, boot: 0.7, taper: 0.76, style: 'sedan', pillars: [0.45], lights: 'swept', grille: 'cascade', blackPillars: true },
  ertiga: { label: 'Maruti Suzuki Ertiga', L: 4.395, W: 1.735, H: 1.69, WB: 2.74, wr: 0.31, hood: 0.95, belt: 1.04, hoodLen: 0.98, ws: 0.72, rear: 0.2, taper: 0.84, style: 'mpv', pillars: [0.4, 0.78], lights: 'swept', grille: 'chromeBar', blackPillars: true },
  innova: { label: 'Toyota Innova Crysta', L: 4.735, W: 1.83, H: 1.795, WB: 2.75, wr: 0.34, hood: 1.04, belt: 1.12, hoodLen: 1.05, ws: 0.78, rear: 0.2, taper: 0.86, style: 'mpv', pillars: [0.38, 0.76], lights: 'swept', grille: 'toyotaBig', blackPillars: true },
  creta: { label: 'Hyundai Creta', L: 4.3, W: 1.79, H: 1.635, WB: 2.61, wr: 0.35, hood: 1.02, belt: 1.1, hoodLen: 1.0, ws: 0.7, rear: 0.28, taper: 0.84, style: 'suv', pillars: [0.48, 0.86], lights: 'swept', grille: 'cascade', blackPillars: true, cladding: true, rails: true },
  nexon: { label: 'Tata Nexon', L: 3.995, W: 1.804, H: 1.62, WB: 2.5, wr: 0.34, hood: 1.0, belt: 1.08, hoodLen: 0.95, ws: 0.66, rear: 0.36, taper: 0.82, style: 'suv', pillars: [0.5], lights: 'swept', grille: 'tata', blackPillars: true, cladding: true },
  scorpio: { label: 'Mahindra Scorpio', L: 4.456, W: 1.82, H: 1.995, WB: 2.68, wr: 0.37, hood: 1.15, belt: 1.25, hoodLen: 1.05, ws: 0.55, rear: 0.1, taper: 0.9, style: 'boxy', pillars: [0.4, 0.78], lights: 'tall', grille: 'mahindra', cladding: true, rails: true },
  nano: { label: 'Tata Nano', L: 3.164, W: 1.495, H: 1.652, WB: 2.23, wr: 0.25, hood: 0.84, belt: 0.98, hoodLen: 0.5, ws: 0.62, rear: 0.12, taper: 0.86, style: 'hatch', pillars: [0.52], lights: 'tall', grille: 'slim' },
  ambassador: { label: 'Hindustan Ambassador', L: 4.325, W: 1.662, H: 1.6, WB: 2.464, wr: 0.3, hood: 0.96, belt: 1.0, hoodLen: 1.25, ws: 0.52, rear: 0.45, boot: 0.88, taper: 0.88, style: 'sedan', pillars: [0.5], lights: 'round', grille: 'chromeBar', colours: [0xf4f4f0, 0xf4f4f0, 0x111111, 0xe8e0c8, 0x6a8a9a] },
  punch: { label: 'Tata Punch', L: 3.827, W: 1.742, H: 1.615, WB: 2.445, wr: 0.34, hood: 1.0, belt: 1.08, hoodLen: 0.92, ws: 0.62, rear: 0.3, taper: 0.84, style: 'suv', pillars: [0.5], lights: 'swept', grille: 'tata', blackPillars: true, cladding: true },
  seltos: { label: 'Kia Seltos', L: 4.365, W: 1.8, H: 1.645, WB: 2.61, wr: 0.35, hood: 1.02, belt: 1.1, hoodLen: 1.0, ws: 0.72, rear: 0.3, taper: 0.83, style: 'suv', pillars: [0.48, 0.86], lights: 'swept', grille: 'cascade', blackPillars: true, cladding: true, rails: true },
  xuv700: { label: 'Mahindra XUV700', L: 4.695, W: 1.89, H: 1.755, WB: 2.75, wr: 0.37, hood: 1.08, belt: 1.15, hoodLen: 1.1, ws: 0.74, rear: 0.24, taper: 0.84, style: 'suv', pillars: [0.42, 0.8], lights: 'swept', grille: 'mahindra', blackPillars: true, cladding: true, rails: true },
  fortuner: { label: 'Toyota Fortuner', L: 4.795, W: 1.855, H: 1.835, WB: 2.745, wr: 0.37, hood: 1.1, belt: 1.18, hoodLen: 1.15, ws: 0.72, rear: 0.22, taper: 0.85, style: 'suv', pillars: [0.42, 0.8], lights: 'swept', grille: 'toyotaBig', blackPillars: true, cladding: true, rails: true },
  thar: { label: 'Mahindra Thar', L: 3.985, W: 1.82, H: 1.844, WB: 2.45, wr: 0.38, hood: 1.1, belt: 1.18, hoodLen: 1.15, ws: 0.34, rear: 0.05, taper: 0.95, style: 'boxy', pillars: [0.45], lights: 'round', grille: 'mahindra', cladding: true, spare: true, colours: [0x111111, 0xb01c22, 0x5a6a4a, 0xf2f2f2, 0xd06a1a] },
  bolero: { label: 'Mahindra Bolero', L: 3.995, W: 1.745, H: 1.88, WB: 2.68, wr: 0.36, hood: 1.12, belt: 1.22, hoodLen: 0.98, ws: 0.4, rear: 0.06, taper: 0.94, style: 'boxy', pillars: [0.42, 0.8], lights: 'round', grille: 'mahindra', cladding: true },
};

// Which real cars appear as each vehicle type, with weights.
export const TYPE_MODELS = {
  hatch: [['swift', 3], ['alto', 3], ['wagonr', 2.5], ['i10', 2], ['nano', 0.8]],
  sedan: [['dzire', 2.5], ['city', 2], ['verna', 1.5], ['etios', 1], ['ambassador', 0.6]],
  taxi: [['etios', 3], ['dzire', 3], ['innova', 1.5], ['ertiga', 1]],
  suv: [['creta', 3], ['nexon', 2], ['scorpio', 2], ['bolero', 1.5], ['innova', 1.5], ['punch', 2], ['seltos', 2], ['xuv700', 1.5], ['fortuner', 1.5], ['thar', 1.2]],
  hoysala: [['ertiga', 1]],
};

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Body profile as functions of z: half-width, lower-body top and bottom, and the cabin.
export function carProfile(m) {
  const L = m.L, zf = L / 2, zr = -L / 2;
  const fOH = (L - m.WB) * (m.style === 'sedan' ? 0.48 : 0.52);
  const zFA = zf - fOH, zRA = zFA - m.WB; // axles
  const sill = 0.32, clearance = 0.2;
  const hw = (z) => {
    const nose = smooth(zf - 0.55, zf, z), tail = smooth(zr + 0.45, zr, z);
    return (m.W / 2) * (1 - 0.11 * nose * nose - 0.07 * tail * tail) - 0.01;
  };
  const zWs = zf - m.hoodLen; // windscreen base
  const rearTop = m.style === 'sedan' ? m.belt - 0.04 : m.belt + 0.02;
  // Top of the lower body: nose -> bonnet -> beltline -> boot/tailgate.
  const top = (z) => {
    if (z > zWs) {
      const t = (z - zWs) / (zf - zWs);
      return m.belt + (m.hood - m.belt) * smooth(0, 0.35, t) - (m.hood - (m.hood - 0.2)) * smooth(0.72, 1, t) * (m.style === 'boxy' ? 0.45 : 1);
    }
    if (m.style === 'sedan' && z < zr + m.boot) return rearTop - 0.12 * smooth(zr + 0.25, zr, z);
    return m.belt - (m.belt - rearTop) * smooth(zr + 0.6, zr, z) - 0.06 * smooth(zr + 0.08, zr, z);
  };
  // Bottom edge with wheel arches cut out and bumpers dropping lower.
  const archR = m.wr + 0.07;
  const bottom = (z) => {
    let y = sill - 0.08 * (smooth(zf - 0.5, zf - 0.15, z) + smooth(zr + 0.45, zr + 0.12, z));
    for (const zc of [zFA, zRA]) {
      const d = Math.abs(z - zc);
      if (d < archR) y = Math.max(y, m.wr + Math.sqrt(archR * archR - d * d) * 0.95);
    }
    return Math.max(clearance, y);
  };
  // Glasshouse: z of the windscreen top, roof end and rear glass base.
  const roofY = m.H - 0.02;
  const zWsTop = zWs - m.ws;
  let zRearBase, zRoofEnd;
  if (m.style === 'sedan') { zRearBase = zr + m.boot; zRoofEnd = zRearBase + m.rear; }
  else { zRearBase = zr + 0.1; zRoofEnd = zRearBase + m.rear; }
  return { L, zf, zr, zFA, zRA, hw, top, bottom, zWs, zWsTop, zRearBase, zRoofEnd, roofY, archR };
}

// Cross-section ring of the lower body: a rounded box from y0 to y1, half-width w.
function lowerRing(w, y0, y1) {
  const pts = [];
  const rt = Math.min(0.16, (y1 - y0) * 0.45), rb = Math.min(0.07, (y1 - y0) * 0.3);
  const wt = w * 0.965; // slight tumblehome at the shoulder
  const arc = (cx, cy, r, a0, a1, n) => { for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  // From the bottom centre, round the left (+x) side, over the top, down the right side.
  pts.push([0, y0]);
  arc(w - rb, y0 + rb, rb, -Math.PI / 2, 0, 2);
  arc(wt - rt, y1 - rt, rt, 0, Math.PI / 2, 3);
  arc(-wt + rt, y1 - rt, rt, Math.PI / 2, Math.PI, 3);
  arc(-w + rb, y0 + rb, rb, Math.PI, Math.PI * 1.5, 2);
  pts.push([0, y0]);
  return pts;
}

// Glasshouse ring: trapezoid from the beltline (half-width wb) to the roof (half-width wt).
// Edge kinds: 'side' (windows/pillars), 'corner' (roof edge), 'roof'.
function cabinRing(wb, wt, y0, y1) {
  const rc = Math.min(0.09, Math.max(0.005, (y1 - y0) * 0.3));
  // The side glass stops short of the roof: a band of roof skin runs above the windows.
  const band = Math.min(0.08, (y1 - y0) * 0.16), yg = y1 - rc - band;
  const xg = wb + (wt - wb) * ((yg - y0) / Math.max(1e-4, y1 - rc - y0));
  const P = [[wb, y0], [xg, yg], [wt, y1 - rc], [wt - rc * 0.35, y1 - rc * 0.35], [wt - rc, y1], [-wt + rc, y1], [-wt + rc * 0.35, y1 - rc * 0.35], [-wt, y1 - rc], [-xg, yg], [-wb, y0]];
  const kinds = ['side', 'sidetop', 'corner', 'corner', 'roof', 'corner', 'corner', 'sidetop', 'side'];
  return { P, kinds };
}

// Loft a list of rings (each [ [x,y]...] at z) into triangles with smooth normals.
// emit(a, b, c, d, na, nb, nc, nd, segmentIndex, edgeIndex) receives one quad at a time.
function loft(sections, emit) {
  const n = sections[0].pts.length;
  const pos = sections.map((s) => s.pts.map(([x, y]) => [x, y, s.z]));
  const norm = pos.map((ring, i) => ring.map((p, j) => {
    const a = ring[Math.max(0, j - 1)], b = ring[Math.min(n - 1, j + 1)];
    const c = pos[Math.max(0, i - 1)][j], d = pos[Math.min(pos.length - 1, i + 1)][j];
    const t1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], t2 = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
    let nx = t1[1] * t2[2] - t1[2] * t2[1], ny = t1[2] * t2[0] - t1[0] * t2[2], nz = t1[0] * t2[1] - t1[1] * t2[0];
    // Point away from the section's centre line.
    if (nx * p[0] + ny * (p[1] - 0.7) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  }));
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      // Sections run rear->front; ring points run left->over->right, so this winding faces out.
      emit(pos[i][j], pos[i][j + 1], pos[i + 1][j + 1], pos[i + 1][j], norm[i][j], norm[i][j + 1], norm[i + 1][j + 1], norm[i + 1][j], i, j);
    }
  }
  return pos;
}

// Build the body shell into builder `b` (a MeshBuilder with pbr + skin). colour: paint.
// mats: {paint, glass, black, trim} PBR presets. Returns the profile for placing details.
export function buildCarShell(b, m, colour, mats) {
  const prof = carProfile(m);
  const { zf, zr, hw, top, bottom } = prof;
  const quad = (a, bb, c, d, na, nb, nc, nd, col) => {
    b._vert(a, na, 0, 0, col); b._vert(bb, nb, 1, 0, col); b._vert(c, nc, 1, 1, col);
    b._vert(a, na, 0, 0, col); b._vert(c, nc, 1, 1, col); b._vert(d, nd, 0, 1, col);
  };
  // Lower body sections: dense around the arches and the ends.
  const zs = new Set();
  for (let k = 0; k <= 16; k++) zs.add(+(zr + ((zf - zr) * k) / 16).toFixed(3));
  for (const zc of [prof.zFA, prof.zRA]) for (let k = -5; k <= 5; k++) zs.add(+(zc + (prof.archR * k) / 5).toFixed(3));
  for (const e of [0.02, 0.06, 0.12, 0.2]) { zs.add(+(zr + e).toFixed(3)); zs.add(+(zf - e).toFixed(3)); }
  const zList = [...zs].filter((z) => z >= zr && z <= zf).sort((a, c) => a - c);
  const lower = zList.map((z) => {
    const end = Math.min(z - zr, zf - z);
    const shrink = end < 0.03 ? 0.88 : 1; // round the bumper corners in
    return { z, pts: lowerRing(hw(z) * shrink, bottom(z) + (end < 0.03 ? 0.04 : 0), top(z) - (end < 0.03 ? 0.03 : 0)) };
  });
  b.pbr = mats.paint.pbr;
  loft(lower, (a, bb, c, d, na, nb, nc, nd) => quad(a, bb, c, d, na, nb, nc, nd, a[1] < 0.3 && c[1] < 0.3 ? mats.black.colour : colour));
  // End caps (bumper faces).
  for (const [ring, sgn] of [[lower[0], -1], [lower[lower.length - 1], 1]]) {
    const cy = ring.pts.reduce((s, p) => s + p[1], 0) / ring.pts.length;
    for (let j = 0; j < ring.pts.length - 1; j++) {
      const p = ring.pts[j], q = ring.pts[j + 1];
      const A = [0, cy, ring.z], B1 = [p[0], p[1], ring.z], C1 = [q[0], q[1], ring.z];
      const n = [0, 0, sgn];
      if (sgn > 0) { b._vert(A, n, 0, 0, colour); b._vert(B1, n, 0, 0, colour); b._vert(C1, n, 0, 0, colour); }
      else { b._vert(A, n, 0, 0, colour); b._vert(C1, n, 0, 0, colour); b._vert(B1, n, 0, 0, colour); }
    }
  }
  // Glasshouse. Sections: rear glass base -> roof end -> pillars -> windscreen top -> base.
  const { zWs, zWsTop, zRearBase, zRoofEnd, roofY } = prof;
  const cab = [];
  const ring = (z, y1) => {
    const y0 = top(z) - 0.01, wb = hw(z) * 0.95;
    return cabinRing(wb, wb * m.taper + (1 - m.taper) * 0.05, y0, Math.max(y0 + 0.004, y1));
  };
  const roofAt = (z) => {
    if (z <= zRoofEnd) return top(zRearBase) + (roofY - top(zRearBase)) * smooth(zRearBase, zRoofEnd + 0.02, z) ** 0.7;
    if (z >= zWsTop) return roofY - (roofY - top(zWs)) * ((z - zWsTop) / (zWs - zWsTop));
    return roofY;
  };
  // Pillar positions between the roof end and the windscreen top.
  const pill = (m.pillars || []).map((f) => zWsTop - (zWsTop - zRoofEnd) * f);
  const pw = 0.07, bigC = m.style === 'sedan' || m.style === 'hatch' ? 0.18 : 0.1;
  const cuts = [zRearBase, zRearBase + (zRoofEnd - zRearBase) * 0.5, zRoofEnd, zRoofEnd + bigC];
  for (const z of pill) cuts.push(z - pw, z + pw);
  cuts.push(zWsTop - 0.04, zWsTop, zWsTop + (zWs - zWsTop) * 0.5, zWs);
  const zc = [...new Set(cuts.map((z) => +z.toFixed(3)))].filter((z) => z >= zRearBase && z <= zWs).sort((a, c) => a - c);
  for (const z of zc) cab.push({ z, ...ring(z, roofAt(z)) });
  const pillarCol = m.blackPillars ? mats.black.colour : colour;
  b.pbr = mats.paint.pbr;
  loft(cab.map((c) => ({ z: c.z, pts: c.P })), (a, bb, c, d, na, nb, nc, nd, i, j) => {
    const z0 = cab[i].z, z1 = cab[i + 1].z, zm = (z0 + z1) / 2;
    const kind = cab[i].kinds[j];
    const rearGlass = z1 <= zRoofEnd + 0.001, windscreen = z0 >= zWsTop - 0.001;
    let col = colour, glass = false;
    if (kind === 'roof') { glass = rearGlass || windscreen; }
    else if (kind === 'side') {
      const inPillar = pill.some((p) => Math.abs(zm - p) < pw + 0.001);
      const cPillar = zm < zRoofEnd + bigC;
      glass = !inPillar && !cPillar && !windscreen && !rearGlass;
      if (inPillar) col = pillarCol;
      if (windscreen || rearGlass) col = m.blackPillars ? mats.black.colour : colour;
    } else if (kind === 'corner' && (windscreen || rearGlass)) col = m.blackPillars ? mats.black.colour : colour;
    if (glass) { b.pbr = mats.glass.pbr; quad(a, bb, c, d, na, nb, nc, nd, mats.glass.colour); }
    else { b.pbr = mats.paint.pbr; quad(a, bb, c, d, na, nb, nc, nd, col); }
  });
  b.pbr = mats.paint.pbr;
  return prof;
}
