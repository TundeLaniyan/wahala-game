/**
 * Thrown objects (campaign enemies: bottles, bricks, stones, tools). Readable by design (decisions EA1-EA3):
 *
 *   1. LAUNCH CUE   `projectileLaunched` is emitted the tick the enemy commits, with the full tile `path`, the
 *                   `warnTicks` of telegraph and the `stepTicks` per tile. The thrower is rooted for the cue.
 *                   Nothing moves yet: a rival can read the line and step off it.
 *   2. FLIGHT       the object reaches path tile `i` at `launchTick + warnTicks + (i + 1) * stepTicks`.
 *   3. COLLISION    on each arrival, in this order: a wall / hard block / soft block stops it (`wall`); an ally of the
 *                   thrower on the tile stops it harmlessly (`blocked`: it never passes through its own team); a rival
 *                   standing there is hit through `applyCampaignHit` (the result of that hit is the event's `result`:
 *                   damaged, dazed, blockedArmour, blockedOkada, defeated), or `invulnerable` while the free window
 *                   after an earlier enemy hit runs; the end of the path is `expired`.
 *   A rival who left the line before the arrival tick is missed: the DODGE. Hitting or dazing the thrower during the
 *   cue cancels the throw (`expired` at the thrower's tile).
 *
 * Tick driven, no RNG. `state.projectiles` is absent in every normal match, and `updateProjectiles` returns at once.
 */
import { DIR_VEC, tileAt } from '../grid';
import type { GridView } from '../grid';
import { Tile } from '../types';
import type { Dir, GameState, Player, SimEvent } from '../types';
import type { EnemyFireState, Projectile, ThrownKind } from '../campaign/types';
import { thrownKindFor } from '../data/enemyAttacks';
import { applyCampaignHit } from './campaignDamage';
import { teammates } from './queries';

/** The bookkeeping object, created on first use (never in a normal match). */
export function enemyFireOf(state: GameState): EnemyFireState {
  state.enemyFire ??= {
    nextThrowTick: {},
    nextPunchTick: {},
    throwCount: {},
    groupNextThrowTick: {},
    victimSafeUntil: {},
    callsMade: {},
    nextCallTick: {},
    calls: [],
  };
  return state.enemyFire;
}

/** Enemies never hurt each other and a thrown object never passes through the thrower's team. */
export function sameSide(a: Readonly<Pick<Player, 'id' | 'team' | 'enemyKind'>>, b: typeof a): boolean {
  return a.id !== b.id && (teammates(a, b) || (a.enemyKind !== undefined && b.enemyKind !== undefined));
}

/** The tick a projectile reaches path tile `index`. */
export const arrivalTick = (
  p: Pick<Projectile, 'launchTick' | 'stepTicks' | 'warnTicks'>,
  index: number,
): number => p.launchTick + (p.warnTicks ?? 0) + (index + 1) * p.stepTicks;

/**
 * The tiles a throw from (x, y) along `dir` passes over (indices y * width + x), at most `range`. A blocking tile
 * (wall, hard or soft block) ends the path and is its LAST element, so the view can show the impact; the path never
 * leaves the board.
 */
export function throwPath(grid: GridView, x: number, y: number, dir: Dir, range: number): number[] {
  const v = DIR_VEC[dir];
  const path: number[] = [];
  for (let k = 1; k <= range; k++) {
    const tx = x + v.dx * k;
    const ty = y + v.dy * k;
    if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) break;
    path.push(ty * grid.width + tx);
    if (tileAt(grid, tx, ty) !== Tile.Empty) break;
  }
  return path;
}

/** Projectiles currently flying (or cueing) for one group (team). */
const flyingOf = (state: GameState, team: number): number =>
  (state.projectiles ?? []).filter((q) => state.players[q.ownerId]?.team === team).length;

/** May `p` throw right now (cooldown, group rate, caps)? Does not look at targets. */
export function canThrowNow(state: GameState, p: Readonly<Player>): boolean {
  if (p.enemyKind === undefined) return false;
  const kind = thrownKindFor(p.enemyKind, state.enemyFire?.throwCount[p.id] ?? 0);
  if (kind === null) return false;
  const cfg = state.config.enemyAttacks;
  const fire = state.enemyFire;
  if (state.tick < (fire?.nextThrowTick[p.id] ?? 0)) return false; // its own cooldown
  if (state.tick < (fire?.groupNextThrowTick[p.team] ?? 0)) return false; // the group's rate: never all at once
  const flying = state.projectiles ?? [];
  return flying.length < cfg.maxInFlight && flyingOf(state, p.team) < cfg.maxInFlightPerGroup;
}

/**
 * Starts a throw along `dir` (the caller has checked the line). Emits the launch cue; the thrower is rooted for the
 * cue. Returns the projectile, or null when it may not throw now or there is no room for a path.
 */
export function launchProjectile(
  state: GameState,
  p: Player,
  dir: Dir,
  events: SimEvent[],
): Projectile | null {
  if (p.enemyKind === undefined || !canThrowNow(state, p)) return null;
  const cfg = state.config.enemyAttacks;
  const fire = enemyFireOf(state);
  const kind: ThrownKind = thrownKindFor(p.enemyKind, fire.throwCount[p.id] ?? 0)!;
  const spec = cfg.projectiles[kind];
  const path = throwPath(state, p.x, p.y, dir, spec.range);
  if (path.length === 0) return null;
  const warnTicks = Math.max(spec.warnTicks, cfg.minWarnTicks);
  const proj: Projectile = {
    id: state.nextId++,
    ownerId: p.id,
    kind,
    path,
    stepTicks: spec.stepTicks,
    launchTick: state.tick,
    index: 0,
    strong: spec.strong,
    warnTicks,
    dir,
  };
  (state.projectiles ??= []).push(proj);
  fire.throwCount[p.id] = (fire.throwCount[p.id] ?? 0) + 1;
  fire.nextThrowTick[p.id] = state.tick + Math.max(spec.cooldownTicks, warnTicks);
  fire.groupNextThrowTick[p.team] = state.tick + cfg.groupGapTicks;
  p.facing = dir;
  p.rootedUntil = Math.max(p.rootedUntil, state.tick + warnTicks); // the cue: the thrower commits and is planted
  events.push({
    type: 'projectileLaunched',
    id: proj.id,
    ownerId: p.id,
    kind,
    strong: spec.strong,
    fromX: p.x,
    fromY: p.y,
    path: [...path],
    stepTicks: spec.stepTicks,
    launchTick: state.tick,
    warnTicks,
  });
  return proj;
}

/** Moves every projectile whose next arrival tick has come and resolves what it meets. */
export function updateProjectiles(state: GameState, events: SimEvent[]): void {
  const list = state.projectiles;
  if (!list || list.length === 0) return;
  const keep: Projectile[] = [];
  for (const proj of list) {
    if (stepProjectile(state, proj, events)) keep.push(proj);
  }
  state.projectiles = keep;
}

/** Returns whether the projectile is still alive after this tick. */
function stepProjectile(state: GameState, proj: Projectile, events: SimEvent[]): boolean {
  const owner = state.players[proj.ownerId];
  const cueing = state.tick < proj.launchTick + (proj.warnTicks ?? 0);
  if (cueing) {
    // a thrower who is hit, dazed, knocked down or out during the cue loses the throw
    if (!owner || !owner.alive || state.tick < owner.dazedUntil || state.tick < owner.knockedUntil) {
      events.push({
        type: 'projectileHit',
        id: proj.id,
        kind: proj.kind,
        victimId: null,
        result: 'expired',
        x: owner?.x ?? 0,
        y: owner?.y ?? 0,
      });
      return false;
    }
    return true;
  }
  while (proj.index < proj.path.length && state.tick >= arrivalTick(proj, proj.index)) {
    const tile = proj.path[proj.index]!;
    const x = tile % state.width;
    const y = Math.floor(tile / state.width);
    if (tileAt(state, x, y) !== Tile.Empty) return end(proj, null, 'wall', x, y, events);
    const victim = state.players.find((q) => q.alive && q.id !== proj.ownerId && q.x === x && q.y === y);
    if (victim) {
      if (owner && sameSide(owner, victim)) return end(proj, victim.id, 'blocked', x, y, events);
      return end(proj, victim.id, hitVictim(state, proj, victim, events), x, y, events);
    }
    proj.index++;
  }
  if (proj.index >= proj.path.length) {
    const last = proj.path[proj.path.length - 1]!;
    end(proj, null, 'expired', last % state.width, Math.floor(last / state.width), events);
    return false;
  }
  return true;
}

function end(
  proj: Projectile,
  victimId: number | null,
  result: Extract<SimEvent, { type: 'projectileHit' }>['result'],
  x: number,
  y: number,
  events: SimEvent[],
): false {
  events.push({ type: 'projectileHit', id: proj.id, kind: proj.kind, victimId, result, x, y });
  return false;
}

function hitVictim(
  state: GameState,
  proj: Projectile,
  victim: Player,
  events: SimEvent[],
): Extract<SimEvent, { type: 'projectileHit' }>['result'] {
  const cfg = state.config.enemyAttacks;
  const spec = cfg.projectiles[proj.kind as ThrownKind];
  const fire = enemyFireOf(state);
  // the free window after an earlier enemy hit: movement is never impossible, nobody is chained
  if (state.tick < (fire.victimSafeUntil[victim.id] ?? 0)) return 'invulnerable';
  const result = applyCampaignHit(
    state,
    {
      victimId: victim.id,
      byId: proj.ownerId,
      source: proj.kind,
      damage: spec.damage,
      dazeTicks: spec.dazeTicks,
      knockback:
        spec.knockbackTiles > 0 && proj.dir !== undefined
          ? { dir: proj.dir, tiles: spec.knockbackTiles }
          : null,
      strong: spec.strong,
    },
    events,
  );
  if (result === 'damaged' || result === 'dazed' || result === 'defeated')
    fire.victimSafeUntil[victim.id] = state.tick + spec.dazeTicks + cfg.victimFreeTicks;
  return result;
}
