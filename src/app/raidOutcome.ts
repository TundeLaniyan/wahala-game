/**
 * Reading a finished raid (pure). The raid runtime puts a `RaidOutcome` in `state.raid.outcome`; this reads it without
 * depending on the runtime's types (so the app compiles with or without them) and has a safety net for a raid match
 * that ended with no outcome, so the campaign never gets stuck on a finished raid.
 */
import type { GameState, RaidId, RaidOutcome } from '../sim';

/** The outcome the raid runtime wrote, or null while the raid is still running. */
export function raidOutcomeOf(state: GameState): RaidOutcome | null {
  const raid = (state as GameState & { raid?: { outcome?: RaidOutcome | null } }).raid;
  return raid?.outcome ?? null;
}

/** A raid match that ended without an outcome: a win for seat 0 is `completed`, anything else `failed`. */
export function raidOutcomeFromMatch(state: GameState, raidId: RaidId): RaidOutcome {
  const r = state.match.result;
  const won = r?.kind === 'win' && r.winnerId === 0;
  return {
    raidId,
    result: won ? 'completed' : 'failed',
    seconds: Math.round(state.match.playTicks / 60),
    optionalRoomsOpened: 0,
    optionalRoomsTotal: 0,
    cargoDestroyed: 0,
    cargoTotal: 0,
    hpLeft: state.players[0]?.vitals?.hp ?? 0,
    livesUsed: 0,
    stars: won ? 1 : 0,
  };
}

/** The raid was left on purpose (Leave raid): nothing is earned, the field mission may try the door again. */
export function raidAbandoned(state: GameState | null, raidId: RaidId): RaidOutcome {
  return {
    raidId,
    result: 'abandoned',
    seconds: state ? Math.round(state.match.playTicks / 60) : 0,
    optionalRoomsOpened: 0,
    optionalRoomsTotal: 0,
    cargoDestroyed: 0,
    cargoTotal: 0,
    hpLeft: state?.players[0]?.vitals?.hp ?? 0,
    livesUsed: 0,
    stars: 0,
  };
}
