/** Public API of the simulation. Outer layers import from here, never from systems/ directly. */
export { createGame, createPlayer, DEFAULT_SETTINGS, MAX_PLAYERS, MIN_PLAYERS } from './state';
export { tick } from './tick';
export { DEFAULT_CONFIG, TICK_RATE, mergeConfig, ticks } from './config';
export type { DeepPartial, GameConfig, VehicleSpec } from './config';
export * from './types';
export {
  DIRS,
  DIR_VEC,
  OPPOSITE,
  inBounds,
  manhattan,
  stepPos,
  tileAt,
  tileIndex,
  tileX,
  tileY,
} from './grid';
export { ARENAS, DEFAULT_ARENA_ID, getArena } from './arenas';
export type { ArenaDef } from './arenas';
export { CHARACTERS, CHARACTER_IDS } from './data/characters';
export type { CharacterDef } from './data/characters';
export { PICKUP_DEFS } from './data/pickups';
export { VEHICLE_DEFS } from './data/vehicles';
export { createRng, nextFloat, nextInt, pick, shuffle } from './rng';
export type { RngHolder } from './rng';
export {
  allBorderEntries,
  buildRoute,
  entryKey,
  listEntries,
  listKekeTurns,
  straightLeg,
} from './systems/entries';
export { vehicleHitTiles, vehicleStepTicks } from './systems/vehicles';
export { alivePlayers, playerStepTicks } from './systems/queries';
export { secondsRemaining } from './systems/match';
export { observe } from './observe';
export type { Observation } from './observe';
export { previewBlast } from './systems/explosions';
