/**
 * Normal matches must stay byte-for-byte identical once the mission runtime exists: `tick` calls it only when
 * `state.mission` is set. The expected hashes were recorded on the base commit (321cc5a), before any mission
 * code existed, from the full serialised state after a fixed number of ticks with bots in every seat.
 *
 * Re-recorded after merging the fighters-and-attacks branch (new Player fields, FC1 step grace, bots that use
 * secondary attacks): that branch deliberately changes normal-match state, the mission runtime still adds nothing
 * to a match without `state.mission` (the mission tests prove the key is absent).
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import { createGame, observe, tick } from '../src/sim';
import type { Difficulty, GameOptions, Intents } from '../src/sim';

/** FNV-1a over the JSON of the whole state (JSON drops undefined, so an absent `mission` adds nothing). */
function hashState(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}:${text.length}`;
}

function play(options: GameOptions, difficulties: Difficulty[], ticks: number): string {
  const state = createGame(options);
  const bots = difficulties.map((difficulty, id) =>
    createBot({ difficulty, seed: 7 * 31 + id, playerId: id }),
  );
  for (let i = 0; i < ticks; i++) {
    const intents: Intents = {};
    bots.forEach((bot, id) => {
      if (state.players[id]!.alive) intents[id] = bot.decide(observe(state, id));
    });
    tick(state, intents);
  }
  expect('mission' in state).toBe(false);
  return hashState(state);
}

describe('normal matches are unchanged by the mission runtime', () => {
  it('a Classic match on the default arena (3 bots, 2400 ticks)', () => {
    const options: GameOptions = {
      seed: 12345,
      players: ['streetBaller', 'lekkiBoy', 'campusQueen'].map((characterId, i) => ({
        name: `B${i}`,
        characterId: characterId as 'streetBaller',
        isBot: true,
      })),
      settings: { mode: 'crush' },
    };
    expect(play(options, ['standard', 'skilled', 'casual'], 2400)).toBe('671f4569:15766');
  });

  it('a Deathmatch on a City Rumble stage (6 bots, 1800 ticks)', () => {
    const options: GameOptions = {
      seed: 777,
      arenaId: 'rumbleMushin',
      players: Array.from({ length: 6 }, (_, i) => ({
        name: `R${i}`,
        characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
        isBot: true,
      })),
      settings: { game: 'deathmatch', durationSec: 300 },
    };
    expect(play(options, ['standard', 'rookie', 'skilled', 'casual', 'expert', 'beginner'], 1800)).toBe(
      'db6b12ff:23568',
    );
  });
});
