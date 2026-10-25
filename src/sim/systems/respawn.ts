/**
 * V2 respawn modes (Deathmatch, Team Rumble): an eliminated fighter re-enters after `respawn.delayTicks`
 * on the safest spawn (farthest from living opponents, never the tile they fell on twice in a row when
 * another is safe), with `protection.spawnProtectionTicks` of spawn protection. Upgrades reset when
 * `respawn.resetOnDeath` (life-based power).
 */
import { getArena } from '../arenas';
import { tileAt } from '../grid';
import { Tile } from '../types';
import type { GameState, Player, SimEvent } from '../types';
import { groundedGeneratorAt, teammates } from './queries';

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
  const remaining = state.config.match.durationTicks - state.match.playTicks;
  for (const p of state.players) {
    if (p.alive || p.respawnAt === null || state.tick < p.respawnAt) continue;
    if (remaining <= 0) continue;
    const spot = chooseSpawn(state, p);
    if (!spot) continue; // try again next tick
    respawn(state, p, spot.x, spot.y);
    events.push({ type: 'playerRespawned', playerId: p.id, x: p.x, y: p.y });
  }
}

function chooseSpawn(state: GameState, p: Player): { x: number; y: number } | null {
  const arena = getArena(state.arenaId);
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  arena.spawns.forEach((s, i) => {
    if (tileAt(state, s.x, s.y) !== Tile.Empty || groundedGeneratorAt(state, s.x, s.y)) return;
    if (state.flames.some((f) => f.x === s.x && f.y === s.y)) return;
    let nearest = Infinity;
    for (const o of state.players) {
      if (!o.alive || o.id === p.id || teammates(o, p)) continue;
      nearest = Math.min(nearest, Math.abs(o.x - s.x) + Math.abs(o.y - s.y));
    }
    const repeat = s.x === p.x && s.y === p.y ? 8 : 0; // don't drop them back where they just died
    const score = Math.min(nearest, 40) - repeat - i * 0.001;
    if (score > bestScore) {
      bestScore = score;
      best = { x: s.x, y: s.y };
    }
  });
  return best;
}

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
