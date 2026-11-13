import type { RaidHud } from '../app/raidHud';
import './FieldGoal.css';

/**
 * A classic raid's "what now" block (decision TN4): the tag (DESTROY / EXIT), the target and its count, the way there
 * (an arrow and the distance in tiles) and up to two notes (enemies, the next wave, a locked door). The first block of the
 * HUD rail, in the same plate as the field mission's objective (`FieldGoal.css`); never over the board. Renders nothing
 * outside a raid or once it is over.
 */
export function RaidGoal({ raid }: { raid: RaidHud | null }) {
  if (!raid) return null;
  return (
    <section
      className={`field-goal raid-goal verb-${raid.verb === 'exit' ? 'escape' : 'goTo'}`}
      data-testid="raid-goal"
      data-verb={raid.verb}
      aria-label="Objective"
    >
      <div className="fg-line">
        <b className="fg-tag" data-testid="raid-goal-tag">
          {raid.tag}
        </b>
        <span className="fg-target" data-testid="raid-goal-target">
          {raid.target}
        </span>
        {raid.step && (
          <span className="fg-step" data-testid="raid-goal-step">
            {raid.step}
          </span>
        )}
      </div>
      {raid.cue && (
        <div
          className="rg-cue"
          data-testid="raid-goal-cue"
          data-tiles={raid.cue.tiles}
          aria-label={`${raid.cue.word}, ${raid.cue.tiles} tiles`}
        >
          {raid.cue.text}
        </div>
      )}
      {raid.notes.length > 0 && (
        <div className="fg-notes" data-testid="raid-goal-notes">
          {raid.notes.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
      )}
    </section>
  );
}
