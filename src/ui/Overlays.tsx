import { commands } from '../app/session';
import { useGameStore } from '../app/store';
import { AudioSettingsPanel } from './AudioSettings';
import { RumbleResults } from './RumbleHud';
import { resultText } from '../app/resultText';
import { ShakeToggle } from './ShakeToggle';

export function PauseOverlay() {
  const s = useGameStore((st) => st.settings);
  return (
    <div className="scrim" data-testid="pause-overlay">
      <div className="card">
        <h2>PAUSED</h2>
        <p>Take your time, oga.</p>
        <AudioSettingsPanel
          muted={s.muted}
          onMutedChange={(muted) => commands.updateSettings({ muted })}
          subtitles={s.subtitles}
          onSubtitlesChange={(subtitles) => commands.updateSettings({ subtitles })}
        />
        <ShakeToggle />
        <div className="row">
          <button
            type="button"
            className="btn primary"
            data-testid="resume"
            onClick={() => commands.resume()}
          >
            Resume
          </button>
          <button type="button" className="btn" onClick={() => commands.rematch()}>
            Restart
          </button>
          <button type="button" className="btn danger" data-testid="quit" onClick={() => commands.toTitle()}>
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResultsOverlay() {
  const hud = useGameStore((s) => s.hud);
  const summary = useGameStore((s) => s.summary);
  if (!hud || !hud.result) return null;
  const r = hud.result;
  const won = summary?.localWon ?? false;
  const { title, detail } = resultText(hud, won);
  const rumble = hud.rumble;
  return (
    <div className="scrim" data-testid="results">
      <div className={`card ${r.kind === 'draw' ? '' : won ? 'win' : 'lose'}`}>
        <h2 data-testid="result-title">{title}</h2>
        <p>{detail}</p>
        {rumble && <RumbleResults r={rumble} />}
        {summary && !rumble && (
          <div className="stats">
            <div>
              <b>{summary.eliminations[0] ?? 0}</b>rivals out
            </div>
            <div>
              <b>{Math.max(0, summary.survivedSeconds)}s</b>survived
            </div>
          </div>
        )}
        <div className="row">
          <button
            type="button"
            className="btn primary"
            data-testid="rematch"
            onClick={() => commands.rematch()}
          >
            Rematch
          </button>
          <button type="button" className="btn" data-testid="to-title" onClick={() => commands.toTitle()}>
            Change setup
          </button>
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
      </div>
    </div>
  );
}
