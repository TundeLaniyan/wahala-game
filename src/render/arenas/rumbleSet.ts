/**
 * City Rumble surroundings (presentation only). The board is a 41 x 31 Lagos district, so the set is
 * deliberately cheap: instanced models (shophouses, lamps, parked traffic), a handful of merged static
 * meshes (kerbs, rooftops) and a few street-life actors. The avenues visibly run on past the board's
 * edges into the rest of the city, where traffic queues; the south (camera) side stays low.
 *
 * The 3 x 3 concrete buildings inside the blocks get a flat roof at pillar height with a parapet, so
 * each reads as one squat building rather than nine posts (no taller than the pillars: nothing hides a
 * lane).
 */
import { getArena } from '../../sim';
import { box, mat } from '../assets/helpers';
import { assets } from '../assets/library';
import type { Placement, SetContext } from './common';
import { STREET } from './common';
import { corrugatedRoof, shophouseRows, streetDressing } from './shared';

/** Top of a drawn pillar (ArenaView draws concrete about one tile tall). */
const ROOF_Y = 0.98;

/** Centres (tile x, y) of the 3 x 3 concrete buildings: tiles whose eight neighbours are concrete too. */
export function buildingCentres(layout: readonly string[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 1; y < layout.length - 1; y++) {
    for (let x = 1; x < layout[0]!.length - 1; x++) {
      let all = true;
      for (let dy = -1; dy <= 1 && all; dy++)
        for (let dx = -1; dx <= 1 && all; dx++) if (layout[y + dy]![x + dx] !== '#') all = false;
      if (all) out.push({ x, y });
    }
  }
  return out;
}

/** Tile columns / rows that are avenue centre lines. */
function avenueLines(layout: readonly string[]): { rows: number[]; cols: number[] } {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let y = 1; y < layout.length - 1; y++)
    if ([layout[y - 1], layout[y], layout[y + 1]].every((r) => r!.split('').every((c) => c === '=')))
      rows.push(y);
  for (let x = 1; x < layout[0]!.length - 1; x++)
    if (layout.every((r) => r[x - 1] === '=' && r[x] === '=' && r[x + 1] === '=')) cols.push(x);
  return { rows, cols };
}

export function buildRumbleSet(ctx: SetContext): void {
  const { W, H, statics, rng } = ctx;
  const layout = getArena('cityRumble').layout;
  const wx = (x: number): number => x - W / 2 + 0.5;
  const wz = (y: number): number => y - H / 2 + 0.5;
  const north = -H / 2;
  const south = H / 2;

  // --- the city around: shophouses on three sides, lamps and poles
  shophouseRows(ctx, { north: true, east: true, west: true, seed: 3, close: -0.2 });
  streetDressing(ctx);
  const lamps: Placement[] = [];
  for (let x = -W / 2 + 4; x < W / 2 - 2; x += 7.5) lamps.push({ x, z: north - 1.7, ry: 0 });
  for (let z = north + 5; z < south - 2; z += 7.5) {
    lamps.push({ x: -W / 2 - 1.8, z, ry: Math.PI / 2 });
    lamps.push({ x: W / 2 + 1.8, z, ry: -Math.PI / 2 });
  }
  ctx.instance('env_lamp', lamps);

  // --- the avenues run on into the city: queued traffic just beyond the board's edges
  const { rows, cols } = avenueLines(layout);
  const danfos: Placement[] = [];
  const taxis: Placement[] = [];
  const kekes: Placement[] = [];
  for (const c of cols) {
    // north: buses nose towards the board (they are the traffic that sweeps the avenues)
    danfos.push({ x: wx(c) - 0.75, z: north - 2.6, ry: 0 });
    taxis.push({ x: wx(c) + 0.85, z: north - 5.2, ry: Math.PI });
  }
  for (const r of rows) {
    danfos.push({ x: -W / 2 - 3.0, z: wz(r) - 0.6, ry: Math.PI / 2 });
    taxis.push({ x: W / 2 + 2.8, z: wz(r) + 0.7, ry: -Math.PI / 2 });
    kekes.push({ x: W / 2 + 5.2, z: wz(r) - 0.6, ry: -Math.PI / 2 });
  }
  ctx.vehicles('danfo', danfos, { idle: true });
  ctx.vehicles('taxi', taxis);
  ctx.vehicles('keke', kekes);
  // the camera side stays low: okadas and a keke parked along the kerb
  ctx.vehicles('okada', [
    { x: -W / 2 + 3.5, z: south + 1.25, ry: 1.4 },
    { x: -W / 2 + 4.4, z: south + 1.3, ry: 1.5 },
    { x: W / 2 - 6.0, z: south + 1.25, ry: -1.5 },
  ]);

  // --- a burnt-out taxi and burning tyres in the north-west corner, barrels and tyre stacks
  ctx.wreck('taxi', { x: -W / 2 - 3.2, z: north - 1.6, ry: Math.PI * 0.3, rz: 0.05 });
  ctx.ambient.fire(W / 2 + 2.2, STREET + 0.4, north - 1.0, 0.7);
  ctx.instance('env_tyrestack', [
    { x: W / 2 + 2.2, z: north - 1.0, ry: 0.4, sx: 0.9, sy: 0.5, sz: 0.9 },
    { x: -W / 2 - 1.9, z: wz(15), ry: 0.2 },
    { x: W / 2 + 1.9, z: wz(25), ry: 1.1 },
  ]);
  ctx.instance('env_barrel', [
    { x: -W / 2 - 1.5, z: wz(4), ry: 0.3 },
    { x: -W / 2 - 1.6, z: wz(5), ry: 1.2 },
    { x: W / 2 + 1.5, z: wz(7), ry: 0.7 },
  ]);
  if (assets.has('env_kiosk')) {
    ctx.instance('env_kiosk', [
      { x: -W / 2 - 3.3, z: wz(26), ry: Math.PI / 2, sx: 0.85, sy: 0.85, sz: 0.85 },
      { x: W / 2 + 3.4, z: wz(13), ry: -Math.PI / 2, sx: 0.85, sy: 0.85, sz: 0.85 },
    ]);
  }

  // --- low kerb along the camera side (never taller than the south wall)
  const kerbA = mat(0x8a7a4a, { roughness: 0.9 });
  const kerbB = mat(0x2c2924, { roughness: 0.9 });
  let k = 0;
  for (let x = -W / 2 - 0.6; x < W / 2 + 0.7; x += 0.6)
    statics.add(box(0.58, 0.1, 0.22, k++ % 2 ? kerbA : kerbB, x, 0.05, south + 0.62));

  // --- rooftops on the 3 x 3 concrete buildings: slab, parapet, the odd corrugated shed or tank
  const slab = mat(0x8c8476, { roughness: 0.95 });
  const parapet = mat(0x6e675c, { roughness: 0.95 });
  const tank = mat(0x2f3a48, { roughness: 0.6, metalness: 0.2 });
  buildingCentres(layout).forEach((b, i) => {
    const x = wx(b.x);
    const z = wz(b.y);
    statics.add(box(2.9, 0.12, 2.9, slab, x, ROOF_Y, z));
    statics.add(box(2.9, 0.16, 0.12, parapet, x, ROOF_Y + 0.14, z - 1.39));
    statics.add(box(2.9, 0.16, 0.12, parapet, x, ROOF_Y + 0.14, z + 1.39));
    statics.add(box(0.12, 0.16, 2.9, parapet, x - 1.39, ROOF_Y + 0.14, z));
    statics.add(box(0.12, 0.16, 2.9, parapet, x + 1.39, ROOF_Y + 0.14, z));
    // kept low and on the north half of the roof, so a player south of the building stays visible
    if (i % 3 === 0) corrugatedRoof(statics, x - 0.4, ROOF_Y + 0.42, z - 0.6, 1.3, 1.0, 0x6a4c36, 0.1);
    else if (i % 3 === 1) statics.add(box(0.55, 0.36, 0.55, tank, x + 0.6, ROOF_Y + 0.24, z - 0.7));
  });

  // --- street life at the avenue mouths (a handful only: the board is big and mostly off screen)
  const L = ctx.life;
  if (cols[0] !== undefined) L.add({ kind: 'conductor', x: wx(cols[0]) + 1.6, z: north - 1.3, yaw: 0.1 });
  if (rows[0] !== undefined)
    L.add({ kind: 'seller', x: W / 2 + 2.3, z: wz(rows[0]) - 2.1, yaw: -Math.PI / 2 });
  L.add({ kind: 'argue', x: -W / 2 - 1.8, z: wz(8), yaw: 0.2 });
  L.add({ kind: 'onlooker', x: -W / 2 - 1.5, z: wz(9.5), yaw: 0.3 });
  L.add({ kind: 'walker', x: -W / 2 + 6, z: north - 3.4, yaw: 0, toX: W / 2 - 6, toZ: north - 3.4 });

  // --- atmosphere: dust drifting along the avenues
  for (const r of rows) ctx.ambient.dust(0, wz(r), W * 0.45, 1.2);
  void rng;
}
