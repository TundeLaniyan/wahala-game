/**
 * The browser side of an online City Rumble match (docs/CITY_RUMBLE_ONLINE.md section 6).
 *
 * It plays the role `MatchController` plays offline, with one difference: it never runs the simulation. It
 *  - feeds server frames into a `NetReplica` and plays them out at 60 ticks/s,
 *  - hands the replica's `GameState` and each tick's `SimEvent`s to the REAL renderer and audio (the same ports the
 *    offline game uses), so the online match looks and sounds like the offline one,
 *  - turns the REAL `InputManager`'s intents into `InputMsg`s (held direction, A held, button presses) and sends only
 *    changes; the server owns every outcome.
 *
 * Ports keep it free of DOM / WebGL / socket code, so it is tested headlessly (server/test/netMatchClient.test.ts).
 */
import { BUTTON, MSG } from '../../src/net/protocol';
import type {
  FramesPayload,
  InputMsg,
  KeyframePayload,
  PongMsg,
  ResultsMsg,
  WelcomeMsg,
} from '../../src/net/protocol';
import { NetReplica } from '../../src/net/replica';
import { unpack } from '../../src/net/pack';
import { pickSpectateTarget } from '../../src/app/spectate';
import { readyToStep } from '../../src/sim';
import type { GameState, Intent, SimEvent } from '../../src/sim';

export interface ClientRendererPort {
  loadGame(state: GameState): void;
  handleEvents(events: readonly SimEvent[], state: GameState): void;
  render(
    state: GameState,
    alpha: number,
    dt: number,
    info: { localPlayerId: number; entryOverlay: null; excitement: number; focusPlayerId: number | null },
  ): void;
}

export interface ClientInputPort {
  pollDevices(): void;
  buildIntent(tick: number, ctx: { canMove?: boolean; remoteReady?: boolean; quickHands?: boolean }): Intent;
  clear(): void;
}

export interface ClientAudioPort {
  startMusic(arenaId?: string): void;
  handleEvents(events: readonly SimEvent[], state: Readonly<GameState>): void;
  setListener?(x: number | null): void;
}

export interface ClientTransport {
  send(type: string, message: unknown): void;
}

export interface ClientDeps {
  renderer: ClientRendererPort;
  input: ClientInputPort;
  audio?: ClientAudioPort;
  transport: ClientTransport;
  /** deflate-raw decompression (browser: DecompressionStream; tests: node:zlib). */
  inflate(bytes: Uint8Array): Promise<Uint8Array>;
  now(): number;
}

/** What the page's overlay shows (no game rule is derived here: it only reads the replica). */
export interface NetHud {
  phase: 'connecting' | 'waiting' | 'playing' | 'ended';
  seat: number | null;
  tick: number;
  rttMs: number | null;
  bufferedTicks: number;
  alive: number;
  me: { name: string; alive: boolean; kills: number; deaths: number } | null;
  secondsLeft: number | null;
  feed: string[];
  resyncs: number;
  hashChecks: number;
  hashMismatches: number;
  bytesIn: number;
}

const FEED_MAX = 6;
const PING_EVERY_MS = 1000;
const RESYNC_GAP_MS = 1000;
/** City Rumble: events further than this (tiles) from the camera focus are not shown / heard (as offline). */
const NEAR_TILES = 14;

export class NetMatchClient {
  replica: NetReplica | null = null;
  seat: number | null = null;
  results: ResultsMsg | null = null;
  private loaded = false;
  private lastFrameMs = -1;
  private seq = 0;
  private sent: { m: InputMsg['m']; h: boolean } = { m: null, h: false };
  private lastPingMs = -Infinity;
  private lastResyncMs = -Infinity;
  private rtt: number | null = null;
  private spectateId: number | null = null;
  private feed: string[] = [];
  private bytesIn = 0;
  /** Decompression is async: messages decode concurrently but are applied in order through one promise chain. */
  private inbox: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ClientDeps) {}

  // ---------------------------------------------------------------- transport events

  onWelcome(msg: WelcomeMsg): void {
    if (!msg.descriptor) return;
    const sameMatch = this.replica?.descriptor.matchId === msg.descriptor.matchId;
    if (!sameMatch) {
      this.replica = new NetReplica(msg.descriptor);
      this.loaded = false;
      this.results = null;
      this.feed = [];
    }
    this.seat = msg.seat;
    this.sent = { m: null, h: false };
    this.deps.input.clear();
  }

  onKeyframe(bytes: Uint8Array): void {
    this.enqueue(bytes, (payload) => {
      const replica = this.replica;
      if (!replica) return;
      replica.loadKeyframe(payload as KeyframePayload);
      if (!this.loaded && replica.state) {
        this.loaded = true;
        this.deps.renderer.loadGame(replica.state);
        this.deps.audio?.startMusic(replica.state.arenaId);
      }
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

  private enqueue(bytes: Uint8Array, use: (payload: unknown) => void): void {
    this.bytesIn += bytes.byteLength;
    // Start decompressing NOW (many messages overlap) but apply strictly in arrival order: a browser's stream-based
    // inflate needs several event-loop turns per message, and a slow renderer leaves only a turn or two between frames
    // (software WebGL: ~1 fps), so decoding one message at a time would fall hopelessly behind.
    const inflated = this.deps.inflate(bytes);
    inflated.catch(() => undefined); // handled below, in order; no unhandled-rejection noise meanwhile
    this.inbox = this.inbox
      .then(() => inflated)
      .then((raw) => use(unpack(raw)))
      .catch(() => {
        // an undecodable message: the replica can no longer be trusted, ask for a keyframe
        this.requestResync(true);
      });
  }

  /** Resolves once every message received so far has been decoded (tests). */
  settled(): Promise<void> {
    return this.inbox;
  }

  // ---------------------------------------------------------------- per animation frame

  frame(nowMs: number): void {
    const replica = this.replica;
    const dt = this.lastFrameMs < 0 ? 1000 / 60 : Math.min(250, nowMs - this.lastFrameMs);
    this.lastFrameMs = nowMs;
    if (nowMs - this.lastPingMs >= PING_EVERY_MS) {
      this.lastPingMs = nowMs;
      this.deps.transport.send(MSG.ping, { c: this.deps.now() });
    }
    if (!replica?.state) return;
    if (replica.resyncReason) this.requestResync(false);
    this.deps.input.pollDevices();
    const out = replica.advance(dt);
    const state = replica.state;
    this.sendInput(state, Math.max(1, out.steps));
    this.trackFeed(out.events, state);
    const focus = this.focus(state);
    const near = this.nearFocus(out.events, state, focus);
    this.deps.renderer.handleEvents(near, state);
    this.deps.audio?.setListener?.(state.players[focus]?.x ?? null);
    this.deps.audio?.handleEvents(near, state);
    this.deps.renderer.render(state, out.alpha, dt / 1000, {
      localPlayerId: this.seat ?? 0,
      entryOverlay: null,
      excitement: 0.4,
      focusPlayerId: this.spectateId,
    });
  }

  private requestResync(force: boolean): void {
    const now = this.deps.now();
    if (!force && now - this.lastResyncMs < RESYNC_GAP_MS) return;
    this.lastResyncMs = now;
    this.deps.transport.send(MSG.resync, {});
  }

  /**
   * Reads the real input layer (keyboard / gamepad / touch, the same A/B tap-and-hold rules as offline) and sends what
   * changed. `canMove: true`: the press-to-step buffering happens on the SERVER (it latches a new press until it
   * produces a step), because only the server knows when the authoritative step finishes.
   */
  private sendInput(state: GameState, ticks: number): void {
    if (this.seat === null) return;
    const me = state.players[this.seat];
    if (!me) return;
    let buttons = 0;
    let move: InputMsg['m'] = null;
    let held = false;
    for (let i = 0; i < ticks; i++) {
      const intent = this.deps.input.buildIntent(state.tick + i, {
        canMove: true,
        remoteReady: me.remote && state.generators.some((g) => g.ownerId === me.id && g.mode === 'remote'),
        quickHands: me.streakRewards.quickHandsUntil > state.tick,
      });
      if (intent.place) buttons |= BUTTON.place;
      if (intent.special) buttons |= BUTTON.special;
      if (intent.detonate) buttons |= BUTTON.detonate;
      move = intent.move ?? null;
      held = intent.placeHeld === true;
    }
    if (buttons === 0 && move === this.sent.m && held === this.sent.h) return;
    this.sent = { m: move, h: held };
    const msg: InputMsg = { s: this.seq++, m: move, h: held, b: buttons };
    this.deps.transport.send(MSG.input, msg);
  }

  private focus(state: GameState): number {
    const seat = this.seat ?? 0;
    const me = state.players[seat];
    if (me?.alive) {
      this.spectateId = null;
      return seat;
    }
    this.spectateId = pickSpectateTarget(state, seat, this.spectateId);
    return this.spectateId ?? seat;
  }

  private nearFocus(events: SimEvent[], state: GameState, focus: number): SimEvent[] {
    const f = state.players[focus];
    if (!f) return events;
    return events.filter((e) => {
      const at = e as { x?: unknown; y?: unknown };
      if (typeof at.x !== 'number' || typeof at.y !== 'number') return true;
      return Math.abs(at.x - f.x) <= NEAR_TILES && Math.abs(at.y - f.y) <= NEAR_TILES;
    });
  }

  private trackFeed(events: SimEvent[], state: GameState): void {
    for (const e of events) {
      if (e.type !== 'playerEliminated') continue;
      const who = state.players[e.playerId]?.name ?? '?';
      const by = e.creditId !== null ? state.players[e.creditId]?.name : null;
      this.feed.push(by && by !== who ? `${by} got ${who}` : `${who} is out`);
      if (this.feed.length > FEED_MAX) this.feed.shift();
    }
  }

  hud(): NetHud {
    const r = this.replica;
    const s = r?.state ?? null;
    const me = s && this.seat !== null ? s.players[this.seat] : undefined;
    const left =
      s && s.settings.durationSec !== null
        ? Math.max(0, Math.ceil((s.config.match.durationTicks - s.match.playTicks) / 60))
        : null;
    return {
      phase: !r ? 'connecting' : !s ? 'waiting' : s.match.phase === 'ended' ? 'ended' : 'playing',
      seat: this.seat,
      tick: s?.tick ?? -1,
      rttMs: this.rtt,
      bufferedTicks: r?.bufferedTicks ?? 0,
      alive: s ? s.players.filter((p) => p.alive).length : 0,
      me: me ? { name: me.name, alive: me.alive, kills: me.stats.kills, deaths: me.stats.deaths } : null,
      secondsLeft: left,
      feed: [...this.feed],
      resyncs: r?.stats.resyncs ?? 0,
      hashChecks: r?.stats.hashChecks ?? 0,
      hashMismatches: r?.stats.hashMismatches ?? 0,
      bytesIn: this.bytesIn,
    };
  }

  /** Whether the local player's current step is finishing (exposed for diagnostics only). */
  readyToStep(): boolean {
    const s = this.replica?.state;
    const me = s && this.seat !== null ? s.players[this.seat] : undefined;
    return me ? readyToStep(me) : false;
  }
}
