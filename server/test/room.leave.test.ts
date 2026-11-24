import { describe, expect, it } from 'vitest';
import { MATCH_END_BUDGET_MS, TestContext, matchOf, playRandomly, until } from './helpers';
import type { TestPlayer } from './helpers';

const ctx = new TestContext();

describe('leaving mid-match', () => {
  it('a consented leave gives the seat to a bot at once and the match finishes for the others', async () => {
    const { all, code } = await ctx.privateMatch(['Ada', 'Bayo']);
    const [a, b] = all as [TestPlayer, TestPlayer];
    const stopB = playRandomly(b);
    await until('frames', () => b.frameMessages > 10);
    await a.leave();
    await until('b alone', () => b.lobby?.members.length === 1);
    expect(matchOf(code).humanSeatsConnected()).toEqual([b.seat]);
    await until('b gets results', () => b.results.length > 0, MATCH_END_BUDGET_MS);
    stopB();
    expect(b.hash()).toBe(b.results[0]!.stateHash);
    expect(b.replica!.stats.hashMismatches).toBe(0);
  });
});
