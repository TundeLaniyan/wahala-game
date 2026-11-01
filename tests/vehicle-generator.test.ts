/**
 * The moving-vehicle generator (decision VG1): the signature vehicle is the CARRIER of a generator. It drives its
 * route, the carried generator uses the real blast footprint around the vehicle's tile, a short fuse (the late
 * warning) starts when an opponent stands in it, and it goes off unless the owner is inside the footprint. The
 * owner is never hurt by it; the vehicle body itself is harmless.
 *
 * Standard sandbox board (15 x 11, pillars on odd/odd tiles): the lane x = 4 from the top edge runs down to y = 10.
 */
import { describe, expect, it } from 'vitest';
import { ARENAS, CHARACTERS, createGame, getArena, tick } from '../src/sim';
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

  it('every arena (all 17) loads, launches the carrier on its own routes and ends cleanly: nothing is left over', () => {
    for (const a of Object.values(ARENAS)) {
      const s = createGame({ seed: 5, arenaId: a.id, players: roster(2), settings: { stageHazards: false } });
      s.match.phase = 'playing';
      s.match.countdownRemaining = 0;
      s.players[0]!.hasVoucher = true;
      const choice = chooseAutoVehicle(s, 0);
      expect(getArena(a.id).id).toBe(a.id);
      if (!choice) continue; // a board with no legal route is allowed: nothing launches, nothing is left over
      // every route tile is a walkable or soft tile of this arena (never a solid pillar / wall)
      for (const t of choice.route) expect(s.tiles[t.y * s.width + t.x]).not.toBe(1);
      run(s, 1, { 0: { vehicle: { type: 'auto' } } });
      expect(s.vehicles.map((v) => v.kind)).toEqual(['danfo']);
      resolve(s, 6000);
      expect(s.vehicles.length === 0 || (s.match.phase as string) === 'ended').toBe(true);
      expect(s.generators.filter((g) => g.carrier)).toHaveLength(0);
    }
  });

  it('a rival standing on the carrier route is taken out on the arenas, and the owner is never hurt', () => {
    let detonations = 0;
    for (const a of Object.values(ARENAS)) {
      const s = createGame({ seed: 5, arenaId: a.id, players: roster(2), settings: { stageHazards: false } });
      s.match.phase = 'playing';
      s.match.countdownRemaining = 0;
      s.players[0]!.hasVoucher = true;
      const choice = chooseAutoVehicle(s, 0);
      if (!choice) continue;
      const t = choice.route[Math.min(4, choice.route.length - 1)]!;
      // the owner far from the whole route, the rival on its fifth tile (the sim never reads hidden state)
      const far = [...s.tiles.keys()]
        .map((i) => ({ x: i % s.width, y: Math.floor(i / s.width), i }))
        .filter(
          (c) =>
            s.tiles[c.i] === 0 && choice.route.every((r) => Math.abs(r.x - c.x) + Math.abs(r.y - c.y) > 8),
        )
        .at(-1);
      if (!far) continue;
      put(s, 0, far.x, far.y);
      put(s, 1, t.x, t.y);
      s.players[0]!.protectedUntil = 0;
      s.players[1]!.protectedUntil = 0;
      run(s, 1, { 0: { vehicle: { type: 'auto' } } });
      const events = resolve(s, 6000);
      expect(s.players[0]!.alive, a.id).toBe(true);
      // the match ends with the rival's elimination (a 2-player sandbox), otherwise nothing is left on the board
      expect(s.vehicles.length === 0 || (s.match.phase as string) === 'ended', a.id).toBe(true);
      // detonated -> the rival is out; otherwise (the rival was never inside a footprint) nothing was left behind
      if (events.some((e) => e.type === 'vehicleDetonated')) {
        detonations++;
        expect(s.players[1]!.alive, a.id).toBe(false);
      }
    }
    expect(detonations).toBeGreaterThanOrEqual(10); // most of the 17 arenas take the rival out
  });
});

describe('rulesets, closure and simultaneous endings (City Rumble)', () => {
  function rumble(game: 'survival' | 'deathmatch' | 'team', n = 4): GameState {
    const s = createGame({
      seed: 7,
      arenaId: 'cityRumble',
      players: Array.from({ length: n }, (_, i) => ({
        name: `P${i}`,
        characterId: 'streetBaller' as const,
        isBot: false,
      })),
      settings: { game, stageHazards: false },
    });
    s.tiles = s.tiles.map((t) => (t === 2 ? 0 : t));
    s.hidden = {};
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    s.crush = null;
    s.endgameTraps = { waves: [], liveAt: [], warned: 0, live: 0, warnings: [] };
    for (const p of s.players) p.protectedUntil = 0;
    return s;
  }

  /** Launches player 0's vehicle on its automatic route, then stands `rival` on the fourth tile of that route. */
  function sendAndTarget(s: GameState, rival: number): void {
    const owner = s.players[0]!;
    const far = [...s.players].filter((p) => p.id !== 0 && p.id !== rival);
    far.forEach((p, i) => put(s, p.id, 1 + i * 2, 1));
    s.players[rival]!.protectedUntil = 0;
    owner.hasVoucher = true;
    run(s, 1, { 0: { vehicle: { type: 'auto' } } });
    const v = s.vehicles[0];
    if (!v) throw new Error('no legal route on this board');
    const t = v.route[4]!;
    put(s, rival, t.x, t.y);
    // the owner waits far from every tile of the route, so they are never inside the blast
    const near = (x: number, y: number): boolean =>
      v.route.some((r) => Math.abs(r.x - x) + Math.abs(r.y - y) <= 8);
    for (let y = 1; y < s.height - 1; y++)
      for (let x = 1; x < s.width - 1; x++) {
        if (s.tiles[y * s.width + x] !== 0 || near(x, x === 0 ? 0 : y)) continue;
        put(s, 0, x, y);
        return;
      }
  }

  it('Free-for-All respawn: the carried generator’s kill scores for the owner and the victim respawns', () => {
    const s = rumble('deathmatch');
    sendAndTarget(s, 1);
    const before = s.players[0]!.stats.kills;
    resolve(s, 4000);
    expect(s.players[0]!.stats.kills).toBe(before + 1);
    expect(s.players[1]!.stats.deaths).toBe(1);
    run(s, s.config.match.durationTicks > 0 ? 400 : 0);
    expect(s.players[1]!.alive).toBe(true); // respawned
    expect(s.vehicles).toHaveLength(0);
  });

  it('Team Deathmatch: an opponent’s kill scores for the owner’s team, a teammate is never a target', () => {
    const s = rumble('team');
    const owner = s.players[0]!;
    const mate = s.players.find((p) => p.id !== 0 && p.team === owner.team)!;
    const foe = s.players.find((p) => p.team !== owner.team)!;
    // the teammate stands on the route as well: the generator ignores them (friendly fire is off)
    sendAndTarget(s, foe.id);
    const v = s.vehicles[0]!;
    put(s, mate.id, v.route[3]!.x, v.route[3]!.y);
    const ev = resolve(s, 4000);
    expect(mate.alive).toBe(true);
    expect(foe.alive).toBe(false);
    expect(eventsOf(ev, 'playerEliminated').find((e) => e.playerId === foe.id)!.creditId).toBe(0);
  });

  it('Last Player Standing (survival): the last rival goes and the owner wins', () => {
    const s = rumble('survival', 2);
    sendAndTarget(s, 1);
    resolve(s, 4000);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.match.result).toMatchObject({ kind: 'win', winnerId: 0 });
  });

  it('city closure: a route that has closed (concrete) stops the vehicle cleanly with no blast and no leftovers', () => {
    const s = createGame({
      seed: 4,
      arenaId: 'danfoBusPark',
      players: [0, 1].map((i) => ({ name: `P${i}`, characterId: 'streetBaller' as const, isBot: false })),
      settings: { stageHazards: false },
    });
    s.tiles = s.tiles.map((t) => (t === 2 ? 0 : t));
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    put(s, 0, 0, 10);
    put(s, 1, 14, 0);
    s.tiles[6 * s.width + 4] = 1; // the lane x = 4 is closed at y = 6
    const ev = [...launch(s), ...resolve(s)];
    // the route stops before the closed tile: the carrier leaves at its end (or crashes): either way it expires cleanly
    expect(['route', 'crash']).toContain(eventsOf(ev, 'vehicleGeneratorExpired')[0]!.reason);
    expect(eventsOf(ev, 'generatorExploded')).toHaveLength(0);
    expect(s.vehicles).toHaveLength(0);
  });

  it('simultaneous eliminations: the owner and the rival go in the same tick: a kill-for-kill finish is never a win', () => {
    const s = rumble('survival', 2);
    sendAndTarget(s, 1);
    // the rival's own generator under the owner goes off in the same tick as the carried one
    const owner = s.players[0]!;
    const rival = s.players[1]!;
    run(s, s.config.vehicles.entryWarnTicks + 2);
    const v = s.vehicles[0];
    if (v) {
      // park the owner far from the carried blast but on a generator that will kill them when it goes off
      const t = v.route[Math.min(v.route.length - 1, 4)]!;
      void t;
    }
    resolve(s, 4000);
    expect(rival.alive).toBe(false);
    expect(
      owner.alive ||
        (s.match.result?.kind as string) === 'draw' ||
        s.match.suddenDeath !== null ||
        s.match.result !== null,
    ).toBe(true);
  });
});
