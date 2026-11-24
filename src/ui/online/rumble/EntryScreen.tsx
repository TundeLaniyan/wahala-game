/**
 * Online City Rumble, step 1: who you are and how to get a room. The name and the room code are the only typed fields; the
 * fighter is the one already chosen in the game (the roster is not duplicated: "Change" opens the Fighter screen). Names
 * and codes are controlled inputs; every string shown is React text. Presentational: the connected screen supplies props.
 */
import { CHARACTERS } from '../../../sim';
import type { CharacterId } from '../../../sim';
import { fighterArt } from '../../menu/art';
import { FighterImage } from '../../menu/FighterImage';
import { Option, PrimaryButton, ScreenFrame, SecondaryButton } from '../../menu/Frame';
import { PLAYER_NAME_MAX, ROOM_CODE_LENGTH } from '../../../net/protocol';
import type { QuickMode } from '../../../net/protocol';
import { QUICK_MODE_OPTIONS, entryModel, quickPlayNote } from './models';
import { TestSessionNote } from './parts';
import './rumble.css';

export interface EntryProps {
  name: string;
  codeInput: string;
  /** The build has an endpoint; without it every button is disabled and the screen says why. */
  configured: boolean;
  fake: boolean;
  fighter: CharacterId;
  /** The QUICK PLAY mode picked (Free-for-All or Team Rumble): public rooms are matched by it. */
  quickMode: QuickMode;
  onQuickMode(mode: QuickMode): void;
  onName(v: string): void;
  onCode(v: string): void;
  onCreate(): void;
  onJoin(): void;
  onQuick(): void;
  onChangeFighter(): void;
  onBack(): void;
}

export function EntryScreen(p: EntryProps) {
  const m = entryModel(p.name, p.codeInput, p.configured);
  const nameWhy = !m.name.ok ? m.name.reason : null;
  const fighterName = CHARACTERS[p.fighter]?.name ?? p.fighter;
  return (
    <ScreenFrame
      id="rumbleOnline"
      kicker="City Rumble"
      title="Play online"
      onBack={p.onBack}
      status={p.fake ? <TestSessionNote /> : undefined}
      className="ro-screen"
    >
      <div className="ro-entry" data-testid="ro-entry">
        {!m.configured && (
          <p className="ro-alert" role="alert" data-testid="ro-not-configured">
            Online is not configured in this build.
          </p>
        )}
        <section className="ro-card ro-who" aria-label="You">
          <div className="ro-field">
            <label htmlFor="ro-name" className="ro-label">
              Your name
            </label>
            <input
              id="ro-name"
              className="ro-input"
              data-testid="ro-name"
              type="text"
              autoComplete="nickname"
              autoCapitalize="words"
              spellCheck={false}
              maxLength={PLAYER_NAME_MAX + 8}
              value={p.name}
              aria-invalid={nameWhy !== null}
              aria-describedby="ro-name-hint"
              onChange={(e) => p.onName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') e.currentTarget.blur();
              }}
            />
            <p
              id="ro-name-hint"
              className={`ro-hint${nameWhy ? ' bad' : ''}`}
              data-testid="ro-name-hint"
              role={nameWhy ? 'alert' : undefined}
            >
              {nameWhy ?? 'Other players see this name.'}
            </p>
          </div>
          <div className="ro-fighter" data-testid="ro-fighter">
            <span className="ro-fighter-pic" aria-hidden>
              <FighterImage
                id={p.fighter}
                art={fighterArt(p.fighter)}
                sizes="(max-width: 700px) 22vw, 96px"
              />
            </span>
            <span className="ro-fighter-text">
              <small className="mn-kicker">Your fighter</small>
              <b data-testid="ro-fighter-name">{fighterName}</b>
            </span>
            <button
              type="button"
              className="ro-link"
              data-testid="ro-change-fighter"
              onClick={p.onChangeFighter}
            >
              Change
            </button>
          </div>
        </section>

        <section className="ro-card ro-go" aria-label="Get a room">
          <PrimaryButton testId="ro-create" disabled={!m.canCreate} autoFocus onClick={p.onCreate}>
            Create room
          </PrimaryButton>
          <p className="ro-sub">Private room with an invite code for your friends.</p>
          <div className="ro-join">
            <div className="ro-join-field">
              <label htmlFor="ro-code" className="ro-label">
                Room code
              </label>
              <input
                id="ro-code"
                className="ro-input ro-code-input"
                data-testid="ro-code"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder={'X'.repeat(ROOM_CODE_LENGTH)}
                value={m.code.text}
                aria-describedby="ro-code-hint"
                onChange={(e) => p.onCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && m.canJoin) p.onJoin();
                  if (e.key === 'Escape') e.currentTarget.blur();
                }}
              />
            </div>
            <SecondaryButton testId="ro-join" disabled={!m.canJoin} onClick={p.onJoin}>
              Join with code
            </SecondaryButton>
          </div>
          <p id="ro-code-hint" className="ro-hint" data-testid="ro-code-hint">
            {m.code.hint ?? ' '}
          </p>
          <div className="mn-opts" role="group" aria-label="Quick play mode" data-testid="ro-quick-modes">
            {QUICK_MODE_OPTIONS.map((o) => (
              <Option
                key={o.id}
                value={o.id}
                current={p.quickMode}
                label={o.name}
                title={o.rule}
                testId={`ro-quick-mode-${o.id}`}
                onPick={p.onQuickMode}
              />
            ))}
          </div>
          <SecondaryButton testId="ro-quick" disabled={!m.canQuick} onClick={p.onQuick}>
            Quick play: {p.quickMode === 'team' ? 'Team Rumble' : 'Free-for-All'}
          </SecondaryButton>
          <p className="ro-sub" data-testid="ro-quick-note">
            {quickPlayNote(p.quickMode)}
          </p>
        </section>
      </div>
    </ScreenFrame>
  );
}
