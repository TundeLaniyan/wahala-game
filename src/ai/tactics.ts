/**
 * Tactical one-shots layered on top of movement: vehicle voucher, remote detonation, generator
 * tools for emergencies and close-combat skills. Each decision is verified against the danger map
 * before it is allowed to change the movement intent.
 */
import { chooseAttack, meleeTarget, primaryOf } from '../sim';
import type { Intent } from '../sim';
import { dirIndex } from './board';
import type { Ctx } from './context';
import { tryEmergencyFix } from './emergency';
import { decideRemote } from './remote';
import { decideSkill } from './skills';
import { newVehicleMemory, vehicleTactic } from './vehicleAI';
import type { VehicleMemory } from './vehicleAI';
import type { GoalKind } from './goals';

export interface TacticsHooks {
  requestRethink(): void;
  planKind(): GoalKind | null;
}

export class Tactics {
  private readonly vehicle: VehicleMemory = newVehicleMemory();
  private nextRemote = 0;

  apply(c: Ctx, intent: Intent, hooks: TacticsHooks): void {
    const { world, profile, danger } = c;
    const { obs, me } = world;
    const T = obs.tick;
    if (!me.alive) return;

    // ---- a melee in its startup: stay on the tile while it is safe to, so the hit finds the rival (the startup
    // never roots anyone, but a step away would make the attack miss)
    if (me.attack && danger.firstHit(world.myTile, T + 1) > T + Math.max(0, me.attack.resolveTick - T) + 14) {
      delete intent.move;
    }

    // ---- vehicle voucher: one press of B, the same special the human presses
    const safeHere = danger.safeFrom(world.myTile, T) && intent.move === undefined;
    vehicleTactic(c, this.vehicle, intent, safeHere);
    // ---- GLOBAL KNOCKDOWN (the 7-kill streak reward): thrown when it will find rivals, with a charge to follow up
    if (!intent.special && me.streakRewards.knockdown && safeHere && knockdownWorthIt(c)) {
      intent.special = true;
      delete intent.move;
    }
    // ---- LOCAL CHAMPION (decision FC6): the crowd backs me for a few seconds: used when a rival is within its radius
    if (
      !intent.special &&
      me.streakRewards.localChampion &&
      me.localChampion === null &&
      safeHere &&
      localChampionWorthIt(c)
    ) {
      intent.special = true;
      delete intent.move;
    }
    if (intent.special || intent.vehicle || me.entryUntil !== null) return;

    // ---- remote detonation
    if (me.remote && T >= this.nextRemote) {
      this.nextRemote = T + (profile.smartRemote ? 1 : 3);
      const stand = [world.myTile];
      if (intent.move) {
        const n = world.board.neighbor[world.myTile * 4 + dirIndex(world.steer(intent.move))]!;
        if (n >= 0) stand.push(n);
      }
      if (decideRemote(c, stand)) intent.detonate = true;
    }

    // ---- generator tools when there is no way out
    if (hooks.planKind() === 'last' && T % 2 === 0 && tryEmergencyFix(c, intent)) hooks.requestRethink();

    // ---- close combat: B, which is a melee press whenever an opponent is adjacent (never the vehicle)
    if (decideSkill(c) && meleeTarget(obs, me)) {
      intent.special = true;
      const startup = obs.config.skills.attacks[primaryOf(me)].startupTicks;
      if (danger.firstHit(world.myTile, T + 1) > T + startup + 14) delete intent.move;
    } else if (
      me.attacks.secondary &&
      profile.useSkill &&
      T >= me.dazedUntil &&
      intent.special === undefined
    ) {
      // the SECONDARY attack (a reach-2 opener, or the follow-up while the primary recovers): the same B press the
      // human makes (`chooseAttack` is the resolver's own choice), only from a tile that is safe for its startup
      const pick = chooseAttack(obs, me);
      if (pick && pick.ready && pick.kind !== me.attacks.primary) {
        const startup = obs.config.skills.attacks[pick.kind].startupTicks;
        if (danger.firstHit(world.myTile, T + 1) > T + startup + 14) {
          intent.special = true;
          delete intent.move;
        }
      }
    }
  }
}

/** Is a LOCAL CHAMPION worth starting now? A rival within its radius, who is not immune, and nobody adjacent (B would be a melee press). */
function localChampionWorthIt(c: Ctx): boolean {
  const { world } = c;
  const { obs, me } = world;
  if (obs.tick < me.dazedUntil || meleeTarget(obs, me)) return false;
  const radius = obs.config.streaks.localChampion.radiusTiles;
  return world.rivals.some(
    (r) => Math.abs(r.x - me.x) + Math.abs(r.y - me.y) <= radius && obs.tick >= r.localChampionImmuneUntil,
  );
}

/**
 * Is a GLOBAL KNOCKDOWN worth throwing now? Two or more rivals within a few tiles (or the only rival close), at least
 * one generator charge to follow up with, nobody next to me (B would be a melee press) and nobody already down.
 */
function knockdownWorthIt(c: Ctx): boolean {
  const { world } = c;
  const { obs, me } = world;
  if (me.carrying !== null || obs.tick < me.dazedUntil) return false;
  if (meleeTarget(obs, me)) return false;
  const live = world.rivals.filter((r) => obs.tick >= r.knockdownImmuneUntil && obs.tick >= r.knockedUntil);
  if (live.length === 0) return false;
  const near = live.filter((r) => Math.abs(r.x - me.x) + Math.abs(r.y - me.y) <= 9);
  if (near.length < Math.min(2, live.length)) return false;
  const mine = obs.generators.filter(
    (g) => g.ownerId === me.id && g.mode !== 'disabled' && !g.vehicleBorne,
  ).length;
  return mine < me.capacity;
}
