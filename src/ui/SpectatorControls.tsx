/**
 * V2 sideline spectator controls (standard matches, decision WB12). Once the local player is out they walk
 * the lane just outside the board and throw generators in: on touch screens the same floating stick plus
 * one A button labelled THROW (dimmed while it recharges); on desktop / gamepad a one-line hint (arrows or
 * stick walk the lane, Space / A throws). The small bar keeps "Skip to results" and shows the recharge.
 * Nothing here decides anything: the rules are sim/systems/spectators.ts.
 */
import { commands, input } from '../app/session';
import { useGameStore } from '../app/store';
import { Joystick } from './TouchControls';
import './SpectatorControls.css';

export function SpectatorControls(props: { touch: boolean }) {
  const sideline = useGameStore((s) => s.hud?.sideline ?? null);
  const device = useGameStore((s) => s.device);
  if (!sideline) return null;
  const hint = sideline.closed
    ? 'Final seconds: no more throws'
    : props.touch || device === 'touch'
      ? 'Stick walks the sideline · THROW lands where it flashes'
      : device === 'gamepad'
        ? 'Stick walks the sideline · A throws a generator in'
        : 'Arrows walk the sideline · Space throws a generator in';
  return (
    <>
      <div className="sideline-bar" data-testid="sideline">
        <b>SIDELINE</b>
        <span className="sideline-hint">{hint}</span>
        <i className="sideline-charge" style={{ ['--p' as string]: `${Math.round(sideline.charge * 100)}%` }} />
        <button
          type="button"
          className="btn small primary"
          data-testid="skip-results"
          onClick={() => commands.skipToResults()}
        >
          Skip to results
        </button>
      </div>
      {props.touch && (
        <div className="touch" data-testid="sideline-touch">
          <Joystick entryOpen={false} />
          <div className="actions">
            <button
              type="button"
              className={`abtn bomb sideline-throw${sideline.canThrow ? '' : ' dim'}`}
              data-testid="btn-throw"
              onPointerDown={(e) => {
                e.preventDefault();
                input.touchPress('place');
              }}
            >
              <span>
                <b>THROW</b>
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
