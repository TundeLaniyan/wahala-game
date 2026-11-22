/**
 * One-hit lethality scenario (docs/TEST_LAB.md, decision TL9). The founder could not test one-blast kills because the
 * enemies walked away. Now each ordinary enemy (agbero, guard, thrower) holds a post by the entrance with its back to the
 * player. These tests PLAY it as a real player would, with intents only (walk, lay a generator, step out of the cross) and
 * the real enemy bot deciding, and check:
 *   - the player's position is reachable by walking from where the scenario puts him (a path over open floor exists);
 *   - the enemy never noticed him (no alert, no pursuit) before the blast, so the kill is not a chase;
 *   - one generator's blast eliminates it, credited to the human, on Easy and Normal, laid at any moment of the window;
 *   - nothing was forced: after `prepare` the only inputs are the human's `move` / `place` intents, the enemy's health and
 *     armour are the sim's own, and the human takes no damage.
 * Hard hears a generator laid beside it (decision CV2) and is not promised here.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../../src/ai';
import { DIRS, DIR_VEC, buildRaidGame, campaignEnemyLevel, createGame, observe, tick } from '../../src/sim';
import type { CampaignLevel, Dir, GameState, Intents, SimEvent, TilePos } from '../../src/sim';
import { RAID_TUNING } from '../../src/sim/raid';
import { ONE_HIT_POST, ONE_HIT_START, scenarioById } from '../../src/testlab/scenarios/defs';
import type { ScenarioId } from '../../src/testlab/scenarios/defs';
import { isOpen, key } from '../../src/testlab/scenarios/kit';

const AWAKE = 90 + RAID_TUNING.spawnWarnTicks + 10;
const BEHIND: TilePos = { x: ONE_HIT_POST.x - 1, y: ONE_HIT_POST.y };

function build(id: ScenarioId, level: CampaignLevel): GameState {
  const def = scenarioById(id)!;
  const state = createGame(
    buildRaidGame({
      raidId: def.raidId,
      humanCharacter: 'streetBaller',
      seed: def.seed,
      difficulty: campaignEnemyLevel(level),
      level,
      timeLimitSec: def.timeLimitSec,
    }),
  );
  def.prepare(state);
  return state;
}

/** The tiles a generator laid on `at` can burn: its own and the open ones in line within the base range (2). */
function cross(state: GameState, at: TilePos, range: number): Set<string> {
  const out = new Set([key(at)]);
  for (const d of DIRS)
    for (let i = 1; i <= range; i++) {
      const x = at.x + DIR_VEC[d].dx * i;
      const y = at.y + DIR_VEC[d].dy * i;
      if (!isOpen(state, x, y)) break;
      out.add(`${x},${y}`);
    }
  return out;
}

/** Shortest walk over open floor from `from` to the first tile satisfying `goal` (null: none). */
function walk(state: GameState, from: TilePos, goal: (t: TilePos) => boolean): Dir[] | null {
  const queue: { at: TilePos; path: Dir[] }[] = [{ at: from, path: [] }];
  const seen = new Set([key(from)]);
  for (let head = 0; head < queue.length; head++) {
    const { at, path } = queue[head]!;
    if (goal(at)) return path;
    for (const d of DIRS) {
      const next = { x: at.x + DIR_VEC[d].dx, y: at.y + DIR_VEC[d].dy };
      if (seen.has(key(next)) || !isOpen(state, next.x, next.y)) continue;
      seen.add(key(next));
      queue.push({ at: next, path: [...path, d] });
    }
  }
  return null;
}

interface Outcome {
  killed: boolean;
  killTicks: number;
  alertedBefore: boolean;
  humanHurt: boolean;
  elimination: Extract<SimEvent, { type: 'playerEliminated' }> | null;
  steps: number;
}

/** Plays the scenario as a player: waits `delay` ticks after the enemy wakes, walks behind it, lays, steps out. */
function play(id: ScenarioId, level: CampaignLevel, delay: number): Outcome {
  const state = build(id, level);
  const range = state.config.generator.baseRange;
  const bot = createBot({ difficulty: campaignEnemyLevel(level), seed: state.seed + 7919, playerId: 1 });
  const human = state.players[0]!;
  const enemy = state.players[1]!;
  const hp0 = human.vitals?.hp;
  const route = walk(state, { x: human.x, y: human.y }, (t) => t.x === BEHIND.x && t.y === BEHIND.y);
  expect(route, 'a walkable route to the tile behind the enemy').not.toBeNull();
  const toBehind = [...route!];
  let fled: Dir[] | null = null;
  let layTick = -1;
  const out: Outcome = {
    killed: false,
    killTicks: -1,
    alertedBefore: false,
    humanHurt: false,
    elimination: null,
    steps: route!.length,
  };
  for (let i = 0; i < AWAKE + delay + 400 && state.match.phase !== 'ended'; i++) {
    const intents: Intents = { 0: {} };
    if (enemy.alive) intents[1] = bot.decide(observe(state, 1));
    if (i >= AWAKE + delay && layTick < 0 && human.stepRemaining === 0) {
      if (human.x === BEHIND.x && human.y === BEHIND.y) {
        intents[0] = { place: true };
        layTick = i;
      } else {
        const d = toBehind.shift();
        if (d) intents[0] = { move: d };
      }
    } else if (layTick >= 0 && human.stepRemaining === 0) {
      if (!fled) {
        const c = cross(state, { x: human.x, y: human.y }, range);
        fled = walk(state, { x: human.x, y: human.y }, (t) => !c.has(key(t))) ?? [];
      }
      const d = fled.shift();
      if (d) intents[0] = { move: d };
    }
    const events = tick(state, intents);
    const mind = state.territory?.minds[1]?.state;
    if (!out.killed && (mind === 'alert' || mind === 'pursue')) out.alertedBefore = true;
    for (const e of events)
      if (e.type === 'playerEliminated' && e.playerId === 1) {
        out.killed = true;
        out.killTicks = layTick >= 0 ? i - layTick : -1;
        out.elimination = e;
      }
    if (human.vitals && hp0 !== undefined && human.vitals.hp < hp0) out.humanHurt = true;
    if (out.killed) break;
  }
  return out;
}

const KINDS: readonly [ScenarioId, string][] = [
  ['oneHitAgbero', 'agbero'],
  ['oneHitGuard', 'guard'],
  ['oneHitThrower', 'thrower'],
];

describe('one-hit lethality scenario (real rules, real bots, nothing forced)', () => {
  it('starts the player two steps from the tile behind the enemy, over open floor, outside its view', () => {
    for (const [id] of KINDS) {
      const s = build(id, 'normal');
      expect(s.players[0]!).toMatchObject({ x: ONE_HIT_START.x, y: ONE_HIT_START.y });
      expect(walk(s, ONE_HIT_START, (t) => t.x === BEHIND.x && t.y === BEHIND.y)).toHaveLength(2);
      // the enemy's spot is not on a conveyor belt (a belt would carry it off its post)
      const belts = new Set<string>();
      for (const b of s.raid!.belts ?? []) for (const t of b.tiles) belts.add(key(t));
      expect(belts.has(key(ONE_HIT_POST))).toBe(false);
      expect(belts.has(key(BEHIND))).toBe(false);
    }
  });

  for (const [id, kind] of KINDS)
    for (const level of ['easy', 'normal'] as const)
      it(`${kind} at ${level}: one generator laid from behind kills it, laid at any moment of the first 1.5 s`, () => {
        for (const delay of [0, 30, 60, 90]) {
          const r = play(id, level, delay);
          const tag = `${kind} ${level} delay ${delay}`;
          expect(r.killed, tag).toBe(true);
          expect(r.alertedBefore, `${tag}: it never noticed the player`).toBe(false);
          expect(r.humanHurt, `${tag}: the player was not hurt`).toBe(false);
          // the fuse (3 s) and nothing else: laid then the generator exploded, one blast, credited to the human
          expect(r.killTicks).toBeGreaterThanOrEqual(170);
          expect(r.killTicks).toBeLessThanOrEqual(215);
          expect(r.elimination!.creditId).toBe(0);
          expect(r.elimination!.cause).toMatchObject({ kind: 'flame', ownerId: 0 }); // the human's own generator's flame
        }
      });

  it('nothing is forced: the enemy keeps its own health, armour and bot, and only the human’s intents are sent', () => {
    for (const [id, kind] of KINDS) {
      const s = build(id, 'normal');
      const e = s.players[1]!;
      expect(e.enemyKind).toBe(kind);
      expect(e.armour ?? 0).toBe(0);
      expect(e.protectedUntil ?? 0).toBeLessThanOrEqual(s.tick);
      expect(s.config.campaignTactics!.classicRaid!.blastDefeats).toContain(kind);
    }
  });

  it('Hard hears a generator laid beside it (decision CV2): the scenario does not promise a kill there', () => {
    const r = play('oneHitGuard', 'hard', 0);
    expect(r.killed).toBe(false);
  });
});
