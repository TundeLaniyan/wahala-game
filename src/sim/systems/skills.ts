/**
 * Close-range, non-lethal character attacks (decisions CB1-CB4). B next to a rival starts an attack; it takes effect
 * `startupTicks` later against whoever is adjacent THEN (a rival who stepped away is a whiff). Three attacks, three
 * different trades (numbers in `config.skills.attacks`):
 *
 *   Punch / Street Jab  `push`   adjacent, very fast, a brief daze, no displacement, short recoveries
 *   Shove               `shove`  adjacent, slower, pushes two tiles where the map allows, no daze,
 *                                long whiff recovery (a failed Shove leaves the attacker exposed)
 *   Daze Punch          `daze`   adjacent, slow telegraph, the longest daze, long recovery
 *
 * Rules shared by all three:
 *  - nothing roots the attacker: the recoveries only delay THEIR NEXT attack (`skillReadyTick`);
 *  - a whiff costs `whiffRecoveryTicks`, a hit `hitRecoveryTicks` (the global recovery: after it any rival is
 *    hittable again);
 *  - the same attacker cannot affect the same victim again for `targetLockoutTicks` (no chain, no stun-lock);
 *  - a hit that dazes or displaces cuts a pending attack of the victim short (a fast jab beats a slow wind-up).
 * Everything is ticks and the match RNG is never used, so replays are identical.
 */
import { DIRS, DIR_VEC } from '../grid';
import { CHARACTERS } from '../data/characters';
import type { AttackSpec } from '../config';
import type { Dir, GameState, Player, SimEvent, SkillKind } from '../types';
import { beginStep, canPlayerEnter } from './stepping';
import { isActing, playersAt, teammates } from './queries';

/** The attack a fighter throws (their character's skill). */
export const skillOf = (p: Pick<Player, 'characterId'>): SkillKind => CHARACTERS[p.characterId].skill;

/** Can `attacker` (a fighter or the bots' observation of themselves) start an attack on `victim` right now? */
export function attackable(
  state: { readonly tick?: number; readonly config: GameState['config'] },
  tick: number,
  attacker: Readonly<Pick<Player, 'characterId' | 'meleeLock' | 'id'>>,
  victim: Readonly<Pick<Player, 'id' | 'dazeImmuneUntil'>>,
): boolean {
  if (tick < (attacker.meleeLock[victim.id] ?? 0)) return false; // the per-target lockout
  const spec = state.config.skills.attacks[skillOf(attacker)];
  // a pure daze has nothing to do to a victim who is still immune to one
  if (spec.dazeTicks > 0 && spec.displacementTiles === 0 && tick < victim.dazeImmuneUntil) return false;
  return true;
}

/**
 * V2 melee target: an attackable opponent (never a teammate) on the faced tile, else on another adjacent tile in
 * the fixed order up, right, down, left (when `special.meleeAnyAdjacent`). Deterministic. `ok` filters further.
 */
export function meleeTarget<P extends Readonly<Player>>(
  state: { readonly players: readonly P[]; readonly config: GameState['config'] },
  p: Readonly<Player>,
  ok: (o: P) => boolean = () => true,
): { target: P; dir: Dir } | null {
  const order: Dir[] = [
    p.facing,
    ...(state.config.special.meleeAnyAdjacent ? DIRS.filter((d) => d !== p.facing) : []),
  ];
  for (const dir of order) {
    const v = DIR_VEC[dir];
    const x = p.x + v.dx;
    const y = p.y + v.dy;
    // players in id order: the same pick every time (bots call this with their Observation)
    const target = state.players.find(
      (o) => o.alive && o.x === x && o.y === y && o.id !== p.id && !teammates(p, o) && ok(o),
    );
    if (target) return { target, dir };
  }
  return null;
}

/** The rival an attack by `p` could start on now (adjacent, not locked out, not pointless), or null. */
export function attackTarget<P extends Readonly<Player>>(
  state: { readonly tick: number; readonly players: readonly P[]; readonly config: GameState['config'] },
  p: Readonly<Player>,
): { target: P; dir: Dir } | null {
  return meleeTarget(state, p, (o) => attackable(state, state.tick, p, o));
}

/** Legacy `skill` intent: the faced tile only. */
export function useSkill(state: GameState, p: Player, events: SimEvent[]): void {
  if (!isActing(state, p) || p.entryUntil !== null) return;
  const v = DIR_VEC[p.facing];
  const target = playersAt(state, p.x + v.dx, p.y + v.dy).find(
    (o) => o.id !== p.id && !teammates(p, o) && attackable(state, state.tick, p, o),
  );
  if (target) beginAttack(state, p, target, p.facing, events);
}

/**
 * Starts the attack on `target` (already adjacent in `dir`): the startup runs, the effect follows. Returns whether
 * it began (not while recovering from the last one or already winding up).
 */
export function beginAttack(
  state: GameState,
  p: Player,
  target: Player,
  dir: Dir,
  events: SimEvent[],
): boolean {
  if (p.attack !== null || state.tick < p.skillReadyTick) return false;
  const skill = skillOf(p);
  const spec = state.config.skills.attacks[skill];
  p.facing = dir;
  p.attack = { skill, targetId: target.id, resolveTick: state.tick + spec.startupTicks };
  events.push({
    type: 'attackStarted',
    playerId: p.id,
    skill,
    targetId: target.id,
    resolveTick: p.attack.resolveTick,
  });
  return true;
}

/** Resolves every attack whose startup is over. Runs each tick after movement (a rival who stepped away is missed). */
export function updateAttacks(state: GameState, events: SimEvent[]): void {
  for (const p of state.players) {
    if (p.attack && state.tick >= p.attack.resolveTick) resolveAttack(state, p, events);
  }
}

function resolveAttack(state: GameState, p: Player, events: SimEvent[]): void {
  const pending = p.attack!;
  p.attack = null;
  const spec = state.config.skills.attacks[pending.skill];
  const target = p.alive && isActing(state, p) ? pickTarget(state, p, pending.targetId) : null;
  if (!target) return whiff(state, p, spec, pending.skill, events);

  const dir = adjacentDir(p, target)!;
  let landing: { x: number; y: number; tiles: number } | null = null;
  if (spec.displacementTiles > 0) {
    landing = pushLanding(state, target, DIR_VEC[dir], spec.displacementTiles);
    // a shove that cannot move them at all (a wall, a crate or a generator right behind) does nothing
    if (!landing) return whiff(state, p, spec, pending.skill, events);
  }

  p.facing = dir;
  if (landing) {
    const fromX = target.x;
    const fromY = target.y;
    beginStep(target, landing.x, landing.y, state.config.movement.pushStepTicks * landing.tiles);
    events.push({ type: 'playerPushed', playerId: target.id, byId: p.id, fromX, fromY });
  }
  if (spec.dazeTicks > 0) {
    target.dazedUntil = Math.max(target.dazedUntil, state.tick + spec.dazeTicks);
    target.dazeImmuneUntil = Math.max(target.dazeImmuneUntil, target.dazedUntil + spec.dazeImmunityTicks);
    target.entryUntil = null; // a dazed player drops out of vehicle-entry mode
    events.push({ type: 'playerDazed', playerId: target.id, byId: p.id });
  }
  if ((landing || spec.dazeTicks > 0) && target.attack) {
    target.attack = null; // a hit cuts the victim's wind-up short
    events.push({ type: 'attackInterrupted', playerId: target.id, byId: p.id });
  }
  p.skillReadyTick = state.tick + spec.hitRecoveryTicks;
  p.meleeLock[target.id] = state.tick + spec.targetLockoutTicks;
  recordHit(state, target, p.id);
  events.push({ type: 'skillUsed', playerId: p.id, skill: pending.skill, targetId: target.id });
  events.push({
    type: 'attackResolved',
    playerId: p.id,
    skill: pending.skill,
    targetId: target.id,
    hit: true,
  });
}

function whiff(state: GameState, p: Player, spec: AttackSpec, skill: SkillKind, events: SimEvent[]): void {
  p.skillReadyTick = Math.max(p.skillReadyTick, state.tick + spec.whiffRecoveryTicks);
  events.push({ type: 'attackResolved', playerId: p.id, skill, targetId: null, hit: false });
}

/** The victim when the startup ends: the one aimed at if still adjacent and hittable, else any other that is. */
function pickTarget(state: GameState, p: Player, aimed: number): Player | null {
  const ok = (o: Player): boolean => attackable(state, state.tick, p, o);
  const first = state.players[aimed];
  if (first && first.alive && first.id !== p.id && !teammates(p, first) && adjacentDir(p, first) && ok(first))
    return first;
  return meleeTarget(state, p, ok)?.target ?? null;
}

function adjacentDir(a: Readonly<Player>, b: Readonly<Player>): Dir | null {
  for (const d of DIRS) if (a.x + DIR_VEC[d].dx === b.x && a.y + DIR_VEC[d].dy === b.y) return d;
  return null;
}

/** How far (up to `max` tiles) `target` can be pushed along `v`: the last free tile and how many tiles that is. */
function pushLanding(
  state: GameState,
  target: Player,
  v: { dx: number; dy: number },
  max: number,
): { x: number; y: number; tiles: number } | null {
  let out: { x: number; y: number; tiles: number } | null = null;
  for (let k = 1; k <= max; k++) {
    const x = target.x + v.dx * k;
    const y = target.y + v.dy * k;
    if (!canPlayerEnter(state, x, y)) break;
    out = { x, y, tiles: k };
  }
  return out;
}

/** Remembers a melee attacker for elimination credit (pruned to the assist window). */
export function recordHit(state: GameState, target: Player, byId: number): void {
  const window = state.config.credit.assistWindowTicks;
  target.recentHits = target.recentHits.filter((h) => state.tick - h.tick <= window && h.byId !== byId);
  target.recentHits.push({ byId, tick: state.tick });
}
