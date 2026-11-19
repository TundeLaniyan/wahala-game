import type { RaidHud } from '../app/raidHud';
import { RouteCueLine } from './FieldGoal';
import { GlyphIcon } from './GlyphIcon';
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
        <GlyphIcon id={raid.verb === 'exit' ? 'exit' : 'cargo'} className="fg-glyph" size={16} />
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
      <RouteCueLine cue={raid.cue} testId="raid-goal-cue" />
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
