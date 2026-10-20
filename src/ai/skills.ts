/** Close-combat skills (Push / Shove / Daze): use them to put a rival into a flame lane. */
import { CHARACTERS, DIR_VEC } from '../sim';
import type { Ctx } from './context';

/** Returns true when the skill should be used this tick (the bot is already facing the rival). */
export function decideSkill(c: Ctx): boolean {
  const { world, danger, profile } = c;
  const { obs, me } = world;
  const T = obs.tick;
  if (!profile.useSkill || T < me.skillReadyTick || T < me.dazedUntil || me.entryUntil !== null) return false;
  const v = DIR_VEC[me.facing];
  const tx = me.x + v.dx;
  const ty = me.y + v.dy;
  const w = world.board.width;
  const target = world.rivals.find((r) => r.x === tx && r.y === ty);
  if (!target) return false;
  const skill = CHARACTERS[me.characterId].skill;
  const here = target.y * w + target.x;
  // never waste a shove on a rider whose Okada would just absorb the flames anyway
  if (target.mounted && skill !== 'daze') return false;

  if (skill === 'daze') {
    if (T < target.dazeImmuneUntil) return false;
    // a dazed rival cannot leave a lane that is about to burn (daze lasts dazeTicks)
    const first = danger.firstHit(here, T + 1);
    return (
      first <= T + obs.config.skills.dazeTicks + obs.config.movement.stepTicksBySpeedLevel[0]! && first > T
    );
  }
  const dest = (ty + v.dy) * w + (tx + v.dx);
  if (tx + v.dx < 0 || ty + v.dy < 0 || tx + v.dx >= w || ty + v.dy >= world.board.height) return false;
  if (world.blocked[dest] === 1) return false;
  const push = obs.config.movement.pushStepTicks;
  // push him onto a tile that burns before he can step off it, from a tile that is safe
  const firstDest = danger.firstHit(dest, T + 1);
  const hereHazard = danger.firstHit(here, T + 1);
  return firstDest <= T + push + 14 && hereHazard > firstDest + 20;
}
