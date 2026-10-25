/**
 * Tactical one-shots layered on top of movement: vehicle voucher, remote detonation, generator
 * tools for emergencies and close-combat skills. Each decision is verified against the danger map
 * before it is allowed to change the movement intent.
 */
import { meleeTarget } from '../sim';
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

    // ---- vehicle voucher: one press of B, the same special the human presses
    const safeHere = danger.safeFrom(world.myTile, T) && intent.move === undefined;
    vehicleTactic(c, this.vehicle, intent, safeHere);
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
    if (decideSkill(c) && meleeTarget(obs, me)) intent.special = true;
  }
}
