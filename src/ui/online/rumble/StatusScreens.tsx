/**
 * The short states between the entry and the match: connecting, a failure, and loading the arena. All three always offer a
 * way out (Cancel / Back), so there is never an endless spinner with nothing to press.
 */
import { PrimaryButton, ScreenFrame, SecondaryButton } from '../../menu/Frame';
import { errorMessage, loadingModel } from './models';
import type { FailReason } from './models';
import type { ConnStatus } from '../../../net/client/types';
import { TestSessionNote } from './parts';
import './rumble.css';

function Spinner() {
  return (
    <div className="ro-spinner" aria-hidden>
      <i />
      <i />
      <i />
    </div>
  );
}

export function ConnectingScreen(p: { what: string; fake: boolean; onCancel(): void }) {
  return (
    <ScreenFrame
      id="rumbleOnline"
      kicker="City Rumble"
      title="Connecting"
      onBack={p.onCancel}
      backLabel="Cancel"
      status={p.fake ? <TestSessionNote /> : undefined}
      className="ro-screen"
    >
      <div className="ro-center" data-testid="ro-connecting" role="status">
        <Spinner />
        <p className="ro-big">{p.what}</p>
        <SecondaryButton testId="ro-cancel" onClick={p.onCancel}>
          Cancel
        </SecondaryButton>
      </div>
    </ScreenFrame>
  );
}

/** The failure message and its buttons (on the menu screen and, mid-match, over the board). */
export function ErrorBody(p: {
  reason: FailReason | 'not-configured';
  detail: string | null;
  onRetry(): void;
  onBack(): void;
}) {
  const e = errorMessage(p.reason, p.detail);
  return (
    <div className="ro-center ro-error" data-testid="ro-error" data-reason={p.reason} role="alert">
      <h3 className="ro-error-title">{e.title}</h3>
      <p className="ro-big" data-testid="ro-error-text">
        {e.text}
      </p>
      {e.detail && (
        <p className="ro-small" data-testid="ro-error-detail">
          {e.detail}
        </p>
      )}
      <div className="ro-row">
        {e.canRetry && (
          <PrimaryButton testId="ro-retry" autoFocus onClick={p.onRetry}>
            Try again
          </PrimaryButton>
        )}
        <SecondaryButton testId="ro-error-back" onClick={p.onBack}>
          Back
        </SecondaryButton>
      </div>
    </div>
  );
}

export function ErrorScreen(p: {
  reason: FailReason | 'not-configured';
  detail: string | null;
  onRetry(): void;
  onBack(): void;
  fake?: boolean;
}) {
  return (
    <ScreenFrame
      id="rumbleOnline"
      kicker="City Rumble"
      title="Online"
      onBack={p.onBack}
      status={p.fake ? <TestSessionNote /> : undefined}
      className="ro-screen"
    >
      <ErrorBody reason={p.reason} detail={p.detail} onRetry={p.onRetry} onBack={p.onBack} />
    </ScreenFrame>
  );
}

export function LoadingScreen(p: {
  conn: ConnStatus;
  progress: { done: number; total: number } | null;
  fake: boolean;
  onRetry(): void;
  onBack(): void;
}) {
  const v = loadingModel(p.conn, p.progress);
  return (
    <ScreenFrame
      id="rumbleOnline"
      kicker="City Rumble"
      title="Loading"
      onBack={p.onBack}
      backLabel="Leave"
      status={p.fake ? <TestSessionNote /> : undefined}
      className="ro-screen"
    >
      <div className="ro-center" data-testid="ro-loading" role="status" aria-live="polite">
        {v.stalled ? (
          <>
            <p className="ro-big" data-testid="ro-loading-stalled">
              {v.stalledText}
            </p>
            <div className="ro-row">
              <PrimaryButton testId="ro-retry" autoFocus onClick={p.onRetry}>
                Try again
              </PrimaryButton>
              <SecondaryButton testId="ro-loading-back" onClick={p.onBack}>
                Back to menu
              </SecondaryButton>
            </div>
          </>
        ) : (
          <>
            <p className="ro-big">{v.text}</p>
            <div
              className={`ro-bar${v.progress ? '' : ' indeterminate'}`}
              role="progressbar"
              aria-label="Loading"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={v.progress?.percent}
              style={v.progress ? { ['--p' as string]: `${v.progress.percent}%` } : undefined}
              data-testid="ro-loading-bar"
            >
              <i />
            </div>
            {v.progress && (
              <p className="ro-small" data-testid="ro-loading-count">
                {v.progress.done} / {v.progress.total}
              </p>
            )}
            <SecondaryButton testId="ro-loading-back" onClick={p.onBack}>
              Leave
            </SecondaryButton>
          </>
        )}
      </div>
    </ScreenFrame>
  );
}

/** Only seen while the match hand-over is not wired (the match itself is the game screen). */
export function MatchScreen(p: { fake: boolean; onBack(): void }) {
  return (
    <ScreenFrame
      id="rumbleOnline"
      kicker="City Rumble"
      title="Match"
      onBack={p.onBack}
      backLabel="Leave"
      status={p.fake ? <TestSessionNote /> : undefined}
      className="ro-screen"
    >
      <div className="ro-center" data-testid="ro-match" role="status">
        <p className="ro-big">The match is running.</p>
      </div>
    </ScreenFrame>
  );
}
