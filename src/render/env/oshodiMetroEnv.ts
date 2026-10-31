/**
 * The living environment of Oshodi Transport Metropolis (City Rumble), as data relative to the board size.
 *
 * Aligned to the six-district board of `src/sim/arenas/rumbleOshodi.ts` (45 x 33): the main road crosses
 * the board east-west on rows 15-18 and leaves it through the west and east mouths; the elevated expressway
 * runs east-west north of the board; the terminal canopy and its queues stand north of the plaza; the station
 * forecourt and the Cappa Ground's touchline are on the east side; the trading streets' pavement is west.
 *
 * AMBIENT TRAFFIC IS NOT COMBAT TRAFFIC: everything here is presentation only, muted in grade, never wears a
 * warning light, never shares the sweeps' vehicles, and never enters the board. The only vehicles that can hurt
 * anyone are the stage's own sweeps (traffic, bus departures, the railcar) and the summoned attack vehicles.
 *
 * Day and night share every route and zone (the combat geometry never changes); the night variant only adds
 * and strengthens practical lights so the dark scene stays readable on a phone.
 */
import type { TimeOfDay } from '../timeOfDay';
import type { BoardSize, LightPocket, StageEnvironment } from './types';

/** Elevated expressway deck surface above street level, metres (the art puts its deck top at the same level). */
export const OSHODI_DECK_ELEVATION = 7.4;
const LED_WHITE = 0xe8f4ff;
const SODIUM = 0xff9f3a;
const RAIL_BLUE = 0x9ec8ff;

export function oshodiMetroEnv(board: BoardSize, tod: TimeOfDay = 'day'): StageEnvironment {
  const { cols, rows } = board;
  const night = tod === 'night';
  const boost = night ? 1.5 : 1;
  const cx = cols / 2;
  // the main road's lanes beyond the edges (right-hand traffic: eastbound rows 17-18, westbound rows 15-16)
  const eastbound = rows * 0.5 + 2.0; // row 18 centre
  const westbound = rows * 0.5 - 1.0; // row 15 centre
  const lights: LightPocket[] = [
    // the terminal canopy north of the plaza: tubes along the roof edge
    {
      at: [cx - 12, -4.6],
      height: 4.4,
      color: LED_WHITE,
      size: 1.0,
      strength: 0.45 * boost,
      flicker: 'fluorescent',
      pool: 2.8,
    },
    {
      at: [cx - 6, -4.6],
      height: 4.4,
      color: LED_WHITE,
      size: 1.0,
      strength: 0.45 * boost,
      flicker: 'fluorescent',
      pool: 2.8,
    },
    // expressway lamp standards
    {
      at: [cx - 14, -12],
      height: 8.6,
      color: SODIUM,
      size: 1.3,
      strength: 0.55 * boost,
      flicker: 'sodium',
      pool: 3.2,
      minQuality: 'medium',
    },
    {
      at: [cx + 8, -12],
      height: 8.6,
      color: SODIUM,
      size: 1.3,
      strength: 0.55 * boost,
      flicker: 'sodium',
      pool: 3.2,
      minQuality: 'medium',
    },
    // the station forecourt and platform lamps (cool white), the signal at the crossing
    {
      at: [cols + 2.6, 11.5],
      height: 3.6,
      color: RAIL_BLUE,
      size: 0.9,
      strength: 0.5 * boost,
      flicker: 'fluorescent',
      pool: 2.4,
    },
    {
      at: [cols + 2.6, 20.5],
      height: 3.6,
      color: RAIL_BLUE,
      size: 0.9,
      strength: 0.5 * boost,
      flicker: 'fluorescent',
      pool: 2.4,
      minQuality: 'medium',
    },
    // phone-shop LEDs and a lantern at the trading streets' pavement
    {
      at: [-2.2, 8],
      height: 2.2,
      color: LED_WHITE,
      size: 0.6,
      strength: 0.45 * boost,
      pool: 1.6,
      minQuality: 'medium',
    },
    {
      at: [-2.2, 24],
      height: 2.2,
      color: SODIUM,
      size: 0.6,
      strength: 0.5 * boost,
      flicker: 'sodium',
      pool: 1.6,
      minQuality: 'medium',
    },
    // the Cappa Ground's floodlight masts (lit at night; a soft pool by day)
    {
      at: [cols + 3.2, 26],
      height: 8.4,
      color: LED_WHITE,
      size: night ? 1.6 : 0.9,
      strength: night ? 0.9 : 0.35,
      pool: night ? 4.4 : 2.6,
      minQuality: 'medium',
    },
    {
      at: [cols + 3.2, 31],
      height: 8.4,
      color: LED_WHITE,
      size: night ? 1.6 : 0.9,
      strength: night ? 0.9 : 0.35,
      pool: night ? 4.4 : 2.6,
      minQuality: 'medium',
    },
    // bounce light reflected into the shade of the terminal canopy (pools only: no visible bulb)
    {
      at: [cx - 9, -3.2],
      height: 0.3,
      color: 0xffe2b0,
      size: 0.05,
      strength: 0.5,
      pool: 4.6,
      minQuality: 'medium',
    },
  ];
  return {
    id: 'rumbleOshodi',
    seed: 0x05b0d1e5,
    traffic: [
      // the elevated expressway, both ways (the Apapa approach): buses, Danfos, the odd truck, taxis. Ambient
      // and non-colliding; vehicles appear and leave in the fog beyond both ends
      {
        id: 'deckEastbound',
        kinds: ['bus', 'danfo', 'truck', 'bus', 'car'],
        path: [
          [-52, -23.8],
          [cols + 52, -23.8],
        ],
        count: 5,
        speed: 3.6,
        spacing: 6,
        elevation: OSHODI_DECK_ELEVATION,
        priority: 1,
        fade: 2.5,
      },
      {
        id: 'deckWestbound',
        kinds: ['danfo', 'bus', 'car', 'truck', 'danfo'],
        path: [
          [cols + 52, -26.2],
          [-52, -26.2],
        ],
        count: 5,
        speed: 3.2,
        spacing: 6,
        elevation: OSHODI_DECK_ELEVATION,
        priority: 1,
        fade: 2.5,
      },
      // slow, bumper-to-bumper LOOPS beyond both mouths of the main road (right-hand traffic: eastbound south
      // lanes, westbound north lanes): out along one lane, a U-turn at the far end, back along the other, and
      // into the board's own road at the mouth. Two loops per side (outer lanes, inner lanes). Ambient only:
      // it never enters the board, so the road's own sweeps stay the only hazard.
      ...(['west', 'east'] as const).flatMap((side) => {
        const dir = side === 'east' ? 1 : -1;
        const mouth = side === 'east' ? cols + 1.6 : -1.6;
        const loop = (
          id: string,
          outY: number,
          backY: number,
          far: number,
          kinds: string[],
          count: number,
        ) => ({
          id,
          kinds: kinds as never,
          path: [
            [mouth, outY],
            [mouth + dir * far, outY],
            [mouth + dir * far, backY],
            [mouth, backY],
          ] as [number, number][],
          count,
          speed: 1.15,
          spacing: 0.8,
          priority: 3,
          fade: 2.0,
        });
        // out lane: eastbound (south) on the east side, westbound (north) on the west side
        const outer = side === 'east' ? [eastbound, westbound] : [westbound, eastbound];
        const inner = side === 'east' ? [eastbound - 1, westbound + 1] : [westbound + 1, eastbound - 1];
        return [
          loop(
            `${side}LoopOuter`,
            outer[0]!,
            outer[1]!,
            27,
            ['danfo', 'bus', 'danfo', 'danfo', 'bus', 'car', 'danfo'],
            14,
          ),
          loop(
            `${side}LoopInner`,
            inner[0]!,
            inner[1]!,
            23,
            ['bus', 'danfo', 'keke', 'danfo', 'bus', 'danfo'],
            12,
          ),
        ];
      }),
      // the terminal bay lane in front of the ring terminals: BRT-style buses and Danfos crawling past the bays
      {
        id: 'terminalBays',
        kinds: ['bus', 'bus', 'danfo', 'bus'],
        path: [
          [-6, -1.3],
          [34, -1.3],
        ],
        count: 6,
        speed: 0.9,
        spacing: 5.5,
        priority: 2,
        minQuality: 'medium',
      },
    ],
    crowds: [
      // commuters queueing under the terminal canopy north of the plaza
      {
        id: 'terminalQueue',
        rect: { x0: 3, y0: -3.1, x1: 20, y1: -2.2 },
        count: 14,
        mood: 'waiting',
        priority: 3,
      },
      // passengers on the station forecourt beyond the east edge, rows 10-14
      {
        id: 'stationForecourt',
        rect: { x0: cols + 1.8, y0: 9.4, x1: cols + 5.2, y1: 13.2 },
        count: 8,
        mood: 'waiting',
        priority: 3,
      },
      // traders at the trading streets' pavement (west edge, rows 3-12)
      {
        id: 'tradingPavement',
        rect: { x0: -5.6, y0: 3, x1: -2.2, y1: 12 },
        count: 14,
        mood: 'trading',
        priority: 2,
        reacts: { blast: { reaction: 'flinch', radius: 10, minRange: 3, chance: 0.6 } },
      },
      // fans along the Cappa Ground's touchline (east edge, rows 26-30)
      {
        id: 'groundTouchline',
        rect: { x0: cols + 1.8, y0: 26, x1: cols + 3.8, y1: 30.4 },
        count: 6,
        mood: 'watching',
        priority: 2,
        reacts: { elimination: { reaction: 'cheer', radius: 60, chance: 0.6 } },
      },
      // mechanics at the works yard's west gate (beyond the trading streets, rows 24-30)
      {
        id: 'worksCrew',
        rect: { x0: -5.4, y0: 21, x1: -2.4, y1: 26 },
        count: 5,
        mood: 'working',
        priority: 1,
        reacts: { elimination: { reaction: 'look', radius: 60, chance: 0.5 } },
      },
    ],
    reactions: {
      blast: { reaction: 'duck', radius: 12, minRange: 3, chance: 0.5 },
      elimination: { reaction: 'cheer', radius: 60, chance: 0.4 },
      stage: { reaction: 'look', radius: 18, chance: 0.5 },
    },
    lights,
    // the bus-choked roads are this stage's identity: more ambient vehicles and people per tier (instanced: the
    // model count, hence the draw calls, is unchanged)
    boost: {
      low: { vehicles: 8, people: 20 },
      medium: { vehicles: 64, people: 52 },
      high: { vehicles: 96, people: 96 },
    },
    audio: {
      beds: ['buspark_loop', 'crowd_loop'],
      reactions: [
        { on: 'blast', sound: 'crowd_ooh' },
        { on: 'elimination', sound: 'crowd_gasp' },
        { on: 'stage', sound: 'crowd_throw_whistle' },
      ],
    },
    // the terminal canopy and the expressway deck stand north of the board; nothing overhead needs a cutaway
    occlusion: { cutaway: [] },
    safety: {
      // the shoulders beside the tracks and the platforms: never on a rail lane
      safePockets: [
        {
          style: 'train',
          rect: { x0: 35, y0: 10, x1: 36, y1: 15 },
          note: 'north shoulder beside the tracks',
        },
        { style: 'train', rect: { x0: 38, y0: 10, x1: 41, y1: 15 }, note: 'north platform' },
        {
          style: 'train',
          rect: { x0: 35, y0: 19, x1: 36, y1: 23 },
          note: 'south shoulder beside the tracks',
        },
        {
          style: 'train',
          rect: { x0: 38, y0: 19, x1: 41, y1: 23 },
          note: 'south platform and the Cappa passage',
        },
      ],
      // the sim runs one lethal event at a time on this stage and none once the city closes
      exclusions: [{ style: 'train', notWith: ['traffic', 'danfo', 'goods', 'debris', 'crush'] }],
    },
  };
}

export const OSHODI_METRO_ENV = (board: BoardSize, tod: TimeOfDay = 'day'): StageEnvironment =>
  oshodiMetroEnv(board, tod);
