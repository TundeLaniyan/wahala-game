import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import { getBoard } from '../src/ai/board';
import { runMatch } from '../src/ai/headless';
import type { MatchSpec } from '../src/ai/headless';
import {
  LARGE_THINKS_PER_TICK,
  LARGE_WORK_BUDGET,
  NEAR_MAX,
  NEAR_RADIUS,
  isLargeBoard,
} from '../src/ai/scale';
import { aiCounters, resetAiCounters } from '../src/ai/stats';
import { World } from '../src/ai/world';
import { PROFILES } from '../src/ai/profiles';
import { CITY_RUMBLE_ID, createGame, observe, tick } from '../src/sim';
import { RUMBLE_CORE } from '../src/sim/arenas/cityRumble';
import type { Difficulty, Intents } from '../src/sim';

/**
 * City Rumble bots: 8 / 16 / 24 / 32 competitors on the 41 x 31 board. Matches use a shortened clock
 * (the city closes from 0:20 of play, the core is all that is left at 0:45, the end at 1:15) so the
 * suite stays short; the real three-minute schedule is measured by
 * `npm run simulate -- --arena cityRumble --players N`.
 */
const SHORT: MatchSpec['config'] = {
  match: { durationTicks: 75 * 60 },
  crush: { startRemainingTicks: 55 * 60 },
};

/** Easy and Medium seats (Hard's cost is bounded separately below). */
const mixed = (n: number): Difficulty[] =>
  Array.from({ length: n }, (_, k): Difficulty => (k % 3 === 2 ? 'beginner' : 'standard'));

const crushed: number[] = [];

describe('City Rumble bots play complete matches', () => {
  for (const n of [8, 16, 24, 32]) {
    it(`${n} competitors: the match resolves and everybody takes part`, () => {
      const out = runMatch({ seed: 40 + n, arenaId: CITY_RUMBLE_ID, difficulties: mixed(n), config: SHORT });
      crushed.push(out.seats.filter((s) => s.cause?.kind === 'crush').length / n);
      if (out.timeout) {
        // the clock ran out on a duel: the few left were all fighting inside the core
        const alive = out.seats.filter((s) => s.alive);
        expect(alive.length).toBeLessThanOrEqual(3);
        for (const s of alive) {
          expect(s.x >= RUMBLE_CORE.x0 && s.x < RUMBLE_CORE.x0 + RUMBLE_CORE.w).toBe(true);
          expect(s.y >= RUMBLE_CORE.y0 && s.y < RUMBLE_CORE.y0 + RUMBLE_CORE.h).toBe(true);
        }
      } else if (out.draw) {
        const ticks = out.seats.map((s) => s.eliminatedTick);
        const last = Math.max(...ticks.map((t) => t ?? 0));
        expect(ticks.filter((t) => t === last).length).toBeGreaterThan(1);
      } else {
        expect(out.winner).not.toBeNull();
        expect(out.seats.filter((s) => s.alive)).toHaveLength(1);
      }
      for (const seat of out.seats) {
        expect(seat.tilesVisited).toBeGreaterThanOrEqual(2);
        // anybody who lived past the opening seconds has put generators down
        if (seat.survivedSeconds >= 12) expect(seat.placed).toBeGreaterThan(0);
      }
      // the fighting is spread around the field, not one bot farming everybody
      expect(out.seats.filter((s) => s.kills > 0).length).toBeGreaterThanOrEqual(Math.min(4, n / 4));
    });
  }

  it('bots move inwards ahead of the closing ring (hardly anyone is buried by the city)', () => {
    expect(crushed).toHaveLength(4);
    expect(crushed.reduce((a, b) => a + b, 0) / crushed.length).toBeLessThan(0.1);
  });
});

describe('City Rumble AI determinism and cost', () => {
  it('replays a 16-bot match exactly', () => {
    const spec: MatchSpec = {
      seed: 5,
      arenaId: CITY_RUMBLE_ID,
      difficulties: mixed(16),
      config: SHORT,
      maxPlayTicks: 900,
    };
    expect(runMatch(spec)).toEqual(runMatch(spec));
  });

  it('bounds the work: routine re-plans per tick, work per re-plan, and time per tick', () => {
    const n = 32;
    const state = createGame({
      seed: 11,
      arenaId: CITY_RUMBLE_ID,
      players: Array.from({ length: n }, (_, i) => ({
        name: `b${i}`,
        characterId: 'lekkiBoy' as const,
        isBot: true,
      })),
    });
    // the most expensive line-up: every bot on Hard
    const bots = Array.from({ length: n }, (_, i) =>
      createBot({ difficulty: 'expert', seed: 77 + i, playerId: i }),
    );
    const intents: Intents = {};
    resetAiCounters();
    let worstRoutine = 0;
    let ticksPlayed = 0;
    const cpu = (): number => {
      const u = process.cpuUsage();
      return (u.user + u.system) / 1000;
    };
    const started = cpu();
    while (state.match.phase !== 'ended' && state.match.playTicks < 600) {
      const before = aiCounters.routineThinks;
      for (let i = 0; i < n; i++) {
        if (!state.players[i]!.alive) delete intents[i];
        else intents[i] = bots[i]!.decide(observe(state, i));
      }
      worstRoutine = Math.max(worstRoutine, aiCounters.routineThinks - before);
      tick(state, intents);
      ticksPlayed++;
    }
    const msPerTick = (cpu() - started) / ticksPlayed;
    expect(worstRoutine).toBeLessThanOrEqual(LARGE_THINKS_PER_TICK);
    expect(aiCounters.deferred).toBeGreaterThan(0); // the allowance really is in use
    // a single re-plan never runs far past its budget (one in-flight check may finish)
    expect(aiCounters.maxThinkWork).toBeLessThanOrEqual(LARGE_WORK_BUDGET.hard + 6);
    // generous CPU-time bound (shared machines): 32 hard bots + the simulation (measured ~1.5 ms)
    expect(msPerTick).toBeLessThan(12);
  });

  it('reasons about the nearest few rivals inside a local window', () => {
    const state = createGame({
      seed: 2,
      arenaId: CITY_RUMBLE_ID,
      players: Array.from({ length: 32 }, (_, i) => ({
        name: `b${i}`,
        characterId: 'campusQueen' as const,
        isBot: true,
      })),
    });
    const world = new World();
    world.refresh(observe(state, 0), PROFILES.standard);
    expect(isLargeBoard(getBoard(state.width, state.height))).toBe(true);
    expect(world.large).toBe(true);
    expect(world.rivals).toHaveLength(31);
    expect(world.near.length).toBeLessThanOrEqual(NEAR_MAX);
    const me = state.players[0]!;
    const d = (p: { x: number; y: number }): number => Math.abs(p.x - me.x) + Math.abs(p.y - me.y);
    for (const p of world.near) expect(d(p)).toBeLessThanOrEqual(NEAR_RADIUS);
    // nearest first
    for (let i = 1; i < world.near.length; i++)
      expect(d(world.near[i]!)).toBeGreaterThanOrEqual(d(world.near[i - 1]!));
    // a standard board keeps every rival
    const std = createGame({
      seed: 2,
      players: Array.from({ length: 4 }, (_, i) => ({
        name: `b${i}`,
        characterId: 'campusQueen' as const,
        isBot: true,
      })),
    });
    const w2 = new World();
    w2.refresh(observe(std, 0), PROFILES.standard);
    expect(w2.large).toBe(false);
    expect(w2.near).toBe(w2.rivals);
  });
});
