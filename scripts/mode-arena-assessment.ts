/**
 * Arena-size assessment for the three modes (decision MD6; report only, no arena is changed): static geometry
 * per stage and player count: playable tiles, tiles per fighter, blast footprint against that space, spawn
 * spacing and how many fighters a stage can seat, for Free-for-All / Team Deathmatch (respawns) and Last Player
 * Standing. Prints markdown.   npx tsx scripts/mode-arena-assessment.ts
 */
import { ARENAS, DEFAULT_CONFIG, RUMBLE_ARENA_IDS, STANDARD_ARENA_IDS } from '../src/sim';
import { Tile } from '../src/sim/types';
import { createGame } from '../src/sim';
import type { ArenaDef } from '../src/sim';

const SIZES = [8, 16, 24, 32];

function playable(a: ArenaDef): { w: number; h: number; open: number; soft: number; hard: number } {
  const w = a.layout[0]!.length;
  const h = a.layout.length;
  const g = createGame({
    seed: 1,
    arenaId: a.id,
    players: Array.from({ length: Math.min(2, a.maxPlayers) }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller' as const,
      isBot: false,
    })),
    settings: { game: a.kind === 'rumble' ? 'deathmatch' : 'classic', stageHazards: false },
  });
  let open = 0;
  let soft = 0;
  let hard = 0;
  for (const t of g.tiles) {
    if (t === Tile.Hard) hard++;
    else {
      open++;
      if (t === Tile.Soft) soft++;
    }
  }
  return { w, h, open, soft, hard };
}

/** Median and minimum Manhattan distance between the first `n` spawns. */
function spawnSpacing(a: ArenaDef, n: number): { min: number; median: number } {
  const s = a.spawns.slice(0, n);
  const d: number[] = [];
  let min = Infinity;
  for (let i = 0; i < s.length; i++) {
    let nearest = Infinity;
    for (let j = 0; j < s.length; j++) if (i !== j) nearest = Math.min(nearest, Math.abs(s[i]!.x - s[j]!.x) + Math.abs(s[i]!.y - s[j]!.y));
    if (nearest < Infinity) {
      d.push(nearest);
      min = Math.min(min, nearest);
    }
  }
  d.sort((x, y) => x - y);
  return { min: min === Infinity ? 0 : min, median: d[d.length >> 1] ?? 0 };
}

/** Tiles inside a radial blast of radius r (a disc over the grid). */
const disc = (r: number): number => {
  let n = 0;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) n++;
  return n;
};
const plus = (r: number): number => 1 + 4 * r;

const out: string[] = [];
const row = (...c: (string | number)[]): void => void out.push(`| ${c.join(' | ')} |`);

out.push('### Rumble stages (Free-for-All / Team Deathmatch respawn; Last Player Standing no respawn)', '');
row('stage', 'size', 'open tiles', 'open / fighter @8', '@16', '@24', '@32', 'spawns', 'spawn gap min/median @16', '@32');
row(...Array(10).fill('---'));
for (const id of RUMBLE_ARENA_IDS) {
  const a = ARENAS[id]!;
  const p = playable(a);
  const sp16 = spawnSpacing(a, 16);
  const sp32 = spawnSpacing(a, 32);
  row(
    a.name.replace(/^WAHALA! /, ''),
    `${p.w} x ${p.h}`,
    p.open,
    ...SIZES.map((n) => (p.open / n).toFixed(0)),
    a.spawns.length,
    `${sp16.min} / ${sp16.median}`,
    `${sp32.min} / ${sp32.median}`,
  );
}
out.push('', '### Standard 15 x 11 arenas (Classic Battle, 2-4 fighters, no respawn)', '');
row('arena', 'size', 'open tiles (crates incl.)', 'open / fighter @2', '@3', '@4');
row(...Array(6).fill('---'));
for (const id of STANDARD_ARENA_IDS) {
  const a = ARENAS[id]!;
  const p = playable(a);
  row(a.name, `${p.w} x ${p.h}`, p.open, ...[2, 3, 4].map((n) => (p.open / n).toFixed(0)));
}
const g = DEFAULT_CONFIG.generator;
out.push(
  '',
  '### Blast footprint (tiles) against space',
  '',
  `Classic plus blast, range ${g.baseRange} to ${g.maxRange}: ${plus(g.baseRange)} to ${plus(g.maxRange)} tiles. ` +
    `Rumble radial blast (RUMBLE_ECONOMY): radius ${g.baseRange} = about ${disc(g.baseRange)} tiles, max range 5 = about ${disc(5)} tiles, ` +
    `Square Blast tier 3 = ${(2 * 3 + 1) ** 2} tiles.`,
);
console.log(out.join('\n'));
