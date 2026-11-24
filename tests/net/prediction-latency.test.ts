/**
 * Input -> visible local movement with and without prediction, and the proof that prediction leaves authority untouched
 * (docs/ONLINE_PREDICTION.md section 6). Deterministic in-process harness (predictionHarness.ts): the real server match
 * core behind a modelled link, the real client driver, a scripted human. Short runs (45 s, 6 fighters) to stay well
 * under a minute; the 3-minute, 16-fighter profiles are prediction-latency-heavy.test.ts and scripts/net-latency-report.ts.
 */
import { describe, expect, it } from 'vitest';
import { MSG, validateInput } from '../../src/net/protocol';
import { PROFILES, runLatency, summarize } from './predictionHarness';
import type { RunReport } from './predictionHarness';

const BOTH = [
  { label: 'prediction', options: { prediction: true, verifyOverlay: true } },
  { label: 'none', options: {} },
];

function expectAuthorityUntouched(r: RunReport): void {
  const s = summarize(r);
  expect(s.hashChecks.every((n) => n > 10)).toBe(true);
  expect(s.hashMismatches).toEqual([0, 0]);
  expect(r.drivers.map((d) => d.resyncs)).toEqual([0, 0]);
  expect(s.overlayLeaks).toBe(0);
  expect(r.drivers[0]!.overlayReverts).toBeGreaterThan(1000);
  expect(s.shadowSendMismatches).toBe(0); // the plain client would have sent exactly the same messages
  expect(s.finalHashMatch).toEqual([true, true]); // both replicas end bit-identical to the server
  // the server never received anything but input {s, m, h, b} and pings
  expect(new Set(r.serverReceived.map((m) => m.type))).toEqual(new Set([MSG.input, MSG.ping]));
  for (const m of r.serverReceived.filter((x) => x.type === MSG.input)) {
    expect(Object.keys(m.msg as object).sort()).toEqual(['b', 'h', 'm', 's']);
    expect(validateInput(m.msg).ok).toBe(true);
  }
}

describe('input -> visible (in-process harness)', () => {
  it('europe-like link: the local step shows within ~2 frames instead of a round trip, authority untouched', async () => {
    const r = await runLatency({
      profile: PROFILES.europe,
      seed: 21,
      durationMs: 45_000,
      bots: 5,
      drivers: BOTH,
    });
    const s = summarize(r);
    expect(s.all[0]![0]).toBeLessThanOrEqual(40); // prediction p50
    expect(s.all[1]![0]).toBeGreaterThanOrEqual(130); // no prediction p50
    expect(s.horizonP50).toBeGreaterThan(5);
    expect(s.arrivalErrP95).toBeLessThanOrEqual(2);
    expect(s.snapsPerMin).toBeLessThan(3);
    expectAuthorityUntouched(r);
  }, 60_000);

  it('bad-mobile link (250 ms, 3 % loss, stalls): still immediate, corrections bounded, authority untouched', async () => {
    const r = await runLatency({
      profile: PROFILES.badMobile,
      seed: 22,
      durationMs: 45_000,
      bots: 5,
      drivers: BOTH,
    });
    const s = summarize(r);
    expect(s.all[0]![0]).toBeLessThanOrEqual(50);
    expect(s.all[1]![0]).toBeGreaterThanOrEqual(300);
    expect(s.horizonP50).toBeLessThanOrEqual(40); // capped look-ahead
    expect(s.correctionMax).toBeLessThan(3);
    expect(s.mispredictionPctFrames).toBeLessThan(3);
    expectAuthorityUntouched(r);
  }, 60_000);

  it('two separate matches, one client predicting and one not: the server gets the same input and gives the same result', async () => {
    const run = (prediction: boolean): Promise<RunReport> =>
      runLatency({
        profile: PROFILES.mobile,
        seed: 23,
        durationMs: 31_000,
        durationSec: 25, // the match ends (results) inside the run
        bots: 3,
        drivers: [
          { label: prediction ? 'prediction' : 'none', options: { prediction, verifyOverlay: true } },
        ],
      });
    const [a, b] = [await run(true), await run(false)];
    expect(a.results.tick).toBeGreaterThan(1500);
    expect(a.serverReceived).toEqual(b.serverReceived);
    expect(a.results).toEqual(b.results);
    expect(a.finalHash).toBe(b.finalHash);
    expect(a.replicaFinalHash).toEqual([a.finalHash]);
    expect(b.replicaFinalHash).toEqual([b.finalHash]);
    expect(a.drivers[0]!.predictedFrames).toBeGreaterThan(1000);
    expect(a.drivers[0]!.hashMismatches).toBe(0);
  }, 60_000);
});
