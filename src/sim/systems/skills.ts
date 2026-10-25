/** Close-range, non-damaging character skills: Push / Shove move a rival one tile; Daze freezes them. */
import { DIRS, DIR_VEC } from '../grid';
import { CHARACTERS } from '../data/characters';
import type { Dir, GameState, Player, SimEvent } from '../types';
import { beginStep, canPlayerEnter } from './stepping';
import { isActing, playersAt, teammates } from './queries';

/**
 * V2 melee target: an opponent (never a teammate) on the faced tile, else on another adjacent tile in
 * the fixed order up, right, down, left (when `special.meleeAnyAdjacent`). Deterministic.
 */
export function meleeTarget(state: GameState, p: Player): { target: Player; dir: Dir } | null {
  const order: Dir[] = [p.facing, ...(state.config.special.meleeAnyAdjacent ? DIRS.filter((d) => d !== p.facing) : [])];
  for (const dir of order) {
    const v = DIR_VEC[dir];
    const target = playersAt(state, p.x + v.dx, p.y + v.dy).find((o) => o.id !== p.id && !teammates(p, o));
    if (target) return { target, dir };
  }
  return null;
}

/** Legacy `skill` intent: the faced tile only. */
export function useSkill(state: GameState, p: Player, events: SimEvent[]): void {
  if (!isActing(state, p) || p.entryUntil !== null || state.tick < p.skillReadyTick) return;
  const v = DIR_VEC[p.facing];
  const target = playersAt(state, p.x + v.dx, p.y + v.dy).find((o) => o.id !== p.id && !teammates(p, o));
  if (!target) return;
  strike(state, p, target, events);
}

/** Performs the character's melee on `target` (already adjacent, in `p.facing`). Returns whether it acted. */
export function strike(state: GameState, p: Player, target: Player, events: SimEvent[]): boolean {
  if (state.tick < p.skillReadyTick) return false;
  const skill = CHARACTERS[p.characterId].skill;
  const v = DIR_VEC[p.facing];

  if (skill === 'daze') {
    if (state.tick < target.dazeImmuneUntil) return false;
    const cfg = state.config.skills;
    target.dazedUntil = state.tick + cfg.dazeTicks;
    target.dazeImmuneUntil = target.dazedUntil + cfg.dazeImmunityTicks;
    target.entryUntil = null; // a dazed player drops out of vehicle-entry mode
    events.push({ type: 'playerDazed', playerId: target.id, byId: p.id });
  } else {
    const dx = target.x + v.dx;
    const dy = target.y + v.dy;
    if (!canPlayerEnter(state, dx, dy)) return false;
    const fromX = target.x;
    const fromY = target.y;
    beginStep(target, dx, dy, state.config.movement.pushStepTicks);
    events.push({ type: 'playerPushed', playerId: target.id, byId: p.id, fromX, fromY });
  }
  p.skillReadyTick = state.tick + state.config.skills.cooldownTicks[skill];
  recordHit(state, target, p.id);
  events.push({ type: 'skillUsed', playerId: p.id, skill, targetId: target.id });
  return true;
}

/** Remembers a melee attacker for elimination credit (pruned to the assist window). */
export function recordHit(state: GameState, target: Player, byId: number): void {
  const window = state.config.credit.assistWindowTicks;
  target.recentHits = target.recentHits.filter((h) => state.tick - h.tick <= window && h.byId !== byId);
  target.recentHits.push({ byId, tick: state.tick });
}
