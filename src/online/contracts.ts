/**
 * Service contracts for online play. Every method is async and returns a `Result`: no exception crosses this
 * boundary (a transport failure is `serverUnavailable` / `timeout`, a bad request `invalidMessage`, and so on).
 * Implementations: `mock/` (local, in memory) and `server/adapter.ts` (WebSocket + HTTPS skeleton, build-time
 * opt-in only). The UI depends on these interfaces, never on an implementation.
 *
 * Push events (queue progress, room updates, snapshots ...) arrive on `OnlineClient.events`.
 */
import type { Intent } from '../sim';
import type { CharacterId } from '../sim';
import type { Result } from './result';
import type { ServerEvent } from './schema';
import type {
  AccountId,
  ConnectionState,
  Credentials,
  Friend,
  FriendRequest,
  FriendRequestId,
  InputAck,
  Invitation,
  InvitationId,
  LeaderboardPage,
  LobbySettings,
  MatchDescriptor,
  MatchId,
  MatchPhase,
  MatchResults,
  MatchSnapshot,
  Party,
  PartyId,
  Profile,
  ProgressionSummary,
  ProgressionUpdate,
  QueueRequest,
  QueueStatus,
  RatingInfo,
  ResumeRequest,
  ResumeResponse,
  Room,
  RoomId,
  Session,
  TicketId,
} from './types';

export type Unsubscribe = () => void;

export interface AccountService {
  /** A throwaway account: created on first use and remembered on this device only. */
  signInGuest(displayName?: string): Promise<Result<Session>>;
  /** Placeholder for a real sign-in; the mock accepts any handle, a real server defines real credentials. */
  signIn(credentials: Credentials): Promise<Result<Session>>;
  signOut(): Promise<Result<void>>;
  currentProfile(): Promise<Result<Profile>>;
  setDisplayName(displayName: string): Promise<Result<Profile>>;
}

export interface MatchmakingService {
  enqueue(request: QueueRequest): Promise<Result<QueueStatus>>;
  status(ticketId: TicketId): Promise<Result<QueueStatus>>;
  cancel(ticketId: TicketId): Promise<Result<QueueStatus>>;
}

export interface PartyService {
  create(): Promise<Result<Party>>;
  join(code: string): Promise<Result<Party>>;
  get(partyId: PartyId): Promise<Result<Party>>;
  leave(partyId: PartyId): Promise<Result<void>>;
  invite(partyId: PartyId, friendId: AccountId): Promise<Result<Invitation>>;
  promote(partyId: PartyId, memberId: AccountId): Promise<Result<Party>>;
  kick(partyId: PartyId, memberId: AccountId): Promise<Result<Party>>;
  setReady(partyId: PartyId, ready: boolean): Promise<Result<Party>>;
}

export interface TeamService {
  /** Ask to move to another team (the server decides which; a client never sends a team number). */
  requestSwitch(roomId: RoomId): Promise<Result<Room>>;
  /** Host only: spread everyone evenly. */
  balance(roomId: RoomId): Promise<Result<Room>>;
}

export interface LobbyService {
  /** Host (party leader): turn the party into a room. */
  createFromParty(partyId: PartyId, settings: LobbySettings): Promise<Result<Room>>;
  get(roomId: RoomId): Promise<Result<Room>>;
  setSettings(roomId: RoomId, settings: LobbySettings): Promise<Result<Room>>;
  setReady(roomId: RoomId, ready: boolean): Promise<Result<Room>>;
  setCharacter(roomId: RoomId, characterId: CharacterId): Promise<Result<Room>>;
  startReadyCheck(roomId: RoomId): Promise<Result<Room>>;
  leave(roomId: RoomId): Promise<Result<void>>;
}

export interface MatchService {
  /** Host: begin the match of a room whose ready check passed (skips the rest of the countdown). */
  start(roomId: RoomId): Promise<Result<MatchDescriptor>>;
  join(matchId: MatchId): Promise<Result<MatchDescriptor>>;
  leave(matchId: MatchId): Promise<Result<void>>;
  /** Loaded in and ready for the countdown. */
  ready(matchId: MatchId, ready: boolean): Promise<Result<MatchPhase>>;
  /** Server-authoritative: the client states what it WANTS to do at `tick`; the server decides what happens. */
  submitInput(matchId: MatchId, tick: number, intent: Intent): Promise<Result<InputAck>>;
  snapshot(matchId: MatchId): Promise<Result<MatchSnapshot>>;
  results(matchId: MatchId): Promise<Result<MatchResults>>;
}

export interface ReconnectService {
  /** Resume a match after a dropped connection, inside the grace window. */
  resume(request: ResumeRequest): Promise<Result<ResumeResponse>>;
}

export interface ProgressionService {
  get(): Promise<Result<ProgressionSummary>>;
  /**
   * Ask the server to settle a finished match into this account's progression. The client never sends the
   * result: the server derives it from the match it ran. Idempotent per match.
   */
  settle(matchId: MatchId): Promise<Result<ProgressionUpdate>>;
}

export interface RankingService {
  rating(): Promise<Result<RatingInfo>>;
  leaderboard(boardId: string, limit?: number): Promise<Result<LeaderboardPage>>;
}

export interface SocialService {
  friends(): Promise<Result<Friend[]>>;
  requestFriend(code: string): Promise<Result<FriendRequest>>;
  respondFriend(requestId: FriendRequestId, accept: boolean): Promise<Result<Friend | null>>;
  invitations(): Promise<Result<Invitation[]>>;
  respondInvitation(invitationId: InvitationId, accept: boolean): Promise<Result<Party | null>>;
}

/** The push channel. Listeners must not throw; the implementation isolates them anyway. */
export interface EventStream {
  subscribe(listener: (event: ServerEvent) => void): Unsubscribe;
}

/** Everything the UI talks to. */
export interface OnlineClient {
  /** 'mock' (local, in memory, no real players) or 'server' (real transport, build-time opt-in). */
  readonly kind: 'mock' | 'server';
  readonly accounts: AccountService;
  readonly matchmaking: MatchmakingService;
  readonly parties: PartyService;
  readonly teams: TeamService;
  readonly lobbies: LobbyService;
  readonly matches: MatchService;
  readonly reconnect: ReconnectService;
  readonly progression: ProgressionService;
  readonly ranking: RankingService;
  readonly social: SocialService;
  readonly events: EventStream;
  connection(): ConnectionState;
  /** Releases timers, sockets and listeners. */
  dispose(): void;
}
