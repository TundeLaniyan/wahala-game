/**
 * V2 Square Blast (decision WC7, docs/GAMEPLAY_V2.md "Square Blast"): default generators keep the plus;
 * tier 1 adds the 3 x 3 square, tier 2 the 5 x 5, tier 3 (City Rumble cap) the 7 x 7, as a union with the
 * plus arms. The square spreads as a monotone wave: never through concrete or past the arena edge, a crate
 * is hit but shields what is straight behind it, another generator is hit (chains) and stops the wave.
 */
import { describe, expect, it } from 'vitest';
import { previewBlast, squareFootprint } from '../src/sim';
import type { GameState } from '../src/sim';
import { Tile } from '../src/sim/types';
import { addGenerator, addSoft, eventsOf, flameKeys, put, run, sandbox } from './helpers';

/** Sandbox with every pillar removed too (an open floor), players parked out of the way. */
function open(): GameState {
  const s = sandbox({ players: 2 });
  s.tiles = s.tiles.map(() => Tile.Empty);
  put(s, 0, 14, 10);
  put(s, 1, 14, 9);
  return s;
}

function square(cx: number, cy: number, r: number, w = 15, h = 11): string[] {
  const out: string[] = [];
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) if (x >= 0 && y >= 0 && x < w && y < h) out.push(`${x},${y}`);
  return out.sort();
}

function blast(s: GameState, x: number, y: number, sq: number, range = 2): void {
  addGenerator(s, { ownerId: 0, x, y, timer: 1, square: sq, range });
  run(s, 1);
}

describe('Square Blast footprint', () => {
  it('a default generator keeps the plus', () => {
    const s = open();
    blast(s, 6, 5, 0);
    expect(flameKeys(s)).toHaveLength(9);
    expect(s.flames.every((f) => !f.square)).toBe(true);
  });

  it('tier 1 on an open floor: the plus plus the 3 x 3 square (13 tiles)', () => {
    const s = open();
    blast(s, 6, 5, 1);
    const keys = flameKeys(s);
    expect(keys).toHaveLength(13);
    for (const k of square(6, 5, 1)) expect(keys).toContain(k);
    // the four diagonal tiles are the square's own, marked for the renderer; one flame per tile
    expect(s.flames.filter((f) => f.square).map((f) => `${f.x},${f.y}`).sort()).toEqual(['5,4', '5,6', '7,4', '7,6']);
    expect(s.flames).toHaveLength(13);
  });

  it('tier 2: the full 5 x 5 even when the plus is shorter (range 1)', () => {
    const s = open();
    blast(s, 6, 5, 2, 1);
    expect(flameKeys(s)).toEqual(square(6, 5, 2));
  });

  it('tier 3 (City Rumble): 7 x 7 plus the long arms', () => {
    const s = open();
    blast(s, 7, 5, 3, 5);
    const keys = flameKeys(s);
    for (const k of square(7, 5, 3)) expect(keys).toContain(k);
    expect(keys).toHaveLength(49 + 4 * 2);
  });

  it('respects the arena edges', () => {
    const s = open();
    blast(s, 0, 0, 2, 1);
    expect(flameKeys(s)).toEqual(square(0, 0, 2));
  });

  it('pillars: never burns concrete; a 3 x 3 at a pillar crossing is just the plus', () => {
    const s = sandbox({ players: 2 });
    put(s, 0, 14, 10);
    put(s, 1, 14, 9);
    const hard = s.tiles.filter((t) => t === Tile.Hard).length;
    blast(s, 4, 4, 1); // (3,3) (5,3) (3,5) (5,5) are pillars
    expect(flameKeys(s)).toHaveLength(9);
    expect(s.flames.some((f) => s.tiles[f.y * s.width + f.x] === Tile.Hard)).toBe(false);
    expect(s.tiles.filter((t) => t === Tile.Hard).length).toBe(hard);
  });

  it('pillars: in a corridor the 3 x 3 reaches the diagonals the open side lets through', () => {
    const s = sandbox({ players: 2 });
    put(s, 0, 14, 10);
    put(s, 1, 14, 9);
    blast(s, 3, 4, 1); // (3,3) and (3,5) are pillars; (2,3) (4,3) (2,5) (4,5) open
    const sq = s.flames.filter((f) => f.square).map((f) => `${f.x},${f.y}`).sort();
    expect(sq).toEqual(['2,3', '2,5', '4,3', '4,5']);
  });

  it('pillars: a 5 x 5 flows around pillars along open tiles (never through them)', () => {
    const s = sandbox({ players: 2 });
    put(s, 0, 14, 10);
    put(s, 1, 14, 9);
    blast(s, 4, 4, 2);
    // all 25 tiles but the four pillars
    const expected = square(4, 4, 2).filter((k) => !['3,3', '5,3', '3,5', '5,5'].includes(k));
    expect(flameKeys(s)).toEqual(expected);
  });

  it('diagonal cover: a tile is safe only when every outward path to it is concrete', () => {
    // a wall of concrete on the right of the centre: the 5 x 5's right half is shielded
    const s = open();
    for (let y = 0; y < s.height; y++) s.tiles[y * s.width + 7] = Tile.Hard;
    blast(s, 6, 5, 2, 2);
    const keys = flameKeys(s);
    expect(keys.some((k) => k.startsWith('8,'))).toBe(false);
    expect(keys.some((k) => k.startsWith('7,'))).toBe(false);
    expect(keys).toContain('4,3');
  });

  it('crates: hit (they break) but shield the tiles straight behind them', () => {
    const s = open();
    addSoft(s, 7, 5);
    addSoft(s, 7, 4);
    blast(s, 6, 5, 2, 2);
    const keys = flameKeys(s);
    expect(keys).toContain('7,5');
    expect(keys).toContain('7,4');
    expect(keys).not.toContain('8,5'); // straight behind the crate on the row
    expect(keys).toContain('8,6'); // reached around it
    expect(keys).toContain('8,3'); // reached through (7,3)
    run(s, 1);
    expect(s.tiles[5 * s.width + 7]).toBe(Tile.Empty);
    expect(s.tiles[4 * s.width + 7]).toBe(Tile.Empty);
  });

  it('chains a generator in the square, which stops the wave but explodes itself', () => {
    const s = open();
    addGenerator(s, { ownerId: 1, x: 7, y: 6, timer: 999, range: 1 });
    addGenerator(s, { ownerId: 0, x: 6, y: 5, timer: 1, square: 1 });
    const ev = run(s, 1);
    expect(eventsOf(ev, 'generatorExploded').map((e) => e.square)).toEqual([1, 0]);
    const keys = flameKeys(s);
    expect(keys).toContain('8,6'); // the chained generator's own plus
    expect(new Set(eventsOf(ev, 'generatorExploded').map((e) => e.eventId)).size).toBe(1);
  });

  it('the renderer\'s danger preview and the blast record cover exactly the square union (unique tiles)', () => {
    const s = open();
    const g = addGenerator(s, { ownerId: 0, x: 6, y: 5, timer: 30, square: 2 });
    const preview = [...previewBlast(s, g)].map((i) => `${i % s.width},${Math.floor(i / s.width)}`).sort();
    expect(preview).toEqual(square(6, 5, 2));
    g.timer = 1;
    run(s, 1);
    expect(s.blasts[0]!.tiles).toHaveLength(25); // vehicle exposure counts each tile once
  });

  it('squareFootprint is pure geometry the AI can share', () => {
    const s = open();
    const tiles = squareFootprint(s, 6, 5, 1).map((t) => `${t.x},${t.y}`).sort();
    expect(tiles).toEqual(square(6, 5, 1).filter((k) => k !== '6,5'));
  });

  it('a generator placed by a Square Blast holder carries its tier radius', () => {
    const s = sandbox({ players: 2 });
    put(s, 0, 2, 2);
    s.players[0]!.squareTier = 2;
    run(s, 1, { 0: { place: true } });
    expect(s.generators[0]!.square).toBe(2);
  });

  it('kills through the square on a diagonal, credited to the owner', () => {
    const s = open();
    put(s, 1, 7, 6);
    put(s, 0, 0, 0);
    addGenerator(s, { ownerId: 0, x: 6, y: 5, timer: 1, square: 1 });
    const ev = run(s, 2);
    expect(eventsOf(ev, 'playerEliminated')[0]).toMatchObject({ playerId: 1, creditId: 0 });
  });
});
