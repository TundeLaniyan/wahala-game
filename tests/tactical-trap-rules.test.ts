/**
 * Tactical Trap pilot, rules (decisions TT4-TT6, TT10): attack commitment (wind-up, attack, recovery), the human's
 * slowing punch (25 % then the 40 % cap, no endless refresh, a resistance window, no stun-lock), the non-lethal punch,
 * and the isolation of the pilot (no other ruleset carries the key; without it nothing changes).
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  ENEMY_KIND_IDS,
  TACTICAL_TRAP_ENEMY_ATTACKS,
  TACTICAL_TRAP_PILOT,
  buildMissionGame,
  buildRaidGame,
  createGame,
  enemyAttackPhase,
  playerStepTicks,
  punchFloor,
  realisedSlow,
  slowExtraStepTicks,
  tacticalTrapLayer,
  tick,
  windupTicks,
} from '../src/sim';
import type { EnemyKind, GameState } from '../src/sim';
import { newField } from './field-helpers';
import { addGenerator, botsFor, stepWithBots, trapScene } from './tactical-trap-helpers';
import { eventsOf, run } from './helpers';

const T = TACTICAL_TRAP_PILOT;

/** Human at (6, 10) beside a still enemy at (7, 10); returns the scene. */
function duel(kind: EnemyKind, hp?: number, pilot = true): GameState {
  const s = trapScene({ human: [6, 10], enemies: [{ kind, at: [7, 10], hp }], pilot });
  s.players[0]!.facing = 'right';
  return s;
}

/** Presses B until the human's punch lands once more (returns the tick of the hit), or throws. */
function punchOnce(s: GameState, max = 200): number {
  for (let i = 0; i < max; i++) {
    const ev = tick(s, { 0: { special: true } });
    if (ev.some((e) => e.type === 'attackResolved' && e.playerId === 0 && e.hit)) return s.tick;
  }
  throw new Error('no hit');
}

describe('TT10 isolation: the pilot key exists only in the Academy scenarios', () => {
  it('no ruleset, mission, raid or Rumble mode carries tacticalTrap, in its config or its state', () => {
    const players = Array.from({ length: 4 }, (_, i) => ({
      name: `p${i}`,
      characterId: 'streetBaller' as const,
      isBot: i > 0,
    }));
    const games = [
      createGame({ seed: 1, players }),
      createGame({ seed: 1, arenaId: 'rumbleOshodi', players, settings: { game: 'survival' } }),
      createGame({ seed: 1, arenaId: 'rumbleOshodi', players, settings: { game: 'deathmatch' } }),
      createGame({ seed: 1, arenaId: 'rumbleOshodi', players, settings: { game: 'team', teamCount: 2 } }),
      createGame(buildMissionGame({ spec: { id: 'oshodi' }, humanCharacter: 'streetBaller', seed: 1 })),
      createGame(
        buildMissionGame({
          spec: { id: 'oshodi', fieldId: 'oshodi.approach' },
          humanCharacter: 'streetBaller',
          seed: 1,
        }),
      ),
      createGame(
        buildRaidGame({ raidId: 'warehouseDispatchDepot', humanCharacter: 'streetBaller', seed: 1 }),
      ),
      newField('oshodi.railEdge'),
    ];
    for (const g of games) {
      expect('tacticalTrap' in g.config).toBe(false);
      expect('tacticalTrap' in g).toBe(false);
    }
    expect('tacticalTrap' in DEFAULT_CONFIG).toBe(false);
  });

  it('the layer is a fresh copy and carries the key plus the enemy recovery tuning', () => {
    const a = tacticalTrapLayer();
    const b = tacticalTrapLayer();
    expect(a.tacticalTrap).toEqual(T);
    expect(a.tacticalTrap).not.toBe(b.tacticalTrap);
    expect(a.enemyAttacks).toEqual(TACTICAL_TRAP_ENEMY_ATTACKS);
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'guard', at: [4, 4] }] });
    expect(s.config.tacticalTrap!.id).toBe(T.id);
    expect(s.config.enemyAttacks.melee.guard!.recoveryRootTicks).toBe(48);
  });

  it('without the key a pilot-less scene is the legacy match: no slow, a second punch kills a guard', () => {
    const s = duel('guard', undefined, false);
    punchOnce(s);
    run(s, 70);
    punchOnce(s);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players[1]!.slow).toBeNull();
    expect('tacticalTrap' in s).toBe(false);
  });
});

describe('TT5 slow stacking: 25 % then the 40 % cap, never endless', () => {
  it('the percentages become integer extra step ticks of the enemy own step', () => {
    expect(slowExtraStepTicks(10, 0.25)).toBe(3);
    expect(slowExtraStepTicks(10, 0.4)).toBe(7);
    expect(realisedSlow(10, 3)).toBeCloseTo(0.231, 3);
    expect(realisedSlow(10, 7)).toBeCloseTo(0.412, 3);
    // a thrower (13 ticks a tile) keeps the same shares
    expect(slowExtraStepTicks(13, 0.25)).toBe(4);
    expect(slowExtraStepTicks(13, 0.4)).toBe(9);
    expect(realisedSlow(13, 4)).toBeCloseTo(0.235, 3);
    expect(realisedSlow(13, 9)).toBeCloseTo(0.409, 3);
  });

  it('the first landed punch slows 25 % for 90 ticks; the second raises it to 40 % and keeps it 90 ticks; the third changes nothing', () => {
    const s = duel('heavy', 9); // a heavy survives every punch and is steadfast
    const base = playerStepTicks(s, s.players[1]!);
    const t1 = punchOnce(s);
    const e = s.players[1]!;
    expect(e.slow).toEqual({
      until: t1 + T.slow.durationTicks,
      extraStepTicks: slowExtraStepTicks(base, 0.25),
    });
    expect(playerStepTicks(s, e)).toBe(base + slowExtraStepTicks(base, 0.25));
    const t2 = punchOnce(s);
    expect(t2 - t1).toBeLessThan(T.slow.durationTicks); // inside the running slow
    expect(e.slow).toEqual({
      until: Math.min(t1 + T.slow.maxTotalTicks, t2 + T.slow.durationTicks),
      extraStepTicks: slowExtraStepTicks(base, 0.4),
    });
    expect(playerStepTicks(s, e)).toBe(base + slowExtraStepTicks(base, 0.4));
    const capped = { ...e.slow! };
    punchOnce(s);
    if (s.tick < capped.until) expect(e.slow).toEqual(capped); // the cap: a third hit is nothing
  });

  it('the chain never outlives maxTotalTicks from its first hit; the enemy then resists for resistTicks', () => {
    const s = duel('heavy', 30);
    const first = punchOnce(s);
    let last = { until: 0 };
    for (let i = 0; i < 6 && s.tick < first + 140; i++) {
      punchOnce(s);
      last = { until: s.players[1]!.slow?.until ?? 0 };
    }
    expect(last.until).toBeLessThanOrEqual(first + T.slow.maxTotalTicks);
    const end = s.players[1]!.slow!.until;
    // punches after the slow while it resists: no new slow
    let resisted = 0;
    for (let i = 0; i < 40 && s.tick < end + T.slow.resistTicks - 70; i++) {
      if (s.tick < end) {
        run(s, end - s.tick);
        continue;
      }
      const at = punchOnce(s);
      if (at < end + T.slow.resistTicks) {
        expect(s.players[1]!.slow!.until, `a hit at ${at - end} after the slow ended`).toBeLessThanOrEqual(
          end,
        );
        resisted++;
      }
    }
    expect(resisted).toBeGreaterThan(0);
    // and once the window has passed a hit slows again, from the start of a new chain
    run(s, Math.max(0, end + T.slow.resistTicks - s.tick));
    punchOnce(s);
    expect(s.players[1]!.slow!.extraStepTicks).toBe(
      slowExtraStepTicks(playerStepTicks(s, s.players[1]!) - s.players[1]!.slow!.extraStepTicks, 0.25),
    );
    expect(s.tacticalTrap!.slows[1]!.stacks).toBe(1);
  });

  it('no permanent stun-lock: an enemy under constant punching is never held more than a daze at a time, and walks free between chains', () => {
    const s = duel('heavy', 60);
    let dazedRun = 0;
    let longestDaze = 0;
    let free = 0; // ticks acting at full speed
    for (let i = 0; i < 1200; i++) {
      tick(s, { 0: { special: true } });
      const e = s.players[1]!;
      if (s.tick < e.dazedUntil) {
        dazedRun++;
        longestDaze = Math.max(longestDaze, dazedRun);
      } else dazedRun = 0;
      if (s.tick >= e.dazedUntil && !(e.slow && s.tick < e.slow.until)) free++;
    }
    expect(longestDaze).toBeLessThanOrEqual(DEFAULT_CONFIG.skills.attacks.push.dazeTicks + 1);
    expect(free).toBeGreaterThan(300); // a quarter of 20 s at least: the slow chain ends and the enemy resists
  });
});

describe('TT6 a punch cannot finish an enemy: only a generator blast does', () => {
  it('a guard (2) is taken to 1 and stays there however often it is punched; an agbero (1) is never hurt by a punch', () => {
    const s = duel('guard');
    for (let i = 0; i < 4; i++) {
      punchOnce(s);
      run(s, 70);
    }
    expect(s.players[1]!.alive).toBe(true);
    expect(s.players[1]!.vitals!.hp).toBe(1);
    const a = duel('agbero');
    punchOnce(a);
    expect(a.players[1]!.alive).toBe(true);
    expect(a.players[1]!.vitals!.hp).toBe(1);
  });

  it('the same wounded enemy dies to the next generator blast', () => {
    const s = duel('guard');
    punchOnce(s);
    run(s, 70);
    punchOnce(s);
    s.players[0]!.x = s.players[0]!.stepFromX = 2;
    addGenerator(s, { ownerId: 0, x: 7, y: 10, timer: 5, range: 2 });
    const ev = run(s, 12);
    expect(eventsOf(ev, 'playerEliminated').map((e) => [e.playerId, e.creditId])).toEqual([[1, 0]]);
  });

  it('a lieutenant and a boss can be punched only down to half their health; the floor is data', () => {
    const lt = duel('lieutenant', 8);
    expect(punchFloor(lt, lt.players[1]!)).toBe(4);
    for (let i = 0; i < 12; i++) {
      punchOnce(lt);
      run(lt, 70);
    }
    expect(lt.players[1]!.vitals!.hp).toBe(4);
    const boss = duel('boss', 14);
    expect(punchFloor(boss, boss.players[1]!)).toBe(7);
    for (const k of ENEMY_KIND_IDS) expect(T.punchFloorShare[k]).toBeGreaterThanOrEqual(0);
  });
});

describe('TT4 attack commitment: wind-up, attack, recovery', () => {
  it('every ordinary kind recovers 0.8 s (48 ticks); the cooldown leaves a response gap beyond wind-up + recovery', () => {
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'guard', at: [4, 4] }] });
    for (const k of ['agbero', 'guard', 'thrower', 'heavy'] as const)
      expect(s.config.enemyAttacks.melee[k]!.recoveryRootTicks, k).toBe(48);
    for (const k of ENEMY_KIND_IDS) {
      const m = s.config.enemyAttacks.melee[k];
      if (!m) continue;
      expect(m.cooldownTicks, k).toBeGreaterThanOrEqual(
        windupTicks(s.config, k) + m.recoveryRootTicks + T.attack.responseGapTicks,
      );
    }
    for (const k of ['thrower', 'heavy'] as const)
      expect(s.config.enemyAttacks.throwRecoveryTicks[k]).toBeGreaterThanOrEqual(40);
  });

  it('a punch goes idle -> windup -> attack -> recovery -> idle, and the enemy cannot step before the recovery ends', () => {
    const s = trapScene({ human: [9, 10], enemies: [{ kind: 'guard', at: [4, 10] }] });
    const e = s.players[1]!;
    e.facing = 'right';
    s.players[0]!.x = s.players[0]!.stepFromX = 5; // adjacent
    const phases: string[] = [];
    let resolved = -1;
    let until = 0;
    const events = tick(s, { 1: { special: true } });
    expect(eventsOf(events, 'attackStarted')).toHaveLength(1);
    s.players[0]!.x = s.players[0]!.stepFromX = 9; // it will whiff
    for (let i = 0; i < 160; i++) {
      const ph = enemyAttackPhase(s, e);
      if (phases[phases.length - 1] !== ph) phases.push(ph);
      if (resolved < 0 && e.attack === null) {
        resolved = s.tick;
        until = e.rootedUntil;
      }
      // from the resolve to the end of the recovery the move is refused
      tick(s, resolved >= 0 ? { 1: { move: 'left' } } : {});
      if (resolved >= 0 && s.tick < until - 1) expect(e.x).toBe(4);
    }
    expect(until - resolved).toBeGreaterThanOrEqual(47); // 0.8 s
    expect(until - resolved).toBeLessThanOrEqual(49);
    expect(phases).toEqual(['windup', 'attack', 'recovery', 'idle']);
    expect(e.x).toBeLessThan(4); // free again afterwards
  });

  it('an enemy bot never chains: between two swings of one enemy there is the whole recovery plus the response gap', () => {
    const s = trapScene({ human: [5, 10], enemies: [{ kind: 'agbero', at: [6, 10], hp: 99 }], humanHp: 99 });
    const bots = botsFor(s);
    const starts: number[] = [];
    const resolves: number[] = [];
    for (let i = 0; i < 1500; i++) {
      for (const ev of stepWithBots(s, bots)) {
        if (ev.type === 'attackStarted' && ev.playerId === 1) starts.push(s.tick);
        if (ev.type === 'attackResolved' && ev.playerId === 1) resolves.push(s.tick);
      }
    }
    expect(starts.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(
        s.config.enemyAttacks.melee.agbero!.cooldownTicks,
      );
      expect(starts[i]! - resolves[i - 1]!).toBeGreaterThanOrEqual(48 + T.attack.responseGapTicks);
    }
  });

  it('a thrower is planted for its cue plus the 0.8 s recovery, and a dazing hit during the cue cancels the throw', () => {
    const s = trapScene({ human: [9, 10], enemies: [{ kind: 'thrower', at: [3, 10] }] });
    s.players[1]!.facing = 'right';
    const ev = tick(s, { 1: { special: true } });
    const [launch] = eventsOf(ev, 'projectileLaunched');
    expect(launch).toBeDefined();
    expect(s.players[1]!.rootedUntil).toBe(launch!.launchTick + launch!.warnTicks + 48);
    expect(enemyAttackPhase(s, s.players[1]!)).toBe('windup');
    // a stagger during the cue cuts the throw short (an existing rule the pilot relies on)
    s.players[1]!.dazedUntil = s.tick + 20;
    const after = run(s, 3);
    expect(s.projectiles ?? []).toHaveLength(0);
    expect(eventsOf(after, 'projectileHit').length).toBeGreaterThan(0);
  });
});
