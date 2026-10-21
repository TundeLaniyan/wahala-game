import { buildingRows, thin } from './shared';
import type { ArenaTheme, DebrisKind, DressContext, Placement } from './types';

/**
 * Stalls, parasols and fabric racks packed around the trading floor, with two-storey shop
 * buildings behind the streets. Heavy pieces are thinned on weaker devices.
 */
function dressMarket(ctx: DressContext): void {
  const { layout, rng } = ctx;
  const W = layout.width;
  const H = layout.height;
  const jitter = (): number => (rng() - 0.5) * 0.16;

  // back (north) row: stalls facing the floor with parasols between them
  const stalls: Placement[] = [];
  const umbrellas: Placement[] = [];
  const racks: Placement[] = [];
  for (let x = -W / 2 + 0.6; x < W / 2; x += 3.3) {
    stalls.push({ x, z: -H / 2 - 2.25, ry: jitter() });
    umbrellas.push({ x: x + 1.65, z: -H / 2 - 1.75, ry: rng() * 6.28 });
  }
  // east and west: stalls along the side streets, parasols and fabric racks in the gaps
  for (let z = -H / 2 + 0.4; z < H / 2 + 1; z += 2.9) {
    stalls.push({ x: W / 2 + 2.35, z, ry: -Math.PI / 2 + jitter() });
    stalls.push({ x: -W / 2 - 2.35, z: z + 1.2, ry: Math.PI / 2 + jitter() });
    umbrellas.push({ x: W / 2 + 1.95, z: z + 1.45, ry: rng() * 6.28 });
    racks.push({ x: -W / 2 - 1.75, z: z - 0.05, ry: Math.PI / 2 + jitter() });
  }
  // camera side corners: parasols over the traders' tables (low enough to keep the near row visible)
  umbrellas.push(
    { x: -W / 2 - 1.5, z: H / 2 + 1.9, ry: 0.4 },
    { x: W / 2 + 1.6, z: H / 2 + 1.8, ry: 2.2 },
    { x: -W / 2 + 3.4, z: H / 2 + 2.5, ry: 1.3 },
    { x: W / 2 - 3.0, z: H / 2 + 2.5, ry: 4.0 },
  );
  racks.push({ x: W / 2 + 1.8, z: -H / 2 - 1.35, ry: -0.6 }, { x: -2.6, z: H / 2 + 2.4, ry: 0.1 });
  ctx.instance('mkt_stall', thin(stalls, Math.max(0.6, ctx.density)));
  ctx.instance('mkt_umbrella', thin(umbrellas, Math.max(0.6, ctx.density)));
  ctx.instance('mkt_fabric_rack', racks);

  // market shop buildings behind the streets
  buildingRows(ctx, ['mkt_building_a', 'mkt_building_b'], [0x3f8fc9, 0xe0614a, 0x5aa86a, 0xe8b23c, 0xc77bb7]);

  // street furniture shared with Lagos streets: lamps and utility poles keep the city context
  ctx.instance('env_lamp', [
    { x: -W / 2 - 1.2, z: -H / 2 - 1.1, ry: 0.4 },
    { x: W / 2 + 1.2, z: -H / 2 - 1.1, ry: -0.4 },
  ]);
  ctx.instance('env_poles', [
    { x: -W / 2 - 4.0, z: 0.4, ry: Math.PI / 2 },
    { x: W / 2 + 4.0, z: -0.8, ry: -Math.PI / 2 },
  ]);
  ctx.instance('prop_soft_sacks', [
    { x: -W / 2 - 1.3, z: H / 2 + 1.05, ry: 0.7 },
    { x: W / 2 + 1.25, z: H / 2 + 0.95, ry: 2.1 },
  ]);
}

function marketDebris(variant: string): DebrisKind {
  if (variant.includes('fabric')) return 'fabric';
  if (variant.includes('produce')) return 'produce';
  if (variant.includes('bucket')) return 'buckets';
  if (variant.includes('basket')) return 'baskets';
  if (variant.includes('sack')) return 'sacks';
  if (variant.includes('carton')) return 'cartons';
  if (variant.includes('keg')) return 'kegs';
  return 'crate';
}

/**
 * Balogun Market: terracotta interlocking pavers, painted masonry stall posts and trading counters,
 * fabric bolts, produce baskets and plastic basins to smash, stalls and striped parasols packed around
 * the floor, colourful shop buildings and multicoloured bunting; a paler, hazier midday sky.
 */
export const MARKET_THEME: ArenaTheme = {
  id: 'balogunMarket',
  sky: 0xf0d3a4,
  fog: [36, 80],
  floor: 'market',
  floorFallback: '#a8664a',
  floorTint: 0xe2d8d0,
  ground: 0x5d4f45,
  slab: 0xa59a8e,
  hardIsolated: ['mkt_hard_post'],
  hardJoined: 'mkt_hard_counter',
  hardJoinedHeight: 1.18,
  soft: {
    mkt_soft_fabric: 4,
    mkt_soft_produce: 4,
    mkt_soft_buckets: 3,
    mkt_soft_baskets: 3,
    prop_soft_sacks: 2,
    prop_soft_cartons: 1,
  },
  debris: marketDebris,
  walls: ['mkt_wall', 'mkt_wall_b'],
  wallCorner: 'mkt_wall_corner',
  platform: null,
  bunting: [0xe8352f, 0xffd23a, 0x2f7de1, 0x1fa64a, 0xff6fb1],
  sign: { text: 'BALOGUN MARKET', color: '#ffffff', background: '#1f5fae' },
  dress: dressMarket,
};
