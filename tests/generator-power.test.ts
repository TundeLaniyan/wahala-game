import { describe, expect, it } from 'vitest';
import { CITY_RUMBLE_ID, DEFAULT_CONFIG, PICKUP_DEFS, Tile, createGame, getArena, tick } from '../src/sim';
import type { Intents, PickupKind, SimEvent } from '../src/sim';
import { equipContact } from '../src/sim/systems/pickups';
import { addGenerator, addPickup, addSoft, eventsOf, flameKeys, put, run, sandbox } from './helpers';

/** Generators first: Extra Socket / Petrol Top-Up economy, Generator Pass, the Power Yard blast rule. */

describe('pickup economy', () => {
  it('Extra Socket and Petrol Top-Up are ~60-70 % of the ordinary beneficial upgrades', () => {
    const w = DEFAULT_CONFIG.pickups.weights;
    const beneficial = Object.entries(w).filter(([k]) => !PICKUP_DEFS[k as PickupKind].bad);
    const total = beneficial.reduce((a, [, v]) => a + v, 0);
    const share = (w.socket + w.petrol) / total;
    expect(share).toBeGreaterThanOrEqual(0.6);
    expect(share).toBeLessThanOrEqual(0.7);
    // the advanced skills are each rarer than either generator upgrade
    for (const k of ['boots', 'gloves', 'grip', 'remote', 'sneakers', 'bombpass'] as const) expect(w[k]).toBeLessThan(w.socket / 4);
  });

  it('the hidden pickups of real matches follow those weights', () => {
    const counts: Partial<Record<PickupKind, number>> = {};
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = createGame({
        seed,
        players: [
          { name: 'A', characterId: 'streetBaller', isBot: false },
          { name: 'B', characterId: 'lekkiBoy', isBot: false },
        ],
      });
      for (const k of Object.values(s.hidden)) {
        counts[k] = (counts[k] ?? 0) + 1;
        if (!PICKUP_DEFS[k].bad) n++;
      }
    }
    const share = ((counts.socket ?? 0) + (counts.petrol ?? 0)) / n;
    expect(share).toBeGreaterThan(0.57);
    expect(share).toBeLessThan(0.68);
    expect(counts.bombpass ?? 0).toBeGreaterThan(0);
  });
});

describe('Extra Socket stacking', () => {
  it('stacks up to the capacity cap; the HUD numbers (active / max) follow; a full set can be placed', () => {
    const s = sandbox();
    const p = s.players[0]!;
    put(s, 0, 0, 0);
    put(s, 1, 14, 10);
    for (let i = 0; i < 8; i++) {
      addPickup(s, 0, 0, 'socket');
      run(s, 1);
    }
    expect(p.capacity).toBe(DEFAULT_CONFIG.generator.maxCapacity);
    // walk along the top lane dropping a generator on every tile
    const placed: number[] = [];
    for (let x = 0; x < 6; x++) {
      put(s, 0, x, 0);
      const ev = run(s, 1, { 0: { place: true } });
      placed.push(...eventsOf(ev, 'generatorPlaced').map((e) => e.generatorId));
    }
    expect(placed).toHaveLength(6);
    put(s, 0, 6, 0);
    expect(eventsOf(run(s, 1, { 0: { place: true } }), 'generatorPlaced')).toHaveLength(0);
    expect(s.generators.filter((g) => g.ownerId === 0)).toHaveLength(6);
  });

  it('petrol raises the reach by one per pickup up to the cap, and multiple generators chain', () => {
    const s = sandbox();
    put(s, 0, 0, 0);
    put(s, 1, 14, 10);
    for (let i = 0; i < 3; i++) {
      addPickup(s, 0, 0, 'petrol');
      run(s, 1);
    }
    expect(s.players[0]!.range).toBe(DEFAULT_CONFIG.generator.baseRange + 3);
    addGenerator(s, { ownerId: 0, x: 4, y: 4, timer: 1, range: 2 });
    addGenerator(s, { ownerId: 0, x: 6, y: 4, timer: 999 });
    addGenerator(s, { ownerId: 0, x: 8, y: 4, timer: 999 });
    const ev = run(s, 2);
    const blasts = eventsOf(ev, 'generatorExploded');
    expect(blasts).toHaveLength(3);
    expect(new Set(blasts.map((b) => b.eventId)).size).toBe(1);
  });
});

describe('Generator Pass (Bomb Pass)', () => {
  it('walks over own and rival generators, several in a row, but never through concrete or crates', () => {
    const s = sandbox();
    const p = s.players[0]!;
    put(s, 0, 0, 0);
    put(s, 1, 14, 10);
    addPickup(s, 0, 0, 'bombpass');
    run(s, 1);
    expect(p.contact).toBe('pass');
    addGenerator(s, { ownerId: 0, x: 1, y: 0, timer: 9999 });
    addGenerator(s, { ownerId: 1, x: 2, y: 0, timer: 9999 });
    for (let i = 0; i < 3; i++) run(s, 10, (t): Intents => (t === 0 ? { 0: { move: 'right' } } : {}));
    expect([p.x, p.y]).toEqual([3, 0]);
    // concrete: (3,1) is a pillar
    run(s, 10, (t): Intents => (t === 0 ? { 0: { move: 'down' } } : {}));
    expect([p.x, p.y]).toEqual([3, 0]);
    addSoft(s, 4, 0);
    run(s, 10, (t): Intents => (t === 0 ? { 0: { move: 'right' } } : {}));
    expect([p.x, p.y]).toEqual([3, 0]);
    // the generators are untouched: same tiles, same fuse owner and mode
    expect(s.generators.map((g) => [g.x, g.y, g.ownerId, g.mode])).toEqual([
      [1, 0, 0, 'timed'],
      [2, 0, 1, 'timed'],
    ]);
  });

  it('gives no fire protection', () => {
    const s = sandbox();
    put(s, 0, 2, 0);
    put(s, 1, 14, 10);
    s.players[0]!.contact = 'pass';
    addGenerator(s, { ownerId: 1, x: 2, y: 0, timer: 1 });
    run(s, 2);
    expect(s.players[0]!.alive).toBe(false);
  });

  it('contact abilities are exclusive: Kick replaces Pass, so a generator that cannot slide now blocks', () => {
    const s = sandbox();
    const p = s.players[0]!;
    put(s, 0, 0, 0);
    put(s, 1, 14, 10);
    p.contact = 'pass';
    const ev0: SimEvent[] = [];
    expect(equipContact(p, 'kick', ev0)).toBe(true);
    expect(p.contact).toBe('kick');
    expect(ev0).toEqual([{ type: 'contactEquipped', playerId: 0, ability: 'kick', replaced: 'pass' }]);
    const g = addGenerator(s, { ownerId: 0, x: 1, y: 0, timer: 9999 });
    const ev = run(s, 2, (t): Intents => (t === 0 ? { 0: { move: 'right' } } : {}));
    expect(eventsOf(ev, 'generatorKicked')).toHaveLength(1);
    run(s, 60);
    expect(g.x).toBe(14);
    // two generators in a column: the first cannot slide, and without Pass the kicker stays put
    put(s, 0, 2, 2);
    const h = addGenerator(s, { ownerId: 0, x: 2, y: 3, timer: 9999 });
    addGenerator(s, { ownerId: 0, x: 2, y: 4, timer: 9999 });
    run(s, 12, (t): Intents => (t === 0 ? { 0: { move: 'down' } } : {}));
    expect([p.x, p.y]).toEqual([2, 2]);
    expect([h.x, h.y]).toEqual([2, 3]);
  });

  it('is dropped as loot on elimination and is gone in a new match', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    put(s, 1, 14, 10);
    s.players[0]!.contact = 'pass';
    addGenerator(s, { ownerId: 1, x: 4, y: 4, timer: 1 });
    const ev = run(s, 2);
    expect(eventsOf(ev, 'pickupDropped').map((e) => e.kind)).toContain('bombpass');
    const fresh = sandbox();
    expect(fresh.players[0]!.contact).toBe(null);
  });
});

describe('Surulere Power Yard: full-length blasts (this arena only)', () => {
  const yard = () => sandbox({ arenaId: 'surulerePowerYard' });

  it('a blast fills its whole row and column, through pillars and crates, to the edge', () => {
    const s = yard();
    put(s, 0, 0, 10);
    put(s, 1, 14, 0);
    addSoft(s, 4, 2);
    addSoft(s, 6, 6);
    addGenerator(s, { ownerId: 0, x: 6, y: 2, timer: 1, range: 2 });
    const ev = run(s, 1);
    const keys = flameKeys(s);
    const expected: string[] = [];
    for (let x = 0; x < 15; x++) if (s.tiles[2 * 15 + x] !== Tile.Hard) expected.push(`${x},2`);
    for (let y = 0; y < 11; y++) if (y !== 2 && s.tiles[y * 15 + 6] !== Tile.Hard) expected.push(`6,${y}`);
    expect(keys).toEqual(expected.sort());
    // both crates in the lines broke
    expect(eventsOf(ev, 'blockDestroyed').map((e) => `${e.x},${e.y}`).sort()).toEqual(['4,2', '6,6']);
  });

  it('pillars still block walking; a generator anywhere on the line chains in the same event', () => {
    const s = yard();
    put(s, 0, 0, 0);
    run(s, 10, (t): Intents => (t === 0 ? { 0: { move: 'down' } } : {}));
    run(s, 10, (t): Intents => (t === 0 ? { 0: { move: 'right' } } : {})); // (1,1) is a pillar
    expect([s.players[0]!.x, s.players[0]!.y]).toEqual([0, 1]);
    put(s, 0, 0, 10);
    put(s, 1, 14, 0);
    addGenerator(s, { ownerId: 0, x: 2, y: 4, timer: 1 });
    addGenerator(s, { ownerId: 1, x: 12, y: 4, timer: 999 });
    addGenerator(s, { ownerId: 1, x: 12, y: 8, timer: 999 });
    const blasts = eventsOf(run(s, 1), 'generatorExploded');
    expect(blasts).toHaveLength(3);
    expect(new Set(blasts.map((b) => b.eventId)).size).toBe(1);
  });

  it('two rivals at opposite ends of one row fall together: a draw', () => {
    const s = yard();
    put(s, 0, 0, 4);
    put(s, 1, 14, 4);
    addGenerator(s, { ownerId: 0, x: 7, y: 4, timer: 1 });
    const ev = run(s, 1);
    expect(eventsOf(ev, 'playerEliminated')).toHaveLength(2);
    expect(eventsOf(ev, 'matchEnded')[0]!.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
  });

  it('starts everyone with two generators, max four, and never hides fire-range pickups', () => {
    const s = yard();
    expect(s.players.map((p) => p.capacity)).toEqual([2, 2]);
    expect(s.config.generator.maxCapacity).toBe(4);
    for (let seed = 1; seed <= 40; seed++) {
      const g = createGame({
        seed,
        arenaId: 'surulerePowerYard',
        players: [
          { name: 'A', characterId: 'streetBaller', isBot: false },
          { name: 'B', characterId: 'lekkiBoy', isBot: false },
        ],
      });
      for (const k of Object.values(g.hidden)) expect(['petrol', 'diesel', 'hotfuel']).not.toContain(k);
    }
    expect(getArena('surulerePowerYard').info.ruleWarning).toMatch(/WHOLE row and column/);
  });

  it('every other arena keeps the normal, range-limited plus', () => {
    for (const [arenaId, gx, gy] of [
      ['danfoBusPark', 6, 4],
      ['yabaAfterDark', 6, 4],
      [CITY_RUMBLE_ID, 14, 12],
    ] as const) {
      const s = sandbox({ arenaId });
      expect(s.config.generator.blastMode).toBe('plus');
      put(s, 0, 0, 0);
      put(s, 1, 2, 10);
      addGenerator(s, { ownerId: 0, x: gx, y: gy, timer: 1, range: 2 });
      run(s, 1);
      const xs = s.flames.filter((f) => f.y === gy).map((f) => f.x);
      expect(Math.min(...xs), arenaId).toBe(gx - 2);
      expect(Math.max(...xs), arenaId).toBe(gx + 2);
    }
  });
});

describe('City Rumble set-up', () => {
  const field = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `P${i}`, characterId: 'streetBaller' as const, isBot: i > 0 }));

  it('takes 8, 16, 24 or 32 competitors on distinct spawns; standard arenas stay 1-4', () => {
    for (const n of [8, 16, 24, 32]) {
      const s = createGame({ seed: n, arenaId: CITY_RUMBLE_ID, players: field(n) });
      expect(s.players).toHaveLength(n);
      expect(new Set(s.players.map((p) => `${p.x},${p.y}`)).size).toBe(n);
      expect(s.players.filter((p) => !p.isBot)).toHaveLength(1);
      for (const p of s.players) expect(s.tiles[p.y * s.width + p.x]).toBe(Tile.Empty);
    }
    expect(() => createGame({ seed: 1, arenaId: CITY_RUMBLE_ID, players: field(33) })).toThrow();
    expect(() => createGame({ seed: 1, players: field(5) })).toThrow();
  });

  it('is a three-minute match where the city closes from 2:00 left around a core that never closes', () => {
    const s = createGame({ seed: 3, arenaId: CITY_RUMBLE_ID, players: field(8) });
    expect(s.settings.mode).toBe('crush');
    expect(s.config.match.durationTicks).toBe(180 * 60);
    const crush = s.crush!;
    const core = s.config.crush.keepCore!;
    const x0 = (s.width - core.w) / 2;
    const y0 = (s.height - core.h) / 2;
    for (const i of crush.order) {
      const x = i % s.width;
      const y = Math.floor(i / s.width);
      expect(x >= x0 && x < x0 + core.w && y >= y0 && y < y0 + core.h).toBe(false);
    }
    expect(crush.warnAt[0]).toBe(s.config.match.durationTicks - 120 * 60);
    const lastLand = crush.warnAt[crush.warnAt.length - 1]! + s.config.crush.warnTicks;
    expect(lastLand).toBe(s.config.match.durationTicks - 30 * 60);
    // the endgame trap waves sit inside the core
    for (const wave of s.endgameTraps.waves) {
      expect(wave.length).toBeGreaterThan(4);
      for (const t of wave) {
        const x = t.index % s.width;
        const y = Math.floor(t.index / s.width);
        expect(x >= x0 && x < x0 + core.w && y >= y0 && y < y0 + core.h).toBe(true);
      }
    }
  });

  it('a 32-player match runs deterministically through the closing city', () => {
    const play = () => {
      const s = createGame({ seed: 9, arenaId: CITY_RUMBLE_ID, players: field(32) });
      for (let i = 0; i < 2000; i++) tick(s, {});
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });
});
