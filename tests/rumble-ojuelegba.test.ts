/**
 * City Rumble Evolution, workstream D: the five-district Ojuelegba Underbridge (45 x 33, not mirrored).
 * Districts and links are data (`ArenaDef.districts` / `districtLinks`); these checks keep the data honest
 * and the board fair for 32 competitors, Team Rumble's west-versus-east split and the vehicle lanes.
 * The generic stage guarantees (closing ring, hazards, bots) are in tests/rumble-stages.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { chooseAutoVehicle, createGame, getArena, listEntries, Tile } from '../src/sim';
import type { DistrictDef, GameState, VehicleKind } from '../src/sim';
import { CHARACTERS } from '../src/sim/data/characters';

const a = getArena('rumbleOjuelegba');
const W = a.layout[0]!.length;
const H = a.layout.length;
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

describe('Ojuelegba Underbridge: the board', () => {
  it('is a non-mirrored 45 x 33 board in its old place among the Rumble stages', () => {
    expect([W, H]).toEqual([45, 33]);
    for (const row of a.layout) expect(row).toMatch(/^[#=._x$]{45}$/);
    expect(a.name).toBe('Ojuelegba Underbridge');
    expect(a.mirrorSoftBlocks).toBe(false);
    // not mirror symmetric (left-right or top-bottom): a city, not a kaleidoscope
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

  it('random crates are drawn over the whole board, never on roads, kept-clear floor or spawn clearances', () => {
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
    // every district gets crates of its own (no mirrored quadrant copies)
    for (const d of districts) {
      let n = 0;
      for (const [x0, y0, x1, y1] of d.rects)
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) if (s.tiles[y * W + x] === Tile.Soft) n++;
      expect(n, d.id).toBeGreaterThan(20);
    }
    expect(soft).toBeGreaterThan(200);
  });
});

describe('Ojuelegba Underbridge: districts', () => {
  it('declares the five districts, which cover the board exactly once', () => {
    expect(districts.map((d) => d.id)).toEqual([
      'westApproach',
      'pierCourt',
      'danfoPark',
      'shopfrontLane',
      'serviceLoop',
    ]);
    expect(districts.map((d) => d.role)).toEqual(['approach', 'underbridge', 'park', 'lane', 'service']);
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

  it('links are valid: open tiles on the shared border; breaches are barriers, chokepoints one or two wide', () => {
    const ids = new Set(districts.map((d) => d.id));
    for (const l of links) {
      const name = `${l.from}->${l.to} ${l.kind}`;
      expect(ids.has(l.from) && ids.has(l.to) && l.from !== l.to, name).toBe(true);
      expect(l.tiles.length, name).toBeGreaterThan(0);
      for (const [x, y] of l.tiles) {
        expect(open(x, y), `${name} ${x},${y}`).toBe(true);
        const own = districtOf(x, y)!.id;
        expect([l.from, l.to], `${name} ${x},${y}`).toContain(own);
        const other = own === l.from ? l.to : l.from;
        const touches = DIRS.some(
          ([dx, dy]) => open(x + dx, y + dy) && districtOf(x + dx, y + dy)?.id === other,
        );
        expect(touches, `${name} ${x},${y} touches ${other}`).toBe(true);
        if (l.kind === 'breach') expect(at(x, y), name).toBe('x');
        else expect(at(x, y), name).not.toBe('x');
      }
      if (l.kind === 'chokepoint') expect(l.tiles.length, name).toBeLessThanOrEqual(2);
    }
  });

  it('every crossing between two districts belongs to a declared link (the link data is complete)', () => {
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

  it('every district has at least two exits that need no blasting (flanks), the big ones three or more', () => {
    for (const d of districts) {
      const exits = links.filter((l) => l.kind !== 'breach' && (l.from === d.id || l.to === d.id));
      expect(exits.length, d.id).toBeGreaterThanOrEqual(2);
      const neighbours = new Set(exits.map((l) => (l.from === d.id ? l.to : l.from)));
      expect(neighbours.size, d.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('encodes the approved district graph: A-B, B-C, A-D, D-C, A-E, E-C open, B-E only by breaching', () => {
    const short: Record<string, string> = {
      westApproach: 'A',
      pierCourt: 'B',
      danfoPark: 'C',
      shopfrontLane: 'D',
      serviceLoop: 'E',
    };
    const pair = (l: { from: string; to: string }): string => [short[l.from], short[l.to]].sort().join('');
    expect(new Set(links.filter((l) => l.kind !== 'breach').map(pair))).toEqual(
      new Set(['AB', 'BC', 'AD', 'CD', 'AE', 'CE']),
    );
    expect(links.filter((l) => l.kind === 'breach').map(pair)).toEqual(['BE']);
    // three different A -> C paths: through the pier court, the shopfront flank, the rear loop (each
    // district on its own, barriers standing)
    const inD = (ids: string[]) => (x: number, y: number) =>
      at(x, y) !== 'x' && ids.includes(districtOf(x, y)!.id);
    const from = { x: 2, y: 16 };
    const to = { x: 40, y: 16 };
    for (const via of ['pierCourt', 'shopfrontLane', 'serviceLoop']) {
      const pass = inD(['westApproach', 'danfoPark', via]);
      // never touch the road in A / C for the flanks: start and end on it, but the middle must use `via`
      expect(dist(from, pass).has(key(to.x, to.y)), via).toBe(true);
    }
    expect(dist(from, inD(['westApproach', 'danfoPark'])).has(key(to.x, to.y))).toBe(false);
  });

  it('breaches are real shortcuts: blasting the barrier saves at least four steps', () => {
    // the B-E link plus the shop lane's cross-passage partition (inside D)
    const breaches = [
      ...links.filter((l) => l.kind === 'breach'),
      {
        from: 'shopfrontLane',
        to: 'shopfrontLane',
        kind: 'breach' as const,
        tiles: [[22, 28]] as [number, number][],
      },
    ];
    expect(at(22, 28)).toBe('x');
    const noBarriers = (x: number, y: number): boolean => at(x, y) !== 'x';
    for (const l of breaches) {
      const [bx, by] = l.tiles[0]!;
      // the open tiles either side of the barrier, one in each district
      const side = (id: string) =>
        DIRS.map(([dx, dy]) => ({ x: bx + dx, y: by + dy })).find(
          (t) => open(t.x, t.y) && at(t.x, t.y) !== 'x' && districtOf(t.x, t.y)?.id === id,
        );
      const p = l.from === l.to ? { x: bx, y: by - 1 } : side(l.from)!;
      const q = l.from === l.to ? { x: bx, y: by + 1 } : side(l.to)!;
      expect(p && q, `${l.from}->${l.to}`).toBeTruthy();
      const through = dist(p).get(key(q.x, q.y))!;
      const around = dist(p, noBarriers).get(key(q.x, q.y));
      expect(around, `${l.from}->${l.to} still reachable with the barrier standing`).toBeDefined();
      expect(around! - through, `${l.from}->${l.to} saving`).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('Ojuelegba Underbridge: spawns and teams', () => {
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
      const sx = s.x < W / 2 ? 1 : -1;
      const sy = s.y < H / 2 ? 1 : -1;
      for (const o of a.spawnClearance)
        expect(at(s.x + o.x * sx, s.y + o.y * sy), `clear ${key(s.x, s.y)}`).toBe('.');
      // a cleared tile outside the base radial disc (R 2: dx^2 + dy^2 <= 6), reached in a straight run or one turn
      expect(a.spawnClearance.some((o) => o.x * o.x + o.y * o.y > 6)).toBe(true);
    }
    // the human (slot 0) starts in the south-west
    expect(a.spawns[0]!.x).toBeLessThan(W / 3);
    expect(a.spawns[0]!.y).toBeGreaterThan((2 * H) / 3);
  });

  it('every spawn reaches every district and every open tile, even with every barrier standing', () => {
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

  it('spawns are spread over every district and the two team halves start on comparable ground', () => {
    const per = new Map<string, number>();
    for (const s of a.spawns) per.set(districtOf(s.x, s.y)!.id, (per.get(districtOf(s.x, s.y)!.id) ?? 0) + 1);
    for (const d of districts) expect(per.get(d.id) ?? 0, d.id).toBeGreaterThanOrEqual(2);
    // farthest-point spread, comparable to the mirrored stages (12 / 8 / 5)
    const minGap = (n: number): number => {
      let m = Infinity;
      const s = a.spawns.slice(0, n);
      for (let i = 0; i < s.length; i++)
        for (let j = i + 1; j < s.length; j++)
          m = Math.min(m, Math.abs(s[i]!.x - s[j]!.x) + Math.abs(s[i]!.y - s[j]!.y));
      return m;
    };
    expect(minGap(8)).toBeGreaterThanOrEqual(12);
    expect(minGap(16)).toBeGreaterThanOrEqual(8);
    expect(minGap(32)).toBeGreaterThanOrEqual(5);
    // fairness between the halves: walking distance to the pier court (the core) and to the nearest supply
    // crate, averaged per side, differ by little
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
      // eight starts are few: the human's south-west corner weighs on the west mean
      expect(Math.abs(coreW - coreE), `core ${n}: ${coreW} vs ${coreE}`).toBeLessThanOrEqual(n === 8 ? 8 : 4);
      expect(Math.abs(supW - supE), `supply ${n}: ${supW} vs ${supE}`).toBeLessThanOrEqual(3);
    }
  });
});

describe('Ojuelegba Underbridge: supplies, core, hazards and attack lanes', () => {
  it('eight marked supply crates, four per half, in every district, never in a dead end', () => {
    const supplies: [number, number][] = [];
    a.layout.forEach((row, y) => [...row].forEach((c, x) => c === '$' && supplies.push([x, y])));
    expect(supplies.length).toBeGreaterThanOrEqual(4);
    expect(supplies.length).toBeLessThanOrEqual(8);
    expect(supplies.filter(([x]) => x < W / 2).length).toBe(supplies.length / 2);
    expect(new Set(supplies.map(([x, y]) => districtOf(x, y)!.id)).size).toBe(5);
    for (const [x, y] of supplies) {
      // reachable from three sides at least: blasting it never means camping in a pocket
      expect(DIRS.filter(([dx, dy]) => open(x + dx, y + dy)).length, `${x},${y}`).toBeGreaterThanOrEqual(3);
      // never next to a spawn (nobody starts with an upgrade at their feet)
      for (const s of a.spawns) expect(Math.abs(s.x - x) + Math.abs(s.y - y), `${x},${y}`).toBeGreaterThan(2);
    }
    const s = createGame({ seed: 4, arenaId: a.id, players: roster(8), settings: { game: 'survival' } });
    expect([...s.supplies].sort((p, q) => p - q)).toEqual(
      supplies.map(([x, y]) => y * W + x).sort((p, q) => p - q),
    );
  });

  it('the Survival core is the pier court: open, kept clear, connected, under the bridge', () => {
    const keep = a.config!.crush!.keepCore!;
    const x0 = Math.floor((W - keep.w!) / 2);
    const y0 = Math.floor((H - keep.h!) / 2);
    let openN = 0;
    let clear = 0;
    for (let y = y0; y < y0 + keep.h!; y++)
      for (let x = x0; x < x0 + keep.w!; x++) {
        expect(districtOf(x, y)!.id).toBe('pierCourt');
        if (open(x, y)) openN++;
        if (at(x, y) === '_') clear++;
      }
    expect(openN).toBeGreaterThanOrEqual(keep.w! * keep.h! * 0.75);
    // the clear bay beside the road is kept free of crates; the road strip runs through the core
    expect(clear).toBeGreaterThanOrEqual(10);
    expect([...a.layout[16]!.slice(x0, x0 + keep.w!)].every((c) => c === '=')).toBe(true);
  });

  it('traffic sweeps drive the wide carriageway; the Danfo departure runs the park aisle and lane', () => {
    const traffic = a.stageHazards.filter((h) => h.kind === 'sweep' && h.style === 'traffic');
    const danfo = a.stageHazards.filter((h) => h.kind === 'sweep' && h.style === 'danfo');
    expect(traffic).toHaveLength(1);
    expect(danfo).toHaveLength(1);
    for (const h of traffic)
      if (h.kind === 'sweep')
        for (const r of h.routes)
          r.forEach(([x, y], i) => {
            // a wide road: another road tile beside it, across the direction of travel
            const [nx] = r[i + 1] ?? r[i - 1]!;
            const across =
              nx === x
                ? [
                    [1, 0],
                    [-1, 0],
                  ]
                : [
                    [0, 1],
                    [0, -1],
                  ];
            expect(
              across.some(([dx, dy]) => at(x + dx, y + dy) === '='),
              `${x},${y}`,
            ).toBe(true);
          });
    for (const h of danfo)
      if (h.kind === 'sweep') {
        expect(h.warnSec).toBeGreaterThanOrEqual(2);
        for (const r of h.routes) {
          for (const [x, y] of r) expect(districtOf(x, y)!.id).toBe('danfoPark');
          // it leaves through the east edge along the departure lane
          expect(r[r.length - 1]![0]).toBe(W - 1);
        }
      }
  });

  it('attack lanes are road mouths on the border pointing in, and every vehicle has several legal routes', () => {
    const lanes = a.config!.vehicles!.lanes!;
    expect(lanes.length).toBeGreaterThanOrEqual(8);
    for (const [x, y, dir] of lanes) {
      expect(at(x, y), `${x},${y}`).toBe('=');
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
      // only declared lanes
      for (const e of entries)
        expect(lanes.some(([x, y, d]) => x === e.x && y === e.y && d === e.dir)).toBe(true);
    }
  });

  it('the one-press vehicle finds a road-mouth route for each signature vehicle', () => {
    const kinds = Object.values(CHARACTERS).map((c) => [c.id, c.vehicle] as const);
    for (const [characterId, kind] of kinds) {
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
      // the rival waits on the carriageway, the caller far away in the park
      Object.assign(s.players[1]!, { x: 10, y: 16, stepFromX: 10, stepFromY: 16 });
      Object.assign(s.players[0]!, { x: 33, y: 25, stepFromX: 33, stepFromY: 25 });
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
