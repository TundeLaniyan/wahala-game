/**
 * Endpoints the MATCH SERVER calls (HMAC-signed, `auth: 'service'`). They are the only way a match result, a participant list or
 * an "in match" presence can enter the platform: no player credential reaches them.
 */
import { badRequest } from '../errors';
import type { RouteDef } from '../http/router';
import type {
  FinishedInput,
  GameKind,
  MatchService,
  ParticipantInput,
  ResultInput,
  StartedInput,
} from '../matches/service';
import { GAME_KINDS } from '../matches/service';
import { arr, bool, int, isoDate, obj, oneOf, optBool, optInt, optStr, str } from '../util/validate';
import type { Obj } from '../util/validate';

const ID_RE = /^[A-Za-z0-9_.:-]{6,64}$/;
const ROOM_RE = /^[A-Za-z0-9]{6}$/;
const MAX_SEATS = 64;

function participant(raw: unknown): ParticipantInput {
  const o = obj(raw, ['seat', 'playerId', 'name', 'isBot', 'team'], 'participant');
  return {
    seat: int(o, 'seat', 0, MAX_SEATS - 1),
    playerId: o.playerId === undefined || o.playerId === null ? null : str(o, 'playerId', 36, 36),
    name: str(o, 'name', 1, 60),
    isBot: bool(o, 'isBot'),
    team: optInt(o, 'team', 0, 15),
  };
}

function result(raw: unknown): ResultInput {
  const o = obj(
    raw,
    [
      'seat',
      'placement',
      'kills',
      'deaths',
      'assists',
      'botKills',
      'botDeaths',
      'botAssists',
      'controlledByBotAtEnd',
    ],
    'result',
  );
  return {
    seat: int(o, 'seat', 0, MAX_SEATS - 1),
    placement: optInt(o, 'placement', 1, MAX_SEATS),
    kills: optInt(o, 'kills', 0, 10_000),
    deaths: optInt(o, 'deaths', 0, 10_000),
    assists: optInt(o, 'assists', 0, 10_000),
    botKills: optInt(o, 'botKills', 0, 10_000),
    botDeaths: optInt(o, 'botDeaths', 0, 10_000),
    botAssists: optInt(o, 'botAssists', 0, 10_000),
    controlledByBotAtEnd: optBool(o, 'controlledByBotAtEnd'),
  };
}

function common(o: Obj): {
  matchId: string;
  game: GameKind;
  arenaId: string;
  roomCode: string | null;
  seats: number;
} {
  const matchId = str(o, 'matchId', 6, 64);
  if (!ID_RE.test(matchId)) throw badRequest('matchId has characters that are not allowed');
  const roomCode = optStr(o, 'roomCode', 6, 6) ?? null;
  if (roomCode !== null && !ROOM_RE.test(roomCode)) throw badRequest('roomCode must be 6 letters or digits');
  return {
    matchId,
    game: oneOf(o, 'game', GAME_KINDS),
    arenaId: str(o, 'arenaId', 1, 64),
    roomCode,
    seats: int(o, 'seats', 1, MAX_SEATS),
  };
}

export function internalRoutes(matches: MatchService): RouteDef[] {
  return [
    {
      method: 'POST',
      path: '/internal/v1/matches/started',
      auth: 'service',
      rate: null,
      maxBytes: 64 * 1024,
      summary: 'Match server: a match began (participants with their ticketed player ids)',
      async handler(ctx) {
        const o = obj(ctx.json(), [
          'matchId',
          'game',
          'arenaId',
          'roomCode',
          'seats',
          'startedAt',
          'participants',
        ]);
        const input: StartedInput = {
          ...common(o),
          startedAt: isoDate(o, 'startedAt'),
          participants: arr(o, 'participants', MAX_SEATS).map(participant),
        };
        const r = await matches.started(input);
        return { status: r.duplicate ? 200 : 201, body: r };
      },
    },
    {
      method: 'POST',
      path: '/internal/v1/matches/finished',
      auth: 'service',
      rate: null,
      maxBytes: 128 * 1024,
      summary: 'Match server: a match ended (final facts per seat). Idempotent: the first call wins',
      async handler(ctx) {
        const o = obj(ctx.json(), [
          'matchId',
          'game',
          'arenaId',
          'roomCode',
          'seats',
          'startedAt',
          'endedAt',
          'durationSec',
          'participants',
          'results',
        ]);
        const input: FinishedInput = {
          ...common(o),
          startedAt: o.startedAt === undefined || o.startedAt === null ? null : isoDate(o, 'startedAt'),
          endedAt: isoDate(o, 'endedAt'),
          durationSec: int(o, 'durationSec', 0, 7200),
          participants: arr(o, 'participants', MAX_SEATS).map(participant),
          results: arr(o, 'results', MAX_SEATS).map(result),
        };
        const r = await matches.finished(input);
        return { status: r.duplicate ? 200 : 201, body: r };
      },
    },
  ];
}
