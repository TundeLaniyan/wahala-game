/**
 * The connection chip and the reconnect banner of an online match (docs/ONLINE_INTEGRATION.md section 6). Exported for the
 * in-match overlay (RumbleOnlineOverlay mounts them); both are driven by the pure `netStatusModel`. The chip is small and
 * sits in a corner; the banner appears only when the connection is not up, and it is the one thing allowed over the board
 * because the player has to know a bot is playing for them. Presentational.
 */
import type { RemoteStatus } from '../../../app/remoteMatch';
import { netStatusModel } from './models';
import './rumble.css';

export type NetStatusInput = Pick<RemoteStatus, 'connection' | 'rttMs'> &
  Partial<Pick<RemoteStatus, 'detail'>>;

export function NetStatusChip({ status }: { status: NetStatusInput }) {
  const v = netStatusModel(status);
  return (
    <div
      className={`ro-chip ${v.tone}`}
      data-testid="net-chip"
      data-state={status.connection}
      data-ping={v.pingTone}
    >
      <i aria-hidden />
      <span className="ro-chip-label">{v.label}</span>
      {status.connection === 'connected' && (
        <span className="ro-chip-ping" data-testid="net-ping">
          {v.ping}
        </span>
      )}
      <span className="ro-visually-hidden" role="status" aria-live="polite">
        {v.announce}
      </span>
    </div>
  );
}

export function ReconnectBanner(p: {
  status: NetStatusInput;
  /** The server's reserved window in seconds, when known. */
  reserveSeconds?: number | null;
  onRetry?: () => void;
  onMenu?: () => void;
}) {
  const v = netStatusModel(p.status, { reserveSeconds: p.reserveSeconds });
  const b = v.banner;
  if (!b) return null;
  return (
    <div className={`ro-banner ${b.kind}`} role="alert" data-testid="net-banner" data-kind={b.kind}>
      <div className="ro-banner-text">
        <b data-testid="net-banner-title">{b.title}</b>
        <span data-testid="net-banner-text">{b.text}</span>
        {b.reserve && <small data-testid="net-banner-reserve">{b.reserve}</small>}
      </div>
      {b.actions.length > 0 && (
        <div className="ro-banner-actions">
          {b.actions.includes('retry') && (
            <button
              type="button"
              className="mn-btn mn-primary small"
              data-testid="net-retry"
              onClick={p.onRetry}
            >
              Retry
            </button>
          )}
          {b.actions.includes('menu') && (
            <button
              type="button"
              className="mn-btn mn-secondary small"
              data-testid="net-menu"
              onClick={p.onMenu}
            >
              Back to menu
            </button>
          )}
        </div>
      )}
    </div>
  );
}
