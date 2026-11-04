/**
 * GLOBAL KNOCKDOWN / LOCAL CHAMPION (decision GK1): the 7-kill streak reward. Visible projectiles from the building
 * side at EVERY rival, a hit on the head, a fall, about two seconds flat on the ground (tuning range 1.5-3 s); nobody
 * dies of it; the owner is unaffected and may act; rivals cannot move, place or attack while down; one use; no stacking.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, tick } from '../src/sim';
import type { GameState, Intents, SimEvent } from '../src/sim';
import { addGenerator, eventsOf, put, sandbox } from './helpers';

const K = DEFAULT_CONFIG.streaks.globalKnockdown;

/** Owner (0) with a GLOBAL KNOCKDOWN, three rivals spread over the board. */
function scene(config = {}): GameState {
  const s = sandbox({ characters: ['streetBaller', 'lekkiBoy', 'campusQueen', 'streetBaller'], config });
  put(s, 0, 1, 1);
  put(s, 1, 6, 4);
  put(s, 2, 10, 6);
  put(s, 3, 12, 2);
  s.players[0]!.streakRewards.knockdown = true;
  for (const p of s.players) p.protectedUntil = 0;
  return s;
}
const B: Intents = { 0: { special: true } };
function run(s: GameState, n: number, intents: Intents = {}): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...tick(s, intents));
  return all;
}

describe('a visible throw at every rival, not an invisible stun', () => {
  it('one press throws one object at each rival, from outside the board, and nothing happens yet', () => {
    const s = scene();
    const ev = tick(s, B);
    const thrown = eventsOf(ev, 'knockdownThrown');
    expect(thrown.map((t) => t.targetId).sort()).toEqual([1, 2, 3]);
    for (const t of thrown) {
      const outside = t.fromX < 0 || t.fromY < 0 || t.fromX >= s.width || t.fromY >= s.height;
      expect(outside, 'thrown from the building side').toBe(true);
      expect(t.landTick - s.tick).toBe(K.throwTicks);
    }
    expect(eventsOf(ev, 'knockdownHit')).toHaveLength(0);
    expect(s.players[1]!.dazedUntil).toBeLessThanOrEqual(s.tick); // not down yet: the object is in the air
    expect(eventsOf(ev, 'streakRewardUsed')).toEqual([
      { type: 'streakRewardUsed', playerId: 0, reward: 'globalKnockdown' },
    ]);
  });

  it('rivals can still move while the objects fly (a warning of about 0.6 s)', () => {
    const s = scene();
    tick(s, B);
    const [x0] = [s.players[1]!.x];
    run(s, K.throwTicks - 2, { 1: { move: 'right' } });
    expect(s.players[1]!.x).toBeGreaterThan(x0);
    expect(K.throwTicks / 60).toBeGreaterThanOrEqual(0.5);
  });

  it('the objects land on their heads, together with the fall', () => {
    const s = scene();
    const ev = run(s, 1, B);
    ev.push(...run(s, K.throwTicks + 2));
    const hits = eventsOf(ev, 'knockdownHit');
    expect(hits.map((h) => h.playerId).sort()).toEqual([1, 2, 3]);
    for (const h of hits) expect(h.until).toBeGreaterThan(s.tick - 3);
    for (const id of [1, 2, 3]) expect(s.players[id]!.knockedUntil).toBeGreaterThan(s.tick);
  });
});

describe('the knockdown itself', () => {
  const down = (): { s: GameState; landed: number } => {
    const s = scene();
    tick(s, B);
    while (!s.players[1]!.knockedUntil) tick(s);
    return { s, landed: s.tick };
  };

  it('lasts about two seconds', () => {
    expect(K.knockdownTicks).toBe(120);
    const { s, landed } = down();
    expect(s.players[1]!.knockedUntil - landed).toBe(K.knockdownTicks);
  });

  it('nobody dies of it', () => {
    const { s } = down();
    run(s, 200);
    expect(s.players.every((p) => p.alive)).toBe(true);
  });

  it('a fallen rival cannot move, place a generator or attack, and the owner can do all three', () => {
    const { s } = down();
    const v = s.players[1]!;
    const [x, y] = [v.x, v.y];
    s.players[0]!.skillReadyTick = 0;
    const ev = run(s, 60, {
      1: { move: 'right', place: true, special: true },
      0: { move: 'right', place: true },
    });
    expect([v.x, v.y]).toEqual([x, y]);
    expect(eventsOf(ev, 'generatorPlaced').every((g) => g.ownerId === 0)).toBe(true);
    expect(eventsOf(ev, 'generatorPlaced').length).toBeGreaterThan(0);
    expect(eventsOf(ev, 'attackStarted').filter((a) => a.playerId === 1)).toHaveLength(0);
    expect(s.players[0]!.x).toBeGreaterThan(1); // the owner walked on, unaffected
  });

  it('the owner is never hit, and a teammate of the owner is not either', () => {
    const s = scene();
    s.players[3]!.team = 0;
    s.players[0]!.team = 0;
    s.players[1]!.team = 1;
    s.players[2]!.team = 1;
    const ev = run(s, K.throwTicks + 4, B);
    const hit = eventsOf(ev, 'knockdownHit').map((h) => h.playerId);
    expect(hit).not.toContain(0);
    expect(hit).not.toContain(3);
    expect(hit.sort()).toEqual([1, 2]);
  });

  it('victims recover and can escape: they move again once the knockdown is over', () => {
    const { s } = down();
    const v = s.players[1]!;
    run(s, v.knockedUntil - s.tick + 2, { 1: { move: 'right' } });
    const x = v.x;
    run(s, 25, { 1: { move: 'right' } });
    expect(v.x).toBeGreaterThan(x);
  });

  it.each([90, 120, 150, 180])('the tuning range 1.5-3 s: %i ticks is exactly that long', (ticks) => {
    const s = scene({ streaks: { globalKnockdown: { knockdownTicks: ticks } } });
    tick(s, B);
    while (!s.players[1]!.knockedUntil) tick(s);
    const landed = s.tick;
    const ev = run(s, ticks + 3);
    const ended = eventsOf(ev, 'knockdownEnded').find((e) => e.playerId === 1);
    expect(ended).toBeDefined();
    expect(s.players[1]!.knockedUntil).toBe(0);
    expect(landed + ticks).toBeLessThanOrEqual(s.tick);
  });

  it("cuts a rival's melee wind-up short", () => {
    // a slow wind-up (60 ticks) is still pending when the object lands
    const s = scene({ skills: { attacks: { daze: { startupTicks: 60 } } } });
    put(s, 1, 7, 6);
    put(s, 2, 8, 6);
    s.players[1]!.facing = 'right';
    tick(s, { 0: { special: true }, 1: { special: true } });
    expect(s.players[1]!.attack).not.toBeNull(); // the Daze Punch is winding up
    const ev = run(s, K.throwTicks + 3);
    expect(s.players[1]!.attack).toBeNull();
    expect(eventsOf(ev, 'attackInterrupted').map((e) => e.playerId)).toContain(1);
  });
});

describe('one use, no stacking', () => {
  it('a second press does nothing, and a fallen rival is not thrown at again', () => {
    const s = scene();
    run(s, 1, B);
    const ev = run(s, 5, B);
    expect(eventsOf(ev, 'knockdownThrown')).toHaveLength(0);
    expect(s.players[0]!.streakRewards.knockdown).toBe(false);
  });

  it('a rival who has just got up is immune for a while: a new knockdown finds nobody and is kept', () => {
    const s = scene();
    tick(s, B);
    while (!s.players[1]!.knockedUntil) tick(s);
    run(s, K.knockdownTicks + 2);
    expect(s.players.slice(1).every((p) => p.knockedUntil === 0)).toBe(true);
    s.players[0]!.streakRewards.knockdown = true; // earned again (a new streak)
    const ev = run(s, 1, B);
    expect(eventsOf(ev, 'knockdownThrown')).toHaveLength(0);
    expect(s.players[0]!.streakRewards.knockdown).toBe(true); // nobody to hit: the reward is not wasted
    run(s, K.immunityTicks + 2);
    const again = run(s, 1, B);
    expect(eventsOf(again, 'knockdownThrown')).toHaveLength(3);
  });

  it('survives an actual death: an earned one-use reward stays until it is used (decision AS5)', () => {
    const s = scene();
    put(s, 0, 3, 4);
    addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 1 });
    run(s, 3);
    expect(s.players[0]!.alive).toBe(false);
    expect(s.players[0]!.streakRewards.knockdown).toBe(true);
  });
});

describe('a strong follow-up, not an automatic kill (three-second fuse)', () => {
  it('a generator armed just BEFORE the knockdown catches the fallen rival', () => {
    const s = scene();
    const v = s.players[1]!;
    // armed to go off while they are still flat: 1 s into the knockdown
    addGenerator(s, { ownerId: 0, x: v.x + 1, y: v.y, range: 2, timer: K.throwTicks + 60 });
    tick(s, B);
    run(s, K.throwTicks + 80);
    expect(v.alive).toBe(false);
  });

  it('a generator the owner places DURING the knockdown can be outrun: they get up with about a second to spare', () => {
    const s = scene();
    s.players[1]!.armour = 0;
    tick(s, B);
    while (!s.players[1]!.knockedUntil) tick(s);
    const v = s.players[1]!;
    put(s, 0, v.x - 1, v.y); // the owner steps up and places at once (a 3 s fuse)
    run(s, 1, { 0: { place: true } });
    // the rival runs the tick they can act
    let alive = true;
    for (let t = 0; t < 260 && alive; t++) {
      const free = s.tick >= v.knockedUntil && v.stepRemaining <= 1;
      tick(s, free ? { 1: { move: 'right' } } : {});
      alive = v.alive;
    }
    expect(alive).toBe(true);
    // ... yet the owner got the whole window to act in: the rival lost two seconds
    expect(K.knockdownTicks).toBeLessThan(DEFAULT_CONFIG.generator.fuseTicks);
  });
});

describe('determinism', () => {
  it('replays identically', () => {
    const play = (): string => {
      const s = scene();
      const ev = run(s, 400, { 0: { special: true, move: 'right' } });
      return JSON.stringify([
        ev.map((e) => e.type),
        s.players.map((p) => [p.x, p.y, p.knockedUntil, p.alive]),
      ]);
    };
    expect(play()).toBe(play());
  });
});
