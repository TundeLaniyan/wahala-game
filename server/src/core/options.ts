/**
 * Validation of everything a client can put into room / join options, and the server's own runtime configuration.
 * Pure (no Colyseus import): unit-testable, and the single place where "what may a client ask for" is decided.
 */
import { CHARACTER_IDS, DIFFICULTIES, RUMBLE_ARENA_IDS } from '../../../src/sim';
import type { CharacterId, Difficulty } from '../../../src/sim';
import {
  MATCH_SEATS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  validatePlayerName,
} from '../../../src/net/protocol';
import type { RoomSettings } from '../../../src/net/protocol';

export type RumbleGameKind = RoomSettings['game'];

export const GAME_KINDS: readonly RumbleGameKind[] = ['survival', 'deathmatch', 'team'];
export const DEFAULT_ARENA_ID = 'rumbleOshodi';
export const DEFAULT_GAME: RumbleGameKind = 'deathmatch';
export const DEFAULT_DURATION_SEC = 300;
export const DEFAULT_DIFFICULTY: Difficulty = 'standard';
/** Match lengths players may pick. */
export const ALLOWED_DURATIONS: readonly number[] = [180, 300];

/** Server-side knobs. Production values by default; tests relax only what `fast` allows. */
export type DropPolicy = 'bot' | 'idle';
export const DROP_POLICIES: readonly DropPolicy[] = ['bot', 'idle'];

export interface RuntimeConfig {
  /**
   * The reserved window, counted from the moment the drop is noticed: the human may take back THE SAME fighter until it
   * ends; then the seat belongs to a bot for the rest of the match.
   */
  reconnectSeconds: number;
  /**
   * Grace period after a human's connection drops mid-match (`RUMBLE_GRACE_SECONDS`, 0..60): the fighter just stands
   * where it is, no bot yet. After it, `dropPolicy` decides. A grace longer than the window simply means the bot only
   * arrives when the window ends.
   */
  graceSeconds: number;
  /**
   * What happens to a dropped seat once the grace period is over (`RUMBLE_DROP_POLICY`): `bot` = a bot plays the
   * fighter without pausing the match for anyone; `idle` = it keeps standing until the reconnection window ends (then a
   * bot takes it for good either way).
   */
  dropPolicy: DropPolicy;
  /**
   * Liveness of a connection (`RUMBLE_PING_INTERVAL_MS`, `RUMBLE_PING_MAX_RETRIES`): the transport pings every
   * `pingIntervalMs` and terminates a socket that missed `pingMaxRetries` pongs in a row. Colyseus' own default is 3 s x 2
   * (6 s), which a phone whose page stalls on the first frame of a big arena (or a busy test machine) can exceed; a
   * dropped socket is not a lost player (the reserved window brings them back), but a longer tolerance avoids needless
   * drops. A really dead connection is still noticed within `interval x retries` (default 12 s).
   */
  pingIntervalMs: number;
  pingMaxRetries: number;
  /** Pre-match countdown. */
  countdownMs: number;
  /** Public lobbies start by themselves this long after the first human joins (a client may ask for another value). */
  defaultAutoStartSec: number;
  /**
   * Test-only (`RUMBLE_TEST_FAST=1`): also accept any integer `durationSec` in 5..300. Never enabled in production
   * paths: with it off, only `ALLOWED_DURATIONS` are accepted.
   */
  fast: boolean;
  /** Fixed simulation rate. */
  tickRate: number;
  /** Max simulation ticks run in one timer callback (the rest is dropped and counted). */
  maxCatchUpTicks: number;
}

export const DEFAULT_GRACE_SECONDS = 5;
export const MAX_GRACE_SECONDS = 60;

export const DEFAULT_RUNTIME: RuntimeConfig = {
  reconnectSeconds: 30,
  graceSeconds: DEFAULT_GRACE_SECONDS,
  dropPolicy: 'bot',
  pingIntervalMs: 3000,
  pingMaxRetries: 4,
  countdownMs: 3000,
  defaultAutoStartSec: 20,
  fast: false,
  tickRate: 60,
  maxCatchUpTicks: 6,
};

function positiveNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function parseDropPolicy(raw: string | undefined): DropPolicy {
  const v = raw?.trim().toLowerCase();
  return (DROP_POLICIES as readonly (string | undefined)[]).includes(v)
    ? (v as DropPolicy)
    : DEFAULT_RUNTIME.dropPolicy;
}

/**
 * Reads `RUMBLE_RECONNECT_SECONDS`, `RUMBLE_GRACE_SECONDS` (0..60), `RUMBLE_DROP_POLICY` (`bot` | `idle`),
 * `RUMBLE_TEST_FAST` and (only with fast mode) `RUMBLE_COUNTDOWN_MS` / `RUMBLE_AUTOSTART_SEC`.
 * Invalid values fall back to the defaults.
 */
export function loadRuntimeConfig(env: Record<string, string | undefined> = process.env): RuntimeConfig {
  const fast = env.RUMBLE_TEST_FAST === '1';
  return {
    ...DEFAULT_RUNTIME,
    fast,
    reconnectSeconds: positiveNumber(
      env.RUMBLE_RECONNECT_SECONDS,
      DEFAULT_RUNTIME.reconnectSeconds,
      fast ? 0.1 : 1,
      3600,
    ),
    graceSeconds: positiveNumber(env.RUMBLE_GRACE_SECONDS, DEFAULT_GRACE_SECONDS, 0, MAX_GRACE_SECONDS),
    pingIntervalMs: Math.round(
      positiveNumber(env.RUMBLE_PING_INTERVAL_MS, DEFAULT_RUNTIME.pingIntervalMs, 500, 30_000),
    ),
    pingMaxRetries: Math.round(
      positiveNumber(env.RUMBLE_PING_MAX_RETRIES, DEFAULT_RUNTIME.pingMaxRetries, 1, 20),
    ),
    dropPolicy: parseDropPolicy(env.RUMBLE_DROP_POLICY),
    countdownMs: fast
      ? positiveNumber(env.RUMBLE_COUNTDOWN_MS, DEFAULT_RUNTIME.countdownMs, 0, 60_000)
      : 3000,
    defaultAutoStartSec: fast
      ? positiveNumber(env.RUMBLE_AUTOSTART_SEC, DEFAULT_RUNTIME.defaultAutoStartSec, 0, 600)
      : DEFAULT_RUNTIME.defaultAutoStartSec,
  };
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

const isUnset = (v: unknown): boolean => v === undefined || v === null;

export function isValidDuration(sec: unknown, rt: RuntimeConfig): sec is number {
  if (typeof sec !== 'number' || !Number.isInteger(sec)) return false;
  return ALLOWED_DURATIONS.includes(sec) || (rt.fast && sec >= 5 && sec <= 300);
}

/** Validates a (possibly partial) settings patch against the allowed values. Unknown / mistyped values are errors. */
export function parseSettingsPatch(raw: unknown, rt: RuntimeConfig): Parsed<Partial<RoomSettings>> {
  const o = asRecord(raw);
  const out: Partial<RoomSettings> = {};
  if (!isUnset(o.arenaId)) {
    if (typeof o.arenaId !== 'string' || !RUMBLE_ARENA_IDS.includes(o.arenaId)) return fail('unknown arena');
    out.arenaId = o.arenaId;
  }
  if (!isUnset(o.game)) {
    if (typeof o.game !== 'string' || !(GAME_KINDS as readonly string[]).includes(o.game)) {
      return fail('unknown game mode');
    }
    out.game = o.game as RumbleGameKind;
  }
  if (!isUnset(o.durationSec)) {
    if (!isValidDuration(o.durationSec, rt)) return fail('invalid duration');
    out.durationSec = o.durationSec;
  }
  if (!isUnset(o.botDifficulty)) {
    if (
      typeof o.botDifficulty !== 'string' ||
      !(DIFFICULTIES as readonly string[]).includes(o.botDifficulty)
    ) {
      return fail('unknown bot difficulty');
    }
    out.botDifficulty = o.botDifficulty;
  }
  return { ok: true, value: out };
}

export function defaultSettings(): RoomSettings {
  return {
    arenaId: DEFAULT_ARENA_ID,
    game: DEFAULT_GAME,
    durationSec: DEFAULT_DURATION_SEC,
    botDifficulty: DEFAULT_DIFFICULTY,
  };
}

export interface RoomOptions {
  private: boolean;
  settings: RoomSettings;
  autoStartSec: number;
}

/** Options of the player who creates a room: `{ private?, arenaId?, game?, durationSec?, botDifficulty?, autoStartSec? }`. */
export function parseRoomOptions(raw: unknown, rt: RuntimeConfig): Parsed<RoomOptions> {
  const o = asRecord(raw);
  let isPrivate = false;
  if (!isUnset(o.private)) {
    if (typeof o.private !== 'boolean') return fail('private must be a boolean');
    isPrivate = o.private;
  }
  const patch = parseSettingsPatch(o, rt);
  if (!patch.ok) return patch;
  let autoStartSec = rt.defaultAutoStartSec;
  if (!isUnset(o.autoStartSec)) {
    const v = o.autoStartSec;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 600) return fail('invalid autoStartSec');
    autoStartSec = v;
  }
  return {
    ok: true,
    value: { private: isPrivate, settings: { ...defaultSettings(), ...patch.value }, autoStartSec },
  };
}

export interface JoinOptions {
  name: string;
  characterId: CharacterId;
}

/** Options of a joining player: `{ name, characterId? }`. A bad name is rejected; an unknown character falls back. */
export function parseJoinOptions(raw: unknown): Parsed<JoinOptions> {
  const o = asRecord(raw);
  const name = validatePlayerName(o.name);
  if (name === null) return fail("invalid name (2-24 letters, digits, spaces, _ . ' -)");
  const characterId = (CHARACTER_IDS as readonly string[]).includes(o.characterId as string)
    ? (o.characterId as CharacterId)
    : CHARACTER_IDS[0]!;
  return { ok: true, value: { name, characterId } };
}

/** Random room code generator; `random(n)` returns an integer in [0, n) (crypto.randomInt in production). */
export function makeRoomCode(random: (maxExclusive: number) => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[random(ROOM_CODE_ALPHABET.length)]!;
  return code;
}

export { MATCH_SEATS };
