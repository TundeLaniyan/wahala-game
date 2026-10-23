/**
 * Arena lessons: stage hazards (depend on the arena), the mandatory final-30-second floor traps
 * (every match, cannot be switched off), the Surulere Power Yard blast rule and City Rumble.
 */
import { ARENAS, CITY_RUMBLE_ID, STANDARD_ARENA_IDS, Tile, getArena, ticks } from '../../sim';
import type { CharacterId, GameState } from '../../sim';
import { stateCheck } from '../practice';
import { direct, place, until, untilEvent, wait, walk } from '../script';
import { PRACTICE_CONFIG, crate, playTickAtRemaining, scenario } from '../setup';
import type { Chapter, PracticeCheck } from '../types';

const HERO = { name: 'YOU', characterId: 'streetBaller' as CharacterId };

/** Moves the match clock forward (never back) to `seconds` left; always announced in the caption. */
const skipTo = (seconds: number) =>
  direct((s) => {
    s.match.playTicks = Math.max(s.match.playTicks, playTickAtRemaining(s, seconds));
  });

const settled = until(
  'standing still',
  (s) => !s.players[0]!.slide && s.players[0]!.stepRemaining === 0,
  300,
);

export const HAZARDS: Chapter = {
  id: 'hazards',
  title: 'Stage hazards',
  summary: 'Every arena has its own dangers.',
  facts: [
    'Stage hazards depend on the arena. They are part of it and always on in real matches.',
    'Every deadly hazard is telegraphed first (flashing tiles, a horn or arrows). An Okada absorbs one hit.',
    ...STANDARD_ARENA_IDS.map((id) => getArena(id))
      .filter((a) => a.info.hazards.length > 0)
      .map((a) => `${a.name}: ${a.info.hazards.join(' ')}`),
  ],
  controls: ['move'],
  demo: {
    build() {
      const s = scenario({ actors: [{ ...HERO, at: [3, 8], facing: 'right' }], stage: true });
      // the bay Danfo's first visit comes early so the lesson does not wait 12 s for it
      s.stage.nextAt[0] = 40;
      return s;
    },
    beats: [
      {
        caption: 'Every arena has its own stage hazards. In Danfo Bus Park, buses nose into the side bays.',
        acts: { 0: [untilEvent('stageWarning')] },
        hold: 90,
      },
      {
        caption: 'Watch for the warning: the lane flashes and the horn sounds 2 seconds before. Keep out!',
        acts: { 0: [until('bus gone', (s) => s.stage.events.length === 0), wait(30)] },
      },
      {
        caption: 'Oil stains slide you 2 tiles further the way you were walking.',
        acts: { 0: [walk('right', 2), settled, wait(30)] },
      },
      {
        caption: 'Broken tarmac (a pothole) trips you for a moment.',
        acts: { 0: [walk('right', 1), walk('up', 2), wait(70)] },
      },
      {
        caption:
          'Other arenas bring their own: traffic, falling debris, wind, floods, power surges, manholes. See the list.',
        hold: 280,
      },
    ],
  },
};

export const ENDGAME: Chapter = {
  id: 'endgame',
  title: 'Final 30 seconds: floor traps',
  summary: 'Every match, every arena. Cannot be switched off.',
  facts: [
    'In EVERY match, in every arena, the floor turns on you at the end.',
    'At 0:30 a wave of potholes and oil slicks is telegraphed for 1.5 s, then goes live. A second wave lands at 0:15.',
    'Potholes trip you; oil slides you. They never eliminate you by themselves, but they can drop you into a blast.',
    'They are not a setting: nothing turns them off. (Stage hazards depend on the arena; these do not.)',
  ],
  controls: ['move'],
  demo: {
    build() {
      // stage hazards OFF for this lesson, on purpose: the endgame traps still come
      const s = scenario({ actors: [{ ...HERO, at: [4, 8], facing: 'right' }] });
      s.match.playTicks = playTickAtRemaining(s, 33.5);
      return s;
    },
    beats: [
      {
        caption: 'Every match, in every arena: in the final 30 seconds the floor itself turns on you.',
        acts: { 0: [until('first wave warned', (s) => s.endgameTraps.warned >= 1)] },
        hold: 90,
      },
      {
        caption: 'The tiles flash for 1.5 s, then the traps go live at 0:30.',
        acts: { 0: [until('first wave live', (s) => s.endgameTraps.live >= 1), wait(60)] },
      },
      {
        caption:
          'Potholes trip you and oil slides you. Not deadly by themselves, but they can drop you into a blast.',
        acts: { 0: [walk('right', 3), wait(80)] },
      },
      {
        caption: '(Skipping ahead to 0:16.) A second wave lands at 0:15.',
        acts: {
          0: [skipTo(16.6), until('second wave live', (s) => s.endgameTraps.live >= 2), wait(60)],
        },
      },
      {
        caption:
          "This lesson switched the bus park's own hazards off, yet the traps still came. Nothing turns them off.",
        hold: 280,
      },
    ],
  },
};

const yard = ARENAS.surulerePowerYard!;

/** The dummy went down to the human's fire while the human stayed standing. */
const caughtBehindPillar: PracticeCheck = {
  label: 'Catch the dummy behind the pillar with your blast, and stay out of it yourself',
  create: () => (ctx) =>
    ctx.state.players[ctx.localId]!.alive &&
    ctx.events.some(
      (e) =>
        e.type === 'playerEliminated' &&
        e.playerId !== ctx.localId &&
        e.cause.kind === 'flame' &&
        e.cause.ownerId === ctx.localId,
    ),
};

export const POWER_YARD: Chapter = {
  id: 'powerYard',
  title: 'Surulere Power Yard rule',
  summary: 'Blasts fill the whole row and column.',
  facts: [
    yard.info.ruleWarning ?? '',
    'Crates in the line all break, and a pillar does not shelter you. Pillars still block walking.',
    'Everyone starts with 2 generators (up to 4). There are no fire-range pickups here: range means nothing.',
    'The rule is shown on the arena card and before every match there.',
  ],
  controls: ['move', 'place'],
  demo: {
    build() {
      const s = scenario({
        arenaId: yard.id,
        actors: [
          { ...HERO, at: [3, 6], facing: 'right' },
          { name: 'DUMMY', characterId: 'lekkiBoy', at: [3, 10], facing: 'up' },
          { name: 'DUMMY 2', characterId: 'campusQueen', at: [14, 0], facing: 'left' },
        ],
      });
      for (const [x, y] of [
        [8, 6],
        [10, 6],
        [12, 6],
        [3, 2],
        [3, 0],
      ] as const)
        crate(s, x, y);
      return s;
    },
    beats: [
      {
        caption: 'Surulere Power Yard has its own blast rule. It is shown before every match there.',
        hold: 220,
      },
      {
        caption:
          'Here every blast fills its WHOLE row and column, right to the walls. Get out of both lines!',
        acts: { 0: [wait(20), place, walk('right', 1), walk('down', 2)] },
        hold: 60,
      },
      {
        caption:
          'Straight through pillars and crates: every crate in the line breaks, and a pillar is no shelter.',
        acts: { 0: [untilEvent('generatorExploded'), wait(90)] },
      },
      {
        caption: 'Everyone starts with 2 generators here (up to 4), and there are no fire-range pickups.',
        hold: 240,
      },
    ],
  },
  practice: {
    goal: 'Catch the dummy hiding behind a pillar.',
    hint: "Line up with the dummy's row or column; the pillar will not stop the blast. Then get out of both lines.",
    build: (c) => {
      const s = scenario({
        arenaId: yard.id,
        actors: [
          { name: 'YOU', characterId: c, at: [0, 10], facing: 'right' },
          {
            name: 'DUMMY',
            characterId: c === 'lekkiBoy' ? 'streetBaller' : 'lekkiBoy',
            at: [7, 4],
            facing: 'down',
          },
        ],
        config: PRACTICE_CONFIG,
      });
      for (const [x, y] of [
        [4, 10],
        [0, 6],
        [10, 4],
      ] as const)
        crate(s, x, y);
      return s;
    },
    checks: () => [caughtBehindPillar],
  },
};

/** Is the tile inside City Rumble's centre square that never closes? */
export function inRumbleCore(state: GameState, x: number, y: number): boolean {
  const core = state.config.crush.keepCore;
  if (!core) return false;
  const x0 = Math.floor((state.width - core.w) / 2);
  const y0 = Math.floor((state.height - core.h) / 2);
  return x >= x0 && x < x0 + core.w && y >= y0 && y < y0 + core.h;
}

function clear(s: GameState, tiles: readonly (readonly [number, number])[]): void {
  for (const [x, y] of tiles) {
    const i = y * s.width + x;
    if (s.tiles[i] === Tile.Soft) s.tiles[i] = Tile.Empty;
    delete s.hidden[i];
  }
}

const RUMBLE_DUMMIES = ['Chi_Boy', 'T_Blaze', 'Yaba_King', 'Ola_99', 'Sade_X', 'Kunle_Z', 'Ife_Star'];
const CAST: CharacterId[] = ['lekkiBoy', 'campusQueen', 'streetBaller'];

function rumble(character: CharacterId, practice: boolean): GameState {
  const s = scenario({
    arenaId: CITY_RUMBLE_ID,
    keepCrates: true,
    seed: 23,
    actors: [
      {
        name: 'YOU',
        characterId: character,
        ...(practice ? {} : { at: [10, 24] as [number, number] }),
        facing: 'up',
      },
      ...RUMBLE_DUMMIES.map((name, i) => ({ name, characterId: CAST[i % 3]! })),
    ],
    config: practice ? { match: { durationTicks: ticks(600) } } : undefined,
  });
  if (!practice)
    clear(s, [
      [16, 18],
      [16, 17],
    ]);
  return s;
}

// Read the real City Rumble timing from the arena data so the lesson never drifts from the rules.
const RUMBLE_CONFIG = ARENAS[CITY_RUMBLE_ID]!.config!;
const RUMBLE_MINUTES = Math.round((RUMBLE_CONFIG.match?.durationTicks ?? 0) / 3600);
const CLOSE_LEFT_S = Math.round((RUMBLE_CONFIG.crush?.startRemainingTicks ?? 0) / 60);
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const CITY_RUMBLE: Chapter = {
  id: 'cityRumble',
  title: 'City Rumble & the minimap',
  summary: 'You against up to 31 bots across a whole district.',
  facts: [
    `${ARENAS[CITY_RUMBLE_ID]!.info.tagline}`,
    `A 41 x 31 tile district. The match lasts ${RUMBLE_MINUTES} minutes.`,
    'The camera follows you. Press O (or the camera button at the top) to switch to the whole-city view.',
    'The minimap (top right) shows the avenues, everyone still standing, the closing ring and the central square.',
    `From ${clock(CLOSE_LEFT_S)} left the outer streets fill with concrete ring by ring; the central square never closes.`,
    'Buses cross the wide avenues (the lane flashes 2.5 s before) until the closing starts.',
    'The final-30-second floor traps land in the central square, as in every match.',
  ],
  controls: ['move', 'place', 'camera'],
  demo: {
    build: () => rumble('streetBaller', false),
    beats: [
      {
        caption:
          'City Rumble: you against up to 31 bots across a whole Lagos district. Last one standing wins.',
        acts: { 0: [walk('up', 4)] },
      },
      {
        caption: 'The camera follows you here. Press O, or the camera button, for the whole-city view.',
        acts: { 0: [walk('right', 6)] },
      },
      {
        caption: 'The minimap (top right) shows the avenues, everyone still standing and the safe central square.',
        acts: { 0: [walk('up', 2)] },
      },
      {
        caption:
          `(Skipping ahead to ${clock(CLOSE_LEFT_S + 1)}.) From ${clock(CLOSE_LEFT_S)} left the outer streets fill with concrete, ring by ring.`,
        acts: {
          0: [skipTo(CLOSE_LEFT_S + 1), untilEvent('crushWarning'), wait(60)],
        },
      },
      {
        caption: 'The central square never closes: be there before the city closes in around it.',
        hold: 260,
      },
    ],
  },
  practice: {
    goal: 'Find your way into the central square.',
    hint: 'Follow the wide avenues; blast crates if they block a short cut.',
    build: (c) => rumble(c, true),
    checks: () => [
      stateCheck('Reach the central square', (s, id) => {
        const p = s.players[id]!;
        return p.alive && inRumbleCore(s, p.x, p.y);
      }),
    ],
  },
};
