import { Vector3 } from 'three';
import { bakeModel } from '../assets/merge';
import { assets } from '../assets/library';
import { createVehicleModel } from '../assets/vehicles';
import { buildingRows, thin } from './shared';
import type { ArenaTheme, DebrisKind, DressContext, Placement } from './types';

/** Parked buses are drawn larger than the playing-field buses so the lot feels crowded and the arena small. */
const PARKED_BUS_SCALE = 1.3;

/** Ranks of parked danfos, terminal shelters, route signs, jersey barriers and the loading-bay booth. */
function dressBusPark(ctx: DressContext): void {
  const { layout, rng } = ctx;
  const W = layout.width;
  const H = layout.height;

  // parked danfos in the bays around the lot (modelled buses face +Z)
  let buses: Placement[] = [];
  const bus = (x: number, z: number, ry: number): void => {
    buses.push({ x, z, ry, sx: PARKED_BUS_SCALE, sy: PARKED_BUS_SCALE, sz: PARKED_BUS_SCALE });
  };
  for (let i = 0; i < 5; i++)
    bus(W / 2 + 2.1 + (i % 2) * 0.1, -H / 2 + 1.2 + i * 2.35, Math.PI + (rng() - 0.5) * 0.1);
  for (let i = 0; i < 4; i++) bus(-W / 2 - 2.2, -H / 2 + 0.8 + i * 2.8, (rng() - 0.5) * 0.1);
  bus(-W / 2 + 2.3, -H / 2 - 2.0, Math.PI / 2 + (rng() - 0.5) * 0.1);
  bus(W / 2 - 2.0, -H / 2 - 2.0, Math.PI / 2 + (rng() - 0.5) * 0.1);
  bus(W / 2 - 3.2, H / 2 + 2.2, -Math.PI / 2);
  buses = thin(buses, ctx.density);
  const parkedId = ['env_danfo_parked', 'veh_danfo'].find((id) => assets.has(id));
  if (parkedId) ctx.instance(parkedId, buses);
  else {
    const model = bakeModel(createVehicleModel('danfo').root);
    for (const b of buses) {
      const copy = model.clone();
      copy.position.set(b.x, 0, b.z);
      copy.rotation.y = b.ry - Math.PI / 2; // procedural buses face +X
      copy.scale.copy(new Vector3(PARKED_BUS_SCALE, PARKED_BUS_SCALE, PARKED_BUS_SCALE));
      ctx.statics.add(copy);
    }
  }

  // the terminal itself: a waiting shelter and the loading-bay booth on the back street
  ctx.instance('bp_shelter', [
    { x: -1.6, z: -H / 2 - 2.15, ry: 0 },
    { x: 2.2, z: -H / 2 - 2.15, ry: 0 },
  ]);
  ctx.instance('bp_booth', [{ x: 5.0, z: -H / 2 - 2.2, ry: 0.06 }]);
  ctx.instance('bp_sign', [
    { x: -W / 2 - 1.15, z: -H / 2 - 1.25, ry: 0.5 },
    { x: W / 2 + 1.15, z: -H / 2 - 1.25, ry: -0.5 },
    { x: -W / 2 - 1.2, z: H / 2 + 1.3, ry: 2.6 },
  ]);
  // jersey barriers separating the bus bays from the street
  const barriers: Placement[] = [];
  for (let i = 0; i < 4; i++) {
    barriers.push({ x: W / 2 + 3.05, z: -H / 2 + 0.6 + i * 3.1, ry: Math.PI / 2 });
    barriers.push({ x: -W / 2 - 3.05, z: -H / 2 + 1.9 + i * 2.8, ry: Math.PI / 2 });
  }
  barriers.push({ x: -W / 2 + 4.5, z: H / 2 + 2.0, ry: 0.1 }, { x: 0.6, z: H / 2 + 2.1, ry: -0.05 });
  ctx.instance('bp_barrier', barriers);

  buildingRows(ctx, assets.loadedIds('env_building_'), [0xd9a766, 0xc98b5a, 0xe0c07a, 0xb9745c, 0x9fb7a4]);

  // street dressing around the lot (kiosks, lamps, utility poles, tyre stacks, barrels)
  ctx.instance('env_kiosk', [
    { x: -W / 2 + 2.2, z: -H / 2 - 3.6, ry: 0, sx: 0.8, sy: 0.8, sz: 0.8 },
    { x: 0.3, z: -H / 2 - 3.7, ry: 0.05, sx: 0.8, sy: 0.8, sz: 0.8 },
    { x: -W / 2 - 3.3, z: H / 2 + 2.6, ry: Math.PI / 2, sx: 0.8, sy: 0.8, sz: 0.8 },
  ]);
  ctx.instance('env_shopsign', [
    { x: -W / 2 - 1.2, z: H / 2 + 2.7, ry: 0.35 },
    { x: W / 2 + 1.3, z: H / 2 + 2.5, ry: Math.PI - 0.35 },
    { x: W / 2 + 3.1, z: -H / 2 - 2.9, ry: -Math.PI / 2 },
  ]);
  ctx.instance('env_lamp', [
    { x: -W / 2 - 1.9, z: -H / 2 - 1.8, ry: 0.4 },
    { x: W / 2 + 1.9, z: -H / 2 - 1.8, ry: -0.4 },
    { x: -W / 2 - 1.9, z: H / 2 + 1.0, ry: 2.6 },
    { x: W / 2 + 1.9, z: H / 2 + 1.0, ry: -2.6 },
  ]);
  ctx.instance('env_poles', [
    { x: -W / 2 - 4.0, z: 1.0, ry: Math.PI / 2 },
    { x: W / 2 + 4.0, z: -1.5, ry: -Math.PI / 2 },
  ]);
  ctx.instance('env_tyrestack', [
    { x: -W / 2 - 1.4, z: H / 2 + 1.9, ry: 0.5 },
    { x: W / 2 + 1.5, z: H / 2 + 1.8, ry: -0.4 },
    { x: -3.6, z: -H / 2 - 2.6, ry: 1.2 },
    { x: -W / 2 - 1.3, z: -H / 2 - 1.1, ry: 0.2 },
    { x: W / 2 + 1.3, z: -H / 2 - 1.2, ry: 2.2 },
  ]);
  ctx.instance('env_barrel', [
    { x: -W / 2 + 4.0, z: H / 2 + 1.7, ry: 0.3 },
    { x: 3.9, z: -H / 2 - 2.6, ry: 2.0 },
  ]);
}

function busParkDebris(variant: string): DebrisKind {
  if (variant.includes('tyre')) return 'tyres';
  if (variant.includes('sack')) return 'sacks';
  if (variant.includes('barrier')) return 'barrier';
  if (variant.includes('carton')) return 'cartons';
  if (variant.includes('keg')) return 'kegs';
  return 'crate';
}

/**
 * Danfo Bus Park: pale precast concrete pillars and walls, a grey concrete-slab floor, wooden crates,
 * hazard barricades and tyre stacks, ranks of yellow danfos, shelters and route signs; warm dusk light.
 */
export const BUS_PARK_THEME: ArenaTheme = {
  id: 'danfoBusPark',
  sky: 0xe3b985,
  fog: [38, 85],
  floor: 'floor',
  floorFallback: '#a39d93',
  floorTint: 0xffffff,
  ground: 0x4c4741,
  slab: 0xffffff,
  hardIsolated: ['prop_pillar_a', 'prop_pillar_b', 'prop_pillar_c'],
  hardJoined: null,
  hardJoinedHeight: 1,
  // mostly warm wooden crates (the reference's dominant breakable), then barricades and tyre stacks,
  // with market goods only as accents so the field reads as one coherent bus-park clutter
  soft: {
    prop_soft_crate: 4,
    prop_soft_crate_b: 3,
    prop_soft_crates: 4,
    prop_soft_barrier: 3,
    prop_soft_tyres: 3,
    prop_soft_sacks: 2,
    prop_soft_kegs: 1,
    prop_soft_cartons: 1,
  },
  debris: busParkDebris,
  walls: ['env_wall', 'env_wall_b', 'env_wall_c', 'env_wall_d'],
  wallCorner: 'env_wall_corner',
  platform: 'env_bleacher',
  bunting: [0x1fa64a, 0xffffff, 0x1fa64a],
  sign: { text: 'DANFO BUS PARK', color: '#ffc21a', background: '#1a1208' },
  dress: dressBusPark,
};
