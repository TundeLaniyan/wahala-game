/**
 * Viewer-relative blast safety (decision TB1, docs/DECISIONS.md): for the player looking at the screen, is a blast
 * SAFE (it cannot hurt them) or DANGEROUS (it can)? The answer is never a new rule: it asks `flameHarms` (the lethal-hit
 * rule: self always hurts, a teammate only with friendly fire, an opponent, a spectator or the environment always,
 * except a VEHICLE GENERATOR never catches its own owner) once per generator that burns a tile, because every flame
 * carries ITS generator's owner (chain reactions included). The geometry is the sim's own (`previewBlastParts`, the
 * flames' shape: radial, obstacles and all). Pure and deterministic; the renderer only draws what this says.
 *
 * Overlaps: a tile any dangerous blast covers is DANGEROUS, whatever safe blast also covers it (`applyDangerPriority`).
 */
import type { GameState, Generator } from '../types';
import { previewBlastParts } from './explosions';
import { flameHarms } from './queries';
import { tileIndex } from '../grid';

export type BlastLabel = 'danger' | 'safe';

/** Who is looking: the viewer must be a living participant, else every blast stays DANGEROUS (nobody is told "safe"). */
export function blastViewer(state: GameState, viewerId: number) {
  const p = state.players[viewerId];
  return p && p.alive && p.spectator === null ? p : null;
}

/** Whether this match can show a safe blast to this viewer at all (a team match: a teammate's blast can be safe). */
export function blastSafetyApplies(state: GameState, viewerId: number): boolean {
  const v = blastViewer(state, viewerId);
  return v !== null && v.team >= 0;
}

/** The label of one generator's own flames for this viewer. */
export function labelGenerator(state: GameState, viewerId: number, gen: Generator): BlastLabel {
  const v = blastViewer(state, viewerId);
  if (!v) return 'danger';
  return flameHarms(state, { ownerId: gen.ownerId, ownerSafe: gen.vehicleBorne === true }, v)
    ? 'danger'
    : 'safe';
}

/** The label of a live flame tile for this viewer. */
export function labelFlame(
  state: GameState,
  viewerId: number,
  flame: { ownerId: number; ownerSafe?: boolean },
): BlastLabel {
  const v = blastViewer(state, viewerId);
  if (!v) return 'danger';
  return flameHarms(state, flame, v) ? 'danger' : 'safe';
}

export interface BlastTiles {
  /** Tile index -> strength (0..1) of the danger there (blasts that are about to burn). */
  danger: Map<number, number>;
  /** Tile index -> strength of the safe marking there. */
  safe: Map<number, number>;
  /** Tiles a harmful flame is burning on right now: never drawn here (the fire is its own cue), but never "safe". */
  burning: Set<number>;
}

export function emptyBlastTiles(): BlastTiles {
  return { danger: new Map(), safe: new Map(), burning: new Set() };
}

/**
 * Adds one generator's predicted blast (chain reactions included) to `into`, each chain link labelled by ITS owner, at
 * `strength`. Danger and safe keep the strongest value per tile; call `applyDangerPriority` once when all are added.
 */
export function addBlastPreview(
  state: GameState,
  viewerId: number,
  gen: Generator,
  strength: number,
  into: BlastTiles,
): void {
  for (const part of previewBlastParts(state, gen)) {
    const target = labelGenerator(state, viewerId, part.gen) === 'danger' ? into.danger : into.safe;
    for (const idx of part.tiles) target.set(idx, Math.max(target.get(idx) ?? 0, strength));
  }
}

/**
 * Adds the live flames (the burning phase) of the current tick: a spared flame is safe at `strength`; a harmful one only
 * marks the tile as burning, so no safe marking can sit on it.
 */
export function addLiveFlames(state: GameState, viewerId: number, strength: number, into: BlastTiles): void {
  for (const f of state.flames) {
    if (state.tick < f.startTick || state.tick >= f.endTick) continue;
    const idx = tileIndex(state, f.x, f.y);
    if (labelFlame(state, viewerId, f) === 'danger') into.burning.add(idx);
    else into.safe.set(idx, Math.max(into.safe.get(idx) ?? 0, strength));
  }
}

/** DANGER TAKES PRIORITY: a tile any dangerous blast covers (about to burn, or burning) is never also shown as safe. */
export function applyDangerPriority(tiles: BlastTiles): void {
  for (const idx of tiles.danger.keys()) tiles.safe.delete(idx);
  for (const idx of tiles.burning) tiles.safe.delete(idx);
}
