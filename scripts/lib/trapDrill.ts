/**
 * Scripted generator-trap drills for the Tactical Trap pilot (docs/TACTICAL_TRAP_PILOT.md, decision TT9): a scripted
 * human with ORDINARY intents only (walk, A, B) lays one generator beside a real enemy bot and the match runs on. Used
 * by `tests/tactical-trap-evasion.test.ts` and `scripts/tactical-trap.ts`. Real simulation, no rendering, no clock,
 * no Math.random.
 *
 * Three perception models are compared on the same scene:
 *   perfect  the enemy sees every generator the moment it appears (the EF1 awareness knobs set to "instant")
 *   ef1      the campaign baseline (decision EF1: late in a brawl, soon when calm)
 *   trap     the pilot (line of sight, body concealment, memory, hearing)
 *
 * and three human plans, all of which stand on the generator tile beside an enemy next to him on the bottom lane and
 * leave up the open column x = 6 (three tiles, out of the cross) before it blows:
 *   flee   leave at once
 *   cover  stay on the generator (the body hides it) and leave when 0.7 s of fuse are left
 *   combo  stay and punch whenever the punch is ready (slows and staggers the enemy), leave when 0.7 s are left
 */
import { EnemyBot } from '../../src/ai/enemyBot';
import { DEFAULT_CONFIG, observe, previewBlast, tacticalTrapLayer, tick } from '../../src/sim';
import type { EnemyKind, GameState, Intents } from '../../src/sim';
import { enemyScene } from './enemyScene';
import { classicLanes } from './trapBoard';

export type PerceptionModel = 'perfect' | 'ef1' | 'trap';
export type HumanPlan = 'flee' | 'cover' | 'combo';

export interface DrillResult {
  /** The enemy was inside the blast footprint when the generator was laid. */
  exposed: boolean;
  /** The enemy took the blast (lost health to it or was eliminated). */
  hit: boolean;
  /** The enemy was eliminated by the blast. */
  killed: boolean;
  /** The human took a segment from his own blast (a failed drill). */
  selfHit: boolean;
}

const LEAVE_FUSE = Number(process.env.TRAP_LEAVE ?? 34);

function sceneFor(kind: EnemyKind, model: PerceptionModel, seed: number): GameState {
  const instant = { reactTicks: 0, focusTiles: 99, alertTicks: 100000, slipChance: 0, slipTicks: 0 };
  const config =
    model === 'perfect'
      ? { enemyAttacks: { awareness: { [kind]: instant } } }
      : model === 'trap'
        ? tacticalTrapLayer()
        : undefined;
  const s = enemyScene({
    human: { x: 6, y: 10, hp: 99 },
    enemies: [{ kind, x: 7, y: 10, hp: kind === 'agbero' ? 1 : 2 }],
    seed,
    arenaId: 'danfoBusPark',
    config: config as never,
  });
  classicLanes(s);
  s.players[0]!.facing = 'right';
  s.players[1]!.facing = 'left';
  return s;
}

/** One drill: the human lays the generator on tick `delay` and follows `plan`; 8 s are played. */
export function runDrill(
  kind: EnemyKind,
  model: PerceptionModel,
  plan: HumanPlan,
  seed: number,
): DrillResult {
  const s = sceneFor(kind, model, seed);
  const bot = new EnemyBot({ difficulty: 'casual', seed: seed * 31 + 7, playerId: 1 });
  const delay = seed % 24;
  const trace = process.env.TRAP_TRACE === '1';
  const res: DrillResult = { exposed: false, hit: false, killed: false, selfHit: false };
  let placedAt = -1;
  let leaving = false;
  for (let i = 0; i < 480; i++) {
    const intents: Intents = {};
    const me = s.players[0]!;
    const g = s.generators.find((o) => o.ownerId === 0);
    if (!g && placedAt < 0 && i >= delay) {
      intents[0] = { place: true };
    } else if (g && !leaving) {
      const left = g.timer;
      if (plan === 'flee' || left <= LEAVE_FUSE) leaving = true;
      else if (plan === 'combo' && s.tick >= me.skillReadyTick) intents[0] = { special: true };
    }
    if (leaving && me.alive) intents[0] = { move: 'up' };
    if (s.players[1]!.alive) intents[1] = bot.decide(observe(s, 1));
    const wasGen = s.generators.length;
    const ev = tick(s, intents);
    if (trace && i % 6 === 0)
      console.log(
        i,
        'me',
        s.players[0]!.x,
        s.players[0]!.y,
        'en',
        s.players[1]!.x,
        s.players[1]!.y,
        'gen',
        s.generators[0]?.timer,
        'root',
        s.players[1]!.rootedUntil - s.tick,
        'daze',
        s.players[1]!.dazedUntil - s.tick,
        'slow',
        (s.players[1]!.slow?.until ?? 0) - s.tick,
        'hp',
        s.players[1]!.vitals!.hp,
      );
    if (placedAt < 0 && s.generators.length > wasGen) {
      placedAt = s.tick;
      const g2 = s.generators[0]!;
      const e = s.players[1]!;
      res.exposed = new Set(previewBlast(s, g2)).has(e.y * s.width + e.x);
    }
    for (const e of ev) {
      if (
        e.type === 'campaignHit' &&
        e.victimId === 1 &&
        e.source === 'blast' &&
        (e.result === 'damaged' || e.result === 'defeated')
      )
        res.hit = true;
      if (e.type === 'campaignHit' && e.victimId === 0 && e.source === 'blast' && e.result === 'damaged')
        res.selfHit = true;
      if (e.type === 'playerEliminated' && e.playerId === 1 && e.cause.kind === 'flame') {
        res.killed = true;
        res.hit = true;
      }
    }
    if (placedAt >= 0 && s.tick > placedAt + DEFAULT_CONFIG.generator.fuseTicks + 60) break;
  }
  return res;
}

export interface DrillSummary {
  runs: number;
  exposed: number;
  hit: number;
  killed: number;
  selfHit: number;
}

export function summarise(
  kind: EnemyKind,
  model: PerceptionModel,
  plan: HumanPlan,
  seeds: number,
): DrillSummary {
  const out: DrillSummary = { runs: seeds, exposed: 0, hit: 0, killed: 0, selfHit: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    const r = runDrill(kind, model, plan, seed);
    if (r.exposed) out.exposed++;
    if (r.exposed && r.hit) out.hit++;
    if (r.killed) out.killed++;
    if (r.selfHit) out.selfHit++;
  }
  return out;
}
