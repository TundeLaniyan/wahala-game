/**
 * The combat test lab's hit and miss cues (docs/COMBAT_TEST_LAB.md, decision CL-L9): pure numbers for the EXISTING
 * synthesised sounds (`gen_drop` thud for a hit, `push` swish for a miss); no recording is added. A hit is louder and
 * lower with the level, so the four levels do not sound identical; a miss is always a quiet, low swish.
 */
import type { CombatLabPreset } from '../sim';

export interface LabCue {
  gain: number;
  rate: number;
}

export const labHitCue = (preset: CombatLabPreset): LabCue => ({
  gain: 0.5 + 0.1 * preset.level,
  rate: 1.3 - 0.07 * preset.level,
});

export const labMissCue = (): LabCue => ({ gain: 0.22, rate: 0.7 });
