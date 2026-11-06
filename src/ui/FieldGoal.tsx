import type { MissionView } from '../sim';
import { fieldGoalModel } from './missionPanelModel';
import './FieldGoal.css';

/**
 * The field mission's "what now" block (docs/CHECKPOINT_CLARITY.md, decisions CK4-CK6): a tag (GO TO / HOLD / DEFEAT /
 * ESCAPE / RETURN), the target ("CHECKPOINT A 1 OF 3"), and for a door the explicit hold bar "HOLD 0.4 / 1.0 s" that
 * fills while the fighter stands on the door and drains when they step off. It is the FIRST block of the City Rumble
 * right column (and of the rail on a standard arena), so it stays visible on a phone where the column is short. Renders
 * nothing outside a field mission. Never over the board.
 */
export function FieldGoal({ mission }: { mission: MissionView | null }) {
  const g = fieldGoalModel(mission);
  if (!g) return null;
  return (
    <section
      className={`field-goal verb-${g.verb}${g.hold ? ' has-hold' : ''}`}
      data-testid="field-goal"
      data-verb={g.verb}
      aria-label="Objective"
    >
      <div className="fg-line">
        <b className="fg-tag" data-testid="field-goal-tag">
          {g.tag}
        </b>
        <span className="fg-target" data-testid="field-goal-target">
          {g.target}
        </span>
        {g.step && (
          <span className="fg-step" data-testid="field-goal-step">
            {g.step}
          </span>
        )}
      </div>
      {g.hold && (
        <div
          className={`fg-hold ${g.hold.state}`}
          data-testid="field-hold"
          data-state={g.hold.state}
          data-fraction={g.hold.fraction.toFixed(2)}
        >
          <div
            className="fg-hold-bar"
            role="progressbar"
            aria-label={g.hold.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(g.hold.fraction * 100)}
          >
            <i style={{ width: `${Math.round(g.hold.fraction * 100)}%` }} />
          </div>
          <div className="fg-hold-text">
            <b data-testid="field-hold-label">{g.hold.label}</b>
            <span>{g.hold.hint}</span>
          </div>
        </div>
      )}
      {g.notes.length > 0 && (
        <div className="fg-notes" data-testid="field-goal-notes">
          {g.notes.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
      )}
    </section>
  );
}
