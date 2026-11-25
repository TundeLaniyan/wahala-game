/**
 * The Home "Music Data Saver" shortcut (decision FU2-6): one compact ON / OFF control that edits the SAME persistent
 * preference as Settings > Audio > Data Saver (`GameSettings.dataSaver`: auto / on / off), never a parallel state. Pure
 * (unit-tested): what it shows is the EFFECTIVE state (`dataSaverActive`), and while the setting is Auto it says so; a tap
 * always writes an explicit On or Off (the opposite of what is in effect), so the player's choice is saved and sticks.
 *
 * The wording is from what the setting does (`audio/music.ts`: a track with a `lite` file streams that 96 kbps copy): it
 * saves MUSIC downloads, for the menu and the match, and nothing else. It does not shrink arena, fighter or vehicle model
 * downloads, voice clips or images, and it changes no graphics or gameplay.
 */
import { dataSaverActive } from '../../app/settings';
import type { GameSettings } from '../../app/settings';

export interface DataSaverShortcut {
  /** Data Saver is in effect right now (explicitly On, or Auto while the browser's own Data Saver is on). */
  effective: boolean;
  /** The saved setting is Auto: the state follows the browser, so the control says "(auto)". */
  auto: boolean;
  /** The two visible lines: the name, then the state. */
  title: string;
  state: string;
  /** The same as one phrase, e.g. "Music Data Saver: ON (auto)": the accessible name and the test hook. */
  label: string;
  /** What the control does and does not save (tooltip / accessible description). */
  hint: string;
  /** The explicit value a tap saves. */
  next: 'on' | 'off';
}

export function dataSaverShortcut(setting: GameSettings['dataSaver'], nav?: unknown): DataSaverShortcut {
  const effective = nav === undefined ? dataSaverActive(setting) : dataSaverActive(setting, nav);
  const auto = setting === 'auto';
  const word = effective ? 'ON' : 'OFF';
  const state = auto ? `${word} (auto)` : word;
  return {
    effective,
    auto,
    title: 'Music Data Saver',
    state,
    label: `Music Data Saver: ${state}`,
    hint: auto
      ? `Automatic: follows your browser's own Data Saver. Tap to switch it ${effective ? 'off' : 'on'} yourself. Smaller music files only: arena and fighter downloads are not reduced.`
      : `${effective ? 'Tap to switch off.' : 'Tap to switch on.'} Smaller music files only (about 60% fewer bytes per track): arena and fighter downloads are not reduced.`,
    next: effective ? 'off' : 'on',
  };
}
