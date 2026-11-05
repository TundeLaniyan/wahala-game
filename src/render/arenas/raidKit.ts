/**
 * Shared props of the classic-raid arenas (docs/RAID_PRESENTATION.md): pallets and cartons, shelving, roller doors, strip
 * lights, a forklift, containers, signs. Presentation only, procedural, baked into the set's statics (a few draw calls).
 * Everything is fictional - lettering says DISPATCH DEPOT, BAY 3, KEEP CLEAR, never a real company, brand or livery.
 *
 * Rules every raid set follows (the same as every arena set, common.ts): nothing stands on the board or the perimeter
 * walls; tall things live north and on the far sides; the south (camera) side stays below about one metre.
 */
import type { Material } from 'three';
import { Group } from 'three';
import { box, cyl, mat } from '../assets/helpers';
import { corrugatedTexture, concreteTexture } from '../textures';
import type { SetContext } from './common';
import { STREET } from './common';
import { signTexture, sign } from './oshodiKit';
import type { SignSpec } from './oshodiKit';
import { lampMat } from './roadworksKit';
import type { SiteLights } from './roadworksKit';

export function raidPalette() {
  return {
    carton: mat(0x9a7a4c, { roughness: 0.95 }),
    cartonDark: mat(0x6e5636, { roughness: 0.95 }),
    cartonPale: mat(0xb9a074, { roughness: 0.95 }),
    wrap: mat(0xb9bfc2, { roughness: 0.35, metalness: 0.1 }),
    wood: mat(0x6e5232, { roughness: 1 }),
    woodDark: mat(0x4a3722, { roughness: 1 }),
    blue: mat(0x2d4f78, { roughness: 0.55, metalness: 0.45 }),
    orange: mat(0xc2570f, { roughness: 0.6, metalness: 0.35 }),
    yellow: mat(0xc9a21c, { roughness: 0.6, metalness: 0.2 }),
    red: mat(0x8a2a22, { roughness: 0.7, metalness: 0.2 }),
    green: mat(0x2f5a3a, { roughness: 0.7, metalness: 0.25 }),
    steel: mat(0x4e5156, { roughness: 0.5, metalness: 0.65 }),
    steelLight: mat(0x8a8f95, { roughness: 0.45, metalness: 0.6 }),
    rubber: mat(0x141416, { roughness: 0.95 }),
    rust: mat(0x6a3a24, { roughness: 0.85, metalness: 0.35 }),
    concrete: mat(0x77746e, { roughness: 1, map: concreteTexture(), flat: false }),
    concreteDark: mat(0x4a4844, { roughness: 1 }),
    brick: mat(0x7c4a38, { roughness: 1 }),
    plaster: mat(0x8a8272, { roughness: 1 }),
    sheet: mat(0xffffff, { roughness: 0.75, metalness: 0.4, map: corrugatedTexture(), flat: false }),
    sheetGreen: mat(0x78907c, { roughness: 0.75, metalness: 0.4, map: corrugatedTexture(), flat: false }),
    sheetBlue: mat(0x6c86a4, { roughness: 0.75, metalness: 0.4, map: corrugatedTexture(), flat: false }),
    sheetRed: mat(0xa4685a, { roughness: 0.75, metalness: 0.4, map: corrugatedTexture(), flat: false }),
    glass: mat(0x1a242c, { roughness: 0.12, metalness: 0.6 }),
    black: mat(0x1a1a1c, { roughness: 0.7, metalness: 0.35 }),
  };
}
export type RaidPalette = ReturnType<typeof raidPalette>;

type At = { x: number; z: number; ry: number };

function put(ctx: SetContext, g: Group, at: At, y = STREET): void {
  g.position.set(at.x, y, at.z);
  g.rotation.y = at.ry;
  ctx.statics.add(g);
}

/** A wooden pallet, optionally loaded with a stack of cartons (`stack` layers of 2 x 2), optionally shrink-wrapped. */
export function pallet(
  ctx: SetContext,
  P: RaidPalette,
  at: At,
  o: { stack?: number; wrap?: boolean; carton?: Material; lean?: number } = {},
): void {
  const g = new Group();
  g.add(box(1.1, 0.04, 1.1, P.wood, 0, 0.14, 0));
  for (const x of [-0.5, 0, 0.5]) g.add(box(0.1, 0.12, 1.1, P.woodDark, x, 0.06, 0));
  const layers = o.stack ?? 0;
  const r = ctx.rng;
  for (let l = 0; l < layers; l++)
    for (const [cx, cz] of [
      [-0.26, -0.26],
      [0.26, -0.26],
      [-0.26, 0.26],
      [0.26, 0.26],
    ] as const) {
      const m = o.carton ?? (r() < 0.2 ? P.cartonDark : r() < 0.3 ? P.cartonPale : P.carton);
      g.add(box(0.5, 0.4, 0.5, m, cx + (r() - 0.5) * 0.03, 0.36 + l * 0.41, cz + (r() - 0.5) * 0.03));
    }
  if (o.wrap && layers > 0) g.add(box(1.08, layers * 0.41, 1.08, P.wrap, 0, 0.16 + (layers * 0.41) / 2, 0));
  if (o.lean) g.rotation.z = o.lean;
  put(ctx, g, at);
}

/** A steel racking run: `bays` bays of 1.8 m, `tiers` shelf levels, loaded with cartons and the odd empty slot. */
export function shelving(
  ctx: SetContext,
  P: RaidPalette,
  at: At,
  o: { bays: number; tiers: number; tierH?: number; load?: number; frame?: Material; beam?: Material },
): void {
  const g = new Group();
  const bayW = 1.8;
  const depth = 0.85;
  const tierH = o.tierH ?? 1.05;
  const height = tierH * o.tiers + 0.2;
  const frame = o.frame ?? P.blue;
  const beam = o.beam ?? P.orange;
  const r = ctx.rng;
  const x0 = (-o.bays * bayW) / 2;
  for (let b = 0; b <= o.bays; b++)
    for (const z of [-depth / 2, depth / 2])
      g.add(box(0.07, height, 0.07, frame, x0 + b * bayW, height / 2, z));
  for (let t = 0; t < o.tiers; t++) {
    const y = 0.28 + t * tierH;
    for (let b = 0; b < o.bays; b++) {
      const cx = x0 + (b + 0.5) * bayW;
      for (const z of [-depth / 2, depth / 2]) g.add(box(bayW, 0.09, 0.06, beam, cx, y, z));
      g.add(box(bayW - 0.05, 0.03, depth - 0.05, P.woodDark, cx, y + 0.02, 0));
      const n = Math.floor((o.load ?? 0.8) * 3 + r() * 1.2);
      for (let k = 0; k < n; k++) {
        const w = 0.42 + r() * 0.3;
        const h = 0.3 + r() * 0.3;
        const m = r() < 0.18 ? P.cartonDark : r() < 0.3 ? P.cartonPale : r() < 0.06 ? P.wrap : P.carton;
        g.add(
          box(
            w,
            h,
            depth * 0.82,
            m,
            cx - bayW / 2 + 0.3 + (k + r() * 0.3) * (bayW / Math.max(1, n)),
            y + 0.035 + h / 2,
            0,
          ),
        );
      }
    }
  }
  // cross bracing on the back of the run
  for (let b = 0; b < o.bays; b++) {
    const d = box(
      0.04,
      Math.hypot(bayW, height) * 0.9,
      0.03,
      frame,
      x0 + (b + 0.5) * bayW,
      height / 2,
      -depth / 2 - 0.02,
    );
    d.rotation.z = Math.atan2(bayW, height);
    g.add(d);
  }
  put(ctx, g, at);
}

/**
 * A roller-shutter door in a wall facing +z (rotate with `ry`): frame, slatted shutter raised by `raise` (0 closed, 1
 * open), a yellow bottom bar and, when open, a bright slot of daylight / yard light behind it.
 */
export function rollerDoor(
  ctx: SetContext,
  P: RaidPalette,
  at: At,
  o: { w?: number; h?: number; raise?: number; spill?: number; y?: number },
): void {
  const w = o.w ?? 3;
  const h = o.h ?? 3.2;
  const raise = o.raise ?? 0;
  const g = new Group();
  const open = h * raise;
  // opening (dark interior or bright spill)
  g.add(box(w, h, 0.06, o.spill ? lampMat(o.spill, 0.9) : P.black, 0, h / 2, -0.04));
  const slat = Math.max(0.12, h - open);
  g.add(box(w - 0.08, slat, 0.08, P.sheet, 0, h - slat / 2, 0.02));
  g.add(box(w - 0.08, 0.1, 0.12, P.yellow, 0, h - slat + 0.05, 0.04));
  // frame, header box and guide rails
  for (const s of [-1, 1])
    g.add(box(0.16, h + 0.1, 0.22, P.concreteDark, s * (w / 2 + 0.04), (h + 0.1) / 2, 0));
  g.add(box(w + 0.4, 0.34, 0.3, P.steel, 0, h + 0.18, 0.02));
  put(ctx, g, at, o.y ?? STREET);
}

/** A wall-mounted strip light (a housing with a lit tube) and a soft halo through `L`. */
export function stripLight(
  ctx: SetContext,
  L: SiteLights | null,
  P: RaidPalette,
  at: At,
  o: { y: number; len?: number; color?: number },
): void {
  const len = o.len ?? 1.5;
  const g = new Group();
  g.add(box(len + 0.1, 0.07, 0.2, P.steelLight, 0, 0, 0));
  g.add(box(len, 0.045, 0.1, lampMat(o.color ?? 0xdfeaff, 2.6), 0, -0.05, 0));
  put(ctx, g, at, o.y);
  if (L) L.glow(at.x, o.y - 0.1, at.z + Math.cos(at.ry) * 0.2, len * 1.4, o.color ?? 0xcfe0ff, 0.5);
}

/** A counterbalance forklift (orange): body, counterweight, cab frame with a roof, mast, forks and four wheels. */
export function forklift(
  ctx: SetContext,
  P: RaidPalette,
  at: At,
  o: { raised?: number; load?: boolean } = {},
): void {
  const g = new Group();
  g.add(box(1.0, 0.5, 1.9, P.orange, 0, 0.55, -0.2));
  g.add(box(1.0, 0.55, 0.55, P.orange, 0, 0.75, -1.05)); // counterweight
  g.add(box(0.7, 0.04, 0.7, P.black, 0, 0.84, 0.05)); // seat
  for (const [x, z] of [
    [-0.45, -0.35],
    [0.45, -0.35],
    [-0.45, 0.5],
    [0.45, 0.5],
  ] as const)
    g.add(box(0.05, 1.3, 0.05, P.black, x, 1.45, z));
  g.add(box(1.0, 0.06, 1.0, P.black, 0, 2.1, 0.08));
  for (const x of [-0.18, 0.18]) g.add(box(0.07, 2.0, 0.07, P.steel, x, 1.05, 0.95));
  const lift = o.raised ?? 0.25;
  for (const x of [-0.3, 0.3]) g.add(box(0.1, 0.05, 1.1, P.steelLight, x, lift, 1.55));
  g.add(box(0.9, 0.5, 0.05, P.steel, 0, lift + 0.25, 0.98));
  for (const [x, z] of [
    [-0.5, 0.5],
    [0.5, 0.5],
    [-0.46, -0.85],
    [0.46, -0.85],
  ] as const) {
    const wh = cyl(0.3, 0.3, 0.22, P.rubber, x, 0.3, z, 12);
    wh.rotation.z = Math.PI / 2;
    g.add(wh);
  }
  if (o.load)
    pallet(
      ctx,
      P,
      { x: at.x + Math.sin(at.ry) * 1.55, z: at.z + Math.cos(at.ry) * 1.55, ry: at.ry },
      { stack: 2, wrap: true },
    );
  put(ctx, g, at);
}

/** A shipping container (6 x 2.4 x 2.6 m) with corrugation ribs and a door end; `paint` is its fictional livery colour. */
export function container(
  ctx: SetContext,
  P: RaidPalette,
  at: At,
  paint: Material,
  o: { stack?: number } = {},
): void {
  const levels = o.stack ?? 1;
  for (let l = 0; l < levels; l++) {
    const g = new Group();
    g.add(box(2.4, 2.6, 6, paint, 0, 1.3, 0));
    for (let i = -2.8; i <= 2.8; i += 0.4) {
      g.add(box(0.05, 2.4, 0.18, paint, 1.22, 1.3, i));
      g.add(box(0.05, 2.4, 0.18, paint, -1.22, 1.3, i));
    }
    g.add(box(2.46, 0.12, 6.06, P.steel, 0, 2.62, 0));
    g.add(box(2.3, 2.4, 0.06, P.rust, 0, 1.3, 3.02));
    for (const x of [-0.45, 0.45]) g.add(box(0.06, 2.3, 0.08, P.steelLight, x, 1.3, 3.08));
    put(ctx, g, { ...at }, STREET + l * 2.62);
  }
}

/** Painted board with fictional lettering. */
export function raidSign(
  ctx: SetContext,
  key: string,
  spec: SignSpec,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  ry = 0,
): void {
  sign(ctx, signTexture(`raid:${key}`, 512, Math.round((512 * h) / w), spec, 11), x, y, z, w, h, ry);
}

export const DEPOT_SIGN: SignSpec = {
  bg: '#c9a21c',
  fg: '#1a1a18',
  lines: [
    ['DISPATCH', 112],
    ['DEPOT', 96],
  ],
  border: '#1a1a18',
  wear: 1.3,
};
export const BAY_SIGN = (n: number): SignSpec => ({
  bg: '#2d4f78',
  fg: '#f1efe6',
  lines: [[`BAY ${n}`, 150]],
  border: '#f1efe6',
  wear: 1,
});
export const KEEP_CLEAR_SIGN: SignSpec = {
  bg: '#8a2a22',
  fg: '#f1efe6',
  lines: [
    ['KEEP', 90],
    ['CLEAR', 90],
  ],
  border: '#f1efe6',
  wear: 1,
};
