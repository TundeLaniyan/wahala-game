import { useSyncExternalStore } from 'react';
import { audioPrefs, isRecommendedMix } from '../audio/prefs';
import type { AudioPrefs, PrefsStore } from '../audio/prefs';
import { SUBTITLE_MODES } from '../app/settings';
import type { SubtitleMode } from '../app/settings';
import './AudioSettings.css';

type VolumeKey = 'master' | 'music' | 'ambience' | 'sfx';

/** The four independent volumes, in display order. `id` doubles as the test id suffix. */
export const VOLUME_CONTROLS: readonly { key: VolumeKey; label: string }[] = [
  { key: 'master', label: 'Master' },
  { key: 'music', label: 'Music' },
  { key: 'ambience', label: 'Ambience & voices' },
  { key: 'sfx', label: 'Gameplay effects' },
];

export interface AudioSettingsPanelProps {
  /** Mute lives in the app's GameSettings (it is shared with the HUD mute button). */
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  /** Subtitles for the voice lines (a game setting, saved with the others). */
  subtitles: SubtitleMode;
  onSubtitlesChange: (mode: SubtitleMode) => void;
  /** Injected for tests; defaults to the shared persistent store. */
  store?: PrefsStore;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const SUBTITLE_LABEL: Record<SubtitleMode, string> = {
  off: 'Subtitles off',
  on: 'Subtitles on',
  large: 'Subtitles large',
};
const nextMode = (m: SubtitleMode): SubtitleMode =>
  SUBTITLE_MODES[(SUBTITLE_MODES.indexOf(m) + 1) % SUBTITLE_MODES.length] ?? 'off';

/**
 * Independent, persistent volume sliders (master / music / ambience and voices / effects), the
 * spoken-voices switch, the subtitles setting (off / on / large), mute and the "Recommended mix" button (restores the music-first defaults, also for
 * a player whose browser still holds an older saved mix). Changes apply live (the audio engine follows the store) and
 * are saved to localStorage by the store itself.
 */
export function AudioSettingsPanel({
  muted,
  onMutedChange,
  subtitles,
  onSubtitlesChange,
  store = audioPrefs,
}: AudioSettingsPanelProps) {
  const prefs: Readonly<AudioPrefs> = useSyncExternalStore(store.subscribe, store.get, store.get);
  const recommended = isRecommendedMix(prefs);
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
          Voices {prefs.voices ? 'on' : 'off'}
        </button>
        <button
          type="button"
          className={`chip${subtitles !== 'off' ? ' on' : ''}`}
          data-testid="toggle-subtitles"
          data-mode={subtitles}
          aria-pressed={subtitles !== 'off'}
          title="Show the voice line being spoken, beside the arena (off / on / large text)"
          onClick={() => onSubtitlesChange(nextMode(subtitles))}
        >
          {SUBTITLE_LABEL[subtitles]}
        </button>
        <button
          type="button"
          className={`chip${recommended ? ' on' : ''}`}
          data-testid="audio-reset"
          aria-pressed={recommended}
          title="Music 90%, effects 50%, ambience and voices 45%, master 85%"
          onClick={() => store.reset()}
        >
          {recommended ? 'Recommended mix ✓' : 'Use recommended mix'}
        </button>
      </div>
      <p className="audio-note">
        Voices are synthetic Nigerian Pidgin clips (AI text-to-speech), more on the way.
      </p>
    </div>
  );
}
