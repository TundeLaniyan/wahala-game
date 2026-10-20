import { ARENAS, CHARACTERS, CHARACTER_IDS, VEHICLE_DEFS } from '../sim';
import type { CharacterId, Difficulty, MatchMode } from '../sim';
import { portraitUrl } from '../assets/portraits';
import { commands } from '../app/session';
import { useGameStore } from '../app/store';
import type { GameSettings } from '../app/settings';

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
  const set = (p: Partial<GameSettings>) => commands.updateSettings(p);
  const arena = ARENAS[s.arenaId]!;
  const hasHazards = !!arena.hazardLayout;

  return (
    <div className="title" data-testid="title-screen">
      <h1 className="logo">
        <b>WAHALA!</b>
        <span>GENERATOR BATTLE · LAGOS ARCADE</span>
      </h1>
      <div className="stripe" />

      <div className="panels">
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
                  <img src={portraitUrl(id, 0)} alt="" />
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
          <h3>Match</h3>
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
          <div className="row" style={{ marginBottom: 8 }}>
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
          <div className="row" style={{ marginBottom: 8 }}>
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
          <div className="row">
            <span>Arena</span>
            {Object.values(ARENAS).map((a) => (
              <Choice
                key={a.id}
                value={a.id}
                current={s.arenaId}
                label={a.name}
                onPick={(v) => set({ arenaId: v, floorHazards: !!ARENAS[v]!.hazardLayout })}
                testId={`arena-${a.id}`}
              />
            ))}
          </div>
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
            <Choice
              value={true}
              current={s.floorHazards && hasHazards}
              label={`Floor traps ${s.floorHazards && hasHazards ? 'ON' : 'OFF'}`}
              disabled={!hasHazards}
              onPick={() => set({ floorHazards: !s.floorHazards })}
              testId="toggle-hazards"
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
          <label className="slider">
            Music
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={s.musicVolume}
              onChange={(e) => set({ musicVolume: Number(e.target.value) })}
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
              onChange={(e) => set({ sfxVolume: Number(e.target.value) })}
            />
          </label>
          <div className="row" style={{ marginTop: 6 }}>
            <Choice
              value={true}
              current={s.muted}
              label={s.muted ? 'Muted' : 'Sound on'}
              onPick={() => set({ muted: !s.muted })}
              testId="toggle-mute"
            />
          </div>
        </section>
      </div>

      <div className="start-row">
        <button
          type="button"
          className="btn primary"
          data-testid="start-button"
          onClick={() => commands.start()}
        >
          Start match
        </button>
      </div>

      <details className="panel help">
        <summary style={{ cursor: 'pointer', fontWeight: 900, color: 'var(--yellow)' }}>
          HOW TO PLAY &amp; CONTROLS
        </summary>
        <p>
          Drop generators to blast rivals — but their fire is a plus shape, it stops at concrete, and it will
          happily get <b>you</b> too. Last one standing wins in two minutes; if the last two fall together it
          is a draw. Break crates for upgrades. An <b>Okada</b> is a ride that saves you from one deadly hit.
          Grab a <b>Vehicle Voucher</b> to call your signature {`Danfo, Cab or Keke`} down any open lane.
        </p>
        <dl>
          <dt>Move</dt>
          <dd>
            <span className="kbd">←↑↓→</span> or <span className="kbd">WASD</span> · D-pad / left stick ·
            on-screen pad
          </dd>
          <dt>Generator</dt>
          <dd>
            <span className="kbd">Space</span> · gamepad A · big button
          </dd>
          <dt>Carry / punch</dt>
          <dd>
            <span className="kbd">E</span> · gamepad X
          </dd>
          <dt>Push / daze</dt>
          <dd>
            <span className="kbd">F</span> · gamepad B
          </dd>
          <dt>Remote boom</dt>
          <dd>
            <span className="kbd">Q</span> · gamepad RB
          </dd>
          <dt>Kill switch</dt>
          <dd>
            <span className="kbd">X</span> · gamepad LB
          </dd>
          <dt>Vehicle</dt>
          <dd>
            <span className="kbd">V</span> · gamepad Y — then pick an arrow on the border (arrows/D-pad, tap
            or click) and confirm
          </dd>
          <dt>Pause</dt>
          <dd>
            <span className="kbd">P</span> or <span className="kbd">Esc</span>
          </dd>
        </dl>
      </details>
      <div className="footnote">
        WAHALA! prototype · everything runs in your browser · no accounts, no servers
      </div>
    </div>
  );
}
