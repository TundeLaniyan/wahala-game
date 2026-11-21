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
