/** Shared mutable context handed to the planning modules (one per bot). */
import type { RngHolder } from '../sim';
import { DangerBuilder, DangerMap } from './danger';
import type { AiProfile } from './profiles';
import { TimeBfs } from './timebfs';
import { World } from './world';
import type { Board } from './board';

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
  /** Scratch tile marks (cleared by the user). */
  mark: Uint8Array;
  /** Scratch walkability map for what-ifs that move generators. */
  scratch: Uint8Array;
  /** Which pickups this bot decided to care about (Easy ignores most of them). */
  interest: Map<number, boolean>;
  /** Rival refuge counts under the real danger map, cleared every think. */
  baseline: Map<number, number>;
}

export function createCtx(profile: AiProfile, rng: RngHolder, board: Board): Ctx {
  return {
    profile,
    rng,
    world: new World(),
    builder: new DangerBuilder(),
    danger: new DangerMap(board.size),
    certain: new DangerMap(board.size),
    tmp: new DangerMap(board.size),
    bfs: new TimeBfs(board),
    aux: new TimeBfs(board),
    hunt: new Int16Array(board.size),
    rivalSims: 0,
    mark: new Uint8Array(board.size),
    scratch: new Uint8Array(board.size),
    interest: new Map(),
    baseline: new Map(),
  };
}
