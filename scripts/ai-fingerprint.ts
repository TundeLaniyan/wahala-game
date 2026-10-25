/**
 * Prints a fingerprint of a fixed batch of standard-arena bot matches (winner, length and every
 * seat's elimination tick). Run before and after an AI change to prove that the standard 2-4 player
 * game is bit-for-bit unchanged:
 *
 *   npx tsx scripts/ai-fingerprint.ts > before.txt   (change the AI)   npx tsx scripts/ai-fingerprint.ts | diff before.txt -
 */
import { STANDARD_ARENA_IDS } from '../src/sim';
import type { Difficulty } from '../src/sim';
import { runMatch } from '../src/ai/headless';

const matches = Number(process.argv[2] ?? 4);
const lineups: Difficulty[][] = [
  ['expert', 'standard', 'beginner', 'expert'],
  ['standard', 'standard', 'expert'],
  ['beginner', 'expert'],
];
for (const arenaId of STANDARD_ARENA_IDS) {
  for (let i = 0; i < matches; i++) {
    const difficulties = lineups[i % lineups.length]!;
    const out = runMatch({
      seed: 100 + i,
      arenaId,
      difficulties,
      settings: { mode: i % 2 ? 'crush' : 'classic' },
    });
    console.log(
      `${arenaId} #${i} winner=${out.winner} draw=${out.draw} ticks=${out.ticks} ` +
        out.seats.map((s) => `${s.eliminatedTick ?? '-'}:${s.cause?.kind ?? 'alive'}`).join(' '),
    );
  }
}
