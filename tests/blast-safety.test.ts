/**
 * Viewer-relative blast safety (decisions TB1-TB3): the classification, danger priority on overlaps, and - the point -
 * agreement with the simulation: what the warning calls SAFE really does not kill the viewer, and what it calls
 * DANGEROUS really does. The label is never a second rule; these tests run the real explosion to prove it.
 */
import { describe, expect, it } from 'vitest';
import {
  Tile,
  addBlastPreview,
  addLiveFlames,
  applyDangerPriority,
  blastSafetyApplies,
  emptyBlastTiles,
  labelFlame,
  labelGenerator,
  previewBlast,
  previewBlastParts,
  tileAt,
} from '../src/sim';
import type { GameState } from '../src/sim';
import { addGenerator, put, run, sandbox } from './helpers';

/** P0 = the viewer, P1 = their teammate, P2 and P3 = the opposing team. */
function teamMatch(friendlyFire: boolean): GameState {
  const s = sandbox({ players: 4 });
  s.players.forEach((p, i) => {
    p.team = i < 2 ? 0 : 1;
    p.protectedUntil = 0;
  });
  s.settings.friendlyFire = friendlyFire;
  return s;
}

/** A row of `n` open tiles with no generator (x of its left end, y). */
function openRow(s: GameState, n = 7): { x: number; y: number } {
  for (let y = 1; y < s.height - 1; y++)
    for (let x = 1; x + n < s.width - 1; x++) {
      let ok = true;
      for (let i = 0; i < n && ok; i++) ok = tileAt(s, x + i, y) === Tile.Empty;
      if (ok) return { x, y };
    }
  throw new Error('no open row');
}

/** Parks everyone far from the row (they are never in these blasts). */
function parkOthers(s: GameState, row: { x: number; y: number }, ids: number[]): void {
  ids.forEach((id, i) => put(s, id, row.x + 6, Math.min(s.height - 2, row.y + 3 + i)));
}

const OWNERS = [
  { name: 'own', id: 0 },
  { name: 'teammate', id: 1 },
  { name: 'opponent', id: 2 },
] as const;

describe('classification table (viewer = P0, a team match)', () => {
  const expected = {
    off: { own: 'danger', teammate: 'safe', opponent: 'danger' },
    on: { own: 'danger', teammate: 'danger', opponent: 'danger' },
  } as const;
  for (const ff of ['off', 'on'] as const)
    for (const o of OWNERS)
      it(`friendly fire ${ff.toUpperCase()}: ${o.name} generator is ${expected[ff][o.name]}`, () => {
        const s = teamMatch(ff === 'on');
        const g = addGenerator(s, { ownerId: o.id, x: 5, y: 5 });
        expect(labelGenerator(s, 0, g)).toBe(expected[ff][o.name]);
        expect(labelFlame(s, 0, { ownerId: o.id })).toBe(expected[ff][o.name]);
      });

  it('another viewer sees their own side: P1 (the teammate) gets the same table, mirrored', () => {
    const s = teamMatch(false);
    const mine = addGenerator(s, { ownerId: 0, x: 5, y: 5 });
    expect(labelGenerator(s, 1, mine)).toBe('safe'); // P0's blast is safe for P1
    expect(labelGenerator(s, 0, mine)).toBe('danger'); // and dangerous for P0 itself
    expect(labelGenerator(s, 2, mine)).toBe('danger'); // and for the opposing team
  });

  it('Free-for-All and solo (no teams): every blast is dangerous, nothing is ever safe', () => {
    const s = sandbox({ players: 4 });
    expect(s.players.every((p) => p.team < 0)).toBe(true);
    expect(blastSafetyApplies(s, 0)).toBe(false);
    for (const id of [0, 1, 2, 3]) {
      const g = addGenerator(s, { ownerId: id, x: 5, y: 5 });
      expect(labelGenerator(s, 0, g)).toBe('danger');
    }
  });

  it('a viewer who is down or a spectator is never told a blast is safe', () => {
    const s = teamMatch(false);
    const g = addGenerator(s, { ownerId: 1, x: 5, y: 5 });
    s.players[0]!.alive = false;
    expect(labelGenerator(s, 0, g)).toBe('danger');
    expect(blastSafetyApplies(s, 0)).toBe(false);
    s.players[0]!.alive = true;
    expect(labelGenerator(s, 0, g)).toBe('safe');
  });

  it('a spectator-thrown or environmental blast follows the damage rule: it hurts everyone', () => {
    const s = teamMatch(false);
    s.players[1]!.alive = false;
    s.players[1]!.spectator = { lane: 0 } as never;
    expect(labelFlame(s, 0, { ownerId: 1 })).toBe('danger');
    expect(labelFlame(s, 0, { ownerId: null as unknown as number })).toBe('danger');
  });

  it('a VEHICLE GENERATOR never catches its owner: safe for them, dangerous for everyone else', () => {
    const s = teamMatch(false);
    const g = addGenerator(s, { ownerId: 0, x: 5, y: 5, vehicleBorne: true });
    expect(labelGenerator(s, 0, g)).toBe('safe');
    expect(labelGenerator(s, 2, g)).toBe('danger');
  });
});

describe('the label agrees with the real explosion', () => {
  /** Runs the real blast of a generator owned by `ownerId` over the viewer; returns whether the viewer died. */
  function viewerDies(
    ownerId: number,
    friendlyFire: boolean,
    extra?: (s: GameState, row: { x: number; y: number }) => void,
  ) {
    const s = teamMatch(friendlyFire);
    const row = openRow(s);
    put(s, 0, row.x + 1, row.y);
    parkOthers(s, row, [1, 2, 3]);
    const g = addGenerator(s, { ownerId, x: row.x + 2, y: row.y, timer: 1 });
    const predicted = labelGenerator(s, 0, g);
    const tilesHit = previewBlast(s, g);
    expect(tilesHit.has(s.players[0]!.y * s.width + s.players[0]!.x)).toBe(true);
    extra?.(s, row);
    run(s, 12);
    return { died: !s.players[0]!.alive, predicted };
  }

  for (const ff of [false, true])
    for (const o of OWNERS)
      it(`friendly fire ${ff ? 'ON' : 'OFF'}, ${o.name} generator: dies exactly when it is labelled dangerous`, () => {
        const r = viewerDies(o.id, ff);
        expect(r.died).toBe(r.predicted === 'danger');
      });

  it("a chain: a teammate's blast that sets off an ENEMY generator is dangerous exactly where the enemy's flames reach", () => {
    const row0 = openRow(teamMatch(false), 9);
    /** The teammate's seed (range 3) at x+3 sets off the enemy generator (range 1) at x+4. */
    const build = (viewerX: number) => {
      const s = teamMatch(false);
      parkOthers(s, row0, [1, 2, 3]);
      const seed = addGenerator(s, { ownerId: 1, x: row0.x + 3, y: row0.y, range: 3, timer: 1 });
      const enemy = addGenerator(s, { ownerId: 2, x: row0.x + 4, y: row0.y, range: 1 });
      put(s, 0, viewerX, row0.y);
      return { s, seed, enemy };
    };
    const idx = (s: GameState, x: number) => row0.y * s.width + x;

    // a tile only the teammate's own flames reach: safe, and the viewer really survives it
    const safeCase = build(row0.x + 1);
    const t = emptyBlastTiles();
    addBlastPreview(safeCase.s, 0, safeCase.seed, 0.5, t);
    applyDangerPriority(t);
    expect(t.safe.has(idx(safeCase.s, row0.x + 1))).toBe(true);
    expect(t.danger.has(idx(safeCase.s, row0.x + 1))).toBe(false);
    run(safeCase.s, 12);
    expect(safeCase.s.players[0]!.alive).toBe(true);

    // a tile the enemy link's flames reach (also reached by the seed): danger, and the viewer really dies
    const deadly = build(row0.x + 5);
    const t2 = emptyBlastTiles();
    addBlastPreview(deadly.s, 0, deadly.seed, 0.5, t2);
    applyDangerPriority(t2);
    expect(t2.danger.has(idx(deadly.s, row0.x + 5))).toBe(true);
    expect(t2.safe.has(idx(deadly.s, row0.x + 5))).toBe(false);
    expect(labelGenerator(deadly.s, 0, deadly.enemy)).toBe('danger');
    run(deadly.s, 12);
    expect(deadly.s.players[0]!.alive).toBe(false);
  });

  it("a chain the other way: an enemy seed setting off a teammate generator keeps the teammate's part safe", () => {
    const s = teamMatch(false);
    const row = openRow(s, 11);
    parkOthers(s, row, [1, 2, 3]);
    const seed = addGenerator(s, { ownerId: 2, x: row.x, y: row.y, range: 1, timer: 1 });
    const mate = addGenerator(s, { ownerId: 1, x: row.x + 1, y: row.y, range: 3 });
    // a tile only the teammate's flames reach (past the enemy's range-1 plus)
    const far = row.x + 4;
    put(s, 0, far, row.y);
    const tiles = emptyBlastTiles();
    addBlastPreview(s, 0, seed, 0.5, tiles);
    applyDangerPriority(tiles);
    const idx = row.y * s.width + far;
    expect(previewBlast(s, seed).has(idx)).toBe(true);
    expect(tiles.safe.has(idx)).toBe(true);
    expect(tiles.danger.has(idx)).toBe(false);
    run(s, 12);
    expect(s.players[0]!.alive).toBe(true); // the warning said safe, and it was
    void mate;
  });
});

describe('danger takes priority in overlapping blasts', () => {
  const idxOf = (s: GameState, x: number, y: number) => y * s.width + x;

  it('allied + enemy overlap: the shared tiles are dangerous only; the allied-only tiles stay safe', () => {
    const s = teamMatch(false);
    const row = openRow(s, 9);
    const allied = addGenerator(s, { ownerId: 1, x: row.x + 2, y: row.y, range: 3 });
    const enemy = addGenerator(s, { ownerId: 2, x: row.x + 5, y: row.y, range: 1 });
    const t = emptyBlastTiles();
    addBlastPreview(s, 0, allied, 0.5, t);
    addBlastPreview(s, 0, enemy, 0.5, t);
    applyDangerPriority(t);
    const shared = idxOf(s, row.x + 4, row.y); // both reach it
    expect(previewBlast(s, allied).has(shared)).toBe(true);
    expect(previewBlast(s, enemy).has(shared)).toBe(true);
    expect(t.danger.has(shared)).toBe(true);
    expect(t.safe.has(shared)).toBe(false);
    expect(t.safe.has(idxOf(s, row.x + 1, row.y))).toBe(true); // only the allied blast reaches it
    // no tile is ever both
    for (const k of t.danger.keys()) expect(t.safe.has(k)).toBe(false);
  });

  it('own + allied overlap: own is dangerous, so the overlap is dangerous', () => {
    const s = teamMatch(false);
    const row = openRow(s, 9);
    const own = addGenerator(s, { ownerId: 0, x: row.x + 3, y: row.y, range: 2 });
    const allied = addGenerator(s, { ownerId: 1, x: row.x + 4, y: row.y, range: 2 });
    const t = emptyBlastTiles();
    addBlastPreview(s, 0, allied, 0.5, t);
    addBlastPreview(s, 0, own, 0.5, t);
    applyDangerPriority(t);
    const mid = idxOf(s, row.x + 3, row.y);
    expect(t.danger.has(mid)).toBe(true);
    expect(t.safe.has(mid)).toBe(false);
  });

  it('order of generators does not change the result (many simultaneous generators)', () => {
    const run1 = (reverse: boolean) => {
      const s = teamMatch(false);
      const row = openRow(s, 9);
      const gens = [
        addGenerator(s, { ownerId: 1, x: row.x + 1, y: row.y, range: 2 }),
        addGenerator(s, { ownerId: 2, x: row.x + 4, y: row.y, range: 2 }),
        addGenerator(s, { ownerId: 0, x: row.x + 7, y: row.y, range: 2 }),
      ];
      const t = emptyBlastTiles();
      for (const g of reverse ? [...gens].reverse() : gens) addBlastPreview(s, 0, g, 0.5, t);
      applyDangerPriority(t);
      return { danger: [...t.danger.keys()].sort(), safe: [...t.safe.keys()].sort() };
    };
    expect(run1(true)).toEqual(run1(false));
  });

  it('with friendly fire ON the teammate overlaps vanish: nothing is safe at all', () => {
    const s = teamMatch(true);
    const row = openRow(s, 9);
    const allied = addGenerator(s, { ownerId: 1, x: row.x + 2, y: row.y, range: 3 });
    const t = emptyBlastTiles();
    addBlastPreview(s, 0, allied, 0.5, t);
    applyDangerPriority(t);
    expect(t.safe.size).toBe(0);
    expect(t.danger.size).toBeGreaterThan(0);
  });

  it('live flames: a spared teammate flame is safe, but any harmful flame on a tile removes the safe mark', () => {
    const s = teamMatch(false);
    const row = openRow(s, 9);
    const mate = addGenerator(s, { ownerId: 1, x: row.x + 3, y: row.y, range: 2, timer: 1 });
    run(s, 2);
    expect(s.flames.length).toBeGreaterThan(0);
    const t = emptyBlastTiles();
    addLiveFlames(s, 0, 0.55, t);
    applyDangerPriority(t);
    expect(t.safe.size).toBeGreaterThan(0);
    expect(t.burning.size).toBe(0);
    // an enemy flame lands on one of those tiles
    const f0 = s.flames[0]!;
    s.flames.push({ ...f0, ownerId: 2, genId: 999 });
    const t2 = emptyBlastTiles();
    addLiveFlames(s, 0, 0.55, t2);
    applyDangerPriority(t2);
    const idx = f0.y * s.width + f0.x;
    expect(t2.burning.has(idx)).toBe(true);
    expect(t2.safe.has(idx)).toBe(false);
    void mate;
  });
});

describe("geometry is the simulation's own", () => {
  it('the parts of a chain union to the existing previewBlast, and a wall casts its shadow', () => {
    const s = teamMatch(false);
    const row = openRow(s, 9);
    const a = addGenerator(s, { ownerId: 1, x: row.x + 1, y: row.y, range: 3 });
    addGenerator(s, { ownerId: 2, x: row.x + 3, y: row.y, range: 2 });
    const union = new Set<number>();
    for (const part of previewBlastParts(s, a)) for (const t of part.tiles) union.add(t);
    expect([...union].sort()).toEqual([...previewBlast(s, a)].sort());
    // every chain link burns once
    const ids = previewBlastParts(s, a).map((p) => p.gen.id);
    expect(new Set(ids).size).toBe(ids.length);
    // a tile behind a permanent wall is never marked (the line is blocked): put a hard block in the row
    const s2 = teamMatch(false);
    const r2 = openRow(s2, 7);
    s2.tiles[r2.y * s2.width + r2.x + 3] = Tile.Hard;
    const g = addGenerator(s2, { ownerId: 1, x: r2.x + 1, y: r2.y, range: 4 });
    const hit = previewBlast(s2, g);
    expect(hit.has(r2.y * s2.width + r2.x + 3)).toBe(false);
    expect(hit.has(r2.y * s2.width + r2.x + 5)).toBe(false);
  });
});
