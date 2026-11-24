/**
 * Local movement prediction for an online City Rumble (decisions ON4-ON5, docs/ONLINE_PREDICTION.md).
 *
 * Each frame, after the replica played the server's frames, `update` returns where to DRAW the local fighter:
 *  1. the authoritative local player (replica tick R) is the starting point, every frame: errors cannot accumulate;
 *  2. the input messages the server has not applied by R (each tagged at send time with its estimated arrival tick,
 *     `clock.ts`) are replayed with the sim's own movement rules (`path.ts`) through the server's press latch (`latch.ts`);
 *  3. the fighter is shown at the moment an input sent NOW reaches the server (capped at `maxHorizonTicks` ahead of R,
 *     slewed so it never jumps), so a press is drawn about one frame later instead of a round trip later;
 *  4. a change of belief is blended or snapped (`corrector.ts`) and encoded into the seven step fields (`drawn.ts`).
 * It never produces anything but those fields: no generator, hit, pickup, elimination, score or result, nothing sent.
 */
import type { Dir, GameState, Player } from '../../../sim';
import { InputClock } from './clock';
import type { PredictionConfig } from './config';
import { TICK_MS, predictionConfig } from './config';
import type { CorrectionKind } from './corrector';
import { Corrector } from './corrector';
import type { StepFields, Vec } from './drawn';
import { encodeDrawn } from './drawn';
import type { Latch, SentMove } from './latch';
import { cloneLatch, emptyLatch, moveFor, receive } from './latch';
import type { HoldReason, Path } from './path';
import { evalPath, holdReason, replayPath, snapAt, standPath } from './path';

export interface PredictorFrame {
  /** The replica's state, AUTHORITATIVE at this moment (the driver reverted the overlay before playing frames). */
  state: GameState;
  seat: number;
  /** The replica's interpolation alpha for this frame (what the renderer will use). */
  alpha: number;
  nowMs: number;
  dtMs: number;
}

/** Why the local fighter is drawn exactly where the server says this frame (null = predicted). */
export type PredictionMode = 'predicting' | 'off' | HoldReason;

export interface PredictionStats {
  frames: number;
  predictedFrames: number;
  mode: PredictionMode;
  /** Ticks the drawn local fighter is ahead of the replica this frame. */
  horizonTicks: number;
  corrections: number;
  snaps: number;
  maxCorrectionTiles: number;
  probes: number;
  biasTicks: number;
}

/** Sent messages kept unconfirmed at most (about 8 s of the fastest honest input rate). */
const MAX_PENDING = 256;
/** A press estimated to arrive at most this many ticks after a matching authoritative step start is credited to it. */
const CREDIT_WINDOW_TICKS = 8;
/** A shown-time change beyond real time larger than this (ticks) is a jump, not the slew. */
const TIME_JUMP_TICKS = 0.75;

const DIR_OF: Record<string, Dir> = { '0,-1': 'up', '0,1': 'down', '-1,0': 'left', '1,0': 'right' };

function stepDir(p: Readonly<Player>): Dir | null {
  const dx = Math.sign(p.x - p.stepFromX);
  const dy = Math.sign(p.y - p.stepFromY);
  return DIR_OF[`${dx},${dy}`] ?? null;
}

export class LocalPredictor {
  readonly cfg: PredictionConfig;
  readonly clock: InputClock;
  readonly stats: PredictionStats = {
    frames: 0,
    predictedFrames: 0,
    mode: 'off',
    horizonTicks: 0,
    corrections: 0,
    snaps: 0,
    maxCorrectionTiles: 0,
    probes: 0,
    biasTicks: 0,
  };
  /** Diagnostics hook (tests, the latency report): every non-trivial correction, in tiles. */
  onCorrection: ((tiles: number, kind: CorrectionKind) => void) | null = null;

  // --- the server's view of this seat's input, as of the replica's tick
  private base: Latch = emptyLatch();
  private pending: SentMove[] = [];
  private lastSentMove: Dir | null = null;
  private lastSentChangeMs = -Infinity;
  private probe: { dir: Dir; arrival: number; minTick: number; sentMs: number } | null = null;

  // --- the authoritative local player as last seen
  private authTick = -1;
  private authAtRest = false;
  private prevPos: { x: number; y: number } | null = null;
  private lastStepBegin = -Infinity;
  private lastMoveTick = -Infinity;

  // --- what was shown last frame
  private path: Path | null = null;
  private shownTick = 0;
  private shownPred: Vec = { x: 0, y: 0 };
  private readonly corrector: Corrector;

  constructor(config: Partial<PredictionConfig> = {}) {
    this.cfg = predictionConfig(config);
    this.clock = new InputClock(this.cfg);
    this.corrector = new Corrector(this.cfg);
  }

  /** The path drawn this frame (diagnostics and tests; null while the replica is drawn as is). */
  get lastPath(): Readonly<Path> | null {
    return this.path;
  }

  onPong(c: number, t: number): void {
    this.clock.onPong(c, t);
  }

  /**
   * An input message was just sent (exactly what the server will receive). Returns the server tick it is estimated to
   * arrive at (its `r`; diagnostics).
   */
  onSent(msg: { m: Dir | null }, nowMs: number): number {
    const arrival = this.clock.ready ? this.clock.arrivalForSend(nowMs) : NaN;
    const r = Number.isFinite(arrival) ? Math.floor(arrival) : this.authTick;
    if (msg.m !== null && msg.m !== this.lastSentMove) {
      const fromRest =
        this.lastSentMove === null &&
        nowMs - this.lastSentChangeMs >= this.cfg.probeIdleMs &&
        this.pending.length === 0 &&
        this.base.held === null &&
        this.base.press === null &&
        this.authAtRest;
      if (fromRest && Number.isFinite(arrival))
        this.probe = { dir: msg.m, arrival, minTick: this.authTick + 1, sentMs: nowMs };
      else this.probe = null;
    }
    if (msg.m !== this.lastSentMove) {
      this.lastSentMove = msg.m;
      this.lastSentChangeMs = nowMs;
    }
    this.pending.push({ m: msg.m, r });
    // a replica that stopped advancing (a stall, a resync) must not grow this without bound: the oldest are surely in
    while (this.pending.length > MAX_PENDING) receive(this.base, this.pending.shift()!);
    return r;
  }

  /** The server forgot this seat's input (a drop / reconnect: its `connect()` clears held and latched moves). */
  resetInputs(): void {
    this.base = emptyLatch();
    this.pending = [];
    this.lastSentMove = null;
    this.lastSentChangeMs = -Infinity;
    this.probe = null;
  }

  /** The replica was replaced (keyframe): draw the server's picture first, no blending across the jump. */
  resetView(): void {
    this.path = null;
    this.corrector.reset();
    this.prevPos = null;
  }

  /** Where to draw the local fighter this frame, or null to draw the replica as is. Never writes to `frame.state`. */
  update(frame: PredictorFrame): StepFields | null {
    const { state, seat, alpha, nowMs, dtMs } = frame;
    this.stats.frames++;
    const auth = state.players[seat];
    if (!auth) return this.off();
    this.observe(state, auth, nowMs);
    if (!auth.alive || state.match.phase !== 'playing' || !this.clock.ready) return this.off();

    const cfg = this.cfg;
    const replicaTime = state.tick + alpha;
    const hold = holdReason(state, auth);
    this.authAtRest = hold === null && auth.stepRemaining === 0;
    let shown = replicaTime;
    if (hold === null) {
      const target = Math.min(this.clock.arrival(nowMs), replicaTime + cfg.maxHorizonTicks);
      const nominal = this.path ? this.shownTick + dtMs / TICK_MS : replicaTime;
      const slew = (cfg.slewTicksPerSecond * dtMs) / 1000;
      shown = nominal + Math.max(-slew, Math.min(slew, target - nominal));
      shown = Math.max(replicaTime, Math.min(replicaTime + cfg.maxHorizonTicks, shown));
    }
    const path =
      hold === null
        ? replayPath(state, auth, this.base, this.pending, Math.floor(shown) + 2)
        : standPath(state.tick, auth);

    this.corrector.decay(dtMs);
    if (this.path) {
      const now = evalPath(path, this.shownTick);
      const delta = { x: this.shownPred.x - now.x, y: this.shownPred.y - now.y };
      const kind = this.corrector.add(delta);
      if (kind !== 'none') {
        const tiles = Math.hypot(delta.x, delta.y);
        this.stats.corrections++;
        if (kind === 'snap') this.stats.snaps++;
        this.stats.maxCorrectionTiles = Math.max(this.stats.maxCorrectionTiles, tiles);
        this.onCorrection?.(tiles, kind);
      }
      // the shown time itself jumped (a hold drops the look-ahead): blend that move instead of drawing it at once
      const nominal = this.shownTick + dtMs / TICK_MS;
      if (Math.abs(shown - nominal) > TIME_JUMP_TICKS) {
        const a = evalPath(path, nominal);
        const b = evalPath(path, shown);
        this.corrector.shift({ x: a.x - b.x, y: a.y - b.y });
      }
    }
    const pred = evalPath(path, shown);
    const off = this.corrector.offset;
    const fields = encodeDrawn({ x: pred.x + off.x, y: pred.y + off.y }, snapAt(path, shown), alpha);
    this.path = path;
    this.shownTick = shown;
    this.shownPred = pred;
    this.stats.mode = hold ?? 'predicting';
    this.stats.horizonTicks = shown - replicaTime;
    if (hold === null) this.stats.predictedFrames++;
    return fields;
  }

  private off(): null {
    this.stats.mode = 'off';
    this.stats.horizonTicks = 0;
    this.authAtRest = false;
    this.path = null;
    this.corrector.reset();
    return null;
  }

  /**
   * Bookkeeping on the authoritative local player: step starts (calibration probes), tile changes (spent latches), and
   * folding every message the server has received by the replica's tick into the latch model.
   */
  private observe(state: GameState, auth: Readonly<Player>, nowMs: number): void {
    const tick = state.tick;
    let moveTick = -Infinity;
    if (auth.alive && auth.stepRemaining > 0 && auth.stepTotal > 0) {
      const begin = tick - (auth.stepTotal - auth.stepRemaining);
      if (begin > this.lastStepBegin) {
        this.lastStepBegin = begin;
        moveTick = begin;
        const dir = stepDir(auth);
        this.calibrate(begin, dir);
        this.creditStep(begin, dir);
      }
    }
    if (this.prevPos && (this.prevPos.x !== auth.x || this.prevPos.y !== auth.y) && moveTick === -Infinity)
      moveTick = this.authTick + 1; // a move we did not see start (a teleport, a respawn, a step inside one frame)
    this.lastMoveTick = Math.max(this.lastMoveTick, moveTick);
    this.prevPos = { x: auth.x, y: auth.y };
    this.authTick = tick;

    while (this.pending.length > 0 && this.pending[0]!.r <= tick) receive(this.base, this.pending.shift()!);
    const press = this.base.press;
    if (press && (!auth.alive || this.lastMoveTick > press.receivedTick || tick > press.until))
      this.base.press = null;
    if (this.probe && nowMs - this.probe.sentMs > this.cfg.probeTimeoutMs) this.probe = null;
  }

  /**
   * Evidence beats the estimate: the server started a step in `dir` at `begin`. If the latch model (messages estimated to
   * have arrived by `begin - 1`) cannot explain that step, the first press of `dir` estimated to arrive shortly after
   * really arrived by `begin - 1` (and everything sent before it, the transport being ordered). Without this, a press
   * estimated one tick late stays latched in the model and the prediction shows one step too many.
   */
  private creditStep(begin: number, dir: Dir | null): void {
    if (!dir) return;
    const model = cloneLatch(this.base);
    for (const e of this.pending) {
      if (e.r > begin - 1) break;
      receive(model, e);
    }
    if (moveFor(model, begin - 1) === dir) return; // explained
    const i = this.pending.findIndex(
      (e) => e.m === dir && e.r >= begin && e.r <= begin + CREDIT_WINDOW_TICKS,
    );
    for (let j = 0; j <= i; j++) this.pending[j]!.r = Math.min(this.pending[j]!.r, begin - 1);
  }

  /** A probe press from rest whose step the replica now shows starting at `begin`: correct the clock's bias. */
  private calibrate(begin: number, dir: Dir | null): void {
    const probe = this.probe;
    if (!probe || dir !== probe.dir || begin < probe.minTick) return;
    this.probe = null;
    // the step after `floor(arrival)` applies the message: the true arrival lies in [begin - 1, begin)
    if (this.clock.correct(begin - 0.5 - probe.arrival)) {
      this.stats.probes = this.clock.probes;
      this.stats.biasTicks = this.clock.biasTicks;
    }
  }
}
