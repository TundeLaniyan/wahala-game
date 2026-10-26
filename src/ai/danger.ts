/**
 * Time-to-fire map. For every tile it stores the tick windows in which that tile is lethal, built
 * only from what `observe()` shows: burning flames, ticking / remote / disabled generators (with
 * chain reactions, soft-block clearing and V2 Square Blast footprints - the simulation's own
 * `squareFootprint`), vehicle lanes with arrival times, Wahala Crush landings and spectator throws. Windows are absolute ticks, so a map stays valid until the
 * visible world changes. City Rumble's radial blasts (decision RE-AI1) use the simulation's `radialFootprint`
 * (ai/blast.ts) for every node, with the same chain relax and crate-cleared refine passes.
 */
import { DIRS, DIR_VEC, Tile, squareFootprint } from '../sim';
import type { Generator, TilePos, VehicleKind } from '../sim';
import { radialBox, radialTiles } from './blast';
import type { BlastGrid } from './blast';
import type { AiProfile } from './profiles';
import type { World } from './world';

export const NEVER = 1_000_000_000;
const MAX_IV = 4;
/** How long an enemy remote generator is considered "armed and live" (its owner decides when). */
const REMOTE_HOLD_TICKS = 600;

export class DangerMap {
  readonly count: Uint8Array;
  readonly start: Int32Array;
  readonly end: Int32Array;

  constructor(readonly size: number) {
    this.count = new Uint8Array(size);
    this.start = new Int32Array(size * MAX_IV);
    this.end = new Int32Array(size * MAX_IV);
  }

  clear(): void {
    this.count.fill(0);
  }

  /** Marks `tile` lethal for ticks [s, e] inclusive. Overlapping / touching windows are merged. */
  add(tile: number, s: number, e: number): void {
    if (e < s) return;
    const base = tile * MAX_IV;
    const c = this.count[tile]!;
    for (let i = 0; i < c; i++) {
      if (s <= this.end[base + i]! + 1 && e >= this.start[base + i]! - 1) {
        if (s < this.start[base + i]!) this.start[base + i] = s;
        if (e > this.end[base + i]!) this.end[base + i] = e;
        return;
      }
    }
    if (c < MAX_IV) {
      this.start[base + c] = s;
      this.end[base + c] = e;
      this.count[tile] = c + 1;
    } else {
      const last = base + MAX_IV - 1;
      this.start[last] = Math.min(this.start[last]!, s);
      this.end[last] = Math.max(this.end[last]!, e);
    }
  }

  /** Is the tile lethal at any tick in [a, b]? */
  hit(tile: number, a: number, b: number): boolean {
    const base = tile * MAX_IV;
    for (let i = 0, c = this.count[tile]!; i < c; i++) {
      if (this.start[base + i]! <= b && this.end[base + i]! >= a) return true;
    }
    return false;
  }

  /** True when nothing known will ever be lethal on this tile from tick `a` onwards. */
  safeFrom(tile: number, a: number): boolean {
    const base = tile * MAX_IV;
    for (let i = 0, c = this.count[tile]!; i < c; i++) if (this.end[base + i]! >= a) return false;
    return true;
  }

  /** Start of the earliest lethal window that has not ended before tick `a` (NEVER if none). */
  firstHit(tile: number, a: number): number {
    const base = tile * MAX_IV;
    let best = NEVER;
    for (let i = 0, c = this.count[tile]!; i < c; i++) {
      if (this.end[base + i]! >= a) best = Math.min(best, Math.max(a, this.start[base + i]!));
    }
    return best;
  }
}

/** A generator that does not exist yet (a placement being evaluated) or whose outcome is hypothetical. */
export interface HypoGen {
  x: number;
  y: number;
  range: number;
  pierce: boolean;
  /** V2 Square Blast radius (0 / absent = plain plus). */
  square?: number;
  explodeAt: number;
  /** Remote-style generator: its lane is lethal at any moment from `explodeAt` for a long time. */
  hold?: boolean;
  /** Owner id (defaults to the observing bot). */
  ownerId?: number;
}

export interface HypoVehicle {
  kind: VehicleKind;
  route: readonly TilePos[];
  /** Tick at which the vehicle enters route[0]. */
  launchTick: number;
}

export interface DangerQuery {
  extraGens?: readonly HypoGen[];
  extraVehicles?: readonly HypoVehicle[];
  /** Generators to treat as Kill-Switched. */
  disabledIds?: readonly number[];
  /** Generators moved by a kick / punch: id -> new tile position. */
  moved?: ReadonlyMap<number, { x: number; y: number }>;
  /** Generators set off by a remote detonation on the next tick. */
  detonateIds?: readonly number[];
  /** Leave out the "an enemy remote generator may go off at any moment" windows (certain hazards only). */
  ignoreHold?: boolean;
}

interface GenNode {
  id: number;
  x: number;
  y: number;
  tile: number;
  range: number;
  pierce: boolean;
  square: number;
  ownerId: number;
  explodeAt: number;
  hold: boolean;
  triggerable: boolean;
  tiles: number[];
  hits: number[];
}

const newNode = (): GenNode => ({
  id: -1,
  x: 0,
  y: 0,
  tile: 0,
  range: 0,
  pierce: false,
  square: 0,
  ownerId: -1,
  explodeAt: NEVER,
  hold: false,
  triggerable: true,
  tiles: [],
  hits: [],
});

export class DangerBuilder {
  private nodes: GenNode[] = [];
  private nodeCount = 0;
  private head = new Int16Array(0);
  private next = new Int16Array(64);
  private softGone = new Uint8Array(0);
  /** Square Blast refinement: the tile kinds with `softGone` crates cleared (only kept while a square node exists). */
  private goneTiles: number[] = [];
  private goneValid = false;
  private order: number[] = [];
  /** Refine pass: the crates cleared so far (tile indices). */
  private goneList: number[] = [];
  /**
   * Radial blasts: tiles (x, y pairs) where this build's what-ifs add, remove or move a generator. A node's
   * footprint depends only on the tiles and generators inside its own box, so a footprint computed for the
   * same observation is reused unless one of these (or, in the refine pass, a cleared crate) lies in the box.
   */
  private perturb: number[] = [];
  private readonly radialCache = new Map<
    number,
    { obs: object; x: number; y: number; range: number; pierce: boolean; square: number; tiles: number[] }
  >();

  /** Rebuilds `map` from the current observation plus optional hypothetical objects. */
  build(map: DangerMap, world: World, profile: AiProfile, q: DangerQuery = {}): void {
    const { obs, board } = world;
    const T = obs.tick;
    const w = board.width;
    const m = profile.margin;
    const flameLen = obs.config.generator.flameTicks;
    const self = obs.selfId;
    if (this.head.length !== board.size) {
      this.head = new Int16Array(board.size);
      this.softGone = new Uint8Array(board.size);
    }
    map.clear();

    for (const f of obs.flames) map.add(f.y * w + f.x, Math.max(f.startTick, T), f.endTick - 1 + m);

    // ---- generator nodes
    this.nodeCount = 0;
    this.head.fill(-1);
    this.perturb.length = 0;
    obs.generators.forEach((g) => this.addNode(world, g, T, self, q));
    for (const h of q.extraGens ?? []) {
      this.perturb.push(h.x, h.y);
      const n = this.acquire();
      n.id = -1;
      n.x = h.x;
      n.y = h.y;
      n.tile = h.y * w + h.x;
      n.range = h.range;
      n.pierce = h.pierce;
      n.square = h.square ?? 0;
      n.ownerId = h.ownerId ?? self;
      n.explodeAt = h.explodeAt;
      n.hold = h.hold === true;
      n.triggerable = true;
    }
    this.link();

    this.applyVehicles(map, world, profile, q);
    this.applyStage(map, world, profile);
    this.applyCrowd(map, world, profile);

    // ---- blast geometry, chains, then a refinement pass where earlier blasts have cleared soft blocks
    for (let i = 0; i < this.nodeCount; i++) this.computeArms(world, i, false);
    if (profile.chains) {
      this.relax();
      this.refine(world);
    }

    for (let i = 0; i < this.nodeCount; i++) {
      const n = this.nodes[i]!;
      if (n.explodeAt >= NEVER) continue;
      if (n.hold && q.ignoreHold) continue;
      const far = n.explodeAt - T > profile.lookahead && n.ownerId !== self;
      if (far) continue;
      const s = n.hold ? T + 1 : n.explodeAt;
      const e = n.hold ? T + REMOTE_HOLD_TICKS : n.explodeAt + flameLen - 1;
      for (const t of n.tiles) map.add(t, s - m, e + m);
    }

    this.applyCrush(map, world, profile);
  }

  // ------------------------------------------------------------------ nodes

  private acquire(): GenNode {
    if (this.nodeCount === this.nodes.length) this.nodes.push(newNode());
    return this.nodes[this.nodeCount++]!;
  }

  private addNode(world: World, g: Readonly<Generator>, T: number, self: number, q: DangerQuery): void {
    const n = this.acquire();
    const mv = q.moved?.get(g.id);
    if (mv) this.perturb.push(g.x, g.y, mv.x, mv.y);
    n.id = g.id;
    n.x = mv ? mv.x : g.x;
    n.y = mv ? mv.y : g.y;
    n.tile = n.y * world.board.width + n.x;
    n.range = g.range;
    n.pierce = g.pierce;
    n.square = g.square;
    n.ownerId = g.ownerId;
    n.triggerable = g.flight === null;
    n.hold = false;
    if (g.carriedBy === world.obs.selfId)
      n.explodeAt = NEVER; // being carried: the drop logic handles it
    else if (q.detonateIds?.includes(g.id)) n.explodeAt = T + 1;
    else if (g.mode === 'disabled' || q.disabledIds?.includes(g.id)) n.explodeAt = NEVER;
    else if (g.triggered) n.explodeAt = T;
    else if (g.mode === 'remote' && g.ownerId !== self) {
      n.explodeAt = T + 1;
      n.hold = true;
    } else n.explodeAt = T + Math.max(1, g.timer);
  }

  private link(): void {
    if (this.next.length < this.nodeCount) this.next = new Int16Array(this.nodeCount * 2);
    for (let i = 0; i < this.nodeCount; i++) {
      const n = this.nodes[i]!;
      if (!n.triggerable) {
        this.next[i] = -1;
        continue;
      }
      this.next[i] = this.head[n.tile]!;
      this.head[n.tile] = i;
    }
  }

  /** Plus-shaped flame set of one node, mirroring the simulation (concrete stops, first soft block absorbs). */
  private computeArms(world: World, idx: number, useGone: boolean): void {
    const n = this.nodes[idx]!;
    const { obs, board } = world;
    const w = board.width;
    n.tiles.length = 0;
    n.hits.length = 0;
    n.tiles.push(n.tile);
    for (let o = this.head[n.tile]!; o >= 0; o = this.next[o]!) if (o !== idx) n.hits.push(o);
    if (obs.config.generator.blastMode === 'radial') {
      this.radialArms(world, idx, useGone);
      return;
    }
    if (obs.config.generator.blastMode === 'fullLine') {
      // Power Yard: the whole row and column, through everything (mirrors explosions.ts)
      for (const d of DIRS) {
        const v = DIR_VEC[d];
        for (let cx = n.x + v.dx, cy = n.y + v.dy; cx >= 0 && cy >= 0 && cx < w && cy < board.height; cx += v.dx, cy += v.dy) {
          const t = cy * w + cx;
          if (obs.tiles[t] === Tile.Hard) continue;
          n.tiles.push(t);
          for (let o = this.head[t]!; o >= 0; o = this.next[o]!) if (o !== idx) n.hits.push(o);
        }
      }
      if (n.square > 0) this.squareArms(world, idx, useGone);
      return;
    }
    for (const d of DIRS) {
      const v = DIR_VEC[d];
      let cx = n.x;
      let cy = n.y;
      let pierced = false;
      for (let i = 1; i <= n.range; i++) {
        cx += v.dx;
        cy += v.dy;
        if (cx < 0 || cy < 0 || cx >= w || cy >= board.height) break;
        const t = cy * w + cx;
        let kind = obs.tiles[t]!;
        if (useGone && this.softGone[t] === 1) kind = Tile.Empty;
        if (kind === Tile.Hard) break;
        n.tiles.push(t);
        if (kind === Tile.Soft) {
          if (n.pierce && !pierced) {
            pierced = true;
            continue;
          }
          break;
        }
        let found = false;
        for (let o = this.head[t]!; o >= 0; o = this.next[o]!) {
          if (o !== idx) {
            n.hits.push(o);
            found = true;
          }
        }
        if (found) break;
      }
    }
    if (n.square > 0) this.squareArms(world, idx, useGone);
  }

  /** The tile map blasts resolve against: the observation, or (refine pass) with `softGone` crates cleared. */
  private grid(world: World, useGone: boolean): BlastGrid {
    const { obs, board } = world;
    if (!useGone) return obs;
    if (!this.goneValid) {
      const g = this.goneTiles;
      g.length = board.size;
      for (let t = 0; t < board.size; t++) g[t] = this.softGone[t] === 1 ? Tile.Empty : obs.tiles[t]!;
      this.goneValid = true;
    }
    return { width: board.width, height: board.height, tiles: this.goneTiles };
  }

  /** Does a tile hold a triggerable node other than `idx` (it is hit and chains but passes no wave on)? */
  private blocker(w: number, idx: number): (x: number, y: number) => boolean {
    this.blockW = w;
    this.blockIdx = idx;
    return this.blocks;
  }

  private blockW = 0;
  private blockIdx = -1;
  /** One function object for every footprint (no per-node closure); reads blockW / blockIdx. */
  private readonly blocks = (x: number, y: number): boolean => {
    for (let o = this.head[y * this.blockW + x]!; o >= 0; o = this.next[o]!) if (o !== this.blockIdx) return true;
    return false;
  };

  /** Is any (x, y) of `list` (pairs, or tile indices when `stride` is 1) inside the box of half-size `box`? */
  private near(list: readonly number[], stride: 1 | 2, cx: number, cy: number, box: number, w: number): boolean {
    for (let i = 0; i < list.length; i += stride) {
      const x = stride === 2 ? list[i]! : list[i]! % w;
      const y = stride === 2 ? list[i + 1]! : Math.floor(list[i]! / w);
      if (Math.abs(x - cx) <= box && Math.abs(y - cy) <= box) return true;
    }
    return false;
  }

  /** City Rumble radial blast: the simulation's footprint (disc or Square Blast square, with cover shadows). */
  private radialArms(world: World, idx: number, useGone: boolean): void {
    const n = this.nodes[idx]!;
    const { obs } = world;
    const w = world.board.width;
    const box = radialBox(obs, n.range, n.square);
    const local = n.id >= 0 && !this.near(this.perturb, 2, n.x, n.y, box, w);
    const gone = useGone && this.near(this.goneList, 1, n.x, n.y, box, w);
    let tiles: number[];
    if (local && !gone) {
      // nothing this build changes reaches the footprint: the observation's own footprint (cached)
      const e = this.radialCache.get(n.id);
      if (e && e.obs === obs && e.x === n.x && e.y === n.y && e.range === n.range && e.pierce === n.pierce && e.square === n.square) {
        tiles = e.tiles;
      } else {
        tiles = [];
        radialTiles(obs, obs, n.x, n.y, n.range, n.pierce, n.square, this.blocker(w, idx), tiles);
        this.radialCache.set(n.id, { obs, x: n.x, y: n.y, range: n.range, pierce: n.pierce, square: n.square, tiles });
      }
    } else {
      tiles = [];
      radialTiles(obs, this.grid(world, useGone), n.x, n.y, n.range, n.pierce, n.square, this.blocker(w, idx), tiles);
    }
    for (const t of tiles) {
      n.tiles.push(t);
      for (let o = this.head[t]!; o >= 0; o = this.next[o]!) if (o !== idx) n.hits.push(o);
    }
  }

  /** V2 Square Blast: the square tiles the simulation's blast wave reaches, added to the plus (union). */
  private squareArms(world: World, idx: number, useGone: boolean): void {
    const n = this.nodes[idx]!;
    const { obs, board } = world;
    const w = board.width;
    const grid = useGone ? this.grid(world, true) : obs;
    const blocks = this.blocker(w, idx);
    for (const p of squareFootprint(grid, n.x, n.y, n.square, blocks)) {
      const t = p.y * w + p.x;
      if (n.tiles.includes(t)) continue;
      n.tiles.push(t);
      for (let o = this.head[t]!; o >= 0; o = this.next[o]!) if (o !== idx && !n.hits.includes(o)) n.hits.push(o);
    }
  }

  /** A generator inside another's flame goes off with it: propagate the earliest tick. */
  private relax(): void {
    let changed = true;
    for (let guard = 0; changed && guard < 32; guard++) {
      changed = false;
      for (let i = 0; i < this.nodeCount; i++) {
        const a = this.nodes[i]!;
        if (a.explodeAt >= NEVER) continue;
        for (const j of a.hits) {
          const b = this.nodes[j]!;
          if (b.explodeAt > a.explodeAt) {
            b.explodeAt = a.explodeAt;
            b.hold = false;
            changed = true;
          }
        }
      }
    }
  }

  /** Recomputes arms in explosion order so a block destroyed by an early blast no longer shields later ones. */
  private refine(world: World): void {
    const { obs } = world;
    if (this.nodeCount < 2) return;
    this.softGone.fill(0);
    this.goneValid = false;
    this.goneList.length = 0;
    this.order.length = 0;
    for (let i = 0; i < this.nodeCount; i++) if (this.nodes[i]!.explodeAt < NEVER) this.order.push(i);
    this.order.sort((a, b) => this.nodes[a]!.explodeAt - this.nodes[b]!.explodeAt);
    let k = 0;
    while (k < this.order.length) {
      let e = k;
      const at = this.nodes[this.order[k]!]!.explodeAt;
      while (e < this.order.length && this.nodes[this.order[e]!]!.explodeAt === at) e++;
      for (let q = k; q < e; q++) this.computeArms(world, this.order[q]!, true);
      for (let q = k; q < e; q++) {
        for (const t of this.nodes[this.order[q]!]!.tiles)
          if (obs.tiles[t] === Tile.Soft && this.softGone[t] === 0) {
            this.softGone[t] = 1;
            this.goneList.push(t);
            this.goneValid = false;
          }
      }
      k = e;
    }
    this.relax();
  }

  // ------------------------------------------------------------------ vehicles

  private applyVehicles(map: DangerMap, world: World, profile: AiProfile, q: DangerQuery): void {
    const { obs } = world;
    const T = obs.tick;
    const self = obs.selfId;
    for (const v of obs.vehicles) {
      if (v.phase === 'crashing') continue;
      const spec = obs.config.vehicles.specs[v.kind];
      const step = spec.stepTicks;
      const limit = profile.vehicleLookahead;
      const mine = v.ownerId === self;
      let softs = 0;
      const driving = v.phase === 'driving';
      for (let j = Math.max(0, v.index - 1); j < v.route.length; j++) {
        const tile = v.route[j]!;
        const t = tile.y * world.board.width + tile.x;
        const kind = obs.tiles[t];
        if (kind === Tile.Hard) break;
        if (kind === Tile.Soft && ++softs > spec.softLimit) break;
        let a: number;
        let b: number;
        if (!driving) {
          a = T + v.warnRemaining + j * step;
          b = a + step + (step >> 1);
        } else if (j < v.index) {
          // the tile just left stays lethal for the first half of the step in progress
          a = T;
          b = T + Math.max(0, v.stepRemaining - Math.ceil(v.stepTotal / 2));
        } else {
          const nextArr = T + v.stepRemaining;
          a = j === v.index ? T : nextArr + (j - v.index - 1) * step;
          b = nextArr + (j - v.index) * step + (step >> 1);
        }
        if (!mine && a - T > limit) break;
        this.vehicleTile(map, t, a, b, profile);
      }
    }
    for (const h of q.extraVehicles ?? []) {
      const spec = obs.config.vehicles.specs[h.kind];
      let softs = 0;
      for (let j = 0; j < h.route.length; j++) {
        const tile = h.route[j]!;
        const t = tile.y * world.board.width + tile.x;
        const kind = obs.tiles[t];
        if (kind === Tile.Hard) break;
        if (kind === Tile.Soft && ++softs > spec.softLimit) break;
        const a = h.launchTick + j * spec.stepTicks;
        this.vehicleTile(map, t, a, a + spec.stepTicks + (spec.stepTicks >> 1), profile);
      }
    }
  }

  private vehicleTile(map: DangerMap, tile: number, a: number, b: number, profile: AiProfile): void {
    const m = profile.margin + 1;
    map.add(tile, a - m, b + m);
    for (let o = this.head[tile]!; o >= 0; o = this.next[o]!) {
      const n = this.nodes[o]!;
      if (n.explodeAt > a) {
        n.explodeAt = a;
        n.hold = false;
      }
    }
  }

  // ------------------------------------------------------------------ stage hazards

  /** Telegraphed stage hazards: sweeping traffic along its route, lethal strike zones while live. */
  private applyStage(map: DangerMap, world: World, profile: AiProfile): void {
    const { obs } = world;
    const T = obs.tick;
    const m = profile.margin;
    for (const e of obs.stage.events) {
      if (e.startTick - T > profile.vehicleLookahead) continue;
      if (e.kind === 'strike') {
        for (const t of e.tiles) map.add(t, e.startTick - m, e.endTick - 1 + m);
      } else if (e.kind === 'sweep') {
        const st = e.stepTicks;
        if (e.index < 0) {
          e.tiles.forEach((t, j) => {
            const a = e.startTick + j * st;
            this.vehicleTile(map, t, a, a + st + (st >> 1), profile);
          });
        } else {
          map.add(e.tiles[e.index]!, T - m, T + e.stepRemaining + m);
          if (e.index > 0) map.add(e.tiles[e.index - 1]!, T - m, T + (st >> 1) + m);
          for (let j = e.index + 1; j < e.tiles.length; j++) {
            const a = T + e.stepRemaining + (j - e.index - 1) * st;
            this.vehicleTile(map, e.tiles[j]!, a, a + st + (st >> 1), profile);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ crowd / crush

  private applyCrowd(map: DangerMap, world: World, profile: AiProfile): void {
    const crowd = world.obs.crowd;
    if (!crowd) return;
    const w = world.board.width;
    const m = profile.margin;
    for (const t of crowd.throws) {
      if (t.landTick - world.obs.tick > profile.vehicleLookahead) continue;
      const centre = t.y * w + t.x;
      if (t.kind === 'bottle') {
        if (profile.tier !== 'easy') map.add(centre, t.landTick - m, t.landTick + m);
        continue;
      }
      const tiles = [centre];
      for (const d of DIRS) {
        const nx = t.x + DIR_VEC[d].dx;
        const ny = t.y + DIR_VEC[d].dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < world.board.height) tiles.push(ny * w + nx);
      }
      for (const tile of tiles) {
        map.add(tile, t.landTick - m, t.landTick + m);
        for (let o = this.head[tile]!; o >= 0; o = this.next[o]!) {
          const n = this.nodes[o]!;
          if (n.explodeAt > t.landTick) {
            n.explodeAt = t.landTick;
            n.hold = false;
          }
        }
      }
    }
  }

  private applyCrush(map: DangerMap, world: World, profile: AiProfile): void {
    const crush = world.obs.crush;
    if (!crush) return;
    const { obs } = world;
    const cfg = obs.config.crush;
    for (const p of crush.pending) map.add(p.index, p.landTick - profile.margin, NEVER);
    const horizon = obs.tick + profile.horizonTicks;
    for (let j = crush.next; j < crush.order.length; j++) {
      const land = obs.tick + (crush.warnAt[j]! - obs.match.playTicks) + cfg.warnTicks;
      if (land > horizon) break;
      map.add(crush.order[j]!, land - profile.margin, NEVER);
    }
  }
}
