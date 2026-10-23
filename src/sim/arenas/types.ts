import type { DeepPartial, GameConfig } from '../config';
import type { Dir, MatchMode, StageHazardStyle, TilePos } from '../types';

export type ArenaKind = 'standard' | 'rumble';

/**
 * When a scheduled stage hazard fires. All times are seconds of play; `everySec` is the inclusive
 * random range between two events (drawn from the match RNG, so replays are identical).
 */
export interface HazardSchedule {
  firstAtSec: number;
  everySec: [number, number];
  /** Telegraph before the hazard becomes real (lethal kinds are clamped up to `config.stage.minLethalWarnTicks`). */
  warnSec: number;
}

/**
 * A stage hazard the arena brings. Stage hazards are part of the arena's identity and cannot be
 * switched off from the menus. Tiles are given as [x, y] pairs.
 *
 * - `sweep`: a vehicle drives along one of `routes` (chosen per event): lethal to anyone on its tile,
 *   sets off grounded generators it reaches, stops at concrete or a soft block. Routes run along road
 *   tiles (`=` in the layout), which never get soft blocks.
 * - `strike`: one of `zones` (or, with `targetPlayers`, the tile of a randomly chosen player that has
 *   a free neighbour to step to) becomes lethal for `activeSec` after the warning.
 * - `push`: everyone standing in one of `zones` is slid one tile in its direction (non-lethal; the
 *   slide stops at anything a player could not walk into). `douse` turns generators in the zone into
 *   duds (disabled: they still explode from flame or vehicles).
 * - `drop`: `count` new soft blocks (fallen goods) land on random open tiles away from every player.
 * - `teleport`: always present: connected trapdoor pairs. A step that starts onto one end carries the
 *   player to the other end when the step completes, if that end is free and not burning.
 */
export type StageHazardDef =
  | ({
      kind: 'sweep';
      style: StageHazardStyle;
      routes: [number, number][][];
      /** Ticks per tile while driving. */
      stepTicks: number;
    } & HazardSchedule)
  | ({
      kind: 'strike';
      style: StageHazardStyle;
      zones: [number, number][][];
      targetPlayers?: boolean;
      activeSec: number;
    } & HazardSchedule)
  | ({
      kind: 'push';
      style: StageHazardStyle;
      zones: { tiles: [number, number][]; dir: Dir }[];
      douse?: boolean;
    } & HazardSchedule)
  | ({ kind: 'drop'; style: StageHazardStyle; count: number } & HazardSchedule)
  | { kind: 'teleport'; style: StageHazardStyle; pairs: [[number, number], [number, number]][] };

/** Menu / tutorial text for an arena. Presentation data only. */
export interface ArenaInfo {
  /** One line on the arena card. */
  tagline: string;
  /** Lighting / time of day, e.g. "Night - industrial floodlights". */
  lighting: string;
  /** Short player-facing description of each stage hazard (empty = no ordinary hazards). */
  hazards: string[];
  /** A special rule every player must be told about before the match (shown on the card and at the countdown). */
  ruleWarning?: string;
}

export interface ArenaDef {
  id: string;
  name: string;
  /** `standard` = the 2-4 player whole-arena game; `rumble` = the large City Rumble board. */
  kind: ArenaKind;
  /**
   * Rows of the layout: '#' = indestructible concrete, '=' = road (open floor that never gets a soft
   * block), anything else = open floor.
   */
  layout: string[];
  /** Spawn tiles in slot order. */
  spawns: TilePos[];
  /** Tiles kept clear of soft blocks around each spawn (offsets pointing towards the arena centre). */
  spawnClearance: TilePos[];
  mirrorSoftBlocks: boolean;
  maxPlayers: number;
  /**
   * Floor traps present for the whole match ('o' pothole, '~' oil in this grid). Part of the stage:
   * no menu switch turns them off.
   */
  floorTraps?: string[];
  /**
   * MANDATORY endgame trap waves (same format). They are part of every match and cannot be switched
   * off: wave n becomes live at `config.hazards.endgameWaveRemainingTicks[n]` time left.
   */
  endgameTraps: string[][];
  /** The arena's own environmental hazards. */
  stageHazards: StageHazardDef[];
  /** Arena-specific rule and balance overrides (merged over the defaults, under any test override). */
  config?: DeepPartial<GameConfig>;
  /** A rules mode the arena always uses (City Rumble always closes in). */
  forcedMode?: MatchMode;
  info: ArenaInfo;
}
