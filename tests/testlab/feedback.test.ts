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
  it('lists the review group first, then the completed one, with the level, the notes and the totals', () => {
    const map = withFeedback(
      withFeedback({}, 'classicRaid', { status: 'pass', level: 'normal', note: 'felt fair' }),
      'recordsVault',
      { status: 'needsWork', level: 'hard', note: 'too dark near the vault door' },
    );
    const text = summarizeFeedback(map, LAB_ENTRIES, { when: '2026-11-22 14:03', device: '844x390, touch' });
    const lines = text.split('\n');
    expect(lines[0]).toBe('WAHALA! TEST LAB (2026-11-22 14:03)');
    expect(lines[1]).toBe('Device: 844x390, touch');
    expect(text).toContain('\nTESTS REQUIRING REVIEW\n- [NOT TESTED] Sudden Death presentation and timer\n');
    expect(text.indexOf('TESTS REQUIRING REVIEW')).toBeLessThan(text.indexOf('COMPLETED TESTS'));
    expect(text).toContain('\nCOMPLETED TESTS\n');
    expect(text).toContain('- [PASS] Classic Campaign Raid (Normal): felt fair\n');
    expect(text).toContain(
      '- [NEEDS IMPROVEMENT] Records Vault, night raid (Hard): too dark near the vault door\n',
    );
    expect(text).toContain('- [NOT TESTED] Classic Blast\n');
    expect(lines.at(-1)).toBe('Totals: 1 pass, 1 needs improvement, 0 failed, 18 not tested');
    expect(lines.filter((l) => l.startsWith('- ['))).toHaveLength(LAB_ENTRIES.length);
  });

  it('carries the set-up a test was marked at (the City Rumble configuration, the one-hit enemy) after the level', () => {
    const map = withFeedback(
      withFeedback({}, 'cityRumble', {
        status: 'needsWork',
        note: 'bots too sharp',
        detail: 'Free-for-All · 16 fighters · 5 min · Oshodi Transport Metropolis · Rookie bots',
      }),
      'oneHit',
      { status: 'pass', level: 'normal', detail: 'Guard' },
    );
    const text = summarizeFeedback(map, LAB_ENTRIES, { when: 'now' });
    expect(text).toContain(
      '- [NEEDS IMPROVEMENT] City Rumble parity (Free-for-All · 16 fighters · 5 min · Oshodi Transport Metropolis · Rookie bots): bots too sharp\n',
    );
    expect(text).toContain('- [PASS] One-hit lethality (Normal; Guard)\n');
    // stored feedback survives a reload with its detail, and a bad detail is dropped
    const back = sanitizeFeedback(JSON.parse(JSON.stringify(map)));
    expect(back.oneHit).toEqual({ status: 'pass', note: '', level: 'normal', detail: 'Guard' });
    expect(sanitizeFeedback({ x: { status: 'pass', note: '', detail: 7 } }).x).toEqual({
      status: 'pass',
      note: '',
    });
  });

  it('is compact plain text: no markup, short lines (the set-up lines of a Rumble are the longest)', () => {
    const text = summarizeFeedback({}, LAB_ENTRIES, { when: 'now' });
    expect(text).not.toMatch(/[<>*#]/);
    expect(Math.max(...text.split('\n').map((l) => l.length))).toBeLessThan(90);
  });
});
