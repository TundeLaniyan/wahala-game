/**
 * Signature vehicles (Danfo, taxi, Keke): entry mode, warning, driving, collisions and
 * cumulative blast damage. Vehicle damage is the number of unique flame tiles of a blast event
 * that lie on the vehicle's route; damage accumulates over separate events during one journey.
 */
import { Tile } from '../types';
import type { GameState, Intents, Player, SimEvent, Vehicle, VehicleIntent } from '../types';
import { CHARACTERS } from '../data/characters';
import { buildRoute } from './entries';
import type { LethalHit } from './lethality';
import { isActing, vehiclesOf } from './queries';
import { destroySoftBlocks } from './explosions';

export function vehicleStepTicks(state: GameState, v: Vehicle): number {
  const spec = state.config.vehicles.specs[v.kind];
  const slow = state.tick < v.slowUntil ? state.config.vehicles.slowFactor : 1;
  return Math.round(spec.stepTicks * slow);
}

/** Tiles a driving vehicle currently covers: its tile, plus the one it is leaving during the first half of a step. */
export function vehicleHitTiles(v: Vehicle): { x: number; y: number }[] {
  if (v.phase !== 'driving' || v.index < 0) return [];
  const tiles = [v.route[v.index]!];
  if (v.index > 0 && v.stepRemaining > v.stepTotal / 2) tiles.push(v.route[v.index - 1]!);
  return tiles;
}

// ------------------------------------------------------------------ commands

export function handleVehicleIntent(
  state: GameState,
  p: Player,
  intent: VehicleIntent,
  events: SimEvent[],
): void {
  switch (intent.type) {
    case 'begin': {
      if (!isActing(state, p) || p.entryUntil !== null || !p.hasVoucher || p.carrying !== null) return;
      if (vehiclesOf(state, p.id).length > 0) return;
      p.entryUntil = state.tick + state.config.vehicles.entryWindowTicks;
      events.push({ type: 'vehicleEntryBegan', playerId: p.id });
      return;
    }
    case 'cancel': {
      if (p.entryUntil === null) return;
      p.entryUntil = null;
      events.push({ type: 'vehicleEntryCancelled', playerId: p.id, reason: 'cancel' });
      return;
    }
    case 'launch': {
      if (!isActing(state, p) || p.entryUntil === null || !p.hasVoucher) return;
      const kind = CHARACTERS[p.characterId].vehicle;
      const route = buildRoute(state, kind, intent.entry, intent.turn);
      if (!route) return; // illegal selections are simply rejected; entry mode stays open
      p.hasVoucher = false;
      p.entryUntil = null;
      const spec = state.config.vehicles.specs[kind];
      const vehicle: Vehicle = {
        id: state.nextId++,
        ownerId: p.id,
        kind,
        route,
        phase: 'warning',
        warnRemaining: state.config.vehicles.entryWarnTicks,
        wreckRemaining: 0,
        hitPlayerIds: [],
        index: -1,
        stepRemaining: 0,
        stepTotal: spec.stepTicks,
        damage: 0,
        slowUntil: 0,
        softBroken: 0,
        playerHits: 0,
        exposedEvents: [],
        eventId: state.nextEventId++,
        startTick: state.tick,
      };
      state.vehicles.push(vehicle);
      events.push({ type: 'vehicleWarning', vehicleId: vehicle.id, kind, ownerId: p.id, entry: route[0]! });
      return;
    }
  }
}

export function expireEntryModes(state: GameState, events: SimEvent[]): void {
  for (const p of state.players) {
    if (p.entryUntil !== null && state.tick >= p.entryUntil) {
      p.entryUntil = null;
      events.push({ type: 'vehicleEntryCancelled', playerId: p.id, reason: 'timeout' });
    }
  }
}

export function applyVehicleIntents(state: GameState, intents: Intents, events: SimEvent[]): void {
  for (const p of state.players) {
    const vi = intents[p.id]?.vehicle;
    if (vi) handleVehicleIntent(state, p, vi, events);
  }
}

// ------------------------------------------------------------------ driving

/** Advances every vehicle one tick; pushes lethal hits and flags generators it collides with. */
export function updateVehicles(state: GameState, hits: LethalHit[], events: SimEvent[]): void {
  const softHits = new Map<number, number>();
  for (const v of [...state.vehicles]) {
    switch (v.phase) {
      case 'warning':
        v.warnRemaining--;
        if (v.warnRemaining <= 0) {
          v.phase = 'driving';
          v.index = 0;
          v.stepTotal = v.stepRemaining = vehicleStepTicks(state, v);
          events.push({ type: 'vehicleLaunched', vehicleId: v.id, kind: v.kind, ownerId: v.ownerId });
          enterTile(state, v, softHits, events);
        }
        break;
      case 'driving':
        if (v.stepRemaining > 0) v.stepRemaining--;
        if (v.stepRemaining === 0) advance(state, v, softHits, events);
        break;
      case 'crashing':
        v.wreckRemaining--;
        if (v.wreckRemaining <= 0) removeVehicle(state, v);
        break;
    }
    if (v.phase === 'driving') collide(state, v, hits, events);
  }
  destroySoftBlocks(state, softHits, 'vehicle', events);
}

function advance(state: GameState, v: Vehicle, softHits: Map<number, number>, events: SimEvent[]): void {
  if (v.index >= v.route.length - 1) {
    events.push({ type: 'vehicleExited', vehicleId: v.id });
    removeVehicle(state, v);
    return;
  }
  const next = v.route[v.index + 1]!;
  const spec = state.config.vehicles.specs[v.kind];
  const idx = next.y * state.width + next.x;
  const kind = state.tiles[idx];
  if (kind === Tile.Hard) return crash(v, events);
  if (kind === Tile.Soft && v.softBroken >= spec.softLimit && !softHits.has(idx)) return crash(v, events);
  v.index++;
  v.stepTotal = v.stepRemaining = vehicleStepTicks(state, v);
  enterTile(state, v, softHits, events);
}

function enterTile(state: GameState, v: Vehicle, softHits: Map<number, number>, _events: SimEvent[]): void {
  const t = v.route[v.index]!;
  const idx = t.y * state.width + t.x;
  if (state.tiles[idx] === Tile.Soft && !softHits.has(idx)) {
    softHits.set(idx, 0);
    v.softBroken++;
  }
}

function crash(v: Vehicle, events: SimEvent[]): void {
  v.phase = 'crashing';
  v.wreckRemaining = 40;
  const t = v.route[Math.max(0, v.index)]!;
  events.push({ type: 'vehicleDestroyed', vehicleId: v.id, x: t.x, y: t.y, reason: 'crash' });
}

function removeVehicle(state: GameState, v: Vehicle): void {
  state.vehicles.splice(state.vehicles.indexOf(v), 1);
}

/** Vehicle versus generators (immediate detonation) and players (lethal). */
function collide(state: GameState, v: Vehicle, hits: LethalHit[], events: SimEvent[]): void {
  const spec = state.config.vehicles.specs[v.kind];
  const tiles = vehicleHitTiles(v);
  for (const t of tiles) {
    for (const g of state.generators) {
      if (g.x === t.x && g.y === t.y && g.carriedBy === null && g.flight === null && !g.triggered) {
        g.triggered = true; // even Kill-Switched or remote generators go off
        events.push({ type: 'vehicleHitGenerator', vehicleId: v.id, generatorId: g.id });
      }
    }
    for (const p of state.players) {
      if (!p.alive || p.x !== t.x || p.y !== t.y) continue;
      hits.push({
        playerId: p.id,
        eventId: v.eventId,
        cause: { kind: 'vehicle', ownerId: v.ownerId, vehicleKind: v.kind, eventId: v.eventId },
        graceUntil: state.tick + state.config.okada.graceTicks,
      });
      if (!v.hitPlayerIds.includes(p.id)) {
        v.hitPlayerIds.push(p.id);
        v.playerHits++;
        events.push({ type: 'vehicleHitPlayer', vehicleId: v.id, playerId: p.id });
      }
    }
  }
  if (v.playerHits >= spec.playerHitLimit && v.phase === 'driving') crash(v, events);
}

/** Cumulative blast exposure. Each blast event damages a vehicle at most once per journey. */
export function applyBlastExposure(state: GameState, events: SimEvent[]): void {
  for (const v of [...state.vehicles]) {
    if (v.phase !== 'driving') continue;
    const spec = state.config.vehicles.specs[v.kind];
    const covered = new Set(vehicleHitTiles(v).map((t) => t.y * state.width + t.x));
    const routeTiles = new Set(v.route.map((t) => t.y * state.width + t.x));
    for (const blast of state.blasts) {
      if (v.exposedEvents.includes(blast.id) || !blast.tiles.some((t) => covered.has(t))) continue;
      v.exposedEvents.push(blast.id);
      // Unique tiles in the whole chain that lie on this vehicle's route: overlapping flames never double count.
      const damage = blast.tiles.filter((t) => routeTiles.has(t)).length;
      v.damage += damage;
      events.push({
        type: 'vehicleDamaged',
        vehicleId: v.id,
        damage,
        total: v.damage,
        resistance: spec.resistance,
      });
      if (v.damage >= spec.resistance) {
        const t = v.route[v.index]!;
        events.push({ type: 'vehicleDestroyed', vehicleId: v.id, x: t.x, y: t.y, reason: 'blast' });
        removeVehicle(state, v);
        break;
      }
      v.slowUntil = state.tick + state.config.vehicles.slowTicks;
      // Stagger: stretch the step in progress so the slowdown is felt immediately.
      v.stepRemaining = Math.ceil(v.stepRemaining * state.config.vehicles.slowFactor);
      v.stepTotal = Math.ceil(v.stepTotal * state.config.vehicles.slowFactor);
    }
  }
}
