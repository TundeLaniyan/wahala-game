/**
 * Lekki Phase 1's road network, classified from the arena's own map (presentation only; docs/LEKKI_ADMIRALTY_WAY.md).
 * Founder revision (decision LI7): ONLY Admiralty Way is interlocking concrete paving, through its own crossing with
 * Freedom Way; every other road surface of Lekki keeps (or gets back) its asphalt.
 *
 * The sim board (`src/sim/arenas/rumbleLekki.ts`) has three road bands (`=` tiles) and six districts. From them:
 *
 *   - `admiraltyWay`: road tiles of Admiralty Way's carriageway (`ADMIRALTY_WAY`, x 20-23 from the plaza at y 10 to the
 *                     expressway edge at y 29), INCLUDING its intersection box with Freedom Way (x 20-23, y 18-20).
 *                     Paved: the only paved road.
 *   - `freedomWay`  : every other road tile outside the expressway rows: Freedom Way (y 18-20) west and east of the
 *                     crossing box, edge to edge. Asphalt.
 *   - `estateStreet`: the open floor of the Freedom Way Estates district (role "street": the residential streets between
 *                     the walled compounds). Asphalt (was paved under LI4).
 *   - `expressway`  : road tiles in the rows of the Expressway Gateway district (y 30-34, the full-width Lekki-Epe
 *                     Expressway with its traffic lanes). Asphalt.
 *
 * Never paved (not road): the Admiralty Commerce forecourts and shopfront pavements, the promenade and its plaza (its
 * own slabs), the Ikate leisure ground and sports court, the sandy coastal access lanes, the gateway's roadside pavements.
 */
import { getArena } from '../../sim';
import { ADMIRALTY_WAY } from './lekkiAdmiralty';

export type LekkiSurface = 'admiraltyWay' | 'freedomWay' | 'estateStreet' | 'expressway';

/** The classes that receive interlocking paving (one switch per class, for founder review): Admiralty Way only (LI7). */
export const LEKKI_PAVED: ReadonlySet<LekkiSurface> = new Set<LekkiSurface>(['admiraltyWay']);

const inAdmiraltyWay = (x: number, y: number): boolean =>
  x >= ADMIRALTY_WAY.x0 && x <= ADMIRALTY_WAY.x1 && y >= ADMIRALTY_WAY.y0 && y <= ADMIRALTY_WAY.y1;

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
      if (c === '=')
        return inRows(gateway, y) ? 'expressway' : inAdmiraltyWay(x, y) ? 'admiraltyWay' : 'freedomWay';
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
