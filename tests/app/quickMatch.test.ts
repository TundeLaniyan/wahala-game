import { describe, expect, it } from 'vitest';
import { ARENAS, DIFFICULTIES, STANDARD_ARENA_IDS } from '../../src/sim';
import { DEFAULT_GAME_SETTINGS, sanitizeSettings } from '../../src/app/settings';
import { competitorCount } from '../../src/app/names';
import { QUICK_MATCH, quickMatchPatch } from '../../src/app/quickMatch';

describe('Quick Match defaults', () => {
  const applied = { ...DEFAULT_GAME_SETTINGS, character: 'lekkiBoy' as const, ...quickMatchPatch() };

  it('is one human and two bots in a standard Classic arena, never City Rumble', () => {
    expect(applied.play).toBe('classic');
    expect(competitorCount(applied)).toBe(3);
    const arena = ARENAS[applied.arenaId]!;
    expect(arena.kind).toBe('standard');
    expect(arena.experimental).toBeFalsy();
    expect(STANDARD_ARENA_IDS).toContain(applied.arenaId);
  });

  it('uses the easiest bot level for every bot and leaves the fighter alone', () => {
    expect(DIFFICULTIES[0]).toBe('rookie');
    expect(applied.difficulty).toBe('rookie');
    expect(applied.botDifficulties.slice(0, 2)).toEqual(['rookie', 'rookie']);
    expect(applied.character).toBe('lekkiBoy');
  });

  it('survives settings sanitising unchanged, so the match really starts with these rules', () => {
    const safe = sanitizeSettings(applied);
    expect(safe).toMatchObject({
      play: 'classic',
      competitors: 3,
      difficulty: 'rookie',
      arenaId: QUICK_MATCH.arenaId,
    });
  });

  it('returns a fresh array each time (no shared mutable state)', () => {
    expect(quickMatchPatch().botDifficulties).not.toBe(quickMatchPatch().botDifficulties);
  });
});
