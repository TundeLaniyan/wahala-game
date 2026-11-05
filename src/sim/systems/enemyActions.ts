/**
 * Campaign enemy attack behaviour (decisions EA1-EA3, docs/CAMPAIGN_ATTACKS.md). An enemy seat (`Player.enemyKind`)
 * acts through the SAME single B press as everyone, resolved here from `actions.ts`:
 *
 *   1. a rival on an ADJACENT tile (faced tile first)   -> the enemy's punch (its kind's `config.enemyAttacks.melee`),
 *                                                          slower than the player's: a fast jab cuts the wind-up short
 *   2. else a kind that throws, with a rival in a clear cardinal line `minRange..range` tiles away
 *                                                       -> a projectile (projectiles.ts), a visible cue first
 *   3. otherwise nothing
 *
 * Enemies never use generators (`tryPlaceGenerator` ignores them). Their harm goes through `applyCampaignHit` and is
 * rate-limited: per-enemy cooldowns, a per-group throw gap, caps in flight, and a free window after every hit.
 * Lieutenants and bosses may also ANNOUNCE a reinforcement call (`updateEnemyCalls`); the mission / raid runtime
 * decides what answers it - nothing is spawned here.
 */
import { DIRS, DIR_VEC, manhattan, tileAt } from '../grid';
import type { GridView } from '../grid';
import { Tile } from '../types';
import type { Dir, GameState, Player, SimEvent } from '../types';
import type { GameConfig } from '../config';
import { ENEMY_ATTACK_SETS } from '../data/enemyAttacks';
import { applyCampaignHit } from './campaignDamage';
import { enemyFireOf, canThrowNow, launchProjectile, sameSide } from './projectiles';
import { alivePlayers } from './queries';
import { attackReady, attackable, beginAttack, meleeTarget } from './skills';

type RivalView = GridView & {
  readonly tick: number;
  readonly players: readonly Readonly<Player>[];
  readonly config: GameConfig;
};

// ---------------------------------------------------------------- melee

/** The rival an enemy punch could start on (adjacent, hittable now), or null. Read-only: bots use it with their Observation. */
export function enemyMeleeTarget<V extends RivalView>(
  view: V,
  p: Readonly<Player>,
): { target: Readonly<Player>; dir: Dir } | null {
  const kind = p.enemyKind;
  const spec = kind ? view.config.enemyAttacks.melee[kind] : null;
  if (!spec) return null;
  return meleeTarget(view, p, (o) => attackable(view, view.tick, p, o, spec.attack) && !sameSide(p, o));
}

/**
 * Starts an enemy punch: the catalogue attack's animation and startup, plus the enemy's slower wind-up and its
 * cooldown. 'started' = a punch began; 'claimed' = a rival is adjacent so B is spent on nothing (cooldown, free
 * window ...: never a surprise throw at point blank); 'none' = nobody to punch.
 */
function beginEnemyMelee(state: GameState, p: Player, events: SimEvent[]): 'started' | 'claimed' | 'none' {
  const spec = state.config.enemyAttacks.melee[p.enemyKind!];
  if (!spec) return 'none';
  const found = enemyMeleeTarget(state, p);
  if (!found) return 'none';
  const fire = enemyFireOf(state);
  if (state.tick < (fire.nextPunchTick[p.id] ?? 0) || !attackReady(state, p, spec.attack)) return 'claimed';
  if (state.tick < (fire.victimSafeUntil[found.target.id] ?? 0)) return 'claimed'; // the free window: no point
  if (!beginAttack(state, p, state.players[found.target.id]!, found.dir, events, spec.attack))
    return 'claimed';
  const pending = p.attack!;
  pending.resolveTick += spec.extraStartupTicks;
  // the view reads the wind-up from the event the press just emitted
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type === 'attackStarted' && e.playerId === p.id) {
      e.resolveTick = pending.resolveTick;
      break;
    }
  }
  p.rootedUntil = Math.max(p.rootedUntil, pending.resolveTick); // the wind-up plants the puncher
  fire.nextPunchTick[p.id] = state.tick + spec.cooldownTicks;
  return 'started';
}

/**
 * An enemy punch connected (called from `skills.ts` when the attacker is an enemy and the victim has campaign health):
 * the harm goes through `applyCampaignHit`, never the multiplayer daze.
 */
export function enemyMeleeHit(
  state: GameState,
  p: Player,
  target: Player,
  dir: Dir,
  events: SimEvent[],
): void {
  const spec = state.config.enemyAttacks.melee[p.enemyKind!];
  if (!spec) return;
  const fire = enemyFireOf(state);
  if (state.tick < (fire.victimSafeUntil[target.id] ?? 0)) {
    // inside the free window after an earlier enemy hit: shown, not silent
    events.push({
      type: 'campaignHit',
      victimId: target.id,
      byId: p.id,
      source: 'punch',
      result: 'invulnerable',
      damage: 0,
      hpAfter: target.vitals?.hp ?? 0,
      maxHp: target.vitals?.maxHp ?? 0,
      dazeTicks: 0,
      x: target.x,
      y: target.y,
    });
    return;
  }
  const result = applyCampaignHit(
    state,
    {
      victimId: target.id,
      byId: p.id,
      source: 'punch',
      damage: spec.damage,
      dazeTicks: spec.dazeTicks,
      knockback: spec.knockbackTiles > 0 ? { dir, tiles: spec.knockbackTiles } : null,
    },
    events,
  );
  if (result === 'damaged' || result === 'dazed' || result === 'defeated')
    fire.victimSafeUntil[target.id] = state.tick + spec.dazeTicks + state.config.enemyAttacks.victimFreeTicks;
}

// ---------------------------------------------------------------- throws

/** The shortest range among the objects this kind throws (a line valid for every one of them), 0 = never throws. */
export function throwReach(
  config: Pick<GameConfig, 'enemyAttacks'>,
  p: Readonly<Pick<Player, 'enemyKind'>>,
): number {
  const kinds = p.enemyKind ? ENEMY_ATTACK_SETS[p.enemyKind].thrown : [];
  if (kinds.length === 0) return 0;
  return Math.min(...kinds.map((k) => config.enemyAttacks.projectiles[k].range));
}

export interface ThrowChoice {
  dir: Dir;
  target: Readonly<Player>;
  /** Tiles between the thrower and the target. */
  distance: number;
}

/**
 * The line a throw would take: the nearest rival in a CLEAR cardinal line (only floor between, no ally in the way) at
 * `minRange..reach` tiles; the faced direction wins ties. Read-only (an Observation qualifies).
 */
export function chooseThrow(view: RivalView, p: Readonly<Player>): ThrowChoice | null {
  const reach = throwReach(view.config, p);
  if (reach === 0) return null;
  const minRange = view.config.enemyAttacks.minRange;
  const order: Dir[] = [p.facing, ...DIRS.filter((d) => d !== p.facing)];
  let best: ThrowChoice | null = null;
  for (const dir of order) {
    const v = DIR_VEC[dir];
    for (let k = 1; k <= reach; k++) {
      const x = p.x + v.dx * k;
      const y = p.y + v.dy * k;
      if (tileAt(view, x, y) !== Tile.Empty) break;
      const here = view.players.filter((o) => o.alive && o.id !== p.id && o.x === x && o.y === y);
      if (here.some((o) => sameSide(p, o))) break; // never through the thrower's own side
      const rival = here[0];
      if (!rival) continue;
      if (k >= minRange && (best === null || k < best.distance)) best = { dir, target: rival, distance: k };
      break;
    }
  }
  return best;
}

// ---------------------------------------------------------------- the B press

/**
 * What B does for an enemy seat. Returns 'melee' when a punch was started or claimed the press; a throw returns null
 * (its event is `projectileLaunched`). The caller has already checked that the seat can act.
 */
export function resolveEnemySpecial(state: GameState, p: Player, events: SimEvent[]): 'melee' | null {
  const punch = beginEnemyMelee(state, p, events);
  if (punch !== 'none') return punch === 'started' ? 'melee' : null;
  const choice = chooseThrow(state, p);
  if (choice && canThrowNow(state, p)) launchProjectile(state, p, choice.dir, events);
  return null;
}

// ---------------------------------------------------------------- reinforcement calls

/**
 * Lieutenants and bosses announce a call for help when badly hurt (campaign health at or below
 * `reinforce.belowHpShare`) or when their group is down to `aloneAtMost`, while a rival is in sight. Bounded per
 * caller (`maxCalls`, `cooldownTicks`). Only an announcement (`reinforcementCalled` + `state.enemyFire.calls`): the
 * mission / raid runtime decides who arrives.
 */
export function updateEnemyCalls(state: GameState, events: SimEvent[]): void {
  const cfg = state.config.enemyAttacks;
  if (state.enemyFire) state.enemyFire.calls = state.enemyFire.calls.filter((c) => c.untilTick > state.tick);
  for (const p of state.players) {
    if (!p.alive || p.enemyKind === undefined || !ENEMY_ATTACK_SETS[p.enemyKind].calls) continue;
    const fire = state.enemyFire;
    if ((fire?.callsMade[p.id] ?? 0) >= cfg.reinforce.maxCalls[p.enemyKind]) continue;
    if (state.tick < (fire?.nextCallTick[p.id] ?? 0)) continue;
    if (state.tick < p.dazedUntil) continue;
    const rival = alivePlayers(state).some(
      (o) => o.enemyKind === undefined && !sameSide(p, o) && manhattan(p, o) <= cfg.aggroTiles,
    );
    if (!rival) continue;
    const group = state.players.filter(
      (o) => o.alive && o.enemyKind !== undefined && o.team === p.team,
    ).length;
    const hurt = p.vitals !== undefined && p.vitals.hp <= p.vitals.maxHp * cfg.reinforce.belowHpShare;
    if (!hurt && group > cfg.reinforce.aloneAtMost) continue;
    const f = enemyFireOf(state);
    f.callsMade[p.id] = (f.callsMade[p.id] ?? 0) + 1;
    f.nextCallTick[p.id] = state.tick + cfg.reinforce.cooldownTicks;
    const call = {
      id: state.nextId++,
      callerId: p.id,
      team: p.team,
      x: p.x,
      y: p.y,
      count: cfg.reinforce.count[p.enemyKind],
      tick: state.tick,
      untilTick: state.tick + cfg.reinforce.answerTicks,
    };
    f.calls.push(call);
    events.push({
      type: 'reinforcementCalled',
      callId: call.id,
      callerId: p.id,
      enemyKind: p.enemyKind,
      team: p.team,
      x: p.x,
      y: p.y,
      count: call.count,
      untilTick: call.untilTick,
    });
  }
}
