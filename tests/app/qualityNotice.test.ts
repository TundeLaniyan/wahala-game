import { describe, expect, it } from 'vitest';
import {
  NOTICE_MAX_PER_MATCH,
  NOTICE_MIN_GAP_MS,
  QualityNotifier,
  qualityNoticeText,
} from '../../src/app/qualityNotice';
import type { QualityChange } from '../../src/render/perf';

const change = (
  from: number,
  to: number,
  reason: QualityChange['reason'] = 'sustained-slow',
): QualityChange => ({
  from,
  to,
  direction: to < from ? 'down' : 'up',
  reason,
  fps: 30,
  at: 10,
});

describe('quality notice wording', () => {
  it('says what happened for the player, not numbers', () => {
    expect(qualityNoticeText(change(5, 4))).toBe('Graphics reduced for smoother performance');
    expect(qualityNoticeText(change(4, 5, 'headroom'))).toBe('Graphics increased');
    expect(qualityNoticeText(change(3, 4, 'restore'))).toBe('Graphics increased');
    expect(qualityNoticeText(change(2, 0, 'severe'))).toBe('Performance mode: Very Low');
  });
});

describe('quality notice rate limit', () => {
  it('shows the first change and then waits out the gap', () => {
    const n = new QualityNotifier();
    expect(n.handle(change(5, 4), 1000)).toEqual({
      text: 'Graphics reduced for smoother performance',
      tone: 'info',
    });
    expect(n.handle(change(4, 3), 1000 + NOTICE_MIN_GAP_MS - 1)).toBeNull();
    expect(n.handle(change(4, 3), 1000 + NOTICE_MIN_GAP_MS)).not.toBeNull();
  });
  it('caps notices per match and resets for the next match', () => {
    const n = new QualityNotifier();
    let shown = 0;
    for (let i = 0; i < 10; i++) if (n.handle(change(6, 5), i * (NOTICE_MIN_GAP_MS + 1))) shown++;
    expect(shown).toBe(NOTICE_MAX_PER_MATCH);
    n.newMatch();
    expect(n.handle(change(6, 5), 99 * NOTICE_MIN_GAP_MS)).not.toBeNull();
  });
  it('a new match does not bypass the gap', () => {
    const n = new QualityNotifier();
    n.handle(change(6, 5), 1000);
    n.newMatch();
    expect(n.handle(change(5, 4), 2000)).toBeNull();
  });
});
