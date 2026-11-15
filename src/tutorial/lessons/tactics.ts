/**
 * Generator Tactics (PILOT, docs/TACTICAL_TRAP_PILOT.md, decisions TT1-TT10): short scenarios on small purpose-built
 * boards against real campaign enemy seats played by the real enemy bot, with the Tactical Trap rules switched on
 * through `tacticalTrapLayer()` (the only place the pilot key is ever set; deleting this file and the layer removes the
 * pilot). The rules taught are the real ones:
 *
 *   - an enemy only reacts to a generator it saw (line of sight, vision range), remembers or heard: a body or a wall
 *     between hides it, and a generator under your own feet is hidden until you step off it;
 *   - every attack has a wind-up, the swing and a recovery: after a swing the enemy is stuck for 0.8 s;
 *   - a punch staggers and slows (25 %, then 40 %) but can never finish an enemy: only the blast does.
 *
 * Boards are the Academy's Danfo Bus Park (pillars on every odd / odd tile, open lanes elsewhere). The human carries
 * four health segments and the Street Jab; a third passive bystander keeps the round from ending when the enemy falls.
 */
import { enemyAttackPhase, launchProjectile, previewBlast, tacticalTrapLayer } from '../../sim';
import type { EnemyKind, GameState } from '../../sim';
import { eliminatedBy, failWhen, onEvent, tip, when, whiffedB } from '../practice';
import { place, special, until, untilEvent, wait, walk } from '../script';
import { crate } from '../setup';
import type { Actor } from '../setup';
import type { Detector, Lesson, Mistake, PracticeContext } from '../types';
import { demoBoard, dummy, markAt, practiceBoard } from './common';

const HERO_HP = 4;
/** The generators of these lessons blow after the real 3 s fuse; leaving this late (ticks of fuse left) is the tight, safe exit. */
export const LEAVE_FUSE_TICKS = 36;
/** Against a slow, staggered enemy the exit can start earlier: he cannot walk out of the lanes in time. */
export const SLOW_LEAVE_FUSE_TICKS = 80;
/** Stepping off when he swings pays only if his planted window (wind-up and recovery, about 80 ticks) reaches the blast. */
export const WINDUP_LEAVE_FUSE_TICKS = 100;

const enemy = (kind: EnemyKind, at: [number, number], name: string): Actor => ({
  name,
  characterId: 'lekkiBoy',
  at,
  facing: 'left',
  enemyKind: kind,
  team: 1,
});

const bystander: Actor = dummy([14, 0], 'BYSTANDER', 'campusQueen');

/** Every Generator Tactics board: the human fights with the Street Jab so that the three characters behave alike. */
function fill(s: GameState, extra: (s: GameState) => void = () => undefined): void {
  s.players[0]!.attacks = { primary: 'push', secondary: null };
  s.players[0]!.facing = 'right';
  extra(s);
}

const board = (
  c: Parameters<typeof practiceBoard>[0],
  at: [number, number],
  others: Actor[],
  extra?: (s: GameState) => void,
) => practiceBoard(c, (s) => fill(s, extra), { at, humanHp: HERO_HP, config: tacticalTrapLayer(), others });

const demo = (at: [number, number], others: Actor[], extra?: (s: GameState) => void) =>
  demoBoard(at, (s) => fill(s, extra), { humanHp: HERO_HP, config: tacticalTrapLayer(), others });

// ------------------------------------------------------------------ detectors and helpers

const me = (ctx: PracticeContext) => ctx.state.players[ctx.localId]!;
const foe = (state: GameState) => state.players[1]!;

/** The human's newest timed generator on the floor, or undefined. */
const ownGenerator = (state: GameState, localId: number) =>
  [...state.generators].reverse().find((g) => g.ownerId === localId && g.mode === 'timed');

/** Ticks of fuse the human's generator has left (Infinity when none). */
export const fuseLeft = (state: GameState): number => ownGenerator(state, 0)?.timer ?? Infinity;

/** The enemy is winding up a swing at you, or the fuse is down to the last stretch: time to step off the generator. */
const swingingOrLow = (s: GameState): boolean =>
  (enemyAttackPhase(s, foe(s)) === 'windup' && fuseLeft(s) <= WINDUP_LEAVE_FUSE_TICKS) ||
  fuseLeft(s) <= LEAVE_FUSE_TICKS;

/** The human laid a generator whose blast footprint covers the enemy (so it is a trap, not a decoration). */
const laidOnEnemy: Detector = when((ctx) => {
  const laid = ctx.events.find((e) => e.type === 'generatorPlaced' && e.ownerId === ctx.localId);
  if (!laid || laid.type !== 'generatorPlaced') return false;
  const g = ctx.state.generators.find((o) => o.id === laid.generatorId);
  const e = foe(ctx.state);
  return !!g && e.alive && previewBlast(ctx.state, g).has(e.y * ctx.state.width + e.x);
});

/** The human has punched the enemy twice inside one slow chain: 25 % then the 40 % cap. */
const slowedToCap: Detector = when((ctx) => (ctx.state.tacticalTrap?.slows[1]?.stacks ?? 0) >= 2);

const killedByBlast: Detector = eliminatedBy('flame', (id) => id === 1);

/** Your own blast took a segment from you: the attempt restarts. */
const ownBlastHurt = failWhen(
  'own-blast',
  'Your own blast caught you! Leave the red lanes before the generator blows. Try again.',
  (ctx) =>
    ctx.events.some(
      (e) =>
        e.type === 'campaignHit' &&
        e.victimId === ctx.localId &&
        e.source === 'blast' &&
        e.result !== 'invulnerable',
    ),
);

/** The enemy swung, hit you and you are down to your last segment: stop here and retry. */
const nearlyDown = failWhen(
  'hp',
  'He wore you down. Step back out of his swing next time. Try again.',
  (ctx) => (me(ctx).vitals?.hp ?? HERO_HP) <= 1,
);

/** The blast took him before the steps were done: run the lesson again from the top, one step at a time. */
const fellTooSoon = failWhen(
  'fell-early',
  'He went down before the steps were done: his generator went off too early. Let us run it again, one step at a time.',
  (ctx) => !foe(ctx.state).alive,
);

const gotPunched: Mistake = tip(
  'got-punched',
  'He caught you. Step back along the lane just as he winds up: his swing then hits nothing and he is stuck.',
  (ctx) =>
    ctx.events.some(
      (e) =>
        e.type === 'campaignHit' &&
        e.victimId === ctx.localId &&
        e.source === 'punch' &&
        (e.result === 'damaged' || e.result === 'dazed'),
    ),
);

const lanesMiss: Mistake = tip(
  'lanes-miss',
  'The red lanes did not reach him. Lay it on the tile next to him, in his lane.',
  (ctx) => {
    const laid = ctx.events.find((e) => e.type === 'generatorPlaced' && e.ownerId === ctx.localId);
    if (!laid || laid.type !== 'generatorPlaced') return false;
    const g = ctx.state.generators.find((o) => o.id === laid.generatorId);
    const e = foe(ctx.state);
    return !!g && e.alive && !previewBlast(ctx.state, g).has(e.y * ctx.state.width + e.x);
  },
);

const punchCannotKill: Mistake = tip(
  'punch-cannot-kill',
  'A punch only slows and staggers him: it can never finish him. Only the blast can.',
  (ctx) => {
    const e = foe(ctx.state);
    return (
      e.alive &&
      (e.vitals?.hp ?? 9) <= 1 &&
      ctx.events.some((x) => x.type === 'attackResolved' && x.playerId === ctx.localId && x.hit)
    );
  },
);

const gotAway: Mistake = tip(
  'got-away',
  'He walked out of it. Stay ON the generator and step off only at the last moment, about half a second before it blows.',
  (ctx) =>
    ctx.events.some((e) => e.type === 'generatorExploded' && e.ownerId === ctx.localId) &&
    foe(ctx.state).alive,
);

const leaveInTime: Mistake = tip(
  'leave-late',
  'Get off the generator now: the red lanes are about to burn.',
  (ctx) => {
    const g = ownGenerator(ctx.state, ctx.localId);
    if (!g || g.timer > 20) return false;
    const m = me(ctx);
    return m.alive && g.x === m.x && g.y === m.y;
  },
);

// ------------------------------------------------------------------ 1. the Agbero

export const TRAP_AGBERO: Lesson = {
  id: 'trap-agbero',
  course: 'tactics',
  title: 'Agbero: bait and blast',
  summary: 'Make him swing, then catch him with a generator. A punch cannot finish him.',
  objective:
    'Let the Agbero swing and step back so it misses. He is stuck for a moment: lay a generator next to him, punch him twice to slow him, then leave before it blows.',
  facts: [
    'Every enemy attack has a wind-up, the swing and a recovery. After a swing, hit or miss, the enemy is stuck in place for about 0.8 seconds.',
    'A generator under your own feet is hidden: an enemy only reacts to a generator it has seen, remembered or heard, and a body in the way hides it.',
    'Your punch staggers and slows an enemy (25 %, then 40 %) but can never finish him. Only a generator blast does.',
    'This lesson is a pilot of the Generator Tactics rules; it changes nothing in normal matches.',
  ],
  controls: ['move', 'place', 'special'],
  demo: {
    build: () => demo([6, 10], [enemy('agbero', [12, 10], 'AGBERO'), bystander]),
    beats: [
      {
        caption: 'An Agbero comes for you. When he winds up, step back: his swing hits nothing.',
        acts: {
          0: [
            untilEvent('attackStarted', (e) => e.playerId === 1),
            walk('left', 1),
            untilEvent('attackResolved', (e) => e.playerId === 1),
          ],
        },
        hold: 120,
      },
      {
        caption: 'He is stuck for a moment: step up and lay a generator next to him.',
        acts: { 0: [walk('right', 1), place] },
        hold: 10,
      },
      {
        caption:
          'Stay on it: he cannot see it under your feet. Punch to slow him (it never kills). When he swings again, step back: he is stuck swinging at nothing while it blows.',
        acts: {
          0: [
            wait(2),
            special,
            wait(70),
            special,
            until('he swings, or the fuse is low', (s) => swingingOrLow(s), 400),
            walk('left', 2),
            walk('up', 1),
          ],
        },
        hold: 150,
      },
      {
        caption: 'Only the blast finishes him: a punch never can.',
        acts: { 0: [untilEvent('playerEliminated', (e) => e.playerId === 1, 300), wait(30)] },
        hold: 120,
      },
    ],
  },
  practice: {
    build: (c) => board(c, [6, 10], [enemy('agbero', [12, 10], 'AGBERO'), bystander]),
    tasks: [
      {
        id: 'bait',
        label: 'Make him swing and step back',
        instruction:
          'The Agbero is coming. When he winds up a punch, step back along the lane so it misses. {move}',
        controls: ['move'],
        markers: markAt([5, 10]),
        checkpoint: true,
        done: onEvent('attackResolved', (e) => e.playerId === 1 && !e.hit),
        mistakes: [gotPunched],
        failures: [nearlyDown, fellTooSoon],
        praise: 'He swung at nothing: now he is stuck for a moment.',
      },
      {
        id: 'lay',
        label: 'Lay a generator next to him',
        instruction: 'Step up next to him and lay a generator with {A} so the red lanes reach him.',
        controls: ['move', 'place'],
        done: laidOnEnemy,
        mistakes: [lanesMiss, gotPunched],
        failures: [nearlyDown, fellTooSoon],
        praise: 'He has not seen it: it is under your feet.',
      },
      {
        id: 'slow',
        label: 'Punch him twice to slow him',
        instruction:
          'Stay on the generator and tap {B} when he is next to you. Hit him twice, about a second apart: 25 % slower, then 40 %.',
        controls: ['special'],
        done: slowedToCap,
        mistakes: [
          whiffedB('Nobody is in reach. Stay next to him on the generator, then tap {B}.'),
          punchCannotKill,
          leaveInTime,
        ],
        failures: [nearlyDown, ownBlastHurt, fellTooSoon],
        praise: 'Slowed to the cap. A punch never finishes him.',
        noLaneTip: true,
      },
      {
        id: 'blast',
        label: 'Leave and let the blast finish him',
        instruction:
          'Walk out of the red lanes just before it blows (watch the fuse). The blast, not a punch, takes him down.',
        controls: ['move'],
        done: killedByBlast,
        mistakes: [leaveInTime],
        failures: [ownBlastHurt, nearlyDown],
        praise: 'Caught! Bait the swing, use the recovery, let the generator do the finishing.',
        noLaneTip: true,
      },
    ],
  },
};

// ------------------------------------------------------------------ 2. the Bottle Thrower

/** A crate seals the corner above the thrower: the pocket is a dead end. */
const POCKET: [number, number] = [14, 9];

/**
 * The scene starts with the thrower's bottle already flashing along the lane (the scene's own direction: the same
 * `launchProjectile` the enemy uses), so the lesson opens on the moment that matters: he is committed and planted.
 */
function thrownAtYou(s: GameState): void {
  crate(s, POCKET[0], POCKET[1]);
  const thrower = s.players[1]!;
  thrower.facing = 'left';
  launchProjectile(s, thrower, 'left', []);
}

export const TRAP_THROWER: Lesson = {
  id: 'trap-thrower',
  course: 'tactics',
  title: 'Bottle Thrower: the corner',
  summary: 'Dodge the bottle, then use his recovery to box him into his corner with a generator.',
  objective:
    'Step off the lane when the bottle flashes. While he is stuck after the throw, lay a generator in the lane two tiles from him: his corner has no way out.',
  facts: [
    'A thrower shows a flashing warning along the lane before the bottle moves. After a throw he is stuck for about 0.8 seconds, and a hit that staggers him cuts a throw short.',
    'In a dead end a generator in the lane cannot be dodged: the crate above him seals the corner and the generator itself blocks the way out.',
    'This lesson is a pilot of the Generator Tactics rules; it changes nothing in normal matches.',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () => demo([12, 10], [enemy('thrower', [14, 10], 'THROWER'), bystander], thrownAtYou),
    beats: [
      {
        caption: 'The Thrower has thrown: the lane flashes. Step off it and the bottle flies past.',
        acts: { 0: [walk('up', 1)] },
        hold: 60,
      },
      {
        caption:
          'He is stuck for a moment after a throw. Step back in and lay a generator two tiles from him, then leave the lane.',
        acts: {
          0: [
            until(
              'bottle past',
              (s) => (s.projectiles ?? []).every((p) => (p.path[p.index] ?? 0) % s.width < 12),
              400,
            ),
            walk('down', 1),
            place,
            walk('up', 3),
          ],
        },
        hold: 10,
      },
      {
        caption:
          'The crate seals his corner and the generator seals the lane. He cannot get out: the blast takes him.',
        acts: { 0: [untilEvent('playerEliminated', (e) => e.playerId === 1, 400), wait(30)] },
        hold: 120,
      },
    ],
  },
  practice: {
    build: (c) => board(c, [12, 10], [enemy('thrower', [14, 10], 'THROWER'), bystander], thrownAtYou),
    tasks: [
      {
        id: 'dodge',
        label: 'Step off the lane before the bottle moves',
        instruction:
          'The Thrower has thrown: the lane is flashing. Step up out of the lane so the bottle flies past. {move}',
        controls: ['move'],
        markers: markAt([12, 9]),
        checkpoint: true,
        done: when((ctx) => ctx.state.tick > 8 && me(ctx).y !== 10),
        failures: [nearlyDown, fellTooSoon],
        praise: 'Safe! Now he is stuck for a moment.',
        noLaneTip: true,
      },
      {
        id: 'lay',
        label: 'Step back in and lay a generator',
        instruction:
          'Once the bottle has gone by, step back into the lane two tiles from him and lay a generator with {A}. His corner has no way out.',
        controls: ['move', 'place'],
        markers: markAt([12, 10]),
        done: laidOnEnemy,
        mistakes: [lanesMiss],
        failures: [nearlyDown, fellTooSoon],
        praise: 'Boxed in: the crate above him and your generator in the lane.',
      },
      {
        id: 'blast',
        label: 'Get clear and let it blow',
        instruction: 'Step up out of the red lanes. He cannot dodge from a dead end.',
        controls: ['move'],
        done: killedByBlast,
        failures: [ownBlastHurt, nearlyDown],
        praise: 'Caught in the corner! Use dead ends and recoveries.',
      },
    ],
  },
};

// ------------------------------------------------------------------ 3. the concealed generator

/** The enemy is on one of the human's own generator's lanes right now. */
const enemyInLanes = (state: GameState): boolean => {
  const g = ownGenerator(state, 0);
  const e = foe(state);
  return !!g && e.alive && previewBlast(state, g).has(e.y * state.width + e.x);
};

const seenAndSurvived: Detector = {
  create: () => {
    let exposed = false;
    return (ctx) => {
      if (enemyInLanes(ctx.state)) exposed = true;
      const blew = ctx.events.some((e) => e.type === 'generatorExploded' && e.ownerId === ctx.localId);
      return blew && exposed && foe(ctx.state).alive && me(ctx).alive;
    };
  },
};

export const TRAP_HIDDEN: Lesson = {
  id: 'trap-hidden',
  course: 'tactics',
  title: 'The hidden generator',
  summary:
    'An enemy only reacts to what it saw: compare a generator in plain sight with one under your feet.',
  objective:
    'First lay a generator in plain sight beside the guard and step aside: he runs. Then lay one under your feet and stay on it: he never sees it.',
  facts: [
    'An enemy sees a generator only within its vision range and with a clear line: a wall, a crate or any body in the way hides it, and so does a body standing on it.',
    'It still reacts to flames, warnings and remote generators at once. And it hears a generator laid close by: it stops its next attack for a moment, but does not learn where it is.',
    'Once it has seen one it remembers it: stepping in front of it later does not hide it.',
  ],
  controls: ['move', 'place'],
  demo: {
    build: () => demo([6, 10], [enemy('guard', [9, 10], 'GUARD'), bystander]),
    beats: [
      {
        caption: 'In plain sight: lay a generator beside the guard and step off the lane...',
        acts: {
          0: [
            until(
              'guard close',
              (s) => Math.abs(foe(s).x - s.players[0]!.x) + Math.abs(foe(s).y - s.players[0]!.y) <= 1,
              600,
            ),
            place,
            walk('up', 3),
          ],
        },
        hold: 60,
      },
      {
        caption: 'It saw it and ran. A generator in plain sight is something an enemy keeps clear of.',
        acts: { 0: [untilEvent('generatorExploded', (e) => e.ownerId === 0, 400), wait(60)] },
      },
      {
        caption: 'Now hide it: lay one under your feet and stay on it, so he cannot see it.',
        acts: {
          0: [
            walk('down', 3),
            until(
              'guard close',
              (s) => Math.abs(foe(s).x - s.players[0]!.x) + Math.abs(foe(s).y - s.players[0]!.y) <= 1,
              600,
            ),
            place,
          ],
        },
        hold: 60,
      },
      {
        caption: 'Step off at the last moment. It never saw it.',
        acts: {
          0: [
            until('fuse low', (s) => fuseLeft(s) <= LEAVE_FUSE_TICKS, 400),
            walk('up', 3),
            untilEvent('playerEliminated', (e) => e.playerId === 1, 300),
            wait(60),
          ],
        },
      },
    ],
  },
  practice: {
    build: (c) => board(c, [6, 10], [enemy('guard', [12, 10], 'GUARD'), bystander]),
    tasks: [
      {
        id: 'plain',
        label: 'In plain sight: lay it and step aside',
        instruction:
          'Wait until the guard is next to you, lay a generator with {A}, then step up the lane out of the red lanes. Watch what he does.',
        controls: ['place', 'move'],
        checkpoint: true,
        done: seenAndSurvived,
        mistakes: [lanesMiss, gotPunched],
        failures: [
          ownBlastHurt,
          nearlyDown,
          failWhen(
            'caught-anyway',
            'That one caught him: he was not looking. For this run, lay it and leave at once, and watch him run. Try again.',
            (ctx) => !foe(ctx.state).alive,
          ),
        ],
        praise: 'It saw it and ran. A generator in plain sight rarely catches anybody.',
        noLaneTip: true,
      },
      {
        id: 'hidden',
        label: 'Hidden: stay on it',
        instruction:
          'Again, but this time stay ON the generator after you lay it: your body hides it. Step off at the last moment, up the lane.',
        controls: ['place', 'move'],
        done: killedByBlast,
        mistakes: [lanesMiss, gotPunched, leaveInTime, gotAway],
        failures: [ownBlastHurt, nearlyDown],
        praise: 'It never saw it. What an enemy has not seen, it cannot dodge.',
        noLaneTip: true,
      },
    ],
  },
};

export const TACTICS_LESSONS: readonly Lesson[] = [TRAP_AGBERO, TRAP_THROWER, TRAP_HIDDEN];
