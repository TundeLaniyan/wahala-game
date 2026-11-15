/** The Academy / test board: Danfo Bus Park emptied of crates (concrete pillars on every odd / odd tile, open lanes elsewhere). */
import { Tile } from '../../src/sim/types';
import type { GameState } from '../../src/sim';

export function classicLanes(s: GameState): void {
  s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  s.hidden = {};
  s.floorHazards = {};
}
