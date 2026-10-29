/**
 * Graphics quality: one ladder of rungs, from the entry-level phone profile up to high. Every rung is a full
 * set of render budgets (resolution, shadows, particles, crowd ...). Manual presets are named anchors on the
 * ladder; Auto (render/perf/adaptive.ts) walks it one rung at a time from measured frame times.
 *
 * Invariant (tests/render/quality-ladder.test.ts): every budget is non-decreasing up the ladder, so a lower
 * rung is never more expensive than the one above it and "step down" always means "cheaper".
 *
 * Two kinds of knobs:
 *  - LIVE (applied to the running match without rebuilding anything): pixel ratio, shadows and their map
 *    size, particle density, crowd and street-life share, ambient emission, animation stride;
 *  - BUILT (decided when the arena is built, so a change applies from the next match): pool sizes, parked
 *    buses, flame lights, antialiasing, the set's content. Live knobs only thin what was built; the
 *    renderer therefore builds from the rung it is on at the start of the match.
 */

/** The coarse tier art and the living environment budget against (traffic, crowds, lights). */
export type QualityLevel = 'veryLow' | 'low' | 'medium' | 'high';

/** What the player can pick by hand (Settings > Graphics); 'auto' is the adaptive mode. */
export type QualityPreset = 'veryLow' | 'low' | 'mediumLow' | 'medium' | 'mediumHigh' | 'high';
export type QualitySetting = QualityPreset | 'auto';

export const QUALITY_PRESETS: readonly QualityPreset[] = [
  'veryLow',
  'low',
  'mediumLow',
  'medium',
  'mediumHigh',
  'high',
];
export const QUALITY_SETTINGS: readonly QualitySetting[] = ['auto', ...QUALITY_PRESETS];

export const QUALITY_LABEL: Readonly<Record<QualitySetting, string>> = {
  auto: 'Auto',
  veryLow: 'Very Low',
  low: 'Low',
  mediumLow: 'Medium-Low',
  medium: 'Medium',
  mediumHigh: 'Medium-High',
  high: 'High',
};

export interface QualityProfile {
  /** Coarse tier for the living environment and art gating. */
  level: QualityLevel;
  /** Position on the ladder (0 = Very Low). */
  rung: number;
  /** Display name of the rung. */
  name: string;
  /** Upper bound for devicePixelRatio (the render scale: the canvas never renders above it). */
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  particleDensity: number;
  /** Spectators built (count) and kept drawn (live share of what was built, see `crowdShare`). */
  crowd: number;
  /** Fraction of the parked buses drawn (each is ~11k triangles). */
  parkedBuses: number;
  /** Chosen when the WebGL context is created: it cannot change during a session. */
  antialias: boolean;
  /** Pooled point lights that let explosions light the surrounding props and players. */
  flameLights: number;
  /** Street-life actors (people animated by skinned rigs) built. */
  streetLife: number;
  /** Atmosphere emission (smoke, exhaust, dust) as a share of full. */
  ambient: number;
  /** Background animation (crowd, street life, ambient traffic) updates every Nth frame. 1 = every frame. */
  animationStride: number;
}

interface Rung extends Omit<QualityProfile, 'rung'> {
  /** The manual preset that lands on this rung, if any. */
  preset?: QualityPreset;
}

/*
 * The ladder. Cost-ordered: pixels first (the dominant cost on phones), then shadows and lights, then the
 * particle / crowd / background budgets. `veryLow` and `low` have no shadow pass and no flame lights at all.
 */
const RUNGS: readonly Rung[] = [
  {
    name: 'Very Low',
    preset: 'veryLow',
    level: 'veryLow',
    maxPixelRatio: 0.6,
    shadows: false,
    shadowMapSize: 256,
    particleDensity: 0.2,
    crowd: 30,
    parkedBuses: 0.2,
    antialias: false,
    flameLights: 0,
    streetLife: 2,
    ambient: 0.15,
    animationStride: 3,
  },
  {
    name: 'Very Low+',
    level: 'veryLow',
    maxPixelRatio: 0.8,
    shadows: false,
    shadowMapSize: 256,
    particleDensity: 0.3,
    crowd: 48,
    parkedBuses: 0.3,
    antialias: false,
    flameLights: 0,
    streetLife: 3,
    ambient: 0.25,
    animationStride: 3,
  },
  {
    name: 'Low',
    preset: 'low',
    level: 'low',
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    particleDensity: 0.4,
    crowd: 70,
    parkedBuses: 0.4,
    antialias: false,
    flameLights: 0,
    streetLife: 4,
    ambient: 0.35,
    animationStride: 2,
  },
  {
    name: 'Low+',
    level: 'low',
    maxPixelRatio: 1.15,
    shadows: false,
    shadowMapSize: 512,
    particleDensity: 0.5,
    crowd: 90,
    parkedBuses: 0.5,
    antialias: false,
    flameLights: 0,
    streetLife: 6,
    ambient: 0.45,
    animationStride: 2,
  },
  {
    name: 'Medium-Low',
    preset: 'mediumLow',
    level: 'medium',
    maxPixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 512,
    particleDensity: 0.6,
    crowd: 105,
    parkedBuses: 0.6,
    antialias: true,
    flameLights: 0,
    streetLife: 8,
    ambient: 0.55,
    animationStride: 2,
  },
  {
    name: 'Medium',
    preset: 'medium',
    level: 'medium',
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    particleDensity: 0.75,
    crowd: 130,
    parkedBuses: 0.75,
    antialias: true,
    flameLights: 1,
    streetLife: 10,
    ambient: 0.7,
    animationStride: 1,
  },
  {
    name: 'Medium-High',
    preset: 'mediumHigh',
    level: 'medium',
    maxPixelRatio: 1.75,
    shadows: true,
    shadowMapSize: 1024,
    particleDensity: 0.88,
    crowd: 180,
    parkedBuses: 0.9,
    antialias: true,
    flameLights: 2,
    streetLife: 13,
    ambient: 0.85,
    animationStride: 1,
  },
  {
    name: 'High',
    preset: 'high',
    level: 'high',
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    particleDensity: 1,
    crowd: 230,
    parkedBuses: 1,
    antialias: true,
    flameLights: 3,
    streetLife: 16,
    ambient: 1,
    animationStride: 1,
  },
];

export const MAX_RUNG = RUNGS.length - 1;

const clampRung = (rung: number): number =>
  Math.max(0, Math.min(MAX_RUNG, Math.round(Number.isFinite(rung) ? rung : 0)));

/** The profile of ladder position `rung` (clamped). */
export function profileFor(rung: number): QualityProfile {
  const r = clampRung(rung);
  const { preset: _preset, ...rest } = RUNGS[r]!;
  return { ...rest, rung: r };
}

/** The ladder position a manual preset lands on. */
export function rungOfPreset(preset: QualityPreset): number {
  const at = RUNGS.findIndex((r) => r.preset === preset);
  return at < 0 ? RUNGS.findIndex((r) => r.preset === 'medium') : at;
}

export const rungName = (rung: number): string => RUNGS[clampRung(rung)]!.name;

/** Whether `value` is a valid saved / URL quality setting. */
export const isQualitySetting = (value: unknown): value is QualitySetting =>
  typeof value === 'string' && (QUALITY_SETTINGS as readonly string[]).includes(value);

/** The ladder position a setting stands for: a preset's anchor, or `fallback` for 'auto'. */
export const rungOfSetting = (setting: QualitySetting, fallback: number): number =>
  setting === 'auto' ? clampRung(fallback) : rungOfPreset(setting);

/** One representative profile per coarse tier (what the environment, art and older tests budget against). */
export const QUALITY: Record<QualityLevel, QualityProfile> = {
  veryLow: profileFor(0),
  low: profileFor(rungOfPreset('low')),
  medium: profileFor(rungOfPreset('medium')),
  high: profileFor(rungOfPreset('high')),
};
