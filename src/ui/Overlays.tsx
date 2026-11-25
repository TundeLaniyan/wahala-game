/**
 * In-match overlays in the menu's visual language: the pause menu (Resume, Settings, Restart, Main menu
 * beside a live match summary), the results screen (real outcome, eliminations and standings; Rematch,
 * Change setup, Main menu) and the rotate-your-phone notice. Keyboard and gamepad navigate them like the
 * main menu; Esc / Start in the pause menu's Settings closes Settings and keeps the match paused.
 */
import { useEffect, useRef, useState } from 'react';
import { ARENAS, CHARACTERS } from '../sim';
import { commands } from '../app/session';
import { useGameStore, patch } from '../app/store';
import { matchArenaId } from '../app/names';
import { setupSummary } from '../app/setupSummary';
import { resultText } from '../app/resultText';
import type { HudSnapshot } from '../app/hud';
import type { MatchSummary } from '../app/store';
import { playerCss } from '../assets/palette';
import { RumbleResults } from './RumbleHud';
import { useMenuNav } from './menu/focusNav';
import { SettingsPanel } from './menu/SettingsScreen';
import type { SettingsTab } from './menu/SettingsScreen';
import { MissionPauseInfo } from './campaign/MissionPauseInfo';
import { FighterImage } from './menu/FighterImage';
import { CombatLabPauseSection } from './CombatLab';
import { fighterArt } from './menu/art';
import './menu/menu.css';

const clock = (sec: number): string =>
  `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, Math.floor(sec)) % 60).padStart(2, '0')}`;

function MatchInfo({ hud }: { hud: HudSnapshot | null }) {
  const s = useGameStore((st) => st.settings);
  const arena = ARENAS[matchArenaId(s)];
  const r = hud?.rumble;
  const me = r?.local;
  const alive = r ? r.alive : (hud?.players.filter((p) => p.alive).length ?? 0);
  const total = r ? r.total : (hud?.players.length ?? 0);
  return (
    <aside className="mn-panel mn-pause-info" data-testid="pause-info">
      <small className="mn-kicker">{s.play === 'rumble' ? 'City Rumble' : 'Junction Blast'}</small>
      <h3>{arena?.name ?? ''}</h3>
      <p className="mn-pause-summary">{setupSummary(s)}</p>
      <dl className="mn-pause-stats">
        <div>
          <dt>Time left</dt>
          <dd>{hud ? clock(hud.secondsLeft) : '-'}</dd>
        </div>
        <div>
          <dt>{r?.respawns ? 'Fighters' : 'Still standing'}</dt>
          <dd>{r?.respawns ? total : `${alive} / ${total}`}</dd>
        </div>
        {me && (
          <div>
            <dt>Your eliminations</dt>
            <dd>{me.kills}</dd>
          </div>
        )}
        <div>
          <dt>You</dt>
          <dd>{hud?.localAlive ? 'In the fight' : 'Out'}</dd>
        </div>
      </dl>
    </aside>
  );
}

/** What EXIT MATCH does for each kind of match (decision: always behind the "Leave this match?" confirmation). */
type ExitKind = 'match' | 'mission' | 'raid';

/** The confirmation copy. A campaign only stores cleared missions, so it never promises a mid-mission save. */
export const EXIT_COPY: Record<ExitKind, string> = {
  match: 'Progress in this match will be lost.',
  mission:
    'This attempt and its checkpoints will be lost. Missions you have already cleared stay saved. You go back to the campaign map.',
  raid: 'This raid attempt will be lost. Missions you have already cleared stay saved.',
};

function ExitConfirm({ kind, onStay, onLeave }: { kind: ExitKind; onStay: () => void; onLeave: () => void }) {
  return (
    <div
      className="mn-confirm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="exit-title"
      aria-describedby="exit-text"
      data-testid="exit-confirm"
    >
      <div className="mn-panel mn-confirm-card">
        <h3 id="exit-title">Leave this match?</h3>
        <p id="exit-text">{EXIT_COPY[kind]}</p>
        <div className="mn-confirm-actions">
          <button
            type="button"
            className="mn-btn mn-primary"
            data-testid="exit-confirm-stay"
            data-autofocus=""
            onClick={onStay}
          >
            KEEP PLAYING
          </button>
          <button
            type="button"
            className="mn-btn mn-secondary danger"
            data-testid="exit-confirm-leave"
            onClick={onLeave}
          >
            EXIT MATCH
          </button>
        </div>
      </div>
    </div>
  );
}

export function PauseOverlay() {
  const hud = useGameStore((st) => st.hud);
  const settingsOpen = useGameStore((st) => st.pauseSettings);
  // an online match never pauses for anyone: the menu only stops THIS player's input
  const online = useGameStore((st) => st.online);
  const mission = useGameStore((st) => st.campaign?.active ?? null);
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<SettingsTab>('audio');
  const root = useRef<HTMLDivElement>(null);
  const kind: ExitKind = mission?.raid ? 'raid' : mission ? 'mission' : 'match';
  const confirmRef = useRef(false);
  confirmRef.current = confirm;
  useMenuNav(
    root,
    () => {
      // Esc closes the confirmation first (the match stays paused), then Settings, and only then resumes
      if (confirmRef.current) {
        setConfirm(false);
        return true;
      }
      if (!useGameStore.getState().pauseSettings) return false; // Esc resumes the match
      commands.pauseSettings(false);
      return true;
    },
    {
      // Start / P with the confirmation or Settings open: close it first, never resume behind it
      onPause: () => {
        if (confirmRef.current) {
          setConfirm(false);
          return true;
        }
        if (!useGameStore.getState().pauseSettings) return false;
        commands.pauseSettings(false);
        return true;
      },
    },
  );
  // the next pause always opens on the pause menu itself
  useEffect(() => () => patch({ pauseSettings: false }), []);
  const leave = (): void => {
    setConfirm(false);
    if (kind === 'raid') commands.campaignLeaveRaid();
    else if (kind === 'mission') commands.campaignMap();
    else commands.toTitle();
  };
  const openSettings = (t: SettingsTab): void => {
    setTab(t);
    commands.pauseSettings(true);
  };
  return (
    <div className="mn-overlay" data-testid="pause-overlay" ref={root}>
      {settingsOpen ? (
        <div className="mn-overlay-card mn-pause-settings" data-testid="pause-settings">
          <header className="mn-overlay-head">
            <button
              type="button"
              className="mn-back"
              data-testid="pause-settings-close"
              onClick={() => commands.pauseSettings(false)}
            >
              <span aria-hidden>‹</span> Back
            </button>
            <h2>Settings</h2>
            <small className="mn-kicker">Match paused</small>
          </header>
          <SettingsPanel key={tab} initialTab={tab} />
        </div>
      ) : (
        <div className="mn-overlay-card mn-pause">
          <div className="mn-pause-menu">
            <header>
              <small className="mn-kicker">{online ? 'Online match' : 'Match paused'}</small>
              <h2>{online ? 'Menu' : 'Paused'}</h2>
            </header>
            <nav className="mn-pause-list" aria-label="Pause menu" aria-hidden={confirm || undefined}>
              <button
                type="button"
                className="mn-pause-item primary"
                data-testid="resume"
                data-autofocus=""
                disabled={confirm}
                onClick={() => commands.resume()}
              >
                <b>Resume</b>
                <small>Back into the fight</small>
              </button>
              {mission?.raid ? (
                <button
                  type="button"
                  className="mn-pause-item"
                  data-testid="raid-retry"
                  disabled={confirm}
                  onClick={() => commands.campaignRetryRaid()}
                >
                  <b>Restart</b>
                  <small>Start this raid again</small>
                </button>
              ) : mission ? (
                <button
                  type="button"
                  className="mn-pause-item"
                  data-testid="mission-retry"
                  disabled={confirm}
                  onClick={() => commands.campaignRetry()}
                >
                  <b>Restart</b>
                  <small>Same district, a fresh attempt</small>
                </button>
              ) : online ? null : (
                <button
                  type="button"
                  className="mn-pause-item"
                  data-testid="restart"
                  disabled={confirm}
                  onClick={() => commands.rematch()}
                >
                  <b>Restart</b>
                  <small>Same setup, fresh match</small>
                </button>
              )}
              <button
                type="button"
                className="mn-pause-item"
                data-testid="pause-controls-open"
                disabled={confirm}
                onClick={() => openSettings('controls')}
              >
                <b>Controls</b>
                <small>Buttons, movement and touch layout</small>
              </button>
              <button
                type="button"
                className="mn-pause-item"
                data-testid="pause-settings-open"
                disabled={confirm}
                onClick={() => openSettings('audio')}
              >
                <b>Settings &amp; Sound</b>
                <small>Audio, graphics, accessibility</small>
              </button>
              <button
                type="button"
                className="mn-pause-item danger"
                data-testid={kind === 'match' ? 'quit' : kind === 'raid' ? 'raid-leave' : 'mission-map'}
                disabled={confirm}
                onClick={() => {
                  commands.click();
                  setConfirm(true);
                }}
              >
                <b>Exit match</b>
                <small>
                  {kind === 'match'
                    ? 'Back to the main menu'
                    : mission?.raid?.doorId
                      ? 'Back to the field map'
                      : 'Back to the campaign map'}
                </small>
              </button>
            </nav>
            {online && (
              <p className="mn-note" data-testid="pause-online-note">
                The match keeps running while this menu is open. Your fighter stands still until you resume.
              </p>
            )}
            {!mission && !online && <CombatLabPauseSection lab={hud?.combatLab ?? null} />}
          </div>
          {mission ? <MissionPauseInfo mission={mission} /> : <MatchInfo hud={hud} />}
          {confirm && <ExitConfirm kind={kind} onStay={() => commands.resume()} onLeave={leave} />}
        </div>
      )}
    </div>
  );
}

/** Classic standings: the winner first, then by eliminations (no invented placements beyond that). */
export function classicStandings(hud: HudSnapshot, summary: MatchSummary | null) {
  const winnerId = hud.result?.kind === 'win' ? hud.result.winnerId : null;
  return hud.players
    .map((p) => ({ ...p, kills: summary?.eliminations[p.id] ?? 0, winner: p.id === winnerId }))
    .sort((a, b) => Number(b.winner) - Number(a.winner) || b.kills - a.kills || a.id - b.id);
}

function ClassicResults({ hud, summary }: { hud: HudSnapshot; summary: MatchSummary | null }) {
  return (
    <div className="mn-results-classic">
      {summary && (
        <div className="stats mn-result-stats">
          <div>
            <b data-testid="my-kills">{summary.eliminations[0] ?? 0}</b>rivals out
          </div>
          <div>
            <b>{Math.max(0, summary.survivedSeconds)}s</b>survived
          </div>
        </div>
      )}
      <table className="mn-standings" data-testid="standings">
        <thead>
          <tr>
            <th className="nm">Fighter</th>
            <th>Result</th>
            <th title="Eliminations">KOs</th>
          </tr>
        </thead>
        <tbody>
          {classicStandings(hud, summary).map((p) => (
            <tr key={p.id} className={p.isLocal ? 'me' : ''}>
              <td className="nm">
                <i style={{ background: playerCss(p.slot, -1) }} />
                {p.isLocal ? 'YOU' : p.name} <small>{CHARACTERS[p.characterId].name}</small>
              </td>
              <td>{p.winner ? 'Winner' : p.alive ? 'Standing' : 'Out'}</td>
              <td>{p.kills}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultsOverlay() {
  const hud = useGameStore((s) => s.hud);
  const summary = useGameStore((s) => s.summary);
  const character = useGameStore((s) => s.settings.character);
  const root = useRef<HTMLDivElement>(null);
  useMenuNav(root, () => true);
  if (!hud || !hud.result) return null;
  const r = hud.result;
  const won = summary?.localWon ?? false;
  const outcome = r.kind === 'draw' ? 'draw' : won ? 'win' : 'lose';
  const { title, detail } = resultText(hud, won);
  const rumble = hud.rumble;
  return (
    <div className={`mn-overlay mn-results ${outcome}`} data-testid="results" ref={root}>
      <div className="mn-overlay-card mn-results-card">
        <div className="mn-results-hero">
          <FighterImage id={character} art={fighterArt(character)} sizes="(max-width: 700px) 40vw, 320px" />
          <span className={`mn-results-badge ${outcome}`}>
            {outcome === 'win' ? 'Victory' : outcome === 'draw' ? 'Draw' : 'Defeat'}
          </span>
        </div>
        <div className="mn-results-body">
          <small className="mn-kicker">Match over</small>
          <h2 data-testid="result-title">{title}</h2>
          <p className="mn-results-detail" data-testid="result-detail">
            {detail}
          </p>
          {rumble ? <RumbleResults r={rumble} /> : <ClassicResults hud={hud} summary={summary} />}
          <div className="mn-results-actions">
            <button
              type="button"
              className="mn-btn mn-primary"
              data-testid="rematch"
              data-autofocus=""
              onClick={() => commands.rematch()}
            >
              Rematch
              <span className="mn-arrow" aria-hidden>
                →
              </span>
            </button>
            <button
              type="button"
              className="mn-btn mn-secondary"
              data-testid="to-title"
              onClick={() => commands.toTitle(['ready'])}
            >
              Change setup
            </button>
            <button
              type="button"
              className="mn-btn mn-secondary"
              data-testid="results-home"
              onClick={() => commands.toTitle()}
            >
              Main menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RotateOverlay() {
  return (
    <div className="rotate" data-testid="rotate">
      <div>
        <div className="phone">📱</div>
        <h2 style={{ color: 'var(--yellow)' }}>Turn your phone sideways</h2>
        <p>WAHALA! plays best in landscape so you can see the whole arena.</p>
        <button
          type="button"
          className="mn-btn mn-secondary small"
          data-testid="rotate-pause"
          onClick={() => commands.togglePause()}
        >
          Pause menu
        </button>
      </div>
    </div>
  );
}
