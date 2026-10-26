/** Public API of the simulation. Outer layers import from here, never from systems/ directly. */
export { createGame, createPlayer, crushSchedule, DEFAULT_SETTINGS, MAX_PLAYERS, MIN_PLAYERS } from './state';
export { tick } from './tick';
export { DEFAULT_CONFIG, TICK_RATE, mergeConfig, ticks } from './config';
export type { DeepPartial, GameConfig, RewardKind, VehicleSpec } from './config';
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
export {
  ARENAS,
  CITY_RUMBLE_ID,
  DEFAULT_ARENA_ID,
  EXPERIMENTAL_ARENA_IDS,
  MOBILE_TEST_ARENA_ID,
  RUMBLE_ARENA_IDS,
  STANDARD_ARENA_IDS,
  getArena,
} from './arenas';
export type {
  ArenaDef,
  ArenaInfo,
  ArenaKind,
  DistrictDef,
  DistrictLink,
  HazardSchedule,
  StageHazardDef,
} from './arenas';
export { isLethalStageEvent, manholePartners } from './systems/stage';
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
export type { EntryView } from './systems/entries';
export { vehicleHitTiles, vehicleStepTicks } from './systems/vehicles';
export { alivePlayers, playerStepTicks } from './systems/queries';
export { readyToStep } from './systems/movement';
export { secondsRemaining } from './systems/match';
export { observe } from './observe';
export type { Observation } from './observe';
export { previewBlast } from './systems/explosions';
export { previewSpecial } from './systems/actions';
export type { SpecialAction } from './systems/actions';
export { chooseAutoVehicle, scoreRoute } from './systems/autoVehicle';
export type { AutoVehicleChoice, AutoVehicleView } from './systems/autoVehicle';
export { squareFootprint } from './systems/explosions';
export {
  inDisc,
  lineBetween,
  radialFootprint,
  radialOffsets,
  radialRadius,
  radialSquareRadius,
} from './systems/blastShape';
export type { RadialOffset, RadialOptions } from './systems/blastShape';
export { meleeTarget } from './systems/skills';
export { moveWouldAct } from './systems/contact';
export { autoRouteOptions, drivableStretch } from './systems/autoVehicle';
export { canHarm, isOpponent, teammates } from './systems/queries';
export { rankPlayers, teamStandings, timedResult } from './systems/match';
export type { TeamStanding } from './systems/match';
export { previewRewards, rewardUseful, rewardsFor } from './systems/rewards';
export {
  DEFAULT_TIMED_SECONDS,
  RUMBLE_MODES,
  TEAM_NAMES,
  TIMED_MINUTES,
  assignTeams,
  isRespawnMode,
  isTeamMode,
  modeConfig,
  teamHome,
} from './modes';
export { isSpawnProtected } from './systems/respawn';
export { canThrow, laneStep, spectatorLane, spectatorLanding, validLanding } from './systems/spectators';
export type { LaneTile, SpectatorView } from './systems/spectators';
