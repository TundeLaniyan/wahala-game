/**
 * Preset quick signals (docs/PLATFORM_CLIENT.md, decision MP-SIG): the picker shows only the ids the room's phase allows,
 * the feed shows what arrived (sender name + the catalogue label, React text). There is no free text and no voice. In a
 * match the picker is a small corner button beside the connection chip; incoming signals go to the HUD rail beside the board
 * (never over it). Presentational.
 */
import { useState } from 'react';
import type { SignalFeedItem } from '../../../app/rumbleOnlineFlow';
import type { SignalOption } from '../../../online/platform/signals';
import './platform.css';

export interface SignalPanelProps {
  options: SignalOption[];
  feed: SignalFeedItem[];
  /** Sending is possible now (connected, a phase that allows signals, not restricted). */
  canSend: boolean;
  /** The server said this player may not send signals right now. */
  blocked: boolean;
  onSend(id: string): void;
}

const testKey = (id: string): string => id.replace(/\./g, '-');

export function SignalFeed({ feed }: { feed: SignalFeedItem[] }) {
  return (
    <ol className="qs-feed" data-testid="qs-feed" aria-label="Quick signals" aria-live="polite">
      {feed.map((s) => (
        <li
          key={s.key}
          className={`qs-item${s.mine ? ' mine' : ''}`}
          data-testid="qs-feed-item"
          data-signal={s.id}
        >
          <b>{s.mine ? 'You' : s.name}</b> <span>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** The room / results panel: a row of preset buttons and the latest signals. */
export function SignalPanel(p: SignalPanelProps) {
  return (
    <section className="ro-card qs-panel wide" aria-label="Quick signals" data-testid="qs-panel">
      <small className="mn-kicker">Quick signals</small>
      {p.blocked ? (
        <p className="ro-sub" data-testid="qs-blocked" role="status">
          You cannot send signals right now.
        </p>
      ) : (
        <div className="qs-picker" data-testid="qs-picker" role="group" aria-label="Send a quick signal">
          {p.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`chip qs-btn ${o.kind}`}
              data-testid={`qs-send-${testKey(o.id)}`}
              disabled={!p.canSend}
              onClick={() => p.onSend(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {p.feed.length > 0 ? <SignalFeed feed={p.feed} /> : <p className="ro-sub">No signals yet.</p>}
    </section>
  );
}

/** In a match: one small button by the connection chip; tapping it opens the allowed presets; a pick sends and closes. */
export function MatchSignalButton(p: Omit<SignalPanelProps, 'feed'>) {
  const [open, setOpen] = useState(false);
  if (p.blocked) return null;
  return (
    <div className="qs-hud" data-testid="qs-hud">
      <button
        type="button"
        className="mn-btn mn-secondary small qs-hud-toggle"
        data-testid="qs-hud-toggle"
        aria-expanded={open}
        aria-controls="qs-hud-picker"
        disabled={!p.canSend && !open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Close' : 'Signal'}
      </button>
      {open && (
        <div
          id="qs-hud-picker"
          className="qs-hud-picker"
          data-testid="qs-hud-picker"
          role="group"
          aria-label="Send a quick signal"
        >
          {p.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`chip qs-btn ${o.kind}`}
              data-testid={`qs-hud-send-${testKey(o.id)}`}
              disabled={!p.canSend}
              onClick={() => {
                p.onSend(o.id);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
