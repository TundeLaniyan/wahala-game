/**
 * Campaign combat reliability, part 5: the human-like Oshodi flow (docs/CAMPAIGN_COMBAT_RELIABILITY.md, V5). A scripted human with
 * the human model (input latency 6-24 ticks, ordinary intents only) plays `oshodi.approach` end to end (checkpoints A-B-C, the depot
 * door resolved like the other scripted playthroughs) and traps a patrolling warden with his own generator on the way (the
 * bait, up to three tries). Seeded, so the counts are exact; Easy >= Normal >= Hard.
 */
import { describe, expect, it } from 'vitest';
import { playOshodiFlow } from '../scripts/lib/oshodiFlow';
import type { FlowResult } from '../scripts/lib/oshodiFlow';
import type { CampaignLevel } from '../src/sim';

const run = (level: CampaignLevel, n: number): FlowResult[] =>
  Array.from({ length: n }, (_, i) => playOshodiFlow(level, i + 1));
const wins = (r: FlowResult[]): number => r.filter((x) => x.won).length;
const kills = (r: FlowResult[]): number => r.filter((x) => x.agberoBlastKills > 0).length;

describe('the human-like Oshodi flow (V5)', () => {
  const normal = run('normal', 8);
  const easy = run('easy', 8);
  const hard = run('hard', 20);

  it('Normal: he finishes the mission and traps a patrolling warden with his own generator in a majority of 8 seeds', () => {
    expect(wins(normal), 'finished').toBeGreaterThanOrEqual(5);
    expect(kills(normal), 'a warden trapped').toBeGreaterThanOrEqual(5);
  });

  it('Hard: he finishes the mission in a clear majority of 20 seeds (16 measured), and traps the warden in most', () => {
    expect(wins(hard), 'finished').toBeGreaterThanOrEqual(14);
    expect(kills(hard), 'a warden trapped').toBeGreaterThanOrEqual(15);
  });

  it('Easy >= Normal >= Hard in completion and in traps', () => {
    // rates (Hard has 20 seeds, the others 8)
    expect(wins(easy) / 8).toBeGreaterThanOrEqual(wins(normal) / 8);
    expect(wins(normal) / 8).toBeGreaterThanOrEqual(wins(hard) / 20);
    expect(kills(easy) / 8).toBeGreaterThanOrEqual(kills(normal) / 8);
    expect(kills(normal) / 8).toBeGreaterThanOrEqual(kills(hard) / 20);
  });
}, 600_000);
