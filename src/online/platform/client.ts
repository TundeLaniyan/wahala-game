/**
 * The typed HTTP client of the player platform (docs/PLATFORM_CLIENT.md, docs/PLATFORM_ARCHITECTURE.md section 1):
 * JSON over `fetch` with a timeout, the platform's one error envelope `{ error: { code, message, requestId, retryAfterMs } }`,
 * Bearer access tokens, and the refresh rule the platform documents: `POST /v1/auth/refresh` ROTATES both tokens, the old
 * refresh token is never presented again (presenting it revokes the whole session), and concurrent 401s share ONE refresh.
 *
 * Identity is always the platform's (from the token): no request body here carries a player id, a status or an owner (the
 * platform refuses unknown keys); ids appear only in paths, exactly as the routes define them. Every call resolves to a
 * `Result`: nothing throws into the UI, and a platform that is down is just an error value (`network` / `unavailable`).
 * Online chunk only; nothing here runs before the player opens the Online screen of a platform build.
 */
import type { TokenStore, StoredSession } from './tokens';
import type {
  BlockView,
  FriendView,
  HistoryView,
  InviteView,
  MuteView,
  MyProfile,
  PartyMode,
  PartyView,
  ReportInput,
  RequestView,
  TicketView,
  Tokens,
} from './types';

/** A refusal or failure, in the platform's own terms. `network` = no answer (down, offline, timeout, CORS). */
export interface PlatformError {
  code: string;
  message: string;
  /** HTTP status, 0 when there was no answer. */
  status: number;
  requestId: string | null;
  retryAfterMs: number | null;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: PlatformError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(
  code: string,
  message: string,
  status = 0,
  extra: Partial<PlatformError> = {},
): Result<T> => ({
  ok: false,
  error: { code, message, status, requestId: null, retryAfterMs: null, ...extra },
});

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** The platform API base URL (flags `platformEndpoint`), no trailing slash. */
  baseUrl: string;
  tokens: TokenStore;
  fetch?: FetchLike;
  /** Per-request timeout (default 8 s): a hanging platform must never hang the online screens. */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 8000;

/** True when the error means "the platform could not be reached or is failing" (as opposed to a refusal). */
export const isOutage = (e: PlatformError): boolean =>
  e.status === 0 || e.status >= 500 || e.code === 'unavailable' || e.code === 'internal';

/** Reads the platform's error envelope; anything else becomes a generic error with the HTTP status. */
async function errorOf(res: Response): Promise<PlatformError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  const e = (body as { error?: Record<string, unknown> } | null)?.error;
  const header = Number(res.headers.get('Retry-After'));
  const retryHeader = Number.isFinite(header) && header > 0 ? header * 1000 : null;
  const code =
    typeof e?.code === 'string' ? e.code : res.status >= 500 ? 'unavailable' : `http_${res.status}`;
  return {
    code,
    message: typeof e?.message === 'string' ? e.message.slice(0, 300) : `HTTP ${res.status}`,
    status: res.status,
    requestId: typeof e?.requestId === 'string' ? e.requestId : res.headers.get('X-Request-Id'),
    retryAfterMs:
      typeof e?.retryAfterMs === 'number' && Number.isFinite(e.retryAfterMs) ? e.retryAfterMs : retryHeader,
  };
}

export class PlatformClient {
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;
  /** The one refresh in flight (all concurrent 401s wait for it). */
  private refreshing: Promise<Result<StoredSession>> | null = null;

  constructor(private readonly o: ClientOptions) {
    this.fetchFn = o.fetch ?? ((url, init) => fetch(url, init));
    this.timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** True when a session exists on this device (it may still turn out to be revoked). */
  hasSession(): boolean {
    return this.o.tokens.get() !== null;
  }

  // ---------------------------------------------------------------- transport

  /** One HTTP exchange, no refresh. `token` null = anonymous route. */
  private async raw<T>(
    method: string,
    path: string,
    body: unknown,
    token: string | null,
  ): Promise<Result<T>> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const ctl = typeof AbortController === 'undefined' ? null : new AbortController();
    const timer = setTimeout(() => ctl?.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.o.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl?.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch (e) {
      const aborted = (e as { name?: unknown } | null)?.name === 'AbortError';
      return fail(
        'network',
        aborted ? 'The player service did not answer in time.' : 'No connection to the player service.',
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return { ok: false, error: await errorOf(res) };
    if (res.status === 204) return ok(undefined as T);
    try {
      return ok((await res.json()) as T);
    } catch {
      return fail('bad_response', 'The player service sent an unreadable answer.', res.status);
    }
  }

  /**
   * An authenticated call. A 401 `unauthenticated` refreshes the session ONCE (shared with every other call that failed with
   * the same access token) and repeats the request with the new token.
   */
  async call<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
    const used = this.o.tokens.get();
    if (!used) return fail('unauthenticated', 'Not signed in.', 401);
    const first = await this.raw<T>(method, path, body, used.accessToken);
    if (first.ok || first.error.status !== 401 || first.error.code !== 'unauthenticated') return first;
    const fresh = await this.refresh(used);
    if (!fresh.ok) return fresh;
    return this.raw<T>(method, path, body, fresh.value.accessToken);
  }

  /**
   * Rotates the session. If another call (or another tab) already rotated it since `used` was read, the new tokens are used
   * as they are; otherwise one `POST /v1/auth/refresh` runs and every caller waits for it. The refresh token sent is always
   * the newest one known, and it is replaced in storage before anyone can send it again.
   */
  private refresh(used: StoredSession): Promise<Result<StoredSession>> {
    if (this.refreshing) return this.refreshing;
    const current = this.o.tokens.get();
    if (!current) return Promise.resolve(fail('unauthenticated', 'Not signed in.', 401));
    if (current.accessToken !== used.accessToken) return Promise.resolve(ok(current));
    const run = async (): Promise<Result<StoredSession>> => {
      const r = await this.raw<{ tokens: Tokens }>(
        'POST',
        '/v1/auth/refresh',
        {
          refreshToken: current.refreshToken,
        },
        null,
      );
      if (r.ok) {
        this.o.tokens.set(r.value.tokens);
        return ok(this.o.tokens.get() ?? { v: 1, ...r.value.tokens });
      }
      // the session is gone (expired, revoked, or the token was already used): forget it, never present it again
      if (r.error.status === 400 || r.error.status === 401) {
        if (this.o.tokens.get()?.refreshToken === current.refreshToken) this.o.tokens.clear();
      }
      return r;
    };
    const p = run().finally(() => {
      if (this.refreshing === p) this.refreshing = null;
    });
    this.refreshing = p;
    return p;
  }

  // ---------------------------------------------------------------- identity

  /**
   * Signs this device in as a guest when it has no platform session yet, and returns the profile. An existing session is
   * reused (refreshed when needed); a session the platform no longer knows is replaced by a new guest. A platform that does
   * not answer is an error: the caller keeps the guest-only online play.
   */
  async ensureGuest(nickname?: string, inviteCode?: string): Promise<Result<MyProfile>> {
    if (this.hasSession()) {
      const me = await this.me();
      if (me.ok || me.error.code !== 'unauthenticated') return me;
      this.o.tokens.clear();
    }
    const create = (name?: string) =>
      this.raw<{ profile: MyProfile; tokens: Tokens }>(
        'POST',
        '/v1/auth/guest',
        {
          platform: 'web',
          ...(name ? { nickname: name } : {}),
          ...(inviteCode ? { inviteCode } : {}),
        },
        null,
      );
    let r = await create(nickname);
    // the chosen name is taken or not allowed: the platform picks one (it can be changed afterwards)
    if (!r.ok && nickname && (r.error.code === 'name_taken' || r.error.code === 'name_rejected'))
      r = await create();
    if (!r.ok) return r;
    this.o.tokens.set(r.value.tokens);
    return ok(r.value.profile);
  }

  async me(): Promise<Result<MyProfile>> {
    const r = await this.call<{ profile: MyProfile }>('GET', '/v1/me');
    return r.ok ? ok(r.value.profile) : r;
  }

  async setNickname(displayName: string): Promise<Result<MyProfile>> {
    const r = await this.call<{ profile: MyProfile }>('PATCH', '/v1/me', { displayName });
    return r.ok ? ok(r.value.profile) : r;
  }

  /** The fighter the ticket names (the platform validates it against the roster). */
  async setFighter(selectedCharacter: string): Promise<Result<MyProfile>> {
    const r = await this.call<{ profile: MyProfile }>('PATCH', '/v1/me', { selectedCharacter });
    return r.ok ? ok(r.value.profile) : r;
  }

  /** Presence heartbeat (`PUT /v1/presence`): the platform forgets it after 90 s. */
  heartbeat(status: 'online' | 'away' = 'online'): Promise<Result<void>> {
    return this.call('PUT', '/v1/presence', { status });
  }

  // ---------------------------------------------------------------- friends and blocks

  async friends(): Promise<Result<FriendView[]>> {
    const r = await this.call<{ friends: FriendView[] }>('GET', '/v1/friends');
    return r.ok ? ok(r.value.friends) : r;
  }
  requests(): Promise<Result<{ incoming: RequestView[]; outgoing: RequestView[] }>> {
    return this.call('GET', '/v1/friends/requests');
  }
  sendFriendRequest(code: string): Promise<Result<{ status: 'pending' | 'accepted'; requestId: string }>> {
    return this.call('POST', '/v1/friends/requests', { code });
  }
  acceptRequest(id: string): Promise<Result<unknown>> {
    return this.call('POST', `/v1/friends/requests/${enc(id)}/accept`);
  }
  declineRequest(id: string): Promise<Result<void>> {
    return this.call('POST', `/v1/friends/requests/${enc(id)}/decline`);
  }
  cancelRequest(id: string): Promise<Result<void>> {
    return this.call('DELETE', `/v1/friends/requests/${enc(id)}`);
  }
  removeFriend(playerId: string): Promise<Result<void>> {
    return this.call('DELETE', `/v1/friends/${enc(playerId)}`);
  }
  async blocks(): Promise<Result<BlockView[]>> {
    const r = await this.call<{ blocks: BlockView[] }>('GET', '/v1/blocks');
    return r.ok ? ok(r.value.blocks) : r;
  }
  block(playerId: string): Promise<Result<void>> {
    return this.call('PUT', `/v1/blocks/${enc(playerId)}`);
  }
  unblock(playerId: string): Promise<Result<void>> {
    return this.call('DELETE', `/v1/blocks/${enc(playerId)}`);
  }

  // ---------------------------------------------------------------- mutes and reports

  async mutes(): Promise<Result<MuteView[]>> {
    const r = await this.call<{ mutes: MuteView[] }>('GET', '/v1/mutes');
    return r.ok ? ok(r.value.mutes) : r;
  }
  mute(playerId: string): Promise<Result<void>> {
    return this.call('PUT', `/v1/mutes/${enc(playerId)}`);
  }
  unmute(playerId: string): Promise<Result<void>> {
    return this.call('DELETE', `/v1/mutes/${enc(playerId)}`);
  }
  report(input: ReportInput): Promise<Result<{ id: string; duplicate: boolean }>> {
    const body: Record<string, unknown> = {
      reportedId: input.reportedId,
      category: input.category,
      context: input.context,
    };
    if (input.contextRef) body.contextRef = input.contextRef;
    if (input.note) body.note = input.note;
    return this.call('POST', '/v1/reports', body);
  }

  // ---------------------------------------------------------------- parties

  private async party(method: string, path: string, body?: unknown): Promise<Result<PartyView>> {
    const r = await this.call<{ party: PartyView }>(method, path, body);
    return r.ok ? ok(r.value.party) : r;
  }
  async currentParty(): Promise<Result<PartyView | null>> {
    const r = await this.call<{ party: PartyView | null }>('GET', '/v1/parties/current');
    return r.ok ? ok(r.value.party) : r;
  }
  createParty(mode: PartyMode): Promise<Result<PartyView>> {
    return this.party('POST', '/v1/parties', { mode });
  }
  joinParty(code: string): Promise<Result<PartyView>> {
    return this.party('POST', '/v1/parties/join', { code });
  }
  setPartyMode(partyId: string, mode: PartyMode): Promise<Result<PartyView>> {
    return this.party('PATCH', `/v1/parties/${enc(partyId)}`, { mode });
  }
  leaveParty(partyId: string): Promise<Result<void>> {
    return this.call('POST', `/v1/parties/${enc(partyId)}/leave`);
  }
  setReady(partyId: string, ready: boolean): Promise<Result<PartyView>> {
    return this.party('POST', `/v1/parties/${enc(partyId)}/ready`, { ready });
  }
  kick(partyId: string, playerId: string): Promise<Result<PartyView>> {
    return this.party('POST', `/v1/parties/${enc(partyId)}/kick`, { playerId });
  }
  promote(partyId: string, playerId: string): Promise<Result<PartyView>> {
    return this.party('POST', `/v1/parties/${enc(partyId)}/promote`, { playerId });
  }
  async invite(partyId: string, friendId: string): Promise<Result<InviteView>> {
    const r = await this.call<{ invite: InviteView }>('POST', `/v1/parties/${enc(partyId)}/invites`, {
      friendId,
    });
    return r.ok ? ok(r.value.invite) : r;
  }
  async history(): Promise<Result<HistoryView[]>> {
    const r = await this.call<{ matches: HistoryView[] }>('GET', '/v1/me/matches');
    return r.ok ? ok(r.value.matches) : r;
  }
  async invites(): Promise<Result<InviteView[]>> {
    const r = await this.call<{ invites: InviteView[] }>('GET', '/v1/invites');
    return r.ok ? ok(r.value.invites) : r;
  }
  acceptInvite(inviteId: string): Promise<Result<PartyView>> {
    return this.party('POST', `/v1/invites/${enc(inviteId)}/accept`);
  }
  declineInvite(inviteId: string): Promise<Result<void>> {
    return this.call('POST', `/v1/invites/${enc(inviteId)}/decline`);
  }
  /** Leader: tell the party which private room it plays in. */
  openMatch(partyId: string, roomCode: string): Promise<Result<PartyView>> {
    return this.party('POST', `/v1/parties/${enc(partyId)}/match`, { roomCode });
  }
  /** Leader: the party is a lobby again (room abandoned). */
  closeMatch(partyId: string): Promise<Result<PartyView>> {
    return this.party('DELETE', `/v1/parties/${enc(partyId)}/match`);
  }
  /** A fresh single-use ticket: a HOST ticket for the leader before the room exists, else one bound to the party's room. */
  ticket(partyId: string): Promise<Result<TicketView>> {
    return this.call('POST', `/v1/parties/${enc(partyId)}/match/ticket`);
  }
}

const enc = (s: string): string => encodeURIComponent(s);
