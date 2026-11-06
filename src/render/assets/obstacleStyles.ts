/**
 * Per-arena obstacle art direction (presentation only): which modelled pillar draws a permanent
 * blocker, which breakable family draws a soft block, at what size, with which tint and debris.
 * Tile layout, collision and density are simulation data and are never read or changed here.
 *
 * Every entry names its PREFERRED models; whatever is not bundled/loaded is skipped, then the
 * shared bus-park set, then the procedural stand-ins (`props.ts`), so an arena whose own models
 * are missing still renders. Unknown arena ids get `DEFAULT_STYLE`.
 */

import { RAID_ARENA_IDS, getArena } from '../../sim';

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

/** Oshodi Transport Metropolis: what a crate is in each district (five families in all, as for Ojuelegba). */
const OSHODI_METRO_CLUTTER: Readonly<Record<string, readonly string[]>> = {
  tradingStreets: ['prop_soft_cartons', 'prop_soft_crates', 'prop_soft_cartons', 'prop_soft_tyres'],
  skywalkQuarter: ['prop_soft_cartons', 'prop_soft_crates', 'prop_soft_barrier', 'prop_soft_cartons'],
  interchangePlaza: ['prop_soft_crates', 'prop_soft_cartons', 'prop_soft_tyres', 'prop_soft_crates'],
  expresswayJunction: ['prop_soft_barrier', 'prop_soft_tyres', 'prop_soft_barrier', 'prop_soft_crates'],
  railwayEdge: ['prop_soft_crates', 'prop_soft_barrier', 'prop_soft_crates', 'prop_soft_drums'],
  cappaWorks: ['prop_soft_drums', 'prop_soft_tyres', 'prop_soft_drums', 'prop_soft_crates'],
};
function oshodiMetroSoft(x: number, y: number): string | undefined {
  const a = getArena('rumbleOshodi');
  const h = tileHash(x, y);
  // the authored barriers (blast them for a shortcut) are road barricades and tyre stacks
  if (a.layout[y]?.[x] === 'x') return h % 2 ? 'prop_soft_barrier' : 'prop_soft_tyres';
  const d = a.districts?.find((z) =>
    z.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1),
  );
  const family = d ? OSHODI_METRO_CLUTTER[d.id] : undefined;
  return family ? family[h % family.length] : undefined;
}

/**
 * The researched community arenas (Mushin, Fadeyi, Lagos Island, Lekki, Ebute-Metta): what a crate is in each district
 * (a handful of breakable families per arena), read from the arena's own districts; authored barriers ('x') are
 * tyre stacks and road barricades. Presentation only.
 */
function communitySoft(arenaId: string, clutter: Readonly<Record<string, readonly string[]>>) {
  return (x: number, y: number): string | undefined => {
    const a = getArena(arenaId);
    const h = tileHash(x, y);
    if (a.layout[y]?.[x] === 'x') return h % 2 ? 'prop_soft_barrier' : 'prop_soft_tyres';
    const d = a.districts?.find((z) =>
      z.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1),
    );
    const family = d ? clutter[d.id] : undefined;
    return family ? family[h % family.length] : undefined;
  };
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

/**
 * Classic raids (docs/CLASSIC_GRID.md, decision CG9): the board is a full pillar lattice under the fixed whole-board
 * camera, so a pillar as tall as a person hides most of the one-tile aisle north of it. Raid pillars are drawn lower
 * (still clearly taller than any crate) so every aisle of the maze reads. Presentation only: tiles are sim data.
 */
export const RAID_PILLAR_SCALE = [1, 0.72, 1] as const;
export const RAID_STYLE: ObstacleStyle = {
  ...DEFAULT_STYLE,
  note: 'classic raid: low precast pillars so the aisle behind each one stays readable; cargo crates',
  pillarScale: RAID_PILLAR_SCALE,
};

/** All ten arenas (three exist today; the rest are pre-filled so they render in character on day one). */
export const OBSTACLE_STYLES: Readonly<Record<string, ObstacleStyle>> = {
  ...Object.fromEntries(RAID_ARENA_IDS.map((id) => [id, RAID_STYLE])),
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
  // ---- City Rumble V2 stages
  rumbleLagosIsland: style({
    note: 'permanent cover is drawn whole by the board cover (textile stalls, shopfronts, office towers, heritage blocks, the park wall, trees, the harbour sheds: lagosIslandArt.ts); crush blocks are wall stubs and precast; per district clutter: bales (sacks) and cartons in Balogun, crates and cartons at Idumota, cartons and kegs on Broad Street, crates in the civic square, kegs and tyres in the park, fish crates and drums on the Marina; barriers are tyre stacks and barricades',
    pillars: ['prop_pillar_wallstub', 'prop_pillar_c', 'prop_pillar_a'],
    soft: { prop_soft_sacks: 4, prop_soft_cartons: 4, prop_soft_crates: 2, prop_soft_kegs: 2 },
    softFor: communitySoft('rumbleLagosIsland', {
      balogun: ['prop_soft_sacks', 'prop_soft_cartons', 'prop_soft_sacks', 'prop_soft_crates'],
      idumota: ['prop_soft_crates', 'prop_soft_cartons', 'prop_soft_tyres', 'prop_soft_cartons'],
      broadStreet: ['prop_soft_cartons', 'prop_soft_kegs', 'prop_soft_cartons', 'prop_soft_crates'],
      civicSquare: ['prop_soft_crates', 'prop_soft_cartons', 'prop_soft_crates', 'prop_soft_kegs'],
      onikan: ['prop_soft_kegs', 'prop_soft_tyres', 'prop_soft_crates', 'prop_soft_kegs'],
      marina: ['prop_soft_fishcrates', 'prop_soft_drums', 'prop_soft_fishcrates', 'prop_soft_crates'],
    }),
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
  rumbleOshodi: style({
    note: 'permanent cover is drawn whole by the board cover (terminal, bus bays, skywalk piers, shopfronts, rail portals, station: oshodiMetroCover.ts); crush blocks are wall stubs and precast; per district clutter: cartons and crates in the streets and the skywalk quarter, crates and tyres in the plaza, barricades on the junction, freight crates and cable gear at the rail edge, drums and tyres at the works; barriers are barricades and tyre stacks',
    pillars: ['prop_pillar_wallstub', 'prop_pillar_c', 'prop_pillar_a'],
    soft: {
      prop_soft_cartons: 3,
      prop_soft_crates: 3,
      prop_soft_tyres: 2,
      prop_soft_barrier: 2,
      prop_soft_drums: 1,
    },
    softFor: oshodiMetroSoft,
  }),
  rumbleMushin: style({
    note: 'permanent cover is drawn whole by the board cover (parts stalls, workshops, shopfronts, warehouses, timber yards, the food hall: community/families.ts, mushinArt.ts); crush blocks are wall stubs and precast; per district clutter: tyres and crates in Ladipo, cartons and crates in Ojuwoye, sacks in Daleko, crates and cartons at Idi-Oro, planks (crates) and drums in Timber Row, cartons and kegs in the courtyards; barriers are tyre stacks and barricades',
    pillars: ['prop_pillar_wallstub', 'prop_pillar_c', 'prop_pillar_a'],
    soft: {
      prop_soft_tyres: 3,
      prop_soft_cartons: 3,
      prop_soft_crates: 3,
      prop_soft_sacks: 2,
      prop_soft_kegs: 1,
    },
    softFor: communitySoft('rumbleMushin', {
      ladipo: ['prop_soft_tyres', 'prop_soft_crates', 'prop_soft_tyres', 'prop_soft_cartons'],
      ojuwoye: ['prop_soft_cartons', 'prop_soft_crates', 'prop_soft_cartons', 'prop_soft_sacks'],
      idiOro: ['prop_soft_crates', 'prop_soft_cartons', 'prop_soft_crates', 'prop_soft_kegs'],
      daleko: ['prop_soft_sacks', 'prop_soft_sacks', 'prop_soft_crates', 'prop_soft_cartons'],
      timberRow: ['prop_soft_crates', 'prop_soft_drums', 'prop_soft_crates', 'prop_soft_tyres'],
      courtyards: ['prop_soft_cartons', 'prop_soft_kegs', 'prop_soft_cartons', 'prop_soft_crates'],
    }),
  }),
  rumbleFadeyi: style({
    note: 'permanent cover is drawn whole by the board cover (shop rows, workshops, houses, the BRT shelters, the median barriers, the bank frontage: fadeyiArt.ts); crush blocks are wall stubs and precast; per district clutter: cartons and crates on the shop pavements, barricades and tyres on the highway, kegs and crates in the neighbourhood, drums and tyres at the workshops; barriers are tyre stacks and barricades',
    pillars: ['prop_pillar_jersey', 'prop_pillar_wallstub', 'prop_pillar_c'],
    soft: { prop_soft_cartons: 3, prop_soft_crates: 3, prop_soft_barrier: 2, prop_soft_tyres: 2 },
    softFor: communitySoft('rumbleFadeyi', {
      shopfronts: ['prop_soft_cartons', 'prop_soft_crates', 'prop_soft_cartons', 'prop_soft_kegs'],
      brtCentreline: ['prop_soft_barrier', 'prop_soft_tyres', 'prop_soft_barrier', 'prop_soft_crates'],
      neighbourhood: ['prop_soft_kegs', 'prop_soft_cartons', 'prop_soft_crates', 'prop_soft_cartons'],
      onipanu: ['prop_soft_crates', 'prop_soft_tyres', 'prop_soft_cartons', 'prop_soft_barrier'],
      recreation: ['prop_soft_drums', 'prop_soft_tyres', 'prop_soft_crates', 'prop_soft_drums'],
    }),
  }),
  rumbleEbuteMetta: style({
    note: 'permanent cover is drawn whole by the board cover (the colonial terminus, the heritage house, the station hall, the rail portals, freight wagons, the Oyingbo arcade, timber stacks: ebuteMettaArt.ts); crush blocks are wall stubs and precast; per district clutter: crates and cartons at the terminus, barricades and cable drums at the station, crates and sacks at Oyingbo, cartons and kegs in the mainland streets, drums and cable drums in the rail yard, planks (crates) and tyres on the foreshore; barriers are tyre stacks and barricades',
    pillars: ['prop_pillar_wallstub', 'prop_pillar_c', 'prop_pillar_a'],
    soft: {
      prop_soft_crates: 3,
      prop_soft_cartons: 3,
      prop_soft_cabledrum: 2,
      prop_soft_sacks: 2,
      prop_soft_tyres: 1,
    },
    softFor: communitySoft('rumbleEbuteMetta', {
      heritage: ['prop_soft_crates', 'prop_soft_cartons', 'prop_soft_crates', 'prop_soft_kegs'],
      station: ['prop_soft_barrier', 'prop_soft_cabledrum', 'prop_soft_cartons', 'prop_soft_barrier'],
      oyingbo: ['prop_soft_crates', 'prop_soft_sacks', 'prop_soft_cartons', 'prop_soft_sacks'],
      residential: ['prop_soft_cartons', 'prop_soft_kegs', 'prop_soft_cartons', 'prop_soft_crates'],
      railYard: ['prop_soft_drums', 'prop_soft_cabledrum', 'prop_soft_crates', 'prop_soft_drums'],
      foreshore: ['prop_soft_crates', 'prop_soft_tyres', 'prop_soft_crates', 'prop_soft_drums'],
    }),
  }),
  rumbleLekki: style({
    note: 'permanent cover is drawn whole by the board cover (glass blocks, compound walls, villas, arts-market sheds, the site hoarding, palms, the fuel canopy: lekkiArt.ts); crush blocks are wall stubs and precast; per district clutter: kegs and cartons on the promenade, crates at Ikate, barricades and cable drums at the site, sacks and tyres on the coastal lanes, crates and cartons in the estates, tyres and drums on the expressway; barriers are tyre stacks and barricades',
    pillars: ['prop_pillar_wallstub', 'prop_pillar_c', 'prop_pillar_a'],
    soft: {
      prop_soft_cartons: 3,
      prop_soft_crates: 3,
      prop_soft_kegs: 2,
      prop_soft_barrier: 2,
      prop_soft_tyres: 1,
    },
    softFor: communitySoft('rumbleLekki', {
      promenade: ['prop_soft_kegs', 'prop_soft_cartons', 'prop_soft_kegs', 'prop_soft_crates'],
      ikate: ['prop_soft_crates', 'prop_soft_cartons', 'prop_soft_crates', 'prop_soft_kegs'],
      admiralty: ['prop_soft_barrier', 'prop_soft_cabledrum', 'prop_soft_crates', 'prop_soft_cartons'],
      coastal: ['prop_soft_sacks', 'prop_soft_tyres', 'prop_soft_crates', 'prop_soft_sacks'],
      estates: ['prop_soft_crates', 'prop_soft_cartons', 'prop_soft_crates', 'prop_soft_kegs'],
      gateway: ['prop_soft_tyres', 'prop_soft_drums', 'prop_soft_barrier', 'prop_soft_crates'],
    }),
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
