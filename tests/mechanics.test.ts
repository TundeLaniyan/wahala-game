import { describe, expect, it } from 'vitest';
import { tileAt, Tile } from '../src/sim';
import {
  addGenerator,
  addPickup,
  addSoft,
  eventsOf,
  flameKeys,
  put,
  run,
  runUntil,
  sandbox,
} from './helpers';

describe('pickups', () => {
  it('applies Petrol, Diesel, Socket and Skates', () => {
    const s = sandbox();
    put(s, 0, 2, 4);
    addPickup(s, 3, 4, 'petrol');
    addPickup(s, 4, 4, 'socket');
    addPickup(s, 5, 4, 'skates');
    addPickup(s, 6, 4, 'diesel');
    run(s, 50, { 0: { move: 'right' } });
    const p = s.players[0]!;
    expect(p.capacity).toBe(2);
    expect(p.speedLevel).toBe(1);
    expect(p.range).toBe(s.config.generator.dieselRange);
  });

  it('never stacks Okada or Vehicle Voucher, but still consumes the pickup', () => {
    const s = sandbox();
    put(s, 0, 2, 4);
    addPickup(s, 3, 4, 'okada');
    addPickup(s, 4, 4, 'okada');
    addPickup(s, 5, 4, 'voucher');
    addPickup(s, 6, 4, 'voucher');
    const ev = run(s, 50, { 0: { move: 'right' } });
    expect(s.players[0]!.mounted).toBe(true);
    expect(s.players[0]!.hasVoucher).toBe(true);
    const collected = eventsOf(ev, 'pickupCollected');
    expect(collected.map((c) => c.wasted)).toEqual([false, true, false, true]);
    expect(s.pickups).toHaveLength(0);
  });

  it('flames destroy floor pickups', () => {
    const s = sandbox();
    put(s, 0, 14, 10);
    addPickup(s, 5, 4, 'petrol');
    addGenerator(s, { ownerId: 0, x: 4, y: 4, triggered: true });
    run(s, 1);
    expect(s.pickups).toHaveLength(0);
  });

  it('a bad-fuel curse is temporary and slows / inverts / weakens', () => {
    const s = sandbox({ seed: 4 });
    put(s, 0, 2, 4);
    addPickup(s, 3, 4, 'curse');
    run(s, 12, { 0: { move: 'right' } });
    const curse = s.players[0]!.curse!;
    expect(['slow', 'inverted', 'weakFire']).toContain(curse.kind);
    expect(curse.until - s.tick).toBeGreaterThan(0);
    run(s, s.config.pickups.curseTicks + 5);
    expect(s.tick).toBeGreaterThan(curse.until);
  });

  it('inverted curse flips direction', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    s.players[0]!.curse = { kind: 'inverted', until: 9999 };
    run(s, 1, { 0: { move: 'right' } });
    expect(s.players[0]!.x).toBe(3);
  });

  it('Jump Sneakers hop one generator; Hot Fuel burns through one soft block once', () => {
    const s = sandbox();
    put(s, 0, 2, 4);
    s.players[0]!.sneakers = true;
    addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 9999 });
    run(s, 1, { 0: { move: 'right' } });
    expect([s.players[0]!.x, s.players[0]!.y]).toEqual([4, 4]);

    const t = sandbox();
    put(t, 0, 4, 2);
    put(t, 1, 14, 10);
    t.players[0]!.hotFuel = true;
    t.players[0]!.range = 3;
    t.players[0]!.range = 4;
    addSoft(t, 4, 3);
    addSoft(t, 4, 4);
    addSoft(t, 4, 5);
    run(t, 1, { 0: { place: true } });
    expect(t.generators[0]!.pierce).toBe(true);
    expect(t.players[0]!.hotFuel).toBe(false);
    t.generators[0]!.triggered = true;
    run(t, 1);
    expect(tileAt(t, 4, 3)).toBe(Tile.Empty);
    expect(tileAt(t, 4, 4)).toBe(Tile.Empty); // the second block absorbs the arm
    expect(tileAt(t, 4, 5)).toBe(Tile.Soft); // so only ONE block is pierced
  });
});

describe('generator handling', () => {
  it('Football Boots kick a generator along a lane until it hits something', () => {
    const s = sandbox();
    put(s, 0, 2, 4);
    put(s, 1, 14, 0);
    s.players[0]!.contact = 'kick';
    addSoft(s, 9, 4);
    const g = addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 9999 });
    run(s, 1, { 0: { move: 'right' } });
    expect(g.slide).not.toBeNull();
    run(s, 120);
    expect([g.x, g.y]).toEqual([8, 4]);
    expect(g.slide).toBeNull();
  });

  it('a kicked generator cannot pass through concrete and kicking into concrete does nothing', () => {
    const s = sandbox();
    put(s, 0, 2, 1);
    s.players[0]!.contact = 'kick';
    const g = addGenerator(s, { ownerId: 1, x: 3, y: 0, timer: 9999 });
    put(s, 0, 2, 0);
    run(s, 1, { 0: { move: 'right' } });
    run(s, 200);
    expect(g.x).toBeGreaterThan(3);
    expect(g.x).toBeLessThanOrEqual(14);
    expect(tileAt(s, g.x, g.y)).toBe(Tile.Empty);
  });

  it('Mechanic Gloves punch a generator three tiles without detonating it', () => {
    const s = sandbox();
    put(s, 0, 2, 4);
    s.players[0]!.contact = 'punch';
    s.players[0]!.facing = 'right';
    const g = addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 200 });
    const ev = run(s, 1, { 0: { action: true } });
    expect(eventsOf(ev, 'generatorThrown')).toHaveLength(1);
    expect([g.x, g.y]).toEqual([6, 4]);
    expect(g.flight).not.toBeNull();
    run(s, 40);
    expect(g.flight).toBeNull();
    expect(s.flames).toHaveLength(0);
  });

  it('Generator Grip: first pickup adds exactly +1s, later pickups add nothing, can detonate in hand', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    put(s, 1, 14, 0);
    s.players[0]!.grip = true;
    run(s, 1, { 0: { place: true } });
    const g = s.generators[0]!;
    const before = g.timer;
    run(s, 1, { 0: { action: true } });
    expect(g.carriedBy).toBe(0);
    expect(g.timer).toBe(before + s.config.generator.carryBonusTicks - 1);

    run(s, 1, { 0: { action: true } }); // drop
    expect(g.carriedBy).toBeNull();
    const t1 = g.timer;
    run(s, 1, { 0: { action: true } }); // pick up again
    expect(g.carriedBy).toBe(0);
    expect(g.timer).toBe(t1 - 1); // no second bonus
    expect(g.carryBonusUsed).toBe(true);

    const ev = runUntil(s, (e) => e.some((x) => x.type === 'generatorExploded'));
    expect(eventsOf(ev, 'playerEliminated')[0]!.playerId).toBe(0); // blew up in the carrier's hands
  });

  it('a carried generator walks with its carrier and is dropped where they stand', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    put(s, 1, 14, 0);
    s.players[0]!.grip = true;
    run(s, 1, { 0: { place: true } });
    run(s, 1, { 0: { action: true } });
    run(s, 10, { 0: { move: 'right' } });
    const g = s.generators[0]!;
    expect([g.x, g.y]).toEqual([5, 4]);
    run(s, 1, { 0: { action: true } });
    expect(g.carriedBy).toBeNull();
    expect([g.x, g.y]).toEqual([5, 4]);
  });

  it('Remote Starter: no timer, detonates on command, and a chain can still set it off', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    put(s, 1, 14, 0);
    s.players[0]!.remote = true;
    run(s, 1, { 0: { place: true } });
    const g = s.generators[0]!;
    expect(g.mode).toBe('remote');
    run(s, 10, { 0: { move: 'right' } });
    run(s, 400);
    expect(s.generators).toHaveLength(1); // well past a normal 3s fuse
    const ev = run(s, 1, { 0: { detonate: true } });
    expect(eventsOf(ev, 'generatorExploded')).toHaveLength(1);

    const t = sandbox();
    put(t, 1, 14, 0);
    addGenerator(t, { ownerId: 0, x: 5, y: 4, mode: 'remote', timer: 1000 });
    addGenerator(t, { ownerId: 1, x: 7, y: 4, triggered: true });
    const ev2 = run(t, 1);
    expect(eventsOf(ev2, 'generatorExploded')).toHaveLength(2);
  });

  it('remote generators have a failsafe so they cannot block lanes forever', () => {
    const s = sandbox();
    put(s, 0, 14, 10);
    put(s, 1, 14, 0);
    addGenerator(s, {
      ownerId: 0,
      x: 2,
      y: 4,
      mode: 'remote',
      timer: s.config.generator.remoteFailsafeTicks,
    });
    const ev = runUntil(s, (e) => e.some((x) => x.type === 'generatorExploded'), 2000);
    expect(eventsOf(ev, 'generatorExploded')).toHaveLength(1);
  });

  it('Kill Switch permanently disables the timer but external flame still detonates the generator', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    put(s, 1, 14, 0);
    s.players[0]!.killSwitchCharges = 2;
    s.players[0]!.facing = 'right';
    const g = addGenerator(s, { ownerId: 1, x: 5, y: 4, timer: 60 });
    run(s, 1, { 0: { disarm: true } });
    expect(g.mode).toBe('disabled');
    run(s, 300);
    expect(s.generators).toContain(g); // timer never fires
    // owner's remote command cannot revive it either
    s.players[1]!.remote = true;
    run(s, 1, { 1: { detonate: true } });
    expect(s.generators).toContain(g);
    // another generator's flame still sets it off
    addGenerator(s, { ownerId: 1, x: 7, y: 4, triggered: true });
    const ev = run(s, 1);
    expect(eventsOf(ev, 'generatorExploded').map((e) => e.generatorId)).toContain(g.id);
  });

  it('a disarmed generator frees its owner capacity and is cleaned up eventually', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    put(s, 1, 14, 0);
    s.players[0]!.killSwitchCharges = 1;
    s.players[0]!.facing = 'right';
    const g = addGenerator(s, { ownerId: 0, x: 5, y: 4, timer: 60 });
    run(s, 1, { 0: { disarm: true } });
    run(s, 1, { 0: { place: true } });
    expect(s.generators.filter((x) => x.ownerId === 0)).toHaveLength(2);
    run(s, s.config.generator.disabledCleanupTicks + 5);
    expect(s.generators).not.toContain(g);
  });
});

describe('Okada', () => {
  it('is faster than walking', () => {
    const s = sandbox();
    put(s, 0, 0, 4);
    s.players[0]!.mounted = true;
    run(s, 1, { 0: { move: 'right' } });
    expect(s.players[0]!.stepTotal).toBe(8);
  });

  it('absorbs exactly one lethal event, breaks, and the rider survives the same blast and its flames', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    put(s, 1, 14, 0);
    s.players[0]!.mounted = true;
    addGenerator(s, { ownerId: 1, x: 4, y: 4, triggered: true });
    const ev = run(s, 1);
    expect(eventsOf(ev, 'okadaBroken')).toHaveLength(1);
    expect(s.players[0]!.alive).toBe(true);
    expect(s.players[0]!.mounted).toBe(false);
    run(s, s.config.generator.flameTicks + 5); // keeps standing in the continuing fire
    expect(s.players[0]!.alive).toBe(true);
    // a second, separate lethal event kills the now-unmounted player
    addGenerator(s, { ownerId: 1, x: 4, y: 4, triggered: true });
    run(s, 1);
    expect(s.players[0]!.alive).toBe(false);
  });

  it('is consumed by two overlapping blasts in the same tick (still just one Okada)', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    put(s, 1, 14, 0);
    s.players[0]!.mounted = true;
    addGenerator(s, { ownerId: 1, x: 4, y: 4, triggered: true });
    addGenerator(s, { ownerId: 1, x: 4, y: 6, triggered: true });
    run(s, 1);
    expect(s.players[0]!.alive).toBe(true);
    expect(s.players[0]!.mounted).toBe(false);
  });
});

describe('character skills', () => {
  it('Push shifts an adjacent rival one tile and cannot kill', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.facing = 'right';
    run(s, 1, { 0: { skill: true } });
    expect([s.players[1]!.x, s.players[1]!.y]).toEqual([6, 4]);
    expect(s.players[1]!.alive).toBe(true);
  });

  it('Push does nothing into concrete or a generator, and respects cooldown', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    put(s, 0, 0, 1);
    put(s, 1, 0, 2);
    s.players[0]!.facing = 'down';
    addGenerator(s, { ownerId: 0, x: 0, y: 3, timer: 9999 });
    run(s, 1, { 0: { skill: true } });
    expect(s.players[1]!.y).toBe(2);
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.facing = 'right';
    run(s, 1, { 0: { skill: true } });
    expect(s.players[1]!.x).toBe(6);
    put(s, 0, 5, 4);
    run(s, 1, { 0: { skill: true } });
    expect(s.players[1]!.x).toBe(6); // on cooldown
  });

  it('Daze freezes a rival briefly, then grants anti-stunlock immunity', () => {
    const s = sandbox({ characters: ['lekkiBoy', 'streetBaller'] });
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.facing = 'right';
    run(s, 1, { 0: { skill: true } });
    const x = s.players[1]!.x;
    run(s, 30, { 1: { move: 'right' } });
    expect(s.players[1]!.x).toBe(x);
    run(s, 40, { 1: { move: 'right' } });
    expect(s.players[1]!.x).toBeGreaterThan(x);
    s.players[0]!.skillReadyTick = 0;
    put(s, 1, s.players[0]!.x + 1, s.players[0]!.y);
    run(s, 1, { 0: { skill: true } });
    expect(s.tick).toBeLessThan(s.players[1]!.dazeImmuneUntil);
    expect(s.players[1]!.dazedUntil).toBeLessThanOrEqual(s.tick); // immune: no new daze
  });
});

describe('death drops', () => {
  it('drops a limited number of held upgrades on distinct empty tiles', () => {
    const s = sandbox();
    put(s, 0, 14, 10);
    put(s, 1, 4, 4);
    Object.assign(s.players[1]!, {
      range: 5,
      capacity: 3,
      kick: true,
      grip: true,
      remote: true,
      speedLevel: 2,
    });
    addGenerator(s, { ownerId: 0, x: 4, y: 4, triggered: true });
    const ev = run(s, 1);
    const drops = eventsOf(ev, 'pickupDropped');
    expect(drops).toHaveLength(s.config.drops.maxDeathDrops);
    expect(new Set(drops.map((d) => `${d.x},${d.y}`)).size).toBe(drops.length);
    for (const d of drops) {
      expect(tileAt(s, d.x, d.y)).toBe(Tile.Empty);
      expect(flameKeys(s)).not.toContain(`${d.x},${d.y}`);
    }
  });
});
