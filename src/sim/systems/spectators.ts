/**
 * V2 standard-match sideline spectators (workstream B). An eliminated player in a standard match walks a
 * lane just outside the board (west side, south side - the camera side - and east side) and can throw a
 * generator in with button A, under a cooldown, with a telegraphed landing tile. They never rejoin,
 * cannot win and are never credited (the flames carry `fromSpectator`, see lethality.ts / attribution.ts).
 * Disabled unless `config.spectator.enabled` (the classic ruleset turns it on; City Rumble does not).
 *
 * Rules:
 * - the lane is one path: west column top -> bottom, the south-west corner, the south row west -> east,
 *   the south-east corner, the east column bottom -> top. `move` steps along it (one step per
 *   `stepTicks`), in whichever direction the stick points along the lane;
 * - a throw flies straight in, perpendicular to the lane side, and lands `throwDistance` tiles in, or the
 *   nearest valid tile further along that line, else nearer (corners cannot throw);
 * - valid landing: open floor in the board with no generator, no pickup and nobody standing on it at
 *   throw time, not a tile Wahala Crush is telegraphing, and never the final safe tile (or its
 *   neighbours) once the closing has started;
 * - the landing is telegraphed (`spectatorThrow` event, the generator is in flight for `flightTicks`), then
 *   it is an ordinary timed generator of range `range` (normal fuse, chains, Kill Switch, kicks ...);
 * - one throw per `cooldownTicks` (the first one a cooldown after elimination), at most `maxLive` of a
 *   spectator's generators in play, and none once `noThrowRemainingTicks` or less is left.
 */
import { DIR_VEC, inBounds, tileAt } from '../grid';
import type { GridView } from '../grid';
import type { GameConfig } from '../config';
import { Tile } from '../types';
import type {
  CrushState,
  Dir,
  GameState,
  Generator,
  Intents,
  MatchState,
  Pickup,
  Player,
  SimEvent,
} from '../types';

export interface LaneTile {
  x: number;
  y: number;
  /** Direction a throw from here flies into the board (null on the two corners). */
  inward: Dir | null;
}

/** What the spectator rules read: a GameState or a bot's Observation. */
export interface SpectatorView extends GridView {
  readonly tick: number;
  readonly config: GameConfig;
  readonly players: readonly Readonly<Player>[];
  readonly generators: readonly Readonly<Generator>[];
  readonly pickups: readonly Readonly<Pickup>[];
  readonly crush: Readonly<CrushState> | null;
  readonly match: Readonly<MatchState>;
}

const lanes = new Map<string, readonly LaneTile[]>();

/** The sideline lane of a `width` x `height` board (cached; never mutate the result). */
export function spectatorLane(view: { readonly width: number; readonly height: number }): readonly LaneTile[] {
  const { width: w, height: h } = view;
  const key = `${w}x${h}`;
  let lane = lanes.get(key);
  if (!lane) {
    const out: LaneTile[] = [];
    for (let y = 0; y < h; y++) out.push({ x: -1, y, inward: 'right' });
    out.push({ x: -1, y: h, inward: null });
    for (let x = 0; x < w; x++) out.push({ x, y: h, inward: 'up' });
    out.push({ x: w, y: h, inward: null });
    for (let y = h - 1; y >= 0; y--) out.push({ x: w, y, inward: 'left' });
    lane = out;
    lanes.set(key, lane);
  }
  return lane;
}

/** Lane index after a `dir` move from `pos` (unchanged when the lane does not continue that way). */
export function laneStep(lane: readonly LaneTile[], pos: number, dir: Dir): number {
  const here = lane[pos];
  if (!here) return pos;
  const v = DIR_VEC[dir];
  for (const n of [pos + 1, pos - 1]) {
    const t = lane[n];
    if (t && t.x === here.x + v.dx && t.y === here.y + v.dy) return n;
  }
  return pos;
}

/** The lane tile closest to a board position (ties: the earlier lane tile). */
export function nearestLanePos(lane: readonly LaneTile[], x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  lane.forEach((t, i) => {
    const d = Math.abs(t.x - x) + Math.abs(t.y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Can a thrown generator land on this tile right now? */
export function validLanding(view: SpectatorView, x: number, y: number): boolean {
  if (!inBounds(view, x, y) || tileAt(view, x, y) !== Tile.Empty) return false;
  if (view.generators.some((g) => g.carriedBy === null && g.x === x && g.y === y)) return false;
  if (view.pickups.some((u) => u.x === x && u.y === y)) return false;
  if (view.players.some((p) => p.alive && p.x === x && p.y === y)) return false;
  const crush = view.crush;
  if (crush) {
    const index = y * view.width + x;
    if (crush.pending.some((p) => p.index === index)) return false;
    if (crush.next > 0 && crush.order.length > 0) {
      const last = crush.order[crush.order.length - 1]!;
      const lx = last % view.width;
      const ly = Math.floor(last / view.width);
      if (Math.abs(lx - x) + Math.abs(ly - y) <= 1) return false;
    }
  }
  return true;
}

/** Where a throw from lane position `pos` would land now (null = no valid tile on that line). */
export function spectatorLanding(view: SpectatorView, pos: number): { x: number; y: number } | null {
  const t = spectatorLane(view)[pos];
  if (!t?.inward) return null;
  const v = DIR_VEC[t.inward];
  const want = Math.max(1, view.config.spectator.throwDistance);
  const max = t.inward === 'up' ? view.height : view.width;
  const at = (d: number): { x: number; y: number } => ({ x: t.x + v.dx * d, y: t.y + v.dy * d });
  for (let d = want; d <= max; d++) {
    const p = at(d);
    if (validLanding(view, p.x, p.y)) return p;
  }
  for (let d = want - 1; d >= 1; d--) {
    const p = at(d);
    if (validLanding(view, p.x, p.y)) return p;
  }
  return null;
}

/** Is a throw by this spectator allowed right now (cooldown, live limit, time left)? Ignores the target. */
export function canThrow(view: SpectatorView, p: Readonly<Player>): boolean {
  const s = p.spectator;
  if (!s || p.alive || view.match.phase !== 'playing') return false;
  const cfg = view.config.spectator;
  if (!cfg.enabled || view.tick < s.readyTick) return false;
  if (view.config.match.durationTicks - view.match.playTicks <= cfg.noThrowRemainingTicks) return false;
  let live = 0;
  for (const g of view.generators) if (g.fromSpectator && g.ownerId === p.id) live++;
  return live < cfg.maxLive;
}

/** Called once per playing tick after movement. */
export function updateSpectators(state: GameState, intents: Intents, events: SimEvent[]): void {
  const cfg = state.config.spectator;
  if (!cfg.enabled || state.match.phase !== 'playing') return;
  const lane = spectatorLane(state);
  for (const p of state.players) {
    if (p.alive || p.eliminatedTick === null) continue;
    if (!p.spectator) {
      // just eliminated: step onto the sideline nearest to where it happened
      p.spectator = { pos: nearestLanePos(lane, p.x, p.y), readyTick: state.tick + cfg.cooldownTicks, stepRemaining: 0 };
      continue;
    }
    const s = p.spectator;
    const intent = intents[p.id];
    if (s.stepRemaining > 0) s.stepRemaining--;
    if (intent?.move && s.stepRemaining === 0) {
      const next = laneStep(lane, s.pos, intent.move);
      if (next !== s.pos) {
        s.pos = next;
        s.stepRemaining = cfg.stepTicks;
      }
    }
    if (intent?.place) tryThrow(state, p, events);
  }
}

function tryThrow(state: GameState, p: Player, events: SimEvent[]): void {
  if (!canThrow(state, p)) return;
  const s = p.spectator!;
  const target = spectatorLanding(state, s.pos);
  if (!target) return;
  const from = spectatorLane(state)[s.pos]!;
  const cfg = state.config.spectator;
  const flight = Math.max(1, cfg.flightTicks);
  const gen: Generator = {
    id: state.nextId++,
    ownerId: p.id,
    x: target.x,
    y: target.y,
    stepFromX: target.x,
    stepFromY: target.y,
    range: cfg.range,
    pierce: false,
    square: 0,
    fromSpectator: true,
    mode: 'timed',
    // the fuse starts on landing
    timer: flight + state.config.generator.fuseTicks,
    carriedBy: null,
    carryBonusUsed: false,
    slide: null,
    flight: { fromX: from.x, fromY: from.y, remaining: flight, total: flight },
    triggered: false,
    placedTick: state.tick,
  };
  state.generators.push(gen);
  s.readyTick = state.tick + cfg.cooldownTicks;
  events.push({
    type: 'spectatorThrow',
    playerId: p.id,
    generatorId: gen.id,
    fromX: from.x,
    fromY: from.y,
    toX: target.x,
    toY: target.y,
    // in flight from this tick; generator motion (later this tick) counts the first flight tick
    landTick: state.tick + flight - 1,
  });
}
