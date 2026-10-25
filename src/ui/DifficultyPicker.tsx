/**
 * V2 bot levels on one compact panel (decision WB5). Classic Battle: an "All bots" preset plus one row per
 * bot slot (tap the level to cycle it, or pick from the small list) - never one setup screen per bot.
 * City Rumble: one overall preset plus the optional mixed roster (levels spread around the preset by
 * app/names.ts botDifficulty); never 31 manual choices. Mobile first: every control is a >= 40 px target.
 */
import { DIFFICULTIES } from '../sim';
import type { Difficulty } from '../sim';
import { commands } from '../app/session';
import type { GameSettings } from '../app/settings';
import {
  LEVEL_HINT,
  LEVEL_LABEL,
  allBotsPatch,
  botSlots,
  cycleLevel,
  sharedLevel,
  slotLevel,
  slotPatch,
} from './difficultyPicker';
import './DifficultyPicker.css';

function LevelSelect(props: {
  value: Difficulty | null;
  onPick: (d: Difficulty) => void;
  testId: string;
  label: string;
}) {
  return (
    <select
      className="diff-select"
      aria-label={props.label}
      data-testid={props.testId}
      value={props.value ?? ''}
      onChange={(e) => {
        commands.click();
        props.onPick(e.target.value as Difficulty);
      }}
    >
      {props.value === null && (
        <option value="" disabled>
          Mixed
        </option>
      )}
      {DIFFICULTIES.map((d) => (
        <option key={d} value={d}>
          {LEVEL_LABEL[d]}
        </option>
      ))}
    </select>
  );
}

export function DifficultyPicker(props: { settings: GameSettings; set: (p: Partial<GameSettings>) => void }) {
  const { settings: s, set } = props;
  const rumble = s.play === 'rumble';
  if (rumble) {
    return (
      <div className="diff-picker" data-testid="difficulty-picker">
        <div className="diff-row">
          <span className="diff-name">Bots</span>
          <LevelSelect value={s.difficulty} onPick={(d) => set(allBotsPatch(d))} testId="diff-all" label="Bot level" />
          <button
            type="button"
            className={`chip diff-mixed${s.rumbleMixed ? ' on' : ''}`}
            data-testid="diff-mixed"
            aria-pressed={s.rumbleMixed}
            onClick={() => {
              commands.click();
              set({ rumbleMixed: !s.rumbleMixed });
            }}
          >
            Mixed roster
          </button>
        </div>
        <div className="diff-hint">
          {s.rumbleMixed
            ? `Levels spread around ${LEVEL_LABEL[s.difficulty]} (one or two either side)`
            : LEVEL_HINT[s.difficulty]}
        </div>
      </div>
    );
  }
  const slots = botSlots(s);
  const shared = sharedLevel(s);
  return (
    <div className="diff-picker" data-testid="difficulty-picker">
      <div className="diff-row">
        <span className="diff-name">All bots</span>
        <LevelSelect value={shared} onPick={(d) => set(allBotsPatch(d))} testId="diff-all" label="Level of every bot" />
      </div>
      {Array.from({ length: slots }, (_, i) => {
        const d = slotLevel(s, i);
        return (
          <div className="diff-row" key={i}>
            <span className="diff-name">Bot {i + 1}</span>
            <button
              type="button"
              className="chip diff-cycle"
              data-testid={`diff-bot-${i + 1}`}
              title={LEVEL_HINT[d]}
              onClick={() => {
                commands.click();
                set(slotPatch(s, i, cycleLevel(d)));
              }}
            >
              {LEVEL_LABEL[d]}
            </button>
            <LevelSelect
              value={d}
              onPick={(v) => set(slotPatch(s, i, v))}
              testId={`diff-bot-${i + 1}-select`}
              label={`Level of bot ${i + 1}`}
            />
            <small className="diff-hint">{LEVEL_HINT[d]}</small>
          </div>
        );
      })}
    </div>
  );
}
