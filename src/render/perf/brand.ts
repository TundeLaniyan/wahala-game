/**
 * FlowFrame Performance (decision FP1): the product name of the adaptive rendering-quality system in this
 * folder (`AdaptiveQuality`, device capability estimate, learned rung). One internal name, one tagline, one
 * description and one mark, defined here and nowhere else, so the technology can be renamed or re-skinned in
 * a single edit and lifted into another game together with this folder. The name is an internal / product
 * name: nothing here claims it is a registered trademark.
 *
 * No dependencies (not even React or the DOM): UI code reads these values and draws the mark itself.
 */
export const FLOWFRAME = {
  /** The full name shown to players. */
  name: 'FlowFrame Performance',
  /** The short form for tight spaces. */
  shortName: 'FlowFrame',
  /** One line under the name on the loading screen. */
  tagline: 'Adaptive graphics',
  /** What it does, in plain words: shown on the loading screen. */
  description:
    "FlowFrame Performance adjusts the game's rendering quality to match your device's available performance, so play stays smooth. Gameplay is never affected.",
  /**
   * The mark: a rounded frame with a flowing wave through it, on a 24 x 24 grid, drawn with a stroke
   * (`currentColor`). Plain SVG path data so any renderer can draw it.
   */
  mark: {
    viewBox: '0 0 24 24',
    paths: [
      'M3.5 6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
      'M5.5 14c2-4 3.6-4 5.5-1.2s3.5 2.6 7.5-3.3',
    ],
  },
} as const;

export type FlowFrameBrand = typeof FLOWFRAME;
