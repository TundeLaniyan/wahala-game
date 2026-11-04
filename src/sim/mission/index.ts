/**
 * Mission runtime public API. STUB written by the integrator so the app / UI layers compile; the `mission-sim`
 * worker replaces the bodies (keep the exported names and signatures).
 */
import type { CharacterId, GameOptions, GameState } from '../types';
import type { MissionId, MissionSpec, MissionView } from './types';

export * from './types';

/** The read-only mission picture for the HUD, or null when this is not a mission match. */
export function missionView(_state: GameState): MissionView | null {
  return null;
}

/** STUB: the arena a mission is played on. */
export function getMissionArenaId(_id: MissionId): string {
  return 'rumbleOshodi';
}

/** STUB: createGame options for a mission match (the real one builds the boss and crew seats). */
export function buildMissionGame(_args: {
  spec: MissionSpec;
  humanCharacter: CharacterId;
  seed: number;
}): GameOptions {
  throw new Error('mission runtime not merged yet');
}
