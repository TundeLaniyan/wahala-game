/**
 * Beginner-friendly restraint (profile `mercy`, Rookie and Beginner): never place a generator that would
 * leave a nearby rival with no way out. The rival is assumed to react `mercyDelay` ticks late, the way a
 * first-time player does. The check reads the same Observation as every other decision, but always with
 * full hazard awareness (chains, every lookahead), so a careless level is careless about ITSELF, never
 * about whether it is boxing a newcomer in.
 */
import { explodeTickFor, myRange, rivalEscape } from './analysis';
import type { Ctx } from './context';
import type { HypoGen } from './danger';
import type { AiProfile } from './profiles';

const aware = new WeakMap<AiProfile, AiProfile>();

/** The profile with complete hazard awareness (used only to judge a rival's escape). */
function fullAwareness(profile: AiProfile): AiProfile {
  let p = aware.get(profile);
  if (!p) {
    p = { ...profile, lookahead: 100000, vehicleLookahead: 100000, chains: true, margin: 0 };
    aware.set(profile, p);
  }
  return p;
}

/** Would a generator placed on `tile` (arriving there at `a0`) leave some nearby rival with no escape? */
export function wouldTrapRival(c: Ctx, tile: number, a0: number): boolean {
  const { world, profile } = c;
  const w = world.board.width;
  const range = myRange(c);
  const tx = tile % w;
  const ty = Math.floor(tile / w);
  let built = false;
  for (const r of world.near) {
    if (Math.abs(r.x - tx) + Math.abs(r.y - ty) > range + 2) continue;
    if (!built) {
      const placeTick = Math.max(world.tick + 1, a0 + 1);
      const hypo: HypoGen = { x: tx, y: ty, range, pierce: world.me.hotFuel, explodeAt: explodeTickFor(c, placeTick) };
      c.builder.build(c.tmp, world, fullAwareness(profile), { extraGens: [hypo] });
      built = true;
    }
    if (rivalEscape(c, c.tmp, r, profile.mercyDelay, false, tile).refuges === 0) return true;
  }
  return false;
}
