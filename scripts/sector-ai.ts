/**
 * Campaign tactics drills (docs/CAMPAIGN_SECTOR_AI.md "Measurements"):
 *
 *   npm run sector-ai                    # 12 seeds, every level and variant
 *   npm run sector-ai -- --seeds 24 --only bait
 *
 * A scripted human with ordinary intents against the real enemy bots (scripts/lib/sectorDrill.ts). Prints, per level
 * and variant, how many of the runs each strategy trapped (defeated with a blast) and how many enemies escaped a badly
 * placed generator they saw.
 */
import { ambushDrill, baitDrill, counterDrill, seenDrill, tally } from './lib/sectorDrill';
import type { CampaignLevel, EnemyVariantId } from '../src/sim';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const seeds = Number(arg('seeds') ?? 12);
const only = arg('only');
const drills = { ambush: ambushDrill, bait: baitDrill, counter: counterDrill, seen: seenDrill };
const variants: EnemyVariantId[] = [
  'agbero',
  'areaBoy',
  'marketEnforcer',
  'ringSecurity',
  'routeMarshal',
  'heavyEnforcer',
];
const levels: CampaignLevel[] = ['easy', 'normal', 'hard'];

console.log(`campaign tactics drills, ${seeds} seeds (trapped = defeated by the blast; seen = escaped)`);
for (const level of levels) {
  for (const v of variants) {
    const cells: string[] = [];
    for (const [name, drill] of Object.entries(drills)) {
      if (only && only !== name) continue;
      const t = tally(drill, level, v, seeds);
      const n = name === 'seen' ? t.laid - t.hit : t.defeated;
      cells.push(`${name} ${n}/${t.laid}${t.selfHit ? ` (self ${t.selfHit})` : ''}`);
    }
    console.log(`${level.padEnd(7)} ${v.padEnd(15)} ${cells.join('  ')}`);
  }
}
