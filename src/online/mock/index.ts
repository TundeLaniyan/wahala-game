/**
 * The complete local mock of the online back end: every service of `OnlineClient`, in memory, deterministic with
 * an injected clock and seeded rng, no network of any kind. "Players" other than you are scripted bots.
 *
 * Time moves only when `control.pump()` runs (the preview UI calls it on an interval; tests move a manual clock
 * and pump). `control` also carries the test / demo hooks: fault injection, dropped connections, fast-forward.
 */
import type { GameState } from '../../sim';
import type { OnlineClient } from '../contracts';
import type { Result } from '../result';
import type { MatchResults, Party } from '../types';
import { createAccountService, createSocialService, receiveInvitation } from './accounts';
import { Faults, createContext } from './context';
import type { MatchRec, MockCtx, MockOptions } from './context';
import { createLobbyService, createMatchmakingService, createTeamService, pumpLobbies } from './lobbies';
import {
  adoptLocalMatch,
  createMatchService,
  createReconnectService,
  fastForward,
  pumpMatches,
  replayMatch,
  setAutopilot,
  setPaused,
  simulateDrop,
  stateHash,
  stepMatch,
} from './match';
import { createPartyService, pumpParties, seedRemoteParty } from './parties';
import { createProgressionService, createRankingService } from './progress';

export { manualClock, systemClock } from './context';
export type { Clock, FaultRule, MockOptions, ServiceName } from './context';

export interface MockControl {
  /** Moves every time-driven part forward to the clock's current time. */
  pump(): void;
  readonly faults: Faults;
  /** Drops the local player's connection (starts the grace window). */
  simulateDrop(matchId: string): Result<{ graceUntil: number }>;
  /** The server plays the match to its end at once, a bot driving your seat. */
  fastForward(matchId: string): Result<MatchResults>;
  /** PREVIEW ONLY: hands the final state of a locally played match to the mock server (see `adoptLocalMatch`). */
  adoptLocalMatch(matchId: string, finalState: GameState): Result<MatchResults>;
  /** A bot drives your seat while you stay connected (the "let the server play it" demo). */
  autopilot(matchId: string, on: boolean): void;
  /** Holds / releases the server clock of a match (the preview holds it while you choose how to play). */
  pause(matchId: string, paused: boolean): void;
  /** Advances a playing match by `ticks` immediately (tests). */
  step(matchId: string, ticks: number): void;
  /** Tests: the hash of the live state and of a replay from the seed and the input log (they must match). */
  verifyReplay(matchId: string): { tick: number; live: number; replayed: number } | null;
  /** Tests: the authoritative record (never reachable through the service interfaces). */
  inspect(matchId: string): MatchRec | undefined;
  /** A scripted friend starts a party with this join code (so join-by-code can be exercised). */
  seedRemoteParty(code: string, leaderId: string): Party | null;
  /** A scripted friend invites you to their party. */
  receiveInvitation(partyId: string, fromId: string): void;
}

export interface MockOnline extends OnlineClient {
  readonly kind: 'mock';
  readonly control: MockControl;
}

export function createMockOnline(options: MockOptions = {}): MockOnline {
  const ctx: MockCtx = createContext(options);
  const control: MockControl = {
    pump() {
      pumpParties(ctx);
      pumpLobbies(ctx);
      pumpMatches(ctx);
    },
    faults: ctx.faults,
    simulateDrop: (id) => simulateDrop(ctx, id),
    fastForward: (id) => fastForward(ctx, id),
    adoptLocalMatch: (id, state) => adoptLocalMatch(ctx, id, state),
    autopilot: (id, on) => setAutopilot(ctx, id, on),
    pause: (id, paused) => setPaused(ctx, id, paused),
    step(matchId, ticks) {
      const rec = ctx.state.matches.get(matchId);
      if (rec) stepMatch(ctx, rec, ticks);
    },
    verifyReplay(matchId) {
      const rec = ctx.state.matches.get(matchId);
      if (!rec) return null;
      return { tick: rec.state.tick, live: stateHash(rec.state), replayed: stateHash(replayMatch(rec)) };
    },
    inspect: (id) => ctx.state.matches.get(id),
    seedRemoteParty: (code, leaderId) => seedRemoteParty(ctx, code, leaderId),
    receiveInvitation(partyId, fromId) {
      receiveInvitation(ctx, partyId, fromId);
    },
  };
  return {
    kind: 'mock',
    accounts: createAccountService(ctx),
    matchmaking: createMatchmakingService(ctx),
    parties: createPartyService(ctx),
    teams: createTeamService(ctx),
    lobbies: createLobbyService(ctx),
    matches: createMatchService(ctx),
    reconnect: createReconnectService(ctx),
    progression: createProgressionService(ctx),
    ranking: createRankingService(ctx),
    social: createSocialService(ctx),
    events: { subscribe: (l) => ctx.events.subscribe(l) },
    connection: () => ctx.state.connection,
    dispose: () => ctx.events.clear(),
    control,
  };
}
