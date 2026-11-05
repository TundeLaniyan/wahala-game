/**
 * Helpers for the raid tests: a raid ready to play and a SCRIPTED HUMAN that plays with ordinary intents only (move,
 * place) - it walks the real board, places real cross bombs on tiles with a clear line to the target, and walks out of
 * the blast before the fuse runs out. Nothing here touches the state directly except the setup helpers.
 */
import { buildRaidGame, createGame, tick } from '../src/sim';
import type { Dir, GameState, Intent, Intents, RaidId, SimEvent, TilePos } from '../src/sim';
import { DIRS, DIR_VEC } from '../src/sim/grid';
import { previewBlast } from '../src/sim/systems/explosions';
import { Tile } from '../src/sim/types';
import { RAID_TUNING } from '../src/sim/raid';
import { addGenerator } from './helpers';

export interface NewRaidOptions {
  seed?: number;
  lives?: number;
  hp?: number;
  /** Skip the countdown (default true). */
  playing?: boolean;
  timeLimitSec?: number;
}

export function newRaid(raidId: RaidId = 'warehouseDispatchDepot', o: NewRaidOptions = {}): GameState {
  const state = createGame(
    buildRaidGame({
      raidId,
      humanCharacter: 'streetBaller',
      seed: o.seed ?? 3,
      ...(o.lives !== undefined ? { lives: o.lives } : {}),
      ...(o.hp !== undefined ? { hp: o.hp } : {}),
      ...(o.timeLimitSec !== undefined ? { timeLimitSec: o.timeLimitSec } : {}),
    }),
  );
  if (o.playing ?? true) {
    state.match.phase = 'playing';
    state.match.countdownRemaining = 0;
  }
  return state;
}

export const of = <T extends SimEvent['type']>(
  events: SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

/** FNV-1a over the JSON of any value (a state hash for determinism checks). */
export function hashOf(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}:${text.length}`;
}

export function put(state: GameState, id: number, x: number, y: number): void {
  const p = state.players[id]!;
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
}

/** Runs `n` ticks (stops when the match ends). */
export function advance(
  state: GameState,
  n: number,
  intents: Intents | ((i: number) => Intents) = {},
  sink: SimEvent[] = [],
): SimEvent[] {
  for (let i = 0; i < n; i++) {
    sink.push(...tick(state, typeof intents === 'function' ? intents(i) : intents));
    if (state.match.phase === 'ended') break;
  }
  return sink;
}

/** Runs until `done()` or `max` ticks; throws when it never happens. */
export function until(
  state: GameState,
  done: () => boolean,
  max: number,
  sink: SimEvent[] = [],
  intents: Intents = {},
  what = 'condition',
): SimEvent[] {
  for (let i = 0; i < max; i++) {
    if (done()) return sink;
    sink.push(...tick(state, intents));
    if (state.match.phase === 'ended' && !done()) break;
  }
  if (!done()) throw new Error(`${what} did not happen within ${max} ticks (tick ${state.tick})`);
  return sink;
}

const key = (x: number, y: number): string => `${x},${y}`;

/** Marks the first tile of a placeable kind for a ScriptedHuman ("bomb the tile at ..."). */
export interface ScriptOptions {
  /** May the walker step on conveyor belts? (default false) */
  belts?: boolean;
}

export class ScriptedHuman {
  /** The generator just laid: its own blast does not count as danger while the walker leaves it. */
  private ignoreGen: number | null = null;

  constructor(
    readonly state: GameState,
    readonly sink: SimEvent[] = [],
    public opts: ScriptOptions = {},
  ) {}

  get me(): GameState['players'][number] {
    return this.state.players[0]!;
  }

  step(intent: Intent = {}): void {
    this.sink.push(...tick(this.state, { 0: intent }));
  }

  idle(n: number): void {
    for (let i = 0; i < n && this.state.match.phase !== 'ended'; i++) this.step();
  }

  // ------------------------------------------------------------ the world as the player sees it

  private beltTiles(): Set<string> {
    const out = new Set<string>();
    for (const b of this.state.raid?.belts ?? []) for (const t of b.tiles) out.add(key(t.x, t.y));
    return out;
  }

  /** Tiles the walker may stand on right now. */
  private walkable(x: number, y: number, danger: Set<string>, belts: Set<string>): boolean {
    const s = this.state;
    if (x < 0 || y < 0 || x >= s.width || y >= s.height) return false;
    if (s.tiles[y * s.width + x] !== Tile.Empty) return false;
    if (s.generators.some((g) => g.x === x && g.y === y)) return false;
    if (s.players.some((p) => p.id !== 0 && p.alive && p.x === x && p.y === y)) return false;
    if (danger.has(key(x, y))) return false;
    if (!this.opts.belts && belts.has(key(x, y))) return false;
    return true;
  }

  private dangerSet(): Set<string> {
    const s = this.state;
    const out = new Set<string>();
    for (const f of s.flames) out.add(key(f.x, f.y));
    for (const g of s.generators) {
      if (g.id === this.ignoreGen) continue;
      for (const i of previewBlast(s, g)) out.add(key(i % s.width, Math.floor(i / s.width)));
    }
    for (const b of s.raid?.barrelBlasts ?? []) out.add(key(b.x, b.y));
    // a shipment: the tile it is on, the two it reaches next, and (while it is still telegraphing) the head of its belt
    for (const sh of s.raid?.shipments ?? []) {
      const belt = s.raid!.belts.find((b) => b.id === sh.beltId)!;
      const ahead = sh.phase === 'warn' ? 3 : 2;
      for (let i = sh.index; i <= sh.index + ahead; i++) {
        const t = belt.tiles[i];
        if (t) out.add(key(t.x, t.y));
      }
    }
    return out;
  }

  /** Shortest walkable path (tile list excluding the start) from the player's tile to `goal`, or null. */
  path(goal: (x: number, y: number) => boolean, extraDanger?: Set<string>): TilePos[] | null {
    const danger = this.dangerSet();
    if (extraDanger) for (const k of extraDanger) danger.add(k);
    const belts = this.beltTiles();
    const start = { x: this.me.x, y: this.me.y };
    const prev = new Map<string, TilePos | null>([[key(start.x, start.y), null]]);
    const queue: TilePos[] = [start];
    for (let head = 0; head < queue.length; head++) {
      const t = queue[head]!;
      if ((t.x !== start.x || t.y !== start.y) && goal(t.x, t.y)) {
        const out: TilePos[] = [];
        for (
          let c: TilePos | null = t;
          c && (c.x !== start.x || c.y !== start.y);
          c = prev.get(key(c.x, c.y)) ?? null
        )
          out.push(c);
        return out.reverse();
      }
      for (const dir of DIRS) {
        const v = DIR_VEC[dir];
        const x = t.x + v.dx;
        const y = t.y + v.dy;
        if (prev.has(key(x, y)) || !this.walkable(x, y, danger, belts)) continue;
        prev.set(key(x, y), t);
        queue.push({ x, y });
      }
    }
    return null;
  }

  private dirTo(to: TilePos): Dir {
    const dx = to.x - this.me.x;
    const dy = to.y - this.me.y;
    return dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
  }

  /** Walks to (x, y) (through open floor only), one tile at a time. */
  walkTo(x: number, y: number, maxTicks = 1500): void {
    if (this.me.x === x && this.me.y === y) {
      this.waitStill();
      return;
    }
    let waited = 0;
    for (let i = 0; i < maxTicks; i++) {
      if (this.state.match.phase === 'ended') return;
      if (this.me.x === x && this.me.y === y && this.me.stepRemaining === 0) return;
      if (this.me.x === x && this.me.y === y) {
        this.step();
        continue;
      }
      const p = this.path((px, py) => px === x && py === y);
      if (!p) {
        // blocked by a shipment's path or a burning tile: wait for it to pass
        if (++waited > 400)
          throw new Error(
            `no walkable path from ${this.me.x},${this.me.y} to ${x},${y} (tick ${this.state.tick})`,
          );
        this.step();
        continue;
      }
      this.step({ move: this.dirTo(p[0]!) });
    }
    throw new Error(`walkTo ${x},${y} took more than ${maxTicks} ticks`);
  }

  waitStill(): void {
    for (let i = 0; i < 40 && this.me.stepRemaining > 0; i++) this.step();
  }

  // ------------------------------------------------------------ bombing

  /** Is there a clear line (open floor only) from (px, py) to the target within `range`? */
  private lineTo(px: number, py: number, t: TilePos, range: number): boolean {
    if (px !== t.x && py !== t.y) return false;
    const d = Math.abs(px - t.x) + Math.abs(py - t.y);
    if (d < 1 || d > range) return false;
    const sx = Math.sign(t.x - px);
    const sy = Math.sign(t.y - py);
    for (let i = 1; i < d; i++) {
      if (this.state.tiles[(py + sy * i) * this.state.width + px + sx * i] !== Tile.Empty) return false;
    }
    return true;
  }

  /** The tiles a plus blast from (px, py) covers (the blast stops at, and includes, the first solid tile). */
  private blastFrom(px: number, py: number): Set<string> {
    const out = new Set<string>([key(px, py)]);
    const range = this.me.range;
    for (const dir of DIRS) {
      const v = DIR_VEC[dir];
      for (let i = 1; i <= range; i++) {
        const x = px + v.dx * i;
        const y = py + v.dy * i;
        const tile = this.state.tiles[y * this.state.width + x];
        if (tile === undefined || tile === Tile.Hard) break;
        out.add(key(x, y));
        if (tile === Tile.Soft) break;
      }
    }
    return out;
  }

  /** Walks to a tile with a clear line to `target` (from which the blast can be left), lays a generator, gets out, waits. */
  fireAt(target: TilePos): void {
    const range = this.me.range;
    const belts = this.beltTiles();
    const goal = (x: number, y: number): boolean => {
      if (!this.lineTo(x, y, target, range) || (!this.opts.belts && belts.has(key(x, y)))) return false;
      return this.escape(x, y) !== null;
    };
    if (this.lineTo(this.me.x, this.me.y, target, range) && this.escape(this.me.x, this.me.y))
      this.waitStill();
    else {
      const p = this.path(goal);
      if (!p) throw new Error(`no firing position for ${target.x},${target.y} (tick ${this.state.tick})`);
      const last = p[p.length - 1]!;
      this.walkTo(last.x, last.y);
    }
    this.layAndLeave();
  }

  /** An escape route: a tile outside the cross of a bomb laid on (px, py), reachable in time. */
  private escape(px: number, py: number): TilePos | null {
    const blast = this.blastFrom(px, py);
    const danger = this.dangerSet();
    const belts = this.beltTiles();
    const seen = new Set<string>([key(px, py)]);
    let frontier: TilePos[] = [{ x: px, y: py }];
    for (let step = 1; step <= 14; step++) {
      const next: TilePos[] = [];
      for (const t of frontier) {
        for (const dir of DIRS) {
          const v = DIR_VEC[dir];
          const x = t.x + v.dx;
          const y = t.y + v.dy;
          if (seen.has(key(x, y)) || !this.walkable(x, y, danger, belts)) continue;
          if (!blast.has(key(x, y))) return { x, y };
          seen.add(key(x, y));
          next.push({ x, y });
        }
      }
      frontier = next;
    }
    return null;
  }

  private layAndLeave(): void {
    const before = this.state.generators.length;
    this.waitStill();
    this.step({ place: true });
    if (this.state.generators.length === before) throw new Error('the generator was not placed');
    const gen = this.state.generators[this.state.generators.length - 1]!;
    const blast = this.blastFrom(gen.x, gen.y);
    this.ignoreGen = gen.id;
    const out = this.path((x, y) => !blast.has(key(x, y)));
    if (!out) throw new Error('no way out of the blast');
    const goal = out[out.length - 1]!;
    this.walkTo(goal.x, goal.y);
    this.ignoreGen = null;
    // wait for the fuse, the explosion and the flames to be over
    for (let i = 0; i < 600 && (this.state.generators.length > 0 || this.state.flames.length > 0); i++) {
      if (this.state.match.phase === 'ended') return;
      this.step();
    }
    this.idle(4);
  }

  /**
   * Destroys the soft tile at `target` (cargo with hit points takes as many bombs as it needs): bombs it directly when a
   * line exists, otherwise first the nearest crate that stands in the way.
   */
  destroy(target: TilePos, max = 12): void {
    const s = this.state;
    const solid = (): boolean => s.tiles[target.y * s.width + target.x] === Tile.Soft;
    for (let n = 0; solid(); n++) {
      if (n >= max) throw new Error(`could not destroy ${target.x},${target.y} in ${max} bombs`);
      this.fireAt(this.reachableAim(target, 0));
    }
  }

  /** The tile to aim the next bomb at: the target when a line to it exists, else the nearest blocking crate. */
  private reachableAim(target: TilePos, depth: number): TilePos {
    const range = this.me.range;
    const belts = this.beltTiles();
    const direct = this.path(
      (x, y) =>
        this.lineTo(x, y, target, range) &&
        (this.opts.belts || !belts.has(key(x, y))) &&
        this.escape(x, y) !== null,
    );
    if (direct || this.lineTo(this.me.x, this.me.y, target, range)) return target;
    if (depth > 6) throw new Error(`no way to aim at ${target.x},${target.y}`);
    // the first solid tile on each of the four lines out from the target, nearest to the target first
    const blockers: TilePos[] = [];
    for (const dir of DIRS) {
      const v = DIR_VEC[dir];
      for (let i = 1; i <= range + 1; i++) {
        const x = target.x + v.dx * i;
        const y = target.y + v.dy * i;
        const t = this.state.tiles[y * this.state.width + x];
        if (t === undefined || t === Tile.Hard) break;
        if (t === Tile.Soft) {
          blockers.push({ x, y });
          break;
        }
      }
    }
    for (const b of blockers) {
      try {
        return this.reachableAim(b, depth + 1);
      } catch {
        // try the next one
      }
    }
    throw new Error(`no way to aim at ${target.x},${target.y}`);
  }

  /** Bombs the enemy seat `id` until it is down (enemies stand still in these scripts). */
  kill(id: number, max = 10): void {
    const e = this.state.players[id]!;
    for (let n = 0; e.alive; n++) {
      if (n >= max) throw new Error(`seat ${id} still alive after ${max} bombs`);
      this.fireAt(this.reachableAim({ x: e.x, y: e.y }, 0));
    }
  }
}

// ---------------------------------------------------------------- scenario setup (state edits for the unit tests)

/** Lays a generator that explodes on the next tick (any owner, any range) and runs that tick; returns its events. */
export function explodeAt(state: GameState, x: number, y: number, ownerId = 0, range = 2): SimEvent[] {
  addGenerator(state, { ownerId, x, y, range, triggered: true });
  return tick(state, {});
}

/** Takes an enemy seat out of the fight (the wave logic only looks at `alive`). */
export function knockOut(state: GameState, ...ids: number[]): void {
  for (const id of ids) {
    const p = state.players[id]!;
    p.alive = false;
    p.eliminatedTick = state.tick;
  }
}

/** The seat ids of every enemy in a wave (index into `RaidDef.waves`). */
export function waveSeats(state: GameState, wave: number): number[] {
  return state.raid!.waves[wave]!.seatIds;
}

/** Plays through the spawn warning of every wave that has started, so its enemies stand on their spots. */
export function letWavesAppear(state: GameState, sink: SimEvent[] = []): void {
  advance(state, RAID_TUNING.spawnWarnTicks + 3, {}, sink);
}
