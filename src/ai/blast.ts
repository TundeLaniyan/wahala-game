/**
 * Blast geometry the bots share with the simulation (decision RE-B5: one implementation). In City Rumble
 * (`generator.blastMode = 'radial'`) a generator's flames are the simulation's own `radialFootprint`: a grid
 * disc (or, with Square Blast, a square) shadowed by concrete, crates and other generators. Classic keeps the
 * plus / Power Yard full line, which the danger map and the placement analysis still walk themselves; nothing
 * in this module is used on those paths, so a Classic bot decides exactly as before.
 */
import { radialFootprint, radialRadius, radialSquareRadius } from '../sim';
import type { Observation } from '../sim';

/** The tile map a blast is resolved against (an Observation, or one with crates already cleared). */
export interface BlastGrid {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly number[];
}

export const isRadial = (obs: Observation): boolean => obs.config.generator.blastMode === 'radial';

/**
 * Every tile a radial blast centred on (x, y) reaches, the centre excluded, as tile indices pushed onto `out`.
 * `range` is the generator's range (capped to the radius by `generator.maxRange`), `square` its Square Blast
 * radius as the simulation stores it on a generator (`Generator.square`), `blocks` true on a tile holding
 * another generator that can be set off (it is hit and chains, but passes the wave on to nothing).
 */
export function radialTiles(
  obs: Observation,
  grid: BlastGrid,
  x: number,
  y: number,
  range: number,
  pierce: boolean,
  square: number,
  blocks: (x: number, y: number) => boolean,
  out: number[],
): void {
  const g = obs.config.generator;
  const radius = radialRadius(range, g.maxRange);
  const w = grid.width;
  const tiles = radialFootprint(grid, x, y, radius, {
    pierce,
    squareRadius: radialSquareRadius(radius, square, g.radialMaxSquareRadius),
    blocksWave: blocks,
  });
  for (const p of tiles) out.push(p.y * w + p.x);
}

/** Half-size (Chebyshev tiles) of the square that holds a radial blast's whole footprint. */
export function radialBox(obs: Observation, range: number, square: number): number {
  const g = obs.config.generator;
  const radius = radialRadius(range, g.maxRange);
  const sq = radialSquareRadius(radius, square, g.radialMaxSquareRadius);
  return sq > 0 ? sq : radius;
}

const discReach: number[] = [];

/** Largest |dx| + |dy| inside the radial disc of radius `r`. */
function discManhattan(r: number): number {
  let v = discReach[r];
  if (v === undefined) {
    v = 0;
    for (let dx = 0; dx <= r; dx++)
      for (let dy = 0; dy <= r; dy++) if (dx * dx + dy * dy <= r * r + r) v = Math.max(v, dx + dy);
    discReach[r] = v;
  }
  return v;
}

/**
 * How far (Manhattan tiles) a blast of this size can reach on open floor: the plus reaches `range` (the
 * value the Classic code paths always used); a radial disc reaches further along its diagonals and the
 * Square Blast square to its corners. Used only as a cheap "could this blast concern that player" filter.
 */
export function blastReach(obs: Observation, range: number, square: number): number {
  if (!isRadial(obs)) return range;
  const g = obs.config.generator;
  const radius = radialRadius(range, g.maxRange);
  const sq = radialSquareRadius(radius, square, g.radialMaxSquareRadius);
  return sq > 0 ? 2 * sq : discManhattan(radius);
}
