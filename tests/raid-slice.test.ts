/**
 * THE VERTICAL SLICE (docs/CLASSIC_RAIDS.md): the Oshodi dispatch depot played start to finish by a scripted human that
 * uses ordinary intents only (walk, lay generators on tiles with a clear line, walk out of the blast, step on a switch,
 * walk into a room, walk to the exit). Also the failure endings of the same raid: every life spent, and the clock.
 */
import { describe, expect, it } from 'vitest';
import { raidView } from '../src/sim';
import type { SimEvent } from '../src/sim';
import { RAID_TUNING } from '../src/sim/raid';
import { ScriptedHuman, advance, fallHuman, newRaid, of, put, until } from './raid-helpers';

/** The whole raid in the order a player would do it; `rooms` chooses the optional side rooms to take. */
function playDepot(rooms: { armour: boolean; heal: boolean }, seed = 3) {
  const state = newRaid('warehouseDispatchDepot', { seed });
  const sink: SimEvent[] = [];
  const me = new ScriptedHuman(state, sink);
  // wave 1 (three guards) appears after the spawn warning
  me.idle(RAID_TUNING.spawnWarnTicks + 5);
  for (const id of [1, 2, 3]) me.kill(id);
  // the bay door (guards cleared) and the armour room (blast the lock-box crate)
  if (rooms.armour) {
    me.destroy({ x: 11, y: 1 });
    me.walkTo(1, 1);
  }
  // the first dispatch crate calls the second wave
  me.destroy({ x: 8, y: 7 });
  me.idle(RAID_TUNING.spawnWarnTicks + 5);
  for (const id of [4, 5, 6]) me.kill(id);
  if (rooms.heal) {
    me.walkTo(12, 7); // the floor switch beside the belt
    me.walkTo(11, 11);
  }
  me.destroy({ x: 9, y: 9 });
  me.destroy({ x: 14, y: 1 });
  // the objective is done: the exit opened; cross the belt lane (waiting out any shipment) and leave
  me.opts = { belts: true };
  me.walkTo(15, 11);
  me.idle(2);
  return { state, sink, me };
}

describe('the vertical slice: warehouseDispatchDepot', () => {
  it('a scripted human completes the raid, through both optional rooms, with ordinary intents', () => {
    const { state, sink } = playDepot({ armour: true, heal: true });
    const r = state.raid!;
    expect(state.match.phase).toBe('ended');
    expect(r.outcome).not.toBeNull();
    const outcome = r.outcome!;
    expect(outcome.result).toBe('completed');
    expect(outcome.cargoDestroyed).toBe(3);
    expect(outcome.cargoTotal).toBe(3);
    expect(outcome.optionalRoomsOpened).toBe(2);
    expect(outcome.optionalRoomsTotal).toBe(2);
    expect(outcome.livesUsed).toBe(0);
    expect(state.raid!.rooms.every((q) => q.completed)).toBe(true);
    expect(state.players[0]!.armour).toBe(1);
    expect(outcome.stars).toBeGreaterThanOrEqual(2);
    expect(outcome.hpLeft).toBe(4);
    expect(state.match.result).toEqual({ kind: 'win', winnerId: 0 });
    // the events a HUD and the audio hang on, in a sensible order
    const types = sink.map((e) => e.type);
    expect(of(sink, 'raidWaveStarted').map((e) => [e.index, e.total])).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(of(sink, 'cargoDestroyed').filter((e) => e.marked)).toHaveLength(3);
    expect(
      of(sink, 'raidDoorOpened')
        .map((e) => e.id)
        .sort(),
    ).toEqual(['armourDoor', 'bayDoor', 'firstAidDoor']);
    expect(
      of(sink, 'raidRoomOpened')
        .map((e) => e.id)
        .sort(),
    ).toEqual(['armourLocker', 'firstAid']);
    expect(
      of(sink, 'raidBonusTaken')
        .map((e) => e.kind)
        .sort(),
    ).toEqual(['armour', 'heal']);
    expect(types.indexOf('raidExtractionOpened')).toBeGreaterThan(types.lastIndexOf('cargoDestroyed') - 3);
    expect(of(sink, 'raidOutcome')).toHaveLength(1);
    expect(types.filter((t) => t === 'matchEnded')).toHaveLength(1);
    // the view of a finished raid
    const view = raidView(state)!;
    expect(view.stage).toBe('done');
    expect(view.progress).toEqual({ done: 3, goal: 3, label: '3 of 3 destroyed' });
    expect(view.extraction.open).toBe(true);
    expect(view.outcome).toEqual(outcome);
  });

  it('the optional rooms are optional: skipping both still wins', () => {
    const { state } = playDepot({ armour: false, heal: false });
    const outcome = state.raid!.outcome!;
    expect(outcome.result).toBe('completed');
    // a room's door may open on the way (the switch lies in the lane to a thrower) but no bonus is ever required
    expect(outcome.optionalRoomsOpened).toBeLessThanOrEqual(2);
    expect(outcome.optionalRoomsTotal).toBe(2);
    expect(outcome.cargoDestroyed).toBe(3);
    expect(state.raid!.rooms.every((q) => !q.bonus.taken && !q.completed)).toBe(true);
    expect(state.players[0]!.armour).toBe(0);
    expect(outcome.stars).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic: the same seed and the same script give the same state', () => {
    const a = playDepot({ armour: true, heal: false }, 9);
    const b = playDepot({ armour: true, heal: false }, 9);
    expect(a.state.tick).toBe(b.state.tick);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.sink.length).toBe(b.sink.length);
  });
});

describe('failing the depot', () => {
  it('spending every life fails the raid (failedBy lives) and ends the match', () => {
    const state = newRaid('warehouseDispatchDepot', { lives: 2 });
    const sink: SimEvent[] = [];
    const human = state.players[0]!;
    // a life is lost whenever the human is defeated: here by a real campaign hit that takes all his health
    const killHuman = (): void => fallHuman(state, sink);
    killHuman();
    expect(human.alive).toBe(false);
    expect(state.raid!.livesUsed).toBe(1);
    expect(state.match.phase).toBe('playing');
    // back at the entrance after the delay, with spawn protection and full health
    until(state, () => human.alive, 400, sink, {}, 'respawn');
    expect([human.x, human.y]).toEqual([state.raid!.entrance.x, state.raid!.entrance.y]);
    expect(state.tick).toBeLessThan(state.raid!.deathSeen! + 400);
    expect(human.protectedUntil).toBeGreaterThan(state.tick);
    expect(human.vitals!.hp).toBe(human.vitals!.maxHp);
    expect(of(sink, 'playerRespawned')).toHaveLength(1);
    // the second fall spends the last life
    advance(state, state.config.protection.spawnProtectionTicks + 2, {}, sink);
    killHuman();
    expect(state.match.phase).toBe('ended');
    const outcome = state.raid!.outcome!;
    expect(outcome.result).toBe('failed');
    expect(outcome.failedBy).toBe('lives');
    expect(outcome.livesUsed).toBe(2);
    expect(outcome.stars).toBe(0);
    expect(outcome.hpLeft).toBe(0);
    expect(of(sink, 'raidOutcome')).toHaveLength(1);
    expect(raidView(state)!.stage).toBe('failed');
  });

  it('running out the clock fails the raid (failedBy time)', () => {
    const state = newRaid('warehouseDispatchDepot', { timeLimitSec: 5 });
    const sink = advance(state, 5 * 60 + 5);
    expect(state.match.phase).toBe('ended');
    const outcome = state.raid!.outcome!;
    expect(outcome.result).toBe('failed');
    expect(outcome.failedBy).toBe('time');
    expect(outcome.cargoDestroyed).toBe(0);
    expect(outcome.stars).toBe(0);
    expect(of(sink, 'raidOutcome')).toHaveLength(1);
    expect(state.match.result).toEqual({ kind: 'draw', reason: 'timeout' });
  });

  it('the exit does nothing before the objective is done', () => {
    const state = newRaid('warehouseDispatchDepot');
    const ex = state.raid!.extraction;
    put(state, 0, ex.x, ex.y);
    advance(state, 30);
    expect(state.match.phase).toBe('playing');
    expect(state.raid!.stage).toBe('cargo');
    expect(state.raid!.extraction.open).toBe(false);
  });
});
