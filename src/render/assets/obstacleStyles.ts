/**
 * Per-arena obstacle art direction (presentation only): which modelled pillar draws a permanent
 * blocker, which breakable family draws a soft block, at what size, with which tint and debris.
 * Tile layout, collision and density are simulation data and are never read or changed here.
 *
 * Every entry names its PREFERRED models; whatever is not bundled/loaded is skipped, then the
 * shared bus-park set, then the procedural stand-ins (`props.ts`), so an arena whose own models
 * are missing still renders. Unknown arena ids get `DEFAULT_STYLE`.
 */

export type DebrisKind = 'crate' | 'tyres' | 'sacks' | 'barrier' | 'cartons' | 'kegs' | 'drums' | 'concrete';

export interface ObstacleStyle {
  /** Short art-direction note (docs/tests). */
  note: string;
  /** Preferred pillar models (`prop_pillar_*`), picked per tile by a stable hash. */
  pillars: readonly string[];
  /** Drawn scale of a pillar model (x, y, z). Models are authored at their real size. */
  pillarScale: readonly [number, number, number];
  /** Extra multiply tint on top of the arena look's pillar tint (0xffffff = none). */
  pillarTint: number;
  /** Breakable family: model id -> weight (0 or absent = not used here). */
  soft: Readonly<Record<string, number>>;
  softScale: readonly [number, number, number];
  softTint: number;
  /** Debris palette of a destroyed pillar (crush drops) and fallback for soft blocks. */
  pillarDebris: DebrisKind;
}

/** Bus-park precast pillars and crates/tyres: the shared fallback set (always bundled). */
export const BASE_PILLARS = ['prop_pillar_a', 'prop_pillar_b', 'prop_pillar_c'] as const;
const BASE_SOFT: Record<string, number> = {
  prop_soft_crate: 5,
  prop_soft_crate_b: 4,
  prop_soft_crates: 4,
  prop_soft_tyres: 3,
};

/** Sizes shared by every style unless it says otherwise (models carry their own height). */
const PILLAR_SCALE = [1, 1, 1] as const;
const SOFT_SCALE = [0.97, 1, 0.97] as const;

export const DEFAULT_STYLE: ObstacleStyle = {
  note: 'precast concrete pillars with posters; wooden cargo crates and tyre stacks',
  pillars: BASE_PILLARS,
  pillarScale: PILLAR_SCALE,
  pillarTint: 0xffffff,
  soft: BASE_SOFT,
  softScale: SOFT_SCALE,
  softTint: 0xffffff,
  pillarDebris: 'concrete',
};

const style = (
  o: Partial<ObstacleStyle> & Pick<ObstacleStyle, 'note' | 'pillars' | 'soft'>,
): ObstacleStyle => ({
  ...DEFAULT_STYLE,
  ...o,
});

/** All ten arenas (three exist today; the rest are pre-filled so they render in character on day one). */
export const OBSTACLE_STYLES: Readonly<Record<string, ObstacleStyle>> = {
  danfoBusPark: DEFAULT_STYLE,
  // V2 experimental Mobile Test Arena: Danfo Bus Park's obstacles (same presentation)
  mobileTest13x9: DEFAULT_STYLE,
  mobileTest15x9: DEFAULT_STYLE,
  balogunMarket: style({
    note: 'plastered block stall piers with rusted corrugated collars; produce sacks, sachet water, drink crates',
    pillars: ['prop_pillar_market'],
    soft: { prop_soft_sacks: 6, prop_soft_cartons: 3, prop_soft_kegs: 2, prop_soft_crate_b: 1 },
  }),
  lekkiRoadworks: style({
    note: 'unfinished cast columns with rebar cages and formwork; barricades, tyres, cable drums, site crates',
    pillars: ['prop_pillar_column'],
    soft: { prop_soft_barrier: 5, prop_soft_tyres: 3, prop_soft_cabledrum: 2, prop_soft_crates: 2 },
  }),
  oshodiInterchange: style({
    note: 'massive flyover piers with drainage stains and bill posters; tyres, crates, barricades',
    pillars: ['prop_pillar_pier', 'prop_pillar_a'],
    soft: { prop_soft_tyres: 4, prop_soft_crates: 3, prop_soft_barrier: 2, prop_soft_cartons: 2 },
  }),
  ajegunleBackstreets: style({
    note: 'broken sandcrete compound-wall stubs; crates, sacks, tyres, jerrycans',
    pillars: ['prop_pillar_wallstub'],
    soft: { prop_soft_crate: 3, prop_soft_sacks: 3, prop_soft_tyres: 2, prop_soft_kegs: 2 },
    pillarDebris: 'concrete',
  }),
  lagoonJetty: style({
    note: 'tarred timber piles with mooring bollards; fish crates under nets, drums, jerrycans',
    pillars: ['prop_pillar_bollard'],
    soft: { prop_soft_fishcrates: 5, prop_soft_drums: 2, prop_soft_kegs: 2, prop_soft_crate_b: 1 },
  }),
  surulerePowerYard: style({
    note: 'transformer and meter cabinets on plinths; cable drums, oil drums, barricades',
    pillars: ['prop_pillar_cabinet'],
    soft: { prop_soft_cabledrum: 4, prop_soft_drums: 3, prop_soft_barrier: 2, prop_soft_crates: 1 },
  }),
  yabaAfterDark: style({
    note: 'shuttered night kiosks with neon trims; drink crates, sachet water, cartons',
    pillars: ['prop_pillar_kiosk'],
    soft: { prop_soft_kegs: 4, prop_soft_cartons: 3, prop_soft_crates: 2, prop_soft_crate: 1 },
  }),
  thirdMainland: style({
    note: 'stacked jersey barriers; checkpoint drums, barricades and tyres',
    pillars: ['prop_pillar_jersey'],
    soft: { prop_soft_drums: 4, prop_soft_barrier: 3, prop_soft_tyres: 3 },
  }),
  cityRumble: style({
    note: 'a mix of the city: flyover piers, precast pillars and wall stubs; every breakable family',
    pillars: [
      'prop_pillar_pier',
      'prop_pillar_a',
      'prop_pillar_wallstub',
      'prop_pillar_c',
      'prop_pillar_kiosk',
    ],
    soft: {
      prop_soft_crate: 3,
      prop_soft_crates: 3,
      prop_soft_tyres: 3,
      prop_soft_barrier: 2,
      prop_soft_sacks: 2,
      prop_soft_drums: 2,
      prop_soft_cabledrum: 1,
      prop_soft_cartons: 1,
    },
  }),
};

export function obstacleStyle(arenaId: string | undefined): ObstacleStyle {
  return (arenaId && OBSTACLE_STYLES[arenaId]) || DEFAULT_STYLE;
}

/**
 * The pillar models to draw for a style, given which models are actually loaded: its own (in
 * order), else the shared precast set, else [] (= procedural pillar).
 */
export function resolvePillars(s: ObstacleStyle, loaded: readonly string[]): string[] {
  const have = new Set(loaded);
  const own = s.pillars.filter((id) => have.has(id));
  if (own.length > 0) return own;
  return BASE_PILLARS.filter((id) => have.has(id));
}

/**
 * Weights for the soft variants that can actually be drawn. Variants missing from the style weigh 0;
 * if none of the style's models is available, the base crates/tyres set is used, and if that is
 * missing too every available variant weighs 1 (procedural stand-ins).
 */
export function resolveSoftWeights(s: ObstacleStyle, variants: readonly string[]): Record<string, number> {
  const pick = (w: Readonly<Record<string, number>>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const v of variants) out[v] = w[v] ?? 0;
    return out;
  };
  const total = (w: Record<string, number>): number => Object.values(w).reduce((a, b) => a + b, 0);
  const own = pick(s.soft);
  if (total(own) > 0) return own;
  const base = pick(BASE_SOFT);
  if (total(base) > 0) return base;
  return Object.fromEntries(variants.map((v) => [v, 1]));
}
