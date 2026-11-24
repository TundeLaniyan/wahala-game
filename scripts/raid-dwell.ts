/**
 * THE DWELL PROBE over the real raids (task PI-1C, docs/CLASSIC_RAID_REAR.md): at many moments of the real raid, the
 * human appears on the tile directly behind a first-wave guard that nobody could notice him on, lays a generator and
 * stands (or leaves). Prints per level how often he is engaged within the dwell, by whom and by which rule.
 *
 *   npx tsx scripts/raid-dwell.ts [--seeds 2] [--raids a,b] [--levels easy,normal,hard] [--dwell 90] [--leave -1]
 */
import type { CampaignLevel, RaidId } from '../src/sim';
import { RAIDS } from './lib/raidAi';
import { dwellProbe } from './lib/rearStalk';
import { firstWaveSeats } from './raid-stalk';

const FUSE = 180;
const OPP: Record<string, string> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};

export interface DwellRow {
  eligible: number;
  engaged: number;
  byOwner: number;
  byOther: number;
  killed: number;
  /** killed with no engagement of any enemy before the blast */
  clean: number;
  /** engaged with no sight beforehand (notice counter <= 1): nothing a player could have reacted to */
  instant: number;
  causes: Record<string, number>;
  /** ticks to the first engagement, sorted */
  at: number[];
  /** engaged while the guard was walking / standing */
  walkEngaged: number;
  walkTotal: number;
  /** engaged with the human BEHIND the engaging guard (forward < 0) at that tick */
  fromBehind: number;
}
export const emptyDwell = (): DwellRow => ({
  eligible: 0,
  engaged: 0,
  byOwner: 0,
  byOther: 0,
  killed: 0,
  clean: 0,
  instant: 0,
  causes: {},
  at: [],
  walkEngaged: 0,
  walkTotal: 0,
  fromBehind: 0,
});

if (process.argv[1]?.endsWith('raid-dwell.ts')) {
  const SEEDS = Array.from({ length: Number(arg('seeds', '2')) }, (_, i) => i + 1);
  const raids = (arg('raids', RAIDS.join(',')).split(',') as RaidId[]).filter(Boolean);
  const levels = arg('levels', 'easy,normal,hard').split(',') as CampaignLevel[];
  const dwell = Number(arg('dwell', '90'));
  const leave = Number(arg('leave', '-1'));
  const react = Number(arg('react', '-1'));
  const step = Number(arg('step', '45'));
  const maxT = Number(arg('max', '1800'));
  const verbose = process.argv.includes('--verbose');
  for (const level of levels) {
    const all = emptyDwell();
    for (const raidId of raids) {
      const row = emptyDwell();
      for (const seat of firstWaveSeats(raidId))
        for (const seed of SEEDS)
          for (let t0 = 0; t0 <= maxT; t0 += step) {
            const r = dwellProbe({
              raidId,
              level,
              seed,
              target: seat.id,
              t0,
              dwell,
              leaveAfter: leave,
              ...(react >= 0 ? { reactTicks: react } : {}),
            });
            if (!r.eligible) continue;
            for (const d of [row, all]) {
              d.eligible++;
              if (r.walking) d.walkTotal++;
              if (r.killed) d.killed++;
              if (r.killed && !(r.first && r.first.tick < FUSE)) d.clean++;
              // only engagements BEFORE the blast count (after it, the noise itself wakes the neighbours)
              if (r.first && r.first.tick < FUSE) {
                d.engaged++;
                if (r.first.noticeBefore <= 1 && r.first.cause !== 'sight') d.instant++;
                d.at.push(r.first.tick);
                if (r.walking) d.walkEngaged++;
                if (r.first.isTarget) d.byOwner++;
                else d.byOther++;
                if (r.first.forward < 0) d.fromBehind++;
                d.causes[r.first.cause] = (d.causes[r.first.cause] ?? 0) + 1;
                if (r.first.cause === 'close') {
                  const k = closeKind(r.first.facingBefore, r.first.facingAfter);
                  d.causes[`close:${k}`] = (d.causes[`close:${k}`] ?? 0) + 1;
                }
              }
            }
            if (verbose && r.first && r.first.tick < FUSE)
              console.log(
                `  ${raidId} ${level} s${seed} t0 ${t0} seat ${seat.id} ${seat.kind} walking ${r.walking}: ${JSON.stringify(r.first)}`,
              );
          }
      console.log(`${level} ${raidId}: ${show(row)}`);
    }
    console.log(`== ${level} ALL (dwell ${dwell}, leave ${leave}, react ${react}): ${show(all)}\n`);
  }
}

function show(d: DwellRow): string {
  const c = Object.entries(d.causes)
    .sort()
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
  const pct = (a: number, b: number): string => (b ? `${Math.round((100 * a) / b)}%` : '-');
  const at = [...d.at].sort((a, b) => a - b);
  const med = at.length ? at[Math.floor(at.length / 2)] : '-';
  return `${d.eligible} windows | engaged ${d.engaged} (${pct(d.engaged, d.eligible)}) of which instant ${d.instant} | by owner/other ${d.byOwner}/${d.byOther} | from behind ${d.fromBehind} | walking guard ${d.walkEngaged}/${d.walkTotal} | killed ${d.killed} (${pct(d.killed, d.eligible)}) clean ${d.clean} (${pct(d.clean, d.eligible)}) | median tick ${med} | ${c}`;
}

/** How a guard came to face a human at arm's length: it flipped 180 degrees, turned 90, or was already facing him. */
export function closeKind(before: string, after: string): string {
  const b = before.includes('>walk') ? before.split('>walk ')[1]! : before;
  if (b === after && !before.includes('>walk')) return 'was-facing';
  if (OPP[before.split('>')[0]!] === after) return 'reversed';
  if (before.includes('>walk') && before.split('>')[0] === after) return 'walked-in';
  return b === after ? 'walked-in' : 'turned90';
}
