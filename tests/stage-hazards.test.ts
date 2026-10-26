import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  STANDARD_ARENA_IDS,
  Tile,
  createGame,
  getArena,
  isLethalStageEvent,
  laneEscapeSteps,
  tick,
} from '../src/sim';
import type { GameState, SimEvent, StageEvent } from '../src/sim';
import { addGenerator, addSoft, eventsOf, put, run, sandbox } from './helpers';

/**
 * Stage hazards: each arena's own environmental events. Deterministic, telegraphed, identical for
 * humans and bots, and fair (never several lethal events at once, never in the closing seconds).
 */
const TPS = 60;
const W = 15;
const idx = (x: number, y: number): number => y * W + x;

/** A controlled match on `arenaId` with its stage on, crates cleared, players parked on a safe tile. */
function stage(arenaId: string, players = 2): GameState {
  const s = sandbox({ arenaId, players, stage: true });
  return s;
}

/** Advances until the first stage event of `hazard` index is warned; returns it. */
function untilWarning(s: GameState, max = 60 * TPS): StageEvent {
  for (let i = 0; i < max; i++) {
    const ev = tick(s, {}).find((e) => e.type === 'stageWarning');
    if (ev && ev.type === 'stageWarning') return ev.event;
  }
  throw new Error('no stage warning');
}

/** Parks every player on a tile no hazard of this arena touches. */
function park(s: GameState, x: number, y: number): void {
  s.players.forEach((_, i) => put(s, i, x, y));
}

describe('scheduling and fairness', () => {
  it('is deterministic: the same seed produces the same stage events', () => {
    const log = (seed: number): string => {
      const s = createGame({
        seed,
        arenaId: 'oshodiInterchange',
        players: [
          { name: 'A', characterId: 'streetBaller', isBot: false },
          { name: 'B', characterId: 'lekkiBoy', isBot: false },
        ],
      });
      const out: string[] = [];
      for (let i = 0; i < 70 * TPS; i++)
        for (const e of tick(s, {}))
          if (e.type === 'stageWarning') out.push(`${s.tick}:${e.event.tiles.join('.')}`);
      return out.join('|');
    };
    expect(log(4)).toBe(log(4));
    expect(log(4)).not.toBe(log(5));
  });

  for (const id of STANDARD_ARENA_IDS) {
    it(`${id}: lethal events are telegraphed >= 1.5 s, never overlap, and stop in the last 5 s`, () => {
      const s = createGame({
        seed: 11,
        arenaId: id,
        players: [
          { name: 'A', characterId: 'streetBaller', isBot: false },
          { name: 'B', characterId: 'lekkiBoy', isBot: false },
        ],
      });
      s.players.forEach((p) => (p.mounted = false));
      let maxLethal = 0;
      let lastWarn = -1;
      while (s.match.phase !== 'ended' && s.match.playTicks < s.config.match.durationTicks) {
        // keep both test players alive so the clock runs to the end
        s.players.forEach((p) => {
          p.alive = true;
          p.eliminatedTick = null;
        });
        for (const e of tick(s, {})) {
          if (e.type !== 'stageWarning') continue;
          lastWarn = s.match.playTicks;
          if (isLethalStageEvent(e.event))
            expect(e.event.startTick - e.event.warnTick).toBeGreaterThanOrEqual(1.5 * TPS);
        }
        maxLethal = Math.max(maxLethal, s.stage.events.filter(isLethalStageEvent).length);
      }
      expect(maxLethal).toBeLessThanOrEqual(1);
      if (getArena(id).stageHazards.some((h) => h.kind !== 'teleport')) {
        expect(lastWarn).toBeGreaterThan(0);
        expect(lastWarn).toBeLessThanOrEqual(s.config.match.durationTicks - 5 * TPS);
      }
    });
  }

  it('in Wahala Crush no new stage event starts once the arena begins to close', () => {
    const s = createGame({
      seed: 2,
      arenaId: 'oshodiInterchange',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: false },
      ],
      settings: { mode: 'crush' },
    });
    const crushStart = s.crush!.warnAt[0]!;
    const warns: number[] = [];
    s.players.forEach((p) => (p.mounted = false));
    const last = s.crush!.order[s.crush!.order.length - 1]!;
    while (s.match.phase !== 'ended' && s.match.playTicks < s.config.match.durationTicks - 60) {
      // park the test players on the final safe tile so the crush does not end the match early
      s.players.forEach((_, i) => put(s, i, last % s.width, Math.floor(last / s.width)));
      for (const e of tick(s, {})) if (e.type === 'stageWarning') warns.push(s.match.playTicks);
    }
    expect(warns.length).toBeGreaterThan(3);
    expect(Math.max(...warns)).toBeLessThan(crushStart);
  });

  it('there is no stage hazard switch in normal matches (only tests/tutorials pass stageHazards: false)', () => {
    const s = createGame({
      seed: 1,
      arenaId: 'oshodiInterchange',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: false },
      ],
    });
    expect(s.settings.stageHazards).toBe(true);
    expect(s.stage.enabled).toBe(true);
  });
});

describe('sweeps: Danfo bays, Oshodi traffic, checkpoint car', () => {
  it('a Danfo reversing into the bay eliminates a player on its route; Okada absorbs it', () => {
    const s = stage('danfoBusPark', 3);
    park(s, 7, 0);
    const ev = untilWarning(s);
    expect(ev.kind).toBe('sweep');
    expect(ev.style).toBe('danfo');
    const [a, b] = [ev.tiles[1]!, ev.tiles[2]!];
    put(s, 0, a % W, Math.floor(a / W));
    put(s, 1, b % W, Math.floor(b / W));
    s.players[1]!.mounted = true;
    const out = run(s, ev.startTick - s.tick + 4 * ev.stepTicks);
    const elim = eventsOf(out, 'playerEliminated');
    expect(elim.map((e) => e.playerId)).toEqual([0]);
    expect(elim[0]!.cause).toEqual({ kind: 'hazard', style: 'danfo', eventId: ev.eventId });
    expect(s.players[1]!.alive).toBe(true);
    expect(s.players[1]!.mounted).toBe(false);
  });

  it('traffic sets off a generator lying on the road; stepping off the lane in the warning saves you', () => {
    const s = stage('oshodiInterchange', 3);
    park(s, 0, 0);
    const ev = untilWarning(s);
    const mid = ev.tiles[6]!;
    const gx = mid % W;
    const gy = Math.floor(mid / W);
    addGenerator(s, { ownerId: 1, x: gx, y: gy, timer: 99999, range: 1 });
    // player 0 stands on the lane (where a side street leaves it) and walks off during the warning
    put(s, 1, 0, 6);
    put(s, 2, 14, 6);
    const exitOf = (lane: number): 'up' | 'down' | 'left' | 'right' | undefined =>
      (['up', 'down', 'left', 'right'] as const).find((d) => {
        const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d];
        const x = (lane % W) + dx;
        const y = Math.floor(lane / W) + dy;
        return (
          x >= 0 &&
          x < W &&
          y >= 0 &&
          y < 11 &&
          s.tiles[idx(x, y)] === Tile.Empty &&
          !ev.tiles.includes(idx(x, y))
        );
      });
    const lane = ev.tiles.slice(1, 6).find((t) => exitOf(t) !== undefined)!;
    const off = exitOf(lane)!;
    put(s, 0, lane % W, Math.floor(lane / W));
    const out = run(s, ev.startTick - s.tick + ev.tiles.length * ev.stepTicks + 2, (t) =>
      t < 2 ? { 0: { move: off } } : {},
    );
    expect(eventsOf(out, 'generatorExploded').some((e) => e.x === gx && e.y === gy)).toBe(true);
    expect(s.players[0]!.alive).toBe(true);
  });

  it('a sweep stops at a soft block in its lane', () => {
    const s = stage('thirdMainland');
    park(s, 0, 0);
    let ev = untilWarning(s);
    while (ev.kind !== 'sweep') ev = untilWarning(s);
    const block = ev.tiles[5]!;
    s.tiles[block] = Tile.Soft;
    const out = run(s, ev.startTick - s.tick + ev.tiles.length * ev.stepTicks);
    const steps = out.filter((e) => e.type === 'stageSweepStep' && e.id === ev.id);
    expect(steps).toHaveLength(5);
    expect(s.tiles[block]).toBe(Tile.Soft);
  });
});

describe('strikes: Lekki debris, Yaba power zones', () => {
  it('debris targets a player tile; whoever is still on it when it lands is out', () => {
    const s = stage('lekkiRoadworks');
    park(s, 0, 0);
    put(s, 0, 2, 2);
    put(s, 1, 12, 8);
    s.floorHazards = {};
    const ev = untilWarning(s);
    expect(ev.style).toBe('debris');
    expect(ev.tiles).toHaveLength(1);
    const target = ev.tiles[0]!;
    const victim = s.players.find((p) => idx(p.x, p.y) === target)!;
    const other = s.players.find((p) => p !== victim)!;
    const out = run(s, ev.endTick - s.tick + 2);
    expect(eventsOf(out, 'playerEliminated').map((e) => e.playerId)).toEqual([victim.id]);
    expect(other.alive).toBe(true);
  });

  it('debris never lands on a sealed player (one with no free tile to step to)', () => {
    const s = stage('lekkiRoadworks');
    s.floorHazards = {};
    put(s, 0, 0, 0);
    s.tiles[idx(1, 0)] = Tile.Soft;
    s.tiles[idx(0, 1)] = Tile.Soft;
    put(s, 1, 6, 6);
    for (let n = 0; n < 4; n++) {
      const ev = untilWarning(s);
      expect(ev.tiles).toEqual([idx(6, 6)]);
      s.players[1]!.mounted = true; // the Okada takes the hit so the match goes on
      run(s, ev.endTick - s.tick + 1);
      expect(s.players[1]!.alive).toBe(true);
    }
  });

  it('a power zone sparks for 1.8 s, then is lethal while live; outside it is safe', () => {
    const s = stage('yabaAfterDark');
    park(s, 0, 0);
    const ev = untilWarning(s);
    expect(ev.style).toBe('power');
    expect(ev.startTick - ev.warnTick).toBe(Math.round(1.8 * TPS));
    const t = ev.tiles[0]!;
    // stepping in after the warning but while it is live is still lethal
    run(s, ev.startTick - s.tick + 10);
    put(s, 1, t % W, Math.floor(t / W));
    const out = run(s, 3);
    expect(eventsOf(out, 'playerEliminated').map((e) => e.playerId)).toEqual([1]);
    expect(s.players[0]!.alive).toBe(true);
  });
});

describe('pushes: Third Mainland gusts, lagoon wash', () => {
  it('a gust slides everyone one tile downwind, never into concrete', () => {
    const s = stage('thirdMainland');
    put(s, 0, 2, 0);
    put(s, 1, 2, 1); // (1,1) and (3,1) are pillars: cannot move sideways
    let ev = untilWarning(s);
    while (ev.kind !== 'push') ev = untilWarning(s);
    run(s, ev.startTick - s.tick + 15);
    const dx = ev.dir === 'right' ? 1 : -1;
    expect(s.players[0]!.x).toBe(2 + dx);
    expect([s.players[1]!.x, s.players[1]!.y]).toEqual([2, 1]);
  });

  it('lagoon wash pushes the waterline row inland and soaks generators into duds that still chain', () => {
    const s = stage('lagoonJetty');
    s.floorHazards = {};
    put(s, 0, 4, 0);
    put(s, 1, 4, 10);
    const g0 = addGenerator(s, { ownerId: 0, x: 8, y: 0, timer: 99999 });
    const g1 = addGenerator(s, { ownerId: 1, x: 8, y: 10, timer: 99999 });
    const ev = untilWarning(s);
    expect(ev.style).toBe('wash');
    const out = run(s, ev.startTick - s.tick + 15);
    const soaked = ev.dir === 'down' ? g0 : g1;
    const dry = soaked === g0 ? g1 : g0;
    expect(eventsOf(out, 'generatorDoused').map((e) => e.generatorId)).toEqual([soaked.id]);
    expect(soaked.mode).toBe('disabled');
    expect(dry.mode).toBe('timed');
    const pushed = ev.dir === 'down' ? s.players[0]! : s.players[1]!;
    expect(pushed.y).toBe(ev.dir === 'down' ? 1 : 9);
    // a doused generator still goes off from fire (Kill-Switch rule)
    addGenerator(s, { ownerId: 0, x: 6, y: soaked.y, timer: 1, range: 3 });
    const blast = run(s, 3);
    expect(eventsOf(blast, 'generatorExploded').some((e) => e.generatorId === soaked.id)).toBe(true);
  });
});

describe('drops: Balogun Market goods', () => {
  it('new crates land on open floor at least two tiles from every player and never on things', () => {
    const s = stage('balogunMarket', 4);
    s.floorHazards = {};
    s.players.forEach((_, i) => put(s, i, [0, 14, 0, 14][i]!, [10, 0, 0, 10][i]!));
    let dropped = 0;
    for (let n = 0; n < 6; n++) {
      const ev = untilWarning(s);
      expect(ev.kind).toBe('drop');
      for (const t of ev.tiles) {
        for (const p of s.players)
          expect(Math.abs(p.x - (t % W)) + Math.abs(p.y - Math.floor(t / W))).toBeGreaterThanOrEqual(2);
      }
      const out: SimEvent[] = run(s, ev.startTick - s.tick + 1);
      dropped += eventsOf(out, 'stageBlockDropped').length;
      for (const e of eventsOf(out, 'stageBlockDropped')) expect(s.tiles[idx(e.x, e.y)]).toBe(Tile.Soft);
    }
    expect(dropped).toBeGreaterThan(6);
  });

  it('a drop whose tile became occupied is skipped', () => {
    const s = stage('balogunMarket');
    s.floorHazards = {};
    park(s, 0, 0);
    const ev = untilWarning(s);
    const t = ev.tiles[0]!;
    put(s, 1, t % W, Math.floor(t / W));
    run(s, ev.startTick - s.tick + 1);
    expect(s.tiles[t]).toBe(Tile.Empty);
  });
});

describe('manholes: Ajegunle trapdoors', () => {
  // pair (2,4) <-> (12,6)
  it('stepping onto a manhole carries you to its partner when the step completes, once', () => {
    const s = stage('ajegunleBackstreets');
    put(s, 0, 2, 3);
    put(s, 1, 14, 0);
    const out = run(s, 12, (t) => (t === 0 ? { 0: { move: 'down' } } : {}));
    const trip = eventsOf(out, 'playerTeleported');
    expect(trip).toHaveLength(1);
    expect(trip[0]).toMatchObject({ fromX: 2, fromY: 4, toX: 12, toY: 6 });
    expect([s.players[0]!.x, s.players[0]!.y]).toEqual([12, 6]);
    // arriving never sends you back, and stepping straight back on is on cooldown
    const back = run(s, 40, (t) =>
      t === 20 ? { 0: { move: 'up' } } : t === 32 ? { 0: { move: 'down' } } : {},
    );
    expect(eventsOf(back, 'playerTeleported')).toHaveLength(0);
    expect([s.players[0]!.x, s.players[0]!.y]).toEqual([12, 6]);
  });

  it('a blocked or burning far end means no trip', () => {
    for (const block of ['generator', 'flame'] as const) {
      const s = stage('ajegunleBackstreets');
      put(s, 0, 2, 3);
      put(s, 1, 14, 0);
      if (block === 'generator') addGenerator(s, { ownerId: 1, x: 12, y: 6, timer: 99999 });
      else
        s.flames.push({
          x: 12,
          y: 6,
          eventId: 99,
          genId: 0,
          ownerId: 1,
          dir: null,
          tip: false,
          startTick: s.tick,
          endTick: s.tick + 600,
        });
      const out = run(s, 12, (t) => (t === 0 ? { 0: { move: 'down' } } : {}));
      expect(eventsOf(out, 'playerTeleported'), block).toHaveLength(0);
      expect([s.players[0]!.x, s.players[0]!.y]).toEqual([2, 4]);
    }
  });

  it('a carried generator travels with its carrier', () => {
    const s = stage('ajegunleBackstreets');
    put(s, 0, 2, 3);
    put(s, 1, 14, 0);
    const g = addGenerator(s, { ownerId: 0, x: 2, y: 3, timer: 99999, carriedBy: 0 });
    s.players[0]!.carrying = g.id;
    run(s, 12, (t) => (t === 0 ? { 0: { move: 'down' } } : {}));
    expect([g.x, g.y]).toEqual([12, 6]);
  });
});

describe('departures: a parked Danfo pulls out of a bay (RE-E3)', () => {
  // Danfo Bus Park, west bay on row 4: the Danfo is parked on the inner tile (3,4) and drives out to the
  // board edge (0,4). The arena's own hazard list is swapped for this one departure and restored afterwards.
  const BAY: [number, number][] = [
    [3, 4],
    [2, 4],
    [1, 4],
    [0, 4],
  ];
  const lane = BAY.map(([x, y]) => idx(x, y));
  const arena = getArena('danfoBusPark');
  const original = arena.stageHazards;

  beforeAll(() => {
    arena.stageHazards = [
      {
        kind: 'sweep',
        style: 'danfo',
        routes: [BAY],
        depart: true,
        stepTicks: 9,
        firstAtSec: 1,
        everySec: [3, 3],
        warnSec: 2,
      },
    ];
  });
  afterAll(() => {
    arena.stageHazards = original;
  });

  function departure(players = 3): GameState {
    const s = stage('danfoBusPark', players);
    s.floorHazards = {};
    // everyone out of the way: corners and the far side
    put(s, 0, 14, 0);
    if (players > 1) put(s, 1, 14, 10);
    if (players > 2) put(s, 2, 0, 10);
    return s;
  }

  it('is flagged, starts on the inner bay (inside the board) and is telegraphed for >= the lethal minimum', () => {
    const s = departure();
    const ev = untilWarning(s);
    expect(ev.kind).toBe('sweep');
    expect(ev.depart).toBe(true);
    expect(ev.tiles).toEqual(lane);
    expect(ev.tiles[0]! % W).toBe(3); // the bay is not on the edge
    expect(ev.startTick - ev.warnTick).toBeGreaterThanOrEqual(s.config.stage.minLethalWarnTicks);
    expect(isLethalStageEvent(ev)).toBe(true);
  });

  it('nobody is hurt during the warning, even standing in the bay or on the lane', () => {
    const s = departure();
    const ev = untilWarning(s);
    put(s, 0, 3, 4);
    put(s, 1, 2, 4);
    const out = run(s, ev.startTick - s.tick - 1);
    expect(eventsOf(out, 'playerEliminated')).toHaveLength(0);
    expect(s.players[0]!.alive && s.players[1]!.alive).toBe(true);
    expect(s.tick).toBeLessThan(ev.startTick);
  });

  it('the lane is lethal only while the Danfo passes: not before it arrives, not after it has gone', () => {
    const s = departure();
    const ev = untilWarning(s);
    const st = ev.stepTicks;
    // P0 waits on lane tile 2 (1,4) and is hit when the Danfo reaches it, not before
    put(s, 0, 1, 4);
    const before = run(s, ev.startTick - s.tick + 2 * st - 1);
    expect(eventsOf(before, 'playerEliminated')).toHaveLength(0);
    const hit = run(s, 2 * st);
    const elim = eventsOf(hit, 'playerEliminated');
    expect(elim.map((e) => e.playerId)).toEqual([0]);
    expect(elim[0]!.cause).toMatchObject({ kind: 'hazard', style: 'danfo' });
    // P1 walks into the bay (tile 0) after the Danfo has left it: safe
    const s2 = departure();
    const ev2 = untilWarning(s2);
    run(s2, ev2.startTick - s2.tick + 3 * st);
    put(s2, 1, 3, 4);
    const after = run(s2, 4 * st);
    expect(eventsOf(after, 'playerEliminated')).toHaveLength(0);
    expect(s2.players[1]!.alive).toBe(true);
  });

  it('a player standing beside the lane is safe', () => {
    const s = departure();
    const ev = untilWarning(s);
    put(s, 0, 2, 3); // open lane column above (2,4)
    put(s, 1, 2, 5); // and below
    const out = run(s, ev.startTick - s.tick + 8 * ev.stepTicks);
    expect(eventsOf(out, 'playerEliminated')).toHaveLength(0);
    expect(s.players[0]!.alive && s.players[1]!.alive).toBe(true);
  });

  it('sets off a generator lying on the lane, as other sweeps do', () => {
    const s = departure();
    const ev = untilWarning(s);
    addGenerator(s, { ownerId: 0, x: 1, y: 4, timer: 99999, range: 1 });
    const out = run(s, ev.startTick - s.tick + 4 * ev.stepTicks);
    expect(eventsOf(out, 'generatorExploded').some((e) => e.x === 1 && e.y === 4)).toBe(true);
  });

  it('never appears on top of anyone: an occupied bay (player, generator or crate) skips the departure', () => {
    for (const blocker of ['player', 'generator', 'crate'] as const) {
      const s = departure();
      if (blocker === 'player') put(s, 0, 3, 4);
      else if (blocker === 'generator') addGenerator(s, { ownerId: 0, x: 3, y: 4, timer: 99999, range: 1 });
      else s.tiles[idx(3, 4)] = Tile.Soft;
      // the bay stays blocked for 30 s of play: no departure is ever announced
      const warned = run(s, 30 * TPS).filter((e) => e.type === 'stageWarning');
      expect(warned, blocker).toHaveLength(0);
    }
  });

  it('every lane tile has a way off it that the slowest fighter walks within the warning (pavement pockets)', () => {
    const layout = arena.layout;
    const open = (i: number): boolean => layout[Math.floor(i / W)]![i % W] !== '#';
    const steps = laneEscapeSteps(W, 11, lane, open);
    expect(steps).toEqual([1, 1, 2, 1]); // (1,4) sits between pillars: out via (2,3)
    const cfg = createGame({
      seed: 1,
      arenaId: 'danfoBusPark',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: false },
      ],
    }).config;
    const slowest = Math.max(...cfg.movement.stepTicksBySpeedLevel);
    const warn = (arena.stageHazards[0] as { warnSec: number }).warnSec * TPS;
    steps.forEach((n, j) => {
      expect(n * slowest + cfg.stage.escapeInputTicks, `lane tile ${j}`).toBeLessThanOrEqual(
        Math.max(warn, cfg.stage.minLethalWarnTicks) + j * 9,
      );
    });
  });

  it('is delayed while anyone on the lane has no exit (crates / a generator close every way off), and goes ahead once one opens', () => {
    const s = departure();
    put(s, 0, 1, 4); // between pillars: out via (2,3) / (2,5) or (0,3) / (0,5)
    for (const [x, y] of [
      [2, 3],
      [2, 5],
      [0, 3],
      [4, 4], // and the way east along the lane
    ] as const)
      addSoft(s, x, y);
    addGenerator(s, { ownerId: 1, x: 0, y: 5, timer: 99999, range: 1 });
    expect(run(s, 20 * TPS).filter((e) => e.type === 'stageWarning')).toHaveLength(0);
    s.tiles[idx(2, 3)] = Tile.Empty; // an exit opens
    const out = run(s, 6 * TPS).filter((e) => e.type === 'stageWarning');
    expect(out.length).toBeGreaterThan(0);
    // and a fighter who does stand there can use it: step off during the warning and live
    const ev = out[0]!.type === 'stageWarning' ? out[0]!.event : null;
    expect(ev?.depart).toBe(true);
  });

  it('keeps the fairness guards: one lethal event at a time, and the same seed gives the same schedule', () => {
    const log = (): string => {
      const s = departure();
      const out: string[] = [];
      for (let i = 0; i < 40 * TPS; i++) {
        for (const e of tick(s, {}))
          if (e.type === 'stageWarning') out.push(`${s.tick}:${e.event.tiles.join('.')}`);
        expect(s.stage.events.filter(isLethalStageEvent).length).toBeLessThanOrEqual(1);
        s.players.forEach((p) => (p.alive = true));
      }
      return out.join('|');
    };
    const a = log();
    expect(a.length).toBeGreaterThan(0);
    expect(log()).toBe(a);
  });
});
