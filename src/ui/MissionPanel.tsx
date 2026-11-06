import type { MissionView } from '../sim';
import { missionPanelModel } from './missionPanelModel';
import './MissionPanel.css';

/**
 * The campaign mission panel (decision HC5), a block of the HUD rail beside the board: three phase pips, the
 * objective with a progress bar, the phase's callout, the boss status (SHIELDED / EXPOSED with a countdown /
 * DEFEATED), lives, time left and the incoming warnings with their seconds. Renders nothing without a mission, so a
 * normal match is unchanged. Never over the board: it only lives in the rail's column.
 */
export function MissionPanel({ mission }: { mission: MissionView | null }) {
  if (!mission) return null;
  const m = missionPanelModel(mission);
  return (
    <section
      className={`mission-panel boss-${m.boss.state}${m.field ? ' is-field' : ''}${m.outcome ? ` over ${m.outcome}` : ''}`}
      data-testid="mission-panel"
      data-phase={mission.phase}
      data-boss={m.boss.state}
      aria-label="Mission"
    >
      <header className="mp-head">
        <span className="mp-pips" data-testid="mission-pips" role="img" aria-label={m.phaseLabel}>
          {m.pips.map((p) => (
            <i key={p.index} className={`mp-pip ${p.state}`} data-state={p.state} />
          ))}
        </span>
        <span className="mp-phase">{m.phaseLabel}</span>
        <b className="mp-time" data-testid="mission-time" data-seconds={m.time.seconds}>
          {m.time.label}
        </b>
      </header>
      {/* a field mission's objective is the FieldGoal block above the panel (tag + target) */}
      {!m.field && (
        <div className="mp-objective" data-testid="mission-objective">
          {m.objective}
        </div>
      )}
      <div
        className="mp-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={m.progress.goal}
        aria-valuenow={m.progress.done}
        data-testid="mission-progress"
      >
        <i style={{ width: `${Math.round(m.progress.fraction * 100)}%` }} />
      </div>
      <div className="mp-progress-text" data-testid="mission-progress-text">
        {m.progress.text}
      </div>
      {m.callout && (
        <p className="mp-callout" data-testid="mission-callout">
          {m.callout}
        </p>
      )}
      <div className="mp-foot">
        {m.showBoss && (
          <span
            className={`mp-boss ${m.boss.state}`}
            data-testid="mission-boss"
            data-seconds={m.boss.seconds ?? ''}
          >
            {m.boss.label}
          </span>
        )}
        <span className="mp-lives" data-testid="mission-lives" data-left={m.lives.left}>
          {m.lives.label}
        </span>
      </div>
      {m.warnings.length > 0 && (
        <ul className="mp-warnings" data-testid="mission-warnings">
          {m.warnings.map((w, i) => (
            <li key={`${w.kind}${i}`} className={`${w.kind}${w.urgent ? ' urgent' : ''}`} data-kind={w.kind}>
              {w.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
