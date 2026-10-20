import { VEHICLE_DEFS } from '../sim';
import type { VehicleKind } from '../sim';
import { commands } from '../app/session';
import { useGameStore } from '../app/store';

/** Instructions + Launch / Cancel buttons shown while the player is choosing a vehicle entrance. */
export function EntryPanel({
  entry,
}: {
  entry: { stage: 'entry' | 'turn'; fraction: number; vehicle: VehicleKind };
}) {
  const device = useGameStore((s) => s.device);
  const name = VEHICLE_DEFS[entry.vehicle].name;
  const hint =
    device === 'touch'
      ? 'Tap a glowing arrow to preview, tap it again (or LAUNCH) to confirm.'
      : device === 'gamepad'
        ? 'D-pad: choose · A: confirm · B: back'
        : 'Arrows: choose · Enter: confirm · Esc: back · or click an arrow';
  return (
    <div className="entry-panel" data-testid="entry-panel" data-stage={entry.stage}>
      <h4>{entry.stage === 'entry' ? `CALL IN THE ${name.toUpperCase()}` : 'PICK WHERE THE KEKE TURNS'}</h4>
      <p>
        {entry.stage === 'entry'
          ? 'Pick a border entrance. The vehicle is warned, then drives in.'
          : 'The Keke makes exactly one 90° turn.'}{' '}
        {hint}
      </p>
      <div className="bar">
        <i style={{ transform: `scaleX(${entry.fraction})` }} />
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button
          type="button"
          className="btn small green"
          data-testid="entry-confirm"
          onClick={() => commands.entryConfirm()}
        >
          {entry.stage === 'turn' ? 'Launch' : entry.vehicle === 'keke' ? 'Next' : 'Launch'}
        </button>
        <button
          type="button"
          className="btn small"
          data-testid="entry-cancel"
          onClick={() => commands.entryCancel()}
        >
          Back
        </button>
      </div>
    </div>
  );
}
