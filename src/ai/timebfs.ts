/**
 * Time-expanded breadth-first search. A state is (tile, slot): slot k is the k-th step window of
 * the walker, and the walker occupies its tile for the ticks [tickAt(k), tickAt(k+1) - 1]. A state
 * is only entered when the danger map says the tile is not lethal during that window, so a path
 * found here never steps onto a tile that is burning or will burn before the walker has left it.
 * Waiting in place is a legal move, which lets paths pause until a lane clears.
 */
import { DIRS } from '../sim';
import type { Dir } from '../sim';
import type { DangerMap } from './danger';
import type { Board } from './board';

export const MAX_SLOTS = 40;

export interface BfsRun {
  start: number;
  /** Tick from which the walker is on the start tile. */
  a0: number;
  /** First tick at which the walker's next step can begin. */
  a1: number;
  /** Ticks per tile. */
  step: number;
  /** Number of slots to expand (capped by MAX_SLOTS). */
  slots: number;
  danger: DangerMap;
  /** 1 = cannot be entered. */
  blocked: Uint8Array;
  /** Extra tile that cannot be entered (e.g. a generator just placed under the walker). */
  extraBlocked?: number;
  /** Walkable-neighbour counts per tile for refuge filtering, with the minimum required. */
  exits?: (tile: number) => number;
  minExits?: number;
  /** Map used to decide whether a state is a refuge (defaults to `danger`). */
  refugeDanger?: DangerMap;
  /** Stop at the first terminal-safe state found (used for escape checks). */
  stopAtRefuge?: boolean;
}

export class TimeBfs {
  /** Earliest slot in which each tile can be occupied (-1 = never). */
  readonly firstSlot: Int16Array;
  private readonly parent: Int16Array;
  private readonly stamp: Int32Array;
  private cur: Int16Array;
  private nxt: Int16Array;
  private runId = 0;
  private a0 = 0;
  private a1 = 0;
  private stepTicks = 10;
  /** Terminal-safe states discovered: tile and slot, in discovery (earliest-first) order. */
  readonly refugeTile: number[] = [];
  readonly refugeSlot: number[] = [];
  /** Set when `stopAtRefuge` found something. */
  foundTile = -1;
  foundSlot = -1;
  usedSlots = 0;

  constructor(private readonly board: Board) {
    const n = board.size;
    this.firstSlot = new Int16Array(n);
    this.parent = new Int16Array(MAX_SLOTS * n);
    this.stamp = new Int32Array(MAX_SLOTS * n);
    this.cur = new Int16Array(n);
    this.nxt = new Int16Array(n);
  }

  tickAt(slot: number): number {
    return slot <= 0 ? this.a0 : this.a1 + (slot - 1) * this.stepTicks;
  }

  reached(tile: number): boolean {
    return this.firstSlot[tile]! >= 0;
  }

  run(r: BfsRun): void {
    const { board } = this;
    const n = board.size;
    const slots = Math.min(MAX_SLOTS, Math.max(2, r.slots));
    this.a0 = r.a0;
    this.a1 = Math.max(r.a1, r.a0);
    this.stepTicks = r.step;
    this.runId++;
    this.firstSlot.fill(-1);
    this.refugeTile.length = 0;
    this.refugeSlot.length = 0;
    this.foundTile = this.foundSlot = -1;
    const id = this.runId;
    const { danger } = r;
    let curCount = 1;
    this.cur[0] = r.start;
    this.stamp[r.start] = id;
    this.parent[r.start] = -1;
    this.firstSlot[r.start] = 0;
    this.usedSlots = 1;
    const minExits = r.minExits ?? 0;

    if (this.isRefuge(r, r.start, 0, minExits, danger)) {
      this.refugeTile.push(r.start);
      this.refugeSlot.push(0);
      if (r.stopAtRefuge) {
        this.foundTile = r.start;
        this.foundSlot = 0;
        return;
      }
    }

    for (let k = 0; k < slots - 1 && curCount > 0; k++) {
      const wa = this.tickAt(k + 1);
      const wb = this.tickAt(k + 2) - 1;
      const base = (k + 1) * n;
      let nxtCount = 0;
      for (let ci = 0; ci < curCount; ci++) {
        const u = this.cur[ci]!;
        for (let d = -1; d < 4; d++) {
          const v = d < 0 ? u : board.neighbor[u * 4 + d]!;
          if (v < 0) continue;
          if (d >= 0 && (r.blocked[v] === 1 || v === r.extraBlocked)) continue;
          if (this.stamp[base + v] === id) continue;
          if (danger.hit(v, wa, wb)) continue;
          this.stamp[base + v] = id;
          this.parent[base + v] = u;
          this.nxt[nxtCount++] = v;
          if (this.firstSlot[v]! < 0) this.firstSlot[v] = k + 1;
          if (this.isRefuge(r, v, k + 1, minExits, danger)) {
            this.refugeTile.push(v);
            this.refugeSlot.push(k + 1);
            if (r.stopAtRefuge) {
              this.foundTile = v;
              this.foundSlot = k + 1;
              this.usedSlots = k + 2;
              return;
            }
          }
        }
      }
      this.usedSlots = k + 2;
      const swap = this.cur;
      this.cur = this.nxt;
      this.nxt = swap;
      curCount = nxtCount;
    }
  }

  private isRefuge(r: BfsRun, tile: number, slot: number, minExits: number, danger: DangerMap): boolean {
    if (!(r.refugeDanger ?? danger).safeFrom(tile, this.tickAt(slot))) return false;
    return minExits === 0 || !r.exits || r.exits(tile) >= minExits;
  }

  /** Per-transition actions to reach (tile, slot): `null` = wait, otherwise the direction to step. */
  pathTo(tile: number, slot: number, out: (Dir | null)[] = []): (Dir | null)[] {
    out.length = slot;
    let cur = tile;
    const n = this.board.size;
    for (let k = slot; k >= 1; k--) {
      const p = this.parent[k * n + cur]!;
      if (p === cur) out[k - 1] = null;
      else {
        let dir: Dir | null = null;
        for (let d = 0; d < 4; d++) if (this.board.neighbor[p * 4 + d] === cur) dir = DIRS[d]!;
        out[k - 1] = dir;
      }
      cur = p;
    }
    return out;
  }

  /** Tiles visited by the path to (tile, slot), index i = tile at slot i. */
  tilesTo(tile: number, slot: number, out: number[] = []): number[] {
    out.length = slot + 1;
    let cur = tile;
    const n = this.board.size;
    for (let k = slot; k >= 0; k--) {
      out[k] = cur;
      if (k > 0) cur = this.parent[k * n + cur]!;
    }
    return out;
  }

  /** Is (tile, slot) a state this run reached? */
  hasState(tile: number, slot: number): boolean {
    return slot < this.usedSlots && this.stamp[slot * this.board.size + tile] === this.runId;
  }
}
