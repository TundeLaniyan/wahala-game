import type { Group } from 'three';
import type { Layout } from '../coords';

/** Debris palette used when a destructible block breaks. */
export type DebrisKind =
  | 'crate'
  | 'tyres'
  | 'sacks'
  | 'barrier'
  | 'cartons'
  | 'kegs'
  | 'concrete'
  | 'fabric'
  | 'produce'
  | 'buckets'
  | 'baskets';

/** One placement of a modelled asset around the arena (world units, yaw in radians). */
export interface Placement {
  x: number;
  y?: number;
  z: number;
  ry: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

/** What a theme's scenery builder gets to work with. */
export interface DressContext {
  layout: Layout;
  /** Root of the backdrop: instanced meshes go here. */
  root: Group;
  /** Static scenery that is baked into a few merged meshes at the end. */
  statics: Group;
  /** Deterministic art random numbers. */
  rng: () => number;
  /** Fraction of the heavy scenery (parked buses, stalls) to draw at this quality level. */
  density: number;
  /** Instances every mesh of a loaded asset at the placements (no-op when the asset is missing). */
  instance(id: string, placements: Placement[]): void;
  /** Registers something to dispose with the backdrop. */
  track(d: { dispose(): void }): void;
}

/**
 * Everything that makes an arena look like itself. Gameplay (layout, spawns, hazards) lives in the
 * simulation's ArenaDef; the theme only decides how those tiles and their surroundings are drawn.
 */
export interface ArenaTheme {
  id: string;
  /** Sky / fog / clear colour. */
  sky: number;
  fog: [near: number, far: number];
  /** Floor texture set in `src/assets/textures/<floor>_{albedo,normal,orm}.jpg`. */
  floor: string;
  /** Colour of the procedural floor used if the texture set is missing. */
  floorFallback: string;
  /** Multiplier on the floor texture colour (calms a saturated floor under the warm grade). */
  floorTint: number;
  /** Ground outside the arena and the raised slab under it. */
  ground: number;
  slab: number;
  /** Permanent obstacle models for isolated tiles (variety by tile hash); procedural pillar if none load. */
  hardIsolated: string[];
  /** Model for permanent tiles with a permanent neighbour in a straight line (tiles along local X). */
  hardJoined: string | null;
  /** Vertical scale for the joined model, so counters stand clearly above the destructible goods. */
  hardJoinedHeight: number;
  /** Destructible block models and their art-direction weights (only loaded ones are used). */
  soft: Record<string, number>;
  debris(variant: string): DebrisKind;
  /** Perimeter wall segments (cycled), corner/pilaster post and optional spectator platform. */
  walls: string[];
  wallCorner: string;
  platform: string | null;
  /** Bunting colours strung over the back crowd, and the entrance board. */
  bunting: number[];
  sign: { text: string; color: string; background: string };
  /** Theme-specific scenery around the walls (buses, stalls, buildings...). */
  dress(ctx: DressContext): void;
}
