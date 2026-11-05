/**
 * Raids inside the whole game (docs/CLASSIC_RAIDS.md): every other match is byte-for-byte what it was; a raid is
 * cardinal-only and cross-bomb, has no Wahala Crush, no hidden pickups and no elimination economy; it is deterministic
 * (the same seed and intents give the same state) even with bots in the enemy seats; the contract views are null outside.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import {
  RAID_ARENAS,
  RAID_ARENA_IDS,
  ARENAS,
  createGame,
  getArena,
  observe,
  raidView,
  tick,
} from '../src/sim';
import type { Dir, GameOptions, Intents } from '../src/sim';
import { RAID_DEFS, RAID_IDS } from '../src/sim/raid';
import { raidDirectiveFor } from '../src/sim/raid';
import { advance, hashOf, letWavesAppear, newRaid } from './raid-helpers';

/** A tiny seeded generator for the scripted walks (the tests never use Math.random). */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The same two pinned scenarios as tests/mission-regression.test.ts (re-pin both together when combat-core's damage changes normal state): a raid must not change them by one byte. */
function play(
  options: GameOptions,
  ticks: number,
  levels: ('standard' | 'rookie' | 'skilled' | 'casual' | 'expert' | 'beginner')[],
): string {
  const state = createGame(options);
  const bots = levels.map((difficulty, id) => createBot({ difficulty, seed: 7 * 31 + id, playerId: id }));
  for (let i = 0; i < ticks; i++) {
    const intents: Intents = {};
    bots.forEach((bot, id) => {
      if (state.players[id]!.alive) intents[id] = bot.decide(observe(state, id));
    });
    tick(state, intents);
  }
  expect('raid' in state).toBe(false);
  expect('mission' in state).toBe(false);
  return hashOf(state);
}

describe('normal matches are unchanged by the raid runtime', () => {
  it('a Classic match (3 bots, 2400 ticks) gives the pinned state', () => {
    const options: GameOptions = {
      seed: 12345,
      players: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const).map((characterId, i) => ({
        name: `B${i}`,
        characterId,
        isBot: true,
      })),
      settings: { mode: 'crush' },
    };
    expect(play(options, 2400, ['standard', 'skilled', 'casual'])).toBe('4fb9574d:15743');
  });

  it('a Deathmatch on a City Rumble stage (6 bots, 1800 ticks) gives the pinned state', () => {
    const options: GameOptions = {
      seed: 777,
      arenaId: 'rumbleMushin',
      players: Array.from({ length: 6 }, (_, i) => ({
        name: `R${i}`,
        characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
        isBot: true,
      })),
      settings: { game: 'deathmatch', durationSec: 300 },
    };
    expect(play(options, 1800, ['standard', 'rookie', 'skilled', 'casual', 'expert', 'beginner'])).toBe(
      '27974553:23545',
    );
  });

  it('raid boards are kept out of the standard and Rumble lists, but getArena finds them', () => {
    expect(RAID_ARENA_IDS).toHaveLength(RAID_IDS.length);
    for (const id of RAID_ARENA_IDS) {
      expect(ARENAS[id]).toBeUndefined();
      expect(getArena(id)).toBe(RAID_ARENAS[id]);
      expect(getArena(id).kind).toBe('raid');
    }
    expect(
      raidView(createGame({ seed: 1, players: [{ name: 'a', characterId: 'streetBaller', isBot: false }] })),
    ).toBeNull();
  });
});

describe('raid rules', () => {
  it('no Wahala Crush, no hidden pickups, no random crates, no elimination economy, no stage hazards', () => {
    for (const id of RAID_IDS) {
      const state = newRaid(id);
      expect(state.crush).toBeNull();
      expect(state.settings.mode).toBe('classic');
      expect(state.settings.game).toBe('raid');
      expect(Object.keys(state.hidden)).toEqual([]);
      expect(state.config.rewards.enabled).toBe(false);
      expect(state.config.streaks.enabled).toBe(false);
      expect(state.config.respawn.enabled).toBe(false);
      expect(state.config.spectator.enabled).toBe(false);
      expect(state.stage.events).toEqual([]);
      expect(getArena(RAID_DEFS[id].arenaId).stageHazards).toEqual([]);
      // the only crates are the authored ones: exactly the soft tiles of the layout
      const authored = RAID_DEFS[id].layout
        .join('')
        .split('')
        .filter((c) => 'xMKSB'.includes(c)).length;
      expect(state.tiles.filter((t) => t === 2)).toHaveLength(authored);
      // enemies never lay generators (no generator economy), the human has the raid's numbers
      expect(state.players.slice(1).every((p) => p.capacity === 0)).toBe(true);
      expect(state.players[0]!.capacity).toBe(RAID_DEFS[id].bombs.capacity);
      expect(state.players[0]!.range).toBe(RAID_DEFS[id].bombs.range);
    }
  });

  it("the clock is the raid's own", () => {
    const state = newRaid('railYardGoods');
    expect(state.config.match.durationTicks).toBe(RAID_DEFS.railYardGoods.timeLimitSec * 60);
    expect(raidView(state)!.timeRemainingSec).toBe(RAID_DEFS.railYardGoods.timeLimitSec);
  });

  it('enemy bots are told to hold their spot and chase only when the player is close', () => {
    const state = newRaid();
    letWavesAppear(state);
    const guard = state.raid!.seats[0]!.playerId;
    expect(raidDirectiveFor(state, guard)).toMatchObject({ kind: 'guard', radius: 2 });
    expect(observe(state, guard).directive).toMatchObject({ kind: 'guard' });
    state.players[0]!.x = state.players[guard]!.x + 2;
    state.players[0]!.y = state.players[guard]!.y;
    expect(raidDirectiveFor(state, guard)).toMatchObject({ kind: 'chase' });
    expect(raidDirectiveFor(state, 0)).toBeUndefined(); // the human has none
    expect(observe(state, 0).directive).toBeUndefined();
  });
});

describe('cardinal movement only', () => {
  it('a long random walk never moves diagonally, never leaves the floor and never passes a solid tile', () => {
    const state = newRaid();
    const rng = createRng(99);
    const dirs: Dir[] = ['up', 'down', 'left', 'right'];
    const human = state.players[0]!;
    let { x, y } = human;
    for (let i = 0; i < 4000; i++) {
      const intents: Intents = { 0: { move: dirs[Math.floor(rng() * 4)]! } };
      tick(state, intents);
      expect(Math.abs(human.x - x) + Math.abs(human.y - y)).toBeLessThanOrEqual(1);
      expect(state.tiles[human.y * state.width + human.x]).toBe(0);
      ({ x, y } = human);
    }
    // the walk really went somewhere
    expect(human.x !== 1 || human.y !== 11).toBe(true);
  });

  it('the intent type has four directions and the raid accepts every other intent as in any match', () => {
    const state = newRaid();
    const before = state.generators.length;
    tick(state, { 0: { place: true } });
    expect(state.generators.length).toBe(before + 1); // A: a generator
    expect(() => {
      advance(state, 5, {
        0: { special: true, action: true, skill: true, detonate: true, disarm: true, placeHeld: true },
      });
    }).not.toThrow();
    expect(state.match.phase).toBe('playing');
  });
});

describe('determinism', () => {
  it('the same seed and the same intents give the same state, with bots in the enemy seats', () => {
    const run = (seed: number): string => {
      const state = newRaid('warehouseDispatchDepot', { seed });
      const bots = state.players
        .slice(1)
        .map((p) => createBot({ difficulty: 'rookie', seed: 5 + p.id, playerId: p.id }));
      const rng = createRng(seed);
      const dirs: Dir[] = ['up', 'down', 'left', 'right'];
      const events: string[] = [];
      for (let i = 0; i < 3000; i++) {
        const intents: Intents = {};
        if (i % 7 === 0) intents[0] = { move: dirs[Math.floor(rng() * 4)]!, place: i % 91 === 0 };
        else intents[0] = {};
        bots.forEach((bot, k) => {
          const p = state.players[k + 1]!;
          if (p.alive) intents[p.id] = bot.decide(observe(state, p.id));
        });
        for (const e of tick(state, intents)) events.push(e.type);
        if (state.match.phase === 'ended') break;
      }
      return `${hashOf(state)}|${events.length}|${hashOf(events)}`;
    };
    expect(run(4)).toBe(run(4));
    expect(run(4)).not.toBe(run(5));
  });

  it('a raid state is plain JSON: it survives a round trip and keeps playing identically', () => {
    const a = newRaid('partsStoreroom', { seed: 8 });
    advance(a, 400);
    const b = JSON.parse(JSON.stringify(a)) as typeof a;
    advance(a, 600);
    advance(b, 600);
    expect(hashOf(a)).toBe(hashOf(b));
  });

  it('plays every raid for 40 seconds with bots and no NaN anywhere', () => {
    for (const id of RAID_IDS) {
      const state = newRaid(id, { seed: 2 });
      const bots = state.players
        .slice(1)
        .map((p) => createBot({ difficulty: 'standard', seed: p.id, playerId: p.id }));
      for (let i = 0; i < 2400 && state.match.phase !== 'ended'; i++) {
        const intents: Intents = {};
        bots.forEach((bot, k) => {
          const p = state.players[k + 1]!;
          if (p.alive) intents[p.id] = bot.decide(observe(state, p.id));
        });
        tick(state, intents);
      }
      expect(JSON.stringify(state)).not.toMatch(/NaN/);
      expect(raidView(state)).not.toBeNull();
    }
  });
});
