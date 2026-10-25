/**
 * Match rules: the mandatory Wahala Crush of every Classic match (with the final-30-second floor traps),
 * and short interactive introductions to the three City Rumble rulesets (src/sim/modes.ts): Survival
 * (elimination rewards), Deathmatch (respawns) and Team Rumble (teammates vs enemies). Each scenario runs
 * the real ruleset; the only liberty taken is starting the Crush lesson's clock at 0:47.
 */
import { ticks } from '../../sim';
import type { GameState } from '../../sim';
import { eliminatedBy, onEvent, placeRefused, reach, tip, when, wrongWay } from '../practice';
import { place, untilEvent, wait, walk } from '../script';
import { playTickAtRemaining } from '../setup';
import type { Lesson, PracticeContext } from '../types';
import { besides, demoBoard, dummy, markAt, practiceBoard, rivalOf } from './common';

/** The Crush lesson starts with this much time on the clock (the walls start at 0:45). */
const CRUSH_START_S = 47;
const CRUSH_CONFIG = { match: { durationTicks: ticks(120) } };

const toCrush = (s: GameState): GameState => {
  s.match.playTicks = playTickAtRemaining(s, CRUSH_START_S);
  return s;
};

const onCrushTile = (ctx: PracticeContext): boolean => {
  const p = ctx.state.players[ctx.localId]!;
  const i = p.y * ctx.state.width + p.x;
  return p.alive && !!ctx.state.crush?.pending.some((c) => c.index === i);
};

const CRUSH_TIP = tip(
  'crush-tile',
  'Flashing red tile! Step off it now: a concrete block lands there.',
  onCrushTile,
);

export const CRUSH: Lesson = {
  id: 'crush',
  course: 'modes',
  title: 'Wahala Crush',
  summary: 'Every Classic match: the walls close in.',
  objective:
    'Survive Wahala Crush: get to the middle while the walls close in, and stay alive until the 0:30 floor traps.',
  facts: [
    'Every Classic match ends with Wahala Crush. It cannot be switched off.',
    'From 0:45 the arena fills with concrete from the outside in, one telegraphed tile at a time.',
    'A flashing tile becomes concrete about a second later. Anyone standing on it is out.',
    'In the final 30 seconds floor traps (potholes and oil) land too, in every match.',
  ],
  controls: ['move'],
  demo: {
    build: () =>
      toCrush(demoBoard([2, 8], () => undefined, { settings: { mode: 'crush' }, config: CRUSH_CONFIG })),
    beats: [
      {
        caption: '(The clock starts at 0:47 for this lesson.) Every Classic match ends with Wahala Crush.',
        acts: { 0: [walk('up', 4)] },
      },
      {
        caption: 'From 0:45 the edge fills with concrete, one flashing tile at a time. Head for the middle!',
        acts: { 0: [walk('right', 5), untilEvent('crushLanded'), wait(120)] },
      },
      { caption: 'Never stand on a flashing tile: it becomes concrete about a second later.', hold: 200 },
    ],
  },
  practice: {
    build: (c) =>
      toCrush(
        practiceBoard(c, () => undefined, { at: [2, 8], settings: { mode: 'crush' }, config: CRUSH_CONFIG }),
      ),
    tasks: [
      {
        id: 'centre',
        label: 'Get to the middle',
        instruction: 'The walls close in from the edge at 0:45. Walk to the marker in the middle.',
        controls: ['move'],
        markers: markAt([7, 4]),
        done: reach(7, 4),
        mistakes: [CRUSH_TIP, wrongWay({ x: 7, y: 4 })],
      },
      {
        id: 'survive',
        label: 'Stay alive until 0:30',
        instruction: 'Stay alive until the floor traps arrive at 0:30. Keep off every flashing tile.',
        controls: ['move'],
        done: when((ctx) => ctx.state.players[ctx.localId]!.alive && ctx.state.endgameTraps.live >= 1),
        mistakes: [CRUSH_TIP],
        praise: 'You survived the Crush! Real matches go on until one player is left.',
      },
    ],
  },
};

export const SURVIVAL: Lesson = {
  id: 'survival',
  course: 'modes',
  title: 'Survival: elimination rewards',
  summary: 'City Rumble: one life, every elimination powers you up.',
  objective:
    'Catch the dummy: in Survival every elimination you are credited with powers you up at once. Then use your reward.',
  facts: [
    'Survival: one life each, last one standing wins, and the city closes in.',
    'Crates hold no pickups here: power comes from eliminations, given straight to whoever gets the credit.',
    'The first reward is an Extra Socket and a Petrol Top-Up; later ones bring Armour, Square Blast and more.',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () =>
      demoBoard([0, 10], () => undefined, {
        settings: { game: 'survival' },
        others: [dummy([4, 10]), dummy([14, 0], 'DUMMY 2', 'campusQueen')],
      }),
    beats: [
      {
        caption: 'City Rumble Survival: one life, and every elimination powers you up at once.',
        acts: { 0: [walk('right', 2)] },
      },
      {
        caption: 'Catch a rival...',
        acts: { 0: [place, walk('up', 3), untilEvent('generatorExploded')] },
        hold: 30,
      },
      {
        caption:
          '...and your reward arrives straight away: an Extra Socket and a Petrol Top-Up. Check your upgrades.',
        acts: { 0: [wait(160)] },
      },
    ],
  },
  practice: {
    build: (c) =>
      practiceBoard(c, () => undefined, {
        settings: { game: 'survival' },
        others: [dummy([4, 10], 'DUMMY', rivalOf(c)), dummy([14, 0], 'DUMMY 2', 'campusQueen')],
      }),
    tasks: [
      {
        id: 'reward',
        label: 'Catch the dummy and earn a reward',
        instruction: 'Catch the marked dummy with your blast, and stay clear yourself.',
        controls: ['move', 'place'],
        markers: (s) => [{ x: s.players[1]!.x, y: s.players[1]!.y }],
        done: when(
          (ctx) =>
            ctx.state.players[ctx.localId]!.alive &&
            ctx.events.some((e) => e.type === 'rewardGranted' && e.playerId === ctx.localId),
        ),
        praise: 'Reward! Extra Socket and Petrol Top-Up, straight away.',
      },
      {
        id: 'use',
        label: 'Use it: two generators at once',
        instruction: 'Your reward lets you have two generators down at once. Place two, then get clear.',
        controls: ['place'],
        checkpoint: true,
        done: when((ctx) => ctx.state.generators.filter((g) => g.ownerId === ctx.localId).length >= 2),
        mistakes: [placeRefused('Wait until your first generators have gone off.')],
        praise: 'Well done! That is how a Survival fighter grows.',
      },
    ],
  },
};

export const DEATHMATCH: Lesson = {
  id: 'deathmatch',
  course: 'modes',
  title: 'Deathmatch: respawns',
  summary: 'Caught? You come back. Most eliminations wins.',
  objective:
    'See a respawn for yourself, then score an elimination: in Deathmatch the most eliminations wins.',
  facts: [
    'Deathmatch lasts 5 or 10 minutes. Caught? You come back after 3 seconds, with a moment of spawn protection.',
    'Your upgrades reset when you are caught: rewards last one life.',
    'The most credited eliminations when time runs out wins (then fewer deaths, then assists).',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () =>
      demoBoard([0, 10], () => undefined, {
        settings: { game: 'deathmatch', durationSec: 300 },
        others: [dummy([8, 6])],
      }),
    beats: [
      {
        caption: 'Deathmatch: being caught is not the end.',
        acts: { 0: [wait(20), place, untilEvent('playerEliminated')] },
      },
      {
        caption: 'You come back after 3 seconds, protected for a moment.',
        acts: { 0: [untilEvent('playerRespawned', () => true, 400)] },
      },
      { caption: 'Then go and score: the most eliminations when time runs out wins.', hold: 180 },
    ],
  },
  practice: {
    onCaught: 'respawn',
    build: (c) =>
      practiceBoard(c, () => undefined, {
        settings: { game: 'deathmatch', durationSec: 300 },
        others: [dummy([8, 6], 'DUMMY', rivalOf(c))],
      }),
    tasks: [
      {
        id: 'respawn',
        label: 'Get caught and respawn',
        instruction: 'Try it: place a generator with {A} and stay on it. You will come back.',
        controls: ['place'],
        noLaneTip: true,
        done: onEvent('playerRespawned', (e, c) => e.playerId === c.localId),
        praise: 'Back in the game!',
      },
      {
        id: 'score',
        label: 'Catch the dummy',
        instruction: 'Now score: catch the marked dummy with your blast.',
        controls: ['move', 'place'],
        markers: (s) => [{ x: s.players[1]!.x, y: s.players[1]!.y }],
        done: eliminatedBy('flame', (id) => id === 1),
        praise: 'One elimination to you!',
      },
      {
        id: 'back',
        label: 'Watch the dummy come back',
        instruction: 'The dummy comes back too. In a real Deathmatch, keep scoring until time runs out.',
        controls: ['move'],
        done: onEvent('playerRespawned', (e) => e.playerId === 1),
        praise: 'Well done! That is Deathmatch.',
      },
    ],
  },
};

export const TEAM: Lesson = {
  id: 'team',
  course: 'modes',
  title: 'Team Rumble: friend or enemy',
  summary: 'Your fire spares teammates; B never hits them.',
  objective:
    'Catch the enemy with a blast that also covers your teammate (who is safe), then see that B never hits a teammate.',
  facts: [
    'Team Rumble: Deathmatch rules in teams (Green v White). Team eliminations decide it.',
    'Your blasts and vehicles spare teammates (unless friendly fire is switched on). They still hurt you!',
    'B never hits a teammate.',
  ],
  controls: ['move', 'place', 'special'],
  demo: {
    build: () =>
      demoBoard([0, 10], () => undefined, {
        settings: { game: 'team' },
        others: [
          { ...dummy([2, 8], 'ENEMY'), team: 1 },
          { ...dummy([4, 10], 'MATE', 'campusQueen'), team: 0 },
        ],
      }),
    beats: [
      { caption: 'Team Rumble: MATE is on your team, ENEMY is not.', acts: { 0: [walk('right', 2)] } },
      {
        caption: 'Your blast covers both of them...',
        acts: { 0: [place, walk('up', 3), untilEvent('generatorExploded')] },
        hold: 30,
      },
      { caption: '...but only the enemy is caught. Your fire spares teammates.', acts: { 0: [wait(150)] } },
    ],
  },
  practice: {
    onCaught: 'respawn',
    build: (c) =>
      practiceBoard(c, () => undefined, {
        settings: { game: 'team' },
        others: [
          { ...dummy([2, 8], 'ENEMY', rivalOf(c)), team: 1 },
          { ...dummy([4, 10], 'MATE', 'campusQueen'), team: 0 },
        ],
      }),
    tasks: [
      {
        id: 'enemy',
        label: 'Catch the enemy, spare your mate',
        instruction:
          'Place a generator on the marker: its blast covers ENEMY and your teammate MATE. Get clear and watch who is caught.',
        controls: ['move', 'place'],
        markers: markAt([2, 10]),
        done: when(
          (ctx) =>
            ctx.state.players[2]!.alive &&
            ctx.state.players[ctx.localId]!.alive &&
            ctx.events.some(
              (e) => e.type === 'playerEliminated' && e.playerId === 1 && e.creditId === ctx.localId,
            ),
        ),
        praise: 'Enemy caught, teammate safe!',
      },
      {
        id: 'mate',
        label: 'Tap B next to your teammate',
        instruction: 'Stand next to MATE and tap {B}: nothing happens. B never hits a teammate.',
        controls: ['move', 'special'],
        done: when(
          (ctx) =>
            !!ctx.intents[ctx.localId]?.special &&
            besides(ctx, 2) &&
            !besides(ctx, 1) &&
            !ctx.events.some((e) => e.type === 'specialUsed' && e.playerId === ctx.localId),
        ),
        mistakes: [
          tip(
            'not-next',
            'Walk right up next to MATE first, then tap B.',
            (ctx) => !!ctx.intents[ctx.localId]?.special && !besides(ctx, 2),
          ),
        ],
        praise: 'Right: B never hits a teammate. Well done!',
      },
    ],
  },
};

/** Exported for the tests (the clock skip is announced in the first caption). */
export const CRUSH_START_SECONDS = CRUSH_START_S;
