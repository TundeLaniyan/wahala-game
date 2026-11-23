/**
 * The Test Lab's store actions that need no running game (they only edit `labStore`): the City Rumble set-up, "Use
 * Current Rumble Settings", the chosen variant and the player-marker switch. Kept apart from `controller.ts` (which
 * imports the whole app session) so they can be unit-tested headlessly.
 */
import { labPatch, useLab } from './labStore';
import { realSettingsText } from './realSnapshot';
import { realSettingsFrom, rumbleConfigOf, rumbleSummaryLine } from './rumbleSetup';
import type { RumbleLabConfig } from './rumbleSetup';

/** Changes one field of the City Rumble set-up: it no longer matches the player's real settings, so it is "Custom". */
export function setRumbleField<K extends keyof RumbleLabConfig>(key: K, value: RumbleLabConfig[K]): void {
  const s = useLab.getState();
  const next = { ...s.rumble, [key]: value };
  const real = s.realSettings ? rumbleConfigOf(s.realSettings) : null;
  const same =
    real !== null && (Object.keys(next) as (keyof RumbleLabConfig)[]).every((k) => next[k] === real[k]);
  labPatch({ rumble: next, rumbleSource: same ? 'current' : 'custom' });
}

/** "Use Current Rumble Settings": copies the player's real saved settings (read once when the lab opened; never written back). */
export function copyCurrentRumbleSettings(): boolean {
  const real = realSettingsFrom(realSettingsText());
  if (!real) return false;
  labPatch({ realSettings: real, rumble: rumbleConfigOf(real), rumbleSource: 'current' });
  return true;
}

export function setVariant(entryId: string, variantId: string): void {
  const s = useLab.getState();
  labPatch({ variants: { ...s.variants, [entryId]: variantId } });
}

/** The one-line configuration a feedback note carries for the City Rumble test. */
export function rumbleFeedbackSetup(): string {
  return rumbleSummaryLine(useLab.getState().rumble);
}
