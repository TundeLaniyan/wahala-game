/**
 * The isolated scenarios (docs/TEST_LAB.md). Each is a REAL raid (the Oshodi dispatch depot, or the Records Vault
 * at night) built by `buildRaidGame` at the level the founder picks, then prepared once: the extra enemies are stood down
 * and a few starting positions are chosen (`kit.ts`). Everything after the countdown is the real game: the enemies wake
 * through the sim's wave code and decide with the real bots, the player has the real controls and the real rules decide
 * every outcome. The `setup` lines are what each scenario prepares; nothing else is touched.
 */
import { inViewCone, canSeeTile, bodyTiles, routeTiles } from '../../sim';
import type { Dir, EnemyKind, GameState, RaidId, TilePos } from '../../sim';
import {
  behind,
  floorByDistance,
  isOpen,
  keepEnemies,
  key,
  placeEnemy,
  placeHuman,
  routeFor,
  tilesAround,
} from './kit';

export type ScenarioId =
  | 'rearApproach'
  | 'patrolAmbush'
  | 'oneHitAgbero'
  | 'oneHitGuard'
  | 'oneHitThrower'
  | 'punchDodge'
  | 'pursuit'
  | 'flashlight'
  | 'identifyPlayer';

export interface ScenarioDef {
  id: ScenarioId;
  raidId: RaidId;
  /** A fixed seed: a restart plays the same board and the same waking order. */
  seed: number;
  /** The clock of the scenario (long: nothing here is a race). */
  timeLimitSec: number;
  /** What the preparation does, one line each (documented in docs/TEST_LAB.md). */
  setup: readonly string[];
  /** Prepares the freshly created raid state (pure, deterministic). */
  prepare(state: GameState): void;
}

const DEPOT: RaidId = 'warehouseDispatchDepot';
const VAULT: RaidId = 'recordsVault';

/** The first of `candidates` that is open floor (else the nearest open floor to the first). */
function firstOpen(state: GameState, candidates: readonly TilePos[]): TilePos {
  const hit = candidates.find((c) => isOpen(state, c.x, c.y));
  if (hit) return hit;
  return floorByDistance(state, candidates[0]!, 6)[0]!.at;
}

/**
 * How many tiles of its route a patrolling guard would see `at` from, standing on each route tile facing the way it walks
 * (the calm 90-degree cone and the grid line of sight within its calm notice range). Lower = better hidden.
 */
export function routeExposure(
  state: GameState,
  waypoints: readonly TilePos[],
  at: TilePos,
  range: number,
): number {
  const ring = routeTiles(waypoints);
  const bodies = bodyTiles(state, -1);
  let seen = 0;
  ring.forEach((t, i) => {
    const next = ring[(i + 1) % ring.length]!;
    const facing: Dir =
      next.x > t.x ? 'right' : next.x < t.x ? 'left' : next.y > t.y ? 'down' : next.y < t.y ? 'up' : 'down';
    if (
      inViewCone({ x: t.x, y: t.y, facing }, at.x, at.y) &&
      canSeeTile(state, t.x, t.y, at.x, at.y, range, bodies)
    )
      seen++;
  });
  return seen;
}

/** The tile near a corner of the route (within 3 steps) from which the fewest route tiles can be seen. */
export function hidingTile(state: GameState, waypoints: readonly TilePos[], range: number): TilePos {
  const onRoute = new Set(routeTiles(waypoints).map(key));
  const beside = (at: TilePos): boolean =>
    [...onRoute].some((k) => {
      const [x, y] = k.split(',').map(Number) as [number, number];
      return Math.max(Math.abs(x - at.x), Math.abs(y - at.y)) <= 1;
    });
  let best: { at: TilePos; score: number[] } | null = null;
  waypoints.forEach((corner, ci) => {
    for (const { at, d } of floorByDistance(state, corner, 3)) {
      // never on the route, never beside it (a patrol always notices what is within one tile)
      if (d === 0 || onRoute.has(key(at)) || beside(at)) continue;
      const score = [routeExposure(state, waypoints, at, range), d, ci, at.y, at.x];
      if (!best || lessThan(score, best.score)) best = { at, score };
    }
  });
  // a board too tight for any such tile: the open tile nearest the first corner
  return best ? (best as { at: TilePos }).at : firstOpen(state, [waypoints[0]!]);
}

function lessThan(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}

/**
 * One-hit lethality (decision TL9): ONE ordinary, unarmoured enemy at its post by the entrance, facing into the depot along
 * the bottom lane, with the player two tiles behind it. A calm raid enemy sees nothing behind it (CV1) and does not hear a
 * generator laid there on Easy and Normal (CV2); the player walks to the tile behind it, lays a generator and steps out of
 * the cross, and the real blast decides. No enemy is stood still by force: the sim gives a post its spot, the real bot holds
 * it (and turns a quarter every few seconds, so there is a window of a few seconds to lay it). Hard hears the generator: by
 * design it does not work there.
 */
export const ONE_HIT_POST: TilePos = { x: 2, y: 11 };
export const ONE_HIT_START: TilePos = { x: 1, y: 9 };

function oneHit(id: ScenarioId, kind: EnemyKind): ScenarioDef {
  return {
    id,
    raidId: DEPOT,
    seed: 4103,
    timeLimitSec: 600,
    setup: [
      `Dispatch Depot with ONE ordinary ${kind} at the entrance post (2, 11), facing east into the depot (the other five enemies are stood down).`,
      'The player starts at (1, 9), two steps from the tile directly behind it (1, 11); the blast is the real cross of a generator laid there.',
      'The enemy wakes 1.5 s after GO and holds its post with the real bot (a quarter turn every few seconds); nothing is forced.',
    ],
    prepare(state) {
      keepEnemies(state, [1]);
      placeEnemy(state, 1, ONE_HIT_POST, kind);
      placeHuman(state, ONE_HIT_START, 'down');
    },
  };
}

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: 'rearApproach',
    raidId: DEPOT,
    seed: 4101,
    timeLimitSec: 600,
    setup: [
      'Dispatch Depot with ONE depot guard (the other five enemies are stood down).',
      'The player starts 3 tiles directly behind the guard, facing the way it will walk (outside its 90-degree view cone).',
      'The guard wakes 1.5 s after GO and walks its own patrol loop; nothing else is scripted.',
    ],
    prepare(state) {
      keepEnemies(state, [1]);
      const route = routeFor(state, 1);
      const spot = state.raid!.seats[0]!.spot;
      placeHuman(
        state,
        firstOpen(
          state,
          [3, 2, 4].map((n) => behind(route.facing, spot, n)),
        ),
        route.facing,
      );
    },
  },
  {
    id: 'patrolAmbush',
    raidId: DEPOT,
    seed: 4102,
    timeLimitSec: 600,
    setup: [
      'Dispatch Depot with ONE depot guard on its clockwork loop (the other five enemies are stood down).',
      'The player starts on the open tile within 3 steps of a corner of that loop from which the fewest tiles of the loop can see it.',
      'The loop is the one the sim derives for the guard on its spot; the guard walks it by itself.',
    ],
    prepare(state) {
      keepEnemies(state, [1]);
      const route = routeFor(state, 1);
      const range = state.config.campaignTactics!.awareness.calmNoticeTiles.guard;
      const at = hidingTile(state, route.waypoints, range);
      placeHuman(state, at, 'right');
    },
  },
  oneHit('oneHitAgbero', 'agbero'),
  oneHit('oneHitGuard', 'guard'),
  oneHit('oneHitThrower', 'thrower'),
  {
    id: 'punchDodge',
    raidId: DEPOT,
    seed: 4104,
    timeLimitSec: 600,
    setup: [
      'Dispatch Depot with ONE depot guard (the other five enemies are stood down).',
      'The guard wakes right beside the player (west of them) at a junction of the east aisle; the tiles east and north of the player are free to step to.',
    ],
    prepare(state) {
      keepEnemies(state, [1]);
      placeEnemy(state, 1, { x: 8, y: 5 });
      placeHuman(state, { x: 9, y: 5 }, 'left');
    },
  },
  {
    id: 'pursuit',
    raidId: DEPOT,
    seed: 4105,
    timeLimitSec: 600,
    setup: [
      'Dispatch Depot with five enemies at once: the three depot guards and the two bottle throwers (the lieutenant is stood down; the throwers start with the guards instead of waiting for the first crate).',
      'The player starts in the open east lane; the pillar aisles beside it are the way to break line of sight.',
    ],
    prepare(state) {
      keepEnemies(state, [1, 2, 3, 4, 5]);
      placeHuman(state, { x: 13, y: 7 }, 'left');
    },
  },
  {
    id: 'flashlight',
    raidId: VAULT,
    seed: 4106,
    timeLimitSec: 600,
    setup: [
      'Records Vault at night with ONE torch guard on its route in the entrance hall (the other four enemies are stood down).',
      'The player starts at the entrance, 3 tiles from where the guard appears, in the dark with the flashlight.',
    ],
    prepare(state) {
      keepEnemies(state, [1]);
      placeHuman(state, { x: 1, y: 11 }, 'right');
    },
  },
  {
    id: 'identifyPlayer',
    raidId: DEPOT,
    seed: 4107,
    timeLimitSec: 600,
    setup: [
      'Dispatch Depot with FIVE enemies (the three guards and the two throwers) waking on the five open tiles nearest to the player, at least 2 steps away (the lieutenant is stood down).',
      'The player starts at the crossroads of the east lane (11, 7); the marker switch (Original / Indicator / Indicator + Ground) is in the pause menu and on the HUD button.',
    ],
    prepare(state) {
      keepEnemies(state, [1, 2, 3, 4, 5]);
      const me = { x: 11, y: 7 };
      placeHuman(state, me, 'down');
      tilesAround(state, me, 5, 2).forEach((spot, i) => placeEnemy(state, i + 1, spot));
    },
  },
];

export function scenarioById(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
