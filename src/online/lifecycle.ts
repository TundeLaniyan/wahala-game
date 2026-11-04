/**
 * Pure lifecycle rules: room and match state machines, and who may do what in parties, rooms and teams. The
 * server owns every transition; the client uses the same functions only to enable or disable buttons.
 *
 * Room:   created -> open -> readyCheck -> starting -> inProgress -> finished
 *                      ^         |            |
 *                      +---------+------------+   (readyFailed / cancelStart)
 *         any non-final state -- abort --> aborted
 * Match:  lobby -> countdown -> playing -> ended -> resultsPosted      (abort: any live phase -> ended)
 */
import { E } from './errors';
import type { OnlineError } from './errors';
import { err, ok } from './result';
import type { Result } from './result';
import type { AccountId, MatchPhase, OnlineGame, Party, Room, RoomState } from './types';

// ---------------------------------------------------------------- room state machine

export type RoomEvent =
  | 'open'
  | 'startReadyCheck'
  | 'allReady'
  | 'readyFailed'
  | 'countdownDone'
  | 'cancelStart'
  | 'matchEnded'
  | 'abort';

export const ROOM_TRANSITIONS: Readonly<Record<RoomState, Partial<Record<RoomEvent, RoomState>>>> = {
  created: { open: 'open', abort: 'aborted' },
  open: { startReadyCheck: 'readyCheck', abort: 'aborted' },
  readyCheck: { allReady: 'starting', readyFailed: 'open', abort: 'aborted' },
  starting: { countdownDone: 'inProgress', cancelStart: 'open', abort: 'aborted' },
  inProgress: { matchEnded: 'finished', abort: 'aborted' },
  finished: {},
  aborted: {},
};

/** The room state after `event`, or null when the event is not allowed in `state`. */
export function nextRoomState(state: RoomState, event: RoomEvent): RoomState | null {
  return ROOM_TRANSITIONS[state][event] ?? null;
}

export const isRoomFinal = (s: RoomState): boolean => s === 'finished' || s === 'aborted';

/** Room states in which membership, settings and teams can still change. */
export const isRoomEditable = (s: RoomState): boolean => s === 'created' || s === 'open';

// ---------------------------------------------------------------- match state machine

export type MatchEvent = 'startCountdown' | 'cancelCountdown' | 'countdownDone' | 'simEnded' | 'resultsPosted' | 'abort';

export const MATCH_TRANSITIONS: Readonly<Record<MatchPhase, Partial<Record<MatchEvent, MatchPhase>>>> = {
  lobby: { startCountdown: 'countdown', abort: 'ended' },
  countdown: { countdownDone: 'playing', cancelCountdown: 'lobby', abort: 'ended' },
  playing: { simEnded: 'ended', abort: 'ended' },
  ended: { resultsPosted: 'resultsPosted' },
  resultsPosted: {},
};

export function nextMatchPhase(phase: MatchPhase, event: MatchEvent): MatchPhase | null {
  return MATCH_TRANSITIONS[phase][event] ?? null;
}

/** Input is accepted only while the match is counting down or playing. */
export const acceptsInput = (phase: MatchPhase): boolean => phase === 'countdown' || phase === 'playing';

// ---------------------------------------------------------------- room rules

/** The minimum / maximum humans-or-bots a room needs to start a given game. */
export const MIN_ROOM_PLAYERS = 2;

type RoomView = Pick<Room, 'state' | 'hostId' | 'game' | 'maxPlayers' | 'teamCount'> & {
  members: readonly { accountId: AccountId; team: number | null; ready: boolean; isBot?: boolean }[];
};

const isMember = (room: RoomView, id: AccountId): boolean => room.members.some((m) => m.accountId === id);

/** Only the host changes the settings, and only while the room is open. */
export function canChangeSettings(room: RoomView, actor: AccountId): Result<void> {
  if (room.hostId !== actor) return err(E.forbidden('Only the host can change the settings.'));
  if (!isRoomEditable(room.state)) return err(E.invalidState(room.state, 'The room is locked.'));
  return ok(undefined);
}

/** Host-only; needs enough members and (team games) both teams staffed. */
export function canStartReadyCheck(room: RoomView, actor: AccountId): Result<void> {
  if (room.hostId !== actor) return err(E.forbidden('Only the host can start the ready check.'));
  if (room.state !== 'open') return err(E.invalidState(room.state, 'The room is not open.'));
  if (room.members.length < MIN_ROOM_PLAYERS) return err(E.conflict('Not enough players.'));
  if (room.game === 'team') {
    const teams = new Set(room.members.map((m) => m.team));
    for (let t = 0; t < room.teamCount; t++) {
      if (!teams.has(t)) return err(E.conflict('Every team needs a player.'));
    }
  }
  return ok(undefined);
}

/** A member may toggle ready while the room is open or in its ready check. */
export function canSetReady(room: RoomView, actor: AccountId): Result<void> {
  if (!isMember(room, actor)) return err(E.forbidden('You are not in this room.'));
  if (room.state !== 'open' && room.state !== 'readyCheck') {
    return err(E.invalidState(room.state, 'Ready flags can only change before the countdown.'));
  }
  return ok(undefined);
}

export const everyoneReady = (room: Pick<RoomView, 'members'>): boolean =>
  room.members.length > 0 && room.members.every((m) => m.ready);

// ---------------------------------------------------------------- team rules

export const usesTeams = (game: OnlineGame): boolean => game === 'team';

/** Seats per team. */
export const teamCapacity = (room: Pick<RoomView, 'maxPlayers' | 'teamCount'>): number =>
  Math.ceil(room.maxPlayers / Math.max(1, room.teamCount));

/**
 * A client never sends a team number: it can only ASK to move to another team. The server picks the next team with
 * a free seat. Allowed only in a team game, while the room is open, for a member who is not ready.
 */
export function canSwitchTeam(room: RoomView, actor: AccountId): Result<number> {
  if (!usesTeams(room.game)) return err(E.conflict('This game has no teams.'));
  if (!isRoomEditable(room.state)) return err(E.invalidState(room.state, 'Teams are locked.'));
  const me = room.members.find((m) => m.accountId === actor);
  if (!me) return err(E.forbidden('You are not in this room.'));
  if (me.ready) return err(E.conflict('Un-ready before switching teams.'));
  const cap = teamCapacity(room);
  const from = me.team ?? 0;
  for (let step = 1; step < room.teamCount; step++) {
    const t = (from + step) % room.teamCount;
    if (room.members.filter((m) => m.team === t).length < cap) return ok(t);
  }
  return err(E.roomFull('The other team is full.'));
}

/** Host-only, same lock rules as settings. */
export function canBalanceTeams(room: RoomView, actor: AccountId): Result<void> {
  if (!usesTeams(room.game)) return err(E.conflict('This game has no teams.'));
  return canChangeSettings(room, actor);
}

/** Even round-robin assignment, in member order. Pure; the server applies the result. */
export function balanceTeams(accountIds: readonly AccountId[], teamCount: number): Map<AccountId, number> {
  const out = new Map<AccountId, number>();
  accountIds.forEach((id, i) => out.set(id, i % Math.max(1, teamCount)));
  return out;
}

// ---------------------------------------------------------------- party rules

type PartyView = Pick<Party, 'leaderId' | 'maxSize' | 'roomId'> & { members: readonly { accountId: AccountId }[] };

export interface PartyPermissions {
  canInvite: boolean;
  canKick: boolean;
  canPromote: boolean;
  canStart: boolean;
  canLeave: boolean;
}

/** What `actor` may do in a party: leaders manage it, everyone may leave. */
export function partyPermissions(party: PartyView, actor: AccountId): PartyPermissions {
  const member = party.members.some((m) => m.accountId === actor);
  const leader = member && party.leaderId === actor;
  return {
    canInvite: leader && party.members.length < party.maxSize,
    canKick: leader && party.members.length > 1,
    canPromote: leader && party.members.length > 1,
    canStart: leader && party.roomId === null,
    canLeave: member,
  };
}

export function checkPartyAction(
  party: PartyView,
  actor: AccountId,
  action: keyof PartyPermissions,
): OnlineError | null {
  const p = partyPermissions(party, actor);
  if (!party.members.some((m) => m.accountId === actor)) return E.forbidden('You are not in this party.');
  if (p[action]) return null;
  if (action === 'canInvite' && party.members.length >= party.maxSize) return E.roomFull('The party is full.');
  return E.forbidden('Only the party leader can do that.');
}
