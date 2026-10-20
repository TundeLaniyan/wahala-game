/**
 * Pattern data for the procedural Afrobeat / Highlife-inspired loop. All original.
 *
 * Grid: 16 sixteenth-note steps per bar, 4 bars per loop. Key: A minor pentatonic (A C D E G).
 * Velocities are 0..1. Layers fade in with intensity (see LAYER_AT).
 */

export const STEPS_PER_BAR = 16;
export const BARS = 4;
export const BASE_BPM = 104;
export const MAX_BPM = 112;
/** Fraction of a step by which off-beat sixteenths are delayed (light swing). */
export const SWING = 0.14;

/** Intensity at which each optional layer is fully present. Core layers are always on. */
export const LAYER_AT = { conga: 0.3, backbeat: 0.55, bell: 0.8 } as const;

/** Chord roots per bar, in semitones above A1 (55 Hz): Am, Am, Dm, Em feel. */
export const BASS_ROOTS: readonly number[] = [0, 0, 5, 7];
export const BASS_A1 = 55;
/** step, semitones above the bar's root, velocity. */
export const BASS_PATTERN: readonly (readonly [number, number, number])[] = [
  [0, 0, 0.95],
  [3, 0, 0.6],
  [6, 12, 0.45],
  [8, 0, 0.7],
  [10, 7, 0.6],
  [12, 0, 0.7],
  [14, 10, 0.5],
];

export const KICK: readonly (readonly [number, number])[] = [
  [0, 1],
  [6, 0.55],
  [10, 0.85],
];
/** Extra kicks that join with the top layer. */
export const KICK_EXTRA: readonly (readonly [number, number])[] = [
  [4, 0.6],
  [14, 0.5],
];

/** 3-2 son clave. */
export const CLAVE: readonly number[] = [0, 3, 6, 10, 12];

export const SHAKER_VEL: readonly number[] = [
  0.9, 0.3, 0.5, 0.3, 0.7, 0.3, 0.5, 0.35, 0.85, 0.3, 0.5, 0.3, 0.7, 0.3, 0.55, 0.4,
];

/** step, 0 = low "tum", 1 = high "tak", velocity. */
export const CONGA: readonly (readonly [number, 0 | 1, number])[] = [
  [3, 0, 0.8],
  [6, 1, 0.5],
  [7, 1, 0.6],
  [11, 0, 0.8],
  [14, 1, 0.55],
  [15, 1, 0.4],
];

export const BACKBEAT: readonly (readonly [number, number])[] = [
  [4, 0.8],
  [12, 0.9],
  [15, 0.25],
];
export const HAT_OFFBEATS: readonly number[] = [2, 6, 10, 14];
export const BELL: readonly (readonly [number, number])[] = [
  [0, 0],
  [2, 1],
  [5, 0],
  [8, 1],
  [10, 0],
  [13, 1],
];

/** Highlife-style guitar riff: step, semitones above A3 (220 Hz), velocity. 4 bars. */
export const GUITAR_A3 = 220;
export const GUITAR: readonly (readonly (readonly [number, number, number])[])[] = [
  [
    [0, 12, 0.9],
    [2, 10, 0.6],
    [3, 7, 0.7],
    [6, 10, 0.7],
    [8, 7, 0.8],
    [10, 5, 0.6],
    [12, 7, 0.75],
  ],
  [
    [0, 7, 0.85],
    [2, 10, 0.6],
    [4, 12, 0.8],
    [7, 15, 0.65],
    [8, 12, 0.8],
    [10, 10, 0.6],
    [12, 7, 0.7],
    [14, 5, 0.6],
  ],
  [
    [0, 12, 0.9],
    [3, 15, 0.7],
    [4, 12, 0.75],
    [6, 10, 0.65],
    [8, 12, 0.85],
    [11, 10, 0.65],
    [12, 7, 0.75],
  ],
  [
    [0, 10, 0.85],
    [2, 7, 0.6],
    [4, 5, 0.7],
    [6, 7, 0.65],
    [8, 3, 0.8],
    [10, 5, 0.6],
    [12, 7, 0.8],
    [14, 10, 0.6],
  ],
];
