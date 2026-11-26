/**
 * Online City Rumble, step 2: the room. The invite code (copy code / copy link), who is in it (every member is a person,
 * tagged HUMAN / HOST / READY / YOU; the bots that will fill the other seats are one BOT row and a 32-seat bar), the match
 * settings (the host changes them, everybody else reads them), READY for everyone, START for the host of a private room,
 * and LEAVE ROOM always. Presentational: the connected screen supplies props; the server decides every rule shown here.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { CHARACTERS, DIFFICULTIES } from '../../../sim';
import type { CharacterId, Difficulty } from '../../../sim';
import type { ConnStatus } from '../../../net/client/types';
import type { LobbyMsg, RoomSettings, SettingsMsg } from '../../../net/protocol';
import { DifficultySlider } from '../../menu/DifficultyControl';
import { Option, ScreenFrame, SecondaryButton } from '../../menu/Frame';
import { copyText } from './clipboard';
import { useFlash, useTimeout } from './hooks';
import {
  DURATION_OPTIONS,
  countdownSeconds,
  gameIsTimed,
  lobbyModel,
  modeOptions,
  roomConnectionNote,
  roomRules,
  settingsView,
  stageOptions,
} from './models';
import { Tag, TestSessionNote } from './parts';
import './rumble.css';

export interface RoomProps {
  lobby: LobbyMsg;
  conn: ConnStatus;
  fake: boolean;
  /** Time left of the pre-match countdown / the public auto-start, already ticked down to now (null = none). */
  countdownMs: number | null;
  autoStartMs: number | null;
  /** The invite link for COPY LINK. */
  link: string;
  notice: { id: number; message: string } | null;
  confirmLeave: boolean;
  onReady(on: boolean): void;
  onStart(): void;
  onSettings(patch: SettingsMsg): void;
  onRequestLeave(): void;
  onCancelLeave(): void;
  onLeave(): void;
  onDismissNotice(id: number): void;
  onRetry(): void;
  /** Optional cards after the match settings (a platform build: the party strip and the quick signals). */
  extra?: ReactNode;
  /** Optional controls at the end of a member row, by the member's index in `lobby.members` (badge, member menu). */
  memberExtra?: (index: number) => ReactNode;
  /** Optional dialog layer (a platform build: the member menu). */
  overlay?: ReactNode;
}

const fighterName = (id: string): string => CHARACTERS[id as CharacterId]?.name ?? id;

function Seats({ seats, label }: { seats: ('human' | 'bot' | 'open')[]; label: string }) {
  return (
    <div className="ro-seats" role="img" aria-label={label} data-testid="ro-seats">
      {seats.map((k, i) => (
        <i key={i} className={k} />
      ))}
    </div>
  );
}

function Settings(p: {
  settings: RoomSettings;
  readOnly: boolean;
  editable: boolean;
  reason: string | null;
  onChange(patch: SettingsMsg): void;
}) {
  const s = p.settings;
  const view = settingsView(s);
  if (p.readOnly) {
    return (
      <dl className="ro-settings-read" data-testid="ro-settings-read">
        <div>
          <dt>Stage</dt>
          <dd data-testid="ro-set-stage">{view.stage}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd data-testid="ro-set-mode">{view.mode}</dd>
        </div>
        {view.duration && (
          <div>
            <dt>Length</dt>
            <dd data-testid="ro-set-duration">{view.duration}</dd>
          </div>
        )}
        <div>
          <dt>Bots</dt>
          <dd data-testid="ro-set-difficulty">{view.difficulty}</dd>
        </div>
        {view.friendlyFire && (
          <div>
            <dt>Friendly fire</dt>
            <dd data-testid="ro-set-friendly-fire">{view.friendlyFire}</dd>
          </div>
        )}
        {view.teams && (
          <p className="ro-hint" data-testid="ro-teams-note">
            {view.teams}
          </p>
        )}
        <p className="ro-hint">{p.reason}</p>
      </dl>
    );
  }
  const stages = stageOptions();
  return (
    <fieldset className="ro-settings" disabled={!p.editable} data-testid="ro-settings">
      <legend className="ro-visually-hidden">Match settings (host)</legend>
      <div className="ro-field">
        <label className="ro-label" htmlFor="ro-stage">
          Stage
        </label>
        <select
          id="ro-stage"
          className="ro-select"
          data-testid="ro-stage"
          value={s.arenaId}
          onChange={(e) => p.onChange({ arenaId: e.target.value })}
        >
          {!stages.some((a) => a.id === s.arenaId) && <option value={s.arenaId}>{s.arenaId}</option>}
          {stages.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="ro-field">
        <span className="ro-label" id="ro-mode-label">
          Mode
        </span>
        <div className="mn-opts" role="group" aria-labelledby="ro-mode-label">
          {modeOptions().map((m) => (
            <Option
              key={m.id}
              value={m.id}
              current={s.game}
              label={m.name}
              title={m.rule}
              testId={`ro-mode-${m.id}`}
              onPick={(game) => p.onChange({ game })}
            />
          ))}
        </div>
      </div>
      {gameIsTimed(s.game) && (
        <div className="ro-field">
          <span className="ro-label" id="ro-dur-label">
            Length
          </span>
          <div className="mn-opts" role="group" aria-labelledby="ro-dur-label">
            {DURATION_OPTIONS.map((d) => (
              <Option
                key={d.sec}
                value={d.sec}
                current={s.durationSec}
                label={d.label}
                testId={`ro-duration-${d.sec}`}
                onPick={(durationSec) => p.onChange({ durationSec })}
              />
            ))}
          </div>
        </div>
      )}
      <div className="ro-field">
        <span className="ro-label">Bots</span>
        <DifficultySlider
          value={
            (DIFFICULTIES as readonly string[]).includes(s.botDifficulty)
              ? (s.botDifficulty as Difficulty)
              : 'standard'
          }
          label="Bot difficulty"
          testId="ro-difficulty"
          compact
          onChange={(botDifficulty) => p.onChange({ botDifficulty })}
        />
      </div>
      {s.game === 'team' && (
        <div className="ro-field">
          <span className="ro-label" id="ro-ff-label">
            Friendly fire
          </span>
          <div className="mn-opts" role="group" aria-labelledby="ro-ff-label">
            <Option
              value={false}
              current={s.friendlyFire === true}
              label="Off"
              title="A teammate's blast does not hurt you (the default)."
              testId="ro-ff-off"
              onPick={() => p.onChange({ friendlyFire: false })}
            />
            <Option
              value={true}
              current={s.friendlyFire === true}
              label="On"
              title="A teammate's blast can eliminate you."
              testId="ro-ff-on"
              onPick={() => p.onChange({ friendlyFire: true })}
            />
          </div>
        </div>
      )}
      {view.teams && (
        <p className="ro-hint" data-testid="ro-teams-note">
          {view.teams}
        </p>
      )}
      {!p.editable && p.reason && <p className="ro-hint">{p.reason}</p>}
    </fieldset>
  );
}

export function RoomScreen(p: RoomProps) {
  const m = lobbyModel(p.lobby);
  const rules = roomRules(p.lobby, p.conn);
  const offline = roomConnectionNote(p.conn);
  const [copied, flash] = useFlash();
  useTimeout(p.notice?.id ?? null, 7000, () => p.notice && p.onDismissNotice(p.notice.id));
  const stay = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (p.confirmLeave) stay.current?.focus();
  }, [p.confirmLeave]);

  const copy = (what: 'code' | 'link') => {
    void copyText(what === 'code' ? p.lobby.code : p.link).then((ok) => flash(ok ? what : `${what}-failed`));
  };
  const countdown =
    p.lobby.phase === 'countdown' && p.countdownMs !== null ? countdownSeconds(p.countdownMs) : null;
  const auto =
    p.lobby.phase === 'lobby' && !m.isPrivate && p.autoStartMs !== null
      ? countdownSeconds(p.autoStartMs)
      : null;

  let statusText: string;
  if (p.lobby.waitingForSlot)
    statusText = 'The servers are busy: your match starts as soon as a slot is free.';
  else if (countdown !== null) statusText = `Match starts in ${countdown}`;
  else if (auto !== null) statusText = `Starts by itself in ${auto} s`;
  else if (rules.showStart && rules.startReason && rules.inLobby) statusText = rules.startReason;
  else statusText = `${m.readyLine}`;

  const hostCanStart = rules.showStart;
  const readyPrimary = !hostCanStart || !rules.isHost;

  return (
    <ScreenFrame
      id="rumbleOnline"
      kicker={m.isPrivate ? 'Private room' : 'Public room'}
      title="Room"
      onBack={p.onRequestLeave}
      backLabel="Leave"
      className="ro-screen ro-room-screen"
      status={
        <span className="ro-foot-status" data-testid="ro-status">
          {p.fake && <TestSessionNote />} {statusText}
        </span>
      }
      actions={
        <>
          <button
            type="button"
            className={`mn-btn ${readyPrimary ? 'mn-primary' : 'mn-secondary'}`}
            data-testid="ro-ready"
            disabled={!rules.canReady}
            aria-pressed={rules.youReady}
            onClick={() => p.onReady(!rules.youReady)}
          >
            {rules.youReady ? 'Not ready' : 'Ready'}
          </button>
          {hostCanStart && (
            <button
              type="button"
              className={`mn-btn ${readyPrimary ? 'mn-secondary' : 'mn-primary'}`}
              data-testid="ro-start"
              disabled={!rules.canStart}
              aria-describedby={rules.startReason ? 'ro-start-why' : undefined}
              title={rules.startReason ?? undefined}
              onClick={p.onStart}
            >
              Start
              <span className="mn-arrow" aria-hidden>
                →
              </span>
            </button>
          )}
          <SecondaryButton testId="ro-leave" tone="danger" onClick={p.onRequestLeave}>
            Leave room
          </SecondaryButton>
        </>
      }
    >
      <div className="ro-room" data-testid="ro-room" data-phase={p.lobby.phase}>
        {offline && (
          <div className="ro-alert wide" role="alert" data-testid="ro-conn-note">
            <span>{offline.text}</span>
            {offline.canRetry && (
              <button type="button" className="ro-link" data-testid="ro-conn-retry" onClick={p.onRetry}>
                Try again
              </button>
            )}
          </div>
        )}
        {p.notice && (
          <div className="ro-notice wide" role="status" data-testid="ro-notice">
            <span>{p.notice.message}</span>
            <button
              type="button"
              className="ro-x"
              aria-label="Dismiss"
              data-testid="ro-notice-dismiss"
              onClick={() => p.onDismissNotice(p.notice!.id)}
            >
              ×
            </button>
          </div>
        )}

        <section className="ro-card ro-who-here" aria-label="Who is in the room">
          <div className="ro-code-row">
            <div className="ro-code-block">
              <small className="mn-kicker">{m.isPrivate ? 'Invite code' : 'Room code'}</small>
              <b className="ro-code" data-testid="ro-room-code" aria-label={m.code.split('').join(' ')}>
                {m.code}
              </b>
            </div>
            <div className="ro-copy">
              <button
                type="button"
                className="mn-btn mn-secondary small"
                data-testid="ro-copy-code"
                onClick={() => copy('code')}
              >
                {copied === 'code' ? 'Copied' : 'Copy code'}
              </button>
              <button
                type="button"
                className="mn-btn mn-secondary small"
                data-testid="ro-copy-link"
                onClick={() => copy('link')}
              >
                {copied === 'link' ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>
          <span className="ro-visually-hidden" role="status" aria-live="polite" data-testid="ro-copy-live">
            {copied === 'code'
              ? 'Code copied.'
              : copied === 'link'
                ? 'Link copied.'
                : copied
                  ? 'Could not copy.'
                  : ''}
          </span>

          <Seats seats={m.seats} label={m.seatsLine} />
          <p className="ro-seats-line" data-testid="ro-seats-line">
            {m.seatsLine}
          </p>

          {m.bots > 0 && (
            <p className="ro-bots" data-testid="ro-bots-row">
              <Tag kind="bot">BOT</Tag>
              <b data-testid="ro-bots-line">{m.botsLine}</b>
            </p>
          )}

          <ul className="ro-members" data-testid="ro-members" aria-label="Players in the room">
            {m.rows.map((r, i) => (
              <li
                key={r.key}
                className="ro-member"
                data-testid="ro-member"
                data-you={r.you}
                data-ready={r.ready}
                data-connected={r.connected}
              >
                <span className="ro-member-name">
                  <b>{r.name}</b>
                  <small>{fighterName(r.characterId)}</small>
                </span>
                {r.stateNote && (
                  <span className="ro-state" data-testid="ro-member-state">
                    {r.stateNote}
                  </span>
                )}
                <span className="ro-tags">
                  {r.tags.map((t) => (
                    <Tag key={t} kind={t}>
                      {t}
                    </Tag>
                  ))}
                </span>
                {p.memberExtra?.(i)}
              </li>
            ))}
          </ul>
        </section>

        <section className="ro-card ro-match" aria-label="Match settings">
          <small className="mn-kicker">Match settings</small>
          <Settings
            settings={p.lobby.settings}
            readOnly={rules.settingsReadOnly}
            editable={rules.canChangeSettings}
            reason={rules.settingsReason}
            onChange={p.onSettings}
          />
          {countdown !== null && !p.lobby.waitingForSlot && (
            <p className="ro-countdown" data-testid="ro-countdown" aria-hidden>
              {countdown}
            </p>
          )}
        </section>
        {p.extra}
      </div>

      <span className="ro-visually-hidden" role="status" aria-live="polite" data-testid="ro-live">
        {m.phaseLabel}
      </span>
      {rules.startReason && (
        <span id="ro-start-why" className="ro-visually-hidden">
          {rules.startReason}
        </span>
      )}

      {p.confirmLeave && (
        <div
          className="ro-dialog-scrim"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              p.onCancelLeave();
            }
          }}
        >
          <div
            className="ro-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ro-leave-title"
            data-testid="ro-leave-dialog"
          >
            <h3 id="ro-leave-title">Leave this room?</h3>
            <p>
              {rules.isHost
                ? 'You are the host: the room moves to someone else or closes.'
                : 'You can join again with the code.'}
            </p>
            <div className="ro-row">
              <button
                ref={stay}
                type="button"
                className="mn-btn mn-primary"
                data-testid="ro-leave-stay"
                data-autofocus=""
                onClick={p.onCancelLeave}
              >
                Stay
              </button>
              <button
                type="button"
                className="mn-btn mn-secondary danger"
                data-testid="ro-leave-confirm"
                onClick={p.onLeave}
              >
                Leave room
              </button>
            </div>
          </div>
        </div>
      )}
      {p.overlay}
    </ScreenFrame>
  );
}
