/**
 * The living environment of Ojuelegba Underbridge (City Rumble), as data relative to the board size.
 *
 * Aligned (workstream D) to the five-district board of `src/sim/arenas/rumbleOjuelegba.ts`: the flyover
 * runs north-south over tile columns 15-29 and on north of the board; the through road crosses the board
 * east-west on rows 15-18 (its west and east mouths); the Shopfront Lane reaches the west edge on rows
 * 22-30, the Danfo pocket the east edge on rows 19-30, the Rear Service Loop both sides on rows 2-8.
 *
 * Everything stands off the board and low on the camera (south) side:
 *  - the flyover deck (6.6 m up) north of the board carries Danfos and buses both ways, with the odd truck
 *    (ambient and non-colliding: the only gameplay traffic is the stage's scheduled sweeps);
 *  - Danfos and buses dominate the Western Approach road beyond the west edge, with a few taxis and a lone
 *    keke, turning along the outer lane; cars, Danfos and a bus pass on an east ring road. NO okadas: they
 *    are banned from commercial use in Surulere / Lagos Mainland since 2022 (research, RE-E8);
 *  - a bus-stop crowd and food sellers wait under the bridge edge, traders work Shopfront Lane's outer
 *    (north-east) edge, touts call passengers at the Danfo Park (east), mechanics work the rear service loop;
 *  - practical lights: bare LED tubes at the stop and phone-shop LEDs at the stalls, sodium at the service
 *    loop and the park, and soft bounce-light pools under the deck so the playfield stays readable by day.
 *    Palette hints for the art: soot concrete #5E5A55, Danfo yellow #F2C200, LED white #E8F4FF, sodium #FF9F3A.
 */
import type { BoardSize, StageEnvironment } from './types';

/** Deck surface above street level, metres (rumbleOjuelegbaArt.ts puts its deck top at 6.3 above the board = 6.6). */
const DECK_ELEVATION = 6.6;
const LED_WHITE = 0xe8f4ff;
const SODIUM = 0xff9f3a;

export function ojuelegbaEnv(board: BoardSize): StageEnvironment {
  const { cols, rows } = board;
  const cx = cols / 2;
  // the through road's lanes beyond the west edge (right-hand traffic: eastbound south, westbound north)
  const roadIn = rows * 0.5 + 1.0; // row 17
  const roadOut = rows * 0.5 - 1.0; // row 15
  const east = cols + 7.6; // the outer ring road east of the Danfo pocket and the service loop
  return {
    id: 'rumbleOjuelegba',
    seed: 0x0102e1e6,
    traffic: [
      // the flyover deck, both ways; vehicles appear and leave in the fog / behind the deck's south fascia
      {
        id: 'deckSouthbound',
        kinds: ['bus', 'danfo', 'danfo', 'bus'],
        path: [
          [cx - 2.4, -54],
          [cx - 2.4, -2.8],
        ],
        count: 4,
        speed: 3.6,
        spacing: 5,
        elevation: DECK_ELEVATION,
        priority: 3,
        fade: 2.5,
      },
      {
        id: 'deckNorthbound',
        kinds: ['danfo', 'bus', 'truck', 'danfo'],
        path: [
          [cx + 2.4, -2.8],
          [cx + 2.4, -54],
        ],
        count: 4,
        speed: 3.2,
        spacing: 5,
        elevation: DECK_ELEVATION,
        priority: 3,
        fade: 2.5,
      },
      // Western Approach: Danfos and buses, a few taxis, one keke on the through road beyond the west edge;
      // they shrink in and out at the road mouth (the board's own traffic is the stage's sweeps)
      {
        id: 'westApproachIn',
        kinds: ['danfo', 'bus', 'car'],
        path: [
          [-40, roadIn],
          [-1.6, roadIn],
        ],
        count: 3,
        speed: 3.8,
        spacing: 4,
        priority: 2,
      },
      {
        id: 'westApproachOut',
        kinds: ['danfo', 'car', 'keke'],
        path: [
          [-1.6, roadOut],
          [-40, roadOut],
        ],
        count: 3,
        speed: 3.6,
        spacing: 4,
        priority: 2,
      },
      // the outer ring road east of the Danfo Park: Danfos, a bus and taxis passing north and south
      {
        id: 'eastRing',
        kinds: ['danfo', 'car', 'bus', 'danfo'],
        path: [
          [east, rows + 9],
          [east, -14],
        ],
        count: 4,
        speed: 3.4,
        spacing: 5,
        priority: 1,
        minQuality: 'medium',
      },
    ],
    crowds: [
      // bus-stop commuters under the bridge, north of the board
      {
        id: 'busStop',
        rect: { x0: cx - 4.2, y0: -6.8, x1: cx + 4.2, y1: -4.0 },
        count: 10,
        mood: 'waiting',
        priority: 3,
      },
      // food sellers at the under-bridge edge, beside the stop
      {
        id: 'underBridgeFoodSellers',
        rect: { x0: cx + 4.6, y0: -6.4, x1: cx + 7.4, y1: -4.2 },
        count: 4,
        mood: 'trading',
        priority: 2,
      },
      // traders beyond the Shopfront Lane's west barrier (rows 22-30), in front of the side-street shops
      {
        id: 'shopfrontTraders',
        rect: { x0: -1.9, y0: rows * 0.68, x1: -0.9, y1: rows * 0.92 },
        count: 6,
        mood: 'trading',
        priority: 2,
        reacts: { blast: { reaction: 'flinch', radius: 10, minRange: 3, chance: 0.6 } },
      },
      // roadside mechanics beyond the rear service loop's east side (rows 2-8)
      {
        id: 'rearLoopMechanics',
        rect: { x0: cols + 2.2, y0: rows * 0.08, x1: cols + 5.4, y1: rows * 0.26 },
        count: 5,
        mood: 'working',
        priority: 2,
        reacts: { elimination: { reaction: 'look', radius: 60, chance: 0.5 } },
      },
      // motor-park touts calling passengers at the Eastern Danfo pocket's edge (fictional: no union names)
      {
        id: 'danfoParkTouts',
        rect: { x0: cols + 2.2, y0: rows * 0.6, x1: cols + 5.4, y1: rows * 0.78 },
        count: 6,
        mood: 'trading',
        priority: 2,
        reacts: { blast: { reaction: 'scatter', radius: 9, minRange: 3, chance: 0.65 } },
      },
    ],
    reactions: {
      // a big blast near the edge: crouch; someone falls: a cheer goes up; a lethal stage hazard: heads turn
      blast: { reaction: 'duck', radius: 12, minRange: 3, chance: 0.5 },
      elimination: { reaction: 'cheer', radius: 60, chance: 0.4 },
      stage: { reaction: 'look', radius: 18, chance: 0.5 },
    },
    lights: [
      // bare LED tubes at the bus stop
      {
        at: [cx - 2.4, -5.2],
        height: 2.4,
        color: LED_WHITE,
        size: 0.9,
        strength: 0.4,
        flicker: 'fluorescent',
        pool: 2.4,
      },
      {
        at: [cx + 2.4, -5.2],
        height: 2.4,
        color: LED_WHITE,
        size: 0.9,
        strength: 0.4,
        flicker: 'fluorescent',
        pool: 2.4,
      },
      // phone-shop LEDs beyond the Shopfront Lane's west end
      {
        at: [-2.2, rows * 0.72],
        height: 2.2,
        color: LED_WHITE,
        size: 0.6,
        strength: 0.45,
        pool: 1.5,
        minQuality: 'medium',
      },
      {
        at: [-2.2, rows * 0.88],
        height: 2.2,
        color: LED_WHITE,
        size: 0.6,
        strength: 0.45,
        pool: 1.5,
        minQuality: 'medium',
      },
      // sodium worklight at the service loop, lantern at the park
      {
        at: [cols + 3.8, rows * 0.16],
        height: 3.2,
        color: SODIUM,
        size: 1.1,
        strength: 0.55,
        flicker: 'sodium',
        pool: 2.6,
      },
      {
        at: [cols + 3.8, rows * 0.7],
        height: 1.7,
        color: SODIUM,
        size: 0.5,
        strength: 0.5,
        flicker: 'sodium',
        minQuality: 'medium',
      },
      // light reflected off the sunlit street into the shade under the deck (pools only: no visible bulb)
      {
        at: [cx - 4.5, -5.6],
        height: 0.3,
        color: 0xffe2b0,
        size: 0.05,
        strength: 0.5,
        pool: 4.6,
        minQuality: 'medium',
      },
      {
        at: [cx + 4.5, -5.6],
        height: 0.3,
        color: 0xffe2b0,
        size: 0.05,
        strength: 0.5,
        pool: 4.6,
        minQuality: 'medium',
      },
    ],
    audio: {
      beds: ['buspark_loop', 'crowd_loop'],
      reactions: [
        { on: 'blast', sound: 'crowd_ooh' },
        { on: 'elimination', sound: 'crowd_gasp' },
        { on: 'stage', sound: 'crowd_throw_whistle' },
      ],
    },
    // the deck runs north-south over the pier court and on north of the board; over the board only its outer
    // edges, crossheads and pier shafts are drawn, cut away in the lower part of the frame and round the
    // fighter (render/arenas/ojuelegbaDeck.ts)
    occlusion: { cutaway: [{ x0: cx - 7.5, y0: -20, x1: cx + 7.5, y1: rows * 0.68 }] },
    safety: {
      // the pavement beside the departure strip (tile columns 43-44, rows 19-30): never on the bus's lane
      safePockets: [
        {
          style: 'danfo',
          rect: { x0: cols - 2, y0: rows * 0.58, x1: cols, y1: rows * 0.94 },
          note: 'pavement beside the departure strip',
        },
      ],
      // the sim keeps these apart (one lethal event at a time, nothing once the city closes)
      exclusions: [{ style: 'danfo', notWith: ['traffic', 'goods', 'debris', 'crush'] }],
    },
  };
}

export const OJUELEGBA_ENV = ojuelegbaEnv;
