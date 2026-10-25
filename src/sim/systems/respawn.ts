/**
 * V2 respawn modes (Deathmatch, Team Rumble): an eliminated fighter re-enters after `respawn.delayTicks`
 * on the safest spawn, with `protection.spawnProtectionTicks` of spawn protection (it ends early once
 * the fighter places a generator). Upgrades reset when `respawn.resetOnDeath` (life-based power).
 *
 * Spawn choice (deterministic, public information only):
 *  1. never a tile that is blocked, occupied, burning, inside a live generator's predicted blast
 *     (chains included), on a telegraphed / running stage hazard, on a vehicle's remaining route or
 *     under a falling crowd throw;
 *  2. then the best score: distance to the nearest living opponent (capped), a large penalty when an
 *     opponent is closer than `respawn.safeDistance`, the own team's side in Team Rumble, minus a
 *     cooldown penalty for a spawn used moments ago (no spawn camping: two fighters killed at the same
 *     spot do not reappear on the same tile one after another), minus a penalty near the tile the
 *     fighter just fell on, minus dangerous neighbours (an escape route must exist);
 *  3. when every arena spawn is unusable, any safe open floor tile (a respawn is never lost).
 */
import { getArena } from '../arenas';
import { tileAt } from '../grid';
import { teamHome } from '../modes';
import { Tile } from '../types';
import type { GameState, Player, SimEvent } from '../types';
import { previewBlast } from './explosions';
import { groundedGeneratorAt, teammates } from './queries';
import { isLethalStageEvent } from './stage';

/** Schedules respawns for this tick's eliminations. */
export function scheduleRespawns(state: GameState, eliminated: readonly number[]): void {
  if (!state.config.respawn.enabled) return;
  for (const id of eliminated) {
    const p = state.players[id]!;
    p.respawnAt = state.tick + state.config.respawn.delayTicks;
  }
}

export function updateRespawns(state: GameState, events: SimEvent[]): void {
  if (!state.config.respawn.enabled) return;
  endProtectionOnAttack(state);
  const remaining = state.config.match.durationTicks - state.match.playTicks;
  let danger: Set<number> | null = null;
  for (const p of state.players) {
    if (p.alive || p.respawnAt === null || state.tick < p.respawnAt) continue;
    if (remaining <= 0) continue;
    danger ??= dangerTiles(state);
    const spot = chooseSpawn(state, p, danger);
    if (!spot) continue; // try again next tick
    respawn(state, p, spot.x, spot.y);
    if (spot.index >= 0) state.spawnUsedAt[spot.index] = state.tick;
    events.push({ type: 'playerRespawned', playerId: p.id, x: p.x, y: p.y });
  }
}

/** True while `p` is spawn-protected. */
export function isSpawnProtected(state: GameState, p: Player): boolean {
  return p.alive && state.tick < p.protectedUntil;
}

/** A protected fighter who places a generator gives the protection up (it is for getting away, not attacking). */
function endProtectionOnAttack(state: GameState): void {
  if (!state.config.respawn.protectionEndsOnAttack) return;
  const span = state.config.protection.spawnProtectionTicks;
  for (const p of state.players) {
    if (!p.alive || state.tick >= p.protectedUntil) continue;
    const since = p.protectedUntil - span;
    if (state.generators.some((g) => g.ownerId === p.id && !g.fromSpectator && g.placedTick >= since))
      p.protectedUntil = state.tick;
  }
}

/** Tile indices that are, or are about to be, lethal: the spawn must not be one of them. */
export function dangerTiles(state: GameState): Set<number> {
  const w = state.width;
  const out = new Set<number>();
  for (const f of state.flames) out.add(f.y * w + f.x);
  for (const g of state.generators) for (const t of previewBlast(state, g)) out.add(t);
  for (const e of state.stage.events) {
    if (isLethalStageEvent(e) && e.endTick > state.tick) for (const t of e.tiles) out.add(t);
  }
  for (const v of state.vehicles) {
    if (v.phase === 'crashing') continue;
    for (let i = Math.max(0, v.index); i < v.route.length; i++) out.add(v.route[i]!.y * w + v.route[i]!.x);
  }
  for (const t of state.crowd?.throws ?? []) out.add(t.y * w + t.x);
  return out;
}

interface Spot {
  x: number;
  y: number;
  /** Arena spawn index, or -1 for the open-floor fallback. */
  index: number;
}

function chooseSpawn(state: GameState, p: Player, danger: Set<number>): Spot | null {
  const arena = getArena(state.arenaId);
  const cfg = state.config.respawn;
  const w = state.width;
  const home = p.team >= 0 ? teamHome(arena, state.players, p.team) : null;
  const homes =
    p.team >= 0
      ? [...new Set(state.players.map((q) => q.team))]
          .filter((t) => t >= 0 && t !== p.team)
          .map((t) => teamHome(arena, state.players, t))
          .filter((h): h is { x: number; y: number } => h !== null)
      : [];

  const usable = (x: number, y: number): boolean =>
    tileAt(state, x, y) === Tile.Empty &&
    !groundedGeneratorAt(state, x, y) &&
    !danger.has(y * w + x) &&
    !state.players.some((o) => o.alive && o.x === x && o.y === y);

  const score = (x: number, y: number, index: number): number => {
    let nearest = Infinity;
    for (const o of state.players) {
      if (!o.alive || o.id === p.id || teammates(o, p)) continue;
      nearest = Math.min(nearest, Math.abs(o.x - x) + Math.abs(o.y - y));
    }
    let s = Math.min(nearest, 20);
    if (nearest < cfg.safeDistance) s -= 30;
    if (home) {
      const dHome = Math.abs(home.x - x) + Math.abs(home.y - y);
      const ownSide = homes.every((h) => dHome <= Math.abs(h.x - x) + Math.abs(h.y - y));
      if (ownSide) s += cfg.homeSideBonus;
    }
    if (index >= 0 && state.tick - (state.spawnUsedAt[index] ?? -Infinity) < cfg.spawnCooldownTicks) s -= 12;
    if (Math.abs(p.x - x) + Math.abs(p.y - y) < cfg.deathAvoidRadius) s -= 8;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (tileAt(state, nx, ny) === Tile.Empty && danger.has(ny * w + nx)) s -= 3;
    }
    return s;
  };

  let best: Spot | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < arena.spawns.length; i++) {
    const sp = arena.spawns[i]!;
    if (!usable(sp.x, sp.y)) continue;
    const s = score(sp.x, sp.y, i) - i * 0.001;
    if (s > bestScore) {
      bestScore = s;
      best = { x: sp.x, y: sp.y, index: i };
    }
  }
  if (best) return best;

  // every spawn is blocked or dangerous: any safe open floor tile with a free neighbour
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < w; x++) {
      if (!usable(x, y)) continue;
      if (!NEIGHBOURS.some(([dx, dy]) => tileAt(state, x + dx, y + dy) === Tile.Empty)) continue;
      const s = score(x, y, -1) - (y * w + x) * 1e-6;
      if (s > bestScore) {
        bestScore = s;
        best = { x, y, index: -1 };
      }
    }
  }
  return best;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function respawn(state: GameState, p: Player, x: number, y: number): void {
  const cfg = state.config;
  p.alive = true;
  p.respawnAt = null;
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
  p.slide = null;
  p.dazedUntil = 0;
  p.curse = null;
  p.immune = [];
  p.recentHits = [];
  p.teleportPending = null;
  p.entryUntil = null;
  p.carrying = null;
  // `eliminatedTick` / `elimination` / `eliminatedBy` keep describing the last death (kill feed)
  p.protectedUntil = state.tick + cfg.protection.spawnProtectionTicks;
  if (cfg.respawn.resetOnDeath) {
    p.range = cfg.generator.baseRange;
    p.capacity = cfg.generator.baseCapacity;
    p.speedLevel = 0;
    p.contact = null;
    p.killSwitchCharges = 0;
    p.remote = false;
    p.sneakers = false;
    p.hotFuel = false;
    p.armour = 0;
    p.squareTier = 0;
    p.mounted = false;
    p.hasVoucher = false;
  }
}
