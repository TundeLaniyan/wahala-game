/** Registry of every synthesised sound. The key is both the bank id and the recorded-sample slot name. */
import { blastSounds } from './blasts';
import { ambienceLoops, crowdOneShots } from './crowd';
import { gameplaySounds } from './gameplay';
import { vehicleSounds } from './vehicles';
import type { SoundDef } from './types';

export const SOUND_DEFS = {
  ...blastSounds,
  ...vehicleSounds,
  ...gameplaySounds,
  ...crowdOneShots,
  ...ambienceLoops,
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUND_DEFS;
export const SOUND_IDS = Object.keys(SOUND_DEFS) as SoundId[];

export const defOf = (id: SoundId): SoundDef => SOUND_DEFS[id];
export type { SoundDef, Bus } from './types';
