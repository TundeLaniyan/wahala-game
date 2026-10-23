/**
 * Per-think snapshot of what the bot may see: walkability, pickups, rivals and timing helpers.
 * Arrays are reused between refreshes (the arena size is fixed for a match).
 */
import { DIRS, Tile, manholePartners } from '../sim';
import type { Dir, Observation, Pickup, Player } from '../sim';
import { getBoard } from './board';
import type { AiProfile } from './profiles';
import type { Board } from './board';
import { NEAR_MAX, NEAR_RADIUS, isLargeBoard } from './scale';

/** Ticks a player needs per tile (mirrors the sim's rule: skates, Okada, slow curse). */
export function stepTicksOf(obs: Observation, p: Readonly<Player>): number {
  const m = obs.config.movement;
  const levels = m.stepTicksBySpeedLevel;
  let t = levels[Math.min(p.speedLevel, levels.length - 1)]!;
  if (p.mounted) t -= m.okadaStepBonus;
  if (p.curse?.kind === 'slow' && obs.tick < p.curse.until) t += m.slowCurseExtraTicks;
  return Math.max(m.minStepTicks, t);
}

/** First tick at which a player's next step could begin (the intent is applied on tick + 1 at the earliest). */
export function readyTick(obs: Observation, p: Readonly<Player>): number {
  return Math.max(obs.tick + Math.max(p.stepRemaining, 1), p.dazedUntil);
}

export class World {
  obs!: Observation;
  board!: Board;
  me!: Readonly<Player>;
  rivals: Readonly<Player>[] = [];
  /**
   * Rivals worth an expensive simulation. Standard boards: every rival (same array as `rivals`).
   * Large boards: the nearest few inside NEAR_RADIUS, nearest first (see scale.ts).
   */
  near: Readonly<Player>[] = [];
  /** Large-board limits apply (City Rumble). */
  large = false;
  /** 1 = concrete, soft block or a generator on the ground. */
  blocked = new Uint8Array(0);
  /** `blocked` plus the tiles this bot prefers never to step on (floor hazards, curses). Used for planning. */
  walk = new Uint8Array(0);
  /** 1 = floor hazard tile (pothole / oil). */
  hazard = new Uint8Array(0);
  /** Pickup index per tile or -1. */
  pickupAt = new Int16Array(0);
  /** Index of the generator resting on each tile or -1. */
  genAt = new Int16Array(0);
  /** Number of alive players (not me) per tile. */
  rivalAt = new Uint8Array(0);

  get tick(): number {
    return this.obs.tick;
  }
  get myTile(): number {
    return this.me.y * this.board.width + this.me.x;
  }

  refresh(obs: Observation, profile: AiProfile): void {
    this.obs = obs;
    const board = getBoard(obs.width, obs.height);
    if (board !== this.board) {
      this.board = board;
      this.blocked = new Uint8Array(board.size);
      this.walk = new Uint8Array(board.size);
      this.hazard = new Uint8Array(board.size);
      this.pickupAt = new Int16Array(board.size);
      this.rivalAt = new Uint8Array(board.size);
      this.genAt = new Int16Array(board.size);
    }
    this.me = obs.players[obs.selfId]!;
    this.large = isLargeBoard(board);
    this.rivals.length = 0;
    this.rivalAt.fill(0);
    for (const p of obs.players) {
      if (p.id === obs.selfId || !p.alive) continue;
      this.rivals.push(p);
      this.rivalAt[p.y * board.width + p.x]!++;
    }
    if (this.large) this.pickNear();
    else this.near = this.rivals;
    const { blocked, hazard, pickupAt } = this;
    for (let i = 0; i < board.size; i++) blocked[i] = obs.tiles[i] === Tile.Empty ? 0 : 1;
    this.genAt.fill(-1);
    // Generator Pass: generators do not block this bot's feet (they still explode)
    const pass = this.me.bombPass;
    obs.generators.forEach((g, i) => {
      if (g.carriedBy !== null) return;
      if (!pass) blocked[g.y * board.width + g.x] = 1;
      if (g.flight === null) this.genAt[g.y * board.width + g.x] = i;
    });
    hazard.fill(0);
    for (const k in obs.floorHazards) hazard[Number(k)] = 1;
    // manholes move you somewhere the plan did not expect: treat them like floor traps
    if (obs.stage.enabled) for (const k of manholePartners(obs).keys()) hazard[k] = 1;
    pickupAt.fill(-1);
    obs.pickups.forEach((u: Readonly<Pickup>, i) => {
      pickupAt[u.y * board.width + u.x] = i;
    });
    const walk = this.walk;
    walk.set(blocked);
    if (profile.avoidFloorHazards) for (let i = 0; i < board.size; i++) if (hazard[i] === 1) walk[i] = 1;
    if (!profile.takeCurses) {
      for (const u of obs.pickups) if (u.kind === 'curse') walk[u.y * board.width + u.x] = 1;
    }
  }

  private readonly nearBuf: Readonly<Player>[] = [];

  /** Large boards: the nearest NEAR_MAX rivals within NEAR_RADIUS (ties by id: deterministic). */
  private pickNear(): void {
    const me = this.me;
    const out = this.nearBuf;
    out.length = 0;
    const dist = (p: Readonly<Player>): number => Math.abs(p.x - me.x) + Math.abs(p.y - me.y);
    for (const p of this.rivals) if (dist(p) <= NEAR_RADIUS) out.push(p);
    out.sort((a, b) => dist(a) - dist(b) || a.id - b.id);
    if (out.length > NEAR_MAX) out.length = NEAR_MAX;
    this.near = out;
  }

  tileOf(x: number, y: number): number {
    return y * this.board.width + x;
  }
  xOf(tile: number): number {
    return tile % this.board.width;
  }
  yOf(tile: number): number {
    return Math.floor(tile / this.board.width);
  }

  /** Walkable neighbours of a tile ignoring dynamic hazards. */
  exits(tile: number): number {
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const v = this.board.neighbor[tile * 4 + i]!;
      if (v >= 0 && this.blocked[v] === 0) n++;
    }
    return n;
  }

  /** The direction of a curse-adjusted move: with inverted controls the intent must be reversed. */
  steer(dir: Dir): Dir {
    const c = this.me.curse;
    if (c?.kind === 'inverted' && this.obs.tick < c.until) return DIRS[(DIRS.indexOf(dir) + 2) % 4]!;
    return dir;
  }
}
