/**
 * Vehicle Voucher usage, V2: bots press the SAME one-press special as the human (decision WA5). The
 * simulation picks the route (`chooseAutoVehicle`, which bots can evaluate on their Observation because
 * it is pure); the bot only decides WHEN to press. It reads the route the press would take, checks it
 * against its own danger model (it must still reach a safe refuge once the vehicle is on the road) and
 * its rival model (how many escapes the route leaves a rival), and presses B when the route is worth
 * the voucher. B is a melee press while an opponent stands next to the bot, so it waits for that to clear.
 *
 * Naive (low levels): presses whenever the route runs over a rival. Purposeful: routes that leave a rival
 * no escape (or, after waiting, any real pressure). Strategic: also routes that cut a rival's remaining
 * escapes down combined with the generators already ticking, valuing Okada riders correctly.
 */
import { chooseAutoVehicle, meleeTarget, nextFloat } from '../sim';
import type { Intent, TilePos } from '../sim';
import { CHARACTERS } from '../sim';
import { rivalEscape, searchRefuge } from './analysis';
import { baselineRefuges } from './goals';
import { overBudget, spend } from './context';
import type { Ctx } from './context';
import { readyTick, stepTicksOf } from './world';

export interface VehicleMemory {
  haveSince: number;
  nextEval: number;
}

export const newVehicleMemory = (): VehicleMemory => ({
  haveSince: -1,
  nextEval: 0,
});

/**
 * The bot's own value of `route` launched at `launchTick` (danger + rival model), or -1 when launching it
 * would leave the bot no refuge.
 */
export function routeValue(c: Ctx, route: readonly TilePos[], launchTick: number): number {
  const { world, profile } = c;
  const { me, obs } = world;
  const kind = CHARACTERS[me.characterId].vehicle;
  const w = world.board.width;
  c.work = 0; // the vehicle check runs between thinks: it gets its own (large-board) budget
  c.builder.build(c.tmp, world, profile, {
    extraVehicles: [{ kind, route: route as TilePos[], launchTick }],
  });
  spend(c);
  // I must still be able to get clear once the vehicle is on the road
  if (!searchRefuge(c, c.tmp, world.myTile, obs.tick, readyTick(obs, me), stepTicksOf(obs, me))) return -1;
  let score = 0;
  for (const r of world.rivals) {
    if (me.team >= 0 && r.team === me.team) continue;
    const onRoute = route.some((t) => t.x === r.x && t.y === r.y);
    const near = route.some((t) => Math.abs(t.x - r.x) + Math.abs(t.y - r.y) <= 2);
    if (!onRoute && !(profile.vehicle === 'strategic' && near)) continue;
    if (overBudget(c)) break;
    const shield = r.mounted || r.armour > 0 ? 0.3 : 1;
    const e = rivalEscape(c, c.tmp, r, 6, profile.vehicle === 'strategic', undefined);
    if (e.refuges === 0) {
      score += 100 * shield;
      continue;
    }
    if (profile.vehicle === 'strategic') {
      const before = baselineRefuges(c, r.id);
      const ratio = before > 0 ? e.refuges / before : 1;
      score += 30 * (1 - ratio) * shield;
    }
    if (onRoute) score += 6 * shield;
  }
  let softs = 0;
  for (const t of route) if (obs.tiles[t.y * w + t.x] === 2) softs++;
  return score + Math.min(softs, 4) * 0.5;
}

/** How good a route must be before the voucher is spent. */
function threshold(c: Ctx, heldFor: number): number {
  const { profile, world } = c;
  const late = world.obs.match.playTicks > 75 * 60;
  const patient = profile.vehicle === 'strategic' ? 25 * 60 : 18 * 60;
  if (late || heldFor > patient) return 6;
  return profile.vehicle === 'strategic' ? 28 : 60;
}

export function vehicleTactic(c: Ctx, mem: VehicleMemory, intent: Intent, safeHere: boolean): void {
  const { world, profile } = c;
  const { obs, me } = world;
  const T = obs.tick;
  if (!me.hasVoucher) {
    mem.haveSince = -1;
    return;
  }
  if (mem.haveSince < 0) mem.haveSince = T;
  if (me.entryUntil !== null) {
    // legacy entry mode (only a script can open it): leave it, the voucher is kept
    intent.vehicle = { type: 'cancel' };
    return;
  }
  if (T < mem.nextEval || !safeHere || me.carrying !== null || T < me.dazedUntil) return;
  if (obs.vehicles.some((v) => v.ownerId === me.id)) return;
  mem.nextEval = T + (profile.vehicle === 'naive' ? 45 : profile.vehicle === 'purposeful' ? 20 : 12);
  if (profile.vehicle === 'naive' && nextFloat(c.rng) > 0.5) return;
  // with an opponent next to me B is a melee press, never the vehicle
  if (meleeTarget(obs, me)) return;
  const choice = chooseAutoVehicle(obs, me.id);
  // the auto route must run over (or right beside) a rival to be worth a look at all
  if (!choice || choice.score < 2) return;
  if (profile.vehicle === 'naive') {
    if (choice.score < 10) return; // a rival on the road
  } else if (
    routeValue(c, choice.route, T + obs.config.vehicles.entryWarnTicks) < threshold(c, T - mem.haveSince)
  )
    return;
  intent.special = true;
  delete intent.move;
  delete intent.place;
}
