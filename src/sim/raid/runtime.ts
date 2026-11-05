/**
 * The raid runtime: called by `tick` only when `state.raid` exists (so every other match is byte-for-byte unchanged).
 *
 *   updateRaid             once per playing tick before the explosions: barrels, the human's respawn, belts and
 *                          shipments, switches, waves, doors, bonuses, the objective and the extraction;
 *   raidAfterEliminations  right after the lethal hits: a fall of the human spends a life;
 *   evaluateRaid           replaces `evaluateMatchEnd`: every life spent, or the clock ran out;
 *   finishRaid / abandonRaid   build the `RaidOutcome` (stars, health to carry back) and end the match.
 *
 * Lives (decision RD6): the human has `livesMax`; falling spends one; while lives are left he comes back at the
 * entrance after `respawnDelayTicks`, with spawn protection and full health (upgrades stay); enemies never respawn.
 */
import type { RaidResultKind } from '../campaign/types';
import type { GameState, SimEvent } from '../types';
import { Tile } from '../types';
import { tileAt } from '../grid';
import { dangerTiles, respawn } from '../systems/respawn';
import { endMatch } from '../systems/matchResult';
import { updateBelts } from './belts';
import { updateBarrels } from './cargo';
import { updateBonuses, updateDoors, updateSwitches } from './doors';
import { RAID_TUNING } from './tuning';
import { updateWaves } from './waves';

export function updateRaid(state: GameState, events: SimEvent[]): void {
  const r = state.raid;
  if (!r || r.outcome || state.match.phase !== 'playing') return;
  r.announced = true;
  updateBarrels(state, events);
  countFall(state, events);
  updateRespawn(state, events);
  if (r.outcome) return;
  updateBelts(state, events);
  updateSwitches(state);
  updateWaves(state, events);
  updateDoors(state, events);
  updateBonuses(state, events);
  updateObjective(state, events);
}

export function raidAfterEliminations(
  state: GameState,
  _eliminated: readonly number[],
  events: SimEvent[],
): void {
  if (!state.raid || state.raid.outcome) return;
  countFall(state, events);
}

/** Counts a fall of the human once (whoever eliminated him, in whatever system and tick). */
function countFall(state: GameState, events: SimEvent[]): void {
  const r = state.raid!;
  const human = state.players[0]!;
  if (human.alive || human.eliminatedTick === null || r.deathSeen === human.eliminatedTick) return;
  r.deathSeen = human.eliminatedTick;
  r.livesUsed++;
  if (r.livesUsed >= r.livesMax) {
    finishRaid(state, 'failed', events, 'lives');
    return;
  }
  r.respawnAt = state.tick + RAID_TUNING.respawnDelayTicks;
}

function updateRespawn(state: GameState, events: SimEvent[]): void {
  const r = state.raid!;
  const human = state.players[0]!;
  if (human.alive || r.respawnAt === null || state.tick < r.respawnAt) return;
  const danger = dangerTiles(state);
  const free = (x: number, y: number): boolean =>
    tileAt(state, x, y) === Tile.Empty &&
    !danger.has(y * state.width + x) &&
    !state.players.some((p) => p.alive && p.x === x && p.y === y) &&
    !state.generators.some((g) => g.x === x && g.y === y);
  let spot: { x: number; y: number } | null = free(r.entrance.x, r.entrance.y) ? r.entrance : null;
  for (let radius = 1; !spot && radius <= 5; radius++) {
    for (let dy = -radius; dy <= radius && !spot; dy++) {
      for (let dx = -radius; dx <= radius && !spot; dx++) {
        if (Math.abs(dx) + Math.abs(dy) === radius && free(r.entrance.x + dx, r.entrance.y + dy))
          spot = { x: r.entrance.x + dx, y: r.entrance.y + dy };
      }
    }
  }
  if (!spot) return; // try again next tick
  respawn(state, human, spot.x, spot.y);
  r.respawnAt = null;
  events.push({ type: 'playerRespawned', playerId: human.id, x: human.x, y: human.y });
}

function updateObjective(state: GameState, events: SimEvent[]): void {
  const r = state.raid!;
  const human = state.players[0]!;
  if (r.stage === 'cargo' && r.cargo.filter((c) => c.marked).every((c) => c.destroyed)) {
    r.stage = 'extract';
    r.extraction.open = true;
    events.push({ type: 'raidExtractionOpened', x: r.extraction.x, y: r.extraction.y });
  }
  if (
    r.stage === 'extract' &&
    human.alive &&
    human.stepRemaining === 0 &&
    human.x === r.extraction.x &&
    human.y === r.extraction.y
  ) {
    finishRaid(state, 'completed', events);
  }
}

/** Replaces `evaluateMatchEnd` for a raid. */
export function evaluateRaid(state: GameState, events: SimEvent[]): void {
  const r = state.raid;
  if (!r || r.outcome || state.match.phase !== 'playing') return;
  if (r.livesUsed >= r.livesMax) finishRaid(state, 'failed', events, 'lives');
  else if (state.match.playTicks >= r.timeLimitTicks) finishRaid(state, 'failed', events, 'time');
}

/** The player leaves the raid on purpose (the app's "abandon"): no stars, health carried back as it stands. */
export function abandonRaid(state: GameState, events: SimEvent[]): void {
  const r = state.raid;
  if (!r || r.outcome || state.match.phase !== 'playing') return;
  finishRaid(state, 'abandoned', events);
}

export function finishRaid(
  state: GameState,
  result: RaidResultKind,
  events: SimEvent[],
  failedBy?: 'lives' | 'time',
): void {
  const r = state.raid!;
  const human = state.players[0]!;
  const ticks = state.match.playTicks;
  const completed = result === 'completed';
  const marked = r.cargo.filter((c) => c.marked);
  const stars = completed
    ? Math.min(
        RAID_TUNING.maxStars,
        1 + (r.livesUsed === 0 ? 1 : 0) + (ticks <= r.parTicks ? 1 : 0) + (r.bonusStars > 0 ? 1 : 0),
      )
    : 0;
  r.outcome = {
    raidId: r.raidId,
    result,
    seconds: Math.round(ticks / 60),
    optionalRoomsOpened: r.rooms.filter((q) => q.opened).length,
    optionalRoomsTotal: r.rooms.length,
    cargoDestroyed: marked.filter((c) => c.destroyed).length,
    cargoTotal: marked.length,
    hpLeft: human.alive ? (human.vitals?.hp ?? 0) : 0,
    livesUsed: r.livesUsed,
    stars: stars as 0 | 1 | 2 | 3,
    ...(failedBy ? { failedBy } : {}),
  };
  r.stage = completed ? 'done' : 'failed';
  events.push({ type: 'raidOutcome', outcome: r.outcome });
  endMatch(
    state,
    completed
      ? { kind: 'win', winnerId: 0 }
      : failedBy === 'lives' && state.players.length > 1
        ? { kind: 'win', winnerId: 1 }
        : { kind: 'draw', reason: 'timeout' },
    events,
  );
}
