/**
 * Lekki Roadworks: a night-shift construction zone, nothing like the bus park. A half-built
 * concrete frame bristling with rebar and a tower crane fill the north; scaffolding towers and a
 * corrugated site hoarding replace the shophouses on the east and west; an excavator, a road
 * roller, sand and gravel heaps, rebar bundles and concrete pipes sit in the cut; floodlight masts
 * and sodium work lamps light raw cement and wet asphalt. Workers in hi-vis dig, stamp and haul;
 * a bitumen boiler smokes; the Lekki towers glow behind it all.
 */
import { Group } from 'three';
import { box, cyl, mat } from '../assets/helpers';
import { addLekkiSite } from '../assets/arenaSets';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { corrugatedRoof } from './shared';

/** A scaffold tower: standards, ledgers, braces and boarded lifts. */
function scaffold(
  ctx: SetContext,
  x: number,
  z: number,
  w: number,
  d: number,
  lifts: number,
  ry: number,
): void {
  const g = new Group();
  const tube = mat(0x8a8a86, { roughness: 0.45, metalness: 0.7 });
  const board = mat(0x6a5236, { roughness: 1 });
  const lift = 1.7;
  const h = lifts * lift;
  for (const sx of [-w / 2, w / 2]) {
    for (let k = 0; k <= Math.round(d / 1.6); k++) {
      const zz = -d / 2 + (k * d) / Math.round(d / 1.6);
      g.add(box(0.05, h + 0.4, 0.05, tube, sx, STREET + (h + 0.4) / 2, zz));
    }
  }
  for (let l = 1; l <= lifts; l++) {
    const y = STREET + l * lift;
    for (const sx of [-w / 2, w / 2]) g.add(box(0.045, 0.045, d, tube, sx, y, 0));
    g.add(box(w, 0.04, 0.04, tube, 0, y, -d / 2), box(w, 0.04, 0.04, tube, 0, y, d / 2));
    g.add(box(w - 0.05, 0.04, d - 0.05, board, 0, y - 0.04, 0));
    // diagonal brace on the outer face
    const brace = box(0.035, lift * 1.35, 0.035, tube, -w / 2, y - lift / 2, 0);
    brace.rotation.x = 0.85 * (l % 2 ? 1 : -1);
    g.add(brace);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
}

/** Orange / white water-filled barriers in a line from (x0, z) to (x1, z). */
function barrierLine(ctx: SetContext, x0: number, x1: number, z: number, ry = 0): void {
  const orange = mat(0xb45a1e, { roughness: 0.6 });
  const white = mat(0xb8b4aa, { roughness: 0.6 });
  const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 1.05));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const piece = box(0.95, 0.42, 0.32, i % 2 ? orange : white, 0, 0.21, 0);
    const holder = new Group();
    holder.add(piece);
    holder.position.set(x0 + (x1 - x0) * t, 0, z);
    holder.rotation.y = ry;
    ctx.statics.add(holder);
  }
}

/** A road roller: drum, cab frame, engine block. */
function roller(ctx: SetContext, x: number, z: number, ry: number): void {
  const g = new Group();
  const yellow = mat(0xa27a1c, { roughness: 0.55, metalness: 0.25 });
  const dark = mat(0x1d1f24, { roughness: 0.6, metalness: 0.4 });
  const drum = cyl(0.55, 0.55, 1.5, mat(0x4a4a48, { roughness: 0.5, metalness: 0.6 }), 0.9, 0.55, 0, 18);
  drum.rotation.x = Math.PI / 2;
  g.add(drum);
  const rear = cyl(0.45, 0.45, 1.5, dark, -1.0, 0.45, 0, 16);
  rear.rotation.x = Math.PI / 2;
  g.add(rear);
  g.add(box(1.7, 0.7, 1.3, yellow, -0.3, 1.0, 0));
  g.add(box(0.06, 1.0, 0.06, dark, -0.7, 1.85, 0.55), box(0.06, 1.0, 0.06, dark, -0.7, 1.85, -0.55));
  g.add(box(0.06, 1.0, 0.06, dark, 0.1, 1.85, 0.55), box(0.06, 1.0, 0.06, dark, 0.1, 1.85, -0.55));
  g.add(box(1.0, 0.07, 1.3, yellow, -0.3, 2.36, 0));
  g.position.set(x, STREET, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
}

function build(ctx: SetContext): void {
  const { W, H, statics, root } = ctx;
  const north = -H / 2;

  // the site to the north: frame, crane, excavator, heaps, pipes, floodlights, the Lekki skyline
  addLekkiSite(root, statics, W, H);

  // scaffolding and a half-built block on both sides instead of shophouses
  scaffold(ctx, -W / 2 - 4.2, -1.0, 1.4, 9.5, 3, 0);
  scaffold(ctx, W / 2 + 4.6, -2.5, 1.4, 7.0, 3, 0);
  const raw = mat(0x7c7872, { roughness: 1 });
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 6.0);
    for (let level = 0; level < 2; level++) {
      for (let z = north - 1; z < H / 2 + 3; z += 3)
        statics.add(box(0.3, 2.2, 0.3, raw, x, STREET + level * 2.2 + 1.1, z));
      statics.add(box(2.6, 0.2, H + 5, raw, x, STREET + (level + 1) * 2.2, 0));
    }
  }
  // corrugated site hoarding along the outer edge of the side streets
  for (const sx of [-1, 1]) {
    for (let z = north - 1.5; z < H / 2 + 2.5; z += 2.4)
      corrugatedRoof(statics, sx * (W / 2 + 3.25), 0.7, z, 2.4, 2.0, 0x4a5a4a, Math.PI / 2, Math.PI / 2);
  }
  // barrier lines closing the work zone
  barrierLine(ctx, -W / 2 + 0.8, -2.2, north - 1.25);
  barrierLine(ctx, 2.2, W / 2 - 0.8, north - 1.25);
  barrierLine(ctx, -W / 2 - 1.5, -W / 2 - 1.5 + 0.01, H / 2 + 1.25);

  // machinery and materials
  roller(ctx, W / 2 + 2.0, 2.0, Math.PI / 2 + 0.1);
  const rebar = mat(0x5a3a26, { roughness: 0.7, metalness: 0.5 });
  for (let i = 0; i < 12; i++) {
    const bar = cyl(
      0.025,
      0.025,
      4.5,
      rebar,
      -W / 2 - 1.8 + (i % 4) * 0.06,
      STREET + 0.08 + Math.floor(i / 4) * 0.06,
      north + 5.5,
      5,
    );
    bar.rotation.x = Math.PI / 2;
    statics.add(bar);
  }
  ctx.instance('env_barrel', [
    { x: -W / 2 - 2.1, z: -1.2, ry: 0.6 },
    { x: W / 2 + 2.1, z: -2.6, ry: 1.4 },
    { x: 0.6, z: north - 2.2, ry: 0.9 },
  ]);
  ctx.instance('prop_soft_barrier', [
    { x: -W / 2 - 1.7, z: H / 2 + 1.4, ry: 0.4 },
    { x: W / 2 + 1.7, z: H / 2 + 1.4, ry: -0.4 },
  ]);
  ctx.instance('env_tyrestack', [{ x: W / 2 + 1.6, z: north - 0.9, ry: 0.6 }]);

  // bitumen boiler smoking by the west scaffold, a fire in a drum where the night shift warms up
  statics.add(
    cyl(
      0.45,
      0.45,
      0.9,
      mat(0x1c1a18, { roughness: 0.5, metalness: 0.6 }),
      -W / 2 - 2.6,
      STREET + 0.45,
      3.0,
      12,
    ),
  );
  ctx.ambient.smokeColumn(-W / 2 - 2.6, STREET + 1.0, 3.0, { shade: 0.15, size: 0.9, rate: 4 });
  ctx.ambient.fire(W / 2 + 2.3, STREET + 0.75, north - 0.9, 0.45);
  ctx.ambient.dust(0, north - 2.5, 10, 2);

  // vehicles held outside the work zone: taxis, a keke, a crew danfo
  ctx.vehicles('taxi', [
    { x: -W / 2 - 2.0, z: H / 2 + 2.2, ry: Math.PI / 2 },
    { x: W / 2 + 2.6, z: H / 2 + 2.6, ry: -Math.PI / 2 },
  ]);
  ctx.vehicles('keke', [{ x: W / 2 + 2.4, z: north + 7.0, ry: Math.PI }]);
  ctx.vehicles('danfo', [{ x: 4.4, z: north - 2.4, ry: -Math.PI / 2 }], { idle: true });

  // --- the night shift
  const L = ctx.life;
  L.add({ kind: 'worker', x: -3.2, z: north - 2.4, yaw: 0, toX: -0.6, toZ: north - 2.4 });
  L.add({
    kind: 'worker',
    x: -W / 2 - 2.0,
    z: north + 4.0,
    yaw: Math.PI / 2,
    toX: -W / 2 - 2.0,
    toZ: north + 8.0,
  });
  L.add({ kind: 'worker', x: W / 2 + 2.3, z: north + 4.4, yaw: -Math.PI / 2 });
  L.add({ kind: 'worker', x: 1.6, z: north - 3.2, yaw: 0.4 });
  L.add({ kind: 'argue', x: W / 2 + 2.1, z: north + 7.9, yaw: 0.2 }); // the foreman and a driver
  L.add({ kind: 'onlooker', x: -W / 2 - 1.6, z: north + 1.6, yaw: Math.PI / 2 + 0.3 });
  L.add({ kind: 'walker', x: W / 2 + 3.0, z: H / 2 + 1.4, yaw: 0, toX: W / 2 + 3.0, toZ: north - 0.5 });
}

export const ROADWORKS_SET: ArenaSet = {
  build,
  // a working site draws only a few watchers, behind the barriers on the sides
  crowd: 0.45,
  crowdEdges: { north: false, east: true, west: true, south: true },
};
