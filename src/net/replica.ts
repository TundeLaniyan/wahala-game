/**
 * The client's copy of an authoritative City Rumble match (docs/CITY_RUMBLE_ONLINE.md section 4.5).
 *
 * `state` is a full `GameState` the real renderer, HUD and audio can read exactly as in local play:
 *  - its static part (`config`) is rebuilt locally from the public descriptor with the same `createGame`, never sent;
 *  - its public part comes from the server: a keyframe, then one frame per tick (`predict` + `applyPatch`, the same two
 *    steps the server ran on its mirror, so both stay identical; checked against the server's hash);
 *  - its secret part (`seed`, `rngState`, `hidden`) is a harmless placeholder: the client cannot know it.
 *
 * The client never calls `tick`. Frames are queued on arrival and played out at 60 ticks/s by `advance` from a small
 * adaptive jitter buffer, so motion is the server's exact tick sequence, smoothly, a little in the past.
 */
import { createGame } from '../sim';
import type { GameState, SimEvent } from '../sim';
import { PatchError, applyPatch } from './delta';
import { canonicalHash } from './hash';
import { predict } from './predict';
import type { FramesPayload, KeyframePayload, MatchDescriptor, TickFrame } from './protocol';
import { TICK_RATE } from './protocol';
import { publicState } from './publicState';
import type { PublicState } from './publicState';

const STEP_MS = 1000 / TICK_RATE;

export type ResyncReason = 'gap' | 'patch' | 'hash' | null;

export interface PlayoutOptions {
  /** Ticks of buffer to aim for beyond one send interval (absorbs network jitter). Default 3 (50 ms). */
  jitterTicks?: number;
  /** Beyond this many buffered ticks, skip straight to the target (we fell far behind). Default 45. */
  maxLagTicks?: number;
}

export interface AdvanceResult {
  /** Events of every tick applied this frame, in order (the renderer / audio consume them like local play). */
  events: SimEvent[];
  steps: number;
  /** Fraction of the next tick already elapsed (the renderer's interpolation alpha). */
  alpha: number;
}

export class NetReplica {
  /** Null until the first keyframe. */
  state: GameState | null = null;
  /** Set when the replica can no longer follow the server: the caller asks for a keyframe and calls `loadKeyframe`. */
  resyncReason: ResyncReason = null;
  readonly stats = { framesApplied: 0, hashChecks: 0, hashMismatches: 0, resyncs: 0, skippedAhead: 0 };
  private queue: TickFrame[] = [];
  private hashes = new Map<number, number>();
  private lastQueued = -1;
  private acc = 0;
  private readonly jitterTicks: number;
  private readonly maxLagTicks: number;
  /** Static part of the state, built once per descriptor. */
  private readonly shell: GameState;

  constructor(
    readonly descriptor: MatchDescriptor,
    opts: PlayoutOptions = {},
  ) {
    this.jitterTicks = opts.jitterTicks ?? 3;
    this.maxLagTicks = opts.maxLagTicks ?? 45;
    // seed 1: the layout this produces is thrown away (the keyframe replaces every public field)
    this.shell = createGame({
      seed: 1,
      arenaId: descriptor.arenaId,
      players: descriptor.players,
      settings: descriptor.settings,
    });
  }

  /** Loads a full public state (join, reconnect, resync). Frames at or before its tick are ignored from now on. */
  loadKeyframe(kf: KeyframePayload): void {
    const pub = kf.s as PublicState;
    this.state = {
      ...pub,
      config: this.shell.config,
      seed: 0,
      rngState: 0,
      hidden: {},
    } as GameState;
    this.queue = this.queue.filter((f) => f[0] > kf.t);
    for (const t of this.hashes.keys()) if (t <= kf.t) this.hashes.delete(t);
    this.lastQueued = Math.max(this.lastQueued, kf.t);
    if (this.queue.length > 0 && this.queue[0]![0] !== kf.t + 1) this.queue = []; // a hole: wait for fresh frames
    this.resyncReason = null;
    this.acc = 0;
  }

  /** Queues a frames message (in arrival order; the transport is ordered). */
  receive(payload: FramesPayload): void {
    for (const frame of payload.f) {
      const t = frame[0];
      if (t <= this.lastQueued) continue; // already covered by a keyframe or an earlier message
      if (this.lastQueued >= 0 && t !== this.lastQueued + 1 && this.state) {
        this.flagResync('gap');
        return;
      }
      this.queue.push(frame);
      this.lastQueued = t;
    }
    if (payload.h) this.hashes.set(payload.h[0], payload.h[1]);
  }

  get bufferedTicks(): number {
    return this.queue.length;
  }

  /** The server tick the replica shows. */
  get tick(): number {
    return this.state?.tick ?? -1;
  }

  /** Applies exactly one queued tick (tests, and `advance`). Returns its events, or null if none is queued. */
  applyOne(): SimEvent[] | null {
    const state = this.state;
    const frame = this.queue[0];
    if (!state || !frame || this.resyncReason) return null;
    const [t, patch, events] = frame;
    if (t !== state.tick + 1) {
      if (t <= state.tick) {
        this.queue.shift();
        return [];
      }
      this.flagResync('gap');
      return null;
    }
    this.queue.shift();
    try {
      predict(state as unknown as PublicState);
      if (patch !== null) applyPatch(state, patch);
    } catch (e) {
      if (e instanceof PatchError || e instanceof TypeError) {
        this.flagResync('patch');
        return null;
      }
      throw e;
    }
    this.stats.framesApplied++;
    const expected = this.hashes.get(t);
    if (expected !== undefined) {
      this.hashes.delete(t);
      this.stats.hashChecks++;
      if (canonicalHash(publicState(state)) !== expected) {
        this.stats.hashMismatches++;
        this.flagResync('hash');
      }
    }
    return events ?? [];
  }

  /**
   * Plays out queued ticks for `dtMs` of wall time: 60 ticks/s, slightly faster when the buffer grows beyond its target
   * and slightly slower when it runs low; a far-behind buffer is skipped to the target at once.
   */
  advance(dtMs: number, sendEvery = this.descriptor.sendEvery): AdvanceResult {
    const events: SimEvent[] = [];
    const target = sendEvery + this.jitterTicks;
    if (this.queue.length > this.maxLagTicks) {
      // far behind (a stall, a background tab): fast-apply down to the target; events of skipped ticks still count
      while (this.queue.length > target) {
        const e = this.applyOne();
        if (e === null) break;
        events.push(...e);
        this.stats.skippedAhead++;
      }
    }
    const rate = this.queue.length > target + sendEvery ? 1.15 : this.queue.length < sendEvery ? 0.85 : 1;
    this.acc += dtMs * rate;
    let steps = 0;
    while (this.acc >= STEP_MS && this.queue.length > 0 && steps < 8) {
      const e = this.applyOne();
      if (e === null) break;
      events.push(...e);
      this.acc -= STEP_MS;
      steps++;
    }
    if (this.queue.length === 0) this.acc = Math.min(this.acc, STEP_MS); // starved: never bank time
    if (steps === 8) this.acc = 0;
    return { events, steps, alpha: Math.min(1, this.acc / STEP_MS) };
  }

  private flagResync(reason: Exclude<ResyncReason, null>): void {
    if (this.resyncReason) return;
    this.resyncReason = reason;
    this.stats.resyncs++;
    this.queue = [];
  }
}
