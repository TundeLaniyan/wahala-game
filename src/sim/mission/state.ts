/**
 * Builds the `MissionState` of a freshly created mission match (called by `createGame`): seats and roles, the crew at
 * their posts, the board prepared around every node, phase 1's nodes.
 */
import type { ArenaDef } from '../arenas/types';
import { tileIndex } from '../grid';
import { Tile } from '../types';
import type { GameState, Player } from '../types';
import { crewOf } from './build';
import { makeCtx } from './ctx';
import { DEFAULT_LIVES, MISSION_DEFS, PLAYER_FACTION_ID } from './defs';
import type { MissionDef } from './defs';
import { OBJECTIVES } from './objectives';
import { activeModifiers, resolveTuning } from './tuning';
import { matchLevel } from './boss';
import { inSector } from './sector';
import type { MissionSeat, MissionSpec, MissionState } from './types';

/** Open authored floor: the only ground a post, a node or a respawned crew member stands on. */
export function isOpenFloor(arena: ArenaDef, x: number, y: number): boolean {
  const c = arena.layout[y]?.[x];
  return c === '.' || c === '_';
}

/** Every node tile of every phase of a mission (for the board preparation and the data tests). */
export function allNodeTiles(def: MissionDef): [number, number][] {
  const out: [number, number][] = [];
  for (const p of def.phases) {
    for (const n of p.nodes) out.push([n.x, n.y]);
    if (p.press) out.push([p.press.x, p.press.y]);
  }
  return out;
}

/** The nearest open floor tile to (x, y) that is not claimed (rings of growing Manhattan distance, then row, then column). */
export function snapToFloor(
  arena: ArenaDef,
  x: number,
  y: number,
  claimed: ReadonlySet<string>,
  allowed: (x: number, y: number) => boolean = () => true,
): [number, number] {
  for (let r = 0; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (isOpenFloor(arena, tx, ty) && !claimed.has(`${tx},${ty}`) && allowed(tx, ty)) return [tx, ty];
      }
    }
  }
  throw new Error(`no open floor near ${x},${y} on ${arena.id}`);
}

function clearAround(state: GameState, x: number, y: number, radius: number): void {
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) continue;
      const i = tileIndex(state, tx, ty);
      if (state.tiles[i] === Tile.Soft) {
        state.tiles[i] = Tile.Empty;
        delete state.hidden[i];
      }
    }
}

function place(state: GameState, p: Player, x: number, y: number): void {
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
  p.facing = x < state.width / 2 ? 'right' : 'left';
}

export function createMissionState(state: GameState, arena: ArenaDef, spec: MissionSpec): MissionState {
  const def = MISSION_DEFS[spec.id];
  const crew = crewOf(def, spec);
  if (state.players.length !== 2 + crew.length) {
    throw new Error(`mission ${spec.id} needs ${2 + crew.length} competitors, got ${state.players.length}`);
  }
  const tuning = resolveTuning(def, spec, matchLevel(state)); // the boss recipe at the campaign level (BX1)

  // the board around every node is open floor (a crate on a node tile would make the objective impossible)
  for (const [x, y] of allNodeTiles(def)) clearAround(state, x, y, 1);
  const claimed = new Set<string>(allNodeTiles(def).map(([x, y]) => `${x},${y}`));
  const human = state.players[0]!;
  // a boss mission played in a sector (decision FN7): the human starts on the mission's own tile, and every seat snaps
  // to free floor inside the sector, never onto a barricade (no sector: the arena spawn, snapping unchanged)
  const allowed = state.sector
    ? (x: number, y: number): boolean =>
        inSector(state, x, y) && state.tiles[tileIndex(state, x, y)] !== Tile.Hard
    : undefined;
  if (def.start) {
    const [hx, hy] = snapToFloor(arena, def.start[0], def.start[1], claimed, allowed);
    place(state, human, hx, hy);
    clearAround(state, hx, hy, 1);
  }
  claimed.add(`${human.x},${human.y}`);

  const seats: MissionSeat[] = [
    {
      playerId: 0,
      role: 'player',
      factionId: PLAYER_FACTION_ID,
      characterId: human.characterId,
      name: human.name,
    },
  ];
  const bossPlayer = state.players[1]!;
  const [bx, by] = snapToFloor(arena, def.boss.post[0], def.boss.post[1], claimed, allowed);
  claimed.add(`${bx},${by}`);
  place(state, bossPlayer, bx, by);
  clearAround(state, bx, by, 1);
  // presentation only (FN8): the look the boss is drawn in; with no `enemyKind` no rule reads it
  if (def.boss.look) bossPlayer.enemyVariant = def.boss.look;
  seats.push({
    playerId: 1,
    role: 'boss',
    factionId: def.factionId,
    characterId: bossPlayer.characterId,
    name: bossPlayer.name,
    post: { x: bx, y: by },
    radius: def.boss.radius,
  });
  crew.forEach((c, i) => {
    const p = state.players[2 + i]!;
    const [x, y] = snapToFloor(arena, c.post[0], c.post[1], claimed, allowed);
    claimed.add(`${x},${y}`);
    place(state, p, x, y);
    clearAround(state, x, y, 1);
    seats.push({
      playerId: p.id,
      role: c.role,
      factionId: def.factionId,
      characterId: p.characterId,
      name: p.name,
      post: { x, y },
      ...(c.radius !== undefined ? { radius: c.radius } : {}),
      ...(c.anchor !== undefined ? { anchor: c.anchor } : {}),
    });
  });

  // the dispatch-windows mission schedules its own railcars (the windows): the arena's scheduled trains stand down
  if (def.objective === 'dispatchWindows') {
    getTrainIndices(arena).forEach((i) => {
      state.stage.nextAt[i] = Infinity;
    });
  }

  const m: MissionState = {
    id: spec.id,
    objective: def.objective,
    modifiers: activeModifiers(spec),
    difficulty: spec.difficulty ?? 'rookie',
    seats,
    bossId: 1,
    tuning,
    phase: 0,
    phaseState: 'active',
    phaseStartTick: 0,
    phasesCleared: 0,
    nodes: [],
    strikes: [],
    rail: null,
    sequence: [],
    seqIndex: 0,
    carry: null,
    delivered: 0,
    pulseAt: -1,
    boss: {
      shielded: true,
      exposedUntil: 0,
      exposures: 0,
      defeated: false,
      hp: tuning.boss!.hits,
      maxHits: tuning.boss!.hits,
      exposedAt: 0,
      windowTicks: 0,
      interrupts: 0,
      anchor: null,
      pendingHit: null,
    },
    livesUsed: 0,
    livesMax: Math.max(1, Math.floor(spec.lives ?? DEFAULT_LIVES)),
    reinforcements: [],
    reinforcementsUsed: 0,
    announced: false,
    outcome: null,
    callout: tuning.phases[0].callout,
  };
  state.mission = m;
  const ctx = makeCtx(state, []);
  OBJECTIVES[def.objective].setup(ctx);
  m.callout = OBJECTIVES[def.objective].callout?.(ctx) ?? ctx.pd.callout;
  return m;
}

function getTrainIndices(arena: ArenaDef): number[] {
  const out: number[] = [];
  arena.stageHazards.forEach((h, i) => {
    if (h.kind === 'sweep' && h.style === 'train') out.push(i);
  });
  return out;
}

/** Shifts the timers built at tick 0 to the first playing tick (the countdown has passed since). */
export function rebaseTimers(m: MissionState, start: number): void {
  for (const n of m.nodes) if (n.nextPulse >= 0) n.nextPulse += start;
  if (m.pulseAt >= 0) m.pulseAt += start;
  if (m.rail) m.rail.nextCycleAt += start;
  m.phaseStartTick = start;
}
