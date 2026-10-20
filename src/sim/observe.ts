/**
 * What a competitor is allowed to know. Bots receive an Observation instead of the GameState so
 * they cannot see pickups hidden under soft blocks or predict the random number generator.
 * The view shares (does not copy) the live arrays for speed: treat everything as read-only.
 */
import type { GameConfig } from './config';
import type {
  BlastEvent,
  CrowdState,
  CrushState,
  Flame,
  GameState,
  Generator,
  MatchState,
  Pickup,
  Player,
  Vehicle,
} from './types';

export interface Observation {
  readonly selfId: number;
  readonly tick: number;
  readonly config: GameConfig;
  readonly width: number;
  readonly height: number;
  /** Tile kinds. Soft blocks are visible as soft; what hides inside them is not. */
  readonly tiles: readonly number[];
  readonly players: readonly Readonly<Player>[];
  readonly generators: readonly Readonly<Generator>[];
  readonly flames: readonly Readonly<Flame>[];
  readonly blasts: readonly Readonly<BlastEvent>[];
  readonly pickups: readonly Readonly<Pickup>[];
  readonly vehicles: readonly Readonly<Vehicle>[];
  readonly match: Readonly<MatchState>;
  /** Wahala Crush warnings and spectator throws are telegraphed publicly. */
  readonly crush: Readonly<CrushState> | null;
  readonly crowd: Readonly<CrowdState> | null;
  readonly floorHazards: Readonly<GameState['floorHazards']>;
}

export function observe(state: GameState, selfId: number): Observation {
  return {
    selfId,
    tick: state.tick,
    config: state.config,
    width: state.width,
    height: state.height,
    tiles: state.tiles,
    players: state.players,
    generators: state.generators,
    flames: state.flames,
    blasts: state.blasts,
    pickups: state.pickups,
    vehicles: state.vehicles,
    match: state.match,
    crush: state.crush,
    crowd: state.crowd,
    floorHazards: state.floorHazards,
  };
}
