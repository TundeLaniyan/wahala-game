import { CHARACTERS, CHARACTER_IDS, VEHICLE_DEFS } from '../sim';
import type { CharacterId } from '../sim';
import { portraitUrl } from '../assets/portraits';
import { commands } from '../app/session';
import { useGameStore } from '../app/store';
import type { GameSettings } from '../app/settings';
import { setupSummary } from '../app/setupSummary';
import { AudioSettingsPanel } from './AudioSettings';
import { Choice, ClassicSetup, RumbleSetup } from './MatchSetup';
import './TitleScreen.css';

/** The two games: City Rumble (flagship, default) and Classic Battle (the quick four-player match). */
function GameSwitch({ s, set }: { s: GameSettings; set: (p: Partial<GameSettings>) => void }) {
  const pick = (play: GameSettings['play']) => () => {
    commands.click();
    set({ play });
  };
  return (
    <div className="game-switch" role="group" aria-label="Game">
      <button
        type="button"
        className={`gs gs-rumble${s.play === 'rumble' ? ' on' : ''}`}
        data-testid="play-rumble"
        aria-pressed={s.play === 'rumble'}
        onClick={pick('rumble')}
      >
        <b>
          City <em>Rumble</em>
        </b>
        <small>Up to 32 fighters · Survival · Deathmatch · Teams</small>
      </button>
      <button
        type="button"
        className={`gs gs-classic${s.play === 'classic' ? ' on' : ''}`}
        data-testid="play-classic"
        aria-pressed={s.play === 'classic'}
        onClick={pick('classic')}
      >
        <b>Classic Battle</b>
        <small>Quick 2-4 player match</small>
      </button>
    </div>
  );
}

export function TitleScreen() {
  const s = useGameStore((st) => st.settings);
  const loading = useGameStore((st) => st.loading);
  useGameStore((st) => st.portraitsVersion);
  const set = (p: Partial<GameSettings>) => commands.updateSettings(p);
  const busy = loading !== null && loading.done < loading.total;
  const rumble = s.play === 'rumble';

  return (
    <div className={`title ${rumble ? 'title-rumble' : 'title-classic'}`} data-testid="title-screen">
      <header className="brand">
        <h1 className="logo">
          <b>WAHALA!</b>
          <span>GENERATOR WARS · LAGOS</span>
        </h1>
        <GameSwitch s={s} set={set} />
        <p className="setup-summary" data-testid="setup-summary">
          {setupSummary(s)}
        </p>
        <div className="cta">
          <button
            type="button"
            className="btn primary"
            data-testid="start-button"
            disabled={busy}
            onClick={() => commands.start()}
          >
            {busy ? 'Loading…' : rumble ? 'Play Rumble' : 'Play'}
          </button>
          <button
            type="button"
            className="btn small"
            data-testid="help-button"
            disabled={busy}
            onClick={() => commands.openTutorial()}
          >
            How to play
          </button>
        </div>
        <div className="footnote">Offline · you against AI bots · no accounts · no servers</div>
      </header>

      <main className="menu" data-testid="menu">
        {rumble ? <RumbleSetup settings={s} set={set} /> : <ClassicSetup settings={s} set={set} />}

        <section className="panel">
          <h3>Choose your fighter</h3>
          <div className="chars">
            {CHARACTER_IDS.map((id: CharacterId) => {
              const c = CHARACTERS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={`char${s.character === id ? ' on' : ''}`}
                  data-testid={`char-${id}`}
                  onClick={() => {
                    commands.click();
                    set({ character: id });
                  }}
                >
                  <img src={portraitUrl(id, 0, 160)} alt="" />
                  <b>{c.name}</b>
                  <small>
                    {VEHICLE_DEFS[c.vehicle].name} ·{' '}
                    {c.skill === 'daze' ? 'Daze' : c.skill === 'shove' ? 'Shove' : 'Push'}
                  </small>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h3>Settings</h3>
          <div className="row" style={{ marginBottom: 8 }}>
            <span>Graphics</span>
            {(['auto', 'low', 'medium', 'high'] as const).map((q) => (
              <Choice
                key={q}
                value={q}
                current={s.quality}
                label={q}
                onPick={(v) => set({ quality: v })}
                testId={`quality-${q}`}
              />
            ))}
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <span>On-screen buttons</span>
            {(['auto', 'on', 'off'] as const).map((q) => (
              <Choice
                key={q}
                value={q}
                current={s.touchControls}
                label={q}
                onPick={(v) => set({ touchControls: v })}
                testId={`touch-${q}`}
              />
            ))}
          </div>
          <AudioSettingsPanel
            muted={s.muted}
            onMutedChange={(muted) => set({ muted })}
            subtitles={s.subtitles}
            onSubtitlesChange={(subtitles) => set({ subtitles })}
          />
        </section>
      </main>
      {busy && loading && (
        <div
          className="loading"
          style={{ ['--p' as string]: `${Math.round((loading.done / Math.max(1, loading.total)) * 100)}%` }}
        >
          LOADING 3D ASSETS
          <i />
        </div>
      )}
    </div>
  );
}
