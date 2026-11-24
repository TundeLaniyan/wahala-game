/**
 * RELAY GUARDS (task PI-1D, decision PI8, docs/BOSS_JAMMER_PROTECTION.md): on a level with `BossBalance.relayGuards` the
 * boss's backup fighters defend the live dispatch relays (the "jammer" the player blasts) while he is shielded.
 *
 *   1  the data: Easy has none, the count never falls with the level, nothing is stored where it is 0
 *   2  the directive: who is drafted (marshal, blocker, escort; a fallen one is replaced), which relay each guards (nearest
 *      the player first), what changes when the boss is exposed, what never changes (the boss, other bosses, Easy)
 *   3  the real bots walk to the relay and hold it; the whole mission still plays (Easy is the production digest:
 *      tests/raid-ai-isolation.test.ts)
 */
import { describe, expect, it } from 'vitest';
import {
  BOSS_BALANCE,
  MISSION_IDS,
  buildMissionGame,
  createGame,
  observe,
  tick,
  tuningFor,
} from '../src/sim';
import type { CampaignLevel, GameState, Intents } from '../src/sim';
import { createBot } from '../src/ai';
import { MISSION_DEFS } from '../src/sim';
import { directiveFor } from '../src/sim/mission/directives';
import { RELAY_GUARD_ORDER } from '../src/sim/mission/relayGuard';
import { Tile } from '../src/sim/types';
import { put } from './mission-helpers';
import { traceFight } from '../scripts/boss-trace';
import { BOSS_HUMAN } from '../scripts/lib/bossHuman';

const LEVELS: CampaignLevel[] = ['easy', 'normal', 'hard'];

/** Oshodi at a level, crates cleared, stage off, playing; `guards` replaces the level's relay guards (undefined: its own). */
function oshodi(level: CampaignLevel, guards?: number): GameState {
  const options = buildMissionGame({
    spec: { id: 'oshodi' },
    humanCharacter: 'streetBaller',
    seed: 3,
    level,
  });
  options.settings = { ...options.settings, stageHazards: false };
  const s = createGame(options);
  s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  s.hidden = {};
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  if (guards !== undefined) {
    const b = s.mission!.tuning.boss!;
    if (guards > 0) {
      b.relayGuards = guards;
      b.relayGuardRadius = BOSS_BALANCE.relayGuardRadius;
    } else {
      delete b.relayGuards;
      delete b.relayGuardRadius;
    }
  }
  return s;
}

const seatOf = (s: GameState, role: string): number =>
  s.mission!.seats.find((q) => q.role === role)!.playerId;

describe('PI8: the data', () => {
  it('Easy has none, the count never falls with the level, the radius is a few tiles', () => {
    const g = BOSS_BALANCE.relayGuards;
    expect(g).toEqual({ easy: 0, normal: 1, hard: 2 }); // measured: docs/BOSS_JAMMER_PROTECTION.md
    expect(g.easy).toBe(0);
    expect(g.easy).toBeLessThanOrEqual(g.normal);
    expect(g.normal).toBeLessThanOrEqual(g.hard);
    expect(BOSS_BALANCE.relayGuardRadius).toBeGreaterThanOrEqual(1);
    expect(BOSS_BALANCE.relayGuardRadius).toBeLessThanOrEqual(3);
    expect(RELAY_GUARD_ORDER).toEqual(['meleeGuard', 'blocker', 'escort']);
  });

  it('nothing is stored at a level without them (its state is as it was), and only the tuning of Oshodi has them', () => {
    const easy = tuningFor(MISSION_DEFS.oshodi, 'easy').boss!;
    expect('relayGuards' in easy).toBe(false);
    expect('relayGuardRadius' in easy).toBe(false);
    for (const level of LEVELS) {
      const t = tuningFor(MISSION_DEFS.oshodi, level).boss!;
      expect(t.relayGuards ?? 0, level).toBe(BOSS_BALANCE.relayGuards[level]);
    }
    for (const id of MISSION_IDS)
      if (id !== 'oshodi') expect(tuningFor(MISSION_DEFS[id], 'hard').boss?.relayGuards, id).toBeUndefined();
  });
});

describe('PI8: the directive', () => {
  it('without relay guards every seat plays its own role exactly as before (Easy)', () => {
    const s = oshodi('easy', 0);
    put(s, 0, 20, 12);
    const marshal = directiveFor(s, seatOf(s, 'meleeGuard'))!;
    expect(marshal).toMatchObject({ kind: 'guard', x: 26, y: 13 }); // its post
    expect(directiveFor(s, seatOf(s, 'blocker'))).toMatchObject({ kind: 'block', x: 33, y: 14 });
    expect(directiveFor(s, seatOf(s, 'escort'))).toMatchObject({ kind: 'escort' });
    expect(directiveFor(s, seatOf(s, 'rangedAttacker'))!.kind).toBe('chase');
  });

  it('one guard: the marshal defends the live relay nearest the player; everyone else is unchanged', () => {
    const s = oshodi('normal', 1);
    const m = s.mission!;
    put(s, 0, 50, 14); // beside relay 3 (52, 14)
    const d = directiveFor(s, seatOf(s, 'meleeGuard'))!;
    expect(d).toEqual({ kind: 'guard', x: 52, y: 14, radius: BOSS_BALANCE.relayGuardRadius });
    expect(m.nodes.find((n) => n.id === 'r3')).toMatchObject({ x: 52, y: 14 });
    expect(directiveFor(s, seatOf(s, 'blocker'))).toMatchObject({ kind: 'block', x: 33, y: 14 });
    expect(directiveFor(s, seatOf(s, 'escort'))).toMatchObject({ kind: 'escort' });
    expect(directiveFor(s, m.bossId)).toMatchObject({ kind: 'guard', x: 27, y: 12 }); // the boss keeps his booth
    put(s, 0, 9, 14); // now beside relay 1 (8, 14)
    expect(directiveFor(s, seatOf(s, 'meleeGuard'))).toMatchObject({ kind: 'guard', x: 8, y: 14 });
  });

  it('two guards: the blocker takes the next nearest relay; a fallen marshal is replaced by the next fighter', () => {
    const s = oshodi('hard', 2);
    put(s, 0, 50, 14);
    const marshal = seatOf(s, 'meleeGuard');
    const blocker = seatOf(s, 'blocker');
    expect(directiveFor(s, marshal)).toMatchObject({ kind: 'guard', x: 52, y: 14 });
    const second = directiveFor(s, blocker)!;
    expect(second.kind).toBe('guard');
    expect([second.x, second.y]).not.toEqual([52, 14]); // a different relay
    expect(directiveFor(s, seatOf(s, 'escort'))).toMatchObject({ kind: 'escort' });
    s.players[marshal]!.alive = false;
    expect(directiveFor(s, blocker)).toMatchObject({ kind: 'guard', x: 52, y: 14 }); // first in line now
    expect(directiveFor(s, seatOf(s, 'escort'))!.kind).toBe('guard'); // the escort is drafted for the second place
  });

  it('a jammed relay is not guarded; when every relay is jammed the fighters are back at their posts', () => {
    const s = oshodi('normal', 1);
    const m = s.mission!;
    put(s, 0, 50, 14);
    m.nodes.find((n) => n.id === 'r3')!.done = true;
    expect(directiveFor(s, seatOf(s, 'meleeGuard'))).not.toMatchObject({ x: 52, y: 14 });
    for (const n of m.nodes) n.done = true;
    expect(directiveFor(s, seatOf(s, 'meleeGuard'))).toMatchObject({ kind: 'guard', x: 26, y: 13 });
  });

  it('the moment the boss is exposed they return to their own role (the marshal hunts the player)', () => {
    const s = oshodi('hard', 2);
    const m = s.mission!;
    put(s, 0, 50, 14);
    expect(directiveFor(s, seatOf(s, 'meleeGuard'))!.kind).toBe('guard');
    m.phaseState = 'exposed';
    m.boss.shielded = false;
    expect(directiveFor(s, seatOf(s, 'meleeGuard'))!.kind).toBe('chase');
    expect(directiveFor(s, seatOf(s, 'blocker'))).toMatchObject({ kind: 'block', x: 33, y: 14 });
  });

  it('a dead player draws no guard, and a boss without a balance never has any', () => {
    const s = oshodi('hard', 2);
    s.players[0]!.alive = false;
    expect(directiveFor(s, seatOf(s, 'meleeGuard'))).toMatchObject({ x: 26, y: 13 });
    const options = buildMissionGame({
      spec: { id: 'mushin' },
      humanCharacter: 'streetBaller',
      seed: 3,
      level: 'hard',
    });
    const other = createGame(options);
    for (const q of other.mission!.seats)
      if (q.role !== 'player')
        expect(directiveFor(other, q.playerId)?.radius, q.role).not.toBe(BOSS_BALANCE.relayGuardRadius);
  });
});

describe('PI8: the real bots', () => {
  it('the marshal walks to the relay the player is at and holds it; the same seed replays the same fight', () => {
    const run = (): { dist: number; digest: string } => {
      const s = oshodi('hard', 1);
      const bots: Record<number, ReturnType<typeof createBot>> = {};
      s.players.slice(1).forEach((p, i) => {
        bots[p.id] = createBot({ difficulty: 'rookie', seed: 77 + i * 31, playerId: p.id });
      });
      const marshal = seatOf(s, 'meleeGuard');
      put(s, 0, 8, 12); // the player waits beside relay 1 (8, 14), out of everyone's way
      for (let t = 0; t < 60 * 40 && s.match.phase === 'playing'; t++) {
        const intents: Intents = { 0: {} };
        for (const [id, bot] of Object.entries(bots))
          if (s.players[Number(id)]!.alive) intents[Number(id)] = bot.decide(observe(s, Number(id)));
        tick(s, intents);
        s.players[0]!.vitals!.hp = s.players[0]!.vitals!.maxHp; // this scenario is about where it stands
        s.players[0]!.alive = true;
      }
      const p = s.players[marshal]!;
      return {
        dist: Math.max(Math.abs(p.x - 8), Math.abs(p.y - 14)),
        digest: JSON.stringify([s.players.map((q) => [q.x, q.y]), s.tick]),
      };
    };
    const a = run();
    expect(a.dist, 'the marshal came to the relay (from its post 18 tiles away)').toBeLessThanOrEqual(5);
    expect(run()).toEqual(a);
  }, 60_000);
});

describe('PI8: Easy is the production fight, bit for bit', () => {
  // the trace digests below were recorded on production 9491d92 (npx tsx scripts/boss-trace.ts --level easy), before relay
  // guards existed: the same scripted player, the same real bots, every tick of every seat folded into one hash
  it('the real Easy mission replays the production hashes', () => {
    const prod: Record<number, string> = { 101: '8d3ebd4b', 118: '485a9b0e' };
    for (const seed of [101, 118]) {
      const r = traceFight('oshodi', 'easy', seed, BOSS_HUMAN);
      expect(r.hash, `easy seed ${seed}`).toBe(prod[seed]);
      expect(r.result).toBe('won');
    }
  }, 120_000);

  it('Normal and Hard are won with the guards on (the fight is still beatable)', () => {
    for (const level of ['normal', 'hard'] as CampaignLevel[]) {
      const r = traceFight('oshodi', level, 101, BOSS_HUMAN);
      expect(r.result, level).toBe('won');
    }
  }, 120_000);
});
