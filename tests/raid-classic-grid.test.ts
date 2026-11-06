/**
 * THE CLASSIC GRID (docs/CLASSIC_GRID.md, decisions CG1-CG6): every raid is a Bomberman pillar maze, the enemies plan on
 * exactly the tiles the simulation lets them walk, and the cross bomb works the maze (it stops at pillars, takes the
 * first crate of each arm, traps a rival in a corridor, and a rival at a junction escapes round the corner).
 *
 *   1. the layout-shape rule (`raidShape` / `raidShapeProblems`, run by `raidProblems`) holds for all six raids, and it
 *      rejects the open hall the depot used to be;
 *   2. fairness: the entrance gives the first bomb two ways out, every enemy spot has an exit and a crate-free path on
 *      the bot's own board to the human's entrance, and every belt can still be left (raid-layouts);
 *   3. the bot board (`ai/world.ts`, built from `observe()`) blocks exactly the tiles `canPlayerEnter` refuses, for every
 *      tile, at the start and after doors, cargo, crates and generators change;
 *   4. cross bombs in the new depot: pillars and walls stop the arms, the first crate of each arm breaks and nothing
 *      passes it, marked cargo takes its hit; a corridor bomb traps, a junction lets the rival out.
 */
import { describe, expect, it } from 'vitest';
import { enemyProfile } from '../src/ai/enemyBot';
import { World } from '../src/ai/world';
import { RAID_DEFS, RAID_IDS, observe } from '../src/sim';
import type { GameState, Intents, SimEvent } from '../src/sim';
import {
  RAID_SHAPE_RULE,
  RAID_TUNING,
  enemySeats,
  parseRaidLayout,
  raidProblems,
  raidShape,
  raidShapeProblems,
} from '../src/sim/raid';
import type { RaidDef } from '../src/sim/raid';
import { analyseRaid } from '../src/sim/raid/analysis';
import { canPlayerEnter } from '../src/sim/systems/stepping';
import { previewBlast } from '../src/sim/systems/explosions';
import { Tile } from '../src/sim/types';
import { flameKeys, keys } from './helpers';
import { addGenerator } from './helpers';
import { advance, explodeAt, letWavesAppear, newRaid, of, put, waveSeats } from './raid-helpers';

const DIRS4: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const k = (x: number, y: number): string => `${x},${y}`;

/** The depot as it was before the classic grid (a4fe457): open west hall and east bay. */
const OLD_DEPOT: readonly string[] = [
  '#################',
  '#A..#..x..xK#.M.#',
  '#...1.......2...#',
  '#...#.#.#.#.#...#',
  '#####.......#####',
  '#.....xa...b#dv.#',
  '#.....#.#.#.#.v.#',
  '#......xMx....v.#',
  '#.....#.#.#.#*v.#',
  '#....e..xMxc..v.#',
  '#...#..f.######.#',
  '#@..#....3.H.#.E#',
  '#################',
];

describe('1. the classic-grid shape rule', () => {
  for (const id of RAID_IDS) {
    it(`${id}: a pillar maze (no open 3x3, few deliberate open 2x2, the lattice nearly whole)`, () => {
      const def = RAID_DEFS[id];
      const s = raidShape(def);
      expect(raidShapeProblems(def)).toEqual([]);
      expect(s.open3x3).toBe(0);
      expect(s.open2x2).toBeLessThanOrEqual(RAID_SHAPE_RULE.maxOpen2x2);
      expect(s.strayPockets).toEqual([]);
      expect(s.lattice).toBeGreaterThanOrEqual(RAID_SHAPE_RULE.minLattice);
    });
  }

  it('the measured numbers of the redrawn raids (docs/CLASSIC_GRID.md table)', () => {
    const table = Object.fromEntries(
      RAID_IDS.map((id) => {
        const s = raidShape(RAID_DEFS[id]);
        return [id, [s.open2x2, s.open3x3, `${s.pillars}/${s.latticeCells}`]];
      }),
    );
    expect(table).toEqual({
      warehouseDispatchDepot: [0, 0, '32/34'],
      partsStoreroom: [0, 0, '24/24'],
      railYardGoods: [3, 0, '27/28'],
      recordsVault: [1, 0, '29/30'],
      junctionToolShed: [0, 0, '15/15'],
      standbyPlant: [0, 0, '15/15'],
    });
  });

  it('the old open depot is rejected: open 3x3 halls, stray open squares and a broken lattice', () => {
    const old: RaidDef = { ...RAID_DEFS.warehouseDispatchDepot, layout: [...OLD_DEPOT] };
    const s = raidShape(old);
    expect(s.open3x3).toBeGreaterThan(10);
    expect(s.open2x2).toBeGreaterThan(40);
    expect(s.lattice).toBeLessThan(0.6);
    const problems = raidProblems(old);
    expect(problems.some((p) => p.startsWith('open 3x3 floor'))).toBe(true);
    expect(problems.some((p) => p.includes('open 2x2 outside'))).toBe(true);
    expect(problems.some((p) => p.startsWith('pillar lattice'))).toBe(true);
  });

  it('knocking out one pillar is enough to be caught (an open square outside every pocket)', () => {
    const def = RAID_DEFS.warehouseDispatchDepot;
    const rows = def.layout.map((r) => r.split(''));
    rows[8]![6] = '.'; // the rack column at (6,8): (5..7, 7..9) becomes open floor
    const broken: RaidDef = { ...def, layout: rows.map((r) => r.join('')) };
    expect(raidShapeProblems(broken).some((p) => p.includes('open 2x2 outside'))).toBe(true);
  });

  it('a pocket at the entrance, in a room or by a belt is allowed; one in the middle of the hall is not', () => {
    const vault = raidShape(RAID_DEFS.recordsVault);
    expect(vault.open2x2).toBe(1); // (1..2, 10..11): the spawn pocket
    const yard = raidShape(RAID_DEFS.railYardGoods);
    expect(yard.open2x2).toBe(3); // the belt corner at (14,4)
    expect(yard.strayPockets).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------------ fairness

/** The doors open when an enemy seat appears: its wave's doors (from the analysis) plus its room's own door. */
function doorsWhenSeatAppears(def: RaidDef, seat: ReturnType<typeof enemySeats>[number]): Set<string> {
  const a = analyseRaid(def);
  if (seat.room === null) return new Set(a.doorsAtWaveStart[seat.wave]);
  const room = def.rooms.find((r) => r.id === seat.room)!;
  const i = a.doorsInOrder.indexOf(room.door);
  return new Set(a.doorsInOrder.slice(0, i + 1));
}

function openDoors(state: GameState, ids: Set<string>): void {
  for (const d of state.raid!.doors) {
    if (!ids.has(d.id)) continue;
    d.open = true;
    state.tiles[d.y * state.width + d.x] = Tile.Empty;
  }
}

/** The bot's walkability exactly as an enemy plans with it (ai/world.ts over `observe()`). */
function botBoard(state: GameState, seatId: number): World {
  const w = new World();
  w.refresh(observe(state, seatId), enemyProfile('rookie'));
  return w;
}

describe('2. fairness of the maze', () => {
  for (const id of RAID_IDS) {
    describe(id, () => {
      const def = RAID_DEFS[id];
      const parsed = parseRaidLayout(def);

      it('the entrance gives the first bomb two ways out (no self-trap at spawn)', () => {
        const state = newRaid(id);
        const e = parsed.entrance;
        const gen = addGenerator(state, { ownerId: 0, x: e.x, y: e.y, range: def.bombs.range });
        const blast = new Set(
          [...previewBlast(state, gen)].map((i) => k(i % state.width, Math.floor(i / state.width))),
        );
        state.generators.length = 0;
        // steps before the fuse is out (the slowest walking speed), minus a margin
        const steps =
          Math.floor(state.config.generator.fuseTicks / state.config.movement.stepTicksBySpeedLevel[0]!) - 4;
        const free = (x: number, y: number): boolean => state.tiles[y * state.width + x] === Tile.Empty;
        let ways = 0;
        for (const [dx, dy] of DIRS4) {
          const first = { x: e.x + dx, y: e.y + dy };
          if (!free(first.x, first.y)) continue;
          // a safe tile reachable through this first step, without walking back over the generator's tile
          const seen = new Set([k(e.x, e.y), k(first.x, first.y)]);
          let frontier = [first];
          let safe = !blast.has(k(first.x, first.y));
          for (let s = 2; s <= steps && !safe; s++) {
            const next: { x: number; y: number }[] = [];
            for (const t of frontier)
              for (const [ax, ay] of DIRS4) {
                const n = { x: t.x + ax, y: t.y + ay };
                if (seen.has(k(n.x, n.y)) || !free(n.x, n.y)) continue;
                seen.add(k(n.x, n.y));
                if (!blast.has(k(n.x, n.y))) safe = true;
                next.push(n);
              }
            frontier = next;
          }
          if (safe) ways++;
        }
        expect(ways, `escape directions from the entrance ${e.x},${e.y}`).toBeGreaterThanOrEqual(2);
      });

      it('every enemy spot stands on floor with an exit, and a crate-free path on the bot board reaches the entrance', () => {
        for (const seat of enemySeats(def)) {
          const state = newRaid(id);
          openDoors(state, doorsWhenSeatAppears(def, seat));
          const seatId = state.raid!.seats.find(
            (s) => s.spot.x === seat.at.x && s.spot.y === seat.at.y,
          )!.playerId;
          put(state, seatId, seat.at.x, seat.at.y);
          const world = botBoard(state, seatId);
          const t0 = seat.at.y * state.width + seat.at.x;
          expect(state.tiles[t0], `spot ${seat.spot}`).toBe(Tile.Empty);
          expect(world.exits(t0), `spot ${seat.spot} has a way out`).toBeGreaterThan(0);
          // BFS over the bot's own board: walls, closed doors, crates, cargo and barrels all block
          const goal = parsed.entrance.y * state.width + parsed.entrance.x;
          const seen = new Set([t0]);
          const queue = [t0];
          for (let h = 0; h < queue.length; h++) {
            const t = queue[h]!;
            for (let d = 0; d < 4; d++) {
              const v = world.board.neighbor[t * 4 + d]!;
              if (v < 0 || seen.has(v) || world.blocked[v] === 1) continue;
              seen.add(v);
              queue.push(v);
            }
          }
          expect(
            seen.has(goal),
            `${id}: spot ${seat.spot} (${seat.at.x},${seat.at.y}) cannot reach the entrance`,
          ).toBe(true);
        }
      });
    });
  }
});

// ------------------------------------------------------------------------------------------------ AI board == sim

/** For every tile: the bot's `blocked` and `walk` say "blocked" exactly when `canPlayerEnter` says no. */
function expectSameBlocked(state: GameState, seatId: number, when: string): void {
  const w = botBoard(state, seatId);
  const me = state.players[seatId]!;
  const diff: string[] = [];
  for (let y = 0; y < state.height; y++)
    for (let x = 0; x < state.width; x++) {
      const t = y * state.width + x;
      const sim = canPlayerEnter(state, x, y, me);
      if ((w.blocked[t] === 0) !== sim || (w.walk[t] === 0) !== sim) diff.push(`${x},${y}`);
    }
  expect(diff, `${state.raid!.raidId} ${when}: bot board and sim disagree`).toEqual([]);
}

describe('3. the enemy planner sees the same blocked tiles as the simulation', () => {
  for (const id of RAID_IDS) {
    it(`${id}: at the start, with doors opened, cargo and crates gone, and generators down`, () => {
      const state = newRaid(id);
      letWavesAppear(state);
      const seat = waveSeats(state, 0)[0]!;
      expectSameBlocked(state, seat, 'at the start');
      // every door open (a door is a wall until then, for both)
      openDoors(state, new Set(state.raid!.doors.map((d) => d.id)));
      expectSameBlocked(state, seat, 'doors open');
      // destroyed cargo, crates and barrels open their tiles for both
      const sink: SimEvent[] = [];
      for (const c of state.raid!.cargo.slice(0, 3)) {
        c.hp = 0;
        c.destroyed = true;
        state.tiles[c.y * state.width + c.x] = Tile.Empty;
      }
      advance(state, 2, {}, sink);
      expectSameBlocked(state, seat, 'cargo gone');
      // a generator on the ground blocks both (the belt tiles, switches and spots stay floor for both)
      const floor = state.tiles.findIndex(
        (t, i) => t === Tile.Empty && !state.players.some((p) => p.alive && p.y * state.width + p.x === i),
      );
      addGenerator(state, { ownerId: 0, x: floor % state.width, y: Math.floor(floor / state.width) });
      expectSameBlocked(state, seat, 'a generator down');
    });
  }

  it('the depot mid-raid (the scripted human has played): still identical', () => {
    const state = newRaid('warehouseDispatchDepot');
    letWavesAppear(state);
    // the guards are down, the bay door opens, a crate breaks next to the hall
    for (const id of waveSeats(state, 0)) state.players[id]!.alive = false;
    explodeAt(state, 7, 5); // the crate at (5,5)
    advance(state, 60);
    expect(state.raid!.doors.find((d) => d.id === 'bayDoor')!.open).toBe(true);
    // a wave-2 seat as the observer
    state.raid!.cargo.find((c) => c.id === 'cargo-1')!.destroyed = true;
    state.tiles[7 * state.width + 8] = Tile.Empty;
    advance(state, RAID_TUNING.spawnWarnTicks + 5);
    const seat = waveSeats(state, 1)[0]!;
    expectSameBlocked(state, seat, 'mid-raid');
  });
});

// ------------------------------------------------------------------------------------------------ cross bombs

describe('4. cross bombs work the maze (the depot)', () => {
  it('pillars and walls stop the arms; the first crate of an arm breaks and nothing behind it burns', () => {
    const state = newRaid();
    put(state, 0, 1, 11);
    // (7,7): a junction; west (6,7) is a crate with (5,7) floor behind it, east (8,7) the marked crate with (9,7) behind;
    // the pillars (6,6), (8,6), (6,8), (8,8) stand on its diagonals
    const ev = explodeAt(state, 7, 7);
    expect(flameKeys(state)).toEqual(keys([7, 7], [6, 7], [8, 7], [7, 6], [7, 5], [7, 8], [7, 9]));
    expect(of(ev, 'blockDestroyed').map((e) => [e.x, e.y])).toEqual([[6, 7]]);
    expect(of(ev, 'cargoHit').map((e) => [e.id, e.hpAfter])).toEqual([['cargo-1', 1]]);
    // nothing past the crate or the cargo, nothing diagonal
    expect(state.flames.some((f) => f.x === 5 && f.y === 7)).toBe(false);
    expect(state.flames.some((f) => f.x === 9 && f.y === 7)).toBe(false);
    for (const f of state.flames) expect(f.x === 7 || f.y === 7).toBe(true);
    expect(state.tiles[7 * state.width + 5]).toBe(Tile.Empty);
  });

  it('a corridor tile between two pillars: the row arms stop at once; the outer wall stops the column arm', () => {
    const state = newRaid();
    put(state, 0, 1, 11);
    // (11,4): the north aisle's mouth, pillars (10,4) and (12,4) beside it, (11,3)-(11,2) above, (11,5)-(11,6) below
    explodeAt(state, 11, 4);
    expect(flameKeys(state)).toEqual(keys([11, 4], [11, 3], [11, 2], [11, 5], [11, 6]));
    advance(state, state.config.generator.flameTicks + 5);
    // the east lane at (15,6): the outer wall (16,6) and the pillar (14,6) stop the row; the column runs
    explodeAt(state, 15, 6);
    expect(flameKeys(state)).toEqual(keys([15, 6], [15, 5], [15, 7], [15, 8])); // (15,4) is the bay's wall
  });

  /** A rival that always runs for the nearest tile outside every live blast (shortest path over enterable tiles). */
  function flee(state: GameState, id: number): Intents {
    const me = state.players[id]!;
    const danger = new Set<string>();
    for (const g of state.generators)
      for (const i of previewBlast(state, g)) danger.add(k(i % state.width, Math.floor(i / state.width)));
    for (const f of state.flames) danger.add(k(f.x, f.y));
    if (!danger.has(k(me.x, me.y))) return { [id]: {} };
    const prev = new Map<string, string | null>([[k(me.x, me.y), null]]);
    const queue = [{ x: me.x, y: me.y }];
    for (let h = 0; h < queue.length; h++) {
      const t = queue[h]!;
      if (!danger.has(k(t.x, t.y))) {
        let step = k(t.x, t.y);
        while (prev.get(step) !== k(me.x, me.y)) step = prev.get(step)!;
        const [sx, sy] = step.split(',').map(Number) as [number, number];
        const move = sx > me.x ? 'right' : sx < me.x ? 'left' : sy > me.y ? 'down' : 'up';
        return { [id]: { move } };
      }
      for (const [dx, dy] of DIRS4) {
        const n = { x: t.x + dx, y: t.y + dy };
        if (prev.has(k(n.x, n.y)) || !canPlayerEnter(state, n.x, n.y, me)) continue;
        prev.set(k(n.x, n.y), k(t.x, t.y));
        queue.push(n);
      }
    }
    return { [id]: { move: 'right' } }; // nowhere to go: push against the generator (it blocks, no contact ability)
  }

  /** Lays a real generator (the ordinary fuse) at (gx, gy) with the rival on (rx, ry); the rival flees until it is over. */
  function bombRival(gx: number, gy: number, rx: number, ry: number) {
    const state = newRaid();
    letWavesAppear(state);
    put(state, 0, 1, 11);
    const rival = waveSeats(state, 0)[0]!;
    put(state, rival, rx, ry);
    advance(state, RAID_TUNING.enemyAppearProtectTicks + 1); // past the fresh-spawn protection
    put(state, rival, rx, ry);
    const gen = addGenerator(state, { ownerId: 0, x: gx, y: gy, range: 2 });
    const blast = new Set(
      [...previewBlast(state, gen)].map((i) => k(i % state.width, Math.floor(i / state.width))),
    );
    // every tile the rival can reach with the generator down (generators block feet; enemies have no contact ability)
    expect(state.players[rival]!.contact).toBeNull();
    const reach = new Set([k(rx, ry)]);
    const queue = [{ x: rx, y: ry }];
    for (let h = 0; h < queue.length; h++)
      for (const [dx, dy] of DIRS4) {
        const n = { x: queue[h]!.x + dx, y: queue[h]!.y + dy };
        if (reach.has(k(n.x, n.y)) || !canPlayerEnter(state, n.x, n.y, state.players[rival])) continue;
        reach.add(k(n.x, n.y));
        queue.push(n);
      }
    const sink: SimEvent[] = [];
    for (let i = 0; i < state.config.generator.fuseTicks + 40; i++)
      advance(state, 1, flee(state, rival), sink);
    const hits = of(sink, 'campaignHit').filter((e) => e.victimId === rival && e.damage > 0);
    return { state, rival, blast, reach, hits, sink };
  }

  it('a bomb in a corridor traps a rival in that corridor with no side exit: every tile it can reach burns', () => {
    // (4,7): the crate (3,7) behind it, pillars (4,6) and (4,8) beside it; the bomb on (5,7) closes the only way out
    const r = bombRival(5, 7, 4, 7);
    expect([...r.reach].every((t) => r.blast.has(t))).toBe(true);
    expect(r.hits.length).toBeGreaterThan(0);
    expect(of(r.sink, 'campaignHit').filter((e) => e.victimId === 0)).toHaveLength(0);
  });

  it('a rival at a junction escapes round the corner (the diagonal refuge stays legitimate)', () => {
    // (11,7): a junction right next to the bomb on (10,7), in its row (the arm runs on to (12,7)); the nearest tiles
    // off the cross are (11,6) and (11,8), one step round the corner of the pillars (10,6) / (10,8)
    const r = bombRival(10, 7, 11, 7);
    expect(r.blast.has(k(11, 7))).toBe(true);
    expect([...r.reach].some((t) => !r.blast.has(t))).toBe(true);
    expect(r.hits).toHaveLength(0);
    const p = r.state.players[r.rival]!;
    expect(p.alive).toBe(true);
    expect(r.blast.has(k(p.x, p.y))).toBe(false);
    expect(p.x === 11 && p.y !== 7).toBe(true); // it turned the corner of the pillar
  });
});
