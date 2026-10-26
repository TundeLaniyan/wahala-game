/**
 * The presentation contract of a LIVING STAGE ENVIRONMENT (City Rumble Evolution, workstream E).
 *
 * An arena declares what lives around its board as DATA (`ArenaArt.env`): ambient traffic on authored
 * routes, protected crowd zones, how the people react to what the simulation does, a few lighting and
 * audio identity hooks, occlusion hints and a per-quality performance budget. The renderer builds it
 * generically (`LivingEnvironment`), so a new Lagos stage adds one data file and nothing else.
 *
 * Hard rules (checked by `validateEnvironment`, tests/render/env-plan.test.ts):
 *  - presentation only: nothing here is a simulation entity. Ambient vehicles and people are never
 *    hit, never block, never credit a kill; they react to SimEvents and never feed anything back;
 *  - nothing is ever drawn on or over the playable board: routes and crowd zones stay outside the board
 *    rectangle plus a margin (elevated decks included: they stand north of the north edge);
 *  - the camera side (south) stays low: tall vehicles and every person keep out of the strip directly
 *    south of the board (`occlusion.lowSouth`);
 *  - ambient traffic is visually SEPARATE from attack vehicles and stage-hazard vehicles: it never
 *    shares their materials, never wears a warning light or telegraph colour, and sits in a muted grade;
 *  - people are visually distinct from fighters: no team colours, outfits, markers or name tags, muted
 *    palette, a smaller scale.
 *
 * COORDINATES: tile units. A point is `[tx, ty]` with the board covering `[0, cols] x [0, rows]`
 * (tile i spans `[i, i + 1)`, so a tile centre is `i + 0.5`); x grows east, y grows SOUTH (towards the
 * fixed camera). World position = `(tx - cols / 2, ty - rows / 2)`. Express everything relative to
 * `cols` / `rows` (use a factory) so the same description survives a board resize.
 */
import type { QualityLevel } from '../quality';

export type TilePoint = readonly [tx: number, ty: number];

/** An axis-aligned rectangle in tile units (`x0 < x1`, `y0 < y1`). */
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BoardSize {
  cols: number;
  rows: number;
}

// --------------------------------------------------------------------------------------------- traffic

/**
 * Ambient vehicle kinds. `danfo`, `keke`, `okada` use the cast's vehicle models, `car` the taxi model;
 * `bus` and `truck` are the Danfo model stretched (longer, taller) and graded duller. A kind without a
 * loaded model falls back to the procedural vehicle of `render/assets/vehicles.ts`.
 */
export type AmbientVehicleKind = 'danfo' | 'bus' | 'keke' | 'okada' | 'car' | 'truck';

export interface TrafficRouteDef {
  /** Unique within the environment (a stable seed for its vehicles). */
  id: string;
  /** Vehicle mix, cycled along the route in this order. */
  kinds: readonly AmbientVehicleKind[];
  /** Polyline in tile units. Vehicles follow it and turn smoothly at the corners. */
  path: readonly TilePoint[];
  /** How many vehicles are on the route at full quality. */
  count: number;
  /** Cruising speed, tiles per second (same for every vehicle on a route, so gaps never close). */
  speed: number;
  /** Minimum bumper-to-bumper gap along the path, tiles. Fewer vehicles are used if the path is short. */
  spacing: number;
  /**
   * Metres above street level (a flyover deck is about 6.6). Elevated routes still have to stand
   * entirely north of the board.
   */
  elevation?: number;
  /** Higher survives the per-quality budget longer (default 1). */
  priority?: number;
  /** Lowest quality tier that draws the route (default 'low'). */
  minQuality?: QualityLevel;
  /** Tiles over which a vehicle shrinks in / out at the two ends of the path (default 1.5; 0 = none). */
  fade?: number;
}

// ---------------------------------------------------------------------------------------------- crowds

export type CrowdMood =
  | 'waiting' // standing at a stop, looking about, shifting weight
  | 'trading' // pairs talking, handing goods over, touts calling
  | 'watching' // facing the board, cheering when it gets loud
  | 'working'; // labourers digging, carrying, pacing

export interface CrowdZoneDef {
  id: string;
  /** Protected off-board area. People never leave it, whatever they react to. */
  rect: TileRect;
  /** Metres above street level (people standing on a deck or platform). */
  elevation?: number;
  count: number;
  mood: CrowdMood;
  /** What they face: 'board' (default, towards the board centre) or a yaw in radians (0 = south). */
  facing?: 'board' | number;
  /** Own reaction rules, merged over the environment's `reactions` (a kind given here replaces that kind). */
  reacts?: ReactionRules;
  /** Wear hi-vis coveralls (work crews). */
  hiVis?: boolean;
  /** Higher survives the per-quality budget longer (default 1). */
  priority?: number;
  /** Lowest quality tier that draws the zone (default 'low'). */
  minQuality?: QualityLevel;
}

/** How a person visibly reacts. */
export type NpcReaction =
  | 'duck' // crouch, arms over the head
  | 'flinch' // flinch back
  | 'scatter' // a few quick steps away from it (never out of the zone), then back
  | 'cheer' // arms up
  | 'look'; // turn to look

export interface ReactionRule {
  reaction: NpcReaction;
  /** Reacts when the cause is within this many tiles of the zone (distance to its rectangle). */
  radius: number;
  /** Share of the zone's people that react (each person decides once per cause), 0..1. */
  chance: number;
}

/** Reactions are driven by SimEvents only: explosions, eliminations and stage warnings. */
export interface ReactionRules {
  /** `generatorExploded`; `minRange` = smallest blast radius that counts as "big". */
  blast?: ReactionRule & { minRange?: number };
  /** `playerEliminated` anywhere on the board. */
  elimination?: ReactionRule;
  /** `stageWarning` / `stageStarted` of a lethal hazard (optionally only some styles). */
  stage?: ReactionRule & { styles?: readonly string[] };
}

// ---------------------------------------------------------------------------------- lights, audio, hints

export type LightFlicker = 'steady' | 'fluorescent' | 'sodium' | 'neon';

/**
 * A practical light (lamp, tube, bulb, worklight): a soft additive glow facing the camera plus an
 * optional pool of light on the ground. No real scene lights: a handful of glow quads in one draw call.
 */
export interface LightPocket {
  at: TilePoint;
  /** Metres above street level. */
  height: number;
  /** 0xRRGGBB. */
  color: number;
  /** Glow size, metres. */
  size: number;
  /** 0..1.5 brightness. */
  strength: number;
  flicker?: LightFlicker;
  /** Radius of the pool of light on the street, metres (0 / absent = none). */
  pool?: number;
  /** Lowest quality tier that draws it (default 'low'). */
  minQuality?: QualityLevel;
}

/**
 * Names of EXISTING synthesised sounds (`src/audio/recipes`) that give the stage its sonic identity.
 * Data only: the audio engine decides whether and how to play them; nothing here generates sound, and
 * names are checked against the recipe registry in tests/living-env.test.ts.
 */
export interface AudioIdentity {
  /** Ambience loops that suit the place (e.g. 'buspark_loop'). */
  beds: readonly string[];
  /** One-shots that match the crowd reactions (e.g. 'crowd_gasp' for an elimination). */
  reactions?: readonly { on: 'blast' | 'elimination' | 'stage'; sound: string }[];
}

export interface OcclusionHints {
  /** Depth (tiles) of the low strip directly south of the board (default 2.5). */
  lowSouth?: number;
  /** Tallest thing allowed in that strip, metres (default 1.0). */
  maxHeightSouth?: number;
  /** Regions the art occupies (stalls, a kiosk ...): ambient traffic and people keep clear of them. */
  keepClear?: readonly TileRect[];
  /**
   * Regions where an overhead mass (a flyover deck, a roof) fades or cuts away so the board stays readable.
   * Declared for the art and for tests; ambient content never stands in them on the ground side of the board.
   */
  cutaway?: readonly TileRect[];
}

/**
 * Hazard-safety notes the arena records next to its environment (the research asks each arena to). Data for
 * review, floor art and tests: the simulation does not read them (the stage hazards in `ArenaDef` are the rules).
 */
export interface SafetyNotes {
  /** Marked places beside a hazard that are always safe (pavement recesses beside a departure lane). */
  safePockets?: readonly { style: string; rect: TileRect; note?: string }[];
  /** Hazard styles that must never be live together, or with a closing city: documents what the sim guards. */
  exclusions?: readonly { style: string; notWith: readonly string[] }[];
}

// ------------------------------------------------------------------------------------------ budget

/** Caps for one quality tier. A stage may lower them, never raise them (`budgetFor`). */
export interface EnvBudget {
  /** Ambient vehicles on screen. */
  vehicles: number;
  /** Distinct vehicle models (each model costs about 8 draw calls: one per material). */
  vehicleModels: number;
  /** People in total (animated rigs + instanced figures). */
  people: number;
  /** Animated skinned rigs among them (each costs about 5 draw calls and an animation mixer). */
  rigs: number;
  /** Practical light glows. */
  lights: number;
}

export const ENV_BUDGET: Readonly<Record<QualityLevel, EnvBudget>> = {
  low: { vehicles: 4, vehicleModels: 1, people: 14, rigs: 0, lights: 4 },
  medium: { vehicles: 10, vehicleModels: 3, people: 36, rigs: 5, lights: 8 },
  high: { vehicles: 18, vehicleModels: 4, people: 70, rigs: 10, lights: 14 },
};

/** Draw calls the environment is planned to add at most (medium target from the brief: about 60). */
export const ENV_DRAW_CALL_TARGET: Readonly<Record<QualityLevel, number>> = {
  low: 24,
  medium: 60,
  high: 90,
};

// ------------------------------------------------------------------------------------ the contract

export interface StageEnvironment {
  /** For logs and tests. */
  id: string;
  /** Seed for placement and timing (default 1). Render time does the rest: no randomness at runtime. */
  seed?: number;
  traffic?: readonly TrafficRouteDef[];
  crowds?: readonly CrowdZoneDef[];
  /** Default reaction rules for zones that have none of their own. */
  reactions?: ReactionRules;
  lights?: readonly LightPocket[];
  audio?: AudioIdentity;
  occlusion?: OcclusionHints;
  safety?: SafetyNotes;
  /** Per-tier overrides that LOWER the global caps (never raise them). */
  budget?: Partial<Record<QualityLevel, Partial<EnvBudget>>>;
}

/** A stage environment, or a factory that derives it from the board size (the usual form). */
export type StageEnvironmentSource = StageEnvironment | ((board: BoardSize) => StageEnvironment);
