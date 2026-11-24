/**
 * THE REAR-APPROACH HARNESS (task PI-1C, docs/CLASSIC_RAID_REAR.md): a scripted human plays the REAL raid (the real
 * board, waves, enemy bots and territorial minds at a campaign level) and walks up behind ONE enemy of the first wave
 * to lay a generator at arm's length behind it, then walks out of the cross. Ordinary intents only (move, place).
 * Every alert, investigation, hit and punch of the run is logged with who, when, and the geometry at that moment
 * (the guard's facing before and after the tick, where the human stood relative to it, whether the notice counter was
 * running), so a detection can be traced to its rule instead of guessed.
 *
 * The human has three levels of care (`watch`):
 *   - 'all'    steps only onto a tile no calm enemy on the board can notice him on this tick (the real rule of
 *              `systems/territory.ts`: view cone, close ring, range, walls and bodies);
 *   - 'target' the same, but only for the guard he is stalking (he has not noticed the others);
 *   - 'none'   walks the shortest way regardless (a player who does not watch the guards at all).
 * `waitTicks` makes him stand still for that many ticks after each step (a hesitant phone player).
 */
import { DIRS, DIR_VEC, observe } from '../../src/sim';
import type { CampaignLevel, Dir, GameState, Intents, RaidId } from '../../src/sim';
import { previewBlast } from '../../src/sim/systems/explosions';
import { noticeOf } from '../../src/sim/systems/territory';
import { Tile } from '../../src/sim/types';
import { raidWithBots, step } from './raidAi';
import { RAID_TUNING } from '../../src/sim/raid/tuning';

/**
 * `PI_GRACE=0` replays the production rule (no turn grace: decision PI7 off) so the same harness measures before and
 * after; `PI_GRACE=n` sets it to n ticks on every level.
 */
export function overrideGrace(s: GameState, grace?: number): void {
  const g = grace ?? (process.env.PI_GRACE !== undefined ? Number(process.env.PI_GRACE) : undefined);
  const raid = s.config.campaignTactics?.classicRaid;
  if (g !== undefined && raid) raid.revealGraceTicks = g;
}

export type Watch = 'all' | 'target' | 'none';

export interface StalkOptions {
  raidId: RaidId;
  level: CampaignLevel;
  seed: number;
  /** Seat id of the enemy to stalk. */
  target: number;
  watch: Watch;
  /** Ticks of standing still after each step. */
  waitTicks?: number;
  /** Ticks of the (calm) raid played before the human starts walking (varies the moment of the approach). */
  warmup?: number;
  /** Give up the approach after this many ticks (default 2400 = 40 s). */
  approachTicks?: number;
  /**
   * A reactive human: once a calm enemy could notice him where he stands for this many ticks in a row (he sees it face
   * him; default 18 = the fair-fight player's reaction, 0.3 s) he steps out of its view. 0 = never reacts.
   */
  reactTicks?: number;
  /** Debug: called after every tick with the phase. */
  onTick?: (s: GameState, phase: string, t: number) => void;
  /** Lay the generator only when the target is NOT turning soon: ticks since its last facing change at least this. */
  settleTicks?: number;
}

export interface Detection {
  tick: number;
  phase: 'approach' | 'plant' | 'retreat';
  /** Seat id and kind of the enemy that engaged. */
  by: number;
  byKind: string;
  /** Is it the stalked enemy? */
  isTarget: boolean;
  /** `sight` (notice counter filled), `close` (arm's length), `hit`, `ally` (another's call), `noise`, `other`. */
  cause: string;
  facingBefore: string;
  facingAfter: string;
  /** The human relative to that enemy's facing BEFORE the tick: forward / sideways tiles (negative forward = behind). */
  forward: number;
  lateral: number;
  manhattan: number;
  mindBefore: string;
  noticeBefore: number;
  /** Ticks since the enemy last changed its facing (before the tick). */
  sinceTurn: number;
}

export interface StalkResult {
  /** The human got to lay the generator behind the target. */
  planted: boolean;
  /** Tick (since the human started) of the plant, -1 when none. */
  plantedAt: number;
  /** The first detection of the run, if any. */
  first: Detection | null;
  /** Every engagement of every enemy during the run. */
  detections: Detection[];
  /** Investigations (noise) logged. */
  investigations: { tick: number; by: number; phase: string }[];
  targetKilled: boolean;
  humanHpLost: number;
  /** Ticks during which some calm enemy's notice counter ran (sight of the human, short of an alert). */
  exposureTicks: number;
  /** The stalk ended because it never found a safe step / a window (not a detection). */
  timedOut: boolean;
  /** Did the target see the generator (a reaction cue / mind change after the plant, before it died)? */
  targetMovedAfterPlant: boolean;
  ticks: number;
  /** The target was reachable at all. */
  reachable: boolean;
  /** Lives lost or the human died. */
  humanDied: boolean;
}

export const idx = (s: GameState, x: number, y: number): number => y * s.width + x;

/** Tiles the human may walk through now: open floor, no living body (his own aside), no generator. */
export function walkable(s: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return false;
  if (s.tiles[idx(s, x, y)] !== Tile.Empty) return false;
  for (const p of s.players) if (p.alive && p.id !== 0 && p.x === x && p.y === y) return false;
  for (const g of s.generators) if (g.x === x && g.y === y) return false;
  return true;
}

/** Breadth-first walk from (sx, sy): the first step direction to the nearest goal tile, or null. */
export function bfs(
  s: GameState,
  sx: number,
  sy: number,
  goal: (x: number, y: number) => boolean,
  ok: (x: number, y: number) => boolean,
): { first: Dir | null; dist: number; x: number; y: number } | null {
  if (goal(sx, sy)) return { first: null, dist: 0, x: sx, y: sy };
  const seen = new Map<number, { from: number; dir: Dir }>();
  const start = idx(s, sx, sy);
  seen.set(start, { from: -1, dir: 'up' });
  let frontier = [start];
  for (let d = 1; frontier.length > 0 && d < 60; d++) {
    const next: number[] = [];
    for (const u of frontier) {
      const ux = u % s.width;
      const uy = Math.floor(u / s.width);
      for (const dir of DIRS) {
        const x = ux + DIR_VEC[dir].dx;
        const y = uy + DIR_VEC[dir].dy;
        const v = idx(s, x, y);
        if (!walkable(s, x, y) || seen.has(v) || !ok(x, y)) continue;
        seen.set(v, { from: u, dir });
        if (goal(x, y)) {
          let cur = v;
          let first = dir;
          while (seen.get(cur)!.from !== start) {
            cur = seen.get(cur)!.from;
            first = seen.get(cur)!.dir;
          }
          return { first, dist: d, x, y };
        }
        next.push(v);
      }
    }
    frontier = next;
  }
  return null;
}

/** Would enemy `id` notice the human if he stood on (x, y) at the next tick? The territory's own rule (`noticeOf`). */
export function noticedAt(s: GameState, id: number, x: number, y: number): boolean {
  const m = s.territory?.minds[id];
  const e = s.players[id]!;
  if (!m || !e.alive) return false;
  const ghost = { ...s.players[0]!, x, y };
  const r = noticeOf(s, m, e, ghost, s.tick + 1);
  return r.sees || r.close;
}

export function stalk(o: StalkOptions): StalkResult {
  const { s, bots } = raidWithBots(o.raidId, o.level, o.seed);
  overrideGrace(s);
  const warm = RAID_TUNING.spawnWarnTicks + 3 + (o.warmup ?? 240);
  for (let t = 0; t < warm; t++) step(s, bots);
  const h = s.players[0]!;
  const T = s.players[o.target]!;
  const hp0 = h.vitals?.hp ?? 0;
  const lives0 = s.raid?.livesUsed ?? 0;
  const detections: Detection[] = [];
  const investigations: StalkResult['investigations'] = [];
  const lastTurn = new Map<number, { facing: string; tick: number }>();
  let phase: 'approach' | 'plant' | 'retreat' = 'approach';
  let planted = false;
  let plantedAt = -1;
  let plantGen: ReturnType<typeof previewBlast> | null = null;
  let exposure = 0;
  let exposedFor = 0;
  let wait = 0;
  let timedOut = false;
  let reachable = true;
  let targetMovedAfterPlant = false;
  let plantPos = { x: -1, y: -1 };
  const t0 = s.tick;
  const limit = o.approachTicks ?? 2400;
  for (let t = 0; t < limit + 600; t++) {
    // ---- the human decides
    let intent: Intents[number] = {};
    const safe = (x: number, y: number): boolean => {
      if (o.watch === 'none') return true;
      for (const [key, m] of Object.entries(s.territory!.minds)) {
        const id = Number(key);
        if (!s.players[id]!.alive) continue;
        if (o.watch === 'target' && id !== o.target) continue;
        if (m && noticedAt(s, id, x, y)) return false;
      }
      return true;
    };
    // exposed where he stands: how long he has been watched without an alert (he reacts after `reactTicks`)
    let here = false;
    for (const key of Object.keys(s.territory!.minds)) {
      const id = Number(key);
      if (s.players[id]!.alive && noticedAt(s, id, h.x, h.y)) here = true;
    }
    exposedFor = here ? exposedFor + 1 : 0;
    const reactAt = o.reactTicks ?? 18;
    if (
      reactAt > 0 &&
      exposedFor >= reactAt &&
      phase === 'approach' &&
      h.stepRemaining === 0 &&
      o.watch !== 'none'
    ) {
      const out = bfs(
        s,
        h.x,
        h.y,
        (x, y) => safe(x, y),
        (x, y) => walkable(s, x, y),
      );
      if (out?.first) {
        intent = { move: out.first };
        exposedFor = 0;
      }
    } else if (T.alive && phase === 'approach' && t < limit && h.stepRemaining === 0) {
      const v = DIR_VEC[T.facing];
      const rel = (h.x - T.x) * v.dx + (h.y - T.y) * v.dy;
      const adjacent = Math.abs(h.x - T.x) + Math.abs(h.y - T.y) === 1;
      const still = T.stepRemaining === 0;
      const settled = s.tick - (lastTurn.get(o.target)?.tick ?? 0) >= (o.settleTicks ?? 0);
      if (adjacent && rel < 0 && still && settled) {
        intent = { place: true };
        phase = 'plant';
      } else if (wait > 0) {
        wait--;
      } else {
        const bx = T.x - v.dx;
        const by = T.y - v.dy;
        const path = bfs(
          s,
          h.x,
          h.y,
          (x, y) => x === bx && y === by,
          (x, y) => (x === bx && y === by ? true : safe(x, y)),
        );
        if (path === null) {
          // unreachable, or only through tiles he can be noticed on: stand still unless NOTHING walks there at all
          const any = bfs(
            s,
            h.x,
            h.y,
            (x, y) => x === bx && y === by,
            () => true,
          );
          if (any === null && t === 0) reachable = false;
        } else if (path.first !== null) {
          intent = { move: path.first };
          wait = o.waitTicks ?? 0;
        }
      }
    } else if (phase === 'plant') {
      // the plant intent was sent last tick: the generator is on his tile now; find the way out of the cross
      const g = s.generators.find((q) => q.ownerId === 0);
      if (g) {
        planted = true;
        plantedAt = s.tick - t0;
        plantGen = previewBlast(s, g);
        plantPos = { x: g.x, y: g.y };
        phase = 'retreat';
      } else {
        phase = 'approach'; // the place was refused (capacity, tile): try again
      }
    }
    if (phase === 'retreat' && plantGen && h.stepRemaining === 0) {
      const inCross = (x: number, y: number): boolean => plantGen!.has(idx(s, x, y));
      const out =
        bfs(
          s,
          h.x,
          h.y,
          (x, y) => !inCross(x, y) && safe(x, y),
          (x, y) => walkable(s, x, y),
        ) ??
        bfs(
          s,
          h.x,
          h.y,
          (x, y) => !inCross(x, y),
          (x, y) => walkable(s, x, y),
        );
      if (out?.first) intent = { move: out.first };
    }
    // ---- snapshot before the tick
    const before = new Map<number, { facing: string; x: number; y: number; state: string; notice: number }>();
    for (const [key, m] of Object.entries(s.territory!.minds)) {
      const e = s.players[Number(key)]!;
      before.set(Number(key), { facing: e.facing, x: e.x, y: e.y, state: m.state, notice: m.notice });
      const lt = lastTurn.get(Number(key));
      if (!lt || lt.facing !== e.facing) lastTurn.set(Number(key), { facing: e.facing, tick: s.tick });
    }
    const hpBefore = h.vitals?.hp ?? 0;
    const evs = stepEvents(s, bots, intent);
    o.onTick?.(s, phase, t);
    // ---- what changed
    const alertCues = evs.filter((e) => e.type === 'enemyCue' && e.cue === 'alert');
    for (const [key, m] of Object.entries(s.territory!.minds)) {
      const id = Number(key);
      const e = s.players[id]!;
      const b = before.get(id);
      if (!b) continue;
      if ((m.notice > b.notice || m.notice > 0) && b.state !== 'alert' && b.state !== 'pursue') exposure++;
      if (
        m.state !== b.state &&
        (m.state === 'alert' || m.state === 'pursue') &&
        b.state !== 'alert' &&
        b.state !== 'pursue'
      ) {
        const cue = alertCues.find((c) => c.type === 'enemyCue' && c.playerId === id);
        // geometry as the territory saw it this tick: the positions AFTER movement, the facing it walked (else its
        // facing before the tick; a sweep turn in the same tick as the alert cannot be told from the alert's own turn)
        const moved = e.x !== b.x || e.y !== b.y;
        const used: Dir = moved ? dirOf(e.x - b.x, e.y - b.y) : (b.facing as Dir);
        const v = DIR_VEC[used];
        const fwd = (h.x - e.x) * v.dx + (h.y - e.y) * v.dy;
        const lat = Math.abs((h.x - e.x) * v.dy - (h.y - e.y) * v.dx);
        const dist = Math.abs(h.x - e.x) + Math.abs(h.y - e.y);
        const needed = m.spec.noticeTicks;
        const keen = b.state === 'investigate' ? 3 : 1;
        const hit = (h.vitals?.hp ?? 0) < hpBefore;
        let cause = 'other';
        if (cue && cue.type === 'enemyCue' && cue.byId !== null) cause = 'ally';
        else if (b.notice + keen >= needed) cause = 'sight';
        else if (hit) cause = 'hit';
        else if (dist <= s.config.campaignTactics!.awareness.closeTiles) cause = 'close';
        detections.push({
          tick: s.tick - t0,
          phase,
          by: id,
          byKind: e.enemyKind ?? '?',
          isTarget: id === o.target,
          cause,
          facingBefore: moved ? `${b.facing}>walk ${used}` : b.facing,
          facingAfter: e.facing,
          forward: fwd,
          lateral: lat,
          manhattan: dist,
          mindBefore: b.state,
          noticeBefore: b.notice,
          sinceTurn: s.tick - (lastTurn.get(id)?.tick ?? s.tick),
        });
      }
      if (m.state === 'investigate' && b.state !== 'investigate')
        investigations.push({ tick: s.tick - t0, by: id, phase });
    }
    if (planted && T.alive && (T.x !== plantPos.x || T.y !== plantPos.y) && T.stepRemaining > 0)
      targetMovedAfterPlant = true;
    // the human walked out and the cross has gone: done
    if (planted && s.generators.every((g) => g.ownerId !== 0) && s.flames.length === 0) break;
    if (detections.length > 0 && !planted) break; // a detection before the plant ends the attempt
    if (t >= limit && phase === 'approach') {
      timedOut = true;
      break;
    }
    if (!h.alive || s.match.phase === 'ended') break;
  }
  const first = detections[0] ?? null;
  const lives = s.raid?.livesUsed ?? 0;
  return {
    planted,
    plantedAt,
    first,
    detections,
    investigations,
    targetKilled: !T.alive,
    humanHpLost: Math.max(0, hp0 - (h.vitals?.hp ?? 0)),
    exposureTicks: exposure,
    timedOut,
    targetMovedAfterPlant,
    ticks: s.tick - t0,
    reachable,
    humanDied: !h.alive || lives > lives0,
  };
}

import { tick } from '../../src/sim';
import type { SimEvent } from '../../src/sim';
/** `step` that also returns the tick's events (the enemy bots decide, the human does `human`). */
export function stepEvents(
  s: GameState,
  bots: ReturnType<typeof raidWithBots>['bots'],
  human: Intents[number],
): SimEvent[] {
  const intents: Intents = { 0: human };
  for (const [id, bot] of bots) if (s.players[id]!.alive) intents[id] = bot.decide(observe(s, id));
  return tick(s, intents);
}

export const dirOf = (dx: number, dy: number): Dir =>
  Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';

export interface DwellResult {
  /** The rear tile was open floor and nobody could notice a human on it at the start. */
  eligible: boolean;
  /** Was the guard walking (a step under way) when the human appeared behind it? */
  walking: boolean;
  /** The guard's mind state at the start. */
  mind: string;
  /** First engagement (an alert / pursue) within the dwell, with the geometry at that tick. */
  first: Detection | null;
  /** Did the stalked guard die to the generator laid behind it? */
  killed: boolean;
  /** Ticks (from the start) until the first engagement, -1 when none. */
  at: number;
}

/**
 * DWELL PROBE: the human appears on the tile directly behind guard `target` at tick `t0` of the real raid (only when no
 * enemy could notice him there at that moment), lays a generator there and stands still for `dwell` ticks. Measures
 * what the rules do to someone who has got to a guard's blind spot, independent of how he got there.
 */
export function dwellProbe(o: {
  raidId: RaidId;
  level: CampaignLevel;
  seed: number;
  target: number;
  t0: number;
  dwell: number;
  /** Leave (walk out of the cross) after this many ticks instead of standing still (-1 = stand). */
  leaveAfter?: number;
  /**
   * A watchful human: he leaves once some enemy could notice him where he stands (it has turned to face him) for this
   * many ticks in a row (his reaction; 18 = 0.3 s), whichever of this and `leaveAfter` comes first.
   */
  reactTicks?: number;
  /** Replace the level's `revealGraceTicks` (0 = the production rule before decision PI7). */
  grace?: number;
  /** Debug: every tick's events (tick since the start, state). */
  onEvents?: (s: GameState, evs: SimEvent[], t: number) => void;
}): DwellResult {
  const { s, bots } = raidWithBots(o.raidId, o.level, o.seed);
  overrideGrace(s, o.grace);
  const warm = RAID_TUNING.spawnWarnTicks + 3 + o.t0;
  for (let t = 0; t < warm; t++) step(s, bots);
  const h = s.players[0]!;
  const E = s.players[o.target]!;
  const none: DwellResult = {
    eligible: false,
    walking: false,
    mind: '-',
    first: null,
    killed: false,
    at: -1,
  };
  const m = s.territory?.minds[o.target];
  if (!E.alive || !m || m.state === 'alert' || m.state === 'pursue') return none;
  const v = DIR_VEC[E.facing];
  const rx = E.x - v.dx;
  const ry = E.y - v.dy;
  if (!walkable(s, rx, ry)) return none;
  for (const key of Object.keys(s.territory!.minds)) if (noticedAt(s, Number(key), rx, ry)) return none;
  h.x = h.stepFromX = rx;
  h.y = h.stepFromY = ry;
  h.stepRemaining = 0;
  const walking = E.stepRemaining > 0;
  const mind = m.state;
  let first: Detection | null = null;
  let at = -1;
  let leaving: ReturnType<typeof previewBlast> | null = null;
  let exposed = 0;
  const t0 = s.tick;
  for (let t = 0; t < o.dwell; t++) {
    let intent: Intents[number] = {};
    if (t === 0) intent = { place: true };
    const watched = Object.keys(s.territory!.minds).some((k) => noticedAt(s, Number(k), h.x, h.y));
    exposed = watched ? exposed + 1 : 0;
    const timeUp = o.leaveAfter !== undefined && o.leaveAfter >= 0 && t >= o.leaveAfter;
    const startled = o.reactTicks !== undefined && o.reactTicks >= 0 && exposed >= o.reactTicks;
    if ((timeUp || startled || leaving) && h.stepRemaining === 0) {
      const g = s.generators.find((q) => q.ownerId === 0);
      if (g) leaving ??= previewBlast(s, g);
      if (leaving) {
        const unseen = (x: number, y: number): boolean =>
          Object.keys(s.territory!.minds).every((k) => !noticedAt(s, Number(k), x, y));
        const out =
          bfs(
            s,
            h.x,
            h.y,
            (x, y) => !leaving!.has(idx(s, x, y)) && unseen(x, y),
            (x, y) => walkable(s, x, y),
          ) ??
          bfs(
            s,
            h.x,
            h.y,
            (x, y) => !leaving!.has(idx(s, x, y)),
            (x, y) => walkable(s, x, y),
          );
        if (out?.first) intent = { move: out.first };
      }
    }
    const before = new Map<number, { facing: string; x: number; y: number; state: string; notice: number }>();
    for (const [key, mm] of Object.entries(s.territory!.minds)) {
      const e = s.players[Number(key)]!;
      before.set(Number(key), { facing: e.facing, x: e.x, y: e.y, state: mm.state, notice: mm.notice });
    }
    const hpBefore = h.vitals?.hp ?? 0;
    const evs = stepEvents(s, bots, intent);
    o.onEvents?.(s, evs, t);
    for (const [key, mm] of Object.entries(s.territory!.minds)) {
      const id = Number(key);
      const e = s.players[id]!;
      const b = before.get(id);
      if (!b || first) continue;
      if (mm.state === b.state || (mm.state !== 'alert' && mm.state !== 'pursue')) continue;
      if (b.state === 'alert' || b.state === 'pursue') continue;
      const cue = evs.find((c) => c.type === 'enemyCue' && c.cue === 'alert' && c.playerId === id);
      const moved = e.x !== b.x || e.y !== b.y;
      const used: Dir = moved ? dirOf(e.x - b.x, e.y - b.y) : (b.facing as Dir);
      const vv = DIR_VEC[used];
      const dist = Math.abs(h.x - e.x) + Math.abs(h.y - e.y);
      let cause = 'other';
      if (cue && cue.type === 'enemyCue' && cue.byId !== null) cause = 'ally';
      else if (b.notice + (b.state === 'investigate' ? 3 : 1) >= mm.spec.noticeTicks) cause = 'sight';
      else if ((h.vitals?.hp ?? 0) < hpBefore) cause = 'hit';
      else if (dist <= s.config.campaignTactics!.awareness.closeTiles) cause = 'close';
      at = s.tick - t0;
      first = {
        tick: at,
        phase: 'plant',
        by: id,
        byKind: e.enemyKind ?? '?',
        isTarget: id === o.target,
        cause,
        facingBefore: moved ? `${b.facing}>walk ${used}` : b.facing,
        facingAfter: e.facing,
        forward: (h.x - e.x) * vv.dx + (h.y - e.y) * vv.dy,
        lateral: Math.abs((h.x - e.x) * vv.dy - (h.y - e.y) * vv.dx),
        manhattan: dist,
        mindBefore: b.state,
        noticeBefore: b.notice,
        sinceTurn: -1,
      };
    }
    if (!h.alive) break;
  }
  return { eligible: true, walking, mind, first, killed: !E.alive, at };
}
