/**
 * V2 protection layers (decision WC5): Okada and Armour plates each absorb one SEPARATE lethal hit; one
 * layer absorbs every lethal event of a tick (Okada first, then Armour); Wahala Crush shoves a protected
 * player to a free tile and the final closure (no free tile) always kills.
 */
import { describe, expect, it } from 'vitest';
import type { GameState, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { addGenerator, eventsOf, put, run, sandbox } from './helpers';

function arena(): GameState {
  const s = sandbox({ players: 3 });
  put(s, 0, 14, 10);
  put(s, 1, 4, 4);
  put(s, 2, 0, 10);
  return s;
}

/** A blast from P0 on P1's tile (4,4) right now (a fresh event each call). */
function hit(s: GameState, from: [number, number] = [4, 2]): SimEvent[] {
  addGenerator(s, { ownerId: 0, x: from[0], y: from[1], timer: 1 });
  return run(s, 1 + s.config.generator.flameTicks + 2);
}

function landCrush(s: GameState, x: number, y: number): SimEvent[] {
  s.crush = { order: [], next: 0, warnAt: [], nextAtTick: Infinity, pending: [{ index: y * s.width + x, landTick: s.tick + 1 }] };
  return run(s, 1);
}

describe('protection layers', () => {
  it('no layer: one lethal hit eliminates', () => {
    const s = arena();
    hit(s);
    expect(s.players[1]!.alive).toBe(false);
  });

  it('Armour absorbs one hit, the next separate hit eliminates', () => {
    const s = arena();
    const p = s.players[1]!;
    p.armour = 1;
    const ev = hit(s);
    expect(p.alive).toBe(true);
    expect(p.armour).toBe(0);
    expect(eventsOf(ev, 'protectionBroken')).toEqual([{ type: 'protectionBroken', playerId: 1, layer: 'armour', x: 4, y: 4 }]);
    hit(s, [4, 6]);
    expect(p.alive).toBe(false);
  });

  it('Okada + Armour: one explosion frame (even two blasts at once) takes only the Okada', () => {
    const s = arena();
    const p = s.players[1]!;
    p.mounted = true;
    p.armour = 1;
    addGenerator(s, { ownerId: 0, x: 4, y: 2, timer: 1 });
    addGenerator(s, { ownerId: 2, x: 2, y: 4, timer: 1 }); // a separate chain, same tick
    const ev = run(s, 1 + s.config.generator.flameTicks + 2);
    expect(p.alive).toBe(true);
    expect(p.mounted).toBe(false);
    expect(p.armour).toBe(1);
    expect(eventsOf(ev, 'protectionBroken').map((e) => e.layer)).toEqual(['okada']);
    expect(eventsOf(ev, 'okadaBroken')).toHaveLength(1);
  });

  it('Okada + Armour: survives two separate hits, the third eliminates', () => {
    const s = arena();
    const p = s.players[1]!;
    p.mounted = true;
    p.armour = 1;
    const layers: string[] = [];
    layers.push(...eventsOf(hit(s, [4, 2]), 'protectionBroken').map((e) => e.layer));
    expect(p.alive).toBe(true);
    layers.push(...eventsOf(hit(s, [4, 6]), 'protectionBroken').map((e) => e.layer));
    expect(p.alive).toBe(true);
    expect(layers).toEqual(['okada', 'armour']);
    const ev = hit(s, [2, 4]);
    expect(p.alive).toBe(false);
    expect(eventsOf(ev, 'playerEliminated')[0]).toMatchObject({ playerId: 1, creditId: 0 });
  });

  it('several Armour plates (City Rumble) each take one separate hit', () => {
    const s = arena();
    const p = s.players[1]!;
    p.armour = 3;
    hit(s, [4, 2]);
    hit(s, [4, 6]);
    hit(s, [2, 4]);
    expect(p.alive).toBe(true);
    expect(p.armour).toBe(0);
    hit(s, [6, 4]);
    expect(p.alive).toBe(false);
  });

  it('a continuing blast does not take a second layer during its grace', () => {
    const s = arena();
    const p = s.players[1]!;
    p.armour = 2;
    addGenerator(s, { ownerId: 0, x: 4, y: 2, timer: 1 });
    run(s, 2); // explodes, Armour absorbs, flames keep burning on P1's tile
    expect(s.flames.some((f) => f.x === 4 && f.y === 4)).toBe(true);
    run(s, s.config.generator.flameTicks);
    expect(p.armour).toBe(1);
    expect(p.alive).toBe(true);
  });
});

describe('protection and Wahala Crush', () => {
  it('no layer: the landing tile eliminates', () => {
    const s = arena();
    landCrush(s, 4, 4);
    expect(s.players[1]!.alive).toBe(false);
  });

  it('Armour behaves like the Okada: a plate breaks and the player is shoved to a free tile', () => {
    const s = arena();
    const p = s.players[1]!;
    p.armour = 1;
    const ev = landCrush(s, 4, 4);
    expect(p.alive).toBe(true);
    expect(p.armour).toBe(0);
    expect(s.tiles[p.y * s.width + p.x]).toBe(Tile.Empty);
    expect([p.x, p.y]).not.toEqual([4, 4]);
    expect(eventsOf(ev, 'protectionBroken')[0]!.layer).toBe('armour');
  });

  it('the Okada goes first, then Armour; one crush landing takes one layer', () => {
    const s = arena();
    const p = s.players[1]!;
    p.mounted = true;
    p.armour = 1;
    landCrush(s, 4, 4);
    expect(p.mounted).toBe(false);
    expect(p.armour).toBe(1);
    landCrush(s, p.x, p.y);
    expect(p.alive).toBe(true);
    expect(p.armour).toBe(0);
    landCrush(s, p.x, p.y);
    expect(p.alive).toBe(false);
  });

  it('the final closure (no free tile left) kills through every layer', () => {
    const s = arena();
    const p = s.players[1]!;
    p.mounted = true;
    p.armour = 3;
    for (const q of [0, 2]) s.players[q]!.alive = false;
    s.tiles = s.tiles.map((_, i) => (i === 4 * s.width + 4 ? Tile.Empty : Tile.Hard));
    const ev = landCrush(s, 4, 4);
    expect(p.alive).toBe(false);
    expect(eventsOf(ev, 'protectionBroken')).toHaveLength(0);
    expect(eventsOf(ev, 'playerEliminated')[0]!.cause.kind).toBe('crush');
  });

  it('a shoved player is put on a calm tile (not burning) when one exists', () => {
    const s = arena();
    const p = s.players[1]!;
    p.armour = 1;
    // flames on the nearest neighbours of (4,4): (4,3) and (3,4) / (5,4) / (4,5)
    for (const [x, y] of [
      [4, 3],
      [3, 4],
      [5, 4],
      [4, 5],
    ] as const)
      s.flames.push({ x, y, eventId: 900, genId: 0, ownerId: 2, dir: null, tip: false, startTick: s.tick + 5, endTick: s.tick + 30 });
    landCrush(s, 4, 4);
    expect(p.alive).toBe(true);
    expect(s.flames.some((f) => f.x === p.x && f.y === p.y)).toBe(false);
  });
});
