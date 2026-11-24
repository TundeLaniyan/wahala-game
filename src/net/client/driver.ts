/**
 * The online match driver (decision ON3): what `MatchController.startRemote` plays. It holds the server replica
 * (`NetReplica`), plays the server's frames out at 60 ticks/s and turns the local intent into the wire input. It NEVER
 * simulates the match: the server owns movement validity, generators, collisions, explosions, damage and results.
 * Port of the foundation's dev client (`server/client/NetMatchClient.ts`) minus the rendering, which the controller keeps.
 * Ports (transport, inflate, clock) keep it free of sockets and the DOM so it is tested headlessly.
 */
import type { RemoteMatchDriver, RemoteStatus } from '../../app/remoteMatch';
import type { GameState, Intent, SimEvent } from '../../sim';
import { unpack } from '../pack';
import { BUTTON, MSG } from '../protocol';
import type { FramesPayload, InputMsg, KeyframePayload, PongMsg, ResultsMsg, WelcomeMsg } from '../protocol';
import { NetReplica } from '../replica';
import type { ConnStatus } from './types';

export interface DriverDeps {
  /** Sends a message to the room; a no-op while disconnected (inputs and pings are stale by then). */
  send(type: string, message?: unknown): void;
  /** deflate-raw decompression (browser: DecompressionStream; tests: node:zlib). */
  inflate(bytes: Uint8Array): Promise<Uint8Array>;
  /** Monotonic milliseconds. */
  now(): number;
}

/**
 * A held-state change (direction, A held) is sent at most this often; a button press is sent at once. Keeps an honest client
 * at <= ~30 input messages/s whatever the frame rate, far below the server's sustained-flood limit.
 */
export const MIN_STATE_SEND_MS = 33;
export const PING_EVERY_MS = 1000;
export const RESYNC_GAP_MS = 1000;

export class NetMatchDriver implements RemoteMatchDriver {
  replica: NetReplica | null = null;
  results: ResultsMsg | null = null;
  readonly stats = { bytesIn: 0, inputsSent: 0, resyncRequests: 0 };
  private seat_: number | null = null;
  private connection: ConnStatus = 'connecting';
  private detail: string | null = null;
  private rtt: number | null = null;
  private seq = 0;
  private sent: { m: InputMsg['m']; h: boolean } = { m: null, h: false };
  private lastSendMs = -Infinity;
  private lastPingMs = -Infinity;
  private lastResyncMs = -Infinity;
  private disposed = false;
  /** Called after every applied keyframe (first load and every resync); the session uses it for `matchReady`. */
  onKeyframeLoaded: ((state: GameState) => void) | null = null;
  /** Decompression is async: messages decode concurrently but are applied in order through one promise chain. */
  private inbox: Promise<void> = Promise.resolve();

  constructor(private readonly deps: DriverDeps) {}

  // ---------------------------------------------------------------- RemoteMatchDriver

  get localId(): number {
    return this.seat_ ?? 0;
  }

  state(): GameState | null {
    return this.replica?.state ?? null;
  }

  advance(dtMs: number): { events: SimEvent[]; alpha: number } {
    const replica = this.replica;
    this.heartbeat();
    if (!replica?.state || this.disposed) return { events: [], alpha: 0 };
    if (replica.resyncReason) this.requestResync(false);
    const out = replica.advance(dtMs);
    return { events: out.events, alpha: out.alpha };
  }

  sendIntent(intent: Intent, state: GameState, _ticks: number): void {
    void state;
    void _ticks;
    if (this.disposed || this.seat_ === null) return;
    let buttons = 0;
    if (intent.place) buttons |= BUTTON.place;
    if (intent.special) buttons |= BUTTON.special;
    if (intent.detonate) buttons |= BUTTON.detonate;
    const move: InputMsg['m'] = intent.move ?? null;
    const held = intent.placeHeld === true;
    if (buttons === 0 && move === this.sent.m && held === this.sent.h) return;
    const now = this.deps.now();
    if (buttons === 0 && now - this.lastSendMs < MIN_STATE_SEND_MS) return; // resent next frame if still changed
    this.lastSendMs = now;
    this.sent = { m: move, h: held };
    const msg: InputMsg = { s: this.seq++, m: move, h: held, b: buttons };
    this.stats.inputsSent++;
    this.deps.send(MSG.input, msg);
  }

  status(): RemoteStatus {
    return {
      connection: this.connection === 'idle' ? 'closed' : this.connection,
      rttMs: this.rtt,
      bufferedTicks: this.replica?.bufferedTicks ?? 0,
      detail: this.detail,
    };
  }

  ended(): boolean {
    return this.results !== null || this.replica?.state?.match.phase === 'ended';
  }

  dispose(): void {
    this.disposed = true;
  }

  // ---------------------------------------------------------------- fed by the session

  setConnection(status: ConnStatus, detail: string | null): void {
    this.connection = status;
    this.detail = status === 'connected' ? null : detail;
    if (status === 'reconnecting' || status === 'closed') this.sent = { m: null, h: false };
  }

  onWelcome(msg: WelcomeMsg): void {
    if (!msg.descriptor) return;
    const same = this.replica?.descriptor.matchId === msg.descriptor.matchId;
    if (!same) {
      this.replica = new NetReplica(msg.descriptor);
      this.results = null;
    }
    this.seat_ = msg.seat;
    // a reconnect starts from "nothing held": the server's own latch is gone with the old connection
    this.sent = { m: null, h: false };
  }

  onKeyframe(bytes: Uint8Array): void {
    this.enqueue(bytes, (payload) => {
      const replica = this.replica;
      if (!replica) return;
      replica.loadKeyframe(payload as KeyframePayload);
      if (replica.state) this.onKeyframeLoaded?.(replica.state);
    });
  }

  onFrames(bytes: Uint8Array): void {
    this.enqueue(bytes, (payload) => this.replica?.receive(payload as FramesPayload));
  }

  onPong(msg: PongMsg): void {
    this.rtt = Math.max(0, this.deps.now() - msg.c);
  }

  onResults(msg: ResultsMsg): void {
    this.results = msg;
  }

  /** Resolves once every message received so far has been decoded and applied (tests). */
  settled(): Promise<void> {
    return this.inbox;
  }

  // ---------------------------------------------------------------- internals

  private enqueue(bytes: Uint8Array, use: (payload: unknown) => void): void {
    this.stats.bytesIn += bytes.byteLength;
    // start decompressing NOW (many messages overlap) but apply strictly in arrival order
    const inflated = this.deps.inflate(bytes);
    inflated.catch(() => undefined);
    this.inbox = this.inbox
      .then(() => inflated)
      .then((raw) => use(unpack(raw)))
      .catch(() => {
        // an undecodable message: the replica can no longer be trusted, ask for a keyframe
        this.requestResync(true);
      });
  }

  private heartbeat(): void {
    const now = this.deps.now();
    if (now - this.lastPingMs >= PING_EVERY_MS) {
      this.lastPingMs = now;
      this.deps.send(MSG.ping, { c: now });
    }
  }

  private requestResync(force: boolean): void {
    const now = this.deps.now();
    if (!force && now - this.lastResyncMs < RESYNC_GAP_MS) return;
    this.lastResyncMs = now;
    this.stats.resyncRequests++;
    this.deps.send(MSG.resync, {});
  }
}
