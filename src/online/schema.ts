/**
 * The wire protocol: message and event schemas, a protocol version and pure validators.
 *
 * Authority model (docs/ONLINE_ARCHITECTURE.md): the SERVER runs the simulation. A client may send only
 *   - intents (`match.input`), ready flags and commands (create / join / leave / start / ask to switch team ...);
 *   - never positions, kills, results, rewards, XP, ratings or team assignments (`forbiddenField`).
 * These validators are for client UX and for the mock; a real server MUST re-validate every message itself and
 * must not trust anything a client says.
 */
import { CHARACTER_IDS } from '../sim';
import type { Intent } from '../sim';
import type { OnlineError, ValidationError } from './errors';
import { err, ok } from './result';
import type { Result } from './result';
import type {
  Invitation,
  MatchId,
  MatchResults,
  MatchSnapshot,
  Party,
  PartyId,
  Profile,
  QueueStatus,
  Room,
} from './types';
import { ONLINE_GAMES } from './types';
import type { ProgressionProfile, ProgressionUpdate } from '../progression';
import { bool, int, lit, nullable, obj, opt, record, str, variant } from './validate';
import type { Schema } from './validate';

export const PROTOCOL_VERSION = 1;

/** Hard limits every validator enforces. */
export const LIMITS = {
  maxMessageBytes: 4096,
  maxServerMessageBytes: 262_144,
  maxId: 64,
  maxTick: 1_000_000,
  maxToken: 512,
} as const;

// ---------------------------------------------------------------- field schemas

const ID = str({ min: 1, max: LIMITS.maxId, pattern: /^[A-Za-z0-9_.:-]+$/ });
const ARENA = str({ min: 1, max: 40, pattern: /^[A-Za-z0-9_-]+$/ });
const CODE = str({ min: 4, max: 8, pattern: /^[A-Z0-9]+$/ });
const GAME = lit(ONLINE_GAMES);
const DIR = lit(['up', 'right', 'down', 'left'] as const);
const COORD = int(0, 63);

/** One tick of input. Optional fields, strict keys. `vehicle.entry` is a CHOICE (the server checks it is a legal border entry). */
const vehicleSchema = variant('type', {
  begin: {},
  cancel: {},
  auto: {},
  launch: { entry: obj({ x: COORD, y: COORD, dir: DIR }), turn: opt(obj({ atIndex: int(0, 63), dir: DIR })) },
});

export const intentSchema: Schema<Intent> = obj({
  move: opt(nullable(DIR)),
  place: opt(bool()),
  placeHeld: opt(bool()),
  special: opt(bool()),
  action: opt(bool()),
  disarm: opt(bool()),
  skill: opt(bool()),
  detonate: opt(bool()),
  vehicle: opt(vehicleSchema),
}) as Schema<Intent>;

// ---------------------------------------------------------------- client -> server

const base = { v: int(0, 1000), id: opt(ID) };

const clientVariants = {
  hello: { client: str({ max: 32 }), token: opt(str({ max: LIMITS.maxToken })) },
  ping: { t: int(0, Number.MAX_SAFE_INTEGER) },
  'queue.join': { game: GAME, arenaId: ARENA },
  'queue.leave': { ticketId: ID },
  'party.create': {},
  'party.join': { code: CODE },
  'party.leave': { partyId: ID },
  'party.invite': { partyId: ID, friendId: ID },
  'party.promote': { partyId: ID, memberId: ID },
  'party.kick': { partyId: ID, memberId: ID },
  'party.ready': { partyId: ID, ready: bool() },
  'lobby.create': { partyId: ID, game: GAME, arenaId: ARENA },
  'lobby.settings': { roomId: ID, game: GAME, arenaId: ARENA },
  'lobby.ready': { roomId: ID, ready: bool() },
  'lobby.character': { roomId: ID, characterId: lit(CHARACTER_IDS) },
  'lobby.startReadyCheck': { roomId: ID },
  'lobby.leave': { roomId: ID },
  /** Ask the server to move you to another team. There is no team field: the server decides. */
  'team.requestSwitch': { roomId: ID },
  'team.balance': { roomId: ID },
  'match.start': { roomId: ID },
  'match.join': { matchId: ID },
  'match.leave': { matchId: ID },
  'match.ready': { matchId: ID, ready: bool() },
  'match.input': { matchId: ID, tick: int(0, LIMITS.maxTick), intent: intentSchema },
  'match.resume': { matchId: ID, resumeToken: str({ min: 16, max: 128, pattern: /^[A-Za-z0-9_-]+$/ }), lastAckedTick: int(0, LIMITS.maxTick) },
  /** Ask the server to settle a finished match into your progression. The client never sends results. */
  'progress.settle': { matchId: ID },
  'social.friendRequest': { code: CODE },
  'social.friendRespond': { requestId: ID, accept: bool() },
  'social.inviteRespond': { invitationId: ID, accept: bool() },
} as const;

type ClientShapes = { [K in keyof typeof clientVariants]: (typeof base) & (typeof clientVariants)[K] };
const clientShapes = Object.fromEntries(
  Object.entries(clientVariants).map(([k, shape]) => [k, { ...base, ...shape }]),
) as ClientShapes;

const clientSchema = variant('type', clientShapes);

/** Every message a client may send (the discriminated union, derived from the schema). */
export type ClientMessage = ReturnType<typeof clientSchema.parse> extends infer R
  ? R extends { value: infer T }
    ? T
    : never
  : never;
export type ClientMessageType = ClientMessage['type'];
export const CLIENT_MESSAGE_TYPES = Object.keys(clientVariants) as ClientMessageType[];

/**
 * Validates one decoded client message. Returns the FIRST problem as a `ValidationError`:
 * `versionMismatch` (wrong `v`), `unknownType`, `forbiddenField` (client-supplied authority), `unknownField`,
 * `tooLarge` (strings / arrays / depth), or `invalid` (wrong type, out of range, missing).
 */
export function validateClientMessage(input: unknown): Result<ClientMessage, ValidationError> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err({ code: 'malformed', path: '', message: 'a message is a JSON object' });
  }
  const v = (input as { v?: unknown }).v;
  if (typeof v === 'number' && v !== PROTOCOL_VERSION) {
    return err({ code: 'versionMismatch', path: 'v', message: `protocol ${PROTOCOL_VERSION} expected` });
  }
  const out: ValidationError[] = [];
  const r = clientSchema.parse(input, '', out, 0);
  if (r) return ok(r.value as ClientMessage);
  return err(out[0] ?? { code: 'invalid', path: '', message: 'invalid message' });
}

/** Decodes raw text (size first, then JSON) and validates it. */
export function decodeClientMessage(raw: string): Result<ClientMessage, ValidationError> {
  if (typeof raw !== 'string') return err({ code: 'malformed', path: '', message: 'text expected' });
  if (new TextEncoder().encode(raw).length > LIMITS.maxMessageBytes) {
    return err({ code: 'tooLarge', path: '', message: `message over ${LIMITS.maxMessageBytes} bytes` });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err({ code: 'malformed', path: '', message: 'not valid JSON' });
  }
  return validateClientMessage(parsed);
}

// ---------------------------------------------------------------- server -> client

/** Everything the server pushes. */
export type ServerEvent =
  | { type: 'hello.ack'; serverTime: number; profile: Profile }
  | { type: 'error'; error: OnlineError; replyTo?: string }
  | { type: 'pong'; t: number }
  | { type: 'queue.update'; status: QueueStatus }
  | { type: 'party.update'; party: Party }
  | { type: 'party.closed'; partyId: PartyId }
  | { type: 'room.update'; room: Room }
  | { type: 'match.countdown'; matchId: MatchId; secondsLeft: number }
  | { type: 'match.snapshot'; snapshot: MatchSnapshot }
  | { type: 'match.connection'; matchId: MatchId; seat: number; connected: boolean; graceMs: number | null }
  | { type: 'match.results'; results: MatchResults }
  | { type: 'progress.update'; update: ProgressionUpdate; profile: ProgressionProfile }
  | { type: 'social.invitation'; invitation: Invitation };

export type ServerEventType = ServerEvent['type'];
export type ServerMessage = ServerEvent & { v: typeof PROTOCOL_VERSION };

const serverVariants = {
  'hello.ack': { serverTime: int(0, Number.MAX_SAFE_INTEGER), profile: record() },
  error: { error: record(), replyTo: opt(ID) },
  pong: { t: int(0, Number.MAX_SAFE_INTEGER) },
  'queue.update': { status: record() },
  'party.update': { party: record() },
  'party.closed': { partyId: ID },
  'room.update': { room: record() },
  'match.countdown': { matchId: ID, secondsLeft: int(0, 600) },
  'match.snapshot': { snapshot: record(1000) },
  'match.connection': { matchId: ID, seat: int(0, 63), connected: bool(), graceMs: nullable(int(0, 3_600_000)) },
  'match.results': { results: record() },
  'progress.update': { update: record(), profile: record() },
  'social.invitation': { invitation: record() },
} as const;

const serverSchema = variant(
  'type',
  Object.fromEntries(Object.entries(serverVariants).map(([k, s]) => [k, { v: int(0, 1000), ...s }])) as {
    [K in keyof typeof serverVariants]: { v: Schema<number> } & (typeof serverVariants)[K];
  },
);
export const SERVER_EVENT_TYPES = Object.keys(serverVariants) as ServerEventType[];

/**
 * SHALLOW validation of what the server sent (envelope, type, field kinds, sizes): the typed union above is the
 * contract; nested payloads (rooms, snapshots) are trusted structurally only. A client must still treat all of it
 * as display data, never as instructions.
 */
export function validateServerMessage(input: unknown): Result<ServerMessage, ValidationError> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err({ code: 'malformed', path: '', message: 'a message is a JSON object' });
  }
  const v = (input as { v?: unknown }).v;
  if (typeof v === 'number' && v !== PROTOCOL_VERSION) {
    return err({ code: 'versionMismatch', path: 'v', message: `protocol ${PROTOCOL_VERSION} expected` });
  }
  const out: ValidationError[] = [];
  const r = serverSchema.parse(input, '', out, 0);
  if (r) return ok(r.value as unknown as ServerMessage);
  return err(out[0] ?? { code: 'invalid', path: '', message: 'invalid message' });
}

export function decodeServerMessage(raw: string): Result<ServerMessage, ValidationError> {
  if (typeof raw !== 'string') return err({ code: 'malformed', path: '', message: 'text expected' });
  if (new TextEncoder().encode(raw).length > LIMITS.maxServerMessageBytes) {
    return err({ code: 'tooLarge', path: '', message: 'server message too large' });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err({ code: 'malformed', path: '', message: 'not valid JSON' });
  }
  return validateServerMessage(parsed);
}

/** Wraps an event for the wire (adds the protocol version). */
export const toWire = (e: ServerEvent): ServerMessage => ({ ...e, v: PROTOCOL_VERSION }) as ServerMessage;

/** Encodes a client message (adds the version). The caller builds the message without `v`. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ClientMessageInput = DistributiveOmit<ClientMessage, 'v'>;
export function encodeClientMessage(m: ClientMessageInput): string {
  return JSON.stringify({ ...m, v: PROTOCOL_VERSION });
}
