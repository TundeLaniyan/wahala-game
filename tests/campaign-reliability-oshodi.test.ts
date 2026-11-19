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
  const hard = run('hard', 8);

  it('Normal: he finishes the mission and traps a patrolling warden with his own generator in a majority of 8 seeds', () => {
    expect(wins(normal), 'finished').toBeGreaterThanOrEqual(5);
    expect(kills(normal), 'a warden trapped').toBeGreaterThanOrEqual(5);
  });

  it('Hard: he finishes the mission in a clear majority of the 8 seeds, and traps the warden in most', () => {
    expect(wins(hard), 'finished').toBeGreaterThanOrEqual(5);
    expect(kills(hard), 'a warden trapped').toBeGreaterThanOrEqual(5);
  });

  it('Easy >= Normal >= Hard in completion and in traps', () => {
    expect(wins(easy)).toBeGreaterThanOrEqual(wins(normal));
    expect(wins(normal)).toBeGreaterThanOrEqual(wins(hard));
    expect(kills(easy)).toBeGreaterThanOrEqual(kills(normal));
    expect(kills(normal)).toBeGreaterThanOrEqual(kills(hard));
  });
}, 600_000);
