/**
 * Generator lifecycle: placement, fuses, kick / carry / punch, Kill Switch, remote detonation.
 * Detonation itself is resolved in explosions.ts; this module only flags generators as triggered.
 */
import { DIR_VEC, tileAt } from '../grid';
import { Tile } from '../types';
import type { Dir, GameState, Generator, Player, SimEvent } from '../types';
import { activeGeneratorCount, groundedGeneratorAt, isActing, isGrounded, playersAt } from './queries';

// ------------------------------------------------------------------ placement

export function canPlaceGeneratorAt(state: GameState, x: number, y: number): boolean {
  return tileAt(state, x, y) === Tile.Empty && !groundedGeneratorAt(state, x, y);
}

export function tryPlaceGenerator(state: GameState, p: Player, events: SimEvent[]): Generator | null {
  if (!isActing(state, p) || p.entryUntil !== null || p.carrying !== null) return null;
  if (activeGeneratorCount(state, p.id) >= p.capacity) return null;
  if (!canPlaceGeneratorAt(state, p.x, p.y)) return null;

  const cfg = state.config.generator;
  const weak = p.curse?.kind === 'weakFire' && state.tick < p.curse.until;
  const remote = p.remote;
  const gen: Generator = {
    id: state.nextId++,
    ownerId: p.id,
    x: p.x,
    y: p.y,
    stepFromX: p.x,
    stepFromY: p.y,
    range: weak ? Math.min(p.range, cfg.weakFireRange) : p.range,
    pierce: p.hotFuel,
    square: state.config.square.radiusByTier[Math.min(p.squareTier, state.config.square.maxTier)] ?? 0,
    fromSpectator: false,
    mode: remote ? 'remote' : 'timed',
    timer: remote ? cfg.remoteFailsafeTicks : cfg.fuseTicks,
    carriedBy: null,
    carryBonusUsed: false,
    slide: null,
    flight: null,
    triggered: false,
    placedTick: state.tick,
  };
  p.hotFuel = false; // Hot Fuel is a one-generator boost
  state.generators.push(gen);
  events.push({ type: 'generatorPlaced', generatorId: gen.id, ownerId: p.id, x: gen.x, y: gen.y });
  return gen;
}

// ------------------------------------------------------------------ remote + disarm

export function detonateRemote(state: GameState, p: Player): void {
  if (!isActing(state, p)) return;
  for (const g of state.generators) {
    if (g.ownerId === p.id && g.mode === 'remote') g.triggered = true;
  }
}

/** Kill Switch (legacy button path): disarms the faced (or own-tile) generator. */
export function tryDisarm(state: GameState, p: Player, events: SimEvent[]): void {
  if (!isActing(state, p) || p.entryUntil !== null) return;
  const target = findInteractTarget(state, p);
  if (target) disarmGenerator(state, p, target, events);
}

/**
 * Disarm: permanently switches off a generator's timer / remote trigger (it stays explosive to flame
 * and vehicles - LOCKED). Uses one charge; the Disarm ability is gone with the last charge.
 */
export function disarmGenerator(state: GameState, p: Player, target: Generator, events: SimEvent[]): boolean {
  if (p.killSwitchCharges <= 0 || target.mode === 'disabled' || target.carriedBy !== null || target.flight)
    return false;
  p.killSwitchCharges--;
  if (p.killSwitchCharges <= 0 && p.contact === 'disarm') p.contact = null;
  target.mode = 'disabled';
  target.timer = state.config.generator.disabledCleanupTicks;
  target.triggered = false;
  events.push({ type: 'generatorDisarmed', generatorId: target.id, playerId: p.id });
  return true;
}

/** The generator a player is facing, falling back to the one under their feet. */
export function findInteractTarget(state: GameState, p: Player): Generator | undefined {
  const v = DIR_VEC[p.facing];
  return groundedGeneratorAt(state, p.x + v.dx, p.y + v.dy) ?? groundedGeneratorAt(state, p.x, p.y);
}

// ------------------------------------------------------------------ kick

export function isTileFreeForGenerator(state: GameState, x: number, y: number, ignoreId?: number): boolean {
  if (tileAt(state, x, y) !== Tile.Empty) return false;
  const g = groundedGeneratorAt(state, x, y);
  return !g || g.id === ignoreId;
}

export function kickGenerator(state: GameState, gen: Generator, dir: Dir, events: SimEvent[]): boolean {
  if (!isGrounded(gen) || gen.slide) return false;
  const v = DIR_VEC[dir];
  const nx = gen.x + v.dx;
  const ny = gen.y + v.dy;
  if (!isTileFreeForGenerator(state, nx, ny) || playersAt(state, nx, ny).length > 0) return false;
  gen.stepFromX = gen.x;
  gen.stepFromY = gen.y;
  gen.x = nx;
  gen.y = ny;
  gen.slide = { dir, stepRemaining: state.config.generator.kickStepTicks };
  events.push({ type: 'generatorKicked', generatorId: gen.id });
  return true;
}

// ------------------------------------------------------------------ carry / drop / punch

/** LEGACY contextual action: carry or drop (Grip), punch (Gloves). V2 normal play punches by walking into a generator. */
export function performAction(state: GameState, p: Player, events: SimEvent[]): void {
  if (!isActing(state, p) || p.entryUntil !== null) return;

  if (p.carrying !== null) {
    const gen = state.generators.find((g) => g.id === p.carrying);
    if (!gen) {
      p.carrying = null;
      return;
    }
    if (p.contact === 'punch') throwGenerator(state, p, gen, events);
    else dropGenerator(state, p, gen, events);
    return;
  }

  const target = findInteractTarget(state, p);
  if (!target || target.slide) return;
  if (p.grip) pickUpGenerator(state, p, target, events);
  else if (p.contact === 'punch') throwGenerator(state, p, target, events);
}

function pickUpGenerator(state: GameState, p: Player, gen: Generator, events: SimEvent[]): void {
  gen.carriedBy = p.id;
  p.carrying = gen.id;
  let bonus = false;
  // LOCKED RULE: exactly +1s on the FIRST successful pickup of a timed generator, never again.
  if (!gen.carryBonusUsed && gen.mode === 'timed') {
    gen.timer += state.config.generator.carryBonusTicks;
    gen.carryBonusUsed = true;
    bonus = true;
  }
  gen.x = p.x;
  gen.y = p.y;
  gen.stepFromX = p.stepFromX;
  gen.stepFromY = p.stepFromY;
  events.push({ type: 'generatorCarried', generatorId: gen.id, playerId: p.id, bonus });
}

export function dropGenerator(state: GameState, p: Player, gen: Generator, events: SimEvent[]): boolean {
  if (groundedGeneratorAt(state, p.x, p.y)) return false;
  gen.carriedBy = null;
  p.carrying = null;
  gen.x = p.x;
  gen.y = p.y;
  gen.stepFromX = p.x;
  gen.stepFromY = p.y;
  events.push({ type: 'generatorDropped', generatorId: gen.id, playerId: p.id });
  return true;
}

/** Finds where a punched/thrown generator lands, or null if it cannot go anywhere. */
export function findThrowLanding(
  state: GameState,
  fromX: number,
  fromY: number,
  dir: Dir,
  ignoreId: number,
): { x: number; y: number } | null {
  const v = DIR_VEC[dir];
  const want = state.config.contact.punchDistance;
  const ok = (d: number): boolean =>
    isTileFreeForGenerator(state, fromX + v.dx * d, fromY + v.dy * d, ignoreId);
  const maxD = Math.max(state.width, state.height);
  for (let d = want; d <= maxD; d++) if (ok(d)) return { x: fromX + v.dx * d, y: fromY + v.dy * d };
  for (let d = want - 1; d >= 1; d--) if (ok(d)) return { x: fromX + v.dx * d, y: fromY + v.dy * d };
  return null;
}

/** V2 Punch contact: strike the generator in `dir` so it flies away. */
export function punchGenerator(
  state: GameState,
  p: Player,
  gen: Generator,
  dir: Dir,
  events: SimEvent[],
): boolean {
  if (!isGrounded(gen) || gen.slide) return false;
  return throwGenerator(state, p, gen, events, dir);
}

function throwGenerator(state: GameState, p: Player, gen: Generator, events: SimEvent[], dir = p.facing): boolean {
  const carried = gen.carriedBy === p.id;
  const fromX = carried ? p.x : gen.x;
  const fromY = carried ? p.y : gen.y;
  const landing = findThrowLanding(state, fromX, fromY, dir, gen.id);
  if (!landing) return false;
  if (carried) {
    gen.carriedBy = null;
    p.carrying = null;
  }
  const total = state.config.generator.throwTicks;
  gen.stepFromX = fromX;
  gen.stepFromY = fromY;
  gen.x = landing.x;
  gen.y = landing.y;
  gen.slide = null;
  gen.flight = { fromX, fromY, remaining: total, total };
  events.push({
    type: 'generatorThrown',
    generatorId: gen.id,
    playerId: p.id,
    toX: landing.x,
    toY: landing.y,
  });
  return true;
}

// ------------------------------------------------------------------ per-tick motion + timers

export function updateGeneratorMotion(state: GameState, events: SimEvent[]): void {
  for (const g of state.generators) {
    if (g.carriedBy !== null) {
      const carrier = state.players[g.carriedBy]!;
      g.x = carrier.x;
      g.y = carrier.y;
      g.stepFromX = carrier.stepFromX;
      g.stepFromY = carrier.stepFromY;
      continue;
    }
    if (g.flight) {
      g.flight.remaining--;
      if (g.flight.remaining <= 0) landGenerator(state, g, events);
      continue;
    }
    if (g.slide) {
      g.slide.stepRemaining--;
      if (g.slide.stepRemaining <= 0) {
        const v = DIR_VEC[g.slide.dir];
        const nx = g.x + v.dx;
        const ny = g.y + v.dy;
        if (isTileFreeForGenerator(state, nx, ny) && playersAt(state, nx, ny).length === 0) {
          g.stepFromX = g.x;
          g.stepFromY = g.y;
          g.x = nx;
          g.y = ny;
          g.slide.stepRemaining = state.config.generator.kickStepTicks;
        } else {
          g.slide = null;
        }
      }
    }
  }
}

function landGenerator(state: GameState, g: Generator, events: SimEvent[]): void {
  g.flight = null;
  if (
    isTileFreeForGenerator(state, g.x, g.y, g.id) &&
    !state.generators.some((o) => o !== g && isGrounded(o) && o.x === g.x && o.y === g.y)
  ) {
    return;
  }
  // Someone else claimed the landing tile mid-air: skip forward to the next free one.
  const dirs: Dir[] = ['right', 'down', 'left', 'up'];
  for (const d of dirs) {
    const v = DIR_VEC[d];
    if (isTileFreeForGenerator(state, g.x + v.dx, g.y + v.dy)) {
      g.x += v.dx;
      g.y += v.dy;
      return;
    }
  }
  events.push({ type: 'generatorDudCleaned', generatorId: g.id, x: g.x, y: g.y });
  state.generators.splice(state.generators.indexOf(g), 1);
}

/** Counts fuses down. Timed generators trigger at zero; remote ones use a failsafe; duds are cleaned away. */
export function updateGeneratorTimers(state: GameState, events: SimEvent[]): void {
  for (const g of [...state.generators]) {
    if (g.mode === 'disabled') {
      g.timer--;
      if (g.timer <= 0 && g.carriedBy === null) {
        state.generators.splice(state.generators.indexOf(g), 1);
        events.push({ type: 'generatorDudCleaned', generatorId: g.id, x: g.x, y: g.y });
      }
      continue;
    }
    // Airborne generators hold their last tick so a throw never causes a mid-air blast.
    if (g.flight && g.timer <= 1) continue;
    g.timer--;
    if (g.timer <= 0) g.triggered = true;
  }
}
