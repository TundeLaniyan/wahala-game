/**
 * THE CLASSIC RAID COMBAT ACCEPTANCE TESTS (docs/CLASSIC_RAID_COMBAT.md, decisions AM1-AM6): the player's
 * opportunities, measured with the REAL raid, its waves and its real enemy bots, never an isolated system.
 *
 *   A  a guard's patrol is clockwork: learned by watching two laps, it predicts where the guard will be
 *   B  a generator planted out of sight, timed for the guard's next pass, kills it (Easy, Normal)
 *   C  a generator dropped in plain view in front of a calm guard is seen and escaped (Normal, Hard)
 *   D  four or more enemies on the board never all hunt the player; hidden away, they go back to their rounds
 *   E  a punch wind-up is escapable: stepping off the telegraphed tile after a 0.25 s reaction makes it miss, and it
 *      never turns to a neighbour tile the player walked round to
 *   F  the ambusher (a scripted player with a player's limits) completes raids with generator ambushes
 *
 * Depot, guard A (seat 1) walks clockwise round the pillar at (8,4): corners (7,3) (9,3) (9,5) (7,5).
 */
import { describe, expect, it } from 'vitest';
import { RAID_TUNING, buildRaidGame, createGame, tick } from '../src/sim';
import { Tile } from '../src/sim/types';
import type { CampaignLevel, GameState, Intents, SimEvent } from '../src/sim';
import { RAID_ENEMY_ATTACKS } from '../src/sim/config';
import { RouteLearner, playRaidAmbush } from '../scripts/lib/ambusher';
import { raidWithBots, step } from '../scripts/lib/raidAi';
import { rearAttempt } from '../scripts/raid-rear';
import { explodeAt, knockOut, letWavesAppear, put } from './raid-helpers';

const ORDINARY = new Set(['agbero', 'guard', 'thrower', 'heavy']);

/** The depot at `level`, its first waves on the board, the human parked at the entrance (out of every sight). */
function depot(level: CampaignLevel) {
  const r = raidWithBots('warehouseDispatchDepot', level, 1);
  for (let t = 0; t < 600; t++) step(r.s, r.bots);
  return r;
}

describe('A. patrols are clockwork and learnable by watching', () => {
  for (const level of ['easy', 'normal', 'hard'] as CampaignLevel[])
    it(`${level}: two laps watched predict the next two to the tile`, () => {
      const { s, bots } = depot(level);
      const learner = new RouteLearner();
      for (let t = 0; t < 900; t++) {
        step(s, bots);
        learner.observe(s);
      }
      const pred = learner.predict(1, s.tick + 700)!;
      expect(pred, 'a lap was learned').not.toBeNull();
      let same = 0;
      let n = 0;
      for (let t = 0; t < 600; t++) {
        step(s, bots);
        const g = s.players[1]!;
        const q = pred.find((o) => o.from <= s.tick && o.to > s.tick);
        n++;
        if (q && q.tile === g.y * s.width + g.x) same++;
      }
      expect(same / n, 'share of ticks the guard is where the learned lap says').toBeGreaterThan(0.97);
    });
});

/**
 * The depot ambush: a generator on (7,7) covers (7,6) and the corner (7,5) where guard A pauses. Planted when the fuse
 * will end a moment after the guard steps onto the corner, with the planter hidden at the entrance before and after.
 */
function ambush(level: CampaignLevel, visible: boolean): { killed: boolean; guardState: string } {
  const { s, bots } = depot(level);
  const learner = new RouteLearner();
  for (let t = 0; t < 900; t++) {
    step(s, bots);
    learner.observe(s);
  }
  const fuse = s.config.generator.fuseTicks;
  const w = s.width;
  const corner = 5 * w + 7;
  const visit = learner
    .predict(1, s.tick + 1200)!
    .find((q) => q.tile === corner && q.from > s.tick + fuse + 30)!;
  const plantAt = visit.from + 8 - fuse;
  while (s.tick < plantAt) step(s, bots);
  if (visible) {
    // in plain view: the generator on the tile right in front of the guard, as it walks its edge
    const g = s.players[1]!;
    put(
      s,
      0,
      g.x + (g.facing === 'left' ? -1 : g.facing === 'right' ? 1 : 0),
      g.y + (g.facing === 'up' ? -1 : g.facing === 'down' ? 1 : 0),
    );
  } else put(s, 0, 7, 7);
  step(s, bots, { place: true });
  put(s, 0, 1, 11);
  for (let t = 0; t < fuse + 60 && s.generators.length > 0; t++) step(s, bots);
  for (let t = 0; t < 40; t++) step(s, bots);
  return { killed: !s.players[1]!.alive, guardState: s.territory?.minds[1]?.state ?? 'none' };
}

describe('B. an unseen, well-timed generator kills the guard on its rounds', () => {
  for (const level of ['easy', 'normal'] as CampaignLevel[])
    it(`${level}: planted out of sight for its next pass round the corner`, () => {
      expect(ambush(level, false).killed).toBe(true);
    });
});

describe('C. a generator in plain view in front of a calm guard is seen and escaped', () => {
  for (const level of ['normal', 'hard'] as CampaignLevel[])
    it(`${level}: dropped on the tile ahead of it`, () => {
      expect(ambush(level, true).killed).toBe(false);
    });
});

describe('D. a raid never turns into the whole crew hunting the player', () => {
  for (const level of ['easy', 'normal', 'hard'] as CampaignLevel[])
    it(`${level}: at most the cap hunts at once; hidden away, everyone goes back to its rounds`, () => {
      const cap = { easy: 1, normal: 2, hard: 3 }[level];
      // the bots, then the human standing in the open middle of the depot for 10 s
      const { s: g, bots } = raidWithBots('warehouseDispatchDepot', level, 1);
      for (let t = 0; t < 600; t++) step(g, bots);
      // the player blows up a marked crate: the throwers and the lieutenant are called in (6 enemies on the board)
      const w = g.width;
      const cargo = g.raid!.cargo.find((c) => c.marked && !c.destroyed)!;
      const by = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].find(([dx, dy]) => g.tiles[(cargo.y + dy!) * w + cargo.x + dx!] === Tile.Empty)!;
      for (let k = 0; k < 4 && !cargo.destroyed; k++) {
        explodeAt(g, cargo.x + by[0]!, cargo.y + by[1]!);
        for (let t = 0; t < 60; t++) step(g, bots);
      }
      for (let t = 0; t < RAID_TUNING.spawnWarnTicks + 10; t++) step(g, bots);
      const enemies = g.players.filter((p) => p.alive && p.enemyKind !== undefined).length;
      expect(enemies, 'a crew of four or more').toBeGreaterThanOrEqual(4);
      let most = 0;
      for (let t = 0; t < 600; t++) {
        if (g.players[0]!.alive) put(g, 0, 8, 7);
        step(g, bots);
        let n = 0;
        for (const [k, m] of Object.entries(g.territory?.minds ?? {})) {
          const p = g.players[Number(k)]!;
          if (p.alive && ORDINARY.has(p.enemyKind ?? '') && (m.state === 'alert' || m.state === 'pursue'))
            n++;
        }
        most = Math.max(most, n);
      }
      // (a hit or the player at arm's length always turns a guard: self-defence may add one over the cap)
      expect(most, 'ordinary enemies hunting at once').toBeLessThanOrEqual(cap + 1);
      // the player slips away to the entrance and waits, out of sight
      put(g, 0, 1, 11);
      for (let t = 0; t < 1500; t++) step(g, bots);
      const hunting = Object.entries(g.territory?.minds ?? {}).filter(([k, m]) => {
        const p = g.players[Number(k)]!;
        return p.alive && ORDINARY.has(p.enemyKind ?? '') && (m.state === 'alert' || m.state === 'pursue');
      });
      expect(hunting.length, 'still hunting 25 s after he slipped away').toBe(0);
    });
});

/** A guard next to the human winds up a punch at him; the human reacts after `react` ticks with `moves`. */
function punchAt(
  level: CampaignLevel,
  react: number,
  moves: ('up' | 'down' | 'left' | 'right')[],
  stage?: (s: GameState) => void,
) {
  const s: GameState = createGame(
    buildRaidGame({ raidId: 'warehouseDispatchDepot', humanCharacter: 'streetBaller', seed: 1, level }),
  );
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  letWavesAppear(s);
  knockOut(s, ...s.players.filter((p) => p.id > 1 && p.alive).map((p) => p.id));
  // guard A on (7,5) facing right, the human on (8,5): the punch is telegraphed on (8,5)
  put(s, 1, 7, 5);
  s.players[1]!.facing = 'right';
  put(s, 0, 8, 5);
  const hp = s.players[0]!.vitals!.hp;
  let started: { tick: number; resolve: number; x: number; y: number } | null = null;
  let landed: boolean | null = null;
  const all: SimEvent[] = [];
  for (let t = 0; t < 200 && landed === null; t++) {
    const intents: Intents = { 0: {}, 1: started ? {} : { special: true } };
    if (started && stage && s.tick - started.tick === react) stage(s);
    if (started) {
      const k = s.tick - started.tick - react;
      if (k >= 0 && moves[Math.floor(k / 12)] && s.players[0]!.stepRemaining === 0)
        intents[0] = { move: moves[Math.floor(k / 12)]! };
    }
    const ev = tick(s, intents);
    all.push(...ev);
    for (const e of ev) {
      if (e.type === 'attackStarted' && e.playerId === 1)
        started = { tick: s.tick, resolve: e.resolveTick, x: 8, y: 5 };
      if (e.type === 'attackResolved' && e.playerId === 1) landed = e.hit;
    }
  }
  return {
    started,
    landed,
    hpLost: hp - s.players[0]!.vitals!.hp,
    windup: started ? started.resolve - started.tick : 0,
  };
}

describe('E. a telegraphed punch can be escaped and never turns to follow', () => {
  const REACT = 15; // a phone player's 0.25 s, input included
  for (const level of ['easy', 'normal', 'hard'] as CampaignLevel[]) {
    it(`${level}: the wind-up leaves time for a reaction and half a step`, () => {
      const r = punchAt(level, REACT, []);
      expect(r.started).not.toBeNull();
      expect(r.windup, 'wind-up ticks').toBeGreaterThanOrEqual(REACT + 6 + 6);
      expect(r.landed, 'standing still on the telegraphed tile is hit').toBe(true);
    });
    it(`${level}: stepping off the telegraphed tile after the reaction makes it miss`, () => {
      // (8,5) is a corridor tile between pillars: the way off it is on along the corridor, to (9,5)
      const r = punchAt(level, REACT, ['right']);
      expect(r.landed).toBe(false);
      expect(r.hpLost).toBe(0);
    });
    it(`${level}: a player who ends up on another side of it is not hit by the committed punch`, () => {
      // staged: mid wind-up the human is moved to (7,4), right above the guard (still adjacent, another side);
      // the punch was committed to (8,5) and misses
      const r = punchAt(level, REACT, [], (s) => put(s, 0, 7, 4));
      expect(r.landed).toBe(false);
      expect(r.hpLost).toBe(0);
    });
  }
  it('the wind-up per level matches the data (decision AM4)', () => {
    expect(RAID_ENEMY_ATTACKS.easy.melee?.guard?.extraStartupTicks).toBeGreaterThan(
      RAID_ENEMY_ATTACKS.normal.melee?.guard?.extraStartupTicks ?? 0,
    );
    expect(RAID_ENEMY_ATTACKS.normal.melee?.guard?.extraStartupTicks).toBeGreaterThan(
      RAID_ENEMY_ATTACKS.hard.melee?.guard?.extraStartupTicks ?? 0,
    );
  });
});

describe('F. a player who plays by ambushes completes raids with them', () => {
  it(
    'Normal, three raids: every raid completed, ambushes planted and sprung, almost no punch lands',
    { timeout: 600_000 },
    () => {
      const runs = (['warehouseDispatchDepot', 'standbyPlant', 'railYardGoods'] as const).map((raidId) =>
        playRaidAmbush({ raidId, seed: 1, level: 'normal' }),
      );
      for (const r of runs) expect(r.won).toBe(true);
      const planted = runs.reduce((a, r) => a + r.ambushes, 0);
      const kills = runs.reduce((a, r) => a + r.ambushKills, 0);
      expect(planted, 'ambushes planted').toBeGreaterThanOrEqual(2);
      expect(kills / planted, 'ambushes that killed their guard').toBeGreaterThanOrEqual(0.6);
      expect(
        runs.reduce((a, r) => a + r.punchesLanded, 0),
        'enemy punches that landed',
      ).toBeLessThanOrEqual(2);
      expect(
        Math.max(...runs.map((r) => r.maxChasers)),
        'ordinary enemies hunting at once',
      ).toBeLessThanOrEqual(3);
    },
  );
});

/**
 * G (decisions CV1-CV2): the rear approach. Depot guard C holds its post at (11,9), turning a quarter every few seconds
 * (`lookAroundTicks`); guard B walks the column above it. The player waits at (9,7), out of both sights; once he has SEEN
 * C turn to face the wall (a 0.25 s reaction) and B walking away up the column, he walks (10,7) (11,7) (11,8) right
 * behind C, lays a generator there and walks back the way he came. Every input is a real intent; nothing is staged but
 * the waiting spot.
 */
function rearApproach(level: CampaignLevel): {
  killed: boolean;
  noticedBeforeBlast: boolean;
  hurtBeforeBlast: boolean;
  planted: boolean;
} {
  const { s, bots } = depot(level);
  put(s, 0, 9, 7);
  const C = s.players[3]!;
  const B = s.players[2]!;
  const h = s.players[0]!;
  const hp0 = h.vitals!.hp;
  const toward = (x: number, y: number): Intents[number] =>
    h.x === x && h.y === y
      ? {}
      : { move: x !== h.x ? (x > h.x ? 'right' : 'left') : y > h.y ? 'down' : 'up' };
  const route = [
    [10, 7],
    [11, 7],
    [11, 8],
  ] as const;
  const back = [
    [11, 7],
    [10, 7],
    [9, 7],
  ] as const;
  let downSince = -1;
  let phase: 'wait' | 'go' | 'back' = 'wait';
  let i = 0;
  let j = 0;
  let planted = false;
  let noticed = false;
  let hurt = false;
  for (let t = 0; t < 3000; t++) {
    if (C.facing === 'down') {
      if (downSince < 0) downSince = s.tick;
    } else downSince = -1;
    let intent: Intents[number] = {};
    if (
      phase === 'wait' &&
      downSince >= 0 &&
      s.tick - downSince >= 15 &&
      s.tick - downSince < 105 &&
      B.facing === 'up' &&
      B.y <= 6
    )
      phase = 'go';
    if (phase === 'go') {
      if (h.stepRemaining === 0 && h.x === route[i]![0] && h.y === route[i]![1]) i++;
      if (i >= route.length) {
        intent = { place: true };
        planted = true;
        phase = 'back';
      } else intent = toward(route[i]![0], route[i]![1]);
    } else if (phase === 'back') {
      if (h.stepRemaining === 0 && h.x === back[j]![0] && h.y === back[j]![1])
        j = Math.min(j + 1, back.length - 1);
      intent = toward(back[j]![0], back[j]![1]);
    }
    step(s, bots, intent);
    const blown = planted && s.generators.length === 0;
    if (!blown) {
      const st = s.territory!.minds[3]?.state;
      if (C.alive && (st === 'alert' || st === 'pursue')) noticed = true;
      if (h.vitals!.hp < hp0) hurt = true;
    }
    if (blown && s.flames.length === 0) break;
  }
  return { killed: !C.alive, noticedBeforeBlast: noticed, hurtBeforeBlast: hurt, planted };
}

describe('G. a player who creeps up behind a guard at its post can lay a generator there (decisions CV1-CV2)', () => {
  for (const level of ['easy', 'normal'] as CampaignLevel[])
    it(`${level}: unseen, unheard, and the blast kills it`, () => {
      const r = rearApproach(level);
      expect(r.planted, 'the window came').toBe(true);
      expect(r.noticedBeforeBlast, 'the guard never turned on him').toBe(false);
      expect(r.hurtBeforeBlast).toBe(false);
      expect(r.killed).toBe(true);
    });
  it('hard: the click of a generator laid right behind it is heard, and the guard gets clear', () => {
    const r = rearApproach('hard');
    expect(r.planted).toBe(true);
    expect(r.killed).toBe(false);
  });
});

/**
 * H (decision CV8): in the REAL depot (all of wave 1 on its rounds) the rear approach to post guard C is never caught by
 * C on the very tick it turns its shoulder to him: on Easy and Normal a player at its shoulder is SEEN (the usual
 * reaction), not felt at once, so a late planter can still step away. Many timings: seeds x reaction x turns let pass.
 */
describe('H. a post guard turning its shoulder to a player behind it does not catch him that tick (decision CV8)', () => {
  for (const level of ['easy', 'normal'] as CampaignLevel[])
    it(`${level}: no rear attempt is noticed by the post guard; nearly all kill it`, () => {
      let tried = 0;
      let killed = 0;
      for (const seed of [1, 2])
        for (const react of [15, 45])
          for (const skip of [0, 1]) {
            const r = rearAttempt(level, seed, react, skip);
            if (!r.window) continue;
            tried++;
            if (r.killed) killed++;
            expect(r.noticed, `seed ${seed} react ${react} skip ${skip}`).toBeNull();
          }
      expect(tried).toBeGreaterThanOrEqual(6);
      expect(killed / tried).toBeGreaterThanOrEqual(0.75);
    });
});
