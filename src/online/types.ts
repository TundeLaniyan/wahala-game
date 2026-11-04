/**
 * Plain data types shared by the service contracts, the wire schema and the mock. Everything is JSON-serialisable.
 * Ids are opaque strings issued by the (mock) server; clients never invent them.
 */
import type { CharacterId, Intent } from '../sim';
import type { ProgressionProfile, ProgressionUpdate, RankInfo } from '../progression';

export type AccountId = string;
export type PartyId = string;
export type RoomId = string;
export type MatchId = string;
export type TicketId = string;
export type InvitationId = string;
export type FriendRequestId = string;

/** The games an online queue / room can play (the sim's rulesets; campaign missions are single player). */
export type OnlineGame = 'classic' | 'survival' | 'deathmatch' | 'team';
export const ONLINE_GAMES: readonly OnlineGame[] = ['classic', 'survival', 'deathmatch', 'team'];

// ---------------------------------------------------------------- accounts

export interface Profile {
  id: AccountId;
  displayName: string;
  guest: boolean;
  createdAt: number;
}

/**
 * An opaque bearer token. It lives in MEMORY only (never localStorage, never a URL, never a log line):
 * `toJSON` / `toString` return a redaction, only `reveal()` gives the value, and only the transport calls it.
 */
export interface AuthToken {
  readonly expiresAt: number;
  reveal(): string;
  toJSON(): string;
  toString(): string;
}

export interface Session {
  profile: Profile;
  token: AuthToken;
}

/** Auth PLACEHOLDER: a real backend defines real credentials (docs/ONLINE_ARCHITECTURE.md, "Auth placeholder"). */
export type Credentials = { kind: 'placeholder'; handle: string };

// ---------------------------------------------------------------- matchmaking

export interface QueueRequest {
  game: OnlineGame;
  arenaId: string;
}

export interface QueueStatus {
  ticketId: TicketId;
  state: 'searching' | 'matched' | 'cancelled';
  game: OnlineGame;
  arenaId: string;
  /** Players found so far (excluding you) and needed in all. */
  found: number;
  needed: number;
  waitedMs: number;
  roomId: RoomId | null;
}

// ---------------------------------------------------------------- party

export interface PartyMember {
  accountId: AccountId;
  displayName: string;
  ready: boolean;
  /** A scripted mock friend (always false on a real server). */
  mock: boolean;
}

export interface Party {
  id: PartyId;
  /** Short shareable code. */
  code: string;
  leaderId: AccountId;
  members: PartyMember[];
  maxSize: number;
  createdAt: number;
  roomId: RoomId | null;
}

// ---------------------------------------------------------------- lobby / rooms

export type RoomState = 'created' | 'open' | 'readyCheck' | 'starting' | 'inProgress' | 'finished' | 'aborted';
export type MatchPhase = 'lobby' | 'countdown' | 'playing' | 'ended' | 'resultsPosted';

export interface RoomMember {
  accountId: AccountId;
  displayName: string;
  isBot: boolean;
  ready: boolean;
  /** Assigned by the SERVER in team games (clients can only ask to switch); null otherwise. */
  team: number | null;
  characterId: CharacterId;
  connected: boolean;
}

export interface Room {
  id: RoomId;
  state: RoomState;
  hostId: AccountId;
  game: OnlineGame;
  arenaId: string;
  maxPlayers: number;
  teamCount: number;
  members: RoomMember[];
  matchId: MatchId | null;
  source: 'queue' | 'party';
  createdAt: number;
}

export interface LobbySettings {
  game: OnlineGame;
  arenaId: string;
}

// ---------------------------------------------------------------- match

export interface MatchSeat {
  seat: number;
  accountId: AccountId;
  displayName: string;
  isBot: boolean;
  team: number | null;
  characterId: CharacterId;
}

/** What a client learns when it joins a match. The seed is deliberately NOT included (it derives hidden pickups). */
export interface MatchDescriptor {
  matchId: MatchId;
  roomId: RoomId;
  game: OnlineGame;
  arenaId: string;
  phase: MatchPhase;
  seats: MatchSeat[];
  yourSeat: number;
  /** How long a dropped player's seat is held (ms). */
  graceMs: number;
  /** Opaque, secret, bound to your seat: needed to resume after a dropped connection. Memory only. */
  resumeToken: string;
}

export interface SnapshotPlayer {
  seat: number;
  accountId: AccountId;
  displayName: string;
  team: number | null;
  x: number;
  y: number;
  alive: boolean;
  kills: number;
  deaths: number;
  assists: number;
  connected: boolean;
}

/** The PUBLIC view of the authoritative state (hidden pickups and the rng are never in it). */
export interface MatchSnapshot {
  matchId: MatchId;
  tick: number;
  phase: MatchPhase;
  width: number;
  height: number;
  tiles: number[];
  players: SnapshotPlayer[];
  generators: { x: number; y: number; ownerSeat: number }[];
  flames: { x: number; y: number }[];
  secondsRemaining: number | null;
  /** FNV-1a hash of the full authoritative state: lets a client / test detect divergence. */
  stateHash: number;
}

export interface ResultPlayer {
  seat: number;
  accountId: AccountId;
  displayName: string;
  isBot: boolean;
  team: number | null;
  placement: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface MatchResults {
  matchId: MatchId;
  game: OnlineGame;
  arenaId: string;
  durationSec: number;
  winnerSeat: number | null;
  winnerTeam: number | null;
  draw: boolean;
  players: ResultPlayer[];
}

export interface LoggedInput {
  tick: number;
  seat: number;
  intent: Intent;
}

export interface InputAck {
  accepted: boolean;
  serverTick: number;
}

// ---------------------------------------------------------------- reconnect

export interface ResumeRequest {
  matchId: MatchId;
  resumeToken: string;
  /** The last server tick the client saw. */
  lastAckedTick: number;
}

export interface ResumeResponse {
  descriptor: MatchDescriptor;
  snapshot: MatchSnapshot;
  /** Every input the server accepted after `lastAckedTick` (all seats), oldest first. */
  inputLog: LoggedInput[];
  graceRemainingMs: number;
}

export type ConnectionState = 'connected' | 'reconnecting' | 'offline';

// ---------------------------------------------------------------- progression / ranking

export interface ProgressionSummary {
  profile: ProgressionProfile;
  rank: RankInfo;
}

export type { ProgressionProfile, ProgressionUpdate, RankInfo };

export interface LeaderboardRow {
  rank: number;
  accountId: AccountId;
  displayName: string;
  points: number;
  isYou: boolean;
}

export interface LeaderboardPage {
  boardId: string;
  rows: LeaderboardRow[];
  total: number;
}

export interface RatingInfo {
  points: number;
  rank: RankInfo;
}

// ---------------------------------------------------------------- social

export type Presence = 'online' | 'offline' | 'inMatch';

export interface Friend {
  accountId: AccountId;
  displayName: string;
  presence: Presence;
}

export interface FriendRequest {
  id: FriendRequestId;
  fromId: AccountId;
  fromName: string;
  createdAt: number;
}

export interface Invitation {
  id: InvitationId;
  partyId: PartyId;
  fromId: AccountId;
  fromName: string;
  createdAt: number;
  expiresAt: number;
}
