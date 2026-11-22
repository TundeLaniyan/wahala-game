/**
 * A read-only snapshot of the player's real saved match settings, taken ONCE when the Test Lab installs its in-memory
 * storage (decision TL6). The lab's own storage starts empty, so without this the lab could never know what the player
 * actually plays with; with it "Use Current Rumble Settings" can reproduce a normal match. Only `getItem` is ever
 * called on the real storage here: nothing is written, removed or cleared. A leaf module (no imports), so the isolation
 * boot can use it before any game module is evaluated.
 */

/** Must equal `SETTINGS_KEY` in `app/settings.ts` (a test checks it; that module cannot be imported before isolation). */
export const REAL_SETTINGS_KEY = 'wahala.settings.v1';

interface Readable {
  getItem(key: string): string | null;
}

let text: string | null = null;
let taken = false;

/** Reads the saved settings text from the real storage (once). Never writes. */
export function captureRealSettings(real: Readable | null): void {
  if (taken) return;
  taken = true;
  try {
    text = real?.getItem(REAL_SETTINGS_KEY) ?? null;
  } catch {
    text = null; // blocked storage: the lab shows the defaults and says so
  }
}

/** The player's saved settings JSON as it was when the lab opened (null: none saved, or storage unreadable). */
export function realSettingsText(): string | null {
  return text;
}

/** Test seam: forget the snapshot (unit tests only). */
export function resetRealSnapshotForTests(): void {
  text = null;
  taken = false;
}
