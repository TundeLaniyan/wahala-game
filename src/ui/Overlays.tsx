import { CHARACTERS } from '../sim';
import { commands } from '../app/session';
import { useGameStore } from '../app/store';

export function PauseOverlay() {
  const s = useGameStore((st) => st.settings);
  return (
    <div className="scrim" data-testid="pause-overlay">
      <div className="card">
        <h2>PAUSED</h2>
        <p>Take your time, oga.</p>
        <label className="slider">
          Music
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={s.musicVolume}
            onChange={(e) => commands.updateSettings({ musicVolume: Number(e.target.value) })}
          />
        </label>
        <label className="slider">
          Effects
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={s.sfxVolume}
            onChange={(e) => commands.updateSettings({ sfxVolume: Number(e.target.value) })}
          />
        </label>
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
  const winner = r.kind === 'win' ? hud.players[r.winnerId] : null;
  const won = summary?.localWon ?? false;
  const title = r.kind === 'draw' ? 'DRAW!' : won ? 'YOU WIN!' : 'ELIMINATED';
  const detail =
    r.kind === 'draw'
      ? r.reason === 'timeout'
        ? 'Time up with rivals still standing: nobody wins.'
        : 'Everybody went down together. Wahala!'
      : won
        ? 'Last one standing. Naija no dey carry last!'
        : `${winner?.name ?? 'A bot'} (${winner ? CHARACTERS[winner.characterId].name : ''}) took it.`;
  return (
    <div className="scrim" data-testid="results">
      <div className={`card ${r.kind === 'draw' ? '' : won ? 'win' : 'lose'}`}>
        <h2 data-testid="result-title">{title}</h2>
        <p>{detail}</p>
        {summary && (
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
