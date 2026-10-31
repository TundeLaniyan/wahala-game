/**
 * In-match overlays in the menu's visual language: the pause menu (Resume, Settings, Restart, Main menu
 * beside a live match summary), the results screen (real outcome, eliminations and standings; Rematch,
 * Change setup, Main menu) and the rotate-your-phone notice. Keyboard and gamepad navigate them like the
 * main menu; Esc / Start in the pause menu's Settings closes Settings and keeps the match paused.
 */
import { useEffect, useRef } from 'react';
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
import { FighterImage } from './menu/FighterImage';
import { fighterArt } from './menu/art';
import './menu/menu.css';

const clock = (sec: number): string => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, Math.floor(sec)) % 60).padStart(2, '0')}`;

function MatchInfo({ hud }: { hud: HudSnapshot | null }) {
  const s = useGameStore((st) => st.settings);
  const arena = ARENAS[matchArenaId(s)];
  const r = hud?.rumble;
  const me = r?.local;
  const alive = r ? r.alive : (hud?.players.filter((p) => p.alive).length ?? 0);
  const total = r ? r.total : (hud?.players.length ?? 0);
  return (
    <aside className="mn-panel mn-pause-info" data-testid="pause-info">
      <small className="mn-kicker">{s.play === 'rumble' ? 'City Rumble' : 'Classic Battle'}</small>
      <h3>{arena?.name ?? ''}</h3>
      <p className="mn-pause-summary">{setupSummary(s)}</p>
      <dl className="mn-pause-stats">
        <div>
          <dt>Time left</dt>
          <dd>{hud ? clock(hud.secondsLeft) : '-'}</dd>
        </div>
        <div>
          <dt>{r?.respawns ? 'Fighters' : 'Still standing'}</dt>
          <dd>
            {r?.respawns ? total : `${alive} / ${total}`}
          </dd>
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

export function PauseOverlay() {
  const hud = useGameStore((st) => st.hud);
  const settingsOpen = useGameStore((st) => st.pauseSettings);
  const root = useRef<HTMLDivElement>(null);
  useMenuNav(
    root,
    () => {
      if (!useGameStore.getState().pauseSettings) return false; // Esc resumes the match
      commands.pauseSettings(false);
      return true;
    },
    {
      // Start / P with Settings open: close Settings first, never resume behind it
      onPause: () => {
        if (!useGameStore.getState().pauseSettings) return false;
        commands.pauseSettings(false);
        return true;
      },
    },
  );
  // the next pause always opens on the pause menu itself
  useEffect(() => () => patch({ pauseSettings: false }), []);
  return (
    <div className="mn-overlay" data-testid="pause-overlay" ref={root}>
      {settingsOpen ? (
        <div className="mn-overlay-card mn-pause-settings" data-testid="pause-settings">
          <header className="mn-overlay-head">
            <button type="button" className="mn-back" data-testid="pause-settings-close" onClick={() => commands.pauseSettings(false)}>
              <span aria-hidden>‹</span> Back
            </button>
            <h2>Settings</h2>
            <small className="mn-kicker">Match paused</small>
          </header>
          <SettingsPanel />
        </div>
      ) : (
        <div className="mn-overlay-card mn-pause">
          <div className="mn-pause-menu">
            <header>
              <small className="mn-kicker">Match paused</small>
              <h2>Paused</h2>
              <p>Take your time, oga.</p>
            </header>
            <nav className="mn-pause-list" aria-label="Pause menu">
              <button type="button" className="mn-pause-item primary" data-testid="resume" data-autofocus="" onClick={() => commands.resume()}>
                <b>Resume</b>
                <small>Back into the fight</small>
              </button>
              <button type="button" className="mn-pause-item" data-testid="pause-settings-open" onClick={() => commands.pauseSettings(true)}>
                <b>Settings</b>
                <small>Audio, graphics, controls, accessibility</small>
              </button>
              <button type="button" className="mn-pause-item" data-testid="restart" onClick={() => commands.rematch()}>
                <b>Restart</b>
                <small>Same setup, fresh match</small>
              </button>
              <button type="button" className="mn-pause-item danger" data-testid="quit" onClick={() => commands.toTitle()}>
                <b>Main menu</b>
                <small>Leave this match</small>
              </button>
            </nav>
          </div>
          <MatchInfo hud={hud} />
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
          <span className={`mn-results-badge ${outcome}`}>{outcome === 'win' ? 'Victory' : outcome === 'draw' ? 'Draw' : 'Defeat'}</span>
        </div>
        <div className="mn-results-body">
          <small className="mn-kicker">Match over</small>
          <h2 data-testid="result-title">{title}</h2>
          <p className="mn-results-detail" data-testid="result-detail">{detail}</p>
          {rumble ? <RumbleResults r={rumble} /> : <ClassicResults hud={hud} summary={summary} />}
          <div className="mn-results-actions">
            <button type="button" className="mn-btn mn-primary" data-testid="rematch" data-autofocus="" onClick={() => commands.rematch()}>
              Rematch
              <span className="mn-arrow" aria-hidden>
                →
              </span>
            </button>
            <button type="button" className="mn-btn mn-secondary" data-testid="to-title" onClick={() => commands.toTitle(['ready'])}>
              Change setup
            </button>
            <button type="button" className="mn-btn mn-secondary" data-testid="results-home" onClick={() => commands.toTitle()}>
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
        <button type="button" className="mn-btn mn-secondary small" data-testid="rotate-pause" onClick={() => commands.togglePause()}>
          Pause menu
        </button>
      </div>
    </div>
  );
}
