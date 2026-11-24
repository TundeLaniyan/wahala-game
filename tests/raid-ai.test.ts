/**
 * THE CLASSIC RAID ENEMY AI (decisions RA1-RA7, docs/CLASSIC_RAID_AI.md): readable routes, fair pursuit, fair
 * generator awareness, commitment and difficulty, with the REAL enemy bots deciding. Scenario tests on the Dispatch
 * Depot (coordinates from its arena, `scripts/raid-routes.ts` prints every route), then measured rates on every raid
 * (`scripts/lib/raidAi.ts`, the same harness as `npx tsx scripts/raid-ai.ts`).
 *
 * Depot, round guard A's loop (seat 1, clockwise 7,3 > 9,3 > 9,5 > 7,5 round the pillar at 8,4):
 *      7 8 9
 *   3  . . .
 *   4  . # .
 *   5  . . .
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import { stepTicksOf, readyTick } from '../src/ai/world';
import {
  RAID_IDS,
  buildRaidGame,
  createGame,
  enemyLookout,
  enemySeesPerson,
  observe,
  playerStepTicks,
  raidRoute,
  raidTacticsFor,
  routeTiles,
  tick,
} from '../src/sim';
import type { CampaignLevel, GameState, Intents, RaidId } from '../src/sim';
import { Tile } from '../src/sim/types';
import { updateTerritory } from '../src/sim/systems/territory';
import { addGenerator } from './helpers';
import { advance, knockOut, letWavesAppear, newRaid, put } from './raid-helpers';
import { ambushDrill, cornerDrill, idlePatrol, raidWithBots, seenDrill, step } from '../scripts/lib/raidAi';

const LEVELS: readonly CampaignLevel[] = ['easy', 'normal', 'hard'];

/** The depot at `level` with only guard A (seat 1) on the board; the human parked at the entrance. */
function depotGuard(level: CampaignLevel): GameState {
  const s = createGame(
    buildRaidGame({ raidId: 'warehouseDispatchDepot', humanCharacter: 'streetBaller', seed: 3, level }),
  );
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  letWavesAppear(s);
  knockOut(s, ...s.players.filter((p) => p.id > 1 && p.alive).map((p) => p.id));
  put(s, 0, 1, 11);
  return s;
}

/** Runs `n` ticks with the real bot deciding for seat 1 (the human idle); calls `each` after every tick. */
function runGuard(s: GameState, n: number, level: CampaignLevel, each?: () => void): void {
  const bot = createBot({
    difficulty: level === 'easy' ? 'beginner' : level === 'hard' ? 'standard' : 'casual',
    seed: 77,
    playerId: 1,
  });
  for (let i = 0; i < n && s.match.phase !== 'ended'; i++) {
    const intents: Intents = { 0: {} };
    if (s.players[1]!.alive) intents[1] = bot.decide(observe(s, 1));
    tick(s, intents);
    each?.();
  }
}

/** Puts guard A on its loop at (x, y) facing `facing`, walking to waypoint `wp` (0 = 7,3, 1 = 9,3, 2 = 9,5, 3 = 7,5). */
function onLoop(
  s: GameState,
  x: number,
  y: number,
  facing: 'up' | 'down' | 'left' | 'right',
  wp: number,
): void {
  put(s, 1, x, y);
  s.players[1]!.facing = facing;
  const m = s.territory!.minds[1]!;
  m.waypoint = wp;
  m.pauseUntil = -1;
  m.since = s.tick;
}

const hurt = (s: GameState): boolean =>
  !s.players[1]!.alive || s.players[1]!.vitals!.hp < s.players[1]!.vitals!.maxHp;

describe('RA2: readable, repeatable patrol routes', () => {
  it('guard A walks the loop round its pillar block, one way, corner by corner', () => {
    const s = depotGuard('normal');
    expect(s.territory!.minds[1]!.spec.patrol).toEqual([
      { x: 7, y: 3 },
      { x: 9, y: 3 },
      { x: 9, y: 5 },
      { x: 7, y: 5 },
    ]);
    const corners: string[] = [];
    runGuard(s, 60 * 40, 'normal', () => {
      const p = s.players[1]!;
      const k = `${p.x},${p.y}`;
      if (['7,3', '9,3', '9,5', '7,5'].includes(k) && corners[corners.length - 1] !== k) corners.push(k);
    });
    // at least two full laps, always in the same order (never a reversal)
    expect(corners.length).toBeGreaterThanOrEqual(8);
    const order = ['7,3', '9,3', '9,5', '7,5'];
    const start = order.indexOf(corners[0]!);
    corners.forEach((c, i) => expect(c).toBe(order[(start + i) % 4]));
  });

  it('the same seed walks the same tiles twice; the route never changes direction without a reason', () => {
    for (const raidId of ['warehouseDispatchDepot', 'recordsVault'] as RaidId[]) {
      const a = idlePatrol(raidId, 'normal', 2, 45);
      const b = idlePatrol(raidId, 'normal', 2, 45);
      expect(JSON.stringify([...a.visits])).toBe(JSON.stringify([...b.visits]));
    }
  });

  it('every raid at every level: few reversals, none off a route end, the next step predictable (was 32-66 a minute)', () => {
    for (const level of LEVELS) {
      let calmTicks = 0;
      let churn = 0;
      let reversals = 0;
      let seen = 0;
      let same = 0;
      for (const raidId of RAID_IDS) {
        const r = idlePatrol(raidId, level, 1, 40);
        calmTicks += r.calmTicks;
        churn += r.calmChurn;
        reversals += r.calmReversals;
        seen += r.repeatSeen;
        same += r.repeatSame;
      }
      const minutes = calmTicks / 3600;
      expect(churn / minutes, level).toBeLessThan(1); // before RA: 32 (Normal) to 66 (Easy) per enemy-minute, all of them churn
      expect(reversals / minutes, level).toBeLessThan(30); // the ends of corridor runs and beats only
      expect(same / seen, level).toBeGreaterThan(0.95);
    }
  });

  it('every derived route is open floor walked in straight legs, off the belts and the entrance, and routes never share a tile', () => {
    for (const raidId of RAID_IDS) {
      const { s, bots } = raidWithBots(raidId, 'normal', 1);
      for (let t = 0; t < 120; t++) step(s, bots);
      const cfg = s.config.campaignTactics!.classicRaid!;
      const belts = new Set(s.raid!.belts.flatMap((b) => b.tiles.map((t) => `${t.x},${t.y}`)));
      const taken = new Map<string, number>();
      for (const [id, m] of Object.entries(s.territory!.minds)) {
        const route = m.spec.patrol;
        for (let i = 0; i + 1 < route.length; i++)
          expect(route[i]!.x === route[i + 1]!.x || route[i]!.y === route[i + 1]!.y, `${raidId} ${id}`).toBe(
            true,
          );
        for (const t of route.length ? routeTiles(route) : []) {
          if (t.x === m.spec.centre.x && t.y === m.spec.centre.y) continue; // its authored spot may be anywhere
          expect(s.tiles[t.y * s.width + t.x], `${raidId} ${id} ${t.x},${t.y}`).toBe(Tile.Empty);
          expect(belts.has(`${t.x},${t.y}`), `${raidId} ${id} belt`).toBe(false);
          const ent = s.raid!.entrance;
          expect(Math.abs(ent.x - t.x) + Math.abs(ent.y - t.y)).toBeGreaterThan(cfg.entranceClearTiles);
          expect(taken.get(`${t.x},${t.y}`) ?? Number(id), `${raidId} ${t.x},${t.y}`).toBe(Number(id));
          taken.set(`${t.x},${t.y}`, Number(id));
        }
      }
    }
  });

  it('archetypes differ: guards loop or run a corridor, a heavy walks a short beat, a thrower holds a post', () => {
    const cfg = raidTacticsFor('normal').classicRaid!;
    expect(cfg.routes.guard.style).toBe('loop');
    expect(cfg.routes.lieutenant.loopTiles).toBeGreaterThan(cfg.routes.guard.loopTiles);
    expect(cfg.routes.heavy.style).toBe('beat');
    expect(cfg.routes.thrower.style).toBe('post');
    const s = newRaid('partsStoreroom');
    const heavy = s.players.find((p) => p.enemyKind === 'heavy')!;
    expect(raidRoute(s, 'heavy', heavy.id, { x: 11, y: 7 }, cfg).style).toBe('beat');
    expect(raidRoute(s, 'thrower', 3, { x: 7, y: 9 }, cfg)).toMatchObject({ style: 'post', waypoints: [] });
  });
});

describe('RA3 / RA4: fair generator awareness - no omniscience, real escapes from what it sees', () => {
  it('a generator round the corner, behind the pillar, catches a guard that never saw it (every level, Hard too)', () => {
    for (const level of LEVELS) {
      const s = depotGuard(level);
      // walking right along row 3 to the corner (9,3); (9,5) is behind the pillar (8,4) and, from (6,3), out of earshot
      // on every level (Hard hears a generator laid 3 tiles away)
      onLoop(s, 6, 3, 'right', 1);
      const calm = playerStepTicks(s, s.players[1]!);
      // it blows a moment after the guard reaches the corner: it stands there facing on, the generator out of its cone
      addGenerator(s, { ownerId: 0, x: 9, y: 5, timer: 3 * calm + 10 });
      runGuard(s, 3 * calm + 30, level);
      expect(hurt(s), level).toBe(true);
    }
  });

  // decision CV4 deliberately narrowed this to Normal and Hard: an Easy guard sees a generator only from 1 tile and
  // takes it in slowly, so this 2 s fuse two tiles ahead catches it (Easy is generous; asserted below)
  it('the same generator seen in plain view is escaped by a real walk (negative control)', () => {
    for (const level of ['normal', 'hard'] as CampaignLevel[]) {
      const s = depotGuard(level);
      onLoop(s, 9, 3, 'down', 2); // at the corner, already turned down the leg: (9,5) two tiles ahead
      // a full fuse: since decision CV2 a laid generator is not heard on Normal, so it is seen (reaction and all), not heard
      addGenerator(s, { ownerId: 0, x: 9, y: 5, timer: s.config.generator.fuseTicks });
      const at: string[] = [];
      runGuard(s, s.config.generator.fuseTicks + 30, level, () =>
        at.push(`${s.players[1]!.x},${s.players[1]!.y}`),
      );
      expect(hurt(s), level).toBe(false);
      expect(new Set(at).size, level).toBeGreaterThan(1); // it walked out, it was not spared by luck
    }
  });

  it('sight is the one grid rule: never through a pillar, never outside the calm cone, at any level', () => {
    const s = depotGuard('hard');
    const guard = s.players[1]!;
    const human = s.players[0]!;
    put(s, 1, 7, 3);
    put(s, 0, 9, 5); // behind the pillar (8,4)
    expect(enemySeesPerson(s, guard, human, { range: 99, calm: false })).toBe(false);
    put(s, 0, 9, 3); // the same row, clear
    guard.facing = 'right';
    expect(enemySeesPerson(s, guard, human, { range: 99, calm: true })).toBe(true);
    guard.facing = 'left';
    expect(enemySeesPerson(s, guard, human, { range: 99, calm: true })).toBe(false); // behind it while calm
    expect(enemySeesPerson(s, guard, human, { range: 99, calm: false })).toBe(true); // engaged: all round
  });

  it('measured on every raid: prepared ambushes catch Easy and Normal guards, a generator in plain view is escaped', () => {
    for (const level of ['easy', 'normal'] as const) {
      let staged = 0;
      let trapped = 0;
      let seenStaged = 0;
      let seenCaught = 0;
      for (const raidId of RAID_IDS)
        for (const seed of [1, 2]) {
          const c = cornerDrill(raidId, level, seed);
          staged += c.staged;
          trapped += c.trapped;
          const v = seenDrill(raidId, level, seed);
          seenStaged += v.staged;
          seenCaught += v.trapped;
        }
      expect(staged, level).toBeGreaterThanOrEqual(6);
      expect(trapped / staged, level).toBeGreaterThan(0.5); // before RA nothing walked a route: no ambush existed
      expect(seenCaught / seenStaged, level).toBeLessThan(0.15); // a visible threat is escaped
    }
  });

  it('several enemies do not all dodge perfectly: some generator on a coming path catches someone at every level', () => {
    for (const level of LEVELS) {
      let trapped = 0;
      let staged = 0;
      for (const raidId of RAID_IDS)
        for (const seed of [1, 2, 3]) {
          const r = ambushDrill(raidId, level, seed, false);
          trapped += r.trapped;
          staged += r.staged;
        }
      expect(staged, level).toBeGreaterThan(3);
      expect(trapped, level).toBeGreaterThan(0);
      expect(trapped, level).toBeLessThan(staged);
    }
  });
});

describe('CV8: a calm guard notices a player at its shoulder by sight, at once only in front', () => {
  it('Normal: at its shoulder after the usual reaction, never on the tick; in front at once; Hard: at once', () => {
    const at = (level: CampaignLevel, dx: number, dy: number): number | null => {
      const s = depotGuard(level);
      const g = s.players[1]!;
      put(s, 1, 9, 3);
      g.facing = 'down';
      const m = s.territory!.minds[1]!;
      m.state = 'watch';
      m.notice = 0;
      // the guard has been looking this way for a while when he arrives (decision PI7: a turn that REVEALS him has a
      // grace, tests/raid-rear-reveal.test.ts; here he walks into view, so none)
      for (let i = 0; i < 3; i++) {
        s.tick++;
        g.facing = 'down';
        updateTerritory(s, []);
      }
      put(s, 0, 9 + dx, 3 + dy);
      for (let i = 1; i <= 120; i++) {
        s.tick++;
        g.facing = 'down';
        updateTerritory(s, []);
        if ((m.state as string) === 'alert') return i;
      }
      return null;
    };
    const shoulder = at('normal', 1, 0); // (10,3): beside it
    expect(shoulder).not.toBeNull();
    expect(shoulder!).toBeGreaterThan(1);
    expect(at('normal', 0, 1)).toBe(1); // in front: arm's length
    expect(at('hard', 1, 0)).toBe(1);
    expect(at('normal', 0, -1)).toBeNull(); // behind
  });
});

describe('RA3: fair pursuit - noticed, bounded, searched, back on its route', () => {
  it('the same generator with 100 ticks left two tiles ahead: an Easy guard (sees it a tile ahead, takes it in slowly) is caught, a Hard one gets clear (decisions CV4-CV5)', () => {
    const out: Record<string, boolean> = {};
    for (const level of ['easy', 'hard'] as CampaignLevel[]) {
      const s = depotGuard(level);
      onLoop(s, 9, 3, 'down', 2);
      addGenerator(s, { ownerId: 0, x: 9, y: 5, timer: 100 });
      runGuard(s, 130, level);
      out[level] = hurt(s);
    }
    expect(out).toEqual({ easy: true, hard: false });
  });

  it('a guard that spots the player chases, loses him behind a door, searches and walks back to its loop', () => {
    const s = depotGuard('normal');
    onLoop(s, 9, 5, 'left', 3);
    // two tiles ahead of it, in its line of sight (decision CV1 deliberately changed this: the player used to stand two
    // tiles to its side while it looked away, and "too close" alerted it anyway)
    put(s, 0, 7, 5);
    const states: string[] = [];
    let moved = false;
    runGuard(s, 2400, 'normal', () => {
      const st = s.territory!.minds[1]!.state;
      if (states[states.length - 1] !== st) states.push(st);
      if (st === 'pursue' && !moved) {
        moved = true;
        put(s, 0, 1, 1); // into the armour locker behind its closed door: out of reach
      }
    });
    expect(states.filter((st) => st !== 'patrol')[0]).toBe('alert');
    expect(states).toContain('pursue');
    const after = states.slice(states.indexOf('pursue') + 1);
    expect(after[0]).toMatch(/investigate|return/);
    expect(states[states.length - 1]).toBe('patrol');
    const route = routeTiles(s.territory!.minds[1]!.spec.patrol).map((t) => `${t.x},${t.y}`);
    expect(route).toContain(`${s.players[1]!.x},${s.players[1]!.y}`);
  });

  it('a wave the player calls in (the first marked crate) wakes alerted to him; the first wave wakes calm', () => {
    const s = newRaid('warehouseDispatchDepot', { seed: 3 });
    letWavesAppear(s);
    for (const id of s.raid!.waves[0]!.seatIds)
      expect(['patrol', 'watch']).toContain(s.territory!.minds[id]!.state); // calm: its route or its post
    knockOut(s, ...s.raid!.waves[0]!.seatIds);
    const crate = s.raid!.cargo.find((c) => c.marked)!;
    crate.hp = 0;
    crate.destroyed = true;
    s.tiles[crate.y * s.width + crate.x] = Tile.Empty;
    advance(s, 2);
    letWavesAppear(s);
    const wave2 = s.raid!.waves[1]!.seatIds;
    expect(wave2.length).toBeGreaterThan(0);
    // every one is called; at most `maxChasers` hunt (decision CV6: on Easy and Normal the lieutenant takes a place too),
    // the others watch him from their ground and go back to their rounds
    const cap = s.config.campaignTactics!.classicRaid!.maxChasers;
    let hunting = 0;
    for (const id of wave2) {
      const m = s.territory!.minds[id]!;
      expect(['alert', 'pursue', 'return']).toContain(m.state);
      if (m.state !== 'return') hunting++;
      expect(m.calledUntil).toBeGreaterThan(s.tick);
    }
    expect(hunting).toBe(Math.min(cap, wave2.length));
  });
});

describe('RA1 / RA5: pace and difficulty - slower than the player, planner and sim agree', () => {
  it('every ordinary raid enemy is slower than the player, slower still on its calm walk, Easy slowest', () => {
    const pace: Record<string, number[]> = {};
    for (const level of LEVELS) {
      const t = raidTacticsFor(level);
      for (const kind of ['agbero', 'guard', 'thrower', 'heavy', 'lieutenant'] as const) {
        expect(t.enemyStepTicks[kind], `${level} ${kind}`).toBeGreaterThan(10); // the player walks a tile in 10
        (pace[kind] ??= []).push(t.enemyStepTicks[kind] + t.territory.patrolStepExtraTicks);
      }
    }
    for (const [kind, [easy, normal, hard]] of Object.entries(pace)) {
      expect(easy!, kind).toBeGreaterThan(normal!);
      expect(normal!, kind).toBeGreaterThanOrEqual(hard!);
    }
    // Easy reacts later than Hard to a generator it has seen, and hears less
    expect(raidTacticsFor('easy').perception.guard.reactTicks).toBeGreaterThan(
      raidTacticsFor('hard').perception.guard.reactTicks,
    );
    expect(raidTacticsFor('easy').perception.guard.hearingTiles).toBeLessThan(
      raidTacticsFor('hard').perception.guard.hearingTiles,
    );
  });

  it('the planner plans the step time and the readiness the sim gives every raid enemy (was off by the kind penalty)', () => {
    for (const level of LEVELS)
      for (const raidId of RAID_IDS) {
        const { s, bots } = raidWithBots(raidId, level, 1);
        for (let t = 0; t < 400; t++) {
          step(s, bots);
          if (t % 20 !== 0) continue;
          for (const p of s.players) {
            if (!p.alive || p.enemyKind === undefined) continue;
            const obs = observe(s, p.id);
            expect(stepTicksOf(obs, p), `${raidId} ${level} ${p.enemyKind}`).toBe(playerStepTicks(s, p));
          }
        }
        // a planted enemy cannot plan a step before it is free
        const e = s.players.find((p) => p.alive && p.enemyKind !== undefined)!;
        e.rootedUntil = s.tick + 30;
        expect(readyTick(observe(s, e.id), e)).toBeGreaterThanOrEqual(s.tick + 30);
      }
  });
});

describe('RA7: what presentation can read (the night raid worker)', () => {
  it('enemyLookout gives the facing of the view cone, whether the cone applies, and the notice range', () => {
    const s = depotGuard('normal');
    onLoop(s, 7, 3, 'right', 1);
    const calm = enemyLookout(s, 1)!;
    expect(calm).toEqual({
      x: 7,
      y: 3,
      facing: 'right',
      calm: true,
      noticeTiles: s.territory!.minds[1]!.spec.calmNoticeTiles,
    });
    s.territory!.minds[1]!.state = 'pursue';
    expect(enemyLookout(s, 1)).toMatchObject({
      calm: false,
      noticeTiles: s.territory!.minds[1]!.spec.noticeTiles,
    });
    expect(enemyLookout(s, 0)).toBeNull(); // the human has no mind
  });
});

describe('determinism', () => {
  it('the same raid, seed and bots give the same minds and moves', () => {
    const run = (): string => {
      const { s, bots } = raidWithBots('recordsVault', 'hard', 5);
      for (let t = 0; t < 1500; t++) step(s, bots, t % 90 < 45 ? { move: 'right' } : { move: 'up' });
      return JSON.stringify({
        minds: s.territory,
        players: s.players.map((p) => [p.x, p.y, p.facing, p.alive]),
      });
    };
    expect(run()).toBe(run());
  });
});
