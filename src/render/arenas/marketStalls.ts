/**
 * Balogun Market furniture (presentation only): metal-framed stalls under rusted sheets and
 * patched tarpaulins, the goods they sell, push-trucks and wheelbarrows, the buka, open gutters
 * and ground displays. All pieces are built in a local frame (origin at the front of the stall on
 * the ground, +z towards the customers) and go into the baked statics through the `Kit`.
 */
import { CylinderGeometry, Group } from 'three';
import type { Object3D } from 'three';
import { ADIRE, PLAIN, PRINT, STRIPE, toWorld } from './marketKit';
import type { Frame, Kit } from './marketKit';

/** Faded, dusty dyed cloth: indigo adire, rust, ochre, bottle green, maroon, slate, dull teal, wine. */
export const CLOTH = [
  0x56689a, 0xa8643e, 0xc09a50, 0x4a7a5a, 0x8e4446, 0x727a84, 0x588282, 0x7c4c66, 0xa08e6c, 0x445282,
];
const BANDS = [ADIRE, STRIPE, PRINT, PLAIN, ADIRE];
/** Enamel basins and plastic bowls, chipped and sun-faded. */
export const ENAMEL = [0xb4ae9c, 0x5e7a68, 0x4c6684, 0x8a3e30, 0xa89a6a, 0x6a6e70, 0x3e5a4e];
/** Rusted / weathered roofing sheets and faded tarps. */
export const SHEETS = [0xb0a89c, 0xa07458, 0xb8b2a6, 0x7e8e98, 0x9a6448, 0x9a988c];
export const TARPS = [0x6a8296, 0xb8b2a4, 0x7a7a5a, 0x8a7058, 0x5e7266, 0xa8a090];
const GRAIN = [0x6a3a26, 0xd2c6aa, 0xc8bea8, 0xa8843e, 0x8a5a2e, 0xbca880];
const WOOD = [0x7a5e44, 0x6a5440, 0x86684a, 0x6e6250];
const PIPE = [0x6e6a60, 0x5e6c66, 0x76604e, 0x5e6674];

export type Goods = 'cloth' | 'basins' | 'grain' | 'provisions';

export interface StallOpts {
  w: number;
  d: number;
  goods: Goods;
  roof: 'sheet' | 'tarp' | 'patch';
  /** eave heights above the ground at the front and back */
  front: number;
  back: number;
  seed: number;
  sign?: number;
}

const pick = <T>(list: readonly T[], n: number): T => list[((n % list.length) + list.length) % list.length]!;

/** A frame group placed in the statics. */
function frameGroup(kit: Kit, f: Frame): Group {
  const g = new Group();
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.ry;
  kit.statics.add(g);
  return g;
}

export function basinStack(
  kit: Kit,
  g: Object3D,
  x: number,
  y: number,
  z: number,
  n: number,
  seed: number,
): void {
  const c = pick(ENAMEL, seed);
  for (let k = 0; k < n; k++) {
    const r = 0.25 - k * 0.006;
    kit.cyl(
      g,
      r,
      r * 0.62,
      0.13,
      k === n - 1 ? pick(ENAMEL, seed + 3) : c,
      x,
      y + 0.065 + k * 0.05,
      z,
      'metal',
      14,
    );
  }
}

export function openSack(kit: Kit, g: Object3D, x: number, y: number, z: number, seed: number): void {
  kit.cyl(g, 0.21, 0.24, 0.46, 0x8e7e5e, x, y + 0.23, z, 'matte', 9);
  kit.cyl(g, 0.24, 0.22, 0.06, 0x9a8a68, x, y + 0.47, z, 'matte', 9); // rolled-down lip
  kit.cyl(g, 0.2, 0.2, 0.04, pick(GRAIN, seed), x, y + 0.46, z, 'matte', 9);
  if (seed % 2 === 0) kit.cyl(g, 0.09, 0.06, 0.06, pick(ENAMEL, seed), x + 0.05, y + 0.5, z, 'metal', 10); // the mudu bowl
}

/** Ground display on a woven mat: heaps of pepper, tomatoes, onions; a basin. Under 0.3 m. */
export function groundMat(kit: Kit, f: Frame, seed: number): void {
  const g = frameGroup(kit, f);
  kit.cloth(g, 1.2, 0.015, 0.8, 0x8e7c54, STRIPE, 0, 0.008, 0);
  const heaps = [0x7a2a1e, 0x8a3828, 0x8a6a48, 0x6e5a2a, 0x6a2a20];
  for (let k = 0; k < 6; k++) {
    const hx = -0.42 + (k % 3) * 0.42;
    const hz = -0.18 + Math.floor(k / 3) * 0.36;
    kit.add(new CylinderGeometry(0.01, 0.13, 0.13, 7), pick(heaps, seed + k), 'matte', hx, 0.08, hz, {}, g);
  }
  basinStack(kit, g, 0.75, 0, 0.1, 2, seed);
}

/** A metal-framed market stall with its goods, roof and an optional hanging signboard. */
export function stall(kit: Kit, f: Frame, o: StallOpts): void {
  const g = frameGroup(kit, f);
  const r = kit.rng;
  const { w, d } = o;
  const pipe = pick(PIPE, o.seed);
  const wood = pick(WOOD, o.seed);
  // frame: angle-iron posts and rails
  for (const sx of [-1, 1]) {
    const px = sx * (w / 2 - 0.04);
    kit.box(g, 0.05, o.front, 0.05, pipe, px, o.front / 2, 0.05, 'metal');
    kit.box(g, 0.05, o.back, 0.05, pipe, px, o.back / 2, -d + 0.05, 'metal');
    kit.box(g, 0.04, 0.04, d, pipe, px, (o.front + o.back) / 2 - 0.06, -d / 2 + 0.05, 'metal', {
      rx: Math.atan2(o.back - o.front, d),
    });
  }
  kit.box(g, w, 0.04, 0.04, pipe, 0, o.front - 0.05, 0.05, 'metal');
  kit.box(g, w, 0.04, 0.04, pipe, 0, Math.min(o.back - 0.1, 1.95), -d + 0.12, 'metal');
  // the counter: plank top on a sacking-skirted frame
  const cd = Math.min(0.72, d * 0.55);
  kit.box(g, w - 0.12, 0.05, cd, wood, 0, 0.78, -cd / 2 - 0.02);
  kit.box(g, w - 0.14, 0.7, 0.02, o.seed % 2 ? 0x7c6a4c : wood, 0, 0.42, -0.03);
  for (const sx of [-1, 1]) kit.box(g, 0.05, 0.76, 0.05, wood, sx * (w / 2 - 0.12), 0.38, -cd + 0.04);

  goods(kit, g, f, o, cd);

  // roof: sloping down to the front, overhanging the counter
  const tilt = Math.atan2(o.back - o.front, d + 0.4);
  const rd = (d + 0.55) / Math.cos(tilt);
  const ry = (o.front + o.back) / 2 + 0.02;
  const rz = -d / 2 + 0.28;
  if (o.roof === 'tarp') {
    kit.tarp(g, w + 0.4, rd, pick(TARPS, o.seed), 0, ry + 0.05, rz, tilt, 0, 0.1);
    kit.tarp(g, w * 0.45, rd * 0.55, pick(TARPS, o.seed + 2), w * 0.2, ry + 0.07, rz + 0.1, tilt, 0.15, 0.03);
    // ropes lashing it to the frame
    for (const k of [-0.36, 0.04, 0.4])
      kit.box(g, 0.018, 0.018, rd, 0x2e2a24, k * w, ry + 0.02, rz, 'matte', { rx: tilt });
  } else {
    const n = o.roof === 'patch' ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const sw = (w + 0.3) / n + 0.12;
      const sx = n === 1 ? 0 : (k - 0.5) * (sw - 0.12);
      kit.sheet(g, sw, rd, pick(SHEETS, o.seed + k * 3), sx, ry + k * 0.025, rz, tilt);
    }
    if (o.roof === 'patch') {
      // a tarp thrown over the leaking half, held down by cement blocks and a plank
      const tx = (r() - 0.5) * w * 0.4;
      kit.tarp(g, w * 0.5, rd * 0.7, pick(TARPS, o.seed + 1), tx, ry + 0.08, rz - 0.1, tilt, 0.05, 0.04);
      kit.box(g, 0.38, 0.18, 0.2, 0x8a867c, tx + 0.25, ry + 0.17, rz - 0.25, 'matte', { rx: tilt, ry: 0.3 });
      kit.box(g, w * 0.55, 0.04, 0.16, pick(WOOD, o.seed), tx, ry + 0.13, rz + 0.25, 'matte', {
        rx: tilt,
        ry: -0.1,
      });
    }
    for (let k = 0; k < 2; k++)
      kit.box(g, 0.14, 0.09, 0.12, 0x6a665e, (r() - 0.5) * w, ry + 0.08, rz + (r() - 0.5) * 0.6, 'matte', {
        ry: r() * 3,
      });
  }
  if (o.goods === 'cloth') {
    // lengths thrown over the front of the roof to air, catching the eye from the street
    const yAt = (lz: number): number => ry - (lz - rz) * Math.tan(tilt) + 0.05;
    for (const lx of [-w / 2 + 0.32, w / 2 - 0.3]) {
      const c = pick(CLOTH, o.seed + Math.round(lx * 10));
      kit.cloth(g, 0.4, 0.012, 0.6, c, pick(BANDS, o.seed + 1), lx, yAt(0.22), 0.22, { rx: tilt });
      kit.cloth(g, 0.4, 0.3, 0.012, c, pick(BANDS, o.seed + 1), lx, yAt(0.55) - 0.16, 0.55);
    }
  }
  if (o.sign !== undefined) {
    const sw = Math.min(o.goods === 'cloth' ? w - 1.15 : w * 0.75, 1.6);
    kit.sign(g, o.sign, sw, o.goods === 'cloth' ? 0 : (r() - 0.5) * (w - sw) * 0.6, o.front - 0.22, 0.38, {
      rx: -0.08,
      rz: (r() - 0.5) * 0.06,
    });
  }
}

function goods(kit: Kit, g: Group, f: Frame, o: StallOpts, cd: number): void {
  const { w, d, seed } = o;
  const top = 0.805;
  const r = kit.rng;
  const nAcross = Math.max(2, Math.floor((w - 0.3) / 0.36));
  switch (o.goods) {
    case 'cloth': {
      // folded stacks and bolts on the counter
      for (let k = 0; k < nAcross; k++) {
        const x = -w / 2 + 0.3 + k * ((w - 0.6) / Math.max(1, nAcross - 1));
        const h = 0.08 + (k % 3) * 0.06;
        for (let s = 0; s < 3; s++)
          kit.cloth(
            g,
            0.32,
            h / 3,
            0.4,
            pick(CLOTH, seed * 3 + k + s),
            pick(BANDS, k + s),
            x,
            top + h / 6 + (s * h) / 3,
            -cd / 2,
            {
              ry: (r() - 0.5) * 0.15,
            },
          );
      }
      // bolts racked behind, a pyramid
      for (let k = 0; k < 5; k++) {
        const row = k < 3 ? 0 : 1;
        const x = (row ? (k - 3.5) * 0.24 : (k - 1) * 0.24) - w * 0.15;
        kit.bolt(
          g,
          0.85,
          0.1,
          pick(CLOTH, seed + k * 2),
          pick(BANDS, k),
          x,
          top + 0.12 + row * 0.18,
          -cd - 0.22,
          Math.PI / 2,
        );
      }
      // lengths hanging from the back rail and at the front corners
      const back = Math.min(o.back - 0.1, 1.95);
      for (let k = 0; k < Math.floor(w / 0.32); k++) {
        const len = 0.9 + r() * 0.35;
        kit.cloth(
          g,
          0.3,
          len,
          0.012,
          pick(CLOTH, seed + k * 3 + 1),
          pick(BANDS, seed + k),
          -w / 2 + 0.2 + k * 0.32,
          back - len / 2,
          -d + 0.14,
        );
      }
      // the display: long lengths hung along the front, a gap left where the trader stands
      const front = w >= 2.2 ? [-0.62, -0.26, 0.26, 0.62] : [-0.26, 0.26];
      front.forEach((off, k) => {
        const len = 0.85 + r() * 0.4;
        const x = Math.sign(off) * (w / 2 - Math.abs(off));
        kit.cloth(
          g,
          0.34,
          len,
          0.012,
          pick(CLOTH, seed + k * 4 + 5),
          pick(BANDS, seed + 2 + k),
          x,
          o.front - 0.07 - len / 2,
          0.07 + k * 0.012,
          {
            rx: 0.04,
            rz: (r() - 0.5) * 0.04,
          },
        );
      });
      break;
    }
    case 'basins': {
      for (let k = 0; k < nAcross; k++) {
        const x = -w / 2 + 0.3 + k * ((w - 0.6) / Math.max(1, nAcross - 1));
        basinStack(kit, g, x, top, -cd / 2, 3 + ((seed + k) % 4), seed + k);
      }
      // big stacks on the ground by the counter, plastic buckets
      basinStack(kit, g, w / 2 + 0.28, 0, -0.2, 7, seed + 2);
      basinStack(kit, g, -w / 2 - 0.26, 0, -0.35, 5, seed + 4);
      for (let k = 0; k < 2; k++)
        kit.cyl(
          g,
          0.15,
          0.12,
          0.3,
          pick(ENAMEL, seed + k + 1),
          -w / 2 + 0.45 + k * 0.35,
          0.15,
          0.25,
          'metal',
          10,
        );
      // bowls and kettles strung along the front rail
      for (let k = 0; k < Math.floor(w / 0.3); k++) {
        const x = -w / 2 + 0.22 + k * 0.3;
        const y = o.front - 0.25 - (k % 2) * 0.12;
        if (k % 3 === 2) {
          kit.cyl(g, 0.08, 0.11, 0.16, pick(ENAMEL, k + seed), x, y, 0.06, 'metal', 10);
          kit.box(g, 0.02, 0.02, 0.1, pick(ENAMEL, k + seed), x, y + 0.02, 0.15, 'metal', { rx: -0.6 });
        } else kit.cyl(g, 0.13, 0.08, 0.07, pick(ENAMEL, k + seed + 2), x, y, 0.06, 'metal', 12, { rx: 1.3 });
      }
      break;
    }
    case 'grain': {
      for (let k = 0; k < nAcross; k++) openSack(kit, g, -w / 2 + 0.3 + k * 0.48, 0, 0.32, seed + k);
      for (let k = 0; k < 3; k++)
        kit.cyl(
          g,
          0.11,
          0.07,
          0.08,
          pick(ENAMEL, seed + k),
          -0.4 + k * 0.4,
          top + 0.04,
          -cd / 2,
          'metal',
          12,
        );
      // sacks stacked at the back
      for (const lx of [-w / 3, w / 3]) {
        const p = toWorld(f, lx, -d + 0.45, 0.3);
        kit.bag.put('prop_soft_sacks', { x: p.x, y: f.y, z: p.z, ry: p.ry });
        kit.bag.put('prop_soft_sacks', {
          x: p.x,
          y: f.y + 0.55,
          z: p.z,
          ry: p.ry + 1.2,
          sx: 0.9,
          sy: 0.8,
          sz: 0.9,
        });
      }
      break;
    }
    case 'provisions': {
      // tins and packets on the counter, cartons and crates behind and beside
      for (let k = 0; k < nAcross * 2; k++) {
        const x = -w / 2 + 0.2 + k * ((w - 0.4) / (nAcross * 2 - 1));
        kit.box(
          g,
          0.12,
          0.14 + (k % 3) * 0.05,
          0.1,
          pick([0x8a3a2a, 0xb0a888, 0x3e5a6e, 0xa88a3a, 0x4e6a3e], k + seed),
          x,
          top + 0.1,
          -cd / 2 + (k % 2) * 0.12,
        );
      }
      // sachet strips hanging from the front rail
      for (let k = 0; k < Math.floor(w / 0.4); k++)
        kit.box(
          g,
          0.09,
          0.7,
          0.01,
          pick([0x8a6a3a, 0x5a6a7a, 0x8a3a30, 0xa8a090], k + seed),
          -w / 2 + 0.3 + k * 0.4,
          o.front - 0.45,
          0.07,
          'matte',
        );
      const a = toWorld(f, -w / 2 + 0.35, -d + 0.5, 0.2);
      const b = toWorld(f, w / 2 - 0.4, -d + 0.45, -0.3);
      kit.bag.put('prop_soft_cartons', { x: a.x, y: f.y, z: a.z, ry: a.ry, sx: 0.85, sy: 0.85, sz: 0.85 });
      kit.bag.put('prop_soft_crates', { x: b.x, y: f.y, z: b.z, ry: b.ry, sx: 0.8, sy: 0.8, sz: 0.8 });
      break;
    }
  }
}

/** A Lagos push-truck: long plank bed on two car wheels with a T handle, loaded. */
export function pushTruck(kit: Kit, f: Frame, load: 'sacks' | 'bales', seed: number): void {
  const g = frameGroup(kit, f);
  const wood = pick(WOOD, seed + 1);
  kit.box(g, 0.85, 0.07, 2.1, wood, 0, 0.56, 0);
  for (const sx of [-1, 1]) {
    kit.box(g, 0.06, 0.12, 2.1, 0x3e3226, sx * 0.43, 0.6, 0);
    kit.cyl(g, 0.27, 0.27, 0.16, 0x1e1c1a, sx * 0.47, 0.27, 0.15, 'matte', 14, { rz: Math.PI / 2 });
    kit.cyl(g, 0.12, 0.12, 0.17, 0x5a5650, sx * 0.47, 0.27, 0.15, 'metal', 8, { rz: Math.PI / 2 });
    kit.box(g, 0.05, 0.05, 0.9, wood, sx * 0.2, 0.6, 1.45, 'matte', { rx: -0.25 });
  }
  kit.box(g, 0.6, 0.05, 0.05, wood, 0, 0.72, 1.88);
  kit.box(g, 0.05, 0.5, 0.05, wood, 0, 0.32, -0.95); // the stand
  if (load === 'sacks') {
    for (const lz of [-0.55, 0.15])
      for (const lx of [-0.2, 0.2]) {
        const p = toWorld(f, lx, lz, 1.4 + lx);
        kit.bag.put('prop_soft_sacks', {
          x: p.x,
          y: f.y + 0.6,
          z: p.z,
          ry: p.ry,
          sx: 0.8,
          sy: 0.75,
          sz: 0.8,
        });
      }
  } else {
    for (let k = 0; k < 5; k++) {
      const lz = -0.7 + (k % 3) * 0.55;
      const ly = 0.6 + Math.floor(k / 3) * 0.34 + 0.17;
      kit.cloth(g, 0.75, 0.32, 0.5, k % 2 ? 0x8a7a5a : 0x6e6250, PLAIN, 0, ly, lz, {
        ry: (kit.rng() - 0.5) * 0.2,
      });
      kit.box(g, 0.77, 0.03, 0.04, 0x2a2622, 0, ly, lz, 'matte'); // the binding strap
    }
  }
}

/** A builder's wheelbarrow, tipped forward on its wheel, with a load. */
export function wheelbarrow(kit: Kit, f: Frame, loadColor: number): void {
  const g = frameGroup(kit, f);
  const tray = 0x5a5e5c;
  kit
    .add(new CylinderGeometry(0.42, 0.28, 0.3, 4, 1, false, Math.PI / 4), tray, 'metal', 0, 0.48, 0, {}, g)
    .scale.set(1, 1, 1.4);
  kit
    .add(
      new CylinderGeometry(0.36, 0.2, 0.08, 4, 1, false, Math.PI / 4),
      loadColor,
      'matte',
      0,
      0.62,
      0,
      {},
      g,
    )
    .scale.set(1, 1, 1.4);
  kit.cyl(g, 0.17, 0.17, 0.07, 0x1e1c1a, 0, 0.17, 0.62, 'matte', 12, { rz: Math.PI / 2 });
  for (const sx of [-1, 1]) {
    kit.box(g, 0.04, 0.04, 1.4, 0x3e3a36, sx * 0.25, 0.4, -0.2, 'metal', { rx: -0.12 });
    kit.box(g, 0.04, 0.36, 0.04, 0x3e3a36, sx * 0.25, 0.18, -0.45, 'metal');
  }
}

/** An open roadside gutter along the frame's x (length len): concrete lips, black water, planks. */
export function gutter(kit: Kit, f: Frame, len: number, w = 0.3): void {
  const g = frameGroup(kit, f);
  // the street plane is solid, so the channel is built up between two kerbs rather than sunk
  kit.box(g, len, 0.02, w, 0x1e201c, 0, 0.012, 0, 'metal');
  kit.box(g, len, 0.14, 0.08, 0x6e665a, 0, 0.07, -w / 2 - 0.04);
  kit.box(g, len, 0.14, 0.08, 0x6a6256, 0, 0.07, w / 2 + 0.04);
  const r = kit.rng;
  for (let k = 0; k < Math.floor(len / 3); k++) {
    const px = -len / 2 + 1 + k * 3 + r();
    kit.box(g, 0.35, 0.04, w + 0.24, pick(WOOD, k), px, 0.16, 0, 'matte', { ry: (r() - 0.5) * 0.3 });
  }
  // litter caught in the gutter: sachets, bottles
  for (let k = 0; k < len * 1.5; k++)
    kit.box(
      g,
      0.08,
      0.015,
      0.05,
      k % 3 ? 0xb4ae9a : 0x4a5a6a,
      (r() - 0.5) * len,
      0.03,
      (r() - 0.5) * w * 0.8,
      'matte',
      {
        ry: r() * 3,
      },
    );
}

/**
 * The buka: a roadside cooking spot. A blackened pot on three stones over a wood fire (the caller
 * adds the fire and smoke at the frame origin), aluminium pots, a cooler, a plank table and
 * benches under a rusted lean-to, firewood stacked by the hearth.
 */
export function buka(kit: Kit, f: Frame): void {
  const g = frameGroup(kit, f);
  const r = kit.rng;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    kit.box(g, 0.2, 0.2, 0.18, 0x4a4440, Math.cos(a) * 0.24, 0.1, Math.sin(a) * 0.24, 'matte', { ry: a });
  }
  kit.cyl(g, 0.34, 0.26, 0.42, 0x1c1a18, 0, 0.42, 0, 'metal', 14);
  kit.cyl(g, 0.35, 0.35, 0.03, 0x2a2622, 0, 0.64, 0, 'metal', 14);
  kit.cyl(g, 0.5, 0.55, 0.02, 0x2a2826, 0, 0.01, 0, 'matte', 12); // ash and charcoal
  for (let k = 0; k < 5; k++) {
    // glowing coals and wood ends under the pot
    const a = k * 1.3;
    kit.box(
      g,
      0.12,
      0.05,
      0.07,
      k % 2 ? 0xff7a2a : 0xd04a18,
      Math.cos(a) * 0.14,
      0.05,
      Math.sin(a) * 0.14,
      'glow',
      { ry: a },
    );
  }
  for (let k = 0; k < 7; k++)
    kit.cyl(
      g,
      0.04,
      0.05,
      0.9,
      0x4a3626,
      -0.85 + (k % 4) * 0.1,
      0.05 + Math.floor(k / 4) * 0.09,
      -0.55,
      'matte',
      6,
      {
        rx: Math.PI / 2,
        ry: 0.2 + r() * 0.2,
      },
    );
  // cooking pots on a low table, a cooler
  kit.box(g, 1.0, 0.05, 0.55, 0x5a4430, 0.95, 0.55, -0.2);
  for (const lx of [0.55, 1.35]) kit.box(g, 0.05, 0.53, 0.5, 0x4a3a2a, lx, 0.27, -0.2);
  kit.cyl(g, 0.2, 0.19, 0.26, 0x8a8a84, 0.75, 0.71, -0.2, 'metal', 14);
  kit.cyl(g, 0.17, 0.16, 0.22, 0x7a7a74, 1.15, 0.69, -0.25, 'metal', 14);
  kit.cyl(g, 0.21, 0.21, 0.38, 0x4e6a80, 1.75, 0.19, -0.4, 'metal', 12);
  kit.cyl(g, 0.22, 0.22, 0.05, 0xb4ae9c, 1.75, 0.4, -0.4, 'metal', 12);
  // the eating table and benches
  kit.box(g, 1.4, 0.05, 0.5, 0x5e4832, 1.3, 0.72, 0.75);
  for (const sx of [-1, 1]) kit.box(g, 0.05, 0.7, 0.45, 0x4a3a2a, 1.3 + sx * 0.6, 0.35, 0.75);
  for (const lz of [0.32, 1.18]) {
    kit.box(g, 1.4, 0.04, 0.22, 0x5a4430, 1.3, 0.42, lz);
    for (const sx of [-1, 1]) kit.box(g, 0.04, 0.4, 0.18, 0x4a3a2a, 1.3 + sx * 0.6, 0.2, lz);
  }
  for (let k = 0; k < 3; k++)
    kit.cyl(g, 0.11, 0.07, 0.04, pick(ENAMEL, k + 1), 0.9 + k * 0.4, 0.77, 0.7 + (k % 2) * 0.1, 'metal', 12);
  // lean-to over the benches: posts, a rusted sheet with a tarp patch, the painted board
  for (const px of [0.55, 2.05]) kit.box(g, 0.06, 2.1, 0.06, 0x4e463c, px, 1.05, 1.45, 'metal');
  kit.sheet(g, 1.9, 2.4, pick(SHEETS, 1), 1.3, 2.25, 0.35, 0.16);
  kit.tarp(g, 0.9, 1.0, pick(TARPS, 3), 1.0, 2.3, 0.6, 0.16, 0.1, 0.04);
  kit.sign(g, 5, 1.2, 0.3, 1.95, 0.9, { ry: -Math.PI / 2, rx: -0.1 });
}
