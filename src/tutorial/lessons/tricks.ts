/**
 * Generator tricks: the four contact abilities (no button: walk into a generator) and the Remote
 * Detonator (hold B). One contact ability at a time; the last one picked up replaces the previous one.
 */
import { onEvent, survivedOwnBlast, failWhen, when, whiffedB, reach } from '../practice';
import { bump, detonate, place, untilEvent, wait, walk } from '../script';
import { crate, grant, pickup } from '../setup';
import type { Detector, Lesson } from '../types';
import { demoBoard, dummy, markAt, practiceBoard, rivalOf } from './common';

const equipped = (ability: 'kick' | 'punch' | 'disarm' | 'pass'): Detector =>
  onEvent('contactEquipped', (e, c) => e.playerId === c.localId && e.ability === ability);

const used = (ability: 'kick' | 'punch' | 'disarm' | 'pass'): Detector =>
  onEvent('contactUsed', (e, c) => e.playerId === c.localId && e.ability === ability);

const GET_CLEAR = {
  id: 'clear',
  label: 'Get clear before it blows',
  instruction: 'Now get clear of it before it blows.',
  controls: ['move' as const],
  done: survivedOwnBlast(),
};

export const KICK: Lesson = {
  id: 'kick',
  course: 'tricks',
  title: 'Kick (Football Boots)',
  summary: 'Walk into a generator to send it sliding.',
  objective: 'Pick up the Football Boots and kick a generator by walking into it.',
  facts: [
    'No button: with Football Boots, walking into a generator kicks it.',
    'It slides until a crate, a pillar, a player or another generator stops it, then explodes on its own fuse.',
    "You can kick anyone's generator.",
  ],
  controls: ['move', 'place'],
  demo: {
    build: () =>
      demoBoard([2, 8], (s) => {
        pickup(s, 3, 8, 'boots');
        crate(s, 10, 8);
      }),
    beats: [
      {
        caption: 'Football Boots: walk into a generator to kick it. There is no kick button.',
        acts: { 0: [walk('right', 1)] },
      },
      {
        caption: 'Place one, step back, then walk into it.',
        acts: { 0: [walk('right', 1), place, walk('left', 1), wait(20), bump('right')] },
        hold: 60,
      },
      {
        caption: 'It slides until something stops it, then explodes on its own fuse.',
        acts: { 0: [untilEvent('generatorExploded'), wait(70)] },
      },
    ],
  },
  practice: {
    build: (c) =>
      practiceBoard(c, (s) => {
        pickup(s, 2, 10, 'boots');
        crate(s, 12, 10);
      }),
    tasks: [
      {
        id: 'boots',
        label: 'Pick up the Football Boots',
        instruction: 'Walk over the Football Boots.',
        controls: ['move'],
        markers: markAt([2, 10]),
        done: equipped('kick'),
      },
      {
        id: 'kick',
        label: 'Kick a generator',
        instruction: 'Place a generator with {A}, step off it, then walk back into it: you kick it.',
        controls: ['move', 'place'],
        checkpoint: true,
        done: used('kick'),
        praise: 'What a kick!',
      },
      GET_CLEAR,
    ],
  },
};

export const PUNCH: Lesson = {
  id: 'punch',
  course: 'tricks',
  title: 'Punch (Mechanic Gloves)',
  summary: 'Knock a generator 3 tiles, over walls.',
  objective: 'Swap your Boots for Mechanic Gloves and punch a generator over a crate.',
  facts: [
    'With Mechanic Gloves, walking into a generator punches it: it flies 3 tiles, over crates and pillars.',
    'If the landing tile is taken it carries on to the next free tile.',
    'One contact ability at a time: the newest (Boots, Gloves, Kill Switch or Generator Pass) replaces the old one.',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () =>
      demoBoard([2, 8], (s) => {
        pickup(s, 3, 8, 'gloves');
        crate(s, 5, 8);
        crate(s, 6, 8);
        crate(s, 7, 8);
      }),
    beats: [
      { caption: 'Mechanic Gloves: walk into a generator to punch it.', acts: { 0: [walk('right', 1)] } },
      {
        caption: 'Place one and step back.',
        acts: { 0: [walk('right', 1), place, walk('left', 1), wait(15)] },
        hold: 40,
      },
      {
        caption: 'Walk into it: it flies 3 tiles, right over the crates.',
        acts: { 0: [bump('right'), untilEvent('generatorThrown')] },
        hold: 100,
      },
      {
        caption: 'Its landing tile held a crate, so it carried on to the next free tile.',
        acts: { 0: [untilEvent('generatorExploded'), wait(60)] },
      },
    ],
  },
  practice: {
    build: (c) =>
      practiceBoard(c, (s) => {
        grant(s, 0, { contact: 'kick' });
        pickup(s, 2, 10, 'gloves');
        crate(s, 5, 10);
      }),
    tasks: [
      {
        id: 'gloves',
        label: 'Swap your Boots for the Gloves',
        instruction: 'You have Football Boots. Pick up the Mechanic Gloves: they replace the Boots.',
        controls: ['move'],
        markers: markAt([2, 10]),
        done: onEvent(
          'contactEquipped',
          (e, c) => e.playerId === c.localId && e.ability === 'punch' && e.replaced === 'kick',
        ),
        praise: 'Gloves on, Boots gone: one contact ability at a time.',
      },
      {
        id: 'punch',
        label: 'Punch a generator over the crate',
        instruction:
          'Place a generator, step off it, then walk into it towards the crate: you punch it over.',
        controls: ['move', 'place'],
        checkpoint: true,
        done: used('punch'),
        praise: 'Knocked it flying!',
      },
      GET_CLEAR,
    ],
  },
};

/** A rival's generator went off in the same blast as one of the human's (a chain), the human standing. */
const dudChained: Detector = when(
  (ctx) =>
    ctx.state.players[ctx.localId]!.alive &&
    ctx.events.some((e) => e.type === 'generatorExploded' && e.ownerId === ctx.localId) &&
    ctx.events.some((e) => e.type === 'generatorExploded' && e.ownerId !== ctx.localId),
);

export const DISARM: Lesson = {
  id: 'disarm',
  course: 'tricks',
  title: 'Disarm (Kill Switch)',
  summary: 'Switch off a generator by walking into it.',
  objective:
    "Pick up a Kill Switch, switch off the rival's generator by walking into it, then set it off with fire.",
  facts: [
    'With a Kill Switch, walking into a generator switches it off for good: no fuse, no remote.',
    'Each Kill Switch has a few charges; the ability ends with the last one.',
    'A switched-off generator still explodes if fire or a vehicle reaches it.',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () =>
      demoBoard([2, 8], (s) => pickup(s, 3, 8, 'killswitch'), {
        others: [dummy([6, 8], 'RIVAL')],
      }),
    beats: [
      {
        caption: 'A rival drops a generator in your lane.',
        acts: { 0: [walk('right', 1)], 1: [wait(20), place, walk('up', 2), walk('right', 1)] },
        hold: 90,
      },
      {
        caption: 'With a Kill Switch, walk into it: it is switched off for good.',
        acts: { 0: [walk('right', 2), bump('right')] },
        hold: 90,
      },
      {
        caption: 'But fire still sets it off. Your own blast reaches it...',
        acts: { 0: [wait(20), place, walk('left', 3)] },
        hold: 40,
      },
      { caption: '...and it explodes too.', acts: { 0: [untilEvent('generatorExploded'), wait(70)] } },
    ],
  },
  practice: {
    build: (c) =>
      practiceBoard(c, (s) => pickup(s, 2, 10, 'killswitch'), {
        others: [{ ...dummy([6, 10], 'RIVAL', rivalOf(c)), facing: 'up' }],
      }),
    opponents: { 1: [wait(30), place, walk('up', 4)] },
    tasks: [
      {
        id: 'killswitch',
        label: 'Pick up the Kill Switch',
        instruction: 'Walk over the Kill Switch.',
        controls: ['move'],
        markers: markAt([2, 10]),
        done: equipped('disarm'),
      },
      {
        id: 'disarm',
        label: "Switch off the rival's generator",
        instruction: 'The rival left a remote generator in the lane. Walk into it to switch it off.',
        controls: ['move'],
        done: onEvent('generatorDisarmed', (e, c) => e.playerId === c.localId),
        praise: 'Switched off for good.',
      },
      {
        id: 'chain',
        label: 'Set it off with your own blast',
        instruction:
          'A switched-off generator still explodes from fire. Place yours next to it with {A} and get clear.',
        controls: ['move', 'place'],
        checkpoint: true,
        done: dudChained,
        praise: 'Boom: fire still sets off a switched-off generator.',
      },
    ],
  },
};

export const PASS: Lesson = {
  id: 'pass',
  course: 'tricks',
  title: 'Generator Pass',
  summary: 'Walk through generators. No fire protection!',
  objective: 'Pick up the Generator Pass and walk straight through a generator.',
  facts: [
    "With the Generator Pass you walk through generators: yours and your rivals'.",
    'It gives NO protection from fire. Never stop on one that is about to blow.',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () =>
      demoBoard([2, 8], (s) => pickup(s, 3, 8, 'bombpass'), {
        others: [{ ...dummy([6, 8], 'RIVAL', 'campusQueen'), facing: 'down' }],
      }),
    beats: [
      { caption: 'The Generator Pass lets you walk through generators.', acts: { 0: [walk('right', 1)] } },
      {
        caption: 'A rival blocks the lane with a generator...',
        acts: { 1: [place, walk('down', 2), walk('right', 1)] },
        hold: 80,
      },
      { caption: '...you walk straight through it.', acts: { 0: [walk('right', 6)] }, hold: 30 },
      {
        caption: 'No protection from fire, though: never stop on one.',
        acts: { 0: [untilEvent('generatorExploded'), wait(60)] },
      },
    ],
  },
  practice: {
    build: (c) =>
      practiceBoard(c, (s) => {
        pickup(s, 2, 10, 'bombpass');
        crate(s, 10, 10);
      }),
    tasks: [
      {
        id: 'pass',
        label: 'Pick up the Generator Pass',
        instruction: 'Walk over the Generator Pass.',
        controls: ['move'],
        markers: markAt([2, 10]),
        done: equipped('pass'),
      },
      {
        id: 'through',
        label: 'Walk through a generator',
        instruction: 'Place a generator, step off it, then walk straight through it and keep going.',
        controls: ['move', 'place'],
        checkpoint: true,
        done: used('pass'),
        praise: 'Straight through!',
      },
      GET_CLEAR,
    ],
  },
};

/** One of the human's remote generators went off within a tick of a B hold (they set it off), human standing. */
const remoteBoom: Detector = {
  create: () => {
    let heldAt = -1e9;
    return (ctx) => {
      if (ctx.intents[ctx.localId]?.detonate) heldAt = ctx.state.tick;
      return (
        ctx.state.players[ctx.localId]!.alive &&
        ctx.state.tick - heldAt <= 1 &&
        ctx.events.some((e) => e.type === 'generatorExploded' && e.ownerId === ctx.localId)
      );
    };
  },
};

export const REMOTE: Lesson = {
  id: 'remote',
  course: 'tricks',
  title: 'Remote Detonator (hold B)',
  summary: 'No fuse: set your generators off when you choose.',
  objective: 'Pick up the Remote Starter, place a generator, get somewhere safe and hold B to set it off.',
  facts: [
    'With the Remote Starter your generators have no fuse: they wait for you.',
    'HOLD button B to set off all your remote generators at once. A quick tap of B is the special move instead.',
    'Forget one and it goes off by itself after 20 seconds. Fire and vehicles still set it off any time.',
  ],
  controls: ['move', 'place', 'detonate'],
  demo: {
    build: () =>
      demoBoard([2, 8], (s) => {
        pickup(s, 3, 8, 'remote');
        crate(s, 6, 8);
      }),
    beats: [
      {
        caption: 'Remote Starter: your generators wait for you. No fuse.',
        acts: { 0: [walk('right', 2), place] },
      },
      {
        caption: 'Get somewhere safe and take your time.',
        acts: { 0: [walk('up', 2), walk('right', 1), wait(80)] },
      },
      {
        caption: 'Then HOLD A (or B): every remote generator you have goes off at once.',
        acts: { 0: [detonate, wait(80)] },
      },
    ],
  },
  practice: {
    build: (c) =>
      practiceBoard(c, (s) => {
        pickup(s, 2, 10, 'remote');
        crate(s, 6, 10);
      }),
    tasks: [
      {
        id: 'remote',
        label: 'Pick up the Remote Starter',
        instruction: 'Walk over the Remote Starter.',
        controls: ['move'],
        markers: markAt([2, 10]),
        done: onEvent('pickupCollected', (e, c) => e.playerId === c.localId && e.kind === 'remote'),
      },
      {
        id: 'place',
        label: 'Place a remote generator',
        instruction: 'Place a generator with {A}. It has no fuse: it waits for you.',
        controls: ['place'],
        checkpoint: true,
        done: onEvent(
          'generatorPlaced',
          (e, c) =>
            e.ownerId === c.localId &&
            c.state.generators.some((g) => g.id === e.generatorId && g.mode === 'remote'),
        ),
      },
      {
        id: 'safe',
        label: 'Walk to the safe marker',
        instruction: 'Walk to the safe marker, out of its lines.',
        controls: ['move'],
        markers: markAt([4, 8]),
        done: reach(4, 8),
        failures: [
          failWhen(
            'too-soon',
            'You set it off before reaching the safe marker. Let us try that again.',
            (ctx) => ctx.events.some((e) => e.type === 'generatorExploded' && e.ownerId === ctx.localId),
          ),
        ],
      },
      {
        id: 'hold',
        label: 'Hold B to set it off',
        instruction: 'Now press and HOLD {holdB} to set it off.',
        controls: ['detonate'],
        done: remoteBoom,
        mistakes: [
          whiffedB(
            'A quick tap of B is the special move. Press and HOLD A (or HOLD B) to set off your generator.',
          ),
        ],
        failures: [
          failWhen(
            'failsafe',
            'It went off by itself after 20 seconds. Hold B sooner next time!',
            (ctx) =>
              !ctx.intents[ctx.localId]?.detonate &&
              ctx.events.some((e) => e.type === 'generatorExploded' && e.ownerId === ctx.localId),
          ),
        ],
        praise: 'Boom, on your command!',
      },
    ],
  },
};
