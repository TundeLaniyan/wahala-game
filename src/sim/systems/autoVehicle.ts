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
 */
import { CHARACTERS } from '../data/characters';
import { DIRS, DIR_VEC, perpendiculars, tileAt } from '../grid';
import { Tile } from '../types';
import type { Flame, Generator, Player, TilePos, VehicleEntry, VehicleKind, VehicleTurn } from '../types';
import { allBorderEntries, listKekeTurns, straightLeg } from './entries';
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
  const limit = view.config.vehicles.specs[kind].softLimit;
  let softs = 0;
  for (let i = 0; i < route.length; i++) {
    const t = route[i]!;
    if (tileAt(view, t.x, t.y) !== Tile.Soft) continue;
    // the first tile is always entered (vehicles.ts enterTile); later ones crash once the limit is used up
    if (i > 0 && softs >= limit) return route.slice(0, i);
    softs++;
  }
  return route.slice();
}

function stepTicksOf(view: AutoVehicleView, p: Readonly<Player>): number {
  const m = view.config.movement;
  const levels = m.stepTicksBySpeedLevel;
  let t = levels[Math.min(p.speedLevel, levels.length - 1)]!;
  if (p.mounted) t -= m.okadaStepBonus;
  if (p.curse?.kind === 'slow' && view.tick < p.curse.until) t += m.slowCurseExtraTicks;
  return Math.max(m.minStepTicks, t);
}

/** Per-call lookups shared by every route scored for one owner. */
interface Scene {
  owner: Readonly<Player>;
  kind: VehicleKind;
  /** Alive opponents (never the owner, never a teammate) and teammates, by tile index. */
  rivals: Map<number, Readonly<Player>[]>;
  allies: Set<number>;
  /** Manhattan distance from each tile to the nearest opponent. */
  nearest: Float64Array;
  blockedForMove: (p: Readonly<Player>, x: number, y: number) => boolean;
}

function buildScene(view: AutoVehicleView, ownerId: number): Scene | null {
  const owner = view.players[ownerId];
  if (!owner) return null;
  const w = view.width;
  const rivals = new Map<number, Readonly<Player>[]>();
  const allies = new Set<number>();
  const nearest = new Float64Array(w * view.height).fill(Infinity);
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
  };
}

/** Fewest steps for `p` to stand on a tile off the route (Infinity when none within ESCAPE_DEPTH). */
function escapeSteps(
  view: AutoVehicleView,
  scene: Scene,
  p: Readonly<Player>,
  onRoute: ReadonlySet<number>,
): number {
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
        if (!onRoute.has(i)) return depth;
        seen.add(i);
        next.push({ x, y });
      }
    }
    frontier = next;
  }
  return Infinity;
}

function scoreWith(view: AutoVehicleView, scene: Scene, route: readonly TilePos[]): number {
  const { owner, kind } = scene;
  const spec = view.config.vehicles.specs[kind];
  const w = view.width;
  const stretch = drivableStretch(view, kind, route);
  const index = new Map<number, number>();
  stretch.forEach((t, i) => {
    const k = t.y * w + t.x;
    if (!index.has(k)) index.set(k, i);
  });
  if (index.has(owner.y * w + owner.x)) return SELF;

  const warn = view.config.vehicles.entryWarnTicks;
  const reaction = view.config.special.autoVehicleReactionTicks;
  const routeSet = new Set(index.keys());
  let score = 0;
  let closest = Infinity;
  const victims: { i: number; value: number }[] = [];
  const besideCounted = new Set<number>();
  for (const [k, i] of index) {
    if (scene.allies.has(k)) score += ALLY;
    closest = Math.min(closest, scene.nearest[k]!);
    for (const p of scene.rivals.get(k) ?? []) {
      // time the vehicle needs to reach them vs. the time they need to get off the road
      const arrival = warn + i * spec.stepTicks;
      const busy = Math.max(p.stepRemaining, p.dazedUntil - view.tick, p.entryUntil !== null ? Infinity : 0);
      const escape =
        Math.max(0, busy) + reaction + escapeSteps(view, scene, p, routeSet) * stepTicksOf(view, p);
      const shield = p.mounted || p.armour > 0 ? 0.4 : 1;
      const margin = arrival - escape;
      victims.push({
        i,
        value: margin <= 0 ? TRAPPED * shield : PRESSURE * shield * (1 + Math.max(0, 1 - margin / 60)),
      });
    }
    // zoning: opponents right beside the road (each counted once)
    const t = stretch[i]!;
    for (const d of DIRS) {
      const n = (t.y + DIR_VEC[d].dy) * w + (t.x + DIR_VEC[d].dx);
      if (routeSet.has(n) || besideCounted.has(n) || !scene.rivals.has(n)) continue;
      besideCounted.add(n);
      score += BESIDE * scene.rivals.get(n)!.length;
    }
  }
  // a taxi / Keke stops at its player-hit limit: only the first victims along the road count
  victims.sort((a, b) => a.i - b.i);
  for (const v of victims.slice(0, spec.playerHitLimit)) score += v.value;
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
  return scene ? scoreWith(view, scene, route) : -Infinity;
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
 * Every legal route of `kind` (Keke: every legal single turn), in stable border order. Identical to
 * `buildRoute` for each option it lists (tests check this), built without re-validating each one.
 */
export function autoRouteOptions(view: EntryView, kind: VehicleKind): AutoRouteOption[] {
  const out: AutoRouteOption[] = [];
  const cfg = view.config.vehicles;
  const turns = cfg.specs[kind].turns;
  for (const entry of allBorderEntries(view)) {
    const leg = straightLeg(view, entry);
    if (!turns) {
      if (leg.length >= cfg.minRouteTiles) out.push({ entry, route: leg });
      continue;
    }
    for (const turn of listKekeTurns(view, entry)) {
      if (!perpendiculars(entry.dir).includes(turn.dir)) continue;
      out.push({
        entry,
        turn,
        route: [...leg.slice(0, turn.atIndex + 1), ...walkFrom(view, leg[turn.atIndex]!, turn.dir)],
      });
    }
  }
  return out;
}

/**
 * The route a one-press launch takes for `ownerId`, or null when every legal route runs over the
 * owner or a teammate. Deterministic: the first best-scoring option in border order wins.
 */
export function chooseAutoVehicle(view: AutoVehicleView, ownerId: number): AutoVehicleChoice | null {
  const scene = buildScene(view, ownerId);
  if (!scene) return null;
  let best: AutoVehicleChoice | null = null;
  for (const o of autoRouteOptions(view, scene.kind)) {
    const score = scoreWith(view, scene, o.route);
    if (!best || score > best.score) best = { ...o, score };
  }
  return best && best.score > ALLY / 2 ? best : null;
}
