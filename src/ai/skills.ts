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
  const spec = obs.config.skills.attacks[skill];
  // a rival locked out of this attacker's melee (just hit) or still immune to a pure daze is not a target
  if (T < (me.meleeLock[target.id] ?? 0)) return false;
  const here = target.y * w + target.x;
  // never waste a shove on a rider whose Okada would just absorb the flames anyway
  if (target.mounted && skill !== 'daze') return false;

  if (spec.dazeTicks > 0 && spec.displacementTiles === 0) {
    if (T < target.dazeImmuneUntil) return false;
    // a dazed rival cannot leave a lane that is about to burn (the daze lasts `dazeTicks`, after the startup)
    const first = danger.firstHit(here, T + 1);
    return (
      first <= T + spec.startupTicks + spec.dazeTicks + obs.config.movement.stepTicksBySpeedLevel[0]! &&
      first > T
    );
  }
  // where the shove would land them: as far as `displacementTiles` allows along the line
  let dest = -1;
  for (let k = 1; k <= spec.displacementTiles; k++) {
    const dx = tx + v.dx * k;
    const dy = ty + v.dy * k;
    if (dx < 0 || dy < 0 || dx >= w || dy >= world.board.height || world.blocked[dy * w + dx] === 1) break;
    dest = dy * w + dx;
  }
  if (dest < 0) return false;
  const push = obs.config.movement.pushStepTicks + spec.startupTicks;
  // push him onto a tile that burns before he can step off it, from a tile that is safe
  const firstDest = danger.firstHit(dest, T + 1);
  const hereHazard = danger.firstHit(here, T + 1);
  return firstDest <= T + push + 14 && hereHazard > firstDest + 20;
}
