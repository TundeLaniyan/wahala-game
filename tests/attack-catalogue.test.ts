/**
 * The extended close-attack catalogue (decisions FC1-FC4): every attack's numbers, how the simulation honours each
 * field (reach, daze, slow, displacement, recoveries, cooldown, vulnerability), the B resolution order, step grace,
 * the lockout audit and the duel matrix (no attack dominates; every attack beats one and loses to one).
 */
import { describe, expect, it } from 'vitest';
import { ENGAGEMENT_SECONDS, matchup } from '../scripts/lib/duel';
import {
  ATTACK_DEFS,
  ATTACK_KINDS,
  DEFAULT_CONFIG,
  chooseAttack,
  controlValueSeconds,
  dominates,
  loadoutOf,
  playerStepTicks,
  previewSpecial,
  tick,
} from '../src/sim';
import type { AttackKind, GameState, Intents, SimEvent } from '../src/sim';
import { eventsOf, put, sandbox } from './helpers';

const A = DEFAULT_CONFIG.skills.attacks;
/** A duel is won with more than this share of the control (and lost with less than 1 - this). */
const WIN = 0.505;
const LOSE = 1 - WIN;
const B: Intents = { 0: { special: true } };

/** Attacker (0) at (4,4) facing right with `primary` / `secondary`; rival (1) at (4 + gap, 4) facing left. */
function scene(primary: AttackKind, gap = 1, secondary: AttackKind | null = null, players = 2): GameState {
  const s = sandbox({ players });
  s.players[0]!.attacks = { primary, secondary };
  put(s, 0, 4, 4);
  put(s, 1, 4 + gap, 4);
  if (players > 2) put(s, 2, 4, 6);
  s.players[0]!.facing = 'right';
  s.players[1]!.facing = 'left';
  for (const p of s.players) p.protectedUntil = 0;
  return s;
}
function run(s: GameState, n: number, intents: Intents = {}): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...tick(s, intents));
  return all;
}
/** Press B once and play until the attack resolves; returns the events from the press on. */
function throwIt(s: GameState): SimEvent[] {
  const ev = run(s, 1, B);
  ev.push(...run(s, A[s.players[0]!.attack?.skill ?? 'push'].startupTicks + 1));
  return ev;
}

describe('every attack has the full spec and none is lethal', () => {
  it('records range, speed, control value, displacement, daze, recovery, cooldown and vulnerability', () => {
    for (const k of ATTACK_KINDS) {
      const a = A[k];
      expect(a.reach, k).toBeGreaterThanOrEqual(1);
      expect(a.reach, k).toBeLessThanOrEqual(2);
      expect(a.startupTicks, k).toBeGreaterThan(0);
      expect(a.whiffRecoveryTicks, k).toBeGreaterThan(0);
      expect(a.hitRecoveryTicks, k).toBeGreaterThan(0);
      expect(a.targetLockoutTicks, k).toBeGreaterThanOrEqual(a.hitRecoveryTicks); // no chain
      expect(a.damage, `${k} is non-lethal`).toBe(0);
      expect(controlValueSeconds(a, DEFAULT_CONFIG), `${k} has some effect`).toBeGreaterThan(0);
      expect(ATTACK_DEFS[k].kind).toBe(k);
      expect(ATTACK_DEFS[k].needs.animation.length).toBeGreaterThan(0);
    }
  });

  it('the original three keep their deployed numbers', () => {
    expect(A.push).toMatchObject({
      startupTicks: 4,
      whiffRecoveryTicks: 12,
      hitRecoveryTicks: 60,
      targetLockoutTicks: 180,
      dazeTicks: 30,
      displacementTiles: 0,
    });
    expect(A.shove).toMatchObject({
      startupTicks: 12,
      whiffRecoveryTicks: 36,
      hitRecoveryTicks: 120,
      targetLockoutTicks: 180,
      dazeTicks: 0,
      displacementTiles: 2,
    });
    expect(A.daze).toMatchObject({
      startupTicks: 18,
      whiffRecoveryTicks: 30,
      hitRecoveryTicks: 240,
      targetLockoutTicks: 240,
      dazeTicks: 60,
      displacementTiles: 0,
    });
    for (const k of ['push', 'shove', 'daze'] as const) {
      expect(A[k]).toMatchObject({
        reach: 1,
        slowTicks: 0,
        cooldownTicks: 0,
        plantedStartup: false,
        whiffRootTicks: 0,
        hitRootTicks: 0,
      });
    }
  });

  it('no attack lets anyone die: a long fight with each one kills nobody and costs no armour', () => {
    for (const k of ATTACK_KINDS) {
      const s = scene(k, 1);
      s.players[1]!.attacks = { primary: k, secondary: null };
      for (const p of s.players) p.armour = 0;
      const ev: SimEvent[] = [];
      for (let t = 0; t < 1800; t++) ev.push(...tick(s, { 0: { special: true }, 1: { special: true } }));
      expect(eventsOf(ev, 'playerEliminated'), k).toHaveLength(0);
    }
  });
});

describe('Kick: reach 2, displaces 1, slow, planted', () => {
  it('strikes a rival two tiles away in the faced line, and that is the only reach-2 attack', () => {
    expect(ATTACK_KINDS.filter((k) => A[k].reach === 2)).toEqual(['kick']);
    const s = scene('kick', 2);
    const ev = throwIt(s);
    expect(eventsOf(ev, 'attackResolved').some((r) => r.hit)).toBe(true);
    expect(s.players[1]!.x).toBe(7); // displaced one tile
    expect(A.kick.displacementTiles).toBe(1);
  });

  it('is slow and has a long recovery: slower than the Punch, longer whiff than the Shove', () => {
    expect(A.kick.startupTicks).toBeGreaterThan(A.push.startupTicks);
    expect(A.kick.whiffRecoveryTicks).toBeGreaterThan(A.shove.whiffRecoveryTicks);
    expect(A.kick.hitRecoveryTicks).toBeGreaterThan(A.shove.hitRecoveryTicks);
  });

  it('cannot reach over a wall or a crate, nor three tiles', () => {
    const wall = scene('kick', 2);
    wall.tiles[4 * wall.width + 5] = 1; // the tile between
    expect(chooseAttack(wall, wall.players[0]!)).toBeNull();
    const far = scene('kick', 3);
    expect(chooseAttack(far, far.players[0]!)).toBeNull();
  });

  it('the attacker is planted during the wind-up (cannot step) but can still place a generator', () => {
    const s = scene('kick', 2);
    run(s, 1, B);
    run(s, 1, { 0: { move: 'left', place: true } });
    expect(s.players[0]!.x).toBe(4); // planted
    expect(s.generators.length).toBe(1);
    run(s, A.kick.startupTicks, { 0: { move: 'left' } });
    expect(s.players[0]!.x).toBeLessThan(4); // free once it resolved (or recoiled)
  });

  it('a missed kick leaves the attacker stuck for whiffRootTicks', () => {
    const s = scene('kick', 2);
    run(s, 1, B);
    put(s, 1, 9, 4); // gone
    run(s, A.kick.startupTicks); // resolves as a whiff
    expect(eventsOf(run(s, 0), 'attackResolved')).toHaveLength(0);
    expect(s.players[0]!.rootedUntil - s.tick).toBeGreaterThan(0);
    run(s, 3, { 0: { move: 'left' } });
    expect(s.players[0]!.x).toBe(4);
    run(s, A.kick.whiffRootTicks + 2, { 0: { move: 'left' } });
    expect(s.players[0]!.x).toBeLessThan(4);
  });

  it('a faster jab cuts the kick short (the kicker is exposed while planted)', () => {
    const s = sandbox({ players: 2 });
    s.players[0]!.attacks = { primary: 'kick', secondary: null };
    s.players[1]!.attacks = { primary: 'push', secondary: null };
    put(s, 0, 4, 4);
    put(s, 1, 6, 4);
    s.players[0]!.facing = 'right';
    s.players[1]!.facing = 'left';
    for (const p of s.players) p.protectedUntil = 0;
    run(s, 1, B); // the kick starts at two tiles
    run(s, 1, { 1: { move: 'left' } }); // the rival closes in (the kicker cannot step away: planted)
    const ev = run(s, A.push.startupTicks + 3, { 1: { special: true } });
    expect(eventsOf(ev, 'attackInterrupted')).toEqual([{ type: 'attackInterrupted', playerId: 0, byId: 1 }]);
    expect(s.players[0]!.attack).toBeNull();
    expect(s.players[1]!.x).toBe(5); // the kick never landed
  });
});

describe('Bottle Strike: the longest daze, single use per cooldown, risky', () => {
  it('dazes longer than any other attack', () => {
    for (const k of ATTACK_KINDS)
      if (k !== 'bottle') expect(A.bottle.dazeTicks).toBeGreaterThan(A[k].dazeTicks);
    const s = scene('bottle');
    throwIt(s);
    expect(s.players[1]!.dazedUntil - s.tick).toBeGreaterThan(A.daze.dazeTicks);
  });

  it('cannot be thrown again for the cooldown, even after a miss or on another rival', () => {
    const s = scene('bottle', 1, null, 3);
    throwIt(s);
    const start = s.tick;
    s.players[0]!.skillReadyTick = 0; // the global recovery is over; only the bottle's own cooldown remains
    s.players[0]!.meleeLock = {};
    put(s, 2, 4, 5);
    s.players[0]!.facing = 'down';
    const early = run(s, 1, B);
    expect(eventsOf(early, 'attackStarted')).toHaveLength(0);
    while (s.tick < start + A.bottle.cooldownTicks - 20) tick(s);
    expect(eventsOf(run(s, 1, B), 'attackStarted')).toHaveLength(0);
    while (s.tick < start + A.bottle.cooldownTicks) tick(s);
    s.players[2]!.dazeImmuneUntil = 0;
    expect(eventsOf(run(s, 1, B), 'attackStarted')).toHaveLength(1);
  });

  it('is spent by a whiff too (single use per cooldown), and a whiff sticks the attacker', () => {
    const s = scene('bottle');
    run(s, 1, B);
    put(s, 1, 9, 4);
    run(s, A.bottle.startupTicks);
    expect(s.players[0]!.attackCooldowns.bottle).toBeGreaterThan(s.tick + 300);
    expect(s.players[0]!.rootedUntil).toBeGreaterThan(s.tick);
  });

  it('a faster hit cancels it: a Punch lands inside its wind-up', () => {
    const s = sandbox({ players: 2 });
    s.players[0]!.attacks = { primary: 'bottle', secondary: null };
    s.players[1]!.attacks = { primary: 'push', secondary: null };
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.facing = 'right';
    s.players[1]!.facing = 'left';
    for (const p of s.players) p.protectedUntil = 0;
    run(s, 1, B);
    const ev = run(s, 1 + A.push.startupTicks, { 1: { special: true } });
    expect(eventsOf(ev, 'attackInterrupted')).toHaveLength(1);
    expect(s.players[0]!.dazedUntil).toBeGreaterThan(0);
    expect(s.players[1]!.dazedUntil).toBeLessThanOrEqual(s.tick);
  });
});

describe('Leg Sweep: slows, no daze, adjacent only', () => {
  it('slows walking for a few seconds and does not daze or move the rival', () => {
    const s = scene('sweep');
    const base = playerStepTicks(s, s.players[1]!);
    throwIt(s);
    const v = s.players[1]!;
    expect(v.dazedUntil).toBeLessThanOrEqual(s.tick);
    expect([v.x, v.y]).toEqual([5, 4]);
    expect(playerStepTicks(s, v)).toBe(base + A.sweep.slowExtraStepTicks);
    expect(A.sweep.slowTicks / 60).toBeGreaterThanOrEqual(3);
    expect(A.sweep.slowTicks / 60).toBeLessThanOrEqual(5);
    // the rival can still walk, only slower
    run(s, 1, { 1: { move: 'right' } });
    expect(v.stepRemaining).toBe(base + A.sweep.slowExtraStepTicks);
    // it ends
    while (s.tick < v.slow!.until) tick(s);
    expect(playerStepTicks(s, v)).toBe(base);
  });

  it('is adjacent-only: nothing two tiles away', () => {
    const s = scene('sweep', 2);
    expect(chooseAttack(s, s.players[0]!)).toBeNull();
  });

  it('never stacks or extends: a second sweep during the slow or the immunity does nothing', () => {
    const s = scene('sweep');
    throwIt(s);
    const v = s.players[1]!;
    const until = v.slow!.until;
    s.players[0]!.meleeLock = {};
    s.players[0]!.skillReadyTick = 0;
    expect(chooseAttack(s, s.players[0]!)).toBeNull(); // a pure slow on a slowed-immune rival is not started
    while (s.tick < until + 5) tick(s);
    expect(chooseAttack(s, s.players[0]!)).toBeNull(); // still inside the slow immunity
    expect(v.slow!.until).toBe(until);
    while (s.tick < v.slowImmuneUntil) tick(s);
    expect(chooseAttack(s, s.players[0]!)).not.toBeNull();
  });
});

describe('Headbutt and Elbow Check', () => {
  it('Headbutt: a medium daze, and the attacker reels (cannot step) for a moment after a hit', () => {
    expect(A.headbutt.dazeTicks).toBeGreaterThan(A.push.dazeTicks);
    expect(A.headbutt.dazeTicks).toBeLessThan(A.daze.dazeTicks);
    const s = scene('headbutt');
    throwIt(s);
    expect(s.players[1]!.dazedUntil).toBeGreaterThan(s.tick);
    run(s, 2, { 0: { move: 'left' } });
    expect(s.players[0]!.x).toBe(4); // reeling
    run(s, A.headbutt.hitRootTicks + 2, { 0: { move: 'left' } });
    expect(s.players[0]!.x).toBeLessThan(4);
  });

  it('Elbow Check: a short daze on a free rival, a much longer one on a rival who is planted in a wind-up', () => {
    const calm = scene('elbow');
    throwIt(calm);
    const calmDaze = calm.players[1]!.dazedUntil - calm.tick;
    const busy = scene('elbow');
    busy.players[1]!.attacks = { primary: 'bottle', secondary: null };
    busy.players[1]!.attack = { skill: 'bottle', targetId: 0, resolveTick: busy.tick + 40, dir: 'left' };
    busy.players[1]!.rootedUntil = busy.tick + 40; // a Bottle Strike wind-up plants the attacker
    run(busy, 1, B);
    run(busy, A.elbow.startupTicks);
    const busyDaze = busy.players[1]!.dazedUntil - busy.tick;
    expect(busyDaze).toBeGreaterThan(calmDaze);
    expect(busyDaze - calmDaze).toBeGreaterThanOrEqual(A.elbow.counterDazeTicks - 2);
    expect(busy.players[1]!.attack).toBeNull(); // the wind-up is cut short
  });
});

describe('B resolution order (docs/FIGHTERS_AND_ATTACKS.md section 4)', () => {
  it('adjacent rival: the primary; the secondary only when the primary is recovering', () => {
    const s = scene('push', 1, 'sweep');
    const ev = run(s, 1, B);
    expect(eventsOf(ev, 'attackStarted')[0]!.skill).toBe('push');
    run(s, A.push.startupTicks);
    s.players[0]!.meleeLock = {}; // (the rival is locked out of the primary; clear it to isolate the recovery rule)
    s.players[1]!.dazeImmuneUntil = 0;
    // the primary is recovering (hit recovery): right away B does nothing, after the short follow-up gap B throws the sweep
    expect(eventsOf(run(s, 1, B), 'attackStarted')).toHaveLength(0);
    run(s, DEFAULT_CONFIG.skills.followUpGapTicks);
    expect(A.push.hitRecoveryTicks).toBeGreaterThan(DEFAULT_CONFIG.skills.followUpGapTicks + 2);
    const ev2 = run(s, 1, B);
    expect(eventsOf(ev2, 'attackStarted')[0]?.skill).toBe('sweep');
  });

  it('nobody adjacent: a ready reach-2 secondary on a rival two tiles away in the line', () => {
    const s = scene('push', 2, 'kick');
    expect(previewSpecial(s, s.players[0]!)).toBe('melee');
    const ev = run(s, 1, B);
    expect(eventsOf(ev, 'attackStarted')[0]!.skill).toBe('kick');
  });

  it('with a rival adjacent B is a melee press only, even while everything recovers: never a vehicle or reward', () => {
    const s = scene('push', 1, 'kick');
    s.players[0]!.hasVoucher = true;
    s.players[0]!.streakRewards.knockdown = true;
    s.players[0]!.skillReadyTick = s.tick + 500; // everything recovering
    const ev = run(s, 1, B);
    expect(eventsOf(ev, 'specialUsed')).toHaveLength(0);
    expect(eventsOf(ev, 'streakRewardUsed')).toHaveLength(0);
    expect(eventsOf(ev, 'vehicleWarning')).toHaveLength(0);
    expect(s.players[0]!.hasVoucher).toBe(true);
  });

  it('nobody in reach: the rewards and the voucher, in the documented order', () => {
    const s = scene('push', 5, 'kick');
    s.players[0]!.streakRewards.knockdown = true;
    s.players[0]!.streakRewards.localChampion = true;
    s.players[0]!.hasVoucher = true;
    expect(previewSpecial(s, s.players[0]!)).toBe('globalKnockdown');
    const ev = run(s, 1, B);
    expect(eventsOf(ev, 'specialUsed').map((e) => e.action)).toEqual(['globalKnockdown']);
    expect(s.players[0]!.streakRewards.localChampion).toBe(true); // untouched
    const ev2 = run(s, 1, B);
    expect(eventsOf(ev2, 'specialUsed').map((e) => e.action)).toEqual(['localChampion']);
    expect(s.players[0]!.hasVoucher).toBe(true);
  });

  it('B never does two things at once: over a long mixed stream every press yields at most one action', () => {
    const s = sandbox({ players: 3 });
    s.players[0]!.attacks = { primary: 'push', secondary: 'kick' };
    s.players[0]!.hasVoucher = true;
    s.players[0]!.streakRewards.knockdown = true;
    s.players[0]!.streakRewards.localChampion = true;
    for (const p of s.players) p.protectedUntil = 0;
    put(s, 0, 4, 4);
    put(s, 1, 6, 4);
    put(s, 2, 9, 9);
    s.players[0]!.facing = 'right';
    let acted = 0;
    for (let t = 0; t < 1500; t++) {
      const wander: Intents = {
        0: { special: t % 7 === 0, move: t % 31 < 8 ? 'right' : t % 31 < 16 ? 'left' : undefined },
        1: { move: t % 41 < 20 ? 'left' : 'right' },
      };
      const ev = tick(s, wander);
      const used = eventsOf(ev, 'specialUsed').filter((e) => e.playerId === 0);
      expect(used.length, `tick ${s.tick}`).toBeLessThanOrEqual(1);
      const effects = [
        eventsOf(ev, 'attackStarted').some((e) => e.playerId === 0),
        eventsOf(ev, 'knockdownThrown').length > 0,
        eventsOf(ev, 'localChampionStarted').length > 0,
        eventsOf(ev, 'vehicleWarning').some((e) => e.ownerId === 0),
        eventsOf(ev, 'vehicleGeneratorLaunched').length > 0,
      ].filter(Boolean).length;
      expect(effects, `tick ${s.tick}`).toBeLessThanOrEqual(1);
      acted += effects;
    }
    expect(acted).toBeGreaterThan(0);
  });

  it('the loadout follows the character live (tests and tools that swap characterId keep working)', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    expect(loadoutOf(s.players[0]!, s.config).primary).toBe('push');
    s.players[0]!.characterId = 'campusQueen';
    expect(loadoutOf(s.players[0]!, s.config).primary).toBe('shove');
    s.players[0]!.attacks = { primary: 'sweep' }; // an override wins; the secondary still follows the config
    expect(loadoutOf(s.players[0]!, s.config)).toEqual({ primary: 'sweep', secondary: null });
  });

  it('secondary attacks are off by default for the deployed fighters and honoured behind the config switch', () => {
    expect(DEFAULT_CONFIG.skills.secondaryAttacks).toBe(false);
    const off = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    expect(loadoutOf(off.players[0]!, off.config)).toEqual({ primary: 'push', secondary: null });
    const on = sandbox({
      characters: ['streetBaller', 'lekkiBoy'],
      config: { skills: { secondaryAttacks: true } },
    });
    expect(loadoutOf(on.players[0]!, on.config)).toEqual({ primary: 'push', secondary: 'kick' });
    expect(loadoutOf(on.players[1]!, on.config)).toEqual({ primary: 'daze', secondary: 'bottle' });
  });
});

describe('FC1: forgiveness, retry and the lockout audit', () => {
  const fleeScene = (grace: boolean, k: AttackKind): GameState => {
    const s = sandbox({ players: 2, config: { skills: { stepGrace: { enabled: grace, maxShare: 0.5 } } } });
    s.players[0]!.attacks = { primary: k, secondary: null };
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.facing = 'right';
    for (const p of s.players) p.protectedUntil = 0;
    return s;
  };

  it('a rival who starts stepping away during the startup, and has not visually left, is still hit (the Punch)', () => {
    const s = fleeScene(true, 'push');
    run(s, 1, B);
    run(s, 1, { 1: { move: 'right' } }); // begins the step at once
    const ev = run(s, A.push.startupTicks);
    expect(eventsOf(ev, 'attackResolved').some((r) => r.hit)).toBe(true);
    expect(s.players[1]!.dazedUntil).toBeGreaterThan(s.tick);
  });

  it('without the grace the same step is a whiff (what the grace fixes)', () => {
    const s = fleeScene(false, 'push');
    run(s, 1, B);
    run(s, 1, { 1: { move: 'right' } });
    const ev = run(s, A.push.startupTicks);
    expect(eventsOf(ev, 'attackResolved').some((r) => r.hit)).toBe(false);
  });

  it('a rival already past half the step is not hit: dodging still works', () => {
    const s = fleeScene(true, 'daze'); // the long startup: the rival is far into the step by then
    run(s, 1, B);
    run(s, 1, { 1: { move: 'right' } });
    const ev = run(s, A.daze.startupTicks, { 1: { move: 'right' } });
    expect(eventsOf(ev, 'attackResolved').some((r) => r.hit)).toBe(false);
  });

  it('the Shove is forgiven the same way (a step begun late in its startup), and the grace is what decides it', () => {
    const lateStep = (grace: boolean): boolean => {
      const s = fleeScene(grace, 'shove');
      run(s, 1, B);
      run(s, A.shove.startupTicks - 4); // the rival stands until the last moment, then steps away
      run(s, 1, { 1: { move: 'right' } });
      const ev = run(s, 3);
      return eventsOf(ev, 'attackResolved').some((r) => r.hit);
    };
    expect(lateStep(true)).toBe(true);
    expect(lateStep(false)).toBe(false);
  });

  it('a miss costs only the short whiff recovery of the Punch: rapid retry (already satisfied)', () => {
    expect(A.push.whiffRecoveryTicks).toBeLessThanOrEqual(12);
    expect(A.push.whiffRecoveryTicks).toBeGreaterThanOrEqual(A.push.startupTicks); // not shorter than the telegraph
  });

  it('AUDIT: no attack can chain the same victim: a 30 s unbroken B stream lands at most ceil(30 s / lockout) hits per attack', () => {
    for (const k of ATTACK_KINDS) {
      const s = scene(k, 1);
      for (const p of s.players) p.armour = 99;
      let hits = 0;
      for (let t = 0; t < 1800; t++)
        hits += eventsOf(tick(s, B), 'attackResolved').filter((r) => r.hit).length;
      const limit = Math.ceil(1800 / A[k].targetLockoutTicks) + 1;
      expect(hits, k).toBeLessThanOrEqual(limit);
      expect(hits, k).toBeGreaterThanOrEqual(1);
    }
  });

  it('AUDIT: a victim is never controlled for more than a third of a minute by one attacker (alone, standing still)', () => {
    for (const k of ATTACK_KINDS) {
      const s = scene(k, 1);
      for (const p of s.players) p.armour = 99;
      let control = 0;
      for (let t = 0; t < 3600; t++) {
        tick(s, B);
        if (s.tick < s.players[1]!.dazedUntil) control++;
        else if (s.players[1]!.slow && s.tick < s.players[1]!.slow.until) control += 0.375;
      }
      expect(control / 60, `${k} control seconds in 60 s`).toBeLessThanOrEqual(20);
    }
  });
});

describe('the duel matrices: no attack dominates, every attack beats one and loses to one', () => {
  const names = ATTACK_KINDS;
  /** share of the control the ROW attack inflicted: in a 5 s ENGAGEMENT and over a 60 s SUSTAINED duel. */
  const engagement = new Map<string, number>();
  const sustained = new Map<string, number>();
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i]!;
      const b = names[j]!;
      const short = matchup(a, b, ENGAGEMENT_SECONDS).share;
      const long = matchup(a, b, 60).share;
      engagement.set(`${a}>${b}`, short);
      engagement.set(`${b}>${a}`, 1 - short);
      sustained.set(`${a}>${b}`, long);
      sustained.set(`${b}>${a}`, 1 - long);
    }
  const count = (m: Map<string, number>, a: AttackKind, test: (s: number) => boolean): number =>
    names.filter((b) => b !== a && test(m.get(`${a}>${b}`)!)).length;

  it('no attack is better than another on every axis', () => {
    for (const a of names)
      for (const b of names)
        if (a !== b) expect(dominates(A[a], A[b]), `${a} must not dominate ${b}`).toBe(false);
  });

  it('in a 5 s engagement every attack beats at least one other and loses to at least one', () => {
    for (const a of names) {
      expect(
        count(engagement, a, (s) => s > WIN),
        `${a} beats nobody`,
      ).toBeGreaterThan(0);
      expect(
        count(engagement, a, (s) => s < LOSE),
        `${a} loses to nobody`,
      ).toBeGreaterThan(0);
    }
  });

  it('no attack wins every engagement or every sustained duel, and none loses every engagement', () => {
    for (const a of names) {
      expect(
        count(engagement, a, (s) => s > WIN),
        `${a} engagement wins`,
      ).toBeLessThan(names.length - 1);
      expect(
        count(sustained, a, (s) => s > WIN),
        `${a} sustained wins`,
      ).toBeLessThan(names.length - 1);
      expect(
        count(engagement, a, (s) => s < LOSE),
        `${a} engagement losses`,
      ).toBeLessThan(names.length - 1);
    }
  });

  it('the Shove is the one attack that wins no sustained duel (its value is the map: decision CB2) and the others each win one', () => {
    for (const a of names)
      if (a === 'shove') expect(count(sustained, a, (s) => s > WIN)).toBe(0);
      else
        expect(
          count(sustained, a, (s) => s > WIN),
          `${a} sustained wins`,
        ).toBeGreaterThan(0);
  });
});
