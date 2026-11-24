/**
 * Online input -> visible report (docs/ONLINE_PREDICTION.md section 6): the local fighter's delay with and without the
 * movement prediction, per network profile, in the deterministic in-process harness (tests/net/predictionHarness.ts: the
 * real server match core, a modelled link, the real client driver; no sockets, no real phone).
 *
 *   npx tsx scripts/net-latency-report.ts [--minutes 3] [--bots 15] [--seed 11] [--profiles lan,europe,mobile,badMobile]
 *                                         [--independent-jitter]
 *
 * `--independent-jitter` draws each message's jitter independently (a stress case: with ordered delivery a burst of inputs
 * then queues behind its slowest message) instead of the default smoothly varying, queueing-like delay.
 *
 * Both clients play ONE match: the predicting client is connected, the plain one is a shadow fed the same bytes at the same
 * times, and the report fails if the shadow would ever have sent anything different (prediction never changes the input).
 */
import { PROFILES, runLatency, summarize } from '../tests/net/predictionHarness';
import type { ProfileSummary } from '../tests/net/predictionHarness';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const minutes = Number(arg('minutes', '3'));
const bots = Number(arg('bots', '15'));
const seed = Number(arg('seed', '11'));
const names = arg('profiles', 'lan,europe,mobile,badMobile').split(',') as (keyof typeof PROFILES)[];
const independentJitter = process.argv.includes('--independent-jitter');

const ms = (v: number): string => (Number.isFinite(v) ? `${Math.round(v)}` : '-');
const f2 = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : '-');

async function main(): Promise<void> {
  const rows: ProfileSummary[] = [];
  let failed = false;
  for (const name of names) {
    const t0 = performance.now();
    const report = await runLatency({
      profile: independentJitter ? { ...PROFILES[name], jitterCorrMs: 0 } : PROFILES[name],
      seed,
      bots,
      durationMs: minutes * 60_000,
      drivers: [
        { label: 'prediction', options: { prediction: true, verifyOverlay: true } },
        { label: 'none', options: {} },
      ],
    });
    const s = summarize(report);
    rows.push(s);
    const bad =
      s.hashMismatches.some((m) => m > 0) ||
      s.overlayLeaks > 0 ||
      s.shadowSendMismatches > 0 ||
      s.finalHashMatch.some((m) => !m);
    failed ||= bad;
    console.error(
      `${name}: ${((performance.now() - t0) / 1000).toFixed(1)} s, ${report.matchTicks} ticks, ${s.presses} presses ` +
        `(${s.restPresses} from rest), hash checks ${s.hashChecks.join('/')}, link losses up ${report.linkLost.up} ` +
        `down ${report.linkLost.down}${bad ? '  AUTHORITY CHECK FAILED' : ''}`,
    );
  }
  const out: string[] = [];
  out.push(
    `Input -> visible local movement, ${minutes} simulated min per profile, 1 human + ${bots} server bots, seed ${seed}` +
      `${independentJitter ? ', independent per-message jitter' : ''}.`,
  );
  out.push('');
  out.push(
    '| profile | from rest p50 / p95, no prediction (ms) | from rest p50 / p95, prediction (ms) | all presses p50 / p95, no prediction | all presses p50 / p95, prediction | look-ahead p50 (ticks) | arrival estimate error p50 / p95 (ticks) | mispredicted frames | corrections / min | snaps / min | correction p95 / max (tiles) | max drawn jump, prediction / none (tiles) |',
  );
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const s of rows) {
    out.push(
      `| ${s.profile} | ${ms(s.rest[1]![0])} / ${ms(s.rest[1]![1])} | ${ms(s.rest[0]![0])} / ${ms(s.rest[0]![1])} | ` +
        `${ms(s.all[1]![0])} / ${ms(s.all[1]![1])} | ${ms(s.all[0]![0])} / ${ms(s.all[0]![1])} | ${f2(s.horizonP50)} | ` +
        `${s.arrivalErrP50} / ${s.arrivalErrP95} | ${s.mispredictionPctFrames.toFixed(2)} % | ` +
        `${s.correctionsPerMin.toFixed(1)} | ${s.snapsPerMin.toFixed(1)} | ${f2(s.correctionP95)} / ${f2(s.correctionMax)} | ` +
        `${f2(s.frameJumpMax[0]!)} / ${f2(s.frameJumpMax[1]!)} |`,
    );
  }
  out.push('');
  out.push(
    '| profile | replica hash checks (pred / none) | hash mismatches | overlay leaks | shadow send differences | final replica hash = server |',
  );
  out.push('| --- | --- | --- | --- | --- | --- |');
  for (const s of rows) {
    out.push(
      `| ${s.profile} | ${s.hashChecks.join(' / ')} | ${s.hashMismatches.join(' / ')} | ${s.overlayLeaks} | ` +
        `${s.shadowSendMismatches} | ${s.finalHashMatch.map((m) => (m ? 'yes' : 'NO')).join(' / ')} |`,
    );
  }
  console.log(out.join('\n'));
  if (failed) process.exitCode = 1;
}

void main();
