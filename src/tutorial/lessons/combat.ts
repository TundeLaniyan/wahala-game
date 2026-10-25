/**
 * Combat with button B (tap): the character's melee hit on an adjacent opponent, and, with a Vehicle
 * Voucher and nobody next to you, the one-press signature vehicle (the simulation picks the route).
 */
import { CHARACTERS, VEHICLE_DEFS } from '../../sim';
import type { CharacterId } from '../../sim';
import { collect, eliminatedBy, onEvent, tip, when } from '../practice';
import { special, untilEvent, wait, walk } from '../script';
import { pickup } from '../setup';
import type { Lesson, Mistake, PracticeContext } from '../types';
import { besides, demoBoard, dummy, markAt, practiceBoard, rivalOf } from './common';

const meleeBy = (ctx: PracticeContext) =>
  ctx.events.some((e) => e.type === 'specialUsed' && e.playerId === ctx.localId && e.action === 'melee');

/** B tapped and nothing happened: either nobody adjacent, or the hit is still recharging. */
const bWhiff: Mistake = {
  id: 'b-whiff',
  create: () => (ctx) => {
    if (!ctx.intents[ctx.localId]?.special) return null;
    if (ctx.events.some((e) => e.type === 'specialUsed' && e.playerId === ctx.localId)) return null;
    return besides(ctx, 1)
      ? 'Your hit is recharging. Wait a moment, then tap B again.'
      : 'Nobody is next to you. Walk right up to the dummy first, then tap B.';
  },
};

export const MELEE: Lesson = {
  id: 'melee',
  course: 'combat',
  title: 'Button B: hit',
  summary: 'Tap B next to a rival: push, daze or shove.',
  objective: 'Walk up to the training dummy and tap B to hit it. Then hit it again once B has recharged.',
  facts: [
    "Tap B with an opponent on a tile next to you: your character's hit. Street Baller pushes, Lekki Boy dazes, Campus Queen shoves.",
    'It recharges for a few seconds. B never hits a teammate.',
    'A hit never knocks anyone out by itself, but a push into a blast does.',
  ],
  controls: ['move', 'special'],
  demo: {
    build: () =>
      demoBoard([2, 8], () => undefined, {
        others: [dummy([6, 8]), dummy([14, 0], 'DUMMY 2', 'campusQueen')],
      }),
    beats: [
      { caption: 'Walk right up to a rival...', acts: { 0: [walk('right', 3)] } },
      {
        caption: '...and tap B. Street Baller pushes them a tile.',
        acts: { 0: [wait(20), special] },
        hold: 120,
      },
      {
        caption:
          'It needs a few seconds to recharge. Nobody next to you? Then a tap of B does something else.',
        hold: 200,
      },
    ],
  },
  practice: {
    build: (c) => practiceBoard(c, () => undefined, { others: [dummy([6, 10], 'DUMMY', rivalOf(c))] }),
    tasks: [
      {
        id: 'close',
        label: 'Walk up to the dummy',
        instruction: 'Walk right up next to the training dummy.',
        controls: ['move'],
        markers: markAt([5, 10]),
        done: when((ctx) => besides(ctx, 1)),
        mistakes: [bWhiff],
      },
      {
        id: 'hit',
        label: 'Tap B to hit it',
        instruction: 'Tap {B} to hit the dummy.',
        controls: ['special'],
        done: when(meleeBy),
        mistakes: [bWhiff],
        praise: 'Hit! The dummy never fights back.',
      },
      {
        id: 'again',
        label: 'Hit it again when B is ready',
        instruction:
          'B recharges in a few seconds. Walk up to the dummy again and hit it once more with {B}.',
        controls: ['move', 'special'],
        done: when(meleeBy),
        mistakes: [bWhiff],
        praise: 'Well done! That is your melee.',
      },
    ],
  },
};

export const VEHICLE: Lesson = {
  id: 'vehicle',
  course: 'combat',
  title: 'Button B: your vehicle',
  summary: 'One press calls in your signature vehicle.',
  objective:
    'Collect a Vehicle Voucher, then tap B once (with nobody next to you): your vehicle drives in and hits the dummy.',
  facts: [
    "A Vehicle Voucher calls in YOUR character's own vehicle once.",
    ...(['streetBaller', 'lekkiBoy', 'campusQueen'] as CharacterId[]).map((id) => {
      const v = VEHICLE_DEFS[CHARACTERS[id].vehicle];
      return `${CHARACTERS[id].name}: ${v.name}. ${v.description}.`;
    }),
    'One tap of B with nobody next to you: the game picks the route that threatens a rival most. No route to choose.',
    'The lane flashes and the horn sounds first. Your vehicle can hit you too: keep off its lane.',
  ],
  controls: ['move', 'special'],
  demo: {
    build: () =>
      demoBoard([0, 10], (s) => pickup(s, 1, 10, 'voucher'), {
        others: [dummy([8, 4], 'TARGET'), dummy([14, 0], 'DUMMY 2', 'campusQueen')],
      }),
    beats: [
      { caption: 'Collect a Vehicle Voucher. They hide in crates.', acts: { 0: [walk('right', 1)] } },
      {
        caption:
          'Then tap B, away from other people: your own vehicle comes in by itself, on the best route.',
        acts: { 0: [wait(30), special] },
        hold: 90,
      },
      {
        caption: 'The lane flashes and the horn sounds first. It can hit you too, so stay off it.',
        acts: { 0: [untilEvent('vehicleExited', () => true, 900), wait(30)] },
      },
    ],
  },
  practice: {
    characterChoice: true,
    build: (c) =>
      practiceBoard(c, (s) => pickup(s, 2, 10, 'voucher'), { others: [dummy([8, 4], 'TARGET', rivalOf(c))] }),
    tasks: [
      {
        id: 'voucher',
        label: 'Collect the Vehicle Voucher',
        instruction: 'Walk over the Vehicle Voucher.',
        controls: ['move'],
        markers: markAt([2, 10]),
        done: collect('voucher'),
      },
      {
        id: 'launch',
        label: 'Tap B once to call your vehicle',
        instruction: 'Keep away from the dummy and tap {B} once: your vehicle drives in by itself.',
        controls: ['special'],
        checkpoint: true,
        done: onEvent('specialUsed', (e, c) => e.playerId === c.localId && e.action === 'vehicle'),
        mistakes: [
          tip(
            'melee-instead',
            'With someone right next to you, B is a hit. Step away from the dummy, then tap B to call your vehicle.',
            meleeBy,
          ),
        ],
        praise: 'Here it comes!',
      },
      {
        id: 'hit',
        label: 'Your vehicle hits the dummy',
        instruction: 'Stay off the flashing lane and watch your vehicle hit the dummy.',
        controls: ['move'],
        done: eliminatedBy('vehicle', (id) => id === 1),
        praise: 'Direct hit! One press, one vehicle.',
      },
    ],
  },
};
