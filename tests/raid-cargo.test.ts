/**
 * Marked cargo, sturdy crates and barrels (docs/CLASSIC_RAIDS.md, decisions RD2-RD4), and the cross blast of a raid:
 * a target takes one hit per SEPARATE blast, only flames damage it, a wall or the range stops the flame, a destroyed barrel
 * explodes once a few ticks later and can set off the next one.
 */
import { describe, expect, it } from 'vitest';
import { BLAST_RULE_BY_GAME } from '../src/sim/modes';
import { Tile } from '../src/sim/types';
import { raidView, tick } from '../src/sim';
import { hitCargo } from '../src/sim/raid/cargo';
import { RAID_TUNING } from '../src/sim/raid';
import { flameKeys, keys } from './helpers';
import { advance, explodeAt, newRaid, of, put } from './raid-helpers';

const at = (state: ReturnType<typeof newRaid>, x: number, y: number) => state.tiles[y * state.width + x];
const open = (state: ReturnType<typeof newRaid>, x: number, y: number): void => {
  state.tiles[y * state.width + x] = Tile.Empty;
};

describe('the raid blast is the cross', () => {
  it('the ruleset says cross and the generator is the plus (no radial flames)', () => {
    expect(BLAST_RULE_BY_GAME.raid).toBe('cross');
    const state = newRaid();
    expect(state.settings.game).toBe('raid');
    expect(state.config.generator.blastMode).toBe('plus');
    expect(state.players[0]!.range).toBe(2);
  });

  it('flames run along the row and column only, stop at concrete, and cover nothing diagonal', () => {
    const state = newRaid();
    // (11,6): a corridor tile between the pillars (10,6) and (12,6): the row arms stop at once, the column arms run
    // their two tiles (the lane (11,5)-(11,4) up, (11,7)-(11,8) down)
    put(state, 0, 1, 11);
    const ev = explodeAt(state, 11, 6);
    expect(of(ev, 'generatorExploded')[0]!.radial).toBeUndefined();
    expect(flameKeys(state)).toEqual(keys([11, 6], [11, 5], [11, 4], [11, 7], [11, 8]));
    for (const f of state.flames) expect(f.x === 11 || f.y === 6).toBe(true);
  });

  it('a plain crate absorbs the arm and breaks; the range is two tiles', () => {
    const state = newRaid();
    put(state, 0, 1, 11);
    // (7,5): west arm (6,5) then the crate at (5,5)
    const ev = explodeAt(state, 7, 5);
    expect(of(ev, 'blockDestroyed').map((e) => [e.x, e.y])).toEqual([[5, 5]]);
    expect(at(state, 5, 5)).toBe(Tile.Empty);
    // nothing is more than two tiles from the generator
    for (const f of state.flames) expect(Math.abs(f.x - 7) + Math.abs(f.y - 5)).toBeLessThanOrEqual(2);
  });
});

describe('marked cargo', () => {
  /** M1 of the depot at (8,7): pillars above and below, the lane open on both sides (the crate at (6,7) cleared). */
  function cargoRig() {
    const state = newRaid();
    put(state, 0, 1, 11);
    open(state, 9, 7);
    open(state, 7, 7);
    open(state, 6, 7);
    return state;
  }

  it('loses one hit point per separate blast and falls on the last one', () => {
    const state = cargoRig();
    const cargo = state.raid!.cargo.find((c) => c.id === 'cargo-1')!;
    expect([cargo.x, cargo.y, cargo.hp, cargo.marked]).toEqual([8, 7, 2, true]);
    let ev = explodeAt(state, 10, 7); // west arm: (9,7), then the cargo at (8,7)
    expect(of(ev, 'cargoHit')).toEqual([
      { type: 'cargoHit', id: 'cargo-1', x: 8, y: 7, hpAfter: 1, maxHp: 2, byId: 0 },
    ]);
    expect(cargo.hp).toBe(1);
    expect(at(state, 8, 7)).toBe(Tile.Soft); // still standing, still solid
    expect(raidView(state)!.cargo.find((c) => c.id === 'cargo-1')!.state).toBe('damaged');
    advance(state, state.config.generator.flameTicks + 5);
    ev = explodeAt(state, 6, 7); // the other side: a second, separate blast
    expect(of(ev, 'cargoDestroyed')).toEqual([
      { type: 'cargoDestroyed', id: 'cargo-1', kind: 'cargo', x: 8, y: 7, marked: true, byId: 0 },
    ]);
    expect(cargo.destroyed).toBe(true);
    expect(at(state, 8, 7)).toBe(Tile.Empty);
    expect(raidView(state)!.progress).toEqual({ done: 1, goal: 3, label: '1 of 3 destroyed' });
  });

  it('two generators going off in the same tick count as one hit (a chain counts once)', () => {
    const state = cargoRig();
    // two seeds on either side of the cargo, exploding together
    const gens = [
      { x: 10, y: 7 },
      { x: 6, y: 7 },
    ];
    for (const g of gens) state.generators.push({ ...mk(state, g.x, g.y), triggered: true });
    const ev = tick(state, {});
    expect(of(ev, 'generatorExploded')).toHaveLength(2);
    expect(of(ev, 'cargoHit')).toHaveLength(1);
    expect(state.raid!.cargo.find((c) => c.id === 'cargo-1')!.hp).toBe(1);
  });

  it('is hit only by flames: a wall, the range, or no blast leaves it alone', () => {
    const state = cargoRig();
    const cargo = state.raid!.cargo.find((c) => c.id === 'cargo-1')!;
    explodeAt(state, 8, 5); // the pillar at (8,6) stops the south arm
    advance(state, state.config.generator.flameTicks + 5);
    explodeAt(state, 12, 7); // four tiles away: out of the plus's reach
    advance(state, state.config.generator.flameTicks + 5);
    expect(cargo.hp).toBe(2);
    // the player standing next to it, pressing every button, does not hurt it
    put(state, 0, 9, 7);
    advance(state, 200, { 0: { special: true, action: true, skill: true, move: 'left' } });
    expect(cargo.hp).toBe(2);
    expect(cargo.destroyed).toBe(false);
  });

  it('unmarked cargo and plain crates do not count towards the objective; sturdy crates take two blasts', () => {
    const state = newRaid('recordsVault');
    put(state, 0, 1, 11);
    const lock = state.raid!.cargo.find((c) => c.kind === 'crate')!;
    expect(lock.marked).toBe(false);
    expect(lock.maxHp).toBe(2);
    // the shelf in the archive alcove at (5,4): hit it twice from the archive corridor below it
    expect([lock.x, lock.y]).toEqual([5, 4]);
    const events = [] as ReturnType<typeof explodeAt>;
    events.push(...explodeAt(state, 5, 5));
    expect(lock.hp).toBe(1);
    advance(state, state.config.generator.flameTicks + 5);
    events.push(...explodeAt(state, 5, 5));
    expect(lock.destroyed).toBe(true);
    expect(of(events, 'cargoHit')).toHaveLength(1);
    expect(of(events, 'cargoDestroyed').map((e) => [e.id, e.marked])).toEqual([[lock.id, false]]);
    expect(raidView(state)!.progress.done).toBe(0);
  });

  it('cargo that vehicles or other non-blast damage reaches still breaks cleanly (hitCargo)', () => {
    const state = cargoRig();
    const cargo = state.raid!.cargo.find((c) => c.id === 'cargo-1')!;
    const ev: ReturnType<typeof explodeAt> = [];
    hitCargo(state, cargo, 5, null, ev);
    expect(cargo.destroyed).toBe(true);
    expect(of(ev, 'cargoDestroyed')).toHaveLength(1);
    hitCargo(state, cargo, 1, null, ev); // already gone: nothing more happens
    expect(of(ev, 'cargoDestroyed')).toHaveLength(1);
  });
});

/** A bare generator record (tests/helpers `addGenerator` without pushing). */
function mk(state: ReturnType<typeof newRaid>, x: number, y: number) {
  return {
    id: state.nextId++,
    ownerId: 0,
    x,
    y,
    stepFromX: x,
    stepFromY: y,
    range: 2,
    pierce: false,
    square: 0,
    fromSpectator: false,
    mode: 'timed' as const,
    timer: 999,
    carriedBy: null,
    carryBonusUsed: false,
    slide: null,
    flight: null,
    triggered: false,
    placedTick: state.tick,
  };
}

describe('barrels', () => {
  /** The Mushin storeroom: M at (8,5) between the barrels (7,5) and (9,5); barrels (7,1) and (8,1) in the office. */
  it('a destroyed barrel explodes once, a few ticks later, and hits the cargo beside it', () => {
    const state = newRaid('partsStoreroom');
    put(state, 0, 1, 9);
    const stack = state.raid!.cargo.find((c) => c.id === 'cargo-1')!;
    expect([stack.x, stack.y]).toEqual([8, 5]);
    const ev = explodeAt(state, 5, 5); // east arm: (6,5), then the barrel at (7,5)
    const t0 = state.tick;
    expect(of(ev, 'cargoDestroyed').map((e) => [e.id, e.kind])).toEqual([['barrel-2', 'barrel']]);
    expect(state.raid!.barrelBlasts).toEqual([
      { x: 7, y: 5, atTick: t0 + RAID_TUNING.barrelFuseTicks, ownerId: 0 },
    ]);
    expect(stack.hp).toBe(2); // not yet
    const after = advance(state, RAID_TUNING.barrelFuseTicks + 1);
    expect(state.raid!.barrelBlasts).toEqual([]);
    expect(of(after, 'cargoHit').filter((e) => e.id === 'cargo-1')).toHaveLength(1);
    expect(stack.hp).toBe(1);
    // a plus of flames around the barrel, nothing past a wall
    expect(state.flames.some((f) => f.x === 7 && f.y === 5)).toBe(true);
    expect(state.flames.some((f) => f.x === 8 && f.y === 5)).toBe(true);
    // it exploded once: later ticks add no more hits
    const later = advance(state, 200);
    expect(of(later, 'cargoHit')).toHaveLength(0);
    expect(stack.hp).toBe(1);
  });

  it('a barrel next to a barrel chains, one after the other', () => {
    const state = newRaid('partsStoreroom');
    put(state, 0, 1, 9);
    const first = explodeAt(state, 10, 1); // office: west arm (9,1), then the barrel at (8,1)
    const t0 = state.tick;
    expect(of(first, 'cargoDestroyed').map((e) => e.id)).toEqual(['barrel-1']);
    const seen: { id: string; at: number }[] = [];
    for (let i = 0; i < 40; i++) {
      for (const e of of(tick(state, {}), 'cargoDestroyed')) seen.push({ id: e.id, at: state.tick - t0 });
    }
    expect(seen.map((s) => s.id)).toEqual(['barrel-0']); // the barrel beside it went with the first one's blast
    expect(seen[0]!.at).toBeGreaterThanOrEqual(RAID_TUNING.barrelFuseTicks);
    // and its own blast follows one fuse later: nothing is left pending afterwards
    expect(state.raid!.barrelBlasts).toEqual([]);
  });

  it('barrel flames hurt a player standing next to it (through the ordinary flame rules)', () => {
    const state = newRaid('partsStoreroom');
    put(state, 0, 6, 5);
    const human = state.players[0]!;
    // destroy the barrel next to him with a hit, then let its fuse run
    hitCargo(
      state,
      state.raid!.cargo.find((c) => c.id === 'barrel-2')!,
      1,
      0,
      [],
    );
    advance(state, RAID_TUNING.barrelFuseTicks + 2);
    expect(state.flames.some((f) => f.x === human.x && f.y === human.y)).toBe(true);
    expect(!human.alive || human.vitals!.hp < human.vitals!.maxHp).toBe(true);
  });
});
