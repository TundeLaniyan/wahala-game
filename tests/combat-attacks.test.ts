/**
 * Close attacks (decisions CB1-CB4): Punch / Street Jab (`push`), Shove (`shove`) and Daze Punch (`daze`) are three
 * genuinely different attacks, simulated tick by tick: startup, whiff, hit recovery, displacement, daze duration,
 * the per-target lockout, other targets, and no attacker freeze.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, tick } from '../src/sim';
import type { AttackSpec } from '../src/sim';
import type { CharacterId, GameState, Intents, SimEvent } from '../src/sim';
import { addGenerator, eventsOf, put, sandbox } from './helpers';

const A = DEFAULT_CONFIG.skills.attacks;
const PUNCH = A.push;
const SHOVE = A.shove;
const DAZE = A.daze;

const FIGHTER: Record<'push' | 'shove' | 'daze', CharacterId> = {
  push: 'streetBaller',
  shove: 'campusQueen',
  daze: 'lekkiBoy',
};

/** Attacker (player 0) at (4,4) facing right, victim at (5,4); an extra rival may stand at (3,4). */
function scene(skill: keyof typeof FIGHTER, players = 2): GameState {
  const s = sandbox({
    characters: [FIGHTER[skill], 'streetBaller', 'streetBaller'].slice(0, players) as CharacterId[],
  });
  put(s, 0, 4, 4);
  put(s, 1, 5, 4);
  if (players > 2) put(s, 2, 3, 4);
  s.players[0]!.facing = 'right';
  return s;
}
const B: Intents = { 0: { special: true } };
function run(s: GameState, n: number, intents: Intents = {}): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...tick(s, intents));
  return all;
}
describe('Punch / Street Jab (push): fast, light', () => {
  it('starts at once, takes effect after its startup, and only then dazes', () => {
    const s = scene('push');
    const start = s.tick;
    const ev = tick(s, B);
    expect(eventsOf(ev, 'attackStarted')).toHaveLength(1);
    expect(s.players[1]!.dazedUntil).toBeLessThanOrEqual(s.tick); // nothing yet
    let hitTick = -1;
    for (let i = 0; i < 10; i++) {
      const e = tick(s);
      if (eventsOf(e, 'attackResolved').some((r) => r.hit)) {
        hitTick = s.tick;
        break;
      }
    }
    expect(hitTick - start).toBe(PUNCH.startupTicks + 1); // the press tick + the startup
    expect(PUNCH.startupTicks).toBeLessThanOrEqual(6); // very fast
  });

  it('dazes for about half a second (0.4-0.6 s), does not displace, and the daze really holds the victim', () => {
    const s = scene('push');
    run(s, 1, B);
    run(s, PUNCH.startupTicks);
    const v = s.players[1]!;
    expect([v.x, v.y]).toEqual([5, 4]); // no displacement
    expect(PUNCH.displacementTiles).toBe(0);
    expect(PUNCH.dazeTicks / 60).toBeGreaterThanOrEqual(0.4);
    expect(PUNCH.dazeTicks / 60).toBeLessThanOrEqual(0.6);
    const until = v.dazedUntil;
    run(s, 1, { 1: { move: 'right' } });
    expect([v.x, v.y]).toEqual([5, 4]); // frozen
    while (s.tick < until - 1) run(s, 1, { 1: { move: 'right' } });
    expect(v.x).toBe(5);
    run(s, 3, { 1: { move: 'right' } });
    expect(v.x).toBe(6); // free again
  });

  it('a hit recovery shorter than the other attacks', () => {
    expect(PUNCH.hitRecoveryTicks).toBeLessThan(SHOVE.hitRecoveryTicks);
    expect(PUNCH.hitRecoveryTicks).toBeLessThan(DAZE.hitRecoveryTicks);
  });
});

describe('Shove: slow, positional, risky', () => {
  it('starts slower than the Punch', () => {
    expect(SHOVE.startupTicks).toBeGreaterThan(PUNCH.startupTicks);
  });

  it('pushes the rival two tiles where the map allows, with no ordinary daze', () => {
    const s = scene('shove');
    run(s, 1, B);
    run(s, SHOVE.startupTicks);
    const v = s.players[1]!;
    expect([v.x, v.y]).toEqual([7, 4]); // two tiles
    expect(v.dazedUntil).toBeLessThanOrEqual(s.tick); // no daze
    expect(v.alive).toBe(true);
  });

  it('pushes one tile when a crate / wall stops the second, and fails when the very next tile is blocked', () => {
    const one = scene('shove');
    one.tiles[4 * one.width + 7] = 1; // a solid tile two tiles beyond the rival
    run(one, 1, B);
    run(one, SHOVE.startupTicks);
    expect(one.players[1]!.x).toBe(6);

    const none = scene('shove');
    none.tiles[4 * none.width + 6] = 1; // directly behind the rival
    const ev = [...run(none, 1, B), ...run(none, SHOVE.startupTicks + 1)];
    expect(none.players[1]!.x).toBe(5);
    expect(eventsOf(ev, 'attackResolved').some((r) => !r.hit)).toBe(true);
  });

  it('a generator behind the rival blocks the push as a wall does', () => {
    const s = scene('shove');
    addGenerator(s, { ownerId: 1, x: 6, y: 4, timer: 9999 });
    run(s, 1, B);
    run(s, SHOVE.startupTicks + 1);
    expect(s.players[1]!.x).toBe(5);
  });

  it("a failed Shove leaves the attacker exposed: a long whiff recovery, longer than the Punch's", () => {
    expect(SHOVE.whiffRecoveryTicks).toBeGreaterThan(PUNCH.whiffRecoveryTicks);
    const s = scene('shove');
    s.tiles[4 * s.width + 6] = 1;
    run(s, 1, B);
    run(s, SHOVE.startupTicks); // resolves as a whiff on this tick
    const ready = s.players[0]!.skillReadyTick;
    expect(ready - s.tick).toBe(SHOVE.whiffRecoveryTicks);
    // pressing B again before then does nothing
    const ev = run(s, 1, B);
    expect(eventsOf(ev, 'attackStarted')).toHaveLength(0);
  });

  it("a hit has the longest recovery of the three after the Daze Punch's, and a longer cooldown than a whiff", () => {
    expect(SHOVE.hitRecoveryTicks).toBeGreaterThan(SHOVE.whiffRecoveryTicks);
    expect(SHOVE.hitRecoveryTicks).toBeGreaterThan(PUNCH.hitRecoveryTicks);
  });

  it('shoving a rival onto a flame kills them and credits the attacker', () => {
    const s = scene('shove');
    s.flames.push({
      x: 7,
      y: 4,
      eventId: 900,
      genId: 0,
      ownerId: 1,
      dir: 'right',
      tip: false,
      startTick: s.tick,
      endTick: s.tick + 600,
    });
    run(s, 1, B);
    const ev = run(s, SHOVE.startupTicks + 4);
    expect(s.players[1]!.alive).toBe(false);
    expect(eventsOf(ev, 'playerEliminated')[0]?.creditId).toBe(0);
  });
});

describe('Daze Punch (daze): slow, heavy', () => {
  it('has a visible startup and then a full second of daze, then immunity', () => {
    expect(DAZE.startupTicks).toBeGreaterThan(PUNCH.startupTicks);
    const s = scene('daze');
    run(s, 1, B);
    run(s, DAZE.startupTicks);
    const v = s.players[1]!;
    expect(v.dazedUntil - s.tick).toBe(DAZE.dazeTicks);
    expect(v.dazeImmuneUntil - v.dazedUntil).toBe(DAZE.dazeImmunityTicks);
    expect(DAZE.dazeTicks).toBeGreaterThan(PUNCH.dazeTicks);
  });

  it('cannot be started on a rival who is still immune to a daze', () => {
    const s = scene('daze');
    s.players[1]!.dazeImmuneUntil = s.tick + 500;
    const ev = run(s, 1, B);
    expect(eventsOf(ev, 'attackStarted')).toHaveLength(0);
  });
});

describe('whiffs and recoveries', () => {
  it('a rival who steps away during the startup is missed: whiff recovery, not the hit cooldown', () => {
    const s = scene('daze'); // the longest startup
    run(s, 1, B);
    put(s, 1, 8, 4); // gone
    const ev = run(s, DAZE.startupTicks);
    const r = eventsOf(ev, 'attackResolved');
    expect(r).toHaveLength(1);
    expect(r[0]!.hit).toBe(false);
    expect(s.players[0]!.skillReadyTick - s.tick).toBe(DAZE.whiffRecoveryTicks);
    expect(DAZE.whiffRecoveryTicks).toBeLessThan(DAZE.hitRecoveryTicks);
    expect(s.players[1]!.dazedUntil).toBeLessThanOrEqual(s.tick);
  });

  it('after a whiff the next attack may start exactly when the whiff recovery ends', () => {
    const s = scene('push');
    run(s, 1, B);
    put(s, 1, 8, 4);
    run(s, PUNCH.startupTicks);
    put(s, 1, 5, 4);
    const wait = s.players[0]!.skillReadyTick - s.tick;
    expect(wait).toBe(PUNCH.whiffRecoveryTicks);
    run(s, wait - 1, B);
    expect(s.players[0]!.attack).toBeNull(); // too early
    const ev = run(s, 1, B);
    expect(eventsOf(ev, 'attackStarted')).toHaveLength(1);
  });

  it('a hit imposes the longer hit recovery', () => {
    const s = scene('push');
    run(s, 1, B);
    run(s, PUNCH.startupTicks);
    expect(s.players[0]!.skillReadyTick - s.tick).toBe(PUNCH.hitRecoveryTicks);
    expect(PUNCH.hitRecoveryTicks).toBeGreaterThan(PUNCH.whiffRecoveryTicks);
  });

  it('with nobody adjacent B does nothing and costs nothing', () => {
    const s = scene('push');
    put(s, 1, 9, 9);
    const ev = run(s, 1, B);
    expect(eventsOf(ev, 'attackStarted')).toHaveLength(0);
    expect(s.players[0]!.skillReadyTick).toBe(0);
  });
});

describe('the same target cannot be chain-hit; other targets can', () => {
  it('after a Punch the same rival is locked out for the lockout, even after the attacker has recovered', () => {
    const s = scene('push');
    run(s, 1, B);
    run(s, PUNCH.startupTicks);
    const hit = s.tick;
    expect(s.players[0]!.meleeLock[1]).toBe(hit + PUNCH.targetLockoutTicks);
    expect(PUNCH.targetLockoutTicks).toBeGreaterThan(PUNCH.hitRecoveryTicks);
    // the attacker has recovered (and the daze + immunity are over) but the lockout still stands
    s.players[1]!.dazedUntil = 0;
    s.players[1]!.dazeImmuneUntil = 0;
    while (s.tick < hit + PUNCH.hitRecoveryTicks + 2) tick(s);
    const ev = run(s, 1, B);
    expect(eventsOf(ev, 'attackStarted')).toHaveLength(0);
    // ... and it is available again once the lockout is over
    while (s.tick < hit + PUNCH.targetLockoutTicks) tick(s);
    const ev2 = run(s, 1, B);
    expect(eventsOf(ev2, 'attackStarted')).toHaveLength(1);
  });

  it('a different rival is hittable as soon as the attacker has recovered', () => {
    const s = scene('push', 3);
    run(s, 1, B); // faced tile first: rival 1
    run(s, PUNCH.startupTicks);
    expect(s.players[1]!.dazedUntil).toBeGreaterThan(s.tick);
    const hit = s.tick;
    // too early: still recovering
    run(s, PUNCH.hitRecoveryTicks - 2, B);
    expect(s.players[2]!.dazedUntil).toBeLessThanOrEqual(s.tick);
    while (s.tick < hit + PUNCH.hitRecoveryTicks) tick(s);
    const ev = run(s, 1, B);
    expect(eventsOf(ev, 'attackStarted')[0]?.targetId).toBe(2); // rival 1 is locked out, rival 2 is not
    run(s, PUNCH.startupTicks);
    expect(s.players[2]!.dazedUntil).toBeGreaterThan(s.tick);
  });

  it('the lockout is per attacker: a second attacker can hit the same victim', () => {
    const s = sandbox({ characters: ['streetBaller', 'streetBaller', 'streetBaller'] });
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    put(s, 2, 6, 4);
    s.players[0]!.facing = 'right';
    s.players[2]!.facing = 'left';
    run(s, 1, B);
    run(s, PUNCH.startupTicks);
    s.players[1]!.dazeImmuneUntil = 0; // (the victim's own daze immunity is a separate rule)
    const ev = run(s, 1, { 2: { special: true } });
    expect(eventsOf(ev, 'attackStarted')[0]?.targetId).toBe(1);
  });

  it('a held B never re-hits: one press is one attack', () => {
    const s = scene('push');
    const ev = run(s, 5 * 60, B); // 5 s of an unbroken B press stream
    const hits = eventsOf(ev, 'attackResolved').filter((r) => r.hit);
    // the Punch lockout is 3 s: within 5 s the same rival is hit at most twice
    expect(hits.length).toBeLessThanOrEqual(2);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});

describe('no attacker freeze', () => {
  it('the attacker can walk and place generators during the startup and every recovery', () => {
    const s = scene('shove');
    s.tiles[4 * s.width + 6] = 1; // a whiff: the longest recovery
    run(s, 1, B);
    // during the startup: walk away one tile and place a generator
    run(s, 1, { 0: { move: 'left', place: true } });
    expect(s.players[0]!.x).toBe(3);
    expect(s.generators.length).toBe(1);
    run(s, SHOVE.startupTicks + SHOVE.whiffRecoveryTicks, { 0: { move: 'left' } });
    expect(s.players[0]!.x).toBeLessThan(3); // kept walking the whole time
    expect(s.players[0]!.dazedUntil).toBe(0);
  });
});

describe('interrupting', () => {
  it("a Punch that lands cuts a rival's slower wind-up short (a fast jab beats a slow heavy punch)", () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.facing = 'right';
    s.players[1]!.facing = 'left';
    // the heavy puncher starts first, the fast jab right after: the jab lands inside the heavy wind-up
    tick(s, { 1: { special: true } });
    expect(s.players[1]!.attack).not.toBeNull();
    const ev = run(s, 1 + PUNCH.startupTicks, { 0: { special: true } });
    expect(eventsOf(ev, 'attackInterrupted')).toHaveLength(1);
    expect(s.players[1]!.attack).toBeNull();
    expect(s.players[0]!.dazedUntil).toBe(0); // the heavy punch never landed
  });
});

describe('determinism and the balance of the three', () => {
  it('replays identically: same state, same inputs, same melee outcome', () => {
    const play = (): string => {
      const s = scene('daze', 3);
      for (let t = 0; t < 600; t++)
        tick(s, t % 40 === 0 ? { 0: { special: true } } : { 2: { move: t % 80 ? 'left' : 'right' } });
      return JSON.stringify(s.players.map((p) => [p.x, p.y, p.dazedUntil, p.skillReadyTick, p.meleeLock]));
    };
    expect(play()).toBe(play());
  });

  it('no attack is strictly superior to another (every pair trades something off)', () => {
    // "better" is lower for the first four and higher for the last two
    const axes: [string, (a: AttackSpec) => number][] = [
      ['startup', (a) => -a.startupTicks],
      ['whiff recovery', (a) => -a.whiffRecoveryTicks],
      ['hit recovery', (a) => -a.hitRecoveryTicks],
      ['lockout (repeat sooner)', (a) => -a.targetLockoutTicks],
      ['daze', (a) => a.dazeTicks],
      ['displacement', (a) => a.displacementTiles],
    ];
    const names = ['push', 'shove', 'daze'] as const;
    for (const a of names)
      for (const b of names) {
        if (a === b) continue;
        const ge = axes.every(([, f]) => f(A[a]) >= f(A[b]));
        const gt = axes.some(([, f]) => f(A[a]) > f(A[b]));
        expect(ge && gt, `${a} must not dominate ${b}`).toBe(false);
      }
  });

  it('each attack is the best at something', () => {
    expect(PUNCH.startupTicks).toBeLessThan(Math.min(SHOVE.startupTicks, DAZE.startupTicks));
    expect(SHOVE.displacementTiles).toBeGreaterThan(
      Math.max(PUNCH.displacementTiles, DAZE.displacementTiles),
    );
    expect(DAZE.dazeTicks).toBeGreaterThan(Math.max(PUNCH.dazeTicks, SHOVE.dazeTicks));
  });
});
