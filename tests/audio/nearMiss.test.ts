import { describe, expect, it } from 'vitest';
import { createNearMissDetector } from '../../src/audio/nearMiss';
import type { GameState, SimEvent, Vehicle } from '../../src/sim';
import { put, sandbox } from '../helpers';

const blast: SimEvent = {
  type: 'generatorExploded',
  generatorId: 1,
  ownerId: 1,
  x: 5,
  y: 5,
  eventId: 3,
  range: 2,
};
const flame = (x: number, y: number, eventId = 3) =>
  ({ x, y, eventId, genId: 1, ownerId: 1, dir: 'right', tip: false, startTick: 0, endTick: 30 }) as const;
const vehicle = (over: Partial<Vehicle> = {}): Vehicle => ({
  id: 4,
  ownerId: 1,
  kind: 'danfo',
  route: [
    { x: 2, y: 3 },
    { x: 3, y: 3 },
    { x: 4, y: 3 },
    { x: 5, y: 3 },
  ],
  phase: 'driving',
  warnRemaining: 0,
  wreckRemaining: 0,
  hitPlayerIds: [],
  index: 1,
  stepRemaining: 0,
  stepTotal: 8,
  damage: 0,
  slowUntil: 0,
  softBroken: 0,
  playerHits: 0,
  exposedEvents: [],
  eventId: 9,
  startTick: 0,
  ...over,
});
const base = (): GameState => {
  const s = sandbox({ players: 3 });
  s.players[1]!.isBot = true;
  s.players[2]!.isBot = true;
  return s;
};

describe('near-miss detection', () => {
  it('reports a living player one tile from flames of a blast in this batch', () => {
    const s = base();
    put(s, 0, 8, 8);
    s.flames.push(flame(7, 8), flame(6, 8));
    const m = createNearMissDetector().detect([blast], s);
    expect(m).toEqual([{ kind: 'flame', playerId: 0, x: 7, y: 8, human: true }]);
  });

  it('ignores players on a flame tile (hit or protected), at distance 2+, dead players and old blasts', () => {
    const s = base();
    put(s, 0, 8, 8);
    s.flames.push(flame(8, 8), flame(9, 8)); // standing in the fire
    expect(createNearMissDetector().detect([blast], s)).toEqual([]);
    s.flames.length = 0;
    s.flames.push(flame(10, 8)); // two tiles away
    expect(createNearMissDetector().detect([blast], s)).toEqual([]);
    s.flames.length = 0;
    s.flames.push(flame(9, 8));
    s.players[0]!.alive = false;
    expect(createNearMissDetector().detect([blast], s)).toEqual([]);
    s.players[0]!.alive = true;
    expect(createNearMissDetector().detect([], s)).toEqual([]); // no explosion in this batch
    s.flames[0] = flame(9, 8, 99); // flames of some other, earlier blast
    expect(createNearMissDetector().detect([blast], s)).toEqual([]);
  });

  it('marks bots as not human and reports each player once per blast', () => {
    const s = base();
    put(s, 1, 8, 8);
    put(s, 0, 1, 1);
    s.flames.push(flame(7, 8));
    const d = createNearMissDetector();
    const first = d.detect([blast], s);
    expect(first.map((m) => [m.playerId, m.human])).toEqual([[1, false]]);
    expect(d.detect([blast], s)).toEqual([]); // same blast again (e.g. a repeated call) is not re-reported
  });

  it('an Okada that breaks counts as a close call', () => {
    const s = base();
    const m = createNearMissDetector().detect([{ type: 'okadaBroken', playerId: 0, x: 2, y: 2 }], s);
    expect(m).toEqual([{ kind: 'okada', playerId: 0, x: 2, y: 2, human: true }]);
    s.players[0]!.alive = false;
    expect(createNearMissDetector().detect([{ type: 'okadaBroken', playerId: 0, x: 2, y: 2 }], s)).toEqual(
      [],
    );
  });

  it('reports a driving vehicle passing next to a player once, never its owner or a victim', () => {
    const s = base();
    put(s, 0, 3, 4); // adjacent to the vehicle at (3,3)
    put(s, 1, 3, 2); // the owner is also adjacent
    s.vehicles.push(vehicle());
    const d = createNearMissDetector();
    expect(d.detect([], s)).toEqual([
      { kind: 'vehicle', playerId: 0, vehicleKind: 'danfo', x: 3, y: 3, human: true },
    ]);
    expect(d.detect([], s)).toEqual([]); // still adjacent next frame: not repeated
    s.vehicles[0]!.index = 2;
    expect(d.detect([], s)).toEqual([]); // moved on to (4,3): still adjacent diagonally, same pass
    // a different vehicle may be reported again, and once gone, a returning id is a new pass
    s.vehicles.length = 0;
    d.detect([], s);
    s.vehicles.push(vehicle());
    expect(d.detect([], s)).toHaveLength(1);
    // victims and non-driving vehicles are ignored
    const s2 = base();
    put(s2, 0, 3, 4);
    s2.vehicles.push(vehicle({ hitPlayerIds: [0] }), vehicle({ id: 5, phase: 'warning' }));
    expect(createNearMissDetector().detect([], s2)).toEqual([]);
    put(s2, 0, 3, 3); // on the vehicle's tile is a hit, not a near miss
    s2.vehicles.length = 0;
    s2.vehicles.push(vehicle());
    expect(createNearMissDetector().detect([], s2)).toEqual([]);
  });

  it('reset clears memory', () => {
    const s = base();
    put(s, 0, 3, 4);
    s.vehicles.push(vehicle());
    const d = createNearMissDetector();
    expect(d.detect([], s)).toHaveLength(1);
    d.reset();
    expect(d.detect([], s)).toHaveLength(1);
  });
});
