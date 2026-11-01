/**
 * Signature vehicles (Danfo, taxi, Keke): entry mode, warning, driving, collisions and
 * cumulative blast damage. Vehicle damage is the number of unique flame tiles of a blast event
 * that lie on the vehicle's route; damage accumulates over separate events during one journey.
 */
import { Tile } from '../types';
import type { GameState, Intents, Player, SimEvent, TilePos, Vehicle, VehicleIntent } from '../types';
import { chooseAutoVehicle } from './autoVehicle';
import { canHarm } from './queries';
import { CHARACTERS } from '../data/characters';
import { buildRoute } from './entries';
import type { LethalHit } from './lethality';
import { isActing, vehiclesOf } from './queries';
import { destroySoftBlocks, previewBlast } from './explosions';
import type { Generator } from '../types';

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
      launchVehicle(state, p, route, events);
      return;
    }
    case 'auto': {
      autoLaunch(state, p, events);
      return;
    }
  }
}

/**
 * V2 one-press launch: the simulation picks the route (autoVehicle.ts) and launches at once. Returns
 * false (voucher kept) when there is no legal route or the player cannot act.
 */
export function autoLaunch(state: GameState, p: Player, events: SimEvent[]): boolean {
  if (!isActing(state, p) || !p.hasVoucher || p.carrying !== null) return false;
  if (vehiclesOf(state, p.id).length > 0) return false;
  const choice = chooseAutoVehicle(state, p.id);
  if (!choice) return false;
  const kind = CHARACTERS[p.characterId].vehicle;
  const route = buildRoute(state, kind, choice.entry, choice.turn);
  if (!route) return false;
  launchVehicle(state, p, route, events);
  return true;
}

function launchVehicle(state: GameState, p: Player, route: TilePos[], events: SimEvent[]): void {
  const kind = CHARACTERS[p.characterId].vehicle;
  if (p.entryUntil !== null) p.entryUntil = null;
  p.hasVoucher = false;
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
    payload: { state: 'scanning', fuseRemaining: 0 },
  };
  state.vehicles.push(vehicle);
  events.push({ type: 'vehicleWarning', vehicleId: vehicle.id, kind, ownerId: p.id, entry: route[0]! });
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
        // a fused carrier stops where it is: the generator goes off on the tile it found its target from
        if (!isHeld(v)) {
          if (v.stepRemaining > 0) v.stepRemaining--;
          if (v.stepRemaining === 0) advance(state, v, softHits, events);
        }
        break;
      case 'crashing':
        v.wreckRemaining--;
        if (v.wreckRemaining <= 0) removeVehicle(state, v);
        break;
    }
    if (v.phase === 'driving') {
      collide(state, v, hits, events);
      if (v.phase === 'driving') carrierStep(state, v, events);
    }
  }
  destroySoftBlocks(state, softHits, 'vehicle', events);
}

function advance(state: GameState, v: Vehicle, softHits: Map<number, number>, events: SimEvent[]): void {
  if (v.index >= v.route.length - 1) {
    events.push({ type: 'vehicleExited', vehicleId: v.id });
    expirePayload(v, 'route', events);
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

function crash(v: Vehicle, events: SimEvent[], reason: 'crash' | 'detonation' = 'crash'): void {
  v.phase = 'crashing';
  v.wreckRemaining = 40;
  const t = v.route[Math.max(0, v.index)]!;
  events.push({ type: 'vehicleDestroyed', vehicleId: v.id, x: t.x, y: t.y, reason });
  if (reason === 'crash') expirePayload(v, 'crash', events);
}

function removeVehicle(state: GameState, v: Vehicle): void {
  state.vehicles.splice(state.vehicles.indexOf(v), 1);
}

/**
 * Vehicle versus generators (immediate detonation). The vehicle's body is harmless to players (decision VG1): the
 * carried generator is the weapon, see `carrierStep`.
 */
function collide(state: GameState, v: Vehicle, _hits: LethalHit[], events: SimEvent[]): void {
  const tiles = vehicleHitTiles(v);
  for (const t of tiles) {
    for (const g of state.generators) {
      if (g.x === t.x && g.y === t.y && g.carriedBy === null && g.flight === null && !g.triggered) {
        g.triggered = true; // even Kill-Switched or remote generators go off
        if (g.ownerId !== v.ownerId) g.touchedBy = v.ownerId; // elimination credit (attribution.ts)
        events.push({ type: 'vehicleHitGenerator', vehicleId: v.id, generatorId: g.id });
      }
    }
  }
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
        expirePayload(v, 'blast', events);
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

// ------------------------------------------------------------------ the carried generator (decision VG1)

/** The carrier is parked while its fuse burns or while it waits for the owner to leave the blast. */
function isHeld(v: Vehicle): boolean {
  return v.payload?.state === 'fusing' || v.payload?.state === 'pending';
}

function expirePayload(v: Vehicle, reason: 'route' | 'crash' | 'blast', events: SimEvent[]): void {
  if (v.payload?.state === 'spent') return;
  v.payload = { state: 'spent', fuseRemaining: 0 };
  events.push({ type: 'vehicleGeneratorExpired', vehicleId: v.id, ownerId: v.ownerId, reason });
}

/** A generator that is never placed on the board: the footprint a blast from tile (x, y) would cover. */
function carriedGenerator(state: GameState, owner: Player, x: number, y: number, id = -1): Generator {
  const cfg = state.config.generator;
  const weak = owner.curse?.kind === 'weakFire' && state.tick < owner.curse.until;
  return {
    id,
    ownerId: owner.id,
    x,
    y,
    stepFromX: x,
    stepFromY: y,
    range: weak ? Math.min(owner.range, cfg.weakFireRange) : owner.range,
    pierce: false,
    square: state.config.square.radiusByTier[Math.min(owner.squareTier, state.config.square.maxTier)] ?? 0,
    fromSpectator: false,
    mode: 'timed',
    timer: 0,
    carriedBy: null,
    carryBonusUsed: false,
    slide: null,
    flight: null,
    triggered: false,
    placedTick: state.tick,
    carrier: true,
  };
}

/** A player the carried generator would set off for: an alive opponent it can harm that is not protected. */
function isTarget(state: GameState, owner: Player, p: Player): boolean {
  return p.alive && p.id !== owner.id && canHarm(state, owner.id, p) && !(p.protectedUntil > state.tick);
}

/**
 * One tick of the carried generator. It uses the real blast footprint (walls and crates stop it, radial or plus by
 * the stage's mode), so it can never "see" through a wall. An opponent inside it starts the fuse; when the fuse is
 * out the generator goes off - unless the owner is still inside the footprint, then it waits until the owner is out
 * (and returns to scanning if no opponent is left in range). The owner is never hurt by it either way (the flames
 * are `ownerSafe`).
 */
function carrierStep(state: GameState, v: Vehicle, events: SimEvent[]): void {
  const payload = (v.payload ??= { state: 'scanning', fuseRemaining: 0 });
  if (payload.state === 'spent') return;
  const owner = state.players[v.ownerId];
  if (!owner) return;
  const t = v.route[v.index]!;
  const width = state.width;
  const footprint = previewBlast(state, carriedGenerator(state, owner, t.x, t.y));
  const inRange = (p: Player): boolean => footprint.has(p.y * width + p.x);
  const rivalInRange = state.players.some((p) => isTarget(state, owner, p) && inRange(p));
  const ownerInRange = owner.alive && inRange(owner);
  switch (payload.state) {
    case 'scanning':
      if (rivalInRange) {
        payload.state = 'fusing';
        payload.fuseRemaining = state.config.vehicles.fuseTicks;
        events.push({
          type: 'vehicleFuse',
          vehicleId: v.id,
          ownerId: v.ownerId,
          x: t.x,
          y: t.y,
          ticks: payload.fuseRemaining,
        });
      }
      return;
    case 'fusing':
      if (payload.fuseRemaining > 0) payload.fuseRemaining--;
      if (payload.fuseRemaining > 0) return;
      payload.state = 'pending'; // the fuse is out this tick: resolve it now
      resolvePending(state, v, owner, t, rivalInRange, ownerInRange, events);
      return;
    case 'pending':
      resolvePending(state, v, owner, t, rivalInRange, ownerInRange, events);
      return;
  }
}

function resolvePending(
  state: GameState,
  v: Vehicle,
  owner: Player,
  t: TilePos,
  rivalInRange: boolean,
  ownerInRange: boolean,
  events: SimEvent[],
): void {
  if (!rivalInRange) {
    v.payload = { state: 'scanning', fuseRemaining: 0 }; // everyone got away while it waited for the owner
    return;
  }
  if (ownerInRange) {
    // never while the owner is inside the blast; but never wait for ever either
    const payload = (v.payload ??= { state: 'pending', fuseRemaining: 0 });
    payload.fuseRemaining--;
    if (-payload.fuseRemaining >= state.config.vehicles.holdTicks) {
      expirePayload(v, 'route', events);
    }
    return;
  }
  detonate(state, v, owner, t.x, t.y, events);
}

function detonate(
  state: GameState,
  v: Vehicle,
  owner: Player,
  x: number,
  y: number,
  events: SimEvent[],
): void {
  const gen = carriedGenerator(state, owner, x, y, state.nextId++);
  gen.triggered = true; // resolved by resolveExplosions later this tick: normal shapes, walls, crates, chains, credit
  state.generators.push(gen);
  v.payload = { state: 'spent', fuseRemaining: 0 };
  events.push({ type: 'vehicleDetonated', vehicleId: v.id, ownerId: owner.id, x, y });
  crash(v, events, 'detonation');
}
