/**
 * The per-member menu of the room (docs/PLATFORM_CLIENT.md): for a VERIFIED platform player Mute / Block / Report go to the
 * platform (they are not told about a mute; a block also unfriends); for a guest (no platform id) only a LOCAL mute exists:
 * this browser hides that name's signals for the rest of the page and nothing is sent anywhere. The report form is the
 * platform's: one category and an optional note of at most 200 characters. Presentational.
 */
import { useEffect, useRef, useState } from 'react';
import { REPORT_CATEGORIES, REPORT_NOTE_MAX } from '../../../online/platform/types';
import type { ReportCategory } from '../../../online/platform/types';
import type { MemberTarget } from './models';
import { REPORT_LABELS } from './models';
import './platform.css';

/** The small "verified" mark next to a platform player's name (a guest never has it). */
export function VerifiedBadge() {
  return (
    <span className="ro-tag pf-verified" data-testid="pf-verified" title="Signed in with the player service">
      VERIFIED
    </span>
  );
}

/** The "..." button on a member row (never on your own row). */
export function MemberMenuButton({ name, onOpen }: { name: string; onOpen(): void }) {
  return (
    <button
      type="button"
      className="pf-member-btn"
      data-testid="pf-member-menu"
      aria-label={`Options for ${name}`}
      onClick={onOpen}
    >
      ⋯
    </button>
  );
}

export interface MemberMenuProps {
  target: MemberTarget;
  /** Platform mute / block state of a verified player. */
  muted: boolean;
  blocked: boolean;
  /** This browser already hides the name's signals. */
  localMuted: boolean;
  /** The platform is reachable (the platform actions are offered only then). */
  platformReady: boolean;
  busy: boolean;
  onMute(on: boolean): void;
  onBlock(): void;
  onLocalMute(on: boolean): void;
  onReport(category: ReportCategory, note: string): Promise<boolean>;
  onClose(): void;
}

export function MemberMenu(p: MemberMenuProps) {
  const [reporting, setReporting] = useState(false);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState('');
  const [confirmBlock, setConfirmBlock] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), [reporting]);
  const verified = p.target.verified && p.platformReady;
  const left = REPORT_NOTE_MAX - [...note].length;
  return (
    <div
      className="ro-dialog-scrim"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          p.onClose();
        }
      }}
    >
      <div
        className="ro-dialog pf-member-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pf-member-title"
        data-testid="pf-member-dialog"
        data-verified={p.target.verified}
      >
        <h3 id="pf-member-title">
          {p.target.name} {p.target.verified && <VerifiedBadge />}
        </h3>
        {!reporting ? (
          <>
            {verified ? (
              <div className="pf-menu-actions">
                <button
                  ref={first}
                  type="button"
                  className="mn-btn mn-secondary"
                  data-testid={p.muted ? 'pf-member-unmute' : 'pf-member-mute'}
                  disabled={p.busy}
                  onClick={() => p.onMute(!p.muted)}
                >
                  {p.muted ? 'Unmute' : 'Mute'}
                </button>
                {!p.blocked &&
                  (confirmBlock ? (
                    <button
                      type="button"
                      className="mn-btn mn-secondary danger"
                      data-testid="pf-member-block-confirm"
                      disabled={p.busy}
                      onClick={p.onBlock}
                    >
                      Block: unfriend and hide them everywhere
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="mn-btn mn-secondary danger"
                      data-testid="pf-member-block"
                      disabled={p.busy}
                      onClick={() => setConfirmBlock(true)}
                    >
                      Block
                    </button>
                  ))}
                {p.blocked && (
                  <p className="ro-sub" data-testid="pf-member-blocked">
                    Blocked.
                  </p>
                )}
                <button
                  type="button"
                  className="mn-btn mn-secondary"
                  data-testid="pf-member-report"
                  onClick={() => setReporting(true)}
                >
                  Report
                </button>
                <p className="ro-sub">Muting hides their signals; they are not told.</p>
              </div>
            ) : (
              <div className="pf-menu-actions">
                <button
                  ref={first}
                  type="button"
                  className="mn-btn mn-secondary"
                  data-testid={p.localMuted ? 'pf-member-local-unmute' : 'pf-member-local-mute'}
                  onClick={() => p.onLocalMute(!p.localMuted)}
                >
                  {p.localMuted ? 'Show their signals' : 'Hide their signals'}
                </button>
                <p className="ro-sub" data-testid="pf-member-guest-note">
                  {p.target.verified
                    ? 'The player service is unavailable: this only hides their signals on this device.'
                    : 'A guest player: this only hides their signals on this device, until you close the page.'}
                </p>
              </div>
            )}
            <div className="ro-row">
              <button
                type="button"
                className="mn-btn mn-primary"
                data-testid="pf-member-close"
                onClick={p.onClose}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <form
            className="pf-report"
            data-testid="pf-report-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!category) return;
              void p.onReport(category, note).then((ok) => ok && p.onClose());
            }}
          >
            <fieldset className="pf-report-cats">
              <legend className="ro-label">What happened?</legend>
              {REPORT_CATEGORIES.map((c) => (
                <label key={c} className="pf-radio" data-testid={`pf-report-category-${c}`}>
                  <input
                    type="radio"
                    name="pf-report-category"
                    value={c}
                    checked={category === c}
                    onChange={() => setCategory(c)}
                  />
                  <span>{REPORT_LABELS[c]}</span>
                </label>
              ))}
            </fieldset>
            <label htmlFor="pf-report-note" className="ro-label">
              Note (optional)
            </label>
            <textarea
              id="pf-report-note"
              className="ro-input pf-note"
              data-testid="pf-report-note"
              rows={3}
              maxLength={REPORT_NOTE_MAX}
              value={note}
              onChange={(e) => setNote([...e.target.value].slice(0, REPORT_NOTE_MAX).join(''))}
            />
            <p className="ro-hint" data-testid="pf-report-count">
              {left} characters left
            </p>
            <div className="ro-row">
              <button
                ref={first}
                type="button"
                className="mn-btn mn-secondary"
                data-testid="pf-report-cancel"
                onClick={() => setReporting(false)}
              >
                Back
              </button>
              <button
                type="submit"
                className="mn-btn mn-primary"
                data-testid="pf-report-send"
                disabled={!category || p.busy}
              >
                Send report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
