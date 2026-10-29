/**
 * Bot difficulty as one slider over the seven levels instead of seven separate boxes: the whole range from
 * "Very easy" to "Extremely hard" is visible at once, the level in force is named and explained in plain words
 * right above the thumb, and the native range input keeps touch drag / tap, keyboard arrows, gamepad D-pad
 * (focusNav steps ranges) and screen readers (value text) working.
 */
import { DIFFICULTIES } from '../../sim';
import type { Difficulty } from '../../sim';
import { commands } from '../../app/session';
import { LEVEL_COUNT, LEVEL_HINT, LEVEL_LABEL, SCALE_ENDS, levelAt, levelIndex } from '../difficultyPicker';

export function DifficultySlider(props: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
  /** Accessible name of the slider. */
  label: string;
  testId: string;
  /** Visible lead-in before the level name ("All bots", "Bot 2" ...). */
  caption?: string;
  /** Rows of a per-bot list: no description line and no scale words. */
  compact?: boolean;
}) {
  const at = levelIndex(props.value);
  const p = at / (LEVEL_COUNT - 1);
  return (
    <div className={`mn-diff${props.compact ? ' compact' : ''}`} data-level={props.value}>
      <div className="mn-diff-head">
        {props.caption && <small>{props.caption}</small>}
        <b data-testid={`${props.testId}-name`}>{LEVEL_LABEL[props.value]}</b>
        <span className="mn-diff-pos" aria-hidden>
          {at + 1} / {LEVEL_COUNT}
        </span>
      </div>
      {!props.compact && (
        <p className="mn-diff-hint" data-testid={`${props.testId}-hint`}>
          {LEVEL_HINT[props.value]}
        </p>
      )}
      <div className="mn-diff-track" style={{ ['--p' as string]: p }}>
        <input
          type="range"
          min={0}
          max={LEVEL_COUNT - 1}
          step={1}
          value={at}
          aria-label={props.label}
          aria-valuetext={`${LEVEL_LABEL[props.value]}: ${LEVEL_HINT[props.value]}`}
          data-testid={props.testId}
          onChange={(e) => {
            const next = levelAt(Number(e.target.value));
            if (next === props.value) return;
            commands.click();
            props.onChange(next);
          }}
        />
        <div className="mn-diff-ticks" aria-hidden>
          {DIFFICULTIES.map((d, k) => (
            <i key={d} className={k < at ? 'lit' : k === at ? 'cur' : ''} />
          ))}
        </div>
      </div>
      {!props.compact && (
        <div className="mn-diff-ends" aria-hidden>
          <span>{SCALE_ENDS.low}</span>
          <span>{SCALE_ENDS.high}</span>
        </div>
      )}
    </div>
  );
}
