/**
 * The rung Auto settled on, remembered per device so the next visit starts where the last one ended
 * instead of guessing again (hints are only the first estimate). Stored beside, not inside, the game
 * settings: it is a measurement of this device, not a preference, and "Restore defaults" does not touch it.
 * Everything tolerates missing / blocked / corrupt storage (private mode): Auto then simply uses the estimate.
 */
import { MAX_RUNG } from '../quality';

export const LEARNED_KEY = 'wahala.quality.learned.v1';

/** Learned values older than this are ignored (drivers, thermals and OS updates change). */
export const LEARNED_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export interface LearnedRung {
  rung: number;
  /** deviceFingerprint() of the device it was measured on. */
  device: string;
  savedAt: number;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function loadLearned(store: Store | undefined, device: string, now: number): number | null {
  try {
    const raw = store?.getItem(LEARNED_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LearnedRung>;
    if (v.device !== device) return null;
    if (typeof v.rung !== 'number' || !Number.isInteger(v.rung) || v.rung < 0 || v.rung > MAX_RUNG)
      return null;
    if (typeof v.savedAt !== 'number' || now - v.savedAt > LEARNED_MAX_AGE_MS || v.savedAt > now + 60_000)
      return null;
    return v.rung;
  } catch {
    return null;
  }
}

export function saveLearned(store: Store | undefined, device: string, rung: number, now: number): void {
  try {
    const value: LearnedRung = { rung, device, savedAt: now };
    store?.setItem(LEARNED_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: the next visit re-estimates */
  }
}
