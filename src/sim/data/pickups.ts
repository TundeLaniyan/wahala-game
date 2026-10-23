/** Presentation metadata for pickups. Balance numbers (weights, caps) live in config.ts. */
import type { PickupKind } from '../types';

export interface PickupDef {
  kind: PickupKind;
  name: string;
  short: string;
  description: string;
  /** Marker colour used by the renderer / HUD. */
  color: number;
  bad?: boolean;
}

export const PICKUP_DEFS: Readonly<Record<PickupKind, PickupDef>> = {
  petrol: {
    kind: 'petrol',
    name: 'Petrol Top-Up',
    short: '+Fire',
    description: '+1 flame reach',
    color: 0xff7a1a,
  },
  diesel: {
    kind: 'diesel',
    name: 'Power Diesel',
    short: 'MAX',
    description: 'Flames reach as far as they can',
    color: 0xff2a2a,
  },
  socket: {
    kind: 'socket',
    name: 'Extra Socket',
    short: '+Gen',
    description: '+1 generator at a time',
    color: 0xffd21a,
  },
  skates: {
    kind: 'skates',
    name: 'Roller Skates',
    short: 'Speed',
    description: 'Move faster',
    color: 0x2fd0ff,
  },
  boots: {
    kind: 'boots',
    name: 'Football Boots',
    short: 'Kick',
    description: 'Kick generators',
    color: 0x6dff5a,
  },
  gloves: {
    kind: 'gloves',
    name: 'Mechanic Gloves',
    short: 'Punch',
    description: 'Punch generators away',
    color: 0xff9a3c,
  },
  grip: {
    kind: 'grip',
    name: 'Generator Grip',
    short: 'Carry',
    description: 'Carry generators (+1s fuse once)',
    color: 0xc08cff,
  },
  remote: {
    kind: 'remote',
    name: 'Remote Starter',
    short: 'Remote',
    description: 'Detonate generators on command',
    color: 0xff3c8c,
  },
  killswitch: {
    kind: 'killswitch',
    name: 'Kill Switch',
    short: 'Disarm',
    description: 'Disarm adjacent generators',
    color: 0x9aa3ad,
  },
  okada: {
    kind: 'okada',
    name: 'Okada Ride',
    short: 'Okada',
    description: 'Faster, and survives one lethal hit',
    color: 0xffe14a,
  },
  voucher: {
    kind: 'voucher',
    name: 'Vehicle Voucher',
    short: 'Vehicle',
    description: 'Call in your signature vehicle',
    color: 0x3cffb0,
  },
  curse: {
    kind: 'curse',
    name: 'Bad Fuel',
    short: 'Curse!',
    description: 'A short, nasty debuff',
    color: 0x7a2fb5,
    bad: true,
  },
  sneakers: {
    kind: 'sneakers',
    name: 'Jump Sneakers',
    short: 'Jump',
    description: 'Hop over one generator',
    color: 0x5ad0ff,
  },
  bombpass: {
    kind: 'bombpass',
    name: 'Generator Pass',
    short: 'Pass',
    description: 'Walk over generators (yours and rivals\') - no fire protection',
    color: 0x7cf0c8,
  },
  hotfuel: {
    kind: 'hotfuel',
    name: 'Hot Fuel',
    short: 'Pierce',
    description: 'Flames burn through one soft block',
    color: 0xff5a00,
  },
};
