/**
 * Locked areas and opened routes, switches, optional side rooms and their bonuses.
 *
 * A closed door is a wall (`Tile.Hard`: flames and walkers stop at it). It opens when its condition is met and stays open
 * for the rest of the raid (route changes are permanent): `raidDoorOpened`, and for a side room's door also
 * `raidRoomOpened`. Side rooms are never required: their bonus (a health segment, an Armour plate, a star token) is
 * picked up by walking onto its tile (`raidBonusTaken`).
 */
import { tileIndex } from '../grid';
import { Tile } from '../types';
import type { GameState, SimEvent } from '../types';
import type { DoorCondition } from './def';
import { RAID_TUNING } from './tuning';
import type { RaidState } from './types';

function conditionMet(state: GameState, r: RaidState, c: DoorCondition): boolean {
  switch (c.kind) {
    case 'cargoDestroyed': {
      const marked = r.cargo.filter((q) => q.marked);
      return marked.filter((q) => q.destroyed).length >= (c.count ?? marked.length);
    }
    case 'destroyed':
      return r.cargo.find((q) => q.id === c.id)?.destroyed === true;
    case 'waveCleared':
      return r.waves[c.wave]?.clearedTick != null;
    case 'switch':
      return r.switches[c.index]?.pressed === true;
    case 'lieutenantDown': {
      const ls = r.seats.filter((s) => s.kind === 'lieutenant');
      return ls.length > 0 && ls.every((s) => s.active && !state.players[s.playerId]!.alive);
    }
    case 'doorOpened':
      return r.doors.find((d) => d.id === c.door)?.open === true;
  }
}

/** The human stepping on a switch presses it for good. */
export function updateSwitches(state: GameState): void {
  const r = state.raid!;
  const human = state.players[0]!;
  if (!human.alive) return;
  for (const s of r.switches) {
    if (!s.pressed && human.x === s.x && human.y === s.y) s.pressed = true;
  }
}

export function updateDoors(state: GameState, events: SimEvent[]): void {
  const r = state.raid!;
  for (const door of r.doors) {
    if (door.open || !conditionMet(state, r, door.opensWhen)) continue;
    door.open = true;
    door.openedTick = state.tick;
    state.tiles[tileIndex(state, door.x, door.y)] = Tile.Empty;
    events.push({ type: 'raidDoorOpened', id: door.id, x: door.x, y: door.y });
    const room = r.rooms.find((q) => q.doorId === door.id);
    if (room && !room.opened) {
      room.opened = true;
      events.push({ type: 'raidRoomOpened', id: room.id });
    }
  }
}

/** Walking onto the bonus tile of an opened side room takes it. */
export function updateBonuses(state: GameState, events: SimEvent[]): void {
  const r = state.raid!;
  const human = state.players[0]!;
  for (const room of r.rooms) {
    if (!room.opened) continue;
    const b = room.bonus;
    if (!b.taken && human.alive && human.stepRemaining === 0 && human.x === b.x && human.y === b.y) {
      b.taken = true;
      if (b.kind === 'heal' && human.vitals)
        human.vitals.hp = Math.min(human.vitals.maxHp, human.vitals.hp + RAID_TUNING.healBonus);
      else if (b.kind === 'armour')
        human.armour = Math.min(state.config.protection.maxArmour, human.armour + 1);
      else if (b.kind === 'star') r.bonusStars++;
      events.push({ type: 'raidBonusTaken', roomId: room.id, kind: b.kind, x: b.x, y: b.y });
    }
    const groupDown = room.seatIds.every((id) => !state.players[id]!.alive);
    room.completed = b.taken && (room.seatIds.length === 0 || (room.activated && groupDown));
  }
}
