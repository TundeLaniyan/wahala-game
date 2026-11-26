/**
 * Chunk colours of a vehicle's break-up (the `vehicleDestroyed` effect). One entry per `VehicleKind`: the Okada was missing, so
 * an Okada that was destroyed threw inside the render loop (found by the private multiplayer browser run). An unknown kind
 * falls back to the Danfo colours instead of throwing.
 */
import type { VehicleKind } from '../sim';

type Chunks = [number, number, number][];

export const WRECK_COLORS: Readonly<Record<VehicleKind, Chunks>> = {
  danfo: [
    [1, 0.76, 0.1],
    [0.1, 0.1, 0.1],
    [0.75, 0.75, 0.78],
  ],
  taxi: [
    [0.0, 0.65, 0.9],
    [0.95, 0.96, 0.98],
    [0.12, 0.14, 0.18],
  ],
  keke: [
    [0.97, 0.78, 0.08],
    [0.14, 0.16, 0.2],
    [0.12, 0.12, 0.12],
  ],
  okada: [
    [0.82, 0.14, 0.1],
    [0.1, 0.1, 0.1],
    [0.7, 0.7, 0.72],
  ],
};

export const wreckColors = (kind: string): Chunks => WRECK_COLORS[kind as VehicleKind] ?? WRECK_COLORS.danfo;
