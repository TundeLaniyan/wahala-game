/**
 * The authoritative City Rumble match (docs/CITY_RUMBLE_ONLINE.md section 3).
 *
 * Transport-agnostic and deterministic: it owns the REAL GameState (`createGame` + `tick` from src/sim, the same code
 * the offline game runs), the server-controlled bots (`createBot` from src/ai, the same bots), each seat's latest
 * input, and the replication mirror. A room (Colyseus, or a test) calls `step()` 60 times a second and ships the
 * frames `flush()` returns; nothing here knows about sockets or clocks.
 *
 * Authority rules:
 *  - humans contribute only `InputMsg` (held direction, A held, one-shot buttons); the sim decides everything else;
 *  - results, eliminations and stats are read from this state only (`results()`), never from a client;
 *  - the seed, the rng state, hidden pickups and the config never leave this object (src/net/publicState.ts).
 */
import { createBot } from '../../../src/ai';
import type { Bot } from '../../../src/ai';
import { applyPatch, diff } from '../../../src/net/delta';
import { canonicalHash } from '../../../src/net/hash';
import { canonicalClone, pack, packFramesPayload } from '../../../src/net/pack';
import { predict } from '../../../src/net/predict';
import { BUTTON, NET_PROTOCOL } from '../../../src/net/protocol';
import type {
  InputMsg,
  KeyframePayload,
  MatchDescriptor,
  ResultsMsg,
  TickFrame,
} from '../../../src/net/protocol';
import { publicState } from '../../../src/net/publicState';
import type { PublicState } from '../../../src/net/publicState';
import { matchResultFrom } from '../../../src/progression/matchResult';
import { createGame, observe, tick } from '../../../src/sim';
import type {
  CharacterId,
  Difficulty,
  GameKind,
  GameState,
  Intent,
  Intents,
  PlayerSetup,
} from '../../../src/sim';

export type RumbleGame = Extract<GameKind, 'survival' | 'deathmatch' | 'team'>;

export interface SeatSpec {
  /** Display name (validated by the room). Bots are named by the room as bots. */
  name: string;
  characterId: CharacterId;
  kind: 'human' | 'bot';
  /** Bot level (bots only). */
  difficulty?: Difficulty;
  team?: number;
}

export interface RumbleMatchOptions {
  matchId: string;
  arenaId: string;
  game: RumbleGame;
  /** Respawn modes only (deathmatch / team). Default 300. */
  durationSec?: number;
  friendlyFire?: boolean;
  seats: SeatSpec[];
  /** Server-chosen, secret. */
  seed: number;
  /** Ticks per frames message (2 = 30 Hz). */
  sendEvery?: number;
  /** Attach a desync hash every this many ticks. */
  hashEvery?: number;
  /** What a dropped human seat does until it reconnects: stand still, or a bot plays it. Default 'autopilot'. */
  dropPolicy?: 'idle' | 'autopilot';
  /** Max input messages per second per seat (token bucket, burst = the same number). */
  inputsPerSecond?: number;
}

export type InputVerdict = 'ok' | 'stale' | 'rateLimited' | 'notYours';

interface SeatRuntime {
  spec: SeatSpec;
  /** A human is in control (connected and not replaced). */
  connected: boolean;
  /** A bot plays this seat for good (bots, and humans whose reconnection window expired). */
  replaced: boolean;
  held: { move: InputMsg['m']; placeHeld: boolean };
  /** The latest new direction press, kept until it produces a step or `until` passes (tap = one step). */
  press: { dir: NonNullable<InputMsg['m']>; until: number } | null;
  /** One-shot buttons pressed since the last tick (BUTTON mask). */
  pressed: number;
  lastSeq: number;
  tokens: number;
  tokensAt: number;
  bot: Bot | null;
}

export interface MatchCounters {
  ticks: number;
  inputsAccepted: number;
  inputsStale: number;
  inputsRateLimited: number;
  /** Ticks whose frame carried a patch (vs a pure prediction). */
  patchedTicks: number;
  eliminations: number;
}

const BOT_SEED_STRIDE = 7919;
/**
 * A new direction press is kept this many ticks (or until it produces a step). Offline, `MoveGate` makes a tap one step
 * by holding the press until the local step finishes (MOVE_BUFFER_TICKS = 10 after that); online only the server knows
 * when the authoritative step finishes, so it latches the press itself: up to one step's remaining time plus that buffer.
 */
export const PRESS_KEEP_TICKS = 24;

export class RumbleMatch {
  readonly state: GameState;
  readonly descriptor: MatchDescriptor;
  readonly counters: MatchCounters = {
    ticks: 0,
    inputsAccepted: 0,
    inputsStale: 0,
    inputsRateLimited: 0,
    patchedTicks: 0,
    eliminations: 0,
  };
  private mirror: PublicState;
  private readonly seats: SeatRuntime[];
  /** Frames packed at their own tick, not yet sent. */
  private pending: Uint8Array[] = [];
  private pendingLastTick = 0;
  private readonly sendEvery: number;
  private readonly hashEvery: number;
  private readonly dropPolicy: 'idle' | 'autopilot';
  private readonly inputsPerSecond: number;
  private readonly seed: number;

  constructor(opts: RumbleMatchOptions) {
    this.seed = opts.seed;
    this.sendEvery = Math.max(1, opts.sendEvery ?? 2);
    this.hashEvery = Math.max(this.sendEvery, opts.hashEvery ?? 120);
    this.dropPolicy = opts.dropPolicy ?? 'autopilot';
    this.inputsPerSecond = opts.inputsPerSecond ?? 30;
    const timed = opts.game === 'deathmatch' || opts.game === 'team';
    const settings = {
      game: opts.game,
      mode: 'crush' as const,
      friendlyFire: opts.game === 'team' && (opts.friendlyFire ?? false),
      teamCount: 2,
      durationSec: timed ? (opts.durationSec ?? 300) : null,
    };
    const players: PlayerSetup[] = opts.seats.map((s) => ({
      name: s.name,
      characterId: s.characterId,
      isBot: s.kind === 'bot',
      ...(s.kind === 'bot' ? { difficulty: s.difficulty ?? 'standard' } : {}),
      ...(s.team !== undefined ? { team: s.team } : {}),
    }));
    this.state = createGame({ seed: opts.seed, arenaId: opts.arenaId, players, settings });
    this.seats = opts.seats.map((spec, seat) => ({
      spec,
      connected: false,
      replaced: spec.kind === 'bot',
      held: { move: null, placeHeld: false },
      press: null,
      pressed: 0,
      lastSeq: -1,
      tokens: this.inputsPerSecond,
      tokensAt: 0,
      bot: spec.kind === 'bot' ? this.makeBot(seat, spec) : null,
    }));
    this.mirror = canonicalClone(publicState(this.state));
    this.descriptor = {
      protocol: NET_PROTOCOL,
      matchId: opts.matchId,
      arenaId: this.state.arenaId,
      // what createGame actually used (it may normalise the mode), so a client rebuilds the identical config
      settings: { ...this.state.settings, game: opts.game },
      players: players.map((p, i) => ({ ...p, team: this.state.players[i]!.team })),
      sendEvery: this.sendEvery,
      hashEvery: this.hashEvery,
    };
  }

  /** Bots are seeded per seat from the secret match seed (deterministic, never visible to clients). */
  private makeBot(seat: number, spec: SeatSpec = this.seats[seat]!.spec): Bot {
    return createBot({
      difficulty: spec.difficulty ?? 'standard',
      seed: this.seed + seat * BOT_SEED_STRIDE,
      playerId: seat,
    });
  }

  get seatCount(): number {
    return this.seats.length;
  }

  get ended(): boolean {
    return this.state.match.phase === 'ended';
  }

  isHumanSeat(seat: number): boolean {
    return this.seats[seat]?.spec.kind === 'human';
  }

  // ---------------------------------------------------------------- connections

  /** A human took (or took back) control of their seat. Clears any stale held input. */
  connect(seat: number): void {
    const s = this.seats[seat];
    if (!s || s.spec.kind !== 'human' || s.replaced) return;
    s.connected = true;
    s.held = { move: null, placeHeld: false };
    s.press = null;
    s.pressed = 0;
  }

  /** The seat's connection dropped: it idles or is autopiloted until `connect` or `replaceWithBot`. */
  disconnect(seat: number): void {
    const s = this.seats[seat];
    if (!s || s.spec.kind !== 'human') return;
    s.connected = false;
    s.held = { move: null, placeHeld: false };
    s.press = null;
    s.pressed = 0;
  }

  /** The reconnection window expired: a bot plays the seat for the rest of the match. */
  replaceWithBot(seat: number): void {
    const s = this.seats[seat];
    if (!s || s.replaced) return;
    s.connected = false;
    s.replaced = true;
    s.bot ??= this.makeBot(seat);
  }

  // ---------------------------------------------------------------- input

  /**
   * Records a validated input message of a human seat (validation of the raw message is the room's job:
   * `validateInput`). `nowMs` feeds the rate limiter only; it never affects the simulation.
   */
  input(seat: number, msg: InputMsg, nowMs: number): InputVerdict {
    const s = this.seats[seat];
    if (!s || s.spec.kind !== 'human' || s.replaced || !s.connected) return 'notYours';
    // token bucket
    const refill = ((nowMs - s.tokensAt) / 1000) * this.inputsPerSecond;
    s.tokens = Math.min(this.inputsPerSecond, s.tokens + Math.max(0, refill));
    s.tokensAt = nowMs;
    if (s.tokens < 1) {
      this.counters.inputsRateLimited++;
      return 'rateLimited';
    }
    s.tokens -= 1;
    if (msg.s <= s.lastSeq) {
      this.counters.inputsStale++;
      return 'stale';
    }
    s.lastSeq = msg.s;
    if (msg.m !== null && msg.m !== s.held.move)
      s.press = { dir: msg.m, until: this.state.tick + PRESS_KEEP_TICKS };
    s.held = { move: msg.m, placeHeld: msg.h };
    s.pressed |= msg.b;
    this.counters.inputsAccepted++;
    return 'ok';
  }

  private intentsForTick(): Intents {
    const state = this.state;
    const intents: Intents = {};
    for (let seat = 0; seat < this.seats.length; seat++) {
      const s = this.seats[seat]!;
      const p = state.players[seat]!;
      if (!p.alive && p.spectator === null) {
        s.pressed = 0;
        continue;
      }
      if (s.spec.kind === 'human' && s.connected && !s.replaced) {
        if (s.press && state.tick >= s.press.until) s.press = null;
        const intent: Intent = { move: s.held.move ?? s.press?.dir ?? null };
        if (s.held.placeHeld) intent.placeHeld = true;
        if (s.pressed & BUTTON.place) intent.place = true;
        if (s.pressed & BUTTON.special) intent.special = true;
        if (s.pressed & BUTTON.detonate) intent.detonate = true;
        s.pressed = 0;
        intents[seat] = intent;
        continue;
      }
      const botPlays =
        s.replaced || (s.spec.kind === 'human' && !s.connected && this.dropPolicy === 'autopilot');
      if (botPlays) {
        s.bot ??= this.makeBot(seat);
        intents[seat] = s.bot.decide(observe(state, seat));
      }
    }
    return intents;
  }

  // ---------------------------------------------------------------- simulation + replication

  /**
   * Advances the authoritative simulation one tick and records its replication frame. The frame is PACKED NOW: its patch
   * may reference live simulation objects that the next tick mutates (regression: tests/net/replication.test.ts).
   * The returned frame is for in-process inspection only and must not be kept past this tick.
   */
  step(): TickFrame {
    const before = this.seats.map((s, i) =>
      s.press ? this.state.players[i]!.x * 65536 + this.state.players[i]!.y : -1,
    );
    const events = tick(this.state, this.intentsForTick());
    // a latched press is spent once it produced a step (or the seat was eliminated)
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i]!;
      const p = this.state.players[i]!;
      if (s.press && (!p.alive || p.x * 65536 + p.y !== before[i])) s.press = null;
    }
    this.counters.ticks++;
    for (const e of events) if (e.type === 'playerEliminated') this.counters.eliminations++;
    predict(this.mirror);
    const patch = diff(this.mirror, publicState(this.state));
    if (patch !== undefined) {
      this.mirror = applyPatch(this.mirror, patch) as PublicState;
      this.counters.patchedTicks++;
    }
    const frame: TickFrame = [this.state.tick, patch ?? null, events.length > 0 ? events : null];
    this.pending.push(pack(frame));
    this.pendingLastTick = this.state.tick;
    return frame;
  }

  /**
   * The encoded frames message to send now (every `sendEvery` ticks, or at once with `force`, e.g. when the match
   * ends), or null: `pack(FramesPayload)` bytes, encoded once for every client of the room. A desync hash rides on the
   * batch that reaches a multiple of `hashEvery`.
   */
  flush(force = false): Uint8Array | null {
    if (this.pending.length === 0 || (!force && this.pending.length < this.sendEvery)) return null;
    const frames = this.pending;
    this.pending = [];
    const last = this.pendingLastTick;
    const crossed = Math.floor(last / this.hashEvery) !== Math.floor((last - frames.length) / this.hashEvery);
    return packFramesPayload(frames, force || crossed ? [last, canonicalHash(this.mirror)] : undefined);
  }

  /**
   * The whole public state as of the latest stepped tick. A joining / resyncing client loads it (pack it at once: it
   * is the live mirror), then applies every later frames message; frames at or before its tick are skipped.
   */
  keyframe(): KeyframePayload {
    // the mirror is at the latest STEPPED tick; frames still pending for that range are skipped by the client
    return { t: this.mirror.tick, s: this.mirror };
  }

  /** The canonical hash of what clients should hold now. */
  mirrorHash(): number {
    return canonicalHash(this.mirror);
  }

  /** Server-trusted results (from this simulation only). */
  results(): ResultsMsg {
    const s = this.state;
    const r = s.match.result;
    return {
      matchId: this.descriptor.matchId,
      tick: s.tick,
      winnerSeat: r?.kind === 'win' ? r.winnerId : null,
      winnerTeam: r?.kind === 'teamWin' ? r.team : null,
      draw: r?.kind === 'draw',
      stateHash: this.mirrorHash(),
      players: s.players.map((p, seat) => {
        const x = matchResultFrom(s, seat, { matchId: this.descriptor.matchId });
        return {
          seat,
          name: p.name,
          isBot: this.seats[seat]!.spec.kind === 'bot',
          team: p.team >= 0 ? p.team : null,
          placement: x.placement,
          kills: x.kills,
          deaths: x.deaths,
          assists: x.assists,
        };
      }),
    };
  }

  /** Seats a human currently controls (for the room's bookkeeping). */
  humanSeatsConnected(): number[] {
    return this.seats.flatMap((s, i) => (s.spec.kind === 'human' && s.connected && !s.replaced ? [i] : []));
  }
}
