/**
 * City Rumble Evolution, workstream B (decisions RE-B1..B6): City Rumble blasts are radial, Classic keeps the
 * cross. The radial footprint (systems/blastShape.ts) is a grid disc of radius `range` (capped by `maxRange`),
 * reached by the outward blast wave AND a clear centre-to-centre line: concrete and crates cast shadows,
 * crates absorb (and break), other generators chain but pass nothing on, and no blast squeezes diagonally
 * between two blocked corners.
 */
import { describe, expect, it } from 'vitest';
import { createGame, inDisc, lineBetween, previewBlast, radialFootprint, radialOffsets } from '../src/sim';
import type { GameKind, GameState } from '../src/sim';
import { Tile } from '../src/sim/types';
import { addGenerator, addSoft, eventsOf, flameKeys, put, run, sandbox } from './helpers';

const RADIAL = { generator: { blastMode: 'radial' as const, maxRange: 5 } };

/** Open 15 x 11 floor (every pillar removed), radial blasts, players parked in the far corner. */
function open(): GameState {
  const s = sandbox({ players: 2, config: RADIAL });
  s.tiles = s.tiles.map(() => Tile.Empty);
  put(s, 0, 14, 10);
  put(s, 1, 14, 9);
  return s;
}

function wall(s: GameState, x: number, y: number): void {
  s.tiles[y * s.width + x] = Tile.Hard;
}

function blast(s: GameState, x: number, y: number, range = 2, extra: { square?: number; pierce?: boolean } = {}): void {
  addGenerator(s, { ownerId: 0, x, y, timer: 1, range, ...extra });
  run(s, 1);
}

const has = (s: GameState, x: number, y: number): boolean => flameKeys(s).includes(`${x},${y}`);

describe('radial footprint geometry', () => {
  it('disc sizes: radius 1-5 cover 9 / 21 / 37 / 69 / 97 tiles (centre included)', () => {
    expect([1, 2, 3, 4, 5].map((r) => radialOffsets(r).length + 1)).toEqual([9, 21, 37, 69, 97]);
    // the diagonal neighbours are inside every disc
    for (let r = 1; r <= 5; r++) expect(inDisc(1, 1, r)).toBe(true);
    expect(inDisc(2, 2, 2)).toBe(false);
    expect(inDisc(2, 1, 2)).toBe(true);
  });

  it('the centre line crosses exact corners diagonally', () => {
    expect(lineBetween(3, 0)).toEqual([
      [1, 0],
      [2, 0],
    ]);
    expect(lineBetween(2, 2)).toEqual([[1, 1]]);
    expect(lineBetween(3, 1)).toEqual([
      [1, 0],
      [2, 1],
    ]);
    expect(lineBetween(-1, 3)).toEqual([
      [0, 1],
      [-1, 2],
    ]);
  });

  it('on an open floor the whole disc burns, nothing outside it', () => {
    const s = open();
    blast(s, 7, 5, 2);
    const keys = flameKeys(s);
    expect(keys).toHaveLength(21);
    for (const k of keys) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      expect(inDisc(x - 7, y - 5, 2)).toBe(true);
    }
    // axis tiles keep their arm direction (tips at the end), the rest are radial tiles
    expect(s.flames.filter((f) => f.tip).map((f) => `${f.x},${f.y}`).sort()).toEqual(['5,5', '7,3', '7,7', '9,5']);
    expect(s.flames.filter((f) => f.radial)).toHaveLength(21 - 9);
  });
});

describe('radial blast vs players', () => {
  it('a player diagonally adjacent to a generator is no longer safe (Classic cross: still safe)', () => {
    const r = open();
    put(r, 1, 8, 6);
    blast(r, 7, 5, 2);
    expect(r.players[1]!.alive).toBe(false);

    const c = sandbox({ players: 2 });
    c.tiles = c.tiles.map(() => Tile.Empty);
    put(c, 0, 14, 10);
    put(c, 1, 8, 6);
    blast(c, 7, 5, 2);
    expect(c.players[1]!.alive).toBe(true);
  });

  it('a permanent wall shields the tiles behind it, along the axis and in its shadow', () => {
    const s = open();
    wall(s, 8, 5);
    put(s, 1, 10, 6); // (3, 1) from the centre: the line crosses (8, 5)
    blast(s, 7, 5, 3);
    expect(has(s, 8, 5)).toBe(false); // concrete is never hit
    expect(has(s, 9, 5)).toBe(false);
    expect(has(s, 10, 5)).toBe(false);
    expect(has(s, 10, 6)).toBe(false);
    expect(s.players[1]!.alive).toBe(true);
    // (2, 1): the centre line still clips the wall's lower half, so it is shadowed too
    expect(has(s, 9, 6)).toBe(false);
    // around the wall's side the blast still reaches
    expect(has(s, 8, 6)).toBe(true);
    expect(has(s, 9, 7)).toBe(true);
  });

  it('no blast squeezes diagonally between two blocked corners', () => {
    const s = open();
    wall(s, 8, 5);
    wall(s, 7, 6);
    put(s, 1, 8, 6);
    blast(s, 7, 5, 2);
    expect(has(s, 8, 6)).toBe(false);
    expect(s.players[1]!.alive).toBe(true);
  });

  it('a player hiding behind a building block survives; one at its corner does not', () => {
    const s = open();
    for (const x of [8, 9, 10]) for (const y of [4, 5]) wall(s, x, y);
    put(s, 1, 11, 5); // straight behind the 3 x 2 block
    put(s, 0, 8, 6); // diagonal to the generator, under the block's corner, in the open
    blast(s, 7, 5, 4);
    expect(s.players[1]!.alive).toBe(true);
    expect(s.players[0]!.alive).toBe(false);
  });
});

describe('destructible cover', () => {
  it('a crate absorbs the blast (it breaks) and shields what is behind it this time', () => {
    const s = open();
    addSoft(s, 8, 5);
    put(s, 1, 9, 5);
    const ev: ReturnType<typeof run> = [];
    addGenerator(s, { ownerId: 0, x: 7, y: 5, timer: 1, range: 3 });
    ev.push(...run(s, 1));
    expect(has(s, 8, 5)).toBe(true);
    expect(has(s, 9, 5)).toBe(false);
    expect(s.players[1]!.alive).toBe(true);
    // destroyed in the same tick it was hit
    expect(eventsOf(ev, 'blockDestroyed').map((e) => `${e.x},${e.y}`)).toContain('8,5');
    expect(s.tiles[5 * s.width + 8]).toBe(Tile.Empty);
  });

  it('cover destroyed by an earlier explosion no longer blocks a later one', () => {
    const s = open();
    addSoft(s, 8, 5);
    blast(s, 7, 5, 3);
    run(s, s.config.generator.flameTicks + 1);
    put(s, 1, 9, 5);
    blast(s, 7, 5, 3);
    expect(has(s, 9, 5)).toBe(true);
    expect(s.players[1]!.alive).toBe(false);
  });

  it('two generators going off in the same tick both see the crate (it breaks once, after both)', () => {
    const s = open();
    addSoft(s, 8, 5);
    put(s, 1, 9, 5);
    addGenerator(s, { ownerId: 0, x: 7, y: 5, timer: 1, range: 3 });
    addGenerator(s, { ownerId: 0, x: 7, y: 3, timer: 1, range: 1 });
    const ev = run(s, 1);
    expect(eventsOf(ev, 'blockDestroyed')).toHaveLength(1);
    expect(s.players[1]!.alive).toBe(true);
  });

  it('Hot Fuel burns through one crate, not two', () => {
    const s = open();
    addSoft(s, 8, 5);
    addSoft(s, 10, 5);
    blast(s, 7, 5, 4, { pierce: true });
    expect(has(s, 9, 5)).toBe(true);
    expect(has(s, 10, 5)).toBe(true); // the second crate is hit ...
    expect(has(s, 11, 5)).toBe(false); // ... and absorbs the rest
  });
});

describe('multiple detonations and chains', () => {
  it('a generator inside the disc chains (same tick) and passes nothing on itself', () => {
    const s = open();
    addGenerator(s, { ownerId: 0, x: 7, y: 5, timer: 1, range: 2 });
    const b = addGenerator(s, { ownerId: 1, x: 8, y: 6, timer: 999, range: 1 });
    const ev = run(s, 1);
    const ids = eventsOf(ev, 'generatorExploded').map((e) => e.generatorId);
    expect(ids).toContain(b.id);
    // one chain event, one blast record covering both footprints
    expect(new Set(eventsOf(ev, 'generatorExploded').map((e) => e.eventId)).size).toBe(1);
    expect(eventsOf(ev, 'generatorExploded').every((e) => e.radial)).toBe(true);
    expect(s.blasts).toHaveLength(1);
    // B (radius 1) burns its own 3 x 3, which reaches (9, 7) - outside A's disc
    expect(has(s, 9, 7)).toBe(true);
  });

  it('previewBlast (the on-screen danger footprint) is exactly what burns, chains included', () => {
    const s = open();
    wall(s, 9, 4);
    addSoft(s, 6, 7);
    const a = addGenerator(s, { ownerId: 0, x: 7, y: 5, timer: 1, range: 3 });
    addGenerator(s, { ownerId: 0, x: 9, y: 6, timer: 999, range: 2 });
    const preview = [...previewBlast(s, a)].map((i) => `${i % s.width},${Math.floor(i / s.width)}`).sort();
    run(s, 1);
    expect(preview).toEqual(flameKeys(s));
  });
});

describe('upgrades', () => {
  it('Petrol Top-Up (range) grows the disc; the radius stops at maxRange', () => {
    const sizes = [1, 2, 3, 5, 9].map((range) => {
      const s = open();
      s.tiles = s.tiles.map(() => Tile.Empty);
      return radialFootprint(s, 7, 5, Math.min(range, s.config.generator.maxRange)).length;
    });
    expect(sizes[0]! < sizes[1]! && sizes[1]! < sizes[2]!).toBe(true);
    // range 9 is capped at 5 (on the 15 x 11 board the disc is clipped by the edge)
    expect(sizes[4]).toBe(sizes[3]);
  });

  it('Square Blast in radial mode squares the disc off (tier 1 = full square of the radius)', () => {
    const s = open();
    blast(s, 7, 5, 2, { square: 1 });
    expect(flameKeys(s)).toHaveLength(25);
    const t = open();
    blast(t, 7, 5, 2, { square: 2 });
    expect(flameKeys(t)).toHaveLength(49);
  });
});

describe('rulesets', () => {
  const game = (kind: GameKind, arenaId: string): GameState =>
    createGame({
      seed: 3,
      arenaId,
      players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, characterId: 'streetBaller', isBot: i > 0 })),
      settings: { game: kind, stageHazards: false },
    });

  it('Classic keeps the cross and one generator', () => {
    const s = game('classic', 'danfoBusPark');
    expect(s.config.generator.blastMode).toBe('plus');
    expect(s.players.every((p) => p.capacity === 1)).toBe(true);
  });

  it('the cross experiment variant (RE-L2) plays Rumble with the plus and keeps the two-generator start', () => {
    const s = createGame({
      seed: 3,
      arenaId: 'rumbleOshodi',
      players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, characterId: 'streetBaller', isBot: i > 0 })),
      settings: { game: 'survival', stageHazards: false, rumbleBlast: 'cross' },
    });
    expect(s.config.generator.blastMode).toBe('plus');
    expect(s.config.generator.maxRange).toBe(10);
    expect(s.players.every((p) => p.capacity === 2)).toBe(true);
    expect(s.config.rewards.enabled).toBe(true);
    // Classic ignores the switch
    const c = createGame({
      seed: 3,
      arenaId: 'danfoBusPark',
      players: Array.from({ length: 2 }, (_, i) => ({ name: `P${i}`, characterId: 'streetBaller', isBot: i > 0 })),
      settings: { game: 'classic', rumbleBlast: 'radial' },
    });
    expect(c.config.generator.blastMode).toBe('plus');
  });

  it('every City Rumble ruleset is radial and starts with two generators', () => {
    for (const kind of ['survival', 'deathmatch', 'team'] as const) {
      const s = game(kind, 'rumbleOjuelegba');
      expect(s.config.generator.blastMode).toBe('radial');
      expect(s.players.every((p) => p.capacity === 2)).toBe(true);
    }
  });
});
