/**
 * City Rumble V2 - Ojuelegba Underbridge (presentation only; the grid and hazards are
 * `src/sim/arenas/rumbleOjuelegba.ts`). Late afternoon under the Ojuelegba flyover.
 *
 * Floor: the flyover crosses the board north-south over columns 13-27, so that whole band lies in the
 * deck's deep shadow (painted, with a bright sliver of low sun along both deck edges) and its pier
 * footings are stained into the ground; the two wide roads are three-lane tarmac with lane dashes,
 * kerbs and zebra crossings at the bridge; the taxi queue lanes are hatched yellow with TAXI painted
 * in; either side, the neighbourhood lanes are dusty broken concrete with sand drifts.
 *
 * Surroundings: the deck itself runs on north of the board on twin columns, Danfos crossing on top and
 * the OJUELEGBA name on its fascia; under it the bus stop crowd, a vulcaniser and vendors' umbrellas;
 * yellow taxis queue at the rank, Danfos and kekes jam both wide roads beyond the east and west edges;
 * shophouses, poles and a tangle of wires line the side streets. The camera side keeps okadas, a kerb
 * and low hawkers' mats.
 */
import { DoubleSide, PlaneGeometry } from 'three';
import type { ArenaLook } from '../arenaLook';
import { artRng } from '../textures';
import { box, cyl, mat, mesh, uniqueMat } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { T, crack, noiseFill, stain, tyreTrack } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { Kit } from './marketKit';
import { groundMat, stall } from './marketStalls';
import { flyoverPalette } from './oshodiFlyover';
import { drum, sign, signTexture, umbrella, wire } from './oshodiKit';
import { SiteLights, v3 } from './roadworksKit';
import { shophouseRows } from './shared';
import {
  dash,
  floorWords,
  layoutOf,
  litter,
  mouthTraffic,
  paintKerbs,
  paintRoads,
  tileWorld,
  zebraTile,
} from './rumbleV2Kit';

const ID = 'rumbleOjuelegba';
/** Tile columns under the deck. */
const DECK_X0 = 13;
const DECK_X1 = 27;

export const RUMBLE_OJUELEGBA_LOOK: ArenaLook = {
  // late afternoon: a low amber sun from the west, long hard shadows, brown haze
  sky: 0xa08a6c,
  fog: { color: 0x8a7660, near: 20, far: 70 },
  sun: { color: 0xffbe80, intensity: 4.0, position: [-16, 15, 7] },
  hemi: { sky: 0xd0b494, ground: 0x4e3e30, intensity: 0.85 },
  envIntensity: 0.42,
  exposure: 1.05,
  floorTint: 0xb8ac9a,
  pillarTint: 0xc4bcae,
  softTint: 0xc4b6a6,
  slab: 0x6a6258,
  street: 0x2a2622,
  grit: { tone: 0x7a644c, dirt: 0x584a3a, dust: 0x8e7a62 },
  // fluorescent tubes under the bridge and the bus-stop kiosk bulbs
  lamps: [
    [-3, 3.2, -17.5, 0xd8ecff],
    [3, 3.2, -17.5, 0xd8ecff],
    [-22.5, 2.6, -2, 0xffa850],
    [22.5, 2.6, 2, 0xffa850],
  ],
};

// ------------------------------------------------------------------------------------------- floor

export const RUMBLE_OJUELEGBA_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const layout = layoutOf(ID);
  const r = artRng(5301);
  const w = cols * T;
  const h = rows * T;
  const at = (x: number, y: number): string => layout[y]?.[x] ?? '#';
  noiseFill(g, g.canvas.width, g.canvas.height, [154, 144, 128], 22, 51);
  noiseFill(rg, rg.canvas.width, rg.canvas.height, [218, 218, 218], 20, 52);
  // broken concrete slabs and sand drifts in the neighbourhood lanes
  for (let i = 0; i < cols * rows * 0.5; i++) {
    const x = Math.floor(r() * cols);
    const y = Math.floor(r() * rows);
    if (at(x, y) !== '.') continue;
    g.fillStyle = `rgba(${120 + r() * 30},${108 + r() * 24},${86 + r() * 20},0.35)`;
    g.fillRect(x * T + r() * 30, y * T + r() * 30, 40 + r() * 60, 30 + r() * 50);
  }
  for (let i = 0; i < cols * rows * 0.15; i++)
    stain(g, r() * w, r() * h, 40 + r() * 100, `rgba(176,150,110,${0.08 + r() * 0.1})`);
  // the wide roads and the taxi lanes
  const wide = (x: number, y: number): boolean =>
    at(x, y) === '=' && ((y >= 6 && y <= 8) || (y >= 22 && y <= 24));
  paintRoads(g, rg, layout, r, [60, 58, 55]);
  paintKerbs(g, layout, 'rgba(206,200,184,0.85)', 'rgba(30,30,30,0.9)');
  for (const y0 of [6, 22]) {
    dash(g, 0, y0 + 1, cols, y0 + 1, 'rgba(226,222,208,0.65)', 5, 0.7, 0.5);
    dash(g, 0, y0 + 2, cols, y0 + 2, 'rgba(226,222,208,0.65)', 5, 0.7, 0.5);
    g.fillStyle = 'rgba(214,176,52,0.7)';
    g.fillRect(0, y0 * T + 8, w, 5);
    g.fillRect(0, (y0 + 3) * T - 13, w, 5);
    for (const x of [11, 12, 28, 29]) zebraTile(g, x, y0 + 1, true, 0.6);
  }
  for (const x of [17, 23]) {
    g.save();
    g.beginPath();
    g.rect(x * T, 0, T, h);
    g.clip();
    g.strokeStyle = 'rgba(214,176,52,0.4)';
    g.lineWidth = 6;
    for (let y = -T; y < h + T; y += 34) {
      g.beginPath();
      g.moveTo(x * T, y);
      g.lineTo((x + 1) * T, y + T);
      g.stroke();
    }
    g.restore();
    for (let y = 2; y < rows; y += 7)
      if (!wide(x, y)) floorWords(g, 'TAXI', x + 0.5, y + 0.5, 0.3, 'rgba(232,200,70,0.8)', -Math.PI / 2);
  }
  // pier footings: a ring of stained concrete round every pier under the bridge
  for (let y = 0; y < rows; y++)
    for (let x = DECK_X0; x <= DECK_X1; x++) {
      if (at(x, y) !== '#') continue;
      stain(g, (x + 0.5) * T, (y + 0.5) * T, T * 0.95, 'rgba(30,26,22,0.32)');
      stain(g, (x + 0.5) * T, (y + 1.1) * T, T * 0.6, 'rgba(12,10,10,0.35)'); // drainage drip
    }
  // the deck's shadow: deep over the bridge band, a bright sliver of low sun along both edges
  const x0 = DECK_X0 * T;
  const x1 = (DECK_X1 + 1) * T;
  const grad = g.createLinearGradient(x0 - T * 0.8, 0, x1 + T * 0.8, 0);
  grad.addColorStop(0, 'rgba(16,14,12,0)');
  grad.addColorStop(0.06, 'rgba(16,14,12,0.42)');
  grad.addColorStop(0.5, 'rgba(16,14,12,0.5)');
  grad.addColorStop(0.94, 'rgba(16,14,12,0.42)');
  grad.addColorStop(1, 'rgba(16,14,12,0)');
  g.fillStyle = grad;
  g.fillRect(x0 - T * 0.8, 0, x1 - x0 + T * 1.6, h);
  // expansion-joint drips: dark lines across the band where the deck spans meet
  for (let y = 3; y < rows; y += 9) {
    g.fillStyle = 'rgba(10,10,10,0.3)';
    g.fillRect(x0, y * T + T * 0.45, x1 - x0, 10);
  }
  floorWords(g, 'OJUELEGBA', 20.5, 4, 0.5, 'rgba(232,226,210,0.22)');
  floorWords(g, 'OJUELEGBA', 20.5, 27, 0.5, 'rgba(232,226,210,0.22)');
  for (let i = 0; i < 12; i++) tyreTrack(g, r, w, h, 'rgba(20,18,16,0.15)');
  for (let i = 0; i < cols * rows * 0.3; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 7), 'rgba(18,16,14,0.55)', 2);
  litter(g, r, cols, rows, 0.8);
};

// ------------------------------------------------------------------------------------------ the set

/** The flyover running on north of the board: a box-girder deck on twin columns, Danfos on top. */
function flyover(ctx: SetContext, L: SiteLights): void {
  const { W, H } = ctx;
  const P = flyoverPalette();
  const s = ctx.statics;
  const north = -H / 2;
  const x0 = DECK_X0 - W / 2;
  const x1 = DECK_X1 + 1 - W / 2;
  const width = x1 - x0;
  const cx = (x0 + x1) / 2;
  const soffit = STREET + 5.2;
  const z0 = north - 0.9;
  const z1 = north - 46;
  const len = z0 - z1;
  const zc = (z0 + z1) / 2;
  s.add(box(width - 2, 1.0, len, P.deckDark, cx, soffit + 0.5, zc));
  s.add(box(width, 0.4, len, P.deck, cx, soffit + 1.2, zc));
  // the south end of the deck, facing the board, carries the name
  const fascia = signTexture(
    'roju:fascia',
    1024,
    128,
    { bg: '#8c867a', fg: '#2e2a24', lines: [['OJUELEGBA', 84]], wear: 1.6 },
    81,
  );
  const fm = uniqueMat(0xffffff, { map: fascia, roughness: 0.95 });
  ctx.own(fm);
  const face = mesh(new PlaneGeometry(width, 1.3), fm, cx, soffit + 0.75, z0 + 0.012);
  s.add(face);
  // parapets on both sides, lamp standards on the east parapet
  for (const side of [-1, 1]) {
    s.add(box(0.25, 0.8, len, P.parapet, cx + side * (width / 2 - 0.12), soffit + 1.8, zc));
    for (let z = z0 - 3; z > z1; z -= 9)
      s.add(cyl(0.06, 0.08, 3.6, P.steel, cx + side * (width / 2 - 0.2), soffit + 3.2, z, 6));
  }
  // twin columns with crossheads every 9 m, fly posters on the south faces
  for (let z = z0 - 3.2; z > z1 + 2; z -= 9) {
    for (const dx of [-4.2, 4.2]) {
      const col = cyl(0.55, 0.62, 5.2, P.pier, cx + dx, STREET + 2.6, z, 10);
      s.add(col);
      s.add(box(1.4, 0.3, 1.4, P.deckDark, cx + dx, STREET + 0.15, z));
    }
    s.add(box(width - 1, 0.8, 1.4, P.pier, cx, soffit - 0.4, z));
  }
  // traffic on the deck: Danfos and a taxi heading north and south
  ctx.vehicles('danfo', [
    { x: cx - 2.4, y: soffit + 1.4, z: north - 6, ry: Math.PI },
    { x: cx + 2.2, y: soffit + 1.4, z: north - 14, ry: 0 },
    { x: cx - 2.6, y: soffit + 1.4, z: north - 22, ry: Math.PI },
  ]);
  ctx.vehicles('taxi', [{ x: cx + 2.5, y: soffit + 1.4, z: north - 4.5, ry: 0 }]);
  // fluorescent tubes on the columns light the bus stop underneath
  L.glow(cx - 4.2, STREET + 2.6, north - 3.0, 0.9, 0xe0f0ff, 0.5);
  L.glow(cx + 4.2, STREET + 2.6, north - 3.0, 0.9, 0xe0f0ff, 0.5);
}

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const { wx, wz } = tileWorld(W, H);
  const layout = layoutOf(ID);
  const north = -H / 2;
  const S = STREET;
  const L = new SiteLights();
  const kit = new Kit(ctx);

  flyover(ctx, L);
  // shophouses either side of the bridge on the north side, and down the east and west streets
  shophouseRows(ctx, { east: true, west: true, seed: 2, close: 0.2 });
  const left = signTexture('roju:busstop', 256, 256, {
    bg: '#c8a43a',
    fg: '#1c1a16',
    lines: [
      ['BUS', 60],
      ['STOP', 60],
      ['OJUELEGBA', 28],
    ],
    border: '#1c1a16',
  });
  sign(ctx, left, wx(15), 2.4, north - 1.6, 0.7, 0.7, 0, { posts: 1 });

  // the bus stop under the bridge: benches, a kiosk, umbrellas and a crowd waiting
  const wood = mat(0x6e5440, { roughness: 0.95 });
  for (const x of [wx(14), wx(26)]) ctx.statics.add(box(2.2, 0.08, 0.45, wood, x, S + 0.45, north - 2.6));
  if (ctx.quality.level !== 'low')
    ctx.instance('env_kiosk', [{ x: wx(20), y: S, z: north - 3.4, ry: 0, sx: 0.85, sy: 0.85, sz: 0.85 }]);
  const cloth = [0xa8442e, 0xc8a844, 0x2e5a86, 0x3a744a, 0xd2ccb8].map((c) => {
    const m = uniqueMat(c, { roughness: 0.88 });
    m.side = DoubleSide;
    ctx.own(m);
    return m;
  });
  const umbrellas: [number, number][] = [
    [wx(4), north - 1.6],
    [wx(8), north - 1.8],
    [wx(33), north - 1.7],
    [wx(37), north - 1.6],
    [-W / 2 - 2.2, wz(12)],
    [W / 2 + 2.2, wz(18)],
    [-W / 2 - 2.3, wz(27.5)],
    [W / 2 + 2.3, wz(2.5)],
  ];
  umbrellas.forEach(([x, z], i) => umbrella(ctx, x, z, 0.9, cloth[i % 5]!, cloth[(i + 2) % 5]!, { h: 2.0 }));
  // stalls along the north pavement either side of the bridge
  kit.statics.updateMatrixWorld();
  [wx(2), wx(6), wx(10), wx(30), wx(34), wx(38)].forEach((x, k) =>
    stall(
      kit,
      { x, y: S, z: north - 3.4, ry: 0 },
      {
        w: 2.2,
        d: 1.2,
        goods: (['provisions', 'basins', 'cloth', 'grain'] as const)[k % 4]!,
        roof: k % 2 ? 'sheet' : 'tarp',
        front: 2.0,
        back: 2.3,
        seed: 11 + k * 4,
        sign: k % 2 ? k + 2 : undefined,
      },
    ),
  );
  // a vulcaniser by the west road: tyres, a compressor drum
  ctx.instance('env_tyrestack', [
    { x: -W / 2 - 1.8, y: S, z: wz(4), ry: 0.3, sx: 0.8, sy: 0.7, sz: 0.8 },
    { x: -W / 2 - 2.6, y: S, z: wz(3), ry: 1.1, sx: 0.8, sy: 0.5, sz: 0.8 },
    { x: W / 2 + 1.9, y: S, z: wz(26), ry: 0.6, sx: 0.8, sy: 0.6, sz: 0.8 },
  ]);
  drum(ctx, mat(0x8a2e22, { roughness: 0.75, metalness: 0.3 }), -W / 2 - 1.6, wz(5));
  // the taxi rank: yellow taxis lined up beyond the north mouths of the queue lanes
  mouthTraffic(ctx, layout, { kinds: ['danfo', 'taxi', 'keke', 'danfo', 'taxi'], depth: 2 });
  ctx.vehicles('taxi', [
    { x: wx(17) - 1.6, y: S, z: north - 8.5, ry: 0 },
    { x: wx(23) + 1.6, y: S, z: north - 8.5, ry: 0 },
  ]);
  ctx.vehicles('okada', [
    { x: wx(5), y: S, z: H / 2 + 1.3, ry: 1.6 },
    { x: wx(6), y: S, z: H / 2 + 1.35, ry: 1.5 },
    { x: wx(35), y: S, z: H / 2 + 1.3, ry: -1.4 },
    { x: -W / 2 - 1.5, y: S, z: wz(14), ry: 2.6 },
  ]);
  groundMat(kit, { x: -10, y: S, z: H / 2 + 1.5, ry: 0 }, 3);
  groundMat(kit, { x: 11, y: S, z: H / 2 + 1.5, ry: 0.1 }, 6);
  kit.finish();

  // poles and a tangle of service wires over the side streets
  const poles = [
    { x: -W / 2 - 4.2, z: wz(1), ry: Math.PI / 2 },
    { x: -W / 2 - 4.2, z: wz(15), ry: Math.PI / 2 },
    { x: W / 2 + 4.2, z: wz(15), ry: -Math.PI / 2 },
    { x: W / 2 + 4.2, z: wz(29), ry: -Math.PI / 2 },
  ];
  ctx.instance(
    'env_poles',
    poles.map((p) => ({ ...p, y: S })),
  );
  const cable = mat(0x1c1c1c, { roughness: 0.6 });
  for (const [a, b] of [
    [0, 1],
    [2, 3],
  ] as const)
    for (const side of [-1, 1]) {
      const pa = poles[a]!;
      const pb = poles[b]!;
      wire(
        ctx,
        v3(pa.x, S + 3.45, pa.z + side * 0.8),
        v3(pb.x, S + 3.45, pb.z + side * 0.8),
        0.8,
        cable,
        0.02,
      );
    }

  // dust and exhaust hanging under the bridge and along the roads
  ctx.ambient.dust(0, north - 2.5, 7, 2);
  for (const z of [wz(7), wz(23)]) {
    ctx.ambient.dust(-W / 2 - 5, z, 4, 1.4);
    ctx.ambient.dust(W / 2 + 5, z, 4, 1.4);
  }
  ctx.ambient.smokeColumn(W / 2 + 3, S + 0.5, north - 2, { shade: 0.8, size: 0.6, rate: 3 }); // roasting corn
  L.build(ctx);

  const life = ctx.life;
  life.add({ y: S, kind: 'conductor', x: wx(12), z: north - 1.2, yaw: 0.2, toX: wx(9), toZ: north - 1.2 });
  life.add({ y: S, kind: 'onlooker', x: wx(15), z: north - 2.2, yaw: 0.2 }); // waiting for a bus
  life.add({ y: S, kind: 'onlooker', x: wx(25), z: north - 2.1, yaw: -0.3 });
  life.add({ y: S, kind: 'seller', x: wx(20) + 1.2, z: north - 2.6, yaw: 0 });
  life.add({ y: S, kind: 'argue', x: -W / 2 - 2.2, z: wz(9.5), yaw: 1.2 }); // driver and passenger over the change
  life.add({ y: S, kind: 'conductor', x: W / 2 + 2.4, z: wz(21), yaw: -1.3, toX: W / 2 + 5, toZ: wz(21) });
  life.add({ y: S, kind: 'walker', x: -14, z: north - 0.8, yaw: 0, toX: -3, toZ: north - 0.8 });
  life.add({ y: S, kind: 'seller', x: -W / 2 - 1.2, z: wz(12), yaw: Math.PI / 2 });
  life.add({ y: S, kind: 'worker', x: -W / 2 - 2.4, z: wz(4), yaw: 1.4 }); // the vulcaniser
  life.add({ y: S, kind: 'walker', x: W / 2 + 1.1, z: wz(2), yaw: 0, toX: W / 2 + 1.1, toZ: wz(14) });
  life.add({ y: S, kind: 'onlooker', x: wx(27), z: north - 1.4, yaw: -0.5 });
  life.add({ y: S, kind: 'walker', x: 4, z: north - 1.1, yaw: 0, toX: 15, toZ: north - 1.1 });
}

export const RUMBLE_OJUELEGBA_SET: ArenaSet = {
  build,
  crowd: 0.3,
  crowdEdges: { north: false, east: true, west: true, south: false },
};
