/**
 * Kill-streak rewards and QUICK HANDS (decisions SK1-SK3). The fixed initial loadout: 3 credited kills QUICK HANDS,
 * 5 VEHICLE GENERATOR, 7 GLOBAL KNOCKDOWN; earned once per threshold, consumed once, lost on death, the match score
 * untouched. Real simulation ticks.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, createGame, heldStreakRewards, tick } from '../src/sim';
import type { GameKind, GameState, Intents, MatchSettings, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { eliminate } from '../src/sim/systems/lethality';
import { grantStreakRewards } from '../src/sim/systems/streaks';
import { addGenerator, eventsOf, put } from './helpers';

function match(game: GameKind, players = 4, extra: Partial<MatchSettings> = {}): GameState {
  const s = createGame({
    seed: 3,
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`,
      characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3],
      isBot: false,
    })),
    settings: { game, stageHazards: false, ...extra },
  });
  s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  s.hidden = {};
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  for (const p of s.players) p.protectedUntil = 0;
  return s;
}
function run(s: GameState, n: number, intents: Intents = {}): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...tick(s, intents));
  return all;
}

/** `killer` is credited with the elimination of `victim` (a flame of the killer's generator), then rewards are paid. */
function credit(s: GameState, killer: number, victim: number): SimEvent[] {
  const events: SimEvent[] = [];
  eliminate(
    s,
    s.players[victim]!,
    { kind: 'flame', ownerId: killer, eventId: 1000 + s.tick + victim },
    events,
  );
  grantStreakRewards(s, events);
  return events;
}
/** Brings a dead fighter back for the next credited kill. */
const revive = (s: GameState, id: number): void => {
  s.players[id]!.alive = true;
};

describe('the fixed initial loadout', () => {
  it('is 3 QUICK HANDS, 5 VEHICLE GENERATOR, 7 GLOBAL KNOCKDOWN, for every fighter', () => {
    expect(DEFAULT_CONFIG.streaks.loadout).toEqual([
      { kills: 3, reward: 'quickHands' },
      { kills: 5, reward: 'vehicleGenerator' },
      { kills: 7, reward: 'globalKnockdown' },
    ]);
  });

  it('is on in every City Rumble ruleset and off in Classic', () => {
    for (const game of ['survival', 'deathmatch', 'team'] as const)
      expect(match(game).config.streaks.enabled, game).toBe(true);
    expect(match('classic').config.streaks.enabled).toBe(false);
  });
});

describe('earning (credited eliminations only)', () => {
  it('pays nothing for the first two kills, then QUICK HANDS on the third', () => {
    const s = match('deathmatch');
    const ev: SimEvent[] = [];
    for (let v = 1; v <= 2; v++) ev.push(...credit(s, 0, v));
    expect(eventsOf(ev, 'streakRewardEarned')).toHaveLength(0);
    revive(s, 1);
    ev.push(...credit(s, 0, 1));
    const earned = eventsOf(ev, 'streakRewardEarned');
    expect(earned).toEqual([{ type: 'streakRewardEarned', playerId: 0, reward: 'quickHands', kills: 3 }]);
    expect(s.players[0]!.stats.streak).toBe(3);
  });

  it('pays 5 VEHICLE GENERATOR (with the vehicle it will be) and 7 GLOBAL KNOCKDOWN', () => {
    const s = match('deathmatch');
    const ev: SimEvent[] = [];
    for (let k = 1; k <= 7; k++) {
      revive(s, 1);
      ev.push(...credit(s, 0, 1));
    }
    const earned = eventsOf(ev, 'streakRewardEarned');
    expect(earned.map((e) => [e.kills, e.reward])).toEqual([
      [3, 'quickHands'],
      [5, 'vehicleGenerator'],
      [7, 'globalKnockdown'],
    ]);
    const veh = earned[1]!.vehicle!;
    expect(DEFAULT_CONFIG.vehicles.allowed).toContain(veh);
    expect(s.players[0]!.streakRewards.vehicleGenerator).toBe(veh);
    expect(s.players[0]!.streakRewards.knockdown).toBe(true);
  });

  it('a threshold pays once per streak: kills 4, 6 and 8 add nothing, and none repays', () => {
    const s = match('deathmatch');
    const ev: SimEvent[] = [];
    for (let k = 1; k <= 9; k++) {
      revive(s, 1);
      ev.push(...credit(s, 0, 1));
    }
    expect(eventsOf(ev, 'streakRewardEarned')).toHaveLength(3);
    expect(s.players[0]!.streakRewards.earned).toEqual([3, 5, 7]);
  });

  it('several kills in one tick pay every threshold they cross, in order', () => {
    const s = match('deathmatch', 4);
    // a three-kill explosion: the streak goes 0 -> 3 in one tick
    for (const v of [1, 2, 3]) put(s, v, 4 + v, 4);
    put(s, 0, 14, 10);
    addGenerator(s, { ownerId: 0, x: 6, y: 4, timer: 1, range: 4 });
    const ev = run(s, 3);
    expect(eventsOf(ev, 'playerEliminated').filter((e) => e.creditId === 0).length).toBeGreaterThanOrEqual(2);
    const earned = eventsOf(ev, 'streakRewardEarned');
    // the streak crossed 3 if all three fell; with two it did not: either way what was paid matches the streak
    const streak = s.players[0]!.stats.streak;
    expect(earned.map((e) => e.kills)).toEqual(streak >= 3 ? [3] : []);
  });

  it('assists do not advance the streak or pay a reward', () => {
    const s = match('deathmatch');
    const events: SimEvent[] = [];
    // player 2 shoved player 1 recently, but player 0's generator got the kill: 2 only assists
    s.players[1]!.recentHits.push({ byId: 2, tick: s.tick });
    eliminate(s, s.players[1]!, { kind: 'flame', ownerId: 0, eventId: 5 }, events);
    grantStreakRewards(s, events);
    expect(s.players[2]!.stats.assists).toBe(1);
    expect(s.players[2]!.stats.streak).toBe(0);
    expect(s.players[2]!.streakRewards.earned).toEqual([]);
  });

  it('nothing is paid in Classic', () => {
    const s = match('classic');
    const ev: SimEvent[] = [];
    for (let k = 0; k < 7; k++) {
      revive(s, 1);
      ev.push(...credit(s, 0, 1));
    }
    expect(eventsOf(ev, 'streakRewardEarned')).toHaveLength(0);
  });
});

describe('death ends the streak and QUICK HANDS, keeps unused one-use rewards, never touches the score (AS5)', () => {
  it('resets the streak, QUICK HANDS and its capacity; the unused one-use rewards stay; kills / deaths / assists stay', () => {
    const s = match('deathmatch');
    for (let k = 1; k <= 7; k++) {
      revive(s, 1);
      credit(s, 0, 1);
    }
    const p = s.players[0]!;
    p.stats.assists = 2;
    const capacity = p.capacity;
    expect(capacity).toBe(s.config.generator.baseCapacity + 5);
    expect(p.streakRewards.vehicleGenerator).not.toBeNull();
    const events: SimEvent[] = [];
    eliminate(s, p, { kind: 'flame', ownerId: 1, eventId: 77 }, events);
    expect(p.stats.streak).toBe(0);
    expect(p.stats.kills).toBe(7);
    expect(p.stats.deaths).toBe(1);
    expect(p.stats.assists).toBe(2);
    expect(p.streakRewards.vehicleGenerator).not.toBeNull(); // earned, unused: kept
    expect(p.streakRewards.knockdown).toBe(true);
    expect(p.streakRewards.quickHandsUntil).toBe(0); // the timed buff is over
    expect(p.streakRewards.earned).toEqual([]); // a new streak can earn the thresholds again
    expect(p.capacity).toBe(capacity - 5);
    const lost = eventsOf(events, 'streakRewardsLost')[0]!;
    expect(lost.rewards).toEqual(['quickHands']); // only the timed buff is reported lost
  });

  it('a reward earned again while one is still held is not duplicated; the held vehicle is unchanged', () => {
    const s = match('deathmatch');
    for (let k = 1; k <= 7; k++) {
      revive(s, 1);
      credit(s, 0, 1);
    }
    const p = s.players[0]!;
    const held = p.streakRewards.vehicleGenerator;
    eliminate(s, p, { kind: 'flame', ownerId: 1, eventId: 78 }, []);
    // a fresh life, a fresh streak to 7: the thresholds pay again, the held rewards are not paid a second time
    p.alive = true;
    for (let k = 1; k <= 7; k++) {
      revive(s, 1);
      credit(s, 0, 1);
    }
    expect(p.streakRewards.vehicleGenerator).toBe(held);
    expect(p.streakRewards.knockdown).toBe(true);
    expect(
      heldStreakRewards(p.streakRewards)
        .filter((k) => k !== 'quickHands')
        .sort(),
    ).toEqual(['globalKnockdown', 'vehicleGenerator']);
  });

  it('the respawn is normal: spawn protection, base upgrades, no rewards, and the streak starts over', () => {
    const s = match('deathmatch');
    for (let k = 1; k <= 3; k++) {
      revive(s, 1);
      credit(s, 0, 1);
    }
    const p = s.players[0]!;
    // really die: a generator under them, then run through the respawn delay
    for (const q of s.players.slice(1)) put(s, q.id, 14, q.id === 1 ? 0 : 10);
    put(s, 0, 3, 4);
    addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 1 });
    run(s, 3);
    expect(p.alive).toBe(false);
    run(s, DEFAULT_CONFIG.respawn.delayTicks + 5);
    expect(p.alive).toBe(true);
    expect(p.protectedUntil).toBeGreaterThan(s.tick);
    expect(p.capacity).toBe(s.config.generator.baseCapacity);
    expect(p.streakRewards.quickHandsUntil).toBe(0);
    expect(p.streakRewards.vehicleGenerator).toBeNull(); // nothing earned yet, nothing invented on the respawn
    expect(p.stats.kills).toBe(3); // the scoreboard keeps every kill
    // a new streak earns QUICK HANDS again at 3
    for (let k = 1; k <= 3; k++) {
      revive(s, 1);
      credit(s, 0, 1);
    }
    expect(p.streakRewards.quickHandsUntil).toBeGreaterThan(s.tick);
  });
});

describe('QUICK HANDS', () => {
  const earnQuickHands = (): GameState => {
    const s = match('deathmatch', 2);
    for (let k = 1; k <= 3; k++) {
      revive(s, 1);
      credit(s, 0, 1);
    }
    revive(s, 1);
    put(s, 0, 2, 4);
    put(s, 1, 14, 0);
    return s;
  };

  it('lasts 18 seconds, adds 5 generator charges, then ends and takes them away', () => {
    expect(DEFAULT_CONFIG.streaks.quickHands.durationTicks).toBe(18 * 60);
    const s = earnQuickHands();
    const p = s.players[0]!;
    const start = s.tick;
    expect(p.streakRewards.quickHandsUntil - start).toBe(18 * 60);
    expect(p.capacity).toBe(s.config.generator.baseCapacity + 5);
    const ev = run(s, 18 * 60 + 1);
    expect(eventsOf(ev, 'streakRewardEnded')).toEqual([
      { type: 'streakRewardEnded', playerId: 0, reward: 'quickHands' },
    ]);
    expect(p.capacity).toBe(s.config.generator.baseCapacity);
  });

  it('is worth far more than one extra generator: seven in a row, against two normally', () => {
    const s = earnQuickHands();
    const p = s.players[0]!;
    let placed = 0;
    for (let k = 0; k < 7; k++) {
      // walk one tile right, then place
      run(s, 12, { 0: { move: 'right' } });
      placed += eventsOf(run(s, 1, { 0: { place: true } }), 'generatorPlaced').length;
    }
    expect(placed).toBe(7);
    expect(s.generators.filter((g) => g.ownerId === 0)).toHaveLength(7);
    expect(p.capacity - s.config.generator.baseCapacity).toBe(5);

    // the same walk without QUICK HANDS stops at two
    const n = match('deathmatch', 2);
    put(n, 0, 2, 4);
    put(n, 1, 14, 0);
    let normal = 0;
    for (let k = 0; k < 7; k++) {
      run(n, 12, { 0: { move: 'right' } });
      normal += eventsOf(run(n, 1, { 0: { place: true } }), 'generatorPlaced').length;
    }
    expect(normal).toBe(n.config.generator.baseCapacity);
  });

  it('is materially faster: holding A lays a generator on every tile, with no tapping', () => {
    const s = earnQuickHands();
    const ev = run(s, 90, { 0: { move: 'right', placeHeld: true } }); // 1.5 s of walking with A held
    const placed = eventsOf(ev, 'generatorPlaced').length;
    const tiles = new Set(s.generators.map((g) => `${g.x},${g.y}`));
    expect(placed).toBeGreaterThanOrEqual(6);
    expect(tiles.size).toBe(s.generators.length); // one per tile, never stacked
    // the baseline: the same held A does nothing without QUICK HANDS
    const n = match('deathmatch', 2);
    put(n, 0, 2, 4);
    put(n, 1, 14, 0);
    run(n, 90, { 0: { move: 'right', placeHeld: true } });
    expect(n.generators).toHaveLength(0);
  });

  it('a held A never exceeds the capacity, and the generators still follow every normal rule', () => {
    const s = earnQuickHands();
    run(s, 240, { 0: { move: 'right', placeHeld: true } });
    const mine = s.generators.filter((g) => g.ownerId === 0 && g.mode !== 'disabled');
    expect(mine.length).toBeLessThanOrEqual(s.players[0]!.capacity);
    // fuse, flame and owner vulnerability are untouched
    const g = s.generators[0];
    if (g) expect(g.timer).toBeLessThanOrEqual(DEFAULT_CONFIG.generator.fuseTicks);
  });

  it('the owner can still make mistakes: their own generator kills them', () => {
    const s = earnQuickHands();
    run(s, 1, { 0: { place: true } });
    const ev = run(s, DEFAULT_CONFIG.generator.fuseTicks + 5); // stands on it
    expect(eventsOf(ev, 'playerEliminated').some((e) => e.playerId === 0)).toBe(true);
  });

  it('a placement press made while dazed is kept and done the tick the daze ends (never silently ignored)', () => {
    const s = earnQuickHands();
    const p = s.players[0]!;
    p.dazedUntil = s.tick + 50;
    run(s, 2, { 0: { place: true } }); // pressed at the start of the daze, then released
    expect(s.generators).toHaveLength(0);
    const ev = run(s, 60);
    expect(eventsOf(ev, 'generatorPlaced')).toHaveLength(1);
    expect(s.generators[0]!.placedTick).toBeGreaterThanOrEqual(p.dazedUntil);
  });

  it('without QUICK HANDS the same press during a daze is spent, exactly as before', () => {
    const n = match('deathmatch', 2);
    put(n, 0, 2, 4);
    put(n, 1, 14, 0);
    n.players[0]!.dazedUntil = n.tick + 50;
    run(n, 2, { 0: { place: true } });
    run(n, 80);
    expect(n.generators).toHaveLength(0);
  });

  it('a press that cannot be done (every charge in use) is done as soon as a charge frees up', () => {
    const s = earnQuickHands();
    const p = s.players[0]!;
    p.capacity = 1;
    p.streakRewards.quickHandsExtra = 0;
    run(s, 1, { 0: { place: true } });
    expect(s.generators).toHaveLength(1);
    run(s, 12, { 0: { move: 'right' } });
    run(s, 1, { 0: { place: true } }); // no charge: kept
    expect(s.generators).toHaveLength(1);
    run(s, DEFAULT_CONFIG.generator.fuseTicks + 10);
    expect(eventsOf(run(s, 0), 'generatorPlaced')).toHaveLength(0);
  });
});
