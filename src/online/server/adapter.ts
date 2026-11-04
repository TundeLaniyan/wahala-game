/**
 * The REAL server adapter: HTTPS commands + a streaming socket for events and match input. SKELETON ONLY.
 * Nothing in this repository runs it against a back end (there is none), it is covered by unit tests with fake
 * transports only, and it is compiled into a build only when WAHALA_ONLINE_ENABLED=true and WAHALA_ONLINE_URL
 * are set (see `src/online/index.ts` and docs/ONLINE_ARCHITECTURE.md for the endpoint list a server must provide).
 *
 * Security: the token lives in memory only (`AuthToken`), travels in the Authorization header and the first
 * socket frame, and is never logged or stored. Every server frame is decoded and validated before use.
 */
import type { Intent } from '../../sim';
import type { OnlineClient } from '../contracts';
import { E } from '../errors';
import { err, ok } from '../result';
import type { Result } from '../result';
import { decodeServerMessage, encodeClientMessage } from '../schema';
import type { ServerEvent } from '../schema';
import type { AuthToken, ConnectionState, InputAck, Profile, Session } from '../types';
import { makeOpaqueToken } from '../util';
import { createHttp } from './http';
import type { Http, HttpDeps } from './http';
import { ManagedSocket } from './socket';
import type { ManagedSocketDeps, SocketState } from './socket';

export interface ServerConfig {
  /** Base URL of the HTTPS API; the streaming endpoint is derived from it (`/v1/stream`, wss scheme). */
  url: string;
}

export interface ServerDeps {
  http?: Http;
  httpDeps?: HttpDeps;
  socket?: ManagedSocketDeps;
}

const CLIENT_NAME = 'wahala-web';

/** `https://host/api` -> `wss://host/api/v1/stream` (the scheme is derived, never user supplied). */
export function streamUrl(apiUrl: string): string {
  const u = new URL(apiUrl);
  u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:';
  u.pathname = `${u.pathname.replace(/\/+$/, '')}/v1/stream`;
  u.search = '';
  u.hash = '';
  return u.toString();
}

const asConnection = (s: SocketState): ConnectionState =>
  s === 'open' ? 'connected' : s === 'closed' ? 'offline' : 'reconnecting';

export function createServerOnline(config: ServerConfig, deps: ServerDeps = {}): OnlineClient {
  let token: AuthToken | null = null;
  let socketState: SocketState = 'closed';
  const listeners = new Set<(e: ServerEvent) => void>();
  const http = deps.http ?? createHttp(config.url, () => token, deps.httpDeps);

  const emit = (e: ServerEvent): void => {
    for (const l of [...listeners]) {
      try {
        l(e);
      } catch {
        /* a listener must never break the transport */
      }
    }
  };

  const socket = new ManagedSocket(
    streamUrl(config.url),
    {
      onOpen() {
        // auth placeholder: the opaque token goes in the first frame (never in the URL)
        socket.send(encodeClientMessage({ type: 'hello', client: CLIENT_NAME, ...(token ? { token: token.reveal() } : {}) }));
      },
      onText(text) {
        const r = decodeServerMessage(text);
        if (!r.ok) return; // a frame that fails validation is dropped, never acted on
        const { v: _v, ...event } = r.value;
        emit(event as ServerEvent);
      },
      onState(s) {
        socketState = s;
      },
    },
    deps.socket,
  );

  /** One command: POST, then a SHALLOW shape check (an object or nothing). Typed by the call site. */
  async function rpc<T>(path: string, body?: unknown): Promise<Result<T>> {
    const r = await http.post(path, body);
    if (!r.ok) return r;
    if (r.value !== null && typeof r.value !== 'object') return err(E.internal('Unexpected response.'));
    return ok(r.value as T);
  }
  const rpcVoid = async (path: string, body?: unknown): Promise<Result<void>> => {
    const r = await rpc<unknown>(path, body);
    return r.ok ? ok(undefined) : r;
  };

  const startSession = (r: Result<{ profile: Profile; token: string; expiresAt: number }>): Result<Session> => {
    if (!r.ok) return r;
    if (typeof r.value?.token !== 'string' || !r.value.profile) return err(E.internal('Unexpected response.'));
    token = makeOpaqueToken(r.value.token, r.value.expiresAt);
    socket.connect();
    return ok({ profile: r.value.profile, token });
  };

  return {
    kind: 'server',
    accounts: {
      signInGuest: async (displayName) => startSession(await rpc('/v1/auth/guest', { displayName })),
      signIn: async (credentials) => startSession(await rpc('/v1/auth/signin', credentials)),
      signOut: async () => {
        const r = await rpcVoid('/v1/auth/signout');
        token = null;
        socket.close();
        return r;
      },
      currentProfile: () => rpc('/v1/account/profile'),
      setDisplayName: (displayName) => rpc('/v1/account/name', { displayName }),
    },
    matchmaking: {
      enqueue: (request) => rpc('/v1/queue/enqueue', request),
      status: (ticketId) => rpc('/v1/queue/status', { ticketId }),
      cancel: (ticketId) => rpc('/v1/queue/cancel', { ticketId }),
    },
    parties: {
      create: () => rpc('/v1/party/create'),
      join: (code) => rpc('/v1/party/join', { code }),
      get: (partyId) => rpc('/v1/party/get', { partyId }),
      leave: (partyId) => rpcVoid('/v1/party/leave', { partyId }),
      invite: (partyId, friendId) => rpc('/v1/party/invite', { partyId, friendId }),
      promote: (partyId, memberId) => rpc('/v1/party/promote', { partyId, memberId }),
      kick: (partyId, memberId) => rpc('/v1/party/kick', { partyId, memberId }),
      setReady: (partyId, ready) => rpc('/v1/party/ready', { partyId, ready }),
    },
    teams: {
      requestSwitch: (roomId) => rpc('/v1/team/switch', { roomId }),
      balance: (roomId) => rpc('/v1/team/balance', { roomId }),
    },
    lobbies: {
      createFromParty: (partyId, settings) => rpc('/v1/lobby/create', { partyId, ...settings }),
      get: (roomId) => rpc('/v1/lobby/get', { roomId }),
      setSettings: (roomId, settings) => rpc('/v1/lobby/settings', { roomId, ...settings }),
      setReady: (roomId, ready) => rpc('/v1/lobby/ready', { roomId, ready }),
      setCharacter: (roomId, characterId) => rpc('/v1/lobby/character', { roomId, characterId }),
      startReadyCheck: (roomId) => rpc('/v1/lobby/readycheck', { roomId }),
      leave: (roomId) => rpcVoid('/v1/lobby/leave', { roomId }),
    },
    matches: {
      start: (roomId) => rpc('/v1/match/start', { roomId }),
      join: (matchId) => rpc('/v1/match/join', { matchId }),
      leave: (matchId) => rpcVoid('/v1/match/leave', { matchId }),
      ready: (matchId, ready) => rpc('/v1/match/ready', { matchId, ready }),
      // input is the hot path: it goes over the socket and is acknowledged by the next snapshot, not a reply
      submitInput: (matchId: string, tick: number, intent: Intent): Promise<Result<InputAck>> => {
        const frame = encodeClientMessage({ type: 'match.input', matchId, tick, intent });
        return Promise.resolve(
          socket.send(frame) ? ok({ accepted: true, serverTick: tick }) : err(E.serverUnavailable('Not connected.')),
        );
      },
      snapshot: (matchId) => rpc('/v1/match/snapshot', { matchId }),
      results: (matchId) => rpc('/v1/match/results', { matchId }),
    },
    reconnect: { resume: (request) => rpc('/v1/match/resume', request) },
    progression: {
      get: () => rpc('/v1/progress/get'),
      settle: (matchId) => rpc('/v1/progress/settle', { matchId }),
    },
    ranking: {
      rating: () => rpc('/v1/ranking/rating'),
      leaderboard: (boardId, limit) => rpc('/v1/ranking/leaderboard', { boardId, limit }),
    },
    social: {
      friends: () => rpc('/v1/social/friends'),
      requestFriend: (code) => rpc('/v1/social/request', { code }),
      respondFriend: (requestId, accept) => rpc('/v1/social/respond', { requestId, accept }),
      invitations: () => rpc('/v1/social/invitations'),
      respondInvitation: (invitationId, accept) => rpc('/v1/social/invitation-respond', { invitationId, accept }),
    },
    events: {
      subscribe(listener) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    },
    connection: () => asConnection(socketState),
    dispose() {
      socket.close();
      listeners.clear();
      token = null;
    },
  };
}

/** The factory `src/online/index.ts` loads (dynamically, behind the build-time guard). */
export { createServerOnline as create };
