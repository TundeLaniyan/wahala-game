/**
 * Lekki Phase 1's road network, classified from the arena's own map (presentation only; docs/LEKKI_INTERLOCK_ROADS.md).
 * Decision LI4: every LOCAL road surface of Lekki Phase 1 is interlocking concrete paving; the regional expressway keeps
 * its asphalt.
 *
 * The sim board (`src/sim/arenas/rumbleLekki.ts`) has three road bands (`=` tiles) and six districts. From them:
 *
 *   - `expressway`  : road tiles in the rows of the Expressway Gateway district (y 30-34, the full-width six-lane
 *                     Lekki-Epe Expressway; it runs off both board edges). Asphalt: it is the regional road outside the
 *                     Phase 1 street network.
 *   - `localRoad`   : every other road tile: Admiralty Way (x 20-23, the plaza to the expressway), Freedom Way (y 18-20,
 *                     edge to edge) and their crossing. Paved.
 *   - `estateStreet`: the open floor of the Freedom Way Estates district (role "street": the quiet residential streets
 *                     between the walled compounds, including the lane clearings beside Admiralty Way). Paved.
 *
 * Not paved: the Admiralty Commerce forecourts and shopfront pavements, the promenade and its plaza (already paved in its
 * own slabs), the Ikate leisure ground and sports court, the sandy coastal access lanes, and the gateway's roadside
 * pavements. They are pavements, plazas and sand, not road.
 */
import { getArena } from '../../sim';

export type LekkiSurface = 'localRoad' | 'estateStreet' | 'expressway';

/** The classes that receive interlocking paving (one switch per class, for founder review). */
export const LEKKI_PAVED: ReadonlySet<LekkiSurface> = new Set<LekkiSurface>(['localRoad', 'estateStreet']);

const ID = 'rumbleLekki';

let classes: (LekkiSurface | null)[][] | null = null;

/** The surface class of every tile (null = not a road surface), computed once from the sim's layout and districts. */
export function lekkiSurfaces(): (LekkiSurface | null)[][] {
  if (classes) return classes;
  const arena = getArena(ID);
  const layout = arena.layout;
  const districts = arena.districts ?? [];
  const rectsOf = (id: string): [number, number, number, number][] =>
    (districts.find((d) => d.id === id)?.rects ?? []) as [number, number, number, number][];
  const gateway = rectsOf('gateway');
  const estates = rectsOf('estates');
  const inRows = (rects: [number, number, number, number][], y: number): boolean =>
    rects.some(([, y0, , y1]) => y >= y0 && y <= y1);
  const inRect = (rects: [number, number, number, number][], x: number, y: number): boolean =>
    rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  classes = layout.map((row, y) =>
    [...row].map((c, x): LekkiSurface | null => {
      if (c === '=') return inRows(gateway, y) ? 'expressway' : 'localRoad';
      if (c !== '#' && inRect(estates, x, y)) return 'estateStreet';
      return null;
    }),
  );
  return classes;
}

/** Is tile (x, y) paved with interlocking blocks? */
export function lekkiPavedAt(x: number, y: number): boolean {
  const c = lekkiSurfaces()[y]?.[x];
  return c != null && LEKKI_PAVED.has(c);
}
