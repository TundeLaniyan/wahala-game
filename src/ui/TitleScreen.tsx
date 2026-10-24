import { CHARACTERS, CHARACTER_IDS, CITY_RUMBLE_ID, VEHICLE_DEFS } from '../sim';
import type { CharacterId, Difficulty, MatchMode } from '../sim';
import { portraitUrl } from '../assets/portraits';
import { commands } from '../app/session';
import { useGameStore } from '../app/store';
import type { GameSettings } from '../app/settings';
import { ArenaPicker } from './ArenaPicker';
import { AudioSettingsPanel } from './AudioSettings';

function Choice<T extends string | number | boolean>(props: {
  value: T;
  current: T;
  label: string;
  onPick: (v: T) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={`chip${props.value === props.current ? ' on' : ''}`}
      disabled={props.disabled}
      data-testid={props.testId}
      onClick={() => {
        commands.click();
        props.onPick(props.value);
      }}
    >
      {props.label}
    </button>
  );
}

export function TitleScreen() {
  const s = useGameStore((st) => st.settings);
  const loading = useGameStore((st) => st.loading);
  useGameStore((st) => st.portraitsVersion);
  const set = (p: Partial<GameSettings>) => commands.updateSettings(p);
  const busy = loading !== null && loading.done < loading.total;
  // City Rumble has its own competitor count (on its card) and always closes in: no 2-4 or rules choice
  const rumble = s.arenaId === CITY_RUMBLE_ID;

  return (
    <div className="title" data-testid="title-screen">
      <header className="brand">
        <h1 className="logo">
          <b>WAHALA!</b>
          <span>GENERATOR WARS · LAGOS</span>
        </h1>
        <div className="tag">Outsmart your rivals in the bus park. Mind your own fire.</div>
        <div className="cta">
          <button
            type="button"
            className="btn primary"
            data-testid="start-button"
            disabled={busy}
            onClick={() => commands.start()}
          >
            {busy ? 'Loading…' : 'Play'}
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
        <div className="footnote">Everything runs in your browser · no accounts · no servers</div>
      </header>

      <main className="menu">
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
          <h3>Arena</h3>
          <ArenaPicker settings={s} set={set} />
        </section>

        <section className="panel">
          <h3>Match</h3>
          {!rumble && (
            <div className="row" style={{ marginBottom: 8 }}>
              <span>Competitors</span>
              {([2, 3, 4] as const).map((n) => (
                <Choice
                  key={n}
                  value={n}
                  current={s.competitors}
                  label={`${n}`}
                  onPick={(v) => set({ competitors: v })}
                  testId={`players-${n}`}
                />
              ))}
            </div>
          )}
          <div className="row" style={{ marginBottom: rumble ? 0 : 8 }}>
            <span>Bots</span>
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <Choice
                key={d}
                value={d}
                current={s.difficulty}
                label={d}
                onPick={(v) => set({ difficulty: v })}
                testId={`diff-${d}`}
              />
            ))}
          </div>
          {!rumble && (
            <div className="row">
              <span>Rules</span>
              {(
                [
                  ['classic', 'Classic Timer'],
                  ['crush', 'Wahala Crush'],
                ] as [MatchMode, string][]
              ).map(([m, label]) => (
                <Choice
                  key={m}
                  value={m}
                  current={s.mode}
                  label={label}
                  onPick={(v) => set({ mode: v })}
                  testId={`mode-${m}`}
                />
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Extras &amp; settings</h3>
          <div className="row" style={{ marginBottom: 8 }}>
            <Choice
              value={true}
              current={s.crowdThrows}
              label={`Crowd throws ${s.crowdThrows ? 'ON' : 'OFF'}`}
              onPick={() => set({ crowdThrows: !s.crowdThrows })}
              testId="toggle-crowd"
            />
          </div>
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
