/**
 * The living environment of Ojuelegba Underbridge (City Rumble), as data relative to the board size.
 *
 * Written from the board bounds and sides only, because the stage is being rebuilt into five districts
 * (Western Approach, Central Underbridge / Pier Court, Eastern Danfo Park, Shopfront Lane, Rear Service
 * Loop) whose exact layout this file does not read. The lead re-aligns the numbers marked `ALIGN` after
 * the merge; the structure (what lives where, relative to the board) is the part that is meant to stay.
 *
 * Everything stands off the board and low on the camera (south) side:
 *  - the flyover deck (6.6 m up) north of the board carries Danfos and buses both ways;
 *  - okadas and kekes use the Western Approach road beyond the west edge and turn along the outer lane;
 *  - cars and kekes pass on a ring road beyond the east side;
 *  - a bus-stop crowd waits under the bridge, traders work Shopfront Lane's outer (north-east) edge,
 *    touts call passengers at the Danfo Park (east), a crew works the rear service loop (east, rear);
 *  - practical lights: fluorescent tubes at the stop, warm bulbs at the stalls, a sodium worklight at the
 *    service loop and a lantern at the park.
 */
import type { BoardSize, StageEnvironment } from './types';

/** Deck surface above street level, metres (the flyover art puts its deck top at 6.6). ALIGN */
const DECK_ELEVATION = 6.6;

export function ojuelegbaEnv(board: BoardSize): StageEnvironment {
  const { cols, rows } = board;
  const cx = cols / 2;
  // Western Approach lanes (rows of the two approach roads) ALIGN
  const approachA = Math.round(rows * 0.26) + 0.5;
  const approachB = Math.round(rows * 0.72) + 0.5;
  const east = cols + 7.6; // the outer ring road east of the Danfo Park and the service loop ALIGN
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
        kinds: ['danfo', 'bus', 'danfo'],
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
      // Western Approach: okadas and kekes come in on the road, turn along the outer lane and leave
      {
        id: 'westApproachIn',
        kinds: ['okada', 'keke', 'okada'],
        path: [
          [-34, approachA],
          [-3.6, approachA],
          [-3.6, -14],
        ],
        count: 3,
        speed: 4.2,
        spacing: 4,
        priority: 2,
      },
      {
        id: 'westApproachOut',
        kinds: ['keke', 'okada', 'okada'],
        path: [
          [-3.6, rows + 9],
          [-3.6, approachB],
          [-34, approachB],
        ],
        count: 3,
        speed: 4.0,
        spacing: 4,
        priority: 2,
      },
      // the outer ring road east of the Danfo Park: cars and kekes passing north and south
      {
        id: 'eastRing',
        kinds: ['car', 'keke', 'car', 'keke'],
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
      // the bus stop under the bridge, north of the board
      {
        id: 'busStop',
        rect: { x0: cx - 4.2, y0: -6.8, x1: cx + 4.2, y1: -4.0 },
        count: 10,
        mood: 'waiting',
        priority: 3,
      },
      // traders at Shopfront Lane's outer edge (north-east) ALIGN
      {
        id: 'shopfrontTraders',
        rect: { x0: cols * 0.68, y0: -4.4, x1: cols * 0.92, y1: -2.4 },
        count: 6,
        mood: 'trading',
        priority: 2,
        reacts: { blast: { reaction: 'flinch', radius: 10, minRange: 3, chance: 0.6 } },
      },
      // the crew on the rear service loop (east, towards the rear) ALIGN
      {
        id: 'rearLoopCrew',
        rect: { x0: cols + 2.2, y0: rows * 0.58, x1: cols + 5.4, y1: rows * 0.78 },
        count: 5,
        mood: 'working',
        hiVis: true,
        priority: 2,
        reacts: { elimination: { reaction: 'look', radius: 60, chance: 0.5 } },
      },
      // motor-park touts calling passengers at the Eastern Danfo Park ALIGN
      {
        id: 'danfoParkTouts',
        rect: { x0: cols + 2.2, y0: rows * 0.28, x1: cols + 5.4, y1: rows * 0.46 },
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
      {
        at: [cx - 2.4, -5.2],
        height: 2.4,
        color: 0xe0f0ff,
        size: 0.9,
        strength: 0.4,
        flicker: 'fluorescent',
        pool: 2.4,
      },
      {
        at: [cx + 2.4, -5.2],
        height: 2.4,
        color: 0xe0f0ff,
        size: 0.9,
        strength: 0.4,
        flicker: 'fluorescent',
        pool: 2.4,
      },
      {
        at: [cols * 0.74, -2.8],
        height: 2.2,
        color: 0xffc070,
        size: 0.6,
        strength: 0.5,
        pool: 1.5,
        minQuality: 'medium',
      },
      {
        at: [cols * 0.86, -2.8],
        height: 2.2,
        color: 0xffc070,
        size: 0.6,
        strength: 0.5,
        pool: 1.5,
        minQuality: 'medium',
      },
      {
        at: [cols + 3.8, rows * 0.62],
        height: 3.2,
        color: 0xffa040,
        size: 1.1,
        strength: 0.55,
        flicker: 'sodium',
        pool: 2.6,
      },
      {
        at: [cols + 3.8, rows * 0.36],
        height: 1.7,
        color: 0xffb060,
        size: 0.5,
        strength: 0.5,
        flicker: 'sodium',
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
  };
}

export const OJUELEGBA_ENV = ojuelegbaEnv;
