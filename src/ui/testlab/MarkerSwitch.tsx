/** The live player-marker switch of the "Who am I?" scenario (decision PI1): Original / Indicator / Indicator + Ground. */
import { commands } from '../../app/session';
import { MARKER_MODES, setMarker } from '../../testlab/labActions';
import { useLab } from '../../testlab/labStore';

export function MarkerSwitch() {
  const marker = useLab((s) => s.marker);
  return (
    <div className="tl-marker" data-testid="marker-switch" role="group" aria-label="Player marker style">
      <small>Player marker</small>
      {MARKER_MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          className={`chip mn-opt${m.mode === marker ? ' on' : ''}`}
          data-testid={`marker-${m.mode}`}
          aria-pressed={m.mode === marker}
          onClick={() => {
            commands.click();
            setMarker(m.mode);
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** The small in-match button (the HUD's round-button row, the marker scenario only): cycles the three styles. */
export function MarkerHudButton() {
  const marker = useLab((s) => s.marker);
  const run = useLab((s) => s.run);
  if (run?.entryId !== 'identifyPlayer') return null;
  const i = MARKER_MODES.findIndex((m) => m.mode === marker);
  const next = MARKER_MODES[(i + 1) % MARKER_MODES.length]!;
  const label = MARKER_MODES[i]?.label ?? '';
  return (
    <button
      type="button"
      className="round-btn tl-hud-btn"
      data-testid="marker-hud-button"
      aria-label={`Player marker: ${label} (tap for ${next.label})`}
      title={`Player marker: ${label}`}
      onClick={() => setMarker(next.mode)}
    >
      {marker === 'original' ? 'ORIG' : marker === 'indicator' ? 'IND' : 'IND+G'}
    </button>
  );
}
