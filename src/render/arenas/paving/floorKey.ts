/**
 * The floor-canvas half of the interlocking paving (docs/LEKKI_INTERLOCK_ROADS.md): every paved tile is filled with the
 * reserved key colour (the floor shader replaces it with the paver texture), a little rougher than asphalt in the
 * roughness map; the shadow gutter at the foot of a wall is put back over it; and where a paved street meets open
 * ground that is not road (a pavement, a court, sand) a pale cast-concrete edge restraint finishes the paving, as on a
 * real block road. Where paving meets an asphalt road the generic kerb pass, and the arena's own junction paint, do it.
 */
import { T } from '../floorKit';
import type { Ctx } from '../floorKit';
import { PAVING_KEY_CSS } from './material';

export function paintPavedKey(
  g: Ctx,
  rg: Ctx,
  layout: readonly string[],
  pavedAt: (x: number, y: number) => boolean,
): void {
  const H = layout.length;
  const W = layout[0]!.length;
  const at = (x: number, y: number): string => layout[y]?.[x] ?? '#';
  g.fillStyle = PAVING_KEY_CSS;
  rg.fillStyle = 'rgb(218,218,218)';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!pavedAt(x, y)) continue;
      g.fillRect(x * T, y * T, T, T);
      rg.fillRect(x * T, y * T, T, T);
    }
  const band = 0.09 * T;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!pavedAt(x, y)) continue;
      // the shadowed gutter along a wall's south foot (the generic pass drew it before the key covered it)
      if (at(x, y - 1) === '#') {
        g.fillStyle = 'rgba(30,26,22,0.6)';
        g.fillRect(x * T, y * T, T, 8);
      }
      // the edge restraint towards open ground that is neither paved nor road (roads get kerbs elsewhere)
      const edge = (nx: number, ny: number): boolean =>
        !pavedAt(nx, ny) && at(nx, ny) !== '#' && at(nx, ny) !== '=';
      g.fillStyle = 'rgb(182,180,172)';
      if (edge(x, y - 1)) g.fillRect(x * T, y * T, T, band);
      if (edge(x, y + 1)) g.fillRect(x * T, (y + 1) * T - band, T, band);
      if (edge(x - 1, y)) g.fillRect(x * T, y * T, band, T);
      if (edge(x + 1, y)) g.fillRect((x + 1) * T - band, y * T, band, T);
    }
}
