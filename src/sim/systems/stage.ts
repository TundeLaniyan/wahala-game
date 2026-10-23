/**
 * Stage hazards: each arena's own environmental events (see `ArenaDef.stageHazards`).
 *
 * Every scheduled hazard is telegraphed before it becomes real (lethal kinds for at least
 * `config.stage.minLethalWarnTicks`), all timing and targeting comes from the match RNG, and humans
 * and bots are treated identically. Fairness guards:
 *  - at most `config.stage.maxLethalEvents` lethal events warn or run at once (a firing that would
 *    exceed it waits a second), so overlapping events can never take every safe tile;
 *  - no new events in the last `quietRemainingTicks` of the match, or once Wahala Crush starts closing;
 *  - targeted strikes only pick a player who has a free tile to step to; drops never land within
 *    `dropMinPlayerDistance` of a player and never on a player, generator or pickup;
 *  - pushes are non-lethal slides that stop at anything a player could not walk into;
 *  - manholes only carry a player when the far end is clear and not burning, rest
 *    `teleportCooldownTicks` per player, and arriving never triggers the far end (no loops).
 */
import { getArena } from '../arenas';
import type { StageHazardDef } from '../arenas';
import { DIR_VEC, tileIndex } from '../grid';
import { nextFloat, nextInt, shuffle, weightedPick } from '../rng';
import { Tile } from '../types';
import type { GameState, PickupKind, Player, SimEvent, StageEvent } from '../types';
import type { LethalHit } from './lethality';
import { flameAt, groundedGeneratorAt, pickupAt, playersAt } from './queries';
import { beginStep } from './stepping';

const sec = (s: number): number => Math.round(s * 60);
const LETHAL = new Set<StageEvent['kind']>(['sweep', 'strike']);

export function isLethalStageEvent(e: Pick<StageEvent, 'kind'>): boolean {
  return LETHAL.has(e.kind);
}

/** Runs the arena's scheduled hazards for one playing tick. Lethal hits go into `hits`. */
export function updateStage(state: GameState, hits: LethalHit[], events: SimEvent[]): void {
  const st = state.stage;
  if (!st.enabled) return;
  const defs = getArena(state.arenaId).stageHazards;
  if (defs.length > 0) schedule(state, defs, events);
  for (const ev of [...st.events]) advance(state, ev, hits, events);
}

// ------------------------------------------------------------------ scheduling

function quiet(state: GameState): boolean {
  const remaining = state.config.match.durationTicks - state.match.playTicks;
  if (remaining <= state.config.stage.quietRemainingTicks) return true;
  const crush = state.crush;
  return crush !== null && crush.warnAt.length > 0 && state.match.playTicks >= crush.warnAt[0]!;
}

function schedule(state: GameState, defs: readonly StageHazardDef[], events: SimEvent[]): void {
  const st = state.stage;
  const now = state.match.playTicks;
  defs.forEach((def, i) => {
    if (def.kind === 'teleport' || now < st.nextAt[i]!) return;
    if (quiet(state)) {
      st.nextAt[i] = Infinity;
      return;
    }
    const lethal = def.kind === 'sweep' || def.kind === 'strike';
    const running = st.events.filter(isLethalStageEvent).length;
    if (lethal && running >= state.config.stage.maxLethalEvents) {
      st.nextAt[i] = now + 60; // try again in a second
      return;
    }
    const [lo, hi] = def.everySec;
    st.nextAt[i] = now + sec(lo) + nextInt(state, Math.max(1, sec(hi) - sec(lo) + 1));
    const ev = create(state, def, i);
    if (!ev) return;
    st.events.push(ev);
    events.push({ type: 'stageWarning', event: { ...ev, tiles: [...ev.tiles] } });
  });
}

function create(state: GameState, def: StageHazardDef, hazard: number): StageEvent | null {
  if (def.kind === 'teleport') return null;
  const lethal = def.kind === 'sweep' || def.kind === 'strike';
  const warn = Math.max(sec(def.warnSec), lethal ? state.config.stage.minLethalWarnTicks : 1);
  const base: StageEvent = {
    id: state.nextId++,
    hazard,
    kind: def.kind,
    style: def.style,
    tiles: [],
    dir: null,
    warnTick: state.tick,
    startTick: state.tick + warn,
    endTick: state.tick + warn + 1,
    eventId: lethal ? state.nextEventId++ : 0,
    index: -1,
    stepRemaining: 0,
    stepTicks: 0,
  };
  const idx = ([x, y]: readonly [number, number]): number => tileIndex(state, x, y);
  const notHard = (i: number): boolean => state.tiles[i] !== Tile.Hard;

  switch (def.kind) {
    case 'sweep': {
      const route = def.routes[nextInt(state, def.routes.length)]!.map(idx);
      if (route.length === 0 || !notHard(route[0]!)) return null;
      base.tiles = route;
      base.stepTicks = def.stepTicks;
      base.endTick = base.startTick + def.stepTicks * route.length;
      const [a, b] = [route[0]!, route[1] ?? route[0]!];
      base.dir = dirOf(state, a, b);
      return base;
    }
    case 'strike': {
      if (def.targetPlayers) {
        const candidates = state.players.filter((p) => p.alive && hasEscape(state, p));
        if (candidates.length === 0) return null;
        const p = candidates[nextInt(state, candidates.length)]!;
        base.tiles = [tileIndex(state, p.x, p.y)];
      } else {
        if (def.zones.length === 0) return null;
        base.tiles = def.zones[nextInt(state, def.zones.length)]!.map(idx).filter(notHard);
      }
      if (base.tiles.length === 0) return null;
      base.endTick = base.startTick + Math.max(1, sec(def.activeSec));
      return base;
    }
    case 'push': {
      const zone = def.zones[nextInt(state, def.zones.length)]!;
      base.tiles = zone.tiles.map(idx).filter(notHard);
      base.dir = zone.dir;
      return base.tiles.length > 0 ? base : null;
    }
    case 'drop': {
      const min = state.config.stage.dropMinPlayerDistance;
      const layout = getArena(state.arenaId).layout;
      const busy = new Set(state.stage.events.flatMap((e) => e.tiles));
      const open: number[] = [];
      for (let i = 0; i < state.tiles.length; i++) {
        const x = i % state.width;
        const y = Math.floor(i / state.width);
        if (state.tiles[i] !== Tile.Empty || layout[y]![x] === '=' || busy.has(i)) continue;
        if (state.floorHazards[i] !== undefined || groundedGeneratorAt(state, x, y) || pickupAt(state, x, y))
          continue;
        if (state.players.some((p) => p.alive && Math.abs(p.x - x) + Math.abs(p.y - y) < min)) continue;
        open.push(i);
      }
      base.tiles = shuffle(state, open).slice(0, def.count);
      return base.tiles.length > 0 ? base : null;
    }
  }
}

function dirOf(state: GameState, a: number, b: number): StageEvent['dir'] {
  const dx = (b % state.width) - (a % state.width);
  const dy = Math.floor(b / state.width) - Math.floor(a / state.width);
  if (dx > 0) return 'right';
  if (dx < 0) return 'left';
  if (dy > 0) return 'down';
  if (dy < 0) return 'up';
  return null;
}

/** Whether a player has at least one neighbouring tile they could walk to right now. */
function hasEscape(state: GameState, p: Player): boolean {
  return Object.values(DIR_VEC).some(({ dx, dy }) => {
    const x = p.x + dx;
    const y = p.y + dy;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return false;
    return state.tiles[tileIndex(state, x, y)] === Tile.Empty && !groundedGeneratorAt(state, x, y);
  });
}

// ------------------------------------------------------------------ running events

function finish(state: GameState, ev: StageEvent, events: SimEvent[]): void {
  state.stage.events.splice(state.stage.events.indexOf(ev), 1);
  events.push({ type: 'stageEnded', eventId: ev.eventId, id: ev.id });
}

function advance(state: GameState, ev: StageEvent, hits: LethalHit[], events: SimEvent[]): void {
  const t = state.tick;
  if (t < ev.startTick) return;
  if (t === ev.startTick) events.push({ type: 'stageStarted', event: { ...ev, tiles: [...ev.tiles] } });

  switch (ev.kind) {
    case 'sweep':
      advanceSweep(state, ev, hits, events);
      return;
    case 'strike':
      if (t >= ev.endTick) return finish(state, ev, events);
      strikeTiles(state, ev, ev.tiles, ev.endTick, hits);
      return;
    case 'push':
      if (t === ev.startTick) push(state, ev, events);
      if (t >= ev.endTick) finish(state, ev, events);
      return;
    case 'drop':
      if (t === ev.startTick) drop(state, ev, events);
      if (t >= ev.endTick) finish(state, ev, events);
      return;
  }
}

function strikeTiles(state: GameState, ev: StageEvent, tiles: number[], graceUntil: number, hits: LethalHit[]): void {
  for (const p of state.players) {
    if (!p.alive || !tiles.includes(tileIndex(state, p.x, p.y))) continue;
    hits.push({
      playerId: p.id,
      eventId: ev.eventId,
      cause: { kind: 'hazard', style: ev.style, eventId: ev.eventId },
      graceUntil: Math.max(graceUntil, state.tick + state.config.okada.graceTicks),
    });
  }
}

function advanceSweep(state: GameState, ev: StageEvent, hits: LethalHit[], events: SimEvent[]): void {
  if (ev.index < 0) {
    ev.index = 0;
    ev.stepRemaining = ev.stepTicks;
    const i = ev.tiles[0]!;
    events.push({ type: 'stageSweepStep', id: ev.id, x: i % state.width, y: Math.floor(i / state.width) });
  } else if (--ev.stepRemaining <= 0) {
    const next = ev.tiles[ev.index + 1];
    if (next === undefined || state.tiles[next] !== Tile.Empty) {
      ev.endTick = state.tick;
      return finish(state, ev, events);
    }
    ev.index++;
    ev.stepRemaining = ev.stepTicks;
    events.push({ type: 'stageSweepStep', id: ev.id, x: next % state.width, y: Math.floor(next / state.width) });
  }
  const cur = ev.tiles[ev.index]!;
  const lethal = [cur];
  // the body still covers the tile it is leaving for the first half of each step
  if (ev.index > 0 && ev.stepRemaining > ev.stepTicks / 2) lethal.push(ev.tiles[ev.index - 1]!);
  strikeTiles(state, ev, lethal, state.tick + state.config.okada.graceTicks, hits);
  const cx = cur % state.width;
  const cy = Math.floor(cur / state.width);
  for (const g of state.generators) {
    // like a player's vehicle: a generator in its path is set off (duds included)
    if (g.carriedBy === null && g.flight === null && g.x === cx && g.y === cy) g.triggered = true;
  }
}

function push(state: GameState, ev: StageEvent, events: SimEvent[]): void {
  const zone = new Set(ev.tiles);
  const dir = ev.dir!;
  for (const p of state.players) {
    if (!p.alive || !zone.has(tileIndex(state, p.x, p.y))) continue;
    // a slide of one tile, taken at the player's next step boundary like an oil slide
    p.slide = { dir, remaining: 1 };
  }
  const def = getArena(state.arenaId).stageHazards[ev.hazard];
  if (def?.kind !== 'push' || !def.douse) return;
  for (const g of state.generators) {
    if (g.carriedBy !== null || g.flight !== null || g.mode === 'disabled') continue;
    if (!zone.has(tileIndex(state, g.x, g.y))) continue;
    g.mode = 'disabled';
    g.timer = state.config.generator.disabledCleanupTicks;
    events.push({ type: 'generatorDoused', generatorId: g.id });
  }
}

function drop(state: GameState, ev: StageEvent, events: SimEvent[]): void {
  for (const i of ev.tiles) {
    const x = i % state.width;
    const y = Math.floor(i / state.width);
    if (state.tiles[i] !== Tile.Empty || playersAt(state, x, y).length > 0) continue;
    if (state.generators.some((g) => g.x === x && g.y === y) || pickupAt(state, x, y)) continue;
    state.tiles[i] = Tile.Soft;
    if (nextFloat(state) < state.config.pickups.hiddenChance) {
      state.hidden[i] = weightedPick<PickupKind>(state, state.config.pickups.weights);
    }
    events.push({ type: 'stageBlockDropped', x, y, style: ev.style });
  }
}

// ------------------------------------------------------------------ manholes

const partnerCache = new Map<string, Map<number, number>>();

/** Trapdoor partner of each manhole tile index (empty when the arena has none). */
export function manholePartners(state: Pick<GameState, 'arenaId' | 'width'>): Map<number, number> {
  const key = `${state.arenaId}:${state.width}`;
  let map = partnerCache.get(key);
  if (!map) {
    map = new Map();
    for (const def of getArena(state.arenaId).stageHazards) {
      if (def.kind !== 'teleport') continue;
      for (const [[ax, ay], [bx, by]] of def.pairs) {
        const a = ay * state.width + ax;
        const b = by * state.width + bx;
        map.set(a, b);
        map.set(b, a);
      }
    }
    partnerCache.set(key, map);
  }
  return map;
}

/** A step that STARTED onto a manhole this tick arms a trip to its partner (taken when the step completes). */
export function armTeleports(state: GameState): void {
  if (!state.stage.enabled) return;
  const partners = manholePartners(state);
  if (partners.size === 0) return;
  for (const p of state.players) {
    if (!p.alive || p.stepTotal === 0 || p.stepRemaining !== p.stepTotal) continue;
    const to = partners.get(tileIndex(state, p.x, p.y));
    if (to === undefined || state.tick < p.teleportReadyTick) {
      p.teleportPending = null;
      continue;
    }
    p.teleportPending = { toX: to % state.width, toY: Math.floor(to / state.width) };
  }
}

/**
 * Called by the movement system the tick a step completes: carries the player through an armed
 * manhole. Returns true when the player was moved (they take no input this tick).
 */
export function resolveTeleport(state: GameState, p: Player, events: SimEvent[]): boolean {
  const trip = p.teleportPending;
  p.teleportPending = null;
  if (!trip) return false;
  const { toX, toY } = trip;
  const i = tileIndex(state, toX, toY);
  const lethalThere = state.stage.events.some(
    (e) => isLethalStageEvent(e) && state.tick >= e.warnTick && e.tiles.includes(i),
  );
  if (state.tiles[i] !== Tile.Empty || groundedGeneratorAt(state, toX, toY) || flameAt(state, toX, toY) || lethalThere)
    return false;
  const fromX = p.x;
  const fromY = p.y;
  // an instant move (no interpolation): stepTotal 1 / remaining 0 also means no trap or manhole fires on arrival
  beginStep(p, toX, toY, 0);
  p.stepFromX = toX;
  p.stepFromY = toY;
  p.stepTotal = 1;
  p.slide = null;
  p.dazedUntil = Math.max(p.dazedUntil, state.tick + state.config.stage.teleportArriveTicks);
  p.teleportReadyTick = state.tick + state.config.stage.teleportCooldownTicks;
  if (p.carrying !== null) {
    const gen = state.generators.find((g) => g.id === p.carrying);
    if (gen) {
      gen.x = gen.stepFromX = toX;
      gen.y = gen.stepFromY = toY;
    }
  }
  events.push({ type: 'playerTeleported', playerId: p.id, fromX, fromY, toX, toY });
  return true;
}
