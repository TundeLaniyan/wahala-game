/**
 * The shape of a raid (docs/CLASSIC_RAIDS.md): enemy waves, locked areas and opened routes, optional side rooms and their
 * bonuses, the extraction, lives and the health carried in and out. Conditions are set up with the same entry points the
 * sim uses (`hitCargo`, a seat going down, a tile being stepped on); the full run with real bombs is `raid-slice.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { abandonRaid, raidView } from '../src/sim';
import type { SimEvent } from '../src/sim';
import { hitCargo } from '../src/sim/raid/cargo';
import { RAID_TUNING } from '../src/sim/raid';
import { Tile } from '../src/sim/types';
import {
  advance,
  fallHuman,
  knockOut,
  letWavesAppear,
  newRaid,
  of,
  put,
  until,
  waveSeats,
} from './raid-helpers';

const destroy = (state: ReturnType<typeof newRaid>, id: string, sink: SimEvent[] = []): SimEvent[] => {
  hitCargo(
    state,
    state.raid!.cargo.find((c) => c.id === id)!,
    99,
    0,
    sink,
  );
  return sink;
};
const doorOpen = (state: ReturnType<typeof newRaid>, id: string): boolean =>
  state.raid!.doors.find((d) => d.id === id)!.open;
const solid = (state: ReturnType<typeof newRaid>, x: number, y: number): boolean =>
  state.tiles[y * state.width + x] !== Tile.Empty;

describe('enemy waves', () => {
  it('every enemy is a dormant seat until its wave, and appears on its spot after the warning', () => {
    const state = newRaid();
    const seats = state.raid!.seats;
    expect(seats).toHaveLength(6);
    for (const s of seats) expect(state.players[s.playerId]!.alive).toBe(false);
    expect(raidView(state)!.wave).toEqual({ index: 0, total: 2, enemiesAlive: 0, nextInTicks: null });
    // the first wave starts with the raid: announced, then the spawn spots warn, then the guards stand there
    const sink = advance(state, 1);
    expect(of(sink, 'raidWaveStarted')).toEqual([{ type: 'raidWaveStarted', index: 1, total: 2 }]);
    const v = raidView(state)!;
    expect(v.warnings.filter((w) => w.kind === 'wave')).toHaveLength(1);
    expect(v.wave.index).toBe(1);
    expect(v.wave.nextInTicks).toBeGreaterThan(0);
    for (const id of waveSeats(state, 0)) expect(state.players[id]!.alive).toBe(false);
    letWavesAppear(state, sink);
    const guards = waveSeats(state, 0).map((id) => state.players[id]!);
    expect(guards.every((p) => p.alive && p.enemyKind === 'guard' && p.team === 1)).toBe(true);
    expect(guards.map((p) => [p.x, p.y])).toEqual(
      state.raid!.seats.slice(0, 3).map((s) => [s.spot.x, s.spot.y]),
    );
    expect(raidView(state)!.wave.enemiesAlive).toBe(3);
    // the second wave is still asleep
    for (const id of waveSeats(state, 1)) expect(state.players[id]!.alive).toBe(false);
    expect(raidView(state)!.seats!.filter((s) => s.active)).toHaveLength(3);
  });

  it('the second wave starts when its trigger is met, never before, and the numbers follow', () => {
    const state = newRaid();
    const sink = advance(state, 600);
    expect(of(sink, 'raidWaveStarted')).toHaveLength(1); // the cargo is untouched: no second wave
    destroy(state, 'cargo-1', sink);
    advance(state, 1, {}, sink);
    expect(of(sink, 'raidWaveStarted').map((e) => e.index)).toEqual([1, 2]);
    letWavesAppear(state, sink);
    expect(waveSeats(state, 1).map((id) => state.players[id]!.enemyKind)).toEqual([
      'thrower',
      'thrower',
      'lieutenant',
    ]);
    expect(waveSeats(state, 1).every((id) => state.players[id]!.alive)).toBe(true);
    expect(raidView(state)!.wave).toMatchObject({ index: 2, total: 2, enemiesAlive: 6 });
  });

  it('a spot that is blocked waits (then shifts) rather than stacking an enemy on the player', () => {
    const state = newRaid();
    const spot = state.raid!.seats[0]!.spot;
    put(state, 0, spot.x, spot.y);
    advance(state, RAID_TUNING.spawnWarnTicks + 5);
    const first = state.players[state.raid!.seats[0]!.playerId]!;
    expect(first.alive).toBe(false); // waiting
    advance(state, RAID_TUNING.spawnRetryTicks + 5);
    expect(first.alive).toBe(true);
    expect([first.x, first.y]).not.toEqual([spot.x, spot.y]);
  });

  it('enemies never respawn: a fallen guard stays down', () => {
    const state = newRaid();
    letWavesAppear(state);
    const [a] = waveSeats(state, 0);
    knockOut(state, a!);
    advance(state, 900);
    expect(state.players[a!]!.alive).toBe(false);
    expect(state.config.respawn.enabled).toBe(false);
  });

  it('a cleared wave is recorded once all of its enemies are down', () => {
    const state = newRaid();
    letWavesAppear(state);
    expect(state.raid!.waves[0]!.clearedTick).toBeNull();
    knockOut(state, ...waveSeats(state, 0).slice(0, 2));
    advance(state, 2);
    expect(state.raid!.waves[0]!.clearedTick).toBeNull();
    knockOut(state, waveSeats(state, 0)[2]!);
    advance(state, 2);
    expect(state.raid!.waves[0]!.clearedTick).not.toBeNull();
  });
});

describe('locked areas and opened routes', () => {
  it('a wave-cleared door stays shut until the wave is down, then opens for good', () => {
    const state = newRaid();
    letWavesAppear(state);
    advance(state, 300);
    expect(doorOpen(state, 'bayDoor')).toBe(false);
    expect(solid(state, 12, 2)).toBe(true);
    expect(raidView(state)!.doors.find((d) => d.id === 'bayDoor')).toMatchObject({
      locked: true,
      optionalRoom: false,
      opensWhen: 'Clear the depot guards',
    });
    knockOut(state, ...waveSeats(state, 0));
    const sink = advance(state, 3);
    expect(of(sink, 'raidDoorOpened')).toEqual([{ type: 'raidDoorOpened', id: 'bayDoor', x: 12, y: 2 }]);
    expect(solid(state, 12, 2)).toBe(false);
    advance(state, 600); // route changes are permanent
    expect(doorOpen(state, 'bayDoor')).toBe(true);
    expect(raidView(state)!.doors.find((d) => d.id === 'bayDoor')!.locked).toBe(false);
  });

  it('a door can wait for a specific crate (the lock-box) - and for nothing else', () => {
    const state = newRaid();
    destroy(state, 'cargo-1'); // a marked crate is not the lock-box
    advance(state, 5);
    expect(doorOpen(state, 'armourDoor')).toBe(false);
    destroy(state, 'goods-0');
    const sink = advance(state, 3);
    expect(doorOpen(state, 'armourDoor')).toBe(true);
    expect(of(sink, 'raidRoomOpened').map((e) => e.id)).toEqual(['armourLocker']);
  });

  it('a floor switch opens its door when the player steps on it, and not when someone else does', () => {
    const state = newRaid();
    letWavesAppear(state);
    const enemy = state.players[waveSeats(state, 0)[0]!]!;
    put(state, enemy.id, 12, 7);
    advance(state, 10);
    expect(state.raid!.switches[0]!.pressed).toBe(false);
    expect(doorOpen(state, 'firstAidDoor')).toBe(false);
    put(state, 0, 12, 7);
    const sink = advance(state, 3);
    expect(state.raid!.switches[0]!.pressed).toBe(true);
    expect(of(sink, 'raidDoorOpened').map((e) => e.id)).toEqual(['firstAidDoor']);
    put(state, 0, 1, 11);
    advance(state, 50);
    expect(state.raid!.switches[0]!.pressed).toBe(true); // permanent
  });

  it('count conditions, door chains and "lieutenant down" (the records vault)', () => {
    const state = newRaid('recordsVault');
    const sink: SimEvent[] = [];
    letWavesAppear(state, sink);
    expect(doorOpen(state, 'registryDoor')).toBe(false);
    knockOut(state, ...waveSeats(state, 0));
    advance(state, 3, {}, sink);
    expect(doorOpen(state, 'registryDoor')).toBe(true);
    // the registry cabinet (one marked cargo) opens the archive door and wakes the archive wave
    expect(doorOpen(state, 'archiveDoor')).toBe(false);
    destroy(state, 'cargo-2', sink);
    advance(state, 3, {}, sink);
    expect(doorOpen(state, 'archiveDoor')).toBe(true);
    expect(state.raid!.waves[1]!.startedTick).not.toBeNull();
    letWavesAppear(state, sink);
    const [guard, lieutenant, thrower] = waveSeats(state, 1);
    expect(state.players[lieutenant!]!.enemyKind).toBe('lieutenant');
    // killing the others is not enough: the vault opens when the lieutenant is down
    knockOut(state, guard!, thrower!);
    advance(state, 5, {}, sink);
    expect(doorOpen(state, 'vaultDoor')).toBe(false);
    knockOut(state, lieutenant!);
    advance(state, 3, {}, sink);
    expect(doorOpen(state, 'vaultDoor')).toBe(true);
    expect(of(sink, 'raidDoorOpened').map((e) => e.id)).toEqual(['registryDoor', 'archiveDoor', 'vaultDoor']);
  });

  it('a count door needs that many marked cargo (the storeroom office needs two)', () => {
    const state = newRaid('partsStoreroom');
    destroy(state, 'cargo-1');
    advance(state, 3);
    expect(doorOpen(state, 'officeDoor')).toBe(false);
    destroy(state, 'cargo-2');
    advance(state, 3);
    expect(doorOpen(state, 'officeDoor')).toBe(true);
  });
});

describe('optional side rooms', () => {
  it('opening a room is announced, but nothing forces the player in', () => {
    const state = newRaid();
    const sink = destroy(state, 'goods-0');
    advance(state, 3, {}, sink);
    expect(of(sink, 'raidRoomOpened')).toEqual([{ type: 'raidRoomOpened', id: 'armourLocker' }]);
    const v = raidView(state)!;
    expect(v.rooms).toEqual([
      { id: 'armourLocker', name: 'Armour locker', opened: true, completed: false, optional: true },
      { id: 'firstAid', name: 'First-aid cupboard', opened: false, completed: false, optional: true },
    ]);
    expect(v.doors.filter((d) => d.optionalRoom).map((d) => d.id)).toEqual(['armourDoor', 'firstAidDoor']);
    // the objective does not mention them
    expect(v.objective).toBe('Destroy the 3 marked dispatch crates');
    expect(v.stage).toBe('cargo');
  });

  it('the Armour plate is picked up once, capped by the rules, and completes the room', () => {
    const state = newRaid();
    destroy(state, 'goods-0');
    advance(state, 3);
    const human = state.players[0]!;
    expect(human.armour).toBe(0);
    put(state, 0, 1, 1);
    const sink = advance(state, 3);
    expect(human.armour).toBe(1);
    expect(of(sink, 'raidBonusTaken')).toEqual([
      { type: 'raidBonusTaken', roomId: 'armourLocker', kind: 'armour', x: 1, y: 1 },
    ]);
    expect(state.raid!.rooms[0]!.completed).toBe(true);
    put(state, 0, 2, 2);
    put(state, 0, 1, 1);
    advance(state, 5);
    expect(human.armour).toBe(1); // taken once
    expect(raidView(state)!.bonuses!.find((b) => b.roomId === 'armourLocker')!.taken).toBe(true);
  });

  it('the heal segment restores one segment and never more than the maximum', () => {
    const state = newRaid('warehouseDispatchDepot', { hp: 2 });
    const human = state.players[0]!;
    expect(human.vitals).toMatchObject({ hp: 2, maxHp: 4 });
    put(state, 0, 12, 7);
    advance(state, 3); // the switch
    put(state, 0, 11, 11);
    advance(state, 3);
    expect(human.vitals!.hp).toBe(2 + RAID_TUNING.healBonus);
    const full = newRaid();
    put(full, 0, 12, 7);
    advance(full, 3);
    put(full, 0, 11, 11);
    advance(full, 3);
    expect(full.players[0]!.vitals!.hp).toBe(4);
  });

  it('a side room can hold a small enemy group, and a star token is worth a star', () => {
    const state = newRaid('railYardGoods');
    const closet = state.raid!.waves.find((w) => w.room === 'closet')!;
    expect(closet.seatIds).toHaveLength(1);
    expect(raidView(state)!.wave.total).toBe(2); // the closet group is not a wave in the numbers
    letWavesAppear(state);
    put(state, 0, 3, 8); // the switch
    advance(state, 3);
    expect(doorOpen(state, 'closetDoor')).toBe(true);
    expect(closet.startedTick).not.toBeNull();
    const agbero = state.players[closet.seatIds[0]!]!;
    expect(agbero.enemyKind).toBe('agbero');
    expect(agbero.alive).toBe(false);
    advance(state, RAID_TUNING.spawnWarnTicks + 3);
    expect(agbero.alive).toBe(true);
    expect([agbero.x, agbero.y]).toEqual([2, 1]);
    // take the token, finish the raid late and without losing a life: 1 + no life lost + the token = 3 stars; without = 2
    const finish = (token: boolean): number => {
      const s = newRaid('railYardGoods');
      s.raid!.rooms[0]!.opened = true;
      if (token) {
        s.raid!.doors[0]!.open = true;
        s.tiles[1 * s.width + 3] = Tile.Empty;
        put(s, 0, 1, 1);
        advance(s, 3);
        expect(s.raid!.bonusStars).toBe(1);
      }
      advance(s, 60 * 170); // past the par time
      for (const c of s.raid!.cargo.filter((q) => q.marked)) destroy(s, c.id);
      advance(s, 3);
      const ex = s.raid!.extraction;
      put(s, 0, ex.x, ex.y);
      advance(s, 3);
      return s.raid!.outcome!.stars;
    };
    expect(finish(false)).toBe(2);
    expect(finish(true)).toBe(3);
  });
});

describe('extraction and the outcome', () => {
  it('the exit opens when the last marked cargo falls, once, and reaching it ends the raid', () => {
    const state = newRaid();
    const sink: SimEvent[] = [];
    for (const id of ['cargo-0', 'cargo-1']) destroy(state, id, sink);
    advance(state, 3, {}, sink);
    expect(state.raid!.stage).toBe('cargo');
    expect(of(sink, 'raidExtractionOpened')).toHaveLength(0);
    destroy(state, 'cargo-2', sink);
    advance(state, 3, {}, sink);
    expect(state.raid!.stage).toBe('extract');
    expect(of(sink, 'raidExtractionOpened')).toEqual([{ type: 'raidExtractionOpened', x: 15, y: 11 }]);
    expect(raidView(state)!.extraction).toEqual({ open: true, x: 15, y: 11 });
    expect(raidView(state)!.hint).toBe('Reach the exit');
    advance(state, 100, {}, sink);
    expect(state.match.phase).toBe('playing'); // the objective alone does not end it
    put(state, 0, 15, 11);
    advance(state, 2, {}, sink);
    expect(state.match.phase).toBe('ended');
    expect(of(sink, 'raidExtractionOpened')).toHaveLength(1);
    const outcome = state.raid!.outcome!;
    expect(outcome).toMatchObject({
      raidId: 'warehouseDispatchDepot',
      result: 'completed',
      cargoDestroyed: 3,
      cargoTotal: 3,
      livesUsed: 0,
      hpLeft: 4,
      optionalRoomsOpened: 0,
      optionalRoomsTotal: 2,
    });
    expect(outcome.stars).toBe(3); // no life lost, inside the par time
  });

  it('brings the health in and out: a field mission hands its hp in, the outcome hands it back', () => {
    const state = newRaid('warehouseDispatchDepot', { hp: 2 });
    expect(state.players[0]!.vitals).toMatchObject({ hp: 2, maxHp: 4 });
    for (const c of state.raid!.cargo.filter((q) => q.marked)) destroy(state, c.id);
    advance(state, 3);
    put(state, 0, 15, 11);
    advance(state, 3);
    expect(state.raid!.outcome).toMatchObject({ result: 'completed', hpLeft: 2 });
  });

  it('dying with lives left costs a life and full health on return; the health carried in is spent first', () => {
    const state = newRaid('warehouseDispatchDepot', { hp: 1, lives: 3 });
    const human = state.players[0]!;
    const sink: SimEvent[] = [];
    fallHuman(state, sink); // a real campaign hit that defeats him
    expect(human.alive).toBe(false);
    expect(state.raid!.livesUsed).toBe(1);
    expect(raidView(state)!.lives).toEqual({ used: 1, max: 3 });
    until(state, () => human.alive, 300, sink, {}, 'respawn');
    expect(human.vitals!.hp).toBe(4); // a fresh life is a full health bar
    expect(human.protectedUntil).toBeGreaterThan(state.tick);
    expect(human.vitals!.invulnUntil).toBe(human.protectedUntil);
  });

  it('abandoning ends the raid with no stars and the health as it stands', () => {
    const state = newRaid('warehouseDispatchDepot', { hp: 3 });
    const sink: SimEvent[] = [];
    abandonRaid(state, sink);
    expect(state.match.phase).toBe('ended');
    expect(state.raid!.outcome).toMatchObject({ result: 'abandoned', stars: 0, hpLeft: 3 });
    expect(of(sink, 'raidOutcome')).toHaveLength(1);
    abandonRaid(state, sink); // idempotent
    expect(of(sink, 'raidOutcome')).toHaveLength(1);
  });
});
