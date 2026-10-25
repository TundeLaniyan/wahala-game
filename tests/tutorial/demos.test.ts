import { describe, expect, it } from 'vitest';
import { LESSONS } from '../../src/tutorial';
import { of, playDemo } from './harness';
import type { DemoRun } from './harness';

/**
 * Every lesson's demonstration is played headlessly through the real MatchController and simulation, and
 * must actually show its mechanic (not just print a caption about it).
 */
const runs = new Map<string, DemoRun>();
const demo = (id: string): DemoRun => {
  if (!runs.has(id)) runs.set(id, playDemo(id));
  return runs.get(id)!;
};
const byHero = <T extends { playerId?: number; ownerId?: number }>(list: T[]) =>
  list.filter((e) => (e.playerId ?? e.ownerId) === 0);

describe('every demo plays cleanly', () => {
  for (const lesson of LESSONS) {
    it(`${lesson.id}: script completes, no stalls, the demo hero ends standing`, () => {
      const run = demo(lesson.id);
      expect(run.problems).toEqual([]);
      expect(run.state.players[0]!.alive).toBe(true);
      expect(run.captions.filter(Boolean)).toEqual(
        lesson.demo.beats.map((b) => b.caption).filter((c, i, a) => a.indexOf(c) === i),
      );
      // brief: long enough to see, short enough to sit through before trying it
      expect(run.ticks).toBeGreaterThan(4 * 60);
      expect(run.ticks).toBeLessThan(40 * 60);
      // a demo never ends the "match" (no results, nothing counted)
      expect(of(run.events, 'matchEnded')).toEqual([]);
    });
  }
});

describe('each demo shows its mechanic for real', () => {
  it('move: walks the lanes and turns on the spot', () => {
    const run = demo('move');
    expect(run.heroTiles).toContain('4,10');
    expect(run.heroTiles[run.heroTiles.length - 1]).toBe('4,7');
    expect(run.state.players[0]!.facing).toBe('up');
  });

  it('place / escape / cross / safety: a real generator, a real blast, the hero clear of it', () => {
    for (const id of ['place', 'escape', 'cross', 'safety']) {
      const run = demo(id);
      expect(byHero(of(run.events, 'generatorPlaced')).length, id).toBe(1);
      expect(byHero(of(run.events, 'generatorExploded')).length, id).toBe(1);
    }
    expect(of(demo('place').events, 'blockDestroyed').map((e) => `${e.x},${e.y}`)).toEqual(['4,8']);
    // cross: only the dummy in line is caught, the diagonal one is not
    expect(of(demo('cross').events, 'playerEliminated').map((e) => e.playerId)).toEqual([1]);
  });

  it('multiple: two generators chain in one tick', () => {
    const blasts = of(demo('multiple').events, 'generatorExploded');
    expect(blasts).toHaveLength(2);
  });

  it('square: the diagonal crate breaks', () => {
    expect(of(demo('square').events, 'blockDestroyed').map((e) => `${e.x},${e.y}`)).toContain('4,9');
  });

  it('protection: the Okada, then the Armour, each take one hit', () => {
    expect(of(demo('protection').events, 'protectionBroken').map((e) => e.layer)).toEqual([
      'okada',
      'armour',
    ]);
  });

  it('kick / punch / disarm / pass: the contact ability acts with no button', () => {
    for (const [id, ability] of [
      ['kick', 'kick'],
      ['punch', 'punch'],
      ['disarm', 'disarm'],
      ['pass', 'pass'],
    ] as const) {
      const used = of(demo(id).events, 'contactUsed').filter((e) => e.playerId === 0);
      expect(
        used.map((e) => e.ability),
        id,
      ).toContain(ability);
    }
  });

  it('remote: a hold of B sets the generator off', () => {
    const run = demo('remote');
    expect(byHero(of(run.events, 'generatorExploded'))).toHaveLength(1);
  });

  it('melee and vehicle: B resolves to a hit next to a rival, to the vehicle otherwise', () => {
    expect(of(demo('melee').events, 'specialUsed').map((e) => e.action)).toEqual(['melee']);
    const v = demo('vehicle');
    expect(of(v.events, 'specialUsed').map((e) => e.action)).toEqual(['vehicle']);
    expect(of(v.events, 'vehicleLaunched')).toHaveLength(1);
  });

  it('crush: concrete really lands', () => {
    expect(of(demo('crush').events, 'crushLanded').length).toBeGreaterThan(0);
  });

  it('survival: the reward is granted on the elimination', () => {
    expect(of(demo('survival').events, 'rewardGranted').map((e) => e.kind)).toEqual(['socket', 'petrol']);
  });

  it('deathmatch: the hero is caught and respawns', () => {
    const run = demo('deathmatch');
    expect(of(run.events, 'playerRespawned').map((e) => e.playerId)).toEqual([0]);
  });

  it('team: the enemy is caught, the teammate in the same blast is not', () => {
    expect(of(demo('team').events, 'playerEliminated').map((e) => e.playerId)).toEqual([1]);
  });
});
