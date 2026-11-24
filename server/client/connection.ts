/**
 * The page's connection to a City Rumble room: creates / joins through the Colyseus SDK, fans the room's messages out
 * to handlers, and reports connection health. Reconnection is the SDK's own (0.18: after a drop it retries the same
 * session with the single-use token it keeps IN MEMORY; the server then re-sends welcome + keyframe).
 */
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { MSG } from '../../src/net/protocol';
import type { LobbyMsg, NoticeMsg, PongMsg, ResultsMsg, WelcomeMsg } from '../../src/net/protocol';

export type ConnStatus = 'idle' | 'connected' | 'reconnecting' | 'closed';

export interface ConnHandlers {
  welcome(m: WelcomeMsg): void;
  lobby(m: LobbyMsg): void;
  keyframe(bytes: Uint8Array): void;
  frames(bytes: Uint8Array): void;
  pong(m: PongMsg): void;
  results(m: ResultsMsg): void;
  notice(m: NoticeMsg): void;
  status(s: ConnStatus, detail: string): void;
}

export interface JoinInfo {
  name: string;
  characterId: string;
}

/** What the page can ask for when it opens a room. */
export type OpenRequest =
  | { kind: 'create'; who: JoinInfo }
  | { kind: 'join'; who: JoinInfo; code: string }
  | { kind: 'quick'; who: JoinInfo };

export interface ReconnectStats {
  drops: number;
  reconnects: number;
  /** Wall-clock ms of the last drop-to-reconnect. */
  lastRecoveryMs: number | null;
}

/** Attempts (backoff 0.2 s ... 2 s) outlast the server's 30 s reconnection window even on a slow page. */
const MAX_RETRIES = 30;

/** `ws://host:2567` (or `?server=`) -> the HTTP origin the SDK wants. */
export function serverHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:');
}

export class Connection {
  room: Room | null = null;
  status: ConnStatus = 'idle';
  readonly stats: ReconnectStats = { drops: 0, reconnects: 0, lastRecoveryMs: null };
  /** Wall-clock log of drops / reconnects / leaves (diagnostics). */
  readonly timeline: { at: number; event: string }[] = [];
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
    const sdk = new Client(serverHttpUrl(this.url));
    // the SDK sends `credentials: 'include'` by default; the server's CORS answer (origin echo, no credentials) is for
    // cookie-less requests, which is all this client needs
    (sdk.http as unknown as { options: { credentials?: string } }).options.credentials = 'omit';
    const who = { name: req.who.name, characterId: req.who.characterId };
    let room: Room;
    if (req.kind === 'create') room = await sdk.create('rumble', { ...who, private: true });
    else if (req.kind === 'join') room = await sdk.joinById(req.code, who);
    else room = await sdk.joinOrCreate('rumble', who);
    this.attach(room);
  }

  private attach(room: Room): void {
    this.room = room;
    room.reconnection.maxRetries = MAX_RETRIES;
    room.reconnection.maxDelay = 2000;
    const h = this.handlers;
    room.onMessage(MSG.welcome, (m: WelcomeMsg) => h.welcome(m));
    room.onMessage(MSG.lobby, (m: LobbyMsg) => h.lobby(m));
    room.onMessage(MSG.keyframe, (b: Uint8Array) => h.keyframe(b));
    room.onMessage(MSG.frames, (b: Uint8Array) => h.frames(b));
    room.onMessage(MSG.pong, (m: PongMsg) => h.pong(m));
    room.onMessage(MSG.results, (m: ResultsMsg) => h.results(m));
    room.onMessage(MSG.notice, (m: NoticeMsg) => h.notice(m));
    room.onDrop((code) => {
      this.stats.drops++;
      this.droppedAt = performance.now();
      this.setStatus('reconnecting', `connection lost (${code})`);
    });
    room.onReconnect(() => {
      this.stats.reconnects++;
      this.stats.lastRecoveryMs = Math.round(performance.now() - this.droppedAt);
      this.setStatus('connected', 'reconnected');
    });
    room.onLeave((code, reason) => {
      if (this.room === room) this.setStatus('closed', reason ? `${code}: ${reason}` : String(code));
    });
    this.setStatus('connected', 'joined');
  }

  private setStatus(s: ConnStatus, detail: string): void {
    this.timeline.push({ at: Date.now(), event: `${s}: ${detail}` });
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
