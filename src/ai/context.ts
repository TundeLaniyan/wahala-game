/** Shared mutable context handed to the planning modules (one per bot). */
import type { RngHolder } from '../sim';
import { DangerBuilder, DangerMap } from './danger';
import type { AiProfile } from './profiles';
import { MAX_SLOTS, TimeBfs } from './timebfs';
import { World } from './world';
import type { Board } from './board';
import { LARGE_MAX_SLOTS, LARGE_RIVAL_SIMS, LARGE_WORK_BUDGET, isLargeBoard } from './scale';

export interface Ctx {
  profile: AiProfile;
  rng: RngHolder;
  world: World;
  builder: DangerBuilder;
  /** Danger of the visible world. */
  danger: DangerMap;
  /** Danger without "enemy remote generator may fire any time" windows (built on demand). */
  certain: DangerMap;
  /** Scratch danger map for hypothetical what-ifs (a placement, a vehicle, a kick). */
  tmp: DangerMap;
  /** Main search from the bot's own tile. */
  bfs: TimeBfs;
  /** Scratch search for escape / rival checks. */
  aux: TimeBfs;
  /** Per-tile distance to the nearest rival, passing through soft blocks at extra cost. */
  hunt: Int16Array;
  /** Rival simulations spent in the current think (budget). */
  rivalSims: number;
  /** Rival simulations allowed per think (the profile's; fewer on large boards). */
  maxRivalSims: number;
  /** Scratch tile marks (cleared by the user). */
  mark: Uint8Array;
  /** Scratch walkability map for what-ifs that move generators. */
  scratch: Uint8Array;
  /** Which pickups this bot decided to care about (Easy ignores most of them). */
  interest: Map<number, boolean>;
  /** Rival refuge counts under the real danger map, cleared every think. */
  baseline: Map<number, number>;
  /** Work units (danger builds + searches) spent in the current think. */
  work: number;
  /** Work allowed per think before optional analyses are skipped (Infinity on standard boards). */
  budget: number;
  /** Large boards with a closing city: walking cost to the area that stays open a while longer. */
  zone: Int16Array;
  /** Tick the zone field was computed (-1 = never / not in use). */
  zoneTick: number;
  /** Pull towards the nearest rival for this think (the profile's value; paced on large boards). */
  huntWeight: number;
  /** Probability of verifying a placement's escape (the profile's; 1 in a large match's final few). */
  placeVerify: number;
}

/** Records `units` of work; true when the think's budget is spent (never on standard boards). */
export function spend(c: Ctx, units = 1): boolean {
  c.work += units;
  return c.work > c.budget;
}

export const overBudget = (c: Ctx): boolean => c.work >= c.budget;

export function createCtx(profile: AiProfile, rng: RngHolder, board: Board): Ctx {
  return {
    profile,
    rng,
    world: new World(),
    builder: new DangerBuilder(),
    danger: new DangerMap(board.size),
    certain: new DangerMap(board.size),
    tmp: new DangerMap(board.size),
    bfs: new TimeBfs(board, isLargeBoard(board) ? LARGE_MAX_SLOTS : MAX_SLOTS),
    aux: new TimeBfs(board, isLargeBoard(board) ? LARGE_MAX_SLOTS : MAX_SLOTS),
    hunt: new Int16Array(board.size),
    rivalSims: 0,
    maxRivalSims: isLargeBoard(board)
      ? Math.min(profile.maxRivalSims, LARGE_RIVAL_SIMS[profile.tier])
      : profile.maxRivalSims,
    mark: new Uint8Array(board.size),
    scratch: new Uint8Array(board.size),
    interest: new Map(),
    baseline: new Map(),
    work: 0,
    budget: isLargeBoard(board) ? LARGE_WORK_BUDGET[profile.tier] : Infinity,
    zone: new Int16Array(board.size),
    zoneTick: -1,
    huntWeight: profile.huntWeight,
    placeVerify: profile.placeVerify,
  };
}
