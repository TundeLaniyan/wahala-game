/**
 * Deterministic combat rules on the classic-maze Dispatch Depot (decisions CG1, EF1-EF4), with the REAL enemy bot deciding
 * (`createBot`, Casual = the Normal baseline) and staged generators. These pin what the depot fairness rate
 * (tests/enemy-fairness.test.ts) relies on, so a regression shows up here as one exact failure instead of a drifting rate:
 *   - the maze traps: a guard in a dead end behind a generator cannot get out and is defeated by the blast;
 *   - the AI is not helpless: a guard at a junction steps out of a single cross and is unhurt;
 *   - advanced enemies can be punished: a lieutenant shut in a corridor by two generators takes the blast (and, with 8 health,
 *     survives one trap), while a lieutenant at a junction escapes a single predictable bomb;
 *   - enemies commit: a lieutenant with a clear line to the human throws, and a guard next to the human punches; no hovering.
 * Board coordinates are the depot's arena layout (src/sim/raid/defs/warehouseDispatchDepot.ts).
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import { observe, tick } from '../src/sim';
import type { GameState, Intents, SimEvent } from '../src/sim';
import { addGenerator } from './helpers';
import { advance, explodeAt, knockOut, letWavesAppear, newRaid, put, waveSeats } from './raid-helpers';

/** Wave 1 on the board; only `keep` stays in play, the human parked at the entrance. */
function depotWith(keep: (s: GameState) => number, wave2 = false): { s: GameState; id: number } {
  const s = newRaid('warehouseDispatchDepot', { seed: 3 });
  letWavesAppear(s);
  if (wave2) {
    knockOut(s, ...waveSeats(s, 0));
    // the first marked crate (2 hit points) calls the second wave: two separate blasts from a free tile beside it
    const crate = s.raid!.cargo.find((c) => c.marked)!;
    const lane = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]
      .map(([dx, dy]) => ({ x: crate.x + dx!, y: crate.y + dy! }))
      .find((t) => s.tiles[t.y * s.width + t.x] === 0)!;
    for (let i = 0; i < crate.maxHp; i++) {
      explodeAt(s, lane.x, lane.y);
      advance(s, 90);
    }
    letWavesAppear(s);
  }
  const id = keep(s);
  knockOut(s, ...s.players.filter((p) => p.id !== 0 && p.id !== id && p.alive).map((p) => p.id));
  put(s, 0, 1, 11);
  return { s, id };
}

/** Runs `ticks` with the real bot deciding for `id` and the human idle; returns every event. */
function run(s: GameState, id: number, ticks: number): SimEvent[] {
  const bot = createBot({ difficulty: 'casual', seed: 1234 + id, playerId: id });
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks && s.match.phase !== 'ended'; i++) {
    const intents: Intents = { 0: {} };
    if (s.players[id]!.alive) intents[id] = bot.decide(observe(s, id));
    out.push(...tick(s, intents));
  }
  return out;
}

const firstGuard = (s: GameState): number => s.players.find((p) => p.enemyKind === 'guard' && p.alive)!.id;
const lieutenant = (s: GameState): number =>
  s.players.find((p) => p.enemyKind === 'lieutenant' && p.alive)!.id;

describe('the classic maze traps, and the enemy AI still dodges what it can see coming', () => {
  it('a guard in a dead end behind a generator cannot get out and is defeated', () => {
    const { s, id } = depotWith(firstGuard);
    put(s, id, 6, 1); // dead end: (5,1) is its only exit, a crate at (7,1), a pillar at (6,2)
    addGenerator(s, { ownerId: 0, x: 5, y: 1, timer: 120 });
    const events = run(s, id, 240);
    expect(s.players[id]!.alive).toBe(false);
    expect(events.some((e) => e.type === 'campaignDefeated' && e.victimId === id)).toBe(true);
  });

  it('a guard at a junction steps out of a single cross and is unhurt (the AI is not helpless)', () => {
    const { s, id } = depotWith(firstGuard);
    put(s, id, 7, 5); // junction: exits up (7,4) and down (7,6) leave the row the generator burns
    addGenerator(s, { ownerId: 0, x: 9, y: 5, timer: 180 });
    run(s, id, 260);
    const g = s.players[id]!;
    expect(g.alive).toBe(true);
    expect(g.vitals!.hp).toBe(g.vitals!.maxHp);
  });
});

describe('advanced enemies are punishable but not helpless', () => {
  it('a lieutenant shut in a corridor by two generators takes the blast, and survives one trap on 8 health', () => {
    const { s, id } = depotWith(lieutenant, true);
    put(s, id, 7, 7); // crates at (6,7) and (8,7): the only ways out are up and down the x = 7 corridor
    addGenerator(s, { ownerId: 0, x: 7, y: 5, timer: 120 });
    addGenerator(s, { ownerId: 0, x: 7, y: 9, timer: 120 });
    run(s, id, 240);
    const lt = s.players[id]!;
    expect(lt.vitals!.hp).toBeLessThan(lt.vitals!.maxHp);
    expect(lt.alive).toBe(true);
  });

  it('a lieutenant at a junction escapes a single predictable bomb unhurt', () => {
    const { s, id } = depotWith(lieutenant, true);
    put(s, id, 11, 5); // junction: (11,4) and (11,6) leave the row
    addGenerator(s, { ownerId: 0, x: 9, y: 5, timer: 180 });
    run(s, id, 260);
    const lt = s.players[id]!;
    expect(lt.alive).toBe(true);
    expect(lt.vitals!.hp).toBe(lt.vitals!.maxHp);
  });
});

describe('enemies commit to attacks instead of hovering', () => {
  it('a lieutenant with a clear line to the human throws within a few seconds (a cue first)', () => {
    const { s, id } = depotWith(lieutenant, true);
    put(s, id, 9, 5);
    put(s, 0, 13, 5); // a clear row: (10,5) .. (12,5)
    const events = run(s, id, 6 * 60);
    const attacks = events.filter(
      (e) =>
        (e.type === 'projectileLaunched' && e.ownerId === id) ||
        (e.type === 'attackStarted' && e.playerId === id),
    );
    expect(attacks.length).toBeGreaterThan(0);
    for (const e of events)
      if (e.type === 'projectileLaunched' && e.ownerId === id)
        expect(e.warnTicks).toBeGreaterThanOrEqual(s.config.enemyAttacks.minWarnTicks);
  });

  it('a guard next to the human starts a punch within a few seconds', () => {
    const { s, id } = depotWith(firstGuard);
    put(s, id, 7, 5);
    put(s, 0, 8, 5);
    const events = run(s, id, 4 * 60);
    expect(events.some((e) => e.type === 'attackStarted' && e.playerId === id)).toBe(true);
  });
});
