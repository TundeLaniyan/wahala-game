/**
 * The simulation pipeline. `tick` advances a GameState by exactly one fixed step.
 * The order of the stages below is part of the game rules; see docs/ARCHITECTURE.md.
 */
import type { GameState, Intents, SimEvent } from './types';
import { dropLoot } from './systems/drops';
import { resolveExplosions } from './systems/explosions';
import {
  detonateRemote,
  performAction,
  tryDisarm,
  tryPlaceGenerator,
  updateGeneratorMotion,
  updateGeneratorTimers,
} from './systems/generators';
import { applyLethalHits, collectFlameHits } from './systems/lethality';
import type { LethalHit } from './systems/lethality';
import { evaluateMatchEnd } from './systems/match';
import { updateMovement } from './systems/movement';
import { burnPickups, collectPickups } from './systems/pickups';
import { useSkill } from './systems/skills';
import {
  applyBlastExposure,
  expireEntryModes,
  handleVehicleIntent,
  updateVehicles,
} from './systems/vehicles';
import { updateCrowd } from './systems/crowd';
import { updateCrush } from './systems/crush';
import { updateEndgameTraps, updateFloorHazards } from './systems/hazards';

export function tick(state: GameState, intents: Intents = {}): SimEvent[] {
  const events: SimEvent[] = [];
  state.tick++;

  if (state.match.phase === 'ended') {
    settle(state);
    return events;
  }
  if (state.match.phase === 'countdown') {
    state.match.countdownRemaining--;
    if (state.match.countdownRemaining <= 0) {
      state.match.phase = 'playing';
      events.push({ type: 'matchStarted' });
    }
    return events;
  }

  state.match.playTicks++;
  expireEntryModes(state, events);
  applyIntents(state, intents, events);
  updateMovement(state, intents, events);
  updateFloorHazards(state, events);
  updateGeneratorMotion(state, events);
  collectPickups(state, events);
  updateGeneratorTimers(state, events);

  const hits: LethalHit[] = [];
  updateVehicles(state, hits, events);
  updateCrush(state, hits, events);
  updateEndgameTraps(state, events);
  updateCrowd(state, hits, events);
  resolveExplosions(state, events);
  burnPickups(state, events);
  hits.push(...collectFlameHits(state));

  const eliminated = applyLethalHits(state, hits, events);
  applyBlastExposure(state, events);
  dropLoot(state, eliminated, events);
  expire(state);
  evaluateMatchEnd(state, events);
  return events;
}

function applyIntents(state: GameState, intents: Intents, events: SimEvent[]): void {
  for (const p of state.players) {
    const intent = intents[p.id];
    if (!intent || !p.alive) continue;
    if (intent.vehicle) handleVehicleIntent(state, p, intent.vehicle, events);
    if (intent.detonate) detonateRemote(state, p);
    if (intent.disarm) tryDisarm(state, p, events);
    if (intent.action) performAction(state, p, events);
    if (intent.skill) useSkill(state, p, events);
    if (intent.place) tryPlaceGenerator(state, p, events);
  }
}

/** Drops flames and blast records whose time is up. */
function expire(state: GameState): void {
  state.flames = state.flames.filter((f) => f.endTick > state.tick + 1);
  state.blasts = state.blasts.filter((b) => b.endTick > state.tick + 1);
}

/** After the match ends the world is frozen except for purely visual countdowns. */
function settle(state: GameState): void {
  for (const p of state.players) if (p.stepRemaining > 0) p.stepRemaining--;
  state.flames = state.flames.filter((f) => f.endTick > state.tick);
  state.blasts = state.blasts.filter((b) => b.endTick > state.tick);
}
