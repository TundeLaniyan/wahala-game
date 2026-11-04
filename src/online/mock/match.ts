/**
 * The mock match authority: it runs the REAL simulation (createGame + tick) and the real bots behind the
 * MatchService interface. The client submits Intents; the "server" mock owns the GameState, applies one intent
 * set per tick, logs every accepted input, and sends public snapshots and the final results. This proves the
 * boundary a real server would have (same src/sim, clients send intents only).
 *
 * Time advances only through `pump` (real time via the injected clock) or `step` / `fastForward` (tests, demos).
 */
import { createBot } from '../../ai';
import { matchResultFrom } from '../../progression';
import { createGame, nextInt, observe, tick } from '../../sim';
import type { GameOptions, GameState, Intent, Intents, PlayerSetup } from '../../sim';
import type { MatchService, ReconnectService } from '../contracts';
import { E } from '../errors';
import { acceptsInput, nextMatchPhase, nextRoomState } from '../lifecycle';
import { err, ok } from '../result';
import type { Result } from '../result';
import { intentSchema } from '../schema';
import type {
  InputAck,
  LoggedInput,
  MatchDescriptor,
  MatchPhase,
  MatchResults,
  MatchSeat,
  MatchSnapshot,
  OnlineGame,
  ResumeRequest,
  ResumeResponse,
  Room,
} from '../types';
import { createRateLimiter, fnv1a } from '../util';
import { publishRoom } from './context';
import type { MatchRec, MockCtx, SeatLink } from './context';
import { matchSettingsFor } from './rules';

const TICKS_PER_SECOND = 60;
const MAX_TICK_SKEW = 120;
const MAX_CATCH_UP = 600;
const SNAPSHOT_EVERY = 6;
const MAX_LOG = 60_000;
const ONE_SHOTS = ['place', 'special', 'action', 'disarm', 'skill', 'detonate'] as const;

const token = (ctx: MockCtx): string =>
  Array.from({ length: 24 }, () => nextInt(ctx.rng, 16).toString(16)).join('');

// ---------------------------------------------------------------- creation

/** The authoritative match of a room (called when its ready check passes). */
export function createMatchRec(ctx: MockCtx, room: Room): MatchRec {
  const me = ctx.state.session?.profile.id ?? '';
  const seats: MatchSeat[] = room.members.map((m, seat) => ({
    seat,
    accountId: m.accountId,
    displayName: m.displayName,
    isBot: m.isBot,
    team: m.team,
    characterId: m.characterId,
  }));
  const mySeat = seats.findIndex((s) => s.accountId === me);
  const players: PlayerSetup[] = seats.map((s) => ({
    name: s.displayName,
    characterId: s.characterId,
    isBot: s.seat !== mySeat,
    difficulty: 'rookie',
    ...(s.team !== null ? { team: s.team } : {}),
  }));
  const seed = 1 + nextInt(ctx.rng, 2_000_000_000);
  const options: GameOptions = {
    seed,
    arenaId: room.arenaId,
    players,
    settings: matchSettingsFor(room.game),
  };
  const state = createGame(options);
  const links: SeatLink[] = seats.map((s) => ({
    connected: true,
    graceUntil: null,
    expired: false,
    bot: s.seat !== mySeat,
    autopilot: false,
    resumeToken: token(ctx),
    ready: s.seat !== mySeat,
  }));
  const rec: MatchRec = {
    id: ctx.id('match'),
    roomId: room.id,
    options,
    state,
    seats,
    mySeat,
    phase: 'lobby',
    bots: new Map(),
    links,
    held: new Map(),
    oneShots: new Map(),
    log: [],
    lastAdvanceAt: ctx.now(),
    carry: 0,
    results: null,
    limiter: createRateLimiter(ctx.opts.inputsPerSecond, 30),
    paused: false,
  };
  seats.forEach((s) => {
    if (links[s.seat]!.bot) ensureBot(rec, s.seat);
  });
  ctx.state.matches.set(rec.id, rec);
  return rec;
}

function botObject(rec: MatchRec, seat: number): void {
  if (rec.bots.has(seat)) return;
  rec.bots.set(
    seat,
    createBot({ difficulty: 'rookie', seed: rec.options.seed + seat * 7919, playerId: seat }),
  );
}

/** A bot takes the seat over for good. */
function ensureBot(rec: MatchRec, seat: number): void {
  botObject(rec, seat);
  rec.links[seat]!.bot = true;
}

function phaseTo(rec: MatchRec, event: Parameters<typeof nextMatchPhase>[1]): boolean {
  const next = nextMatchPhase(rec.phase, event);
  if (!next) return false;
  rec.phase = next;
  return true;
}

/** Room `starting` -> match countdown (called once all are ready). */
export function beginCountdown(rec: MatchRec): void {
  phaseTo(rec, 'startCountdown');
}

/** Room `starting` -> `inProgress`: the match starts to run. */
export function beginPlaying(ctx: MockCtx, room: Room): void {
  const rec = room.matchId ? ctx.state.matches.get(room.matchId) : undefined;
  const next = nextRoomState(room.state, 'countdownDone');
  if (!rec || !next) return;
  room.state = next;
  phaseTo(rec, 'countdownDone');
  rec.lastAdvanceAt = ctx.now();
  rec.carry = 0;
  publishRoom(ctx, room);
}

// ---------------------------------------------------------------- views

export const stateHash = (state: GameState): number => fnv1a(JSON.stringify(state));

export function snapshotOf(rec: MatchRec): MatchSnapshot {
  const s = rec.state;
  return {
    matchId: rec.id,
    tick: s.tick,
    phase: rec.phase,
    width: s.width,
    height: s.height,
    tiles: s.tiles.slice(),
    players: s.players.map((p, i) => ({
      seat: i,
      accountId: rec.seats[i]!.accountId,
      displayName: p.name,
      team: p.team >= 0 ? p.team : null,
      x: p.x,
      y: p.y,
      alive: p.alive,
      kills: p.stats.kills,
      deaths: p.stats.deaths,
      assists: p.stats.assists,
      connected: rec.links[i]!.connected,
    })),
    generators: s.generators.map((g) => ({ x: g.x, y: g.y, ownerSeat: g.ownerId })),
    flames: s.flames.map((f) => ({ x: f.x, y: f.y })),
    secondsRemaining:
      s.settings.durationSec === null
        ? null
        : Math.max(0, Math.ceil((s.config.match.durationTicks - s.match.playTicks) / TICKS_PER_SECOND)),
    stateHash: stateHash(s),
  };
}

export function resultsOf(rec: MatchRec): MatchResults {
  const s = rec.state;
  const r = s.match.result;
  const players = rec.seats.map((seat) => {
    const x = matchResultFrom(s, seat.seat, { matchId: rec.id });
    return {
      seat: seat.seat,
      accountId: seat.accountId,
      displayName: seat.displayName,
      isBot: seat.isBot,
      team: s.players[seat.seat]!.team >= 0 ? s.players[seat.seat]!.team : null,
      placement: x.placement,
      kills: x.kills,
      deaths: x.deaths,
      assists: x.assists,
    };
  });
  return {
    matchId: rec.id,
    game: s.settings.game as OnlineGame,
    arenaId: s.arenaId,
    durationSec: Math.round(s.match.playTicks / TICKS_PER_SECOND),
    winnerSeat: r?.kind === 'win' ? r.winnerId : null,
    winnerTeam: r?.kind === 'teamWin' ? r.team : null,
    draw: r?.kind === 'draw',
    players,
  };
}

function descriptorFor(rec: MatchRec): MatchDescriptor {
  return {
    matchId: rec.id,
    roomId: rec.roomId,
    game: rec.options.settings!.game as OnlineGame,
    arenaId: rec.options.arenaId!,
    phase: rec.phase,
    seats: rec.seats.map((s) => ({ ...s })),
    yourSeat: rec.mySeat,
    graceMs: 0,
    resumeToken: rec.links[rec.mySeat]?.resumeToken ?? '',
  };
}

// ---------------------------------------------------------------- stepping

function intentsFor(rec: MatchRec): Intents {
  const state = rec.state;
  const intents: Intents = {};
  state.players.forEach((p, seat) => {
    const link = rec.links[seat]!;
    let intent: Intent | null = null;
    if (link.bot || (link.autopilot && link.connected)) {
      const bot = rec.bots.get(seat);
      if (bot && (p.alive || p.spectator !== null)) intent = bot.decide(observe(state, seat));
    } else if (link.connected) {
      const held = rec.held.get(seat);
      const shots = rec.oneShots.get(seat);
      intent = {
        move: held?.move ?? null,
        ...(held?.placeHeld ? { placeHeld: true } : {}),
        ...(shots ?? {}),
      };
      rec.oneShots.delete(seat);
    }
    if (intent) {
      intents[seat] = intent;
      if (rec.log.length < MAX_LOG && (intent.move || Object.keys(intent).some((k) => k !== 'move'))) {
        rec.log.push({ tick: state.tick, seat, intent: structuredClone(intent) });
      }
    }
  });
  return intents;
}

/** Advances the authoritative sim by `ticks` (stops at the end of the match). */
export function stepMatch(ctx: MockCtx, rec: MatchRec, ticks: number): void {
  for (let i = 0; i < ticks && rec.phase === 'playing'; i++) {
    tick(rec.state, intentsFor(rec));
    if (rec.state.match.phase === 'ended') {
      finishMatch(ctx, rec);
      return;
    }
    if (rec.state.tick % SNAPSHOT_EVERY === 0 && ctx.events.size > 0) {
      ctx.events.emit({ type: 'match.snapshot', snapshot: snapshotOf(rec) });
    }
  }
}

export function finishMatch(ctx: MockCtx, rec: MatchRec): void {
  if (rec.phase !== 'playing' && rec.phase !== 'countdown') return;
  phaseTo(rec, rec.phase === 'playing' ? 'simEnded' : 'abort');
  rec.results = resultsOf(rec);
  const room = ctx.state.rooms.get(rec.roomId);
  if (room) {
    const next = nextRoomState(room.state, 'matchEnded');
    if (next) {
      room.state = next;
      publishRoom(ctx, room);
    }
  }
  ctx.events.emit({ type: 'match.snapshot', snapshot: snapshotOf(rec) });
  ctx.events.emit({ type: 'match.results', results: structuredClone(rec.results) });
}

/** Time-driven part: real-time sim advance, grace-window expiry. */
export function pumpMatches(ctx: MockCtx): void {
  const now = ctx.now();
  for (const rec of ctx.state.matches.values()) {
    for (const [seat, link] of rec.links.entries()) {
      if (!link.connected && !link.expired && link.graceUntil !== null && now >= link.graceUntil) {
        link.expired = true;
        ensureBot(rec, seat); // a bot takes over a seat whose owner did not come back in time
        ctx.events.emit({ type: 'match.connection', matchId: rec.id, seat, connected: false, graceMs: null });
      }
    }
    if (rec.phase !== 'playing' || rec.paused) continue;
    const exact = ((now - rec.lastAdvanceAt) / 1000) * TICKS_PER_SECOND + rec.carry;
    const ticks = Math.min(MAX_CATCH_UP, Math.floor(exact));
    rec.carry = exact - Math.floor(exact);
    rec.lastAdvanceAt = now;
    if (ticks > 0) stepMatch(ctx, rec, ticks);
  }
}

// ---------------------------------------------------------------- mock-only controls (not part of MatchService)

/** Drops the local player's connection: the seat is held for the grace window, then a bot takes over. */
export function simulateDrop(ctx: MockCtx, matchId: string): Result<{ graceUntil: number }> {
  const rec = ctx.state.matches.get(matchId);
  if (!rec || rec.mySeat < 0) return err(E.notFound('No such match.'));
  const link = rec.links[rec.mySeat]!;
  if (link.bot) return err(E.conflict('A bot already plays this seat.'));
  if (!acceptsInput(rec.phase)) return err(E.invalidState(rec.phase, 'The match is not running.'));
  link.connected = false;
  link.graceUntil = ctx.now() + ctx.opts.graceMs;
  ctx.state.connection = 'reconnecting';
  ctx.events.emit({
    type: 'match.connection',
    matchId,
    seat: rec.mySeat,
    connected: false,
    graceMs: ctx.opts.graceMs,
  });
  return ok({ graceUntil: link.graceUntil });
}

/** Demo: a bot drives the local seat while the player stays connected. */
export function setAutopilot(ctx: MockCtx, matchId: string, on: boolean): void {
  const rec = ctx.state.matches.get(matchId);
  if (!rec || rec.mySeat < 0) return;
  if (on) botObject(rec, rec.mySeat);
  rec.links[rec.mySeat]!.autopilot = on;
}

/** Holds or releases the server clock for one match. */
export function setPaused(ctx: MockCtx, matchId: string, paused: boolean): void {
  const rec = ctx.state.matches.get(matchId);
  if (rec) {
    rec.paused = paused;
    rec.lastAdvanceAt = ctx.now();
    rec.carry = 0;
  }
}

/** Runs the match to its end at once, with a bot driving the local seat ("let the server play it"). */
export function fastForward(ctx: MockCtx, matchId: string, maxTicks = 60 * 400): Result<MatchResults> {
  const rec = ctx.state.matches.get(matchId);
  if (!rec) return err(E.notFound('No such match.'));
  if (rec.phase === 'ended' || rec.phase === 'resultsPosted') return ok(rec.results!);
  if (rec.phase === 'lobby' || rec.phase === 'countdown')
    return err(E.invalidState(rec.phase, 'The match has not started.'));
  setAutopilot(ctx, matchId, true);
  stepMatch(ctx, rec, maxTicks);
  return rec.results ? ok(rec.results) : err(E.timeout('The match did not finish in time.'));
}

/**
 * PREVIEW ONLY. The browser preview can play the room's match with the normal local game and hand its final state
 * back here, because the local simulation stands in for the server's. A real server never accepts a result from a
 * client (the wire schema forbids it); it runs its own match.
 */
export function adoptLocalMatch(ctx: MockCtx, matchId: string, finalState: GameState): Result<MatchResults> {
  const rec = ctx.state.matches.get(matchId);
  if (!rec) return err(E.notFound('No such match.'));
  if (finalState.match.phase !== 'ended')
    return err(E.invalidState(finalState.match.phase, 'The match has not ended.'));
  if (finalState.players.length !== rec.seats.length) return err(E.conflict('The roster does not match.'));
  if (rec.mySeat !== 0) return err(E.conflict('The preview adopts a local match only for seat 0.'));
  if (rec.phase === 'lobby' || rec.phase === 'countdown') {
    return err(E.invalidState(rec.phase, 'The match has not started.'));
  }
  if (rec.phase !== 'playing') return ok(rec.results!);
  rec.state = structuredClone(finalState);
  finishMatch(ctx, rec);
  return ok(rec.results!);
}

/** Re-runs the match from its seed and the input log and returns both hashes (they must be equal). */
export function replayMatch(rec: MatchRec, toTick = rec.state.tick): GameState {
  const state = createGame(rec.options);
  const byTick = new Map<number, Intents>();
  for (const e of rec.log) {
    if (e.tick >= toTick) break;
    const at = byTick.get(e.tick) ?? {};
    at[e.seat] = e.intent;
    byTick.set(e.tick, at);
  }
  for (let t = 0; t < toTick; t++) tick(state, byTick.get(t) ?? {});
  return state;
}

// ---------------------------------------------------------------- services

function seatOf(ctx: MockCtx, rec: MatchRec): number {
  const me = ctx.state.session?.profile.id;
  return rec.seats.findIndex((s) => s.accountId === me && !s.isBot);
}

export function createMatchService(ctx: MockCtx): MatchService {
  const withMatch = <T>(
    method: string,
    matchId: string,
    fn: (rec: MatchRec, seat: number) => Result<T>,
  ): Promise<Result<T>> =>
    ctx.call('matches', method, () => {
      const u = ctx.user();
      if (!u.ok) return u;
      const rec = ctx.state.matches.get(matchId);
      if (!rec) return err(E.notFound('No such match.'));
      const seat = seatOf(ctx, rec);
      if (seat < 0) return err(E.forbidden('You are not in this match.'));
      return fn(rec, seat);
    });

  return {
    start: (roomId) =>
      ctx.call('matches', 'start', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        const room = ctx.state.rooms.get(roomId);
        if (!room) return err(E.notFound('No such room.'));
        if (room.hostId !== u.value.id) return err(E.forbidden('Only the host can start the match.'));
        if (room.state !== 'starting' || !room.matchId) {
          return err(E.invalidState(room.state, 'The ready check has not passed.'));
        }
        beginPlaying(ctx, room);
        return ok(descriptorFor(ctx.state.matches.get(room.matchId)!));
      }),
    join: (matchId) =>
      withMatch('join', matchId, (rec) => ok({ ...descriptorFor(rec), graceMs: ctx.opts.graceMs })),
    leave: (matchId) =>
      withMatch('leave', matchId, (rec, seat) => {
        const link = rec.links[seat]!;
        link.connected = false;
        link.expired = true;
        ensureBot(rec, seat);
        ctx.events.emit({ type: 'match.connection', matchId, seat, connected: false, graceMs: null });
        return ok(undefined);
      }),
    ready: (matchId, ready) =>
      withMatch<MatchPhase>('ready', matchId, (rec, seat) => {
        if (rec.phase !== 'lobby' && rec.phase !== 'countdown') {
          return err(E.invalidState(rec.phase, 'Ready flags only matter before the match.'));
        }
        rec.links[seat]!.ready = ready;
        return ok(rec.phase);
      }),
    submitInput: (matchId, atTick, intent) =>
      withMatch<InputAck>('submitInput', matchId, (rec, seat) => {
        if (!acceptsInput(rec.phase)) return err(E.invalidState(rec.phase, 'The match is not taking input.'));
        const link = rec.links[seat]!;
        if (!link.connected) return err(E.conflict('Your connection is down: resume the match first.'));
        if (link.bot) return err(E.conflict('A bot is playing your seat.'));
        const wait = rec.limiter.take(ctx.now());
        if (wait > 0) return err(E.rateLimited(wait));
        // the server re-validates EVERYTHING, whatever the client already checked
        const issues: Parameters<typeof E.invalid>[0] = [];
        const parsed = intentSchema.parse(intent, 'intent', issues, 0);
        if (!parsed) return err(E.invalid(issues));
        if (!Number.isInteger(atTick) || Math.abs(atTick - rec.state.tick) > MAX_TICK_SKEW) {
          return err(
            E.invalid([{ code: 'invalid', path: 'tick', message: 'tick outside the accepted window' }]),
          );
        }
        const i = parsed.value;
        if ('move' in i) {
          rec.held.set(seat, {
            move: i.move ?? null,
            placeHeld: i.placeHeld ?? rec.held.get(seat)?.placeHeld ?? false,
          });
        } else if (i.placeHeld !== undefined) {
          rec.held.set(seat, { move: rec.held.get(seat)?.move ?? null, placeHeld: i.placeHeld });
        }
        const shots: Intent = { ...(rec.oneShots.get(seat) ?? {}) };
        for (const k of ONE_SHOTS) if (i[k]) shots[k] = true;
        if (i.vehicle) shots.vehicle = i.vehicle;
        rec.oneShots.set(seat, shots);
        return ok({ accepted: true, serverTick: rec.state.tick });
      }),
    snapshot: (matchId) => withMatch('snapshot', matchId, (rec) => ok(snapshotOf(rec))),
    results: (matchId) =>
      withMatch('results', matchId, (rec) =>
        rec.results && (rec.phase === 'ended' || rec.phase === 'resultsPosted')
          ? ok(structuredClone(rec.results))
          : err(E.invalidState(rec.phase, 'The match has not ended.')),
      ),
  };
}

export function createReconnectService(ctx: MockCtx): ReconnectService {
  return {
    resume: (req: ResumeRequest) =>
      ctx.call<ResumeResponse>('reconnect', 'resume', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        const rec = ctx.state.matches.get(req.matchId);
        if (!rec) return err(E.notFound('No such match.'));
        const seat = seatOf(ctx, rec);
        if (seat < 0) return err(E.forbidden('You are not in this match.'));
        const link = rec.links[seat]!;
        if (link.resumeToken !== req.resumeToken) return err(E.forbidden('That resume token is not valid.'));
        if (rec.phase === 'ended' || rec.phase === 'resultsPosted') {
          return err(E.reconnectExpired('The match has already ended.'));
        }
        if (link.expired) return err(E.reconnectExpired());
        const now = ctx.now();
        const grace = link.graceUntil === null ? 0 : Math.max(0, link.graceUntil - now);
        link.connected = true;
        link.graceUntil = null;
        link.resumeToken = token(ctx); // the token is single use: rotate it
        ctx.state.connection = 'connected';
        ctx.events.emit({ type: 'match.connection', matchId: rec.id, seat, connected: true, graceMs: null });
        const inputLog: LoggedInput[] = rec.log.filter((e) => e.tick >= req.lastAckedTick);
        return ok({
          descriptor: { ...descriptorFor(rec), graceMs: ctx.opts.graceMs },
          snapshot: snapshotOf(rec),
          inputLog,
          graceRemainingMs: grace,
        });
      }),
  };
}
