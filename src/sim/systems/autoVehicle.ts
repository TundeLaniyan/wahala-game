/**
 * V2 one-press vehicle attack: picks the signature vehicle's route automatically and deterministically.
 *
 * Every legal border entry (and, for the Keke, every legal single 90-degree turn) is scored by how well
 * it threatens opponents, on the stretch of road the vehicle will really drive (a taxi / Keke crashes
 * into its soft-block limit, and stops at its player-hit limit, so what lies beyond does not count):
 *
 *  - an opponent standing on the route is TRAPPED when reacting (`special.autoVehicleReactionTicks`)
 *    plus walking to the nearest tile off the route takes longer than the vehicle needs to reach them
 *    (warning + driving time). Walled-in, dazed or mid-step opponents score highest;
 *  - an opponent on the route who can still get out is PRESSURE, worth more the tighter the margin;
 *  - an opponent right beside the route adds a little zoning value;
 *  - an Okada rider / armoured opponent is worth less (one protection layer absorbs the hit);
 *  - routes over the owner's own tile are never chosen, routes over a teammate are avoided;
 *  - when nothing is threatened, the lane passing closest to an opponent wins, so a press never wastes
 *    the voucher on a pointless lane while a useful one exists.
 *
 * Ties break on the stable border order, so the same board always gives the same route.
 * Pure: reads only public board state (bots call it with their Observation and decide WHEN to press).
 * Routes are scored as two legs without being built, with stamped scratch arrays, so even a Keke on the
 * 41 x 31 City Rumble board (thousands of legal turns) is cheap enough for bots to ask often.
 */
import { CHARACTERS } from '../data/characters';
import { DIRS, DIR_VEC, perpendiculars, tileAt } from '../grid';
import { Tile } from '../types';
import type { Flame, Generator, Player, TilePos, VehicleEntry, VehicleKind, VehicleTurn } from '../types';
import { allBorderEntries, straightLeg } from './entries';
import type { EntryView } from './entries';

export interface AutoVehicleView extends EntryView {
  readonly tick: number;
  readonly players: readonly Readonly<Player>[];
  readonly generators: readonly Readonly<Generator>[];
  readonly flames: readonly Readonly<Flame>[];
}

export interface AutoRouteOption {
  entry: VehicleEntry;
  turn?: VehicleTurn;
  route: TilePos[];
}

export interface AutoVehicleChoice extends AutoRouteOption {
  score: number;
}

/** Ranking weights of the heuristic (they only order routes against each other; no balance effect). */
const TRAPPED = 100;
const PRESSURE = 12;
const BESIDE = 2;
const ALLY = -60;
const SELF = -1000;
/** How far (steps) the escape search looks before an opponent counts as having no way out. */
const ESCAPE_DEPTH = 6;

/** Tiles the vehicle will actually drive over: cut where it would crash into its soft-block limit. */
export function drivableStretch(view: EntryView, kind: VehicleKind, route: readonly TilePos[]): TilePos[] {
  return route.slice(0, drivableEnd(view, kind, { leg: route, k: route.length - 1, second: [] }));
}

function stepTicksOf(view: AutoVehicleView, p: Readonly<Player>): number {
  const m = view.config.movement;
  const levels = m.stepTicksBySpeedLevel;
  let t = levels[Math.min(p.speedLevel, levels.length - 1)]!;
  if (p.mounted) t -= m.okadaStepBonus;
  if (p.curse?.kind === 'slow' && view.tick < p.curse.until) t += m.slowCurseExtraTicks;
  return Math.max(m.minStepTicks, t);
}

/**
 * A route as two straight legs without building it: tiles 0..k of `leg`, then all of `second`
 * (a straight route: k = leg.length - 1 and no second leg).
 */
interface Legs {
  leg: readonly TilePos[];
  k: number;
  second: readonly TilePos[];
}

const tileOf = (r: Legs, i: number): TilePos => (i <= r.k ? r.leg[i]! : r.second[i - r.k - 1]!);
const lengthOf = (r: Legs): number => r.k + 1 + r.second.length;
const build = (r: Legs): TilePos[] => [...r.leg.slice(0, r.k + 1), ...r.second];

/** Index of the first tile the vehicle never reaches (it crashes into its soft-block limit there). */
function drivableEnd(view: EntryView, kind: VehicleKind, r: Legs): number {
  const limit = view.config.vehicles.specs[kind].softLimit;
  const len = lengthOf(r);
  let softs = 0;
  for (let i = 0; i < len; i++) {
    const t = tileOf(r, i);
    if (tileAt(view, t.x, t.y) !== Tile.Soft) continue;
    // the first tile is always entered (vehicles.ts enterTile); later ones crash once the limit is used up
    if (i > 0 && softs >= limit) return i;
    softs++;
  }
  return len;
}

/** Per-call lookups shared by every route scored for one owner (nothing is allocated per route). */
interface Scene {
  owner: Readonly<Player>;
  kind: VehicleKind;
  /** Alive opponents (never the owner, never a teammate) by tile index. */
  rivals: Map<number, Readonly<Player>[]>;
  /** Tiles holding a teammate. */
  allies: Set<number>;
  /** Manhattan distance from each tile to the nearest opponent. */
  nearest: Float64Array;
  blockedForMove: (p: Readonly<Player>, x: number, y: number) => boolean;
  /** Route membership by stamp: mark[k] === stamp means tile k is on the route being scored. */
  mark: Int32Array;
  firstAt: Int32Array;
  beside: Int32Array;
  stamp: number;
}

function buildScene(view: AutoVehicleView, ownerId: number): Scene | null {
  const owner = view.players[ownerId];
  if (!owner) return null;
  const w = view.width;
  const size = w * view.height;
  const rivals = new Map<number, Readonly<Player>[]>();
  const allies = new Set<number>();
  const nearest = new Float64Array(size).fill(Infinity);
  for (const p of view.players) {
    if (!p.alive || p.id === ownerId) continue;
    const i = p.y * w + p.x;
    if (owner.team >= 0 && p.team === owner.team) {
      allies.add(i);
      continue;
    }
    rivals.set(i, [...(rivals.get(i) ?? []), p]);
    for (let y = 0; y < view.height; y++)
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - p.x) + Math.abs(y - p.y);
        if (d < nearest[y * w + x]!) nearest[y * w + x] = d;
      }
  }
  const flames = new Set(view.flames.map((f) => f.y * w + f.x));
  const gens = new Set(
    view.generators.filter((g) => g.carriedBy === null && g.flight === null).map((g) => g.y * w + g.x),
  );
  return {
    owner,
    kind: CHARACTERS[owner.characterId].vehicle,
    rivals,
    allies,
    nearest,
    blockedForMove: (p, x, y) =>
      tileAt(view, x, y) !== Tile.Empty ||
      flames.has(y * w + x) ||
      (p.contact !== 'pass' && gens.has(y * w + x)),
    mark: new Int32Array(size),
    firstAt: new Int32Array(size),
    beside: new Int32Array(size),
    stamp: 0,
  };
}

/** Fewest steps for `p` to stand on a tile off the route being scored (Infinity: none within ESCAPE_DEPTH). */
function escapeSteps(view: AutoVehicleView, scene: Scene, p: Readonly<Player>): number {
  const w = view.width;
  const seen = new Set<number>([p.y * w + p.x]);
  let frontier: TilePos[] = [{ x: p.x, y: p.y }];
  for (let depth = 1; depth <= ESCAPE_DEPTH && frontier.length > 0; depth++) {
    const next: TilePos[] = [];
    for (const t of frontier) {
      for (const d of DIRS) {
        const x = t.x + DIR_VEC[d].dx;
        const y = t.y + DIR_VEC[d].dy;
        const i = y * w + x;
        if (seen.has(i) || scene.blockedForMove(p, x, y)) continue;
        if (scene.mark[i] !== scene.stamp) return depth;
        seen.add(i);
        next.push({ x, y });
      }
    }
    frontier = next;
  }
  return Infinity;
}

function scoreWith(view: AutoVehicleView, scene: Scene, r: Legs): number {
  const { owner, kind, mark, firstAt, beside } = scene;
  const spec = view.config.vehicles.specs[kind];
  const w = view.width;
  const end = drivableEnd(view, kind, r);
  const stamp = ++scene.stamp;
  for (let i = 0; i < end; i++) {
    const t = tileOf(r, i);
    const k = t.y * w + t.x;
    if (mark[k] !== stamp) {
      mark[k] = stamp;
      firstAt[k] = i;
    }
  }
  if (mark[owner.y * w + owner.x] === stamp) return SELF;

  const warn = view.config.vehicles.entryWarnTicks;
  const reaction = view.config.special.autoVehicleReactionTicks;
  let score = 0;
  let closest = Infinity;
  let victims: { i: number; value: number }[] | null = null;
  for (let i = 0; i < end; i++) {
    const t = tileOf(r, i);
    const k = t.y * w + t.x;
    if (firstAt[k] !== i) continue; // a tile passed twice counts once
    if (scene.allies.has(k)) score += ALLY;
    const near = scene.nearest[k]!;
    closest = Math.min(closest, near);
    const here = near === 0 ? scene.rivals.get(k) : undefined;
    if (here) {
      for (const p of here) {
        // time the vehicle needs to reach them vs. the time they need to get off the road
        const arrival = warn + i * spec.stepTicks;
        const busy = Math.max(
          p.stepRemaining,
          p.dazedUntil - view.tick,
          p.entryUntil !== null ? Infinity : 0,
        );
        const escape = Math.max(0, busy) + reaction + escapeSteps(view, scene, p) * stepTicksOf(view, p);
        const shield = p.mounted || p.armour > 0 ? 0.4 : 1;
        const margin = arrival - escape;
        (victims ??= []).push({
          i,
          value: margin <= 0 ? TRAPPED * shield : PRESSURE * shield * (1 + Math.max(0, 1 - margin / 60)),
        });
      }
    }
    // zoning: opponents right beside the road (each counted once)
    if (near !== 1) continue;
    for (const d of DIRS) {
      const x = t.x + DIR_VEC[d].dx;
      const y = t.y + DIR_VEC[d].dy;
      if (x < 0 || y < 0 || x >= w || y >= view.height) continue;
      const n = y * w + x;
      if (mark[n] === stamp || beside[n] === stamp) continue;
      const there = scene.rivals.get(n);
      if (!there) continue;
      beside[n] = stamp;
      score += BESIDE * there.length;
    }
  }
  // a taxi / Keke stops at its player-hit limit: only the first victims along the road count
  if (victims) {
    victims.sort((a, b) => a.i - b.i);
    for (const v of victims.slice(0, spec.playerHitLimit)) score += v.value;
  }
  // nothing better: the lane closest to an opponent
  if (Number.isFinite(closest)) score -= closest * 0.01;
  return score;
}

/**
 * Score of one route for `ownerId` (higher = more threatening). > 0 threatens at least one opponent;
 * negative endangers the owner (never chosen) or a teammate.
 */
export function scoreRoute(view: AutoVehicleView, ownerId: number, route: readonly TilePos[]): number {
  const scene = buildScene(view, ownerId);
  return scene ? scoreWith(view, scene, { leg: route, k: route.length - 1, second: [] }) : -Infinity;
}

/** Tiles from `from` (exclusive) in `dir` until concrete or the edge (same rule as entries.ts). */
function walkFrom(view: EntryView, from: TilePos, dir: VehicleTurn['dir']): TilePos[] {
  const out: TilePos[] = [];
  const v = DIR_VEC[dir];
  let x = from.x + v.dx;
  let y = from.y + v.dy;
  while (tileAt(view, x, y) !== Tile.Hard) {
    out.push({ x, y });
    x += v.dx;
    y += v.dy;
  }
  return out;
}

/**
 * Every legal option of `kind` as two legs, in stable border order (Keke turns in the same order as
 * `listKekeTurns`). The same legality rules as `buildRoute` (tests compare them route by route).
 */
function forEachOption(
  view: EntryView,
  kind: VehicleKind,
  visit: (entry: VehicleEntry, turn: VehicleTurn | undefined, legs: Legs) => void,
): void {
  const cfg = view.config.vehicles;
  const turns = cfg.specs[kind].turns;
  for (const entry of allBorderEntries(view)) {
    const leg = straightLeg(view, entry);
    if (!turns) {
      if (leg.length >= cfg.minRouteTiles) visit(entry, undefined, { leg, k: leg.length - 1, second: [] });
      continue;
    }
    for (let k = cfg.minKekeLegTiles - 1; k < leg.length - 1; k++) {
      for (const dir of perpendiculars(entry.dir)) {
        const second = walkFrom(view, leg[k]!, dir);
        if (second.length >= cfg.minKekeLegTiles) visit(entry, { atIndex: k, dir }, { leg, k, second });
      }
    }
  }
}

/** Every legal route of `kind` (Keke: every legal single turn), in stable border order. */
export function autoRouteOptions(view: EntryView, kind: VehicleKind): AutoRouteOption[] {
  const out: AutoRouteOption[] = [];
  forEachOption(view, kind, (entry, turn, legs) =>
    out.push(turn ? { entry, turn, route: build(legs) } : { entry, route: build(legs) }),
  );
  return out;
}

interface Best {
  entry: VehicleEntry;
  turn: VehicleTurn | undefined;
  legs: Legs;
  score: number;
}

/**
 * The route a one-press launch takes for `ownerId`, or null when every legal route runs over the
 * owner or a teammate. Deterministic: the first best-scoring option in border order wins.
 */
export function chooseAutoVehicle(view: AutoVehicleView, ownerId: number): AutoVehicleChoice | null {
  const scene = buildScene(view, ownerId);
  if (!scene) return null;
  const best: { b: Best | null } = { b: null };
  forEachOption(view, scene.kind, (entry, turn, legs) => {
    const score = scoreWith(view, scene, legs);
    if (!best.b || score > best.b.score) best.b = { entry, turn, legs, score };
  });
  const b = best.b;
  if (!b || b.score <= ALLY / 2) return null;
  const route = build(b.legs);
  return b.turn
    ? { entry: b.entry, turn: b.turn, route, score: b.score }
    : { entry: b.entry, route, score: b.score };
}
