/**
 * Conveyor belts and moving shipments (docs/CLASSIC_RAIDS.md, decisions RD5-RD6): belts carry a standing player one tile
 * per `stepTicks` (cardinal), a shipment is telegraphed (`raidShipmentWarning`, `RaidView.warnings`) for at least the minimum
 * warning before it moves, it damages through `applyCampaignHit` (source 'hazard') once per victim, a wall stops it and a
 * blast destroys it. The depot's east lane: belt x = 14, y 5..9 ('v'), 24 ticks per tile, the first shipment at tick 600.
 */
import { describe, expect, it } from 'vitest';
import { raidView, tick } from '../src/sim';
import { RAID_TUNING } from '../src/sim/raid';
import { advance, explodeAt, newRaid, of, put, until } from './raid-helpers';

const STEP = 24;

describe('belts carry', () => {
  it('a player standing on a belt is carried one tile per step, in the belt direction, and stops at the wall', () => {
    const state = newRaid();
    put(state, 0, 14, 5);
    const human = state.players[0]!;
    const seen: number[] = [];
    for (let i = 0; i < STEP * 6; i++) {
      tick(state, {});
      if (seen[seen.length - 1] !== human.y) seen.push(human.y);
      expect(human.x).toBe(14); // cardinal: never sideways
    }
    expect(seen).toEqual([5, 6, 7, 8, 9]); // (14,10) is concrete: he waits at the end of the belt
  });

  it('a player who walks is not carried, and may walk against the belt', () => {
    const state = newRaid();
    put(state, 0, 14, 7);
    const human = state.players[0]!;
    advance(state, STEP * 4, { 0: { move: 'up' } });
    expect(human.y).toBeLessThan(7); // walking up the belt beats the belt
    put(state, 0, 14, 6);
    advance(state, 40, { 0: { move: 'left' } });
    expect(human.x).toBe(13);
    const y = human.y;
    advance(state, STEP * 3);
    expect([human.x, human.y]).toEqual([13, y]); // off the belt: stays put
  });

  it('a generator in front of a rider stops the belt from carrying him', () => {
    const state = newRaid();
    put(state, 0, 14, 6);
    state.generators.push({
      id: state.nextId++,
      ownerId: 1,
      x: 14,
      y: 7,
      stepFromX: 14,
      stepFromY: 7,
      range: 1,
      pierce: false,
      square: 0,
      fromSpectator: false,
      mode: 'timed',
      timer: 9999,
      carriedBy: null,
      carryBonusUsed: false,
      slide: null,
      flight: null,
      triggered: false,
      placedTick: 0,
    });
    advance(state, STEP * 3);
    expect(state.players[0]!.y).toBe(6);
  });
});

describe('shipments are telegraphed', () => {
  it('the warning comes first, lasts the telegraph and says where the shipment will run', () => {
    const state = newRaid();
    put(state, 0, 1, 11);
    const belt = state.raid!.belts[0]!;
    // the shipment appears warnTicks before its launch time
    const sink = until(state, () => state.raid!.shipments.length > 0, 700);
    const warn = of(sink, 'raidShipmentWarning');
    expect(warn).toHaveLength(1);
    expect(warn[0]!.warnTicks).toBeGreaterThanOrEqual(RAID_TUNING.minShipmentWarnTicks);
    expect(warn[0]!.tiles).toEqual(belt.tiles.map((t) => t.y * state.width + t.x));
    expect(state.match.playTicks).toBe(600 - belt.warnTicks);
    // the view carries the same warning, counting down; the shipment itself waits on the belt's first tile
    const v = raidView(state)!;
    expect(v.warnings.filter((w) => w.kind === 'shipment')).toHaveLength(1);
    expect(v.shipments[0]!).toMatchObject({ x: 14, y: 5, dir: 'down', warnTicks: belt.warnTicks });
    advance(state, 30);
    const later = raidView(state)!;
    expect(later.shipments[0]!.warnTicks).toBe(belt.warnTicks - 30);
    expect(later.warnings[0]!.remainingTicks).toBe(belt.warnTicks - 30);
    expect(state.raid!.shipments[0]!.phase).toBe('warn');
    // it starts to move only when the telegraph is over
    until(state, () => state.raid!.shipments[0]?.phase === 'moving', 200);
    expect(state.match.playTicks).toBe(600);
    expect(raidView(state)!.warnings.filter((w) => w.kind === 'shipment')).toHaveLength(0);
  });

  it('every raid belt has a telegraph of at least the minimum, shorter than its launch interval', () => {
    for (const id of ['warehouseDispatchDepot', 'railYardGoods', 'standbyPlant'] as const) {
      const state = newRaid(id);
      for (const b of state.raid!.belts) {
        expect(b.warnTicks).toBeGreaterThanOrEqual(RAID_TUNING.minShipmentWarnTicks);
        expect(b.warnTicks).toBeLessThan(b.everyTicks);
      }
    }
  });

  it('a delayed launch (the belt was busy) still gets its whole telegraph', () => {
    const state = newRaid();
    put(state, 0, 1, 11);
    state.raid!.belts[0]!.everyTicks = 100; // the next one is due long before the first is gone
    const sink: ReturnType<typeof advance> = [];
    let live = 0;
    for (let i = 0; i < 1500; i++) {
      advance(state, 1, {}, sink);
      live = Math.max(live, state.raid!.shipments.length);
    }
    const warns = of(sink, 'raidShipmentWarning');
    expect(warns.length).toBeGreaterThanOrEqual(3);
    for (const w of warns) expect(w.warnTicks).toBeGreaterThanOrEqual(state.raid!.belts[0]!.warnTicks);
    expect(live).toBe(1); // maxLive: never two on this belt
  });
});

describe('shipments damage', () => {
  /**
   * Stands the human at the foot of the belt (14,9), where the belt cannot carry him on (concrete beyond), and runs to the
   * tick before the shipment reaches him (it starts at tick 600 and needs four tile-steps of 24 ticks).
   */
  function standingAtTheFoot() {
    const state = newRaid();
    put(state, 0, 14, 9);
    const sink = advance(state, 600 + 4 * STEP - 3);
    return { state, sink };
  }

  it('a moving shipment hits whoever is on its tile through applyCampaignHit (source hazard), once', () => {
    const { state, sink } = standingAtTheFoot();
    const human = state.players[0]!;
    expect(of(sink, 'campaignHit')).toHaveLength(0); // the telegraph itself is harmless
    expect(human.vitals!.hp).toBe(human.vitals!.maxHp);
    advance(state, 5, {}, sink);
    const hits = of(sink, 'campaignHit');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      victimId: 0,
      byId: null,
      source: 'hazard',
      result: 'damaged',
      damage: 1,
    });
    expect(human.vitals!.hp).toBe(human.vitals!.maxHp - 1);
    expect(state.raid!.shipments[0]!.hit).toEqual([0]);
    // the shipment rests on his tile for a moment: still only one hit from it
    advance(state, RAID_TUNING.shipmentRestTicks, {}, sink);
    expect(of(sink, 'campaignHit').filter((e) => e.victimId === 0)).toHaveLength(1);
  });

  it('stepping aside during the telegraph avoids it completely', () => {
    const { state, sink } = standingAtTheFoot();
    const human = state.players[0]!;
    advance(state, 1, { 0: { move: 'left' } }, sink); // (13,9): off the belt
    advance(state, STEP * 4, {}, sink);
    expect(human.x).toBe(13);
    expect(of(sink, 'campaignHit')).toHaveLength(0);
    expect(human.vitals!.hp).toBe(human.vitals!.maxHp);
  });

  it('a wall stops the shipment at the end of the belt and it is gone shortly after', () => {
    const state = newRaid();
    put(state, 0, 1, 11);
    until(state, () => state.raid!.shipments[0]?.phase === 'stopped', 1200);
    const s = state.raid!.shipments[0]!;
    expect([s.x, s.y]).toEqual([14, 9]); // (14,10) is concrete
    until(state, () => state.raid!.shipments.length === 0, RAID_TUNING.shipmentRestTicks + 5);
  });

  it('a blast destroys a shipment on its way', () => {
    const state = newRaid();
    put(state, 0, 1, 11);
    until(state, () => state.raid!.shipments[0]?.phase === 'moving', 800);
    advance(state, STEP + 2); // it is on (14,6)
    const s = state.raid!.shipments[0]!;
    const id = s.id;
    const ev = explodeAt(state, 13, 6, 0, 1); // the flame reaches (14,6)
    const next = advance(state, 2, {}, ev);
    expect(of(next, 'cargoDestroyed').map((e) => e.id)).toContain(id);
    expect(state.raid!.shipments.find((q) => q.id === id)).toBeUndefined();
    expect(of(next, 'campaignHit').filter((e) => e.victimId !== 0)).toHaveLength(0);
  });
});
