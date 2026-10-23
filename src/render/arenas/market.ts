/**
 * Balogun Market: a dense, mature Lagos Island trading district. Weathered shophouses press in on
 * narrow lanes; metal-framed stalls under rusted corrugated sheets and patched tarpaulins sell
 * bolts of faded dyed cloth, enamel basins, grain and provisions; push-trucks and wheelbarrows
 * wait in the lanes beside open gutters; traders bargain and argue, a fight on the east lane draws
 * a knot of onlookers, and smoke drifts from a buka's wood fire in the north-east corner.
 * Colour comes from the goods, faded and dusty, never from bunting or umbrellas.
 *
 * Layout (the camera looks north from the south): the north lane runs between the arena wall and
 * a continuous stall row backed by shophouses; the east and west lanes have a stall row down the
 * middle of the street (a walkway behind it in front of the shops); the camera side keeps only
 * low ground displays under the wall height.
 */
import { assets } from '../assets/library';
import type { ArenaSet, Placement, SetContext } from './common';
import { STREET } from './common';
import { Kit } from './marketKit';
import { marketGround } from './marketGround';
import type { Frame } from './marketKit';
import { basinStack, buka, groundMat, gutter, pushTruck, stall, wheelbarrow } from './marketStalls';
import type { StallOpts } from './marketStalls';

const S = STREET;

/** Shophouses: one continuous row north, rows east and west, all on the street level. */
function shophouses(ctx: SetContext): void {
  const ids = assets.loadedIds('env_building_');
  if (ids.length === 0) return;
  const byVariant = ids.map(() => [] as Placement[]);
  let n = 3;
  const s = 1.17;
  const depth = 1.66 * s; // model front (+Z) from its origin
  const put = (x: number, z: number, ry: number): void => {
    byVariant[n++ % ids.length]!.push({ x, y: S, z, ry, sx: s, sy: s * (1.0 + ctx.rng() * 0.22), sz: s });
  };
  const NORTH_FRONT = -9.3;
  for (let x = -11.3; x <= 11.4; x += 3.76) put(x, NORTH_FRONT - depth - ((n % 3) - 1) * 0.08, 0);
  const SIDE_FRONT = 11.55;
  for (let z = -7.3; z < 9; z += 3.76) {
    put(SIDE_FRONT + depth + (n % 2) * 0.1, z, -Math.PI / 2);
    put(-SIDE_FRONT - depth - (n % 2) * 0.1, z + 1.2, Math.PI / 2);
  }
  const before = new Set(ctx.root.children);
  ids.forEach((id, k) => ctx.instance(id, byVariant[k]!));
  // the low sun would throw the east row's shadow across the whole east lane, where the market
  // life is; the north and west rows' shadows fall away from the board and are never seen
  for (const o of ctx.root.children) if (!before.has(o)) o.castShadow = false;
}

interface Row {
  /** position along the row (x for the north row, z for the side rows) */
  at: number;
  w: number;
  goods: StallOpts['goods'];
  roof: StallOpts['roof'];
  sign?: number;
}

/** The north stall row (front of the counters at z = -7.75), west to east. */
const NORTH_ROW: Row[] = [
  { at: -9.55, w: 1.9, goods: 'basins', roof: 'patch', sign: 2 },
  { at: -7.5, w: 2.15, goods: 'cloth', roof: 'sheet' },
  { at: -5.25, w: 2.3, goods: 'cloth', roof: 'tarp', sign: 0 },
  // an alley between stalls at x ~ -3.9
  { at: -2.55, w: 2.2, goods: 'grain', roof: 'patch', sign: 3 },
  { at: -0.25, w: 2.3, goods: 'cloth', roof: 'sheet' },
  { at: 2.1, w: 2.3, goods: 'provisions', roof: 'tarp', sign: 6 },
  { at: 4.45, w: 2.3, goods: 'cloth', roof: 'patch', sign: 7 },
  { at: 6.8, w: 2.2, goods: 'basins', roof: 'sheet', sign: 4 },
];

/** Side stall rows (z centres). The gap at z -2.6..0.6 east is where the fight is. */
const EAST_ROW: Row[] = [
  { at: -4.1, w: 2.5, goods: 'cloth', roof: 'patch', sign: 1 },
  { at: 2.0, w: 2.6, goods: 'basins', roof: 'tarp' },
  { at: 4.75, w: 2.0, goods: 'grain', roof: 'sheet' },
];
const WEST_ROW: Row[] = [
  { at: -4.2, w: 2.4, goods: 'grain', roof: 'sheet' },
  { at: 1.3, w: 2.6, goods: 'cloth', roof: 'patch', sign: 7 },
];

function stalls(kit: Kit): void {
  NORTH_ROW.forEach((r, i) =>
    stall(
      kit,
      { x: r.at, y: S, z: -7.75, ry: 0 },
      { ...r, d: 1.38, front: 2.15 + (i % 3) * 0.06, back: 2.62 + (i % 2) * 0.12, seed: i * 3 + 1 },
    ),
  );
  EAST_ROW.forEach((r, i) =>
    stall(
      kit,
      { x: 9.72, y: S, z: r.at, ry: -Math.PI / 2 },
      { ...r, d: 1.15, front: 2.05, back: 2.4, seed: i * 5 + 7 },
    ),
  );
  WEST_ROW.forEach((r, i) =>
    stall(
      kit,
      { x: -9.72, y: S, z: r.at, ry: Math.PI / 2 },
      { ...r, d: 1.15, front: 2.05, back: 2.4, seed: i * 5 + 4 },
    ),
  );
}

/** Goods along the slab ledges and the low camera-side street (everything there stays < 0.8 m). */
function ledgeGoods(kit: Kit, W: number, H: number): void {
  const g = kit.statics;
  // north ledge, against the back of the arena wall
  for (const [x, n] of [
    [-6.3, 4],
    [-1.4, 3],
    [3.3, 5],
    [5.9, 2],
  ] as const)
    basinStack(kit, g, x, 0, -6.06, n, Math.round(x));
  kit.bag.put('prop_soft_sacks', { x: -4.0, z: -6.05, ry: 0.4, sx: 0.85, sy: 0.75, sz: 0.85 });
  kit.bag.put('prop_soft_sacks', { x: 0.9, z: -6.06, ry: -0.3, sx: 0.8, sy: 0.7, sz: 0.8 });
  kit.bag.put('prop_soft_kegs', { x: -11.0, y: S, z: -6.9, ry: 0.5 });
  // camera side: ground displays, basins and sacks, a wheelbarrow, all under the wall line
  groundMat(kit, { x: -5.2, y: S, z: H / 2 + 1.45, ry: 0.06 }, 1);
  groundMat(kit, { x: 4.6, y: S, z: H / 2 + 1.5, ry: -0.08 }, 4);
  basinStack(kit, g, -W / 2 - 0.5, 0, H / 2 + 0.55, 3, 2);
  basinStack(kit, g, W / 2 + 0.55, 0, H / 2 + 0.5, 2, 5);
  kit.bag.put('prop_soft_sacks', { x: -2.6, y: S, z: H / 2 + 1.3, ry: 0.3, sx: 0.85, sy: 0.7, sz: 0.85 });
  kit.bag.put('prop_soft_sacks', { x: 7.3, y: S, z: H / 2 + 1.2, ry: -0.6, sx: 0.85, sy: 0.7, sz: 0.85 });
  wheelbarrow(kit, { x: -7.6, y: S, z: H / 2 + 1.5, ry: 1.9 }, 0x8a5a3a);
}

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const kit = new Kit(ctx);

  marketGround(ctx);

  shophouses(ctx);
  stalls(kit);

  // open gutters along the foot of the arena slab (north, south, and both side lanes)
  gutter(kit, { x: 0, y: S, z: -H / 2 - 0.95, ry: 0 }, W + 1.8, 0.24);
  gutter(kit, { x: 0, y: S, z: H / 2 + 0.95, ry: 0 }, W + 1.8, 0.24);
  gutter(kit, { x: W / 2 + 1.05, y: S, z: 0, ry: Math.PI / 2 }, H + 0.6, 0.22);
  gutter(kit, { x: -W / 2 - 1.05, y: S, z: 0, ry: Math.PI / 2 }, H + 0.6, 0.22);

  // the buka in the north-east corner: wood fire, pot, benches under a lean-to
  const hearth: Frame = { x: W / 2 + 1.55, y: S, z: -H / 2 - 0.95, ry: Math.PI / 2 };
  buka(kit, hearth);
  ctx.ambient.fire(hearth.x, S + 0.1, hearth.z, 0.24);
  ctx.ambient.smokeColumn(hearth.x, S + 0.75, hearth.z, { shade: 0.85, size: 1.0, rate: 9 });

  // traffic squeezing through: a push-truck of cloth bales, one of grain, a keke, an okada
  pushTruck(kit, { x: -W / 2 - 1.65, y: S, z: 3.9, ry: 0.08 }, 'sacks', 2);
  pushTruck(kit, { x: -3.9, y: S, z: -H / 2 - 1.75, ry: Math.PI / 2 - 0.12 }, 'bales', 5);
  wheelbarrow(kit, { x: W / 2 + 1.45, y: S, z: 4.1, ry: -2.6 }, 0x9a8a5e);
  ctx.vehicles('keke', [{ x: -W / 2 - 2.0, y: S, z: -H / 2 - 1.3, ry: Math.PI / 2 + 0.25 }], {
    idle: true,
  });
  ctx.vehicles('okada', [{ x: W / 2 + 1.35, y: S, z: 2.4, ry: 0.35 }]);

  ledgeGoods(kit, W, H);
  ctx.instance('env_poles', [
    { x: W / 2 + 4.0, y: S, z: -1.1, ry: -Math.PI / 2 },
    { x: -W / 2 - 4.0, y: S, z: 2.9, ry: Math.PI / 2 },
  ]);
  ctx.instance('env_lamp', [{ x: -W / 2 - 1.05, y: S, z: 5.5, ry: 2.4 }]);
  kit.finish();

  // --- street life, most important first (the quality budget drops the tail)
  const L = ctx.life;
  const fx = W / 2 + 2.45;
  const fz = -1.0;
  const watch = (x: number, z: number): void => {
    L.add({ kind: 'onlooker', x, y: S, z, yaw: Math.atan2(fx - x, fz - z) });
  };
  L.add({ kind: 'fight', x: fx, y: S, z: fz, yaw: 0.35 });
  watch(fx - 0.95, fz - 1.15);
  watch(fx + 0.85, fz - 1.1);
  L.add({ kind: 'seller', x: -7.3, y: S, z: -7.1, yaw: 0.15 });
  L.add({ kind: 'argue', x: -W / 2 - 1.75, y: S, z: -1.35, yaw: 0.1 });
  watch(fx - 0.9, fz + 1.2);
  L.add({ kind: 'walker', x: 3.5, y: S, z: -7.0, yaw: 0, toX: 8.0, toZ: -7.2 });
  L.add({ kind: 'seller', x: 2.3, y: S, z: -7.1, yaw: -0.1 });
  watch(fx + 0.8, fz + 1.25);
  // the cook tending the pot
  L.add({ kind: 'onlooker', x: hearth.x - 0.55, y: S, z: hearth.z - 0.45, yaw: 0.9 });
  L.add({ kind: 'seller', x: -W / 2 - 1.65, y: S, z: 1.3, yaw: Math.PI / 2 });

  ctx.ambient.dust(0, -H / 2 - 1.5, 14, 1.2);
  ctx.ambient.dust(W / 2 + 1.8, 0, 2, 10);
  ctx.ambient.dust(-W / 2 - 1.8, 0, 2, 10);
  // haze from cooking fires somewhere behind the west roofs
  ctx.ambient.smokeColumn(-W / 2 - 3.5, 5.0, -H / 2 - 6.5, { shade: 0.55, size: 1.3, rate: 2.5 });
}

export const MARKET_SET: ArenaSet = {
  build,
  // the market's own traders and shoppers carry the scene; fewer static spectators, none north
  crowd: 0.6,
  crowdEdges: { north: false, east: true, west: true, south: true },
};
