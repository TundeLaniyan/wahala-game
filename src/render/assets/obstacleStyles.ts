/**
 * Per-arena obstacle art direction (presentation only): which modelled pillar draws a permanent
 * blocker, which breakable family draws a soft block, at what size, with which tint and debris.
 * Tile layout, collision and density are simulation data and are never read or changed here.
 *
 * Every entry names its PREFERRED models; whatever is not bundled/loaded is skipped, then the
 * shared bus-park set, then the procedural stand-ins (`props.ts`), so an arena whose own models
 * are missing still renders. Unknown arena ids get `DEFAULT_STYLE`.
 */

import { getArena } from '../../sim';

export type DebrisKind = 'crate' | 'tyres' | 'sacks' | 'barrier' | 'cartons' | 'kegs' | 'drums' | 'concrete';

/**
 * A rectangle of tiles (inclusive) that draws its own pillar family, e.g. the flyover piers under the
 * Ojuelegba bridge while the streets either side draw building corners. Presentation only.
 */
export interface PillarZone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pillars: readonly string[];
}

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
  /** Optional regions with their own pillar models (first match wins; `pillars` everywhere else). */
  pillarZones?: readonly PillarZone[];
  /**
   * Optional per-tile breakable family (model id, or undefined = the weighted pick): e.g. an authored
   * barrier drawn as a tyre stack, or each district of a multi-district stage with its own clutter.
   */
  softFor?: (x: number, y: number) => string | undefined;
}

/** The four mirror images of a zone on a cols x rows board (the V2 Rumble stages are 4-fold symmetric). */
function mirrorZone(z: PillarZone, cols: number, rows: number): PillarZone[] {
  const fx = (x: number): number => cols - 1 - x;
  const fy = (y: number): number => rows - 1 - y;
  return [
    z,
    { ...z, x0: fx(z.x1), x1: fx(z.x0) },
    { ...z, y0: fy(z.y1), y1: fy(z.y0) },
    { ...z, x0: fx(z.x1), x1: fx(z.x0), y0: fy(z.y1), y1: fy(z.y0) },
  ];
}
const zones4 = (cols: number, rows: number, zs: PillarZone[]): PillarZone[] =>
  zs.flatMap((z) => mirrorZone(z, cols, rows));

/** Stable per-tile hash for the district clutter pick (decorrelated neighbours). */
function tileHash(x: number, y: number): number {
  let h = Math.imul(x + 3, 0x9e3779b1) ^ Math.imul(y + 11, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return (h ^ (h >>> 13)) >>> 0;
}

/** Ojuelegba: what a crate is in each district (presentation only; the districts are sim data). */
const OJUELEGBA_CLUTTER: Readonly<Record<string, readonly string[]>> = {
  // five breakable families in all (each family is its own instanced draw: kept few for the draw-call budget)
  westApproach: ['prop_soft_tyres', 'prop_soft_barrier', 'prop_soft_tyres', 'prop_soft_crates'],
  pierCourt: ['prop_soft_cartons', 'prop_soft_tyres', 'prop_soft_cartons', 'prop_soft_crates'],
  danfoPark: ['prop_soft_tyres', 'prop_soft_crates', 'prop_soft_cartons', 'prop_soft_tyres'],
  shopfrontLane: ['prop_soft_cartons', 'prop_soft_crates', 'prop_soft_cartons', 'prop_soft_barrier'],
  serviceLoop: ['prop_soft_drums', 'prop_soft_tyres', 'prop_soft_drums', 'prop_soft_crates'],
};
let ojuelegbaLayout: readonly string[] | null = null;
function ojuelegbaSoft(x: number, y: number): string | undefined {
  const a = getArena('rumbleOjuelegba');
  ojuelegbaLayout ??= a.layout;
  const h = tileHash(x, y);
  // the authored barriers (blast them for a shortcut) are tyre stacks and road barricades
  if (ojuelegbaLayout[y]?.[x] === 'x') return h % 2 ? 'prop_soft_tyres' : 'prop_soft_barrier';
  const d = a.districts?.find((z) =>
    z.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1),
  );
  const family = d ? OJUELEGBA_CLUTTER[d.id] : undefined;
  return family ? family[h % family.length] : undefined;
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
  // ---- City Rumble V2 stages
  rumbleOshodi: style({
    note: 'flyover piers under the expressway; precast bus-park pillars in the blocks; tyres, crates, barricades',
    pillars: ['prop_pillar_a', 'prop_pillar_b', 'prop_pillar_c'],
    pillarZones: [{ x0: 0, y0: 12, x1: 40, y1: 18, pillars: ['prop_pillar_pier'] }],
    soft: {
      prop_soft_tyres: 4,
      prop_soft_crates: 3,
      prop_soft_barrier: 2,
      prop_soft_cartons: 2,
      prop_soft_kegs: 1,
    },
  }),
  rumbleLagosIsland: style({
    note: 'plastered lock-up stall piers along the aisles, poster-covered precast posts in the plazas; textile bales (sacks), cartons, kegs',
    pillars: ['prop_pillar_market'],
    pillarZones: zones4(41, 31, [
      { x0: 7, y0: 8, x1: 7, y1: 8, pillars: ['prop_pillar_a'] },
      { x0: 17, y0: 13, x1: 17, y1: 13, pillars: ['prop_pillar_c'] },
      { x0: 0, y0: 1, x1: 20, y1: 1, pillars: ['prop_pillar_wallstub', 'prop_pillar_b'] },
    ]),
    soft: { prop_soft_sacks: 6, prop_soft_cartons: 4, prop_soft_kegs: 2, prop_soft_crate_b: 1 },
  }),
  rumbleOjuelegba: style({
    note: 'permanent cover is drawn whole by the board cover (piers, Danfos, shops: ojuelegbaCover.ts); crush blocks are wall stubs and precast; per district clutter: tyres and barricades on the approach, cartons and kegs under the bridge, tyres and crates in the park, sacks and cartons in the shop lane, drums and cable drums in the service yard; barriers are tyre stacks and barricades',
    pillars: ['prop_pillar_wallstub', 'prop_pillar_c', 'prop_pillar_a'],
    soft: {
      prop_soft_tyres: 3,
      prop_soft_cartons: 3,
      prop_soft_kegs: 2,
      prop_soft_crates: 2,
      prop_soft_barrier: 1,
    },
    softFor: ojuelegbaSoft,
  }),
  rumbleApapa: style({
    note: 'stacked shipping containers on yard pads, transit sheds of precast panels; drums, crates, cable drums',
    pillars: ['prop_pillar_container_a', 'prop_pillar_container_b'],
    pillarZones: zones4(45, 31, [
      { x0: 1, y0: 3, x1: 9, y1: 4, pillars: ['prop_pillar_b', 'prop_pillar_a'] },
    ]),
    soft: {
      prop_soft_drums: 4,
      prop_soft_crates: 3,
      prop_soft_crate: 2,
      prop_soft_cabledrum: 2,
      prop_soft_barrier: 1,
    },
    pillarDebris: 'drums',
  }),
  rumbleLekkiNight: style({
    note: 'scaffold bays round the half-built frames; cast columns with rebar in the dig; barricades, cable drums, tyres',
    pillars: ['prop_pillar_column'],
    pillarZones: zones4(41, 31, [{ x0: 0, y0: 0, x1: 10, y1: 9, pillars: ['prop_pillar_scaffold'] }]),
    soft: { prop_soft_barrier: 4, prop_soft_cabledrum: 3, prop_soft_tyres: 2, prop_soft_crates: 2 },
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
  const all = [...new Set([...s.pillars, ...(s.pillarZones ?? []).flatMap((z) => z.pillars)])];
  const own = all.filter((id) => have.has(id));
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

/**
 * Which of the `resolved` pillar models (from `resolvePillars`) draws tile (x, y): its zone's family
 * if one covers the tile, else the style's own, picked by a stable hash. Falls back to any resolved
 * model when the preferred family is not loaded.
 */
export function pillarIndexFor(s: ObstacleStyle, resolved: readonly string[], x: number, y: number): number {
  // the original hash (kept for the zone-less standard arenas so their approved look never reshuffles) is always
  // even, so a two-model family would only ever draw its first model: zoned styles use a mixing hash instead
  let h = x * 5 + y * 3 + ((x ^ y) & 3);
  if (s.pillarZones) {
    const m = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
    h = (Math.imul(m ^ (m >>> 13), 1274126177) >>> 0) >>> 3;
  }
  if (resolved.length === 0) return 0;
  const zone = s.pillarZones?.find((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);
  const pool = (zone?.pillars ?? s.pillars).filter((id) => resolved.includes(id));
  if (pool.length === 0) return h % resolved.length;
  return resolved.indexOf(pool[h % pool.length]!);
}
