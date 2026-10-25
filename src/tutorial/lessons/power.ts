/**
 * Power-ups: more generators (Extra Socket), longer reach (Petrol), Square Blast and the protection layers
 * (Okada, Armour). Every pickup is collected for real by walking over it.
 */
import { onEvent, collect, placeRefused, survivedOwnBlast, tip, when } from '../practice';
import { place, untilEvent, untilNoFlames, until, wait, walk } from '../script';
import { crate, pickup } from '../setup';
import type { Detector, Lesson, PracticeContext } from '../types';
import { demoBoard, markAt, practiceBoard } from './common';

const ownBlasts = (ctx: PracticeContext) =>
  ctx.events.filter((e) => e.type === 'generatorExploded' && e.ownerId === ctx.localId);

/** Two or more of the human's generators went off in the same tick (a chain) and the human is standing. */
const chained: Detector = when((ctx) => ctx.state.players[ctx.localId]!.alive && ownBlasts(ctx).length >= 2);

export const MULTIPLE: Lesson = {
  id: 'multiple',
  course: 'power',
  title: 'Extra Socket: more generators',
  summary: 'Two generators at once, and chain reactions.',
  objective: 'Collect an Extra Socket, place two generators in a line and set off a chain reaction.',
  facts: [
    'Extra Socket: +1 generator on the floor at the same time (up to 6).',
    'The counter at the bottom shows generators down / generators allowed.',
    'Fire that reaches another generator sets it off at once: a chain reaction.',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () =>
      demoBoard([2, 8], (s) => {
        pickup(s, 3, 8, 'socket');
        crate(s, 8, 8);
      }),
    beats: [
      {
        caption: 'An Extra Socket lets you have one more generator down at a time.',
        acts: { 0: [walk('right', 1)] },
      },
      {
        caption: 'Place two in a line, two tiles apart...',
        acts: { 0: [walk('right', 1), place, walk('right', 2), place] },
        hold: 40,
      },
      { caption: '...and get clear of both.', acts: { 0: [walk('up', 2), walk('right', 1)] }, hold: 30 },
      {
        caption: 'The first blast reaches the second generator and sets it off at once: a chain reaction.',
        acts: { 0: [untilEvent('generatorExploded'), wait(80)] },
      },
    ],
  },
  practice: {
    build: (c) => practiceBoard(c, (s) => pickup(s, 2, 10, 'socket')),
    tasks: [
      {
        id: 'socket',
        label: 'Collect the Extra Socket',
        instruction: 'Walk over the Extra Socket to collect it.',
        controls: ['move'],
        markers: markAt([2, 10]),
        done: collect('socket'),
      },
      {
        id: 'chain',
        label: 'Set off a chain of two generators',
        instruction:
          'Place two generators in a line, 1 or 2 tiles apart, with {A}. Then get clear of both: one blast sets off the other.',
        controls: ['move', 'place'],
        checkpoint: true,
        done: chained,
        mistakes: [
          placeRefused(
            'You already have as many generators down as your sockets allow. Wait for one to go off.',
          ),
          tip(
            'no-chain',
            'No chain: the second generator was out of reach. Place them 1 or 2 tiles apart, in the same row or column.',
            (ctx) => ownBlasts(ctx).length === 1,
          ),
        ],
        praise: 'Chain reaction! Well done.',
      },
    ],
  },
};

/** A crate broken at least 3 tiles from the human's generator that caused it, the human standing. */
const longShot: Detector = when((ctx) => {
  if (!ctx.state.players[ctx.localId]!.alive) return false;
  const blasts = ownBlasts(ctx);
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
});

export const RANGE: Lesson = {
  id: 'range',
  course: 'power',
  title: 'Petrol: a longer blast',
  summary: 'More reach on every arm.',
  objective: 'Collect two Petrol Top-Ups, then break a crate 3 or more tiles away from your generator.',
  facts: [
    'Petrol Top-Up: +1 tile on every arm of your blast (up to 8).',
    'Power Diesel (rare): the fire goes as far as it can, until concrete or a crate.',
    'The number by the petrol can at the bottom is your current reach. Longer reach means running further!',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () =>
      demoBoard([2, 6], (s) => {
        crate(s, 6, 6);
        pickup(s, 4, 4, 'petrol');
        pickup(s, 6, 4, 'petrol');
      }),
    beats: [
      {
        caption: 'Your blast starts at 2 tiles per arm. That crate is 4 tiles away: out of reach.',
        acts: {
          0: [wait(30), place, walk('up', 2), walk('right', 1), untilEvent('generatorExploded'), wait(40)],
        },
      },
      {
        caption: 'Each Petrol Top-Up adds 1 tile to every arm.',
        acts: { 0: [untilNoFlames, walk('right', 3)] },
      },
      {
        caption: 'Same spot, longer fire.',
        acts: { 0: [walk('left', 4), walk('down', 2), place, walk('up', 2), walk('right', 1)] },
        hold: 30,
      },
      { caption: 'Now it reaches the crate.', acts: { 0: [untilEvent('generatorExploded'), wait(80)] } },
    ],
  },
  practice: {
    build: (c) =>
      practiceBoard(c, (s) => {
        pickup(s, 2, 10, 'petrol');
        pickup(s, 0, 8, 'petrol');
        crate(s, 6, 6);
        crate(s, 10, 10);
        crate(s, 0, 3);
      }),
    tasks: [
      {
        id: 'petrol',
        label: 'Collect two Petrol Top-Ups',
        instruction: 'Collect both Petrol Top-Ups.',
        controls: ['move'],
        markers: markAt([2, 10], [0, 8]),
        done: onEvent('pickupCollected', (e, c) => e.playerId === c.localId && e.kind === 'petrol', 2),
      },
      {
        id: 'long',
        label: 'Break a crate 3+ tiles away',
        instruction:
          'Now break a crate 3 or more tiles away from your generator, and stay clear of the longer fire.',
        controls: ['move', 'place'],
        checkpoint: true,
        done: longShot,
        praise: 'Long shot! Well done.',
      },
    ],
  },
};

/** One of the human's blasts broke a crate on a diagonal from the generator (the Square Blast part). */
const diagonalBreak: Detector = when((ctx) => {
  if (!ctx.state.players[ctx.localId]!.alive) return false;
  const blasts = ownBlasts(ctx);
  return ctx.events.some(
    (e) =>
      e.type === 'blockDestroyed' &&
      e.by === 'flame' &&
      blasts.some((b) => b.type === 'generatorExploded' && b.x !== e.x && b.y !== e.y),
  );
});

export const SQUARE: Lesson = {
  id: 'square',
  course: 'power',
  title: 'Square Blast',
  summary: 'A 3 x 3 (then 5 x 5) square on top of the plus.',
  objective: 'Collect a Square Blast and break the crate on the diagonal, which a normal plus never reaches.',
  facts: [
    'Square Blast adds a square around your generator: 3 x 3, then 5 x 5 with a second one.',
    'It comes on top of the normal plus. The corners next to your generator now burn too!',
    'Concrete still stops it, and a crate stops it after breaking.',
    'In City Rumble it is an elimination reward.',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () =>
      demoBoard([1, 10], (s) => {
        pickup(s, 2, 10, 'square');
        crate(s, 4, 9);
      }),
    beats: [
      { caption: 'Square Blast adds a 3 x 3 square around your generator.', acts: { 0: [walk('right', 2)] } },
      {
        caption: 'On top of the plus: now the corners next to it burn too. Get well clear!',
        acts: { 0: [place, walk('left', 1), walk('up', 2)] },
        hold: 30,
      },
      {
        caption: 'The crate on the diagonal broke: a plus could never reach it.',
        acts: { 0: [untilEvent('generatorExploded'), wait(80)] },
      },
    ],
  },
  practice: {
    build: (c) =>
      practiceBoard(c, (s) => {
        pickup(s, 2, 10, 'square');
        crate(s, 4, 9);
      }),
    tasks: [
      {
        id: 'collect',
        label: 'Collect the Square Blast',
        instruction: 'Walk over the Square Blast pickup.',
        controls: ['move'],
        markers: markAt([2, 10]),
        done: collect('square'),
      },
      {
        id: 'diagonal',
        label: 'Break the crate on the diagonal',
        instruction:
          'Place a generator on the marker: the crate is on its diagonal. Then get well clear, the corners burn now!',
        controls: ['move', 'place'],
        checkpoint: true,
        markers: markAt([3, 10]),
        done: diagonalBreak,
        mistakes: [
          tip(
            'diagonal-danger',
            'Careful: with Square Blast the tiles diagonal to your generator burn too. Go further!',
            (ctx) => {
              const p = ctx.state.players[ctx.localId]!;
              return ctx.state.generators.some(
                (g) =>
                  g.ownerId === ctx.localId &&
                  g.square > 0 &&
                  g.timer < 70 &&
                  Math.abs(g.x - p.x) === 1 &&
                  Math.abs(g.y - p.y) === 1,
              );
            },
          ),
        ],
        praise: 'Square Blast! The diagonal crate is gone.',
      },
    ],
  },
};

export const PROTECTION: Lesson = {
  id: 'protection',
  course: 'power',
  title: 'Okada & Armour',
  summary: 'Two protection layers, one hit each.',
  objective: 'Ride an Okada and wear Armour, let each one take a hit for you, then survive without them.',
  facts: [
    'An Okada absorbs one lethal hit (it breaks). Armour absorbs one more. They are separate layers.',
    'The Okada goes first, then the Armour. One blast never takes more than one layer.',
    'With no layer left, the next hit knocks you out.',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () =>
      demoBoard([0, 10], (s) => {
        pickup(s, 1, 10, 'okada');
        pickup(s, 2, 10, 'armour');
      }),
    beats: [
      { caption: 'Okada and Armour: each one takes a single hit for you.', acts: { 0: [walk('right', 2)] } },
      {
        caption: 'Stand in a blast: the Okada goes first...',
        acts: {
          0: [place, until('okada gone', (_s, seen) => seen.some((e) => e.type === 'protectionBroken'))],
        },
      },
      {
        caption: '...then the Armour.',
        acts: {
          0: [
            untilNoFlames,
            place,
            until('armour gone', (_s, seen) => seen.some((e) => e.type === 'protectionBroken')),
          ],
        },
      },
      {
        caption: 'Now nothing is left: the next hit would knock you out. Get clear!',
        acts: { 0: [untilNoFlames, place, walk('right', 3), untilEvent('generatorExploded'), wait(60)] },
      },
    ],
  },
  practice: {
    build: (c) =>
      practiceBoard(c, (s) => {
        pickup(s, 1, 10, 'okada');
        pickup(s, 2, 10, 'armour');
      }),
    tasks: [
      {
        id: 'okada',
        label: 'Ride the Okada',
        instruction: 'Walk onto the Okada to ride it.',
        controls: ['move'],
        markers: markAt([1, 10]),
        done: onEvent('okadaMounted', (e, c) => e.playerId === c.localId),
      },
      {
        id: 'armour',
        label: 'Put on the Armour',
        instruction: 'Now pick up the Armour.',
        controls: ['move'],
        markers: markAt([2, 10]),
        done: collect('armour'),
      },
      {
        id: 'okada-hit',
        label: 'Let the Okada take a hit',
        instruction: 'Place a generator with {A} and stay in its lines. Your Okada takes the hit.',
        controls: ['place'],
        noLaneTip: true,
        done: onEvent('protectionBroken', (e, c) => e.playerId === c.localId && e.layer === 'okada'),
        mistakes: [
          tip('dodged', 'You dodged it! This time stay in its lines: the Okada will take the hit.', (ctx) =>
            ctx.events.some((e) => e.type === 'generatorExploded' && e.ownerId === ctx.localId),
          ),
        ],
        praise: 'The Okada saved you!',
      },
      {
        id: 'armour-hit',
        label: 'Let the Armour take a hit',
        instruction: 'Again: place a generator and stay in it. This time your Armour takes the hit.',
        controls: ['place'],
        noLaneTip: true,
        done: onEvent('protectionBroken', (e, c) => e.playerId === c.localId && e.layer === 'armour'),
        mistakes: [
          tip('dodged', 'You dodged it! Stay in its lines once more: the Armour will take this one.', (ctx) =>
            ctx.events.some((e) => e.type === 'generatorExploded' && e.ownerId === ctx.localId),
          ),
        ],
        praise: 'The Armour saved you!',
      },
      {
        id: 'clear',
        label: 'No layers left: get clear',
        instruction: 'No protection left. Place one more and get clear this time!',
        controls: ['move', 'place'],
        checkpoint: true,
        done: survivedOwnBlast(),
        praise: 'Well done! You know your protection layers.',
      },
    ],
  },
};
