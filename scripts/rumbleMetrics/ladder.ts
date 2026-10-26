/**
 * Bot-independent economy curve: what a fighter looks like after n credited eliminations under a config
 * variant (the reward ladder applied through the real `previewRewards` / `applyPickup`, so caps, fallbacks
 * and the radial rules are exactly the game's). Used by `scripts/rumble-metrics.ts --ladder` and by
 * tests/rumble-economy-evolution.test.ts (progression is monotone, the ladder pays with radial caps).
 */
import {
  createGame,
  previewRewards,
  radialFootprint,
  radialRadius,
  radialSquareRadius,
  squareFootprint,
} from '../../src/sim';
import type {
  CharacterId,
  DeepPartial,
  GameConfig,
  GameKind,
  GameState,
  PickupKind,
  Player,
} from '../../src/sim';
import { Tile } from '../../src/sim/types';
import { applyPickup } from '../../src/sim/systems/pickups';
import { powerScore } from './collector';

export interface LadderRow {
  kills: number;
  /** Items the elimination paid (after fallbacks). */
  paid: PickupKind[];
  capacity: number;
  range: number;
  /** Radius the radial blast really has (range capped by maxRange). */
  radius: number;
  squareTier: number;
  armour: number;
  speedLevel: number;
  mounted: boolean;
  contact: string | null;
  remote: boolean;
  voucher: boolean;
  /** Tiles one generator burns on open ground. */
  blastTiles: number;
  /** Capacity x blast tiles: how much floor the fighter can cover with the generators it has. */
  coverage: number;
  power: number;
}

/** Tiles a generator with this fighter's range / square tier burns on a completely open board (centre included). */
export function openBlastTiles(config: GameConfig, p: Pick<Player, 'range' | 'squareTier'>): number {
  const size = 31;
  const grid = { width: size, height: size, tiles: new Array<number>(size * size).fill(Tile.Empty) };
  const c = (size - 1) / 2;
  const g = config.generator;
  if (g.blastMode === 'radial') {
    const r = radialRadius(p.range, g.maxRange);
    const sq = radialSquareRadius(r, p.squareTier, g.radialMaxSquareRadius);
    return radialFootprint(grid, c, c, r, { squareRadius: sq }).length + 1;
  }
  // plus (Classic / legacy): the four arms of `range` plus, with Square Blast, the union with the square
  const range = Math.min(p.range, g.maxRange);
  const tiles = new Set<number>([c * size + c]);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const)
    for (let i = 1; i <= range; i++) tiles.add((c + dy * i) * size + (c + dx * i));
  if (p.squareTier > 0)
    for (const t of squareFootprint(grid, c, c, config.square.radiusByTier[p.squareTier] ?? 0))
      tiles.add(t.y * size + t.x);
  return tiles.size;
}

/** The ladder for one character on a Rumble ruleset: row 0 = the start, row n = after the n-th credited elimination. */
export function ladderCurve(
  opts: {
    kills?: number;
    character?: CharacterId;
    game?: GameKind;
    config?: DeepPartial<GameConfig>;
    arenaId?: string;
  } = {},
): LadderRow[] {
  const state: GameState = createGame({
    seed: 1,
    arenaId: opts.arenaId ?? 'rumbleOshodi',
    settings: { game: opts.game ?? 'survival' },
    config: opts.config,
    players: [{ name: 'L', characterId: opts.character ?? 'streetBaller', isBot: false }],
  });
  const p = state.players[0]!;
  const base = { range: state.config.generator.baseRange, capacity: state.config.generator.baseCapacity };
  const row = (kills: number, paid: PickupKind[]): LadderRow => {
    const radius = radialRadius(p.range, state.config.generator.maxRange);
    const blastTiles = openBlastTiles(state.config, p);
    return {
      kills,
      paid,
      capacity: p.capacity,
      range: p.range,
      radius,
      squareTier: p.squareTier,
      armour: p.armour,
      speedLevel: p.speedLevel,
      mounted: p.mounted,
      contact: p.contact,
      remote: p.remote,
      voucher: p.hasVoucher,
      blastTiles,
      coverage: p.capacity * blastTiles,
      power: powerScore(p, base),
    };
  };
  const rows = [row(0, [])];
  for (let k = 1; k <= (opts.kills ?? 14); k++) {
    p.stats.streak = k - 1;
    const paid = previewRewards(state, p);
    for (const kind of paid) applyPickup(state, p, kind, []);
    p.stats.streak = k;
    p.stats.kills = k;
    rows.push(row(k, paid));
  }
  return rows;
}

export function ladderTable(rows: readonly LadderRow[]): string {
  const head = [
    'kills',
    'paid',
    'gens',
    'radius',
    'square',
    'armour',
    'speed',
    'okada',
    'contact',
    'remote',
    'voucher',
    'blast tiles',
    'coverage',
    'power',
  ];
  const line = (r: string[]): string => `| ${r.join(' | ')} |`;
  return [
    line(head),
    line(head.map(() => '---')),
    ...rows.map((r) =>
      line([
        String(r.kills),
        r.paid.join('+') || '-',
        String(r.capacity),
        String(r.radius),
        String(r.squareTier),
        String(r.armour),
        String(r.speedLevel),
        r.mounted ? 'yes' : '-',
        r.contact ?? '-',
        r.remote ? 'yes' : '-',
        r.voucher ? 'yes' : '-',
        String(r.blastTiles),
        String(r.coverage),
        String(r.power),
      ]),
    ),
  ].join('\n');
}
