/**
 * Online PREVIEW screen (flag-gated: `flags().online`). One menu screen whose steps (sign in, hub, queue, party,
 * lobby, match, results) are driven by app/online.ts over the mock service interfaces. A banner says plainly that
 * it is a preview against a mock server with no real players.
 */
import { useEffect } from 'react';
import { commands } from '../../app/session';
import { onlineApi, useOnlineStore } from '../../app/online';
import type { MatchView, OnlineUi } from '../../app/online';
import { Option, PrimaryButton, ScreenFrame, SecondaryButton } from '../menu/Frame';
import { VoiceStatus } from './VoiceStatus';
import {
  ONLINE_GAME_LABEL,
  ONLINE_GAME_ORDER,
  PREVIEW_BANNER,
  ROOM_STATE_LABEL,
  lobbyActions,
  memberRows,
  partyActions,
  queueText,
  rankChangeText,
  xpRows,
} from './model';
import './online.css';

const STEP_TITLE: Record<OnlineUi['step'], string> = {
  signIn: 'Sign in',
  hub: 'Online',
  queue: 'Quick Match',
  party: 'Party',
  lobby: 'Lobby',
  match: 'Match',
  results: 'Results',
};

function GamePicker({ onPick }: { onPick: (g: (typeof ONLINE_GAME_ORDER)[number]) => void }) {
  const game = useOnlineStore((s) => s.game);
  return (
    <div className="mn-opts ol-games" role="group" aria-label="Game">
      {ONLINE_GAME_ORDER.map((g) => (
        <Option
          key={g}
          value={g}
          current={game}
          label={ONLINE_GAME_LABEL[g]}
          onPick={onPick}
          testId={`online-game-${g}`}
        />
      ))}
    </div>
  );
}

function SignIn() {
  const busy = useOnlineStore((s) => s.busy);
  return (
    <div className="ol-card ol-center">
      <h3>Play with a guest account</h3>
      <p>
        A throwaway account kept on this device only. There is no password, no email and no real server: every
        &ldquo;player&rdquo; you meet here is a scripted bot.
      </p>
      <PrimaryButton testId="online-guest" disabled={busy} autoFocus onClick={() => void onlineApi.signIn()}>
        Continue as guest
      </PrimaryButton>
    </div>
  );
}

function Hub() {
  const s = useOnlineStore();
  const p = s.progress;
  return (
    <div className="ol-grid">
      <section className="ol-card" data-testid="online-profile">
        <small className="mn-kicker">{s.profile?.guest ? 'Guest account' : 'Account'}</small>
        <h3>{s.profile?.displayName}</h3>
        {p && (
          <p className="ol-facts">
            <span data-testid="online-level">Level {p.profile.level}</span>
            <span data-testid="online-rank">{p.rank.label}</span>
            <span>
              {p.profile.totals.wins}W · {p.profile.totals.losses}L · {p.profile.totals.draws}D
            </span>
          </p>
        )}
        <small className="mn-kicker">Friends (scripted)</small>
        <ul className="ol-list">
          {s.friends.map((f) => (
            <li key={f.accountId}>
              <i className={`ol-dot ${f.presence}`} aria-hidden /> {f.displayName} <em>{f.presence}</em>
            </li>
          ))}
        </ul>
      </section>
      <section className="ol-card">
        <small className="mn-kicker">Game</small>
        <GamePicker onPick={onlineApi.setGame} />
        <div className="ol-actions">
          <PrimaryButton
            testId="online-quick"
            disabled={s.busy}
            autoFocus
            onClick={() => void onlineApi.quickMatch()}
          >
            Quick Match
          </PrimaryButton>
          <SecondaryButton
            testId="online-party"
            disabled={s.busy}
            onClick={() => void onlineApi.createParty()}
          >
            Create Party
          </SecondaryButton>
        </div>
        <VoiceStatus />
      </section>
    </div>
  );
}

function Queue() {
  const q = useOnlineStore((s) => s.queue);
  return (
    <div className="ol-card ol-center" data-testid="online-queue">
      <h3>{q ? queueText(q) : 'Searching…'}</h3>
      <div className="ol-spinner" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <p data-testid="online-queue-count">
        {q ? `${q.found} / ${q.needed}` : ''} {q ? `· ${ONLINE_GAME_LABEL[q.game]}` : ''}
      </p>
      <SecondaryButton testId="online-cancel-queue" onClick={() => void onlineApi.cancelQueue()}>
        Cancel
      </SecondaryButton>
    </div>
  );
}

function PartyStep() {
  const s = useOnlineStore();
  const party = s.party;
  if (!party) return null;
  const perms = partyActions(party, s.profile?.id ?? null);
  const invited = new Set(party.members.map((m) => m.accountId));
  const me = party.members.find((m) => m.accountId === s.profile?.id);
  return (
    <div className="ol-grid">
      <section className="ol-card" data-testid="online-party-card">
        <small className="mn-kicker">Party code</small>
        <h3 className="ol-code" data-testid="online-party-code">
          {party.code}
        </h3>
        <ul className="ol-list" data-testid="online-party-members">
          {party.members.map((m) => (
            <li key={m.accountId} data-ready={m.ready}>
              {m.displayName}
              {m.accountId === party.leaderId && <em> leader</em>}
              {m.mock && <em> mock</em>}
              <span className={`ol-ready${m.ready ? ' on' : ''}`}>{m.ready ? 'Ready' : 'Not ready'}</span>
            </li>
          ))}
        </ul>
        <div className="ol-actions">
          <SecondaryButton testId="online-party-ready" onClick={() => void onlineApi.toggleReadyParty()}>
            {me?.ready ? 'Not ready' : 'Ready'}
          </SecondaryButton>
        </div>
      </section>
      <section className="ol-card">
        <small className="mn-kicker">Invite a friend</small>
        <ul className="ol-list">
          {s.friends.map((f) => (
            <li key={f.accountId}>
              <i className={`ol-dot ${f.presence}`} aria-hidden /> {f.displayName}
              <button
                type="button"
                className="ol-chip"
                data-testid={`online-invite-${f.accountId}`}
                disabled={!perms.canInvite || f.presence !== 'online' || invited.has(f.accountId)}
                onClick={() => void onlineApi.invite(f.accountId)}
              >
                {invited.has(f.accountId) ? 'In party' : 'Invite'}
              </button>
            </li>
          ))}
        </ul>
        <small className="mn-kicker">Game</small>
        <GamePicker onPick={onlineApi.setGame} />
        <div className="ol-actions">
          <PrimaryButton
            testId="online-open-lobby"
            disabled={!perms.canStart || s.busy}
            onClick={() => void onlineApi.openLobby()}
          >
            Open lobby
          </PrimaryButton>
        </div>
      </section>
    </div>
  );
}

function Lobby() {
  const s = useOnlineStore();
  const room = s.room;
  if (!room) return null;
  const rows = memberRows(room, s.profile?.id ?? null);
  const a = lobbyActions(room, s.profile?.id ?? null);
  return (
    <div className="ol-grid">
      <section className="ol-card" data-testid="online-lobby">
        <small className="mn-kicker">{ONLINE_GAME_LABEL[room.game]}</small>
        <h3 data-testid="online-room-state" data-state={room.state}>
          {ROOM_STATE_LABEL[room.state]}
        </h3>
        {s.countdown !== null && room.state === 'starting' && (
          <p className="ol-count" data-testid="online-countdown" role="status">
            {s.countdown}
          </p>
        )}
        <ul className="ol-list" data-testid="online-lobby-members">
          {rows.map((r) => (
            <li key={r.accountId} data-you={r.you} data-ready={r.ready} data-team={r.team}>
              {r.name}
              {r.you && <em> you</em>}
              {r.host && <em> host</em>}
              {r.ai && <em> mock</em>}
              {r.team && <span className={`ol-team ${r.team.toLowerCase()}`}>{r.team}</span>}
              <span className={`ol-ready${r.ready ? ' on' : ''}`}>{r.ready ? 'Ready' : 'Waiting'}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="ol-card">
        <small className="mn-kicker">Your seat</small>
        <div className="ol-actions">
          {a.canStartReadyCheck && (
            <PrimaryButton
              testId="online-readycheck"
              disabled={s.busy}
              onClick={() => void onlineApi.startReadyCheck()}
            >
              Start ready check
            </PrimaryButton>
          )}
          <PrimaryButton
            testId="online-ready"
            disabled={!a.canReady || s.busy}
            autoFocus
            onClick={() => void onlineApi.toggleReady()}
          >
            {a.ready ? 'Not ready' : 'Ready'}
          </PrimaryButton>
          {a.showTeams && (
            <SecondaryButton
              testId="online-switch-team"
              disabled={!a.canSwitchTeam}
              onClick={() => void onlineApi.switchTeam()}
            >
              Switch team
            </SecondaryButton>
          )}
          {a.showTeams && a.isHost && (
            <SecondaryButton
              testId="online-balance"
              disabled={room.state !== 'open'}
              onClick={() => void onlineApi.balanceTeams()}
            >
              Balance teams
            </SecondaryButton>
          )}
        </div>
        {a.showTeams && <p className="ol-note">The server assigns teams: you can only ask to switch.</p>}
        <VoiceStatus />
      </section>
    </div>
  );
}

function LivePanel({ m }: { m: MatchView }) {
  const snap = m.snapshot;
  return (
    <section className="ol-card" data-testid="online-live" data-connection={m.connection}>
      <small className="mn-kicker">{m.connection === 'connected' ? 'Server match' : 'Connection lost'}</small>
      <h3 data-testid="online-live-status">
        {snap
          ? `${snap.phase} · tick ${snap.tick}${snap.secondsRemaining !== null ? ` · ${snap.secondsRemaining}s left` : ''}`
          : 'Starting…'}
      </h3>
      {snap && (
        <ul className="ol-list">
          {snap.players.map((p) => (
            <li key={p.seat} data-alive={p.alive}>
              {p.displayName}
              <span className={`ol-ready${p.alive ? ' on' : ''}`}>{p.alive ? 'alive' : 'out'}</span>
              <em>{p.kills} elim.</em>
            </li>
          ))}
        </ul>
      )}
      {m.connection === 'reconnecting' && (
        <p className="ol-note" data-testid="online-dropped">
          Connection dropped. The server holds your seat for {Math.round((m.graceMs ?? 0) / 1000)} s; a bot is
          not playing it yet.
        </p>
      )}
      {m.resync && (
        <p className="ol-note" data-testid="online-resync">
          Resynced from the server snapshot at tick {m.resync.tick} plus {m.resync.inputs} logged inputs
          (state hash {m.resync.hash.toString(16)}).
        </p>
      )}
      <div className="ol-actions">
        <SecondaryButton
          testId="online-drop"
          disabled={m.connection !== 'connected'}
          onClick={() => onlineApi.simulateDrop()}
        >
          Simulate dropped connection
        </SecondaryButton>
        <PrimaryButton
          testId="online-reconnect"
          disabled={m.connection === 'connected'}
          onClick={() => void onlineApi.reconnect()}
        >
          Reconnect
        </PrimaryButton>
      </div>
    </section>
  );
}

function MatchStep() {
  const m = useOnlineStore((s) => s.match);
  if (!m) return null;
  if (m.mode === 'server') return <LivePanel m={m} />;
  return (
    <section className="ol-card ol-center" data-testid="online-match-choice">
      <h3>Match ready</h3>
      <p>
        The mock server has created this match. Play it yourself with the normal game, or let the mock server
        run it on the real simulation (a bot drives your seat) so you can watch the server-authoritative flow.
      </p>
      <div className="ol-actions">
        <PrimaryButton testId="online-play-local" autoFocus onClick={() => onlineApi.playLocal()}>
          Play it yourself
        </PrimaryButton>
        <SecondaryButton testId="online-play-server" onClick={() => onlineApi.playOnServer()}>
          Let the mock server play it
        </SecondaryButton>
      </div>
    </section>
  );
}

function Results() {
  const s = useOnlineStore();
  const { results, update, progress, leaderboard } = s;
  if (!results || !update) return null;
  const mine = results.players.find((p) => p.accountId === s.profile?.id);
  const headline = results.draw
    ? 'Draw'
    : mine?.placement === 1
      ? 'Victory'
      : `Finished #${mine?.placement ?? '-'}`;
  return (
    <div className="ol-grid">
      <section className="ol-card" data-testid="online-results">
        <small className="mn-kicker">{ONLINE_GAME_LABEL[results.game]}</small>
        <h3 data-testid="online-headline">{headline}</h3>
        <table className="ol-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Elim.</th>
              <th>Deaths</th>
            </tr>
          </thead>
          <tbody>
            {[...results.players]
              .sort((a, b) => a.placement - b.placement)
              .map((p) => (
                <tr key={p.seat} data-you={p.accountId === s.profile?.id}>
                  <td>{p.placement}</td>
                  <td>{p.displayName}</td>
                  <td>{p.kills}</td>
                  <td>{p.deaths}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <small className="mn-kicker">Progression (placeholder tuning)</small>
        <p className="ol-xp">
          <b data-testid="online-xp-total">+{update.xpGained} XP</b>
          <span data-testid="online-level-change">
            Level {update.levelBefore}
            {update.levelAfter !== update.levelBefore ? ` → ${update.levelAfter}` : ''}
          </span>
          <span data-testid="online-rank-change">{rankChangeText(update)}</span>
        </p>
        <ul className="ol-list ol-xp-parts">
          {xpRows(update).map((r) => (
            <li key={r.label}>
              {r.label} <b>+{r.xp}</b>
            </li>
          ))}
        </ul>
        {update.newUnlocks.length > 0 && (
          <p className="ol-note">New cosmetics unlocked: {update.newUnlocks.length}</p>
        )}
        {progress && <small>Total {progress.profile.xp} XP</small>}
      </section>
      <section className="ol-card" data-testid="online-leaderboard">
        <small className="mn-kicker">Leaderboard (mock names)</small>
        <ol className="ol-board">
          {(leaderboard?.rows ?? []).map((r) => (
            <li key={r.accountId} data-you={r.isYou}>
              <span>{r.rank}</span>
              <span>{r.displayName}</span>
              <b>{r.points}</b>
            </li>
          ))}
        </ol>
        <div className="ol-actions">
          <PrimaryButton testId="online-hub" autoFocus onClick={() => onlineApi.toHub()}>
            Back to Online
          </PrimaryButton>
        </div>
      </section>
    </div>
  );
}

export function OnlineScreen() {
  const step = useOnlineStore((s) => s.step);
  const error = useOnlineStore((s) => s.error);
  const profile = useOnlineStore((s) => s.profile);
  useEffect(() => {
    void onlineApi.open();
    return () => onlineApi.close();
  }, []);
  return (
    <ScreenFrame
      id="online"
      kicker="Preview"
      title={STEP_TITLE[step]}
      onBack={() => {
        if (onlineApi.back()) commands.menuBack();
      }}
      status={
        profile ? (
          <span>
            Signed in as <b>{profile.displayName}</b>
          </span>
        ) : null
      }
      className="ol-screen"
    >
      <p className="ol-banner" data-testid="online-banner" role="note">
        {PREVIEW_BANNER}
      </p>
      {error && (
        <p className="ol-error" role="alert" data-testid="online-error">
          {error}{' '}
          <button type="button" className="mn-link" onClick={() => onlineApi.dismissError()}>
            Dismiss
          </button>
        </p>
      )}
      <div data-testid={`online-step-${step}`} className="ol-step">
        {step === 'signIn' && <SignIn />}
        {step === 'hub' && <Hub />}
        {step === 'queue' && <Queue />}
        {step === 'party' && <PartyStep />}
        {step === 'lobby' && <Lobby />}
        {step === 'match' && <MatchStep />}
        {step === 'results' && <Results />}
      </div>
    </ScreenFrame>
  );
}
