/**
 * Patrol route analysis of a campaign field mission (decision RC2, docs/CAMPAIGN_COMBAT_RELIABILITY.md): what each enemy
 * seat does when nobody disturbs it, as authored in `fieldDefs.ts` / `finaleDefs.ts` and as built (crates cleared along
 * the routes). Shared by `scripts/patrol-routes.ts` and tests/campaign-reliability-data.test.ts.
 */
import { getFieldMission } from '../../src/sim';
import type { FieldEnemyDef, FieldMissionDef } from '../../src/sim';
import { fieldEnemiesOf } from '../../src/sim/mission/combatPilot';
import { Tile } from '../../src/sim/types';
import type { GameState } from '../../src/sim';
import { rig } from './readability';

/** Walking distances over open floor that is not a floor trap (the enemy bots never step on one: a route over one stalls). */
function safeBfs(s: GameState, x: number, y: number): Int16Array {
  const d = new Int16Array(s.width * s.height).fill(-1);
  const q = [y * s.width + x];
  d[q[0]!] = 0;
  for (let h = 0; h < q.length; h++) {
    const u = q[h]!;
    const ux = u % s.width;
    const uy = Math.floor(u / s.width);
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ] as const) {
      const nx = ux + dx;
      const ny = uy + dy;
      if (nx < 0 || ny < 0 || nx >= s.width || ny >= s.height) continue;
      const v = ny * s.width + nx;
      if (d[v] !== -1 || s.tiles[v] !== Tile.Empty || s.floorHazards[v]) continue;
      d[v] = d[u]! + 1;
      q.push(v);
    }
  }
  return d;
}

/** The ordinary roaming variants: walkers of a lane, a block or a junction that a route is authored for. */
export const ROAMING_VARIANTS = new Set([
  'agbero',
  'areaBoy',
  'marketEnforcer',
  'routeMarshal',
  'ringSecurity',
]);

export type SeatRole = 'roamer' | 'guard' | 'pursuer' | 'post';

export interface RouteRow {
  index: number;
  name: string;
  variant: string;
  group: string;
  /** roamer: an ordinary roaming variant that owns a route; guard: guards equipment (a destroy leg's crew); pursuer: an
   * escape leg's chaser; post: a thrower or heavy that holds a post by design. */
  role: SeatRole;
  /** It arrives in a hold-area wave (it patrols its route on the legs before the wave and after the hold). */
  wave: boolean;
  waypoints: [number, number][];
  /** Walking tiles of one closed circuit (a 2-waypoint shuttle: there and back); 0 without a route. */
  circuit: number;
  /** Does every waypoint lie in the sector, on walkable floor, off objective tiles (doors, markers, equipment)? */
  tilesOk: boolean;
}

/** Groups by their part in the mission: equipment crews, hold-area waves and escape pursuers. */
export function groupRoles(def: FieldMissionDef): {
  crew: Set<string>;
  wave: Set<string>;
  pursuer: Set<string>;
} {
  const crew = new Set<string>();
  const wave = new Set<string>();
  const pursuer = new Set<string>();
  for (const leg of def.legs) {
    if (leg.kind === 'destroyTargets' && leg.crew) crew.add(leg.crew);
    if (leg.kind === 'holdArea') for (const w of leg.waves ?? []) wave.add(w.group);
    if (leg.kind === 'escapeRoute') pursuer.add(leg.group);
  }
  return { crew, wave, pursuer };
}

export function seatRole(def: FieldMissionDef, e: FieldEnemyDef, variant: string): SeatRole {
  const g = groupRoles(def);
  if (g.pursuer.has(e.group)) return 'pursuer';
  if (g.crew.has(e.group)) return 'guard';
  return ROAMING_VARIANTS.has(variant) ? 'roamer' : 'post';
}

/** Walking length of the closed circuit through `route` (each leg a shortest walk on the built board). */
export function circuitLength(fieldId: string, route: readonly [number, number][]): number {
  if (route.length < 2) return 0;
  const r = rig(fieldId, 'normal', 1);
  let total = 0;
  for (let k = 0; k < route.length; k++) {
    const [ax, ay] = route[k]!;
    const [bx, by] = route[(k + 1) % route.length]!;
    const d = safeBfs(r.state, ax, ay)[by * r.state.width + bx]!;
    total += d < 0 ? 999 : d;
  }
  return total;
}

export function describeRoutes(fieldId: string): RouteRow[] {
  const def = getFieldMission(fieldId);
  const enemies = fieldEnemiesOf(def);
  const built = rig(fieldId, 'normal', 1).state;
  const objective = new Set<string>();
  for (const l of def.legs) {
    if (l.kind === 'reachMarkers') for (const m of l.markers) objective.add(`${m.x},${m.y}`);
    if (l.kind === 'escapeRoute') objective.add(`${l.exit.x},${l.exit.y}`);
    if (l.kind === 'destroyTargets') for (const t of l.targets) objective.add(`${t.x},${t.y}`);
  }
  for (const d of def.doors) {
    objective.add(`${d.x},${d.y}`);
    objective.add(`${d.returnTile[0]},${d.returnTile[1]}`);
  }
  objective.add(`${def.returnMarker.x},${def.returnMarker.y}`);
  return enemies.map((e, i) => {
    const waypoints = (e.territory?.patrol ?? []).map(([x, y]) => [x, y] as [number, number]);
    const p = built.players[1 + i]!;
    const variant = e.variant ?? p.enemyVariant ?? 'agbero';
    const tilesOk = waypoints.every(
      ([x, y]) => safeBfs(built, p.x, p.y)[y * built.width + x]! >= 0 && !objective.has(`${x},${y}`),
    );
    return {
      index: 1 + i,
      name: e.name,
      variant,
      group: e.group,
      role: seatRole(def, e, variant),
      wave: groupRoles(def).wave.has(e.group),
      waypoints,
      circuit: circuitLength(fieldId, waypoints),
      tilesOk,
    };
  });
}
