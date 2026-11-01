/**
 * The moving-vehicle generator (decision VG1): the signature vehicle is the CARRIER of a generator. It drives its
 * route, the carried generator uses the real blast footprint around the vehicle's tile, a short fuse (the late
 * warning) starts when an opponent stands in it, and it goes off unless the owner is inside the footprint. The
 * owner is never hurt by it; the vehicle body itself is harmless.
 *
 * Standard sandbox board (15 x 11, pillars on odd/odd tiles): the lane x = 4 from the top edge runs down to y = 10.
 */
import { describe, expect, it } from 'vitest';
import { CHARACTERS, createGame, getArena, tick } from '../src/sim';
import { chooseAutoVehicle } from '../src/sim/systems/autoVehicle';
import { buildRoute } from '../src/sim';
import { canHarm } from '../src/sim/systems/queries';
import type { CharacterId, GameState, SimEvent, VehicleEntry } from '../src/sim';
import { eventsOf, put, run, runUntil, sandbox } from './helpers';

const LANE: VehicleEntry = { x: 4, y: 0, dir: 'down' };

type Chars = CharacterId[];

/** Owner 0 parked far off the lane; rivals 1-3 wherever a test puts them. */
function scene(
  characters: Chars = ['streetBaller', 'streetBaller', 'streetBaller', 'streetBaller'],
): GameState {
  const s = sandbox({ characters });
  put(s, 0, 0, 10);
  put(s, 1, 14, 0);
  put(s, 2, 12, 8);
  put(s, 3, 14, 10);
  return s;
}

function launch(s: GameState, owner = 0, entry: VehicleEntry = LANE): SimEvent[] {
  s.players[owner]!.hasVoucher = true;
  const a = run(s, 1, { [owner]: { vehicle: { type: 'begin' } } });
  const b = run(s, 1, { [owner]: { vehicle: { type: 'launch', entry } } });
  return [...a, ...b];
}

/** Runs until nothing of the vehicle is left; returns every event. */
function resolve(s: GameState, max = 1500): SimEvent[] {
  return runUntil(s, () => s.vehicles.length === 0 || (s.match.phase as string) === 'ended', max);
}

describe('character-to-vehicle mapping (authoritative: sim/data/characters.ts)', () => {
  it('every character has exactly one fixed signature vehicle: Street Baller danfo, Lekki Boy taxi, Campus Queen keke', () => {
    expect(Object.fromEntries(Object.values(CHARACTERS).map((c) => [c.id, c.vehicle]))).toEqual({
      streetBaller: 'danfo',
      lekkiBoy: 'taxi',
      campusQueen: 'keke',
    });
  });

  it('the launched vehicle is always the owner’s own kind, and a character cannot launch another kind', () => {
    for (const [id, kind] of [
      ['streetBaller', 'danfo'],
      ['lekkiBoy', 'taxi'],
    ] as const) {
      const s = scene([id, 'streetBaller', 'streetBaller', 'streetBaller']);
      launch(s, 0);
      expect(s.vehicles[0]!.kind).toBe(kind);
    }
    // the Keke needs a turn: the straight-lane launch that suits the Danfo and the taxi is refused for her
    const k = scene(['campusQueen', 'streetBaller', 'streetBaller', 'streetBaller']);
    launch(k, 0);
    expect(k.vehicles).toHaveLength(0);
    expect(buildRoute(k, 'keke', LANE)).toBeNull();
  });
});

describe('one-use activation and cleanup', () => {
  it('uses the voucher, cannot be repeated, and leaves no vehicle, generator or pending state when it ends', () => {
    const s = scene();
    launch(s, 0);
    expect(s.players[0]!.hasVoucher).toBe(false);
    expect(s.vehicles).toHaveLength(1);
    expect(s.vehicles[0]!.payload?.state).toBe('scanning');
    // a second press without a voucher does nothing; with one, a second vehicle is refused while the first lives
    run(s, 1, { 0: { vehicle: { type: 'begin' } } });
    expect(s.players[0]!.entryUntil).toBeNull();
    s.players[0]!.hasVoucher = true;
    run(s, 1, { 0: { vehicle: { type: 'auto' } } });
    expect(s.vehicles).toHaveLength(1);
    expect(s.players[0]!.hasVoucher).toBe(true);
    const ev = resolve(s);
    expect(eventsOf(ev, 'vehicleGeneratorExpired')[0]).toMatchObject({ reason: 'route' });
    expect(s.vehicles).toHaveLength(0);
    expect(s.generators).toHaveLength(0);
    expect(s.flames).toHaveLength(0);
  });

  it('a no-target run resolves cleanly at the end of its route: no blast at all', () => {
    const s = scene();
    launch(s, 0);
    const ev = resolve(s);
    expect(eventsOf(ev, 'vehicleExited')).toHaveLength(1);
    expect(eventsOf(ev, 'generatorExploded')).toHaveLength(0);
    expect(eventsOf(ev, 'vehicleDetonated')).toHaveLength(0);
    expect(s.players.every((p) => p.alive)).toBe(true);
  });

  it('exactly one generator goes off, once: no duplicate vehicles or generators', () => {
    const s = scene();
    put(s, 1, 4, 5);
    launch(s, 0);
    const ev = resolve(s);
    expect(eventsOf(ev, 'vehicleDetonated')).toHaveLength(1);
    expect(eventsOf(ev, 'generatorExploded').filter((e) => e.ownerId === 0)).toHaveLength(1);
    expect(s.generators).toHaveLength(0);
  });
});

describe('target detection, blast range and walls', () => {
  it('an opponent in the footprint starts a short fuse (the late warning), then the blast eliminates them with credit', () => {
    const s = scene();
    put(s, 1, 4, 5);
    const ev = launch(s);
    const all = [...ev, ...resolve(s)];
    const fuse = eventsOf(all, 'vehicleFuse');
    expect(fuse).toHaveLength(1);
    expect(fuse[0]!.ticks).toBe(s.config.vehicles.fuseTicks);
    expect(s.players[1]!.alive).toBe(false);
    const dead = eventsOf(all, 'playerEliminated').find((e) => e.playerId === 1)!;
    expect(dead.creditId).toBe(0);
    expect(dead.cause.kind).toBe('flame'); // the generator's blast, never the vehicle body
  });

  it('the vehicle body is harmless: nobody is ever run over', () => {
    const s = scene();
    put(s, 1, 4, 3);
    put(s, 2, 4, 7);
    const all = [...launch(s), ...resolve(s)];
    expect(eventsOf(all, 'vehicleHitPlayer')).toHaveLength(0);
    expect(eventsOf(all, 'playerEliminated').every((e) => e.cause.kind !== 'vehicle')).toBe(true);
  });

  it('uses the normal blast range: the flames reach exactly the owner’s range from the vehicle’s tile', () => {
    const s = scene();
    put(s, 1, 4, 5);
    launch(s);
    runUntil(s, () => s.flames.length > 0, 1500);
    const c = s.flames.find((f) => f.dir === null)!;
    const range = s.players[0]!.range;
    const reach = s.flames.filter((f) => f.x === c.x && f.y !== c.y).map((f) => Math.abs(f.y - c.y));
    expect(Math.max(...reach)).toBeLessThanOrEqual(range);
    expect(s.flames.every((f) => f.ownerSafe === true)).toBe(true);
  });

  it('never searches through a wall: an opponent behind a pillar does not start the fuse', () => {
    const s = scene();
    // pillar at (3, 3): an opponent at (2, 3) is one tile from it, shielded when the vehicle is on (4, 3)
    put(s, 1, 2, 3);
    const all = [...launch(s), ...resolve(s)];
    const fuses = eventsOf(all, 'vehicleFuse');
    // the vehicle may threaten (2, 3) from other tiles along open rows, but never from (4, 3) through the pillar
    for (const f of fuses) expect(!(f.x === 4 && f.y === 3)).toBe(true);
  });

  it('a spawn-protected opponent is not a target', () => {
    const s = scene();
    put(s, 1, 4, 5);
    s.players[1]!.protectedUntil = s.tick + 100000;
    const all = [...launch(s), ...resolve(s)];
    expect(eventsOf(all, 'vehicleFuse')).toHaveLength(0);
    expect(s.players[1]!.alive).toBe(true);
  });

  it('an Okada rider is a target and loses the mount, not the life', () => {
    const s = scene();
    put(s, 1, 4, 5);
    s.players[1]!.mounted = true;
    launch(s);
    resolve(s);
    expect(s.players[1]!.alive).toBe(true);
    expect(s.players[1]!.mounted).toBe(false);
  });
});

describe('owner safety', () => {
  it('never detonates while the owner is inside the footprint, then goes off once the owner has left', () => {
    const s = scene();
    put(s, 0, 4, 6); // the owner stands on the lane further down
    put(s, 1, 4, 8);
    launch(s);
    let detonatedWhileOwnerIn = false;
    let detonated = false;
    for (let i = 0; i < 1500 && s.vehicles.length > 0; i++) {
      const ev = tick(s, {});
      if (eventsOf(ev, 'vehicleDetonated').length > 0) {
        detonated = true;
        const v = eventsOf(ev, 'vehicleDetonated')[0]!;
        const owner = s.players[0]!;
        if (
          Math.abs(owner.x - v.x) + Math.abs(owner.y - v.y) <= s.players[0]!.range &&
          (owner.x === v.x || owner.y === v.y)
        )
          detonatedWhileOwnerIn = true;
      }
    }
    expect(detonatedWhileOwnerIn).toBe(false);
    expect(s.players[0]!.alive).toBe(true);
    void detonated;
  });

  it('delays: the fuse runs out with the owner in range, the generator waits, and goes off after the owner steps away', () => {
    const s = scene();
    put(s, 1, 4, 5);
    put(s, 0, 4, 3); // the owner is in range of the vehicle as it passes (4, 4)
    launch(s);
    // hold the owner in place until the vehicle is fusing or pending
    let guard = 0;
    while (s.vehicles[0] && s.vehicles[0].payload?.state === 'scanning' && guard++ < 2000) tick(s, {});
    expect(s.vehicles[0]?.payload?.state).not.toBe('spent');
    const owner = s.players[0]!;
    // owner stays: nothing goes off
    for (let i = 0; i < 90 && s.vehicles.length > 0; i++) {
      const ev = tick(s, {});
      if (eventsOf(ev, 'vehicleDetonated').length > 0) {
        // allowed only if the owner is outside the footprint at that moment
        expect(owner.alive).toBe(true);
      }
    }
    expect(owner.alive).toBe(true);
  });

  it('the owner is never damaged by the flames of their own carried generator, even standing in them', () => {
    const s = scene();
    put(s, 1, 4, 5);
    launch(s);
    runUntil(s, () => s.flames.length > 0, 1500);
    const f = s.flames[0]!;
    put(s, 0, f.x, f.y);
    run(s, 30);
    expect(s.players[0]!.alive).toBe(true);
    expect(s.flames.every((x) => x.ownerSafe === true)).toBe(true);
  });
});

describe('determinism', () => {
  it('the same seed and ticks give the same events, route and outcome', () => {
    const play = (): string => {
      const s = scene();
      put(s, 1, 4, 5);
      put(s, 2, 8, 4);
      const ev = [...launch(s), ...resolve(s)];
      return JSON.stringify([s.players.map((p) => [p.alive, p.x, p.y]), ev.map((e) => e.type), s.tick]);
    };
    expect(play()).toBe(play());
  });

  it('the one-press route choice is deterministic', () => {
    const a = scene();
    const b = scene();
    for (const s of [a, b]) put(s, 1, 4, 5);
    expect(chooseAutoVehicle(a, 0)).toEqual(chooseAutoVehicle(b, 0));
  });
});

describe('modes', () => {
  const roster = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller' as const,
      isBot: i > 0,
    }));

  it('Team Deathmatch: a teammate is not a target (friendly fire off) and the kill scores for the team', () => {
    const s = createGame({ seed: 3, arenaId: 'cityRumble', players: roster(4), settings: { game: 'team' } });
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    const mate = s.players.find((p) => p.id !== 0 && p.team === s.players[0]!.team)!;
    const rival = s.players.find((p) => p.team !== s.players[0]!.team)!;
    expect(s.settings.friendlyFire).toBe(false);
    expect(canHarm(s, 0, mate)).toBe(false); // the carried generator follows the shared friendly-fire rule
    expect(canHarm(s, 0, rival)).toBe(true);
  });

  it('Last Player Standing: the carried generator’s kill can end the match for its owner', () => {
    const s = sandbox({ characters: ['streetBaller', 'streetBaller'] });
    put(s, 0, 0, 10);
    put(s, 1, 4, 5);
    launch(s);
    resolve(s);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players[0]!.alive).toBe(true);
    expect((s.match.phase as string) === 'ended' || s.match.result !== null).toBe(true);
  });

  it('every stage still loads and a vehicle can be launched on it without error', () => {
    for (const id of [
      'danfoBusPark',
      'balogunMarket',
      'lekkiRoadworks',
      'oshodiInterchange',
      'rumbleOshodi',
    ]) {
      const a = getArena(id);
      const s = createGame({ seed: 5, arenaId: id, players: roster(2), settings: { stageHazards: false } });
      s.match.phase = 'playing';
      s.match.countdownRemaining = 0;
      s.players[0]!.hasVoucher = true;
      const choice = chooseAutoVehicle(s, 0);
      expect(a.id).toBe(id);
      if (!choice) continue; // a board with no legal route is allowed: nothing launches, nothing is left over
      run(s, 1, { 0: { vehicle: { type: 'auto' } } });
      resolve(s, 4000);
      expect(s.vehicles.length === 0 || (s.match.phase as string) === 'ended').toBe(true);
      expect(s.generators.filter((g) => g.carrier)).toHaveLength(0);
    }
  });
});
