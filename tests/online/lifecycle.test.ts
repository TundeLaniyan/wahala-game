import { describe, expect, it } from 'vitest';
import {
  MATCH_TRANSITIONS,
  ROOM_TRANSITIONS,
  acceptsInput,
  balanceTeams,
  canBalanceTeams,
  canChangeSettings,
  canSetReady,
  canStartReadyCheck,
  canSwitchTeam,
  checkPartyAction,
  isRoomEditable,
  isRoomFinal,
  nextMatchPhase,
  nextRoomState,
  partyPermissions,
  teamCapacity,
} from '../../src/online/lifecycle';
import type { MatchEvent, RoomEvent } from '../../src/online/lifecycle';
import type { MatchPhase, RoomState } from '../../src/online/types';
import { createRateLimiter, fnv1a, makeOpaqueToken } from '../../src/online/util';

const ROOM_STATES = Object.keys(ROOM_TRANSITIONS) as RoomState[];
const ROOM_EVENTS: RoomEvent[] = [
  'open',
  'startReadyCheck',
  'allReady',
  'readyFailed',
  'countdownDone',
  'cancelStart',
  'matchEnded',
  'abort',
];

describe('room state machine', () => {
  it('walks created -> open -> readyCheck -> starting -> inProgress -> finished', () => {
    let s: RoomState = 'created';
    for (const [event, want] of [
      ['open', 'open'],
      ['startReadyCheck', 'readyCheck'],
      ['allReady', 'starting'],
      ['countdownDone', 'inProgress'],
      ['matchEnded', 'finished'],
    ] as [RoomEvent, RoomState][]) {
      s = nextRoomState(s, event)!;
      expect(s).toBe(want);
    }
  });

  it('a failed ready check or a cancelled start goes back to open; anything live can abort', () => {
    expect(nextRoomState('readyCheck', 'readyFailed')).toBe('open');
    expect(nextRoomState('starting', 'cancelStart')).toBe('open');
    for (const s of ['created', 'open', 'readyCheck', 'starting', 'inProgress'] as RoomState[]) {
      expect(nextRoomState(s, 'abort')).toBe('aborted');
    }
  });

  it('finished and aborted are final: no event leaves them', () => {
    for (const s of ['finished', 'aborted'] as RoomState[]) {
      expect(isRoomFinal(s)).toBe(true);
      for (const e of ROOM_EVENTS) expect(nextRoomState(s, e)).toBeNull();
    }
  });

  it('illegal jumps are refused (no skipping the ready check, no restarting a running match)', () => {
    expect(nextRoomState('open', 'allReady')).toBeNull();
    expect(nextRoomState('open', 'countdownDone')).toBeNull();
    expect(nextRoomState('inProgress', 'startReadyCheck')).toBeNull();
    expect(nextRoomState('readyCheck', 'matchEnded')).toBeNull();
  });

  it('every transition target is a real state and every non-final state can be aborted', () => {
    for (const s of ROOM_STATES) {
      for (const target of Object.values(ROOM_TRANSITIONS[s])) expect(ROOM_STATES).toContain(target);
      if (!isRoomFinal(s)) expect(ROOM_TRANSITIONS[s].abort).toBe('aborted');
    }
    expect(isRoomEditable('open')).toBe(true);
    expect(isRoomEditable('readyCheck')).toBe(false);
  });
});

describe('match state machine', () => {
  it('walks lobby -> countdown -> playing -> ended -> resultsPosted', () => {
    let p: MatchPhase = 'lobby';
    for (const e of ['startCountdown', 'countdownDone', 'simEnded', 'resultsPosted'] as MatchEvent[])
      p = nextMatchPhase(p, e)!;
    expect(p).toBe('resultsPosted');
    expect(MATCH_TRANSITIONS.resultsPosted).toEqual({});
  });

  it('results can only be posted after the match ended; a countdown can be cancelled; abort ends it', () => {
    expect(nextMatchPhase('playing', 'resultsPosted')).toBeNull();
    expect(nextMatchPhase('lobby', 'simEnded')).toBeNull();
    expect(nextMatchPhase('countdown', 'cancelCountdown')).toBe('lobby');
    expect(nextMatchPhase('playing', 'abort')).toBe('ended');
    expect(nextMatchPhase('ended', 'abort')).toBeNull();
  });

  it('input is accepted only while counting down or playing', () => {
    const phases: MatchPhase[] = ['lobby', 'countdown', 'playing', 'ended', 'resultsPosted'];
    expect(phases.filter(acceptsInput)).toEqual(['countdown', 'playing']);
  });
});

const room = (over: Record<string, unknown> = {}) => ({
  state: 'open' as RoomState,
  hostId: 'host',
  game: 'team' as const,
  maxPlayers: 4,
  teamCount: 2,
  members: [
    { accountId: 'host', team: 0, ready: false },
    { accountId: 'a', team: 0, ready: false },
    { accountId: 'b', team: 1, ready: false },
  ],
  ...over,
});
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error?.code);

describe('room and team permissions', () => {
  it('only the host changes settings or starts the ready check, and only while open', () => {
    expect(code(canChangeSettings(room(), 'host'))).toBe('ok');
    expect(code(canChangeSettings(room(), 'a'))).toBe('forbidden');
    expect(code(canChangeSettings(room({ state: 'readyCheck' }), 'host'))).toBe('invalidState');
    expect(code(canStartReadyCheck(room(), 'host'))).toBe('ok');
    expect(code(canStartReadyCheck(room(), 'a'))).toBe('forbidden');
    expect(code(canStartReadyCheck(room({ state: 'starting' }), 'host'))).toBe('invalidState');
  });

  it('a ready check needs two players and, in a team game, a player on every team', () => {
    expect(
      code(canStartReadyCheck(room({ members: [{ accountId: 'host', team: 0, ready: false }] }), 'host')),
    ).toBe('conflict');
    const oneSided = room({
      members: [
        { accountId: 'host', team: 0, ready: false },
        { accountId: 'a', team: 0, ready: false },
      ],
    });
    expect(code(canStartReadyCheck(oneSided, 'host'))).toBe('conflict');
    expect(code(canStartReadyCheck({ ...oneSided, game: 'classic' }, 'host'))).toBe('ok');
  });

  it('ready flags change only for members, before the countdown', () => {
    expect(code(canSetReady(room(), 'a'))).toBe('ok');
    expect(code(canSetReady(room({ state: 'readyCheck' }), 'a'))).toBe('ok');
    expect(code(canSetReady(room({ state: 'starting' }), 'a'))).toBe('invalidState');
    expect(code(canSetReady(room(), 'stranger'))).toBe('forbidden');
  });

  it('a client can only ASK for a team switch: the server picks the team and checks capacity', () => {
    const r = canSwitchTeam(room(), 'a');
    expect(r).toMatchObject({ ok: true, value: 1 });
    expect(teamCapacity(room())).toBe(2);
    const full = room({
      members: [
        { accountId: 'host', team: 0, ready: false },
        { accountId: 'a', team: 0, ready: false },
        { accountId: 'b', team: 1, ready: false },
        { accountId: 'c', team: 1, ready: false },
      ],
    });
    expect(code(canSwitchTeam(full, 'a'))).toBe('roomFull');
  });

  it('no switching when ready, when the room is locked, outside team games or for non-members', () => {
    const ready = room({
      members: [
        { accountId: 'host', team: 0, ready: true },
        { accountId: 'b', team: 1, ready: false },
      ],
    });
    expect(code(canSwitchTeam(ready, 'host'))).toBe('conflict');
    expect(code(canSwitchTeam(room({ state: 'readyCheck' }), 'a'))).toBe('invalidState');
    expect(code(canSwitchTeam(room({ game: 'classic' }), 'a'))).toBe('conflict');
    expect(code(canSwitchTeam(room(), 'x'))).toBe('forbidden');
  });

  it('only the host balances teams; the balance is even and stable', () => {
    expect(code(canBalanceTeams(room(), 'host'))).toBe('ok');
    expect(code(canBalanceTeams(room(), 'a'))).toBe('forbidden');
    expect(code(canBalanceTeams(room({ game: 'classic' }), 'host'))).toBe('conflict');
    const map = balanceTeams(['a', 'b', 'c', 'd', 'e'], 2);
    expect([...map.values()].filter((t) => t === 0)).toHaveLength(3);
    expect([...map.values()].filter((t) => t === 1)).toHaveLength(2);
    expect(balanceTeams(['a', 'b'], 0).get('b')).toBe(0);
  });
});

describe('party permissions', () => {
  const party = {
    leaderId: 'L',
    maxSize: 3,
    roomId: null,
    members: [{ accountId: 'L' }, { accountId: 'M' }],
  };

  it('the leader manages the party; a member can only leave', () => {
    expect(partyPermissions(party, 'L')).toEqual({
      canInvite: true,
      canKick: true,
      canPromote: true,
      canStart: true,
      canLeave: true,
    });
    expect(partyPermissions(party, 'M')).toEqual({
      canInvite: false,
      canKick: false,
      canPromote: false,
      canStart: false,
      canLeave: true,
    });
    expect(partyPermissions(party, 'X').canLeave).toBe(false);
  });

  it('a full party cannot invite and a started party cannot start again', () => {
    const full = { ...party, members: [...party.members, { accountId: 'N' }] };
    expect(partyPermissions(full, 'L').canInvite).toBe(false);
    expect(checkPartyAction(full, 'L', 'canInvite')?.code).toBe('roomFull');
    expect(partyPermissions({ ...party, roomId: 'room-1' }, 'L').canStart).toBe(false);
    expect(checkPartyAction(party, 'M', 'canKick')?.code).toBe('forbidden');
    expect(checkPartyAction(party, 'X', 'canLeave')?.code).toBe('forbidden');
    expect(checkPartyAction(party, 'L', 'canKick')).toBeNull();
  });
});

describe('util', () => {
  it('the rate limiter allows a burst, then the sustained rate, using the injected time', () => {
    const rl = createRateLimiter(10, 3);
    expect([rl.take(0), rl.take(0), rl.take(0)]).toEqual([0, 0, 0]);
    const wait = rl.take(0);
    expect(wait).toBeGreaterThan(0);
    expect(rl.take(500)).toBe(0); // 5 tokens refilled (cap 3)
  });

  it('fnv1a is deterministic and sensitive', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
    expect(fnv1a('')).toBe(0x811c9dc5);
  });

  it('an opaque token never leaks through JSON, string conversion or logging helpers', () => {
    const t = makeOpaqueToken('super-secret-value', 99);
    expect(t.reveal()).toBe('super-secret-value');
    expect(JSON.stringify({ t })).not.toContain('super-secret');
    expect(`${t}`).not.toContain('super-secret');
    expect(String(t)).not.toContain('super-secret');
    expect(JSON.stringify(Object.entries(t))).not.toContain('super-secret');
  });
});
