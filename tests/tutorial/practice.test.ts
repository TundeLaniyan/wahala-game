import { describe, expect, it } from 'vitest';
import { useGameStore } from '../../src/app/store';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import type { CharacterId } from '../../src/sim';
import { CHAPTERS, ScriptRunner } from '../../src/tutorial';
import {
  action,
  bump,
  detonate,
  place,
  skill,
  untilEvent,
  untilNoFlames,
  wait,
  walk,
} from '../../src/tutorial/script';
import type { Act, UiCommand } from '../../src/tutorial/types';
import { put } from '../../src/tutorial/setup';
import { chapterIndex, rig } from './harness';
import type { Rig } from './harness';

/**
 * Practices are played by a "human" whose presses go through the real input port (the same path
 * as the keyboard / touch controls), and the success checks must tick only when the goal is met.
 */
function drive(r: Rig, acts: Act[], extra: (r: Rig) => void = () => undefined, limit = 3000): void {
  const runner = new ScriptRunner([{ caption: 'solution', acts: { 0: acts }, hold: 0 }]);
  for (let i = 0; i < limit; i++) {
    const s = r.match.state!;
    const step = runner.beforeTick(s);
    r.input.next = { ...step.intents[0] };
    for (const cmd of step.ui) ui(r, cmd);
    const events = r.match.stepOnce();
    runner.afterTick(s, events);
    extra(r);
    r.tutorial.frame();
    if (useGameStore.getState().tutorial?.practice?.complete) return;
  }
}

/** Vehicle selector operations a human makes: the vehicle key, then Enter (handleNav). */
function ui(r: Rig, cmd: UiCommand): void {
  if (cmd.kind === 'vehiclePress') r.input.vehicle = true;
  else if (cmd.kind === 'nav') r.match.handleNav(cmd.command);
}

function practise(id: string, character: CharacterId = 'streetBaller'): Rig {
  const r = rig(character);
  r.tutorial.open(chapterIndex(id));
  r.tutorial.practice();
  return r;
}

const view = () => useGameStore.getState().tutorial!;

const SOLUTIONS: Record<string, Act[]> = {
  move: [walk('up', 2), walk('right', 4), walk('down', 2), walk('right', 6), walk('up', 8), walk('left', 2)],
  generator: [
    walk('up', 2),
    walk('right', 2),
    place,
    walk('down', 2),
    walk('left', 1),
    untilEvent('generatorExploded'),
    untilNoFlames,
    wait(10),
    walk('left', 1),
    walk('up', 2),
    place,
    walk('down', 2),
    walk('right', 1),
  ],
  sockets: [walk('right', 2), place, walk('right', 2), place, walk('up', 2), walk('right', 1)],
  range: [walk('up', 2), walk('down', 2), walk('right', 6), place, walk('left', 2), walk('up', 2)],
  kick: [walk('right', 3), place, walk('left', 1), wait(10), bump('right')],
  punch: [walk('right', 3), place, walk('left', 1), wait(10), bump('right'), wait(10), action],
  carry: [walk('right', 3), place, action, walk('right', 2), action, walk('left', 3)],
  pass: [walk('right', 2), place, walk('left', 1), walk('right', 4)],
  remote: [walk('right', 2), place, walk('up', 2), walk('right', 1), wait(30), detonate],
  skills: [walk('right', 3), wait(5), skill],
  powerYard: [walk('up', 2), walk('right', 7), place, walk('left', 1), walk('down', 2)],
};

describe('practice scenarios', () => {
  it('every chapter but the stage-hazard and endgame lessons has a practice', () => {
    const without = CHAPTERS.filter((c) => !c.practice).map((c) => c.id);
    expect(without).toEqual(['hazards', 'endgame']);
  });

  for (const [id, acts] of Object.entries(SOLUTIONS)) {
    it(`${id}: a correct attempt completes every check`, () => {
      const r = practise(id);
      expect(view().mode).toBe('practice');
      expect(view().practice!.complete).toBe(false);
      drive(r, acts);
      expect(view().practice!.checks.filter((c) => !c.done)).toEqual([]);
      expect(view().practice!.complete).toBe(true);
      expect(r.match.state!.players[0]!.alive).toBe(true);
    });
  }

  it('standing still completes nothing', () => {
    for (const c of CHAPTERS.filter((ch) => ch.practice)) {
      const r = practise(c.id);
      for (let i = 0; i < 600; i++) r.match.stepOnce();
      expect(
        view().practice!.checks.some((k) => k.done),
        c.id,
      ).toBe(false);
    }
  });

  it('dummies are passive: nobody but the human ever acts', () => {
    const r = practise('skills');
    for (let i = 0; i < 900; i++) r.match.stepOnce();
    const s = r.match.state!;
    expect(s.generators).toEqual([]);
    expect(s.players[1]!.x).toBe(6);
    expect(s.players[1]!.y).toBe(8);
  });

  for (const character of ['streetBaller', 'lekkiBoy', 'campusQueen'] as CharacterId[]) {
    it(`vehicle (${character}): voucher, VEHICLE key, confirm (and the Keke turn) launches`, () => {
      const r = practise('vehicle', character);
      expect(view().practice!.characterChoice).toBe(true);
      const confirms: Act[] =
        character === 'campusQueen'
          ? [
              { kind: 'ui', command: { kind: 'nav', command: 'confirm' } },
              wait(20),
              { kind: 'ui', command: { kind: 'nav', command: 'confirm' } },
            ]
          : [{ kind: 'ui', command: { kind: 'nav', command: 'confirm' } }];
      drive(r, [
        walk('right', 2),
        wait(10),
        { kind: 'ui', command: { kind: 'vehiclePress' } },
        wait(30),
        ...confirms,
      ]);
      expect(view().practice!.complete).toBe(true);
      const v = r.match.state!.vehicles[0]!;
      expect(v.ownerId).toBe(0);
      if (character === 'campusQueen') {
        expect(new Set(v.route.map((t) => t.x)).size).toBeGreaterThan(1);
        expect(new Set(v.route.map((t) => t.y)).size).toBeGreaterThan(1);
      }
    });
  }

  it('vehicle: picking another character only changes the practice, never the saved menu choice', () => {
    const before = { ...useGameStore.getState().settings };
    const r = practise('vehicle', 'streetBaller');
    r.tutorial.setCharacter('campusQueen');
    expect(view().practice!.character).toBe('campusQueen');
    expect(r.match.state!.players[0]!.characterId).toBe('campusQueen');
    expect(useGameStore.getState().settings).toEqual(before);
  });

  it('city rumble: reaching the central square completes it', () => {
    const r = practise('cityRumble');
    const s = r.match.state!;
    // start just outside the square on the avenue that leads in
    put(s, 0, 16, 21);
    drive(r, [walk('up', 3)]);
    expect(view().practice!.complete).toBe(true);
  });

  it('getting caught restarts the practice with a message (and nothing is recorded as a match)', () => {
    const r = practise('generator');
    const first = r.match.state;
    drive(r, [place, wait(400)], undefined, 260);
    expect(view().notice).toMatch(/Caught!/);
    for (let i = 0; i < 140; i++) {
      r.match.stepOnce();
      r.tutorial.frame();
    }
    expect(r.match.state).not.toBe(first);
    expect(r.match.state!.players[0]!.alive).toBe(true);
    expect(view().notice).toMatch(/Starting the practice again/);
    expect(useGameStore.getState().screen).toBe('playing');
    expect(useGameStore.getState().summary).toBeNull();
  });

  it('the tutorial never writes the saved settings and exits back to the title', () => {
    const before = { ...DEFAULT_GAME_SETTINGS, ...useGameStore.getState().settings };
    const r = practise('kick');
    drive(r, SOLUTIONS.kick!);
    r.tutorial.next();
    r.tutorial.prev();
    r.tutorial.replay();
    r.tutorial.exit();
    expect(useGameStore.getState().screen).toBe('title');
    expect(useGameStore.getState().tutorial).toBeNull();
    expect(useGameStore.getState().settings).toEqual(before);
    expect(r.match.scenario).toBe(false);
    expect(r.attract.started).toBe(1);
  });
});
