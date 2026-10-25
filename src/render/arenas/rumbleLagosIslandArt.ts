/**
 * City Rumble V2 - Lagos Island Markets (presentation only; the grid and hazards are
 * `src/sim/arenas/rumbleLagosIsland.ts`). Balogun / Idumota at full trade on a hot, hazy afternoon.
 *
 * Floor: worn market concrete under red laterite dust; the one-tile aisles are darker and polished by
 * feet, with an open gutter along every stall front and goods mats spread at the counters (faded adire,
 * ankara prints, tarpaulin); the plazas are interlocking pavers around a painted kiosk ring; the access
 * roads along the north and south edges are patched tarmac with kerbs and drain grates.
 *
 * Surroundings: three- and four-storey commercial blocks crowd the north, east and west, their ground
 * floors a run of lock-up stalls under rusted sheets and patched tarps; banners and shop boards
 * (fictional textile houses) hang over the pavement; push trucks of bales, wheelbarrows of sachet water,
 * a buka's wood smoke, kekes and a Danfo waiting at the access roads, traders bargaining and porters
 * walking. Colour comes from the goods, faded and dusty. The camera side keeps low ground displays only.
 */
import type { ArenaLook } from '../arenaLook';
import { artRng } from '../textures';
import { box, mat } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { T, crack, noiseFill, stain } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { Kit } from './marketKit';
import { basinStack, buka, groundMat, gutter, pushTruck, stall, wheelbarrow } from './marketStalls';
import type { StallOpts } from './marketStalls';
import { sign, signTexture, umbrella } from './oshodiKit';
import { shophouseRows } from './shared';
import { floorWords, layoutOf, litter, mouthTraffic, paintKerbs, paintRoads, tileWorld } from './rumbleV2Kit';

const ID = 'rumbleLagosIsland';

export const RUMBLE_LAGOS_ISLAND_LOOK: ArenaLook = {
  // hot hazy afternoon: warm ochre light filtered through dust and cooking smoke
  sky: 0x9c8a70,
  fog: { color: 0x8e7c64, near: 18, far: 66 },
  sun: { color: 0xffd8a8, intensity: 3.5, position: [10, 20, 8] },
  hemi: { sky: 0xd8c4a4, ground: 0x5c4232, intensity: 1.0 },
  envIntensity: 0.42,
  exposure: 1.06,
  floorTint: 0xc4a488,
  pillarTint: 0xcab8a4,
  softTint: 0xc8b8a6,
  slab: 0x6c5242,
  street: 0x3a2a1f,
  grit: { tone: 0x7c5a44, dirt: 0x5a3e2e, dust: 0x8e6c54 },
  // bare bulbs under the stall roofs along the edges
  lamps: [
    [-22.4, 2.3, -8, 0xffb060],
    [22.4, 2.3, 8, 0xffb060],
    [-8, 2.3, -17.6, 0xffaa55],
    [8, 2.3, -17.6, 0xffaa55],
  ],
};

// ------------------------------------------------------------------------------------------- floor

const PRINTS = ['#8a3a2a', '#2e4a7a', '#c89a3a', '#3e6a48', '#6a2e5a', '#b85a2a', '#2a6a6a'];

export const RUMBLE_LAGOS_ISLAND_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const layout = layoutOf(ID);
  const r = artRng(5201);
  const w = cols * T;
  const h = rows * T;
  const at = (x: number, y: number): string => layout[y]?.[x] ?? '#';
  noiseFill(g, g.canvas.width, g.canvas.height, [168, 138, 112], 22, 41);
  noiseFill(rg, rg.canvas.width, rg.canvas.height, [214, 214, 214], 20, 42);
  // red laterite dust drifts and darker, foot-polished aisles
  for (let i = 0; i < cols * rows * 0.25; i++)
    stain(g, r() * w, r() * h, 50 + r() * 120, `rgba(150,74,40,${0.06 + r() * 0.08})`);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (at(x, y) !== '.') continue;
      const aisle = at(x, y - 1) === '#' || at(x, y + 1) === '#';
      if (aisle) {
        g.fillStyle = `rgba(60,40,30,${0.1 + r() * 0.08})`;
        g.fillRect(x * T, y * T, T, T);
        rg.fillStyle = 'rgba(150,150,150,0.5)';
        rg.fillRect(x * T, y * T, T, T);
      }
    }
  // the plazas: interlocking pavers, a painted ring round each kiosk
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (at(x, y) !== '=' || y === 2 || y === rows - 3) continue;
      g.fillStyle = 'rgba(150,136,118,0.85)';
      g.fillRect(x * T, y * T, T, T);
      for (let py = 0; py < T; py += 24)
        for (let px = (py / 24) % 2 ? -24 : 0; px < T; px += 48) {
          const v = 130 + r() * 30;
          g.fillStyle = r() < 0.12 ? `rgba(${v + 10},${v - 30},${v - 44},0.6)` : `rgba(${v},${v - 6},${v - 14},0.55)`;
          g.fillRect(x * T + px + 2, y * T + py + 2, 44, 20);
        }
    }
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (at(x, y) !== '#') continue;
      const kiosk = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].every(([dx, dy]) => at(x + dx!, y + dy!) === '=');
      if (!kiosk) continue;
      g.strokeStyle = 'rgba(214,176,52,0.6)';
      g.lineWidth = 8;
      g.beginPath();
      g.arc((x + 0.5) * T, (y + 0.5) * T, T * 1.25, 0, Math.PI * 2);
      g.stroke();
    }
  // the access roads (north and south edges): patched tarmac, kerbs, drain grates
  const road = (x: number, y: number): boolean => at(x, y) === '=' && (y === 2 || y === rows - 3);
  paintRoads(g, rg, layout, r, [62, 58, 54], road);
  paintKerbs(g, layout, 'rgba(206,196,170,0.85)', 'rgba(40,36,30,0.85)', road);
  for (const y of [2, rows - 3]) {
    for (let x = 1; x < cols; x += 6) {
      g.fillStyle = 'rgba(16,14,12,0.8)';
      g.fillRect(x * T + 30, y * T + (y < 5 ? 4 : T - 22), 60, 18);
    }
    for (let i = 0; i < 10; i++) stain(g, r() * w, (y + r()) * T, 20 + r() * 30, 'rgba(8,8,8,0.4)');
  }
  // gutters along the stall fronts and goods mats at the counters
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (at(x, y) !== '#') continue;
      if (at(x, y + 1) === '.') {
        g.fillStyle = 'rgba(30,26,22,0.7)';
        g.fillRect(x * T, (y + 1) * T, T, 9);
        g.fillStyle = 'rgba(90,96,70,0.35)';
        g.fillRect(x * T, (y + 1) * T + 3, T, 3);
      }
      if (r() < 0.35 && at(x, y - 1) === '.') {
        g.fillStyle = PRINTS[Math.floor(r() * PRINTS.length)]!;
        g.globalAlpha = 0.35 + r() * 0.2;
        const mw = T * (0.5 + r() * 0.35);
        g.fillRect(x * T + (T - mw) / 2, (y - 1) * T + T * 0.55, mw, T * 0.4);
        g.fillStyle = 'rgba(240,230,200,0.5)';
        for (let k = 0; k < 4; k++) g.fillRect(x * T + (T - mw) / 2 + k * (mw / 4), (y - 1) * T + T * 0.6, 3, T * 0.3);
        g.globalAlpha = 1;
      }
    }
  floorWords(g, 'BALOGUN', 20.5, 15.5, 0.55, 'rgba(214,176,52,0.28)');
  for (let i = 0; i < cols * rows * 0.25; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 5), 'rgba(30,22,16,0.5)', 2);
  // cardboard, nylon bags and offcuts of cloth
  for (let i = 0; i < cols * rows * 0.35; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(170,130,80,${0.3 + r() * 0.3})` : PRINTS[Math.floor(r() * PRINTS.length)]!;
    g.globalAlpha = 0.5;
    g.fillRect(r() * w, r() * h, 6 + r() * 14, 4 + r() * 8);
    g.globalAlpha = 1;
  }
  litter(g, r, cols, rows, 0.9);
};

// ------------------------------------------------------------------------------------------ the set

const SHOPS: [string, string, string][] = [
  ['IYA BOSE TEXTILES', '#7a1e1e', '#f2e6c8'],
  ['ADUNNI LACE & GEORGE', '#1e3a6a', '#f2e6c8'],
  ['ALHAJI MUSA WAX PRINTS', '#2e5a34', '#f6e9c6'],
  ['MAMA CHIDI PROVISIONS', '#c89a2a', '#1c1a16'],
  ['OKONKWO SHOES & BAGS', '#3a2a5a', '#f2e6c8'],
  ['ISALE EKO PLASTICS', '#8a4a1e', '#f2e6c8'],
];

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const { wz } = tileWorld(W, H);
  const layout = layoutOf(ID);
  const north = -H / 2;
  const S = STREET;
  const kit = new Kit(ctx);

  // tall commercial blocks pressing in on three sides
  shophouseRows(ctx, { north: true, east: true, west: true, seed: 5, close: 0.4, scale: 1.3 });

  // the lock-up stall rows in front of the buildings (north, west, east), gaps at the road mouths
  const goods: StallOpts['goods'][] = ['cloth', 'cloth', 'basins', 'grain', 'cloth', 'provisions'];
  const roofs: StallOpts['roof'][] = ['patch', 'sheet', 'tarp'];
  let k = 0;
  for (let x = -W / 2 + 1.4; x < W / 2 - 1; x += 2.45) {
    stall(kit, { x, y: S, z: north - 1.9, ry: 0 }, {
      w: 2.2,
      d: 1.25,
      goods: goods[k % goods.length]!,
      roof: roofs[k % 3]!,
      front: 2.1 + (k % 3) * 0.06,
      back: 2.55,
      seed: k * 3 + 1,
      sign: k % 2 ? k % 8 : undefined,
    });
    k++;
  }
  for (const side of [-1, 1]) {
    for (let z = north + 4.4; z < H / 2 - 4; z += 2.6) {
      // the access roads leave the board at rows 2 and 28: keep their mouths open
      if (Math.abs(z - wz(2)) < 1.8 || Math.abs(z - wz(28)) < 1.8) continue;
      stall(kit, { x: side * (W / 2 + 1.75), y: S, z, ry: -side * (Math.PI / 2) }, {
        w: 2.3,
        d: 1.15,
        goods: goods[k % goods.length]!,
        roof: roofs[k % 3]!,
        front: 2.05,
        back: 2.4,
        seed: k * 5 + 7,
        sign: k % 3 === 0 ? k % 8 : undefined,
      });
      k++;
    }
  }
  // gutters along the foot of the slab on every side
  gutter(kit, { x: 0, y: S, z: north - 0.9, ry: 0 }, W + 1.8, 0.24);
  gutter(kit, { x: 0, y: S, z: H / 2 + 0.95, ry: 0 }, W + 1.8, 0.24);
  for (const side of [-1, 1]) gutter(kit, { x: side * (W / 2 + 0.95), y: S, z: 0, ry: Math.PI / 2 }, H + 0.6, 0.22);

  // fictional textile houses' boards over the pavements, a market banner across the north
  SHOPS.forEach(([text, bg, fg], i) => {
    const map = signTexture(`rli:shop${i}`, 512, 128, { bg, fg, lines: [[text, 44]], border: fg, wear: 1.1 }, 60 + i);
    if (i < 2) sign(ctx, map, -8 + i * 16, 3.6, north - 3.6, 3.4, 0.85, 0);
    else {
      const side = i % 2 ? 1 : -1;
      sign(ctx, map, side * (W / 2 + 3.4), 3.5, wz(6 + i * 4), 3.2, 0.8, -side * (Math.PI / 2));
    }
  });
  const banner = signTexture('rli:banner', 1024, 128, {
    bg: '#d8ccb0',
    fg: '#6a1c16',
    lines: [['BALOGUN MARKET • IDUMOTA • BREADFRUIT STREET', 56]],
    wear: 1.3,
  });
  sign(ctx, banner, 0, 4.4, north - 4.6, 9, 1.1, 0, { posts: 2 });

  // the buka on the north-west corner: wood fire, pot, benches under a lean-to
  const hearth = { x: -W / 2 - 1.6, y: S, z: north - 1.0, ry: Math.PI / 2 };
  buka(kit, hearth);
  ctx.ambient.fire(hearth.x, S + 0.1, hearth.z, 0.24);
  ctx.ambient.smokeColumn(hearth.x, S + 0.75, hearth.z, { shade: 0.85, size: 1.0, rate: 9 });

  // umbrellas over the pavement sellers at the access-road mouths
  const cloth = [0xa8442e, 0xc8a844, 0x2e5a86, 0x3a744a].map((c) => mat(c, { roughness: 0.88 }));
  [
    [-W / 2 - 2.4, wz(0.5)],
    [W / 2 + 2.4, wz(4.2)],
    [-W / 2 - 2.4, wz(30)],
    [W / 2 + 2.6, wz(26)],
  ].forEach(([x, z], i) => umbrella(ctx, x!, z!, 0.9, cloth[i % 4]!, cloth[(i + 2) % 4]!, { h: 1.95 }));

  // goods on the move: push trucks of bales, wheelbarrows of sachet water, basins stacked to sell
  pushTruck(kit, { x: -W / 2 - 1.7, y: S, z: wz(12), ry: 0.08 }, 'bales', 2);
  pushTruck(kit, { x: W / 2 + 1.7, y: S, z: wz(19), ry: Math.PI - 0.1 }, 'sacks', 5);
  pushTruck(kit, { x: -6, y: S, z: north - 0.75, ry: Math.PI / 2 - 0.1 }, 'bales', 7);
  wheelbarrow(kit, { x: W / 2 + 1.4, y: S, z: wz(9), ry: -2.6 }, 0x9a8a5e);
  wheelbarrow(kit, { x: 9, y: S, z: H / 2 + 1.5, ry: 1.9 }, 0x8a5a3a);
  basinStack(kit, kit.statics, -W / 2 - 0.55, 0, H / 2 + 0.5, 3, 2);
  basinStack(kit, kit.statics, W / 2 + 0.55, 0, H / 2 + 0.55, 2, 5);
  groundMat(kit, { x: -11, y: S, z: H / 2 + 1.45, ry: 0.06 }, 1);
  groundMat(kit, { x: 4.5, y: S, z: H / 2 + 1.5, ry: -0.08 }, 4);
  groundMat(kit, { x: 15, y: S, z: H / 2 + 1.45, ry: 0.04 }, 6);
  kit.bag.put('prop_soft_sacks', { x: -4, y: S, z: H / 2 + 1.3, ry: 0.3, sx: 0.85, sy: 0.7, sz: 0.85 });
  kit.bag.put('prop_soft_cartons', { x: 12, y: S, z: H / 2 + 1.25, ry: -0.4, sx: 0.8, sy: 0.6, sz: 0.8 });

  // kekes and a Danfo nosing along the access roads, okadas by the kerb
  mouthTraffic(ctx, layout, { kinds: ['keke', 'danfo', 'keke', 'taxi'], depth: 2 });
  ctx.vehicles('okada', [
    { x: W / 2 + 1.3, y: S, z: wz(14), ry: 0.35 },
    { x: -W / 2 - 1.35, y: S, z: wz(21), ry: -0.4 },
  ]);
  ctx.instance('env_poles', [
    { x: W / 2 + 4.4, y: S, z: wz(11), ry: -Math.PI / 2 },
    { x: -W / 2 - 4.4, y: S, z: wz(18), ry: Math.PI / 2 },
  ]);
  kit.finish();

  // generator exhaust and dust over the lanes, wood smoke behind the roofs
  ctx.statics.add(box(0.6, 0.5, 0.45, mat(0x5c6b58, { roughness: 0.6, metalness: 0.4 }), W / 2 + 1.2, S + 0.25, wz(24)));
  ctx.ambient.exhaust(W / 2 + 1.2, S + 0.45, wz(24) + 0.3, 0, 1);
  ctx.ambient.dust(0, north - 1.4, 18, 1.2);
  for (const side of [-1, 1]) ctx.ambient.dust(side * (W / 2 + 1.8), 0, 2, 13);
  ctx.ambient.smokeColumn(-W / 2 - 6, 6, north - 9, { shade: 0.55, size: 1.4, rate: 2.5 });

  // traders, buyers and porters, most important first (the quality budget drops the tail)
  const L = ctx.life;
  L.add({ kind: 'seller', x: -7.3, y: S, z: north - 1.1, yaw: 0.15 });
  L.add({ kind: 'seller', x: 6.0, y: S, z: north - 1.1, yaw: -0.1 });
  L.add({ kind: 'argue', x: -W / 2 - 1.8, y: S, z: wz(9), yaw: 0.1 }); // haggling over a bolt of lace
  L.add({ kind: 'walker', x: -14, y: S, z: north - 0.8, yaw: 0, toX: 14, toZ: north - 0.8 });
  L.add({ kind: 'seller', x: W / 2 + 1.1, y: S, z: wz(15), yaw: -Math.PI / 2 });
  L.add({ kind: 'conductor', x: -W / 2 - 2.6, y: S, z: wz(2) + 1.4, yaw: 1.4, toX: -W / 2 - 5, toZ: wz(2) + 1.4 });
  L.add({ kind: 'walker', x: W / 2 + 1.0, y: S, z: wz(4), yaw: 0, toX: W / 2 + 1.0, toZ: wz(26) });
  L.add({ kind: 'onlooker', x: hearth.x + 0.6, y: S, z: hearth.z - 0.4, yaw: 0.9 }); // the cook
  L.add({ kind: 'seller', x: -W / 2 - 1.1, y: S, z: wz(23), yaw: Math.PI / 2 });
  L.add({ kind: 'walker', x: -W / 2 - 1.0, y: S, z: wz(26), yaw: 0, toX: -W / 2 - 1.0, toZ: wz(6) });
  L.add({ kind: 'argue', x: 10, y: S, z: north - 0.9, yaw: 1.4 });
  L.add({ kind: 'onlooker', x: W / 2 + 2.2, y: S, z: wz(21.5), yaw: -1.8 });
}

export const RUMBLE_LAGOS_ISLAND_SET: ArenaSet = {
  build,
  // the market's own traders and shoppers carry the scene; a few spectators on the sides
  crowd: 0.35,
  crowdEdges: { north: false, east: true, west: true, south: true },
};
