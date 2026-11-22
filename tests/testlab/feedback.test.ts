/** Test Lab feedback: the stored shape, the repairs and the plain-text summary (docs/TEST_LAB.md, decision TL4). */
import { describe, expect, it } from 'vitest';
import {
  NOTE_MAX,
  cleanNote,
  loadFeedback,
  sanitizeFeedback,
  saveFeedback,
  summarizeFeedback,
  withFeedback,
} from '../../src/testlab/feedback';
import { FEEDBACK_KEY } from '../../src/testlab/feedbackKey';
import { LAB_ENTRIES } from '../../src/testlab/registry';
import { createIsolatedStorage } from '../../src/testlab/isolation';

describe('feedback map', () => {
  it('starts empty: nothing is ever marked as passed by itself', () => {
    expect(loadFeedback(createIsolatedStorage(null))).toEqual({});
    expect(loadFeedback(null)).toEqual({});
    for (const e of LAB_ENTRIES) expect(loadFeedback(createIsolatedStorage(null))[e.id]).toBeUndefined();
  });

  it('records a status and a one-line note, and drops an entry that is back to nothing', () => {
    let map = withFeedback({}, 'oneHit', { status: 'needsWork', note: '  too\nfast   ', level: 'hard' });
    expect(map.oneHit).toEqual({ status: 'needsWork', note: 'too fast', level: 'hard' });
    map = withFeedback(map, 'oneHit', { status: 'pass' });
    expect(map.oneHit).toMatchObject({ status: 'pass', note: 'too fast' });
    map = withFeedback(map, 'oneHit', { status: 'notTested', note: '' });
    expect(map.oneHit).toBeUndefined();
  });

  it('caps notes and repairs anything odd that was stored', () => {
    expect(cleanNote('x'.repeat(NOTE_MAX + 50))).toHaveLength(NOTE_MAX);
    expect(
      sanitizeFeedback({
        a: { status: 'pass', note: 7 },
        b: { status: 'great!', note: 'ok', level: 'insane' },
        c: 'nope',
        d: { status: 'failed', note: 'broke', level: 'easy' },
      }),
    ).toEqual({
      a: { status: 'pass', note: '' },
      b: { status: 'notTested', note: 'ok' },
      d: { status: 'failed', note: 'broke', level: 'easy' },
    });
    expect(sanitizeFeedback([1, 2])).toEqual({});
  });

  it('saves under its own key and survives a corrupt value', () => {
    const store = createIsolatedStorage(null);
    expect(saveFeedback(store, { a: { status: 'pass', note: '' } })).toBe(true);
    expect(JSON.parse(store.getItem(FEEDBACK_KEY)!)).toEqual({ a: { status: 'pass', note: '' } });
    store.setItem(FEEDBACK_KEY, '{not json');
    expect(loadFeedback(store)).toEqual({});
    expect(saveFeedback(null, {})).toBe(false);
  });
});

describe('summary', () => {
  it('lists both sections in registry order, the level, the notes and the totals', () => {
    const map = withFeedback(
      withFeedback({}, 'classicRaid', { status: 'pass', level: 'normal', note: 'felt fair' }),
      'recordsVault',
      { status: 'needsWork', level: 'hard', note: 'too dark near the vault door' },
    );
    const text = summarizeFeedback(map, LAB_ENTRIES, { when: '2026-11-22 14:03', device: '844x390, touch' });
    const lines = text.split('\n');
    expect(lines[0]).toBe('WAHALA! TEST LAB (2026-11-22 14:03)');
    expect(lines[1]).toBe('Device: 844x390, touch');
    expect(text).toContain('\nFULL PLAYTESTS\n- [PASS] Classic Campaign Raid (Normal): felt fair\n');
    expect(text).toContain(
      '- [NEEDS IMPROVEMENT] Records Vault, night raid (Hard): too dark near the vault door\n',
    );
    expect(text).toContain('- [NOT TESTED] Classic Blast\n');
    expect(text).toContain('\nISOLATED SCENARIOS\n- [NOT TESTED] Rear approach\n');
    expect(lines.at(-1)).toBe('Totals: 1 pass, 1 needs improvement, 0 failed, 12 not tested');
    expect(lines.filter((l) => l.startsWith('- ['))).toHaveLength(LAB_ENTRIES.length);
  });

  it('is compact plain text: no markup, short lines', () => {
    const text = summarizeFeedback({}, LAB_ENTRIES, { when: 'now' });
    expect(text).not.toMatch(/[<>*#]/);
    expect(Math.max(...text.split('\n').map((l) => l.length))).toBeLessThan(90);
  });
});
