/**
 * The voice chat state. Voice does not exist yet: this shows "not available" with the planned controls greyed out,
 * and only when the `voice` feature flag is on (a build-time switch that is off everywhere today). It never asks
 * for a microphone and never creates a connection (docs/VOICE_CHAT_DESIGN.md).
 */
import { flags } from '../../platform';
import { NullVoiceProvider } from '../../voice';
import './online.css';

const PLANNED: readonly { id: string; label: string }[] = [
  { id: 'mute', label: 'Mute (on by default)' },
  { id: 'deafen', label: 'Deafen' },
  { id: 'mic', label: 'Allow microphone' },
  { id: 'report', label: 'Report player' },
];

export function VoiceStatus() {
  if (!flags().voice) return null;
  return (
    <section className="ol-voice" data-testid="voice-status" data-provider={NullVoiceProvider.status}>
      <b>Voice chat is not available yet</b>
      <small>Planned: team-only voice in team matches, off until you choose to talk. Nothing is recorded or sent.</small>
      <span className="ol-voice-controls">
        {PLANNED.map((c) => (
          <button key={c.id} type="button" className="ol-chip" disabled aria-disabled="true">
            {c.label}
          </button>
        ))}
      </span>
    </section>
  );
}
