/**
 * The match loading screen (app/matchLoader.ts, docs/MATCH_LOADING.md). Shown the moment Play / Start / Rematch / a
 * campaign mission is pressed, before any heavy 3D set-up, and removed once the first frames of the match are drawn.
 * Lightweight on purpose: text, the WAHALA! mark and a CSS pulse, no artwork to download. On a phone held upright it
 * leads with the turn-sideways instruction (loading carries on underneath). After a failure: Retry and Back.
 */
import { loadStep, loadTitle } from '../app/matchLoader';
import type { MatchLoadPhase, MatchLoadState } from '../app/matchLoader';
import { commands } from '../app/session';
import { useGameStore } from '../app/store';
import './matchLoading.css';

const STEPS: { phase: MatchLoadPhase; label: string }[] = [
  { phase: 'assets', label: 'Fighters and vehicles' },
  { phase: 'arena', label: 'Arena' },
  { phase: 'scene', label: 'First frame' },
];
const ORDER: MatchLoadPhase[] = ['starting', 'assets', 'arena', 'scene'];

function stepState(current: MatchLoadPhase, step: MatchLoadPhase): 'done' | 'now' | 'next' {
  const a = ORDER.indexOf(current);
  const b = ORDER.indexOf(step);
  return a > b ? 'done' : a === b ? 'now' : 'next';
}

export function MatchLoading({ load }: { load: MatchLoadState }) {
  const portrait = useGameStore((s) => s.portrait);
  const failed = load.phase === 'failed';
  return (
    <div
      className={`mn-load${portrait ? ' upright' : ''}`}
      data-testid="match-loading"
      data-phase={load.phase}
      role={failed ? 'alertdialog' : 'status'}
      aria-live="polite"
    >
      <div className="mn-load-card">
        {portrait && !failed && (
          <div className="mn-load-rotate" data-testid="match-loading-rotate">
            <span className="phone" aria-hidden>
              📱
            </span>
            <b>Turn your phone sideways</b>
            <small>WAHALA! plays in landscape. The match is loading meanwhile.</small>
          </div>
        )}
        <small className="mn-kicker">WAHALA!</small>
        <h2>{failed ? 'The match did not start' : loadTitle(load.kind)}</h2>
        {failed ? (
          <>
            <p className="mn-load-error" data-testid="match-loading-error">
              {load.error ?? 'Something went wrong while setting up the match.'}
            </p>
            <div className="mn-load-actions">
              <button
                type="button"
                className="mn-btn mn-primary"
                data-testid="match-loading-retry"
                onClick={() => commands.loadRetry()}
              >
                Retry
              </button>
              <button
                type="button"
                className="mn-btn mn-secondary"
                data-testid="match-loading-back"
                onClick={() => commands.loadBack()}
              >
                Back
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mn-load-step" data-testid="match-loading-step">
              <i className="mn-load-pulse" aria-hidden />
              {loadStep(load)}
            </p>
            <ol className="mn-load-steps">
              {STEPS.map((s) => (
                <li key={s.phase} data-state={stepState(load.phase, s.phase)}>
                  {s.label}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
