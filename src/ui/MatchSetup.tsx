/**
 * Main-menu match setup panels. City Rumble (the flagship): mode (Survival / Deathmatch / Team Rumble),
 * competitors, match length and friendly fire where they apply, the stage and the bot level. Classic
 * Battle (the quick 2-4 player game): competitors, the arena and each bot's level. Offline single
 * player only: one human against AI bots, no matchmaking.
 */
import { ARENAS, DIFFICULTIES } from '../sim';
import type { ArenaDef } from '../sim';
import { commands } from '../app/session';
import type { GameSettings } from '../app/settings';
import { RUMBLE_MODE_INFO, difficultyLabel } from '../app/setupSummary';
import { DifficultyPicker } from './DifficultyPicker';
import { RumbleStagePicker } from './RumbleStagePicker';
import { ArenaPicker } from './ArenaPicker';

type SetProps = { settings: GameSettings; set: (p: Partial<GameSettings>) => void };

export function Choice<T extends string | number | boolean>(props: {
  value: T;
  current: T;
  label: string;
  onPick: (v: T) => void;
  disabled?: boolean;
  testId?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`chip${props.value === props.current ? ' on' : ''}`}
      disabled={props.disabled}
      data-testid={props.testId}
      aria-pressed={props.value === props.current}
      title={props.title}
      onClick={() => {
        commands.click();
        props.onPick(props.value);
      }}
    >
      {props.label}
    </button>
  );
}

const RUMBLE_SIZES = [8, 16, 24, 32] as const;

/** Every City Rumble stage the simulation knows (stream F's stages appear here once registered). */
export function rumbleStages(): ArenaDef[] {
  return Object.values(ARENAS).filter((a) => a.kind === 'rumble');
}


/** Rumble: one preset level for the whole roster, optionally spread one level either side (mixed). */
function RumbleBots({ settings: s, set }: SetProps) {
  return (
    <div className="setup-row">
      <span>Bots</span>
      <div className="chips">
        {DIFFICULTIES.map((d) => (
          <Choice
            key={d}
            value={d}
            current={s.difficulty}
            label={difficultyLabel(d)}
            onPick={(v) => set({ difficulty: v })}
            testId={`diff-${d}`}
          />
        ))}
        <Choice
          value={true}
          current={s.rumbleMixed}
          label={`Mixed roster ${s.rumbleMixed ? 'ON' : 'OFF'}`}
          onPick={() => set({ rumbleMixed: !s.rumbleMixed })}
          testId="mixed-roster"
          title="Spread the bots one or two levels around the chosen level"
        />
      </div>
    </div>
  );
}


/** City Rumble setup: mode cards, then the rules that mode uses, the stage and the bots. */
export function RumbleSetup({ settings: s, set }: SetProps) {
  const team = s.rumbleMode === 'team';
  const timed = s.rumbleMode !== 'survival';
  return (
    <>
      <section className="panel" data-testid="rumble-setup">
        <h3>City Rumble mode</h3>
        <div className="mode-cards">
          {RUMBLE_MODE_INFO.map((m) => {
            const on = s.rumbleMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                className={`mode-card mode-${m.id}${on ? ' on' : ''}`}
                data-testid={`mode-${m.id}`}
                aria-pressed={on}
                onClick={() => {
                  commands.click();
                  set({ play: 'rumble', rumbleMode: m.id });
                }}
              >
                <b>{m.name}</b>
                <small>{m.blurb}</small>
                <span className="facts">
                  {m.facts.map((f) => (
                    <i key={f}>{f}</i>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="setup-row">
          <span>{team ? 'Teams' : 'Fighters'}</span>
          <div className="chips">
            {RUMBLE_SIZES.map((n) => (
              <Choice
                key={n}
                value={n}
                current={s.rumbleCompetitors}
                label={team ? `${n / 2} v ${n / 2}` : `${n}`}
                onPick={(v) => set({ rumbleCompetitors: v })}
                testId={`rumble-${n}`}
              />
            ))}
          </div>
        </div>
        {timed && (
          <div className="setup-row">
            <span>Length</span>
            <div className="chips">
              {([5, 10] as const).map((m) => (
                <Choice
                  key={m}
                  value={m}
                  current={s.rumbleMinutes}
                  label={`${m} min`}
                  onPick={(v) => set({ rumbleMinutes: v })}
                  testId={`minutes-${m}`}
                />
              ))}
            </div>
          </div>
        )}
        {team && (
          <div className="setup-row">
            <span>Friendly fire</span>
            <div className="chips">
              <Choice
                value={false}
                current={s.friendlyFire}
                label="Off"
                onPick={() => set({ friendlyFire: false })}
                testId="ff-off"
              />
              <Choice
                value={true}
                current={s.friendlyFire}
                label="On"
                onPick={() => set({ friendlyFire: true })}
                testId="ff-on"
              />
            </div>
            <p className="setup-note" data-testid="ff-note">
              {s.friendlyFire
                ? 'Your blasts and vehicle can take out teammates. Careful!'
                : 'Teammates are safe from your attacks. Your own blast and vehicle still hurt you.'}
            </p>
          </div>
        )}
        {team && (
          <p className="setup-note team-note">
            You fight for <b className="green">Green</b> with AI teammates against{' '}
            <b className="white">White</b>.
          </p>
        )}
      </section>
      <section className="panel">
        <h3>Stage</h3>
        <RumbleStagePicker settings={s} set={set} />
      </section>
      <section className="panel">
        <h3>Bots</h3>
        <RumbleBots settings={s} set={set} />
      </section>
    </>
  );
}

/** Classic Battle setup: competitors, arena, bot levels and the optional crowd throws. */
export function ClassicSetup({ settings: s, set }: SetProps) {
  return (
    <>
      <section className="panel" data-testid="classic-setup">
        <h3>Classic Battle</h3>
        <div className="setup-row">
          <span>Players</span>
          <div className="chips">
            {([2, 3, 4] as const).map((n) => (
              <Choice
                key={n}
                value={n}
                current={s.competitors}
                label={`${n}`}
                onPick={(v) => set({ competitors: v, play: 'classic' })}
                testId={`players-${n}`}
              />
            ))}
            <Choice
              value={true}
              current={s.crowdThrows}
              label={`Crowd throws ${s.crowdThrows ? 'ON' : 'OFF'}`}
              onPick={() => set({ crowdThrows: !s.crowdThrows })}
              testId="toggle-crowd"
            />
          </div>
        </div>
        <DifficultyPicker settings={s} set={set} />
      </section>
      <section className="panel">
        <h3>Arena</h3>
        <ArenaPicker settings={s} set={set} />
      </section>
    </>
  );
}
