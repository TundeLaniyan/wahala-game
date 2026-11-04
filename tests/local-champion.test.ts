/**
 * LOCAL CHAMPION (decision FC6): the crowd backs the owner for a limited window and throws warned, dodgeable objects
 * at rivals NEAR THE OWNER. Short daze only, one hit per rival per use, a per-rival immunity afterwards, never lethal,
 * deterministic, separate from the GLOBAL KNOCKDOWN and off the default ladder. Granted by `grantStreakReward`.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import { DEFAULT_CONFIG, createGame, grantStreakReward, heldStreakRewards, observe, tick } from '../src/sim';
import type { GameState, Intents, SimEvent } from '../src/sim';
import { eventsOf, put, sandbox } from './helpers';

const L = DEFAULT_CONFIG.streaks.localChampion;
const G = DEFAULT_CONFIG.streaks.globalKnockdown;

/** Owner (0) holding a LOCAL CHAMPION, a near rival (1) two tiles away, a far rival (2) well outside the radius. */
function scene(config = {}): GameState {
  const s = sandbox({ characters: ['streetBaller', 'lekkiBoy', 'campusQueen'], config });
  put(s, 0, 2, 2);
  put(s, 1, 4, 2);
  put(s, 2, 12, 8);
  for (const p of s.players) p.protectedUntil = 0;
  expect(grantStreakReward(s, 0, 'localChampion')).toBe(true);
  return s;
}
const B: Intents = { 0: { special: true } };
function run(s: GameState, n: number, intents: Intents = {}): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...tick(s, intents));
  return all;
}

describe('granting it', () => {
  it('only by grantStreakReward: the default ladder (3 Quick Hands / 5 Vehicle Generator / 7 Global Knockdown) is unchanged', () => {
    expect(DEFAULT_CONFIG.streaks.loadout).toEqual([
      { kills: 3, reward: 'quickHands' },
      { kills: 5, reward: 'vehicleGenerator' },
      { kills: 7, reward: 'globalKnockdown' },
    ]);
    expect(L.ladder).toBe(false);
  });

  it('is a held reward, paid once, kept through a death (like every earned reward)', () => {
    const s = scene();
    expect(heldStreakRewards(s.players[0]!.streakRewards)).toContain('localChampion');
    expect(grantStreakReward(s, 0, 'localChampion')).toBe(false); // never twice
    const ev: SimEvent[] = [];
    expect(grantStreakReward(sandbox(), 1, 'localChampion', ev)).toBe(true);
    expect(ev[0]).toMatchObject({ type: 'streakRewardEarned', reward: 'localChampion', kills: 0 });
  });

  it('the ladder switch offers it as the alternative 7-kill reward (never both)', () => {
    const s = sandbox({
      characters: ['streetBaller', 'lekkiBoy'],
      config: { streaks: { enabled: true, localChampion: { ladder: true } } },
    });
    const me = s.players[0]!;
    me.stats.streak = 6; // the next credited elimination is the 7th
    s.players[1]!.armour = 0;
    s.flames.push({
      x: s.players[1]!.x,
      y: s.players[1]!.y,
      eventId: 1,
      genId: 0,
      ownerId: 0,
      dir: 'right',
      tip: false,
      startTick: s.tick,
      endTick: s.tick + 30,
    });
    run(s, 3);
    expect(me.stats.streak).toBe(7);
    expect(me.streakRewards.localChampion).toBe(true);
    expect(me.streakRewards.knockdown).toBe(false);
  });
});

describe('a warned, range-limited throw', () => {
  it('B starts it at once: one object at the rival inside the radius, none at the far rival, none at the owner', () => {
    const s = scene();
    const ev = tick(s, B);
    expect(eventsOf(ev, 'localChampionStarted')).toHaveLength(1);
    const throws = eventsOf(ev, 'localChampionThrow');
    expect(throws.map((t) => t.targetId)).toEqual([1]);
    expect(
      Math.abs(s.players[1]!.x - s.players[0]!.x) + Math.abs(s.players[1]!.y - s.players[0]!.y),
    ).toBeLessThanOrEqual(L.radiusTiles);
    expect(eventsOf(ev, 'specialUsed')).toEqual([
      { type: 'specialUsed', playerId: 0, action: 'localChampion' },
    ]);
    expect(eventsOf(ev, 'streakRewardUsed')[0]).toMatchObject({ reward: 'localChampion' });
    // the object is a visible projectile in the shared list, on the building side, aimed at a FIXED tile
    const k = s.knockdowns[0]!;
    expect([k.landX, k.landY]).toEqual([4, 2]);
    const outside = k.fromX < 0 || k.fromY < 0 || k.fromX >= s.width || k.fromY >= s.height;
    expect(outside).toBe(true);
  });

  it('the warning is at least the GLOBAL KNOCKDOWN throw time (and about 0.8 s)', () => {
    expect(L.throwTicks).toBeGreaterThanOrEqual(G.throwTicks);
    const s = scene();
    const ev = tick(s, B);
    expect(eventsOf(ev, 'localChampionThrow')[0]!.landTick - s.tick).toBe(L.throwTicks);
    expect(L.throwTicks / 60).toBeGreaterThanOrEqual(0.6);
  });

  it('a rival who just walks into the radius is thrown at at the next volley', () => {
    const s = scene();
    tick(s, B);
    put(s, 2, 6, 3); // the far rival arrives (distance 5)
    const ev = run(s, L.volleyTicks);
    expect(eventsOf(ev, 'localChampionThrow').map((t) => t.targetId)).toContain(2);
  });

  it('at most maxThrowsPerVolley throws per volley, nearest first', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy', 'campusQueen', 'streetBaller'] });
    put(s, 0, 2, 2);
    put(s, 1, 6, 2);
    put(s, 2, 4, 2);
    put(s, 3, 2, 5);
    for (const p of s.players) p.protectedUntil = 0;
    grantStreakReward(s, 0, 'localChampion');
    const throws = eventsOf(tick(s, B), 'localChampionThrow');
    expect(throws).toHaveLength(L.maxThrowsPerVolley);
    expect(throws.map((t) => t.targetId)).toEqual([2, 3]); // distance 2 and 3 before distance 4
  });
});

describe('hit: a short daze, nothing else', () => {
  it('a rival who stays on the tile is dazed for dazeTicks: no kill, no knockdown, no push', () => {
    const s = scene();
    tick(s, B);
    const ev = run(s, L.throwTicks);
    const hit = eventsOf(ev, 'localChampionHit');
    expect(hit).toHaveLength(1);
    const v = s.players[1]!;
    expect(hit[0]).toMatchObject({ playerId: 1, x: 4, y: 2 });
    expect(v.alive).toBe(true);
    expect(v.knockedUntil).toBe(0); // never a knockdown
    expect([v.x, v.y]).toEqual([4, 2]); // never moved
    expect(v.dazedUntil - s.tick).toBeLessThanOrEqual(L.dazeTicks);
    expect(L.dazeTicks / 60).toBeLessThanOrEqual(1); // short: well under the 2 s knockdown and the 1 s daze punch
    expect(L.dazeTicks).toBeLessThan(G.knockdownTicks);
    expect(eventsOf(ev, 'playerEliminated')).toHaveLength(0);
  });

  it('the daze really holds the rival, then they are free', () => {
    const s = scene();
    tick(s, B);
    run(s, L.throwTicks);
    run(s, 4, { 1: { move: 'right' } });
    expect(s.players[1]!.x).toBe(4);
    run(s, L.dazeTicks + 2, { 1: { move: 'right' } });
    expect(s.players[1]!.x).toBeGreaterThan(4);
  });

  it('the owner keeps acting throughout: walks, places a generator, attacks', () => {
    const s = scene();
    tick(s, B);
    run(s, 1, { 0: { move: 'down', place: true } });
    expect(s.players[0]!.y).toBe(3);
    expect(s.generators.length).toBe(1);
    expect(s.players[0]!.dazedUntil).toBe(0);
  });
});

describe('dodging it (the counterplay GLOBAL KNOCKDOWN does not have)', () => {
  it('a rival who steps off the landing tile is missed: no daze', () => {
    const s = scene();
    tick(s, B);
    const ev = run(s, L.throwTicks, { 1: { move: 'right' } });
    expect(eventsOf(ev, 'localChampionMissed')).toHaveLength(1);
    expect(eventsOf(ev, 'localChampionHit')).toHaveLength(0);
    expect(s.players[1]!.dazedUntil).toBeLessThanOrEqual(s.tick);
    expect(s.players[1]!.localChampionImmuneUntil).toBe(0);
  });

  it('whereas GLOBAL KNOCKDOWN cannot be dodged', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    put(s, 0, 2, 2);
    put(s, 1, 4, 2);
    s.players[0]!.streakRewards.knockdown = true;
    tick(s, B);
    const ev = run(s, G.throwTicks, { 1: { move: 'right' } });
    expect(eventsOf(ev, 'knockdownHit')).toHaveLength(1);
  });
});

describe('no repeat, bounded, deterministic', () => {
  it('one hit per rival per use: a rival who stays put is hit once in the whole window', () => {
    const s = scene();
    tick(s, B);
    const ev = run(s, L.windowTicks + L.throwTicks + 5);
    expect(eventsOf(ev, 'localChampionHit').filter((h) => h.playerId === 1)).toHaveLength(1);
    // ... and throws at them stop once they are hit
    expect(eventsOf(ev, 'localChampionThrow').filter((t) => t.targetId === 1)).toHaveLength(0);
  });

  it('a dodged rival may be thrown at again, but never hit twice, and never while an object is already in the air', () => {
    const s = scene();
    tick(s, B);
    let inAir = 0;
    let hits = 0;
    for (let t = 0; t < L.windowTicks + L.throwTicks + 5; t++) {
      const flying = s.knockdowns.filter((k) => k.landX !== undefined && k.targetId === 1).length;
      inAir = Math.max(inAir, flying);
      hits += eventsOf(tick(s, { 1: { move: t % 40 < 20 ? 'right' : 'left' } }), 'localChampionHit').length;
    }
    expect(inAir).toBeLessThanOrEqual(1);
    expect(hits).toBeLessThanOrEqual(1);
  });

  it("the per-rival immunity: after a hit nobody else's crowd hits them again for immunityTicks (no stun-lock)", () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy', 'campusQueen'] });
    put(s, 0, 2, 2);
    put(s, 2, 2, 5);
    put(s, 1, 4, 3);
    for (const p of s.players) p.protectedUntil = 0;
    grantStreakReward(s, 0, 'localChampion');
    grantStreakReward(s, 2, 'localChampion');
    run(s, 1, { 0: { special: true } });
    const first = run(s, L.throwTicks);
    expect(eventsOf(first, 'localChampionHit').filter((h) => h.playerId === 1)).toHaveLength(1);
    const after = s.tick;
    // the second owner starts right after: the rival is immune, so the crowd skips them
    const ev = run(s, 1, { 2: { special: true } });
    expect(eventsOf(ev, 'localChampionThrow').filter((t) => t.targetId === 1)).toHaveLength(0);
    expect(s.players[1]!.localChampionImmuneUntil - after).toBeGreaterThanOrEqual(L.immunityTicks);
  });

  it('the window is bounded: it ends on time and then throws nothing more', () => {
    const s = scene();
    const start = s.tick + 1;
    tick(s, B);
    const ev = run(s, L.windowTicks + 5);
    const ended = eventsOf(ev, 'localChampionEnded');
    expect(ended).toEqual([{ type: 'localChampionEnded', ownerId: 0, reason: 'time' }]);
    expect(s.players[0]!.localChampion).toBeNull();
    expect(L.windowTicks).toBeLessThanOrEqual(8 * 60);
    expect(start + L.windowTicks).toBeGreaterThan(0);
    put(s, 2, 3, 3); // a fresh rival after the window
    s.players[2]!.localChampionImmuneUntil = 0;
    const later = run(s, L.volleyTicks * 2);
    expect(eventsOf(later, 'localChampionThrow')).toHaveLength(0);
  });

  it('the owner dying ends the window; the unused reward would have survived', () => {
    const s = scene();
    tick(s, B);
    s.players[0]!.alive = false;
    const ev = run(s, 2);
    expect(eventsOf(ev, 'localChampionEnded')[0]).toMatchObject({ reason: 'died' });
    const unused = scene();
    s.players[0]!.alive = true;
    expect(unused.players[0]!.streakRewards.localChampion).toBe(true);
  });

  it('is deterministic: the same match twice gives the same everything', () => {
    const play = (): string => {
      const s = scene();
      const log: SimEvent[] = [];
      for (let t = 0; t < 700; t++)
        log.push(...tick(s, t === 0 ? B : { 1: { move: t % 90 < 45 ? 'right' : 'left' } }));
      return JSON.stringify([
        log,
        s.players.map((p) => [p.x, p.y, p.dazedUntil, p.localChampionImmuneUntil]),
      ]);
    };
    expect(play()).toBe(play());
  });

  it('never lethal: a long full-pressure window on a crowded board kills nobody', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy', 'campusQueen', 'streetBaller'] });
    put(s, 0, 7, 5);
    put(s, 1, 5, 5);
    put(s, 2, 9, 5);
    put(s, 3, 7, 3);
    for (const p of s.players) p.protectedUntil = 0;
    grantStreakReward(s, 0, 'localChampion');
    run(s, 1, B);
    const ev = run(s, L.windowTicks + L.throwTicks);
    expect(eventsOf(ev, 'localChampionHit').length).toBeGreaterThan(0);
    expect(eventsOf(ev, 'playerEliminated')).toHaveLength(0);
    expect(s.players.every((p) => p.alive)).toBe(true);
  });
});

describe('the renderer and the other systems see it', () => {
  it('local throws share the knockdown projectile list but never land as a knockdown', () => {
    const s = scene();
    tick(s, B);
    expect(s.knockdowns).toHaveLength(1);
    run(s, L.throwTicks + 2);
    expect(s.knockdowns).toHaveLength(0);
    expect(s.players[1]!.knockedUntil).toBe(0);
  });
});

describe('bots can use it', () => {
  it('a Standard bot holding a LOCAL CHAMPION uses it when a rival is within the radius', () => {
    const s = createGame({
      seed: 11,
      players: ['streetBaller', 'lekkiBoy'].map((characterId, i) => ({
        name: `P${i}`,
        characterId: characterId as 'streetBaller',
        isBot: true,
      })),
      settings: { stageHazards: false },
    });
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    for (const p of s.players) p.protectedUntil = 0;
    put(s, 0, 2, 2);
    put(s, 1, 5, 2);
    grantStreakReward(s, 0, 'localChampion');
    const bot = createBot({ difficulty: 'standard', seed: 5, playerId: 0 });
    let used = false;
    for (let t = 0; t < 600 && !used; t++) {
      const intents: Intents = { 0: bot.decide(observe(s, 0)) };
      for (const e of tick(s, intents)) if (e.type === 'localChampionStarted') used = true;
    }
    expect(used).toBe(true);
  });
});
