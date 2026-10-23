/**
 * Bot batch per standard arena: how matches end, how long they last, and what eliminates players
 * (own fire, rival fire, vehicles, stage hazards). Used to tune stage hazards and pickups.
 *
 *   npx tsx scripts/arena-balance.ts [matchesPerArena=30] [lineup e.g. medium,hard,medium,hard] [arenaIds,...]
 */
import { runMatch } from '../src/ai/headless';
import { STANDARD_ARENA_IDS } from '../src/sim';
import type { Difficulty } from '../src/sim';

const matches = Number(process.argv[2] ?? 30);
const lineup = (process.argv[3] ?? 'medium,hard,medium,hard').split(',') as Difficulty[];
const pct = (n: number, d: number): string => `${((100 * n) / Math.max(1, d)).toFixed(0)}%`.padStart(4);

console.log(`lineup ${lineup.join('/')}, ${matches} matches per arena\n`);
console.log('arena                  avg s  win  draw  t/o | own  rival  veh  hazard  crush  other');
for (const arenaId of process.argv[4] ? process.argv[4].split(',') : STANDARD_ARENA_IDS) {
  let ticks = 0;
  let wins = 0;
  let draws = 0;
  let timeouts = 0;
  const c = { own: 0, rival: 0, veh: 0, hazard: 0, crush: 0, other: 0 };
  let deaths = 0;
  for (let i = 0; i < matches; i++) {
    const out = runMatch({ seed: 1000 + i, difficulties: lineup, arenaId });
    ticks += out.ticks;
    if (out.winner !== null) wins++;
    if (out.draw) draws++;
    if (out.timeout) timeouts++;
    out.seats.forEach((s, seat) => {
      if (!s.cause) return;
      deaths++;
      const k = s.cause.kind;
      if (k === 'flame') {
        if (s.cause.ownerId === seat) c.own++;
        else c.rival++;
      }
      else if (k === 'vehicle') c.veh++;
      else if (k === 'hazard') c.hazard++;
      else if (k === 'crush') c.crush++;
      else c.other++;
    });
  }
  console.log(
    `${arenaId.padEnd(22)} ${(ticks / matches / 60).toFixed(0).padStart(5)} ${pct(wins, matches)} ${pct(draws, matches)} ${pct(timeouts, matches)} | ${pct(c.own, deaths)} ${pct(c.rival, deaths)}  ${pct(c.veh, deaths)}  ${pct(c.hazard, deaths)}   ${pct(c.crush, deaths)}  ${pct(c.other, deaths)}`,
  );
}
