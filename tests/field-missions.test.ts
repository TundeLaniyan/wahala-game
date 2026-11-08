/**
 * Section FIELD missions (src/sim/mission/field.ts): every objective kind (reachMarkers, clearGroup, escapeRoute, door,
 * the return route) on its positive and failure path, the door raising a RaidRequest, resolveRaid's effects, lives, the
 * clock, determinism, and a scripted human completing the Oshodi section 1 mission end to end.
 */
import { describe, expect, it } from 'vitest';
import { CATCH_TICKS, DOOR_HOLD_TICKS, missionView, resolveRaid, tick } from '../src/sim';
import type { GameState } from '../src/sim';
import { addGenerator } from './helpers';
import { advance, hashOf, of, put } from './mission-helpers';
import { newField, raidOutcome, walkField } from './field-helpers';

const APPROACH = 'oshodi.approach';
const RAIL_EDGE = 'oshodi.railEdge';

const m = (s: GameState) => s.mission!;
const f = (s: GameState) => s.mission!.field!;

/** Walks the first leg of the approach mission by placing the human on each marker (one tick each). */
function reachAllMarkers(s: GameState): void {
  for (const [x, y] of [
    [9, 39],
    [19, 39],
    [26, 40],
  ] as const) {
    put(s, 0, x, y);
    advance(s, 1);
  }
}

describe('a section field mission is not a boss fight', () => {
  it('has a field runtime, no boss, a route view and ordinary match rules', () => {
    const s = newField(APPROACH);
    expect(m(s).field).toBeDefined();
    expect(m(s).bossId).toBe(-1);
    const events = advance(s, 2);
    const v = missionView(s)!;
    expect(v.format).toBe('field');
    expect(v.fieldId).toBe(APPROACH);
    expect(v.objective).toBe('fieldRoute');
    expect(v.legCount).toBe(3);
    expect(v.legKind).toBe('reachMarkers');
    expect(v.boss).toMatchObject({ shielded: false, exposed: false, defeated: false });
    expect(v.nodes.map((n) => n.state)).toEqual(['live', 'locked', 'locked']);
    expect(v.doors).toHaveLength(1);
    expect(v.doors![0]).toMatchObject({ id: 'depot', status: 'idle', required: true });
    expect(of(events, 'missionStarted')).toHaveLength(1);
    expect(of(events, 'bossShielded')).toHaveLength(0);
    expect(v.crewAlive).toBe(5); // three wardens plus the combat pilot's warden and thrower (decision CP11)
  });

  it('is deterministic: same spec and seed, same state', () => {
    const run = (): string => {
      const s = newField(APPROACH, { seed: 9 });
      advance(s, 300);
      reachAllMarkers(s);
      advance(s, 100);
      return hashOf(s);
    };
    expect(run()).toBe(run());
  });
});

describe('reachMarkers', () => {
  it('lights the markers one at a time and completes after the last, in order', () => {
    const s = newField(APPROACH);
    put(s, 0, 19, 39); // the SECOND marker first: does not count
    advance(s, 3);
    expect(f(s).markersDone).toBe(0);
    put(s, 0, 9, 39);
    const events = advance(s, 1);
    expect(f(s).markersDone).toBe(1);
    expect(missionView(s)!.nodes.map((n) => n.state)).toEqual(['done', 'live', 'locked']);
    expect(of(events, 'missionNode').some((e) => e.nodeId === 'mk0' && e.state === 'done')).toBe(true);
    put(s, 0, 19, 39);
    advance(s, 1);
    put(s, 0, 26, 40);
    const last = advance(s, 1);
    expect(f(s).leg).toBe(1);
    expect(of(last, 'missionPhase').map((e) => `${e.phase}:${e.change}`)).toEqual(['0:cleared', '1:started']);
    expect(missionView(s)!.legKind).toBe('door');
    expect(f(s).checkpoint).toEqual({ x: 26, y: 40 });
  });

  it('failure path: an idle human does not progress and the clock ends the mission', () => {
    const s = newField(APPROACH);
    advance(s, 60 * 400);
    expect(m(s).outcome?.result).toBe('timeout');
    expect(f(s).markersDone).toBe(0);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'timeout' });
  });
});

describe('clearGroup', () => {
  it('completes when every enemy of the group is out, not before', () => {
    const s = newField(RAIL_EDGE);
    expect(missionView(s)!.legKind).toBe('clearGroup');
    expect(missionView(s)!.progress).toMatchObject({ done: 0, goal: 2 });
    s.players[1]!.alive = false;
    advance(s, 2);
    expect(f(s).leg).toBe(0);
    expect(missionView(s)!.progress).toMatchObject({ done: 1, goal: 2 });
    s.players[2]!.alive = false;
    advance(s, 2);
    expect(f(s).leg).toBe(1);
    expect(missionView(s)!.legKind).toBe('escapeRoute');
  });

  it('failure path: the pursuer (another group) being out does not count, and the human cannot win without them', () => {
    const s = newField(RAIL_EDGE);
    s.players[3]!.alive = false; // the pursuer only
    advance(s, 5);
    expect(f(s).leg).toBe(0);
  });
});

describe('escapeRoute', () => {
  function atEscape(): GameState {
    const s = newField(RAIL_EDGE);
    s.players[1]!.alive = false;
    s.players[2]!.alive = false;
    advance(s, 2);
    return s;
  }

  it('reaching the exit completes the leg and the return route follows', () => {
    const s = atEscape();
    put(s, 0, 59, 28);
    advance(s, 1);
    expect(f(s).leg).toBe(2);
    expect(missionView(s)!.legKind).toBe('returnRoute');
  });

  it('a pursuer hunts from the moment the leg starts (a dormant one only waits)', async () => {
    const { directiveFor } = await import('../src/sim');
    const s = newField(RAIL_EDGE);
    expect(directiveFor(s, 3)).toMatchObject({ kind: 'block' });
    s.players[1]!.alive = false;
    s.players[2]!.alive = false;
    advance(s, 2);
    expect(directiveFor(s, 3)).toMatchObject({ kind: 'chase' });
  });

  it('failure path: a pursuer next to you catches you: a life, the checkpoint, the pursuer back at its post', () => {
    const s = atEscape();
    put(s, 0, 50, 36);
    const post = { ...m(s).seats[3]!.post! };
    put(s, 3, 51, 36); // right next to the human
    const before = m(s).livesUsed;
    advance(s, CATCH_TICKS + 2);
    expect(f(s).caught).toBe(1);
    expect(m(s).livesUsed).toBe(before + 1);
    const me = s.players[0]!;
    expect({ x: me.x, y: me.y }).toEqual(f(s).checkpoint);
    expect({ x: s.players[3]!.x, y: s.players[3]!.y }).toEqual(post);
    expect(missionView(s)!.callout).toMatch(/CAUGHT/);
    expect(me.protectedUntil).toBeGreaterThan(s.tick);
  });

  it('a pursuer that only passes by does not catch you, and three catches lose the mission', () => {
    const s = atEscape();
    put(s, 0, 50, 36);
    put(s, 3, 51, 36);
    advance(s, CATCH_TICKS - 20);
    put(s, 3, 40, 36); // gone before the catch
    advance(s, 60);
    expect(f(s).caught).toBe(0);
    for (let i = 0; i < 3 && !m(s).outcome; i++) {
      put(s, 0, 50, 36);
      put(s, 3, 51, 36);
      advance(s, CATCH_TICKS + 2);
    }
    expect(m(s).outcome?.result).toBe('lost');
    expect(m(s).outcome!.livesUsed).toBe(3);
    expect(s.match.phase).toBe('ended');
  });
});

describe('door and RaidRequest', () => {
  function atDoor(): GameState {
    const s = newField(APPROACH);
    reachAllMarkers(s);
    return s;
  }

  it('holding a door raises the raid request after about a second, with the return tile', () => {
    const s = atDoor();
    put(s, 0, 25, 44);
    advance(s, DOOR_HOLD_TICKS - 5);
    expect(m(s).pendingRaid).toBeNull();
    expect(missionView(s)!.doors![0]!.fraction).toBeGreaterThan(0.5);
    advance(s, 8);
    expect(m(s).pendingRaid).toEqual({
      doorId: 'depot',
      raidId: 'warehouseDispatchDepot',
      returnTile: { x: 25, y: 43 },
    });
    expect(f(s).doors[0]!.status).toBe('inRaid');
    expect(missionView(s)!.pendingRaid?.doorId).toBe('depot');
  });

  it('a pass-by does not count: stepping off drains the hold, and a required door waits for its leg', () => {
    const early = newField(APPROACH);
    put(early, 0, 25, 44);
    advance(early, DOOR_HOLD_TICKS + 20);
    expect(m(early).pendingRaid).toBeNull(); // markers not done: the door is locked

    const s = atDoor();
    put(s, 0, 25, 44);
    advance(s, 40);
    put(s, 0, 25, 43);
    advance(s, 40);
    put(s, 0, 25, 44);
    advance(s, 30);
    expect(m(s).pendingRaid).toBeNull();
  });

  it('only one request is out at a time and the field mission waits while it is', () => {
    const s = atDoor();
    put(s, 0, 25, 44);
    advance(s, DOOR_HOLD_TICKS + 2);
    const request = m(s).pendingRaid;
    expect(request).not.toBeNull();
    const leg = f(s).leg;
    advance(s, 200);
    expect(m(s).pendingRaid).toBe(request);
    expect(f(s).leg).toBe(leg);
    expect(f(s).doors[0]!.attempts).toBe(0);
  });
});

describe('resolveRaid', () => {
  function raised(): GameState {
    const s = newField(APPROACH);
    reachAllMarkers(s);
    put(s, 0, 25, 44);
    advance(s, DOOR_HOLD_TICKS + 2);
    expect(m(s).pendingRaid).not.toBeNull();
    return s;
  }

  it('completed: the door is done, the leg advances, the human is in front of the door and protected', () => {
    const s = raised();
    expect(resolveRaid(s, 'depot', raidOutcome('warehouseDispatchDepot'))).toBe(true);
    expect(m(s).pendingRaid).toBeNull();
    expect(f(s).doors[0]).toMatchObject({ status: 'done', attempts: 1, stars: 2 });
    expect(f(s).raidsCompleted).toBe(1);
    expect(f(s).leg).toBe(2);
    expect(missionView(s)!.legKind).toBe('returnRoute');
    const me = s.players[0]!;
    expect([me.x, me.y]).toEqual([25, 43]);
    expect(me.protectedUntil).toBeGreaterThan(s.tick);
    expect(missionView(s)!.doors![0]!.status).toBe('done');
    // a completed door does not raise again
    put(s, 0, 25, 44);
    advance(s, DOOR_HOLD_TICKS + 5);
    expect(m(s).pendingRaid).toBeNull();
  });

  it('failed: the door stays open for a retry, a life is lost, the human is back on the map', () => {
    const s = raised();
    resolveRaid(s, 'depot', raidOutcome('warehouseDispatchDepot', { result: 'failed', stars: 0, hpLeft: 0 }));
    expect(f(s).doors[0]).toMatchObject({ status: 'failed', attempts: 1 });
    expect(m(s).livesUsed).toBe(1);
    expect(f(s).leg).toBe(1);
    const me = s.players[0]!;
    expect([me.x, me.y]).toEqual([25, 43]);
    put(s, 0, 25, 44);
    advance(s, DOOR_HOLD_TICKS + 2);
    expect(m(s).pendingRaid?.doorId).toBe('depot');
  });

  it('abandoned: no life lost, the door is idle and can be entered again', () => {
    const s = raised();
    resolveRaid(s, 'depot', raidOutcome('warehouseDispatchDepot', { result: 'abandoned', stars: 0 }));
    expect(f(s).doors[0]!.status).toBe('idle');
    expect(m(s).livesUsed).toBe(0);
    put(s, 0, 25, 44);
    advance(s, DOOR_HOLD_TICKS + 2);
    expect(m(s).pendingRaid?.doorId).toBe('depot');
  });

  it('ignores stale or wrong answers', () => {
    const s = newField(APPROACH);
    expect(resolveRaid(s, 'depot', raidOutcome('warehouseDispatchDepot'))).toBe(false); // nothing pending
    const r = raised();
    expect(resolveRaid(r, 'nope', raidOutcome('warehouseDispatchDepot'))).toBe(false);
    expect(resolveRaid(r, 'depot', raidOutcome('partsStoreroom'))).toBe(false); // another raid
    expect(m(r).pendingRaid).not.toBeNull();
    expect(resolveRaid(r, 'depot', raidOutcome('warehouseDispatchDepot'))).toBe(true);
    expect(resolveRaid(r, 'depot', raidOutcome('warehouseDispatchDepot'))).toBe(false); // twice
    expect(f(r).raidsCompleted).toBe(1);
  });

  it('carries the health the player leaves the raid with (when the player has campaign vitals)', () => {
    const s = raised();
    s.players[0]!.vitals = {
      hp: 5,
      maxHp: 5,
      invulnUntil: 0,
      lastHitTick: -1,
      lastHitBy: null,
      lastHitSource: null,
    };
    resolveRaid(s, 'depot', raidOutcome('warehouseDispatchDepot', { hpLeft: 2 }));
    expect(s.players[0]!.vitals!.hp).toBe(2);
    const t = raised();
    t.players[0]!.vitals = {
      hp: 3,
      maxHp: 5,
      invulnUntil: 0,
      lastHitTick: -1,
      lastHitBy: null,
      lastHitSource: null,
    };
    resolveRaid(t, 'depot', raidOutcome('warehouseDispatchDepot', { hpLeft: 99 }));
    expect(t.players[0]!.vitals!.hp).toBe(5); // never above the maximum
  });

  it('a three-star raid is a bonus that can earn the third star; otherwise the par time decides', () => {
    const run = (stars: 1 | 2 | 3, slow: boolean): number => {
      const s = raised();
      if (slow) s.match.playTicks = m(s).tuning.parTicks + 600;
      resolveRaid(s, 'depot', raidOutcome('warehouseDispatchDepot', { stars }));
      put(s, 0, 4, 38);
      advance(s, 3);
      return m(s).outcome!.stars;
    };
    expect(run(2, false)).toBe(3); // within par
    expect(run(2, true)).toBe(2); // slow, no bonus
    expect(run(3, true)).toBe(3); // slow, but a three-star raid
  });
});

describe('the return route and the result', () => {
  it('walking to the return marker completes the mission with a section outcome', () => {
    const s = newField(APPROACH);
    reachAllMarkers(s);
    put(s, 0, 25, 44);
    advance(s, DOOR_HOLD_TICKS + 2);
    resolveRaid(s, 'depot', raidOutcome('warehouseDispatchDepot'));
    expect(m(s).outcome).toBeNull(); // not yet: the way back
    put(s, 0, 4, 38);
    const events = advance(s, 3);
    expect(m(s).outcome).toMatchObject({
      result: 'won',
      missionId: 'oshodi',
      sectionMissionId: APPROACH,
      livesUsed: 0,
      defeat: null,
    });
    expect(m(s).outcome!.stars).toBeGreaterThanOrEqual(1);
    expect(of(events, 'missionOutcome')).toHaveLength(1);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0 });
    expect(missionView(s)!.phaseState).toBe('won');
  });

  it('losing every life loses the mission, and an elimination spends one and respawns at the checkpoint', () => {
    const s = newField(APPROACH);
    s.players[0]!.vitals!.hp = 1; // one segment left: the generator's blast is now lethal (campaign health)
    put(s, 0, 9, 39);
    advance(s, 1);
    const me = s.players[0]!;
    // the sim path: an enemy generator on the human's tile (the human is not protected)
    me.protectedUntil = 0;
    addGenerator(s, { ownerId: 1, x: me.x, y: me.y, timer: 1 });
    const events = advance(s, 400);
    expect(m(s).livesUsed).toBeGreaterThanOrEqual(1);
    expect(of(events, 'playerRespawned').length).toBeGreaterThanOrEqual(1);
    const respawn = of(events, 'playerRespawned')[0]!;
    expect({ x: respawn.x, y: respawn.y }).toEqual(f(s).checkpoint);
  });
});

describe('scripted human: Oshodi section 1 (markers, the warehouse door, the way back)', () => {
  it('walks the route, enters the raid, returns to the field at the return tile and completes the mission', () => {
    const s = newField(APPROACH, { seed: 7 });
    let raids = 0;
    let beforeRaid: ReturnType<typeof missionView> = null;
    const result = walkField(s, 60 * 300, {
      onRaid: (state, evs) => {
        raids++;
        beforeRaid = missionView(state);
        const request = state.mission!.pendingRaid!;
        resolveRaid(state, request.doorId, raidOutcome(request.raidId), evs);
        // the human is put in front of the door
        expect([state.players[0]!.x, state.players[0]!.y]).toEqual([
          request.returnTile.x,
          request.returnTile.y,
        ]);
      },
    });
    expect(raids).toBe(1);
    expect(beforeRaid!.legKind).toBe('door');
    expect(m(s).outcome?.result, JSON.stringify(missionView(s)?.progress)).toBe('won');
    expect(m(s).outcome!.sectionMissionId).toBe(APPROACH);
    expect(m(s).outcome!.phasesCleared).toBe(3);
    expect(
      of(result.events, 'missionPhase')
        .filter((e) => e.change === 'cleared')
        .map((e) => e.phase),
    ).toEqual([0, 1, 2].slice(0, 2));
    expect(f(s).doors[0]!.status).toBe('done');
    expect(result.ticks).toBeLessThan(60 * 200);
  });

  it('a failed raid sends the player back to the map; the retry succeeds', () => {
    const s = newField(APPROACH, { seed: 7 });
    let attempt = 0;
    walkField(s, 60 * 300, {
      onRaid: (state, evs) => {
        const request = state.mission!.pendingRaid!;
        attempt++;
        resolveRaid(
          state,
          request.doorId,
          attempt === 1
            ? raidOutcome(request.raidId, { result: 'failed', stars: 0, hpLeft: 0 })
            : raidOutcome(request.raidId),
          evs,
        );
      },
    });
    expect(attempt).toBe(2);
    expect(m(s).outcome?.result).toBe('won');
    expect(f(s).doors[0]!.attempts).toBe(2);
    expect(m(s).outcome!.livesUsed).toBe(1);
    expect(m(s).outcome!.stars).toBe(3); // one life lost is still two; within par: three
  });

  it('tick() with no mission rules stays untouched: a normal match has no field state', () => {
    const s = newField(APPROACH);
    s.mission = undefined;
    expect(() => tick(s, {})).not.toThrow();
  });
});
