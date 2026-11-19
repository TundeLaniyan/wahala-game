/**
 * The Oshodi field missions' route tiles, read from the mission data (decision WX5: the missions moved onto their campaign
 * areas, so the mechanism tests stage the human on the data's own tiles instead of copies of the old coordinates).
 */
import { getFieldMission } from '../src/sim';
import type { FieldLegDef } from '../src/sim';

type Tile = readonly [number, number];
const approach = getFieldMission('oshodi.approach');
const markersLeg = approach.legs.find(
  (l): l is Extract<FieldLegDef, { kind: 'reachMarkers' }> => l.kind === 'reachMarkers',
)!;

/** Terminal Approach: checkpoints A, B, C in order. */
export const APPROACH_MARKERS: readonly Tile[] = markersLeg.markers.map((m) => [m.x, m.y] as const);
/** Terminal Approach: the depot door, the tile in front of it, the return marker (ORITA GATE). */
export const APPROACH_DOOR: Tile = [approach.doors[0]!.x, approach.doors[0]!.y];
export const APPROACH_DOOR_RETURN: Tile = approach.doors[0]!.returnTile;
export const APPROACH_RETURN: Tile = [approach.returnMarker.x, approach.returnMarker.y];

const rail = getFieldMission('oshodi.railEdge');
const escape = rail.legs.find(
  (l): l is Extract<FieldLegDef, { kind: 'escapeRoute' }> => l.kind === 'escapeRoute',
)!;
/** Rail Edge: the escape exit (FOOTBRIDGE) and the return marker (PARK GATE). */
export const RAIL_EXIT: Tile = [escape.exit.x, escape.exit.y];
export const RAIL_RETURN: Tile = [rail.returnMarker.x, rail.returnMarker.y];
