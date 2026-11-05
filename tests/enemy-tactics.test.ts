/**
 * Campaign enemy group tactics (decision EA4): surround, block, hold, reinforce, and throwers that keep their distance
 * and line up. Bots read the tactic only through `observe().directive`; the movement is still the ordinary planner's.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import {
  DEFAULT_CONFIG,
  chooseThrow,
  enemyFireOf,
  enemyGroupDirective,
  findChokepoint,
  observe,
  tick,
} from '../src/sim';
import type { EnemyKind, GameState, Intents, NpcDirective } from '../src/sim';
import { Tile } from '../src/sim/types';
import { enemyScene, openSpot, placeRing } from '../scripts/lib/enemyScene';
import { eventsOf } from './helpers';

const CFG = DEFAULT_CONFIG.enemyAttacks;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Runs enemy bots for `ticks` against a human who stands still (and cannot die). */
function play(s: GameState, ticks: number): { launches: number[]; types: Set<string> } {
  const bots = new Map(
    s.players
      .slice(1)
      .map((p) => [p.id, createBot({ difficulty: 'standard', seed: 40 + p.id, playerId: p.id })]),
  );
  const launches: number[] = [];
  const types = new Set<string>();
  for (let t = 0; t < ticks; t++) {
    const intents: Intents = {};
    for (const p of s.players.slice(1)) if (p.alive) intents[p.id] = bots.get(p.id)!.decide(observe(s, p.id));
    for (const e of tick(s, intents)) {
      types.add(e.type);
      if (e.type === 'projectileLaunched') launches.push(s.tick);
    }
  }
  return { launches, types };
}

function squad(kinds: EnemyKind[], arenaId?: string): GameState {
  const s = enemyScene({
    human: { x: 0, y: 0, hp: 999 },
    enemies: kinds.map((kind) => ({ kind, x: 0, y: 0, hp: 99 })),
    arenaId,
  });
  placeRing(s, openSpot(s, Math.floor(s.width / 2), Math.floor(s.height / 2)));
  return s;
}

describe('surround', () => {
  it('gives four enemies four different tiles next to a stationary human, and they take them', () => {
    const s = squad(['guard', 'guard', 'agbero', 'heavy']);
    const human = s.players[0]!;
    const dirs = s.players.slice(1).map((p) => observe(s, p.id).directive as NpcDirective);
    expect(dirs.every((d) => d.kind === 'surround')).toBe(true);
    const tiles = new Set(dirs.map((d) => `${d.x},${d.y}`));
    expect(tiles.size).toBe(4);
    for (const d of dirs) expect(dist(d, human)).toBe(1);

    // (a heavy's punch shoves the human; the squad that must hold still around a stationary target has no knockback)
    for (const p of s.players.slice(1)) if (p.enemyKind === 'heavy') p.enemyKind = 'guard';
    play(s, 1500);
    const at = new Set(s.players.slice(1).map((p) => `${p.x},${p.y}`));
    expect(at.size).toBe(4);
    for (const p of s.players.slice(1)) expect(dist(p, human)).toBe(1);
  });

  it('uses the second ring only when the neighbouring tiles are taken (a pillar leaves two open neighbours)', () => {
    const s = enemyScene({
      human: { x: 4, y: 3, hp: 99 }, // pillars left and right: only (4,2) and (4,4) are open
      enemies: [
        { kind: 'guard', x: 4, y: 0 },
        { kind: 'guard', x: 4, y: 6 },
        { kind: 'guard', x: 8, y: 4 },
      ],
    });
    const dirs = s.players.slice(1).map((p) => observe(s, p.id).directive as NpcDirective);
    const tiles = dirs.map((d) => `${d.x},${d.y}`);
    expect(new Set(tiles).size).toBe(3);
    expect(dirs.filter((d) => dist(d, s.players[0]!) === 1)).toHaveLength(2);
    expect(dirs.filter((d) => dist(d, s.players[0]!) === 2)).toHaveLength(1);
  });

  it('a group out of range holds; a bot that is far from the fight goes to an open call', () => {
    const s = enemyScene({
      human: { x: 0, y: 0, hp: 99 },
      enemies: [{ kind: 'guard', x: 14, y: 10 }],
    });
    expect(dist(s.players[1]!, s.players[0]!)).toBeGreaterThan(CFG.aggroTiles);
    expect(observe(s, 1).directive).toMatchObject({ kind: 'hold', x: 14, y: 10 });
    Object.assign(enemyFireOf(s), {
      calls: [{ id: 9, callerId: 7, team: 1, x: 12, y: 6, count: 2, tick: 0, untilTick: 999 }],
    });
    expect(observe(s, 1).directive).toMatchObject({ kind: 'reinforce', x: 12, y: 6 });
    expect(observe(s, 0).directive).toBeUndefined(); // the human has none
  });
});

describe('block', () => {
  it('finds a chokepoint on the route: the only gap in a wall', () => {
    const s = enemyScene({ human: { x: 2, y: 2 }, enemies: [{ kind: 'guard', x: 12, y: 2 }] });
    for (let y = 0; y < s.height; y++) if (y !== 4) s.tiles[y * s.width + 7] = Tile.Hard;
    expect(findChokepoint(s, { x: 2, y: 2 }, { x: 12, y: 2 })).toEqual({ x: 7, y: 4 });
    // no route
    s.tiles[4 * s.width + 7] = Tile.Hard;
    expect(findChokepoint(s, { x: 2, y: 2 }, { x: 12, y: 2 })).toBeNull();
  });

  it('puts one melee enemy on the marked chokepoint and keeps it there while the others go for the human', () => {
    const s = enemyScene({
      human: { x: 2, y: 4, hp: 999 },
      enemies: [
        { kind: 'guard', x: 12, y: 4, hp: 99 },
        { kind: 'agbero', x: 11, y: 3, hp: 99 },
      ],
    });
    const choke = { x: 9, y: 4 };
    Object.assign(enemyFireOf(s), { calls: [], chokepoints: [choke.y * s.width + choke.x] });
    const dirs = [1, 2].map((id) => enemyGroupDirective(s, id)!);
    expect(dirs.filter((d) => d.kind === 'block')).toHaveLength(1);
    expect(dirs.find((d) => d.kind === 'block')).toMatchObject(choke);
    expect(dirs.find((d) => d.kind === 'surround')).toBeDefined(); // the other one is not left idle
    play(s, 900);
    const blockerId = dirs[0]!.kind === 'block' ? 1 : 2;
    expect(s.players[blockerId]).toMatchObject(choke);
  });

  it('never makes a thrower or the boss a blocker, nor blocks with the whole group', () => {
    const s = enemyScene({
      human: { x: 2, y: 4, hp: 99 },
      enemies: [
        { kind: 'thrower', x: 9, y: 4 },
        { kind: 'boss', x: 10, y: 4 },
      ],
    });
    Object.assign(enemyFireOf(s), { calls: [], chokepoints: [4 * s.width + 9, 4 * s.width + 10] });
    expect([1, 2].map((id) => enemyGroupDirective(s, id)!.kind)).not.toContain('block');
  });
});

describe('throwers keep their distance and line up', () => {
  it('a thrower next to the human backs off to a clear cardinal line 2+ tiles away and throws from there', () => {
    const s = enemyScene({
      human: { x: 8, y: 2, hp: 999 },
      enemies: [{ kind: 'thrower', x: 8, y: 3, hp: 99 }],
    });
    const d = observe(s, 1).directive as NpcDirective;
    expect(d.kind).toBe('standoff');
    expect(d.x === 8 || d.y === 2).toBe(true); // cardinal
    expect(dist(d, s.players[0]!)).toBeGreaterThanOrEqual(CFG.minRange);
    const { launches } = play(s, 900);
    const t = s.players[1]!;
    expect(launches.length).toBeGreaterThan(0);
    expect(dist(t, s.players[0]!)).toBeGreaterThanOrEqual(CFG.minRange);
    expect(chooseThrow(s, t) !== null || t.x === 8 || t.y === 2).toBe(true);
  });

  it('several throwers take different tiles, each in a clear line to the human', () => {
    const s = squad(['thrower', 'thrower', 'thrower', 'lieutenant']);
    const human = s.players[0]!;
    const dirs = s.players.slice(1).map((p) => observe(s, p.id).directive as NpcDirective);
    expect(dirs.every((d) => d.kind === 'standoff')).toBe(true);
    expect(new Set(dirs.map((d) => `${d.x},${d.y}`)).size).toBe(4);
    for (const d of dirs) {
      expect(d.x === human.x || d.y === human.y).toBe(true);
      const n = dist(d, human);
      expect(n).toBeGreaterThanOrEqual(CFG.minRange);
      // clear line: only floor between the slot and the human
      const sx = Math.sign(human.x - d.x);
      const sy = Math.sign(human.y - d.y);
      for (let k = 1; k < n; k++) expect(s.tiles[(d.y + sy * k) * s.width + d.x + sx * k]).toBe(Tile.Empty);
    }
  });

  it('four throwers never throw in the same tick and keep the group gap, for 40 seconds', () => {
    const s = squad(['thrower', 'thrower', 'thrower', 'thrower']);
    const { launches } = play(s, 2400);
    expect(launches.length).toBeGreaterThanOrEqual(10);
    expect(new Set(launches).size).toBe(launches.length); // at most one launch per tick
    for (let i = 1; i < launches.length; i++)
      expect(launches[i]! - launches[i - 1]!).toBeGreaterThanOrEqual(CFG.groupGapTicks);
    expect(eventsOf([], 'projectileLaunched')).toHaveLength(0);
  });
});
