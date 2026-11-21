/**
 * Prints the derived patrol route of every raid enemy (decision RA2, `src/sim/raid/routes.ts`) on its board:
 *   npx tsx scripts/raid-routes.ts [raidId]
 * Each enemy's waypoints are drawn with its seat letter (A = seat 1 ...); `o` marks other route tiles.
 */
import { RAID_IDS, buildRaidGame, createGame, raidTacticsFor } from '../src/sim';
import type { RaidId } from '../src/sim';
import { raidRoute, raidTerritory } from '../src/sim/raid/routes';
import { addEnemyMind } from '../src/sim/systems/territory';
import { Tile } from '../src/sim/types';

const only = process.argv[2] as RaidId | undefined;
for (const raidId of only ? [only] : RAID_IDS) {
  const s = createGame(buildRaidGame({ raidId, humanCharacter: 'streetBaller', seed: 1 }));
  const cfg = raidTacticsFor('normal').classicRaid!;
  const rows: string[][] = Array.from({ length: s.height }, (_, y) =>
    Array.from({ length: s.width }, (_, x) => {
      const t = s.tiles[y * s.width + x];
      return t === Tile.Hard ? '#' : t === Tile.Soft ? 'x' : '.';
    }),
  );
  const lines: string[] = [];
  // in wake order (main waves first, side rooms last), each new route keeping off those already walked
  const seats = [...s.raid!.seats].sort((a, b) => (a.room ? 99 : a.wave) - (b.room ? 99 : b.wave));
  for (const seat of seats) {
    const r = raidRoute(s, seat.kind, seat.playerId, seat.spot, cfg);
    s.players[seat.playerId]!.alive = true;
    addEnemyMind(s, seat.playerId, seat.spot, raidTerritory(r, seat.kind));
    const mark = String.fromCharCode(64 + seat.playerId);
    rows[seat.spot.y]![seat.spot.x] = mark.toLowerCase();
    for (const w of r.waypoints) rows[w.y]![w.x] = mark;
    lines.push(
      `${mark} ${seat.kind} @${seat.spot.x},${seat.spot.y} wave ${seat.wave}: ${r.style} ${r.waypoints.map((w) => `${w.x},${w.y}`).join(' > ')} facing ${r.facing}`,
    );
  }
  console.log(`\n${raidId}\n${rows.map((r) => r.join('')).join('\n')}\n${lines.join('\n')}`);
}
