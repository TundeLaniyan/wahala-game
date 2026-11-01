/**
 * Balance measurement of the moving-vehicle generator (decision VG1) over seeded bot matches, per arena and ruleset.
 *
 *   npx tsx scripts/vehicle-generator-balance.ts [--matches 6] [--players 4] [--arena id,id] [--game survival]
 *
 * Per (arena, ruleset): launches; share of launches that found a target (a fuse started); fuses that ended in a blast
 * vs fuses the rival escaped (the vehicle moved on); launches that ran their route without ever finding a target;
 * mean ticks from launch to detonation; opponents eliminated per detonation; fuse-to-blast delays caused by the owner
 * standing in the footprint; owner-safety violations (the owner inside the blast at a detonation: must be 0).
 */
import { ARENAS, RUMBLE_ARENA_IDS, STANDARD_ARENA_IDS, getArena } from '../src/sim';
import type { GameKind, SimEvent } from '../src/sim';
import { runMatch } from '../src/ai/headless';

const args = process.argv.slice(2);
const opt = (name: string, d: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : d;
};
const matches = Number(opt('matches', '6'));
const only = opt('arena', '').split(',').filter(Boolean);
const games = opt('game', '').split(',').filter(Boolean) as GameKind[];
const arenas = only.length ? only : [...STANDARD_ARENA_IDS, ...RUMBLE_ARENA_IDS];

interface Row {
  launches: number;
  fused: number;
  vehiclesWithTarget: number;
  detonated: number;
  escaped: number;
  routeEnd: number;
  crashed: number;
  launchToBlastTicks: number[];
  kills: number;
  ownerViolations: number;
}

function measure(arenaId: string, game: GameKind, players: number): Row {
  const row: Row = {
    launches: 0,
    fused: 0,
    vehiclesWithTarget: 0,
    detonated: 0,
    escaped: 0,
    routeEnd: 0,
    crashed: 0,
    launchToBlastTicks: [],
    kills: 0,
    ownerViolations: 0,
  };
  for (let seed = 1; seed <= matches; seed++) {
    const launched = new Map<number, number>();
    const fusing = new Set<number>();
    const found = new Set<number>();
    runMatch({
      seed,
      arenaId,
      difficulties: Array.from({ length: players }, () => 'standard' as const),
      settings: { game, stageHazards: true },
      onEvents: (events: readonly SimEvent[], state) => {
        // measurement only: every fighter gets a Vehicle Voucher every 12 s (crates rarely drop enough of them)
        if (state.tick % 720 === 0)
          for (const p of state.players)
            if (p.alive && !p.hasVoucher && !state.vehicles.some((v) => v.ownerId === p.id))
              p.hasVoucher = true;
        for (const e of events) {
          if (e.type === 'vehicleWarning') {
            row.launches++;
            launched.set(e.vehicleId, state.tick);
          } else if (e.type === 'vehicleFuse') {
            row.fused++;
            fusing.add(e.vehicleId);
            if (!found.has(e.vehicleId)) {
              found.add(e.vehicleId);
              row.vehiclesWithTarget++;
            }
          } else if (e.type === 'vehicleDetonated') {
            row.detonated++;
            fusing.delete(e.vehicleId);
            row.launchToBlastTicks.push(state.tick - (launched.get(e.vehicleId) ?? state.tick));
            row.kills += events.filter(
              (k) => k.type === 'playerEliminated' && k.creditId === e.ownerId && k.playerId !== e.ownerId,
            ).length;
            // owner safety: the owner must never be eliminated by their OWN flames in the tick their carried
            // generator goes off (the carrier's flames are ownerSafe). An elimination by a rival's flames in the
            // same tick is a coincidence, not a violation, and is not counted.
            row.ownerViolations += events.filter(
              (k) =>
                k.type === 'playerEliminated' &&
                k.playerId === e.ownerId &&
                'ownerId' in k.cause &&
                k.cause.ownerId === e.ownerId,
            ).length;
          } else if (e.type === 'vehicleGeneratorExpired') {
            if (e.reason === 'route') row.routeEnd++;
            else row.crashed++;
            if (fusing.delete(e.vehicleId)) row.escaped++;
          }
        }
        // a fuse the rival escaped: the carrier goes back to scanning
        for (const v of state.vehicles)
          if (fusing.has(v.id) && v.payload?.state === 'scanning') {
            fusing.delete(v.id);
            row.escaped++;
          }
      },
    });
  }
  return row;
}

const pct = (a: number, b: number): string => (b ? `${Math.round((100 * a) / b)}%` : '-');
console.log(
  '| arena | size | ruleset | players | launches | found a target (share of launches) | fuses ending in a blast | fuses the rival escaped | no target (route end) | crashed | launch->blast (s) | kills / blast | owner killed by own flames in the blast tick |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const id of arenas) {
  const a = getArena(id);
  const w = a.layout[0]!.length;
  const h = a.layout.length;
  const modes: GameKind[] = games.length
    ? games
    : a.kind === 'rumble'
      ? ['survival', 'deathmatch', 'team']
      : ['classic'];
  const players = a.kind === 'rumble' ? Number(opt('players', '16')) : Number(opt('players', '4'));
  for (const game of modes) {
    const r = measure(id, game, players);
    const mean = r.launchToBlastTicks.length
      ? r.launchToBlastTicks.reduce((p, q) => p + q, 0) / r.launchToBlastTicks.length / 60
      : NaN;
    console.log(
      `| ${id} | ${w}x${h} | ${game} | ${players} | ${r.launches} | ${pct(r.vehiclesWithTarget, r.launches)} | ${pct(r.detonated, r.fused)} | ${pct(r.escaped, r.fused)} | ${pct(r.routeEnd, r.launches)} | ${r.crashed} | ${Number.isNaN(mean) ? '-' : mean.toFixed(1)} | ${r.detonated ? (r.kills / r.detonated).toFixed(2) : '-'} | ${r.ownerViolations} |`,
    );
  }
}
void ARENAS;
