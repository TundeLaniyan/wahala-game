/**
 * Pure planning for a living stage environment: geometry of routes and zones, validation against the
 * contract, per-quality budgets, deterministic placement and timing, and the mapping from SimEvents to
 * crowd stimuli. No three.js, no DOM, no randomness beyond the seeded generators here, so all of it is
 * unit-tested (tests/render/env-plan.test.ts). The three.js modules (`Traffic`, `CrowdZones`,
 * `LivingEnvironment`) only draw what this module decides.
 */
import type { SimEvent } from '../../sim';
import type { QualityLevel } from '../quality';
import { ENV_BUDGET, ENV_DRAW_CALL_TARGET } from './types';
import type {
  AmbientVehicleKind,
  BoardSize,
  CrowdMood,
  CrowdZoneDef,
  EnvBudget,
  LightFlicker,
  LightPocket,
  NpcReaction,
  ReactionRule,
  ReactionRules,
  StageEnvironment,
  StageEnvironmentSource,
  TilePoint,
  TileRect,
  TrafficRouteDef,
} from './types';

// ---------------------------------------------------------------------------------------- constants

/** Centre lines of routes keep this far (tiles) from the board rectangle: wall thickness + half a vehicle. */
export const BOARD_MARGIN = 1.2;
/** Crowd zones keep this far from the board rectangle (the wall and the kerb). */
export const ZONE_MARGIN = 0.8;
/** A crowd zone keeps this far from any ground route of the same height. */
export const ZONE_ROUTE_CLEARANCE = 0.9;
/** An elevated route must lie north of this tile row (the deck stands beyond the north wall). */
export const DECK_NORTH_LIMIT = -1.0;
export const DEFAULT_LOW_SOUTH = 2.5;
export const DEFAULT_MAX_HEIGHT_SOUTH = 1.0;
/** Height of a standing background person, metres (rigs are drawn at 0.86-0.98 of the cast's 1.86). */
export const PERSON_HEIGHT = 1.7;
/** Materials (= draw calls) of one instanced vehicle model. */
export const DRAWS_PER_VEHICLE_MODEL = 8;
export const DRAWS_PER_RIG = 5;
export const MAX_FIGURE_VARIANTS = 3;

export type VehicleModelId = 'danfo' | 'taxi' | 'keke' | 'okada';

export interface VehicleDims {
  model: VehicleModelId;
  /** Metres along the direction of travel / height, at gameplay scale. */
  length: number;
  height: number;
  /** Extra stretch applied to the model: [across, up, along]. */
  stretch: readonly [number, number, number];
  /** Colour multiplier (muted grade; a bus or truck is duller than a Danfo). */
  tint: number;
}

/** Gameplay scale of the vehicle models is 1.32 (`VEHICLE_SCALE`): Danfo 2.1 m long, 1.4 m high. */
export const VEHICLE_DIMS: Readonly<Record<AmbientVehicleKind, VehicleDims>> = {
  danfo: { model: 'danfo', length: 2.1, height: 1.4, stretch: [1, 1, 1], tint: 0.82 },
  bus: { model: 'danfo', length: 3.2, height: 1.6, stretch: [1.05, 1.14, 1.5], tint: 0.7 },
  truck: { model: 'danfo', length: 4.0, height: 1.85, stretch: [1.15, 1.33, 1.9], tint: 0.58 },
  car: { model: 'taxi', length: 1.65, height: 0.95, stretch: [1, 1, 1], tint: 0.78 },
  keke: { model: 'keke', length: 1.4, height: 1.25, stretch: [1, 1, 1], tint: 0.82 },
  okada: { model: 'okada', length: 1.3, height: 0.9, stretch: [1, 1, 1], tint: 0.8 },
};

const QUALITY_RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
export const atLeast = (level: QualityLevel, min: QualityLevel | undefined): boolean =>
  QUALITY_RANK[level] >= QUALITY_RANK[min ?? 'low'];

// ----------------------------------------------------------------------------------------- resolving

export function resolveEnv(src: StageEnvironmentSource, board: BoardSize): StageEnvironment {
  return typeof src === 'function' ? src(board) : src;
}

/** The environment's caps for a quality tier: its own `budget` can only LOWER the global ones. */
export function budgetFor(env: StageEnvironment, level: QualityLevel): EnvBudget {
  const cap = ENV_BUDGET[level];
  const own = env.budget?.[level] ?? {};
  const pick = (k: keyof EnvBudget): number => Math.max(0, Math.min(cap[k], own[k] ?? cap[k]));
  const out = {
    vehicles: pick('vehicles'),
    vehicleModels: pick('vehicleModels'),
    people: pick('people'),
    rigs: pick('rigs'),
    lights: pick('lights'),
  };
  out.rigs = Math.min(out.rigs, out.people);
  return out;
}

// ------------------------------------------------------------------------------------------ seeding

/** 32-bit string hash (FNV-1a). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

/** A small deterministic generator (mulberry32) keyed by a seed and a name. */
export function rngFor(seed: number, key: string): () => number {
  let a = (hash32(key) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------- geometry

export const boardRect = (b: BoardSize): TileRect => ({ x0: 0, y0: 0, x1: b.cols, y1: b.rows });

export function expandRect(r: TileRect, m: number): TileRect {
  return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m };
}

export const pointInRect = (x: number, y: number, r: TileRect): boolean =>
  x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;

export const rectsOverlap = (a: TileRect, b: TileRect): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Distance from a point to a rectangle (0 inside). */
export function distanceToRect(x: number, y: number, r: TileRect): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dy = Math.max(r.y0 - y, 0, y - r.y1);
  return Math.hypot(dx, dy);
}

export function pathLength(path: readonly TilePoint[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++)
    len += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  return len;
}

export interface PathPoint {
  x: number;
  y: number;
  /** Direction of travel, radians, 0 = south (+y), positive towards east (+x): the model yaw. */
  heading: number;
}

/** The point `s` tiles along a polyline (clamped to its ends). */
export function pointOnPath(path: readonly TilePoint[], s: number): PathPoint {
  let rest = Math.max(0, s);
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1]!;
    const [bx, by] = path[i]!;
    const seg = Math.hypot(bx - ax, by - ay);
    if (seg === 0) continue;
    if (rest <= seg || i === path.length - 1) {
      const k = Math.min(1, rest / seg);
      return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k, heading: Math.atan2(bx - ax, by - ay) };
    }
    rest -= seg;
  }
  const [x, y] = path[0] ?? [0, 0];
  return { x, y, heading: 0 };
}

/** Points along a polyline every `step` tiles (both ends included). */
export function samplePath(path: readonly TilePoint[], step = 0.25): TilePoint[] {
  const total = pathLength(path);
  const out: TilePoint[] = [];
  const n = Math.max(1, Math.ceil(total / step));
  for (let i = 0; i <= n; i++) {
    const p = pointOnPath(path, (i / n) * total);
    out.push([p.x, p.y]);
  }
  return out;
}

const routeHeight = (r: TrafficRouteDef): number => Math.max(...r.kinds.map((k) => VEHICLE_DIMS[k].height));

// -------------------------------------------------------------------------------------- validation

export interface LowSouth {
  depth: number;
  maxHeight: number;
}
export const lowSouthOf = (env: StageEnvironment): LowSouth => ({
  depth: env.occlusion?.lowSouth ?? DEFAULT_LOW_SOUTH,
  maxHeight: env.occlusion?.maxHeightSouth ?? DEFAULT_MAX_HEIGHT_SOUTH,
});

/** The strip directly south of the board (x slightly wider than the board) that must stay low. */
export function southStrip(board: BoardSize, depth: number): TileRect {
  return { x0: -1, y0: board.rows, x1: board.cols + 1, y1: board.rows + depth };
}

/**
 * Checks an environment against the contract for a board. Returns human-readable problems (empty =
 * valid). Used by the tests for every registered environment at several board sizes.
 */
export function validateEnvironment(env: StageEnvironment, board: BoardSize): string[] {
  const problems: string[] = [];
  const fail = (m: string): void => void problems.push(`${env.id}: ${m}`);
  const rect = boardRect(board);
  const keepOut = expandRect(rect, BOARD_MARGIN);
  const zoneOut = expandRect(rect, ZONE_MARGIN);
  const low = lowSouthOf(env);
  const strip = southStrip(board, low.depth);
  const clear = env.occlusion?.keepClear ?? [];

  const ids = new Set<string>();
  for (const r of env.traffic ?? []) {
    if (ids.has(r.id)) fail(`duplicate route id ${r.id}`);
    ids.add(r.id);
    if (r.path.length < 2) fail(`route ${r.id} needs at least two points`);
    if (!(r.count > 0) || !(r.speed > 0) || r.spacing < 0)
      fail(`route ${r.id} has a bad count / speed / spacing`);
    if (r.kinds.length === 0) fail(`route ${r.id} has no vehicle kinds`);
    const elevated = (r.elevation ?? 0) > 0.5;
    const height = routeHeight(r);
    for (const [x, y] of samplePath(r.path)) {
      if (pointInRect(x, y, keepOut)) {
        fail(`route ${r.id} enters the board (${x.toFixed(1)}, ${y.toFixed(1)})`);
        break;
      }
    }
    if (elevated && r.path.some(([, y]) => y > DECK_NORTH_LIMIT))
      fail(`elevated route ${r.id} is not north of the board`);
    if (!elevated && samplePath(r.path).some(([x, y]) => pointInRect(x, y, strip)) && height > low.maxHeight)
      fail(`route ${r.id} puts a ${height} m vehicle in the low strip south of the board`);
    for (const k of clear)
      if (samplePath(r.path).some(([x, y]) => pointInRect(x, y, k))) {
        fail(`route ${r.id} crosses a keep-clear area`);
        break;
      }
  }

  const zoneIds = new Set<string>();
  for (const z of env.crowds ?? []) {
    if (zoneIds.has(z.id)) fail(`duplicate zone id ${z.id}`);
    zoneIds.add(z.id);
    const r = z.rect;
    if (!(r.x1 > r.x0 && r.y1 > r.y0)) fail(`zone ${z.id} has an empty rectangle`);
    if (z.count <= 0) fail(`zone ${z.id} has no people`);
    if (rectsOverlap(r, zoneOut)) fail(`zone ${z.id} overlaps the board`);
    if ((z.elevation ?? 0) < 0.5 && rectsOverlap(r, strip))
      fail(`zone ${z.id} stands in the low strip south of the board`);
    for (const k of clear) if (rectsOverlap(r, k)) fail(`zone ${z.id} overlaps a keep-clear area`);
    const area = (r.x1 - r.x0) * (r.y1 - r.y0);
    if (area < z.count * 0.45) fail(`zone ${z.id} is too small for ${z.count} people`);
    for (const route of env.traffic ?? []) {
      if (Math.abs((route.elevation ?? 0) - (z.elevation ?? 0)) > 2) continue;
      for (const [x, y] of samplePath(route.path)) {
        if (distanceToRect(x, y, r) < ZONE_ROUTE_CLEARANCE) {
          fail(`zone ${z.id} is crossed by route ${route.id}`);
          break;
        }
      }
    }
  }

  for (const l of env.lights ?? []) {
    if (pointInRect(l.at[0], l.at[1], expandRect(rect, 0.3))) fail(`a light stands on the board at ${l.at}`);
    if (l.height < 0 || l.height > 9) fail(`a light at ${l.at} has an odd height ${l.height}`);
  }

  for (const level of ['low', 'medium', 'high'] as const) {
    const plan = planEnvironment(env, level, board);
    const b = budgetFor(env, level);
    if (plan.vehicles.length > b.vehicles) fail(`${level}: ${plan.vehicles.length} vehicles > ${b.vehicles}`);
    if (plan.people > b.people) fail(`${level}: ${plan.people} people > ${b.people}`);
    if (plan.rigs > b.rigs) fail(`${level}: ${plan.rigs} rigs > ${b.rigs}`);
    if (plan.lights > b.lights) fail(`${level}: ${plan.lights} lights > ${b.lights}`);
    if (plan.models.length > b.vehicleModels)
      fail(`${level}: ${plan.models.length} vehicle models > ${b.vehicleModels}`);
    if (plan.drawCalls > ENV_DRAW_CALL_TARGET[level])
      fail(`${level}: ${plan.drawCalls} planned draw calls > ${ENV_DRAW_CALL_TARGET[level]}`);
  }
  return problems;
}

// ------------------------------------------------------------------------------------------ traffic

export interface PlannedVehicle {
  routeId: string;
  kind: AmbientVehicleKind;
  model: VehicleModelId;
  /** Index along its route (0-based) and where it starts on the path, tiles. */
  index: number;
  phase: number;
  /** Colour jitter 0..1 for a small tint variation. */
  shade: number;
}

export interface PlannedRoute {
  def: TrafficRouteDef;
  length: number;
}

export interface TrafficPlan {
  routes: PlannedRoute[];
  vehicles: PlannedVehicle[];
  models: VehicleModelId[];
}

/**
 * Chooses which routes and vehicles to draw within a tier's budget. Routes are taken by priority; a
 * vehicle whose model would exceed `vehicleModels` is skipped. On each route the vehicles are spread
 * evenly along it (with a little seeded slack) so the gap never drops below `spacing`.
 */
export function planTraffic(env: StageEnvironment, level: QualityLevel): TrafficPlan {
  const budget = budgetFor(env, level);
  const seed = env.seed ?? 1;
  const routes = (env.traffic ?? [])
    .map((def, order) => ({ def, order }))
    .filter(({ def }) => atLeast(level, def.minQuality))
    .sort((a, b) => (b.def.priority ?? 1) - (a.def.priority ?? 1) || a.order - b.order);
  const models: VehicleModelId[] = [];
  const planned: PlannedRoute[] = [];
  const vehicles: PlannedVehicle[] = [];
  for (const { def } of routes) {
    const left = budget.vehicles - vehicles.length;
    if (left <= 0) break;
    const length = pathLength(def.path);
    const longest = Math.max(...def.kinds.map((k) => VEHICLE_DIMS[k].length));
    const fit = Math.max(0, Math.floor(length / (longest + def.spacing)));
    const want = Math.min(def.count, fit, left);
    if (want <= 0) continue;
    const rand = rngFor(seed, `route:${def.id}`);
    const pitch = length / want;
    const slack = Math.max(0, pitch - (longest + def.spacing));
    const phase0 = rand() * pitch;
    let used = 0;
    for (let i = 0; i < want; i++) {
      const kind = def.kinds[i % def.kinds.length]!;
      const model = VEHICLE_DIMS[kind].model;
      if (!models.includes(model)) {
        if (models.length >= budget.vehicleModels) continue;
        models.push(model);
      }
      // jitter in [-slack/2, slack/2] keeps neighbours at least `spacing` apart
      const jitter = (rand() - 0.5) * slack;
      vehicles.push({
        routeId: def.id,
        kind,
        model,
        index: i,
        phase: phase0 + i * pitch + jitter,
        shade: rand(),
      });
      used++;
    }
    if (used > 0) planned.push({ def, length });
  }
  return { routes: planned, vehicles, models };
}

/** Fade-in/out scale of a vehicle `s` tiles along a path of `length` (1 in the middle). */
export function endScale(s: number, length: number, fade: number): number {
  if (fade <= 0) return 1;
  const edge = Math.min(s, length - s);
  const k = Math.max(0, Math.min(1, edge / fade));
  return k * k * (3 - 2 * k);
}

export interface VehicleState {
  x: number;
  y: number;
  heading: number;
  scale: number;
}

/** Position of a planned vehicle at render time `t` seconds: a pure function of the plan and the clock. */
export function vehicleAt(route: PlannedRoute, v: PlannedVehicle, t: number, speedScale = 1): VehicleState {
  const { def, length } = route;
  const s = (((v.phase + def.speed * speedScale * t) % length) + length) % length;
  const p = pointOnPath(def.path, s);
  // steer through corners: head along the chord from a little behind to a little ahead
  const a = pointOnPath(def.path, s - TURN_EASE);
  const b = pointOnPath(def.path, s + TURN_EASE);
  const straight = Math.abs(a.heading - b.heading) < 1e-6;
  const heading = straight ? p.heading : Math.atan2(b.x - a.x, b.y - a.y);
  return { x: p.x, y: p.y, heading, scale: endScale(s, length, def.fade ?? 1.5) };
}

/** Tiles before / after a corner over which a vehicle turns. */
const TURN_EASE = 1.2;

// ------------------------------------------------------------------------------------------ crowds

export interface PlannedPerson {
  zoneId: string;
  index: number;
  x: number;
  y: number;
  yaw: number;
  /** An animated skinned rig (true) or an instanced figure. */
  rig: boolean;
  /** 0..1 seeded variation (tint, scale, timing). */
  shade: number;
  /** Index of the facing partner in the same zone (trading pairs), -1 if none. */
  partner: number;
  /** Working / calling people pace to this point (tile units); equal to x, y if standing. */
  toX: number;
  toY: number;
}

export interface PlannedZone {
  def: CrowdZoneDef;
  people: PlannedPerson[];
}

export interface CrowdPlan {
  zones: PlannedZone[];
  people: number;
  rigs: number;
}

const RIG_SHARE: Record<CrowdMood, number> = { working: 0.5, trading: 0.4, waiting: 0.2, watching: 0.15 };

/** Spreads `n` points over a rectangle with a minimum spacing (seeded dart throwing, grid fallback). */
export function scatterInRect(rect: TileRect, n: number, rand: () => number, minGap = 0.8): TilePoint[] {
  const inset = 0.3;
  const w = Math.max(0.01, rect.x1 - rect.x0 - inset * 2);
  const h = Math.max(0.01, rect.y1 - rect.y0 - inset * 2);
  const out: TilePoint[] = [];
  let gap = minGap;
  for (let attempt = 0; out.length < n && attempt < n * 60; attempt++) {
    if (attempt > 0 && attempt % (n * 12) === 0) gap *= 0.8; // relax in a crowded zone
    const p: TilePoint = [rect.x0 + inset + rand() * w, rect.y0 + inset + rand() * h];
    if (out.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= gap)) out.push(p);
  }
  while (out.length < n) out.push([rect.x0 + inset + rand() * w, rect.y0 + inset + rand() * h]);
  return out;
}

/**
 * Chooses how many people each zone gets in a tier, which of them are animated rigs, and where they
 * stand and look. Deterministic from the environment seed.
 */
export function planCrowd(env: StageEnvironment, board: BoardSize, level: QualityLevel): CrowdPlan {
  const budget = budgetFor(env, level);
  const seed = env.seed ?? 1;
  const zones = (env.crowds ?? [])
    .map((def, order) => ({ def, order }))
    .filter(({ def }) => atLeast(level, def.minQuality))
    .sort((a, b) => (b.def.priority ?? 1) - (a.def.priority ?? 1) || a.order - b.order);
  const cx = board.cols / 2;
  const cy = board.rows / 2;
  let peopleLeft = budget.people;
  let rigsLeft = budget.rigs;
  const out: PlannedZone[] = [];
  let total = 0;
  let rigTotal = 0;
  for (const { def } of zones) {
    if (peopleLeft <= 0) break;
    const n = Math.min(def.count, peopleLeft);
    const rigs = Math.min(rigsLeft, Math.ceil(n * RIG_SHARE[def.mood]), n);
    const rand = rngFor(seed, `zone:${def.id}`);
    const pts = scatterInRect(def.rect, n, rand, def.mood === 'trading' ? 0.55 : 0.8);
    const people: PlannedPerson[] = pts.map(([x, y], index) => {
      const face =
        def.facing === undefined || def.facing === 'board' ? Math.atan2(cx - x, cy - y) : def.facing;
      return {
        zoneId: def.id,
        index,
        x,
        y,
        yaw: face + (rand() - 0.5) * 0.5,
        rig: false,
        shade: rand(),
        partner: -1,
        toX: x,
        toY: y,
      };
    });
    // spread the rigs through the zone (every k-th person) rather than clustering them
    for (let k = 0; k < rigs; k++) people[Math.floor(((k + 0.5) * n) / rigs)]!.rig = true;
    if (def.mood === 'trading') pairUp(people);
    if (def.mood === 'working') {
      for (const p of people) {
        const a = rand() * Math.PI * 2;
        const r = 0.8 + rand() * 1.2;
        p.toX = clamp(p.x + Math.cos(a) * r, def.rect.x0 + 0.3, def.rect.x1 - 0.3);
        p.toY = clamp(p.y + Math.sin(a) * r * 0.5, def.rect.y0 + 0.3, def.rect.y1 - 0.3);
      }
    }
    out.push({ def, people });
    peopleLeft -= n;
    rigsLeft -= rigs;
    total += n;
    rigTotal += rigs;
  }
  return { zones: out, people: total, rigs: rigTotal };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Pairs neighbouring people so they face each other (a trade, an argument over a price). */
function pairUp(people: PlannedPerson[]): void {
  const free = new Set(people.map((_, i) => i));
  for (let i = 0; i < people.length; i++) {
    if (!free.has(i)) continue;
    free.delete(i);
    let best = -1;
    let bestD = 2.6;
    for (const j of free) {
      const d = Math.hypot(people[i]!.x - people[j]!.x, people[i]!.y - people[j]!.y);
      if (d < bestD) {
        best = j;
        bestD = d;
      }
    }
    if (best < 0) continue;
    free.delete(best);
    const a = people[i]!;
    const b = people[best]!;
    // stand the partner close, on the line between them, both turned to each other
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const ang = Math.atan2(b.x - a.x, b.y - a.y);
    a.x = mx - Math.sin(ang) * 0.3;
    a.y = my - Math.cos(ang) * 0.3;
    b.x = mx + Math.sin(ang) * 0.3;
    b.y = my + Math.cos(ang) * 0.3;
    a.toX = a.x;
    a.toY = a.y;
    b.toX = b.x;
    b.toY = b.y;
    a.yaw = ang;
    b.yaw = ang + Math.PI;
    a.partner = best;
    b.partner = i;
  }
}

// ------------------------------------------------------------------------------------------ the plan

export interface EnvironmentPlan {
  traffic: TrafficPlan;
  crowd: CrowdPlan;
  vehicles: PlannedVehicle[];
  models: VehicleModelId[];
  people: number;
  rigs: number;
  lights: number;
  /** Planned draw calls this environment adds (instanced model parts, rigs, figure poses, lights, particles). */
  drawCalls: number;
}

/** The light pockets drawn in a tier: those the tier allows, up to its cap. */
export function activeLights(env: StageEnvironment, level: QualityLevel): readonly LightPocket[] {
  return (env.lights ?? [])
    .filter((l) => atLeast(level, l.minQuality))
    .slice(0, budgetFor(env, level).lights);
}

export function lightsFor(env: StageEnvironment, level: QualityLevel): number {
  return activeLights(env, level).length;
}

export function planEnvironment(
  env: StageEnvironment,
  level: QualityLevel,
  board?: BoardSize,
): EnvironmentPlan {
  const b = board ?? { cols: 41, rows: 31 };
  const traffic = planTraffic(env, level);
  const crowd = planCrowd(env, b, level);
  const lights = lightsFor(env, level);
  const figures = crowd.people - crowd.rigs;
  const figureDraws = figures > 0 ? Math.min(MAX_FIGURE_VARIANTS, figures) * 2 : 0;
  const drawCalls =
    traffic.models.length * DRAWS_PER_VEHICLE_MODEL +
    crowd.rigs * DRAWS_PER_RIG +
    figureDraws +
    (lights > 0 ? 1 : 0) +
    (traffic.vehicles.length + crowd.people > 0 ? 1 : 0);
  return {
    traffic,
    crowd,
    vehicles: traffic.vehicles,
    models: traffic.models,
    people: crowd.people,
    rigs: crowd.rigs,
    lights,
    drawCalls,
  };
}

// --------------------------------------------------------------------------------------- lights

/** Brightness multiplier (0..1) of a practical light at render time `t`: a pure function of the clock. */
export function flickerAt(kind: LightFlicker, t: number, phase: number): number {
  switch (kind) {
    case 'fluorescent': {
      // mostly steady, with a stutter every few seconds
      const stutter = Math.sin(t * 0.7 + phase) * Math.sin(t * 1.9 + phase * 2) > 0.93;
      return stutter ? 0.35 + 0.65 * Math.abs(Math.sin(t * 47 + phase)) : 0.96;
    }
    case 'sodium':
      return 0.9 + 0.06 * Math.sin(t * 1.3 + phase) + 0.04 * Math.sin(t * 5.1 + phase * 3);
    case 'neon':
      return 0.88 + 0.12 * Math.abs(Math.sin(t * 38 + phase)) * (Math.sin(t * 0.5 + phase) > 0.8 ? 1 : 0.2);
    default:
      return 1;
  }
}

// ------------------------------------------------------------------------------------ reactions

export type StimulusKind = 'blast' | 'elimination' | 'stage';

/** Something the simulation did that bystanders can react to (tile units, centre of the tile). */
export interface Stimulus {
  kind: StimulusKind;
  tx: number;
  ty: number;
  /** blast: the blast radius in tiles; others: 1. */
  strength: number;
  /** stage: the hazard style (to filter by). */
  style?: string;
}

/**
 * Turns the tick's SimEvents into stimuli. Only the public facts the events carry are used: where a
 * generator blew up and how far it reached, where a competitor fell, which lethal stage hazard is
 * coming. Nothing here can change the simulation.
 */
export function stimuliFrom(events: readonly SimEvent[], board: BoardSize): Stimulus[] {
  const out: Stimulus[] = [];
  for (const e of events) {
    if (e.type === 'generatorExploded') {
      out.push({ kind: 'blast', tx: e.x + 0.5, ty: e.y + 0.5, strength: e.range });
    } else if (e.type === 'playerEliminated') {
      out.push({ kind: 'elimination', tx: e.x + 0.5, ty: e.y + 0.5, strength: 1 });
    } else if (
      (e.type === 'stageWarning' || e.type === 'stageStarted') &&
      (e.event.kind === 'sweep' || e.event.kind === 'strike')
    ) {
      const i = e.event.tiles[0];
      if (i === undefined) continue;
      out.push({
        kind: 'stage',
        tx: (i % board.cols) + 0.5,
        ty: Math.floor(i / board.cols) + 0.5,
        strength: 1,
        style: e.event.style,
      });
    }
  }
  return out;
}

/** Which rule of `rules` answers a stimulus for a zone rectangle (null = this zone ignores it). */
export function ruleFor(rules: ReactionRules | undefined, s: Stimulus, zone: TileRect): ReactionRule | null {
  if (!rules) return null;
  const d = distanceToRect(s.tx, s.ty, zone);
  if (s.kind === 'blast') {
    const r = rules.blast;
    return r && d <= r.radius && s.strength >= (r.minRange ?? 0) ? r : null;
  }
  if (s.kind === 'elimination') {
    const r = rules.elimination;
    return r && d <= r.radius ? r : null;
  }
  const r = rules.stage;
  if (!r || d > r.radius) return null;
  return r.styles && s.style !== undefined && !r.styles.includes(s.style) ? null : r;
}

/** Whether one person answers a stimulus, given the rule's `chance` (stronger blasts convince more people). */
export function reacts(rule: ReactionRule, s: Stimulus, rand: () => number): boolean {
  const boost = s.kind === 'blast' ? Math.min(0.25, Math.max(0, s.strength - 2) * 0.06) : 0;
  return rand() < Math.min(1, rule.chance + boost);
}

/** How long (seconds) a reaction lasts. */
export const REACTION_SECONDS: Record<NpcReaction, number> = {
  duck: 1.1,
  flinch: 0.7,
  scatter: 1.6,
  cheer: 1.4,
  look: 1.8,
};

/** Where a scatterer ends up: away from the cause, clamped inside the zone. */
export function scatterTarget(
  p: { x: number; y: number },
  from: { tx: number; ty: number },
  zone: TileRect,
  distance = 0.9,
): TilePoint {
  const dx = p.x - from.tx;
  const dy = p.y - from.ty;
  const len = Math.hypot(dx, dy) || 1;
  return [
    clamp(p.x + (dx / len) * distance, zone.x0 + 0.25, zone.x1 - 0.25),
    clamp(p.y + (dy / len) * distance, zone.y0 + 0.25, zone.y1 - 0.25),
  ];
}
