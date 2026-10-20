/** Close-range, non-damaging character skills: Push / Shove move a rival one tile; Daze freezes them. */
import { DIR_VEC } from '../grid';
import { CHARACTERS } from '../data/characters';
import type { GameState, Player, SimEvent } from '../types';
import { beginStep, canPlayerEnter } from './stepping';
import { isActing, playersAt } from './queries';

export function useSkill(state: GameState, p: Player, events: SimEvent[]): void {
  if (!isActing(state, p) || p.entryUntil !== null || state.tick < p.skillReadyTick) return;
  const skill = CHARACTERS[p.characterId].skill;
  const v = DIR_VEC[p.facing];
  const target = playersAt(state, p.x + v.dx, p.y + v.dy).find((o) => o.id !== p.id);
  if (!target) return;

  if (skill === 'daze') {
    if (state.tick < target.dazeImmuneUntil) return;
    const cfg = state.config.skills;
    target.dazedUntil = state.tick + cfg.dazeTicks;
    target.dazeImmuneUntil = target.dazedUntil + cfg.dazeImmunityTicks;
    target.entryUntil = null; // a dazed player drops out of vehicle-entry mode
    events.push({ type: 'playerDazed', playerId: target.id, byId: p.id });
  } else {
    const dx = target.x + v.dx;
    const dy = target.y + v.dy;
    if (!canPlayerEnter(state, dx, dy)) return;
    const fromX = target.x;
    const fromY = target.y;
    beginStep(target, dx, dy, state.config.movement.pushStepTicks);
    events.push({ type: 'playerPushed', playerId: target.id, byId: p.id, fromX, fromY });
  }
  p.skillReadyTick = state.tick + state.config.skills.cooldownTicks[skill];
  events.push({ type: 'skillUsed', playerId: p.id, skill, targetId: target.id });
}
