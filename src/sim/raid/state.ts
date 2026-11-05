/**
 * Builds the `RaidState` of a freshly created raid match (called by `createGame`): cargo, doors, rooms, belts, waves,
 * and the seats (seat 0 the human, the enemy seats dormant until their wave).
 */
import type { ArenaDef } from '../arenas/types';
import type { GameState, Player } from '../types';
import { ticks } from '../config';
import { RAID_DEFS } from './defs';
import { enemyMaxHp } from './enemies';
import { enemySeats, parseRaidLayout } from './layout';
import type { RaidSpec, RaidState, RaidWaveState } from './types';

function newVitals(hp: number, maxHp: number): NonNullable<Player['vitals']> {
  return { hp, maxHp, invulnUntil: 0, lastHitTick: -1, lastHitBy: null, lastHitSource: null };
}

export function createRaidState(state: GameState, _arena: ArenaDef, spec: RaidSpec): RaidState {
  const def = RAID_DEFS[spec.raidId];
  const parsed = parseRaidLayout(def);
  const seatPlans = enemySeats(def);
  if (state.players.length !== 1 + seatPlans.length) {
    throw new Error(
      `raid ${spec.raidId} needs ${1 + seatPlans.length} competitors, got ${state.players.length}`,
    );
  }

  // the human: health from the field mission (or full), the raid's bombs
  const maxHp = Math.max(1, spec.maxHp ?? def.humanMaxHp);
  const hp = Math.max(1, Math.min(maxHp, spec.hp ?? maxHp));
  const human = state.players[0]!;
  human.vitals = newVitals(hp, maxHp);

  // the enemies: dormant seats, no generator economy, their kind's health
  const seats: RaidState['seats'] = [];
  const groups: number[][] = def.waves.map(() => []);
  const roomGroups = new Map<string, number[]>();
  seatPlans.forEach((plan, i) => {
    const p = state.players[i + 1]!;
    p.enemyKind = plan.kind;
    p.vitals ??= newVitals(enemyMaxHp(plan.kind), enemyMaxHp(plan.kind));
    p.team = 1;
    p.capacity = 0;
    p.alive = false;
    p.x = p.stepFromX = plan.at.x;
    p.y = p.stepFromY = plan.at.y;
    seats.push({
      playerId: p.id,
      kind: plan.kind,
      wave: plan.wave,
      room: plan.room,
      spot: plan.at,
      active: false,
    });
    if (plan.room) roomGroups.set(plan.room, [...(roomGroups.get(plan.room) ?? []), p.id]);
    else groups[plan.wave]!.push(p.id);
  });
  human.team = 0;

  const waves: RaidWaveState[] = def.waves.map((w, i) => ({
    name: w.name,
    trigger: w.trigger,
    seatIds: groups[i]!,
    startedTick: null,
    activated: false,
    clearedTick: null,
  }));
  for (const room of def.rooms) {
    const ids = roomGroups.get(room.id);
    if (!ids) continue;
    waves.push({
      name: room.name,
      trigger: { kind: 'doorOpened', door: room.door },
      seatIds: ids,
      startedTick: null,
      activated: false,
      clearedTick: null,
      room: room.id,
    });
  }

  const doors = parsed.doors.map((d) => ({
    id: d.def.id,
    x: d.x,
    y: d.y,
    open: false,
    openedTick: null,
    opensWhen: d.def.opensWhen,
    hint: d.def.hint,
    room: def.rooms.find((r) => r.door === d.def.id)?.id ?? null,
  }));

  const rooms = def.rooms.map((r) => {
    const bonus = parsed.bonuses.find(
      (b) => b.x >= r.rect[0] && b.x <= r.rect[2] && b.y >= r.rect[1] && b.y <= r.rect[3],
    )!;
    return {
      id: r.id,
      name: r.name,
      doorId: r.door,
      opened: false,
      completed: false,
      bonus: { kind: bonus.kind, x: bonus.x, y: bonus.y, taken: false },
      seatIds: roomGroups.get(r.id) ?? [],
      activated: false,
    };
  });

  const belts = parsed.belts.map((b, i) => {
    const c = def.conveyors[i]!;
    const s = c.shipments;
    return {
      id: b.id,
      tiles: b.tiles.map((t) => ({ ...t })),
      stepTicks: c.stepTicks,
      nextLaunch: s ? s.firstTick : null,
      everyTicks: s?.everyTicks ?? 0,
      warnTicks: s?.warnTicks ?? 0,
      damage: s?.damage ?? 0,
      dazeTicks: s?.dazeTicks ?? 0,
      maxLive: s?.maxLive ?? 0,
    };
  });

  // marked cargo, crates and barrels are soft tiles of the arena layout ('x'); the entity adds the hit points
  const limitSec = spec.timeLimitSec ?? def.timeLimitSec;
  return {
    raidId: spec.raidId,
    announced: false,
    stage: 'cargo',
    cargo: parsed.cargo.map((c) => ({
      id: c.id,
      kind: c.kind,
      x: c.x,
      y: c.y,
      hp: c.hp,
      maxHp: c.hp,
      marked: c.marked,
      destroyed: false,
    })),
    doors,
    rooms,
    belts,
    shipments: [],
    waves,
    seats,
    switches: parsed.switches.map((s) => ({ ...s, pressed: false })),
    barrelBlasts: [],
    extraction: { ...parsed.extraction, open: false },
    entrance: { ...parsed.entrance },
    livesUsed: 0,
    livesMax: Math.max(1, spec.lives ?? def.lives),
    maxHp,
    deathSeen: null,
    respawnAt: null,
    bonusStars: 0,
    nextShipmentId: 1,
    timeLimitTicks: ticks(limitSec),
    parTicks: ticks(Math.min(def.parSec, limitSec - 1)),
    objective: def.objective,
    outcome: null,
  };
}
