import { useSyncExternalStore } from 'react';
import { audioPrefs } from '../audio/prefs';
import type { AudioPrefs, PrefsStore } from '../audio/prefs';
import './AudioSettings.css';

type VolumeKey = 'master' | 'music' | 'ambience' | 'sfx';

/** The four independent volumes, in display order. `id` doubles as the test id suffix. */
export const VOLUME_CONTROLS: readonly { key: VolumeKey; label: string }[] = [
  { key: 'master', label: 'Master' },
  { key: 'music', label: 'Afrobeats music' },
  { key: 'ambience', label: 'Lagos ambience & voices' },
  { key: 'sfx', label: 'Gameplay effects' },
];

export interface AudioSettingsPanelProps {
  /** Mute lives in the app's GameSettings (it is shared with the HUD mute button). */
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  /** Injected for tests; defaults to the shared persistent store. */
  store?: PrefsStore;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/**
 * Independent, persistent volume sliders (master / music / Lagos ambience and voices / effects), the
 * spoken-Pidgin switch, mute and a reset. Changes apply live (the audio engine follows the store) and
 * are saved to localStorage by the store itself.
 */
export function AudioSettingsPanel({ muted, onMutedChange, store = audioPrefs }: AudioSettingsPanelProps) {
  const prefs: Readonly<AudioPrefs> = useSyncExternalStore(store.subscribe, store.get, store.get);
  return (
    <div className="audio-panel" data-testid="audio-settings">
      {VOLUME_CONTROLS.map(({ key, label }) => (
        <label className="audio-row" key={key}>
          <span>{label}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={Math.round(prefs[key] * 100)}
            aria-label={`${label} volume`}
            data-testid={`audio-${key}`}
            onChange={(e) => store.set({ [key]: Number(e.target.value) / 100 })}
          />
          <output>{pct(prefs[key])}</output>
        </label>
      ))}
      <div className="audio-buttons">
        <button
          type="button"
          className={`chip${muted ? ' on' : ''}`}
          data-testid="toggle-mute"
          aria-pressed={muted}
          onClick={() => onMutedChange(!muted)}
        >
          {muted ? 'Muted' : 'Sound on'}
        </button>
        <button
          type="button"
          className={`chip${prefs.voices ? ' on' : ''}`}
          data-testid="toggle-voices"
          aria-pressed={prefs.voices}
          onClick={() => store.set({ voices: !prefs.voices })}
        >
          Pidgin voices {prefs.voices ? 'on' : 'off'}
        </button>
        <button type="button" className="chip" data-testid="audio-reset" onClick={() => store.reset()}>
          Reset audio
        </button>
      </div>
      <p className="audio-note">Pidgin voices are synthetic placeholders until real recordings are added.</p>
    </div>
  );
}
