/**
 * Yaba After Dark: a nightlife street lit by neon, headlights and street lamps.
 *
 * Presentation only (the grid, roads and hazards are `src/sim/arenas`). This module owns the arena's
 * light (YABA_LOOK), its surroundings (YABA_SET) and its playfield floor (YABA_FLOOR).
 *
 * A warm, commercial night street (nothing like the cold floodlit Lekki site): two-storey
 * shophouses with open, lit shopfronts and lightbox signs ringed in neon (a bar and lounge with
 * festoon bulbs and plastic tables outside, a phone shop, a 24-hour pharmacy with its green cross,
 * a rice-and-chicken kitchen, a betting shop, a cyber cafe), a hotel, a buka and a tailor on the east
 * street, a shawarma joint, a unisex salon and a football viewing centre on the west. A suya man
 * fans his grill, a woman roasts corn over a brazier, a POS agent sits under her umbrella. A danfo
 * idles with its headlights on while the conductor calls the route; kekes and okadas wait for
 * fares; a fight spills out of the bar. A pole transformer arcs now and then. The board is lit by a
 * warm sodium key with neon colour at the edges; a lit billboard and lit windows rise behind.
 */
import type { ArenaLook } from '../arenaLook';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import type { FloorDrawer } from './floorKit';
import { SiteLights } from './roadworksKit';
import { StreetKit, frame, v3 } from './ajegunleKit';
import type { SignSpec } from './ajegunleKit';
import { house } from './ajegunleHouses';
import { bottleCrate, chair, cooler, pole } from './ajegunleProps';
import { drawYabaFloor } from './yabaFloor';
import {
  cornBrazier,
  festoon,
  frontage,
  headlights,
  pharmacyCross,
  posStand,
  suyaStand,
  tailLights,
  transformerPole,
} from './yabaStreet';
import type { Frontage } from './yabaStreet';

export const YABA_LOOK: ArenaLook = {
  // night: a deep violet sky, warm sodium key over the street, neon colour pooled at the edges
  sky: 0x0e0a16,
  fog: { color: 0x1c1424, near: 13, far: 46 },
  sun: { color: 0xffd4ac, intensity: 2.9, position: [-4, 16, 8] },
  hemi: { sky: 0x5a4482, ground: 0x3a2618, intensity: 0.95 },
  envIntensity: 0.55,
  exposure: 1.1,
  floorTint: 0x9a949c,
  pillarTint: 0xb4aeb4,
  softTint: 0xbcb0a6,
  slab: 0x46424a,
  street: 0x141218,
  grit: { tone: 0x625e64, dirt: 0x3e3a40, dust: 0x807a84 },
  // four real lamps (no shadows; skipped on low quality): bar magenta, cyber-cafe cyan, sodium
  // over the suya stand and over the danfo stop. Everything else glows without lighting.
  lamps: [
    [-12.0, 2.6, -8.3, 0xff3ccf],
    [10.8, 2.6, -8.4, 0x48b8ff],
    [-10.8, 2.8, 2.4, 0xffa040],
    [10.8, 2.9, 1.6, 0xffb070],
  ],
};

const SIGNS: SignSpec[] = [
  { text: 'COOL SPOT BAR & LOUNGE', bg: '#1a0a1e', ink: '#ff4ad8', neon: true },
  {
    text: 'ADEX PHONES & ACCESSORIES',
    sub: 'REPAIRS • UNLOCKING • SCREEN GUARD',
    bg: '#0a1a2a',
    ink: '#3ad8ff',
    neon: true,
  },
  { text: 'GOODLIFE PHARMACY', sub: 'OPEN 24 HOURS', bg: '#e8f0ea', ink: '#14803e', neon: true },
  {
    text: 'MAMA T KITCHEN',
    sub: 'RICE • CHICKEN • MOI-MOI • SMALL CHOPS',
    bg: '#f0cc6a',
    ink: '#8a1a12',
    neon: true,
  },
  { text: 'BET & WIN SPORTS', sub: 'VIRTUAL • LIVE ODDS', bg: '#14140e', ink: '#ffd23a', neon: true },
  {
    text: 'CYBER CAFE • PRINTING',
    sub: 'LAMINATION • TYPING • JAMB REG',
    bg: '#0e1a3a',
    ink: '#e8f4ff',
    neon: true,
  },
  { text: 'DE-HOPE HOTEL & SUITES', bg: '#2a0e0e', ink: '#ff5a3a', neon: true },
  { text: 'MAMA SIDI BUKA', sub: 'AMALA • EWEDU • GBEGIRI', bg: '#e8e0c8', ink: '#2a3a1a' },
  { text: 'SHAWARMA & SMALL CHOPS', bg: '#2a1408', ink: '#ffa83a', neon: true },
  { text: 'UNISEX SALON', sub: 'BARBING • PLAITING • PEDICURE', bg: '#1a0a2a', ink: '#c87aff', neon: true },
  { text: 'VIEWING CENTRE', sub: 'LIVE FOOTBALL TONIGHT ₦200', bg: '#0a2a14', ink: '#5aff8a', neon: true },
  { text: 'MALLAM SULE SUYA', bg: '#c83a1e', ink: '#f8e8c0', font: 'sans' },
  { text: 'FAST 4G DATA', sub: '1GB ₦350  •  DIAL *000#', bg: '#f2c21e', ink: '#1a1a1a', neon: true },
  { text: 'POS • TRANSFER • WITHDRAWAL', bg: '#1a5aa8', ink: '#ffffff', font: 'sans' },
  { text: 'FINE TOUCH FASHION', sub: 'TAILORING • ASO-EBI', bg: '#3a2a1a', ink: '#f0d8a0', neon: true },
];

/** The north frontages (facades at z = -8.6), west to east. */
const NORTH: Frontage[] = [
  {
    at: -13.4,
    w: 4.8,
    sign: 0,
    neon: 0xff3ccf,
    spill: 0xff6ad8,
    ground: 'dS',
    wall: 0x6a4a5a,
    band: 0x2a1a22,
  },
  {
    at: -8.4,
    w: 4.6,
    sign: 1,
    neon: 0x2ad0ff,
    spill: 0xd8f0ff,
    ground: 'S',
    wall: 0x8a8a7a,
    band: 0x2a2e36,
    storeys: 3,
    roofKind: 'flat',
  },
  { at: -3.6, w: 4.4, sign: 2, neon: 0, spill: 0xe8fff0, ground: 'Sw', wall: 0xa89c88, band: 0x1e4a2e },
  {
    at: 1.0,
    w: 4.2,
    sign: 3,
    neon: 0xffb43a,
    spill: 0xffd8a0,
    ground: 'S',
    wall: 0x9a7a5a,
    band: 0x5a2a1a,
    storeys: 2,
    balcony: true,
  },
  {
    at: 5.5,
    w: 4.4,
    sign: 4,
    neon: 0xffd23a,
    spill: 0xfff0b0,
    ground: 'Sm',
    wall: 0x5a6a6a,
    band: 0x1a1a1a,
    storeys: 3,
    roofKind: 'flat',
  },
  {
    at: 10.2,
    w: 4.6,
    sign: 5,
    neon: 0x3a8aff,
    spill: 0xd0e0ff,
    ground: 'wS',
    wall: 0x7a7a8a,
    band: 0x22263a,
  },
];
/** East street (facing west, x = 14.0) and west street (facing east, x = -14.0), along z. */
const EAST: Frontage[] = [
  {
    at: -6.2,
    w: 4.6,
    sign: 6,
    neon: 0xff5a3a,
    spill: 0xffc890,
    ground: 'dS',
    wall: 0x8a6a5a,
    storeys: 3,
    roofKind: 'flat',
    balcony: true,
  },
  {
    at: -1.4,
    w: 4.4,
    sign: 7,
    neon: 0,
    spill: 0xf0fff4,
    ground: 'S',
    wall: 0x9a9a88,
    storeys: 1,
    verandah: 1.0,
  },
  { at: 3.4, w: 4.6, sign: 14, neon: 0xffc070, spill: 0xffe0b0, ground: 'Sw', wall: 0x6a6a5a },
];
const WEST: Frontage[] = [
  { at: -6.2, w: 4.6, sign: 8, neon: 0xffa83a, spill: 0xffd090, ground: 'Sd', wall: 0x7a5a4a },
  {
    at: -1.4,
    w: 4.4,
    sign: 9,
    neon: 0xc87aff,
    spill: 0xf0d8ff,
    ground: 'S',
    wall: 0x6a5a7a,
    storeys: 1,
    verandah: 0.9,
  },
  { at: 3.4, w: 4.6, sign: 10, neon: 0x5aff8a, spill: 0x9ad8ff, ground: 'S', wall: 0x5a6a5a, storeys: 2 },
];

/** Tall sodium street lamp with an outreach arm and its warm halo / light cone. */
function streetLamp(kit: StreetKit, L: SiteLights, x: number, z: number, dir: number, h = 5.2): void {
  const S = STREET;
  const p = kit.statics;
  kit.cyl(p, 0.06, 0.09, h, 0x3a3a3c, x, S + h / 2, z, 'metal', 7);
  const hx = x + Math.sin(dir) * 1.1;
  const hz = z + Math.cos(dir) * 1.1;
  kit.bar(p, v3(x, S + h - 0.1, z), v3(hx, S + h, hz), 0.035, 0x3a3a3c, 'metal', 5);
  kit.box(p, 0.5, 0.12, 0.26, 0x1a1a1c, hx, S + h - 0.05, hz, 'metal', { ry: dir });
  kit.box(p, 0.42, 0.03, 0.2, 0xffb060, hx, S + h - 0.12, hz, 'glow', { ry: dir });
  L.glow(hx, S + h - 0.15, hz, 2.6, 0xff9a40, 0.75);
  L.beam(
    v3(hx, S + h - 0.15, hz),
    v3(hx + Math.sin(dir) * 0.6, S, hz + Math.cos(dir) * 0.6),
    1.5,
    0xff9a40,
    0.01,
  );
}

/** The bar's terrace: plastic tables and chairs, crates of empties, a cooler and a speaker stack. */
function barTerrace(kit: StreetKit): void {
  const S = STREET;
  const p = kit.statics;
  for (const [tx, tz] of [
    [-13.8, -7.25],
    [-11.9, -7.2],
  ] as const) {
    const t = frame(p, tx, S, tz, 0.1);
    kit.box(t, 0.8, 0.04, 0.8, 0xd8d4c8, 0, 0.7, 0, 'plastic');
    kit.cyl(t, 0.05, 0.12, 0.7, 0xd8d4c8, 0, 0.35, 0, 'plastic', 8);
    for (let k = 0; k < 4; k++)
      kit.cyl(
        t,
        0.035,
        0.035,
        0.22,
        k % 2 ? 0x2a5a22 : 0x6a3a12,
        -0.2 + k * 0.13,
        0.83,
        (k % 2) * 0.12 - 0.05,
        'metal',
        6,
      );
    chair(kit, p, tx - 0.6, S, tz + 0.1, Math.PI / 2, 0xd8d4c8);
    chair(kit, p, tx + 0.6, S, tz - 0.05, -Math.PI / 2, 0xa83a2a);
  }
  for (let k = 0; k < 3; k++)
    bottleCrate(kit, p, -15.4, S + k * 0.28, -7.9, 0.05 * k, k === 1 ? 0x1e4a22 : 0x8a2a22);
  cooler(kit, p, -10.8, S, -8.0, 0.1, 0xa82a22);
  // a speaker stack by the door
  kit.box(p, 0.55, 1.0, 0.5, 0x161616, -15.2, S + 0.5, -7.6, 'metal');
  kit.box(p, 0.5, 0.5, 0.45, 0x161616, -15.2, S + 1.25, -7.6, 'metal');
  for (const y of [0.3, 0.72, 1.25])
    kit.cyl(p, 0.17, 0.17, 0.02, 0x2a2a2a, -15.2, S + y, -7.34, 'metal', 12, { rx: Math.PI / 2 });
}

function build(ctx: SetContext): void {
  const S = STREET;
  const kit = new StreetKit(ctx, SIGNS, 7401);
  const p = kit.statics;
  const L = new SiteLights();

  // ground: the street's tarmac (wet, glossy) and raised kerbs along the pavements
  kit.box(p, 64, 0.02, 44, 0x1c1a1e, 0, S + 0.005, -4, 'metal');
  kit.box(p, 32, 0.12, 2.0, 0x4a4648, 0, S + 0.06, -7.5);
  for (const s of [-1, 1]) kit.box(p, 1.6, 0.12, 16, 0x4a4648, s * 13.1, S + 0.06, -0.5);
  let k = 0;
  for (let x = -15.8; x < 15.8; x += 0.8)
    kit.box(p, 0.78, 0.13, 0.12, k++ % 2 ? 0xb8a830 : 0x1a1a1a, x, S + 0.065, -6.5);

  // ---------------------------------------------------------------- frontages
  for (const f of NORTH) frontage(kit, L, f.at, -8.6, 0, f);
  for (const f of EAST) frontage(kit, L, 14.0, f.at, -Math.PI / 2, f);
  for (const f of WEST) frontage(kit, L, -14.0, f.at, Math.PI / 2, f);
  // the taller block behind, windows lit at random, and its rooftop billboard
  const back: [number, number, number, number][] = [
    [-12.5, -15.6, 6, 4],
    [-5.6, -15.0, 6.4, 3],
    [1.4, -15.8, 6, 4],
    [8.2, -15.2, 6.4, 3],
    [14.8, -15.6, 6, 4],
  ];
  back.forEach(([x, z, w, n], i) =>
    house(kit, p, x, S, z, 0, {
      w,
      d: 6,
      storeys: n,
      wall: [0x6a6670, 0x7a6a5a, 0x5a6060, 0x7a7068, 0x666a74][i]!,
      roof: 0x4a4848,
      roofKind: 'flat',
      ground: 'wwww',
      lit: 0.4,
      tank: i % 2 === 0,
      ac: true,
    }),
  );
  const bb = frame(p, 1.4, S + 4 * 2.75 + 0.3, -16.8, 0);
  for (const lx of [-2.2, 2.2]) kit.box(bb, 0.14, 1.6, 0.14, 0x2a2a2a, lx, 0.8, 0, 'metal');
  kit.box(bb, 6.2, 2.3, 0.2, 0x1a1a1a, 0, 2.6, 0, 'metal');
  kit.sign(bb, 12, 6.0, 2.1, 0, 2.6, 0.12, true);
  L.glow(1.4, S + 14.2, -16.4, 6.5, 0xfff0a0, 0.25);

  pharmacyCross(kit, L, -1.55, S + 2.6, -8.45, -0.7);
  festoon(
    kit,
    L,
    v3(-15.7, S + 2.75, -8.5),
    v3(-11.1, S + 2.75, -8.5),
    [0xff4a4a, 0xffd04a, 0x4ad0ff, 0x6aff6a, 0xff6ad8],
  );
  festoon(kit, L, v3(-13.9, S + 2.6, -6.9), v3(-13.9, S + 2.6, -2.4), [0xffd04a, 0xff4a4a]);
  barTerrace(kit);

  // ---------------------------------------------------------------- street food, POS, lamps, poles
  suyaStand(kit, ctx, L, -10.4, 1.1, Math.PI / 2);
  kit.sign(p, 11, 1.3, 0.3, -10.75, S + 2.1, 1.1, false, { ry: Math.PI / 2 });
  cornBrazier(kit, ctx, L, -9.6, 4.6);
  posStand(kit, L, -9.7, -3.3, 0x1a5aa8);
  kit.sign(p, 13, 1.3, 0.24, -9.4, S + 0.55, -3.06, false);
  streetLamp(kit, L, -9.2, -6.9, Math.PI * 0.8);
  streetLamp(kit, L, 10.1, 6.6, -Math.PI * 0.75);
  streetLamp(kit, L, 9.3, -6.9, -Math.PI * 0.8);
  const tr = transformerPole(kit, L, -9.0, -2.0);
  const ne = pole(kit, p, 9.2, S, -2.2, Math.PI / 2, 7.0);
  for (const [a, b, dip] of [
    [tr, v3(-9.1, S + 6.9, -6.9), 0.5],
    [tr, v3(-13.95, S + 5.6, 1.2), 0.6],
    [tr, v3(-13.95, S + 3.9, -4.4), 0.5],
    [ne[0], v3(13.95, S + 5.6, -4.0), 0.6],
    [ne[1], v3(13.95, S + 3.0, 1.0), 0.5],
    [ne[0], v3(9.3, S + 5.1, -6.9), 0.4],
  ] as const)
    kit.sag(p, a, b, dip, 0.012, 0x121012, 12);

  // ---------------------------------------------------------------- traffic: danfo at the stop, kekes, okada rank
  ctx.vehicles('danfo', [{ x: 11.4, y: S, z: 1.0, ry: Math.PI }], { idle: true });
  headlights(L, 11.4, 1.0, Math.PI, 2.15, 0.6, 0.72);
  tailLights(kit, L, 11.4, 1.0, Math.PI, 2.15, 0.68, 0.85);
  ctx.vehicles('keke', [{ x: 11.2, y: S, z: 5.6, ry: Math.PI + 0.06 }], { idle: true });
  headlights(L, 11.2, 5.6, Math.PI + 0.06, 1.1, 0, 0.92);
  ctx.vehicles('keke', [{ x: -11.6, y: S, z: -4.6, ry: 0.1 }]);
  ctx.vehicles('okada', [
    { x: 9.2, y: S, z: -5.0, ry: -Math.PI / 2 + 0.3 },
    { x: 9.25, y: S, z: -4.15, ry: -Math.PI / 2 + 0.2 },
    { x: 9.2, y: S, z: -3.3, ry: -Math.PI / 2 + 0.35 },
    { x: 12.7, y: S, z: -4.6, ry: 0.05 },
  ]);
  headlights(L, 12.7, -4.6, 0.05, 0.95, 0, 1.05, 0xfff8e8);
  ctx.vehicles('taxi', [{ x: -11.7, y: S, z: 6.0, ry: Math.PI / 2 + 0.05 }]);
  kit.finish();
  L.build(ctx);

  // ---------------------------------------------------------------- the night crowd
  const life = ctx.life;
  life.add({ kind: 'fight', x: -10.2, y: S, z: -7.05, yaw: 0.35 }); // spilled out of the bar
  life.add({ kind: 'onlooker', x: -11.3, y: S, z: -7.7, yaw: 1.1 });
  life.add({ kind: 'seller', x: -9.4, y: S, z: 1.1, yaw: Math.PI / 2 }); // suya
  life.add({ kind: 'conductor', x: 10.0, y: S, z: 0.2, yaw: 0, toX: 10.0, toZ: 3.0 });
  life.add({ kind: 'walker', x: -6.2, y: S, z: -7.25, yaw: Math.PI / 2, toX: 7.0, toZ: -7.3 });
  life.add({ kind: 'argue', x: 4.6, y: S, z: -7.35, yaw: 0.2 });
  life.add({ kind: 'onlooker', x: -9.0, y: S, z: -7.6, yaw: -1.4 });
  life.add({ kind: 'onlooker', x: 9.0, y: S, z: -4.6, yaw: -Math.PI / 2 }); // okada riders
  life.add({ kind: 'onlooker', x: 9.1, y: S, z: -2.6, yaw: -Math.PI / 2 - 0.4 });
  life.add({ kind: 'walker', x: -9.0, y: S, z: -5.4, yaw: 0, toX: -8.9, toZ: 5.8 });
  life.add({ kind: 'onlooker', x: -8.95, y: S, z: -3.1, yaw: -Math.PI / 2 }); // at the POS
  life.add({ kind: 'onlooker', x: -9.0, y: S, z: 4.9, yaw: -2.4 }); // buying corn
  life.add({ kind: 'walker', x: 12.6, y: S, z: 6.2, yaw: Math.PI, toX: 12.7, toZ: -6.4 });
  life.add({ kind: 'onlooker', x: 1.0, y: S, z: -7.5, yaw: 0.1 });
  life.add({ kind: 'onlooker', x: -3.0, y: S, z: -7.1, yaw: -0.3 });

  ctx.ambient.dust(0, -7.2, 14, 1.0);
}

export const YABA_SET: ArenaSet = {
  build,
  // the street's own crowd (StreetLife) carries the scene; a thin line of people on the camera side
  crowd: 0.35,
  crowdEdges: { north: false, east: false, west: false, south: true },
};

export const YABA_FLOOR: FloorDrawer = drawYabaFloor;
