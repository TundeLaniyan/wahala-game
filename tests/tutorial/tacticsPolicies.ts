/**
 * Scripted "humans" for the Generator Tactics lessons: reactive policies over the live state that send ordinary intents
 * only (a move, A, B), so a lesson can be completed by something that plays like a careful person.
 */
import { DIRS, DIR_VEC, Tile, enemyAttackPhase, previewBlast, readyToStep } from '../../src/sim';
import type { Dir, GameState, Intent } from '../../src/sim';

/** Leaving on a wind-up only pays when his planted window (wind-up + recovery) reaches the blast. */
const WINDUP_LEAVE = 100;

export const hero = (s: GameState) => s.players[0]!;
export const foe = (s: GameState) => s.players[1]!;
export const ownGen = (s: GameState) => s.generators.find((g) => g.ownerId === 0 && g.mode === 'timed');
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const adjacent = (s: GameState): boolean => foe(s).alive && dist(hero(s), foe(s)) === 1;

/** The first step of the shortest walk to an open tile outside the blast of `g` (null: already outside / no way). */
export function leaveStep(s: GameState): Dir | null {
  const g = ownGen(s);
  const me = hero(s);
  if (!g) return null;
  const burn = previewBlast(s, g);
  const w = s.width;
  const start = me.y * w + me.x;
  if (!burn.has(start)) return null;
  const first = new Map<number, Dir>();
  const seen = new Set<number>([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!;
    for (const d of DIRS) {
      const x = (u % w) + DIR_VEC[d].dx;
      const y = Math.floor(u / w) + DIR_VEC[d].dy;
      if (x < 0 || y < 0 || x >= w || y >= s.height) continue;
      const v = y * w + x;
      if (seen.has(v) || s.tiles[v] !== Tile.Empty) continue;
      if (s.generators.some((o) => o.x === x && o.y === y && !(x === g.x && y === g.y))) continue;
      if (x === g.x && y === g.y && u !== start) continue;
      seen.add(v);
      first.set(v, u === start ? d : first.get(u)!);
      if (!burn.has(v)) return first.get(v)!;
      queue.push(v);
    }
  }
  return null;
}

/** Walks one step toward the tile (x, y) along open lanes (null: there). */
export function stepTo(s: GameState, x: number, y: number): Dir | null {
  const me = hero(s);
  const w = s.width;
  const start = me.y * w + me.x;
  const goal = y * w + x;
  if (start === goal) return null;
  const first = new Map<number, Dir>();
  const seen = new Set<number>([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!;
    for (const d of DIRS) {
      const nx = (u % w) + DIR_VEC[d].dx;
      const ny = Math.floor(u / w) + DIR_VEC[d].dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= s.height) continue;
      const v = ny * w + nx;
      if (seen.has(v) || s.tiles[v] !== Tile.Empty) continue;
      seen.add(v);
      first.set(v, u === start ? d : first.get(u)!);
      if (v === goal) return first.get(v)!;
      queue.push(v);
    }
  }
  return null;
}

/**
 * Agbero lesson (`task` = the active practice task): bait the swing by stepping back, lay beside him, punch twice,
 * step off when he swings again (or the fuse is low).
 */
export function agberoHuman(task: () => number): (s: GameState) => Intent {
  let punches = 0;
  let nextPunch = 0;
  return (s) => {
    const me = hero(s);
    const e = foe(s);
    const ready = readyToStep(me);
    if (!e.alive) return {};
    if (task() === 0) {
      return e.attack && e.attack.targetId === 0 && ready && me.x === 6 ? { move: 'left' } : {};
    }
    const g = ownGen(s);
    if (!g) {
      if (ready && !adjacent(s)) {
        const d = stepTo(s, e.x, e.y);
        return d ? { move: d } : {};
      }
      return adjacent(s) && ready ? { place: true } : {};
    }
    if ((enemyAttackPhase(s, e) === 'windup' && g.timer <= WINDUP_LEAVE) || g.timer <= 36) {
      const d = leaveStep(s);
      return d && ready ? { move: d } : {};
    }
    if (adjacent(s) && punches < 2 && s.tick >= me.skillReadyTick && s.tick >= nextPunch) {
      punches++;
      nextPunch = s.tick + 74;
      return { special: true };
    }
    return {};
  };
}

/** Thrower lesson: step up, back in when the bottle has gone by, lay, leave. */
export function throwerHuman(): (s: GameState) => Intent {
  let stage = 0;
  return (s) => {
    const me = hero(s);
    const ready = readyToStep(me);
    if (stage === 0) {
      if (s.tick < 2) return {};
      if (ready) {
        stage = 1;
        return { move: 'up' };
      }
      return {};
    }
    if (stage === 1) {
      const past = (s.projectiles ?? []).every((p) => (p.path[p.index] ?? 0) % s.width < 12);
      if (past && ready) {
        stage = 2;
        return { move: 'down' };
      }
      return {};
    }
    if (stage === 2) {
      if (ready && me.y === 10) {
        stage = 3;
        return { place: true };
      }
      return {};
    }
    const d = leaveStep(s);
    return d && ready ? { move: d } : {};
  };
}

/**
 * Hidden-generator lesson. `task` says which practice task is active (0: in plain sight, 1: hidden): in plain sight he
 * lays beside the guard and leaves at once; hidden, he lays under his feet and stays on it until the guard swings or
 * the fuse is low.
 */
export function hiddenHuman(task: () => number): (s: GameState) => Intent {
  return (s) => {
    const me = hero(s);
    const e = foe(s);
    const ready = readyToStep(me);
    const g = ownGen(s);
    if (!e.alive) return {};
    if (!g) return adjacent(s) && ready ? { place: true } : {};
    if (task() === 0) {
      const d = leaveStep(s);
      return d && ready ? { move: d } : {};
    }
    if ((enemyAttackPhase(s, e) === 'windup' && g.timer <= WINDUP_LEAVE) || g.timer <= 36) {
      const d = leaveStep(s);
      return d && ready ? { move: d } : {};
    }
    return {};
  };
}
