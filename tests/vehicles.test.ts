import { describe, expect, it } from 'vitest';
import { allBorderEntries, buildRoute, listEntries, listKekeTurns } from '../src/sim';
import type { GameState, VehicleEntry, VehicleTurn } from '../src/sim';
import { addGenerator, addSoft, eventsOf, put, run, runUntil, sandbox } from './helpers';

const LANE: VehicleEntry = { x: 4, y: 0, dir: 'down' };

function launch(s: GameState, owner: number, entry: VehicleEntry, turn?: VehicleTurn): void {
  s.players[owner]!.hasVoucher = true;
  run(s, 1, { [owner]: { vehicle: { type: 'begin' } } });
  run(s, 1, { [owner]: { vehicle: { type: 'launch', entry, turn } } });
}

function drive(s: GameState, max = 900): void {
  runUntil(s, () => s.vehicles.length === 0, max);
}

/** A 4-player sandbox with the owner and a bystander parked far from lane x=4. */
function lane4(characters: ('streetBaller' | 'lekkiBoy' | 'campusQueen')[]): GameState {
  const s = sandbox({ characters: [characters[0]!, 'streetBaller', 'streetBaller', 'streetBaller'] });
  put(s, 0, 0, 10);
  put(s, 1, 14, 0);
  put(s, 2, 12, 8);
  put(s, 3, 14, 10);
  return s;
}

describe('vehicle entry', () => {
  it('lists every legal border entry (any border tile, not fixed gates) and rejects blocked ones', () => {
    const s = sandbox();
    const entries = listEntries(s, 'danfo');
    expect(entries).toHaveLength(28);
    expect(entries.some((e) => e.x === 0 && e.y === 0 && e.dir === 'down')).toBe(true);
    expect(entries.some((e) => e.x === 0 && e.y === 0 && e.dir === 'right')).toBe(true);
    expect(entries.some((e) => e.x === 1 && e.y === 0)).toBe(false); // pillar directly inside
    expect(buildRoute(s, 'danfo', { x: 1, y: 0, dir: 'down' })).toBeNull();
    expect(buildRoute(s, 'danfo', { x: 5, y: 5, dir: 'down' })).toBeNull(); // not on the border
    expect(allBorderEntries(s).length).toBeGreaterThan(entries.length);
  });

  it('builds straight routes for Danfo/taxi and exactly-one-turn L routes for Keke', () => {
    const s = sandbox();
    const straight = buildRoute(s, 'danfo', LANE)!;
    expect(straight).toHaveLength(11);
    expect(straight.every((t) => t.x === 4)).toBe(true);
    expect(buildRoute(s, 'keke', LANE)).toBeNull(); // Keke needs a turn
    const turn = listKekeTurns(s, LANE).find((t) => t.atIndex === 4 && t.dir === 'right')!;
    const route = buildRoute(s, 'keke', LANE, turn)!;
    const dirChanges = route
      .slice(2)
      .filter((t, i) => (t.x !== route[i + 1]!.x) !== (route[i + 1]!.x !== route[i]!.x)).length;
    expect(dirChanges).toBe(1);
    expect(route[4]).toEqual({ x: 4, y: 4 });
    expect(route[5]).toEqual({ x: 5, y: 4 });
    expect(route.every((t) => !(t.x % 2 === 1 && t.y % 2 === 1))).toBe(true); // never through concrete
  });

  it('needs a voucher, can be cancelled without losing it, times out after 8 seconds, rejects illegal launches', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    run(s, 1, { 0: { vehicle: { type: 'begin' } } });
    expect(s.players[0]!.entryUntil).toBeNull();
    s.players[0]!.hasVoucher = true;
    run(s, 1, { 0: { vehicle: { type: 'begin' } } });
    expect(s.players[0]!.entryUntil).not.toBeNull();
    run(s, 1, { 0: { vehicle: { type: 'launch', entry: { x: 1, y: 0, dir: 'down' } } } });
    expect(s.vehicles).toHaveLength(0);
    expect(s.players[0]!.entryUntil).not.toBeNull();
    run(s, 1, { 0: { vehicle: { type: 'cancel' } } });
    expect(s.players[0]!.hasVoucher).toBe(true);
    run(s, 1, { 0: { vehicle: { type: 'begin' } } });
    const ev = run(s, s.config.vehicles.entryWindowTicks + 2);
    expect(eventsOf(ev, 'vehicleEntryCancelled')[0]!.reason).toBe('timeout');
    expect(s.players[0]!.hasVoucher).toBe(true);
  });

  it('the selecting player stands still while choosing', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    s.players[0]!.hasVoucher = true;
    run(s, 1, { 0: { vehicle: { type: 'begin' } } });
    run(s, 40, { 0: { move: 'right' } });
    expect(s.players[0]!.x).toBe(4);
  });

  it('warns before the vehicle appears', () => {
    const s = lane4(['streetBaller']);
    launch(s, 0, LANE);
    expect(s.vehicles[0]!.phase).toBe('warning');
    run(s, s.config.vehicles.entryWarnTicks - 2);
    expect(s.vehicles[0]!.phase).toBe('warning');
    run(s, 3);
    expect(s.vehicles[0]!.phase).toBe('driving');
  });
});

describe('Danfo, taxi and Keke behaviour', () => {
  it('Danfo keeps going after hitting a player and can eliminate several', () => {
    const s = lane4(['streetBaller']);
    put(s, 1, 4, 3);
    put(s, 2, 4, 7);
    launch(s, 0, LANE);
    drive(s);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players[2]!.alive).toBe(false);
    expect(s.players[3]!.alive).toBe(true);
  });

  it('taxi stops on the first player it hits', () => {
    const s = lane4(['lekkiBoy']);
    put(s, 1, 4, 3);
    put(s, 2, 4, 7);
    launch(s, 0, LANE);
    drive(s);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players[2]!.alive).toBe(true);
  });

  it('Keke follows a single legal L turn and misses players on the straight beyond the turn', () => {
    const s = lane4(['campusQueen']);
    const turn = listKekeTurns(s, LANE).find((t) => t.atIndex === 4 && t.dir === 'right')!;
    put(s, 1, 9, 4);
    put(s, 2, 4, 8);
    launch(s, 0, LANE, turn);
    drive(s);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players[2]!.alive).toBe(true);
  });

  it('can eliminate its own owner', () => {
    const s = lane4(['streetBaller']);
    launch(s, 0, LANE);
    put(s, 0, 4, 5);
    const ev = runUntil(s, (e) => e.some((x) => x.type === 'playerEliminated'), 900);
    expect(eventsOf(ev, 'playerEliminated')[0]!.cause).toMatchObject({
      kind: 'vehicle',
      ownerId: 0,
      vehicleKind: 'danfo',
    });
  });

  it('Danfo rips through soft blocks; the taxi only breaks a limited number then crashes; concrete is never entered', () => {
    const s = lane4(['streetBaller']);
    for (const y of [2, 4, 6]) addSoft(s, 4, y);
    launch(s, 0, LANE);
    drive(s);
    expect([2, 4, 6].every((y) => s.tiles[y * s.width + 4] === 0)).toBe(true);

    const t = lane4(['lekkiBoy']);
    for (const y of [2, 4, 6]) addSoft(t, 4, y);
    launch(t, 0, LANE);
    drive(t);
    expect(t.tiles[2 * t.width + 4]).toBe(0);
    expect(t.tiles[4 * t.width + 4]).toBe(0);
    expect(t.tiles[6 * t.width + 4]).toBe(2); // third block stopped it
  });

  it('an Okada rider survives being run over, then is on foot', () => {
    const s = lane4(['streetBaller']);
    put(s, 1, 4, 3);
    s.players[1]!.mounted = true;
    launch(s, 0, LANE);
    drive(s);
    expect(s.players[1]!.alive).toBe(true);
    expect(s.players[1]!.mounted).toBe(false);
  });
});

describe('vehicle vs generator and cumulative blast damage', () => {
  const laneGen = (s: GameState, y: number, mode: 'timed' | 'remote' | 'disabled' = 'timed') =>
    addGenerator(s, { ownerId: 3, x: 4, y, mode, timer: 99999 });

  it('a vehicle detonates ANY generator it touches, even disabled or remote ones', () => {
    for (const mode of ['disabled', 'remote', 'timed'] as const) {
      const s = lane4(['streetBaller']);
      laneGen(s, 5, mode);
      launch(s, 0, LANE);
      const ev = runUntil(s, (e) => e.some((x) => x.type === 'generatorExploded'), 900);
      expect(eventsOf(ev, 'vehicleHitGenerator')).toHaveLength(1);
      expect(eventsOf(ev, 'generatorExploded')).toHaveLength(1);
    }
  });

  it('one standard blast (5 lane tiles) destroys a Keke but only damages and slows a taxi and a Danfo', () => {
    const outcome = (c: 'streetBaller' | 'lekkiBoy' | 'campusQueen') => {
      const s = lane4([c]);
      laneGen(s, 3);
      const turn = listKekeTurns(s, LANE).find((t) => t.atIndex === 8 && t.dir === 'right')!;
      launch(s, 0, LANE, c === 'campusQueen' ? turn : undefined);
      const ev = runUntil(s, (e) => e.some((x) => x.type === 'vehicleDamaged'), 900);
      const damaged = eventsOf(ev, 'vehicleDamaged')[0]!;
      return {
        s,
        damaged,
        destroyed: s.vehicles.length === 0 || s.vehicles[0]!.damage >= s.vehicles[0]!.slowUntil + 999,
      };
    };
    const keke = outcome('campusQueen');
    expect(keke.damaged.damage).toBe(5);
    expect(keke.s.vehicles).toHaveLength(0); // 5 >= 4
    const taxi = outcome('lekkiBoy');
    expect(taxi.damaged.damage).toBe(5);
    expect(taxi.s.vehicles).toHaveLength(1); // 5 < 6
    expect(taxi.s.vehicles[0]!.slowUntil).toBeGreaterThan(taxi.s.tick);
    const danfo = outcome('streetBaller');
    expect(danfo.damaged.damage).toBe(5);
    expect(danfo.s.vehicles).toHaveLength(1); // 5 < 9
  });

  it('damage ACCUMULATES across separate blasts during one journey', () => {
    const s = lane4(['streetBaller']);
    laneGen(s, 3);
    laneGen(s, 8);
    launch(s, 0, LANE);
    const first = runUntil(s, (e) => e.some((x) => x.type === 'vehicleDamaged'), 900);
    expect(eventsOf(first, 'vehicleDamaged')[0]!.total).toBe(5);
    expect(s.vehicles).toHaveLength(1);
    const second = runUntil(s, (e) => e.some((x) => x.type === 'vehicleDestroyed'), 900);
    expect(eventsOf(second, 'vehicleDamaged')[0]!.total).toBe(10);
    expect(eventsOf(second, 'vehicleDestroyed')[0]!.reason).toBe('blast');
    expect(s.vehicles).toHaveLength(0);
  });

  it('does not double count overlapping flames inside one chain reaction', () => {
    const s = lane4(['streetBaller']);
    laneGen(s, 3);
    laneGen(s, 4);
    launch(s, 0, LANE);
    const ev = runUntil(s, (e) => e.some((x) => x.type === 'vehicleDamaged'), 900);
    expect(eventsOf(ev, 'vehicleDamaged')[0]!.damage).toBe(6); // unique tiles (4,1)-(4,6), not 5 + 5
  });

  it('a stronger (longer range) blast can destroy even a Danfo alone', () => {
    const s = lane4(['streetBaller']);
    addGenerator(s, { ownerId: 3, x: 4, y: 5, range: 4, timer: 99999 });
    launch(s, 0, LANE);
    runUntil(s, (e) => e.some((x) => x.type === 'vehicleDestroyed'), 900);
    expect(s.vehicles).toHaveLength(0);
  });

  it('a surviving vehicle is slowed by the collision', () => {
    const s = lane4(['lekkiBoy']);
    laneGen(s, 3);
    launch(s, 0, LANE);
    runUntil(s, (e) => e.some((x) => x.type === 'vehicleDamaged'), 900);
    const v = s.vehicles[0]!;
    expect(v.stepTotal).toBeGreaterThan(s.config.vehicles.specs.taxi.stepTicks);
  });

  it('damage does not carry over to the next journey', () => {
    const s = lane4(['lekkiBoy']);
    laneGen(s, 3);
    launch(s, 0, LANE);
    drive(s);
    s.players[0]!.hasVoucher = true;
    s.players[0]!.alive = true;
    launch(s, 0, { x: 6, y: 0, dir: 'down' });
    expect(s.vehicles[0]!.damage).toBe(0);
    expect(s.vehicles[0]!.exposedEvents).toEqual([]);
  });
});
