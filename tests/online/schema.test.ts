import { describe, expect, it } from 'vitest';
import {
  CLIENT_MESSAGE_TYPES,
  LIMITS,
  PROTOCOL_VERSION,
  SERVER_EVENT_TYPES,
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  toWire,
  validateClientMessage,
  validateServerMessage,
} from '../../src/online/schema';
import type { ClientMessage } from '../../src/online/schema';
import { CHARACTER_IDS } from '../../src/sim';
import type { ValidationError } from '../../src/online/errors';
import { obj } from '../../src/online/validate';
import type { Schema } from '../../src/online/validate';

const v = PROTOCOL_VERSION;
const bad = (m: unknown) => {
  const r = validateClientMessage(m);
  if (r.ok) throw new Error(`expected a rejection: ${JSON.stringify(m)}`);
  return r.error;
};
const good = (m: unknown): ClientMessage => {
  const r = validateClientMessage(m);
  if (!r.ok) throw new Error(`rejected: ${JSON.stringify(r.error)}`);
  return r.value;
};

describe('client message validation: well-formed messages', () => {
  it('accepts a minimal example of every client message type', () => {
    const samples: Record<string, Record<string, unknown>> = {
      hello: { client: 'wahala-web' },
      ping: { t: 5 },
      'queue.join': { game: 'classic', arenaId: 'danfoBusPark' },
      'queue.leave': { ticketId: 't-1' },
      'party.create': {},
      'party.join': { code: 'ABC234' },
      'party.leave': { partyId: 'p-1' },
      'party.invite': { partyId: 'p-1', friendId: 'f-1' },
      'party.promote': { partyId: 'p-1', memberId: 'm-1' },
      'party.kick': { partyId: 'p-1', memberId: 'm-1' },
      'party.ready': { partyId: 'p-1', ready: true },
      'lobby.create': { partyId: 'p-1', game: 'team', arenaId: 'rumbleOshodi' },
      'lobby.settings': { roomId: 'r-1', game: 'classic', arenaId: 'danfoBusPark' },
      'lobby.ready': { roomId: 'r-1', ready: false },
      'lobby.character': { roomId: 'r-1', characterId: CHARACTER_IDS[0] },
      'lobby.startReadyCheck': { roomId: 'r-1' },
      'lobby.leave': { roomId: 'r-1' },
      'team.requestSwitch': { roomId: 'r-1' },
      'team.balance': { roomId: 'r-1' },
      'match.start': { roomId: 'r-1' },
      'match.join': { matchId: 'm-1' },
      'match.leave': { matchId: 'm-1' },
      'match.ready': { matchId: 'm-1', ready: true },
      'match.input': { matchId: 'm-1', tick: 10, intent: { move: 'up', place: true } },
      'match.resume': { matchId: 'm-1', resumeToken: 'abcdefghijklmnop0123', lastAckedTick: 30 },
      'progress.settle': { matchId: 'm-1' },
      'social.friendRequest': { code: 'ADA001' },
      'social.friendRespond': { requestId: 'q-1', accept: true },
      'social.inviteRespond': { invitationId: 'i-1', accept: false },
    };
    expect(Object.keys(samples).sort()).toEqual([...CLIENT_MESSAGE_TYPES].sort());
    for (const [type, body] of Object.entries(samples)) {
      expect(validateClientMessage({ type, v, ...body }), type).toMatchObject({ ok: true });
    }
  });

  it('intents: movement, one-shots and a vehicle launch are accepted', () => {
    const base = { type: 'match.input', v, matchId: 'm', tick: 1 };
    good({ ...base, intent: { move: null, detonate: true, special: true, placeHeld: true } });
    good({ ...base, intent: { vehicle: { type: 'auto' } } });
    good({
      ...base,
      intent: { vehicle: { type: 'launch', entry: { x: 0, y: 4, dir: 'right' }, turn: { atIndex: 2, dir: 'up' } } },
    });
  });

  it('encode -> decode round-trips and adds the protocol version', () => {
    const text = encodeClientMessage({ type: 'queue.join', game: 'team', arenaId: 'rumbleOshodi' });
    expect(JSON.parse(text).v).toBe(PROTOCOL_VERSION);
    expect(decodeClientMessage(text)).toMatchObject({ ok: true, value: { type: 'queue.join', game: 'team' } });
  });
});

describe('client message validation: malicious and malformed payloads', () => {
  it('rejects non-objects, arrays and unknown types', () => {
    for (const m of [null, undefined, 5, 'x', [], [{ type: 'ping' }]]) expect(bad(m).code).toBe('malformed');
    expect(bad({ type: 'admin.grantXp', v }).code).toBe('unknownType');
    expect(bad({ v }).code).toBe('invalid');
    expect(bad({ type: 5, v }).code).toBe('invalid');
    expect(bad({ type: '__proto__', v }).code).toBe('unknownType');
    expect(bad({ type: 'constructor', v }).code).toBe('unknownType');
  });

  it('rejects the wrong protocol version', () => {
    expect(bad({ type: 'ping', t: 1, v: PROTOCOL_VERSION + 1 }).code).toBe('versionMismatch');
    expect(bad({ type: 'ping', t: 1, v: 0 }).code).toBe('versionMismatch');
    expect(bad({ type: 'ping', t: 1 }).code).toBe('invalid');
  });

  it('a client may never send positions, kills, rewards, results or team assignments', () => {
    const forbidden: [string, Record<string, unknown>][] = [
      ['match.input', { matchId: 'm', tick: 1, intent: {}, x: 3, y: 4 }],
      ['match.input', { matchId: 'm', tick: 1, intent: {}, position: { x: 1, y: 1 } }],
      ['match.input', { matchId: 'm', tick: 1, intent: {}, kills: 99 }],
      ['match.input', { matchId: 'm', tick: 1, intent: { place: true, kills: 3 } }],
      ['match.input', { matchId: 'm', tick: 1, intent: { x: 4 } }],
      ['progress.settle', { matchId: 'm', xp: 99999 }],
      ['progress.settle', { matchId: 'm', result: 'win' }],
      ['progress.settle', { matchId: 'm', rewards: ['gold'] }],
      ['progress.settle', { matchId: 'm', rating: 3000 }],
      ['team.requestSwitch', { roomId: 'r', team: 1 }],
      ['lobby.ready', { roomId: 'r', ready: true, team: 0 }],
      ['lobby.settings', { roomId: 'r', game: 'team', arenaId: 'rumbleOshodi', teams: [[1], [2]] }],
      ['match.ready', { matchId: 'm', ready: true, alive: true }],
      ['match.join', { matchId: 'm', seed: 1 }],
    ];
    for (const [type, body] of forbidden) {
      expect(bad({ type, v, ...body }).code, `${type} ${JSON.stringify(body)}`).toBe('forbiddenField');
    }
  });

  it('rejects unknown fields (strict objects), including prototype pollution attempts', () => {
    expect(bad({ type: 'ping', v, t: 1, extra: true }).code).toBe('unknownField');
    const polluted = JSON.parse('{"type":"ping","v":1,"t":1,"__proto__":{"admin":true}}') as unknown;
    expect(bad(polluted).code).toBe('unknownField');
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
    expect(bad({ type: 'match.input', v, matchId: 'm', tick: 1, intent: { constructor: {} } }).code).toBe('unknownField');
  });

  it('rejects wrong field types and missing fields', () => {
    expect(bad({ type: 'lobby.ready', v, roomId: 'r', ready: 'yes' }).code).toBe('invalid');
    expect(bad({ type: 'lobby.ready', v, roomId: 'r' }).code).toBe('invalid');
    expect(bad({ type: 'lobby.ready', v, roomId: 5, ready: true }).code).toBe('invalid');
    expect(bad({ type: 'queue.join', v, game: 'mission', arenaId: 'x' }).code).toBe('invalid');
    expect(bad({ type: 'queue.join', v, game: 'classic', arenaId: '../../etc/passwd' }).code).toBe('invalid');
    expect(bad({ type: 'lobby.character', v, roomId: 'r', characterId: 'god' }).code).toBe('invalid');
    expect(bad({ type: 'match.input', v, matchId: 'm', tick: 1, intent: 'up' }).code).toBe('invalid');
    expect(bad({ type: 'match.input', v, matchId: 'm', tick: 1, intent: { move: 'north' } }).code).toBe('invalid');
    expect(bad({ type: 'match.input', v, matchId: 'm', tick: 1, intent: { place: 1 } }).code).toBe('invalid');
  });

  it('rejects out-of-range and non-finite numbers', () => {
    for (const tick of [-1, 1.5, NaN, Infinity, LIMITS.maxTick + 1, '5']) {
      expect(bad({ type: 'match.input', v, matchId: 'm', tick, intent: {} }).code, String(tick)).toBe('invalid');
    }
    expect(
      bad({ type: 'match.input', v, matchId: 'm', tick: 1, intent: { vehicle: { type: 'launch', entry: { x: 999, y: 0, dir: 'up' } } } }).code,
    ).toBe('invalid');
    expect(bad({ type: 'match.input', v, matchId: 'm', tick: 1, intent: { vehicle: { type: 'rocket' } } }).code).toBe('unknownType');
  });

  it('rejects oversize strings and ids with odd characters', () => {
    expect(bad({ type: 'match.join', v, matchId: 'a'.repeat(LIMITS.maxId + 1) }).code).toBe('tooLarge');
    expect(bad({ type: 'match.join', v, matchId: 'has space' }).code).toBe('invalid');
    expect(bad({ type: 'match.join', v, matchId: '<script>' }).code).toBe('invalid');
    expect(bad({ type: 'match.join', v, matchId: '' }).code).toBe('invalid');
    expect(bad({ type: 'hello', v, client: 'c'.repeat(33) }).code).toBe('tooLarge');
    expect(bad({ type: 'hello', v, client: 'c', token: 't'.repeat(LIMITS.maxToken + 1) }).code).toBe('tooLarge');
    expect(bad({ type: 'party.join', v, code: 'abc' }).code).toBe('invalid');
  });

  it('decoding enforces the byte limit and valid JSON before anything else', () => {
    expect(decodeClientMessage('{not json').ok).toBe(false);
    const big = JSON.stringify({ type: 'hello', v, client: 'x', token: 'y'.repeat(LIMITS.maxMessageBytes) });
    const r = decodeClientMessage(big);
    expect(!r.ok && r.error.code).toBe('tooLarge');
    // multi-byte characters count as bytes, not characters
    const multi = JSON.stringify({ type: 'hello', v, client: '€'.repeat(30), pad: '€'.repeat(2000) });
    expect(decodeClientMessage(multi).ok).toBe(false);
    expect(decodeClientMessage(42 as unknown as string).ok).toBe(false);
  });

  it('the toolkit refuses runaway nesting instead of recursing into it', () => {
    let nest: unknown = {};
    for (let i = 0; i < 30; i++) nest = { a: nest };
    let schema: Schema<unknown> = obj({});
    for (let i = 0; i < 12; i++) schema = obj({ a: schema });
    const out: ValidationError[] = [];
    expect(schema.parse(nest, '', out, 0)).toBeNull();
    expect(out[0]?.code).toBe('tooLarge');
  });
});

describe('server messages', () => {
  it('every server event type has a validator and round-trips shallowly', () => {
    expect(SERVER_EVENT_TYPES.length).toBeGreaterThan(8);
    const wire = toWire({ type: 'match.countdown', matchId: 'm-1', secondsLeft: 3 });
    expect(validateServerMessage(wire)).toMatchObject({ ok: true });
    expect(decodeServerMessage(JSON.stringify(wire))).toMatchObject({ ok: true, value: { secondsLeft: 3 } });
  });

  it('rejects unknown types, wrong versions, bad shapes and oversize frames', () => {
    expect(validateServerMessage({ v, type: 'admin.shutdown' }).ok).toBe(false);
    expect(validateServerMessage({ v: 9, type: 'pong', t: 1 })).toMatchObject({ ok: false, error: { code: 'versionMismatch' } });
    expect(validateServerMessage({ v, type: 'room.update', room: 'not an object' }).ok).toBe(false);
    expect(validateServerMessage({ v, type: 'match.countdown', matchId: 'm', secondsLeft: -3 }).ok).toBe(false);
    expect(decodeServerMessage('x'.repeat(LIMITS.maxServerMessageBytes + 1)).ok).toBe(false);
    expect(decodeServerMessage('[1,2]').ok).toBe(false);
  });
});
