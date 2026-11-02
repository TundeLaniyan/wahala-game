/**
 * Shared cover families of the researched communities: real objects built from boxes and cylinders (a shopfront
 * with its fascia and shutters, a market stall under its umbrella, a house with its pitched zinc roof ...). Each
 * arena maps its own object letters to these (or to its own landmark families) and brings its own palette
 * (`Theme`). Presentation only; the sim only knows the '#' tiles.
 */
import type { CK, Family, Rect } from './kit';
import { board, box, cyl, pick, shopBoard, smallBoard } from './kit';

const CONCRETE = 0xb6b2a8;
const CONCRETE_DARK = 0x8a867c;
const DARK = 0x16140f;
const STEEL = 0x4a4e52;

/** Offsets 0.5 .. w-0.5 along a rect side, one per tile. */
const cols = (k: CK, r: Rect): number[] => Array.from({ length: r.w }, (_, i) => k.wx(r.x + i));
const south = (k: CK, r: Rect): number => k.wz(r.y1) + 0.5;

/** Tall occupied building: window grid, balconies or a glass band, a parapet and rooftop clutter. */
export const building: Family = (k, g, r, n) => {
  const far = r.y === 0;
  const side = !far && (r.x === 0 || r.x + r.w === k.W);
  const style = (r.v + n) % 3; // 0 plaster windows, 1 balcony slabs, 2 glass band
  const H = (far ? 5.6 : side ? 3.0 : 3.8) + ((r.v * 5 + n * 3) % 5) * (side ? 0.35 : 0.7);
  const body =
    style === 2
      ? pick([0x486a86, 0x5a7a8a, 0x6a8a90], r.v)
      : pick(far ? k.theme.far : k.theme.plaster, r.v * 3 + n);
  const w = r.w - 0.06;
  const d = r.h - 0.06;
  box(k, g, k.concrete, w, H, d, r.cx, 0, r.cz, body);
  box(k, g, k.concrete, w + 0.1, 0.16, d + 0.1, r.cx, H, r.cz, 0x7a7468); // parapet cap
  const zf = south(k, r);
  const floors = Math.max(1, Math.floor((H - 0.4) / 1.5));
  for (const x of cols(k, r))
    for (let f = 0; f < floors; f++) {
      const y0 = 0.9 + f * 1.5;
      if (style === 2) box(k, g, k.glow, 0.9, 0.7, 0.03, x, y0 - 0.05, zf, 0x7aa6c8);
      else if (style === 1) {
        box(k, g, k.concrete, 1.0, 0.1, 0.3, x, y0 - 0.55, zf + 0.15, 0xd8d2c4);
        box(k, g, k.metal, 1.0, 0.32, 0.03, x, y0 - 0.45, zf + 0.3, 0x3a3a38);
        box(k, g, k.paint, 0.4, 0.8, 0.03, x, y0 - 0.5, zf, DARK);
      } else {
        box(k, g, k.paint, 0.46, 0.55, 0.04, x, y0, zf, DARK);
        box(k, g, k.metal, 0.52, 0.06, 0.12, x, y0 - 0.05, zf + 0.04, 0x6a6a66);
      }
    }
  const x0 = k.wx(r.x) + 0.2;
  if (r.v % 2 === 0)
    cyl(k, g, k.paint, 0.3, 0.3, 0.55, x0 + (r.w - 1) * 0.6, H + 0.16, r.cz, 0x1a1a1c, 12); // water tank
  else box(k, g, k.metal, 0.5, 0.3, 0.3, x0 + 0.2, H - 0.5, zf + 0.15, 0xb8b4aa); // a split AC unit
};

/** A shopfront row, 2.7 m: roller shutters (some raised over a lit interior), a fascia board, a tarp awning. */
export const shop: Family = (k, g, r, n) => {
  const H = 2.7;
  const wall = pick(k.theme.plaster, r.v * 2 + n);
  box(k, g, k.concrete, r.w - 0.04, H, r.h - 0.04, r.cx, 0, r.cz, wall);
  box(k, g, k.concrete, r.w + 0.06, 0.16, r.h + 0.06, r.cx, H, r.cz, 0x8a8276);
  const zf = south(k, r);
  cols(k, r).forEach((x, i) => {
    box(k, g, k.paint, 0.8, 1.6, 0.04, x, 0.02, zf, DARK);
    if ((i + r.v) % 2 === 0)
      box(k, g, k.zinc, 0.84, 0.55, 0.05, x, 1.1, zf + 0.02, 0x7a8288); // shutter half raised
    else box(k, g, k.glow, 0.5, 0.5, 0.03, x, 0.6, zf + 0.03, 0xe6c880); // lit interior
    box(k, g, k.paint, 0.16, 0.5, 0.05, x - 0.28, 0.5, zf + 0.05, pick(k.theme.accent, x + n));
  });
  const aw = Math.max(1, Math.floor(r.w / 2));
  for (let i = 0; i < aw; i++) {
    const x = r.cx - r.w / 2 + (i + 0.5) * (r.w / aw);
    board(k, g, shopBoard(k, r.g * 3 + i + n), Math.min(1.9, r.w / aw - 0.1), 0.38, x, 2.2, zf + 0.04);
    box(
      k,
      g,
      k.paint,
      Math.min(1.9, r.w / aw - 0.1),
      0.06,
      0.5,
      x,
      1.85,
      zf + 0.25,
      pick(k.theme.tarps, i + r.v),
      0,
      -0.22,
    );
  }
};

/** A one-storey lock-up with a lean zinc roof: low, so it never hides the street behind it. */
export const lockup: Family = (k, g, r, n) => {
  const zf = south(k, r);
  box(k, g, k.concrete, r.w - 0.04, 1.15, r.h - 0.04, r.cx, 0, r.cz, pick(k.theme.plaster, r.v + n));
  box(k, g, k.zinc, r.w + 0.1, 0.05, r.h + 0.14, r.cx, 1.15, r.cz, pick(k.theme.roofs, r.v), 0, -0.08);
  for (const x of cols(k, r)) box(k, g, k.paint, 0.7, 0.85, 0.04, x, 0.05, zf, pick(k.theme.accent, x + n));
};

/** An umbrella: a pole and a shallow cone canopy in a tarp colour. */
export function umbrella(
  k: CK,
  g: number,
  x: number,
  z: number,
  radius: number,
  color: number,
  h = 2.1,
): void {
  cyl(k, g, k.metal, 0.025, 0.025, h, x, 0, z, STEEL, 5);
  cyl(k, g, k.paint, 0.05, radius, 0.32, x, h - 0.05, z, color, 10);
}

/** A market stall block: counters with piled goods under umbrellas (colours from the theme). */
export const stall: Family = (k, g, r, n) => {
  for (let j = 0; j < r.h; j++)
    for (const x of cols(k, r)) {
      const z = k.wz(r.y + j);
      box(k, g, k.paint, 0.9, 0.7, 0.8, x, 0, z, pick([0x6e5440, 0x5a4636, 0x7a6244], Math.floor(x) + j));
      for (let i = 0; i < 3; i++)
        box(
          k,
          g,
          k.paint,
          0.22,
          0.18 + (i % 2) * 0.1,
          0.22,
          x - 0.27 + i * 0.27,
          0.7,
          z + 0.1 - (i % 2) * 0.2,
          pick(k.theme.tarps, Math.floor(x * 3) + i + j + n),
        );
    }
  const nu = Math.max(1, Math.ceil(r.w / 2));
  for (let i = 0; i < nu; i++) {
    const x = r.cx - r.w / 2 + (i + 0.5) * (r.w / nu);
    umbrella(
      k,
      g,
      x,
      r.cz,
      Math.min(1.25, r.w / nu / 2 + 0.35),
      pick(k.theme.tarps, r.v + i * 2 + n),
      2.05 + (i % 2) * 0.12,
    );
  }
};

/** A painted kiosk with a window, a roof slab and a small name board. */
export const kiosk: Family = (k, g, r, n) => {
  const zf = south(k, r);
  const paint = pick(k.theme.accent, r.v + n * 2);
  box(k, g, k.paint, r.w - 0.12, 1.7, r.h - 0.12, r.cx, 0, r.cz, paint);
  box(k, g, k.concrete, r.w + 0.08, 0.1, r.h + 0.08, r.cx, 1.7, r.cz, 0x6e6a62);
  box(k, g, k.glow, Math.min(0.8, r.w - 0.3), 0.5, 0.03, r.cx, 0.95, zf + 0.01, 0xe6c880);
  board(k, g, smallBoard(k, r.g + n), Math.min(1.1, r.w - 0.1), 0.3, r.cx, 1.45, zf + 0.03);
};

/** A compound wall with pillars and coping; a gate where the run is long enough. */
export const wall: Family = (k, g, r, n) => {
  const H = 2.1;
  box(k, g, k.concrete, r.w - 0.04, H, r.h - 0.04, r.cx, 0, r.cz, pick(k.theme.plaster, r.v * 2 + n + 3));
  box(k, g, k.concrete, r.w + 0.1, 0.12, r.h + 0.1, r.cx, H, r.cz, CONCRETE_DARK);
  for (const x of cols(k, r))
    if ((Math.floor(x) + r.v) % 3 === 0)
      box(k, g, k.concrete, 0.3, 0.35, r.h + 0.12, x, H + 0.12, r.cz, CONCRETE);
  if (r.w >= 3) box(k, g, k.metal, 1.1, 1.7, 0.05, r.cx, 0.05, south(k, r) + 0.02, 0x2a3036); // a steel gate
};

/** A house: one or two storeys, a pitched corrugated roof on two tilted sheets, barred windows, a tank. */
export const house: Family = (k, g, r, n) => {
  const two = (r.v + n) % 2 === 0;
  const H = two ? 5.0 : 2.7;
  const zf = south(k, r);
  box(k, g, k.concrete, r.w - 0.1, H, r.h - 0.1, r.cx, 0, r.cz, pick(k.theme.plaster, r.v * 3 + n));
  box(k, g, k.concrete, r.w, 0.28, r.h, r.cx, 0, r.cz, 0x5a5650);
  // gable roof: two tilted slabs meeting at the ridge (ridge runs along x)
  const roof = pick(k.theme.roofs, r.v + n);
  const rise = 0.55;
  const half = (r.h + 0.5) / 2;
  const slope = Math.atan2(rise, half);
  for (const sgn of [-1, 1])
    box(
      k,
      g,
      k.zinc,
      r.w + 0.2,
      0.06,
      half / Math.cos(slope) + 0.02,
      r.cx,
      H + rise / 2,
      r.cz + (sgn * half) / 2,
      roof,
      0,
      -sgn * slope,
    );
  for (const x of cols(k, r)) {
    for (let f = 0; f < (two ? 2 : 1); f++) {
      box(k, g, k.paint, 0.42, 0.5, 0.04, x, 1.1 + f * 2.2, zf, DARK);
      box(k, g, k.metal, 0.5, 0.05, 0.1, x, 1.05 + f * 2.2, zf + 0.04, 0x6a6a66);
    }
    box(k, g, k.paint, 0.5, 1.1, 0.04, x + 0.3, 0.2, zf + 0.01, pick(k.theme.accent, Math.floor(x) + n));
  }
  if (r.w >= 4 && (r.v + n) % 3 === 0)
    cyl(k, g, k.paint, 0.3, 0.3, 0.6, r.cx - r.w / 2 + 0.7, H + rise, r.cz - 0.3, 0x1a1a1c, 10);
};

/** A bus / BRT-style shelter: roof on posts, a bench, a back panel and a route poster. */
export const shelter: Family = (k, g, r, n) => {
  for (const x of cols(k, r)) {
    for (const dx of [-0.42, 0.42]) cyl(k, g, k.metal, 0.04, 0.04, 2.1, x + dx, 0, r.cz - 0.35, STEEL, 6);
    box(
      k,
      g,
      k.metal,
      1.0,
      0.08,
      0.95,
      x,
      2.1,
      r.cz - 0.05,
      pick(k.theme.accent, Math.floor(x) + n),
      0,
      -0.06,
    );
    box(k, g, k.metal, 0.92, 1.2, 0.05, x, 0.5, r.cz - 0.4, 0x2a3036);
    box(k, g, k.paint, 0.8, 0.06, 0.3, x, 0.42, r.cz - 0.2, 0x6e5440);
  }
};

/** A warehouse: a deep concrete hall under a gabled zinc roof, roller doors on a loading dock, stacked sacks. */
export const warehouse: Family = (k, g, r, n) => {
  const H = 3.6;
  const zf = south(k, r);
  box(
    k,
    g,
    k.concrete,
    r.w - 0.1,
    H,
    r.h - 0.1,
    r.cx,
    0,
    r.cz,
    pick([0xb8b0a0, 0xa8a89a, 0xc4b8a0, 0x9aa09a], r.v + n),
  );
  box(k, g, k.concrete, r.w + 0.04, 0.5, r.h + 0.04, r.cx, 0, r.cz, 0x7a7468);
  const roof = pick(k.theme.roofs, r.v * 2 + n);
  const rise = 0.8;
  const half = (r.h + 0.4) / 2;
  const slope = Math.atan2(rise, half);
  for (const sgn of [-1, 1])
    box(
      k,
      g,
      k.zinc,
      r.w + 0.3,
      0.07,
      half / Math.cos(slope),
      r.cx,
      H + rise / 2,
      r.cz + (sgn * half) / 2,
      roof,
      0,
      -sgn * slope,
    );
  const doors = Math.max(1, Math.floor(r.w / 2.2));
  for (let i = 0; i < doors; i++) {
    const x = r.cx - r.w / 2 + (i + 0.5) * (r.w / doors);
    box(k, g, k.zinc, 1.5, 2.1, 0.06, x, 0.5, zf + 0.02, 0x8a9088);
    box(k, g, k.paint, 1.5, 0.12, 0.06, x, 2.6, zf + 0.04, pick(k.theme.accent, i + n));
    box(k, g, k.concrete, 1.8, 0.5, 0.7, x, 0, zf + 0.35, CONCRETE_DARK); // loading dock
    if ((i + r.v) % 2 === 0)
      for (let s = 0; s < 3; s++)
        box(
          k,
          g,
          k.paint,
          0.5,
          0.3,
          0.34,
          x - 0.45 + s * 0.45,
          0.5,
          zf + 0.4,
          pick([0xc8b88a, 0xb8a878, 0xd0c49a], s + i),
        );
  }
  board(k, g, shopBoard(k, r.g + n), Math.min(3.2, r.w - 0.3), 0.55, r.cx, H - 0.45, zf + 0.04);
};

/** An open-front workshop: three walls, a lean zinc roof, engines and parts inside, a hand-painted board. */
export const workshop: Family = (k, g, r, n) => {
  const H = 2.9;
  const zf = south(k, r);
  box(k, g, k.concrete, r.w - 0.06, H, 0.12, r.cx, 0, r.cz - r.h / 2 + 0.12, pick(k.theme.plaster, r.v + n)); // back wall
  for (const sx of [-1, 1])
    box(
      k,
      g,
      k.concrete,
      0.12,
      H,
      r.h - 0.1,
      r.cx + sx * (r.w / 2 - 0.1),
      0,
      r.cz,
      pick(k.theme.plaster, r.v + n + 1),
    );
  box(
    k,
    g,
    k.zinc,
    r.w + 0.2,
    0.06,
    r.h + 0.3,
    r.cx,
    H,
    r.cz + 0.05,
    pick(k.theme.roofs, r.v * 2 + n),
    0,
    -0.12,
  );
  for (const x of cols(k, r)) {
    box(k, g, k.paint, 0.5, 0.5, 0.5, x, 0, r.cz, pick([0x3a3a3c, 0x7a3a26, 0x2a4a6a], Math.floor(x) + n)); // engine blocks
    cyl(
      k,
      g,
      k.paint,
      0.2,
      0.2,
      0.6,
      x + 0.3,
      0,
      zf - 0.3,
      pick([0x2a5a8a, 0xa8321c, 0x2a2a2c], Math.floor(x) + r.v),
      8,
    ); // drums
  }
  board(k, g, smallBoard(k, r.g + n * 2), Math.min(2.4, r.w - 0.2), 0.34, r.cx, H - 0.3, zf + 0.02);
};
