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
/**
 * How long a public (matchmaking) room waits for more humans after the first one joined, in seconds (founder decision,
 * docs/DECISIONS.md PIS1): then it starts and bots fill the empty seats. It starts earlier when 32 humans are in. The server
 * default and the entry screen's wording share this one number; only the test-fast server mode may shorten it.
 */
export const PUBLIC_WAIT_SECONDS = 30;

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
/** Characters that draw nothing (zero-width and soft hyphens, variation selectors, Hangul fillers, ...): an invisible name part. */
const INVISIBLE_RE = /\p{Default_Ignorable_Code_Point}/u;
const LATIN_RE = /\p{Script=Latin}/u;
/** Scripts whose letters are routinely used to imitate Latin ones (mixing them with Latin is how a name is spoofed). */
const LOOKALIKE_SCRIPT_RE = /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Cherokee}]/u;

/**
 * A player display name (guest nickname): 2-24 characters (code points) of letters, digits, space and `_ . ' -`, trimmed,
 * NFKC-normalised (full-width and compatibility forms become plain ones), with runs of spaces collapsed and at least one
 * letter or digit. Control, zero-width, bidi-control and format characters, emoji and markup are not in the allowed set, so
 * they are rejected. A name may not mix Latin letters with Cyrillic / Greek / Armenian / Cherokee ones (look-alike spoofing),
 * and may not read as a server bot ("BOT ..." is how filler bots are labelled). Returns the cleaned name, or null.
 */
export function validatePlayerName(raw: unknown): string | null {
  return checkPlayerName(raw).name;
}

export type NameProblem =
  'type' | 'short' | 'long' | 'chars' | 'letters' | 'marks' | 'mixed-script' | 'bot-like';

/** The same check with the reason it failed (the entry screen words it; the server only needs the verdict). */
export function checkPlayerName(
  raw: unknown,
): { name: string; problem: null } | { name: null; problem: NameProblem } {
  if (typeof raw !== 'string') return { name: null, problem: 'type' };
  if (raw.length > 128) return { name: null, problem: 'long' };
  const name = raw.normalize('NFKC').trim().replace(/ {2,}/g, ' ');
  const length = [...name].length;
  if (length < PLAYER_NAME_MIN) return { name: null, problem: 'short' };
  if (length > PLAYER_NAME_MAX) return { name: null, problem: 'long' };
  if (!NAME_RE.test(name) || INVISIBLE_RE.test(name)) return { name: null, problem: 'chars' };
  if (!/[\p{L}\p{N}]/u.test(name)) return { name: null, problem: 'letters' };
  if (/\p{M}{4,}/u.test(name)) return { name: null, problem: 'marks' }; // no stacked combining marks (Yoruba tone + dot-below needs 2)
  if (LATIN_RE.test(name) && LOOKALIKE_SCRIPT_RE.test(name)) return { name: null, problem: 'mixed-script' };
  if (looksLikeBot(name)) return { name: null, problem: 'bot-like' };
  return { name, problem: null };
}

/** Look-alike letters (Cyrillic / Greek, a few full-width leftovers) folded onto the Latin letter they imitate. */
const CONFUSABLES: Record<string, string> = {
  '\u0430': 'a',
  '\u0432': 'b',
  '\u0435': 'e',
  '\u043e': 'o',
  '\u0440': 'p',
  '\u0441': 'c',
  '\u0443': 'y',
  '\u0445': 'x',
  '\u0456': 'i',
  '\u0458': 'j',
  '\u0455': 's',
  '\u043a': 'k',
  '\u043c': 'm',
  '\u043d': 'h',
  '\u0442': 't',
  '\u04bb': 'h',
  '\u03b1': 'a',
  '\u03b2': 'b',
  '\u03b5': 'e',
  '\u03b9': 'i',
  '\u03ba': 'k',
  '\u03bd': 'v',
  '\u03bf': 'o',
  '\u03c1': 'p',
  '\u03c4': 't',
  '\u03c5': 'u',
  '\u03c7': 'x',
  '\u0131': 'i',
  '\u0142': 'l',
};

/**
 * The comparison form of a name: case-folded, accents and marks removed, look-alike letters folded to Latin, separators
 * removed. Two names with the same skeleton read the same to a person ("Ada", "ADA", "Аda" with a Cyrillic A).
 */
export function nameSkeleton(name: string): string {
  const base = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  let out = '';
  for (const ch of base) out += CONFUSABLES[ch] ?? ch;
  return out.replace(/[ _.'-]/g, '');
}

/** True when a name reads as "BOT" or "BOT <something>" (also with look-alike letters or 0 for o): reserved for server bots. */
export function looksLikeBot(name: string): boolean {
  const key = nameSkeleton(name).replace(/0/g, 'o');
  const parts = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[ _.'-]+/);
  const first = parts.find((x) => x !== '') ?? '';
  const firstKey = [...first]
    .map((c) => CONFUSABLES[c] ?? c)
    .join('')
    .replace(/0/g, 'o');
  return key === 'bot' || firstKey === 'bot';
}

export type LobbyPhase = 'lobby' | 'countdown' | 'playing' | 'results';

/** Match settings a room is configured with (public: nothing secret in here). */
export interface RoomSettings {
  arenaId: string;
  game: 'survival' | 'deathmatch' | 'team';
  durationSec: number;
  botDifficulty: string;
  /**
   * Team Rumble only (ignored in the other modes): teammates' blasts hurt each other. Defaults to OFF, exactly like the
   * offline game (decisions WD2, TB1-TB4). Optional: older servers omit it, which means off.
   */
  friendlyFire?: boolean;
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

const SETTINGS_KEYS = ['arenaId', 'game', 'durationSec', 'botDifficulty', 'friendlyFire'] as const;

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
  if ('friendlyFire' in o) {
    if (typeof o.friendlyFire !== 'boolean') return null;
    out.friendlyFire = o.friendlyFire;
  }
  return out;
}
