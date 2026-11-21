/**
 * Raid light (docs/CLASSIC_LIGHTING.md, decisions NL4-NL8): which tiles of a NIGHT raid are lit, and by what. Pure and
 * deterministic (integer levels, no DOM, no RNG): the renderer draws its darkness mask and its beams from exactly these
 * tile sets, and the later light-based detection rule (P1b, designed in the doc, not implemented) will read the same
 * sets, so what the player sees is the rule.
 *
 *   player light   a cone in the fighter's facing direction (`LIGHT_TUNING.player`), plus a small personal radius that
 *                  is always lit (the tiles next to you are never dark)
 *   guard torches  a narrower cone in each torch-carrying enemy's facing; the carrier's own tile is NOT lit by his own
 *                  torch (a beam shows where a guard looks, not the guard)
 *   practicals     fixed lamps of the raid data (`RaidLighting.practicals`), and blast flames while they burn (the
 *                  flame tile and its four neighbours)
 *
 * Every cone and lamp is occluded on the grid: a tile is lit only if the straight line from the source tile to it
 * crosses no solid tile (wall, closed door, crate, cargo). A solid tile itself can be lit (its face), but nothing
 * behind it. A lit raid (no `lighting` in its data) has no light map: everything is visible as before.
 */
import { DIR_VEC } from '../grid';
import { Tile } from '../types';
import type { Dir, GameState, Player } from '../types';
import type { RaidId } from '../campaign/types';
import { RAID_DEFS } from './defs';
import type { RaidLighting } from './def';

/** Light levels are 0..255 per source class; `LIT` is the level from which a tile counts as lit. */
export const LIGHT_TUNING = {
  player: {
    /** Tiles ahead the cone reaches. */
    range: 5,
    /** Half-width growth per tile ahead (|lateral| <= ahead * spread + 0.5): about 55 degrees in all. */
    spread: 0.55,
    /** Chebyshev radius always lit around the fighter (no occlusion: the adjacent tiles are never dark). */
    personal: 1,
  },
  /** Narrower than the fighter's: 1, 3, 3, 3 tiles wide at 1-4 ahead. */
  guard: { range: 4, spread: 0.35 },
  /** A tile at or above this level counts as lit (every cone and lamp tile is above it). */
  lit: 48,
} as const;

/** One raid frame's light: a level per tile for each source class (index y * width + x). */
export interface LightMap {
  width: number;
  height: number;
  player: Uint8Array;
  guard: Uint8Array;
  practical: Uint8Array;
}

/** The night data of the raid `raidId` (null = lit). */
export function raidLightingOf(raidId: RaidId): RaidLighting | null {
  return RAID_DEFS[raidId]?.lighting ?? null;
}

/** The night data of the raid this match plays (null outside a raid or in a lit raid). */
export function raidLighting(state: GameState): RaidLighting | null {
  const raid = (state as { raid?: { raidId: RaidId } }).raid;
  return raid ? raidLightingOf(raid.raidId) : null;
}

/** Does a tile stop light? Anything solid on the grid (walls, closed doors, crates and cargo). */
function opaque(state: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return true;
  return state.tiles[y * state.width + x] !== Tile.Empty;
}

/**
 * Is the straight line from tile (x0, y0) to tile (x1, y1) free of solid tiles (the two end tiles excluded)? Sampled at
 * twice the tile rate along the centre line; deterministic (fixed sample count, `Math.round`).
 */
export function lineOfLight(state: GameState, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = 2 * Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 1; i < n; i++) {
    const tx = Math.round(x0 + (dx * i) / n);
    const ty = Math.round(y0 + (dy * i) / n);
    if ((tx === x0 && ty === y0) || (tx === x1 && ty === y1)) continue;
    if (opaque(state, tx, ty)) return false;
  }
  return true;
}

/**
 * Lights a cone from tile (sx, sy) towards `facing` into `out` (max with what is there). `self` lights the source
 * tile too. Level: bright near, dimmer far and at the edges, never below `LIGHT_TUNING.lit` inside the cone.
 */
export function lightCone(
  state: GameState,
  out: Uint8Array,
  sx: number,
  sy: number,
  facing: Dir,
  range: number,
  spread: number,
  self: boolean,
): void {
  const { dx: fx, dy: fy } = DIR_VEC[facing];
  const w = state.width;
  for (let ahead = 0; ahead <= range; ahead++) {
    const half = Math.floor(ahead * spread + 0.5);
    for (let side = -half; side <= half; side++) {
      if (ahead === 0 && (side !== 0 || !self)) continue;
      // forward along the facing, lateral across it
      const x = sx + fx * ahead - fy * side;
      const y = sy + fy * ahead + fx * side;
      if (x < 0 || y < 0 || x >= w || y >= state.height) continue;
      if (!lineOfLight(state, sx, sy, x, y)) continue;
      // 255 at the source falling to ~65% at full range; edges a little dimmer
      const far = 1 - (0.35 * ahead) / range;
      const edge = half > 0 ? Math.abs(side) / (half + 1) : 0;
      const level = Math.max(LIGHT_TUNING.lit + 8, Math.round(255 * far * (1 - 0.3 * edge * edge)));
      const i = y * w + x;
      if (level > out[i]!) out[i] = level;
    }
  }
}

/** Lights the tiles within `radius` of (sx, sy) that a lamp there can see. */
export function lightLamp(state: GameState, out: Uint8Array, sx: number, sy: number, radius: number): void {
  const r = Math.ceil(radius);
  const r2 = (radius + 0.25) * (radius + 0.25);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const x = sx + dx;
      const y = sy + dy;
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
      if (!lineOfLight(state, sx, sy, x, y)) continue;
      const level = Math.max(
        LIGHT_TUNING.lit + 8,
        Math.round(230 * (1 - (0.5 * Math.sqrt(d2)) / (radius + 0.5))),
      );
      const i = y * state.width + x;
      if (level > out[i]!) out[i] = level;
    }
}

/** A burning flame tile (full) and its four neighbours (half). */
const FLAME_GLOW: readonly (readonly [number, number, number])[] = [
  [0, 0, 240],
  [1, 0, 120],
  [-1, 0, 120],
  [0, 1, 120],
  [0, -1, 120],
];

/**
 * The direction a torch points. Today the enemy's `facing` (set by its last step or attack); the raid enemy AI will own
 * a well-defined facing and this is the one place to read it.
 */
export function torchFacing(p: Player): Dir {
  return p.facing;
}

/** Is this enemy seat carrying a lit torch now? (Alive, on the board, of a torch kind.) */
export function carriesTorch(p: Player, lighting: RaidLighting): boolean {
  return p.isBot && p.alive && p.enemyKind !== undefined && lighting.torchKinds.includes(p.enemyKind);
}

/** The human whose flashlight the map lights (the first living non-bot seat; null when none). */
function fighterOf(state: GameState): Player | null {
  return state.players.find((p) => !p.isBot && p.alive) ?? null;
}

/**
 * The light map of a night raid this tick (null in a lit raid or outside a raid). `out` is reused when it has the
 * board's size (the renderer calls this every frame).
 */
export function raidLightMap(state: GameState, out?: LightMap): LightMap | null {
  const lighting = raidLighting(state);
  if (!lighting) return null;
  const n = state.width * state.height;
  const map =
    out && out.width === state.width && out.height === state.height
      ? out
      : {
          width: state.width,
          height: state.height,
          player: new Uint8Array(n),
          guard: new Uint8Array(n),
          practical: new Uint8Array(n),
        };
  map.player.fill(0);
  map.guard.fill(0);
  map.practical.fill(0);
  const me = fighterOf(state);
  if (me) {
    const t = LIGHT_TUNING.player;
    lightCone(state, map.player, me.x, me.y, me.facing, t.range, t.spread, true);
    for (let dy = -t.personal; dy <= t.personal; dy++)
      for (let dx = -t.personal; dx <= t.personal; dx++) {
        const x = me.x + dx;
        const y = me.y + dy;
        if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
        const i = y * state.width + x;
        const level = dx === 0 && dy === 0 ? 255 : 200;
        if (level > map.player[i]!) map.player[i] = level;
      }
  }
  for (const p of state.players) {
    if (!carriesTorch(p, lighting)) continue;
    const t = LIGHT_TUNING.guard;
    lightCone(state, map.guard, p.x, p.y, torchFacing(p), t.range, t.spread, false);
  }
  for (const l of lighting.practicals) lightLamp(state, map.practical, l.x, l.y, l.radius);
  // blast flames light their own tile and the four next to it while they burn
  for (const f of state.flames) {
    for (const [dx, dy, level] of FLAME_GLOW) {
      const x = f.x + dx;
      const y = f.y + dy;
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
      const i = y * state.width + x;
      if (level > map.practical[i]!) map.practical[i] = level;
    }
  }
  return map;
}

/** The brightest light on a tile (0..255; 0 off the board). */
export function lightAt(map: LightMap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
  const i = y * map.width + x;
  return Math.max(map.player[i]!, map.guard[i]!, map.practical[i]!);
}

/**
 * Can the fighter at `viewer` see what stands on tile (x, y)? Lit tiles are seen (by any light: a guard's torch shows
 * a fellow guard), and so is anything within the personal radius. A guard's own torch never lights his own tile.
 */
export function tileRevealed(
  map: LightMap,
  x: number,
  y: number,
  viewer: { x: number; y: number } | null,
): boolean {
  if (viewer && Math.max(Math.abs(x - viewer.x), Math.abs(y - viewer.y)) <= LIGHT_TUNING.player.personal)
    return true;
  return lightAt(map, x, y) >= LIGHT_TUNING.lit;
}
