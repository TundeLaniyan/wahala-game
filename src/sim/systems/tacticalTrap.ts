/**
 * THE TACTICAL TRAP PILOT rules (docs/TACTICAL_TRAP_PILOT.md, decisions TT1-TT10). Every function here is inert unless
 * the match carries `config.tacticalTrap`, which only the Academy "Generator Tactics" scenarios set. It concerns the
 * campaign HUMAN (no `enemyKind`) and the campaign ENEMY seats only.
 *
 *   slow stacking (TT5)   a punch of the human that LANDS on an enemy slows it: the 1st hit 25 % slower for 90 ticks,
 *                         the 2nd raises it to the 40 % cap and keeps it running 90 ticks from that hit; a 3rd changes
 *                         nothing; the whole chain ends 150 ticks after its first hit and the enemy then resists
 *                         another slow for 120 ticks. The percentages become integer extra step ticks of the enemy's
 *                         own step (`slowExtraStepTicks`): the 10-tick step gets +3 and +7.
 *   non-lethal punch (TT6) a punch takes an enemy down to its floor (1 segment; half the health of a lieutenant or a
 *                         boss) and no further: only a generator blast, a trap or another lethal source finishes it.
 *   attack phases (TT4)   `enemyAttackPhase`: idle / windup / attack / recovery, derived from the sim state alone (for
 *                         the AI, tests and presentation: nothing here changes a rule).
 *
 * Nothing here is random; the only state is `GameState.tacticalTrap.slows`, created on the first slowing hit.
 */
import type { TacticalTrapConfig } from '../config';
import { ENEMY_KINDS } from '../data/enemies';
import type { GameState, Player } from '../types';
import { playerStepTicks } from './queries';

export const trapOf = (state: { readonly config: GameState['config'] }): TacticalTrapConfig | null =>
  state.config.tacticalTrap ?? null;

/** Is this hit the human's on an enemy seat (the only hits the pilot touches)? */
export const isHumanOnEnemy = (attacker: Readonly<Player>, victim: Readonly<Player>): boolean =>
  attacker.enemyKind === undefined && victim.enemyKind !== undefined;

// ------------------------------------------------------------------ slow stacking

/**
 * Extra ticks per tile that realise a speed loss of `share` on a step of `base` ticks: base / (1 - share) - base,
 * rounded, at least 1. Base 10: 25 % -> +3 (13 ticks, 23.1 % slower), 40 % -> +7 (17 ticks, 41.2 % slower).
 */
export function slowExtraStepTicks(base: number, share: number): number {
  return Math.max(1, Math.round(base / (1 - share) - base));
}

/** The speed loss that `extra` ticks on a `base` step really give (documentation and tests). */
export const realisedSlow = (base: number, extra: number): number => 1 - base / (base + extra);

/**
 * A landed punch of the human slows `target` (stacking rules in the file header). Called from `skills.ts` after a hit
 * that reached the enemy (health lost or a daze; never an invulnerable or blocked one).
 */
export function trapSlowOnHit(state: GameState, target: Player): void {
  const cfg = trapOf(state);
  if (!cfg || !target.alive) return;
  const rt = (state.tacticalTrap ??= { slows: {} });
  const tick = state.tick;
  const running = target.slow !== null && tick < target.slow.until;
  let chain = rt.slows[target.id];
  if (running && chain) {
    // a second (or later) hit inside the running slow: raise it to the cap once, never past it
    if (chain.stacks >= cfg.slow.levels.length) return;
    chain.stacks++;
  } else {
    if (tick < target.slowImmuneUntil) return; // resisting: the last slow has only just ended
    chain = rt.slows[target.id] = { stacks: 1, firstTick: tick };
  }
  const base = playerStepTicks(state, target) - (running ? target.slow!.extraStepTicks : 0);
  const share = cfg.slow.levels[chain.stacks - 1]!;
  const until = Math.min(
    chain.firstTick + cfg.slow.maxTotalTicks,
    Math.max(running ? target.slow!.until : 0, tick + cfg.slow.durationTicks),
  );
  target.slow = { until, extraStepTicks: slowExtraStepTicks(base, share) };
  target.slowImmuneUntil = until + cfg.slow.resistTicks;
}

// ------------------------------------------------------------------ the non-lethal punch

/** The health a punch can never take `p` below (never under 1 segment). */
export function punchFloor(state: { readonly config: GameState['config'] }, p: Readonly<Player>): number {
  const cfg = trapOf(state);
  const max = p.vitals?.maxHp ?? 1;
  if (!cfg || !p.enemyKind) return 0;
  return Math.max(1, Math.ceil(max * cfg.punchFloorShare[p.enemyKind]));
}

/** The segments a punch of `damage` may take from `target` in a pilot scenario: never below the floor. */
export function trapPunchDamage(state: GameState, target: Readonly<Player>, damage: number): number {
  if (!trapOf(state) || !target.vitals) return damage;
  return Math.max(0, Math.min(damage, target.vitals.hp - punchFloor(state, target)));
}

// ------------------------------------------------------------------ attack phases

/** Outside a pilot scenario the phase helper uses this attack-phase length (the pilot's own value is `attack.activeTicks`). */
const TACTICAL_TRAP_ACTIVE_FALLBACK = 6;

export type AttackPhase = 'idle' | 'windup' | 'attack' | 'recovery';

type PhaseView = Pick<GameState, 'tick' | 'config'> & { readonly projectiles?: GameState['projectiles'] };

/**
 * The readable state of an enemy's attack (decision TT4), from the sim state alone:
 *   windup    a punch is pending (`Player.attack`) or a throw's cue is running: the enemy is planted, visibly committed;
 *   attack    the swing resolved / the object left within `attack.activeTicks` ticks ago;
 *   recovery  planted after the attack (`rootedUntil`): the punishable window;
 *   idle      none of the above.
 * Seats without `enemyKind` are always idle. It needs no `tacticalTrap` key: the phases exist in every match.
 */
export function enemyAttackPhase(view: PhaseView, p: Readonly<Player>): AttackPhase {
  if (p.enemyKind === undefined || !p.alive) return 'idle';
  const t = view.tick;
  if (p.attack !== null) return 'windup';
  const active = view.config.tacticalTrap?.attack.activeTicks ?? TACTICAL_TRAP_ACTIVE_FALLBACK;
  let throwEnd = -Infinity;
  for (const pr of view.projectiles ?? []) {
    if (pr.ownerId !== p.id) continue;
    const end = pr.launchTick + (pr.warnTicks ?? 0);
    if (t < end) return 'windup';
    throwEnd = Math.max(throwEnd, end);
  }
  if (p.lastAttack !== null && t - p.lastAttack.endTick < active) return 'attack';
  if (t - throwEnd < active) return 'attack';
  if (t < p.rootedUntil) return 'recovery';
  return 'idle';
}

/** Wind-up ticks of an enemy's punch (catalogue startup + the enemy's extra), for the invariants of the pilot. */
export function windupTicks(config: GameState['config'], kind: NonNullable<Player['enemyKind']>): number {
  const spec = config.enemyAttacks.melee[kind];
  return spec ? config.skills.attacks[spec.attack].startupTicks + spec.extraStartupTicks : 0;
}

/** Ticks per tile of an enemy kind with no slow (its own step), for documentation and the AI tests. */
export const kindStepTicks = (config: GameState['config'], kind: NonNullable<Player['enemyKind']>): number =>
  config.movement.stepTicksBySpeedLevel[0]! + ENEMY_KINDS[kind].stepPenaltyTicks;
