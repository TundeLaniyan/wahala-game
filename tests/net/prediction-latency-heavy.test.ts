/**
 * HEAVY, skipped by default: the four network profiles for 3 simulated minutes each with 16 fighters (about 25 s of CPU
 * per profile). Run with `WAHALA_NET_HEAVY=1 npx vitest run tests/net/prediction-latency-heavy.test.ts`; the same runs
 * print as a table with `npx tsx scripts/net-latency-report.ts` (docs/ONLINE_PREDICTION.md section 6).
 */
import { describe, expect, it } from 'vitest';
import { PROFILES, runLatency, summarize } from './predictionHarness';

const heavy = !!process.env.WAHALA_NET_HEAVY;

/** [prediction p50 max, no-prediction p50 min] for presses from rest, ms. */
const LIMITS: Record<keyof typeof PROFILES, [number, number]> = {
  lan: [34, 50],
  europe: [34, 150],
  mobile: [50, 230],
  badMobile: [50, 450],
};

describe.skipIf(!heavy)('input -> visible, 3 minutes per profile (heavy)', () => {
  for (const name of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
    it(`${PROFILES[name].name}`, async () => {
      const r = await runLatency({
        profile: PROFILES[name],
        seed: 11,
        bots: 15,
        durationMs: 180_000,
        drivers: [
          { label: 'prediction', options: { prediction: true, verifyOverlay: true } },
          { label: 'none', options: {} },
        ],
      });
      const s = summarize(r);
      expect(s.restPresses).toBeGreaterThan(15);
      expect(s.rest[0]![0]).toBeLessThanOrEqual(LIMITS[name][0]);
      expect(s.rest[1]![0]).toBeGreaterThanOrEqual(LIMITS[name][1]);
      expect(s.hashMismatches).toEqual([0, 0]);
      expect(s.overlayLeaks).toBe(0);
      expect(s.shadowSendMismatches).toBe(0);
      expect(s.finalHashMatch).toEqual([true, true]);
      expect(s.correctionMax).toBeLessThan(4.5); // at most the capped look-ahead (40 ticks = 4 steps)
    }, 300_000);
  }
});
