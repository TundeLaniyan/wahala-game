/**
 * Deterministic cost counters for tests and benchmarks (never read by the bots themselves). They
 * count decisions and work units instead of milliseconds, so cost bounds can be asserted on a busy
 * machine.
 */
export interface AiCounters {
  /** Full re-plans. */
  thinks: number;
  /** Re-plans that were routine (cadence / reaction), not urgent. */
  routineThinks: number;
  /** Routine re-plans postponed because the per-tick allowance was used up (large boards). */
  deferred: number;
  /** Work units (danger builds + searches) spent inside re-plans. */
  work: number;
  /** Most work units one re-plan spent. */
  maxThinkWork: number;
}

export const aiCounters: AiCounters = { thinks: 0, routineThinks: 0, deferred: 0, work: 0, maxThinkWork: 0 };

export function resetAiCounters(): void {
  aiCounters.thinks = aiCounters.routineThinks = aiCounters.deferred = aiCounters.work = 0;
  aiCounters.maxThinkWork = 0;
}
