/**
 * City Rumble online wire protocol, version 1 (docs/CITY_RUMBLE_ONLINE.md section 4).
 *
 * Transport: one secure WebSocket per client (Colyseus room connection). Control messages are small objects (Colyseus
 * encodes them as MessagePack); game state travels as binary `deflate-raw(pack(...))` frames built ONCE per room and
 * sent to every client.
 *
 * The client sends INTENT ONLY: which direction is held, whether A is held, and which buttons were pressed. It never
 * sends a position, a hit, an elimination, a score, a result, a team or a seed; the validator below rejects anything
 * but the exact input shape. The server applies inputs to its own simulation at its next tick.
 */
import type { Dir, GameKind, MatchSettings, PlayerSetup, SimEvent } from '../sim';
import type { Patch } from './delta';
import type { PublicState } from './publicState';

export const NET_PROTOCOL = 1;
export const TICK_RATE = 60;

/** Message type names (Colyseus `type` strings). */
export const MSG = {
  // client -> server
  input: 'in',
  ping: 'ping',
  resync: 'resync',
  ready: 'ready',
  start: 'start',
  rematch: 'rematch',
  settings: 'settings',
  // server -> client
  welcome: 'welcome',
  lobby: 'lobby',
  keyframe: 'kf',
  frames: 'fr',
  pong: 'pong',
  results: 'results',
  notice: 'notice',
} as const;

// ---------------------------------------------------------------- client -> server

/** One-shot buttons as a bit mask (each is applied once, at the server's next tick). */
export const BUTTON = {
  place: 1, // A tap: generator
  special: 2, // B tap: the one deterministic context special
  detonate: 4, // A / B hold: remote detonator
} as const;
export const BUTTON_MASK = BUTTON.place | BUTTON.special | BUTTON.detonate;

const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

/**
 * The input message. Sent when the held state changes or a button is pressed (not every tick).
 *  s: sequence number (strictly increasing per connection; the server drops stale / duplicate ones)
 *  m: the held direction, or null
 *  h: A is held (QUICK HANDS lays on every tile while held)
 *  b: one-shot button mask (BUTTON)
 */
export interface InputMsg {
  s: number;
  m: Dir | null;
  h: boolean;
  b: number;
}

export type InputError = 'shape' | 'field' | 'range';

/** Strict validation of an untrusted input message: exact keys, exact types, bounded values. */
export function validateInput(
  raw: unknown,
): { ok: true; value: InputMsg } | { ok: false; error: InputError } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'shape' };
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 4 || !('s' in o && 'm' in o && 'h' in o && 'b' in o))
    return { ok: false, error: 'field' };
  const { s, m, h, b } = o;
  if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 0x7fffffff)
    return { ok: false, error: 'range' };
  if (m !== null && !(typeof m === 'string' && (DIRS as readonly string[]).includes(m)))
    return { ok: false, error: 'range' };
  if (typeof h !== 'boolean') return { ok: false, error: 'range' };
  if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || (b & ~BUTTON_MASK) !== 0)
    return { ok: false, error: 'range' };
  return { ok: true, value: { s, m: m as Dir | null, h, b } };
}

export interface PingMsg {
  /** Client clock (ms) echoed back in the pong. */
  c: number;
}

export function validatePing(raw: unknown): PingMsg | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).length !== 1 || typeof o.c !== 'number' || !Number.isFinite(o.c)) return null;
  return { c: o.c };
}

// ---------------------------------------------------------------- server -> client

/** Everything a client needs to rebuild the match's static parts (config, arena) locally. Public only: no seed. */
export interface MatchDescriptor {
  protocol: number;
  matchId: string;
  arenaId: string;
  settings: Partial<MatchSettings> & { game: GameKind };
  /** One entry per seat, in seat order. Bots are labelled (`isBot`) and named as bots. */
  players: PlayerSetup[];
  /** Server ticks per frames message. */
  sendEvery: number;
  /** A canonical hash of the public state is attached every this many ticks. */
  hashEvery: number;
}

export interface WelcomeMsg {
  descriptor: MatchDescriptor | null;
  /** Your seat in the match (null while in the lobby or as a spectator). */
  seat: number | null;
  /** Secret, single-use reconnection credential is handled by Colyseus (`reconnectionToken`); never logged. */
  roomCode: string;
}

/** Keyframe payload (binary): the whole public state at tick `t`. */
export interface KeyframePayload {
  t: number;
  s: PublicState;
}

/** One tick: [tick, patch-or-null, events-or-null]. Applied as `predict(replica); applyPatch(replica, patch)`. */
export type TickFrame = [number, Patch | null, SimEvent[] | null];

/** Frames payload (binary): consecutive ticks, plus an optional [tick, canonicalHash] desync check. */
export interface FramesPayload {
  f: TickFrame[];
  h?: [number, number];
}

export interface PongMsg {
  c: number;
  /** Server tick when the ping was handled. */
  t: number;
}

/** Server-trusted results, derived from the server's own simulation only. */
export interface ResultsMsg {
  matchId: string;
  tick: number;
  winnerSeat: number | null;
  winnerTeam: number | null;
  draw: boolean;
  /** Final state hash (lets every client confirm it saw the same match). */
  stateHash: number;
  players: {
    seat: number;
    name: string;
    isBot: boolean;
    team: number | null;
    placement: number;
    /**
     * The PERSONAL numbers (what a future ranking / XP / achievement layer reads). For a human seat they count only
     * time the HUMAN controlled the fighter: nothing a replacement bot did while they were away. For a server-bot seat
     * (`isBot`) they are the simulation's totals. The match outcome (winner, team score, Sudden Death, `placement`) is
     * decided by the simulation, which counts every credited kill, and is NOT affected by this split.
     */
    kills: number;
    deaths: number;
    assists: number;
    /**
     * Human seats only (all optional: absent on bots and on older servers). What the replacement bot did on this seat:
     * `kills + botKills` is the simulation's total for the seat.
     */
    botKills?: number;
    botDeaths?: number;
    botAssists?: number;
    /** Seconds a replacement bot controlled the seat. */
    autopilotSeconds?: number;
    /** Seconds the seat stood without any controller (the grace period, or the whole window under policy `idle`). */
    absentSeconds?: number;
    /** How many times the human's connection dropped during the match. */
    drops?: number;
    /** True when a bot (not the human) was in control when the match ended. */
    controlledByBotAtEnd?: boolean;
  }[];
}

// ---------------------------------------------------------------- lobby (rooms, codes, names)

/** Room codes: 6 characters, no 0 / O / 1 / I / L (easy to read aloud and to type). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
/** A room holds up to this many humans, and a match always has this many seats (bots fill the rest). */
export const MAX_HUMANS = 32;
export const MATCH_SEATS = 32;

const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Normalises what a player typed (case, spaces) and returns the code, or null if it cannot be one. */
export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return ROOM_CODE_RE.test(code) ? code : null;
}

/** WebSocket close codes (4000 range) the server uses for its own decisions. 4000-4003 and 4010 belong to Colyseus. */
export const CLOSE = {
  /** Too many invalid messages in a short time. */
  abuse: 4400,
} as const;

export const PLAYER_NAME_MIN = 2;
export const PLAYER_NAME_MAX = 24;
const NAME_RE = /^[\p{L}\p{M}\p{N} _.'-]+$/u;

/**
 * A player display name: 2-24 characters (code points) of letters, digits, space and `_ . ' -`, trimmed, NFC-normalised,
 * with runs of spaces collapsed and at least one letter or digit. Returns the cleaned name, or null if it is rejected.
 */
export function validatePlayerName(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 128) return null;
  const name = raw.normalize('NFC').trim().replace(/ {2,}/g, ' ');
  const length = [...name].length;
  if (length < PLAYER_NAME_MIN || length > PLAYER_NAME_MAX) return null;
  if (!NAME_RE.test(name) || !/[\p{L}\p{N}]/u.test(name)) return null;
  if (/\p{M}{4,}/u.test(name)) return null; // no stacked combining marks (Yoruba tone + dot-below needs 2)
  return name;
}

export type LobbyPhase = 'lobby' | 'countdown' | 'playing' | 'results';

/** Match settings a room is configured with (public: nothing secret in here). */
export interface RoomSettings {
  arenaId: string;
  game: 'survival' | 'deathmatch' | 'team';
  durationSec: number;
  botDifficulty: string;
}

export interface LobbyMemberView {
  name: string;
  characterId: string;
  ready: boolean;
  isHost: boolean;
  /** Seat in the running / finished match; null before a match starts. */
  seat: number | null;
  /** False while a playing member's connection is down (their seat stands for the grace period, then a bot plays it). */
  connected: boolean;
  /**
   * Optional (older servers omit it): true while a replacement bot plays this member's seat, i.e. the connection is
   * down and the grace period is over. The UI can show "a bot is playing for X"; reconnecting clears it.
   */
  botControlled?: boolean;
}

/**
 * Lobby state, sent to every client on each change (never carries session ids or reconnection tokens).
 * `you` is the receiving client's index in `members`, so it can tell which row is its own.
 */
export interface LobbyMsg {
  code: string;
  phase: LobbyPhase;
  private: boolean;
  members: LobbyMemberView[];
  settings: RoomSettings;
  /** Time left of the pre-match countdown when this message was sent, else null. */
  countdownMs: number | null;
  /** Time left before a public lobby starts by itself when this message was sent, else null. */
  autoStartMs: number | null;
  /** Seats the server fills with bots when the match starts. */
  botsToFill: number;
  you: number | null;
}

/** A human-readable refusal or warning for one client (never needed to keep playing). */
export interface NoticeMsg {
  code: string;
  message: string;
}

/** Client -> server: toggle the ready mark. */
export interface ReadyMsg {
  ready: boolean;
}

export function validateReady(raw: unknown): ReadyMsg | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).length !== 1 || typeof o.ready !== 'boolean') return null;
  return { ready: o.ready };
}

/** `start` and `rematch` carry no payload: nothing, null or an empty object. */
export function validateEmptyMsg(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  return typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0;
}

/** Client -> server (host only): change some of the room settings. Values are checked against the allowed sets by the room. */
export type SettingsMsg = Partial<RoomSettings>;

const SETTINGS_KEYS = ['arenaId', 'game', 'durationSec', 'botDifficulty'] as const;

export function validateSettingsMsg(raw: unknown): SettingsMsg | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 0 || keys.length > SETTINGS_KEYS.length) return null;
  const out: SettingsMsg = {};
  for (const k of keys) {
    if (!(SETTINGS_KEYS as readonly string[]).includes(k)) return null;
  }
  if ('arenaId' in o) {
    if (typeof o.arenaId !== 'string' || o.arenaId.length < 1 || o.arenaId.length > 48) return null;
    out.arenaId = o.arenaId;
  }
  if ('game' in o) {
    if (o.game !== 'survival' && o.game !== 'deathmatch' && o.game !== 'team') return null;
    out.game = o.game;
  }
  if ('durationSec' in o) {
    if (typeof o.durationSec !== 'number' || !Number.isInteger(o.durationSec)) return null;
    if (o.durationSec < 1 || o.durationSec > 3600) return null;
    out.durationSec = o.durationSec;
  }
  if ('botDifficulty' in o) {
    if (typeof o.botDifficulty !== 'string' || o.botDifficulty.length < 1 || o.botDifficulty.length > 24)
      return null;
    out.botDifficulty = o.botDifficulty;
  }
  return out;
}
