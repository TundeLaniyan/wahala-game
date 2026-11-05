import type { GameState } from '../sim';

/**
 * How the movement controls behave for a match (decisions RR6, RR7). A classic raid is a fixed-screen mission on a
 * grid with cardinal movement only: no analogue stick, no diagonal routes, no corner assistance. Every other match is
 * exactly as before.
 *
 * Integrator hook (the whole wiring, one line where a match starts and where the input is created):
 *   `input.setCardinalOnly(inputModeFor(state).cardinalOnly);`
 * The touch UI picks the cross control from the HUD snapshot's `mode === 'raid'` (ui/TouchControls.tsx).
 */
export interface InputMode {
  /** The input layer sends one cardinal direction at a time and no assisted movement (keyboard, touch, gamepad). */
  cardinalOnly: boolean;
  /** On a touch device the left control is the four-arrow cross instead of the floating stick. */
  cross: boolean;
}

/** Pure: the input mode of a match, from its game kind (the sim's `MatchSettings.game`). */
export function inputModeFor(state: Pick<GameState, 'settings'>): InputMode {
  const raid = state.settings.game === 'raid';
  return { cardinalOnly: raid, cross: raid };
}
