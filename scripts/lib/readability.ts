/**
 * Readability probes for campaign FIELD enemies (docs/CAMPAIGN_COMBAT_RELIABILITY.md, decisions RC*): do the enemies
 * patrol a readable route, how fast do they chase compared with the human, how long do they chase, and do they go back?
 * Real simulation, real enemy bots, the campaign tactics layer of the level, no rendering. The human is a scripted
 * runner with ORDINARY intents only (a move per tick); nothing edits an enemy's state.
 */
import { createBot } from '../../src/ai';
import type { Bot } from '../../src/ai';
import { campaignEnemyLevel, enemyMindView, observe, tick } from '../../src/sim';
import type { CampaignLevel, Dir, GameState, Intents } from '../../src/sim';
import { Tile } from '../../src/sim/types';
import { fieldGame } from './fieldFight';

const DIRS: readonly [Dir, number, number][] = [
  ['up', 0, -1],
  ['down', 0, 1],
  ['left', -1, 0],
  ['right', 1, 0],
];

export interface Rig {
  state: GameState;
  bots: Record<number, Bot>;
}

/** A field mission with the level's real enemy bots (as the campaign starts it). */
export function rig(fieldId: string, level: CampaignLevel, seed: number): Rig {
  const state = fieldGame(fieldId, level, seed);
  const bots: Record<number, Bot> = {};
  for (const p of state.players)
    if (p.isBot)
      bots[p.id] = createBot({
        difficulty: campaignEnemyLevel(level),
        seed: seed * 7919 + p.id,
        playerId: p.id,
      });
  return { state, bots };
}

/** One tick: every bot decides from its observation; `human` is the human's intent. */
export function step(r: Rig, human: Intents[number] = {}): void {
  const intents: Intents = {};
  for (const [id, bot] of Object.entries(r.bots)) {
    const n = Number(id);
    if (r.state.players[n]!.alive) intents[n] = bot.decide(observe(r.state, n));
  }
  intents[0] = human;
  tick(r.state, intents);
}

const open = (s: GameState, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < s.width && y < s.height && s.tiles[y * s.width + x] === Tile.Empty;

/** Walking distance (tiles) from (x, y) over free floor, generators blocking; -1 where unreachable. */
export function bfs(s: GameState, x: number, y: number): Int16Array {
  const d = new Int16Array(s.width * s.height).fill(-1);
  const blocked = new Set(s.generators.map((g) => g.y * s.width + g.x));
  const q = [y * s.width + x];
  d[q[0]!] = 0;
  for (let h = 0; h < q.length; h++) {
    const u = q[h]!;
    const ux = u % s.width;
    const uy = Math.floor(u / s.width);
    for (const [, dx, dy] of DIRS) {
      const nx = ux + dx;
      const ny = uy + dy;
      const v = ny * s.width + nx;
      if (!open(s, nx, ny) || d[v] !== -1 || blocked.has(v)) continue;
      d[v] = d[u]! + 1;
      q.push(v);
    }
  }
  return d;
}

export interface PatrolTrace {
  enemy: string;
  /** Distinct tiles walked, laps of its route completed, share of seconds it was moving. */
  tiles: number;
  laps: number;
  movingShare: number;
  /** The most common mind states over the run (seconds). */
  states: Record<string, number>;
}

/** Idle human at the start, far from every patrol: what do the enemies do for `seconds`? */
export function patrolTrace(
  fieldId: string,
  level: CampaignLevel,
  seed: number,
  seconds: number,
): PatrolTrace[] {
  const r = rig(fieldId, level, seed);
  const s = r.state;
  const seen = new Map<number, Set<number>>();
  const moving = new Map<number, number>();
  const last = new Map<number, string>();
  const states = new Map<number, Record<string, number>>();
  for (const p of s.players)
    if (p.id !== 0) (seen.set(p.id, new Set()), moving.set(p.id, 0), states.set(p.id, {}));
  for (let i = 0; i < seconds * 60 && s.match.phase !== 'ended'; i++) {
    step(r);
    for (const p of s.players) {
      if (p.id === 0 || !p.alive) continue;
      seen.get(p.id)!.add(p.y * s.width + p.x);
      const key = `${p.x},${p.y}`;
      if (i % 60 === 0) {
        if (last.get(p.id) !== undefined && last.get(p.id) !== key) moving.set(p.id, moving.get(p.id)! + 1);
        last.set(p.id, key);
        const st = enemyMindView(s, p.id) ?? 'none';
        states.get(p.id)![st] = (states.get(p.id)![st] ?? 0) + 1;
      }
    }
  }
  return s.players
    .filter((p) => p.id !== 0)
    .map((p) => ({
      enemy: `${p.enemyVariant ?? p.enemyKind}#${p.id}`,
      tiles: seen.get(p.id)!.size,
      laps: s.territory?.minds[p.id]?.lap ?? 0,
      movingShare: moving.get(p.id)! / seconds,
      states: states.get(p.id)!,
    }));
}

export interface ChaseResult {
  enemy: string;
  /** Did the enemy ever turn to pursue? */
  noticed: boolean;
  /** Seconds from the first pursuit tick until the enemy stopped pursuing (null = still pursuing at the end). */
  chaseSec: number | null;
  /** The enemy's mind state at the end, and whether it was back on patrol. */
  endState: string;
  /** Smallest and final walking distance between them while it pursued. */
  minGap: number;
  finalGap: number;
  /** Segments the human lost. */
  hurt: number;
  /** Tiles the human covered per second while running, and the enemy's while pursuing. */
  humanTilesPerSec: number;
  enemyTilesPerSec: number;
  /** Tiles per second while it was only walking after him (the pursue state, no swings or recoveries). */
  walkTilesPerSec: number;
}

/**
 * The disengage probe: the human stands within sight of `enemyId` until it pursues, then runs to the reachable tile that
 * is farthest from the enemy (re-planned every 20 ticks, always a tile it reaches first) and keeps going. Reports how
 * the chase ends. `startGap`: walking distance of the human from the enemy when the probe starts.
 */
export function chaseProbe(
  fieldId: string,
  level: CampaignLevel,
  seed: number,
  enemyId: number,
  opts: { startGap?: number; maxSec?: number; preWalkSec?: number } = {},
): ChaseResult {
  const r = rig(fieldId, level, seed);
  const s = r.state;
  const me = s.players[0]!;
  const en = s.players[enemyId]!;
  // let the enemy get on its way (patrol) for a few seconds, then drop the human `startGap` tiles from it
  for (let i = 0; i < (opts.preWalkSec ?? 3) * 60; i++) step(r);
  const de = bfs(s, en.x, en.y);
  const gap = opts.startGap ?? 5;
  let best = -1;
  let bestScore = 1e9;
  for (let i = 0; i < de.length; i++) {
    if (de[i] !== gap) continue;
    const x = i % s.width;
    const y = Math.floor(i / s.width);
    // prefer a tile with room to run: many reachable tiles farther from the enemy
    const dm = bfs(s, x, y);
    let room = 0;
    for (let j = 0; j < dm.length; j++) if (dm[j]! >= 0 && de[j]! > dm[j]!) room++;
    const score = -room;
    if (score < bestScore) ((bestScore = score), (best = i));
  }
  if (best < 0) throw new Error(`no tile at gap ${gap} from enemy ${enemyId}`);
  me.x = me.stepFromX = best % s.width;
  me.y = me.stepFromY = Math.floor(best / s.width);
  me.stepRemaining = 0;
  const hp0 = me.vitals?.hp ?? 0;
  let pursueStart = -1;
  let chaseEnd: number | null = null;
  let minGap = 99;
  let target = -1;
  let path: Dir[] = [];
  let humanSteps = 0;
  let enemySteps = 0;
  let pursueTicks = 0;
  let pursueSteps = 0;
  let lastMe = `${me.x},${me.y}`;
  let lastEn = `${en.x},${en.y}`;
  const maxTicks = (opts.maxSec ?? 40) * 60;
  for (let i = 0; i < maxTicks && s.match.phase !== 'ended'; i++) {
    const st = enemyMindView(s, enemyId);
    const pursuing =
      st === 'pursue' || st === 'alert' || st === 'windup' || st === 'recovery' || st === 'stagger';
    if (pursuing && pursueStart < 0) pursueStart = i;
    if (pursueStart >= 0 && chaseEnd === null && !pursuing) chaseEnd = i;
    // the human waits (facing the enemy's way) until it pursues, then runs
    let mv: Dir | null = null;
    if (pursueStart >= 0) {
      if (i % 20 === 0 || path.length === 0) {
        const dm = bfs(s, me.x, me.y);
        const dn = bfs(s, en.x, en.y);
        let bt = -1;
        let bv = -1;
        for (let j = 0; j < dm.length; j++) {
          if (dm[j]! <= 0 || dm[j]! > 40 || dn[j]! <= dm[j]! + 0) continue;
          if (dn[j]! > bv) ((bv = dn[j]!), (bt = j));
        }
        target = bt;
        path = [];
        if (target >= 0) {
          // walk back from the target along decreasing distance from me
          const seen = bfsFrom(s, me.x, me.y);
          let cur = target;
          const rev: Dir[] = [];
          while (cur !== me.y * s.width + me.x && cur >= 0) {
            const cx = cur % s.width;
            const cy = Math.floor(cur / s.width);
            let moved = false;
            for (const [d, dx, dy] of DIRS) {
              const nx = cx - dx;
              const ny = cy - dy;
              if (nx < 0 || ny < 0 || nx >= s.width || ny >= s.height) continue;
              const v = ny * s.width + nx;
              if (seen[v] !== -1 && seen[v]! === seen[cur]! - 1) {
                rev.push(d);
                cur = v;
                moved = true;
                break;
              }
            }
            if (!moved) break;
          }
          path = rev.reverse();
        }
      }
      mv = path.shift() ?? null;
    }
    step(r, mv ? { move: mv } : {});
    const km = `${me.x},${me.y}`;
    const ke = `${en.x},${en.y}`;
    if (pursueStart >= 0 && chaseEnd === null) {
      if (km !== lastMe) humanSteps++;
      if (ke !== lastEn) enemySteps++;
      if (st === 'pursue') {
        pursueTicks++;
        if (ke !== lastEn) pursueSteps++;
      }
      const dd = bfs(s, en.x, en.y)[me.y * s.width + me.x]!;
      if (dd >= 0) minGap = Math.min(minGap, dd);
    }
    lastMe = km;
    lastEn = ke;
  }
  const dEnd = bfs(s, en.x, en.y)[me.y * s.width + me.x]!;
  const secs = pursueStart >= 0 ? ((chaseEnd ?? maxTicks) - pursueStart) / 60 : 0;
  return {
    enemy: `${en.enemyVariant ?? en.enemyKind}#${enemyId}`,
    noticed: pursueStart >= 0,
    chaseSec:
      pursueStart >= 0 && chaseEnd !== null ? Math.round(((chaseEnd - pursueStart) / 60) * 10) / 10 : null,
    endState: enemyMindView(s, enemyId) ?? 'none',
    minGap: minGap === 99 ? -1 : minGap,
    finalGap: dEnd,
    hurt: hp0 - (me.vitals?.hp ?? 0),
    humanTilesPerSec: secs > 0 ? Math.round((humanSteps / secs) * 10) / 10 : 0,
    enemyTilesPerSec: secs > 0 ? Math.round((enemySteps / secs) * 10) / 10 : 0,
    walkTilesPerSec: pursueTicks > 0 ? Math.round((pursueSteps / (pursueTicks / 60)) * 10) / 10 : 0,
  };
}

function bfsFrom(s: GameState, x: number, y: number): Int16Array {
  return bfs(s, x, y);
}
