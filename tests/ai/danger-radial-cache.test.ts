/**
 * Regression (decision PIS8, found by the server memory soak): the radial-footprint cache of a bot's danger builder kept an
 * entry, and the whole observation that entry points at, for every generator the bot had ever seen. A match grew without
 * bound (about 10 MB a minute across the 31 bots of a server room) until the bots were dropped at its end. An entry can only
 * ever be reused for the SAME observation, so the cache must hold at most the generators of the latest observation.
 */
import { describe, expect, it } from 'vitest';
import { Brain } from '../../src/ai/brain';
import { PROFILES } from '../../src/ai/profiles';
import { CHARACTER_IDS, createGame, observe, tick } from '../../src/sim';
import type { Intents } from '../../src/sim';

describe('danger builder radial cache', () => {
  it('does not grow with the number of generators a bot has seen over a match', () => {
    const seats = 8;
    const state = createGame({
      seed: 4242,
      arenaId: 'rumbleOshodi',
      players: Array.from({ length: seats }, (_, i) => ({
        name: `BOT ${i}`,
        characterId: CHARACTER_IDS[i % CHARACTER_IDS.length]!,
        isBot: true,
        difficulty: 'standard' as const,
      })),
      settings: { game: 'deathmatch', mode: 'crush', friendlyFire: false, teamCount: 2, durationSec: 300 },
    });
    const brains = Array.from({ length: seats }, (_, i) => new Brain(PROFILES.standard, 77 + i * 7919, i));
    const generatorIds = new Set<number>();
    let worst = 0;
    for (let t = 0; t < 2400; t++) {
      const intents: Intents = {};
      brains.forEach((b, i) => {
        if (state.players[i]!.alive) intents[i] = b.decide(observe(state, i));
      });
      tick(state, intents);
      for (const g of state.generators) generatorIds.add(g.id);
      if (t % 60 === 0)
        for (const b of brains) {
          const size = (b as unknown as { ctx: { builder: { radialCache: Map<number, unknown> } } | null })
            .ctx?.builder.radialCache.size;
          worst = Math.max(worst, size ?? 0);
        }
    }
    // the match really did lay many generators (otherwise this proves nothing) ...
    expect(generatorIds.size).toBeGreaterThan(60);
    // ... and no bot's cache ever held more than the generators that exist at one moment
    expect(worst).toBeLessThanOrEqual(20);
  }, 120_000);
});
