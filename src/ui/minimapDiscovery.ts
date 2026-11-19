/**
 * What a campaign mission's minimap has DISCOVERED (docs/CAMPAIGN_CAMERA.md "Minimap", decision CF7): the map shows
 * the active area and the routes found, never distant, not-yet-reached streets as if they were playable. A cheap rule,
 * kept per match in the UI (a bitset of tiles, never in the simulation, so determinism and digests are untouched):
 *
 * - on a district map, the mission's sector (its rects: the playable area the barricades close) is known from the start;
 * - on a campaign-only area (`ArenaDef.campaignOnly`, docs/CAMPAIGN_WORLD.md) the sector is the whole board, so instead each
 *   named part of the area (`ArenaDef.districts`) becomes known when the human first stands in it (CF9);
 * - every tile within `DISCOVER_RADIUS` (Chebyshev) of a tile the human has stood on (about what the follow camera
 *   shows round the fighter);
 * - the route to the current objective: the shortest path through anything but concrete from where the human stands
 *   when the objective changes, `ROUTE_HALF_WIDTH` tiles each side, and the objective's own surroundings.
 *
 * Outside a campaign mission (City Rumble) nothing is hidden. Public information only: the board and the mission's
 * own view.
 */
import { Tile, getArena, missionView } from '../sim';
import type { GameState } from '../sim';

/** Tiles round every place the human has stood that the map reveals. */
export const DISCOVER_RADIUS = 6;
/** Tiles each side of the route to the current objective. */
export const ROUTE_HALF_WIDTH = 1;
/** Tiles round the objective itself. */
export const TARGET_RADIUS = 2;

export class MinimapDiscovery {
  readonly bits: Uint8Array;
  /** Bumped whenever a tile is revealed (the map redraws its base only then). */
  version = 0;
  private lastX = -1;
  private lastY = -1;
  private targetKey = '';
  /** The named parts of a campaign-only area, revealed whole on entry (empty on a district map). */
  private parts: readonly (readonly (readonly [number, number, number, number])[])[] = [];
  private partsSeen = new Set<number>();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.bits = new Uint8Array(width * height);
  }

  known(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && this.bits[y * this.width + x] === 1;
  }

  /** The parts of a campaign-only area: each is revealed whole when the human first stands in it. */
  setParts(parts: readonly (readonly (readonly [number, number, number, number])[])[]): void {
    this.parts = parts;
  }

  /** Reveals the tiles of a rectangle (inclusive, clamped to the board); true when any was new. */
  revealRect(x0: number, y0: number, x1: number, y1: number): boolean {
    let fresh = false;
    for (let y = Math.max(0, y0); y <= Math.min(this.height - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(this.width - 1, x1); x++) {
        const i = y * this.width + x;
        if (this.bits[i] === 0) {
          this.bits[i] = 1;
          fresh = true;
        }
      }
    if (fresh) this.version++;
    return fresh;
  }

  /** Brings the map up to date with the match: where the human is, and the route to the current objective. */
  update(state: GameState, localId = 0): void {
    const me = state.players[localId];
    if (!me) return;
    if (me.x !== this.lastX || me.y !== this.lastY) {
      this.lastX = me.x;
      this.lastY = me.y;
      this.revealRect(
        me.x - DISCOVER_RADIUS,
        me.y - DISCOVER_RADIUS,
        me.x + DISCOVER_RADIUS,
        me.y + DISCOVER_RADIUS,
      );
      this.parts.forEach((rects, i) => {
        if (this.partsSeen.has(i)) return;
        if (!rects.some((r) => me.x >= r[0] && me.x <= r[2] && me.y >= r[1] && me.y <= r[3])) return;
        this.partsSeen.add(i);
        for (const r of rects) this.revealRect(r[0], r[1], r[2], r[3]);
      });
    }
    const targets = objectiveTiles(state);
    const key = targets.map((t) => `${t.x},${t.y}`).join(';');
    if (key === this.targetKey) return;
    this.targetKey = key;
    for (const t of targets) {
      this.revealRect(t.x - TARGET_RADIUS, t.y - TARGET_RADIUS, t.x + TARGET_RADIUS, t.y + TARGET_RADIUS);
      for (const p of routeTo(state, me.x, me.y, t.x, t.y))
        this.revealRect(
          p.x - ROUTE_HALF_WIDTH,
          p.y - ROUTE_HALF_WIDTH,
          p.x + ROUTE_HALF_WIDTH,
          p.y + ROUTE_HALF_WIDTH,
        );
    }
  }
}

/** The tiles the mission sends the human to now: the field leg's goal, else the live objective nodes (a boss phase). */
export function objectiveTiles(state: GameState): { x: number; y: number }[] {
  const view = missionView(state);
  if (!view) return [];
  if (view.fieldGoal) return [{ x: view.fieldGoal.x, y: view.fieldGoal.y }];
  return view.nodes.filter((n) => n.state === 'live').map((n) => ({ x: n.x, y: n.y }));
}

/** Shortest 4-way path from (x0, y0) to (x1, y1) through any tile but concrete (crates can be blasted); [] if none. */
export function routeTo(
  state: Pick<GameState, 'tiles' | 'width' | 'height'>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { x: number; y: number }[] {
  const w = state.width;
  const start = y0 * w + x0;
  const goal = y1 * w + x1;
  const from = new Int32Array(state.tiles.length).fill(-2);
  from[start] = -1;
  const queue = new Int32Array(state.tiles.length);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  while (head < tail) {
    const i = queue[head++]!;
    if (i === goal) break;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= state.height) continue;
      const n = ny * w + nx;
      // the goal itself may be a solid object (a door, a piece of equipment)
      if (from[n] !== -2 || (state.tiles[n] === Tile.Hard && n !== goal)) continue;
      from[n] = i;
      queue[tail++] = n;
    }
  }
  if (from[goal] === -2) return [];
  const out: { x: number; y: number }[] = [];
  for (let i = goal; i !== -1; i = from[i]!) out.push({ x: i % w, y: Math.floor(i / w) });
  return out.reverse();
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const byState = new WeakMap<GameState, MinimapDiscovery>();

/**
 * The discovery of this match (null outside a campaign mission), created on first use with the sector known and kept as
 * long as the match's state object lives (a raid entered from a field mission keeps the field state, so the map
 * remembers on the way back).
 */
export function discoveryFor(state: GameState): MinimapDiscovery | null {
  if (!state.mission) return null;
  let d = byState.get(state);
  if (!d) {
    d = new MinimapDiscovery(state.width, state.height);
    const arena = getArena(state.arenaId);
    if (arena.campaignOnly) d.setParts((arena.districts ?? []).map((p) => p.rects));
    else for (const r of state.sector?.rects ?? []) d.revealRect(r[0], r[1], r[2], r[3]);
    byState.set(state, d);
  }
  return d;
}
