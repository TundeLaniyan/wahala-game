/**
 * Beginner course: moving and turning, button A, escaping, the plus-shaped reach, shelter. Five short
 * lessons that are everything a first match needs.
 */
import { previewBlast } from '../../sim';
import type { CharacterId } from '../../sim';
import { eliminatedBy, onEvent, reach, survivedOwnBlast, tip, when, wrongWay } from '../practice';
import { bump, place, untilEvent, wait, walk } from '../script';
import { crate } from '../setup';
import type { Lesson } from '../types';
import { demoBoard, dummy, markAt, practiceBoard, rivalOf, shelteredBy } from './common';

export const MOVE: Lesson = {
  id: 'move',
  course: 'beginner',
  title: 'Moving & turning',
  summary: 'The floating stick, one tile at a time, turning on the spot.',
  objective: 'Walk to the glowing markers, then turn to face a crate without moving.',
  facts: [
    'Touch: put your thumb down ANYWHERE in the lower-left area of the screen and slide. The stick appears under your thumb.',
    'You move one tile at a time, up, down, left or right. Keep holding to keep walking; let go to stop.',
    'Pillars, crates and generators block you. Other players never do.',
    'Pushing towards something that blocks you turns you to face it, without moving.',
  ],
  controls: ['move'],
  demo: {
    build: () => demoBoard([0, 10], (s) => crate(s, 4, 6)),
    beats: [
      {
        caption:
          'Put your thumb down anywhere in the lower-left of the screen and slide it. The stick appears under your thumb.',
        acts: { 0: [wait(20), walk('right', 4)] },
      },
      {
        caption: 'You move one tile at a time along the open lanes. Pillars and crates block the way.',
        acts: { 0: [walk('up', 3)] },
      },
      {
        caption: 'Push towards a pillar or crate to turn and face it without moving.',
        acts: { 0: [wait(20), bump('left'), wait(40), bump('up'), wait(40)] },
      },
    ],
  },
  practice: {
    build: (c) => practiceBoard(c, (s) => crate(s, 7, 6)),
    tasks: [
      {
        id: 'marker-1',
        label: 'Walk to the first marker',
        instruction: 'Walk to the glowing marker. {move}',
        controls: ['move'],
        markers: markAt([4, 10]),
        done: reach(4, 10),
        mistakes: [wrongWay({ x: 4, y: 10 })],
        praise: 'Good!',
      },
      {
        id: 'marker-2',
        label: 'Walk to the second marker',
        instruction: 'Now the next marker. Find a way between the pillars.',
        controls: ['move'],
        markers: markAt([6, 6]),
        done: reach(6, 6),
        mistakes: [wrongWay({ x: 6, y: 6 })],
        praise: 'Nice walking!',
      },
      {
        id: 'turn',
        label: 'Turn to face the crate',
        instruction:
          'Stay on the marker and push towards the crate on your right: you turn to face it without moving.',
        controls: ['move'],
        markers: markAt([6, 6]),
        done: when((ctx) => {
          const p = ctx.state.players[ctx.localId]!;
          return (
            p.x === 6 &&
            p.y === 6 &&
            p.facing === 'right' &&
            p.stepRemaining === 0 &&
            ctx.intents[ctx.localId]?.move === 'right'
          );
        }),
        mistakes: [
          tip('left-marker', 'Come back to the marker, then push towards the crate.', (ctx) => {
            const p = ctx.state.players[ctx.localId]!;
            return p.stepRemaining === 0 && (p.x !== 6 || p.y !== 6);
          }),
        ],
        praise: 'Well done! You can move and turn.',
      },
    ],
  },
};

export const PLACE: Lesson = {
  id: 'place',
  course: 'beginner',
  title: 'Button A: place a generator',
  summary: 'Drop a generator, step out of its lines, break a crate.',
  objective: 'Place a generator next to a crate with button A, then get out of the way.',
  facts: [
    'Button A drops a generator on your own tile. It explodes about 3 seconds later.',
    'The tiles about to burn glow red. Anyone standing in the fire is out, including you.',
    'The blast breaks crates. Broken crates sometimes drop a pickup.',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () => demoBoard([4, 10], (s) => crate(s, 4, 8)),
    beats: [
      {
        caption: 'Press A to drop a generator on your own tile. Its fuse runs about 3 seconds.',
        acts: { 0: [wait(40), place] },
        hold: 120,
      },
      {
        caption: 'Then walk out of its lines. The red tiles show where the fire will go.',
        acts: { 0: [walk('left', 3)] },
        hold: 30,
      },
      {
        caption: 'BOOM! The blast broke the crate.',
        acts: { 0: [untilEvent('generatorExploded'), wait(70)] },
      },
    ],
  },
  practice: {
    build: (c) => practiceBoard(c, (s) => crate(s, 4, 8)),
    tasks: [
      {
        id: 'go',
        label: 'Walk to the marker by the crate',
        instruction: 'Walk to the glowing marker below the crate.',
        controls: ['move'],
        markers: markAt([4, 10]),
        done: reach(4, 10),
        mistakes: [wrongWay({ x: 4, y: 10 })],
      },
      {
        id: 'place',
        label: 'Press A to place a generator',
        instruction: 'Press {A} to place a generator on the marker.',
        controls: ['place'],
        checkpoint: true,
        markers: markAt([4, 10]),
        done: onEvent('generatorPlaced', (e, c) => e.ownerId === c.localId && e.x === 4 && e.y === 10),
        mistakes: [
          tip(
            'placed-elsewhere',
            'That one is not on the marker. Get clear of it, then place one on the marker by the crate.',
            (ctx) => ctx.events.some((e) => e.type === 'generatorPlaced' && e.ownerId === ctx.localId),
          ),
        ],
        praise: 'Placed! Now move!',
      },
      {
        id: 'escape',
        label: 'Get clear before it blows',
        instruction: 'Get out of its lines! Walk at least 3 tiles along the row, or round a corner.',
        controls: ['move'],
        done: survivedOwnBlast(),
        praise: 'Well done! You were clear, and the blast broke the crate.',
      },
    ],
  },
};

export const ESCAPE: Lesson = {
  id: 'escape',
  course: 'beginner',
  title: 'Escaping the blast',
  summary: 'Turn a corner: the diagonal is safe.',
  objective: 'Place a generator and escape round a corner before it explodes. Then do it on your own.',
  facts: [
    'Before you press A, know your way out.',
    'Running straight along the lane is slow: the fire reaches 2 tiles each way to start with.',
    'Turning a corner is quickest: the blast never goes diagonally.',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () =>
      demoBoard([2, 10], (s) => {
        crate(s, 5, 10);
        crate(s, 2, 6);
      }),
    beats: [
      { caption: 'Place the generator...', acts: { 0: [wait(30), place] }, hold: 60 },
      {
        caption: '...then turn a corner: two steps up, one step across. The blast never goes diagonally.',
        acts: { 0: [walk('up', 2), walk('left', 1)] },
        hold: 30,
      },
      {
        caption: 'Safe! Always know your way out before you press A.',
        acts: { 0: [untilEvent('generatorExploded'), wait(70)] },
      },
    ],
  },
  practice: {
    build: (c) =>
      practiceBoard(c, (s) => {
        crate(s, 5, 10);
        crate(s, 2, 6);
      }),
    tasks: [
      {
        id: 'place',
        label: 'Place a generator on the marker',
        instruction: 'Walk to the marker and press {A}.',
        controls: ['move', 'place'],
        markers: markAt([2, 10]),
        done: onEvent('generatorPlaced', (e, c) => e.ownerId === c.localId && e.x === 2 && e.y === 10),
        mistakes: [
          wrongWay({ x: 2, y: 10 }),
          tip(
            'placed-elsewhere',
            'Not quite on the marker. Get clear, then try again on the marker.',
            (ctx) => ctx.events.some((e) => e.type === 'generatorPlaced' && e.ownerId === ctx.localId),
          ),
        ],
      },
      {
        id: 'corner',
        label: 'Escape round the corner',
        instruction: 'Run round the corner to the safe marker before it blows!',
        controls: ['move'],
        markers: markAt([1, 8]),
        done: survivedOwnBlast(),
        cue: { start: 'ON_GENERATOR_CRITICAL_PROXIMITY', done: 'ON_PLAYER_NARROW_ESCAPE' },
        praise: 'Safe! The corner kept you out of the plus.',
      },
      {
        id: 'again',
        label: 'Do it again on your own',
        instruction: 'Once more, without a marker: place a generator anywhere and find a safe tile.',
        controls: ['move', 'place'],
        checkpoint: true,
        done: survivedOwnBlast(),
        praise: 'Well done! You know how to escape.',
      },
    ],
  },
};

const TARGET = { x: 6, y: 8 };

export const CROSS: Lesson = {
  id: 'cross',
  course: 'beginner',
  title: 'The plus-shaped reach',
  summary: 'Straight up, down, left and right. Never diagonal.',
  objective: 'Catch the dummy with your blast by lining up with it, and stay safe yourself.',
  facts: [
    'Your blast is a plus (+): 2 tiles up, down, left and right to start with.',
    'It never goes diagonally, so a rival on a diagonal is safe.',
    'Concrete stops the fire. The first crate on an arm stops it too, and breaks.',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () =>
      demoBoard([2, 8], () => undefined, {
        others: [dummy([4, 8], 'IN LINE'), dummy([4, 6], 'DIAGONAL', 'campusQueen')],
      }),
    beats: [
      {
        caption: 'The blast is a plus: 2 tiles straight up, down, left and right.',
        acts: { 0: [wait(30), place] },
        hold: 70,
      },
      { caption: 'Get out of its lines.', acts: { 0: [walk('down', 2), walk('left', 1)] } },
      {
        caption:
          'The dummy in line is caught. The one on the diagonal is safe: the fire never goes diagonally.',
        acts: { 0: [untilEvent('generatorExploded'), wait(90)] },
      },
    ],
  },
  practice: {
    build: (c: CharacterId) =>
      practiceBoard(c, () => undefined, { others: [dummy([TARGET.x, TARGET.y], 'TARGET', rivalOf(c))] }),
    tasks: [
      {
        id: 'catch',
        label: 'Catch the dummy with your blast',
        instruction:
          'Catch the marked dummy: place a generator in line with it (same row or column, up to 2 tiles away), then get clear.',
        controls: ['move', 'place'],
        markers: markAt([TARGET.x, TARGET.y]),
        done: eliminatedBy('flame', (id) => id === 1),
        mistakes: [
          tip(
            'out-of-reach',
            'That spot will not reach the dummy: the blast goes 2 tiles straight up, down, left and right, never diagonally.',
            (ctx) =>
              ctx.events.some((e) => {
                if (e.type !== 'generatorPlaced' || e.ownerId !== ctx.localId) return false;
                const g = ctx.state.generators.find((o) => o.id === e.generatorId);
                const t = ctx.state.players[1]!;
                return !!g && !previewBlast(ctx.state, g).has(t.y * ctx.state.width + t.x);
              }),
          ),
        ],
        praise: 'Caught! That is the plus-shaped reach.',
      },
    ],
  },
};

export const SAFETY: Lesson = {
  id: 'safety',
  course: 'beginner',
  title: 'Shelter: pillars & crates',
  summary: 'Concrete and crates stop the fire.',
  objective: 'Survive your own blast while standing in its line, sheltered by a pillar, then by a crate.',
  facts: [
    'Concrete pillars always stop the fire.',
    'The first crate on an arm stops the fire too (and breaks).',
    'So a pillar or crate between you and a generator is a safe place, even in its line.',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () => demoBoard([1, 8]),
    beats: [
      { caption: 'Concrete pillars stop the fire.', acts: { 0: [wait(30), place] }, hold: 60 },
      {
        caption: "Hide behind one, even in the generator's line.",
        acts: { 0: [walk('left', 1), walk('up', 2), walk('right', 1)] },
        hold: 30,
      },
      {
        caption: 'The pillar sheltered you. The first crate on an arm stops the fire too.',
        acts: { 0: [untilEvent('generatorExploded'), wait(90)] },
      },
    ],
  },
  practice: {
    build: (c) => practiceBoard(c, (s) => crate(s, 5, 10)),
    tasks: [
      {
        id: 'spot',
        label: 'Walk to the first marker',
        instruction: 'Walk to the glowing marker.',
        controls: ['move'],
        markers: markAt([1, 8]),
        done: reach(1, 8),
        mistakes: [wrongWay({ x: 1, y: 8 })],
      },
      {
        id: 'place-1',
        label: 'Place a generator',
        instruction: 'Press {A} to place a generator here.',
        controls: ['place'],
        checkpoint: true,
        markers: markAt([1, 8]),
        done: onEvent('generatorPlaced', (e, c) => e.ownerId === c.localId),
      },
      {
        id: 'pillar',
        label: 'Hide behind the pillar',
        instruction: 'Hide on the second marker: in line with your generator, with a pillar in between.',
        controls: ['move'],
        markers: markAt([1, 6]),
        done: shelteredBy('pillar'),
        mistakes: [
          tip(
            'not-behind',
            'Safe, but not behind the pillar. Place another one on the first marker and hide on the second.',
            (ctx) =>
              ctx.state.players[ctx.localId]!.alive &&
              ctx.events.some((e) => e.type === 'generatorExploded' && e.ownerId === ctx.localId),
          ),
        ],
        praise: 'The pillar sheltered you!',
      },
      {
        id: 'place-2',
        label: 'Place a generator by the crate',
        instruction: 'Crates stop fire too. Place a generator on the marker next to the crate.',
        controls: ['move', 'place'],
        checkpoint: true,
        markers: markAt([4, 10]),
        done: onEvent('generatorPlaced', (e, c) => e.ownerId === c.localId && e.x === 4 && e.y === 10),
        mistakes: [wrongWay({ x: 4, y: 10 })],
      },
      {
        id: 'crate',
        label: 'Hide behind the crate',
        instruction: 'Now hide on the marker behind the crate. You will have to go round.',
        controls: ['move'],
        markers: markAt([6, 10]),
        done: shelteredBy('crate'),
        praise: 'Well done! The crate took the fire for you.',
      },
    ],
  },
};
