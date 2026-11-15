/**
 * The Generator Tactics Academy lessons (docs/TACTICAL_TRAP_PILOT.md): they build, switch the pilot on through the one
 * config layer, seat real enemy bots, and a scripted human with ordinary intents completes each one through the real
 * controllers. Nothing else in the Academy carries the pilot.
 */
import { describe, expect, it } from 'vitest';
import { COURSES, LESSONS } from '../../src/tutorial';
import { TACTICAL_TRAP_PILOT } from '../../src/sim';
import { drivePolicy, lessonIndex, practise, step, view } from './harness';
import { agberoHuman, hiddenHuman, throwerHuman } from './tacticsPolicies';

const TACTICS = ['trap-agbero', 'trap-thrower', 'trap-hidden'];

describe('Generator Tactics course', () => {
  it('is its own course after the existing ones, with new lesson ids only', () => {
    expect(COURSES.map((c) => c.id)).toContain('tactics');
    expect(LESSONS.filter((l) => l.course === 'tactics').map((l) => l.id)).toEqual(TACTICS);
    expect(LESSONS.slice(-3).map((l) => l.id)).toEqual(TACTICS);
    for (const l of LESSONS.filter((x) => x.course !== 'tactics')) {
      const s = l.practice.build('streetBaller');
      expect('tacticalTrap' in s.config, l.id).toBe(false);
    }
  });

  for (const id of TACTICS) {
    it(`${id}: the board carries the pilot, real enemy seats and a human with health`, () => {
      const lesson = LESSONS[lessonIndex(id)]!;
      for (const s of [lesson.demo.build(), lesson.practice.build('streetBaller')]) {
        expect(s.config.tacticalTrap!.id).toBe(TACTICAL_TRAP_PILOT.id);
        expect(s.players[0]!.vitals!.maxHp).toBe(4);
        expect(s.players.filter((p) => p.enemyKind).length).toBeGreaterThanOrEqual(1);
        expect(s.players[0]!.enemyKind).toBeUndefined();
        expect(s.match.phase).toBe('playing');
      }
    });

    it(`${id}: seats one enemy bot per enemy and none for the dummies`, () => {
      const r = practise(id);
      const bots = (r.match as unknown as { bots: Map<number, unknown> }).bots;
      const s = r.match.state!;
      expect([...bots.keys()].sort()).toEqual(s.players.filter((p) => p.enemyKind).map((p) => p.id));
    });

    it(`${id}: standing still completes nothing`, () => {
      const r = practise(id);
      for (let i = 0; i < 600; i++) step(r);
      expect(view().practice!.tasks.every((t) => !t.done)).toBe(true);
    });
  }

  it('the older lessons still seat no bots at all', () => {
    const r = practise('melee');
    expect((r.match as unknown as { bots: Map<number, unknown> }).bots.size).toBe(0);
  });
});

describe('a scripted human completes each Generator Tactics lesson', () => {
  it('trap-agbero: bait the swing, lay, slow him twice, step off: only the blast kills him', () => {
    const r = practise('trap-agbero');
    const events = drivePolicy(
      r,
      agberoHuman(() => view().practice!.current),
      2400,
    );
    expect(view().practice!.complete).toBe(true);
    expect(r.match.state!.tacticalTrap!.slows[1]!.stacks).toBe(2);
    const killed = events.find((e) => e.type === 'playerEliminated' && e.playerId === 1)!;
    expect(killed.type === 'playerEliminated' && killed.cause.kind).toBe('flame');
    expect(view().completed).toContain('trap-agbero');
  });

  it('trap-thrower: dodge, lay in the corner, leave: the dead end cannot be dodged', () => {
    const r = practise('trap-thrower');
    const events = drivePolicy(r, throwerHuman(), 2400);
    expect(view().practice!.complete).toBe(true);
    const killed = events.find((e) => e.type === 'playerEliminated' && e.playerId === 1)!;
    expect(killed.type === 'playerEliminated' && killed.cause.kind).toBe('flame');
  });

  it('trap-hidden: in plain sight the guard lives; with the generator under your feet he does not', () => {
    const r = practise('trap-hidden');
    const events = drivePolicy(
      r,
      hiddenHuman(() => view().practice!.current),
      4000,
    );
    expect(view().practice!.tasks[0]!.done).toBe(true);
    expect(view().practice!.complete).toBe(true);
    expect(events.filter((e) => e.type === 'generatorExploded').length).toBeGreaterThanOrEqual(2);
  });
});
