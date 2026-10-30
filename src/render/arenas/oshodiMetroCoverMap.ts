/**
 * Oshodi Transport Metropolis - the render-only cover map: what every permanent ('#') tile of
 * `src/sim/arenas/rumbleOshodiMetro.ts` really is. Each letter is a cover kind; a cover GROUP is a connected
 * run of one letter (one terminal wing, one row of parked buses, one skywalk pier) and is drawn as one object by
 * `oshodiMetroCover.ts`. Pure data (no Three), checked against the sim layout by
 * tests/render/oshodi-metro-cover.test.ts: every '#' has a letter and every letter sits on a '#'.
 *
 * Twenty-three families, none of them a generic crate or pillar: the layered transport nexus is read from its
 * terminal, its bus bays, its skywalk piers and stair tower, its rail portals and station, its trading
 * frontage and its works yard.
 */

export type OshodiCoverKind =
  | 'building' // Q: plain occupied buildings (the far perimeter, the edge of the trading streets)
  | 'lockup' // E: one-storey lock-ups along the near (camera) edge, kept low
  | 'shop' // H: trading-street shopfronts facing south (fascia boards, shutters, awnings)
  | 'kiosk' // K: painted ticket and phone kiosks
  | 'stall' // M: lock-up market stalls
  | 'container' // O: shipping-container shops
  | 'terminal' // T: the interchange terminal wings (glass band, deep canopy, big sign)
  | 'skyPier' // P: skywalk piers (round columns with a stair stub and a walkway landing)
  | 'stairTower' // U: the stair tower up to the walkway
  | 'portal' // R: the rail portals (track mouths under the Skywalk and Cappa bands)
  | 'wall' // W: parapet wall
  | 'bus' // B: parked buses in the terminal bays
  | 'shelter' // S: bay shelters
  | 'column' // C: huge canopy columns of the plaza
  | 'island' // I: kerb islands with the big direction sign
  | 'gantry' // G: signal gantry feet and cabinets of the junction
  | 'station' // A: the commuter-rail station concourse
  | 'platformPost' // L: platform canopy posts
  | 'cabin' // N: the signal cabin and relay cabinets
  | 'workshop' // Y: the Cappa workshops
  | 'skip' // J: scrap skips
  | 'pavilion' // V: the Cappa Ground pavilion
  | 'genHouse'; // X: the works generator house

export const OSHODI_COVER_LETTERS: Readonly<Record<string, OshodiCoverKind>> = {
  Q: 'building',
  E: 'lockup',
  H: 'shop',
  K: 'kiosk',
  M: 'stall',
  O: 'container',
  T: 'terminal',
  P: 'skyPier',
  U: 'stairTower',
  R: 'portal',
  W: 'wall',
  B: 'bus',
  S: 'shelter',
  C: 'column',
  I: 'island',
  G: 'gantry',
  A: 'station',
  L: 'platformPost',
  N: 'cabin',
  Y: 'workshop',
  J: 'skip',
  V: 'pavilion',
  X: 'genHouse',
};

/** One letter per tile of the 45 x 33 board ('.' = not cover). Rows align with the sim layout. */
export const OSHODI_COVER: readonly string[] = [
  'QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ', // 0
  'QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ', // 1
  'QQ.........................................QQ', // 2
  'QQ............MM....PP......PP.K........PP.QQ', // 3
  'QQHHH.HHH...........PP......PP..........PP.QQ', // 4
  'QQHHH.HHH..................................QQ', // 5
  'QQHHH.HHH..TTTTTT......UUU.................QQ', // 6
  'QQ.........TTTTTT..K...UUU...HHHHHH.RR..WWWQQ', // 7
  'QQK.M..MM..TTTTTT......UUU...HHHHHH.RR.....QQ', // 8
  'QQ..................................RR.......', // 9
  'QQ........TTTT..TTTT......WWW.............AAA', // 10
  'QQOOO.OOO.TTTT..TTTT....II....GG......LK..AAA', // 11
  'QQ.........S......S.....II....GG..........AAA', // 12
  'QQ........BBBB..BBBB.CS......................', // 13
  '.............................................', // 14
  '.............................................', // 15
  '.............................................', // 16
  '.............................................', // 17
  '.............................................', // 18
  '.........................................AAAA', // 19
  'QQHHH.HHH.BB.C...C......II.....GGNN...L..AAAA', // 20
  'QQHHH.HHH...............II.S...GGNN......AAAA', // 21
  'QQ........BB...KK..TTT.....S.............AAAA', // 22
  'QQ..................................RR...VVQQ', // 23
  'QQMM.MM.K.YYYY.YYYY..OO.......MM....RR...VVQQ', // 24
  'QQ......K.YYYY.YYYY..OO.......MM....RR...VVQQ', // 25
  'QQ......................O..................QQ', // 26
  'QQHHH.HHH...............O..................QQ', // 27
  'QQHHH.HHH..JJ...XXX........................QQ', // 28
  'QQHHH.HHH..JJ..............................QQ', // 29
  'QQ.........................................QQ', // 30
  'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', // 31
  'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', // 32
];

export interface OshodiCoverGroup {
  kind: OshodiCoverKind;
  /** Tiles of the group (row-major). */
  tiles: [number, number][];
  /** Inclusive bounding box. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Connected runs (4-neighbour) of one cover letter, in row-major order of their first tile. */
export function oshodiCoverGroups(map: readonly string[] = OSHODI_COVER): OshodiCoverGroup[] {
  const H = map.length;
  const W = map[0]!.length;
  const seen = new Uint8Array(W * H);
  const out: OshodiCoverGroup[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = map[y]![x]!;
      const kind = OSHODI_COVER_LETTERS[c];
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

/** How many tiles NORTH of itself each kind can hide from the follow camera (for the occlusion fade). */
export const OSHODI_COVER_REACH: Readonly<Record<OshodiCoverKind, number>> = {
  building: 3,
  lockup: 1,
  shop: 3,
  kiosk: 2,
  stall: 1,
  container: 2,
  terminal: 3,
  skyPier: 3,
  stairTower: 3,
  portal: 3,
  wall: 2,
  bus: 2,
  shelter: 2,
  column: 3,
  island: 1,
  gantry: 3,
  station: 3,
  platformPost: 2,
  cabin: 2,
  workshop: 3,
  skip: 1,
  pavilion: 2,
  genHouse: 2,
};
