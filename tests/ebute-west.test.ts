/**
 * Ebute Metta West (decisions EW1-EW9, docs/EBUTE_METTA_WEST.md): the City Rumble arena Ebute-Metta grew about 30% by
 * adding genuine new territory to the WEST of the original board. Pinned here: the size and the area increase, the east
 * kept tile for tile (the original layout is the fixture), the westward road / hazard lanes, the connected street graph
 * with no pockets, the always-open track-free route, the economy (supplies, traps, zones, spawns) on open floor and
 * balanced per Team Rumble half, the ten districts, no excessively wide empty ground, comparable cover density, and the
 * campaign Ebute coordinates mapped through `ebuteX`.
 */
import { describe, expect, it } from 'vitest';
import { createGame, getArena } from '../src/sim';
import type { ArenaDef } from '../src/sim';
import { EBUTE_OLD_W, EBUTE_WEST_DX, ebuteX } from '../src/sim/arenas/ebuteWest';
import { EBUTE_TRACK_X, EBUTE_TRACK_Y } from '../src/sim/arenas/rumbleEbuteMetta';
import { MISSION_DEFS } from '../src/sim/mission/defs';
import { FIELD_MISSION_DEFS } from '../src/sim/mission/fieldDefs';
import { EBUTE_EAST_ORIGINAL } from './ebuteEastOriginal';

const a: ArenaDef = getArena('rumbleEbuteMetta');
const W = a.layout[0]!.length;
const H = a.layout.length;
const at = (x: number, y: number): string => a.layout[y]?.[x] ?? '#';
const isOpen = (x: number, y: number): boolean => at(x, y) !== '#';
const ORIGINAL_OPEN = EBUTE_EAST_ORIGINAL.join('').replace(/#/g, '').length;
const openCount = (): number => a.layout.join('').replace(/#/g, '').length;
const XW = EBUTE_WEST_DX + 1; // the last column of the new territory

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function reach(from: readonly [number, number], blocked?: (x: number, y: number) => boolean): Set<string> {
  const seen = new Set<string>([`${from[0]},${from[1]}`]);
  const q: [number, number][] = [[from[0], from[1]]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]!;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isOpen(nx, ny) || seen.has(`${nx},${ny}`) || blocked?.(nx, ny)) continue;
      seen.add(`${nx},${ny}`);
      q.push([nx, ny]);
    }
  }
  return seen;
}

const allOpen = (): string[] =>
  a.layout.flatMap((row, y) => [...row].flatMap((c, x) => (c === '#' ? [] : [`${x},${y}`])));

describe('size and area increase', () => {
  it('is a 75 x 39 board: the original 55 columns plus EBUTE_WEST_DX = 20 new ones on the west', () => {
    expect(EBUTE_OLD_W).toBe(55);
    expect(EBUTE_WEST_DX).toBe(20);
    expect([W, H]).toEqual([EBUTE_OLD_W + EBUTE_WEST_DX, 39]);
    expect(ebuteX(0)).toBe(EBUTE_WEST_DX);
  });

  it('adds about 30% playable ground (1,329 -> 1,700-1,800 non-wall tiles), all of it genuine new territory', () => {
    expect(ORIGINAL_OPEN).toBe(1329);
    const now = openCount();
    expect(now).toBeGreaterThanOrEqual(1700);
    expect(now).toBeLessThanOrEqual(1800);
    const gain = (now - ORIGINAL_OPEN) / ORIGINAL_OPEN;
    expect(gain).toBeGreaterThan(0.28);
    expect(gain).toBeLessThan(0.36);
    // the new tiles are west of the old board's west lane (the old road at x 0-1 is part of the old count)
    let eastOpen = 0;
    for (let y = 0; y < H; y++) for (let x = ebuteX(2); x < W; x++) if (isOpen(x, y)) eastOpen++;
    expect(eastOpen).toBe(ORIGINAL_OPEN - 8); // the old board minus its eight road tiles at x 0-1
  });
});

describe('the east is kept tile for tile', () => {
  it('every tile of the original board from its west lane (x 2) to its east border equals the shifted original, crates and supplies included', () => {
    for (let y = 0; y < H; y++)
      expect(a.layout[y]!.slice(ebuteX(2)), `row ${y}`).toBe(EBUTE_EAST_ORIGINAL[y]!.slice(2));
  });

  it('the commuter railcar lanes, their portals and the open walkway beyond them moved with the board', () => {
    expect(EBUTE_TRACK_X).toEqual([ebuteX(26), ebuteX(27)]);
    for (const x of EBUTE_TRACK_X) {
      for (let y = EBUTE_TRACK_Y[0]; y <= EBUTE_TRACK_Y[1]; y++)
        expect(at(x, y), `track ${x},${y}`).toBe('=');
      for (const y of [8, 9, 27, 28]) expect(at(x, y), `portal ${x},${y}`).toBe('#');
    }
    const train = a.stageHazards.find((h) => h.kind === 'sweep' && h.style === 'train');
    expect(train?.kind === 'sweep' && train.routes.map((r) => r[0])).toEqual([
      [ebuteX(27), 10],
      [ebuteX(26), 26],
    ]);
  });
});

describe('Murtala Muhammed Way carries on west as Apapa Road', () => {
  it('four road rows run from the west edge to the east edge, and the traffic and truck sweeps cover the whole width', () => {
    for (let y = 16; y <= 19; y++) for (let x = 0; x < W; x++) expect(at(x, y), `${x},${y}`).toBe('=');
    for (const style of ['traffic', 'truck'] as const) {
      const h = a.stageHazards.find((s) => s.kind === 'sweep' && s.style === style);
      expect(h?.kind).toBe('sweep');
      if (h?.kind !== 'sweep') continue;
      expect(h.routes).toHaveLength(4);
      for (const r of h.routes) {
        expect(r).toHaveLength(W);
        for (const [x, y] of r) expect(at(x, y)).toBe('=');
        expect([r[0]![0], r[r.length - 1]![0]].sort((p, q) => p - q)).toEqual([0, W - 1]); // edge to edge
      }
    }
    // the summoned-vehicle lanes enter at the four road mouths on each edge
    const lanes = a.config!.vehicles!.lanes!;
    expect(lanes.filter(([x]) => x === 0)).toHaveLength(4);
    expect(lanes.filter(([x]) => x === W - 1)).toHaveLength(4);
  });
});

describe('connectivity: one street graph, no pockets', () => {
  it('every open tile is reachable from every one of the 32 spawns (crates walkable: they can be blasted)', () => {
    const open = allOpen();
    expect(a.spawns).toHaveLength(32);
    for (const s of a.spawns) expect(reach([s.x, s.y]).size, `from ${s.x},${s.y}`).toBe(open.length);
  });

  it('is still one region when no crate is blasted, apart from a handful of sealed crate niches (as before)', () => {
    const solid = (x: number, y: number): boolean => '$x'.includes(at(x, y));
    const s = a.spawns[0]!;
    expect(allOpen().length - reach([s.x, s.y], solid).size).toBeLessThanOrEqual(45);
  });

  it('the track-free route: with both railcar lanes blocked, the west and the east are still joined, north and south of the portals', () => {
    const onTrack = (x: number, y: number): boolean =>
      (EBUTE_TRACK_X as readonly number[]).includes(x) && y >= EBUTE_TRACK_Y[0] && y <= EBUTE_TRACK_Y[1];
    const west = a.spawns.find((s) => s.x < EBUTE_WEST_DX)!;
    const seen = reach([west.x, west.y], onTrack);
    const trackTiles = (EBUTE_TRACK_X.length * (EBUTE_TRACK_Y[1] - EBUTE_TRACK_Y[0] + 1)) as number;
    expect(seen.size).toBe(allOpen().length - trackTiles);
    // two separate crossings of the corridor: the open walkway north of the north portal (y < 8), and the one south of the
    // south portal (y > 28). Close either one and the other still joins the west to the oyingbo / foreshore side.
    const inCorridor = (x: number): boolean => x >= EBUTE_TRACK_X[0] - 4 && x <= EBUTE_TRACK_X[1] + 4;
    const viaNorth = reach([west.x, west.y], (x, y) => inCorridor(x) && y >= 8);
    const viaSouth = reach([west.x, west.y], (x, y) => inCorridor(x) && y <= 28);
    expect(viaNorth.has(`${ebuteX(44)},7`)).toBe(true);
    expect(viaSouth.has(`${ebuteX(40)},35`)).toBe(true);
  });

  it('the west joins the old board through gateways along its former west border, at least five of them', () => {
    const gates: number[] = [];
    for (let y = 2; y < H - 2; y++)
      if (isOpen(XW, y) && isOpen(XW + 1, y) && at(XW, y) !== '=') gates.push(y);
    expect(gates.length).toBeGreaterThanOrEqual(10);
    // gateways come in runs: at least five separate ones
    const runs = gates.filter((y, i) => i === 0 || gates[i - 1] !== y - 1).length;
    expect(runs).toBeGreaterThanOrEqual(5);
  });
});

describe('the economy of the new ground', () => {
  const marks = (ch: string): [number, number][] =>
    a.layout.flatMap((row, y) => [...row].flatMap((c, x): [number, number][] => (c === ch ? [[x, y]] : [])));

  it('supply crates are balanced per Team Rumble half tile count for tile count: 13 west, 13 east, one on the centre column', () => {
    const s = marks('$');
    const centre = (W - 1) / 2;
    expect(s.filter(([x]) => x < centre)).toHaveLength(13);
    expect(s.filter(([x]) => x > centre)).toHaveLength(13);
    expect(s.length).toBeGreaterThanOrEqual(26);
    expect(s.length).toBeLessThanOrEqual(30);
    // the west has real supplies of its own in every one of its four districts' reach
    expect(s.filter(([x]) => x <= XW).length).toBeGreaterThanOrEqual(8);
  });

  it('supplies, barriers, traps, strike zones and washes stand on open floor (never concrete, never a road or a track)', () => {
    for (const [x, y] of [...marks('$'), ...marks('x')]) expect(at(x, y)).not.toBe('=');
    for (const rows of [a.floorTraps ?? [], ...a.endgameTraps])
      rows.forEach((row, y) =>
        [...row].forEach((c, x) => c !== '.' && expect(at(x, y), `trap ${x},${y}`).not.toBe('#')),
      );
    for (const h of a.stageHazards) {
      if (h.kind === 'strike')
        for (const z of h.zones) for (const [x, y] of z) expect(at(x, y)).toMatch(/[._]/);
      if (h.kind === 'push')
        for (const z of h.zones) for (const [x, y] of z.tiles) expect(at(x, y)).toMatch(/[._]/);
    }
    // the west carries its own floor traps and one lagoon wash of its own
    const west = (a.floorTraps ?? []).flatMap((row, y) =>
      [...row].flatMap((c, x) => (c !== '.' && x <= XW ? [[x, y]] : [])),
    );
    expect(west.length).toBeGreaterThanOrEqual(5);
    const wash = a.stageHazards.find((h) => h.kind === 'push');
    expect(wash?.kind === 'push' && wash.zones.some((z) => z.tiles.every(([x]) => x <= XW))).toBe(true);
  });

  it('the start tile (slot 0) is open floor on the west half, and the Survival core is the original one, shifted', () => {
    const s = createGame({
      seed: 3,
      arenaId: 'rumbleEbuteMetta',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'streetBaller', isBot: true },
      ],
      settings: { game: 'survival' },
    });
    expect(a.spawns[0]!.x).toBeLessThan(W / 2);
    expect(['.', '_']).toContain(at(a.spawns[0]!.x, a.spawns[0]!.y));
    expect(s.config.crush.keepCore).toMatchObject({ w: 11, h: 9, x0: ebuteX(22), y0: 14 });
  });
});

describe('districts: six original, four new', () => {
  const ids = a.districts!.map((d) => d.id);
  const inRect = (d: NonNullable<ArenaDef['districts']>[number], x: number, y: number): boolean =>
    d.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);

  it('has the six original districts (shifted) and abuleIjesha, apapaRoad, ilogbo, otumara', () => {
    expect(ids.sort()).toEqual(
      [
        'abuleIjesha',
        'apapaRoad',
        'foreshore',
        'heritage',
        'ilogbo',
        'otumara',
        'oyingbo',
        'railYard',
        'residential',
        'station',
      ].sort(),
    );
    const heritage = a.districts!.find((d) => d.id === 'heritage')!;
    expect(heritage.rects[0]).toEqual([ebuteX(2), 2, ebuteX(21), 15]);
  });

  it('the district rectangles never overlap, and every open floor tile that is not road belongs to one', () => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const hit = a.districts!.filter((d) => inRect(d, x, y));
        expect(hit.length, `${x},${y}`).toBeLessThanOrEqual(1);
        if (isOpen(x, y) && at(x, y) !== '=')
          expect(hit.length, `open ${x},${y} belongs to a district`).toBe(1);
      }
  });

  it.each(['abuleIjesha', 'apapaRoad', 'ilogbo', 'otumara'])(
    '%s is real ground with at least two links to its neighbours',
    (id) => {
      const d = a.districts!.find((z) => z.id === id)!;
      let n = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x <= XW; x++) if (inRect(d, x, y) && isOpen(x, y)) n++;
      expect(n, `${id} open tiles`).toBeGreaterThanOrEqual(50);
      const links = a.districtLinks!.filter((l) => l.from === id || l.to === id);
      expect(links.length).toBeGreaterThanOrEqual(2);
      for (const l of links) {
        expect(l.tiles.length, `${l.from}-${l.to}`).toBeGreaterThan(0);
        for (const [x, y] of l.tiles) expect(isOpen(x, y)).toBe(true);
      }
    },
  );
});

describe('the new ground plays like the old: no big empty spaces, comparable cover', () => {
  /** Largest square of plain open floor in a column range (plazas, roads and crates excluded). */
  const bigSquare = (x0: number, x1: number): number => {
    let best = 0;
    for (let y = 0; y < H; y++)
      for (let x = x0; x <= x1; x++)
        for (let m = best + 1; ; m++) {
          let ok = y + m <= H && x + m - 1 <= x1;
          for (let j = 0; ok && j < m; j++)
            for (let i = 0; ok && i < m; i++) if (at(x + i, y + j) !== '.') ok = false;
          if (!ok) break;
          best = m;
        }
    return best;
  };
  it('the west holds no plain open square bigger than 4 x 4 (lanes are 2-3 tiles wide), and none is bigger than the original board has', () => {
    expect(bigSquare(2, XW + 1)).toBeLessThanOrEqual(4);
    expect(bigSquare(0, W - 1)).toBeLessThanOrEqual(10);
  });

  it('cover covers a similar share of each west band as of its neighbour on the old board (houses and lanes, not a flat arrangement)', () => {
    const share = (x0: number, x1: number, y0: number, y1: number): number => {
      let solid = 0;
      let n = 0;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          n++;
          if (!isOpen(x, y)) solid++;
        }
      return solid / n;
    };
    // the north band beside the Railway Heritage district, the south band beside the Residential Mainland
    expect(Math.abs(share(2, XW, 2, 15) - share(ebuteX(2), ebuteX(21), 2, 15))).toBeLessThan(0.1);
    expect(Math.abs(share(2, XW, 20, 36) - share(ebuteX(2), ebuteX(21), 20, 36))).toBeLessThan(0.1);
  });
});

describe('the campaign Ebute coordinates went through ebuteX', () => {
  const m = MISSION_DEFS.ebuteMetta;
  const floor = (x: number, y: number): boolean => '._'.includes(at(x, y));

  it('every node, post and boss tile of the dispatch-windows mission stands on open floor inside the original footprint', () => {
    expect(m.arenaId).toBe('rumbleEbuteMetta');
    const tiles: [number, number][] = [
      m.boss.post as [number, number],
      ...m.crew.map((c) => c.post as [number, number]),
      ...m.phases.flatMap((p) => p.nodes.map((n): [number, number] => [n.x, n.y])),
    ];
    for (const [x, y] of tiles) {
      expect(x, `${x},${y}`).toBeGreaterThanOrEqual(ebuteX(2));
      expect(floor(x, y) || at(x, y) === '$' || at(x, y) === 'x', `${x},${y}`).toBe(true);
    }
    // the switches still sit on the platforms beside the track lanes
    for (const n of m.phases.flatMap((p) => p.nodes))
      expect(Math.abs(n.x - EBUTE_TRACK_X[0]!)).toBeLessThanOrEqual(3);
  });

  it('the Yard Approach field mission starts, walks and raids inside the original footprint, all on open floor', () => {
    const f = FIELD_MISSION_DEFS['ebuteMetta.approach']!;
    expect(f.start[0]).toBe(ebuteX(3));
    expect(floor(f.start[0], f.start[1])).toBe(true);
    expect(floor(f.returnMarker.x, f.returnMarker.y)).toBe(true);
    for (const leg of f.legs)
      if (leg.kind === 'reachMarkers')
        for (const mk of leg.markers) expect(floor(mk.x, mk.y), mk.label).toBe(true);
    for (const d of f.doors) {
      expect(d.x).toBe(ebuteX(33));
      expect(floor(d.returnTile[0], d.returnTile[1])).toBe(true);
    }
    for (const e of f.enemies) expect(floor(e.post[0], e.post[1]), e.name).toBe(true);
  });
});
