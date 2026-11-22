/** `?testlab=1` parsing and the exit URL (docs/TEST_LAB.md, decision TL1). */
import { describe, expect, it } from 'vitest';
import { normalGameUrl, parseTestLab } from '../../src/testlab/params';

describe('parseTestLab', () => {
  it('is on for ?testlab=1 (alone or among other flags) and for a bare ?testlab', () => {
    expect(parseTestLab('?testlab=1')).toBe(true);
    expect(parseTestLab('?debug&testlab=1&q=low')).toBe(true);
    expect(parseTestLab('?testlab')).toBe(true);
    expect(parseTestLab('?testlab=true')).toBe(true);
  });

  it('is off without the query, and for an explicit off value', () => {
    expect(parseTestLab('')).toBe(false);
    expect(parseTestLab('?debug')).toBe(false);
    expect(parseTestLab('?qaraid=recordsVault')).toBe(false);
    expect(parseTestLab('?testlab=0')).toBe(false);
    expect(parseTestLab('?testlab=false')).toBe(false);
    expect(parseTestLab('?testlab=off')).toBe(false);
  });

  it('the exit URL is the same page without testlab (other flags and the base path stay)', () => {
    expect(normalGameUrl('https://x.github.io/wahala-game/?testlab=1')).toBe(
      'https://x.github.io/wahala-game/',
    );
    expect(normalGameUrl('https://x.github.io/wahala-game/?debug&testlab=1&seed=7#top')).toBe(
      'https://x.github.io/wahala-game/?debug&seed=7#top',
    );
  });
});
