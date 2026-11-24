/**
 * THE REAR APPROACH IN THE REAL RAID (task PI-1C, decision PI7, docs/CLASSIC_RAID_REAR.md).
 *
 * Founder (physical phone, Normal): a close rear approach to lay a generator is detected "even when the guard is looking
 * away". Measured in the real raids (scripts/raid-dwell.ts): on Easy and Normal 107 of 110 / 123 of 130 detections of a
 * player standing behind an unseen guard were INSTANT arm's-length notices after the guard's own about-face (the end of
 * its run, a corner): nothing to see, nothing to react to. Decision PI7: a calm guard whose own TURN reveals a player who
 * was out of its view does not feel him at once; he is noticed by sight after `revealGraceTicks` (Easy 66, Normal 54, Hard
 * 0 = unchanged).
 *
 *   1  the rule on one guard (sim level): the about-face reveals him; already in view / walking into view get no grace
 *   2  a real enemy bot does not swing at him during the grace either
 *   3  the real depot (all of wave 1 on its rounds): no unwarned detection behind a guard on Easy / Normal; Hard unchanged
 */
import { describe, expect, it } from 'vitest';
import { buildRaidGame, createGame, observe, tick } from '../src/sim';
import type { CampaignLevel, Dir, GameState, Intents } from '../src/sim';
import { createBot } from '../src/ai';
import { updateTerritory } from '../src/sim/systems/territory';
import { dwellProbe } from '../scripts/lib/rearStalk';
import { knockOut, letWavesAppear, put } from './raid-helpers';

/** The depot at `level` with only guard A (seat 1) on the board, holding its post at (9,3); the human parked away. */
function lone(level: CampaignLevel, grace?: number): GameState {
  const s = createGame(
    buildRaidGame({ raidId: 'warehouseDispatchDepot', humanCharacter: 'streetBaller', seed: 3, level }),
  );
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  letWavesAppear(s);
  knockOut(s, ...s.players.filter((p) => p.id > 1 && p.alive).map((p) => p.id));
  put(s, 0, 1, 11);
  if (grace !== undefined) s.config.campaignTactics!.classicRaid!.revealGraceTicks = grace;
  put(s, 1, 9, 3);
  const m = s.territory!.minds[1]!;
  m.state = 'watch';
  m.notice = 0;
  return s;
}

interface Turn {
  /** The human's tile while the guard looks `before`. */
  human: [number, number];
  before: Dir;
  after: Dir;
  /** Ticks the guard looks `before` first (the human stands there the whole time). */
  settle?: number;
  /** After this many ticks of the new facing the human steps out of every view (teleport = the tick his step starts). */
  leaveAt?: number;
}

/** Ticks after the turn until guard A alerts (1 = on the turn tick), or null within 200 ticks. */
function alertAfterTurn(s: GameState, o: Turn): number | null {
  const g = s.players[1]!;
  const m = s.territory!.minds[1]!;
  put(s, 0, o.human[0], o.human[1]);
  for (let i = 0; i < (o.settle ?? 12); i++) {
    s.tick++;
    g.facing = o.before;
    updateTerritory(s, []);
    if ((m.state as string) === 'alert') return -1; // caught before the turn (a bad scenario)
  }
  for (let i = 1; i <= 200; i++) {
    s.tick++;
    g.facing = o.after;
    if (o.leaveAt !== undefined && i === o.leaveAt) put(s, 0, 1, 11);
    updateTerritory(s, []);
    if ((m.state as string) === 'alert') return i;
  }
  return null;
}

const GRACE = { easy: 66, normal: 54, hard: 0 } as const;

describe("PI7: the guard's own about-face does not catch a player who was behind it at once", () => {
  it('the shipped numbers: Easy 66, Normal 54 ticks, Hard none', () => {
    for (const level of ['easy', 'normal', 'hard'] as CampaignLevel[])
      expect(lone(level).config.campaignTactics!.classicRaid!.revealGraceTicks, level).toBe(GRACE[level]);
  });

  it('production before PI7 (grace 0): the about-face notices him on the very tick, at every level', () => {
    for (const level of ['easy', 'normal', 'hard'] as CampaignLevel[]) {
      const at = alertAfterTurn(lone(level, 0), { human: [9, 4], before: 'up', after: 'down' });
      expect(at, level).toBe(1);
    }
  });

  it("Easy / Normal: he is behind it (unseen), it turns to face him at arm's length: noticed after the grace, not at once", () => {
    for (const level of ['easy', 'normal'] as CampaignLevel[]) {
      const at = alertAfterTurn(lone(level), { human: [9, 4], before: 'up', after: 'down' });
      expect(at, level).toBe(GRACE[level as 'easy' | 'normal']); // the sight reaction is the grace: 54 / 66 ticks
    }
  });

  it('Hard keeps the instant notice (the stricter level is unchanged)', () => {
    expect(alertAfterTurn(lone('hard'), { human: [9, 4], before: 'up', after: 'down' })).toBe(1);
  });

  it('he can step out of its view inside the window (a 0.4 s reaction on Normal, 0.6 s on Easy) and is never noticed', () => {
    expect(
      alertAfterTurn(lone('normal'), { human: [9, 4], before: 'up', after: 'down', leaveAt: 24 }),
    ).toBeNull();
    expect(
      alertAfterTurn(lone('easy'), { human: [9, 4], before: 'up', after: 'down', leaveAt: 36 }),
    ).toBeNull();
    // ... but not if he stays past it
    expect(
      alertAfterTurn(lone('normal'), { human: [9, 4], before: 'up', after: 'down', leaveAt: 60 }),
    ).not.toBeNull();
  });

  it("a quarter turn that reveals him at arm's length (the post sweep) has the same grace", () => {
    // guard looks 'right', he is below it (forward 0, lateral 1... not seen on Easy; on Normal the shoulder is seen at 30 ticks)
    const at = alertAfterTurn(lone('normal'), { human: [9, 2], before: 'down', after: 'up' });
    expect(at).toBe(54);
  });

  it('no grace for a player who was ALREADY in view when it turned (the shoulder is seen on Normal)', () => {
    // he stands at its right shoulder (10,3): in its ring on Normal, so he is seen for 12 ticks before it turns to him
    const at = alertAfterTurn(lone('normal'), { human: [10, 3], before: 'up', after: 'right' });
    expect(at).toBe(1);
  });

  it("no grace for a player who walks into its face: a guard that has been looking that way feels him at arm's length", () => {
    const s = lone('normal');
    const g = s.players[1]!;
    const m = s.territory!.minds[1]!;
    for (let i = 0; i < 100; i++) {
      s.tick++;
      g.facing = 'down';
      updateTerritory(s, []);
    }
    put(s, 0, 9, 4);
    s.tick++;
    g.facing = 'down';
    updateTerritory(s, []);
    expect(m.state).toBe('alert');
  });
});

describe('PI7: a calm guard does not throw a punch during the grace either', () => {
  /** Ticks (after the turn) until guard A, driven by its real bot, starts an attack on the player at arm's length. */
  function swingAfterTurn(grace: number): number | null {
    const s = lone('normal', grace);
    const g = s.players[1]!;
    const bot = createBot({ difficulty: 'casual', seed: 77, playerId: 1 });
    // it holds the tile it stands on (its post), so the bot does not walk away from the scene
    const spec = s.territory!.minds[1]!.spec;
    spec.centre = { x: 9, y: 3 };
    spec.anchors = [{ x: 9, y: 3 }];
    spec.patrol = [];
    put(s, 0, 9, 4);
    const decide = (facing: Dir): void => {
      g.facing = facing;
      const intents: Intents = { 0: {}, 1: bot.decide(observe(s, 1)) };
      tick(s, intents);
    };
    for (let i = 0; i < 12; i++) {
      decide('up');
      s.territory!.minds[1]!.state = 'watch';
    }
    for (let i = 1; i <= 80; i++) {
      decide('down');
      if (g.attack !== null || s.players[0]!.vitals!.hp < s.players[0]!.vitals!.maxHp) return i;
      if (i < 40) s.territory!.minds[1]!.state = 'watch'; // keep it calm: this isolates the bot's own rule
    }
    return null;
  }

  it('with the grace its first swing comes later than without it', () => {
    const without = swingAfterTurn(0);
    const withGrace = swingAfterTurn(54);
    expect(without, 'production: it swings straight away').not.toBeNull();
    expect(without!).toBeLessThan(10);
    expect(withGrace === null || withGrace > 30, `with the grace: ${withGrace}`).toBe(true);
  });
});

describe('PI7: measured in the real depot, with all of wave 1 on its rounds', () => {
  /** Windows (a human unseen on the tile behind a first-wave guard) where an instant, unwarned notice follows. */
  function instants(level: CampaignLevel, grace?: number): { windows: number; instant: number } {
    let windows = 0;
    let instant = 0;
    for (const target of [2, 3])
      for (let t0 = 0; t0 <= 1200; t0 += 60) {
        const r = dwellProbe({
          raidId: 'warehouseDispatchDepot',
          level,
          seed: 1,
          target,
          t0,
          dwell: 45,
          ...(grace !== undefined ? { grace } : {}),
        });
        if (!r.eligible) continue;
        windows++;
        if (r.first && r.first.cause === 'close' && r.first.noticeBefore <= 1) instant++;
      }
    return { windows, instant };
  }

  it("before PI7 a guard's about-face caught the player behind it at once (Easy, Normal); after it none does; Hard unchanged", () => {
    for (const level of ['easy', 'normal'] as CampaignLevel[]) {
      const before = instants(level, 0);
      const after = instants(level);
      expect(before.windows, level).toBeGreaterThanOrEqual(8);
      expect(before.instant, `${level} before`).toBeGreaterThanOrEqual(2);
      expect(after.instant, `${level} after`).toBe(0);
    }
    const hardBefore = instants('hard', 0);
    const hardAfter = instants('hard');
    expect(hardAfter).toEqual(hardBefore); // Hard is byte-for-byte the production behaviour
    expect(hardAfter.instant).toBeGreaterThan(0);
  }, 120_000);
});
