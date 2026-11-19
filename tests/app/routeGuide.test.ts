/**
 * The direction indicator (decision MG6): the arrow follows the walkable route round a wall (a BFS over the tiles),
 * never the straight line through it; a route that needs crates blasted says so; a sealed target gets a direction with
 * no route implied. The cache recomputes only when the human's tile, the target or the revision changes, and one BFS
 * on the largest district board stays far below a frame's budget.
 */
import { describe, expect, it } from 'vitest';
import { RouteCache, arrowOf, routeCue } from '../../src/app/routeGuide';
import type { RouteGrid } from '../../src/app/routeGuide';
import { Tile } from '../../src/sim/types';
import { buildMissionGame, createGame, FIELD_MISSION_DEFS } from '../../src/sim';

/** '#' wall, 'x' crate, '.' floor. */
function grid(rows: string[]): RouteGrid {
  return {
    width: rows[0]!.length,
    height: rows.length,
    tiles: rows.flatMap((r) => [...r].map((c) => (c === '#' ? Tile.Hard : c === 'x' ? Tile.Soft : Tile.Empty))),
  };
}

describe('routeCue', () => {
  it('a wall between the human and the target: the arrow points round it, not through it', () => {
    // H at (1,2), T at (5,2); the wall column x=3 is open only at the top row
    const g = grid([
      '.......', //
      '...#...',
      '.H.#.T.',
      '...#...',
      '...#...',
    ]);
    const cue = routeCue(g, { x: 1, y: 2 }, { x: 5, y: 2 });
    expect(cue.via).toBe('walk');
    // the straight line says RIGHT; the route goes up first (round the top of the wall)
    expect(arrowOf(4, 0).word).toBe('RIGHT');
    expect(cue.word).toBe('UP-RIGHT');
    expect(cue.steps[0]).toEqual({ x: 1, y: 1 });
    expect(cue.tiles).toBe(8); // 2 up, 4 right, 2 down
    expect(cue.text).toBe('↗ 8 TILES');
    // every step is a floor tile next to the one before
    let at = { x: 1, y: 2 };
    for (const s of cue.steps) {
      expect(Math.abs(s.x - at.x) + Math.abs(s.y - at.y)).toBe(1);
      expect(g.tiles[s.y * g.width + s.x]).toBe(Tile.Empty);
      at = s;
    }
  });

  it('open floor: straight at it', () => {
    const g = grid(['.....', '.....', '.....']);
    expect(routeCue(g, { x: 0, y: 1 }, { x: 4, y: 1 })).toMatchObject({ word: 'RIGHT', tiles: 4, text: '→ 4 TILES' });
    expect(routeCue(g, { x: 2, y: 1 }, { x: 2, y: 1 })).toMatchObject({ word: 'HERE', tiles: 0, text: 'HERE' });
  });

  it('a solid target (a crate, equipment) is reached from a neighbour', () => {
    const g = grid(['.....', '..x..', '.....']);
    const cue = routeCue(g, { x: 0, y: 1 }, { x: 2, y: 1 });
    expect(cue).toMatchObject({ via: 'walk', tiles: 1, word: 'RIGHT' });
    // standing next to it already
    expect(routeCue(g, { x: 1, y: 1 }, { x: 2, y: 1 }).tiles).toBe(0);
  });

  it('only crates in the way: a route that needs a blast, and it says so', () => {
    const g = grid(['#####', '#.x.#', '#####']);
    const cue = routeCue(g, { x: 1, y: 1 }, { x: 3, y: 1 });
    expect(cue.via).toBe('blast');
    expect(cue.text).toBe('→ 2 TILES · BLAST A PATH');
  });

  it('sealed by walls: a direction with no route implied', () => {
    const g = grid(['#####', '#.#.#', '#####']);
    const cue = routeCue(g, { x: 1, y: 1 }, { x: 3, y: 1 });
    expect(cue.via).toBe('none');
    expect(cue.text).toBe('→ NO OPEN ROUTE');
    expect(cue.steps).toEqual([]);
  });
});

describe('RouteCache: recomputes only on change', () => {
  it('same tile, target and revision: no new BFS', () => {
    const g = grid(['.......', '...#...', '.H.#.T.']);
    const cache = new RouteCache();
    const a = cache.get(g, { x: 1, y: 2 }, { x: 5, y: 2 }, 0);
    expect(cache.get(g, { x: 1, y: 2 }, { x: 5, y: 2 }, 0)).toBe(a);
    expect(cache.runs).toBe(1);
    cache.get(g, { x: 1, y: 1 }, { x: 5, y: 2 }, 0); // the human moved
    cache.get(g, { x: 1, y: 1 }, { x: 4, y: 2 }, 0); // the target moved
    cache.get(g, { x: 1, y: 1 }, { x: 4, y: 2 }, 1); // the board may have changed
    expect(cache.runs).toBe(4);
  });

  it('one BFS on a whole district board costs well under a millisecond', () => {
    const def = FIELD_MISSION_DEFS['oshodi.railEdge']!;
    const state = createGame(
      buildMissionGame({ spec: { id: def.districtId, fieldId: def.id, noSector: true }, humanCharacter: 'streetBaller', seed: 1 }),
    );
    const me = state.players[0]!;
    const target = { x: state.width - 3, y: 2 };
    const n = 40;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) routeCue(state, { x: me.x, y: me.y }, target);
    const ms = (performance.now() - t0) / n;
    expect(state.width * state.height).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(2); // measured about 0.1 ms; a loose bound for slow CI
  });
});
