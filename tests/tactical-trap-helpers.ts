/**
 * Shared scenes for the Tactical Trap pilot tests (docs/TACTICAL_TRAP_PILOT.md): the real Danfo Bus Park board with its
 * crates cleared (concrete pillars on every odd / odd tile, so every even row and even column is an open lane), a human
 * with campaign health on seat 0 and enemy seats (team 1) after him, with the pilot's config layer on.
 */
import { EnemyBot } from '../src/ai/enemyBot';
import { observe, tacticalTrapLayer, tick } from '../src/sim';
import type { EnemyKind, GameState, Intents } from '../src/sim';
import { Tile } from '../src/sim/types';
import { enemyScene } from '../scripts/lib/enemyScene';
import type { SceneOptions } from '../scripts/lib/enemyScene';
import { addGenerator } from './helpers';

export interface TrapSceneOptions {
  human: [number, number];
  enemies: { kind: EnemyKind; at: [number, number]; hp?: number }[];
  seed?: number;
  /** false = the same scene without the pilot key (the legacy / EF1 baseline). */
  pilot?: boolean;
  humanHp?: number;
  config?: SceneOptions['config'];
}

export function trapScene(o: TrapSceneOptions): GameState {
  const s = enemyScene({
    human: { x: o.human[0], y: o.human[1], hp: o.humanHp ?? 4 },
    enemies: o.enemies.map((e) => ({ kind: e.kind, x: e.at[0], y: e.at[1], hp: e.hp })),
    seed: o.seed ?? 1,
    arenaId: 'danfoBusPark',
    config: o.pilot === false ? o.config : { ...tacticalTrapLayer(), ...o.config },
  });
  for (const p of s.players) p.facing = 'left';
  return s;
}

/** A bot per enemy seat (Casual, the campaign Normal baseline) keyed by seat id. */
export function botsFor(s: GameState, seed = 1): Record<number, EnemyBot> {
  const out: Record<number, EnemyBot> = {};
  for (const p of s.players)
    if (p.enemyKind) out[p.id] = new EnemyBot({ difficulty: 'casual', seed: seed + p.id, playerId: p.id });
  return out;
}

/** One tick: every enemy bot decides from its own observation, `human` is the scripted human's intent. */
export function stepWithBots(
  s: GameState,
  bots: Record<number, EnemyBot>,
  human: Intents[number] = {},
): ReturnType<typeof tick> {
  const intents: Intents = { 0: human };
  for (const [id, bot] of Object.entries(bots))
    if (s.players[Number(id)]!.alive) intents[Number(id)] = bot.decide(observe(s, Number(id)));
  return tick(s, intents);
}

/** The ids of the generators this bot takes seriously now (their fuse is shown to its planner). */
export function knownIds(bot: EnemyBot, s: GameState, id: number): number[] {
  return bot
    .perceive(observe(s, id))
    .generators.filter((g) => g.timer < 1_000_000)
    .map((g) => g.id);
}

export { addGenerator, Tile };
