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
import { LocalPredictor, PlayerOverlay } from './prediction';
import type { PredictionConfig, PredictionStats } from './prediction';
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

export interface DriverOptions {
  /**
   * Local movement prediction of the local fighter (decisions ON4-ON5, docs/ONLINE_PREDICTION.md): presentation only, the
   * server stays authoritative. Off by default; `true` or a partial config turns it on (the browser session enables it
   * unless the page has `?nopredict`, see `predictionFromSearch`).
   */
  prediction?: boolean | Partial<PredictionConfig>;
  /** Debug / tests: after every overlay revert, check the local player is bit-identical to its authoritative copy. */
  verifyOverlay?: boolean;
}

/** `RemoteStatus` plus prediction diagnostics (the HUD chip reads only the `RemoteStatus` part). */
export interface DriverStatus extends RemoteStatus {
  predictionEnabled: boolean;
  prediction: PredictionStats | null;
}

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
  /** Null when prediction is off. */
  predictor: LocalPredictor | null;
  /** The in-place overlay of the predicted step fields on the replica's local player (overlay.ts). */
  readonly overlay: PlayerOverlay;
  private readonly predictionConfig: Partial<PredictionConfig> | null;
  private lastAlpha = 0;

  constructor(
    private readonly deps: DriverDeps,
    opts: DriverOptions = {},
  ) {
    const p = opts.prediction ?? false;
    this.predictionConfig = p === false ? null : p === true ? {} : p;
    this.predictor = this.predictionConfig ? new LocalPredictor(this.predictionConfig) : null;
    this.overlay = new PlayerOverlay(opts.verifyOverlay ?? false);
  }

  // ---------------------------------------------------------------- RemoteMatchDriver

  get localId(): number {
    return this.seat_ ?? 0;
  }

  state(): GameState | null {
    return this.replica?.state ?? null;
  }

  /**
   * The overlay protocol (decision ON4): (a) revert the local player to its saved authoritative values, (b) play the
   * server's frames (patches and hash checks see only authoritative data), (c) save the new authoritative values and draw
   * the prediction over them. Between two calls the replica's local player shows the prediction; nothing else changes.
   */
  advance(dtMs: number): { events: SimEvent[]; alpha: number } {
    const replica = this.replica;
    this.heartbeat();
    this.overlay.revert(); // (a)
    if (!replica?.state || this.disposed) return { events: [], alpha: 0 };
    if (replica.resyncReason) this.requestResync(false);
    const out = replica.advance(dtMs); // (b)
    this.lastAlpha = out.alpha;
    this.predict(replica.state, dtMs); // (c)
    return { events: out.events, alpha: out.alpha };
  }

  /**
   * Runs `fn` on the purely authoritative replica (overlay reverted, then put back): anything that hashes, compares or
   * reports the replica (a final-state check against the server's results) must read it through here.
   */
  readAuthoritative<T>(fn: (state: GameState | null) => T): T {
    return this.overlay.withAuthoritative(() => fn(this.replica?.state ?? null));
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
    this.lastSentArrival = this.predictor?.onSent(msg, now) ?? null;
  }

  /** The server tick the last sent input is estimated to arrive at (diagnostics; null without prediction). */
  lastSentArrival: number | null = null;

  status(): DriverStatus {
    return {
      connection: this.connection === 'idle' ? 'closed' : this.connection,
      rttMs: this.rtt,
      bufferedTicks: this.replica?.bufferedTicks ?? 0,
      detail: this.detail,
      predictionEnabled: this.predictor !== null,
      prediction: this.predictor ? { ...this.predictor.stats } : null,
    };
  }

  ended(): boolean {
    return this.results !== null || this.replica?.state?.match.phase === 'ended';
  }

  dispose(): void {
    this.disposed = true;
    this.overlay.revert();
  }

  // ---------------------------------------------------------------- fed by the session

  setConnection(status: ConnStatus, detail: string | null): void {
    this.connection = status;
    this.detail = status === 'connected' ? null : detail;
    if (status === 'reconnecting' || status === 'closed') {
      this.sent = { m: null, h: false };
      this.predictor?.resetInputs();
    }
  }

  onWelcome(msg: WelcomeMsg): void {
    if (!msg.descriptor) return;
    const same = this.replica?.descriptor.matchId === msg.descriptor.matchId;
    if (!same) {
      this.overlay.revert();
      this.replica = new NetReplica(msg.descriptor);
      this.results = null;
      if (this.predictionConfig) this.predictor = new LocalPredictor(this.predictionConfig);
    }
    this.seat_ = msg.seat;
    // a reconnect starts from "nothing held": the server's own latch is gone with the old connection
    this.sent = { m: null, h: false };
    this.predictor?.resetInputs();
  }

  onKeyframe(bytes: Uint8Array): void {
    this.enqueue(bytes, (payload) => {
      const replica = this.replica;
      if (!replica) return;
      this.overlay.revert(); // the overlaid object belongs to the state being replaced
      replica.loadKeyframe(payload as KeyframePayload);
      this.predictor?.resetView();
      if (replica.state) this.onKeyframeLoaded?.(replica.state);
    });
  }

  onFrames(bytes: Uint8Array): void {
    this.enqueue(bytes, (payload) => this.replica?.receive(payload as FramesPayload));
  }

  onPong(msg: PongMsg): void {
    this.rtt = Math.max(0, this.deps.now() - msg.c);
    this.predictor?.onPong(msg.c, msg.t);
  }

  onResults(msg: ResultsMsg): void {
    this.results = msg;
  }

  /** Resolves once every message received so far has been decoded and applied (tests). */
  settled(): Promise<void> {
    return this.inbox;
  }

  // ---------------------------------------------------------------- internals

  /** Step (c) of the overlay protocol: presentation only, the replica's data stays the server's. */
  private predict(state: GameState, dtMs: number): void {
    const predictor = this.predictor;
    if (!predictor || this.seat_ === null) return;
    const fields = predictor.update({
      state,
      seat: this.seat_,
      alpha: this.lastAlpha,
      nowMs: this.deps.now(),
      dtMs,
    });
    const me = state.players[this.seat_];
    if (fields && me) this.overlay.apply(me, fields);
  }

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
