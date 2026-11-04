import { describe, expect, it } from 'vitest';
import {
  MockVoiceProvider,
  NullVoiceProvider,
  audienceOf,
  channelFor,
  mayHear,
  permissionsFor,
} from '../../src/voice';
import type { VoiceParticipant, VoicePolicyInput } from '../../src/voice';

const on = { voiceEnabled: true, matchWideInFreeForAll: false };
const people: VoiceParticipant[] = [
  { id: 'a', displayName: 'A', team: 0 },
  { id: 'b', displayName: 'B', team: 0 },
  { id: 'c', displayName: 'C', team: 1 },
  { id: 'd', displayName: 'D', team: 1 },
];
const ffa: VoiceParticipant[] = people.map((p) => ({ ...p, team: null }));
const input = (over: Partial<VoicePolicyInput> = {}): VoicePolicyInput => ({
  game: 'team',
  phase: 'playing',
  flags: on,
  ...over,
});

describe('voice policy: who may hear whom', () => {
  it('team games are team-only voice, never across teams', () => {
    expect(channelFor(input()).channel).toBe('team');
    expect(audienceOf(input(), people[0]!, people)).toEqual(['b']);
    expect(audienceOf(input(), people[2]!, people)).toEqual(['d']);
    expect(mayHear(input(), people[0]!, people[2]!)).toBe(false);
    expect(mayHear(input(), people[2]!, people[0]!)).toBe(false);
  });

  it('team voice also works in the lobby and countdown, before the match', () => {
    for (const phase of ['lobby', 'countdown'] as const)
      expect(audienceOf(input({ phase }), people[0]!, people)).toEqual(['b']);
  });

  it('free-for-all is silent unless the server enables match-wide voice', () => {
    for (const game of ['classic', 'survival', 'deathmatch'] as const) {
      expect(channelFor(input({ game })).channel).toBe('none');
      expect(audienceOf(input({ game }), ffa[0]!, ffa)).toEqual([]);
      const wide = input({ game, flags: { ...on, matchWideInFreeForAll: true } });
      expect(channelFor(wide).channel).toBe('matchWide');
      expect(audienceOf(wide, ffa[0]!, ffa)).toEqual(['b', 'c', 'd']);
    }
  });

  it('voice ends when the match ends, whatever the mode or flags', () => {
    for (const phase of ['ended', 'resultsPosted'] as const) {
      for (const game of ['team', 'classic', 'deathmatch'] as const) {
        const p = input({ game, phase, flags: { voiceEnabled: true, matchWideInFreeForAll: true } });
        expect(channelFor(p).channel).toBe('none');
        expect(channelFor(p).reason).toMatch(/ends when the match ends/);
        expect(audienceOf(p, people[0]!, people)).toEqual([]);
      }
    }
  });

  it('nothing at all when the server has voice off, and never in a campaign mission', () => {
    expect(channelFor(input({ flags: { voiceEnabled: false, matchWideInFreeForAll: true } })).channel).toBe(
      'none',
    );
    expect(
      channelFor(input({ game: 'mission', flags: { voiceEnabled: true, matchWideInFreeForAll: true } }))
        .channel,
    ).toBe('none');
  });

  it('nobody hears themselves; a spectator-less player without a team cannot speak in a team game', () => {
    expect(mayHear(input(), people[0]!, people[0]!)).toBe(false);
    const lone: VoiceParticipant = { id: 'x', displayName: 'X', team: null };
    const perms = permissionsFor(input(), lone, [...people, lone]);
    expect(perms.canSpeak).toBe(false);
    expect(perms.canHear).toEqual([]);
    expect(perms.reason).toMatch(/not on a team/);
  });

  it('computed permissions: speak, hear list, deafen', () => {
    const p = permissionsFor(input(), people[0]!, people);
    expect(p).toMatchObject({ channel: 'team', canSpeak: true, canHear: ['b'], reason: '' });
    expect(permissionsFor(input(), people[0]!, people, { deafened: true }).canHear).toEqual([]);
    expect(permissionsFor(input({ phase: 'ended' }), people[0]!, people)).toMatchObject({
      canSpeak: false,
      canHear: [],
    });
  });

  it('is a pure function of its inputs (no hidden state)', () => {
    const a = permissionsFor(input(), people[1]!, people);
    const b = permissionsFor(input(), people[1]!, people);
    expect(a).toEqual(b);
  });
});

describe('NullVoiceProvider: the only provider that ships', () => {
  it('is always disabled and creates no session', async () => {
    expect(NullVoiceProvider.status).toBe('disabled');
    const r = await NullVoiceProvider.createSession({
      matchId: 'm',
      self: people[0]!,
      participants: people,
      game: 'team',
      phase: 'playing',
    });
    expect(r).toMatchObject({ ok: false, error: { code: 'disabled' } });
  });

  it('never touches a microphone, a peer connection or any network global', async () => {
    const g = globalThis as Record<string, unknown>;
    const trap = (name: string) => () => {
      throw new Error(`${name} was used`);
    };
    const saved = [
      'navigator',
      'RTCPeerConnection',
      'MediaRecorder',
      'WebSocket',
      'fetch',
      'AudioContext',
    ].map((k) => [k, g[k]] as const);
    for (const [k] of saved)
      Object.defineProperty(g, k, { value: trap(k), configurable: true, writable: true });
    try {
      await NullVoiceProvider.createSession({
        matchId: 'm',
        self: people[0]!,
        participants: people,
        game: 'team',
        phase: 'playing',
      });
      expect(NullVoiceProvider.name).toBe('null');
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) delete g[k];
        else Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
      }
    }
  });
});

describe('MockVoiceProvider: session rules for tests and UI states', () => {
  async function session(
    over: Partial<ConstructorParameters<typeof MockVoiceProvider>[0]> = {},
    game: VoicePolicyInput['game'] = 'team',
  ) {
    const provider = new MockVoiceProvider(over);
    const r = await provider.createSession({
      matchId: 'm',
      self: people[0]!,
      participants: people,
      game,
      phase: 'playing',
    });
    if (!r.ok) throw new Error('no session');
    return { provider, s: r.value };
  }

  it('starts muted and idle; joining does not unmute or ask for the microphone', async () => {
    const { provider, s } = await session();
    expect(s).toMatchObject({ status: 'idle', selfMuted: true, deafened: false, micPermission: 'unknown' });
    expect(await s.join()).toMatchObject({ ok: true });
    expect(s.status).toBe('connected');
    expect(s.selfMuted).toBe(true);
    expect(provider.micRequests).toBe(0);
  });

  it('unmuting needs an explicit microphone grant, and the right to speak', async () => {
    const { provider, s } = await session();
    await s.join();
    expect(s.setSelfMuted(false)).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    expect(provider.micRequests).toBe(0); // unmute did not prompt by itself
    expect(await s.requestMicrophone()).toMatchObject({ ok: true, value: 'granted' });
    expect(provider.micRequests).toBe(1);
    expect(s.setSelfMuted(false)).toMatchObject({ ok: true });
    expect(s.selfMuted).toBe(false);
    s.setSelfMuted(true);
    expect(s.selfMuted).toBe(true);
  });

  it('a denied microphone keeps you muted', async () => {
    const { s } = await session({ micAnswer: 'denied' });
    await s.join();
    await s.requestMicrophone();
    expect(s.setSelfMuted(false)).toMatchObject({ ok: false });
    expect(s.selfMuted).toBe(true);
  });

  it('in a free-for-all there is no voice to speak into by default', async () => {
    const { s } = await session({}, 'classic');
    await s.join();
    await s.requestMicrophone();
    expect(s.permissions.canSpeak).toBe(false);
    expect(s.setSelfMuted(false)).toMatchObject({ ok: false });
  });

  it('deafen, per-participant mute and reports', async () => {
    const { provider, s } = await session();
    expect(s.setDeafened(true)).toMatchObject({ ok: false, error: { code: 'notInSession' } });
    await s.join();
    expect(s.permissions.canHear).toEqual(['b']);
    s.setDeafened(true);
    expect(s.permissions.canHear).toEqual([]);
    s.setDeafened(false);
    expect(s.setParticipantMuted('b', true)).toMatchObject({ ok: true });
    expect(s.isParticipantMuted('b')).toBe(true);
    expect(s.setParticipantMuted('zzz', true)).toMatchObject({ ok: false, error: { code: 'notFound' } });
    expect(await s.report('c', 'abusive'.repeat(100))).toMatchObject({ ok: true });
    expect(provider.reports).toHaveLength(1);
    expect(provider.reports[0]!.reason.length).toBeLessThanOrEqual(200);
    expect(await s.report('nobody', 'x')).toMatchObject({ ok: false });
  });

  it('voice ends with the match: the session ends, you are muted again and the channel closes', async () => {
    const { s } = await session();
    await s.join();
    await s.requestMicrophone();
    s.setSelfMuted(false);
    s.setPhase('ended');
    expect(s).toMatchObject({ status: 'ended', selfMuted: true });
    expect(s.permissions).toMatchObject({ channel: 'none', canSpeak: false, canHear: [] });
    expect(await s.join()).toMatchObject({ ok: false });
  });

  it('leave and disconnect end the session muted', async () => {
    const { s } = await session();
    await s.join();
    s.disconnect();
    expect(s).toMatchObject({ status: 'ended', selfMuted: true });
  });
});
