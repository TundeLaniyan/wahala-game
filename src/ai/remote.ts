/** Remote Starter: when to set off the generators the bot has armed. */
import { blastGeometry, protectionLayers } from './analysis';
import type { BlastGeometry } from './analysis';
import type { Ctx } from './context';

const geo: BlastGeometry = { soft: 0, rivals: 0, mountedRivals: 0, pickups: 0, chains: 0, chainRivals: 0, supplies: 0 };

/** Returns true (and sets `detonate`) when detonating now is a good idea and safe for the bot. */
export function decideRemote(c: Ctx, standingOn: readonly number[]): boolean {
  const { world, profile } = c;
  const { obs, me } = world;
  const T = obs.tick;
  const mine = obs.generators.filter(
    (g) => g.ownerId === me.id && g.mode === 'remote' && g.carriedBy === null,
  );
  if (mine.length === 0) return false;

  const ids = mine.map((g) => g.id);
  c.builder.build(c.tmp, world, profile, { detonateIds: ids });
  const flameLen = obs.config.generator.flameTicks;
  for (const t of standingOn) if (c.tmp.hit(t, T + 1, T + flameLen)) return false;
  const age = T - Math.min(...mine.map((g) => g.placedTick));
  const failsafe = Math.min(...mine.map((g) => g.timer));

  const w = world.board.width;
  // Team Rumble with friendly fire: never set off a blast that would catch a teammate
  if (world.friendlyFire) for (const f of world.friends) if (c.tmp.hit(f.y * w + f.x, T + 1, T + flameLen)) return false;
  let kills = 0;
  let maybes = 0;
  for (const r of world.rivals) {
    if (!c.tmp.hit(r.y * w + r.x, T + 1, T + 1)) continue;
    // a protected rival (Okada / Armour) loses a layer, not its life: worth a little pressure only
    if (protectionLayers(r) > 0) {
      maybes += 0.4 / protectionLayers(r);
      continue;
    }
    const committed = r.stepRemaining >= 2 || r.dazedUntil > T + 1;
    if (committed) kills++;
    else maybes += 0.5;
  }
  let softs = 0;
  let pickups = 0;
  for (const g of mine) {
    blastGeometry(c, g.y * w + g.x, g.range, g.pierce, geo, g.square);
    softs += geo.soft;
    pickups += geo.pickups;
  }
  const full = mine.length >= me.capacity;

  switch (profile.tier) {
    case 'easy':
      return age >= 80 + ((me.id * 17) % 40);
    case 'medium':
      return (
        kills > 0 ||
        maybes >= 0.5 ||
        (softs > 0 && age >= 120) ||
        age >= 240 ||
        (full && age >= 60) ||
        failsafe < 60
      );
    case 'hard':
      return (
        kills > 0 ||
        (maybes >= 0.5 && age >= 30) ||
        (softs > 0 && pickups === 0 && age >= 150) ||
        age >= 300 ||
        (full && age >= 90 && softs > 0) ||
        failsafe < 60
      );
  }
}
