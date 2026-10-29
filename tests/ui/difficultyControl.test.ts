/**
 * The bot difficulty control: one scale over the seven levels, plain words for "all bots" vs "mixed roster",
 * and the mixed range it advertises is exactly what a match builds.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import type { GameSettings } from '../../src/app/settings';
import { botDifficulty, buildPlayers } from '../../src/app/names';
import { DIFFICULTIES } from '../../src/sim';
import {
  LEVEL_COUNT,
  LEVEL_HINT,
  LEVEL_LABEL,
  SCALE_ENDS,
  levelAt,
  levelIndex,
  mixedRange,
} from '../../src/ui/difficultyPicker';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
}));

const { DifficultySlider } = await import('../../src/ui/menu/DifficultyControl');
const { difficultyExplain } = await import('../../src/ui/menu/SetupScreen');

const base = (over: Partial<GameSettings> = {}): GameSettings => ({ ...DEFAULT_GAME_SETTINGS, ...over });

describe('difficulty scale', () => {
  it('covers very easy to extremely hard with readable names and a one-line meaning for every level', () => {
    expect(LEVEL_COUNT).toBe(DIFFICULTIES.length);
    expect(LEVEL_COUNT).toBeGreaterThanOrEqual(6);
    expect(SCALE_ENDS).toEqual({ low: 'Very easy', high: 'Extremely hard' });
    for (const d of DIFFICULTIES) {
      expect(LEVEL_LABEL[d].length).toBeGreaterThan(2);
      expect(LEVEL_HINT[d].length).toBeGreaterThan(10);
    }
    expect(LEVEL_LABEL[DIFFICULTIES[0]!]).toBe('Rookie');
    expect(LEVEL_LABEL[DIFFICULTIES[LEVEL_COUNT - 1]!]).toBe('Nightmare');
  });
  it('maps slider positions to levels and never produces an unknown one', () => {
    for (let i = 0; i < LEVEL_COUNT; i++) expect(levelIndex(levelAt(i))).toBe(i);
    expect(levelAt(-3)).toBe(DIFFICULTIES[0]);
    expect(levelAt(99)).toBe(DIFFICULTIES[LEVEL_COUNT - 1]);
    expect(levelAt(Number.NaN)).toBe(DIFFICULTIES[0]);
    expect(levelAt(2.4)).toBe(DIFFICULTIES[2]);
  });
});

describe('DifficultySlider markup', () => {
  const html = (value: (typeof DIFFICULTIES)[number], extra: { compact?: boolean } = {}) =>
    renderToStaticMarkup(
      createElement(DifficultySlider, {
        value,
        onChange: () => undefined,
        label: 'Difficulty of all bots',
        testId: 'diff-slider',
        ...extra,
      }),
    );
  it('is one native range over all levels, named and described for assistive tech', () => {
    const h = html('skilled');
    expect(h).toMatch(/<input[^>]*type="range"/);
    expect(h).toContain(`max="${LEVEL_COUNT - 1}"`);
    expect(h).toContain(`value="${levelIndex('skilled')}"`);
    expect(h).toContain('aria-label="Difficulty of all bots"');
    expect(h).toContain(`aria-valuetext="Skilled: ${LEVEL_HINT.skilled}"`);
    expect(h).toContain('Very easy');
    expect(h).toContain('Extremely hard');
    expect(h).toContain('5 / 7');
    expect(h.match(/<i class=/g)).toHaveLength(LEVEL_COUNT);
  });
  it('has no separate button per level', () => {
    expect(html('casual')).not.toContain('<button');
  });
  it('compact rows (one per bot) drop the long text', () => {
    const h = html('expert', { compact: true });
    expect(h).not.toContain('Extremely hard');
    expect(h).not.toContain('mn-diff-hint');
  });
});

describe('plain-language difficulty text', () => {
  it('says the level applies to every bot, or that the roster is mixed', () => {
    expect(difficultyExplain(base({ play: 'rumble', difficulty: 'skilled', rumbleMixed: false }))).toBe(
      'Every opponent plays at Skilled.',
    );
    const mixed = difficultyExplain(base({ play: 'rumble', difficulty: 'standard', rumbleMixed: true }));
    expect(mixed).toContain('Mixed bot difficulty');
    expect(mixed).toContain('each opponent uses a different difficulty level');
    expect(mixed).toContain('from Beginner to Expert');
    expect(mixed).toContain('centred on Standard');
  });
  it('Classic: one level for all, or each bot named with its own level', () => {
    expect(
      difficultyExplain(
        base({ play: 'classic', competitors: 3, botDifficulties: ['casual', 'casual', 'casual'] }),
      ),
    ).toBe('Every opponent plays at Casual.');
    const each = difficultyExplain(
      base({ play: 'classic', competitors: 4, botDifficulties: ['rookie', 'expert', 'casual'] }),
    );
    expect(each).toContain('Mixed bot difficulty');
    expect(each).toContain('Bot 1 Rookie, Bot 2 Expert, Bot 3 Casual');
  });
});

describe('the advertised mixed range is the real one', () => {
  it('every bot of a mixed 32-fighter roster stays inside mixedRange, and the ends are reached', () => {
    for (const d of DIFFICULTIES) {
      const s = base({ play: 'rumble', difficulty: d, rumbleMixed: true, rumbleCompetitors: 32 });
      const { lo, hi } = mixedRange(d);
      const levels = buildPlayers(s, 7)
        .filter((p) => p.isBot)
        .map((p) => levelIndex(p.difficulty!));
      expect(Math.min(...levels)).toBeGreaterThanOrEqual(levelIndex(lo));
      expect(Math.max(...levels)).toBeLessThanOrEqual(levelIndex(hi));
      expect(Math.min(...levels)).toBe(levelIndex(lo));
      expect(Math.max(...levels)).toBe(levelIndex(hi));
    }
  });
  it('not mixed: every bot has exactly the chosen level', () => {
    const s = base({ play: 'rumble', difficulty: 'expert', rumbleMixed: false });
    for (let i = 1; i < 16; i++) expect(botDifficulty(s, i)).toBe('expert');
  });
});
