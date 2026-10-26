/**
 * Ojuelegba Underbridge - the render-only cover map: what every permanent ('#') tile of
 * `src/sim/arenas/rumbleOjuelegba.ts` really is. Each letter is a cover kind; a cover GROUP is a connected
 * run of one letter (one building, one row of parked buses, one pier) and is drawn as one object by
 * `ojuelegbaCover.ts`. Pure data (no Three), checked against the sim layout by
 * tests/render/ojuelegba-cover.test.ts: every '#' has a letter and every letter sits on a '#'.
 */

export type CoverKind =
  | 'pier' // P: large hammerhead piers of the flyover (2 x 2 / 2 x 3)
  | 'danfo' // D: parked Danfos lying east-west, packed nose-to-tail along each row of the group
  | 'danfoNS' // N: parked Danfos lying north-south, packed nose-to-tail down each column of the group
  | 'shop' // H: shop buildings facing south onto the lane (fascia boards, shutters, doorway recesses)
  | 'building' // Q: plain occupied buildings (the far perimeter, the roadside blocks of the approach)
  | 'workshop' // O: the repair workshops of the service loop (roller shutters onto the court)
  | 'container' // C: a shipping-container shop
  | 'wall' // W: the service yard wall (plastered blockwork)
  | 'island' // I: raised kerb islands and the railed crossing refuge
  | 'kiosk' // K: painted kiosks and ticket booths
  | 'stall' // T: lock-up market stalls
  | 'lockup' // L: one-storey lock-up shops along the near (camera) edge, kept low
  | 'shed' // S: a small corner shed
  | 'tyres' // Y: tyre racks
  | 'busStop' // B: the bus stop shelter under the bridge
  | 'genHouse' // G: the generator house
  | 'skip'; // J: a steel waste skip

export const COVER_LETTERS: Readonly<Record<string, CoverKind>> = {
  P: 'pier',
  D: 'danfo',
  N: 'danfoNS',
  H: 'shop',
  Q: 'building',
  O: 'workshop',
  C: 'container',
  W: 'wall',
  I: 'island',
  K: 'kiosk',
  T: 'stall',
  L: 'lockup',
  S: 'shed',
  Y: 'tyres',
  B: 'busStop',
  G: 'genHouse',
  J: 'skip',
};

/** One letter per tile of the 45 x 33 board ('.' = not cover). Rows align with the sim layout. */
export const OJUELEGBA_COVER: readonly string[] = [
  'QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ', // 0
  'QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ', // 1
  'QQ..........................................Q', // 2
  'QQ..........................................Q', // 3
  'QQ....Y...OOOOOOOOOOO...OOOOOOOO.......GGG..Q', // 4
  'QQ....Y...OOOOOOOOOOO...OOOOOOOO.......GGG..Q', // 5
  'QQ..........................................Q', // 6
  'QQ..........YY.................YY..JJ.......Q', // 7
  'QQ..........................................Q', // 8
  'QQ.....WWWWWWWWWWWWWW...WWWWWWWWWWWWW.....WQQ', // 9
  'QQQ....WWWWWWWWWWWWWWW.WWWWWWWWWWWWWW.....WQQ', // 10
  'CCC.....QQQQQQ..............PP...............', // 11
  '........QQ..QQ..PP.....PP...PP.DDDDDD.....DD.', // 12
  '...II...........PP.....PP...PP.DDDDDD.....DD.', // 13
  '.............................................', // 14
  '.............................................', // 15
  '.............................................', // 16
  '.............................................', // 17
  '.............................................', // 18
  '................PP.....PP....................', // 19
  '......I..Q..QQ..PP.....PP..PP....NNNN........', // 20
  '.........QQQQQ.....BBB.....PP....NNNN.......K', // 21
  'S......HHHHHHHHHHHHHHHHHHHHHHHH.............K', // 22
  'S......HHH.HHHHHHHHHHHHHHHHHHHH..NNNN........', // 23
  'S.............HHHH.HHHHHHH.HHHH..NNNN........', // 24
  '.............................................', // 25
  '...............................NN............', // 26
  '..TT...TT..TT..................NN............', // 27
  '...............TTTTTTT.TTTTTT................', // 28
  '....KK...........................IIII........', // 29
  '.............K...............................', // 30
  'LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL.....', // 31
  'LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL.....', // 32
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
  pier: 3,
  danfo: 2,
  danfoNS: 2,
  shop: 3,
  building: 3,
  workshop: 3,
  container: 2,
  wall: 2,
  island: 1,
  kiosk: 2,
  stall: 1,
  lockup: 1,
  shed: 2,
  tyres: 1,
  busStop: 2,
  genHouse: 2,
  skip: 1,
};
