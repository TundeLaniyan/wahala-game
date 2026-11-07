/**
 * Builds the `MissionState` of a SECTION field mission (called by `createGame` when `MissionSpec.fieldId` is set): the
 * human on the start tile, the enemy groups at their posts, open floor around every marker, door and post, and the
 * first leg's nodes. The boss missions use `createMissionState` (state.ts) and are not touched.
 */
import { ticks } from '../config';
import type { ArenaDef } from '../arenas/types';
import { tileIndex } from '../grid';
import { Tile } from '../types';
import type { GameState, Player } from '../types';
import { DEFAULT_LIVES, BASE_PHASE, PLAYER_FACTION_ID, FACTION_IDS } from './defs';
import { getFieldMission } from './fieldDefs';
import type { FieldMissionDef } from './fieldDefs';
import { enterLeg } from './field';
import { fieldEnemiesOf } from './combatPilot';
import { snapToFloor } from './state';
import type { FieldRuntime, MissionSeat, MissionSpec, MissionState, PhaseTuning } from './types';

/** Every tile a field mission relies on being open: markers, exits, doors and their return tiles, start, posts. */
export function fieldTiles(def: FieldMissionDef): [number, number][] {
  const out: [number, number][] = [
    [def.start[0], def.start[1]],
    [def.returnMarker.x, def.returnMarker.y],
  ];
  for (const leg of def.legs) {
    if (leg.kind === 'reachMarkers') for (const mk of leg.markers) out.push([mk.x, mk.y]);
    if (leg.kind === 'escapeRoute') out.push([leg.exit.x, leg.exit.y]);
  }
  for (const d of def.doors) out.push([d.x, d.y], [d.returnTile[0], d.returnTile[1]]);
  return out;
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

function placeAt(state: GameState, p: Player, x: number, y: number): void {
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
  p.facing = x < state.width / 2 ? 'right' : 'left';
}

const FIELD_PHASE: PhaseTuning = { ...BASE_PHASE, callout: '' };

export function createFieldMissionState(state: GameState, arena: ArenaDef, spec: MissionSpec): MissionState {
  const def = getFieldMission(spec.fieldId!);
  if (def.districtId !== spec.id)
    throw new Error(`field mission ${def.id} belongs to ${def.districtId}, not ${spec.id}`);
  const enemies = fieldEnemiesOf(def); // the roster plus the combat pilot's additions (decision CP11)
  if (state.players.length !== 1 + enemies.length) {
    throw new Error(
      `field mission ${def.id} needs ${1 + enemies.length} competitors, got ${state.players.length}`,
    );
  }
  for (const [x, y] of fieldTiles(def)) clearAround(state, x, y, 1);
  const claimed = new Set<string>(fieldTiles(def).map(([x, y]) => `${x},${y}`));

  const human = state.players[0]!;
  const [sx, sy] = snapToFloor(arena, def.start[0], def.start[1], new Set());
  placeAt(state, human, sx, sy);
  claimed.add(`${sx},${sy}`);
  const seats: MissionSeat[] = [
    {
      playerId: 0,
      role: 'player',
      factionId: PLAYER_FACTION_ID,
      characterId: human.characterId,
      name: human.name,
    },
  ];
  enemies.forEach((e, i) => {
    const p = state.players[1 + i]!;
    const [x, y] = snapToFloor(arena, e.post[0], e.post[1], claimed);
    claimed.add(`${x},${y}`);
    placeAt(state, p, x, y);
    clearAround(state, x, y, 1);
    seats.push({
      playerId: p.id,
      role: e.role,
      factionId: FACTION_IDS[def.districtId],
      characterId: p.characterId,
      name: p.name,
      post: { x, y },
      group: e.group,
      ...(e.radius !== undefined ? { radius: e.radius } : {}),
    });
  });

  const field: FieldRuntime = {
    fieldId: def.id,
    leg: 0,
    legStartTick: 0,
    markersDone: 0,
    checkpoint: { x: sx, y: sy },
    doors: def.doors.map((d) => ({
      id: d.id,
      x: d.x,
      y: d.y,
      label: d.label,
      raidId: d.raidId,
      required: d.required,
      returnTile: { x: d.returnTile[0], y: d.returnTile[1] },
      status: 'idle',
      hold: 0,
      attempts: 0,
      stars: 0,
      last: null,
    })),
    catchTicks: 0,
    caught: 0,
    caughtAt: -1e9,
    raidsCompleted: 0,
    raidBonus: 0,
    done: false,
  };
  const m: MissionState = {
    id: spec.id,
    objective: 'fieldRoute',
    modifiers: [],
    difficulty: spec.difficulty ?? 'rookie',
    seats,
    bossId: -1,
    tuning: {
      timeLimitTicks: spec.timeLimitSec ? ticks(spec.timeLimitSec) : ticks(def.timeLimitSec),
      parTicks: ticks(def.parSec),
      exposeTicks: 0,
      maxExposures: 0,
      reinforceMax: 0,
      carrySlowTicks: 0,
      phases: [FIELD_PHASE, FIELD_PHASE, FIELD_PHASE],
    },
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
    boss: { shielded: false, exposedUntil: 0, exposures: 0, defeated: false },
    livesUsed: 0,
    livesMax: Math.max(1, Math.floor(spec.lives ?? DEFAULT_LIVES)),
    reinforcements: [],
    reinforcementsUsed: 0,
    announced: false,
    outcome: null,
    callout: null,
    field,
    pendingRaid: null,
  };
  state.mission = m;
  enterLeg(state, m, def, []);
  return m;
}
