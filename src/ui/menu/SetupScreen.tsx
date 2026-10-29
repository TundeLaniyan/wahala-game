/**
 * Arena and match settings on one screen (the step after choosing a mode):
 *  - "Select Arena": the arena / stage cards of the chosen game (ArenaPicker.tsx), always in view;
 *  - Opponents: how many fighters and the bot difficulty (one slider, "same for all" or mixed / per bot);
 *  - Match rules: only what the chosen mode has (length, friendly fire, blast shape, crowd throws ...).
 * Every control writes the real GameSettings (`commands.updateSettings`); Wahala Crush and the floor traps
 * are mandatory, so they appear as facts, not switches.
 */
import { useState } from 'react';
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import { RUMBLE_SIZES } from '../../app/settings';
import type { GameSettings } from '../../app/settings';
import {
  LEVEL_LABEL,
  allBotsPatch,
  botSlots,
  mixedRange,
  sharedLevel,
  slotLevel,
  slotPatch,
} from '../difficultyPicker';
import { ArenaPicker } from './ArenaPicker';
import { DifficultySlider } from './DifficultyControl';
import { MODE_CARDS, modeOf } from './ModeScreen';
import { Field, Option, PrimaryButton, ScreenFrame, Toggle } from './Frame';

type Set = (p: Partial<GameSettings>) => void;

/** Plain-language line under the difficulty control: who plays at which level. */
export function difficultyExplain(s: GameSettings): string {
  if (s.play === 'rumble') {
    if (!s.rumbleMixed) return `Every opponent plays at ${LEVEL_LABEL[s.difficulty]}.`;
    const { lo, hi } = mixedRange(s.difficulty);
    return `Mixed bot difficulty — each opponent uses a different difficulty level, from ${LEVEL_LABEL[lo]} to ${LEVEL_LABEL[hi]}, centred on ${LEVEL_LABEL[s.difficulty]}.`;
  }
  const shared = sharedLevel(s);
  if (shared) return `Every opponent plays at ${LEVEL_LABEL[shared]}.`;
  return `Mixed bot difficulty — each opponent has their own level: ${Array.from({ length: botSlots(s) }, (_, i) => `Bot ${i + 1} ${LEVEL_LABEL[slotLevel(s, i)]}`).join(', ')}.`;
}

function BotDifficulty({ s, set }: { s: GameSettings; set: Set }) {
  const rumble = s.play === 'rumble';
  // Classic: "set each bot" is on when the bots already differ (or the player asked for it)
  const [each, setEach] = useState(!rumble && sharedLevel(s) === null);
  const mixed = rumble ? s.rumbleMixed : each;
  const pickSame = (): void => {
    if (rumble) set({ rumbleMixed: false });
    else {
      setEach(false);
      set(allBotsPatch(slotLevel(s, 0)));
    }
  };
  const pickMixed = (): void => {
    if (rumble) set({ rumbleMixed: true });
    else setEach(true);
  };
  return (
    <Field label="Bot difficulty" testId="bot-difficulty">
      <div className="mn-opts mn-seg" role="group" aria-label="How bot difficulty is set">
        <Option
          value={false}
          current={mixed}
          label="Same for all bots"
          onPick={pickSame}
          testId="bots-same"
        />
        <Option
          value={true}
          current={mixed}
          label={rumble ? 'Mixed roster' : 'Set each bot'}
          onPick={pickMixed}
          testId="mixed-roster"
        />
      </div>
      {rumble || !mixed ? (
        <DifficultySlider
          value={rumble ? s.difficulty : (sharedLevel(s) ?? s.difficulty)}
          onChange={(d) => set(allBotsPatch(d))}
          label={rumble && mixed ? 'Centre difficulty of the mixed roster' : 'Difficulty of all bots'}
          caption={rumble && mixed ? 'Centred on' : 'All bots'}
          testId="diff-slider"
        />
      ) : (
        <div className="mn-diff-list" data-testid="diff-each">
          {Array.from({ length: botSlots(s) }, (_, i) => (
            <DifficultySlider
              key={i}
              compact
              value={slotLevel(s, i)}
              onChange={(d) => set(slotPatch(s, i, d))}
              label={`Difficulty of bot ${i + 1}`}
              caption={`Bot ${i + 1}`}
              testId={`diff-bot-${i + 1}`}
            />
          ))}
        </div>
      )}
      <p className="mn-diff-explain" data-testid="level-hint" aria-live="polite">
        {difficultyExplain(s)}
      </p>
    </Field>
  );
}

function RumbleOpponents({ s, set }: { s: GameSettings; set: Set }) {
  const team = s.rumbleMode === 'team';
  return (
    <>
      <Field
        label={team ? 'Teams' : 'Fighters'}
        hint={team ? 'You and AI teammates (Green) against White' : 'You plus AI bots'}
      >
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
      <BotDifficulty s={s} set={set} />
    </>
  );
}

function RumbleRules({ s, set }: { s: GameSettings; set: Set }) {
  const team = s.rumbleMode === 'team';
  const timed = s.rumbleMode !== 'survival';
  return (
    <>
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
            <Option
              value={false}
              current={s.friendlyFire}
              label="Off"
              onPick={() => set({ friendlyFire: false })}
              testId="ff-off"
            />
            <Option
              value={true}
              current={s.friendlyFire}
              label="On"
              onPick={() => set({ friendlyFire: true })}
              testId="ff-on"
            />
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
          <Option
            value="radial"
            current={s.rumbleBlast}
            label="Radial"
            onPick={() => set({ rumbleBlast: 'radial' })}
            testId="blast-radial"
          />
          <Option
            value="cross"
            current={s.rumbleBlast}
            label="Cross"
            onPick={() => set({ rumbleBlast: 'cross' })}
            testId="blast-cross"
          />
        </div>
      </Field>
      <p className="mn-note">
        <b>Power comes from eliminations.</b> Crates drop nothing in City Rumble: take rivals out to grow
        stronger.
      </p>
    </>
  );
}

function ClassicOpponents({ s, set }: { s: GameSettings; set: Set }) {
  return (
    <>
      <Field label="Fighters" hint="You plus 1-3 AI bots">
        <div className="mn-opts">
          {([2, 3, 4] as const).map((n) => (
            <Option
              key={n}
              value={n}
              current={s.competitors}
              label={`${n}`}
              onPick={(v) => set({ competitors: v })}
              testId={`players-${n}`}
            />
          ))}
        </div>
      </Field>
      <BotDifficulty s={s} set={set} />
    </>
  );
}

function ClassicRules({ s, set }: { s: GameSettings; set: Set }) {
  return (
    <>
      <Field
        label="Crowd throws"
        hint="The crowd throws bottles that briefly daze, and rarely something explosive (landing spot flagged first)"
      >
        <Toggle
          on={s.crowdThrows}
          label={s.crowdThrows ? 'On' : 'Off'}
          onChange={(crowdThrows) => set({ crowdThrows })}
          testId="toggle-crowd"
        />
      </Field>
      <Field label="Wahala Crush" hint="The board closes in near the end of every Classic match">
        <span className="mn-badge locked" data-testid="crush-badge">
          Always on
        </span>
      </Field>
      <p className="mn-note" data-testid="traps-note">
        <b>Every match:</b> floor traps erupt at <b>0:30</b> and <b>0:15</b> (cannot be switched off). Stage
        hazards depend on the arena.
      </p>
    </>
  );
}

export function SetupScreen() {
  const s = useGameStore((st) => st.settings);
  const set: Set = (p) => commands.updateSettings(p);
  const rumble = s.play === 'rumble';
  const mode = MODE_CARDS.find((m) => m.id === modeOf(s))!;
  // opened with Edit from the review: the button goes back there instead of on to the fighters
  const editing = useGameStore((st) => st.menu.stack.includes('ready'));
  return (
    <ScreenFrame
      id="setup"
      kicker={rumble ? `City Rumble · ${mode.name}` : 'Classic Battle'}
      title="Arena & settings"
      status={
        <button
          type="button"
          className="mn-link"
          data-testid="setup-change-mode"
          onClick={() => commands.menuOpen('mode')}
        >
          Mode: <b>{rumble ? mode.name : 'Classic Battle'}</b> · change
        </button>
      }
      actions={
        <PrimaryButton testId="menu-continue" onClick={() => commands.menuContinue()}>
          {editing ? 'Back to review' : 'Choose fighter'}
        </PrimaryButton>
      }
    >
      <div className="mn-setup2" data-testid={rumble ? 'rumble-setup' : 'classic-setup'}>
        <ArenaPicker />
        <div className="mn-setup2-side">
          <section className="mn-group mn-panel" aria-labelledby="opp-title">
            <header className="mn-group-head">
              <h3 id="opp-title">Opponents</h3>
            </header>
            {rumble ? <RumbleOpponents s={s} set={set} /> : <ClassicOpponents s={s} set={set} />}
          </section>
          <section className="mn-group mn-panel" aria-labelledby="rules-title">
            <header className="mn-group-head">
              <h3 id="rules-title">Match rules</h3>
            </header>
            {rumble ? <RumbleRules s={s} set={set} /> : <ClassicRules s={s} set={set} />}
          </section>
        </div>
      </div>
    </ScreenFrame>
  );
}
