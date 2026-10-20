import type { VehicleKind } from '../types';

export interface VehicleDef {
  kind: VehicleKind;
  name: string;
  description: string;
  color: number;
}

export const VEHICLE_DEFS: Readonly<Record<VehicleKind, VehicleDef>> = {
  danfo: {
    kind: 'danfo',
    name: 'Danfo',
    description: 'Slow, heavy, ploughs through everything',
    color: 0xffc21a,
  },
  taxi: {
    kind: 'taxi',
    name: 'Yellow Cab',
    description: 'Fast, stops at the first rival it hits',
    color: 0xffe14a,
  },
  keke: { kind: 'keke', name: 'Keke', description: 'Agile, one 90 degree turn', color: 0x2fb35a },
};
