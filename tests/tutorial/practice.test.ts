import { describe, expect, it } from 'vitest';
import { useGameStore } from '../../src/app/store';
import type { CharacterId } from '../../src/sim';
import { LESSONS } from '../../src/tutorial';
import {
  bump,
  detonate,
  place,
  special,
  untilEvent,
  untilNoFlames,
  wait,
  walk,
} from '../../src/tutorial/script';
import type { Act } from '../../src/tutorial/types';
import { drive, of, practise, step, view } from './harness';
import type { Rig } from './harness';

/**
 * Every lesson's practice is played by a "human" whose presses go through the real input port (the same
 * path as the keyboard / touch controls). Completion must come from what the simulation really did:
 * standing still completes nothing, a correct attempt completes every task, and mistakes / failures give
 * guidance and a retry.
 */

const SOLUTIONS: Record<string, Act[]> = {
  move: [walk('right', 4), walk('right', 2), walk('up', 4), bump('right')],
  place: [walk('right', 4), place, walk('left', 3)],
  escape: [
    walk('right', 2),
    place,
    walk('up', 2),
    walk('left', 1),
    untilEvent('generatorExploded'),
    untilNoFlames,
    wait(10),
    place,
    walk('left', 1),
    walk('up', 2),
  ],
  cross: [walk('right', 6), place, walk('left', 3)],
  safety: [
    walk('up', 2),
    walk('right', 1),
    place,
    walk('left', 1),
    walk('up', 2),
    walk('right', 1),
    untilEvent('generatorExploded'),
    untilNoFlames,
    walk('right', 1),
    walk('down', 4),
    walk('right', 2),
    place,
    walk('up', 2),
    walk('right', 2),
    walk('down', 2),
  ],
  multiple: [walk('right', 2), place, walk('right', 2), place, walk('right', 3)],
  range: [walk('up', 2), walk('down', 2), walk('right', 6), place, walk('left', 2), walk('up', 2)],
  square: [walk('right', 3), place, walk('left', 1), walk('up', 2)],
  protection: [
    walk('right', 2),
    place,
    untilEvent('protectionBroken'),
    untilNoFlames,
    place,
    untilEvent('protectionBroken'),
    untilNoFlames,
    place,
    walk('right', 3),
  ],
  kick: [walk('right', 3), place, walk('left', 1), wait(10), bump('right')],
  punch: [walk('right', 3), place, walk('left', 1), wait(10), bump('right')],
  disarm: [walk('right', 5), wait(20), bump('right'), place, walk('left', 3)],
  pass: [walk('right', 2), place, walk('left', 1), walk('right', 4)],
  remote: [walk('right', 2), place, walk('right', 2), walk('up', 2), detonate],
  melee: [walk('right', 5), special, wait(250), walk('right', 1), special],
  vehicle: [walk('right', 2), wait(10), special],
  crush: [walk('up', 4), walk('right', 5)],
  survival: [
    walk('right', 2),
    place,
    walk('up', 3),
    untilEvent('generatorExploded'),
    untilNoFlames,
    place,
    walk('up', 1),
    place,
  ],
  team: [
    walk('right', 2),
    place,
    walk('up', 3),
    untilEvent('generatorExploded'),
    untilNoFlames,
    walk('down', 3),
    walk('right', 1),
    special,
  ],
};

const session = (r: Rig) => r.tutorial.practiceSession!;

describe('Academy practices', () => {
  it('every lesson has a practice with at least one task, and a solution test here', () => {
    for (const l of LESSONS) {
      expect(l.practice.tasks.length, l.id).toBeGreaterThan(0);
      expect(SOLUTIONS[l.id] !== undefined || l.id === 'deathmatch', l.id).toBe(true);
    }
  });

  for (const [id, acts] of Object.entries(SOLUTIONS)) {
    it(`${id}: a correct attempt completes every task, one by one, from real events`, () => {
      const r = practise(id);
      expect(view().mode).toBe('practice');
      expect(view().practice!.complete).toBe(false);
      const order: number[] = [];
      let last = 0;
      const unsub = useGameStore.subscribe((s) => {
        const cur = s.tutorial?.practice?.current ?? 0;
        if (cur !== last) order.push(cur);
        last = cur;
      });
      drive(r, acts);
      unsub();
      expect(view().practice!.tasks.filter((t) => !t.done)).toEqual([]);
      expect(view().practice!.complete).toBe(true);
      expect(session(r).attempts).toBe(0);
      expect(r.match.state!.players[0]!.alive).toBe(true);
      // tasks were completed in order, never all at once
      expect(order).toEqual(view().practice!.tasks.map((_, i) => i + 1));
      // completion is remembered on this device
      expect(view().completed).toContain(id);
      expect(view().canAdvance).toBe(true);
    });
  }

  it('deathmatch: caught on purpose -> respawn; then an elimination; then the dummy respawns', () => {
    const r = practise('deathmatch');
    drive(r, [place], 30, false);
    for (let i = 0; i < 600 && !view().practice!.tasks[0]!.done; i++) step(r);
    expect(view().practice!.tasks[0]!.done).toBe(true);
    expect(view().practice!.failed).toBe(false);
    expect(session(r).attempts).toBe(0); // a respawn lesson never restarts on being caught
    const me = r.match.state!.players[0]!;
    expect(me.alive).toBe(true);
    expect(me.stats.deaths).toBe(1);
    expect([me.x, me.y]).toEqual([0, 0]); // the safest spawn, away from the dummy
    for (let i = 0; i < 200; i++) step(r); // spawn protection runs out
    drive(r, [walk('right', 8), walk('down', 4), place, walk('up', 3)]);
    expect(view().practice!.complete).toBe(true);
    expect(r.match.state!.players[0]!.stats.kills).toBe(1);
  });

  it('standing still completes nothing in any lesson', () => {
    for (const l of LESSONS) {
      const r = practise(l.id);
      for (let i = 0; i < 600; i++) step(r);
      expect(
        view().practice!.tasks.some((t) => t.done),
        l.id,
      ).toBe(false);
      expect(view().practice!.complete, l.id).toBe(false);
      expect(view().completed, l.id).not.toContain(l.id);
    }
  });

  it('dummies are passive: nobody but the human (and a lesson script) ever acts', () => {
    const r = practise('melee');
    for (let i = 0; i < 900; i++) step(r);
    const s = r.match.state!;
    expect(s.generators).toEqual([]);
    expect([s.players[1]!.x, s.players[1]!.y]).toEqual([6, 10]);
  });

  for (const character of ['streetBaller', 'lekkiBoy', 'campusQueen'] as CharacterId[]) {
    it(`vehicle (${character}): one B press with a voucher launches the signature vehicle on an automatic route`, () => {
      const r = practise('vehicle', character);
      expect(view().practice!.characterChoice).toBe(true);
      const events = drive(r, SOLUTIONS.vehicle!);
      expect(view().practice!.complete).toBe(true);
      expect(of(events, 'specialUsed').filter((e) => e.playerId === 0)).toEqual([
        { type: 'specialUsed', playerId: 0, action: 'vehicle' },
      ]);
      expect(of(events, 'vehicleEntryBegan')).toEqual([]); // no manual entrance / route selection
      const launched = of(events, 'vehicleLaunched');
      expect(launched).toHaveLength(1);
      expect(launched[0]!.ownerId).toBe(0);
      const hit = of(events, 'playerEliminated').find((e) => e.playerId === 1)!;
      expect(hit.cause.kind).toBe('vehicle');
      expect(hit.creditId).toBe(0);
    });
  }

  it('melee: B with nobody adjacent gives a tip; the hit then lands for real', () => {
    const r = practise('melee');
    drive(r, [special, wait(5)], 10, false);
    expect(view().practice!.guidance).toMatch(/Nobody is next to you/);
    expect(view().practice!.tasks[0]!.done).toBe(false);
    drive(r, [walk('right', 5), special], 400, false);
    for (let i = 0; i < 5; i++) step(r);
    expect(view().practice!.tasks[1]!.done).toBe(true);
    expect(r.match.state!.players[1]!.x).toBe(7); // Street Baller's push really moved the dummy
  });

  it('vehicle: B right next to the dummy is a hit, not a vehicle, and the tip says so', () => {
    const r = practise('vehicle');
    drive(r, [walk('right', 2), walk('up', 6), walk('right', 5), special, wait(5)], 600, false);
    expect(view().practice!.guidance).toMatch(/B is a hit/);
    expect(r.match.state!.players[0]!.hasVoucher).toBe(true);
    expect(view().practice!.tasks[1]!.done).toBe(false);
  });

  it('move: walking away from the marker gives a "wrong way" tip naming the direction', () => {
    const r = practise('move');
    drive(r, [walk('up', 2), wait(5)], 200, false);
    expect(view().practice!.guidance).toBe('Wrong way! The glowing marker is down and to the right.');
  });

  it('move: the floor marker is passed to the renderer for the active task only', () => {
    const r = practise('move');
    r.match.frame(0);
    expect(r.renderer.lastMarkers).toEqual([{ x: 4, y: 10 }]);
    drive(r, [walk('right', 4), wait(3)], 200, false);
    r.match.frame(16);
    expect(r.renderer.lastMarkers).toEqual([{ x: 6, y: 6 }]);
  });

  it('cross: a generator that cannot reach the target gets an explanation', () => {
    const r = practise('cross');
    drive(r, [walk('right', 1), place, wait(3)], 60, false);
    expect(view().practice!.guidance).toMatch(/never diagonally/);
  });

  it('remote: a quick tap of B instead of holding it gets a tip', () => {
    const r = practise('remote');
    drive(r, [walk('right', 2), place, walk('right', 2), walk('up', 2), special, wait(3)], 400, false);
    expect(view().practice!.tasks[2]!.done).toBe(true);
    expect(view().practice!.guidance).toMatch(/HOLD B/);
    expect(r.match.state!.generators.filter((g) => g.ownerId === 0)).toHaveLength(1);
  });

  it('a failing attempt: the red-tile tip, then caught -> explanation -> retry from the checkpoint', () => {
    const r = practise('place');
    drive(r, [walk('right', 4), place], 200, false);
    expect(view().practice!.current).toBe(2);
    const before = r.match.state;
    let tipped = false;
    for (let i = 0; i < 200 && !view().practice!.failed; i++) {
      step(r);
      tipped ||= /red tile/.test(view().practice!.guidance ?? '');
    }
    expect(tipped).toBe(true);
    expect(view().practice!.failed).toBe(true);
    expect(view().practice!.guidance).toMatch(/Caught in your own blast/);
    for (let i = 0; i < 130 && view().practice!.failed; i++) step(r);
    // reloaded from the checkpoint: standing on the marker, about to place, nothing on the floor
    expect(view().practice!.failed).toBe(false);
    expect(view().practice!.attempts).toBe(1);
    expect(view().practice!.current).toBe(1);
    expect(r.match.state).not.toBe(before);
    const me = r.match.state!.players[0]!;
    expect([me.x, me.y, me.alive]).toEqual([4, 10, true]);
    expect(r.match.state!.generators).toEqual([]);
    expect(useGameStore.getState().summary).toBeNull();
    // and the retry can succeed
    drive(r, [place, walk('left', 3)]);
    expect(view().practice!.complete).toBe(true);
    expect(view().practice!.attempts).toBe(1);
  });

  it('unlimited retries: failing three times in a row keeps offering the lesson', () => {
    const r = practise('escape');
    for (let attempt = 1; attempt <= 3; attempt++) {
      drive(r, [walk('right', 2), place], 100, false);
      for (let i = 0; i < 400 && view().practice!.attempts < attempt; i++) step(r);
      expect(view().practice!.attempts).toBe(attempt);
      expect(r.match.state!.players[0]!.alive).toBe(true);
    }
  });

  it('protection: walking out of the blast when asked to stand in it gets a tip, not a pass', () => {
    const r = practise('protection');
    drive(
      r,
      [walk('right', 2), place, walk('right', 3), untilEvent('generatorExploded'), wait(3)],
      400,
      false,
    );
    expect(view().practice!.current).toBe(2);
    expect(view().practice!.guidance).toMatch(/You dodged it/);
    expect(r.match.state!.players[0]!.mounted).toBe(true);
  });

  it('escape lesson cues only approved voice triggers (narration)', () => {
    const r = practise('escape');
    drive(r, SOLUTIONS.escape!);
    expect(r.cues).toEqual(['ON_GENERATOR_CRITICAL_PROXIMITY', 'ON_PLAYER_NARROW_ESCAPE']);
  });

  it('team: the blast spares the teammate and B does nothing next to them', () => {
    const r = practise('team');
    const events = drive(r, SOLUTIONS.team!);
    expect(view().practice!.complete).toBe(true);
    const s = r.match.state!;
    expect(s.players[2]!.alive).toBe(true);
    expect(s.players[2]!.stats.deaths).toBe(0);
    expect(of(events, 'specialUsed').filter((e) => e.playerId === 0)).toEqual([]);
  });

  it('survival: the reward arrives immediately and is visible on the player', () => {
    const r = practise('survival');
    const events = drive(r, SOLUTIONS.survival!);
    const rewards = of(events, 'rewardGranted')
      .filter((e) => e.playerId === 0)
      .map((e) => e.kind);
    expect(rewards).toEqual(['socket', 'petrol']);
    const me = r.match.state!.players[0]!;
    // City Rumble starts on two generators (decision RE-C1); the socket reward makes it three
    expect(me.capacity).toBe(3);
    expect(me.range).toBe(3);
  });

  it('crush: the walls really close in during the lesson (it is mandatory, not a setting)', () => {
    const r = practise('crush');
    expect(r.match.state!.crush).not.toBeNull();
    const events = drive(r, SOLUTIONS.crush!);
    expect(of(events, 'crushLanded').length).toBeGreaterThan(20);
    expect(r.match.state!.endgameTraps.live).toBe(1);
  });
});
