/**
 * The depot raid under REAL enemy pressure (follow-up to docs/CAMPAIGN_EXPANSION_STATUS.md, which noted the raid tests
 * used idle enemies): the enemy bots (ai/enemyBot.ts through `createBot`) decide from `observe()` only, the human stands
 * still in the middle of the board, and the fairness rules of the brief are checked on the real event stream:
 *   - every thrown object has a cue of at least `minWarnTicks` before it moves and a readable path;
 *   - no projectile spam: never more than the configured number in flight, per group and overall;
 *   - no unavoidable instant kill: a single tick never costs more than 2 health segments, and damaging hits are spaced
 *     by the recovery frames, so a full-health human survives at least `MIN_SURVIVE_TICKS` of standing still;
 *   - the enemies really act (punches and throws happen), and the whole run is deterministic.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import { campaignConfig, observe, tick } from '../src/sim';
import type { Intents, SimEvent } from '../src/sim';
import {
  advance,
  explodeAt,
  hashOf,
  knockOut,
  letWavesAppear,
  newRaid,
  put,
  waveSeats,
} from './raid-helpers';

const MIN_SURVIVE_TICKS = 6 * 60;

/**
 * `wave: 1` = the guards of the opening wave (punches); `wave: 2` = the first wave is beaten and the first dispatch crate
 * is blown (as in the vertical slice), which calls the second wave: guards and THROWERS with a lieutenant.
 */
function play(seed: number, ticks: number, wave: 1 | 2 = 1) {
  const state = newRaid('warehouseDispatchDepot', { seed });
  const events: SimEvent[] = [];
  letWavesAppear(state, events);
  if (wave === 2) {
    knockOut(state, ...waveSeats(state, 0));
    // blow the first marked crate (it has 2 hit points) from a free tile beside it: two separate blasts, like a player
    const crate = state.raid!.cargo.find((c) => c.marked)!;
    const lane = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]
      .map(([dx, dy]) => ({ x: crate.x + dx!, y: crate.y + dy! }))
      .find((t) => state.tiles[t.y * state.width + t.x] === 0)!;
    for (let blast = 0; blast < crate.maxHp; blast++) {
      events.push(...explodeAt(state, lane.x, lane.y));
      advance(state, 90, {}, events);
    }
    letWavesAppear(state, events);
  }
  // the human stands in the open middle of the board (a fair target in the lanes the enemies use): the floor tile
  // nearest the centre (the centre itself is a pillar of the classic grid)
  const cx = Math.floor(state.width / 2);
  const cy = Math.floor(state.height / 2);
  let mid = { x: cx, y: cy, d: Number.POSITIVE_INFINITY };
  for (let y = 0; y < state.height; y++)
    for (let x = 0; x < state.width; x++) {
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      if (state.tiles[y * state.width + x] === 0 && d < mid.d) mid = { x, y, d };
    }
  put(state, 0, mid.x, mid.y);
  const bots = new Map(
    state.players
      .filter((p) => p.enemyKind !== undefined)
      .map((p) => [p.id, createBot({ difficulty: 'rookie', seed: seed * 31 + p.id, playerId: p.id })]),
  );
  const hitTicks: { tick: number; source: string; damage: number }[] = [];
  let firstDownTick: number | null = null;
  let maxInFlight = 0;
  let worstTick = 0;
  for (let i = 0; i < ticks && state.match.phase !== 'ended'; i++) {
    const intents: Intents = { 0: {} };
    for (const [id, bot] of bots) if (state.players[id]!.alive) intents[id] = bot.decide(observe(state, id));
    const before = state.players[0]!.vitals!.hp;
    const evs = tick(state, intents);
    events.push(...evs);
    maxInFlight = Math.max(maxInFlight, (state.projectiles ?? []).length);
    worstTick = Math.max(worstTick, before - state.players[0]!.vitals!.hp);
    for (const e of evs) {
      if (e.type === 'campaignHit' && e.victimId === 0 && e.damage > 0)
        hitTicks.push({ tick: state.tick, source: e.source, damage: e.damage });
    }
    if (firstDownTick === null && evs.some((e) => e.type === 'campaignDefeated' && e.victimId === 0))
      firstDownTick = state.tick;
  }
  return { state, events, firstDownTick, maxInFlight, worstTick, hitTicks };
}

describe('the depot raid with the real enemy bots awake (wave 2: guards and throwers)', () => {
  const run = play(5, 60 * 40, 2);
  const cfg = run.state.config.enemyAttacks;

  it('the enemies act: punches and thrown objects happen, each throw with a cue and a readable path', () => {
    const launches = run.events.filter((e) => e.type === 'projectileLaunched');
    const punches = run.events.filter((e) => e.type === 'attackStarted' && e.playerId !== 0);
    expect(launches.length + punches.length, 'enemies must attack a human who stands still').toBeGreaterThan(
      0,
    );
    for (const l of launches) {
      if (l.type !== 'projectileLaunched') continue;
      expect(l.warnTicks).toBeGreaterThanOrEqual(cfg.minWarnTicks);
      expect(l.path.length).toBeGreaterThan(0);
      expect(l.stepTicks).toBeGreaterThan(0);
    }
  });

  it('no projectile spam: never more objects in flight than configured, and bounded launches per second', () => {
    expect(run.maxInFlight).toBeLessThanOrEqual(cfg.maxInFlight);
    const launchTicks = run.events.flatMap((e) => (e.type === 'projectileLaunched' ? [e.launchTick] : []));
    for (const t of launchTicks) {
      const inWindow = launchTicks.filter((u) => u >= t && u < t + 60).length;
      expect(inWindow, `launches in the second from tick ${t}`).toBeLessThanOrEqual(cfg.maxInFlight);
    }
  });

  it('no unavoidable instant kill: one tick costs at most two segments, hits are spaced, a standing human lasts seconds', () => {
    expect(run.worstTick).toBeLessThanOrEqual(2);
    expect(
      run.firstDownTick === null || run.firstDownTick >= MIN_SURVIVE_TICKS,
      `down at tick ${run.firstDownTick}`,
    ).toBe(true);
    // two damaging hits are never closer than the recovery frames, except a strong tool piercing them
    const recovery = campaignConfig(run.state.config).invulnTicks;
    for (let i = 1; i < run.hitTicks.length; i++) {
      const prev = run.hitTicks[i - 1]!;
      const hit = run.hitTicks[i]!;
      if (hit.source === 'tool') continue;
      expect(hit.tick - prev.tick, `${prev.source} then ${hit.source}`).toBeGreaterThanOrEqual(recovery);
    }
  });

  it('is deterministic: the same seed and the same bots give the same raid', () => {
    const again = play(5, 60 * 40, 2);
    expect(hashOf({ ...again.state, config: undefined })).toBe(hashOf({ ...run.state, config: undefined }));
  });
});

describe('a different seed plays out within the same fairness limits', () => {
  it('seed 11: caps and the per-tick damage limit hold', () => {
    const r = play(11, 60 * 30, 2);
    expect(r.maxInFlight).toBeLessThanOrEqual(r.state.config.enemyAttacks.maxInFlight);
    expect(r.worstTick).toBeLessThanOrEqual(2);
  });
});
