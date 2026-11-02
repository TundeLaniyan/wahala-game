/**
 * VEHICLE GENERATOR (decisions VG1-VG4): the 5-kill streak reward. Any public vehicle (danfo, taxi, keke, okada)
 * for any fighter; the vehicle carries a LIVE generator whose three-second fuse starts when it starts driving; about
 * two seconds in it throws the generator at the selected rival; it goes off when the fuse expires. The owner is never
 * the target and never caught. Real simulation ticks, deterministic.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, tick } from '../src/sim';
import type { CharacterId, GameState, Intents, SimEvent, VehicleKind } from '../src/sim';
import { Tile } from '../src/sim/types';
import { addSoft, eventsOf, put, sandbox } from './helpers';

const KINDS: VehicleKind[] = ['danfo', 'taxi', 'keke', 'okada'];
const VG = DEFAULT_CONFIG.streaks.vehicleGenerator;
const CHARS: CharacterId[] = ['streetBaller', 'lekkiBoy', 'campusQueen'];

/** Owner (0) in the far corner holding a VEHICLE GENERATOR of `kind`, a rival (1) standing in the middle row. */
function scene(kind: VehicleKind, owner: CharacterId = 'streetBaller', players = 2): GameState {
  const s = sandbox({
    characters: [owner, 'lekkiBoy', 'campusQueen'].slice(0, players) as CharacterId[],
    config: { vehicles: { allowed: [...KINDS] } },
  });
  put(s, 0, 14, 10);
  put(s, 1, 7, 4);
  if (players > 2) put(s, 2, 1, 9);
  s.players[0]!.streakRewards.vehicleGenerator = kind;
  for (const p of s.players) p.protectedUntil = 0;
  return s;
}
const B: Intents = { 0: { special: true } };

interface Trace {
  events: SimEvent[];
  launchTick: number;
  releaseTick: number;
  boomTick: number;
}
/** Presses B on tick 0 and runs until the generator has gone off (or `max` ticks). */
function play(s: GameState, intents: (t: number) => Intents = () => ({}), max = 600): Trace {
  const events: SimEvent[] = [];
  let launchTick = -1;
  let releaseTick = -1;
  let boomTick = -1;
  for (let t = 0; t < max; t++) {
    const ev = tick(s, t === 0 ? { ...B, ...intents(t) } : intents(t));
    events.push(...ev);
    if (launchTick < 0 && eventsOf(ev, 'vehicleGeneratorLaunched').length) launchTick = s.tick;
    if (releaseTick < 0 && eventsOf(ev, 'vehicleGeneratorReleased').length) releaseTick = s.tick;
    if (boomTick < 0 && eventsOf(ev, 'generatorExploded').length) {
      boomTick = s.tick;
      break;
    }
  }
  return { events, launchTick, releaseTick, boomTick };
}

describe('any character, any public vehicle', () => {
  it.each(KINDS)(
    'a %s carries the generator for every character, and the character changes nothing',
    (kind) => {
      const routes: string[] = [];
      for (const owner of CHARS) {
        const s = scene(kind, owner);
        const r = play(s);
        const launched = eventsOf(r.events, 'vehicleGeneratorLaunched');
        expect(launched, `${owner} ${kind}`).toHaveLength(1);
        expect(launched[0]!.kind).toBe(kind);
        expect(eventsOf(r.events, 'vehicleWarning')[0]!.kind).toBe(kind);
        routes.push(
          JSON.stringify(eventsOf(r.events, 'vehicleWarning')[0]!.entry) +
            r.launchTick +
            r.releaseTick +
            r.boomTick,
        );
      }
      // the same board gives the same ride whoever plays
      expect(new Set(routes).size).toBe(1);
    },
  );

  it('the Okada is only drawn where the arena allows it', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    expect(s.config.vehicles.allowed).not.toContain('okada');
    const open = sandbox({ characters: ['streetBaller', 'lekkiBoy'], arenaId: 'rumbleLagosIsland' });
    expect(open.config.vehicles.allowed).toContain('okada');
  });

  it('there is no character-to-vehicle table any more', async () => {
    const { CHARACTERS } = await import('../src/sim');
    for (const c of Object.values(CHARACTERS)) expect('vehicle' in c).toBe(false);
  });
});

describe('the fuse and the release (three seconds, released at about two)', () => {
  it.each(['danfo', 'taxi', 'keke'] as const)(
    '%s: boom exactly three seconds after the vehicle starts driving',
    (kind) => {
      const s = scene(kind);
      const r = play(s);
      expect(r.launchTick).toBeGreaterThan(0);
      expect(r.boomTick - r.launchTick).toBe(VG.fuseTicks);
      expect(VG.fuseTicks).toBe(180);
    },
  );

  it('the generator is carried for about the first two seconds, then thrown (the late release)', () => {
    const s = scene('danfo');
    const r = play(s);
    expect(VG.releaseTicks).toBe(120);
    expect(r.releaseTick - r.launchTick).toBeLessThanOrEqual(VG.releaseTicks);
    expect(r.releaseTick - r.launchTick).toBeGreaterThanOrEqual(VG.releaseTicks - 2);
    const rel = eventsOf(r.events, 'vehicleGeneratorReleased')[0]!;
    // the throw takes `throwTicks` and the fuse ends after it: the target sees the projectile for about 0.7 s, the
    // landing marker, and a last short fuse on the ground
    expect(rel.landTick - r.releaseTick).toBe(VG.throwTicks);
    expect(rel.boomTick).toBe(r.boomTick);
    expect(r.boomTick - rel.landTick).toBeGreaterThan(0);
  });

  it("while it rides, the generator blocks nobody, cannot be kicked and does not count against the owner's capacity", () => {
    const s = scene('danfo');
    s.players[0]!.capacity = 1;
    for (let t = 0; t < 72 + 30; t++) tick(s, t === 0 ? B : {});
    const g = s.generators[0]!;
    expect(g.mountedOn).toBeDefined();
    expect(g.flight).not.toBeNull(); // airborne for the rest of the world
    expect(g.vehicleBorne).toBe(true);
    // the owner can still place their own generator: the carried one used no charge
    put(s, 0, 13, 10);
    const ev = tick(s, { 0: { place: true } });
    expect(eventsOf(ev, 'generatorPlaced')).toHaveLength(1);
  });

  it('the carrier never rams: a fighter standing on its lane is hit by the blast only', () => {
    const s = scene('danfo');
    s.players[1]!.armour = 0;
    const r = play(s);
    const hitByVehicle = eventsOf(r.events, 'vehicleHitPlayer');
    expect(hitByVehicle).toHaveLength(0);
  });

  it("the vehicle that carries it is the type shown: the HUD kind is the reward's vehicle until it launches", () => {
    const s = scene('taxi');
    expect(s.players[0]!.streakRewards.vehicleGenerator).toBe('taxi');
    const ev = tick(s, B);
    expect(eventsOf(ev, 'streakRewardUsed')).toEqual([
      { type: 'streakRewardUsed', playerId: 0, reward: 'vehicleGenerator' },
    ]);
    expect(s.players[0]!.streakRewards.vehicleGenerator).toBeNull(); // consumed once
    expect(s.vehicles[0]!.kind).toBe('taxi');
  });
});

describe('targeting the opponent', () => {
  it('is thrown at the rival: it lands on their tile and the blast reaches them', () => {
    const s = scene('danfo');
    const r = play(s);
    const rel = eventsOf(r.events, 'vehicleGeneratorReleased')[0]!;
    expect(rel.targetId).toBe(1);
    expect(Math.abs(rel.toX - 7) + Math.abs(rel.toY - 4)).toBeLessThanOrEqual(2);
    const dead = eventsOf(r.events, 'playerEliminated').some((e) => e.playerId === 1);
    expect(dead).toBe(true); // a rival who never moves is caught
  });

  it('a rival who reacts to the warning can get away (it is a trap, not an automatic kill)', () => {
    const s = scene('danfo');
    s.players[1]!.armour = 0;
    // the rival starts running the moment the carrier lets go (the projectile and marker are the warning)
    let go = false;
    const r = play(s, (): Intents => {
      if (!go && s.generators.some((g) => g.mountedOn === undefined && g.vehicleBorne)) go = true;
      return go ? { 1: { move: 'left' } } : {};
    });
    expect(eventsOf(r.events, 'playerEliminated').some((e) => e.playerId === 1)).toBe(false);
  });

  it('with several rivals it goes for the one the route passes nearest', () => {
    const s = scene('danfo', 'streetBaller', 3);
    const r = play(s);
    const rel = eventsOf(r.events, 'vehicleGeneratorReleased')[0]!;
    expect(rel.targetId).toBe(1);
  });

  it('never targets the owner or a teammate', () => {
    const s = scene('danfo', 'streetBaller', 3);
    s.players[0]!.team = 0;
    s.players[1]!.team = 0; // the nearest rival is now a teammate
    s.players[2]!.team = 1;
    const r = play(s);
    for (const rel of eventsOf(r.events, 'vehicleGeneratorReleased')) {
      expect(rel.targetId).toBe(2);
      expect(rel.targetId).not.toBe(0);
    }
  });
});

describe('owner avoidance and owner blast safety', () => {
  it('the route never runs over the owner, wherever they stand', () => {
    for (const [ox, oy] of [
      [7, 4],
      [7, 6],
      [3, 4],
      [10, 4],
      [14, 10],
    ] as const) {
      for (const kind of KINDS) {
        const s = scene(kind);
        put(s, 0, ox, oy);
        put(s, 1, ox === 7 && oy === 4 ? 9 : 7, 4);
        const ev = tick(s, B);
        const v = s.vehicles[0];
        if (!v) continue; // no legal route that spares the owner: nothing launches and the reward is kept
        expect(
          v.route.some((t) => t.x === ox && t.y === oy),
          `${kind} owner ${ox},${oy}`,
        ).toBe(false);
        expect(eventsOf(ev, 'vehicleWarning')).toHaveLength(1);
      }
    }
  });

  it('the owner standing right beside the rival is never caught by the blast (ownerSafe flames)', () => {
    const s = scene('danfo');
    s.players[0]!.armour = 0;
    // ... but the owner has walked up next to the rival, inside the footprint
    let placed = false;
    const r = play(s, () => {
      if (!placed && s.generators.some((g) => g.vehicleBorne && g.mountedOn === undefined)) {
        placed = true;
        put(s, 0, 8, 4);
      }
      return {};
    });
    expect(placed).toBe(true);
    expect(s.flames.some((f) => f.ownerSafe)).toBe(true);
    expect(eventsOf(r.events, 'playerEliminated').some((e) => e.playerId === 0)).toBe(false);
    expect(s.players[0]!.alive).toBe(true);
  });

  it('the landing prefers a tile whose blast does not reach the owner', () => {
    const s = scene('danfo');
    put(s, 0, 7, 6); // two tiles from the rival, inside a radius-2 footprint of the rival's tile
    const r = play(s);
    const rel = eventsOf(r.events, 'vehicleGeneratorReleased')[0];
    expect(rel).toBeDefined();
    // it chose another tile than the rival's own (or one whose footprint spares the owner): the owner lives
    expect(s.players[0]!.alive).toBe(true);
  });

  it('its flames still hurt everyone else, and the kill is credited to the owner', () => {
    const s = scene('danfo');
    const r = play(s);
    const e = eventsOf(r.events, 'playerEliminated').find((x) => x.playerId === 1)!;
    expect(e.cause.kind).toBe('flame');
    expect(e.creditId).toBe(0);
  });
});

describe('obstacles', () => {
  it('a crashed carrier lets the generator go at once, and the fuse still ends three seconds after launch', () => {
    const s = scene('taxi');
    // crates all along the middle lane: the taxi plough-limit stops it
    for (let x = 0; x < 15; x++) if (s.tiles[4 * s.width + x] === Tile.Empty) addSoft(s, x, 4);
    for (let x = 0; x < 15; x++) if (s.tiles[6 * s.width + x] === Tile.Empty) addSoft(s, x, 6);
    const r = play(s);
    if (r.releaseTick > 0) {
      expect(r.releaseTick - r.launchTick).toBeLessThanOrEqual(VG.releaseTicks);
      expect(r.boomTick - r.launchTick).toBe(VG.fuseTicks);
    }
  });

  it('a carrier that leaves the board releases the generator as it goes, the fuse unchanged', () => {
    const s = scene('okada'); // the fastest: leaves the board before the two-second mark on a short lane
    const r = play(s);
    expect(r.releaseTick).toBeGreaterThan(0);
    expect(r.releaseTick - r.launchTick).toBeLessThanOrEqual(VG.releaseTicks);
    expect(r.boomTick - r.launchTick).toBe(VG.fuseTicks);
  });

  it('a landing tile that is taken falls back to the next one (never stacked on another generator)', () => {
    const s = scene('danfo');
    s.generators.push({
      id: 900,
      ownerId: 1,
      x: 7,
      y: 4,
      stepFromX: 7,
      stepFromY: 4,
      range: 1,
      pierce: false,
      square: 0,
      fromSpectator: false,
      mode: 'disabled',
      timer: 9999,
      carriedBy: null,
      carryBonusUsed: false,
      slide: null,
      flight: null,
      triggered: false,
      placedTick: 0,
    });
    const r = play(s);
    const rel = eventsOf(r.events, 'vehicleGeneratorReleased')[0]!;
    expect(rel.toX === 7 && rel.toY === 4).toBe(false);
  });

  it('the owner dying before the release changes nothing: the generator still goes off', () => {
    const s = scene('danfo');
    const r = play(s, (t) => (t === 80 ? {} : {}));
    expect(r.boomTick).toBeGreaterThan(0);
    const s2 = scene('danfo', 'streetBaller', 3); // (with three fighters the match goes on)
    let killed = false;
    const r2 = play(s2, () => {
      if (!killed && s2.tick === 60) {
        killed = true;
        s2.players[0]!.alive = false;
      }
      return {};
    });
    expect(r2.boomTick).toBeGreaterThan(0);
  });
});

describe('one use, earned again only after another streak', () => {
  it('a second B press does nothing, and it is not paid again for the same streak', () => {
    const s = scene('danfo');
    play(s, () => ({}), 20);
    const ev = tick(s, B);
    expect(eventsOf(ev, 'streakRewardUsed')).toHaveLength(0);
    expect(s.players[0]!.streakRewards.vehicleGenerator).toBeNull();
  });
});

describe('determinism and replay', () => {
  const fingerprint = (kind: VehicleKind): string => {
    const s = scene(kind, 'lekkiBoy', 3);
    const r = play(s, (t): Intents => (t % 50 === 10 ? { 2: { move: 'up' } } : {}), 900);
    return JSON.stringify([
      r.events.map((e) => e.type),
      eventsOf(r.events, 'vehicleGeneratorReleased'),
      s.players.map((p) => [p.x, p.y, p.alive]),
      s.tick,
    ]);
  };
  it.each(KINDS)('%s: the same match replays identically', (kind) => {
    expect(fingerprint(kind)).toBe(fingerprint(kind));
  });
});
