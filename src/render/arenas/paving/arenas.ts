/** Which arenas' floors carry interlocking road paving, and with which paver (docs/LEKKI_INTERLOCK_ROADS.md). */
import { LEKKI_PAVING } from './material';
import type { PavingSpec } from './material';

export const PAVED_ARENAS: Readonly<Record<string, PavingSpec>> = {
  rumbleLekki: LEKKI_PAVING,
};
