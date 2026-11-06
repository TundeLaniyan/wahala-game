/**
 * Campaign enemy FAIRNESS (decisions EF1-EF8, docs/ENEMY_COMBAT_FAIRNESS.md): enemies read generators like people (late
 * in a brawl, soon when calm), commit to their attacks (a punishable window), never chain-interrupt the human, die to
 * ordinary punches in a reasonable time, a heavy is not out-jabbed, field pursuers give up, and every multiplayer bot
 * plays byte-for-byte as before.
 */
import { describe, expect, it } from 'vitest';
import { EnemyBot, UNHEEDED_FUSE } from '../src/ai/enemyBot';
import { CAMPAIGN_CONFIG, DEFAULT_CONFIG, directiveFor, observe, playerStepTicks, tick } from '../src/sim';
import type { GameState } from '../src/sim';
import { enemyScene } from '../scripts/lib/enemyScene';
import { classicGrid, playGridFight, playRaidFight } from '../scripts/lib/fairHuman';
import { multiplayerDigest } from '../scripts/lib/mpDigest';
import { addGenerator, eventsOf, run } from './helpers';
import { newField } from './field-helpers';
import { advance, put } from './mission-helpers';

const CFG = DEFAULT_CONFIG.enemyAttacks;
const AW = CFG.awareness;

/** A classic pillar grid with the human and one enemy of `kind` (both on open floor). */
function gridScene(
  kind: 'guard' | 'heavy' | 'thrower' | 'agbero',
  human: [number, number],
  enemy: [number, number],
): GameState {
  const s = enemyScene({
    human: { x: human[0], y: human[1], hp: 9 },
    enemies: [{ kind, x: enemy[0], y: enemy[1], hp: kind === 'heavy' ? 3 : 2 }],
  });
  classicGrid(s);
  return s;
}

describe('EF1 perception: a fresh generator is an obstacle until the enemy takes it seriously', () => {
  it('in a brawl (a rival within focusTiles) only from alertTicks before it blows', () => {
    const s = gridScene('guard', [5, 1], [3, 1]);
    const g = addGenerator(s, { ownerId: 0, x: 3, y: 3 }); // its cross covers the guard
    const bot = new EnemyBot({ difficulty: 'casual', seed: 1, playerId: 1 });
    expect(bot.perceive(observe(s, 1)).generators[0]!.timer).toBe(UNHEEDED_FUSE);
    g.timer = AW.guard.alertTicks + 1;
    expect(bot.perceive(observe(s, 1)).generators[0]!.timer).toBe(UNHEEDED_FUSE);
    g.timer = AW.guard.alertTicks - AW.guard.slipTicks; // past even a slip
    expect(bot.perceive(observe(s, 1)).generators[0]!.timer).toBe(g.timer);
    g.timer = 170; // once heeded, always heeded
    expect(bot.perceive(observe(s, 1)).generators[0]!.timer).toBe(170);
  });

  it('calm (no rival near) after reactTicks: the reaction delay exists, and it is short', () => {
    const s = gridScene('guard', [13, 9], [3, 1]);
    addGenerator(s, { ownerId: 0, x: 3, y: 3 });
    const bot = new EnemyBot({ difficulty: 'casual', seed: 1, playerId: 1 });
    expect(bot.perceive(observe(s, 1)).generators[0]!.timer).toBe(UNHEEDED_FUSE);
    s.tick += AW.guard.reactTicks - 1;
    expect(bot.perceive(observe(s, 1)).generators[0]!.timer).toBe(UNHEEDED_FUSE);
    s.tick += 1;
    expect(bot.perceive(observe(s, 1)).generators[0]!.timer).toBeLessThan(UNHEEDED_FUSE);
    expect(AW.guard.reactTicks).toBeLessThan(AW.guard.alertTicks);
  });

  it('a calm enemy still walks out of a generator it has had time to see, and survives it', () => {
    const s = gridScene('guard', [13, 9], [3, 1]);
    addGenerator(s, { ownerId: 0, x: 3, y: 3 });
    const bot = new EnemyBot({ difficulty: 'casual', seed: 1, playerId: 1 });
    const ev = run(s, DEFAULT_CONFIG.generator.fuseTicks + 40, () => ({ 1: bot.decide(observe(s, 1)) }));
    expect(eventsOf(ev, 'campaignHit').filter((e) => e.victimId === 1)).toHaveLength(0);
    expect(s.players[1]!.alive).toBe(true);
  });

  it('never perceives anything for a multiplayer seat (no enemyKind): the observation is passed through', () => {
    const s = gridScene('guard', [5, 1], [3, 1]);
    delete s.players[1]!.enemyKind;
    addGenerator(s, { ownerId: 0, x: 3, y: 3 });
    const bot = new EnemyBot({ difficulty: 'casual', seed: 1, playerId: 1 });
    const obs = observe(s, 1);
    expect(bot.perceive(obs)).toBe(obs);
  });
});

describe('EF2 commitment: the punishable window', () => {
  it('an enemy punch that resolves (here a miss) plants the puncher for recoveryRootTicks', () => {
    const s = gridScene('guard', [4, 1], [3, 1]);
    s.players[1]!.facing = 'right';
    const [start] = eventsOf(tick(s, { 1: { special: true } }), 'attackStarted');
    expect(start).toBeDefined();
    advance(s, 2);
    s.players[0]!.x = s.players[0]!.stepFromX = 7; // out of reach: a whiff
    run(s, start!.resolveTick - s.tick);
    expect(s.players[1]!.attack).toBeNull();
    expect(s.players[1]!.rootedUntil).toBe(start!.resolveTick + CFG.melee.guard!.recoveryRootTicks);
    // it cannot step during the window, and can right after it
    run(s, CFG.melee.guard!.recoveryRootTicks - 2, { 1: { move: 'left' } });
    expect(s.players[1]!.x).toBe(3);
  });

  it('a throw plants the thrower for its cue plus throwRecoveryTicks', () => {
    const s = gridScene('thrower', [7, 1], [3, 1]);
    s.players[1]!.facing = 'right';
    const ev = tick(s, { 1: { special: true } });
    const [launch] = eventsOf(ev, 'projectileLaunched');
    expect(launch).toBeDefined();
    expect(s.players[1]!.rootedUntil).toBe(
      launch!.launchTick + launch!.warnTicks + CFG.throwRecoveryTicks.thrower,
    );
    expect(CFG.throwRecoveryTicks.thrower).toBeGreaterThan(0);
  });

  it('never starts a wind-up inside the cross of a generator it takes seriously (never suicidal)', () => {
    const s = gridScene('guard', [4, 1], [3, 1]);
    addGenerator(s, { ownerId: 0, x: 3, y: 3, timer: 10 });
    const bot = new EnemyBot({ difficulty: 'casual', seed: 1, playerId: 1 });
    for (let i = 0; i < 5; i++) {
      expect(bot.decide(observe(s, 1)).special).toBeUndefined();
      tick(s, {});
    }
  });

  it('a heavy is slower to move and to read a generator than a guard', () => {
    const s = enemyScene({
      human: { x: 1, y: 1 },
      enemies: [
        { kind: 'guard', x: 3, y: 1 },
        { kind: 'heavy', x: 5, y: 1 },
      ],
    });
    expect(playerStepTicks(s, s.players[2]!)).toBeGreaterThan(playerStepTicks(s, s.players[1]!));
    expect(AW.heavy.reactTicks).toBeGreaterThan(AW.guard.reactTicks);
    expect(AW.heavy.slipChance).toBeGreaterThan(AW.guard.slipChance);
  });
});

describe('EF5 the human gets an interruption-free window', () => {
  it("a thrown object landing inside a punch's daze + victimFreeTicks is harmless (combined attackers)", () => {
    const s = enemyScene({
      human: { x: 5, y: 1, hp: 9 },
      enemies: [
        { kind: 'guard', x: 4, y: 1 },
        { kind: 'thrower', x: 5, y: 4 },
      ],
    });
    classicGrid(s);
    s.players[1]!.facing = 'right';
    s.players[2]!.facing = 'up';
    const ev = run(s, 1, { 1: { special: true } });
    const resolve = eventsOf(ev, 'attackStarted')[0]!.resolveTick;
    ev.push(...run(s, resolve - s.tick + 1));
    ev.push(...run(s, 1, { 2: { special: true } })); // the throw lands about a second after the punch
    expect(eventsOf(ev, 'projectileLaunched')).toHaveLength(1);
    ev.push(...run(s, 150));
    const hits = eventsOf(ev, 'campaignHit').filter((e) => e.victimId === 0);
    expect(hits.map((h) => [h.source, h.result])).toEqual([['punch', 'damaged']]);
    const [bottle] = eventsOf(ev, 'projectileHit');
    expect(bottle).toMatchObject({ victimId: 0, result: 'invulnerable' });
    expect(s.players[0]!.vitals!.hp).toBe(8);
  });
});

describe('EF3 / EF4 the player against enemies', () => {
  it('two ordinary punches drop a guard within about a second and a half (lockout capped, immunity no wall)', () => {
    const s = gridScene('guard', [3, 1], [4, 1]);
    const me = s.players[0]!;
    me.attacks = { primary: 'push', secondary: null };
    me.facing = 'right';
    s.players[1]!.vitals!.hp = 2;
    let ev = run(s, 8, { 0: { special: true } });
    expect(s.players[1]!.vitals!.hp).toBe(1);
    const hitAt = eventsOf(ev, 'attackResolved').find((e) => e.playerId === 0 && e.hit)!;
    expect(hitAt).toBeDefined();
    const lock = CAMPAIGN_CONFIG.vsEnemy.targetLockoutTicks;
    expect(me.meleeLock[1]! - s.tick).toBeLessThanOrEqual(lock);
    expect(lock).toBeLessThan(DEFAULT_CONFIG.skills.attacks.push.targetLockoutTicks);
    ev = run(s, 90, { 0: { special: true } });
    expect(s.players[1]!.alive).toBe(false);
    expect(eventsOf(ev, 'campaignDefeated')[0]).toMatchObject({ victimId: 1, byId: 0 });
  });

  it('the multiplayer lockout is untouched: the same punch on a seat that is not an enemy locks for the full time', () => {
    const s = gridScene('guard', [3, 1], [4, 1]);
    delete s.players[1]!.enemyKind;
    const me = s.players[0]!;
    me.attacks = { primary: 'push', secondary: null };
    me.facing = 'right';
    const ev = run(s, 8, { 0: { special: true } });
    const hit = eventsOf(ev, 'attackResolved').find((e) => e.playerId === 0 && e.hit);
    expect(hit).toBeDefined();
    const resolvedAt = s.tick - (8 - 1 - DEFAULT_CONFIG.skills.attacks.push.startupTicks);
    expect(me.meleeLock[1]).toBe(resolvedAt + DEFAULT_CONFIG.skills.attacks.push.targetLockoutTicks);
  });

  it('a jab neither dazes nor interrupts a heavy (steadfast); it still takes the segment', () => {
    const s = gridScene('heavy', [3, 1], [4, 1]);
    const me = s.players[0]!;
    me.attacks = { primary: 'push', secondary: null };
    me.facing = 'right';
    s.players[1]!.facing = 'left';
    tick(s, { 1: { special: true } });
    expect(s.players[1]!.attack).not.toBeNull();
    const ev = run(s, 6, { 0: { special: true } });
    expect(eventsOf(ev, 'attackInterrupted')).toHaveLength(0);
    expect(s.players[1]!.attack).not.toBeNull();
    expect(s.players[1]!.dazedUntil).toBeLessThanOrEqual(s.tick);
    expect(s.players[1]!.vitals!.hp).toBe(2);
  });

  it('a guard is still interrupted by a jab (only heavies and bosses are steadfast)', () => {
    const s = gridScene('guard', [3, 1], [4, 1]);
    s.players[0]!.attacks = { primary: 'push', secondary: null };
    s.players[0]!.facing = 'right';
    s.players[1]!.facing = 'left';
    tick(s, { 1: { special: true } });
    const ev = run(s, 6, { 0: { special: true } });
    expect(eventsOf(ev, 'attackInterrupted')).toHaveLength(1);
  });
});

describe('EF6 field pursuers give up a human who got away', () => {
  it('chases within pursuitGiveUpTiles, holds where it stands beyond', () => {
    const s = newField('oshodi.railEdge');
    s.players[1]!.alive = false;
    s.players[2]!.alive = false;
    advance(s, 2);
    const p = s.players[3]!;
    put(s, 0, p.x + 4, p.y);
    expect(directiveFor(s, 3)).toMatchObject({ kind: 'chase' });
    put(s, 0, Math.min(s.width - 2, p.x + CFG.pursuitGiveUpTiles + 1), p.y);
    expect(directiveFor(s, 3)).toMatchObject({ kind: 'guard', x: p.x, y: p.y });
  });
});

describe('EF8 multiplayer is untouched', () => {
  // recorded on a4fe457 (before the enemy fairness work) with scripts/lib/mpDigest.ts
  it('ordinary bots of every level play byte-for-byte as before', () => {
    expect(multiplayerDigest('danfoBusPark', ['standard', 'skilled', 'casual', 'expert'], 7, 3600)).toEqual({
      digest: '99e2881a:9435/46073eec',
      events: 96,
    });
    expect(
      multiplayerDigest(
        'rumbleOjuelegba',
        ['standard', 'skilled', 'casual', 'expert', 'rookie', 'nightmare'],
        11,
        2400,
      ),
    ).toEqual({ digest: '6699ed4:27237/6899a648', events: 856 });
  });
});

describe('the Normal baseline (casual enemy bots) is winnable and fair (scripts/enemy-fairness.ts)', () => {
  it('a scripted human with ordinary intents clears a mixed group on a classic grid with no chained interruption', () => {
    for (const seed of [1, 2]) {
      const r = playGridFight({ enemies: ['agbero', 'guard', 'thrower'], seed, difficulty: 'casual' });
      expect(r.won).toBe(true);
      expect(r.chained).toBe(0);
      expect(r.damageFromSelf).toBe(0);
    }
  });

  it('a heavy is mostly brought down by generators, not out-jabbed', () => {
    let blast = 0;
    for (const seed of [1, 2, 3, 4])
      blast += playGridFight({ enemies: ['heavy'], seed, difficulty: 'casual' }).killsByBlast;
    expect(blast).toBeGreaterThanOrEqual(2);
  });

  it('the Dispatch Depot (classic pillar maze) with active waves is completed in most seeds, never by an unfair chain', () => {
    // A rate, not hand-picked seeds: on the maze depot (decision CG1) the simple scripted player completes 11 of seeds 1-12.
    // The miss (seed 2) is a timeout, not a defeat: the lieutenant hovers round a pillar corner out of every blast cross while
    // the scripted player keeps bombing from the same corridor mouth (docs/CLASSIC_GRID_COMBAT_INTEGRATION.md, open item).
    const runs = [1, 2, 3, 4, 5, 6].map((seed) => playRaidFight({ seed, difficulty: 'casual' }));
    const completed = runs.filter((r) => r.outcome === 'completed').length;
    expect(completed, runs.map((r) => r.outcome).join(' ')).toBeGreaterThanOrEqual(5);
    for (const r of runs) {
      expect(r.chained).toBe(0); // never a repeated-interruption chain
      expect(r.deaths).toBeLessThanOrEqual(1); // the human is never overwhelmed
    }
  });
});
