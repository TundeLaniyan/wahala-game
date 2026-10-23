/**
 * Balogun Market: a dense, mature Lagos Island trading district. Weathered shophouses press in on
 * narrow streets; metal-framed stalls under rusted corrugated sheets and patched tarpaulins sell
 * bolts of dyed cloth, enamel basins and sacks of grain; handcarts and wheelbarrows wait by the
 * walls; traders bargain and argue, a fight breaks out on the east lane, and smoke drifts from a
 * buka's cooking fire. Colour comes from the goods, faded and dusty, not from the buildings.
 */
import { CylinderGeometry, Group, Mesh } from 'three';
import { box, cyl, mat } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { corrugatedRoof, shophouseRows, streetDressing } from './shared';

/** Faded dyed cloth: indigo adire, rust, ochre, bottle green, maroon, washed teal. */
const CLOTH = [0x2e3b5c, 0x8a4a2a, 0xa8823a, 0x2f5a3e, 0x6a2a30, 0x3f6a6a, 0x7a6a4a, 0x4a3a5a];

/** A metal-framed market stall: counter, goods, a hanging cloth rack and a rusted sheet roof. */
function stall(ctx: SetContext, x: number, z: number, ry: number, i: number, tall = true): void {
  const g = new Group();
  const wood = mat(0x4e3a28, { roughness: 0.95 });
  const pipe = mat(0x4a4844, { roughness: 0.55, metalness: 0.6 });
  // frame
  for (const sx of [-1.0, 1.0])
    for (const sz of [-0.45, 0.45]) g.add(box(0.05, tall ? 2.1 : 1.2, 0.05, pipe, sx, tall ? 1.05 : 0.6, sz));
  g.add(box(2.1, 0.62, 0.8, wood, 0, 0.31, 0.12)); // counter
  g.add(box(2.16, 0.04, 0.86, mat(0x3a2c20, { roughness: 1 }), 0, 0.63, 0.12));
  // folded cloth stacks and bolts on the counter
  for (let k = 0; k < 5; k++) {
    const c = CLOTH[(i * 3 + k) % CLOTH.length]!;
    g.add(box(0.3, 0.12 + (k % 3) * 0.05, 0.38, mat(c, { roughness: 0.9 }), -0.8 + k * 0.4, 0.71, 0.1));
  }
  if (tall) {
    // cloth hung from the back rail
    g.add(box(2.0, 0.04, 0.04, pipe, 0, 1.9, -0.42));
    for (let k = 0; k < 6; k++) {
      const c = CLOTH[(i + k * 2) % CLOTH.length]!;
      g.add(box(0.28, 0.9 + (k % 2) * 0.25, 0.03, mat(c, { roughness: 0.9 }), -0.85 + k * 0.34, 1.4, -0.42));
    }
  }
  // enamel basins stacked beside it, a sack, a stool
  const basin = mat(i % 2 ? 0x8a8a7e : 0x6a7a6a, { roughness: 0.45, metalness: 0.2 });
  for (let b = 0; b < 3; b++) g.add(cyl(0.26 - b * 0.02, 0.18, 0.14, basin, 1.3, 0.07 + b * 0.13, 0.2, 10));
  g.add(box(0.34, 0.42, 0.26, mat(0x8a7a5a, { roughness: 1 }), -1.32, 0.21, 0.25));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
  if (tall)
    corrugatedRoof(ctx.statics, x, 2.12, z, 2.5, 1.5, [0x5a5a54, 0x6a4a36, 0x3e4e5e][i % 3]!, 0.12, ry);
}

/** A wooden handcart / wheelbarrow loaded with sacks or yams. */
function cart(ctx: SetContext, x: number, z: number, ry: number, load: number): void {
  const g = new Group();
  const wood = mat(0x5a4430, { roughness: 0.95 });
  const iron = mat(0x2e2c2a, { roughness: 0.6, metalness: 0.5 });
  g.add(box(1.3, 0.1, 0.7, wood, 0, 0.42, 0));
  g.add(box(1.3, 0.25, 0.04, wood, 0, 0.56, 0.34), box(1.3, 0.25, 0.04, wood, 0, 0.56, -0.34));
  g.add(box(0.06, 0.06, 0.9, wood, -0.9, 0.5, 0.2), box(0.06, 0.06, 0.9, wood, -0.9, 0.5, -0.2));
  const wheel = new Mesh(new CylinderGeometry(0.3, 0.3, 0.08, 14), iron);
  wheel.rotation.x = Math.PI / 2;
  wheel.position.set(0.25, 0.3, 0.4);
  const w2 = wheel.clone();
  w2.position.z = -0.4;
  g.add(wheel, w2);
  for (let k = 0; k < 4; k++)
    g.add(
      box(
        0.36,
        0.26,
        0.28,
        mat(load ? 0x8c7a56 : 0x6a4a2e, { roughness: 1 }),
        -0.35 + k * 0.24,
        0.62 + (k % 2) * 0.1,
        (k % 2) * 0.12 - 0.06,
      ),
    );
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
}

function build(ctx: SetContext): void {
  const { W, H, statics } = ctx;
  const north = -H / 2;

  // narrow streets: the shophouses press in
  shophouseRows(ctx, { north: true, east: true, west: true, seed: 2, close: 0.45 });

  // two rows of stalls along the north lane
  [-5.4, -2.7, 0, 2.7, 5.4].forEach((x, i) => stall(ctx, x, north - 1.55, 0, i));
  // stalls along the east and west lanes (facing the arena)
  for (let i = 0; i < 3; i++) {
    const z = north + 1.8 + i * 3.3;
    stall(ctx, W / 2 + 2.25, z, -Math.PI / 2, i + 5, i < 2);
    stall(ctx, -W / 2 - 2.25, z, Math.PI / 2, i + 2, i < 2);
  }
  // patched tarpaulins strung over the side walkways (faded blue / grey, sagging)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      corrugatedRoof(
        statics,
        side * (W / 2 + 1.25),
        2.45,
        north + 1.5 + i * 3.3,
        1.5,
        2.9,
        [0x3e5266, 0x55504a, 0x5a3e30][i]!,
        side * 0.18,
        Math.PI / 2,
      );
    }
  }

  // goods everywhere: sacks, crates of drinks, kegs, carts
  ctx.instance('prop_soft_sacks', [
    { x: -W / 2 + 3.8, z: north - 0.85, ry: 0.3 },
    { x: 1.3, z: north - 0.9, ry: -0.2 },
    { x: W / 2 - 3.6, z: north - 0.85, ry: 0.8 },
    { x: -W / 2 - 1.3, z: H / 2 + 1.25, ry: 0.4, sx: 0.8, sy: 0.7, sz: 0.8 },
    { x: W / 2 + 1.3, z: H / 2 + 1.25, ry: -0.5, sx: 0.8, sy: 0.7, sz: 0.8 },
  ]);
  ctx.instance('prop_soft_kegs', [
    { x: -W / 2 + 0.6, z: north - 0.8, ry: 0.2 },
    { x: W / 2 - 0.6, z: north - 0.8, ry: -0.4 },
  ]);
  ctx.instance('prop_soft_cartons', [{ x: -1.4, z: north - 0.85, ry: 0.1, sx: 0.8, sy: 0.8, sz: 0.8 }]);
  cart(ctx, W / 2 + 1.45, north + 0.4, Math.PI / 2 + 0.2, 1);
  cart(ctx, -W / 2 - 1.5, north + 7.2, -Math.PI / 2 - 0.3, 0);
  cart(ctx, 3.9, north - 3.0, 0.1, 1);

  // the buka: a smoky cooking fire with a black pot, under the north-east shophouses
  const pot = mat(0x1e1c1a, { roughness: 0.5, metalness: 0.6 });
  statics.add(cyl(0.32, 0.28, 0.4, pot, W / 2 + 1.6, STREET + 0.55, north - 2.6, 12));
  statics.add(box(0.8, 0.35, 0.8, mat(0x3a3430, { roughness: 1 }), W / 2 + 1.6, STREET + 0.17, north - 2.6));
  ctx.ambient.fire(W / 2 + 1.6, STREET + 0.35, north - 2.6, 0.35);
  ctx.ambient.smokeColumn(W / 2 + 1.6, STREET + 0.9, north - 2.6, { shade: 0.75, size: 0.9, rate: 5 });
  // smoke from somewhere behind the west roofs
  ctx.ambient.smokeColumn(-W / 2 - 5.5, 4.5, north - 1.0, { shade: 0.5, size: 1.2, rate: 3 });

  // kekes waiting at the market edge, an okada
  ctx.vehicles(
    'keke',
    [
      { x: -W / 2 - 1.6, z: H / 2 + 2.3, ry: Math.PI * 0.85 },
      { x: W / 2 + 3.1, z: H / 2 + 0.1, ry: Math.PI },
    ],
    { idle: true },
  );
  ctx.vehicles('danfo', [{ x: -W / 2 - 3.0, z: north - 2.4, ry: Math.PI * 0.42 }], { idle: true });
  ctx.vehicles('okada', [{ x: W / 2 + 1.5, z: north + 4.9, ry: 0.4 }]);

  streetDressing(ctx);

  // --- street life: trading, bargaining, an argument, a fight with a small crowd
  const L = ctx.life;
  L.add({ kind: 'seller', x: -2.7, z: north - 0.75, yaw: 0 });
  L.add({ kind: 'seller', x: 2.7, z: north - 0.75, yaw: 0 });
  L.add({ kind: 'argue', x: 0.0, z: north - 3.1, yaw: Math.PI / 2 });
  L.add({ kind: 'fight', x: W / 2 + 2.6, z: north + 5.0, yaw: 0.2 });
  L.add({ kind: 'onlooker', x: W / 2 + 3.4, z: north + 4.1, yaw: -0.8 });
  L.add({ kind: 'onlooker', x: W / 2 + 1.8, z: north + 6.0, yaw: 2.6 });
  L.add({ kind: 'seller', x: -W / 2 - 1.45, z: north + 1.8, yaw: Math.PI / 2 });
  L.add({ kind: 'walker', x: -6, z: north - 2.7, yaw: 0, toX: 6, toZ: north - 2.7 });
  L.add({ kind: 'walker', x: W / 2 + 3.4, z: H / 2 + 1, yaw: 0, toX: W / 2 + 3.4, toZ: north - 1 });
  L.add({
    kind: 'conductor',
    x: -W / 2 - 1.6,
    z: north - 1.3,
    yaw: 0.6,
    toX: -W / 2 - 1.6,
    toZ: north + 0.6,
  });

  ctx.ambient.dust(0, north - 2, 12, 2);
  ctx.ambient.dust(-W / 2 - 2.5, 0, 2.5, 9);

  // low goods along the camera side (under the south wall height)
  const a = mat(0x6a4c34, { roughness: 0.9 });
  const b = mat(0x3a2c22, { roughness: 0.9 });
  let k = 0;
  for (let x = -W / 2 - 0.6; x < W / 2 + 0.7; x += 0.6)
    statics.add(box(0.58, 0.1, 0.22, k++ % 2 ? a : b, x, 0.05, H / 2 + 0.62));
}

export const MARKET_SET: ArenaSet = {
  build,
  crowd: 0.9,
  crowdEdges: { north: true, east: true, west: true, south: true },
};
