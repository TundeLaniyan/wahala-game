import { describe, expect, it } from 'vitest';
import { Tile } from '../../src/sim';
import type { Difficulty, GameState, Intents } from '../../src/sim';
import { addGenerator, addPickup, addSoft, eventsOf, put, sandbox } from '../helpers';
import { makeBots, runBots } from './helpers';

const ALL: Difficulty[] = ['beginner', 'standard', 'expert'];
const SMART: Difficulty[] = ['standard', 'expert'];

/** Two-player sandbox with the bot at slot 0 and an idle rival parked far away. */
function duel(botAt: [number, number], rivalAt: [number, number] = [14, 0]): GameState {
  const s = sandbox({ players: 2 });
  put(s, 0, botAt[0], botAt[1]);
  put(s, 1, rivalAt[0], rivalAt[1]);
  return s;
}

describe('hazard avoidance', () => {
  it.each(ALL)('%s leaves a lane whose generator is about to explode', (d) => {
    const s = duel([6, 4]);
    addGenerator(s, { ownerId: 1, x: 4, y: 4, timer: 40, range: 3 });
    runBots(s, makeBots({ 0: d }), 120);
    expect(s.players[0]!.alive).toBe(true);
  });

  it.each(ALL)('%s does not walk onto a tile that is burning', (d) => {
    const s = duel([6, 4]);
    // a long-lived fire right next to the bot; the bot must not step into it whatever it decides
    for (const x of [7, 8, 9]) {
      s.flames.push({
        x,
        y: 4,
        eventId: 99,
        genId: 0,
        ownerId: 1,
        dir: 'right',
        tip: false,
        startTick: 0,
        endTick: s.tick + 200,
      });
    }
    const run = runBots(s, makeBots({ 0: d }), 150);
    expect(s.players[0]!.alive).toBe(true);
    expect(eventsOf(run.events, 'playerEliminated')).toHaveLength(0);
  });

  it.each(SMART)('%s picks the one safe exit at a crossing with two burning lanes', (d) => {
    const s = duel([4, 4]);
    addGenerator(s, { ownerId: 1, x: 4, y: 2, timer: 35, range: 3 }); // lane up the column
    addGenerator(s, { ownerId: 1, x: 2, y: 4, timer: 35, range: 3 }); // lane left along the row
    runBots(s, makeBots({ 0: d }), 100);
    expect(s.players[0]!.alive).toBe(true);
  });

  it.each(SMART)('%s accounts for chain reactions when judging a lane safe', (d) => {
    // generator A is far in time but it sits in B's flame, so A goes off with B
    const s = duel([4, 4]);
    addGenerator(s, { ownerId: 1, x: 8, y: 4, timer: 30, range: 2 });
    addGenerator(s, { ownerId: 1, x: 6, y: 4, timer: 170, range: 3 }); // would burn (4,4) at 170 unless chained at 30
    runBots(s, makeBots({ 0: d }), 80);
    expect(s.players[0]!.alive).toBe(true);
    expect(s.generators).toHaveLength(0);
  });

  it.each(SMART)('%s steps out of a Wahala Crush tile that is about to land', (d) => {
    const s = duel([6, 4]);
    s.settings.mode = 'crush';
    s.crush = {
      order: [],
      next: 0,
      warnAt: [],
      nextAtTick: 999999,
      pending: [{ index: 4 * s.width + 6, landTick: s.tick + 50 }],
    };
    runBots(s, makeBots({ 0: d }), 80);
    expect(s.players[0]!.alive).toBe(true);
  });

  it.each(SMART)('%s steps away from a spectator firecracker landing on it', (d) => {
    const s = duel([6, 4]);
    s.settings.crowdThrows = true;
    s.crowd = {
      nextThrowTick: 999999,
      throws: [{ id: 500, x: 6, y: 4, kind: 'firecracker', landTick: s.tick + 90 }],
    };
    runBots(s, makeBots({ 0: d }), 120);
    expect(s.players[0]!.alive).toBe(true);
  });
});

describe('generator placement', () => {
  it.each(ALL)('%s blows up soft blocks', (d) => {
    const s = duel([0, 10]);
    for (const [x, y] of [
      [2, 10],
      [0, 7],
      [2, 8],
    ] as const)
      addSoft(s, x, y);
    const run = runBots(s, makeBots({ 0: d }), 900);
    expect(eventsOf(run.events, 'generatorPlaced').length).toBeGreaterThan(0);
    expect(eventsOf(run.events, 'blockDestroyed').length).toBeGreaterThan(0);
  });

  it.each(SMART)('%s blows up soft blocks without killing itself', (d) => {
    const s = duel([0, 10]);
    for (const [x, y] of [
      [2, 10],
      [0, 7],
      [2, 8],
    ] as const)
      addSoft(s, x, y);
    runBots(s, makeBots({ 0: d }), 900);
    expect(s.players[0]!.alive).toBe(true);
  });

  it.each(SMART)('%s will not place a generator in a pocket with no way out', (d) => {
    // enclosed pocket: soft blocks on both sides of the row, concrete above and below
    const s = duel([9, 6]);
    addSoft(s, 8, 6);
    addSoft(s, 10, 6);
    const run = runBots(s, makeBots({ 0: d }), 300);
    expect(eventsOf(run.events, 'generatorPlaced')).toHaveLength(0);
    expect(s.players[0]!.alive).toBe(true);
  });

  it.each(ALL)('%s never tries to walk back onto its own generator tile', (d) => {
    const s = duel([0, 10]);
    for (const [x, y] of [
      [2, 10],
      [0, 8],
    ] as const)
      addSoft(s, x, y);
    const bots = makeBots({ 0: d });
    let blockedTicks = 0;
    for (let i = 0; i < 600; i++) {
      const gens = s.generators.map((g) => `${g.x},${g.y}`);
      const p = s.players[0]!;
      const { intents } = runBots(s, bots, 1);
      const move = intents[0]![0]?.move;
      if (move && p.stepRemaining <= 1) {
        const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[move]!;
        if (gens.includes(`${p.x + v[0]!},${p.y + v[1]!}`)) blockedTicks++;
      }
    }
    expect(blockedTicks).toBeLessThanOrEqual(3);
  });
});

describe('pickups', () => {
  it.each(SMART)('%s collects a visible Okada and boots', (d) => {
    const s = duel([2, 4]);
    addPickup(s, 6, 4, 'okada');
    addPickup(s, 2, 8, 'boots');
    runBots(s, makeBots({ 0: d }), 500);
    expect(s.players[0]!.mounted || s.players[0]!.contact === 'kick').toBe(true);
  });

  it.each(SMART)('%s does not pick up a curse on purpose', (d) => {
    const s = duel([2, 4]);
    addPickup(s, 4, 4, 'curse');
    runBots(s, makeBots({ 0: d }), 400);
    expect(s.players[0]!.curse).toBeNull();
  });
});

describe('vehicles', () => {
  /** Rival (slot 1, Lekki Boy taxi) launches along row 4 from the left edge: 72 ticks of warning. */
  function taxiAtRow4(botX: number, botY: number): GameState {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    put(s, 0, botX, botY);
    put(s, 1, 14, 10);
    s.players[1]!.hasVoucher = true;
    return s;
  }
  const launchTaxi = (t: number): Intents =>
    t === 0
      ? { 1: { vehicle: { type: 'begin' } } }
      : t === 1
        ? { 1: { vehicle: { type: 'launch', entry: { x: 0, y: 4, dir: 'right' } } } }
        : {};

  it.each(SMART)('%s dodges the lane of an incoming taxi', (d) => {
    const s = taxiAtRow4(6, 4);
    const run = runBots(s, makeBots({ 0: d }), 400, { others: launchTaxi });
    expect(eventsOf(run.events, 'vehicleWarning')).toHaveLength(1);
    expect(s.players[0]!.alive).toBe(true);
  });

  it('easy usually gets out of the way too once the vehicle is close', () => {
    let survived = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = taxiAtRow4(6, 4);
      runBots(s, makeBots({ 0: 'beginner' }, seed), 400, { others: launchTaxi });
      if (s.players[0]!.alive) survived++;
    }
    expect(survived).toBeGreaterThanOrEqual(6);
  });

  it.each(SMART)(
    '%s uses its Vehicle Voucher on a rival in a lane, legally, without driving over itself',
    (d) => {
      const s = sandbox({ characters: ['lekkiBoy', 'streetBaller'] });
      put(s, 0, 0, 10);
      put(s, 1, 9, 6); // walled in by two soft blocks: the lane is the only place it can be
      addSoft(s, 8, 6);
      addSoft(s, 10, 6);
      s.players[0]!.hasVoucher = true;
      const run = runBots(s, makeBots({ 0: d }), 900);
      const launched = eventsOf(run.events, 'vehicleLaunched').filter((e) => e.ownerId === 0);
      expect(launched).toHaveLength(1);
      expect(s.players[0]!.hasVoucher).toBe(false);
      expect(s.players[0]!.alive).toBe(true);
      expect(s.players[1]!.alive).toBe(false);
    },
  );

  it.each(SMART)('%s launches a Keke along a legal L-shaped route', (d) => {
    const s = sandbox({ characters: ['campusQueen', 'streetBaller'] });
    put(s, 0, 0, 10);
    put(s, 1, 9, 6);
    addSoft(s, 8, 6);
    addSoft(s, 10, 6);
    s.players[0]!.hasVoucher = true;
    const run = runBots(s, makeBots({ 0: d }), 900);
    const launched = eventsOf(run.events, 'vehicleLaunched').filter((e) => e.ownerId === 0);
    expect(launched).toHaveLength(1);
    expect(s.players[0]!.alive).toBe(true);
    expect(s.players[1]!.alive).toBe(false);
  });
});

describe('generator tools', () => {
  it.each(SMART)('%s detonates its remote generator when a rival stands in the blast, and survives', (d) => {
    const s = duel([6, 6], [7, 4]);
    s.players[0]!.remote = true;
    addGenerator(s, {
      ownerId: 0,
      x: 6,
      y: 4,
      mode: 'remote',
      timer: 1200,
      placedTick: s.tick - 80,
      range: 2,
    });
    const run = runBots(s, makeBots({ 0: d }), 200);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players[0]!.alive).toBe(true);
    expect(eventsOf(run.events, 'generatorExploded').length).toBeGreaterThan(0);
  });

  it.each(SMART)('%s does not detonate its remote generator while standing in the blast', (d) => {
    const s = duel([6, 5], [7, 4]);
    s.players[0]!.remote = true;
    addGenerator(s, {
      ownerId: 0,
      x: 6,
      y: 4,
      mode: 'remote',
      timer: 1200,
      placedTick: s.tick - 80,
      range: 2,
    });
    runBots(s, makeBots({ 0: d }), 200);
    expect(s.players[0]!.alive).toBe(true);
  });

  /** Dead-end pocket: soft block to the left, a ticking generator to the right, concrete above and below. */
  function pocket(): GameState {
    const s = duel([9, 6]);
    addSoft(s, 8, 6);
    addGenerator(s, { ownerId: 1, x: 10, y: 6, timer: 110, range: 2 });
    return s;
  }

  it.each(SMART)('%s uses the Kill Switch to defuse the generator sealing it in', (d) => {
    const s = pocket();
    // V2: Disarm is a contact ability (walk into the generator), equipped with its charges
    s.players[0]!.contact = 'disarm';
    s.players[0]!.killSwitchCharges = 2;
    const run = runBots(s, makeBots({ 0: d }), 260);
    expect(eventsOf(run.events, 'generatorDisarmed')).toHaveLength(1);
    expect(s.players[0]!.alive).toBe(true);
  });

  it.each(SMART)('%s kicks the generator sealing it in when it owns Football Boots', (d) => {
    const s = pocket();
    s.players[0]!.contact = 'kick';
    const run = runBots(s, makeBots({ 0: d }), 260);
    expect(eventsOf(run.events, 'generatorKicked').length).toBeGreaterThan(0);
    expect(s.players[0]!.alive).toBe(true);
  });

  it.each(SMART)('%s punches the generator sealing it in when it owns Mechanic Gloves', (d) => {
    const s = pocket();
    s.players[0]!.contact = 'punch';
    s.players[0]!.facing = 'right';
    const run = runBots(s, makeBots({ 0: d }), 260);
    expect(eventsOf(run.events, 'generatorThrown').length).toBeGreaterThan(0);
    expect(s.players[0]!.alive).toBe(true);
  });

  it.each(SMART)('%s never carries (V2: carry is out of normal play, even with a legacy Grip)', (d) => {
    const s = pocket();
    s.players[0]!.grip = true;
    s.players[0]!.facing = 'right';
    const run = runBots(s, makeBots({ 0: d }), 400);
    expect(eventsOf(run.events, 'generatorCarried')).toHaveLength(0);
  });
});

describe('close combat', () => {
  it('Street Baller pushes a rival onto a lane that is about to burn', () => {
    const s = sandbox({ characters: ['streetBaller', 'streetBaller'] });
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.facing = 'right';
    addGenerator(s, { ownerId: 1, x: 6, y: 2, timer: 14, range: 2 }); // burns (6,3) (6,4) (6,5), not (5,4)
    const run = runBots(s, makeBots({ 0: 'standard' }), 60);
    expect(eventsOf(run.events, 'playerPushed')).toHaveLength(1);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players[0]!.alive).toBe(true);
  });

  it('Lekki Boy dazes a rival standing in a lane that is about to burn', () => {
    const s = sandbox({ characters: ['lekkiBoy', 'streetBaller'] });
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.facing = 'right';
    addGenerator(s, { ownerId: 0, x: 8, y: 4, timer: 50, range: 4 });
    const run = runBots(s, makeBots({ 0: 'expert' }), 90);
    expect(eventsOf(run.events, 'playerDazed')).toHaveLength(1);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players[0]!.alive).toBe(true);
  });

  it('never shoves a rival that is standing safely and would stay safe', () => {
    const s = sandbox({ characters: ['streetBaller', 'streetBaller'] });
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.facing = 'right';
    const run = runBots(s, makeBots({ 0: 'expert' }), 30);
    expect(eventsOf(run.events, 'playerPushed')).toHaveLength(0);
  });
});

describe('sanity', () => {
  it('only reacts to what it can see: a pickup hidden under a soft block does not change its behaviour', () => {
    const a = duel([0, 10]);
    const b = duel([0, 10]);
    addSoft(a, 2, 10, 'okada');
    addSoft(b, 2, 10);
    const botsA = makeBots({ 0: 'expert' });
    const botsB = makeBots({ 0: 'expert' });
    // identical until the block is destroyed (and the pickup becomes visible)
    for (let i = 0; i < 1500 && a.tiles[10 * a.width + 2] === Tile.Soft; i++) {
      const ra = runBots(a, botsA, 1);
      const rb = runBots(b, botsB, 1);
      expect(ra.intents[0]).toEqual(rb.intents[0]);
    }
  });

  it('never leaves the arena grid on hard tiles', () => {
    const s = duel([0, 10]);
    runBots(s, makeBots({ 0: 'standard' }), 300);
    const p = s.players[0]!;
    expect(s.tiles[p.y * s.width + p.x]).toBe(Tile.Empty);
  });
});
