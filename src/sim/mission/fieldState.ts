/**
 * Builds the `MissionState` of a SECTION field mission (called by `createGame` when `MissionSpec.fieldId` is set): the
 * human on the start tile, the enemy groups at their posts, open floor around every marker, door and post, and the
 * first leg's nodes. The boss missions use `createMissionState` (state.ts) and are not touched.
 */
import { ticks } from '../config';
import type { ArenaDef } from '../arenas/types';
import { tileIndex } from '../grid';
import { Tile } from '../types';
import type { GameState, Player } from '../types';
import { DEFAULT_LIVES, BASE_PHASE, PLAYER_FACTION_ID, FACTION_IDS } from './defs';
import { getFieldMission } from './fieldDefs';
import type { FieldMissionDef } from './fieldDefs';
import { enterLeg } from './field';
import { fieldEnemiesOf } from './combatPilot';
import { snapToFloor } from './state';
import { addEnemyMind } from '../systems/territory';
import { inSector } from './sector';
import type {
  FieldRuntime,
  FieldTargetRuntime,
  MissionSeat,
  MissionSpec,
  MissionState,
  PhaseTuning,
} from './types';

/** Every tile a field mission relies on being open: markers, exits, doors and their return tiles, start, posts. */
export function fieldTiles(def: FieldMissionDef): [number, number][] {
  const out: [number, number][] = [
    [def.start[0], def.start[1]],
    [def.returnMarker.x, def.returnMarker.y],
  ];
  for (const leg of def.legs) {
    if (leg.kind === 'reachMarkers') for (const mk of leg.markers) out.push([mk.x, mk.y]);
    if (leg.kind === 'escapeRoute') out.push([leg.exit.x, leg.exit.y]);
    if (leg.kind === 'holdArea') out.push([leg.area.x, leg.area.y]);
  }
  for (const d of def.doors) out.push([d.x, d.y], [d.returnTile[0], d.returnTile[1]]);
  return out;
}

/** The equipment of every `destroyTargets` leg (they stand on authored open floor and are made solid at the start). */
export function fieldTargetTiles(def: FieldMissionDef): [number, number][] {
  return def.legs.flatMap((leg) =>
    leg.kind === 'destroyTargets' ? leg.targets.map((t) => [t.x, t.y]) : [],
  ) as [number, number][];
}

/** The equipment at run time (absent = the mission has none, so its state keeps its old shape). */
function fieldTargets(state: GameState, def: FieldMissionDef): FieldTargetRuntime[] | undefined {
  const out: FieldTargetRuntime[] = [];
  def.legs.forEach((leg, l) => {
    if (leg.kind !== 'destroyTargets') return;
    for (const t of leg.targets) {
      const hp = Math.max(1, Math.floor(t.hp ?? 1));
      out.push({
        id: t.id,
        leg: l,
        kind: t.kind,
        x: t.x,
        y: t.y,
        label: t.label,
        hp,
        maxHp: hp,
        destroyed: false,
      });
      // a solid piece of equipment, like a crate: it blocks walking and stops a flame arm; nothing hides inside
      const i = tileIndex(state, t.x, t.y);
      state.tiles[i] = Tile.Soft;
      delete state.hidden[i];
      state.supplies = state.supplies.filter((o) => o !== i);
    }
  });
  return out.length > 0 ? out : undefined;
}

function clearAround(state: GameState, x: number, y: number, radius: number): void {
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) continue;
      const i = tileIndex(state, tx, ty);
      if (state.tiles[i] === Tile.Soft) {
        state.tiles[i] = Tile.Empty;
        delete state.hidden[i];
      }
    }
}

/**
 * Opens a patrol route (campaign tactics, decision SA6): the crates on the shortest way (through anything but concrete)
 * from the post to each waypoint in turn and back to the first, so a patrol never stalls on a random crate.
 */
function clearPatrol(state: GameState, route: readonly (readonly [number, number])[]): void {
  if (route.length < 2) return;
  const w = state.width;
  for (let k = 0; k < route.length; k++) {
    const [ax, ay] = route[k]!;
    const [bx, by] = route[(k + 1) % route.length]!;
    const start = ay * w + ax;
    const goal = by * w + bx;
    const prev = new Map<number, number>([[start, -1]]);
    const queue = [start];
    for (let head = 0; head < queue.length && !prev.has(goal); head++) {
      const u = queue[head]!;
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ] as const) {
        const nx = (u % w) + dx;
        const ny = Math.floor(u / w) + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= state.height) continue;
        const v = ny * w + nx;
        if (prev.has(v) || state.tiles[v] === Tile.Hard) continue;
        prev.set(v, u);
        queue.push(v);
      }
    }
    for (let u = prev.has(goal) ? goal : -1; u !== -1; u = prev.get(u)!) {
      if (state.tiles[u] === Tile.Soft) {
        state.tiles[u] = Tile.Empty;
        delete state.hidden[u];
      }
    }
  }
}

/** The tiles a field route visits, in play order (start, every leg's targets, door return tiles, the return marker). */
export function fieldRouteStops(def: FieldMissionDef): [number, number][] {
  const out: [number, number][] = [[def.start[0], def.start[1]]];
  for (const leg of def.legs) {
    if (leg.kind === 'reachMarkers') for (const mk of leg.markers) out.push([mk.x, mk.y]);
    else if (leg.kind === 'escapeRoute') out.push([leg.exit.x, leg.exit.y]);
    else if (leg.kind === 'clearGroup') {
      const post = def.enemies.find((e) => e.group === leg.group)?.post;
      if (post) out.push([post[0], post[1]]);
    } else if (leg.kind === 'door') {
      const d = def.doors.find((o) => o.id === leg.doorId);
      if (d) out.push([d.returnTile[0], d.returnTile[1]], [d.x, d.y], [d.returnTile[0], d.returnTile[1]]);
    } else if (leg.kind === 'destroyTargets') {
      // the route reaches each piece (it ends beside it: equipment is never walked onto or cleared)
      for (const t of leg.targets) out.push([t.x, t.y]);
    } else if (leg.kind === 'holdArea') out.push([leg.area.x, leg.area.y]);
  }
  out.push([def.returnMarker.x, def.returnMarker.y]);
  return out;
}

/**
 * A mission sector is small, so its route never depends on blasting crates (decision DS6): between consecutive stops
 * the path with the fewest crates (then the shortest; fixed neighbour order) is cleared of them. Crates elsewhere stay
 * as cover and trap material. No random number; only called when the match has a sector.
 */
function clearRoute(
  state: GameState,
  stops: readonly (readonly [number, number])[],
  keep: ReadonlySet<number>,
): void {
  const W = state.width;
  const N = W * state.height;
  const CRATE = 8;
  // a sector gate is concrete until its leg is done, then the route runs through it (decision FN3): plan across it
  const gates = new Set((state.sector?.gates ?? []).flatMap((g) => g.tiles));
  for (let k = 1; k < stops.length; k++) {
    const [ax, ay] = stops[k - 1]!;
    const [bx, by] = stops[k]!;
    const from = ay * W + ax;
    const to = by * W + bx;
    const cost = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const buckets: number[][] = [[from]];
    cost[from] = 0;
    for (let c = 0; c < buckets.length; c++) {
      for (const i of buckets[c] ?? []) {
        if (cost[i] !== c) continue;
        if (i === to) break;
        const x = i % W;
        const y = Math.floor(i / W);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= state.height || !inSector(state, nx, ny)) continue;
          const j = ny * W + nx;
          const t = state.tiles[j];
          // concrete never; a piece of equipment only as the stop itself (walked up to, never cleared)
          if ((t === Tile.Hard && !gates.has(j)) || (keep.has(j) && j !== to)) continue;
          const nc = c + 1 + (t === Tile.Soft ? CRATE : 0);
          if (nc >= cost[j]!) continue;
          cost[j] = nc;
          prev[j] = i;
          (buckets[nc] ??= []).push(j);
        }
      }
      if (cost[to] !== Infinity && cost[to]! <= c) break;
    }
    for (let i = to; i !== -1 && i !== from; i = prev[i]!) {
      if (state.tiles[i] !== Tile.Soft || keep.has(i)) continue;
      state.tiles[i] = Tile.Empty;
      delete state.hidden[i];
      state.supplies = state.supplies.filter((o) => o !== i);
    }
  }
}

function placeAt(state: GameState, p: Player, x: number, y: number): void {
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
  p.facing = x < state.width / 2 ? 'right' : 'left';
}

const FIELD_PHASE: PhaseTuning = { ...BASE_PHASE, callout: '' };

export function createFieldMissionState(state: GameState, arena: ArenaDef, spec: MissionSpec): MissionState {
  const def = getFieldMission(spec.fieldId!);
  if (def.districtId !== spec.id)
    throw new Error(`field mission ${def.id} belongs to ${def.districtId}, not ${spec.id}`);
  const enemies = fieldEnemiesOf(def, spec); // the roster (plus the archived pilot's additions in its replay)
  if (state.players.length !== 1 + enemies.length) {
    throw new Error(
      `field mission ${def.id} needs ${1 + enemies.length} competitors, got ${state.players.length}`,
    );
  }
  for (const [x, y] of fieldTiles(def)) clearAround(state, x, y, 1);
  for (const [x, y] of fieldTargetTiles(def)) clearAround(state, x, y, 1);
  const targets = fieldTargets(state, def);
  if (state.sector) {
    const keep = new Set(fieldTargetTiles(def).map(([x, y]) => tileIndex(state, x, y)));
    clearRoute(state, fieldRouteStops(def), keep);
    for (const d of def.doors) if (!d.required) clearRoute(state, [def.start, d.returnTile], keep);
  }
  // equipment tiles are claimed too: no seat is ever placed on a piece of Ring equipment
  const claimed = new Set<string>(
    [...fieldTiles(def), ...fieldTargetTiles(def)].map(([x, y]) => `${x},${y}`),
  );

  // a sector's barricades are concrete now: nobody is seated on one, or outside the play area
  const open = (x: number, y: number): boolean =>
    inSector(state, x, y) && state.tiles[tileIndex(state, x, y)] !== Tile.Hard;
  const human = state.players[0]!;
  const [sx, sy] = snapToFloor(arena, def.start[0], def.start[1], new Set(), open);
  placeAt(state, human, sx, sy);
  claimed.add(`${sx},${sy}`);
  const seats: MissionSeat[] = [
    {
      playerId: 0,
      role: 'player',
      factionId: PLAYER_FACTION_ID,
      characterId: human.characterId,
      name: human.name,
    },
  ];
  const pursuerGroups = new Set(def.legs.flatMap((l) => (l.kind === 'escapeRoute' ? [l.group] : [])));
  enemies.forEach((e, i) => {
    const p = state.players[1 + i]!;
    const [x, y] = snapToFloor(arena, e.post[0], e.post[1], claimed, open);
    claimed.add(`${x},${y}`);
    placeAt(state, p, x, y);
    clearAround(state, x, y, 1);
    // campaign tactics (decision SA6): every enemy but an escape leg's pursuers plays its territory
    if (state.config.campaignTactics && !pursuerGroups.has(e.group)) {
      clearPatrol(state, [[x, y], ...(e.territory?.patrol ?? [])]);
      addEnemyMind(state, p.id, { x, y }, e.territory);
    }
    seats.push({
      playerId: p.id,
      role: e.role,
      factionId: FACTION_IDS[def.districtId],
      characterId: p.characterId,
      name: p.name,
      post: { x, y },
      group: e.group,
      ...(e.radius !== undefined ? { radius: e.radius } : {}),
    });
  });

  // the crates cleared round the posts and along the patrols must never take a piece of equipment with them (decision
  // FN3, a fix of DS7: a post beside a piece cleared it, so the leg had nothing to blast): it stands again
  for (const t of targets ?? []) {
    const i = tileIndex(state, t.x, t.y);
    state.tiles[i] = Tile.Soft;
    delete state.hidden[i];
  }

  const field: FieldRuntime = {
    fieldId: def.id,
    leg: 0,
    legStartTick: 0,
    markersDone: 0,
    checkpoint: { x: sx, y: sy },
    doors: def.doors.map((d) => ({
      id: d.id,
      x: d.x,
      y: d.y,
      label: d.label,
      raidId: d.raidId,
      required: d.required,
      returnTile: { x: d.returnTile[0], y: d.returnTile[1] },
      status: 'idle',
      hold: 0,
      attempts: 0,
      stars: 0,
      last: null,
    })),
    catchTicks: 0,
    caught: 0,
    caughtAt: -1e9,
    raidsCompleted: 0,
    raidBonus: 0,
    done: false,
  };
  if (targets) field.targets = targets;
  if (def.legs.some((l) => l.kind === 'holdArea')) field.hold = { ticks: 0, inside: false, contested: false };
  const m: MissionState = {
    id: spec.id,
    objective: 'fieldRoute',
    modifiers: [],
    difficulty: spec.difficulty ?? 'rookie',
    seats,
    bossId: -1,
    tuning: {
      timeLimitTicks: spec.timeLimitSec ? ticks(spec.timeLimitSec) : ticks(def.timeLimitSec),
      parTicks: ticks(def.parSec),
      exposeTicks: 0,
      maxExposures: 0,
      reinforceMax: 0,
      carrySlowTicks: 0,
      phases: [FIELD_PHASE, FIELD_PHASE, FIELD_PHASE],
    },
    phase: 0,
    phaseState: 'active',
    phaseStartTick: 0,
    phasesCleared: 0,
    nodes: [],
    strikes: [],
    rail: null,
    sequence: [],
    seqIndex: 0,
    carry: null,
    delivered: 0,
    pulseAt: -1,
    boss: { shielded: false, exposedUntil: 0, exposures: 0, defeated: false },
    livesUsed: 0,
    livesMax: Math.max(1, Math.floor(spec.lives ?? DEFAULT_LIVES)),
    reinforcements: [],
    reinforcementsUsed: 0,
    announced: false,
    outcome: null,
    callout: null,
    field,
    pendingRaid: null,
  };
  state.mission = m;
  enterLeg(state, m, def, []);
  return m;
}
