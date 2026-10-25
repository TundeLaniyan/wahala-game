/**
 * Presentation choices for stage hazards shared by the 3D renderer and the HUD (so the vehicle you
 * see crossing the lane is the one the alert names). Pure functions of public stage-event data;
 * no game rules live here.
 */
import type { StageHazardStyle, VehicleKind } from '../sim';

/** Which vehicle drives a sweep event: Danfo bays use Danfos, checkpoint runs are cars, traffic mixes buses and kekes. */
export function sweepVehicleKind(style: StageHazardStyle, eventId: number): VehicleKind {
  // Apapa's container trucks are drawn by their own model; 'taxi' keeps them out of the Danfo / Keke voice lines
  if (style === 'checkpoint' || style === 'truck') return 'taxi';
  if (style === 'traffic' && eventId % 3 === 1) return 'keke';
  return 'danfo';
}

/** Word used on screen for that vehicle. */
export function sweepVehicleNoun(style: StageHazardStyle, eventId: number): string {
  if (style === 'truck') return 'TRUCK';
  const kind = sweepVehicleKind(style, eventId);
  if (kind === 'taxi') return 'CAR';
  if (kind === 'keke') return 'KEKE';
  return style === 'traffic' ? 'BUS' : 'DANFO';
}
