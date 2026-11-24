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

const round1 = (n: number): number => Math.round(n * 10) / 10;

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
  /**
   * What a dropped human seat does once its grace period is over: `bot` (alias `autopilot`, the default) = a bot plays
   * it, `idle` = it keeps standing until `replaceWithBot` (the room calls that when the reconnection window ends).
   */
  dropPolicy?: 'idle' | 'autopilot' | 'bot';
  /**
   * Seconds (of match time, 60 ticks each) a dropped seat just stands where it is before the drop policy applies.
   * Default 0 here (the room passes `RuntimeConfig.graceSeconds`).
   */
  graceSeconds?: number;
  /** Called (from `step`) the tick a replacement bot takes over a dropped human seat after its grace period. */
  onBotTakeover?: (seat: number) => void;
  /** Input messages per second per seat before they are counted as over-rate (token bucket). Default 30. */
  inputsPerSecond?: number;
}

export type InputVerdict = 'ok' | 'stale' | 'notYours';

/**
 * Who acts for a human seat on a tick: the `human`, the replacement `bot`, or `absent` (the connection is down and no
 * bot plays yet: the grace period, or `idle` policy; the fighter stands where it is and may be hit).
 */
export type SeatControl = 'human' | 'bot' | 'absent';

/**
 * Per human seat, from the server's own simulation: what the sim credited on ticks the human controlled versus ticks
 * a replacement bot controlled. An `absent` tick belongs to the human (nobody acted, so nothing can be blamed on a
 * bot; a death while standing is the owner's). `kills + botKills` always equals the simulation's total for the seat.
 */
export interface SeatStats {
  humanKills: number;
  humanDeaths: number;
  humanAssists: number;
  botKills: number;
  botDeaths: number;
  botAssists: number;
  /** Ticks the replacement bot controlled the seat. */
  autopilotTicks: number;
  /** Ticks the seat stood with the connection down and no bot yet. */
  absentTicks: number;
  /** Connection drops during the match. */
  drops: number;
}

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
  /** Tick of the latest drop (null: never dropped). */
  droppedAtTick: number | null;
  /** Control on the latest stepped tick (human seats only). */
  control: SeatControl | null;
  /** The seat's bot was announced via `onBotTakeover` for the current drop. */
  announced: boolean;
  stats: SeatStats;
}

const newSeatStats = (): SeatStats => ({
  humanKills: 0,
  humanDeaths: 0,
  humanAssists: 0,
  botKills: 0,
  botDeaths: 0,
  botAssists: 0,
  autopilotTicks: 0,
  absentTicks: 0,
  drops: 0,
});

export interface MatchCounters {
  ticks: number;
  inputsAccepted: number;
  inputsStale: number;
  /**
   * Inputs beyond `inputsPerSecond` (token bucket). COUNTED, still applied: applying an input is O(1), and a burst is
   * what an honest mobile client delivers after a TCP stall; dropping it would lose the player's latest held direction.
   * Flooding is the room's job (a sustained-rate kick), not the match's.
   */
  inputsOverRate: number;
  /** Ticks whose frame carried a patch (vs a pure prediction). */
  patchedTicks: number;
  eliminations: number;
}

const BOT_SEED_STRIDE = 7919;
/** A bot that takes the seat again after a reconnect is a new brain (fresh plan), seeded differently per takeover. */
const BOT_TAKEOVER_STRIDE = 104_729;
const TICKS_PER_SECOND = 60;
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
    inputsOverRate: 0,
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
  private readonly dropPolicy: 'idle' | 'bot';
  private readonly graceTicks: number;
  private readonly onBotTakeover: ((seat: number) => void) | undefined;
  private readonly inputsPerSecond: number;
  private readonly seed: number;
  private readonly statSnap: Int32Array;

  constructor(opts: RumbleMatchOptions) {
    this.seed = opts.seed;
    this.sendEvery = Math.max(1, opts.sendEvery ?? 2);
    this.hashEvery = Math.max(this.sendEvery, opts.hashEvery ?? 120);
    this.dropPolicy = opts.dropPolicy === 'idle' ? 'idle' : 'bot';
    this.graceTicks = Math.max(0, Math.round((opts.graceSeconds ?? 0) * TICKS_PER_SECOND));
    this.onBotTakeover = opts.onBotTakeover;
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
      droppedAtTick: null,
      control: null,
      announced: false,
      stats: newSeatStats(),
    }));
    this.statSnap = new Int32Array(opts.seats.length * 3);
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
  private makeBot(seat: number, spec: SeatSpec = this.seats[seat]!.spec, takeover = 0): Bot {
    return createBot({
      difficulty: spec.difficulty ?? 'standard',
      seed: this.seed + seat * BOT_SEED_STRIDE + takeover * BOT_TAKEOVER_STRIDE,
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

  /**
   * A human took (or took back) control of their seat. Clears any stale held input. Only the controller changes: the
   * fighter is the same object at the same place with the same lives, stats and timers (nothing is reset or respawned;
   * a fighter who fell while the human was away is simply still down and returns by the mode's normal rules).
   */
  connect(seat: number): void {
    const s = this.seats[seat];
    if (!s || s.spec.kind !== 'human' || s.replaced) return;
    s.connected = true;
    s.droppedAtTick = null;
    s.announced = false;
    s.bot = null; // a later takeover starts a fresh brain
    s.held = { move: null, placeHeld: false };
    s.press = null;
    s.pressed = 0;
    s.lastSeq = -1; // a (re)connected client starts its own sequence again
    s.control = 'human';
  }

  /**
   * The seat's connection dropped. The fighter stands where it is for the grace period (no bot yet); then, with policy
   * `bot`, a bot plays it (without pausing the match) until `connect` or, for good, `replaceWithBot`.
   */
  disconnect(seat: number): void {
    const s = this.seats[seat];
    if (!s || s.spec.kind !== 'human' || s.replaced) return;
    if (s.connected) {
      s.stats.drops++;
      s.droppedAtTick = this.state.tick;
      s.announced = false;
    }
    s.connected = false;
    s.held = { move: null, placeHeld: false };
    s.press = null;
    s.pressed = 0;
  }

  /** The reconnection window expired (or the human left on purpose): a bot plays the seat for the rest of the match. */
  replaceWithBot(seat: number): void {
    const s = this.seats[seat];
    if (!s || s.replaced) return;
    s.connected = false;
    s.replaced = true;
    s.bot ??= this.makeBot(seat, s.spec, s.stats.drops);
    if (s.spec.kind === 'human') this.announceTakeover(seat, s);
  }

  /** Who controls a human seat at this moment (null for a server-bot seat). */
  controlOf(seat: number): SeatControl | null {
    const s = this.seats[seat];
    if (!s || s.spec.kind !== 'human') return null;
    return this.controlNow(s);
  }

  private controlNow(s: SeatRuntime): SeatControl {
    if (s.replaced) return 'bot';
    if (s.connected) return 'human';
    const since = s.droppedAtTick ?? 0;
    return this.dropPolicy === 'bot' && this.state.tick - since >= this.graceTicks ? 'bot' : 'absent';
  }

  /** Seats whose replacement bot is playing right now (the lobby shows "a bot plays for X"). */
  botControlledSeats(): number[] {
    return this.seats.flatMap((s, i) => (s.spec.kind === 'human' && this.controlNow(s) === 'bot' ? [i] : []));
  }

  /** What the simulation credited to this seat, split by who controlled it (undefined for server-bot seats). */
  seatStats(seat: number): Readonly<SeatStats> | undefined {
    const s = this.seats[seat];
    return s && s.spec.kind === 'human' ? s.stats : undefined;
  }

  private announceTakeover(seat: number, s: SeatRuntime): void {
    if (s.announced) return;
    s.announced = true;
    this.onBotTakeover?.(seat);
  }

  // ---------------------------------------------------------------- input

  /**
   * Records a validated input message of a human seat (validation of the raw message is the room's job:
   * `validateInput`). `nowMs` feeds the rate limiter only; it never affects the simulation.
   */
  input(seat: number, msg: InputMsg, nowMs: number): InputVerdict {
    const s = this.seats[seat];
    if (!s || s.spec.kind !== 'human' || s.replaced || !s.connected) return 'notYours';
    // token bucket: measures the rate, never rejects (see `MatchCounters.inputsOverRate`)
    const refill = ((nowMs - s.tokensAt) / 1000) * this.inputsPerSecond;
    s.tokens = Math.min(this.inputsPerSecond, s.tokens + Math.max(0, refill));
    s.tokensAt = nowMs;
    if (s.tokens >= 1) s.tokens -= 1;
    else this.counters.inputsOverRate++;
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

  private intentsForTick(controls: readonly (SeatControl | null)[]): Intents {
    const state = this.state;
    const intents: Intents = {};
    for (let seat = 0; seat < this.seats.length; seat++) {
      const s = this.seats[seat]!;
      const p = state.players[seat]!;
      if (!p.alive && p.spectator === null) {
        s.pressed = 0;
        continue;
      }
      if (controls[seat] === 'human') {
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
      const control = controls[seat];
      if (s.spec.kind === 'bot' || control === 'bot') {
        s.bot ??= this.makeBot(seat, s.spec, s.stats.drops);
        intents[seat] = s.bot.decide(observe(state, seat));
      }
      // `absent`: the connection is down and no bot plays (grace period / idle policy): the fighter stands where it is
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
    const controls = this.seats.map((s) => (s.spec.kind === 'human' ? this.controlNow(s) : null));
    for (let i = 0; i < controls.length; i++)
      if (controls[i] === 'bot') this.announceTakeover(i, this.seats[i]!);
    this.snapshotStats();
    const events = tick(this.state, this.intentsForTick(controls));
    this.attributeStats(controls);
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

  /** Personal stats are read as per-tick deltas of what the sim itself counted (`eliminate()` is its only writer). */
  private snapshotStats(): void {
    const snap = this.statSnap;
    for (let i = 0; i < this.seats.length; i++) {
      const st = this.state.players[i]!.stats;
      snap[i * 3] = st.kills;
      snap[i * 3 + 1] = st.deaths;
      snap[i * 3 + 2] = st.assists;
    }
  }

  /**
   * Splits this tick's credited kills / deaths / assists between the human and the replacement bot by who controlled
   * the seat on this tick (the tick the elimination is credited on). The simulation's own counts, and so the match
   * result, are untouched: this only keeps a second, split ledger.
   */
  private attributeStats(controls: readonly (SeatControl | null)[]): void {
    const snap = this.statSnap;
    for (let i = 0; i < this.seats.length; i++) {
      const control = controls[i];
      if (control === null) continue;
      const s = this.seats[i]!;
      const st = this.state.players[i]!.stats;
      const dk = st.kills - snap[i * 3]!;
      const dd = st.deaths - snap[i * 3 + 1]!;
      const da = st.assists - snap[i * 3 + 2]!;
      const mine = s.stats;
      if (control === 'bot') {
        mine.autopilotTicks++;
        mine.botKills += dk;
        mine.botDeaths += dd;
        mine.botAssists += da;
      } else {
        if (control === 'absent') mine.absentTicks++;
        mine.humanKills += dk;
        mine.humanDeaths += dd;
        mine.humanAssists += da;
      }
      s.control = control;
    }
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
        const runtime = this.seats[seat]!;
        const human = runtime.spec.kind === 'human';
        const split = runtime.stats;
        const base = {
          seat,
          name: p.name,
          isBot: !human,
          team: p.team >= 0 ? p.team : null,
          // placement is the simulation's own: it counts every credited kill, the replacement bot's included
          placement: x.placement,
        };
        // Personal numbers: only what the human did. A server-bot seat has no owner: the sim's totals.
        if (!human) return { ...base, kills: x.kills, deaths: x.deaths, assists: x.assists };
        return {
          ...base,
          kills: split.humanKills,
          deaths: split.humanDeaths,
          assists: split.humanAssists,
          botKills: split.botKills,
          botDeaths: split.botDeaths,
          botAssists: split.botAssists,
          autopilotSeconds: round1(split.autopilotTicks / TICKS_PER_SECOND),
          absentSeconds: round1(split.absentTicks / TICKS_PER_SECOND),
          drops: split.drops,
          controlledByBotAtEnd: this.controlNow(runtime) === 'bot',
        };
      }),
    };
  }

  /** Seats a human currently controls (for the room's bookkeeping). */
  humanSeatsConnected(): number[] {
    return this.seats.flatMap((s, i) => (s.spec.kind === 'human' && s.connected && !s.replaced ? [i] : []));
  }
}
