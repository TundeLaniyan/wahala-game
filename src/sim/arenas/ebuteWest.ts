import type { DistrictDef } from './types';
import type { Board } from './community/painter';

/**
 * EBUTE METTA WEST (decisions EW1-EW9, docs/EBUTE_METTA_WEST.md): the City Rumble arena Ebute-Metta grew westward.
 * The original board (Ebute Metta East in character: terminus, station, rail corridor, Oyingbo, the mainland houses,
 * the rail yard and the Oko-Baba foreshore) is kept tile for tile and shifted EAST by `EBUTE_WEST_DX` columns; the
 * new territory fills x 0 .. EBUTE_WEST_DX + 1 (0-21) (its east edge is the old west border, now an interior facade with
 * gateways). Everything that was authored in the OLD coordinates (campaign nodes, markers, anchors) goes through
 * `ebuteX` so it can never drift from the board.
 *
 * Three new districts and one road district sit in the west, in new coordinates:
 *   W1 Abule Ijesha Lanes   (x 2-21, y 2-12)   older plastered houses and walled compounds, kiosks and a bukka row
 *   W2 Apapa Road           (x 0-21, y 13-22)  Murtala Muhammed Way carries on west as Apapa Road: truck and
 *                                              container bays on both shoulders, the four-lane road (hazard lanes)
 *   W3 Ilogbo Quarter       (x 2-21, y 23-31)  dense old streets off Apapa Road: houses, compounds, spares workshops,
 *                                              a disused rail spur with a signal post
 *   W4 Otumara Waterfront   (x 2-21, y 32-36)  canoe slips, timber and boat-yard lock-ups on the lagoon edge
 * Real names, compressed and partly fictional links: see the document.
 */

/** Columns added on the west. Every old (pre-expansion) tile x is now `x + EBUTE_WEST_DX`. */
export const EBUTE_WEST_DX = 20;
/** Width of the original board (before the expansion). */
export const EBUTE_OLD_W = 55;
/** An x of the ORIGINAL Ebute-Metta board on the expanded board. */
export const ebuteX = (x: number): number => x + EBUTE_WEST_DX;

/**
 * The west territory, columns x 0..EBUTE_WEST_DX + 1 = 0..21, every row (the border walls, rows 0-1 and 37-38 and
 * the first two columns, are drawn here too). Object letters are the Ebute legend: P older plastered house, G walled
 * compound, V spares / mechanic workshop, F parked trailer or tanker, E shop under a rooftop hoarding, O canoe on its
 * slip, Z signal post (disused spur), plus the shared B S L X M K T Y U.
 */
const WEST_ROWS: readonly string[] = [
  /* 0 */ 'BBBBBBBBBBBBBBBBBBBBBB',
  /* 1 */ 'BBBBBBBBBBBBBBBBBBBBBB',
  // Abule Ijesha Lanes
  /* 2 */ 'BBPPP...GGGG..LLLL..LL',
  /* 3 */ 'BBPPP...GGGG..LLLL..LL',
  /* 4 */ 'BBPPP...GGGG..SSSS..SS',
  /* 5 */ 'BB....................',
  /* 6 */ 'BB....................',
  /* 7 */ 'BBVVVV...PPP..GGGG..GG',
  /* 8 */ 'BBVVVV...PPP..GGGG..GG',
  /* 9 */ 'BBPPP...PPP...GGGG..GG',
  /* 10 */ 'BBPPP...PPP...EEEE..GG',
  /* 11 */ 'BB..KK............MM..',
  /* 12 */ 'BB....................',
  // Apapa Road, north shoulder: trailers parked nose to tail with gaps for the crossings
  /* 13 */ 'BB....................',
  /* 14 */ 'BBFFFFFF..FFFFFF..LLLL',
  /* 15 */ 'BBFFFFFF..FFFFFF..LLLL',
  // Apapa Road itself (the old Murtala Muhammed Way lanes carry on)
  /* 16 */ '======================',
  /* 17 */ '======================',
  /* 18 */ '======================',
  /* 19 */ '======================',
  // south shoulder
  /* 20 */ 'BBFFFF..FFFFFF..SSSSSS',
  /* 21 */ 'BBFFFF..FFFFFF..SSSSSS',
  /* 22 */ 'BB....................',
  // Ilogbo Quarter
  /* 23 */ 'BBPPP...PPPP..PPP...XX',
  /* 24 */ 'BBPPP...PPPP..PPP...XX',
  /* 25 */ 'BBPPP...XXXX..PPP...XX',
  /* 26 */ 'BB....................',
  /* 27 */ 'BB....................',
  /* 28 */ 'BBVVV...GGG...PPP.....',
  /* 29 */ 'BBVVV...GGG...PPP.....',
  /* 30 */ 'BBPPP...GGG...PPPPMM..',
  /* 31 */ 'BB.........Z..........',
  /* 32 */ 'BB....................',
  // Otumara Waterfront
  /* 33 */ 'BBLLL...OOOO...YYY..LL',
  /* 34 */ 'BBLLL...OOOO...YYY..LL',
  /* 35 */ 'BBLLL...OOOO..........',
  /* 36 */ 'BB....................',
  /* 37 */ 'LLLLLLLLLLLLLLLLLLLLLL',
  /* 38 */ 'LLLLLLLLLLLLLLLLLLLLLL',
];

/** Paints the west territory (x 0..21, all rows) onto a board that is `EBUTE_OLD_W + EBUTE_WEST_DX` wide. */
export function paintEbuteWest(b: Board): void {
  b.stamp(0, 0, WEST_ROWS);
}

/** Supply crates of the west (new coordinates). They balance the old board's supplies for the Team Rumble split by x. */
export const SUPPLY_NEW: [number, number][] = [
  [4, 6],
  [12, 11],
  [17, 6],
  [9, 22],
  [16, 22],
  [9, 26],
  [4, 31],
  [16, 31],
  [10, 36],
];
export const BARRIERS_NEW: [number, number][] = [
  [13, 12],
  [6, 32],
];
export const TRAPS_NEW: [number, number][] = [
  [3, 5],
  [15, 12],
  [9, 21],
  [4, 27],
  [15, 27],
  [12, 34],
];

/** The mild wash on the Otumara lagoon edge: marked tiles on the south walk slide you one tile north (never lethal). */
export const WASH_NEW: { tiles: [number, number][]; dir: 'up' }[] = [
  {
    tiles: [
      [5, 36],
      [6, 36],
      [7, 36],
    ],
    dir: 'up',
  },
  {
    tiles: [
      [12, 36],
      [13, 36],
      [14, 36],
    ],
    dir: 'up',
  },
];

/** District rectangles of the west (new coordinates; disjoint from the six original districts). */
export const WEST_DISTRICTS: DistrictDef[] = [
  { id: 'abuleIjesha', name: 'Abule Ijesha Lanes', role: 'lane', rects: [[2, 2, 21, 12]] },
  { id: 'apapaRoad', name: 'Apapa Road', role: 'street', rects: [[0, 13, 21, 22]] },
  { id: 'ilogbo', name: 'Ilogbo Quarter', role: 'lane', rects: [[2, 23, 21, 31]] },
  { id: 'otumara', name: 'Otumara Waterfront', role: 'works', rects: [[2, 32, 21, 36]] },
];
