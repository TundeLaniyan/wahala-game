import { describe, expect, it } from 'vitest';
import { STANDARD_ARENA_IDS, Tile, createGame, getArena, isLethalStageEvent, tick } from '../src/sim';
import type { GameState, SimEvent, StageEvent } from '../src/sim';
import { addGenerator, eventsOf, put, run, sandbox } from './helpers';

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
        for (const e of tick(s, {})) if (e.type === 'stageWarning') out.push(`${s.tick}:${e.event.tiles.join('.')}`);
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
          if (isLethalStageEvent(e.event)) expect(e.event.startTick - e.event.warnTick).toBeGreaterThanOrEqual(1.5 * TPS);
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
        return x >= 0 && x < W && y >= 0 && y < 11 && s.tiles[idx(x, y)] === Tile.Empty && !ev.tiles.includes(idx(x, y));
      });
    const lane = ev.tiles.slice(1, 6).find((t) => exitOf(t) !== undefined)!;
    const off = exitOf(lane)!;
    put(s, 0, lane % W, Math.floor(lane / W));
    const out = run(s, ev.startTick - s.tick + ev.tiles.length * ev.stepTicks + 2, (t) => (t < 2 ? { 0: { move: off } } : {}));
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
        for (const p of s.players) expect(Math.abs(p.x - (t % W)) + Math.abs(p.y - Math.floor(t / W))).toBeGreaterThanOrEqual(2);
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
    const back = run(s, 40, (t) => (t === 20 ? { 0: { move: 'up' } } : t === 32 ? { 0: { move: 'down' } } : {}));
    expect(eventsOf(back, 'playerTeleported')).toHaveLength(0);
    expect([s.players[0]!.x, s.players[0]!.y]).toEqual([12, 6]);
  });

  it('a blocked or burning far end means no trip', () => {
    for (const block of ['generator', 'flame'] as const) {
      const s = stage('ajegunleBackstreets');
      put(s, 0, 2, 3);
      put(s, 1, 14, 0);
      if (block === 'generator') addGenerator(s, { ownerId: 1, x: 12, y: 6, timer: 99999 });
      else s.flames.push({ x: 12, y: 6, eventId: 99, genId: 0, ownerId: 1, dir: null, tip: false, startTick: s.tick, endTick: s.tick + 600 });
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
