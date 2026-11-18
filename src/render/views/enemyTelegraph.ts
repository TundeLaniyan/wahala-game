/**
 * What an enemy's telegraph shows this frame (docs/CAMPAIGN_SECTOR_AI.md, "Enemy telegraphs and looks", decisions
 * SV1-SV3). Pure: it reads the simulation state only (the pending attack and its resolve tick, the cueing projectile,
 * `rootedUntil`, `dazedUntil`) and decides nothing. `EnemyTelegraphViews` draws it.
 *
 *   melee    a punch in its wind-up (`Player.attack`): `progress` runs 0 -> 1 as the blow comes; `aim` holds the tile
 *            it is aimed at (and the reach-2 tile of a long attack), `zone` the other tiles the blow can still find
 *            when it resolves (the sim re-picks any rival in reach then: skills.ts `pickTarget`);
 *   ranged   a thrown object in its cue (`state.projectiles`, before `launchTick + warnTicks`): `aim` is the path;
 *   open     planted after its swing or throw (the counter window, `rootedUntil`): `progress` runs 1 -> 0 as it closes;
 *   stagger  reeling from the human's punch (`dazedUntil`): it cannot act.
 *
 * The wind-up length is never hard-coded: it is the time from the press (`attackStarted`, or when the view first saw
 * the wind-up) to the live `attack.resolveTick`, so a longer or shorter wind-up from the AI tuning reads the same.
 */
import { DIRS, DIR_VEC, Tile, enemyAttackPhase, tileAt, windupTicks } from '../../sim';
import type { Dir, EnemyKind, GameState, Player } from '../../sim';

export type TelegraphKind = 'melee' | 'ranged' | 'open' | 'stagger';

export interface TilePoint {
  x: number;
  y: number;
}

/** A reusable record (the view keeps one per frame and refills it: no allocation per frame once warm). */
export interface Telegraph {
  kind: TelegraphKind | null;
  /** Wind-ups: 0 at the press -> 1 when the blow lands / the object leaves. Open / stagger: share of the window left. */
  progress: number;
  /** The attack's direction (melee / ranged), else null. */
  dir: Dir | null;
  /** Tiles the attack is aimed at: the faced tile (+ the reach-2 tile) of a punch, the whole path of a throw. */
  aim: TilePoint[];
  aimCount: number;
  /** Other tiles a punch can still reach when it resolves (shown faintly). */
  zone: TilePoint[];
  zoneCount: number;
  /** A heavy hitter (heavy / lieutenant / boss punch, a strong projectile): drawn larger. */
  strong: boolean;
}

export function emptyTelegraph(): Telegraph {
  return { kind: null, progress: 0, dir: null, aim: [], aimCount: 0, zone: [], zoneCount: 0, strong: false };
}

const STRONG_KINDS = new Set(['heavy', 'lieutenant', 'boss']);

function pushTile(list: TilePoint[], n: number, x: number, y: number): number {
  const slot = list[n];
  if (slot) {
    slot.x = x;
    slot.y = y;
  } else list.push({ x, y });
  return n + 1;
}

const walkable = (state: GameState, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < state.width && y < state.height && tileAt(state, x, y) === Tile.Empty;

/**
 * The kind a seat's telegraph reads as: a campaign enemy's own kind, or - in a boss mission - the perception kind of a
 * generator-bot seat (the boss and his crew have no `enemyKind`, decision BX8), so their punches show the same wind-up.
 * Null for the human and for every seat of any other match.
 */
export function telegraphKindOf(state: GameState, p: Readonly<Player>): EnemyKind | null {
  if (p.enemyKind !== undefined) return p.enemyKind;
  const m = state.mission;
  if (!m || m.field) return null;
  return state.config.campaignTactics?.seatPerception?.[p.id] ?? null;
}

/** Fraction 0..1 of a span [start, end] reached at `now` (a zero span counts as complete). */
export function spanProgress(start: number, end: number, now: number): number {
  const total = end - start;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (now - start) / total));
}

/**
 * Fills `out` with the telegraph of enemy `p` at render time `now` (= tick + alpha). `windStart` is when its current
 * wind-up began (the `attackStarted` tick), `openStart` when its current counter window began; either may be undefined
 * (the view joined late), and then the kind's catalogue wind-up / the window seen so far stands in.
 */
export function readTelegraph(
  state: GameState,
  p: Readonly<Player>,
  now: number,
  out: Telegraph,
  windStart?: number,
  openStart?: number,
): Telegraph {
  out.kind = null;
  out.progress = 0;
  out.dir = null;
  out.aimCount = 0;
  out.zoneCount = 0;
  out.strong = false;
  const kind = telegraphKindOf(state, p);
  if (!p.alive || kind === null) return out;
  const tick = state.tick;

  if (p.attack) {
    const a = p.attack;
    // an enemy's wind-up is its kind's; a boss-mission generator bot's is its own attack's startup
    const windup =
      p.enemyKind !== undefined
        ? windupTicks(state.config, p.enemyKind)
        : (state.config.skills.attacks[a.skill]?.startupTicks ?? 1);
    const start = windStart ?? a.resolveTick - Math.max(1, windup);
    out.kind = 'melee';
    out.progress = spanProgress(Math.min(start, a.resolveTick - 1), a.resolveTick, now);
    out.dir = a.dir;
    out.strong = STRONG_KINDS.has(kind);
    const v = DIR_VEC[a.dir];
    out.aimCount = pushTile(out.aim, out.aimCount, p.x + v.dx, p.y + v.dy);
    const reach = state.config.skills.attacks[a.skill]?.reach ?? 1;
    if (
      reach >= 2 &&
      walkable(state, p.x + v.dx, p.y + v.dy) &&
      walkable(state, p.x + 2 * v.dx, p.y + 2 * v.dy)
    )
      out.aimCount = pushTile(out.aim, out.aimCount, p.x + 2 * v.dx, p.y + 2 * v.dy);
    for (const d of DIRS) {
      if (d === a.dir) continue;
      const w = DIR_VEC[d];
      if (walkable(state, p.x + w.dx, p.y + w.dy))
        out.zoneCount = pushTile(out.zone, out.zoneCount, p.x + w.dx, p.y + w.dy);
    }
    return out;
  }

  // a throw in its cue: the projectile exists from the press, and waits `warnTicks` before it moves
  for (const pr of state.projectiles ?? []) {
    if (pr.ownerId !== p.id) continue;
    const end = pr.launchTick + (pr.warnTicks ?? 0);
    if (tick >= end) continue;
    out.kind = 'ranged';
    out.progress = spanProgress(pr.launchTick, end, now);
    out.strong = pr.strong;
    out.dir = pr.dir ?? null;
    for (const i of pr.path) {
      const x = i % state.width;
      const y = Math.floor(i / state.width);
      if (!walkable(state, x, y)) break; // the wall it smashes on is not a tile to step off
      out.aimCount = pushTile(out.aim, out.aimCount, x, y);
    }
    if (out.dir === null && out.aimCount > 0) out.dir = dirTowards(p, out.aim[0]!);
    return out;
  }

  if (tick < p.dazedUntil) {
    out.kind = 'stagger';
    out.progress = 1;
    return out;
  }
  const phase = enemyAttackPhase(state, p);
  if ((phase === 'attack' || phase === 'recovery') && tick < p.rootedUntil) {
    out.kind = 'open';
    const start = Math.min(openStart ?? tick, p.rootedUntil - 1);
    out.progress = 1 - spanProgress(start, p.rootedUntil, now);
    return out;
  }
  return out;
}

function dirTowards(p: Readonly<Player>, t: TilePoint): Dir | null {
  for (const d of DIRS) {
    const v = DIR_VEC[d];
    if (Math.sign(t.x - p.x) === v.dx && Math.sign(t.y - p.y) === v.dy) return d;
  }
  return null;
}

/**
 * Beat rate (radians per second) of a wind-up mark's pulse: it beats faster as the blow nears, so motion, not only
 * colour, says "soon". The view integrates it per enemy (no phase jump when the rate changes).
 */
export function pulseRate(progress: number): number {
  return 7 + 17 * progress * progress;
}
