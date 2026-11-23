import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../../src/sim';
import type { RoomSettings } from '../../src/net/protocol';
import { Lobby, botName } from '../src/core/Lobby';
import type { LobbyConfig } from '../src/core/Lobby';

const SETTINGS: RoomSettings = {
  arenaId: 'rumbleOshodi',
  game: 'deathmatch',
  durationSec: 300,
  botDifficulty: 'standard',
};

function make(over: Partial<LobbyConfig> = {}): { lobby: Lobby; clock: { t: number } } {
  const clock = { t: 1000 };
  const lobby = new Lobby(
    {
      maxHumans: 32,
      seats: 32,
      isPrivate: false,
      autoStartMs: 20_000,
      countdownMs: 3000,
      settings: SETTINGS,
      ...over,
    },
    () => clock.t,
  );
  return { lobby, clock };
}

const who = (name: string): { name: string; characterId: (typeof CHARACTER_IDS)[number] } => ({
  name,
  characterId: CHARACTER_IDS[0]!,
});

describe('Lobby membership', () => {
  it('makes the first member the host and promotes the next one when the host leaves', () => {
    const { lobby } = make({ isPrivate: true });
    lobby.join('a', who('Ada'));
    lobby.join('b', who('Bayo'));
    lobby.join('c', who('Chi'));
    expect(lobby.members.map((m) => [m.name, m.isHost])).toEqual([
      ['Ada', true],
      ['Bayo', false],
      ['Chi', false],
    ]);
    lobby.leave('a');
    expect(lobby.host?.name).toBe('Bayo');
    lobby.leave('c'); // a non-host leaving changes nothing
    expect(lobby.host?.name).toBe('Bayo');
    expect(lobby.members).toHaveLength(1);
  });

  it('hands the host role to a connected member while the host is dropped, and keeps them a member', () => {
    const { lobby } = make({ isPrivate: true });
    lobby.join('a', who('Ada'));
    lobby.join('b', who('Bayo'));
    lobby.setConnected('a', false);
    expect(lobby.host?.name).toBe('Bayo');
    lobby.setConnected('a', true);
    expect(lobby.host?.name).toBe('Bayo');
    expect(lobby.members).toHaveLength(2);
  });

  it('refuses duplicates, a full room, and joins after the match started', () => {
    const { lobby } = make({ isPrivate: true, maxHumans: 2 });
    expect(lobby.join('a', who('Ada')).ok).toBe(true);
    expect(lobby.join('a', who('Ada'))).toMatchObject({ ok: false, code: 'already_joined' });
    expect(lobby.join('b', who('Bayo')).ok).toBe(true);
    expect(lobby.join('c', who('Chi'))).toMatchObject({ ok: false, code: 'full' });
    lobby.start('a');
    expect(lobby.join('d', who('Dee'))).toMatchObject({ ok: false, code: 'full' });
  });

  it('refuses joins once playing', () => {
    const { lobby, clock } = make({ isPrivate: true });
    lobby.join('a', who('Ada'));
    lobby.start('a');
    clock.t += 3000;
    expect(lobby.tick().begin).toBe(true);
    lobby.begin();
    expect(lobby.join('b', who('Bayo'))).toMatchObject({ ok: false, code: 'in_progress' });
  });
});

describe('Lobby host-only actions', () => {
  it('rejects start / settings / rematch from non-hosts and unknown sessions', () => {
    const { lobby } = make({ isPrivate: true });
    lobby.join('a', who('Ada'));
    lobby.join('b', who('Bayo'));
    expect(lobby.start('b')).toMatchObject({ ok: false, code: 'not_host' });
    expect(lobby.updateSettings('b', { game: 'team' })).toMatchObject({ ok: false, code: 'not_host' });
    expect(lobby.rematch('b')).toMatchObject({ ok: false, code: 'not_host' });
    expect(lobby.start('zzz')).toMatchObject({ ok: false, code: 'not_member' });
    expect(lobby.phase).toBe('lobby');
    expect(lobby.updateSettings('a', { game: 'team' }).ok).toBe(true);
    expect(lobby.settings.game).toBe('team');
    expect(lobby.start('a').ok).toBe(true);
    expect(lobby.phase).toBe('countdown');
    expect(lobby.start('a')).toMatchObject({ ok: false, code: 'bad_phase' });
    expect(lobby.updateSettings('a', { game: 'survival' })).toMatchObject({ ok: false, code: 'bad_phase' });
  });

  it('lets only private rooms be started by the host', () => {
    const { lobby } = make({ isPrivate: false });
    lobby.join('a', who('Ada'));
    expect(lobby.start('a')).toMatchObject({ ok: false, code: 'public_room' });
  });

  it('only allows ready in the lobby', () => {
    const { lobby } = make({ isPrivate: true });
    lobby.join('a', who('Ada'));
    expect(lobby.setReady('a', true).ok).toBe(true);
    expect(lobby.members[0]!.ready).toBe(true);
    lobby.start('a');
    expect(lobby.setReady('a', false)).toMatchObject({ ok: false, code: 'bad_phase' });
  });
});

describe('Lobby auto-start (public rooms, injected clock)', () => {
  it('starts the countdown autoStartMs after the first join, then begins after the countdown', () => {
    const { lobby, clock } = make({ autoStartMs: 20_000, countdownMs: 3000 });
    expect(lobby.tick()).toEqual({ changed: false, begin: false });
    lobby.join('a', who('Ada'));
    clock.t += 5000;
    lobby.join('b', who('Bayo')); // later joiners do not restart the timer
    clock.t += 14_999;
    expect(lobby.tick()).toEqual({ changed: false, begin: false });
    expect(lobby.view('ABCDEF').autoStartMs).toBe(1);
    clock.t += 1;
    expect(lobby.tick()).toEqual({ changed: true, begin: false });
    expect(lobby.phase).toBe('countdown');
    expect(lobby.view('ABCDEF').countdownMs).toBe(3000);
    clock.t += 2999;
    expect(lobby.tick().begin).toBe(false);
    clock.t += 1;
    expect(lobby.tick().begin).toBe(true);
    lobby.begin();
    expect(lobby.phase).toBe('playing');
  });

  it('starts at once (into the countdown) when 32 humans are in', () => {
    const { lobby } = make();
    for (let i = 0; i < 31; i++) lobby.join(`s${i}`, who(`Player ${i}`));
    expect(lobby.phase).toBe('lobby');
    lobby.join('s31', who('Player 31'));
    expect(lobby.phase).toBe('countdown');
    expect(lobby.botsToFill).toBe(0);
  });

  it('does not auto-start private rooms', () => {
    const { lobby, clock } = make({ isPrivate: true });
    lobby.join('a', who('Ada'));
    clock.t += 10 * 60_000;
    expect(lobby.tick()).toEqual({ changed: false, begin: false });
    expect(lobby.phase).toBe('lobby');
  });

  it('forgets the timer when the room empties and re-arms it on the next first join', () => {
    const { lobby, clock } = make({ autoStartMs: 20_000 });
    lobby.join('a', who('Ada'));
    clock.t += 10_000;
    lobby.leave('a');
    clock.t += 30_000;
    expect(lobby.tick().changed).toBe(false);
    lobby.join('b', who('Bayo'));
    clock.t += 19_999;
    expect(lobby.tick().changed).toBe(false);
    clock.t += 1;
    expect(lobby.tick().changed).toBe(true);
  });

  it('falls back to the lobby when everybody leaves during the countdown', () => {
    const { lobby } = make({ isPrivate: true });
    lobby.join('a', who('Ada'));
    lobby.start('a');
    lobby.leave('a');
    expect(lobby.phase).toBe('lobby');
    expect(lobby.tick()).toEqual({ changed: false, begin: false });
  });
});

describe('Lobby seats and bots', () => {
  it('seats humans first in join order, then bots up to 32 with BOT names and cycling characters', () => {
    const { lobby, clock } = make({ isPrivate: true });
    lobby.join('a', { name: 'Ada', characterId: CHARACTER_IDS[1]! });
    lobby.join('b', { name: 'Bayo', characterId: CHARACTER_IDS[2]! });
    lobby.updateSettings('a', { botDifficulty: 'expert' });
    lobby.start('a');
    clock.t += 3000;
    lobby.tick();
    const seats = lobby.begin();
    expect(seats).toHaveLength(32);
    expect(seats.slice(0, 2).map((s) => [s.name, s.kind])).toEqual([
      ['Ada', 'human'],
      ['Bayo', 'human'],
    ]);
    expect(lobby.members.map((m) => m.seat)).toEqual([0, 1]);
    const bots = seats.slice(2);
    expect(bots).toHaveLength(30);
    expect(
      bots.every((s) => s.kind === 'bot' && s.name.startsWith('BOT ') && s.difficulty === 'expert'),
    ).toBe(true);
    expect(new Set(bots.map((s) => s.name)).size).toBe(30);
    expect(bots.map((s) => s.characterId)).toEqual(
      bots.map((_, i) => CHARACTER_IDS[i % CHARACTER_IDS.length]),
    );
    expect(bots[0]!.name).toBe('BOT Emeka');
  });

  it('keeps bot names unique beyond the roster', () => {
    const names = new Set(Array.from({ length: 80 }, (_, i) => botName(i)));
    expect(names.size).toBe(80);
  });

  it('reports botsToFill and a view without session ids', () => {
    const { lobby } = make({ isPrivate: true });
    lobby.join('secret-session-a', who('Ada'));
    lobby.join('secret-session-b', who('Bayo'));
    const view = lobby.view('ABCDEF', 'secret-session-b');
    expect(view.botsToFill).toBe(30);
    expect(view.you).toBe(1);
    expect(view.members[0]).toEqual({
      name: 'Ada',
      characterId: CHARACTER_IDS[0],
      ready: false,
      isHost: true,
      seat: null,
      connected: true,
    });
    expect(JSON.stringify(view)).not.toContain('secret-session');
    expect(lobby.view('ABCDEF').you).toBeNull();
  });
});

describe('Lobby results and rematch', () => {
  it('returns to the lobby with the same members, ready marks cleared and seats released', () => {
    const { lobby, clock } = make({ isPrivate: true });
    lobby.join('a', who('Ada'));
    lobby.join('b', who('Bayo'));
    lobby.setReady('b', true);
    lobby.start('a');
    clock.t += 3000;
    lobby.begin();
    expect(lobby.rematch('a')).toMatchObject({ ok: false, code: 'bad_phase' }); // still playing
    lobby.endMatch();
    expect(lobby.phase).toBe('results');
    expect(lobby.rematch('b')).toMatchObject({ ok: false, code: 'not_host' });
    expect(lobby.rematch('a').ok).toBe(true);
    expect(lobby.phase).toBe('lobby');
    expect(lobby.members.map((m) => [m.name, m.isHost, m.ready, m.seat])).toEqual([
      ['Ada', true, false, null],
      ['Bayo', false, false, null],
    ]);
    expect(lobby.start('a').ok).toBe(true); // and through the countdown again
  });

  it('re-arms the auto-start timer of a public room after a rematch', () => {
    const { lobby, clock } = make({ autoStartMs: 20_000 });
    lobby.join('a', who('Ada'));
    clock.t += 20_000;
    lobby.tick();
    clock.t += 3000;
    lobby.begin();
    lobby.endMatch();
    lobby.rematch('a');
    expect(lobby.view('X').autoStartMs).toBe(20_000);
  });

  it('promotes a new host if the host left during the match, so a rematch is still possible', () => {
    const { lobby, clock } = make({ isPrivate: true });
    lobby.join('a', who('Ada'));
    lobby.join('b', who('Bayo'));
    lobby.start('a');
    clock.t += 3000;
    lobby.begin();
    lobby.leave('a');
    lobby.endMatch();
    expect(lobby.rematch('b').ok).toBe(true);
  });
});
