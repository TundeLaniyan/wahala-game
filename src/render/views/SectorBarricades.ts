/**
 * A mission sector's barricades drawn as the street objects that close a Lagos district (docs/CAMPAIGN_SECTOR_AI.md,
 * "District-sector architecture"): a parked danfo rank, concrete jersey barriers with a steel crowd rail and bollards, a
 * corrugated steel gate wall, a Ring checkpoint kiosk with its boom, a rail-yard buffer fence. Presentation only: the
 * barricade tiles are concrete in the simulation (`src/sim/mission/sector.ts`); this builds a `BoardCover` for them so
 * the arena view draws no pillar there and the occlusion / view-clear fade treats each barricade as one object.
 *
 * Built from the community cover kit (`arenas/community/kit.ts`: shared materials, the sign atlas, merged meshes) and
 * the cast's danfo model, with a procedural bus when the model is missing. Gates that open between legs are separate
 * covers whose objects are hidden the moment their gate opens (`sync`). Names on boards are fictional.
 */
import type { Object3D } from 'three';
import type { GameState } from '../../sim';
import { getSector } from '../../sim/mission/sectors';
import type { BarricadeKind, MissionSectorDef, SectorBarricadeDef } from '../../sim/mission/sectors';
import { rectsContain } from '../../sim/mission/sector';
import { assets } from '../assets/library';
import { createVehicleModel } from '../assets/vehicles';
import { mergeCovers } from '../arenas/boardCover';
import type { BoardCover } from '../arenas/boardCover';
import { board, box, createCK, cyl, pick } from '../arenas/community/kit';
import type { CK, Theme } from '../arenas/community/kit';
import type { BoardSpec } from '../arenas/ojuelegbaSigns';

const CONCRETE = 0xa9a59b;
const CONCRETE_DARK = 0x7f7b72;
const STEEL = 0x4a4e52;
const RAIL_GREY = 0x8a8f94;
const RED = 0xb8261c;
const WHITE = 0xe8e4da;
const YELLOW = 0xe3b21a;
const ORANGE = 0xe0661c;
const DARK = 0x16140f;
const DANFO_SCALE = 1.32;
/** Rows north of a barricade it can hide from the camera (occlusion fade). */
const REACH: Readonly<Record<BarricadeKind, number>> = {
  bus: 2,
  gate: 2,
  checkpoint: 2,
  barrier: 1,
  rail: 1,
};

const cream = '#efe6cf';
const THEME: Theme = {
  plaster: [0xc8b48e, 0xb89a78, 0xd2c6a6],
  far: [0xb5654a],
  tarps: [0xc83a2a, 0x2a6aa8],
  roofs: [0x8a4a30, 0x7a8a8e],
  accent: [0x2e5a8e, 0x3a7a46, 0x9a2e22, 0x6a6a64, 0x8a6a2a],
  shops: [],
  small: [],
  seed: 911,
};
const BOARDS: Readonly<Record<string, BoardSpec>> = {
  closed: {
    bg: '#a8241c',
    fg: cream,
    lines: [['ROAD CLOSED', 30]],
    border: cream,
    wear: 1.2,
  },
  noEntry: { bg: '#f2c21a', fg: '#1c1608', lines: [['NO ENTRY', 30]], border: '#1c1608', wear: 1.3 },
  ring: {
    bg: '#16140f',
    fg: '#f2c21a',
    lines: [
      ['RING CHECKPOINT', 22],
      ['STOP - SHOW PASS', 14],
    ],
    band: { color: '#a8241c', text: 'RING', fg: cream },
    wear: 1.1,
  },
  rail: { bg: cream, fg: '#8a1e18', lines: [['DANGER - RAIL LINE', 22]], border: '#8a1e18', wear: 1.4 },
};
const ROUTES: readonly BoardSpec[] = [
  { bg: '#f2c21a', fg: '#1c1608', lines: [['OJUELEGBA', 26]] },
  { bg: '#f2c21a', fg: '#1c1608', lines: [['CMS - OBALENDE', 22]] },
  { bg: '#f2c21a', fg: '#1c1608', lines: [['IKORODU RD', 24]] },
  { bg: '#f2c21a', fg: '#1c1608', lines: [['YABA - OYINGBO', 22]] },
];

/** A barricade's run, its axis and which side the play area is on. */
interface Run {
  def: SectorBarricadeDef;
  tiles: [number, number][];
  /** true: the run goes east-west (a row of tiles). */
  horizontal: boolean;
  /** yaw that faces the play area (0 = south, towards the camera). */
  face: number;
  /** world centre of the run. */
  cx: number;
  cz: number;
  /** world length along the run. */
  length: number;
}

function runOf(
  k: CK,
  def: SectorBarricadeDef,
  rects: readonly (readonly [number, number, number, number])[],
): Run {
  const tiles = def.tiles.map(([x, y]) => [x, y] as [number, number]);
  const horizontal = tiles.length < 2 || tiles.every(([, y]) => y === tiles[0]![1]);
  const [fx, fy] = tiles[0]!;
  // the play area lies on the side where a neighbour is inside the rects
  const sideways = tiles.length === 1 && !rectsContain(rects, fx, fy + 1) && !rectsContain(rects, fx, fy - 1);
  const face =
    horizontal && !sideways
      ? rectsContain(rects, fx, fy - 1) && !rectsContain(rects, fx, fy + 1)
        ? Math.PI
        : 0
      : rectsContain(rects, fx + 1, fy)
        ? Math.PI / 2
        : -Math.PI / 2;
  const xs = tiles.map(([x]) => k.wx(x));
  const zs = tiles.map(([, y]) => k.wz(y));
  return {
    def,
    tiles,
    horizontal,
    face,
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cz: (Math.min(...zs) + Math.max(...zs)) / 2,
    length: tiles.length,
  };
}

/** World position `t` (0..length) along the run, and an offset `side` towards the play area. */
function along(r: Run, t: number, side = 0): [number, number] {
  const s = t - r.length / 2;
  const nx = Math.sin(r.face);
  const nz = Math.cos(r.face);
  return r.horizontal ? [r.cx + s + nx * side, r.cz + nz * side] : [r.cx + nx * side, r.cz + s + nz * side];
}
/** Yaw of the run's long axis. */
const axisYaw = (r: Run): number => (r.horizontal ? 0 : Math.PI / 2);
const hash = (x: number, y: number): number => ((x * 73856093) ^ (y * 19349663)) >>> 0;

// ------------------------------------------------------------------------------------------- the objects

/** Concrete jersey barrier on one tile-length segment at `t`, with a steel crowd rail on top and reflective stripes. */
function jersey(k: CK, g: number, r: Run, t: number, rail = true): void {
  const [x, z] = along(r, t + 0.5);
  const ry = axisYaw(r);
  box(k, g, k.concrete, 0.98, 0.32, 0.62, x, 0, z, CONCRETE, ry);
  box(k, g, k.concrete, 0.98, 0.44, 0.3, x, 0.32, z, CONCRETE, ry);
  // red / white reflective stripes on the face towards the play area
  const [sx, sz] = along(r, t + 0.5, 0.17);
  for (let i = 0; i < 4; i++) {
    const [px, pz] = r.horizontal ? [sx - 0.36 + i * 0.24, sz] : [sx, sz - 0.36 + i * 0.24];
    box(k, g, k.paint, 0.2, 0.12, 0.02, px, 0.5, pz, i % 2 ? WHITE : RED, ry);
  }
  if (!rail) return;
  // a steel crowd rail: two posts and two rails above the concrete (it reads as closed, not as a step)
  for (const d of [0.08, 0.92]) {
    const [px, pz] = along(r, t + d);
    cyl(k, g, k.metal, 0.03, 0.03, 0.8, px, 0.76, pz, STEEL, 6);
  }
  for (const h of [1.12, 1.5]) {
    const [px, pz] = along(r, t + 0.5);
    box(k, g, k.metal, 0.96, 0.04, 0.04, px, h, pz, RAIL_GREY, ry);
  }
}

/** A yellow-and-black bollard at `t` along the run. */
function bollard(k: CK, g: number, r: Run, t: number): void {
  const [x, z] = along(r, t, 0.38);
  cyl(k, g, k.paint, 0.09, 0.1, 0.9, x, 0, z, DARK, 8);
  for (let i = 0; i < 2; i++) cyl(k, g, k.paint, 0.1, 0.1, 0.16, x, 0.18 + i * 0.36, z, YELLOW, 8);
}

/** An orange traffic cone at `t`, a little towards the play area. */
function cone(k: CK, g: number, r: Run, t: number): void {
  const [x, z] = along(r, t, 0.42);
  box(k, g, k.paint, 0.34, 0.04, 0.34, x, 0, z, ORANGE);
  cyl(k, g, k.paint, 0.03, 0.15, 0.62, x, 0.04, z, ORANGE, 8);
  cyl(k, g, k.paint, 0.08, 0.11, 0.1, x, 0.3, z, WHITE, 8);
}

/** A board on two posts facing the play area. */
function signOnPosts(
  k: CK,
  g: number,
  r: Run,
  t: number,
  key: string,
  w: number,
  h: number,
  y: number,
): void {
  const [x, z] = along(r, t, 0.22);
  const ry = r.face;
  const ox = Math.cos(ry) * (w / 2 - 0.05);
  const oz = -Math.sin(ry) * (w / 2 - 0.05);
  for (const s of [-1, 1]) cyl(k, g, k.metal, 0.025, 0.025, y + h / 2, x + ox * s, 0, z + oz * s, STEEL, 6);
  board(k, g, k.atlas.board(`sector:${key}`, 256, 72, BOARDS[key]!), w, h, x, y, z, ry);
}

function barrierRun(k: CK, g: number, r: Run): void {
  for (let t = 0; t < r.length; t++) jersey(k, g, r, t);
  bollard(k, g, r, 0.05);
  bollard(k, g, r, r.length - 0.05);
  if (r.length >= 3) signOnPosts(k, g, r, r.length / 2, 'closed', 0.9, 0.3, 1.25);
  const [fx, fy] = r.tiles[0]!;
  if (hash(fx, fy) % 2 === 0 && r.length >= 2) cone(k, g, r, 0.75);
}

/** A danfo every two tiles (the cast's model or a procedural bus), jersey blocks on an odd tile left over. */
function busRun(k: CK, g: number, r: Run, bus: Object3D | null, n: number): void {
  const pairs = Math.floor(r.length / 2);
  const ry = axisYaw(r);
  for (let i = 0; i < pairs; i++) {
    const [x, z] = along(r, i * 2 + 1);
    const flip = (n + i) % 2 === 0 ? 0 : Math.PI;
    const yaw = ry + flip + ((hash(n, i) % 7) - 3) * 0.012;
    if (bus) {
      bus.position.set(x, 0, z);
      bus.rotation.set(0, yaw, 0);
      bus.scale.setScalar(DANFO_SCALE);
      k.b.addObject(g, bus);
    } else {
      box(k, g, k.paint, 1.96, 0.78, 1.0, x, 0.2, z, YELLOW, yaw);
      box(k, g, k.paint, 1.6, 0.46, 0.98, x, 0.98, z, YELLOW, yaw);
      box(k, g, k.paint, 1.62, 0.2, 1.0, x, 1.0, z, 0x1d2a3a, yaw);
      for (const s of [-0.62, 0.62])
        for (const w of [-0.46, 0.46]) {
          const [px, pz] = r.horizontal ? [x + s, z + w] : [x + w, z + s];
          cyl(
            k,
            g,
            k.paint,
            0.2,
            0.2,
            0.14,
            px,
            0.2,
            pz,
            DARK,
            10,
            Math.PI / 2,
            r.horizontal ? 0 : Math.PI / 2,
          );
        }
      box(k, g, k.paint, 1.98, 0.06, 1.02, x, 0.6, z, DARK, yaw);
    }
    // the route card in the windscreen side towards the play area
    const [bx2, bz2] = along(r, i * 2 + 1, 0.53);
    board(
      k,
      g,
      k.atlas.board(`sector:route${(n + i) % ROUTES.length}`, 128, 40, pick(ROUTES, n + i)),
      0.62,
      0.18,
      bx2,
      1.12,
      bz2,
      r.face,
    );
  }
  if (r.length % 2 === 1) {
    jersey(k, g, r, r.length - 1);
    bollard(k, g, r, r.length - 0.05);
  }
}

/** A corrugated steel gate wall: posts, painted sheet panels, a top rail, a padlocked chain and a NO ENTRY board. */
function gateRun(k: CK, g: number, r: Run, n: number): void {
  const ry = axisYaw(r);
  const paint = pick(THEME.accent, n);
  for (let t = 0; t <= r.length; t++) {
    const [x, z] = along(r, t);
    box(k, g, k.metal, 0.1, 2.0, 0.1, x, 0, z, STEEL, ry);
  }
  for (let t = 0; t < r.length; t++) {
    const [x, z] = along(r, t + 0.5);
    box(k, g, k.zinc, 0.92, 1.72, 0.06, x, 0.12, z, paint, ry);
    box(k, g, k.metal, 0.96, 0.06, 0.08, x, 1.86, z, STEEL, ry);
    box(k, g, k.metal, 0.96, 0.05, 0.08, x, 0.95, z, STEEL, ry);
    // rust at the foot
    box(k, g, k.paint, 0.9, 0.16, 0.07, x, 0.06, z, 0x6a3a22, ry);
  }
  const [cx, cz] = along(r, r.length / 2, 0.05);
  box(k, g, k.paint, 0.12, 0.16, 0.06, cx, 0.86, cz, 0x2a2622, ry);
  const [nx, nz] = along(r, r.length / 2, 0.06);
  board(k, g, k.atlas.board('sector:noEntry', 256, 72, BOARDS.noEntry!), 0.72, 0.22, nx, 1.36, nz, r.face);
}

/** A rail-yard buffer fence: heavy posts, a red-and-white buffer beam with a red lamp, a mesh fence behind it. */
function railRun(k: CK, g: number, r: Run): void {
  const ry = axisYaw(r);
  for (let t = 0; t < r.length; t++) {
    // the buffer: two heavy posts and a striped beam
    for (const d of [0.2, 0.8]) {
      const [px, pz] = along(r, t + d, 0.15);
      box(k, g, k.metal, 0.14, 0.82, 0.14, px, 0, pz, 0x3a2e28, ry);
    }
    const [bx2, bz2] = along(r, t + 0.5, 0.22);
    for (let i = 0; i < 4; i++) {
      const [px, pz] = along(r, t + 0.14 + i * 0.24, 0.22);
      box(k, g, k.paint, 0.23, 0.22, 0.12, px, 0.6, pz, i % 2 ? WHITE : RED, ry);
    }
    cyl(k, g, k.glow, 0.06, 0.06, 0.08, bx2, 0.86, bz2, 0xff3020, 8);
    // the yard fence behind: posts and a row of thin bars
    const [fx, fz] = along(r, t, -0.2);
    box(k, g, k.metal, 0.06, 1.8, 0.06, fx, 0, fz, STEEL, ry);
    for (let i = 1; i < 8; i++) {
      const [px, pz] = along(r, t + i / 8, -0.2);
      box(k, g, k.metal, 0.02, 1.62, 0.02, px, 0.1, pz, RAIL_GREY, ry);
    }
    const [tx, tz] = along(r, t + 0.5, -0.2);
    box(k, g, k.metal, 1.0, 0.04, 0.04, tx, 1.72, tz, STEEL, ry);
  }
  if (r.length >= 2) signOnPosts(k, g, r, r.length / 2, 'rail', 0.9, 0.28, 1.05);
}

/** A Ring checkpoint: a kiosk on the first tile, a red-and-white boom over the rest with water-filled barriers under it. */
function checkpointRun(k: CK, g: number, r: Run, n: number): void {
  const ry = axisYaw(r);
  // the kiosk (one tile): base, painted booth, dark window band towards the play area, an overhanging roof, a beacon
  const [kx, kz] = along(r, 0.5);
  box(k, g, k.concrete, 0.94, 0.16, 0.94, kx, 0, kz, CONCRETE_DARK, ry);
  box(k, g, k.paint, 0.82, 1.7, 0.82, kx, 0.16, kz, pick([0x2e3a46, 0x3a2e2a], n), ry);
  const [wx, wz] = along(r, 0.5, 0.42);
  box(k, g, k.glow, 0.62, 0.5, 0.02, wx, 1.02, wz, 0x9ab8c8, r.face);
  box(k, g, k.paint, 1.08, 0.1, 1.08, kx, 1.86, kz, DARK, ry);
  cyl(k, g, k.glow, 0.08, 0.08, 0.14, kx, 1.96, kz, 0xff2a18, 8);
  const [sx, sz] = along(r, 0.5, 0.46);
  board(k, g, k.atlas.board('sector:ring', 256, 96, BOARDS.ring!), 0.8, 0.3, sx, 1.5, sz, r.face);
  if (r.length === 1) return;
  // the boom: a pedestal on the kiosk side, the arm across the rest of the run
  const [px, pz] = along(r, 1.1);
  box(k, g, k.paint, 0.22, 0.95, 0.22, px, 0, pz, YELLOW, ry);
  const len = r.length - 1.15;
  const segs = Math.max(2, Math.round(len / 0.33));
  for (let i = 0; i < segs; i++) {
    const [ax, az] = along(r, 1.15 + ((i + 0.5) * len) / segs);
    box(k, g, k.paint, len / segs, 0.08, 0.08, ax, 0.92, az, i % 2 ? WHITE : RED, ry);
  }
  // water-filled barriers under the boom, alternating orange and white
  for (let t = 1; t < r.length; t++) {
    const [bx2, bz2] = along(r, t + 0.5);
    box(k, g, k.paint, 0.9, 0.62, 0.42, bx2, 0, bz2, t % 2 ? ORANGE : WHITE, ry);
    box(k, g, k.paint, 0.7, 0.08, 0.3, bx2, 0.62, bz2, t % 2 ? ORANGE : WHITE, ry);
  }
  cone(k, g, r, r.length - 0.4);
}

// ------------------------------------------------------------------------------------------- the build

function buildCover(
  W: number,
  H: number,
  defs: readonly SectorBarricadeDef[],
  rects: readonly (readonly [number, number, number, number])[],
  bus: Object3D | null,
  first: number,
): BoardCover {
  const k = createCK(W, H, THEME);
  defs.forEach((def, i) => {
    const g = k.b.group(def.tiles as [number, number][], REACH[def.kind]);
    const r = runOf(k, def, rects);
    const n = first + i;
    switch (def.kind) {
      case 'bus':
        busRun(k, g, r, bus, n);
        break;
      case 'barrier':
        barrierRun(k, g, r);
        break;
      case 'gate':
        gateRun(k, g, r, n);
        break;
      case 'rail':
        railRun(k, g, r);
        break;
      case 'checkpoint':
        checkpointRun(k, g, r, n);
        break;
    }
  });
  const t = k.atlas.texture();
  if (t) {
    k.signs.map = t;
    k.b.own(t);
  }
  return k.b.build();
}

/** What the arena view keeps: the merged cover, and the gate covers to hide once their gate opens. */
export interface SectorBarricades {
  readonly cover: BoardCover;
  /** Hides the barricade of every gate the simulation has opened (cheap: a flag per gate). */
  sync(state: GameState): void;
  /** Debug / tests: barricades built (static + gates) and gates hidden. */
  stats(): { barricades: number; gates: number; open: number };
  /** Tests: the drawn object of a gate (null: no such gate). */
  gateObject(id: string): Object3D | null;
}

/** The barricades of the match's sector, or null when it has none (`data`: the sector's data, by default its own). */
export function buildSectorBarricades(state: GameState, data?: MissionSectorDef): SectorBarricades | null {
  const sector = state.sector;
  if (!sector) return null;
  const def = data ?? getSector(sector.id);
  const dom = typeof document !== 'undefined';
  const bus = assets.has('veh_danfo') || dom ? createVehicleModel('danfo').root : null;
  const fixed = buildCover(state.width, state.height, def.barricades, def.rects, bus, 0);
  const gates = (def.gates ?? []).map((gd, i) => ({
    id: gd.id,
    cover: buildCover(state.width, state.height, [gd], def.rects, bus, def.barricades.length + i),
  }));
  const cover = mergeCovers(fixed, ...gates.map((g) => g.cover))!;
  cover.object.name = 'sectorBarricades';
  let open = 0;
  return {
    cover,
    sync(s) {
      const live = s.sector;
      if (!live) return;
      open = 0;
      for (const g of gates) {
        const opened = live.gates.find((o) => o.id === g.id)?.open ?? false;
        g.cover.object.visible = !opened;
        if (opened) open++;
      }
    },
    stats: () => ({ barricades: def.barricades.length + gates.length, gates: gates.length, open }),
    gateObject: (id) => gates.find((g) => g.id === id)?.cover.object ?? null,
  };
}
