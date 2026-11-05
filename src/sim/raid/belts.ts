/**
 * Conveyor belts and moving shipments (docs/CLASSIC_RAIDS.md).
 *
 *   Belts   a player standing still on a belt tile is carried one tile in the belt's direction every `stepTicks`
 *           (all belts tick on the global clock, so it is cardinal and deterministic); anything that can walk can walk
 *           against it or off it. Blocked ahead (a crate, a wall, a generator) = it just stays put.
 *   Shipments  a crate that slides down a belt as a hazard. It is TELEGRAPHED: it appears on the belt's first tile and
 *           waits `warnTicks` (the `raidShipmentWarning` event, `RaidView.warnings`) before it starts to move, one tile
 *           per `stepTicks`. Whoever stands on its tile is hit once by `applyCampaignHit` (source 'hazard'). A wall or
 *           anything solid at the end of the belt stops it; a flame on its tile destroys it.
 */
import { DIR_VEC, tileAt, tileIndex } from '../grid';
import { Tile } from '../types';
import type { GameState, SimEvent } from '../types';
import { applyCampaignHit } from '../systems/campaignDamage';
import { beginStep, canPlayerEnter } from '../systems/stepping';
import { playerStepTicks } from '../systems/queries';
import { RAID_TUNING } from './tuning';
import type { RaidBeltState, RaidShipmentState } from './types';

export function updateBelts(state: GameState, events: SimEvent[]): void {
  const r = state.raid!;
  carryPlayers(state);
  if (r.belts.length === 0) return;
  const now = state.match.playTicks;
  for (const belt of r.belts) scheduleShipments(state, belt, now, events);
  moveShipments(state, events);
  hitWithShipments(state, events);
}

/** A standing player on a belt tile is carried on the belt's clock. */
function carryPlayers(state: GameState): void {
  const r = state.raid!;
  for (const belt of r.belts) {
    if (state.tick % belt.stepTicks !== 0) continue;
    for (const p of state.players) {
      if (!p.alive || p.stepRemaining > 0 || p.entryUntil !== null) continue;
      const t = belt.tiles.find((b) => b.x === p.x && b.y === p.y);
      if (!t) continue;
      const v = DIR_VEC[t.dir];
      const nx = p.x + v.dx;
      const ny = p.y + v.dy;
      if (!canPlayerEnter(state, nx, ny, p)) continue;
      beginStep(p, nx, ny, playerStepTicks(state, p));
    }
  }
}

function scheduleShipments(state: GameState, belt: RaidBeltState, now: number, events: SimEvent[]): void {
  const r = state.raid!;
  if (belt.nextLaunch === null) return;
  // the shipment appears (telegraph) `warnTicks` before the launch time
  if (now < belt.nextLaunch - belt.warnTicks) return;
  const live = r.shipments.filter((s) => s.beltId === belt.id).length;
  if (live >= belt.maxLive) return; // wait: the belt is busy (the next launch is not skipped, only delayed)
  const first = belt.tiles[0]!;
  const id = `shipment-${r.nextShipmentId++}`;
  const wait = Math.max(belt.warnTicks, belt.nextLaunch - now); // never less than the full telegraph
  const goTick = state.tick + wait;
  const s: RaidShipmentState = {
    id,
    beltId: belt.id,
    index: 0,
    x: first.x,
    y: first.y,
    dir: first.dir,
    phase: 'warn',
    goTick,
    nextTick: goTick + belt.stepTicks,
    hit: [],
  };
  r.shipments.push(s);
  belt.nextLaunch = now + wait + belt.everyTicks;
  events.push({
    type: 'raidShipmentWarning',
    shipmentId: id,
    beltId: belt.id,
    tiles: belt.tiles.map((t) => tileIndex(state, t.x, t.y)),
    warnTicks: wait,
  });
}

function moveShipments(state: GameState, events: SimEvent[]): void {
  const r = state.raid!;
  const keep: RaidShipmentState[] = [];
  for (const s of r.shipments) {
    const belt = r.belts.find((b) => b.id === s.beltId)!;
    if (s.phase !== 'warn' && flameOn(state, s.x, s.y)) {
      events.push({
        type: 'cargoDestroyed',
        id: s.id,
        kind: 'crate',
        x: s.x,
        y: s.y,
        marked: false,
        byId: null,
      });
      continue;
    }
    if (s.phase === 'warn' && state.tick >= s.goTick) s.phase = 'moving';
    if (s.phase === 'moving' && state.tick >= s.nextTick) {
      const next = belt.tiles[s.index + 1];
      if (next && tileAt(state, next.x, next.y) === Tile.Empty) {
        s.index++;
        s.x = next.x;
        s.y = next.y;
        s.dir = next.dir;
        s.nextTick = state.tick + belt.stepTicks;
      } else {
        s.phase = 'stopped'; // the wall (or a crate) at the end of the belt
        s.nextTick = state.tick + RAID_TUNING.shipmentRestTicks;
      }
    }
    if (s.phase === 'stopped' && state.tick >= s.nextTick) continue;
    keep.push(s);
  }
  r.shipments = keep;
}

function flameOn(state: GameState, x: number, y: number): boolean {
  return state.flames.some(
    (f) => f.x === x && f.y === y && state.tick >= f.startTick && state.tick < f.endTick,
  );
}

/** A moving shipment hits each player on its tile once. */
function hitWithShipments(state: GameState, events: SimEvent[]): void {
  const r = state.raid!;
  for (const s of r.shipments) {
    if (s.phase !== 'moving') continue;
    const belt = r.belts.find((b) => b.id === s.beltId)!;
    for (const p of state.players) {
      if (!p.alive || p.x !== s.x || p.y !== s.y || s.hit.includes(p.id)) continue;
      s.hit.push(p.id);
      applyCampaignHit(
        state,
        {
          victimId: p.id,
          byId: null,
          source: 'hazard',
          damage: belt.damage,
          dazeTicks: belt.dazeTicks,
          knockback: { dir: s.dir, tiles: 1 },
        },
        events,
      );
    }
  }
}
