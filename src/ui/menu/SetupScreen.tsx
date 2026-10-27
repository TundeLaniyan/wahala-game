/**
 * Match setup, only the options of the chosen mode (progressive disclosure):
 *  - City Rumble: fighters (team splits for Team Rumble), length (timed modes only), friendly fire (Team
 *    Rumble only), the bot level with the optional mixed roster, and the stage;
 *  - Classic Battle: fighters 2-4, each bot's level, crowd throws, the arena; Wahala Crush is mandatory.
 * Every control writes the real GameSettings (`commands.updateSettings`).
 */
import { ARENAS, DIFFICULTIES } from '../../sim';
import type { Difficulty } from '../../sim';
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import { RUMBLE_SIZES } from '../../app/settings';
import type { GameSettings } from '../../app/settings';
import {
  LEVEL_HINT,
  LEVEL_LABEL,
  allBotsPatch,
  botSlots,
  cycleLevel,
  sharedLevel,
  slotLevel,
  slotPatch,
} from '../difficultyPicker';
import { boardSize, hasPreview, moodGradient, selectedArenaId, stagePreviewUrl } from './arenaInfo';
import { MODE_CARDS, modeOf } from './ModeScreen';
import { Field, Option, PrimaryButton, ScreenFrame, Toggle } from './Frame';

type Set = (p: Partial<GameSettings>) => void;

function LevelChips({ value, onPick, prefix }: { value: Difficulty | null; onPick: (d: Difficulty) => void; prefix: string }) {
  return (
    <div className="mn-opts mn-levels">
      {DIFFICULTIES.map((d) => (
        <Option
          key={d}
          value={d}
          current={value ?? ('' as Difficulty)}
          label={LEVEL_LABEL[d]}
          title={LEVEL_HINT[d]}
          onPick={onPick}
          testId={`${prefix}${d}`}
        />
      ))}
    </div>
  );
}

function RumbleFields({ s, set }: { s: GameSettings; set: Set }) {
  const team = s.rumbleMode === 'team';
  const timed = s.rumbleMode !== 'survival';
  return (
    <>
      <Field label={team ? 'Teams' : 'Fighters'} hint={team ? 'You and AI teammates (Green) against White' : 'You plus AI bots'}>
        <div className="mn-opts">
          {RUMBLE_SIZES.map((n) => (
            <Option
              key={n}
              value={n}
              current={s.rumbleCompetitors}
              label={team ? `${n / 2} v ${n / 2}` : `${n}`}
              onPick={(v) => set({ rumbleCompetitors: v })}
              testId={`rumble-${n}`}
            />
          ))}
        </div>
      </Field>
      {timed && (
        <Field label="Match length" hint="Respawn modes run on the clock">
          <div className="mn-opts">
            {([5, 10] as const).map((m) => (
              <Option
                key={m}
                value={m}
                current={s.rumbleMinutes}
                label={`${m} min`}
                onPick={(v) => set({ rumbleMinutes: v })}
                testId={`minutes-${m}`}
              />
            ))}
          </div>
        </Field>
      )}
      {team && (
        <Field
          label="Friendly fire"
          hint={
            <span data-testid="ff-note">
              {s.friendlyFire
                ? 'Your blasts and vehicle can take out teammates. Careful!'
                : 'Teammates are safe from your attacks. Your own blast and vehicle still hurt you.'}
            </span>
          }
        >
          <div className="mn-opts">
            <Option value={false} current={s.friendlyFire} label="Off" onPick={() => set({ friendlyFire: false })} testId="ff-off" />
            <Option value={true} current={s.friendlyFire} label="On" onPick={() => set({ friendlyFire: true })} testId="ff-on" />
          </div>
        </Field>
      )}
      <Field
        label="Blast shape"
        hint={
          <span data-testid="blast-note">
            {s.rumbleBlast === 'cross'
              ? 'Experiment: City Rumble with the Classic cross, to compare.'
              : 'Generators blast a circle; walls and crates shadow it. Diagonals are not safe.'}
          </span>
        }
      >
        <div className="mn-opts">
          <Option value="radial" current={s.rumbleBlast} label="Radial" onPick={() => set({ rumbleBlast: 'radial' })} testId="blast-radial" />
          <Option value="cross" current={s.rumbleBlast} label="Cross" onPick={() => set({ rumbleBlast: 'cross' })} testId="blast-cross" />
        </div>
      </Field>
      <Field
        label="Bot level"
        hint={
          <span data-testid="level-hint">
            {s.rumbleMixed
              ? `Levels spread around ${LEVEL_LABEL[s.difficulty]} (one or two either side)`
              : LEVEL_HINT[s.difficulty]}
          </span>
        }
      >
        <LevelChips value={s.difficulty} onPick={(d) => set(allBotsPatch(d))} prefix="diff-" />
        <Toggle
          on={s.rumbleMixed}
          label="Mixed roster"
          hint="Spread the bots one or two levels around the chosen level"
          onChange={(rumbleMixed) => set({ rumbleMixed })}
          testId="mixed-roster"
        />
      </Field>
    </>
  );
}

function ClassicFields({ s, set }: { s: GameSettings; set: Set }) {
  const shared = sharedLevel(s);
  return (
    <>
      <Field label="Fighters" hint="You plus 1-3 AI bots">
        <div className="mn-opts">
          {([2, 3, 4] as const).map((n) => (
            <Option key={n} value={n} current={s.competitors} label={`${n}`} onPick={(v) => set({ competitors: v })} testId={`players-${n}`} />
          ))}
        </div>
      </Field>
      <Field label="All bots" hint={shared ? LEVEL_HINT[shared] : 'The bots have different levels'}>
        <LevelChips value={shared} onPick={(d) => set(allBotsPatch(d))} prefix="diff-" />
      </Field>
      <Field label="Each bot" hint="Tap a bot to change its level">
        <div className="mn-opts mn-bots">
          {Array.from({ length: botSlots(s) }, (_, i) => {
            const d = slotLevel(s, i);
            return (
              <button
                key={i}
                type="button"
                className="chip mn-opt mn-bot"
                data-testid={`diff-bot-${i + 1}`}
                title={LEVEL_HINT[d]}
                onClick={() => {
                  commands.click();
                  set(slotPatch(s, i, cycleLevel(d)));
                }}
              >
                <small>Bot {i + 1}</small> {LEVEL_LABEL[d]}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Crowd throws" hint="The crowd throws bottles that briefly daze, and rarely something explosive (landing spot flagged first)">
        <Toggle on={s.crowdThrows} label={s.crowdThrows ? 'On' : 'Off'} onChange={(crowdThrows) => set({ crowdThrows })} testId="toggle-crowd" />
      </Field>
      <Field label="Wahala Crush" hint="The board closes in near the end of every Classic match">
        <span className="mn-badge locked" data-testid="crush-badge">
          Always on
        </span>
      </Field>
    </>
  );
}

/** The chosen arena as a picture card that opens the arena screen. */
export function ArenaCard({ s, onChange, testId = 'setup-arena' }: { s: GameSettings; onChange: () => void; testId?: string }) {
  const id = selectedArenaId(s);
  const a = ARENAS[id]!;
  return (
    <button type="button" className="mn-arena-card" data-testid={testId} onClick={onChange}>
      <span className="mn-arena-pic" style={{ background: moodGradient(id) }}>
        {hasPreview(id) && <img src={stagePreviewUrl(id)} alt="" loading="lazy" decoding="async" />}
        <span className="mn-arena-light">{a.info.lighting}</span>
      </span>
      <span className="mn-arena-text">
        <small>{s.play === 'rumble' ? 'Stage' : 'Arena'}</small>
        <b>{a.name}</b>
        <span>
          {boardSize(a)} · {a.info.hazards.length > 0 ? `${a.info.hazards.length} stage hazard${a.info.hazards.length === 1 ? '' : 's'}` : 'No stage hazards'}
        </span>
        <em>Change {s.play === 'rumble' ? 'stage' : 'arena'} ›</em>
      </span>
    </button>
  );
}

export function SetupScreen() {
  const s = useGameStore((st) => st.settings);
  const set: Set = (p) => commands.updateSettings(p);
  const rumble = s.play === 'rumble';
  const mode = MODE_CARDS.find((m) => m.id === modeOf(s))!;
  return (
    <ScreenFrame
      id="setup"
      kicker={rumble ? `City Rumble · ${mode.name}` : 'Classic Battle'}
      title="Match setup"
      status={
        <button type="button" className="mn-link" data-testid="setup-change-mode" onClick={() => commands.menuOpen('mode')}>
          Mode: <b>{rumble ? mode.name : 'Classic Battle'}</b> · change
        </button>
      }
      actions={
        <PrimaryButton testId="menu-continue" onClick={() => commands.menuContinue()}>
          Choose fighter
        </PrimaryButton>
      }
    >
      <div className="mn-setup" data-testid={rumble ? 'rumble-setup' : 'classic-setup'}>
        <div className="mn-panel mn-setup-fields">
          {rumble ? <RumbleFields s={s} set={set} /> : <ClassicFields s={s} set={set} />}
        </div>
        <div className="mn-setup-side">
          <ArenaCard s={s} onChange={() => commands.menuOpen('arena')} />
          {!rumble && (
            <p className="mn-note" data-testid="traps-note">
              <b>Every match:</b> floor traps erupt at <b>0:30</b> and <b>0:15</b> (cannot be switched off). Stage
              hazards depend on the arena.
            </p>
          )}
          {rumble && (
            <p className="mn-note">
              <b>Power comes from eliminations.</b> Crates drop nothing in City Rumble: take rivals out to grow
              stronger.
            </p>
          )}
        </div>
      </div>
    </ScreenFrame>
  );
}
