/**
 * Lagos arenas, build 1: Oshodi Transport Metropolis (45 x 33, not mirrored, six districts).
 * Districts and links are data (`ArenaDef.districts` / `districtLinks`); these checks keep the data honest
 * and the board fair for 32 competitors, Team Rumble's west-versus-east split, the vehicle lanes and - the
 * new part - the railway: a track lane is always warned for 3.5 s, always one step from a safe tile, and
 * the grade-separated routes (Skywalk Quarter, Cappa band) never touch a road or track tile.
 * The generic stage guarantees (closing ring, bots, hazards) are in tests/rumble-stages.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  ARENAS,
  RUMBLE_ARENA_IDS,
  chooseAutoVehicle,
  createGame,
  getArena,
  laneEscapeSteps,
  listEntries,
  tick,
  Tile,
} from '../src/sim';
import type { DistrictDef, GameState, StageEvent, VehicleKind } from '../src/sim';
import { CHARACTERS } from '../src/sim/data/characters';
import { OSHODI_TRACK_X, OSHODI_TRACK_Y } from '../src/sim/arenas/rumbleOshodi';
import { put, sandbox } from './helpers';

const a = getArena('rumbleOshodi');
const W = a.layout[0]!.length;
const H = a.layout.length;
const TPS = 60;
const districts = a.districts ?? [];
const links = a.districtLinks ?? [];
const at = (x: number, y: number): string => a.layout[y]?.[x] ?? '#';
const open = (x: number, y: number): boolean => at(x, y) !== '#';
const key = (x: number, y: number): string => `${x},${y}`;
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const isTrack = (x: number, y: number): boolean =>
  (OSHODI_TRACK_X as readonly number[]).includes(x) && y >= OSHODI_TRACK_Y[0] && y <= OSHODI_TRACK_Y[1];
const isRoad = (x: number, y: number): boolean => at(x, y) === '=' && !isTrack(x, y);

function districtOf(x: number, y: number): DistrictDef | undefined {
  return districts.find((d) => d.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1));
}

/** BFS distances from `from` over open tiles (crates ignored), `pass` filters further. */
function dist(
  from: { x: number; y: number },
  pass: (x: number, y: number) => boolean = () => true,
): Map<string, number> {
  const d = new Map([[key(from.x, from.y), 0]]);
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const c = q[h]!;
    for (const [dx, dy] of DIRS) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (x < 0 || y < 0 || x >= W || y >= H || !open(x, y) || !pass(x, y) || d.has(key(x, y))) continue;
      d.set(key(x, y), d.get(key(c.x, c.y))! + 1);
      q.push({ x, y });
    }
  }
  return d;
}

const roster = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: `P${i}`,
    characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
    isBot: i > 0,
  }));

describe('Oshodi Metropolis: the board', () => {
  it('is a non-mirrored 45 x 33 Rumble stage with its own name and id', () => {
    expect([W, H]).toEqual([45, 33]);
    for (const row of a.layout) expect(row).toMatch(/^[#=._x$]{45}$/);
    expect(a.id).toBe('rumbleOshodi');
    expect(a.name).toBe('Oshodi Transport Metropolis');
    expect(a.kind).toBe('rumble');
    expect(a.mirrorSoftBlocks).toBe(false);
    expect(a.forcedMode).toBe('crush');
    expect(a.maxPlayers).toBe(32);
    let lr = 0;
    let tb = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if ((at(x, y) === '#') !== (at(W - 1 - x, y) === '#')) lr++;
        if ((at(x, y) === '#') !== (at(x, H - 1 - y) === '#')) tb++;
      }
    expect(lr).toBeGreaterThan(100);
    expect(tb).toBeGreaterThan(100);
  });

  it('REPLACES the old generic Oshodi: one Oshodi stage, under the canonical id, with no second card or leftover id', () => {
    expect(RUMBLE_ARENA_IDS.filter((id) => /oshodi/i.test(id))).toEqual(['rumbleOshodi']);
    expect(RUMBLE_ARENA_IDS[0]).toBe('rumbleOshodi'); // still the first (default) Rumble stage
    expect(ARENAS['rumbleOshodiMetro']).toBeUndefined();
    // every Rumble stage name is distinct and none is the retired "Oshodi Rush Hour"
    const names = RUMBLE_ARENA_IDS.map((id) => getArena(id).name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain('Oshodi Rush Hour');
    expect(names.filter((n) => /oshodi/i.test(n))).toEqual(['Oshodi Transport Metropolis']);
    // the retired mirrored 41 x 31 board is gone: this is the 45 x 33 six-district board
    expect([W, H]).toEqual([45, 33]);
    expect(districts).toHaveLength(6);
  });

  it('keeps the perimeter closed except the road mouths, and the camera (south) edge low and solid', () => {
    for (let x = 0; x < W; x++) {
      expect(at(x, 0), `north ${x}`).toBe('#');
      expect(at(x, H - 1), `south ${x}`).toBe('#');
    }
    // the south edge is a closed row of low lock-ups: no road, no gap
    expect(a.layout[H - 1]).toBe('#'.repeat(W));
    // the west and east edges are open only at the main road's mouths and its pavements
    for (const x of [0, W - 1]) {
      const edge = a.layout.map((r) => r[x]!);
      expect(edge.filter((c) => c === '=').length, `edge ${x}`).toBe(4);
    }
  });

  it('random crates are drawn over the whole board, never on roads, track or kept-clear floor', () => {
    const s = createGame({ seed: 11, arenaId: a.id, players: roster(32), settings: { game: 'survival' } });
    let soft = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = at(x, y);
        const t = s.tiles[y * W + x];
        if (c === '=' || c === '_') expect(t, `${x},${y}`).toBe(Tile.Empty);
        if (c === 'x' || c === '$') expect(t, `${x},${y}`).toBe(Tile.Soft);
        if (c === '#') expect(t).toBe(Tile.Hard);
        if (t === Tile.Soft) soft++;
      }
    for (const d of districts) {
      let n = 0;
      for (const [x0, y0, x1, y1] of d.rects)
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) if (s.tiles[y * W + x] === Tile.Soft) n++;
      expect(n, d.id).toBeGreaterThan(10);
    }
    expect(soft).toBeGreaterThan(150);
  });
});

describe('Oshodi Metropolis: district graph', () => {
  it('declares the six bible districts (O1-O6), which cover the board exactly once', () => {
    expect(districts.map((d) => d.id).sort()).toEqual(
      [
        'cappaWorks',
        'expresswayJunction',
        'interchangePlaza',
        'railwayEdge',
        'skywalkQuarter',
        'tradingStreets',
      ].sort(),
    );
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const n = districts.filter((d) =>
          d.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1),
        ).length;
        expect(n, `tile ${x},${y}`).toBe(1);
      }
  });

  it('each district is one connected piece on its own (crates ignored)', () => {
    for (const d of districts) {
      const tiles: { x: number; y: number }[] = [];
      for (const [x0, y0, x1, y1] of d.rects)
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (open(x, y)) tiles.push({ x, y });
      expect(tiles.length, d.id).toBeGreaterThan(80);
      const seen = dist(tiles[0]!, (x, y) => districtOf(x, y) === d);
      expect(seen.size, d.id).toBe(tiles.length);
    }
  });

  it('links are valid open tiles on the shared border and the link data is complete', () => {
    const ids = new Set(districts.map((d) => d.id));
    for (const l of links) {
      const name = `${l.from}->${l.to}`;
      expect(ids.has(l.from) && ids.has(l.to) && l.from !== l.to, name).toBe(true);
      expect(l.kind, name).toBe('open'); // no district needs a blast
      expect(l.tiles.length, name).toBeGreaterThan(0);
      for (const [x, y] of l.tiles) {
        expect(open(x, y), `${name} ${x},${y}`).toBe(true);
        expect(at(x, y), `${name} ${x},${y}`).not.toBe('x');
        const own = districtOf(x, y)!.id;
        expect([l.from, l.to], `${name} ${x},${y}`).toContain(own);
      }
    }
    const covered = (p: string, q: string, t1: string, t2: string): boolean =>
      links.some(
        (l) =>
          ((l.from === p && l.to === q) || (l.from === q && l.to === p)) &&
          l.tiles.some(([x, y]) => key(x, y) === t1 || key(x, y) === t2),
      );
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
        ] as const) {
          if (!open(x, y) || !open(x + dx, y + dy)) continue;
          const p = districtOf(x, y)?.id;
          const q = districtOf(x + dx, y + dy)?.id;
          if (!p || !q || p === q) continue;
          expect(covered(p, q, key(x, y), key(x + dx, y + dy)), `${p}|${q} at ${x},${y}`).toBe(true);
        }
  });

  it('encodes the bible routes: direct O3-O1-O4-O5, upper O3-O2-O5, lower O3-O6-O5, plus flank cross-links', () => {
    const pair = (l: { from: string; to: string }): string => [l.from, l.to].sort().join('|');
    const have = new Set(links.map(pair));
    const need = (p: string, q: string): string => [p, q].sort().join('|');
    for (const [p, q] of [
      ['tradingStreets', 'interchangePlaza'],
      ['interchangePlaza', 'expresswayJunction'],
      ['expresswayJunction', 'railwayEdge'],
      ['tradingStreets', 'skywalkQuarter'],
      ['skywalkQuarter', 'railwayEdge'],
      ['tradingStreets', 'cappaWorks'],
      ['cappaWorks', 'railwayEdge'],
    ] as const)
      expect(have.has(need(p, q)), `${p}-${q}`).toBe(true);
    // every district has at least two exits to different neighbours (the big ones three or more)
    for (const d of districts) {
      const nb = new Set(
        links.filter((l) => l.from === d.id || l.to === d.id).map((l) => (l.from === d.id ? l.to : l.from)),
      );
      expect(nb.size, d.id).toBeGreaterThanOrEqual(2);
    }
    expect(
      new Set(
        links.filter((l) => l.from === 'railwayEdge' || l.to === 'railwayEdge').map((l) => l.from + l.to),
      ).size,
    ).toBeGreaterThanOrEqual(3);
  });

  it('the three routes each reach the railway edge from the trading streets on their own districts', () => {
    const inD = (ids: string[]) => (x: number, y: number) =>
      at(x, y) !== 'x' && ids.includes(districtOf(x, y)!.id);
    const from = { x: 3, y: 23 };
    const to = { x: 40, y: 20 };
    for (const via of [['interchangePlaza', 'expresswayJunction'], ['skywalkQuarter'], ['cappaWorks']]) {
      const seen = dist(from, inD(['tradingStreets', 'railwayEdge', ...via]));
      expect(seen.has(key(to.x, to.y)), via.join('+')).toBe(true);
    }
  });
});

describe('Oshodi Metropolis: grade-separated and track-free routes', () => {
  const platformNorth = { x: 40, y: 13 };
  const platformSouth = { x: 39, y: 21 };

  it('the upper route reaches the north platform from the trading streets without a road or track tile', () => {
    const upper = dist(
      { x: 3, y: 2 },
      (x, y) =>
        !isRoad(x, y) &&
        !isTrack(x, y) &&
        ['tradingStreets', 'skywalkQuarter', 'railwayEdge'].includes(districtOf(x, y)!.id),
    );
    expect(upper.has(key(platformNorth.x, platformNorth.y))).toBe(true);
    // and it really goes over the top: through the skywalk quarter, not around the road
    expect(upper.has(key(34, 5))).toBe(true);
  });

  it('the lower route reaches the south platform from the trading streets without a road or track tile', () => {
    const lower = dist(
      { x: 3, y: 30 },
      (x, y) =>
        !isRoad(x, y) &&
        !isTrack(x, y) &&
        ['tradingStreets', 'cappaWorks', 'railwayEdge'].includes(districtOf(x, y)!.id),
    );
    expect(lower.has(key(platformSouth.x, platformSouth.y))).toBe(true);
    expect(lower.has(key(34, 28))).toBe(true);
  });

  it('with every road and track tile removed the board still joins both platforms to the west', () => {
    const noHazardTile = (x: number, y: number): boolean => at(x, y) !== '=';
    const seen = dist({ x: 3, y: 2 }, noHazardTile);
    expect(seen.has(key(platformNorth.x, platformNorth.y))).toBe(true);
    const seenS = dist({ x: 3, y: 30 }, noHazardTile);
    expect(seenS.has(key(platformSouth.x, platformSouth.y))).toBe(true);
  });

  it('the two rail portals are solid blocks inside the upper and lower bands, in line with the tracks', () => {
    for (const x of OSHODI_TRACK_X) {
      for (let y = 7; y <= 9; y++) expect(at(x, y), `north portal ${x},${y}`).toBe('#');
      for (let y = 23; y <= 25; y++) expect(at(x, y), `south portal ${x},${y}`).toBe('#');
      // the shoulders either side of the portals stay walkable so nobody is trapped against a block
      for (const sx of [x - 2 + (x === 36 ? 1 : 0), x + 2 - (x === 37 ? 1 : 0)]) {
        expect(open(sx, 9) && open(sx, 23), `shoulder ${sx}`).toBe(true);
      }
    }
  });
});

describe('Oshodi Metropolis: spawns and teams', () => {
  const hazards = new Set<string>();
  for (const h of a.stageHazards)
    if (h.kind === 'sweep') for (const r of h.routes) for (const [x, y] of r) hazards.add(key(x, y));
  const traps = new Set<string>();
  for (const rows of [a.floorTraps ?? [], ...a.endgameTraps])
    rows.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && traps.add(key(x, y))));

  it('32 distinct spawns on open floor, off every hazard and trap, each with a way out of its own first blast', () => {
    expect(a.spawns).toHaveLength(32);
    expect(new Set(a.spawns.map((s) => key(s.x, s.y))).size).toBe(32);
    for (const s of a.spawns) {
      expect(at(s.x, s.y), key(s.x, s.y)).toBe('.');
      expect(hazards.has(key(s.x, s.y))).toBe(false);
      expect(traps.has(key(s.x, s.y))).toBe(false);
      expect(isTrack(s.x, s.y)).toBe(false);
      const sx = s.x < W / 2 ? 1 : -1;
      const sy = s.y < H / 2 ? 1 : -1;
      for (const o of a.spawnClearance)
        expect(at(s.x + o.x * sx, s.y + o.y * sy), `clear ${key(s.x, s.y)}`).toBe('.');
      expect(a.spawnClearance.some((o) => o.x * o.x + o.y * o.y > 6)).toBe(true);
    }
    expect(a.spawns[0]!.x).toBeLessThan(W / 3);
    expect(a.spawns[0]!.y).toBeGreaterThan((2 * H) / 3);
  });

  it('no spawn is on or beside a rail lane, and none is on any other hazard lane', () => {
    for (const s of a.spawns) {
      expect(hazards.has(key(s.x, s.y)), key(s.x, s.y)).toBe(false);
      for (const [dx, dy] of DIRS) expect(isTrack(s.x + dx, s.y + dy), key(s.x, s.y)).toBe(false);
    }
  });

  it('every spawn reaches every open tile, even with every barrier standing', () => {
    const openCount = a.layout.join('').replace(/[#x]/g, '').length;
    for (const s of a.spawns) {
      const seen = dist(s, (x, y) => at(x, y) !== 'x');
      expect(seen.size, key(s.x, s.y)).toBe(openCount);
    }
  });

  it('slots alternate west / east: every even prefix is half and half (Team Rumble splits by x)', () => {
    a.spawns.forEach((s, i) =>
      i % 2 === 0 ? expect(s.x).toBeLessThan(W / 2) : expect(s.x).toBeGreaterThan(W / 2),
    );
    for (const n of [2, 4, 8, 16, 32]) {
      const s = createGame({ seed: 2, arenaId: a.id, players: roster(n), settings: { game: 'team' } });
      const west = s.players.filter((p) => p.team === 0);
      expect(west).toHaveLength(n / 2);
      for (const p of west) expect(p.x).toBeLessThan(W / 2);
    }
  });

  it('spawns are spread over every district and the two halves start on comparable ground', () => {
    const per = new Map<string, number>();
    for (const s of a.spawns) per.set(districtOf(s.x, s.y)!.id, (per.get(districtOf(s.x, s.y)!.id) ?? 0) + 1);
    // every district starts at least one fighter (the rail edge, which holds the tracks, the fewest) and no
    // district more than 40% of the field
    for (const d of districts) expect(per.get(d.id) ?? 0, d.id).toBeGreaterThanOrEqual(1);
    for (const n of per.values()) expect(n).toBeLessThanOrEqual(13);
    const minGap = (n: number): number => {
      let m = Infinity;
      const s = a.spawns.slice(0, n);
      for (let i = 0; i < s.length; i++)
        for (let j = i + 1; j < s.length; j++)
          m = Math.min(m, Math.abs(s[i]!.x - s[j]!.x) + Math.abs(s[i]!.y - s[j]!.y));
      return m;
    };
    // as spread as the mirrored stages for 8 and 16 starts; 4 for all 32 (the original City Rumble's level)
    expect(minGap(8)).toBeGreaterThanOrEqual(12);
    expect(minGap(16)).toBeGreaterThanOrEqual(8);
    expect(minGap(32)).toBeGreaterThanOrEqual(4);
    const core = { x: 22, y: 16 };
    const toCore = dist(core);
    const supplies: { x: number; y: number }[] = [];
    a.layout.forEach((row, y) => [...row].forEach((c, x) => c === '$' && supplies.push({ x, y })));
    const fromSupply = supplies.map((p) => dist(p));
    const side = (west: boolean) => a.spawns.filter((s) => s.x < W / 2 === west);
    const mean = (xs: number[]): number => xs.reduce((p, q) => p + q, 0) / xs.length;
    for (const n of [8, 16, 32]) {
      const pick = (west: boolean) => side(west).slice(0, n / 2);
      const coreW = mean(pick(true).map((s) => toCore.get(key(s.x, s.y))!));
      const coreE = mean(pick(false).map((s) => toCore.get(key(s.x, s.y))!));
      const supW = mean(pick(true).map((s) => Math.min(...fromSupply.map((d) => d.get(key(s.x, s.y))!))));
      const supE = mean(pick(false).map((s) => Math.min(...fromSupply.map((d) => d.get(key(s.x, s.y))!))));
      expect(Math.abs(coreW - coreE), `core ${n}: ${coreW} vs ${coreE}`).toBeLessThanOrEqual(n === 8 ? 8 : 5);
      expect(Math.abs(supW - supE), `supply ${n}: ${supW} vs ${supE}`).toBeLessThanOrEqual(4);
    }
  });
});

describe('Oshodi Metropolis: supplies, core and attack lanes', () => {
  it('eight marked supply crates, four per half, in every district, never in a dead end', () => {
    const supplies: [number, number][] = [];
    a.layout.forEach((row, y) => [...row].forEach((c, x) => c === '$' && supplies.push([x, y])));
    expect(supplies).toHaveLength(8);
    expect(supplies.filter(([x]) => x < W / 2).length).toBe(4);
    expect(new Set(supplies.map(([x, y]) => districtOf(x, y)!.id)).size).toBe(6);
    for (const [x, y] of supplies) {
      expect(DIRS.filter(([dx, dy]) => open(x + dx, y + dy)).length, `${x},${y}`).toBeGreaterThanOrEqual(3);
      expect(isTrack(x, y)).toBe(false);
      for (const s of a.spawns) expect(Math.abs(s.x - x) + Math.abs(s.y - y), `${x},${y}`).toBeGreaterThan(2);
    }
    const s = createGame({ seed: 4, arenaId: a.id, players: roster(8), settings: { game: 'survival' } });
    expect([...s.supplies].sort((p, q) => p - q)).toEqual(
      supplies.map(([x, y]) => y * W + x).sort((p, q) => p - q),
    );
  });

  it('the Survival core is where the plaza meets the junction: open, on the main road, never on the rails', () => {
    const keep = a.config!.crush!.keepCore!;
    const x0 = Math.floor((W - keep.w!) / 2);
    const y0 = Math.floor((H - keep.h!) / 2);
    let openN = 0;
    const where = new Set<string>();
    for (let y = y0; y < y0 + keep.h!; y++)
      for (let x = x0; x < x0 + keep.w!; x++) {
        where.add(districtOf(x, y)!.id);
        if (open(x, y)) openN++;
        expect(isTrack(x, y)).toBe(false);
      }
    expect([...where].sort()).toEqual(['expresswayJunction', 'interchangePlaza']);
    expect(openN).toBeGreaterThanOrEqual(keep.w! * keep.h! * 0.75);
    expect([...a.layout[16]!.slice(x0, x0 + keep.w!)].every((c) => c === '=')).toBe(true);
  });

  it('the whole Survival core is one connected region, so nobody is cut off in it when the city has closed', () => {
    const keep = a.config!.crush!.keepCore!;
    const x0 = Math.floor((W - keep.w!) / 2);
    const y0 = Math.floor((H - keep.h!) / 2);
    const inCore = (x: number, y: number): boolean =>
      x >= x0 && x < x0 + keep.w! && y >= y0 && y < y0 + keep.h!;
    const tiles: { x: number; y: number }[] = [];
    for (let y = y0; y < y0 + keep.h!; y++)
      for (let x = x0; x < x0 + keep.w!; x++) if (open(x, y)) tiles.push({ x, y });
    // regression: a shelter used to wall tile (17, 12) off from the rest of the core
    expect(dist(tiles[0]!, inCore).size).toBe(tiles.length);
  });

  it('endgame trap waves land on walkable core tiles only', () => {
    const keep = a.config!.crush!.keepCore!;
    const x0 = Math.floor((W - keep.w!) / 2);
    const y0 = Math.floor((H - keep.h!) / 2);
    for (const wave of a.endgameTraps)
      wave.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (c === '.') return;
          expect(open(x, y), `${x},${y}`).toBe(true);
          expect(x >= x0 && x < x0 + keep.w! && y >= y0 && y < y0 + keep.h!, `${x},${y} in core`).toBe(true);
        }),
      );
    expect(a.endgameTraps).toHaveLength(2);
  });

  it('attack lanes are road mouths on the border pointing in, never a track lane', () => {
    const lanes = a.config!.vehicles!.lanes!;
    expect(lanes.length).toBeGreaterThanOrEqual(8);
    for (const [x, y, dir] of lanes) {
      expect(at(x, y), `${x},${y}`).toBe('=');
      expect(isTrack(x, y)).toBe(false);
      const ok =
        (dir === 'down' && y === 0) ||
        (dir === 'up' && y === H - 1) ||
        (dir === 'right' && x === 0) ||
        (dir === 'left' && x === W - 1);
      expect(ok, `${x},${y} ${dir}`).toBe(true);
    }
    const s = createGame({ seed: 6, arenaId: a.id, players: roster(4), settings: { game: 'survival' } });
    for (const kind of ['danfo', 'taxi', 'keke'] as VehicleKind[]) {
      const entries = listEntries(s, kind);
      expect(entries.length, kind).toBeGreaterThanOrEqual(8);
      for (const e of entries)
        expect(lanes.some(([x, y, d]) => x === e.x && y === e.y && d === e.dir)).toBe(true);
    }
  });

  it('the one-press vehicle finds a road-mouth route for each signature vehicle', () => {
    for (const [characterId, kind] of Object.values(CHARACTERS).map((c) => [c.id, c.vehicle] as const)) {
      const s: GameState = createGame({
        seed: 6,
        arenaId: a.id,
        players: [
          { name: 'A', characterId, isBot: false },
          { name: 'B', characterId: 'lekkiBoy', isBot: true },
        ],
        settings: { game: 'survival' },
      });
      s.match.phase = 'playing';
      s.match.countdownRemaining = 0;
      Object.assign(s.players[1]!, { x: 10, y: 16, stepFromX: 10, stepFromY: 16 });
      Object.assign(s.players[0]!, { x: 34, y: 28, stepFromX: 34, stepFromY: 28 });
      const choice = chooseAutoVehicle(s, 0);
      expect(choice, kind).not.toBeNull();
      const lanes = a.config!.vehicles!.lanes!;
      expect(
        lanes.some(([x, y, d]) => x === choice!.entry.x && y === choice!.entry.y && d === choice!.entry.dir),
      ).toBe(true);
      expect(
        choice!.route.some((t) => t.x === 10 && t.y === 16),
        kind,
      ).toBe(true);
    }
  });
});

describe('Oshodi Metropolis: hazards are telegraphed and always leave a safe route', () => {
  const sweeps = a.stageHazards.flatMap((h) => (h.kind === 'sweep' ? [h] : []));
  const train = sweeps.filter((h) => h.style === 'train');

  it('declares traffic waves, bus-bay departures and exactly one railcar hazard, each on road or track tiles', () => {
    expect(sweeps.filter((h) => h.style === 'traffic')).toHaveLength(1);
    expect(sweeps.filter((h) => h.style === 'danfo' && h.depart)).toHaveLength(1);
    expect(train).toHaveLength(1);
    for (const h of sweeps)
      for (const r of h.routes) for (const [x, y] of r) expect(at(x, y), `${h.style} ${x},${y}`).toBe('=');
  });

  it('the railcar runs portal to portal on the two track columns, one lane at a time, and never on a road', () => {
    const h = train[0]!;
    expect(h.routes).toHaveLength(2);
    const cols = h.routes.map((r) => r[0]![0]).sort();
    expect(cols).toEqual([...OSHODI_TRACK_X].sort());
    for (const r of h.routes) {
      const x = r[0]![0];
      expect(r.every(([rx]) => rx === x)).toBe(true);
      const ys = r.map(([, y]) => y);
      expect(Math.min(...ys)).toBe(OSHODI_TRACK_Y[0]);
      expect(Math.max(...ys)).toBe(OSHODI_TRACK_Y[1]);
      // out of one solid portal and into the other
      const first = r[0]!;
      const last = r[r.length - 1]!;
      const ahead = (t: [number, number], from: [number, number]): number => t[1] + Math.sign(t[1] - from[1]);
      expect(at(first[0], first[1] + (first[1] === OSHODI_TRACK_Y[0] ? -1 : 1))).toBe('#');
      expect(at(last[0], ahead(last, r[r.length - 2]!))).toBe('#');
    }
    // the two lanes run in opposite directions
    const dirs = h.routes.map((r) => Math.sign(r[r.length - 1]![1] - r[0]![1]));
    expect(new Set(dirs).size).toBe(2);
  });

  it('warns the railcar at least 3 s ahead (more than any road vehicle) and never faster than traffic', () => {
    const h = train[0]!;
    const config = createGame({ seed: 1, arenaId: a.id, players: roster(2) }).config;
    expect(h.warnSec * TPS).toBeGreaterThanOrEqual(config.stage.minLethalWarnTicks);
    expect(h.warnSec).toBeGreaterThanOrEqual(3);
    for (const other of sweeps.filter((s) => s !== h)) expect(h.warnSec).toBeGreaterThan(other.warnSec);
    expect(h.stepTicks).toBeGreaterThanOrEqual(4); // at most 15 tiles a second
    expect(h.everySec[0]).toBeGreaterThanOrEqual(12); // rare: a landmark, not a constant barrage
  });

  it('every track tile is one step from a track-free tile, and that step fits inside the warning', () => {
    const h = train[0]!;
    const config = createGame({ seed: 1, arenaId: a.id, players: roster(2) }).config;
    for (const r of h.routes) {
      const lane = r.map(([x, y]) => y * W + x);
      const steps = laneEscapeSteps(W, H, lane, (i) => open(i % W, Math.floor(i / W)));
      for (const [j, s] of steps.entries()) expect(s, `tile ${r[j]}`).toBe(1);
      // the slowest walker (slowest speed level plus the slow curse) still gets off in time
      const warn = h.warnSec * TPS;
      const slowest =
        Math.max(...config.movement.stepTicksBySpeedLevel) + config.movement.slowCurseExtraTicks;
      expect(warn).toBeGreaterThan(config.stage.escapeInputTicks + slowest);
    }
  });

  it('both shoulders and both platforms are free of every hazard lane, so there is always a refuge', () => {
    const lane = new Set<string>();
    for (const h of sweeps) for (const r of h.routes) for (const [x, y] of r) lane.add(key(x, y));
    const shoulderRows = [10, 11, 12, 13, 14, 19, 20, 21, 22].filter((y) => open(35, y) && open(38, y));
    expect(shoulderRows.length).toBeGreaterThanOrEqual(6);
    for (const y of shoulderRows) {
      expect(lane.has(key(35, y)), `35,${y}`).toBe(false);
      expect(lane.has(key(38, y)), `38,${y}`).toBe(false);
    }
  });

  it('the hazard fairness guards cover the railcar: one lethal event at a time, none in the quiet seconds', () => {
    const cfg = createGame({ seed: 1, arenaId: a.id, players: roster(2) }).config.stage;
    expect(cfg.maxLethalEvents).toBe(1);
    expect(cfg.quietRemainingTicks).toBeGreaterThan(0);
  });
});

describe('Oshodi Metropolis: the railcar in a running match', () => {
  /** Advances until a railcar event is warned; returns it with the events seen up to then. */
  function untilTrain(s: GameState, max = 150 * TPS): StageEvent {
    for (let i = 0; i < max; i++)
      for (const e of tick(s, {})) if (e.type === 'stageWarning' && e.event.style === 'train') return e.event;
    throw new Error('no railcar warning');
  }

  /** A lane tile that is not also a main-road tile, so only the railcar can hurt a fighter standing on it. */
  const offRoad = (ev: StageEvent): number =>
    ev.tiles.find((i) => Math.floor(i / W) < 15 && Math.floor(i / W) > 11)!;

  it('is announced at least 3.5 s before it moves, on a track lane, and is deterministic by seed', () => {
    const run = (seed: number): string => {
      const s = sandbox({ arenaId: a.id, players: 2, stage: true, seed });
      put(s, 0, 3, 24);
      put(s, 1, 41, 5);
      const ev = untilTrain(s);
      expect(ev.kind).toBe('sweep');
      expect(ev.startTick - ev.warnTick).toBeGreaterThanOrEqual(Math.round(3.5 * TPS));
      for (const i of ev.tiles) expect(isTrack(i % W, Math.floor(i / W))).toBe(true);
      return `${ev.warnTick}:${ev.tiles[0]}`;
    };
    expect(run(3)).toBe(run(3));
  });

  it('kills nobody during the warning, kills whoever stays on the lane, spares the shoulder beside it', () => {
    const s = sandbox({ arenaId: a.id, players: 3, stage: true, seed: 5 });
    put(s, 0, 3, 24);
    put(s, 1, 3, 25);
    put(s, 2, 41, 5);
    const ev = untilTrain(s);
    // two fighters wait out the whole event: one ON the lane, one on the shoulder beside it
    const laneTile = offRoad(ev);
    const lx = laneTile % W;
    const ly = Math.floor(laneTile / W);
    expect(isTrack(lx, ly)).toBe(true);
    const shoulderX = lx === OSHODI_TRACK_X[0] ? 35 : 38;
    put(s, 0, lx, ly);
    put(s, 1, shoulderX, ly);
    for (let t = ev.warnTick; t < ev.startTick; t++) {
      tick(s, {});
      expect(s.players[0]!.alive, `still alive during the warning at tick ${t}`).toBe(true);
    }
    for (let i = 0; i < 12 * TPS && s.stage.events.some((e) => e.id === ev.id); i++) tick(s, {});
    expect(s.players[0]!.alive).toBe(false);
    expect(s.players[1]!.alive).toBe(true);
  });

  it('a fighter who walks off the lane when it is announced always lives', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = sandbox({ arenaId: a.id, players: 2, stage: true, seed });
      put(s, 0, 3, 24);
      put(s, 1, 41, 5);
      const ev = untilTrain(s);
      const laneTile = offRoad(ev);
      const lx = laneTile % W;
      const ly = Math.floor(laneTile / W);
      put(s, 1, lx, ly);
      const off = lx === OSHODI_TRACK_X[0] ? 'left' : 'right';
      for (let i = 0; i < 12 * TPS && s.stage.events.some((e) => e.id === ev.id); i++)
        tick(s, { 1: { move: i < 2 ? off : null } });
      expect(s.players[1]!.alive, `seed ${seed}`).toBe(true);
    }
  });

  it('a long match stays fair: railcars come, every one warned, and never two lethal events at once', () => {
    const s = sandbox({ arenaId: a.id, players: 6, stage: true, seed: 9 });
    const warned: number[] = [];
    let maxLethal = 0;
    for (let i = 0; i < 170 * TPS; i++) {
      for (const e of tick(s, {})) {
        if (e.type === 'stageWarning' && e.event.style === 'train')
          warned.push(e.event.startTick - e.event.warnTick);
      }
      maxLethal = Math.max(
        maxLethal,
        s.stage.events.filter((e) => e.kind === 'sweep' || e.kind === 'strike').length,
      );
    }
    expect(warned.length).toBeGreaterThanOrEqual(2);
    for (const w of warned) expect(w).toBeGreaterThanOrEqual(Math.round(3.5 * TPS));
    expect(maxLethal).toBeLessThanOrEqual(1);
  });
});

describe('Oshodi Metropolis: future boss slot', () => {
  it('only reserves the identity slot: no boss is implemented and nothing real is named', () => {
    expect(a.futureBoss?.status).toBe('reserved');
    expect(a.futureBoss?.area).toBe('Oshodi');
    const text = JSON.stringify([a.info, a.name]);
    expect(text).not.toMatch(/boss/i);
    expect(Object.keys(CHARACTERS).some((id) => /boss/i.test(id))).toBe(false);
    for (const other of ['rumbleOjuelegba', 'rumbleApapa'])
      expect(getArena(other).futureBoss, other).toBeUndefined();
  });
});
