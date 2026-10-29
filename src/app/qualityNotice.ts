/**
 * The quiet notice shown when Auto graphics changes quality. Pure (unit-tested): decides the wording
 * ("Graphics reduced · Very Low", "Graphics increased · Medium") and rate-limits so the player is never nagged.
 *
 * Limits: at most one notice per `minGapMs`, at most `maxPerMatch` per match; a change that is suppressed is
 * simply not announced (the Settings screen always shows the current level).
 */
import type { QualityChange } from '../render/perf';
import { rungName } from '../render/quality';

export interface QualityNotice {
  text: string;
  tone: 'info';
}

export const NOTICE_MIN_GAP_MS = 25_000;
export const NOTICE_MAX_PER_MATCH = 3;

export function qualityNoticeText(change: QualityChange): string {
  const verb = change.direction === 'up' ? 'increased' : 'reduced';
  return `Graphics ${verb} · ${rungName(change.to)}`;
}

export class QualityNotifier {
  private lastAt = -Infinity;
  private shown = 0;

  constructor(
    private readonly minGapMs = NOTICE_MIN_GAP_MS,
    private readonly maxPerMatch = NOTICE_MAX_PER_MATCH,
  ) {}

  /** A new match starts: the per-match count resets (the gap between notices does not). */
  newMatch(): void {
    this.shown = 0;
  }

  /** The notice to show for `change` at `nowMs`, or null when it is rate-limited. */
  handle(change: QualityChange, nowMs: number): QualityNotice | null {
    if (this.shown >= this.maxPerMatch || nowMs - this.lastAt < this.minGapMs) return null;
    this.lastAt = nowMs;
    this.shown++;
    return { text: qualityNoticeText(change), tone: 'info' };
  }
}
