/**
 * Guest nicknames and the temporary identity (approved requirement; no accounts): the SERVER sanitises everything a
 * client sends, names are unique per room and can never pose as a bot, and the session id / reconnection token are
 * random, single-use, and never appear in anything another client receives.
 */
import { describe, expect, it } from 'vitest';
import { MSG, checkPlayerName, looksLikeBot, nameSkeleton, validatePlayerName } from '../../src/net/protocol';
import { CHARACTER_IDS } from '../../src/sim';
import { Lobby, uniqueName } from '../src/core/Lobby';
import { parseJoinOptions } from '../src/core/options';
import { TestContext, create, dropSocket, joinById, joinOrCreate, until } from './helpers';
import type { TestPlayer } from './helpers';

describe('guest nickname sanitising (shared by the entry screen and the server)', () => {
  it.each([
    ['plain', 'Ada', 'Ada'],
    ['trimmed and collapsed', '  Ada   Obi  ', 'Ada Obi'],
    ['Yoruba tone marks', 'Ọlá Adébáyọ̀', 'Ọlá Adébáyọ̀'.normalize('NFKC')],
    ['full-width forms become plain', 'Ａｄａ２', 'Ada2'],
    ['non-breaking / ideographic spaces become a plain space', 'Ada\u00a0\u3000Bayo', 'Ada Bayo'],
    ['a single-script Cyrillic name is fine', 'Иван', 'Иван'],
    ['a single-script Greek name is fine', 'Νίκος', 'Νίκος'],
  ])('accepts %s', (_label, raw, expected) => {
    expect(validatePlayerName(raw)).toBe(expected);
  });

  it.each([
    ['empty', '', 'short'],
    ['one character', 'A', 'short'],
    ['too long (code points, not UTF-16 units)', '😀'.repeat(13), 'chars'],
    ['25 letters', 'a'.repeat(25), 'long'],
    ['a huge string', 'a'.repeat(5000), 'long'],
    ['NUL / C0 control', 'Ada\u0000x', 'chars'],
    ['DEL / C1 control', 'Ada\u007fx\u0085', 'chars'],
    ['newline / tab', 'Ada\n\tBayo', 'chars'],
    ['zero-width space', 'Ada​x', 'chars'],
    ['zero-width joiner / non-joiner', 'Ada‍‌x', 'chars'],
    ['word joiner / BOM', 'Ada⁠﻿x', 'chars'],
    ['right-to-left override (bidi)', 'Ada‮x', 'chars'],
    ['bidi isolates', '⁦Ada⁩', 'chars'],
    ['Unicode tag characters', 'Ada\u{e0041}\u{e0042}', 'chars'],
    ['variation selector', 'Ada️', 'chars'],
    ['html', '<script>alert(1)</script>', 'long'],
    ['markup that fits', '<b>Ada</b>', 'chars'],
    ['emoji', 'Ada 😀', 'chars'],
    ['punctuation only', '...', 'letters'],
    ['stacked combining marks (zalgo)', 'à́̂̃̄b', 'marks'],
    ['Latin mixed with a Cyrillic look-alike', 'Аda', 'mixed-script'],
    ['Latin mixed with Greek', 'Adα', 'mixed-script'],
    ['not a string', 42, 'type'],
    ['an object', { toString: () => 'Ada' }, 'type'],
    ['an array', ['Ada'], 'type'],
    ['null', null, 'type'],
  ])('rejects %s', (_label, raw, problem) => {
    expect(validatePlayerName(raw)).toBeNull();
    expect(checkPlayerName(raw).problem).toBe(problem);
  });

  it('keeps the filler-bot label for the server: no human can be called BOT', () => {
    for (const name of [
      'BOT Emeka',
      'bot',
      'Bot_Tunde',
      'B0T Ngozi',
      'B.O.T',
      'bot-x',
      '  BOT   Ade ',
      'Βοτ Emeka',
      'Bоt 2',
    ]) {
      expect(looksLikeBot(name), name).toBe(true);
      expect(validatePlayerName(name), name).toBeNull();
    }
    for (const name of ['Botha', 'Abbot', 'Robot', 'Both', 'Ada'])
      expect(validatePlayerName(name), name).toBe(name);
  });

  it('compares names by what a person reads, not by code points', () => {
    expect(nameSkeleton('Ada')).toBe(nameSkeleton('ADA'));
    expect(nameSkeleton('Ada')).toBe(nameSkeleton('Аdа')); // Cyrillic а
    expect(nameSkeleton('Ada')).toBe(nameSkeleton('A.d_a'));
    expect(nameSkeleton('Ádá')).toBe(nameSkeleton('Ada'));
    expect(nameSkeleton('Ada')).not.toBe(nameSkeleton('Adam'));
  });
});

describe('unique names inside a room', () => {
  it('suffixes a duplicate (case, accents, look-alikes, spacing) and stays within 24 characters', () => {
    expect(uniqueName('Ada', [])).toBe('Ada');
    expect(uniqueName('Ada', ['Ada'])).toBe('Ada 2');
    expect(uniqueName('ada', ['Ada', 'Ada 2'])).toBe('ada 3');
    expect(uniqueName('Ádá', ['Ada'])).toBe('Ádá 2');
    expect(uniqueName('Аdа', ['Ada'])).toBe('Аdа 2'); // Cyrillic a, only as a lone-script... skeleton-equal
    const long = 'a'.repeat(24);
    const second = uniqueName(long, [long]);
    expect([...second]).toHaveLength(24);
    expect(second.endsWith(' 2')).toBe(true);
  });

  it('the lobby applies it, so everybody in the room has a distinct name', () => {
    const lobby = new Lobby(
      {
        maxHumans: 32,
        seats: 32,
        isPrivate: true,
        autoStartMs: 0,
        countdownMs: 0,
        settings: {
          arenaId: 'rumbleOshodi',
          game: 'deathmatch',
          durationSec: 300,
          botDifficulty: 'standard',
        },
      },
      () => 0,
    );
    for (let i = 0; i < 5; i++) lobby.join(`s${i}`, { name: 'Ada', characterId: CHARACTER_IDS[0]! });
    expect(lobby.members.map((m) => m.name)).toEqual(['Ada', 'Ada 2', 'Ada 3', 'Ada 4', 'Ada 5']);
  });
});

describe('the server never trusts the client: join options', () => {
  it('only name and characterId are read; a bad name is refused, an unknown character falls back', () => {
    const spoof = {
      name: 'Ada',
      characterId: '<img src=x>',
      isBot: true,
      isHost: true,
      seat: 0,
      team: 1,
      ready: true,
      sessionId: 'victim-session',
      reconnectionToken: 'victim:token',
      kills: 99,
    };
    expect(parseJoinOptions(spoof)).toEqual({
      ok: true,
      value: { name: 'Ada', characterId: CHARACTER_IDS[0] },
    });
    for (const name of [undefined, null, 7, {}, [], 'BOT Emeka', 'x', 'a'.repeat(200)])
      expect(parseJoinOptions({ name }).ok).toBe(false);
    for (const raw of [undefined, null, 'Ada', 5, ['Ada']]) expect(parseJoinOptions(raw).ok).toBe(false);
  });
});

describe('guest identity over a real server', () => {
  const ctx = new TestContext({ graceSeconds: 0.5, reconnectSeconds: 5 });

  it('a spoofing join gets nothing it asked for: not host, not a bot, no seat, default fighter; BOT names are refused; duplicates are renamed', async () => {
    const host = ctx.track(await create(ctx.server, 'Ada', { private: true, durationSec: 10 }));
    const code = host.room.roomId;
    const spoofer = ctx.track(
      await joinById(ctx.server, code, 'Ada', {
        characterId: { evil: true },
        isHost: true,
        isBot: true,
        seat: 0,
        team: 0,
        ready: true,
        host: true,
      }),
    );
    await until('both in', () => host.lobby?.members.length === 2 && spoofer.lobby?.members.length === 2);
    const members = spoofer.lobby!.members;
    expect(members.map((m) => m.name)).toEqual(['Ada', 'Ada 2']); // the duplicate cannot pose as the host
    expect(members[1]).toMatchObject({
      isHost: false,
      ready: false,
      seat: null,
      characterId: CHARACTER_IDS[0],
    });
    expect(members[0]!.isHost).toBe(true);

    const client = ctx.server.client();
    for (const name of ['BOT Emeka', 'bot', 'Bоt Ngozi', 'Ada‮', '', 'Аda'])
      await expect(client.joinById(code, { name }), name).rejects.toThrow(/invalid name/);
    await expect(client.joinById(code, { name: { toString: () => 'Ada' } })).rejects.toThrow(/invalid name/);
    await expect(client.joinOrCreate('rumble', { name: 'x'.repeat(100_000) })).rejects.toThrow();
    expect(host.lobby!.members).toHaveLength(2); // nobody got in
  });

  it('messages cannot claim another seat, a host action, a team or a result', async () => {
    const { all, code } = await ctx.privateMatch(['Ada', 'Bayo']);
    const [a, b] = all as [TestPlayer, TestPlayer];
    const before = ctx.metricsOf(code);
    // b tries to act as a, to start / rematch, and to hand itself a result: all refused or counted as invalid
    b.room.send(MSG.input, { s: 1, m: 'up', h: false, b: 0, seat: a.seat });
    b.room.send(MSG.input, { s: 1, m: 'up', h: false, b: 0, id: a.seat });
    b.room.send(MSG.rematch);
    b.room.send(MSG.start);
    b.room.send(MSG.settings, { game: 'survival' });
    b.room.send('results', { winnerSeat: b.seat });
    b.room.send('team', { team: 0 });
    await until('b was told no', () => b.notices.length >= 3);
    const after = ctx.metricsOf(code);
    expect(after.inputs.accepted).toBe(before.inputs.accepted);
    expect(after.net.invalidMessages).toBeGreaterThanOrEqual(before.net.invalidMessages + 4);
    expect(b.lobby!.settings.game).toBe('deathmatch');
  });

  it('the session id and the reconnection token are random, never shown to anybody else, single-use and never reusable by another', async () => {
    const { all, code } = await ctx.privateMatch(['Ada', 'Bayo']);
    const [a, b] = all as [TestPlayer, TestPlayer];
    const idA = a.room.sessionId;
    const tokenA = a.room.reconnectionToken;
    expect(idA).not.toBe(b.room.sessionId);
    expect(tokenA).not.toBe(b.room.reconnectionToken);
    expect(tokenA).toMatch(/^[A-Z0-9]{6}:[\w-]{9}$/); // room code + a random nanoid secret (54 bits), not a seat number or a name
    expect(b.room.reconnectionToken).not.toContain(idA);

    // nothing another client receives (lobby, welcome, notices, results) carries a session id or a token
    const seen = JSON.stringify([b.lobbies, b.welcomes, b.notices]);
    for (const secret of [idA, tokenA, b.room.sessionId, b.room.reconnectionToken])
      expect(seen).not.toContain(secret);

    // another player (or a guess) cannot take a's seat
    for (const guess of [
      `${code}:${b.room.sessionId}`,
      idA,
      `${code}:${idA}`,
      'AAAAAAAAA',
      `${code}:AAAAAAAAA`,
      String(a.seat),
    ])
      await expect(ctx.server.client().reconnect(guess), guess).rejects.toThrow();

    // the real owner can, once: the token is rotated, so the old one is dead
    a.room.reconnection.enabled = false;
    dropSocket(code, idA);
    await until(
      'a is shown as away',
      () => b.lobby?.members.find((m) => m.seat === a.seat)?.connected === false,
    );
    const room2 = await ctx.server.client().reconnect(tokenA);
    a.leftWith = null;
    a.attach(room2);
    await until('a is back', () => a.welcomes.length >= 3);
    expect(room2.sessionId).toBe(idA); // the same identity
    expect(room2.reconnectionToken).not.toBe(tokenA); // a fresh secret
    await expect(ctx.server.client().reconnect(tokenA)).rejects.toThrow();
  });

  it('quick play and private rooms give two guests with the same typed name two different identities', async () => {
    const a = ctx.track(await joinOrCreate(ctx.server, 'Guest', { durationSec: 10 }));
    const b = ctx.track(await joinOrCreate(ctx.server, 'Guest'));
    expect(a.room.sessionId).not.toBe(b.room.sessionId);
    await until('both listed', () => a.lobby?.members.length === 2);
    expect(a.lobby!.members.map((m) => m.name)).toEqual(['Guest', 'Guest 2']);
  });
});
