/**
 * Basics: moving, generators and the plus-shaped blast, Extra Socket, fire range.
 * Board: Danfo Bus Park emptied of crates (15 x 11, concrete pillars on every odd/odd tile), stage
 * hazards off. Coordinates are (x, y) tiles from the top-left.
 */
import type { CharacterId, GameState } from '../../sim';
import { collected, flameBrokeCrates, stateCheck } from '../practice';
import { place, untilEvent, untilNoFlames, wait, walk } from '../script';
import { PRACTICE_CONFIG, crate, pickup, scenario } from '../setup';
import type { Chapter, PracticeCheck } from '../types';

const HERO = { name: 'YOU', characterId: 'streetBaller' as CharacterId };
const DUMMY = (at: [number, number]) => ({ name: 'DUMMY', characterId: 'lekkiBoy' as CharacterId, at });

/** A practice board: the human in the bottom-left corner, alone (nobody to end the round). */
function practiceBoard(character: CharacterId, fill: (s: GameState) => void): GameState {
  const s = scenario({
    actors: [{ name: 'YOU', characterId: character, at: [0, 10], facing: 'right' }],
    config: PRACTICE_CONFIG,
  });
  fill(s);
  return s;
}

export const MOVE: Chapter = {
  id: 'move',
  title: 'Moving around',
  summary: 'Walk the lanes, pass through rivals, grab pickups.',
  facts: [
    'You move one tile at a time, only up, down, left and right.',
    'Concrete pillars, crates and generators block you. Other players never do.',
    'Walk over a pickup to collect it. Your upgrades show along the bottom of the screen.',
  ],
  controls: ['move', 'pause'],
  demo: {
    build() {
      const s = scenario({ actors: [{ ...HERO, at: [2, 8], facing: 'right' }, DUMMY([10, 6])] });
      for (const [x, y] of [
        [8, 8],
        [12, 8],
        [4, 4],
        [10, 2],
      ] as const)
        crate(s, x, y);
      pickup(s, 12, 4, 'skates');
      return s;
    },
    beats: [
      {
        caption:
          'You move one tile at a time along the open lanes. Concrete pillars and crates block the way.',
        acts: { 0: [walk('right', 4), walk('up', 2)] },
      },
      {
        caption: 'Hold a direction to keep walking. Tap it for a single step.',
        acts: { 0: [walk('right', 1), wait(24), walk('right', 1), wait(24)] },
      },
      {
        caption: 'Players never block each other: you can walk straight through a rival.',
        acts: { 0: [walk('right', 4)] },
      },
      {
        caption: 'Walk over a pickup to collect it. Roller Skates make you faster (up to three pairs).',
        acts: { 0: [walk('up', 2), walk('left', 4)] },
      },
      { caption: 'Everything you have collected shows along the bottom of the screen.', hold: 150 },
    ],
  },
  practice: {
    goal: 'Collect all three pickups.',
    hint: 'Pillars and crates block you; find a way round.',
    build: (c) =>
      practiceBoard(c, (s) => {
        for (const [x, y] of [
          [6, 8],
          [8, 6],
          [4, 4],
          [12, 8],
          [2, 6],
        ] as const)
          crate(s, x, y);
        pickup(s, 4, 8, 'skates');
        pickup(s, 10, 10, 'skates');
        pickup(s, 8, 2, 'skates');
      }),
    checks: () => [collected('Collect the three pairs of Roller Skates', 'skates', 3)],
  },
};

export const GENERATOR: Chapter = {
  id: 'generator',
  title: 'Generators & the plus blast',
  summary: 'Drop a generator, get out of its lines, break crates.',
  facts: [
    'A generator explodes about 3 seconds after you drop it.',
    'The blast is a plus (+): up, down, left and right, 2 tiles per arm to start with. Never diagonal.',
    'Concrete stops the fire. The first crate on an arm stops it too, and breaks.',
    'Anyone in the fire is out, including you. If the last two go down together it is a draw.',
    'Broken crates sometimes drop a pickup.',
  ],
  controls: ['move', 'place'],
  demo: {
    build() {
      const s = scenario({
        actors: [
          { ...HERO, at: [6, 6], facing: 'down' },
          DUMMY([8, 6]),
          { ...DUMMY([14, 0]), name: 'DUMMY 2' },
        ],
      });
      crate(s, 6, 5, 'petrol');
      crate(s, 5, 6);
      crate(s, 4, 6);
      return s;
    },
    beats: [
      {
        caption: 'Press GENERATOR to drop a generator on your own tile. Its fuse runs about 3 seconds.',
        acts: { 0: [wait(40), place] },
        hold: 150,
      },
      {
        caption: 'Now get out of its lines! The blast is a plus: up, down, left and right. Never diagonal.',
        acts: { 0: [walk('down', 2), walk('right', 1)] },
        hold: 60,
      },
      {
        caption:
          'BOOM. Each arm reaches 2 tiles. Concrete stops it, and the first crate on an arm stops it and breaks.',
        acts: { 0: [untilEvent('generatorExploded'), wait(60)] },
      },
      { caption: 'Anyone standing in the fire is out: your rivals, and you too.', hold: 200 },
      {
        caption: 'Broken crates can drop pickups, like this Petrol Top-Up. Grab it once the fire is out.',
        acts: { 0: [untilNoFlames, walk('left', 1), walk('up', 3)] },
      },
    ],
  },
  practice: {
    goal: 'Break three crates with your generators, without getting caught.',
    hint: 'Drop a generator next to a crate, then step round a pillar out of its lines.',
    build: (c) =>
      practiceBoard(c, (s) => {
        for (const [x, y] of [
          [0, 7],
          [3, 10],
          [2, 7],
          [4, 8],
          [2, 5],
          [6, 10],
        ] as const)
          crate(s, x, y);
      }),
    checks: () => [flameBrokeCrates('Break three crates', 3)],
  },
};

export const SOCKETS: Chapter = {
  id: 'sockets',
  title: 'Extra Socket: more generators',
  summary: 'Several generators at once, and chain reactions.',
  facts: [
    'Extra Socket: +1 generator on the floor at the same time. It stacks, up to 6.',
    'The counter at the bottom shows generators down / generators allowed.',
    'Fire that reaches another generator sets it off at once: a chain reaction.',
  ],
  controls: ['move', 'place'],
  demo: {
    build() {
      const s = scenario({ actors: [{ ...HERO, at: [2, 8], facing: 'right' }] });
      pickup(s, 3, 8, 'socket');
      crate(s, 8, 8);
      crate(s, 4, 6);
      crate(s, 6, 10);
      return s;
    },
    beats: [
      {
        caption:
          'Extra Socket: +1 generator on the floor at a time. It stacks up to 6. Watch the counter at the bottom.',
        acts: { 0: [walk('right', 1)] },
      },
      {
        caption: 'Now two generators can be down at once.',
        acts: { 0: [walk('right', 1), place, walk('right', 2), place] },
        hold: 30,
      },
      { caption: 'Get clear of both of them.', acts: { 0: [walk('up', 2), walk('right', 1)] }, hold: 30 },
      {
        caption: 'Fire that reaches another generator sets it off at once: a chain reaction.',
        acts: { 0: [untilEvent('generatorExploded'), wait(80)] },
      },
    ],
  },
  practice: {
    goal: 'Pick up an Extra Socket, then have two generators down at the same time.',
    hint: 'Drop one, walk two tiles, drop another, then get out of both plus shapes.',
    build: (c) =>
      practiceBoard(c, (s) => {
        pickup(s, 2, 10, 'socket');
        for (const [x, y] of [
          [6, 10],
          [4, 6],
          [8, 8],
        ] as const)
          crate(s, x, y);
      }),
    checks: () => [
      collected('Collect the Extra Socket', 'socket'),
      stateCheck(
        'Have two generators down at once',
        (s, id) => s.generators.filter((g) => g.ownerId === id && g.mode !== 'disabled').length >= 2,
      ),
    ],
  },
};

/** A crate broken by a blast at least 3 tiles from the generator that caused it (same tick). */
const longShot: PracticeCheck = {
  label: 'Break a crate 3 or more tiles from your generator',
  create: () => (ctx) => {
    const blasts = ctx.events.filter((e) => e.type === 'generatorExploded' && e.ownerId === ctx.localId);
    return ctx.events.some(
      (e) =>
        e.type === 'blockDestroyed' &&
        e.by === 'flame' &&
        blasts.some(
          (b) =>
            b.type === 'generatorExploded' &&
            ((b.x === e.x && Math.abs(b.y - e.y) >= 3) || (b.y === e.y && Math.abs(b.x - e.x) >= 3)),
        ),
    );
  },
};

export const RANGE: Chapter = {
  id: 'range',
  title: 'Fire range: Petrol & Diesel',
  summary: 'Longer arms for your blast.',
  facts: [
    'Petrol Top-Up: +1 tile on every arm of your blast, up to 8.',
    'Power Diesel (rare): your fire goes as far as it can, until concrete or a crate.',
    'Hot Fuel (rare): your next generator burns through the first crate on each arm.',
    'The number next to the petrol can at the bottom is your current reach.',
  ],
  controls: ['move', 'place'],
  demo: {
    build() {
      const s = scenario({ actors: [{ ...HERO, at: [2, 6], facing: 'right' }] });
      crate(s, 6, 6);
      pickup(s, 4, 4, 'petrol');
      pickup(s, 6, 4, 'petrol');
      return s;
    },
    beats: [
      {
        caption: 'Your blast starts at 2 tiles per arm. That crate is 4 tiles away: out of reach.',
        acts: {
          0: [wait(30), place, walk('up', 2), walk('right', 1), untilEvent('generatorExploded'), wait(40)],
        },
      },
      {
        caption: 'Each Petrol Top-Up adds +1 tile to every arm, up to 8.',
        acts: { 0: [untilNoFlames, walk('right', 3)] },
      },
      {
        caption: 'Same spot, longer fire.',
        acts: { 0: [walk('left', 4), walk('down', 2), place, walk('up', 2), walk('right', 1)] },
        hold: 30,
      },
      {
        caption: 'Now it reaches the crate. Power Diesel, which is rare, sends the fire as far as it can go.',
        acts: { 0: [untilEvent('generatorExploded'), wait(80)] },
      },
    ],
  },
  practice: {
    goal: 'Collect two Petrol Top-Ups, then break a crate 3 or more tiles away from your generator.',
    hint: 'Your reach is the number by the petrol can at the bottom.',
    build: (c) =>
      practiceBoard(c, (s) => {
        pickup(s, 2, 10, 'petrol');
        pickup(s, 0, 8, 'petrol');
        for (const [x, y] of [
          [6, 6],
          [10, 10],
          [0, 3],
        ] as const)
          crate(s, x, y);
      }),
    checks: () => [collected('Collect two Petrol Top-Ups', 'petrol', 2), longShot],
  },
};
