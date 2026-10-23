/**
 * Generator handling (Kick, Punch, Carry, Generator Pass, Remote Starter) and the characters' close
 * skills. Same emptied Danfo Bus Park board as the basics.
 */
import { CHARACTERS } from '../../sim';
import type { CharacterId, GameState } from '../../sim';
import { collected, eventCheck } from '../practice';
import { action, bump, detonate, place, skill, untilEvent, wait, walk } from '../script';
import { PRACTICE_CONFIG, crate, pickup, scenario } from '../setup';
import type { Chapter, PracticeCheck } from '../types';

const HERO = { name: 'YOU', characterId: 'streetBaller' as CharacterId };

function practiceBoard(character: CharacterId, fill: (s: GameState) => void): GameState {
  const s = scenario({
    actors: [{ name: 'YOU', characterId: character, at: [0, 10], facing: 'right' }],
    config: PRACTICE_CONFIG,
  });
  fill(s);
  return s;
}

const mine = <T extends { playerId: number }>(e: T, c: { localId: number }): boolean =>
  e.playerId === c.localId;

export const KICK: Chapter = {
  id: 'kick',
  title: 'Kick (Football Boots)',
  summary: 'Walk into a generator to send it sliding.',
  facts: [
    'With Football Boots, walking into a generator kicks it. There is no extra button.',
    'It slides until a crate, a pillar, a player or another generator stops it, then explodes on its own fuse.',
    "You can kick anyone's generator.",
  ],
  controls: ['move', 'place'],
  demo: {
    build() {
      const s = scenario({ actors: [{ ...HERO, at: [2, 8], facing: 'right' }] });
      pickup(s, 3, 8, 'boots');
      crate(s, 10, 8);
      crate(s, 9, 6);
      return s;
    },
    beats: [
      { caption: 'Football Boots let you kick generators.', acts: { 0: [walk('right', 1)] } },
      {
        caption: 'Drop a generator, step back, then walk into it: no extra button needed.',
        acts: { 0: [walk('right', 1), place, walk('left', 1), wait(20), bump('right')] },
        hold: 60,
      },
      {
        caption:
          'It slides until it hits a crate, a pillar, a player or another generator, then goes off on its own fuse.',
        acts: { 0: [untilEvent('generatorExploded'), wait(70)] },
      },
    ],
  },
  practice: {
    goal: 'Pick up the Football Boots and kick a generator.',
    hint: 'Drop a generator, step off it, then walk back into it. Then get out of its way!',
    build: (c) =>
      practiceBoard(c, (s) => {
        pickup(s, 2, 10, 'boots');
        crate(s, 12, 10);
        crate(s, 0, 4);
      }),
    checks: () => [
      collected('Collect the Football Boots', 'boots'),
      eventCheck('Kick a generator', 'generatorKicked', () => true),
    ],
  },
};

export const PUNCH: Chapter = {
  id: 'punch',
  title: 'Punch (Mechanic Gloves)',
  summary: 'Knock a generator 3 tiles, over walls.',
  facts: [
    'With Mechanic Gloves, face a generator (or stand on it) and press the action button.',
    'It flies 3 tiles in the direction you face, over crates and pillars.',
    'If the landing tile is taken it carries on to the next free tile.',
    'Walking into a generator turns you to face it.',
  ],
  controls: ['move', 'place', 'action'],
  demo: {
    build() {
      const s = scenario({ actors: [{ ...HERO, at: [2, 8], facing: 'right' }] });
      pickup(s, 3, 8, 'gloves');
      crate(s, 5, 8);
      crate(s, 6, 8);
      crate(s, 7, 8);
      return s;
    },
    beats: [
      { caption: 'Mechanic Gloves let you punch generators.', acts: { 0: [walk('right', 1)] } },
      {
        caption: 'Drop one, step back and face it. Walking into it turns you towards it.',
        acts: { 0: [walk('right', 1), place, walk('left', 1), wait(15), bump('right')] },
        hold: 40,
      },
      {
        caption: 'Press the action button: it flies 3 tiles the way you face, right over crates and pillars.',
        acts: { 0: [wait(20), action, untilEvent('generatorThrown')] },
        hold: 110,
      },
      {
        caption: 'Its landing tile held a crate, so it carried on to the next free tile.',
        acts: { 0: [untilEvent('generatorExploded'), wait(60)] },
      },
    ],
  },
  practice: {
    goal: 'Pick up the Mechanic Gloves and punch a generator.',
    hint: 'Face your generator (walk into it) and press the action button.',
    build: (c) =>
      practiceBoard(c, (s) => {
        pickup(s, 2, 10, 'gloves');
        crate(s, 5, 10);
        crate(s, 0, 6);
      }),
    checks: () => [
      collected('Collect the Mechanic Gloves', 'gloves'),
      eventCheck('Punch a generator', 'generatorThrown', mine),
    ],
  },
};

/** Carried a generator and put it down on another tile. */
const carriedAway: PracticeCheck = {
  label: 'Put it down on a different tile',
  create: () => {
    let from: string | null = null;
    return (ctx) => {
      const me = ctx.state.players[ctx.localId]!;
      for (const e of ctx.events) {
        if (e.type === 'generatorCarried' && e.playerId === ctx.localId) from = `${me.x},${me.y}`;
        if (
          e.type === 'generatorDropped' &&
          e.playerId === ctx.localId &&
          from !== null &&
          from !== `${me.x},${me.y}`
        )
          return true;
      }
      return false;
    };
  },
};

export const CARRY: Chapter = {
  id: 'carry',
  title: 'Carry (Generator Grip)',
  summary: 'Pick a generator up, move it, put it down.',
  facts: [
    'With Generator Grip, press the action button on (or facing) a generator to pick it up.',
    'The first pickup adds exactly +1 second to its fuse, once per generator.',
    'It keeps ticking in your hands and can go off there. Carrying gives no protection.',
    'Press the action button again to put it down. With Gloves as well, it is thrown instead.',
  ],
  controls: ['move', 'place', 'action'],
  demo: {
    build() {
      const s = scenario({ actors: [{ ...HERO, at: [2, 8], facing: 'right' }] });
      pickup(s, 3, 8, 'grip');
      crate(s, 8, 6);
      crate(s, 10, 8);
      return s;
    },
    beats: [
      {
        caption: 'Generator Grip: press the action button on a generator to pick it up.',
        acts: { 0: [walk('right', 2), place, wait(20), action] },
        hold: 90,
      },
      {
        caption: 'The first pickup adds exactly +1 second to its fuse. It keeps ticking in your hands!',
        acts: { 0: [walk('right', 4)] },
        hold: 70,
      },
      {
        caption: 'Press the action button again to put it down, then run.',
        acts: { 0: [action, walk('left', 4)] },
        hold: 50,
      },
      {
        caption: 'With Mechanic Gloves as well, the action button throws the carried generator instead.',
        acts: { 0: [untilEvent('generatorExploded'), wait(60)] },
      },
    ],
  },
  practice: {
    goal: 'Pick up the Grip, carry a generator and put it down somewhere else.',
    hint: 'Action button to pick up and to put down. Remember it is still ticking.',
    build: (c) =>
      practiceBoard(c, (s) => {
        pickup(s, 2, 10, 'grip');
        crate(s, 8, 10);
        crate(s, 0, 4);
      }),
    checks: () => [
      collected('Collect the Generator Grip', 'grip'),
      eventCheck('Pick up a generator', 'generatorCarried', mine),
      carriedAway,
    ],
  },
};

/** Started a step onto a tile that holds a grounded generator (only possible with Generator Pass). */
const crossedGenerator: PracticeCheck = {
  label: "Walk onto a generator's tile",
  create: () => (ctx) => {
    const p = ctx.state.players[ctx.localId]!;
    if (p.stepTotal === 0 || p.stepRemaining !== p.stepTotal) return false;
    return ctx.state.generators.some(
      (g) => g.carriedBy === null && g.flight === null && g.x === p.x && g.y === p.y,
    );
  },
};

export const PASS: Chapter = {
  id: 'pass',
  title: 'Generator Pass',
  summary: 'Walk over generators. No fire protection!',
  facts: [
    "Generator Pass lets you walk over generators: yours and your rivals'.",
    'It gives NO protection from fire. Never stand on one that is about to blow.',
    'With Football Boots too, walking into a generator that can slide kicks it instead.',
  ],
  controls: ['move', 'place'],
  demo: {
    build() {
      const s = scenario({
        actors: [
          { ...HERO, at: [2, 8], facing: 'right' },
          { name: 'RIVAL', characterId: 'campusQueen', at: [6, 8], facing: 'down' },
        ],
      });
      pickup(s, 3, 8, 'bombpass');
      crate(s, 10, 8);
      return s;
    },
    beats: [
      {
        caption: "Generator Pass lets you walk over generators: yours and your rivals'.",
        acts: { 0: [walk('right', 1)] },
      },
      {
        caption: 'A rival blocks the lane with a generator. Normally you would have to go round.',
        acts: { 1: [place, walk('down', 2), walk('right', 1)] },
        hold: 90,
      },
      { caption: 'With the pass you walk straight over it...', acts: { 0: [walk('right', 6)] }, hold: 30 },
      {
        caption: '...but it gives NO protection from fire. Never stand on a generator that is about to blow.',
        acts: { 0: [untilEvent('generatorExploded'), wait(60)] },
      },
      {
        caption: 'If you also have Football Boots, walking into a generator that can slide kicks it instead.',
        hold: 220,
      },
    ],
  },
  practice: {
    goal: 'Pick up the Generator Pass and walk over a generator.',
    hint: 'Drop a generator, step off, walk back over it and keep going, out of its lines.',
    build: (c) =>
      practiceBoard(c, (s) => {
        pickup(s, 2, 10, 'bombpass');
        crate(s, 0, 4);
        crate(s, 10, 10);
      }),
    checks: () => [collected('Collect the Generator Pass', 'bombpass'), crossedGenerator],
  },
};

/** One of your remote generators went off before its 20 s failsafe (i.e. you set it off). */
const remoteBoom: PracticeCheck = {
  label: 'Set off a remote generator yourself',
  create: () => {
    let pressedAt = -1e9;
    return (ctx) => {
      if (ctx.intents[ctx.localId]?.detonate) pressedAt = ctx.state.tick;
      return (
        ctx.state.tick - pressedAt <= 1 &&
        ctx.events.some((e) => e.type === 'generatorExploded' && e.ownerId === ctx.localId)
      );
    };
  },
};

export const REMOTE: Chapter = {
  id: 'remote',
  title: 'Remote Starter',
  summary: 'No fuse: set your generators off when you choose.',
  facts: [
    'Generators you place after picking up the Remote Starter have no fuse.',
    'One press of BOOM sets off all your remote generators at once.',
    'Forget one and it goes off by itself after 20 seconds.',
    'Fire and vehicles still set remote generators off at any time.',
  ],
  controls: ['move', 'place', 'detonate'],
  demo: {
    build() {
      const s = scenario({ actors: [{ ...HERO, at: [2, 8], facing: 'right' }] });
      pickup(s, 3, 8, 'remote');
      crate(s, 6, 8);
      crate(s, 4, 10);
      return s;
    },
    beats: [
      {
        caption: 'Remote Starter: generators you place after picking it up have no fuse.',
        acts: { 0: [walk('right', 2), place] },
      },
      {
        caption: 'Get somewhere safe and take your time. It waits for you.',
        acts: { 0: [walk('up', 2), walk('right', 1), wait(90)] },
      },
      {
        caption: 'Press BOOM to set off all your remote generators at once.',
        acts: { 0: [detonate, wait(80)] },
      },
      {
        caption:
          'Forget one and it goes off by itself after 20 seconds. Fire and vehicles still set it off any time.',
        hold: 200,
      },
    ],
  },
  practice: {
    goal: 'Pick up the Remote Starter, drop a generator, get clear and set it off.',
    hint: 'The BOOM control only appears once you have the Remote Starter.',
    build: (c) =>
      practiceBoard(c, (s) => {
        pickup(s, 2, 10, 'remote');
        crate(s, 6, 10);
        crate(s, 0, 6);
      }),
    checks: () => [collected('Collect the Remote Starter', 'remote'), remoteBoom],
  },
};

export const SKILLS: Chapter = {
  id: 'skills',
  title: 'Character skills',
  summary: 'Push, Daze Punch and Shove.',
  facts: [
    ...(['streetBaller', 'lekkiBoy', 'campusQueen'] as CharacterId[]).map((id) => {
      const c = CHARACTERS[id];
      const name = { push: 'Push', daze: 'Daze Punch', shove: 'Shove' }[c.skill];
      return `${c.name}: ${name}.`;
    }),
    'Skills hit the rival right next to you, in the direction you face, then need a few seconds to recharge.',
    'Push and Shove move the rival one tile (if that tile is free). Daze freezes them for 1 second.',
    "Skills never eliminate anyone by themselves, but a push into a flame lane or a vehicle's path does.",
  ],
  controls: ['move', 'skill'],
  demo: {
    build() {
      return scenario({
        actors: [
          { ...HERO, at: [4, 8], facing: 'right' },
          { name: 'LEKKI', characterId: 'lekkiBoy', at: [9, 8], facing: 'left' },
          { name: 'QUEEN', characterId: 'campusQueen', at: [2, 8], facing: 'right' },
          { name: 'DUMMY', characterId: 'streetBaller', at: [6, 8], facing: 'left' },
        ],
      });
    },
    beats: [
      {
        caption: "Every character has a close skill. Street Baller's PUSH moves the rival in front one tile.",
        acts: { 0: [walk('right', 1), wait(20), skill] },
      },
      {
        caption:
          "Lekki Boy's DAZE PUNCH freezes them for a second (then they cannot be dazed again for 2 s).",
        acts: { 1: [walk('left', 1), wait(20), skill], 0: [wait(30), walk('right', 1), walk('up', 2)] },
      },
      {
        caption: "Campus Queen's SHOVE also moves them a tile, and recharges faster.",
        acts: { 1: [walk('right', 1)], 2: [wait(20), walk('right', 4), wait(15), skill] },
      },
      {
        caption:
          "Skills never eliminate anyone by themselves. But a push into a flame lane, or a vehicle's path, does.",
        hold: 240,
      },
    ],
  },
  practice: {
    goal: "Use your character's skill on the dummy.",
    hint: 'Walk up to the dummy so you face it, then press the skill button.',
    build: (c) =>
      scenario({
        actors: [
          { name: 'YOU', characterId: c, at: [2, 8], facing: 'right' },
          {
            name: 'DUMMY',
            characterId: c === 'streetBaller' ? 'lekkiBoy' : 'streetBaller',
            at: [6, 8],
            facing: 'left',
          },
        ],
        config: PRACTICE_CONFIG,
      }),
    checks: () => [
      eventCheck(
        'Use your skill on the dummy',
        'skillUsed',
        (e, c) => e.playerId === c.localId && e.targetId !== null,
      ),
    ],
  },
};
