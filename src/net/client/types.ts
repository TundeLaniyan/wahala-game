/**
 * The client-side session contract (docs/ONLINE_INTEGRATION.md section 3/4). The online UI and controller code against
 * THIS; `createRumbleSession` (src/net/client/session.ts, release owner) implements it over the Colyseus SDK and the
 * replica, and tests / the UI's fakes implement it in memory. Browser-only; imported only from the online chunk.
 */
import type { RemoteMatchDriver } from '../../app/remoteMatch';
import type {
  LobbyMsg,
  NoticeMsg,
  QuickMode,
  ResultsMsg,
  SettingsMsg,
  SignalInMsg,
  WelcomeMsg,
} from '../protocol';

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface JoinInfo {
  /** Display name (validated: 2-24 characters, see protocol `validatePlayerName`). */
  name: string;
  /** The fighter's character id (the player's own choice in Settings / the fighter screen). */
  characterId: string;
}

/**
 * What the player asked for when opening a room. `ticket` (create / join only, never Quick Play): a signed, single-use
 * player-platform match ticket (docs/PLATFORM_MATCH_HANDOFF.md); the server then seats a VERIFIED player. Without it the
 * join is the anonymous guest join. A ticket is fetched right before it is used and never re-sent (reconnection is the
 * server's own token).
 */
export type OpenRequest =
  | { kind: 'create'; who: JoinInfo; ticket?: string }
  | { kind: 'join'; who: JoinInfo; code: string; ticket?: string }
  /** QUICK PLAY: public matchmaking in ONE mode (Free-for-All or Team Rumble); never moved to the other. */
  | { kind: 'quick'; who: JoinInfo; mode: QuickMode };

/** Everything the session reports, in order. All callbacks are optional-safe: the session never throws into the UI. */
export interface RumbleSessionEvents {
  status(status: ConnStatus, detail: string): void;
  welcome(msg: WelcomeMsg): void;
  lobby(msg: LobbyMsg): void;
  notice(msg: NoticeMsg): void;
  /** The server's final results (derived from its own simulation). */
  results(msg: ResultsMsg): void;
  /** A preset quick signal relayed by the server (an id from `SIGNAL_IDS`, never free text). */
  signal(msg: SignalInMsg): void;
  /** The first keyframe of a match is loaded: the driver can be handed to `commands.startRemote`. */
  matchReady(driver: RemoteMatchDriver): void;
  /** The connection failed before or during the lobby in a way the player must be told about. */
  failed(
    reason:
      | 'unreachable'
      | 'room-not-found'
      | 'room-full'
      | 'match-started'
      | 'room-unavailable'
      | 'server-busy'
      | 'rate-limited'
      | 'refused'
      | 'ticket'
      | 'protocol'
      | 'unknown',
    detail: string,
    /** The server's retry hint in seconds (`server-busy`, `rate-limited`). */
    retryAfterSec?: number,
  ): void;
}

export interface RumbleSession {
  /** Opens (creates / joins / quick-joins) a room. Rejects only on programmer error; failures arrive as `failed`. */
  open(req: OpenRequest): Promise<void>;
  /** Lobby controls (the server validates who may do what). */
  ready(on: boolean): void;
  start(): void;
  rematch(): void;
  settings(patch: SettingsMsg): void;
  /** Sends a preset quick signal (`SIGNAL_IDS`); the server decides who receives it (and may drop it). */
  sendSignal(id: string): void;
  /** Leaves the room and closes the connection. Idempotent. */
  leave(): Promise<void>;
  /** The match driver once `matchReady` fired, null before and after the match. */
  readonly driver: RemoteMatchDriver | null;
  readonly status: ConnStatus;
}
