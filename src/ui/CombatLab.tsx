/**
 * The City Rumble COMBAT TEST LAB in the UI (docs/COMBAT_TEST_LAB.md): a small level chip in the HUD's right column
 * (beside the board, never over it) and the level picker in the pause menu of a local City Rumble. Temporary: remove
 * this file, its two call sites (Hud.tsx, Overlays.tsx) and `commands.setCombatLab` when the founder has picked a level.
 */
import { COMBAT_LAB_PRESETS } from '../sim';
import type { CombatLabLevel } from '../sim';
import { commands } from '../app/session';
import type { CombatLabHud } from '../app/hud';
import { useGameStore } from '../app/store';
import './combatLab.css';

const LEVELS: readonly CombatLabLevel[] = [1, 2, 3, 4];

/** The active level, small, under the minimap. Nothing when the lab is off. */
export function CombatLabChip({ lab }: { lab: CombatLabHud | null }) {
  if (!lab) return null;
  return (
    <div className="lab-chip" data-testid="combat-lab-chip" data-level={lab.level} aria-live="polite">
      <b>LAB {lab.level}</b> {lab.name}
    </div>
  );
}

/** The pause menu's level picker (local City Rumble only). Switching applies at once, the match is not restarted. */
export function CombatLabPauseSection({ lab }: { lab: CombatLabHud | null }) {
  const selected = useGameStore((st) => st.combatLab);
  if (!commands.combatLabAvailable()) return null;
  const level = selected; // the store follows every switch at once (the HUD snapshot may wait for the next frame)
  const st = lab?.stats ?? null;
  return (
    <section className="lab-pause" data-testid="combat-lab" aria-label="Combat test lab">
      <header>
        <small className="mn-kicker">Combat test lab</small>
        <p>Pick a punch level, then Resume. It changes this match at once.</p>
      </header>
      <div className="lab-levels" role="radiogroup" aria-label="Punch level">
        <button
          type="button"
          role="radio"
          aria-checked={level === 0}
          className={`lab-level${level === 0 ? ' on' : ''}`}
          data-testid="combat-lab-0"
          onClick={() => commands.setCombatLab(0)}
        >
          <b>Off</b>
          <small>Today’s rules</small>
        </button>
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={level === l}
            className={`lab-level${level === l ? ' on' : ''}`}
            data-testid={`combat-lab-${l}`}
            title={COMBAT_LAB_PRESETS[l].summary}
            onClick={() => commands.setCombatLab(l)}
          >
            <b>
              {l} · {COMBAT_LAB_PRESETS[l].name}
            </b>
            <small>{COMBAT_LAB_PRESETS[l].summary}</small>
          </button>
        ))}
      </div>
      {st && (
        <p className="lab-stats" data-testid="combat-lab-stats">
          Your B presses {st.presses} · punches {st.started} · air swings {st.airSwings} · hits {st.hits} ·
          misses {st.whiffs} · kept {st.kept} · dropped {st.dropped}
        </p>
      )}
    </section>
  );
}
