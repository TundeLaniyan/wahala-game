/**
 * Ojuelegba Underbridge - the render-only cover map: what every permanent ('#') tile of
 * `src/sim/arenas/rumbleOjuelegba.ts` really is. Each letter is a cover kind; a cover GROUP is a connected
 * run of one letter (one building, one row of parked buses, one pier) and is drawn as one object by
 * `ojuelegbaCover.ts`. Pure data (no Three), checked against the sim layout by
 * tests/render/ojuelegba-cover.test.ts: every '#' has a letter and every letter sits on a '#'.
 */

export type CoverKind =
  | 'pier' // P: twin 2 x 2 hammerhead pier columns of the flyover (bents)
  | 'danfo' // D: a parked Danfo, two tiles long, nose to the aisle; a group = buses side by side
  | 'shop' // H: shop buildings facing south onto the lane (fascia boards, shutters, doorway recesses)
  | 'container' // C: a shipping-container shop on a kerb
  | 'wall' // W: compound / yard wall (plastered blockwork)
  | 'fence' // F: the Danfo park fence (block plinth, zinc panels, posts)
  | 'kiosk' // K: painted kiosks and ticket booths
  | 'stall' // T: lock-up market stalls
  | 'shed' // S: mechanic's / vulcaniser's shed
  | 'lorry' // R: a broken-down container lorry on the hard shoulder
  | 'median' // M: jersey-barrier median
  | 'busStop' // B: the bus stop shelter under the bridge
  | 'genHouse' // G: the generator house
  | 'skip' // J: steel waste skips
  | 'dock'; // L: the loading dock

export const COVER_LETTERS: Readonly<Record<string, CoverKind>> = {
  P: 'pier',
  D: 'danfo',
  H: 'shop',
  C: 'container',
  W: 'wall',
  F: 'fence',
  K: 'kiosk',
  T: 'stall',
  S: 'shed',
  R: 'lorry',
  M: 'median',
  B: 'busStop',
  G: 'genHouse',
  J: 'skip',
  L: 'dock',
};

/** One letter per tile of the 45 x 33 board ('.' = not cover). Rows align with the sim layout. */
export const OJUELEGBA_COVER: readonly string[] = [
  '................................F............', // 0
  '.................PP.......PP....F..DD....DD..', // 1
  '.WWWW...WWWW..TT.PP.......PP.KK.F..DD....DD..', // 2
  '...........W.............................DD..', // 3
  '...........W....................F............', // 4
  '.CCC..CCC.....TT.PP.......PP....F............', // 5
  '.................PP.......PP.KK.F..DD....DD..', // 6
  '................................F..DD....DD..', // 7
  '...................................DD........', // 8
  '...MMMMM...MMMMMM.................K..........', // 9
  '..................................K..........', // 10
  '...................................DD....DD..', // 11
  '................................F..DD....DD..', // 12
  '.RRRR............PP..BBB..PP....F........DD..', // 13
  '.......SSS.......PP.......PP..K....DD........', // 14
  '.......SSS...SS...............K.F..DD........', // 15
  '.............SS.................F............', // 16
  '.CCC............................F............', // 17
  '......K...WWW....PP.......PP.KK..............', // 18
  '.................PP.......PP....F............', // 19
  '................................FFFF.FFFF.FFF', // 20
  '..............................JJ.............', // 21
  'HHHHH.HHHHHH..HHHHH..HHHHW...................', // 22
  'HH.HH..HH.HH..HH.HH..HHHHW...................', // 23
  '.............................GGG...JJ...L....', // 24
  '.........................W...GGG........L....', // 25
  '........................................L....', // 26
  '........................................L....', // 27
  '....T....TT....T....TT...W.........JJ...L....', // 28
  '.........................W...................', // 29
  '..KK........KK...............................', // 30
  '..KK........KK....KK.........................', // 31
  '..................KK...................JJ....', // 32
];

export interface CoverGroup {
  kind: CoverKind;
  /** Tiles of the group (row-major). */
  tiles: [number, number][];
  /** Inclusive bounding box. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Connected runs (4-neighbour) of one cover letter, in row-major order of their first tile. */
export function coverGroups(map: readonly string[] = OJUELEGBA_COVER): CoverGroup[] {
  const H = map.length;
  const W = map[0]!.length;
  const seen = new Uint8Array(W * H);
  const out: CoverGroup[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = map[y]![x]!;
      const kind = COVER_LETTERS[c];
      if (!kind || seen[y * W + x]) continue;
      const tiles: [number, number][] = [];
      const q: [number, number][] = [[x, y]];
      seen[y * W + x] = 1;
      while (q.length > 0) {
        const [cx, cy] = q.pop()!;
        tiles.push([cx, cy]);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || map[ny]![nx] !== c) continue;
          seen[ny * W + nx] = 1;
          q.push([nx, ny]);
        }
      }
      tiles.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const xs = tiles.map((t) => t[0]);
      const ys = tiles.map((t) => t[1]);
      out.push({
        kind,
        tiles,
        x0: Math.min(...xs),
        y0: Math.min(...ys),
        x1: Math.max(...xs),
        y1: Math.max(...ys),
      });
    }
  return out;
}

/** Height class of each kind (world units, roughly): how far north it can hide things (tiles). */
export const COVER_REACH: Readonly<Record<CoverKind, number>> = {
  pier: 2,
  danfo: 2,
  shop: 3,
  container: 2,
  wall: 1,
  fence: 1,
  kiosk: 1,
  stall: 1,
  shed: 2,
  lorry: 2,
  median: 1,
  busStop: 2,
  genHouse: 2,
  skip: 1,
  dock: 1,
};
