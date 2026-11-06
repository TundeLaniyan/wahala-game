/**
 * City Rumble - EBUTE-METTA (presentation only; the board and hazards are `src/sim/arenas/rumbleEbuteMetta.ts`),
 * built from the Bible's Ebute-Metta section and the reference pack: the colonial terminus with its deep veranda on
 * white columns, green-teal trim and wooden signboard; the weatherboard heritage house (white boards with a glazing
 * strip, ochre columns, a hipped grey roof and a water tank); the modern station with its sweeping cantilever canopy
 * and glass-and-steel facade over a wide paved forecourt; ballasted track lanes between rail-bridge portals, freight
 * wagons and a signal cabin in the yard; the tan, red-balustraded Oyingbo market arcade; plastered mainland houses;
 * and the Oko-Baba foreshore with timber stacks and utilities. Beyond the board: the lagoon, a bridge on the far
 * horizon and the rail viaduct. Every name on a board is FICTIONAL; place and plain station wording only.
 */
import type { ArenaLook } from '../arenaLook';
import { timeOfDay } from '../timeOfDay';
import { box, mat } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import type { FloorDrawer } from './floorKit';
import { T } from './floorKit';
import type { CoverFactory } from './boardCover';
import { communityCover } from './community/factory';
import { building, house, kiosk, lockup, shelter, shop, stall, workshop } from './community/families';
import type { Family, Theme } from './community/kit';
import { board, box as cbox, cyl as ccyl, drum, pick } from './community/kit';
import { communityFloor } from './community/floor';
import { communityEnv } from './community/env';
import { nightLookOf } from './community/looks';
import {
  edgeStalls,
  streetLife,
  lampPost,
  lettered,
  plaque,
  railcars,
  skyline,
  viaduct,
} from './community/setKit';
import { streetPlane, umbrella as setUmbrella } from './oshodiKit';
import { shophouseRows } from './shared';
import { floorWords, layoutOf, mouthTraffic, tileWorld, zebraTile } from './rumbleV2Kit';
import type { StageEnvironment } from '../env/types';
import { EBUTE_WEST_DX, ebuteX } from '../../sim/arenas/ebuteWest';

const ID = 'rumbleEbuteMetta';
const cream = '#efe6d0';
/** Half the board width in metres (the board is `EBUTE_OLD_W + EBUTE_WEST_DX` = 75 tiles wide): world x of its west / east edge. */
const W_HALF = (55 + EBUTE_WEST_DX) / 2;

const THEME: Theme = {
  plaster: [0xc8b48e, 0xd2c6a6, 0xb88a64, 0xcfa88a, 0x9fb0a6, 0xc8c0a8, 0xb4a090],
  far: [0xb5654a, 0xd2c6a6, 0x9a4a32, 0xc89a78, 0x7a8aa0, 0xc8c0a8],
  tarps: [0xc83a2a, 0xe0b020, 0x2a6aa8, 0x2f8a4a, 0xe07a20, 0x7a3a8a],
  roofs: [0x9a4a32, 0x8a4a30, 0x7a8a8e, 0xa05a3a],
  accent: [0x2a6a74, 0x7a1e1e, 0x2e5a34, 0xc8a02a, 0x2e5a8e],
  shops: [
    { bg: '#7a1e1e', fg: '#f2e6c8', lines: [['OYINGBO TRADERS HALL', 26]], border: '#f2e6c8' },
    { bg: '#2e5a34', fg: '#f6e9c6', lines: [['IYA ABEKE PROVISIONS', 24]], border: '#f6e9c6' },
    { bg: '#e0b020', fg: '#1c1608', lines: [['RAILWAY SQUARE TAILORS', 22]] },
    { bg: '#1f5a8a', fg: cream, lines: [['MURTALA WAY HARDWARE', 24]], border: cream },
    { bg: '#16140f', fg: '#e8e0c8', lines: [['EBUTE BATTERIES & CABLES', 22]] },
  ],
  small: [
    { bg: '#2f6e3c', fg: cream, lines: [['PURE WATER', 24]] },
    { bg: '#e0b020', fg: '#1c1608', lines: [['TICKETS & RECHARGE', 18]] },
    { bg: '#a8241c', fg: cream, lines: [['SUYA', 34]] },
  ],
  seed: 341,
};

/**
 * The west's palette and boards (Ebute Metta West): older plastered houses in washed ochres, greens and pinks, corrugated
 * roofs, hand-painted generic shop names. The east objects keep THEME exactly (their variants and signs are unchanged).
 */
const THEME_WEST: Theme = {
  plaster: [0xcdb48a, 0xb8b894, 0xd4a890, 0xa8b49c, 0xc8a070, 0xd8ccb0, 0xb89a84],
  far: THEME.far,
  tarps: THEME.tarps,
  roofs: [0x8a4a30, 0x7a6a5a, 0x6a7478, 0xa05a3a],
  accent: [0x2e5a34, 0x7a1e1e, 0x2a5a8a, 0xc8a02a, 0x5a3a2a],
  shops: [
    { bg: '#2e5a34', fg: '#f6e9c6', lines: [['ILOGBO PROVISIONS', 24]], border: '#f6e9c6' },
    { bg: '#16140f', fg: '#e8e0c8', lines: [['APAPA ROAD AUTO PARTS', 20]] },
    { bg: '#7a1e1e', fg: '#f2e6c8', lines: [['GOODWILL BUKKA', 26]], border: '#f2e6c8' },
    { bg: '#1f5a8a', fg: cream, lines: [['NEW LIGHT TAILORS', 24]], border: cream },
    { bg: '#e0b020', fg: '#1c1608', lines: [['FRESH FISH & ICE', 24]] },
  ],
  small: [
    { bg: '#e0b020', fg: '#1c1608', lines: [['PHONE CHARGING', 16]] },
    { bg: '#2f6e3c', fg: cream, lines: [['LOTTO  RESULTS', 18]] },
    { bg: '#a8241c', fg: cream, lines: [['PEPPER SOUP', 20]] },
    { bg: '#1f5a8a', fg: cream, lines: [['AIRTIME & DATA', 18]] },
    { bg: '#2f6e3c', fg: cream, lines: [['PURE WATER', 24]] },
  ],
  seed: 347,
};

/** The expansion's own objects (see `composeCover` in the arena file): the ones standing west of the old board's west lane. */
const isWest = (r: { x: number; y: number; w: number }): boolean =>
  r.x + r.w <= EBUTE_WEST_DX + 2 && (r.x < EBUTE_WEST_DX || (r.y > 1 && r.y < 37));
/** A family that paints the west's palette for west objects and the original palette everywhere else. */
const forWest =
  (f: Family): Family =>
  (k, g, r, n) =>
    f(isWest(r) ? { ...k, theme: THEME_WEST } : k, g, r, n);

/** The colonial terminus: a long cream block with a deep veranda on white columns, teal trim, a hipped roof and a board. */
const terminus: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 4.2;
  cbox(
    k,
    g,
    k.concrete,
    r.w - 0.1,
    H,
    r.h - 0.3,
    r.cx,
    0,
    r.cz - 0.2,
    pick([0xe4dcc0, 0xdcd4b8, 0xe8e0c8], r.v + n),
  );
  cbox(k, g, k.paint, r.w, 0.2, r.h, r.cx, H - 0.6, r.cz, 0x2a6a64);
  for (const sgn of [-1, 1])
    cbox(
      k,
      g,
      k.paint,
      r.w + 0.4,
      0.07,
      (r.h + 0.6) / 2,
      r.cx,
      H + 0.2,
      r.cz + (sgn * (r.h + 0.6)) / 4,
      0x8a4a30,
      0,
      -sgn * 0.26,
    );
  cbox(k, g, k.concrete, r.w, 0.2, 1.1, r.cx, 2.5, zf + 0.5, 0xf4f0e0); // veranda roof
  for (let x = r.x; x <= r.x + r.w; x += 2) {
    ccyl(k, g, k.concrete, 0.14, 0.14, 2.5, k.wx(Math.min(x, r.x + r.w - 1)) - 0.5, 0, zf + 0.9, 0xf8f4e8, 8);
    ccyl(k, g, k.paint, 0.18, 0.18, 0.5, k.wx(Math.min(x, r.x + r.w - 1)) - 0.5, 0, zf + 0.9, 0x2a6a64, 8);
  }
  for (let x = r.x; x < r.x + r.w; x++) cbox(k, g, k.paint, 0.6, 1.5, 0.05, k.wx(x), 0.1, zf, 0x4a3a2a);
  board(
    k,
    g,
    k.atlas.board(`term${(r.v + n) % 2}`, 256, 40, {
      bg: '#e8e0c8',
      fg: '#16604a',
      lines: [[['EBUTE-METTA JUNCTION', 'EBUTE-METTA  •  LAGOS DISTRICT'][(r.v + n) % 2]!, 22]],
      border: '#16604a',
    }),
    Math.min(5, r.w - 0.5),
    0.55,
    r.cx,
    3.1,
    zf + 1.06,
  );
};

/** The weatherboard heritage house: white boards, a glazing strip, ochre columns, a hipped grey roof and a water tank. */
const heritageHouse: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 3.4;
  cbox(k, g, k.concrete, r.w - 0.2, H, r.h - 0.2, r.cx, 0, r.cz, 0xf0ece0);
  for (let y = 0.4; y < H; y += 0.28)
    cbox(k, g, k.paint, r.w - 0.18, 0.025, 0.02, r.cx, y, zf - 0.1, 0xd8d4c4);
  cbox(k, g, k.glow, r.w - 0.8, 0.5, 0.05, r.cx, 2.2, zf - 0.08, 0xa8c4cc);
  for (const sgn of [-1, 1])
    cbox(
      k,
      g,
      k.paint,
      r.w + 0.4,
      0.07,
      (r.h + 0.5) / 2,
      r.cx,
      H + 0.3,
      r.cz + (sgn * (r.h + 0.5)) / 4,
      0x6a6e72,
      0,
      -sgn * 0.3,
    );
  for (let x = r.x; x < r.x + r.w; x += 2)
    ccyl(k, g, k.paint, 0.14, 0.14, 2.3, k.wx(x), 0, zf + 0.3, 0xb88a2a, 8);
  cbox(k, g, k.paint, r.w - 1.4, 0.1, 0.9, r.cx, 2.4, zf + 0.35, 0xe8e0c8);
  ccyl(k, g, k.paint, 0.35, 0.35, 0.8, r.cx + r.w / 2 - 0.9, H + 0.8, r.cz - 0.4, 0x1a1a1c, 10);
  void n;
};

/** The modern station hall: a glass-and-steel multi-storey front and a long sweeping cantilever roof over the forecourt. */
const stationHall: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 5.4;
  cbox(k, g, k.concrete, r.w - 0.2, H, r.h - 0.2, r.cx, 0, r.cz, 0xcfd6d8);
  for (let f = 0; f < 4; f++) cbox(k, g, k.glow, r.w - 0.6, 0.7, 0.05, r.cx, 0.7 + f * 1.15, zf, 0x7ab0cc);
  // the canopy: two long slabs sweeping over the front, thin white edges
  cbox(k, g, k.paint, r.w + 0.6, 0.22, r.h * 0.5 + 1.2, r.cx, H, r.cz + r.h * 0.2, 0xe8eceb, 0, -0.16, 0);
  cbox(
    k,
    g,
    k.paint,
    r.w + 0.6,
    0.14,
    r.h * 0.5 + 0.6,
    r.cx,
    H + 0.55,
    r.cz - r.h * 0.1,
    0xd8dcda,
    0,
    -0.1,
    0,
  );
  for (let x = r.x; x < r.x + r.w; x += 2)
    ccyl(k, g, k.paint, 0.1, 0.1, H, k.wx(x) + 0.5, 0, zf + 0.7, 0xd0d4d6, 6);
  // anchor: ebute-station-sign. The name plate hangs low on the hall front (2.0-2.7 m: the follow camera shows a facade's
  // lowest ~2.5 m ahead of the player), large, white on green, with a second line for the district.
  board(
    k,
    g,
    k.atlas.board('stn', 384, 96, {
      bg: '#1d6a40',
      fg: '#f6f2e4',
      lines: [
        ['EBUTE-METTA', 44],
        ['STATION  •  PLATFORMS 1-4', 18],
      ],
      border: '#f6f2e4',
    }),
    Math.min(4.6, r.w + 0.6),
    0.92,
    r.cx,
    2.35,
    zf + 0.1,
  );
  void n;
};

/** A rail-bridge portal: a concrete abutment with an arched mouth facing the tracks and a danger board. */
const portal: Family = (k, g, r) => {
  const north = r.y < 16; // the north portal faces south, the south portal faces north
  cbox(k, g, k.concrete, r.w - 0.04, 3.2, r.h - 0.04, r.cx, 0, r.cz, 0x8a867c);
  const zf = north ? k.wz(r.y1) + 0.5 : k.wz(r.y) - 0.5;
  cbox(k, g, k.paint, r.w - 0.5, 2.2, 0.06, r.cx, 0.05, zf, 0x14181c);
  cbox(k, g, k.paint, r.w - 0.3, 0.3, 0.1, r.cx, 2.3, zf + (north ? 0.03 : -0.03), 0xa8a49a);
  cbox(k, g, k.paint, r.w - 0.7, 0.3, 0.05, r.cx, 3.25, zf + (north ? 0.05 : -0.05), 0xe0b020);
  // anchor: ebute-signal-gantry. A steel signal gantry on the abutment roof: two masts, a beam, three colour-light heads
  // (red, amber, green) facing the tracks. The face-mounted double lamp is the part the follow camera can see.
  const dir = north ? 1 : -1;
  for (const sgn of [-1, 1]) ccyl(k, g, k.metal, 0.07, 0.09, 2.6, r.cx + sgn * 0.85, 3.2, r.cz, 0xb8bcc0, 6);
  cbox(k, g, k.metal, 2.3, 0.14, 0.18, r.cx, 5.7, r.cz + dir * 0.1, 0xb8bcc0);
  const heads: [number, number][] = [
    [-0.7, 0xff3a2a],
    [0, 0xffb020],
    [0.7, 0x3aff5a],
  ];
  for (const [dx, col] of heads) {
    cbox(k, g, k.paint, 0.36, 0.7, 0.26, r.cx + dx, 4.95, r.cz + dir * 0.2, 0x16181a);
    for (const face of [-1, 1])
      cbox(k, g, k.glow, 0.2, 0.2, 0.05, r.cx + dx, 5.3, r.cz + dir * 0.2 + face * 0.15, col); // lit on both faces
  }
  for (const [dx, col] of [
    [-0.45, 0xff3a2a],
    [0.45, 0x3aff5a],
  ] as const) {
    cbox(k, g, k.paint, 0.3, 0.62, 0.12, r.cx + dx, 2.62, zf + dir * 0.1, 0x16181a); // face-mounted lamp box over the arch
    cbox(k, g, k.glow, 0.17, 0.17, 0.04, r.cx + dx, 3.0, zf + dir * 0.17, col);
    cbox(k, g, k.glow, 0.17, 0.17, 0.04, r.cx + dx, 2.7, zf + dir * 0.17, 0xffb020);
  }
};

/** A platform canopy post with its roof slab over the platform. */
const platformPost: Family = (k, g, r) => {
  ccyl(k, g, k.metal, 0.08, 0.08, 3.0, r.cx, 0, r.cz, 0x4a4e52, 6);
  cbox(k, g, k.paint, 2.4, 0.12, 1.4, r.cx + (r.x < 27 ? 0.6 : -0.6), 3.0, r.cz, 0xd8dcda);
  // the platform name sign (anchor: ebute-station-sign): blue-and-white board facing the camera
  board(
    k,
    g,
    k.atlas.board('platform-name', 256, 48, {
      bg: '#1d4f8a',
      fg: '#ffffff',
      lines: [['EBUTE-METTA', 28]],
      border: '#ffffff',
    }),
    1.5,
    0.3,
    r.cx,
    2.1,
    r.cz + 0.12,
  );
};

/** Freight wagons on a siding (anchor: ebute-rail-yard with the ballasted tracks between solid portals and the yard cabin): boxcars in rust brown and faded blue on black bogies. */
const wagon: Family = (k, g, r, n) => {
  for (let j = 0; j < r.h; j++)
    for (let i = 0; i < r.w; i += 4) {
      const x = k.wx(r.x + i) + 1.5;
      const z = k.wz(r.y + j);
      cbox(k, g, k.paint, 3.7, 0.3, 0.9, x, 0.2, z, 0x1a1a1c);
      cbox(
        k,
        g,
        k.paint,
        3.6,
        1.6,
        0.95,
        x,
        0.5,
        z,
        pick([0x7a4a30, 0x4a6a86, 0x8a6a3a, 0x5a5a56], i + j + n + r.v),
      );
      cbox(k, g, k.paint, 3.6, 0.1, 0.99, x, 1.4, z, 0x3a3a38);
    }
};

/** The signal cabin: a small brick room with a window band, a pitched roof and relay cabinets. */
const cabin: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  cbox(k, g, k.concrete, r.w - 0.2, 2.4, r.h - 0.2, r.cx, 0, r.cz, 0xa05a3a);
  cbox(k, g, k.glow, r.w - 0.8, 0.5, 0.05, r.cx, 1.4, zf, 0xe6c880);
  cbox(k, g, k.zinc, r.w + 0.2, 0.06, r.h + 0.3, r.cx, 2.4, r.cz, 0x7a8a8e, 0, -0.1);
  // anchor: ebute-rail-yard. The yard's signal cabin carries its board and a semaphore signal mast beside the track.
  board(
    k,
    g,
    k.atlas.board('cabin', 256, 40, {
      bg: '#e8e0c8',
      fg: '#7a1e1e',
      lines: [['YARD CABIN  •  KEEP CLEAR', 18]],
      border: '#7a1e1e',
    }),
    Math.min(2.0, r.w),
    0.3,
    r.cx,
    2.0,
    zf + 0.05,
  );
  const mx = k.wx(r.x + r.w - 1) + 0.35;
  ccyl(k, g, k.metal, 0.06, 0.08, 4.0, mx, 0, zf - 0.1, 0x4a4e52, 6);
  cbox(k, g, k.paint, 1.0, 0.18, 0.05, mx + 0.4, 3.9, zf - 0.1, 0xc83a2a, 0, 0, -0.35); // semaphore arm
  cbox(k, g, k.glow, 0.18, 0.18, 0.05, mx, 4.1, zf, 0xff3a2a);
  void n;
};

/** The Oyingbo market arcade: a tan multi-storey block with arched bays and red balustrades, shop signs below. */
const marketArcade: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 5.6;
  cbox(
    k,
    g,
    k.concrete,
    r.w - 0.1,
    H,
    r.h - 0.1,
    r.cx,
    0,
    r.cz,
    pick([0xd8c4a0, 0xe0c8a4, 0xd2bc98], r.v + n),
  );
  for (let f = 0; f < 3; f++) {
    cbox(k, g, k.paint, r.w, 0.35, 0.14, r.cx, 1.0 + f * 1.5, zf + 0.07, 0xb83a2a); // red balustrade
    for (let x = r.x; x < r.x + r.w; x++)
      cbox(k, g, k.paint, 0.5, 0.8, 0.05, k.wx(x), 1.25 + f * 1.5, zf, 0x2a1e18);
  }
  cbox(k, g, k.concrete, r.w + 0.1, 0.3, r.h + 0.1, r.cx, H, r.cz, 0xa89878);
  for (let x = r.x; x < r.x + r.w; x++) cbox(k, g, k.paint, 0.8, 0.9, 0.05, k.wx(x), 0.1, zf, 0x16120e);
  board(
    k,
    g,
    k.atlas.board('oyb', 256, 40, {
      bg: '#7a1e1e',
      fg: '#f2e6c8',
      lines: [['OYINGBO MARKET', 26]],
      border: '#f2e6c8',
    }),
    Math.min(4, r.w - 0.5),
    0.42,
    r.cx,
    2.0,
    zf + 0.1,
  );
};

/** A tree of the garden / boulevard (trunk and a rounded crown). */
const tree: Family = (k, g, r, n) => {
  for (let j = 0; j < r.h; j++)
    for (let i = 0; i < r.w; i++) {
      const x = k.wx(r.x + i);
      const z = k.wz(r.y + j);
      ccyl(k, g, k.paint, 0.12, 0.18, 1.8, x, 0, z, 0x6a4a30, 6);
      for (let t = 0; t < 3; t++)
        ccyl(
          k,
          g,
          k.paint,
          0.5 - t * 0.12,
          0.95 - t * 0.14,
          0.7,
          x,
          1.4 + t * 0.55,
          z,
          pick([0x3a7a3a, 0x4a8a3a, 0x2f6a34], r.v + n + t),
          9,
        );
    }
};

/** Timber stacks on the foreshore (a transition landscape: stacks, planks and cut logs, not a full sawmill). */
const timberStack: Family = (k, g, r, n) => {
  const woods = [0xb98c5a, 0xa77a4a, 0xc99a68, 0x8a6a46];
  for (let j = 0; j < r.h; j++)
    for (let layer = 0; layer < 4; layer++)
      cbox(
        k,
        g,
        k.paint,
        r.w - 0.2,
        0.2,
        0.82,
        r.cx,
        layer * 0.22,
        k.wz(r.y + j),
        pick(woods, layer + j + n + r.v),
      );
  cbox(k, g, k.paint, r.w - 0.3, 0.05, r.h - 0.3, r.cx, 0.95, r.cz, pick(k.theme.tarps, r.v + n), 0, 0, 0.05);
};

/** Utility cabinets and a transformer on a plinth at the water edge. */
const utility: Family = (k, g, r, n) => {
  cbox(k, g, k.concrete, r.w - 0.2, 0.3, r.h - 0.2, r.cx, 0, r.cz, 0x8a867c);
  cbox(
    k,
    g,
    k.paint,
    r.w - 0.6,
    1.5,
    r.h - 0.6,
    r.cx,
    0.3,
    r.cz,
    pick([0x7a8a8e, 0x5a6a66, 0x8a8a72], r.v + n),
  );
  cbox(k, g, k.paint, r.w - 0.5, 0.1, r.h - 0.5, r.cx, 1.8, r.cz, 0x3a3e42);
};

// ---------------------------------------------------------------------------------------------------------------
// Ebute Metta WEST (docs/EBUTE_METTA_WEST.md). Every board text below is FICTIONAL generic wording (no real business).
// ---------------------------------------------------------------------------------------------------------------

/**
 * An older plastered mainland house, two or three storeys ("face-me-I-face-you" frontage): louvred shutters in rows,
 * a shared balcony with a metal rail, a lean corrugated roof, rain-streaked plaster, and (every other house) a timber
 * utility pole with a cross-arm standing at its east end.
 */
const oldHouse: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const floors = 2 + ((r.v + n) % 2);
  const fh = 2.3;
  const H = floors * fh + 0.2;
  const wall = pick(k.theme.plaster, r.v * 3 + n + 1);
  cbox(k, g, k.concrete, r.w - 0.1, H, r.h - 0.1, r.cx, 0, r.cz, wall);
  cbox(k, g, k.concrete, r.w, 0.3, r.h, r.cx, 0, r.cz, 0x5a5650);
  for (let f = 0; f < floors; f++) {
    const y0 = 0.75 + f * fh;
    for (let x = r.x; x <= r.x1; x++) {
      const px = k.wx(x);
      cbox(k, g, k.paint, 0.5, 0.95, 0.04, px, y0, zf, 0x24342c); // shuttered window
      for (let s = 0; s < 4; s++)
        cbox(k, g, k.paint, 0.46, 0.04, 0.05, px, y0 + 0.12 + s * 0.22, zf + 0.01, 0x4a5e50);
    }
    if (f >= 1) {
      cbox(k, g, k.concrete, r.w - 0.2, 0.12, 0.5, r.cx, f * fh - 0.02, zf + 0.25, 0xcfc7b2); // shared balcony slab
      cbox(k, g, k.metal, r.w - 0.2, 0.45, 0.04, r.cx, f * fh + 0.1, zf + 0.5, 0x3a3a38); // its rail
    }
  }
  cbox(k, g, k.paint, 0.7, 1.5, 0.05, k.wx(r.x) + 0.1, 0.2, zf + 0.01, pick(k.theme.accent, r.v + n)); // front door
  for (let x = r.x; x <= r.x1; x++)
    // rain streaks under the sills
    cbox(k, g, k.paint, 0.06, 0.7, 0.02, k.wx(x) + 0.28, 0.5 + (x % 2) * 0.1, zf + 0.02, 0x6a604e);
  cbox(k, g, k.zinc, r.w + 0.2, 0.06, r.h + 0.25, r.cx, H, r.cz, pick(k.theme.roofs, r.v * 2 + n), 0, -0.09);
  if ((r.v + n) % 2 === 0) {
    const px = k.wx(r.x1) + 0.52;
    ccyl(k, g, k.metal, 0.06, 0.08, H + 1.3, px, 0, zf - 0.2, 0x6a5a48, 6); // utility pole
    cbox(k, g, k.paint, 1.1, 0.06, 0.06, px, H + 1.0, zf - 0.2, 0x4a3e30);
    for (const dx of [-0.45, 0, 0.45])
      ccyl(k, g, k.metal, 0.02, 0.02, 0.1, px + dx, H + 1.06, zf - 0.2, 0xd8d8d0, 5);
  }
};

/**
 * A walled compound: a perimeter wall with a steel gate (and coping), the house roof and a water tank visible inside, a
 * shade tree in the yard. The wall is what the player sees; the board tile is solid.
 */
const compound: Family = (k, g, r, n) => {
  const zS = k.wz(r.y1) + 0.4;
  const zN = k.wz(r.y) - 0.4;
  const wallCol = pick([0xcfc2a4, 0xbfb69c, 0xd6cdb6, 0xa8a592], r.v + n);
  cbox(k, g, k.concrete, r.w - 0.04, 1.95, 0.2, r.cx, 0, zS, wallCol);
  cbox(k, g, k.concrete, r.w - 0.04, 1.95, 0.2, r.cx, 0, zN, wallCol);
  for (const sx of [-1, 1])
    cbox(k, g, k.concrete, 0.2, 1.95, r.h - 0.04, r.cx + sx * (r.w / 2 - 0.12), 0, r.cz, wallCol);
  cbox(k, g, k.concrete, r.w + 0.08, 0.1, 0.34, r.cx, 1.95, zS, 0x8a867c); // coping
  for (let x = r.x; x <= r.x1; x += 2) cbox(k, g, k.concrete, 0.34, 2.2, 0.34, k.wx(x), 0, zS, 0xb4ae9c); // pillars
  cbox(
    k,
    g,
    k.metal,
    Math.min(1.5, r.w - 0.8),
    1.7,
    0.06,
    r.cx,
    0.05,
    zS + 0.12,
    pick([0x2a3036, 0x3a2a24, 0x24302a], r.v),
  );
  // inside: the house under a hipped zinc roof, a tank on a stand, one shade tree
  cbox(k, g, k.concrete, r.w - 1.0, 3.0, r.h - 1.2, r.cx, 0, r.cz, pick(k.theme.plaster, r.v * 2 + n));
  cbox(k, g, k.zinc, r.w - 0.5, 0.07, r.h - 0.7, r.cx, 3.0, r.cz, pick(k.theme.roofs, r.v + n), 0, -0.1);
  ccyl(k, g, k.paint, 0.32, 0.32, 0.7, r.cx - r.w / 2 + 0.9, 3.15, r.cz - 0.1, 0x1a1a1c, 10);
  ccyl(k, g, k.paint, 0.1, 0.14, 1.4, r.cx + r.w / 2 - 0.9, 0, r.cz + 0.2, 0x6a4a30, 6);
  ccyl(
    k,
    g,
    k.paint,
    0.2,
    0.7,
    1.1,
    r.cx + r.w / 2 - 0.9,
    1.3,
    r.cz + 0.2,
    pick([0x3a7a3a, 0x4a8a3a], r.v + n),
    8,
  );
};

/**
 * An Apapa Road trailer bay: a flatbed with a ribbed container, or a tanker barrel (alternating), parked nose to tail
 * with a cab on some. Plain colours and stencilled numbers only, no company marks.
 */
const trailer: Family = (k, g, r, n) => {
  const zS = k.wz(r.y1);
  const tanker = (r.v + n) % 2 === 1;
  const hasCab = (r.v + n) % 3 !== 0;
  const L = r.w - (hasCab ? 1.55 : 0.3);
  const x0 = r.cx - r.w / 2 + 0.15 + L / 2;
  const depth = Math.min(1.8, r.h - 0.3);
  const body = pick([0x2a6a8a, 0x8a3a2a, 0x3a6a4a, 0x8a7a3a, 0x5a5a62, 0xb0a890], r.v * 2 + n);
  cbox(k, g, k.paint, L, 0.28, depth * 0.8, x0, 0.5, r.cz, 0x1a1a1c); // chassis
  for (const ax of [-0.32, -0.12, 0.28])
    // axle sets
    for (const sz of [-1, 1])
      drum(
        k,
        g,
        k.paint,
        0.36,
        0.3,
        x0 + ax * L,
        0.36,
        r.cz + sz * depth * 0.42,
        0x141416,
        Math.PI / 2,
        0,
        10,
      );
  if (tanker) {
    ccyl(
      k,
      g,
      k.paint,
      0.78,
      0.78,
      L - 0.3,
      x0,
      1.5 - (L - 0.3) / 2,
      r.cz,
      pick([0xbdb8ac, 0xa8aeb0, 0x8a9aa4], r.v + n),
      12,
      0,
      Math.PI / 2,
    );
    cbox(k, g, k.paint, L - 0.5, 0.12, 0.4, x0, 2.2, r.cz, 0x3a3a3c); // walkway
  } else {
    cbox(k, g, k.paint, L - 0.2, 2.1, depth, x0, 0.8, r.cz, body);
    for (let x = 0; x < L - 0.4; x += 0.45)
      cbox(k, g, k.paint, 0.07, 2.0, 0.04, x0 - L / 2 + 0.3 + x, 0.85, zS + depth / 2 - 0.02, 0x00000a); // corrugation ribs
  }
  if (hasCab) {
    const cx = r.cx + r.w / 2 - 0.75;
    cbox(
      k,
      g,
      k.paint,
      1.2,
      1.7,
      depth,
      cx,
      0.45,
      r.cz,
      pick([0xc8c0a8, 0xa83a2a, 0x2a5a8a, 0xd0a020], r.v + n + 2),
    );
    cbox(k, g, k.glow, 0.05, 0.6, depth - 0.4, cx + 0.6, 1.35, r.cz, 0x9ab8c4); // windscreen
    for (const sz of [-1, 1])
      drum(k, g, k.paint, 0.38, 0.3, cx, 0.38, r.cz + sz * depth * 0.42, 0x141416, Math.PI / 2, 0, 10);
  }
};

/** A shop under a big rooftop hoarding: a low front with shutters, a steel frame carrying an invented message. */
const hoardingShop: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 2.6;
  cbox(k, g, k.concrete, r.w - 0.04, H, r.h - 0.04, r.cx, 0, r.cz, pick(k.theme.plaster, r.v * 2 + n));
  cbox(k, g, k.concrete, r.w + 0.06, 0.16, r.h + 0.06, r.cx, H, r.cz, 0x8a8276);
  for (let x = r.x; x <= r.x1; x++) {
    cbox(k, g, k.paint, 0.8, 1.6, 0.04, k.wx(x), 0.02, zf, 0x16140f);
    cbox(k, g, k.zinc, 0.84, 0.6, 0.05, k.wx(x), 1.0, zf + 0.02, 0x7a8288);
  }
  for (const sx of [-1, 1])
    ccyl(k, g, k.metal, 0.06, 0.07, 2.3, r.cx + sx * (r.w / 2 - 0.35), H, r.cz, 0x4a4e52, 6);
  const msgs = [
    ['NEW HOMES  •  PLOTS AVAILABLE', '#1f5a8a', '#f6f0dc'],
    ['SOLAR  •  INVERTERS  •  BATTERIES', '#e0b020', '#1c1608'],
    ['FRESH BREAD EVERY MORNING', '#7a1e1e', '#f6f0dc'],
    ['WASH YOUR HANDS  •  KEEP LAGOS CLEAN', '#2e5a34', '#f6f0dc'],
  ];
  const m = msgs[(r.v + n) % msgs.length]!;
  board(
    k,
    g,
    k.atlas.board(`hoard${(r.v + n) % msgs.length}`, 384, 112, {
      bg: m[1]!,
      fg: m[2]!,
      lines: [[m[0]!, 20]],
      border: m[2]!,
    }),
    Math.min(3.6, r.w - 0.2),
    1.2,
    r.cx,
    H + 1.65,
    zf - 0.1,
  );
};

/** Canoes on their timber slips at the Otumara waterfront: tarred hulls on cradles, paddles, a pile of net floats. */
const boatSlip: Family = (k, g, r, n) => {
  for (let j = 0; j < r.h; j++) {
    const z = k.wz(r.y + j);
    const hull = pick([0x6a4a30, 0x2a5a6a, 0x8a3a2a, 0x7a6a3a, 0x3a3a3c], r.v + n + j);
    const L = r.w - 0.5;
    for (const dx of [-0.3, 0.3]) cbox(k, g, k.paint, 0.18, 0.28, 0.9, r.cx + dx * L, 0, z, 0x4a3a28); // cradles
    cbox(k, g, k.paint, L, 0.5, 0.82, r.cx, 0.28, z, hull);
    cbox(k, g, k.paint, 0.5, 0.45, 0.5, r.cx + L / 2 + 0.05, 0.4, z, hull, 0, 0, 0.5); // raised bow
    cbox(k, g, k.paint, L - 0.3, 0.06, 0.6, r.cx, 0.78, z, 0x2a2018); // dark inside
    cbox(k, g, k.paint, 0.07, 1.5, 0.07, r.cx - L / 2 + 0.4, 0.3, z + 0.3, 0xb89a68, 0, 0, 0.5); // paddle
    if ((j + r.v) % 2 === 0)
      for (let i = 0; i < 3; i++)
        ccyl(
          k,
          g,
          k.paint,
          0.1,
          0.1,
          0.2,
          r.cx + (i - 1) * 0.5,
          0.78,
          z + 0.1,
          [0xe07a20, 0xc83a2a, 0xe0b020][i]!,
          6,
        );
  }
};

/** A signal post on the disused Ilogbo rail spur: a short mast with a rusted colour light and a yellow cross-buck. */
const signalPost: Family = (k, g, r) => {
  cbox(k, g, k.concrete, 0.7, 0.25, 0.7, r.cx, 0, r.cz, 0x8a867c);
  ccyl(k, g, k.metal, 0.07, 0.09, 3.6, r.cx, 0.25, r.cz, 0x7a5a42, 6);
  cbox(k, g, k.paint, 0.34, 0.7, 0.26, r.cx, 3.4, r.cz, 0x2a2420);
  cbox(k, g, k.glow, 0.18, 0.18, 0.05, r.cx, 3.88, r.cz + 0.15, 0xff3a2a);
  for (const rz of [0.6, -0.6])
    cbox(k, g, k.paint, 1.3, 0.16, 0.04, r.cx, 2.3, r.cz + 0.12, 0xe8c828, 0, 0, rz); // cross-buck
};

const FAMILIES: Record<string, Family> = {
  building: forWest(building),
  shop: forWest(shop),
  lockup: forWest(lockup),
  kiosk: forWest(kiosk),
  stall: forWest(stall),
  house: forWest(house),
  shelter,
  terminus,
  heritageHouse,
  stationHall,
  portal,
  platformPost,
  wagon,
  cabin,
  marketArcade,
  tree,
  timberStack: forWest(timberStack),
  utility,
  oldHouse,
  compound,
  workshop: forWest(workshop),
  trailer,
  hoardingShop,
  boatSlip,
  signalPost,
};
const REACH: Record<string, number> = {
  building: 3,
  shop: 3,
  lockup: 1,
  kiosk: 2,
  stall: 1,
  house: 2,
  shelter: 2,
  terminus: 3,
  heritageHouse: 2,
  stationHall: 3,
  portal: 3,
  platformPost: 2,
  wagon: 2,
  cabin: 2,
  marketArcade: 3,
  tree: 2,
  timberStack: 1,
  utility: 2,
  oldHouse: 3,
  compound: 2,
  workshop: 2,
  trailer: 2,
  hoardingShop: 3,
  boatSlip: 1,
  signalPost: 2,
};
export const RUMBLE_EBUTE_METTA_COVER: CoverFactory = communityCover({
  arenaId: ID,
  theme: THEME,
  families: FAMILIES,
  reach: REACH,
});

export const RUMBLE_EBUTE_METTA_LOOK: ArenaLook = {
  // warm hazy afternoon over rail steel, old brick and the lagoon: long shadows, a copper cast in the haze
  sky: 0xb0a48c,
  fog: { color: 0xa89c84, near: 62, far: 220 },
  sun: { color: 0xffd8a8, intensity: 4.4, position: [-9, 21, 12] },
  hemi: { sky: 0xe4d6bc, ground: 0x6a5a48, intensity: 1.4 },
  envIntensity: 0.55,
  exposure: 1.12,
  floorTint: 0xc8b49c,
  pillarTint: 0xdcd0bc,
  softTint: 0xc8b8a0,
  slab: 0x6a5a48,
  street: 0x3a3c3e,
  grit: { tone: 0x7a604a, dirt: 0x543e2e, dust: 0x8a6e54 },
  lamps: [
    [-W_HALF + 0.1, 2.4, -6, 0xffb868],
    [W_HALF - 0.1, 2.4, 8, 0xffb868],
  ],
};
export const RUMBLE_EBUTE_METTA_NIGHT_LOOK: ArenaLook = nightLookOf(RUMBLE_EBUTE_METTA_LOOK, [
  [-W_HALF + 0.1, 2.6, -6, 0xffb868],
  [W_HALF - 0.1, 2.6, 8, 0xffb868],
  [-W_HALF + 0.1, 2.6, 12, 0xffa850],
  [W_HALF - 0.1, 2.6, -12, 0xffa850],
  [8, 2.6, -19.4, 0xe8f4ff], // over the station forecourt (the old board's centre, 10 m east of the new one)
  [13, 2.6, -19.4, 0xe8f4ff],
  [10, 2.6, 19.4, 0xffa850],
]);

export const RUMBLE_EBUTE_METTA_FLOOR: FloorDrawer = communityFloor(ID, {
  seed: 3411,
  base: [168, 144, 118],
  dust: 'rgba(150,100,60,',
  road: [60, 58, 56],
  pavers: [172, 156, 136],
  tint: {
    heritage: 'rgba(90,130,80,0.18)',
    station: 'rgba(170,170,160,0.16)',
    oyingbo: 'rgba(150,80,50,0.10)',
    residential: 'rgba(120,100,80,0.12)',
    railYard: 'rgba(60,56,52,0.22)',
    foreshore: 'rgba(110,100,80,0.16)',
    // Ebute Metta West: washed plaster, road dust, damp ground by the water
    abuleIjesha: 'rgba(130,110,84,0.12)',
    apapaRoad: 'rgba(70,64,58,0.16)',
    ilogbo: 'rgba(120,98,74,0.14)',
    otumara: 'rgba(80,100,104,0.18)',
  },
  extra: (g, rg, layout, r) => {
    // ballast, sleepers and shining rails on the two track lanes; the level crossing across the road; platform edge lines
    const ty0 = 10;
    const ty1 = 26;
    const tx = ebuteX(26);
    g.fillStyle = 'rgba(96,90,84,0.95)';
    g.fillRect(tx * T, ty0 * T, 2 * T, (ty1 - ty0 + 1) * T);
    for (let y = ty0 * 4; y < (ty1 + 1) * 4; y++) {
      g.fillStyle = 'rgba(54,40,30,0.9)';
      g.fillRect(tx * T + 6, (y / 4) * T + 4, 2 * T - 12, 12);
    }
    g.fillStyle = 'rgba(190,194,198,0.95)';
    for (const x of [0.2, 0.8, 1.2, 1.8]) g.fillRect((tx + x) * T - 3, ty0 * T, 6, (ty1 - ty0 + 1) * T);
    for (let y = 16; y <= 19; y++)
      for (const x of [tx, tx + 1]) {
        g.fillStyle = 'rgba(70,66,62,0.8)';
        g.fillRect(x * T, y * T, T, T);
        g.fillStyle = 'rgba(190,194,198,0.9)';
        for (const rx of [0.2, 0.8]) g.fillRect(x * T + rx * T - 3, y * T, 6, T);
      }
    g.fillStyle = 'rgba(232,206,60,0.8)';
    for (const x of [ebuteX(23) + 0.9, ebuteX(28) + 0.95]) g.fillRect(x * T, 10 * T, 6, 6 * T);
    westFloor(g, layout, r);
    void rg;
  },
});

/**
 * The west's floor (everything left of the old board's west lane): a worn zebra and the road words of Apapa Road, drain
 * slabs along the house feet, an open drainage channel to the lagoon, and the DISUSED Ilogbo rail spur - rusted rails
 * flush with the ground in weeds, a buffer stop at its dead end. It is scenery only (no sim tile, no hazard, no ballast
 * and no lane lights, so it can never be read as the live track lanes).
 */
function westFloor(g: CanvasRenderingContext2D, layout: readonly string[], r: () => number): void {
  const xe = EBUTE_WEST_DX + 1;
  // Apapa Road: a faded zebra and the road name in worn paint
  for (let y = 16; y <= 19; y++) zebraTile(g, 9, y, true, 0.5);
  floorWords(g, 'APAPA RD', 5, 17.5, 0.5, 'rgba(226,214,170,0.32)');
  floorWords(g, 'APAPA RD', 15, 18.5, 0.5, 'rgba(226,214,170,0.32)', Math.PI);
  // drain slabs: concrete covers with a grating along the south foot of the houses, every few tiles
  for (let y = 2; y < 37; y++)
    for (let x = 2; x <= xe; x++) {
      if (layout[y]?.[x] !== '.' || layout[y - 1]?.[x] !== '#' || (x * 7 + y * 13) % 5 !== 0) continue;
      g.fillStyle = 'rgba(96,90,82,0.9)';
      g.fillRect(x * T + 6, y * T, T - 12, 20);
      g.fillStyle = 'rgba(30,28,26,0.85)';
      for (let i = 0; i < 6; i++) g.fillRect(x * T + 14 + i * 14, y * T + 4, 6, 12);
    }
  // the open drainage channel behind the Otumara slips: dark water between two kerbs, running to the lagoon wall
  g.fillStyle = 'rgba(52,64,60,0.9)';
  g.fillRect(2 * T, 36 * T + 70, (xe - 1) * T, 24);
  g.fillStyle = 'rgba(180,176,160,0.7)';
  g.fillRect(2 * T, 36 * T + 64, (xe - 1) * T, 6);
  g.fillRect(2 * T, 36 * T + 94, (xe - 1) * T, 6);
  // the disused spur along y 32: rust rails, rotten sleepers, weeds; buffer stop at the west end
  const sy = 32.5;
  for (let x = 2.1; x < xe + 0.9; x += 0.3) {
    g.fillStyle = 'rgba(62,46,34,0.8)';
    g.fillRect(x * T, (sy - 0.34) * T, 14, 0.68 * T);
  }
  g.fillStyle = 'rgba(128,84,56,0.95)';
  for (const dy of [-0.22, 0.22]) g.fillRect(2 * T, (sy + dy) * T - 3, (xe - 1) * T, 6);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(86,118,58,0.55)' : 'rgba(110,128,66,0.5)';
    g.fillRect((2 + r() * (xe - 1)) * T, (sy - 0.4 + r() * 0.8) * T, 4 + r() * 8, 3 + r() * 6);
  }
  g.fillStyle = 'rgba(42,34,28,0.95)';
  g.fillRect(2 * T + 4, (sy - 0.4) * T, 22, 0.8 * T);
  g.fillStyle = 'rgba(178,52,36,0.9)';
  g.fillRect(2 * T + 8, (sy - 0.3) * T, 10, 0.6 * T);
}

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const tod = timeOfDay();
  const { wz, wx } = tileWorld(W, H);
  const north = -H / 2;
  const south = H / 2;
  const roadGap = (c: number): boolean => c > wz(15.5) && c < wz(20);

  shophouseRows(ctx, { north: true, east: true, west: true, seed: 17, close: 0.5, scale: 1.25 });
  skyline(ctx, tod, {
    edge: 'north',
    off: 15,
    depth: 7,
    hMin: 7,
    hMax: 13,
    tints: ['#8a7a6a', '#7a8286', '#9a7a5a', '#8a8a78'],
    seed: 17,
  });
  skyline(ctx, tod, {
    edge: 'east',
    off: 8,
    depth: 6,
    hMin: 5,
    hMax: 9,
    tints: ['#8a7a6a', '#9a7a5a'],
    gap: roadGap,
    seed: 19,
    step: 5.6,
  });
  skyline(ctx, tod, {
    edge: 'west',
    off: 8,
    depth: 6,
    hMin: 5,
    hMax: 9,
    tints: ['#9a7a5a', '#7a8286'],
    gap: roadGap,
    seed: 23,
    step: 5.6,
  });

  // the rail viaduct behind the terminus with a green-and-white commuter train, the station footbridge sign
  const zv = north - 10;
  viaduct(ctx, { z: zv, x0: -W / 2 - 24, x1: W / 2 + 24, deck: 6.2, width: 5.4, pier: 10, track: true });
  railcars(ctx, { x: wx(ebuteX(30)), z: zv, y: 6.3, cars: 3, body: 0xe8ece6, stripe: 0x2a8a4a });
  plaque(
    ctx,
    'cr:ebute:viaduct',
    6.2,
    0.9,
    wx(ebuteX(40)),
    9.6,
    zv + 2.9,
    0,
    lettered('EBUTE-METTA  ←  IDDO', '#1d6a40', '#f6f2e4'),
  );

  // the lagoon on the south side (low, flat), timber piles and a moored boat at the foreshore; the far bridge
  streetPlane(
    ctx,
    'cr:ebute:lagoon',
    { x: 0, z: south + 22, w: W + 100, d: 40, ppm: 5, y: STREET - 0.12 },
    (g, _px, s, r) => {
      g.fillStyle = '#4a6a74';
      g.fillRect(0, 0, 9999, 9999);
      for (let i = 0; i < 600; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(200,226,236,0.18)' : 'rgba(20,44,56,0.22)';
        g.fillRect(r() * 9999, r() * 9999, s * (0.6 + r() * 1.6), 2);
      }
    },
  );
  ctx.statics.add(box(W + 100, 0.5, 0.5, mat(0x7a766c, { roughness: 1 }), 0, STREET - 0.1, south + 1.8));
  for (let x = -W / 2 + 6; x < W / 2 - 3; x += 4.6)
    ctx.statics.add(
      box(
        0.28,
        1.1,
        0.28,
        mat(0x5a4a38, { roughness: 1 }),
        x,
        STREET + 0.1,
        south + 2.6 + ((x * 7) % 3) * 0.4,
      ),
    );
  const hull = box(1.2, 0.5, 3.6, mat(0x8a4a2a, { roughness: 0.7 }), wx(ebuteX(44)), STREET + 0.1, south + 7);
  hull.rotation.y = 0.5;
  ctx.statics.add(hull);
  // Otumara: canoes drawn up beside a plank jetty on the west lagoon edge (low, on the camera side, nothing tall)
  ctx.statics.add(box(1.6, 0.14, 7.5, mat(0x6a5a46, { roughness: 1 }), wx(10), STREET - 0.02, south + 3.6));
  [wx(7), wx(13.5), wx(16)].forEach((x, i) => {
    const canoe = box(
      0.9,
      0.4,
      3.2,
      mat([0x2a5a6a, 0x7a3a2a, 0x6a5a3a][i]!, { roughness: 0.75 }),
      x,
      STREET + 0.08,
      south + 4.2 + i * 0.7,
    );
    canoe.rotation.y = 0.12 * (i - 1);
    ctx.statics.add(canoe);
  });
  viaduct(ctx, {
    z: south + 50,
    x0: wx(ebuteX(30)),
    x1: wx(ebuteX(30)) + 90,
    deck: 9,
    width: 8,
    pier: 14,
    color: 0x8a8e90,
  }); // the far bridge across the lagoon

  const tarp = THEME.tarps.map((c) => mat(c, { roughness: 0.88 }));
  [-34, -24, -16, -2, 20, 34].forEach((x, i) =>
    setUmbrella(ctx, x, north - 2.4, 0.95, tarp[i % 6]!, tarp[(i + 2) % 6]!, { h: 1.95 }),
  );
  for (const x of [-W / 2 - 4, W / 2 + 4]) lampPost(ctx, x, wz(14), Math.PI / 2, 0xffb868);
  mouthTraffic(ctx, layoutOf(ID), { kinds: ['danfo', 'keke', 'taxi', 'danfo'], depth: 3 });
  const streetGap = (z: number): boolean => z > wz(15.5) && z < wz(20);
  edgeStalls(ctx, {
    north: true,
    east: true,
    west: true,
    goods: ['grain', 'provisions', 'cloth'],
    gap: streetGap,
    seed: 3,
  });
  streetLife(ctx, { n: 18, gap: streetGap });
  ctx.ambient.dust(EBUTE_WEST_DX / 2, north - 1.4, 18, 1);
  ctx.ambient.smokeColumn(-W / 2 - 6, 6, north - 9, { shade: 0.55, size: 1.2, rate: 2 });
}

export const RUMBLE_EBUTE_METTA_SET: ArenaSet = {
  build,
  crowd: 0.25,
  crowdEdges: { north: false, east: true, west: true, south: false },
};

export function ebuteMettaEnv(board: { cols: number; rows: number }): StageEnvironment {
  const { cols } = board;
  return communityEnv(ID, board, {
    seed: 0x0341,
    kinds: ['danfo', 'bus', 'keke', 'car', 'truck'],
    routes: [
      // the commuter viaduct behind the terminus (deck 6.6 above the street), both ways
      {
        id: 'railWest',
        kinds: ['bus', 'danfo'],
        path: [
          [-cols / 2 - 30, -10.6],
          [cols * 0.3, -10.6],
        ],
        count: 2,
        speed: 3.4,
        spacing: 7,
        elevation: 6.6,
        priority: 1,
        fade: 2.5,
        minQuality: 'medium',
      },
    ],
    crowds: [
      {
        id: 'platformWest',
        rect: { x0: ebuteX(22.2), y0: -4, x1: ebuteX(25.6), y1: -1.8 },
        count: 6,
        mood: 'waiting',
        facing: 0,
        priority: 2,
      },
      {
        id: 'marketEast',
        rect: { x0: cols + 1.8, y0: 3, x1: cols + 5.5, y1: 13 },
        count: 8,
        mood: 'trading',
        priority: 2,
      },
      { id: 'westWaiters', rect: { x0: -5.5, y0: 20, x1: -2, y1: 29 }, count: 5, mood: 'waiting' },
      // Apapa Road: drivers and touts by the parked trailers; Otumara: fishers at the water's edge
      {
        id: 'roadsideWest',
        rect: { x0: -5.5, y0: 11, x1: -2, y1: 15 },
        count: 4,
        mood: 'trading',
        priority: 1,
      },
      {
        id: 'slipWest',
        rect: { x0: -5.5, y0: 31, x1: -2, y1: 36 },
        count: 4,
        mood: 'working',
        minQuality: 'medium',
      },
    ],
    lights: [
      { at: [-3, 14], height: 2.6, color: 0xffb868, size: 1.0, strength: 0.55, flicker: 'sodium', pool: 2.4 },
      {
        at: [cols + 3, 24],
        height: 2.6,
        color: 0xffb868,
        size: 1.0,
        strength: 0.55,
        flicker: 'sodium',
        pool: 2.4,
      },
    ],
    beds: ['crowd_loop', 'buspark_loop'],
  });
}
