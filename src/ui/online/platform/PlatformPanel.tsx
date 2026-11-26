/**
 * The player-platform panel on the Online City Rumble entry screen (docs/PLATFORM_CLIENT.md): who you are (nickname, the
 * "Guest" label, friend code, fighter), your friends (add by code, requests, remove, blocked players) and your party (create,
 * join by code, invitations, members, leader controls, the private match). Presentational: the state and the actions come in
 * as props. Every name is React text. When the platform does not answer the panel says so and online play stays guest-only.
 */
import { useState } from 'react';
import type { PlatformController, PlatformState } from '../../../online/platform/controller';
import { FRIEND_CODE_LENGTH, cleanCode } from '../../../online/platform/controller';
import type { PartyMode } from '../../../online/platform/types';
import { Option } from '../../menu/Frame';
import { copyText } from '../rumble/clipboard';
import { useFlash } from '../rumble/hooks';
import {
  PARTY_MODE_OPTIONS,
  PRESENCE_LABEL,
  groupedCode,
  invitableFriends,
  kindLabel,
  partyLine,
} from './models';
import './platform.css';

export type PlatformActions = PlatformController['actions'];

export interface PlatformPanelProps {
  state: PlatformState;
  act: PlatformActions;
  /** The fighter chosen in the game (its display name). */
  fighterName: string;
  /** The room this client is in (null at the entry). */
  inRoom: string | null;
}

function Message({ state, act }: { state: PlatformState; act: PlatformActions }) {
  const m = state.message;
  if (!m) return null;
  return (
    <div className={`pf-message ${m.tone}`} role="status" data-testid="pf-message">
      <span>{m.text}</span>
      <button
        type="button"
        className="ro-x"
        aria-label="Dismiss"
        data-testid="pf-message-dismiss"
        onClick={() => act.dismissMessage(m.id)}
      >
        ×
      </button>
    </div>
  );
}

function Identity({ state, act, fighterName }: PlatformPanelProps) {
  const me = state.me!;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(me.displayName);
  const [copied, flash] = useFlash();
  const kind = kindLabel(me.kind);
  const save = () => {
    void act.setNickname(draft).then((ok) => ok && setEditing(false));
  };
  return (
    <div className="pf-identity" data-testid="pf-identity">
      <div className="pf-id-row">
        <span className="pf-id-name">
          <small className="mn-kicker">Your name</small>
          <b data-testid="pf-nickname">{me.displayName}</b>
        </span>
        {kind && (
          <span
            className="ro-tag pf-guest"
            data-testid="pf-guest-label"
            title="A guest account lives on this device only."
          >
            {kind}
          </span>
        )}
        {!editing && (
          <button
            type="button"
            className="ro-link"
            data-testid="pf-name-edit"
            onClick={() => {
              setDraft(me.displayName);
              setEditing(true);
            }}
          >
            Change
          </button>
        )}
      </div>
      {editing && (
        <div className="pf-name-form">
          <label htmlFor="pf-name" className="ro-visually-hidden">
            New name
          </label>
          <input
            id="pf-name"
            className="ro-input"
            data-testid="pf-name-input"
            type="text"
            autoComplete="nickname"
            spellCheck={false}
            maxLength={32}
            value={draft}
            aria-invalid={state.nameError !== null}
            aria-describedby="pf-name-error"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <button
            type="button"
            className="mn-btn mn-secondary small"
            data-testid="pf-name-save"
            disabled={state.busy === 'name'}
            onClick={save}
          >
            Save
          </button>
          <button
            type="button"
            className="ro-link"
            data-testid="pf-name-cancel"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      )}
      {editing && (
        <p
          id="pf-name-error"
          className={`ro-hint${state.nameError ? ' bad' : ''}`}
          data-testid="pf-name-error"
        >
          {state.nameError ?? 'Your first change is free, then once a day.'}
        </p>
      )}
      <div className="pf-id-row">
        <span className="pf-id-name">
          <small className="mn-kicker">Friend code</small>
          <b className="pf-code" data-testid="pf-friend-code" aria-label={me.friendCode.split('').join(' ')}>
            {groupedCode(me.friendCode)}
          </b>
        </span>
        <button
          type="button"
          className="mn-btn mn-secondary small"
          data-testid="pf-copy-friend-code"
          onClick={() => void copyText(me.friendCode).then((ok) => flash(ok ? 'code' : 'failed'))}
        >
          {copied === 'code' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy'}
        </button>
      </div>
      <p className="ro-sub" data-testid="pf-fighter">
        Fighter: <b>{fighterName}</b>
      </p>
      {me.kind === 'guest' && (
        <p className="ro-sub">A guest lives on this device only: clearing the browser data loses it.</p>
      )}
    </div>
  );
}

function Friends({ state, act }: PlatformPanelProps) {
  const [code, setCode] = useState('');
  const view = cleanCode(code);
  const add = () => {
    void act.addFriend(view.text).then((ok) => ok && setCode(''));
  };
  return (
    <div className="pf-section" data-testid="pf-friends-tab">
      <div className="pf-inline">
        <label htmlFor="pf-friend-code-input" className="ro-label">
          Add a friend by code
        </label>
        <div className="pf-inline-row">
          <input
            id="pf-friend-code-input"
            className="ro-input pf-code-input"
            data-testid="pf-friend-code-input"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={'X'.repeat(FRIEND_CODE_LENGTH)}
            value={view.text}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && view.code) add();
            }}
          />
          <button
            type="button"
            className="mn-btn mn-secondary"
            data-testid="pf-add-friend"
            disabled={!view.code || state.busy === 'add-friend'}
            onClick={add}
          >
            Add
          </button>
        </div>
      </div>

      {state.incoming.length > 0 && (
        <ul className="pf-list" data-testid="pf-requests-in" aria-label="Friend requests for you">
          {state.incoming.map((r) => (
            <li key={r.id} className="pf-row" data-testid="pf-request-in">
              <span className="pf-row-name">
                <b>{r.displayName}</b>
                <small>wants to be friends</small>
              </span>
              <span className="pf-row-actions">
                <button
                  type="button"
                  className="mn-btn mn-secondary small"
                  data-testid="pf-request-accept"
                  disabled={state.busy === `req-${r.id}`}
                  onClick={() => void act.acceptRequest(r.id)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="mn-btn mn-secondary small"
                  data-testid="pf-request-decline"
                  disabled={state.busy === `req-${r.id}`}
                  onClick={() => void act.declineRequest(r.id)}
                >
                  Decline
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <ul className="pf-list" data-testid="pf-friends" aria-label="Friends">
        {state.friends.length === 0 && <li className="ro-sub">No friends yet. Share your friend code.</li>}
        {state.friends.map((f) => (
          <li key={f.playerId} className="pf-row" data-testid="pf-friend">
            <span className="pf-row-name">
              <b>{f.displayName}</b>
              <small data-testid="pf-friend-presence">{PRESENCE_LABEL[f.presence] ?? f.presence}</small>
            </span>
            <span className="pf-row-actions">
              {state.party?.you.canInvite && !state.party.members.some((m) => m.playerId === f.playerId) && (
                <button
                  type="button"
                  className="mn-btn mn-secondary small"
                  data-testid="pf-friend-invite"
                  disabled={state.busy === `invite-${f.playerId}`}
                  onClick={() => void act.invite(f.playerId)}
                >
                  Invite
                </button>
              )}
              <button
                type="button"
                className="mn-btn mn-secondary small danger"
                data-testid="pf-friend-remove"
                disabled={state.busy === `friend-${f.playerId}`}
                onClick={() => void act.removeFriend(f.playerId)}
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>

      {state.outgoing.length > 0 && (
        <ul className="pf-list" data-testid="pf-requests-out" aria-label="Requests you sent">
          {state.outgoing.map((r) => (
            <li key={r.id} className="pf-row" data-testid="pf-request-out">
              <span className="pf-row-name">
                <b>{r.displayName}</b>
                <small>request sent</small>
              </span>
              <button
                type="button"
                className="mn-btn mn-secondary small"
                data-testid="pf-request-cancel"
                disabled={state.busy === `req-${r.id}`}
                onClick={() => void act.cancelRequest(r.id)}
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.blocks.length > 0 && (
        <details className="pf-blocks" data-testid="pf-blocks">
          <summary>Blocked players ({state.blocks.length})</summary>
          <ul className="pf-list">
            {state.blocks.map((b) => (
              <li key={b.playerId} className="pf-row" data-testid="pf-blocked">
                <span className="pf-row-name">
                  <b>{b.displayName}</b>
                </span>
                <button
                  type="button"
                  className="mn-btn mn-secondary small"
                  data-testid="pf-unblock"
                  disabled={state.busy === `block-${b.playerId}`}
                  onClick={() => void act.unblock(b.playerId)}
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function NoParty({ state, act }: PlatformPanelProps) {
  const [mode, setMode] = useState<PartyMode>('ffa');
  const [code, setCode] = useState('');
  const view = cleanCode(code);
  const busy = state.busy === 'party';
  return (
    <div className="pf-section" data-testid="pf-no-party">
      <p className="ro-sub">
        Play one private room together: create a party, then invite friends or share its code.
      </p>
      <div className="mn-opts" role="group" aria-label="Party mode">
        {PARTY_MODE_OPTIONS.map((o) => (
          <Option
            key={o.id}
            value={o.id}
            current={mode}
            label={o.name}
            testId={`pf-party-new-mode-${o.id}`}
            onPick={(v) => setMode(v as PartyMode)}
          />
        ))}
      </div>
      <button
        type="button"
        className="mn-btn mn-primary"
        data-testid="pf-party-create"
        disabled={busy}
        onClick={() => void act.createParty(mode)}
      >
        Create party
      </button>
      <div className="pf-inline">
        <label htmlFor="pf-party-code-input" className="ro-label">
          Join a party by code
        </label>
        <div className="pf-inline-row">
          <input
            id="pf-party-code-input"
            className="ro-input pf-code-input"
            data-testid="pf-party-code-input"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={'X'.repeat(FRIEND_CODE_LENGTH)}
            value={view.text}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && view.code) void act.joinParty(view.text);
            }}
          />
          <button
            type="button"
            className="mn-btn mn-secondary"
            data-testid="pf-party-join"
            disabled={!view.code || busy}
            onClick={() => void act.joinParty(view.text)}
          >
            Join
          </button>
        </div>
      </div>
      <Invites state={state} act={act} />
    </div>
  );
}

function Invites({ state, act }: Pick<PlatformPanelProps, 'state' | 'act'>) {
  if (state.invites.length === 0) return null;
  return (
    <ul className="pf-list" data-testid="pf-invites" aria-label="Party invitations">
      {state.invites.map((i) => (
        <li key={i.id} className="pf-row" data-testid="pf-invite">
          <span className="pf-row-name">
            <b>{i.fromName}</b>
            <small>
              invites you to a party ({i.members}/{i.maxSize})
            </small>
          </span>
          <span className="pf-row-actions">
            <button
              type="button"
              className="mn-btn mn-secondary small"
              data-testid="pf-invite-accept"
              disabled={state.busy === `inv-${i.id}` || state.party !== null}
              title={state.party ? 'Leave your party first.' : undefined}
              onClick={() => void act.acceptInvite(i.id)}
            >
              Join
            </button>
            <button
              type="button"
              className="mn-btn mn-secondary small"
              data-testid="pf-invite-decline"
              disabled={state.busy === `inv-${i.id}`}
              onClick={() => void act.declineInvite(i.id)}
            >
              Decline
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The party itself: code, mode, members, ready, leader controls and the private match. Also used in the room. */
export function PartyBlock({ state, act, inRoom }: Pick<PlatformPanelProps, 'state' | 'act' | 'inRoom'>) {
  const p = state.party!;
  const [copied, flash] = useFlash();
  const line = partyLine(p, inRoom, state.handoff);
  const meId = state.me?.id ?? null;
  const youReady = p.members.some((m) => m.playerId === meId && m.ready);
  const inviteable = invitableFriends(state.friends, p);
  const handoffBusy = state.handoff !== 'idle' || state.busy === 'handoff';
  return (
    <div className="pf-section" data-testid="pf-party" data-status={p.status}>
      <div className="pf-id-row">
        <span className="pf-id-name">
          <small className="mn-kicker">Party code</small>
          <b className="pf-code" data-testid="pf-party-code" aria-label={p.code.split('').join(' ')}>
            {groupedCode(p.code)}
          </b>
        </span>
        <button
          type="button"
          className="mn-btn mn-secondary small"
          data-testid="pf-party-copy-code"
          onClick={() => void copyText(p.code).then((ok) => flash(ok ? 'code' : 'failed'))}
        >
          {copied === 'code' ? 'Copied' : 'Copy'}
        </button>
      </div>
      {p.you.isLeader && p.status === 'open' ? (
        <div className="mn-opts" role="group" aria-label="Party mode">
          {PARTY_MODE_OPTIONS.map((o) => (
            <Option
              key={o.id}
              value={o.id}
              current={p.mode}
              label={o.name}
              testId={`pf-party-mode-${o.id}`}
              onPick={(v) => void act.setMode(v as PartyMode)}
            />
          ))}
        </div>
      ) : (
        <p className="ro-sub" data-testid="pf-party-mode">
          Mode: {p.mode === 'team' ? 'Team Rumble' : 'Free-for-All'}
        </p>
      )}
      <ul className="pf-list" data-testid="pf-party-members" aria-label="Party members">
        {p.members.map((m) => (
          <li
            key={m.playerId}
            className="pf-row"
            data-testid="pf-party-member"
            data-ready={m.ready}
            data-you={m.playerId === meId}
          >
            <span className="pf-row-name">
              <b>{m.displayName}</b>
              <small>{PRESENCE_LABEL[m.presence] ?? m.presence}</small>
            </span>
            <span className="ro-tags">
              {m.isLeader && <span className="ro-tag host">LEADER</span>}
              {m.ready && <span className="ro-tag ready">READY</span>}
              {m.playerId === meId && <span className="ro-tag you">YOU</span>}
            </span>
            {p.you.isLeader && m.playerId !== meId && (
              <span className="pf-row-actions">
                <button
                  type="button"
                  className="mn-btn mn-secondary small"
                  data-testid="pf-member-promote"
                  disabled={state.busy === `member-${m.playerId}`}
                  onClick={() => void act.promote(m.playerId)}
                >
                  Make leader
                </button>
                <button
                  type="button"
                  className="mn-btn mn-secondary small danger"
                  data-testid="pf-member-kick"
                  disabled={state.busy === `member-${m.playerId}`}
                  onClick={() => void act.kick(m.playerId)}
                >
                  Remove
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="ro-sub" data-testid="pf-party-status" role="status">
        {line.text}
      </p>
      <div className="pf-actions">
        {p.status === 'open' && inRoom === null && (
          <button
            type="button"
            className="mn-btn mn-secondary"
            data-testid="pf-party-ready"
            aria-pressed={youReady}
            disabled={state.busy === 'party-ready'}
            onClick={() => void act.setReady(!youReady)}
          >
            {youReady ? 'Not ready' : 'Ready'}
          </button>
        )}
        {line.canStart && (
          <button
            type="button"
            className="mn-btn mn-primary"
            data-testid="pf-party-start"
            disabled={handoffBusy}
            onClick={() => void act.startMatch()}
          >
            Start private match
          </button>
        )}
        {line.canJoin && (
          <button
            type="button"
            className="mn-btn mn-primary"
            data-testid="pf-party-join-match"
            disabled={handoffBusy}
            onClick={() => void act.joinMatch()}
          >
            Join match
          </button>
        )}
        {line.canEnd && (
          <button
            type="button"
            className="mn-btn mn-secondary"
            data-testid="pf-party-end-match"
            disabled={handoffBusy}
            onClick={() => void act.endMatch()}
          >
            Back to party lobby
          </button>
        )}
        <button
          type="button"
          className="mn-btn mn-secondary danger"
          data-testid="pf-party-leave"
          disabled={state.busy === 'party'}
          onClick={() => void act.leaveParty()}
        >
          Leave party
        </button>
      </div>
      {p.you.canInvite && inviteable.length > 0 && inRoom === null && (
        <ul className="pf-list" data-testid="pf-party-invite-list" aria-label="Invite a friend">
          {inviteable.map((f) => (
            <li key={f.playerId} className="pf-row">
              <span className="pf-row-name">
                <b>{f.displayName}</b>
                <small>{PRESENCE_LABEL[f.presence] ?? f.presence}</small>
              </span>
              <button
                type="button"
                className="mn-btn mn-secondary small"
                data-testid="pf-party-invite"
                disabled={state.busy === `invite-${f.playerId}`}
                onClick={() => void act.invite(f.playerId)}
              >
                Invite
              </button>
            </li>
          ))}
        </ul>
      )}
      {inRoom === null && <Invites state={state} act={act} />}
    </div>
  );
}

export function PlatformPanel(p: PlatformPanelProps) {
  const s = p.state;
  if (s.phase === 'idle' || s.phase === 'connecting')
    return (
      <section
        className="ro-card pf-panel wide"
        aria-label="Friends and party"
        data-testid="pf-panel"
        data-phase={s.phase}
      >
        <p className="ro-sub" data-testid="pf-connecting" role="status">
          Signing in to the player service...
        </p>
      </section>
    );
  if (s.phase === 'unavailable' || !s.me)
    return (
      <section
        className="ro-card pf-panel wide"
        aria-label="Friends and party"
        data-testid="pf-panel"
        data-phase={s.phase}
      >
        <p className="ro-sub" data-testid="pf-unavailable" role="status">
          Friends and parties are unavailable right now. You can still play online as a guest.
        </p>
        <Message state={s} act={p.act} />
        <button
          type="button"
          className="mn-btn mn-secondary"
          data-testid="pf-retry"
          onClick={() => void p.act.retry()}
        >
          Retry
        </button>
      </section>
    );
  const invitesBadge = s.invites.length + s.incoming.length;
  return (
    <section
      className="ro-card pf-panel wide"
      aria-label="Friends and party"
      data-testid="pf-panel"
      data-phase={s.phase}
    >
      {s.stale && (
        <p className="ro-hint bad" data-testid="pf-stale" role="status">
          The player service is not answering. Retrying...
        </p>
      )}
      <Message state={s} act={p.act} />
      <div className="mn-opts pf-tabs" role="tablist" aria-label="Friends and party">
        <Option
          value="you"
          current={s.tab}
          label="You"
          testId="pf-tab-you"
          onPick={() => p.act.setTab('you')}
        />
        <Option
          value="friends"
          current={s.tab}
          label={s.incoming.length > 0 ? `Friends (${s.incoming.length})` : 'Friends'}
          testId="pf-tab-friends"
          onPick={() => p.act.setTab('friends')}
        />
        <Option
          value="party"
          current={s.tab}
          label={
            !s.party && invitesBadge > 0 && s.invites.length > 0 ? `Party (${s.invites.length})` : 'Party'
          }
          testId="pf-tab-party"
          onPick={() => p.act.setTab('party')}
        />
      </div>
      {s.tab === 'you' && <Identity {...p} />}
      {s.tab === 'friends' && <Friends {...p} />}
      {s.tab === 'party' &&
        (s.party ? <PartyBlock state={s} act={p.act} inRoom={p.inRoom} /> : <NoParty {...p} />)}
    </section>
  );
}
