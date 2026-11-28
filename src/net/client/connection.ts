/**
 * The browser's connection to a City Rumble room over the Colyseus SDK: creates / joins, fans the room's messages out to
 * handlers and reports connection health. Reconnection is the SDK's own (0.18: after a drop it retries the same session with
 * the single-use token it keeps IN MEMORY, never in storage; the server then re-sends welcome + keyframe). Imported only
 * from the online chunk (docs/ONLINE_INTEGRATION.md): a public build never contains it. Nothing here runs until the player
 * opens a room.
 */
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { MSG, parseBusy } from '../protocol';
import type { LobbyMsg, NoticeMsg, PongMsg, ResultsMsg, SignalInMsg, WelcomeMsg } from '../protocol';
import type { ConnStatus, OpenRequest, RumbleSessionEvents } from './types';

export interface ConnHandlers {
  welcome(m: WelcomeMsg): void;
  lobby(m: LobbyMsg): void;
  keyframe(bytes: Uint8Array): void;
  frames(bytes: Uint8Array): void;
  pong(m: PongMsg): void;
  results(m: ResultsMsg): void;
  notice(m: NoticeMsg): void;
  signal(m: SignalInMsg): void;
  status(s: ConnStatus, detail: string): void;
}

/** Attempts (backoff 0.2 s ... 2 s) outlast the server's reserved window (30 s by default) even on a slow page. */
export const MAX_RETRIES = 30;
const MAX_DELAY_MS = 2000;

/** `ws://host:2567` -> the HTTP origin the SDK wants (`http(s)://` and `ws(s)://` are both accepted). */
export function serverHttpUrl(url: string): string {
  return url.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:');
}

type FailReason = Parameters<RumbleSessionEvents['failed']>[0];

/**
 * This page's temporary guest session id: 128 random bits, made on first use, kept in memory ONLY (never in storage: a
 * reload is a new guest). The server keys its per-player limits on it (decision FU2S-C3).
 */
let guestId: string | null = null;
export function guestSessionId(): string {
  if (guestId === null) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    guestId = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  return guestId;
}

/** Maps whatever the SDK / fetch threw to a reason the player can be told about in plain words. */
export function classifyFailure(error: unknown): {
  reason: FailReason;
  detail: string;
  retryAfterSec?: number;
} {
  const e = error as { code?: unknown; message?: unknown; name?: unknown } | null;
  const message = typeof e?.message === 'string' ? e.message : String(error);
  const code = typeof e?.code === 'number' ? e.code : null;
  // the server's own refusals carry a code and a retry time in the message (protocol `encodeBusy`)
  const busy = parseBusy(message);
  if (busy?.code === 'server_busy')
    return { reason: 'server-busy', detail: busy.text, retryAfterSec: busy.retryAfterSec };
  if (busy?.code === 'rate_limited')
    return { reason: 'rate-limited', detail: busy.text, retryAfterSec: busy.retryAfterSec };
  if (busy?.code === 'room_unavailable') return { reason: 'room-unavailable', detail: busy.text };
  // a platform match ticket the server would not take (expired, already used, for another room): fetch a new one
  if (/\bticket\b/i.test(message)) return { reason: 'ticket', detail: message };
  if (code === 4212 || /not found|invalid room|no rooms? (found|available)/i.test(message))
    return { reason: 'room-not-found', detail: message };
  // a match that already started: the server locks the room at the countdown's end (nobody new joins; only the players
  // already in it can reconnect), or refuses the join itself ("the match has started")
  if (/locked|match has started|already started|in progress/i.test(message))
    return { reason: 'match-started', detail: message };
  if (/full|max(imum)? clients|no seats/i.test(message)) return { reason: 'room-full', detail: message };
  if (/protocol|version/i.test(message)) return { reason: 'protocol', detail: message };
  if (code !== null && code >= 4000 && code < 5000) return { reason: 'refused', detail: message };
  if (
    e?.name === 'TypeError' ||
    /fetch|network|failed to|ECONN|ENOTFOUND|timeout|timed out|websocket|socket|refused|offline|CORS/i.test(
      message,
    )
  )
    return { reason: 'unreachable', detail: message };
  return { reason: 'unknown', detail: message };
}

export class Connection {
  room: Room | null = null;
  status: ConnStatus = 'idle';
  private droppedAt = 0;

  constructor(
    private readonly url: string,
    private readonly handlers: ConnHandlers,
  ) {}

  get roomId(): string | null {
    return this.room?.roomId ?? null;
  }

  async open(req: OpenRequest): Promise<void> {
    await this.close();
    this.setStatus('connecting', 'opening the room');
    const sdk = new Client(serverHttpUrl(this.url));
    // the SDK sends `credentials: 'include'` by default; the server's CORS answer (origin echo, no credentials) is for cookie-less
    // cross-origin requests, which is all this client needs. `same-origin` keeps that (no cookie ever goes to another origin) and lets a
    // page served from its server's own address send the access cookie of the founder-laptop tunnel (docs/ops/BETA_TUNNEL_TESTING.md)
    (sdk.http as unknown as { options: { credentials?: string } }).options.credentials = 'same-origin';
    const who = { name: req.who.name, characterId: req.who.characterId, gid: guestSessionId() };
    let room: Room;
    // a platform ticket goes with create / join only (never Quick Play), and only when the player has one
    if (req.kind === 'create')
      room = await sdk.create('rumble', {
        ...who,
        private: true,
        ...(req.ticket ? { ticket: req.ticket } : {}),
      });
    else if (req.kind === 'join')
      room = await sdk.joinById(req.code, { ...who, ...(req.ticket ? { ticket: req.ticket } : {}) });
    else room = await sdk.joinOrCreate('rumble', { ...who, mode: req.mode });
    this.attach(room);
  }

  private attach(room: Room): void {
    this.room = room;
    room.reconnection.maxRetries = MAX_RETRIES;
    room.reconnection.maxDelay = MAX_DELAY_MS;
    // the SDK gives up at once on a connection younger than `minUptime` (5 s). A phone that drops while its match is still
    // loading is exactly that case, and the server holds the seat anyway: always try to come back.
    room.reconnection.minUptime = 0;
    const h = this.handlers;
    room.onMessage(MSG.welcome, (m: WelcomeMsg) => h.welcome(m));
    room.onMessage(MSG.lobby, (m: LobbyMsg) => h.lobby(m));
    room.onMessage(MSG.keyframe, (b: Uint8Array) => h.keyframe(b));
    room.onMessage(MSG.frames, (b: Uint8Array) => h.frames(b));
    room.onMessage(MSG.pong, (m: PongMsg) => h.pong(m));
    room.onMessage(MSG.results, (m: ResultsMsg) => h.results(m));
    room.onMessage(MSG.notice, (m: NoticeMsg) => h.notice(m));
    room.onMessage(MSG.signalIn, (m: SignalInMsg) => h.signal(m));
    room.onDrop((code) => {
      this.droppedAt = performance.now();
      this.setStatus('reconnecting', `connection lost (${code})`);
    });
    room.onReconnect(() => {
      this.setStatus('connected', `reconnected after ${Math.round(performance.now() - this.droppedAt)} ms`);
    });
    room.onLeave((code, reason) => {
      if (this.room === room) this.setStatus('closed', reason ? `${code}: ${reason}` : String(code));
    });
    this.setStatus('connected', 'joined');
  }

  private setStatus(s: ConnStatus, detail: string): void {
    this.status = s;
    this.handlers.status(s, detail);
  }

  /** Sends a message; while the socket is down nothing is queued (inputs and pings are stale by then). */
  send(type: string, message?: unknown): void {
    if (!this.room || this.status !== 'connected') return;
    this.room.send(type, message);
  }

  async close(): Promise<void> {
    const room = this.room;
    this.room = null;
    this.status = 'idle';
    if (!room) return;
    try {
      await room.leave();
    } catch {
      /* already closed */
    }
  }
}
