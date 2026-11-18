/**
 * Campaign tactics COMBAT (decisions SA7-SA8, docs/CAMPAIGN_SECTOR_AI.md): readable enemy commitment (wind-up, attack,
 * recovery, cooldown, group limits, the `enemyCue` telegraph) and the melee-vs-generator balance without a ritual: a
 * landed hit staggers, knocks back one free tile and slows once (never stacked, then resisted); ordinary enemies can be
 * punched out slowly, one blast defeats any of them; armoured ones only finish to a blast.
 */
import { describe, expect, it } from 'vitest';
import { EnemyBot } from '../src/ai/enemyBot';
import {
  campaignTacticsFor,
  enemyAttackPhase,
  enemyHealthView,
  observe,
  slowExtraStepTicks,
  tick,
} from '../src/sim';
import type { CampaignLevel, EnemyVariantId, GameState, Intent, Intents, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { addGenerator, eventsOf } from './helpers';
import { tacticsScene } from '../scripts/lib/sectorDrill';

function duel(
  variant: EnemyVariantId,
  o: { level?: CampaignLevel; human?: [number, number]; enemy?: [number, number]; character?: string } = {},
): GameState {
  const { s } = tacticsScene({
    level: o.level ?? 'normal',
    seed: 2,
    human: o.human ?? [6, 6],
    enemies: [{ variant, at: o.enemy ?? [7, 6] }],
  });
  delete s.territory; // these checks drive the enemy by hand
  s.players[0]!.facing = 'right';
  s.players[1]!.facing = 'left';
  if (o.character) s.players[0]!.characterId = o.character as never;
  return s;
}

const run = (
  s: GameState,
  n: number,
  intents: (t: number) => Partial<Record<number, Intent>> = () => ({}),
): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let t = 0; t < n; t++) out.push(...tick(s, intents(t) as Intents));
  return out;
};

describe('readable commitment in the sim (SA7)', () => {
  for (const [level, windup, recovery] of [
    ['easy', 60, 48],
    ['normal', 48, 42],
    ['hard', 38, 36],
  ] as const) {
    it(`${level}: an ordinary punch winds up ${windup} ticks, telegraphs its tile, then plants it ${recovery} ticks`, () => {
      const s = duel('marketEnforcer', { level });
      const start = s.tick + 1;
      const ev = run(s, 1, () => ({ 1: { special: true } }));
      const started = eventsOf(ev, 'attackStarted')[0]!;
      expect(started.resolveTick - start).toBe(windup);
      const cue = eventsOf(ev, 'enemyCue').find((e) => e.cue === 'windup')!;
      expect(cue).toMatchObject({ playerId: 1, dir: 'left', x: 6, y: 6, untilTick: started.resolveTick });
      expect(enemyAttackPhase(s, s.players[1]!)).toBe('windup');
      // the human stays: hit; the enemy is planted for its recovery and says so
      const after = run(s, windup + 1);
      const rec = eventsOf(after, 'enemyCue').find((e) => e.cue === 'recovery')!;
      expect(rec.untilTick - rec.fromTick).toBe(recovery);
      expect(eventsOf(after, 'campaignHit').some((e) => e.victimId === 0 && e.source === 'punch')).toBe(true);
      run(s, 8);
      expect(enemyAttackPhase(s, s.players[1]!)).toBe('recovery');
    });
  }

  it('a whiff is visible and punishable: the swing resolves at the air, then the same recovery', () => {
    const s = duel('agbero');
    const ev = run(s, 50, (t) =>
      t === 0 ? { 1: { special: true } } : t === 1 ? { 0: { move: 'left' } } : {},
    );
    expect(eventsOf(ev, 'attackResolved').find((e) => e.playerId === 1)).toMatchObject({ hit: false });
    expect(eventsOf(ev, 'enemyCue').some((e) => e.cue === 'recovery')).toBe(true);
    expect(s.tick < s.players[1]!.rootedUntil).toBe(true);
  });

  it('an overcommitting area boy stays planted longer than a plain agbero', () => {
    const planted = (variant: EnemyVariantId) => {
      const s = duel(variant);
      const ev = run(s, 60, (t) => (t === 0 ? { 1: { special: true } } : {}));
      const rec = eventsOf(ev, 'enemyCue').find((e) => e.cue === 'recovery')!;
      return rec.untilTick - rec.fromTick;
    };
    expect(planted('areaBoy') - planted('agbero')).toBe(12);
  });

  it('a cooldown always leaves a response window: no enemy chains swings', () => {
    const s = duel('marketEnforcer');
    const bot = new EnemyBot({ difficulty: 'standard', seed: 3, playerId: 1 });
    const starts: number[] = [];
    for (let t = 0; t < 60 * 20; t++) {
      const ev = tick(s, { 1: bot.decide(observe(s, 1)) });
      for (const e of eventsOf(ev, 'attackStarted')) if (e.playerId === 1) starts.push(s.tick);
    }
    const cfg = s.config;
    const m = cfg.enemyAttacks.melee.guard!;
    const windup = cfg.skills.attacks[m.attack].startupTicks + m.extraStartupTicks;
    expect(starts.length).toBeGreaterThan(3);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i]! - starts[i - 1]!).toBeGreaterThan(windup + m.recoveryRootTicks + 36);
  });

  it('group limits: Easy lets one wind-up at a time; Normal two, staggered', () => {
    const pair = (level: CampaignLevel) => {
      const { s } = tacticsScene({
        level,
        seed: 2,
        human: [6, 6],
        enemies: [
          { variant: 'marketEnforcer', at: [7, 6] },
          { variant: 'marketEnforcer', at: [5, 6] },
        ],
      });
      delete s.territory;
      const ev = run(s, 30, () => ({ 1: { special: true }, 2: { special: true } }));
      return eventsOf(ev, 'attackStarted').map((e) => e.playerId);
    };
    expect(pair('easy')).toEqual([1]);
    expect(pair('normal')).toEqual([1]); // the second waits for the group gap (48 ticks)
    const { s } = tacticsScene({
      level: 'normal',
      seed: 2,
      human: [6, 6],
      enemies: [
        { variant: 'marketEnforcer', at: [7, 6] },
        { variant: 'marketEnforcer', at: [5, 6] },
      ],
    });
    delete s.territory;
    const ev = run(s, 50, () => ({ 1: { special: true }, 2: { special: true } }));
    const ticks = eventsOf(ev, 'enemyCue')
      .filter((e) => e.cue === 'windup')
      .map((e) => e.fromTick);
    expect(ticks).toHaveLength(2);
    expect(ticks[1]! - ticks[0]!).toBe(s.config.enemyAttacks.groupPunchGapTicks);
  });

  it('a thrower telegraphs its cue and its recovery, and never throws while it is on the move', () => {
    const { s, bots } = tacticsScene({
      level: 'normal',
      seed: 4,
      human: [10, 6],
      enemies: [{ variant: 'bottleThrower', at: [4, 6] }],
    });
    delete s.territory;
    const ev: SimEvent[] = [];
    let movedAt = -1e9;
    for (let t = 0; t < 600; t++) {
      const before = { x: s.players[1]!.x, y: s.players[1]!.y, step: s.players[1]!.stepRemaining };
      const out = tick(s, { 1: bots[1]!.decide(observe(s, 1)) });
      ev.push(...out);
      const p = s.players[1]!;
      if (p.x !== before.x || p.y !== before.y || before.step > 0) movedAt = s.tick;
      if (eventsOf(out, 'projectileLaunched').length > 0)
        expect(s.tick - movedAt, 'settled before throwing').toBeGreaterThanOrEqual(10);
    }
    const launches = eventsOf(ev, 'projectileLaunched');
    expect(launches.length).toBeGreaterThan(0);
    const cues = eventsOf(ev, 'enemyCue');
    expect(cues.filter((e) => e.cue === 'windup')).toHaveLength(launches.length);
    expect(cues.filter((e) => e.cue === 'recovery')).toHaveLength(launches.length);
  });
});

describe('the human hit: stagger, knockback, one slow - no ritual, no stun-lock (SA8)', () => {
  it('a jab cuts a wind-up short, staggers, knocks back one free tile and slows 25 % once', () => {
    const s = duel('marketEnforcer');
    const base = 10;
    const ev = run(s, 8, (t) =>
      t === 0 ? { 1: { special: true } } : t === 1 ? { 0: { special: true } } : {},
    );
    const t = campaignTacticsFor('normal').punch;
    expect(eventsOf(ev, 'attackInterrupted')).toHaveLength(1);
    expect(eventsOf(ev, 'enemyCue').some((e) => e.cue === 'stagger')).toBe(true);
    const e = s.players[1]!;
    expect(e.x).toBe(8); // knocked back from 7 to 8
    expect(e.attack).toBeNull();
    expect(e.slow?.extraStepTicks).toBe(slowExtraStepTicks(base, t.slowShare));
    expect(e.vitals!.hp).toBe(2); // a guard-based enemy: 3 segments, one taken
  });

  it('the slow never stacks or refreshes, and is resisted after it ends', () => {
    const s = duel('marketEnforcer', { enemy: [7, 6] });
    const t = campaignTacticsFor('normal').punch;
    run(s, 8, (i) => (i === 0 ? { 0: { special: true } } : {}));
    const first = { ...s.players[1]!.slow! };
    // walk up again and hit it after the lockout: the slow is unchanged
    s.players[1]!.x = s.players[1]!.stepFromX = 7;
    run(s, t.lockoutTicks + 2);
    run(s, 8, (i) => (i === 0 ? { 0: { special: true } } : {}));
    expect(s.players[1]!.slow).toEqual(first);
    // after it ends it is resisted for `slowResistTicks`
    while (s.tick < first.until + 5) run(s, 1);
    s.players[1]!.x = s.players[1]!.stepFromX = 7;
    run(s, 8, (i) => (i === 0 ? { 0: { special: true } } : {}));
    expect(s.players[1]!.slow!.until).toBe(first.until);
    expect(s.players[1]!.slowImmuneUntil).toBe(first.until + t.slowResistTicks);
  });

  it('no knockback into concrete, and a steadfast heavy is neither staggered nor moved', () => {
    const s = duel('agbero', { human: [6, 4], enemy: [6, 5] }); // (6,6) open: pushed down one tile
    run(s, 8, (i) => (i === 0 ? { 0: { special: true } } : {}));
    expect(s.players[1]!.y).toBe(6);
    const w = duel('agbero', { human: [5, 6], enemy: [6, 6] });
    w.tiles[6 * w.width + 7] = Tile.Hard;
    run(w, 8, (i) => (i === 0 ? { 0: { special: true } } : {}));
    expect(w.players[1]!.x).toBe(6); // a wall behind it: not moved, still staggered
    expect(w.tick < w.players[1]!.dazedUntil).toBe(true);
    const h = duel('heavyEnforcer');
    const ev = run(h, 8, (t) =>
      t === 0 ? { 1: { special: true } } : t === 1 ? { 0: { special: true } } : {},
    );
    expect(eventsOf(ev, 'attackInterrupted')).toHaveLength(0);
    expect(h.players[1]!.x).toBe(7);
    expect(h.players[1]!.attack).not.toBeNull(); // it keeps winding up: step out of it or punish its recovery
  });

  it('no stun-lock: mashing B for 20 s leaves the enemy free most of the time and never reeling twice in a row', () => {
    const s = duel('marketEnforcer');
    s.players[1]!.vitals!.hp = s.players[1]!.vitals!.maxHp = 999;
    const t = campaignTacticsFor('normal').punch;
    let dazed = 0;
    let longest = 0;
    let run1 = 0;
    for (let i = 0; i < 1200; i++) {
      const e = s.players[1]!;
      e.x = e.stepFromX = 7;
      e.y = e.stepFromY = 6;
      e.stepRemaining = 0;
      tick(s, { 0: { special: true } });
      if (s.tick < e.dazedUntil) {
        dazed++;
        run1++;
        longest = Math.max(longest, run1);
      } else run1 = 0;
    }
    expect(longest).toBeLessThanOrEqual(t.staggerTicks);
    expect(dazed / 1200).toBeLessThan(0.3);
  });

  it("every fighter can follow up: the human's recovery after a hit on an enemy is capped", () => {
    for (const character of ['streetBaller', 'lekkiBoy', 'campusQueen']) {
      const s = duel('marketEnforcer', { character });
      run(s, 30, (i) => (i === 0 ? { 0: { special: true } } : {}));
      expect(s.players[0]!.skillReadyTick - s.tick, character).toBeLessThanOrEqual(30);
    }
  });
});

describe('punch versus blast (SA8): only a blast finishes the armoured', () => {
  /** Lands punches on seat 1 (held in place) until it is out or `max` punches were tried; returns the landings. */
  function punchOut(s: GameState, max = 12): number {
    let landed = 0;
    for (let i = 0; i < max * 120 && s.players[1]!.alive; i++) {
      const e = s.players[1]!;
      e.x = e.stepFromX = 7;
      e.y = e.stepFromY = 6;
      e.stepRemaining = 0;
      const ev = tick(s, { 0: { special: true } });
      landed += eventsOf(ev, 'campaignHit').filter((h) => h.victimId === 1 && h.damage > 0).length;
      if (landed >= max) break;
    }
    return landed;
  }

  it('an ordinary enemy is punched out, slowly (the per-target lockout), whatever the fighter', () => {
    for (const character of ['streetBaller', 'lekkiBoy', 'campusQueen']) {
      const s = duel('marketEnforcer', { character });
      const start = s.tick;
      expect(punchOut(s), character).toBe(3);
      expect(s.players[1]!.alive).toBe(false);
      expect(s.tick - start).toBeGreaterThanOrEqual(2 * campaignTacticsFor('normal').punch.lockoutTicks);
    }
  });

  it('one blast defeats any ordinary enemy at full health', () => {
    for (const variant of ['agbero', 'marketEnforcer', 'bottleThrower', 'ringSecurity'] as const) {
      const s = duel(variant, { human: [2, 2] });
      addGenerator(s, { x: 7, y: 6, ownerId: 0, timer: 1 });
      run(s, 3);
      expect(s.players[1]!.alive, variant).toBe(false);
    }
  });

  it('a heavy: punches stop at its last segment, one blast takes 3 of its 4, a second finishes it', () => {
    const s = duel('heavyEnforcer');
    expect(punchOut(s, 3)).toBe(3);
    run(s, 200, () => ({ 0: { special: true } }));
    expect(s.players[1]!.vitals!.hp).toBe(1);
    expect(s.players[1]!.alive).toBe(true);
    expect(enemyHealthView(s, 1)).toMatchObject({ blastOnly: true, punchFloor: 1 });
    const b = duel('heavyEnforcer', { human: [2, 2] });
    addGenerator(b, { x: 7, y: 6, ownerId: 0, timer: 1 });
    run(b, 12); // past the short enemy frames
    expect(b.players[1]!.vitals!.hp).toBe(1);
    addGenerator(b, { x: 7, y: 6, ownerId: 0, timer: 1 });
    run(b, 20);
    expect(b.players[1]!.alive).toBe(false);
  });

  it('the HUD flag: ordinary enemies can be punched out, armoured ones show blast-only', () => {
    expect(enemyHealthView(duel('agbero'), 1)).toMatchObject({ blastOnly: false, punchFloor: 0 });
    expect(enemyHealthView(duel('lieutenant'), 1)).toMatchObject({ blastOnly: true, punchFloor: 4 });
  });

  it('a punch then a blast both land (the short enemy frames never swallow the trap)', () => {
    const s = duel('marketEnforcer');
    addGenerator(s, { x: 8, y: 6, ownerId: 0, timer: 6 });
    run(s, 10, (t) => (t === 0 ? { 0: { special: true } } : {}));
    expect(s.players[1]!.alive).toBe(false);
  });

  it('enemies keep off the human tile, and an enemy on it is still in reach both ways', () => {
    const s = duel('marketEnforcer');
    const bot = new EnemyBot({ difficulty: 'casual', seed: 9, playerId: 1 });
    for (let t = 0; t < 600; t++) {
      tick(s, { 1: bot.decide(observe(s, 1)) });
      const h = s.players[0]!;
      const e = s.players[1]!;
      expect(e.x === h.x && e.y === h.y && e.stepRemaining === 0).toBe(false);
    }
    const inside = duel('marketEnforcer', { enemy: [6, 6] });
    const ev = run(inside, 6, (t) => (t === 0 ? { 0: { special: true } } : {}));
    expect(eventsOf(ev, 'campaignHit').some((e) => e.victimId === 1 && e.damage === 1)).toBe(true);
  });
});
