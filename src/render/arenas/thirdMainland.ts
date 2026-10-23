/**
 * Third Mainland Checkpoint: an elevated stretch of the Third Mainland Bridge at golden hour.
 *
 * Presentation only (the grid, the open carriageway row and the gust / checkpoint hazards are
 * `src/sim/arenas`). This module owns the arena's light (THIRD_MAINLAND_LOOK), its surroundings
 * (THIRD_MAINLAND_SET) and its playfield floor (THIRD_MAINLAND_FLOOR).
 *
 * The board is a section of the bridge deck. The deck runs on east and west with its lane lines; the
 * north parapet and its lamp standards (just switching on) stand over a sheer drop to the lagoon nine
 * metres below, where Makoko's stilt houses, dugout canoes, fish-trap stakes and a sand dredger sit
 * in the low sun's haze, the island towers beyond. West of the board is the checkpoint: sentry booth,
 * striped barrier arm across the middle lane, painted drums, a tyre-spike strip, sandbags and the
 * flag snapping in the wind, a taxi stopped at the arm while its driver argues. East, the go-slow:
 * a fuel tanker, a container truck and a danfo waiting, a hawker walking the lanes. Wind: flags,
 * drifting dust streaks, sand blown against the parapets. The camera (south) side has only the low
 * south parapet.
 */
import { Mesh, PlaneGeometry } from 'three';
import type { ArenaLook } from '../arenaLook';
import { artRng } from '../textures';
import { box, cyl, mat } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { crack, noiseFill, seams, stain, T, tyreTrack } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { SiteLights, sitePalette } from './roadworksKit';
import { cones } from './roadworksProps';
import {
  drum,
  flag,
  lampStandard,
  painted,
  parapetX,
  sign,
  signTexture,
  streetPlane,
  windStreaks,
} from './oshodiKit';
import type { Paint } from './oshodiKit';
import {
  WATER,
  barrierArm,
  bridgeDeck,
  bridgePalette,
  canoe,
  dredger,
  lagoonWater,
  makoko,
  sandbagWall,
  sentryBooth,
  skylineAcross,
  spikeStrip,
  truck,
} from './thirdMainlandBridge';

export const THIRD_MAINLAND_LOOK: ArenaLook = {
  // golden hour: a low gold sun from the west over the lagoon, cool violet-blue sky fill in the
  // shadows, peach haze swallowing the far water
  sky: 0xe0aa7c,
  fog: { color: 0xd6a47e, near: 20, far: 84 },
  sun: { color: 0xffc27e, intensity: 6.2, position: [-14, 8.5, 3] },
  hemi: { sky: 0xa0aaca, ground: 0x6a5242, intensity: 1.15 },
  envIntensity: 0.7,
  exposure: 1.15,
  floorTint: 0xd4c6b6,
  pillarTint: 0xdccebe,
  softTint: 0xd6c4ae,
  slab: 0x6e645a,
  // the shared street plane is removed here (the lagoon lies far below); this tints any fallback
  street: 0x4a5a5c,
  grit: { tone: 0x8e7258, dirt: 0x4e4036, dust: 0xb08e70 },
  // the bridge lamps have just come on over the north lanes
  lamps: [
    [-5, 4.9, -6.4, 0xffa040],
    [5, 4.9, -6.4, 0xffa040],
  ],
};

const NORTH_EDGE = -7.6;
const SOUTH_EDGE = 7.3;

// ------------------------------------------------------------------------------------------- floor

export const THIRD_MAINLAND_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const w = cols * T;
  const h = rows * T;
  const r = artRng(9109);
  // sun-baked bridge asphalt, polished in the wheel paths
  noiseFill(g, w, h, [100, 96, 90], 20, 91);
  noiseFill(rg, w, h, [182, 182, 182], 30, 92);
  for (let i = 0; i < w * h * 0.004; i++) {
    const v = r() < 0.55 ? 116 + r() * 50 : 40 + r() * 18;
    g.fillStyle = `rgba(${v},${v - 2},${v - 6},0.45)`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2);
  }
  for (const y of [1, 3, 7, 9]) {
    g.fillStyle = 'rgba(30,28,26,0.14)';
    g.fillRect(0, y * T + T * 0.2, w, T * 0.6);
    rg.fillStyle = 'rgba(120,120,120,0.35)';
    rg.fillRect(0, y * T + T * 0.2, w, T * 0.6);
  }
  // patched potholes and long sealed cracks
  for (let i = 0; i < 12; i++) {
    const x = r() * w;
    const y = r() * h;
    g.fillStyle = 'rgba(28,28,28,0.5)';
    g.fillRect(x, y, 40 + r() * 90, 30 + r() * 60);
  }
  for (let i = 0; i < cols * rows * 0.25; i++)
    crack(g, r, r() * w, r() * h, 4 + Math.floor(r() * 8), 'rgba(16,14,12,0.6)', 2);
  // the steel finger expansion joints across the deck
  for (const x of [4, 11]) {
    const px = x * T;
    g.fillStyle = 'rgba(40,40,40,0.9)';
    g.fillRect(px - 9, 0, 18, h);
    for (let y = 0; y < h; y += 10) {
      g.fillStyle = 'rgba(150,150,146,0.85)';
      g.fillRect(px - 8, y, 7, 6);
      g.fillRect(px + 1, y + 5, 7, 6);
    }
    rg.fillStyle = 'rgba(80,80,80,1)';
    rg.fillRect(px - 9, 0, 18, h);
  }
  // lane lines: worn white dashes between the lanes, and the checkpoint lane (row 5) between solid
  // double yellow lines with rumble bars and STOP painted before the checkpoint
  g.setLineDash([64, 50]);
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(214,208,192,0.6)';
  for (const y of [2.5, 8.5]) {
    g.beginPath();
    g.moveTo(0, y * T);
    g.lineTo(w, y * T);
    g.stroke();
  }
  g.setLineDash([]);
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(214,172,48,0.78)';
  for (const y of [5 * T + 6, 5 * T + 15, 6 * T - 6, 6 * T - 15]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  for (const x of [1, 13])
    for (let k = 0; k < 4; k++) {
      g.fillStyle = 'rgba(214,172,48,0.6)';
      g.fillRect(x * T + k * 22, 5 * T + 24, 10, T - 48);
    }
  g.save();
  g.fillStyle = 'rgba(220,214,198,0.55)';
  g.font = 'bold 54px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.translate(2.5 * T, 5.5 * T);
  g.rotate(Math.PI / 2);
  g.fillText('STOP', 0, 0);
  g.restore();
  // skid marks and oil, then wind-blown sand: pale streaks lying east-west, heaped at the edges
  for (let i = 0; i < 7; i++) tyreTrack(g, r, w, h, 'rgba(18,16,14,0.25)');
  for (let i = 0; i < 18; i++) {
    const x = r() * w;
    const y = r() * h;
    stain(g, x, y, 20 + r() * 50, `rgba(12,12,12,${0.3 + r() * 0.3})`);
    stain(rg, x, y, 18 + r() * 40, 'rgba(40,40,40,0.7)');
  }
  for (let i = 0; i < 220; i++) {
    const edge = r() < 0.5;
    const y = edge ? (r() < 0.5 ? r() * T * 0.5 : h - r() * T * 0.5) : r() * h;
    const x = r() * w;
    g.fillStyle = `rgba(178,150,108,${edge ? 0.18 + r() * 0.2 : 0.06 + r() * 0.1})`;
    g.beginPath();
    g.ellipse(x, y, 30 + r() * 90, 3 + r() * 7, (r() - 0.5) * 0.12, 0, Math.PI * 2);
    g.fill();
  }
  // drainage scuppers along the north and south edges (rust bleeding from them)
  for (let x = 1; x < cols; x += 3)
    for (const y of [6, h - 18]) {
      g.fillStyle = 'rgba(30,26,22,0.9)';
      g.fillRect(x * T + 40, y, 48, 12);
      stain(g, x * T + 64, y + 6, 40, 'rgba(110,56,26,0.25)');
    }
  seams(g, cols, rows, 'rgba(24,22,20,0.3)', 2);
};

// --------------------------------------------------------------------------------------- the deck

/** Removes the shared street plane: here the ground is the lagoon, nine metres below the deck. */
function dropStreetPlane(ctx: SetContext): void {
  for (const o of [...ctx.statics.children]) {
    if (o instanceof Mesh && o.geometry instanceof PlaneGeometry && o.geometry.parameters.width >= 100) {
      ctx.statics.remove(o);
      o.geometry.dispose();
    }
  }
}

/** The deck surface around the board: lanes, edge lines, sand drifts and the checkpoint markings. */
function deckSurface(ctx: SetContext): void {
  const zc = (NORTH_EDGE + SOUTH_EDGE) / 2;
  streetPlane(
    ctx,
    'tm:deck',
    { x: 0, z: zc, w: 90, d: SOUTH_EDGE - NORTH_EDGE, ppm: 22 },
    (g: Paint, px, s, r) => {
      const W = 90 * s;
      const D = (SOUTH_EDGE - NORTH_EDGE) * s;
      g.fillStyle = '#6a665e';
      g.fillRect(0, 0, W, D);
      for (let i = 0; i < 16000; i++) {
        const v = r() < 0.5 ? 110 + r() * 50 : 40 + r() * 20;
        g.fillStyle = `rgba(${v},${v - 2},${v - 6},0.35)`;
        g.fillRect(r() * W, r() * D, 1 + r() * 2, 1 + r() * 2);
      }
      const line = (x0: number, z0: number, x1: number, z1: number): void => {
        const [a, b] = px(x0, z0);
        const [c, d] = px(x1, z1);
        g.beginPath();
        g.moveTo(a, b);
        g.lineTo(c, d);
        g.stroke();
      };
      // wheel paths, lane dashes, edge lines
      for (const z of [-4.6, -1.6, 1.6, 4.6]) {
        const [, b] = px(0, z);
        g.fillStyle = 'rgba(28,26,24,0.22)';
        g.fillRect(0, b - s * 0.5, W, s * 0.35);
        g.fillRect(0, b + s * 0.15, W, s * 0.35);
      }
      g.lineWidth = Math.max(3, s * 0.13);
      g.strokeStyle = 'rgba(214,208,192,0.65)';
      g.setLineDash([s * 2.4, s * 1.8]);
      for (const z of [-3.0, 3.0]) {
        line(-45, z, -8.3, z);
        line(8.3, z, 45, z);
      }
      g.setLineDash([]);
      line(-45, NORTH_EDGE + 0.55, 45, NORTH_EDGE + 0.55);
      line(-45, SOUTH_EDGE - 0.5, 45, SOUTH_EDGE - 0.5);
      // the checkpoint lane between double yellow lines
      g.strokeStyle = 'rgba(214,172,48,0.8)';
      g.lineWidth = Math.max(2, s * 0.09);
      for (const z of [-0.5, -0.38, 0.38, 0.5]) {
        line(-45, z, -8.3, z);
        line(8.3, z, 45, z);
      }
      // rumble bars and STOP before the arm
      for (let k = 0; k < 6; k++) {
        const [a, b] = px(-9.0 - k * 0.32, -0.3);
        g.fillStyle = 'rgba(214,172,48,0.7)';
        g.fillRect(a, b, s * 0.14, s * 0.6);
      }
      {
        const [a, b] = px(-15.4, 0);
        g.save();
        g.translate(a, b);
        g.rotate(-Math.PI / 2);
        g.fillStyle = 'rgba(220,214,198,0.7)';
        g.font = `bold ${Math.round(s * 0.5)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('STOP', 0, 0);
        g.restore();
      }
      // sand blown up against the parapets and in streaks along the wind
      for (let i = 0; i < 260; i++) {
        const z = r() < 0.5 ? NORTH_EDGE + 0.3 + r() * 1.0 : SOUTH_EDGE - 0.3 - r() * 0.9;
        const [a, b] = px(-45 + r() * 90, r() < 0.7 ? z : NORTH_EDGE + r() * (SOUTH_EDGE - NORTH_EDGE));
        g.fillStyle = `rgba(180,152,110,${0.12 + r() * 0.22})`;
        g.beginPath();
        g.ellipse(a, b, s * (0.6 + r() * 2.4), s * (0.06 + r() * 0.16), 0, 0, Math.PI * 2);
        g.fill();
      }
      // the expansion joints run on across the whole deck
      for (const x of [-25, 25]) {
        const [a] = px(x, 0);
        g.fillStyle = 'rgba(40,40,40,0.9)';
        g.fillRect(a - 3, 0, 6, D);
      }
      // skid marks and oil
      for (let i = 0; i < 40; i++) {
        const [a, b] = px(-45 + r() * 90, NORTH_EDGE + r() * (SOUTH_EDGE - NORTH_EDGE));
        g.fillStyle = `rgba(14,12,10,${0.15 + r() * 0.25})`;
        g.beginPath();
        g.ellipse(a, b, s * (0.3 + r() * 1.2), s * (0.15 + r() * 0.4), r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    },
  );
}

/** The Nigerian flag (green-white-green), sun-faded and frayed. */
function nigeriaFlag() {
  return painted(
    'tm:flag',
    96,
    64,
    (g, r) => {
      g.fillStyle = '#1e7a3e';
      g.fillRect(0, 0, 32, 64);
      g.fillStyle = '#e8e6dc';
      g.fillRect(32, 0, 32, 64);
      g.fillStyle = '#1e7a3e';
      g.fillRect(64, 0, 32, 64);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(30,24,18,${r() * 0.15})`;
        g.fillRect(r() * 96, r() * 64, 2 + r() * 8, 1 + r() * 4);
      }
      g.clearRect(88, 0, 8, 6);
      g.clearRect(90, 50, 6, 14);
    },
    false,
    95,
  );
}

function build(ctx: SetContext): void {
  const P = bridgePalette();
  const site = sitePalette();
  const L = new SiteLights();
  dropStreetPlane(ctx);

  // ------------------------------------------------------------ the bridge and the drop to the water
  lagoonWater(ctx);
  bridgeDeck(ctx, P, NORTH_EDGE, SOUTH_EDGE);
  deckSurface(ctx);
  parapetX(ctx, -45, 45, NORTH_EDGE + 0.25, P.parapet, { face: 1, rail: P.rail, h: 0.8 });
  // camera side: a low parapet only (no rail, no lamps)
  parapetX(ctx, -45, 45, SOUTH_EDGE - 0.25, P.parapet, { face: -1, h: 0.72 });
  for (const x of [-21, -13, -5, 5, 13, 21])
    lampStandard(ctx, L, x, NORTH_EDGE + 0.3, { h: 5.2, dir: 0, reach: 0.7, lit: true, color: 0xffa848 });

  // ------------------------------------------------------------ the lagoon below
  makoko(ctx, P, -12, -28, 11);
  canoe(ctx, P, -3.5, -22.5, 1.2);
  canoe(ctx, P, 5.5, -25, 2.0, 4.6);
  canoe(ctx, P, 15, -21.5, 0.4);
  canoe(ctx, P, -22, -23, 2.6, 4.2);
  dredger(ctx, P, 17, -31, 0.25);
  skylineAcross(ctx, P, -78);

  // ------------------------------------------------------------ west: the checkpoint
  const checkpoint = signTexture('tm:checkpoint', 512, 128, {
    bg: '#e0dac8',
    fg: '#8a1e16',
    border: '#8a1e16',
    lines: [['STOP • CHECKPOINT', 56]],
  });
  sentryBooth(ctx, P, L, -11.4, -3.0, Math.PI / 2 - 0.25, checkpoint);
  barrierArm(ctx, P, -12.0, -1.75, 1.6);
  spikeStrip(ctx, P, -13.2, -1.5, 1.5);
  sandbagWall(ctx, P, -9.4, -5.6, -12.4, -5.6, 3);
  sandbagWall(ctx, P, -9.4, 4.9, -11.6, 4.9, 2);
  const drumRed = mat(0x9a2a1e, { roughness: 0.65, metalness: 0.3 });
  const drumWhite = mat(0xc4beb0, { roughness: 0.65, metalness: 0.3 });
  for (const [x, z, k] of [
    [-9.1, -2.3, 0],
    [-9.7, 2.4, 1],
    [-10.6, 3.3, 0],
    [-13.6, -2.5, 1],
    [-14.4, 2.6, 0],
  ] as const)
    drum(ctx, k ? drumWhite : drumRed, x, z, { band: k ? drumRed : drumWhite });
  const pole = mat(0x4a4c4a, { roughness: 0.55, metalness: 0.6 });
  sign(ctx, checkpoint, -9.0, 1.55, -3.6, 1.3, 0.33, 0.45, { posts: 2, postMat: pole });
  const noOkada = signTexture('tm:noOkada', 256, 256, {
    bg: '#e0dac8',
    fg: '#1c1a16',
    border: '#9a2a1c',
    lines: [
      ['NO OKADA', 40],
      ['NO KEKE', 40],
      ['ON BRIDGE', 34],
    ],
  });
  sign(ctx, noOkada, 9.3, 1.8, -6.75, 0.62, 0.62, -0.3, { posts: 1, postMat: pole });
  const bridgeName = signTexture('tm:name', 512, 192, {
    bg: '#1f5a3c',
    fg: '#e8e6dc',
    border: '#e8e6dc',
    lines: [
      ['THIRD MAINLAND BRIDGE', 46],
      ['LAGOS ISLAND  →', 38],
      ['SPEED LIMIT 50', 30],
    ],
  });
  // cantilever sign over the north lanes east of the board
  ctx.statics.add(cyl(0.12, 0.14, 4.6, pole, 10.8, STREET + 2.3, NORTH_EDGE + 0.35, 8));
  ctx.statics.add(box(0.12, 0.12, 3.0, pole, 10.8, STREET + 4.4, NORTH_EDGE + 1.8));
  sign(ctx, bridgeName, 10.75, 3.75, NORTH_EDGE + 2.1, 2.0, 0.75, -Math.PI / 2 + 0.35);
  // the flag at the checkpoint and a rag tied to a lamp post, both snapping in the wind
  ctx.statics.add(cyl(0.035, 0.045, 4.4, pole, -12.4, STREET + 2.2, -4.9, 6));
  flag(ctx, -12.4, 4.3, -4.9, 1.3, 0.85, nigeriaFlag(), 1, 1.2);
  flag(
    ctx,
    -13.0,
    4.6,
    NORTH_EDGE + 0.3,
    0.5,
    0.18,
    painted('tm:rag', 32, 16, (g) => {
      g.fillStyle = '#9a2a1e';
      g.fillRect(0, 0, 32, 16);
    }),
    1,
    1.6,
  );
  // the officers' plastic chair under a beach umbrella pole, a kettle of tea on a crate
  const plastic = mat(0x2a5a8a, { roughness: 0.6 });
  ctx.statics.add(box(0.45, 0.05, 0.45, plastic, -10.4, STREET + 0.45, -4.6));
  ctx.statics.add(box(0.45, 0.45, 0.05, plastic, -10.4, STREET + 0.7, -4.85));
  for (const [dx, dz] of [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ] as const)
    ctx.statics.add(box(0.04, 0.45, 0.04, plastic, -10.4 + dx, STREET + 0.22, -4.6 + dz));

  // ------------------------------------------------------------ east: the go-slow
  const cabWhite = mat(0xd2ccc0, { roughness: 0.5, metalness: 0.2 });
  const blue = mat(0x2e5288, { roughness: 0.5, metalness: 0.2 });
  truck(
    ctx,
    P,
    'tanker',
    11.0,
    -3.0,
    -Math.PI / 2,
    cabWhite,
    P.red,
    mat(0xc4c0b6, { roughness: 0.4, metalness: 0.5 }),
  );
  truck(
    ctx,
    P,
    'container',
    11.2,
    3.1,
    -Math.PI / 2 - 0.02,
    blue,
    P.white,
    mat(0x8a3a24, { roughness: 0.7 }),
  );
  ctx.vehicles('danfo', [{ x: 11.4, y: STREET, z: 0.05, ry: -Math.PI / 2 }], { idle: true });
  ctx.vehicles('taxi', [
    { x: -10.0, y: STREET, z: 0.05, ry: -Math.PI / 2 }, // stopped at the arm
    { x: -16.8, y: STREET, z: 3.0, ry: -Math.PI / 2 + 0.02 },
    { x: 17.0, y: STREET, z: 0.0, ry: -Math.PI / 2 },
  ]);
  ctx.vehicles('danfo', [{ x: -17.5, y: STREET, z: -3.0, ry: -Math.PI / 2 }]);
  // a broken-down car's warning triangle and cones on the east shoulder (low)
  cones(
    ctx,
    site,
    [
      [9.0, 5.9],
      [9.9, 6.0],
      [10.8, 6.1],
    ],
    1,
  );

  // ------------------------------------------------------------ wind and haze
  windStreaks(
    ctx,
    [
      [-16, 16, NORTH_EDGE + 0.5, -6.4, 0.1],
      [8.4, 18, -5.5, 5.5, 0.1],
      [-18, -8.4, -5.5, 5.5, 0.1],
      [-30, 30, -22, -12, WATER - STREET + 0.2],
    ],
    7,
    1,
  );
  ctx.ambient.dust(0, NORTH_EDGE + 0.8, 16, 0.8);
  ctx.ambient.dust(-11, 0, 3, 5);
  ctx.ambient.dust(11, 0, 3, 5);
  L.build(ctx);

  // ------------------------------------------------------------ people (most visible first)
  const life = ctx.life;
  const y = STREET;
  life.add({ kind: 'argue', x: -11.3, y, z: 1.35, yaw: 0.2 }); // the taxi driver and the officer
  life.add({ kind: 'onlooker', x: -10.1, y, z: -2.05, yaw: 1.4 }); // the second officer by the booth
  life.add({ kind: 'walker', x: 8.9, y, z: -5.3, yaw: 0, toX: 8.9, toZ: 5.0 }); // a hawker in the go-slow
  life.add({ kind: 'onlooker', x: -3.0, y, z: NORTH_EDGE + 0.75, yaw: Math.PI }); // watching the lagoon
  life.add({ kind: 'conductor', x: 9.6, y, z: 1.25, yaw: -1.2, toX: 12.5, toZ: 1.25 });
  life.add({ kind: 'walker', x: -14, y, z: NORTH_EDGE + 0.8, yaw: 0, toX: 14, toZ: NORTH_EDGE + 0.8 });
  life.add({ kind: 'onlooker', x: 3.4, y, z: NORTH_EDGE + 0.7, yaw: Math.PI + 0.3 });
  life.add({ kind: 'argue', x: 9.4, y, z: -5.6, yaw: 1.4 }); // the tanker driver and a danfo driver
  life.add({ kind: 'onlooker', x: -3.5, y: WATER + 0.3, z: -22.5, yaw: 1.2 }); // a fisherman standing in his canoe
  life.add({ kind: 'walker', x: 12.5, y, z: 6.2, yaw: 0, toX: 16, toZ: 6.2 });
}

export const THIRD_MAINLAND_SET: ArenaSet = {
  build,
  // a bridge: no spectator stands, only the people stuck at the checkpoint (StreetLife)
  crowd: 0,
  crowdEdges: { north: false, east: false, west: false, south: false },
};
