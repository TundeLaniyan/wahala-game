/**
 * Procedural Lagos buildings for the Ajegunle, Lagoon Jetty and Yaba sets (presentation only):
 * rendered sandcrete-block houses and shophouses with a painted dado band, louvred windows behind
 * burglar-proof bars, wooden or steel doors with curtains, a corrugated verandah, a low-pitched
 * rusted roof weighed down with blocks and old tyres, a black water tank, a satellite dish, split
 * AC units, and (at night) lit windows and shopfronts. Everything is built in a local frame whose
 * facade faces +z, then baked with the set's statics.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { Object3D } from 'three';
import { frame, v3 } from './ajegunleKit';
import type { StreetKit } from './ajegunleKit';

export const STOREY = 2.75;

/**
 * Openings per storey, one character per bay across the frontage:
 * `w` window, `d` door (curtain), `m` steel door, `s` shopfront (roller shutter part raised),
 * `S` open shopfront (shutter up, lit interior when `lit`), `.` blank wall.
 */
export interface HouseOpts {
  w: number;
  d: number;
  storeys: number;
  wall: number;
  /** painted dado band along the foot of the facade */
  band?: number;
  roof: number;
  roofKind?: 'gable' | 'lean' | 'flat';
  ground: string;
  upper?: string;
  shutter?: number;
  /** depth of a corrugated verandah over the ground floor (0 = none) */
  verandah?: number;
  balcony?: boolean;
  /** lit windows / shop interiors at night (0 = dark) */
  lit?: number;
  tank?: boolean;
  dish?: boolean;
  ac?: boolean;
  /** roof clutter: blocks and tyres holding the sheets down */
  weights?: boolean;
}

/** A triangular prism (gable end): base `b` along z, apex height `h`, length `len` along x. */
function prism(len: number, b: number, h: number): BufferGeometry {
  const x0 = -len / 2;
  const x1 = len / 2;
  const z0 = -b / 2;
  const z1 = b / 2;
  // two triangles (ends) + three quads (base and two slopes), non-indexed
  const p = [
    [x0, 0, z0, x0, 0, z1, x0, h, 0],
    [x1, 0, z1, x1, 0, z0, x1, h, 0],
    [x0, 0, z1, x1, 0, z1, x1, h, 0, x0, 0, z1, x1, h, 0, x0, h, 0],
    [x1, 0, z0, x0, 0, z0, x0, h, 0, x1, 0, z0, x0, h, 0, x1, h, 0],
    [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z0, x1, 0, z1, x0, 0, z1],
  ].flat();
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  const uv: number[] = [];
  for (let i = 0; i < p.length / 3; i++) uv.push(p[i * 3]! / 2.5, p[i * 3 + 1]! / 2.8 + p[i * 3 + 2]! / 2.5);
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A louvred window behind burglar-proof bars (or a lit one at night), centred at (x, y). */
export function windowAt(kit: StreetKit, g: Object3D, x: number, y: number, o: HouseOpts, n: number): void {
  const r = kit.rng;
  const lit = (o.lit ?? 0) > 0 && r() < (o.lit ?? 0);
  kit.box(g, 1.06, 1.2, 0.05, 0x3a352e, x, y, 0.02); // frame
  if (lit) kit.box(g, 0.9, 1.04, 0.02, r() < 0.5 ? 0xffb868 : 0xf0d8a8, x, y, 0.05, 'glow');
  else kit.box(g, 0.9, 1.04, 0.02, 0x15130f, x, y, 0.05);
  // louvre blades (glass) or wooden shutters, some half open
  if (n % 3 !== 2) {
    for (let k = 0; k < 6; k++)
      kit.box(g, 0.86, 0.12, 0.02, lit ? 0x8a8478 : 0x4a5258, x, y - 0.42 + k * 0.17, 0.08, 'metal', {
        rx: 0.7,
      });
  } else {
    const sh = o.shutter ?? 0x4a5a3a;
    kit.box(g, 0.45, 1.02, 0.04, sh, x - 0.62, y, 0.2, 'wood', { ry: 1.2 });
    kit.box(g, 0.45, 1.02, 0.04, sh, x + 0.4, y, 0.1, 'wood', { ry: -0.35 });
  }
  // burglar-proof bars
  for (let k = 0; k < 5; k++) kit.box(g, 0.025, 1.1, 0.025, 0x24201c, x - 0.4 + k * 0.2, y, 0.13, 'metal');
  kit.box(g, 0.92, 0.025, 0.025, 0x24201c, x, y + 0.2, 0.13, 'metal');
  kit.box(g, 0.92, 0.025, 0.025, 0x24201c, x, y - 0.3, 0.13, 'metal');
  kit.box(g, 1.14, 0.06, 0.16, 0x7a766c, x, y - 0.62, 0.08); // sill
}

function doorAt(kit: StreetKit, g: Object3D, x: number, kind: string, n: number): void {
  kit.box(g, 1.04, 2.2, 0.05, 0x3a352e, x, 1.1 + 0.3, 0.02);
  kit.box(g, 0.9, 2.08, 0.02, 0x100e0c, x, 1.04 + 0.3, 0.05);
  if (kind === 'm') {
    // a steel door with a padlocked bar
    kit.box(g, 0.88, 2.04, 0.04, 0x3e3e3a, x, 1.02 + 0.3, 0.07, 'metal');
    kit.box(g, 0.9, 0.06, 0.05, 0x2a2622, x, 1.25, 0.11, 'metal');
  } else {
    // open wooden door and a faded curtain across the doorway
    kit.box(g, 0.08, 2.0, 0.8, 0x5a3e28, x - 0.44, 1.3, 0.42, 'wood');
    const cloth = [0x7a3a34, 0x3a5a6a, 0x8a7a4a, 0x5a6a3a][n % 4]!;
    kit.cloth(g, 0.86, 1.75, cloth, n % 4, x, 2.3, 0.09);
  }
  kit.box(g, 1.3, 0.16, 0.5, 0x6e6a62, x, 0.08, 0.3); // step
}

function shopAt(kit: StreetKit, g: Object3D, x: number, bay: number, o: HouseOpts, kind: string): void {
  const r = kit.rng;
  const lit = (o.lit ?? 0) > 0;
  const w = bay - 0.25;
  kit.box(g, w + 0.12, 2.5, 0.06, 0x2e2a26, x, 1.25 + 0.3, 0.02);
  // interior: a dark (or lit) back with shelves of stock
  kit.box(
    g,
    w,
    2.3,
    0.02,
    lit ? (r() < 0.5 ? 0xa8946e : 0x8a9caa) : 0x1a1714,
    x,
    1.45,
    0.05,
    lit ? 'glow' : 'matte',
  );
  for (let k = 0; k < 3; k++) {
    kit.box(g, w - 0.1, 0.04, 0.3, 0x3a3028, x, 0.75 + k * 0.55, 0.2, 'wood');
    for (let j = 0; j < 6; j++)
      kit.box(
        g,
        0.14 + r() * 0.1,
        0.16 + r() * 0.2,
        0.18,
        [0xb04a32, 0x2a6a9a, 0xd8c8a0, 0x3a7a4a, 0xc89a2a][Math.floor(r() * 5)]!,
        x - w / 2 + 0.2 + j * ((w - 0.3) / 6),
        0.85 + k * 0.55,
        0.2,
        'plastic',
      );
  }
  // roller shutter coil and the shutter pulled part-way down
  const down = kind === 's' ? 0.9 + r() * 0.5 : 0.25;
  kit.cyl(g, 0.13, 0.13, w + 0.1, 0x4a4844, x, 2.62, 0.14, 'metal', 8, { rz: Math.PI / 2 });
  kit.box(g, w, down, 0.03, o.shutter ?? 0x6a6a64, x, 2.6 - down / 2, 0.12, 'metal');
  for (let k = 0.15; k < down; k += 0.15) kit.box(g, w, 0.02, 0.035, 0x3a3a36, x, 2.6 - k, 0.13, 'metal');
  // a counter / display case at the front
  if (kind === 'S') kit.box(g, w * 0.7, 0.9, 0.45, 0x5a4a3a, x, 0.75, 0.35, 'wood');
}

/** A building: the facade faces +z of the frame; it extends back to z = -d. */
export function house(
  kit: StreetKit,
  parent: Object3D,
  x: number,
  y: number,
  z: number,
  ry: number,
  o: HouseOpts,
): Object3D {
  const r = kit.rng;
  const g = frame(parent, x, y, z, ry);
  const H = o.storeys * STOREY + 0.3;
  const { w, d } = o;
  kit.wall(g, w, H, d, o.wall, 0, H / 2, -d / 2);
  // plinth and a painted dado band (splashed and scuffed)
  kit.box(g, w + 0.06, 0.3, d + 0.06, 0x5a5650, 0, 0.15, -d / 2);
  if (o.band !== undefined) kit.wall(g, w + 0.02, 1.0, 0.03, o.band, 0, 0.8, 0.01);
  // storey bands
  for (let s = 1; s <= o.storeys; s++)
    kit.box(g, w + 0.12, 0.18, d + 0.1, 0x6e6a62, 0, s * STOREY + 0.3 - 0.09, -d / 2, 'matte');

  const bays = (row: string, storey: number): void => {
    const bay = w / row.length;
    [...row].forEach((c, i) => {
      const bx = -w / 2 + (i + 0.5) * bay;
      const base = storey * STOREY + 0.3;
      if (c === 'w') windowAt(kit, g, bx, base + 1.5, o, i + storey);
      else if (c === 'd' || c === 'm') {
        if (storey === 0) doorAt(kit, g, bx, c, i);
        else windowAt(kit, g, bx, base + 1.5, o, i + 1);
      } else if (c === 's' || c === 'S') shopAt(kit, g, bx, bay, o, c);
    });
  };
  bays(o.ground, 0);
  for (let s = 1; s < o.storeys; s++) bays(o.upper ?? o.ground.replace(/[dmsS]/g, 'w'), s);

  // balcony on the first floor: slab, rail, washing
  if (o.balcony && o.storeys > 1) {
    const by = STOREY + 0.3;
    kit.box(g, w * 0.7, 0.14, 1.0, 0x6e6a62, 0, by, 0.5);
    for (let k = 0; k <= 8; k++)
      kit.box(g, 0.03, 0.95, 0.03, 0x2a2622, -w * 0.35 + (k * w * 0.7) / 8, by + 0.5, 0.98, 'metal');
    kit.box(g, w * 0.7, 0.04, 0.05, 0x2a2622, 0, by + 0.98, 0.98, 'metal');
    const line = by + 1.75;
    kit.bar(g, v3(-w * 0.34, line, 0.85), v3(w * 0.34, line, 0.85), 0.008, 0x2a2622, 'matte', 3);
    for (let k = 0; k < 4; k++)
      kit.cloth(
        g,
        0.4 + r() * 0.3,
        0.5 + r() * 0.4,
        [0xa83a2a, 0x2a4a7a, 0xd8d0b8, 0x5a7a3a][k]!,
        k,
        -w * 0.28 + k * (w * 0.18),
        line,
        0.85,
      );
  }
  // verandah: corrugated sheet on timber posts
  const vd = o.verandah ?? 0;
  if (vd > 0) {
    const vy = 2.6;
    kit.sheet(g, w + 0.2, vd + 0.2, o.roof, 0, vy, vd / 2, 0.14);
    kit.box(g, w + 0.2, 0.08, 0.06, 0x4a3a2a, 0, vy - 0.12, vd, 'wood');
    for (const px of [-w / 2 + 0.1, 0, w / 2 - 0.1])
      kit.box(g, 0.09, vy - 0.1, 0.09, 0x4a3a2a, px, (vy - 0.1) / 2, vd - 0.05, 'wood');
  }

  // roof
  const kind = o.roofKind ?? 'gable';
  if (kind === 'flat') {
    // parapet roof: a low wall around a flat slab
    kit.wall(g, w, 0.5, 0.15, o.wall, 0, H + 0.25, -0.08);
    kit.wall(g, w, 0.5, 0.15, o.wall, 0, H + 0.25, -d + 0.08);
    kit.wall(g, 0.15, 0.5, d, o.wall, -w / 2 + 0.08, H + 0.25, -d / 2);
    kit.wall(g, 0.15, 0.5, d, o.wall, w / 2 - 0.08, H + 0.25, -d / 2);
    kit.box(g, w - 0.3, 0.04, d - 0.3, 0x4a4844, 0, H + 0.02, -d / 2);
  } else if (kind === 'lean') {
    const p = 0.16;
    kit.sheet(
      g,
      w + 0.4,
      (d + 0.5) / Math.cos(p),
      o.roof,
      0,
      H + 0.3 + (d / 2) * Math.tan(p),
      -d / 2 + 0.1,
      p,
    );
    kit.box(g, w + 0.4, 0.12, 0.05, 0x4a3a2a, 0, H - 0.02, 0.32, 'wood');
  } else {
    const p = 0.3;
    const half = d / 2 + 0.35;
    const len = half / Math.cos(p);
    const cy = H + ((d / 2 - 0.35) / 2) * Math.tan(p) + 0.04;
    kit.sheet(g, w + 0.45, len, o.roof, 0, cy, -d / 2 + half / 2, p);
    kit.sheet(g, w + 0.45, len, o.roof, 0, cy, -d / 2 - half / 2, p, Math.PI);
    kit.add(prism(w, d, (d / 2) * Math.tan(p)), o.wall, 'plaster', 0, H, -d / 2, {}, g);
    kit.box(g, w + 0.45, 0.1, 0.05, 0x3e3226, 0, H - 0.1, 0.36, 'wood'); // fascia
  }
  // height of the roof surface at local z (on the front slope for a gable)
  const roofAt = (z: number): number => {
    if (kind === 'flat') return H;
    if (kind === 'lean') return H + 0.3 + (d / 2) * Math.tan(0.16) - (z + d / 2 - 0.1) * Math.tan(0.16);
    return H + 0.04 + Math.min(-z, d + z) * Math.tan(0.3);
  };
  if (o.weights) {
    // sandcrete blocks and old tyres holding the sheets down in the wind
    for (let k = 0; k < 3; k++) {
      const wx = -w / 2 + 0.6 + r() * (w - 1.2);
      const wz = -0.6 - r() * (d * 0.35);
      const tilt = kind === 'flat' ? 0 : kind === 'lean' ? 0.16 : 0.3;
      if (r() < 0.5)
        kit.box(g, 0.4, 0.2, 0.2, 0x7a766c, wx, roofAt(wz) + 0.12, wz, 'matte', { ry: r() * 0.4, rx: tilt });
      else kit.cyl(g, 0.3, 0.3, 0.16, 0x1c1b1a, wx, roofAt(wz) + 0.1, wz, 'matte', 10, { rx: tilt });
    }
  }
  if (o.tank) {
    const tx = w / 2 - 0.9;
    const tz = -d * 0.6;
    const ty = roofAt(tz) - 0.1;
    for (const [lx, lz] of [
      [-0.45, -0.45],
      [0.45, -0.45],
      [-0.45, 0.45],
      [0.45, 0.45],
    ] as const)
      kit.box(g, 0.06, 1.1, 0.06, 0x3a3632, tx + lx, ty + 0.55, tz + lz, 'metal');
    kit.box(g, 1.1, 0.06, 1.1, 0x3a3632, tx, ty + 1.1, tz, 'metal');
    kit.cyl(g, 0.55, 0.6, 1.2, 0x1c1c1e, tx, ty + 1.73, tz, 'plastic', 14);
    kit.cyl(g, 0.18, 0.18, 0.08, 0x1c1c1e, tx, ty + 2.37, tz, 'plastic', 10);
    kit.bar(g, v3(tx - 0.5, ty + 1.2, tz + 0.4), v3(tx - 0.5, 0.3, 0.12), 0.025, 0x3a3a3a, 'plastic', 5);
  }
  if (o.dish) {
    const dx = -w / 2 + 0.8;
    const dy = roofAt(-0.5);
    kit.box(g, 0.05, 0.6, 0.05, 0x5a5a56, dx, dy + 0.3, -0.5, 'metal');
    kit.cyl(g, 0.38, 0.06, 0.12, 0xb8b4aa, dx, dy + 0.6, -0.4, 'metal', 14, { rx: 1.1 });
  }
  if (o.ac && o.storeys > 1) {
    // split units hung between the first-floor windows (never over the shop signs below)
    const row = o.upper ?? o.ground;
    const bay = w / row.length;
    const spots =
      row.length > 1
        ? Array.from({ length: row.length - 1 }, (_, k) => -w / 2 + (k + 1) * bay)
        : [w / 2 - 0.5];
    spots.slice(0, 2).forEach((ax) => {
      const ay = STOREY + 0.3 + 1.2;
      kit.box(g, 0.8, 0.5, 0.28, 0xb8b2a6, ax, ay, 0.16, 'plastic');
      kit.box(g, 0.5, 0.42, 0.02, 0x4a4844, ax, ay, 0.31, 'metal');
      kit.bar(g, v3(ax + 0.3, ay - 0.25, 0.2), v3(ax + 0.3, 0.6, 0.06), 0.012, 0x2a2a2a, 'plastic', 4); // drip pipe
    });
  }
  return g;
}

/** A rendered compound wall with a rusted steel gate and broken bottle glass along the top. */
export function compoundWall(
  kit: StreetKit,
  parent: Object3D,
  x: number,
  y: number,
  z: number,
  ry: number,
  len: number,
  h: number,
  color: number,
  gateAt = 0,
  gateColor = 0x5a3a28,
  gate = 2.2,
): void {
  const r = kit.rng;
  const g = frame(parent, x, y, z, ry);
  const segs: [number, number][] = [
    [-len / 2, gateAt - gate / 2],
    [gateAt + gate / 2, len / 2],
  ];
  for (const [a, b] of segs) {
    if (b - a < 0.05) continue;
    kit.wall(g, b - a, h, 0.2, color, (a + b) / 2, h / 2, 0);
    kit.box(g, b - a + 0.04, 0.08, 0.26, 0x6e6a62, (a + b) / 2, h + 0.04, 0);
    for (let k = a + 0.1; k < b - 0.1; k += 0.11 + r() * 0.1)
      kit.box(
        g,
        0.05,
        0.06 + r() * 0.08,
        0.03,
        r() < 0.5 ? 0x2e5a36 : 0x6a5a30,
        k,
        h + 0.12,
        (r() - 0.5) * 0.12,
        'plastic',
      );
  }
  // gate piers and two leaves of rusted sheet steel, one ajar
  for (const s of [-1, 1])
    kit.wall(g, 0.34, h + 0.3, 0.34, color, gateAt + s * (gate / 2 + 0.05), (h + 0.3) / 2, 0);
  kit.box(
    g,
    gate / 2 - 0.05,
    h - 0.15,
    0.04,
    gateColor,
    gateAt - gate / 4,
    (h - 0.15) / 2 + 0.05,
    0,
    'metal',
  );
  kit.box(
    g,
    gate / 2 - 0.05,
    h - 0.15,
    0.04,
    gateColor,
    gateAt + gate / 4 + 0.15,
    (h - 0.15) / 2 + 0.05,
    0.35,
    'metal',
    {
      ry: -0.7,
    },
  );
}
