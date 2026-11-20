/**
 * Campaign area: MUSHIN - THE OLOJA COVERED MARKET, THE WAREHOUSES AND THE SERVICE LANE (mission 2, `mushin.market`;
 * docs/CAMPAIGN_WORLD.md "Mushin", decisions WM4-WM5). A campaign-only board north-east of the Idi-Oro road: the inside of
 * the market the City Rumble map shows only as its Ojuwoye stall grid. Four sub-areas (the camera looks north):
 *
 *   hall         the covered market hall (west): stall blocks under canopies, one-stall-wide interior aisles, the back stall
 *   provisions   the provisions aisles (middle): kiosks, stalls and lock-ups, the cross aisles the runners work
 *   warehouses   the warehouse interiors (east, behind the hall's steel gate): goods stacks between walls, the far stall
 *   serviceLane  the service lane on top (the "top street") and the lorry bay at its east end, the loaders' yard south
 *
 * Painted with the Mushin letters (`MUSHIN_LEGEND`) and drawn by the community campaign kit (WM1); every solid tile is a real
 * object. Fictional names only.
 */
import { Board } from '../community/painter';
import { MUSHIN_LEGEND } from '../rumbleMushin';
import { campaignArena, communityLegend } from './kit';
import type { ArenaDef, DistrictDef } from '../types';

export const MARKET_HALL_ARENA_ID = 'campaignMushinMarketHall';

const W = 50;
const H = 26;

function paint(): Board {
  const b = new Board(W, H);
  // ---- the edges: tall buildings north, east and west, low lock-ups on the camera side
  b.fill(0, 0, W - 1, 1, 'B').fill(0, H - 2, W - 1, H - 1, 'L');
  b.fill(0, 2, 1, H - 3, 'B').fill(W - 2, 2, W - 1, H - 3, 'B');

  // ---- hall (x 2-16): stall blocks under canopies in a staggered grid, the back stall's shop row, the market gate
  b.fill(2, 2, 2, 2, 'S').fill(5, 2, 16, 2, 'S');
  b.blocks(3, 4, 16, 20, {
    ch: (i, j) => ((i + j) % 4 === 3 ? 'D' : 'M'),
    bw: 2,
    bh: 2,
    gx: 2,
    gy: 1,
    stagger: 1,
    seed: 41,
    drop: 0.1,
  });
  b.fill(11, 9, 13, 10, 'S'); // the back stall (its door is the tile west of it)
  b.fill(6, 22, 9, 23, 'L');

  // ---- provisions (x 17-30): kiosks and lock-ups along the cross aisles, stall pairs between
  b.fill(18, 3, 20, 4, 'L').fill(24, 3, 26, 4, 'L').fill(29, 3, 30, 4, 'K');
  b.fill(19, 7, 20, 8, 'M').fill(23, 7, 24, 8, 'M').fill(27, 7, 28, 8, 'M');
  b.fill(17, 11, 19, 11, 'K').fill(22, 11, 25, 12, 'L').fill(28, 11, 30, 11, 'K');
  b.fill(19, 15, 20, 16, 'M').fill(23, 15, 24, 16, 'M').fill(27, 15, 28, 16, 'M');
  b.fill(18, 19, 20, 20, 'L').fill(24, 19, 26, 20, 'L').fill(29, 19, 30, 20, 'D');

  // ---- the hall's back wall (its steel gate opens once the runners are cleared: the sector gate)
  b.fill(31, 2, 31, 23, 'C');
  b.fill(31, 12, 31, 14, '.');

  // ---- serviceLane: the top street (y 2-3) and the lorry bay at its east end; warehouses below it
  b.fill(32, 2, 46, 3, '=');
  b.fill(42, 4, 46, 6, '_'); // the lorry bay, kept clear for the lorry
  // ---- warehouses: the interiors between walls, goods stacks (timber, sacks) in rows, the far stall
  b.fill(32, 5, 40, 5, 'G').fill(32, 15, 46, 15, 'C');
  b.fill(41, 7, 41, 14, 'C').fill(41, 10, 41, 11, '.');
  b.fill(34, 7, 37, 8, 'T').fill(34, 12, 35, 13, 'T').fill(38, 11, 39, 13, 'T');
  b.fill(43, 8, 45, 9, 'G').fill(43, 12, 46, 13, 'G');
  b.fill(36, 15, 37, 15, '.').fill(44, 15, 45, 15, '.');
  // the loaders' yard south of the warehouses: workshops, a tyre heap, a kiosk
  b.fill(34, 18, 37, 19, 'W').fill(41, 18, 42, 19, 'H').fill(44, 21, 46, 22, 'W');
  b.fill(38, 22, 39, 22, 'K').fill(32, 21, 33, 23, 'L');

  // ---- crates a player can count on: supply crates in the hall and the yard, barrier crates at aisle ends
  b.set(14, 22, '$').set(27, 13, '$').set(46, 17, '$');
  b.set(16, 13, 'x').set(33, 10, 'x');
  return b;
}

const BOARD = paint();
export const MARKET_HALL_ROWS: readonly string[] = BOARD.rows();

export const MARKET_HALL_SUB_AREAS: DistrictDef[] = [
  { id: 'hall', name: 'Oloja covered market', role: 'street', rects: [[2, 2, 16, 23]] },
  { id: 'provisions', name: 'Provisions aisles', role: 'lane', rects: [[17, 2, 30, 23]] },
  {
    id: 'warehouses',
    name: 'Warehouse interiors',
    role: 'works',
    rects: [
      [31, 7, 47, 15],
      [31, 5, 41, 6],
    ],
  },
  {
    id: 'serviceLane',
    name: 'Service lane and lorry bay',
    role: 'service',
    rects: [
      [32, 2, 47, 4],
      [42, 5, 47, 6],
      [31, 16, 47, 23],
    ],
  },
];

export const CAMPAIGN_MUSHIN_MARKET_HALL: ArenaDef = campaignArena({
  id: MARKET_HALL_ARENA_ID,
  name: 'The Market Hall, the Warehouses and the Service Lane',
  rows: MARKET_HALL_ROWS,
  legend: communityLegend(MUSHIN_LEGEND),
  cover: BOARD.cover(MUSHIN_LEGEND),
  start: { x: 3, y: 22 },
  subAreas: MARKET_HALL_SUB_AREAS,
  // oil in the hall's west aisle and by the loaders' workshops, a pothole in the provisions aisles (off every patrol)
  traps: [
    [2, 15, '~'],
    [35, 21, '~'],
    [18, 21, 'o'],
  ],
  hazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 26, everySec: [14, 20], warnSec: 1.5 }],
  endgame: { rect: [17, 2, 30, 23] },
  info: {
    tagline:
      'Campaign area: the covered market hall, the provisions aisles, the warehouse interiors and the service lane with its lorry bay.',
    lighting: 'Hot, hazy mainland afternoon under tarpaulins and corrugated roofs',
    hazards: ['Traders drop goods into the aisles - new crates block your route.'],
  },
});
