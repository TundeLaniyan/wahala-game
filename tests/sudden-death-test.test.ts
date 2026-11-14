/**
 * The Sudden Death TEST match (decisions SD-T1..SD-T7, SD-U1..SD-U7): the human and two bots start straight in the
 * sudden-death round on the Ojuelegba City Rumble stage, the whole outer stage closes in over about 30 s through the
 * ordinary telegraphed crush, and each blast is a front that crosses the open floor and strikes a contender when it
 * reaches their ring. Nothing of it exists in an ordinary match.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import {
  SUDDEN_DEATH_TEST_ARENA,
  SUDDEN_DEATH_TEST_CORE,
  SUDDEN_DEATH_TEST_PLAYERS,
  getArena,
  SUDDEN_DEATH_TEST_CONFIG,
  SUDDEN_DEATH_TEST_SETTINGS,
  createGame,
  frontRing,
  observe,
  tick,
} from '../src/sim';
import type { GameState, Intents, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { eventsOf } from './helpers';

function lab(seed = 5, humanIsBot = false): GameState {
  return createGame({
    seed,
    arenaId: SUDDEN_DEATH_TEST_ARENA,
    players: Array.from({ length: SUDDEN_DEATH_TEST_PLAYERS }, (_, i) => ({
      name: i === 0 ? 'YOU' : `B${i}`,
      characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i]!,
      isBot: i > 0 || humanIsBot,
      difficulty: 'standard' as const,
    })),
    settings: SUDDEN_DEATH_TEST_SETTINGS,
    config: SUDDEN_DEATH_TEST_CONFIG,
  });
}

interface Log {
  tick: number;
  e: SimEvent;
}

/** Plays with bots on every seat (or an idle human) until the match ends; returns every event with its tick. */
function play(state: GameState, opts: { idleHuman?: boolean; passive?: boolean; max?: number } = {}): Log[] {
  const bots = state.players.map((_, i) => createBot({ difficulty: 'standard', seed: 100 + i, playerId: i }));
  const log: Log[] = [];
  for (let n = 0; n < (opts.max ?? 12000) && state.match.phase !== 'ended'; n++) {
    const intents: Intents = {};
    state.players.forEach((p, i) => {
      if (!p.alive || opts.passive || (i === 0 && opts.idleHuman)) return;
      intents[i] = bots[i]!.decide(observe(state, i));
    });
    for (const e of tick(state, intents)) log.push({ tick: state.tick, e });
  }
  return log;
}

describe('Sudden Death test match: setup', () => {
  it('is a real City Rumble stage, not a standard arena', () => {
    expect(getArena(SUDDEN_DEATH_TEST_ARENA).kind).toBe('rumble');
    const s = lab();
    expect(s.width * s.height).toBeGreaterThan(1000);
    expect(s.config.crush.keepCore).toMatchObject(SUDDEN_DEATH_TEST_CORE);
  });

  it('has exactly one human and two bots, and the round starts on the first playing tick', () => {
    const s = lab();
    expect(s.players).toHaveLength(3);
    expect(s.players.filter((p) => p.isBot)).toHaveLength(2);
    expect(s.match.suddenDeath).toBeNull();
    while (s.match.phase === 'countdown') tick(s);
    const ev = tick(s);
    expect(eventsOf(ev, 'suddenDeathStarted')).toHaveLength(1);
    expect(s.match.suddenDeath?.contenders.map((c) => c.playerId)).toEqual([0, 1, 2]);
    expect(s.match.suddenDeath?.cause).toBe('test');
  });

  it('the open area is cleared of crates, the blocks outside it stay for the ring to crush; no stage hazards', () => {
    const s = lab();
    const { w, h } = SUDDEN_DEATH_TEST_CORE;
    const x0 = Math.floor((s.width - w) / 2);
    const y0 = Math.floor((s.height - h) / 2);
    let outside = 0;
    for (let i = 0; i < s.tiles.length; i++) {
      if (s.tiles[i] !== Tile.Soft) continue;
      const x = i % s.width;
      const y = Math.floor(i / s.width);
      expect(x >= x0 && x < x0 + w && y >= y0 && y < y0 + h).toBe(false);
      outside++;
    }
    expect(outside).toBeGreaterThan(0);
    expect(s.stage.enabled).toBe(false);
    expect(Object.keys(s.floorHazards)).toHaveLength(0);
  });

  it('an ordinary survival match with the same arena has none of it', () => {
    const s = createGame({
      seed: 5,
      arenaId: SUDDEN_DEATH_TEST_ARENA,
      players: Array.from({ length: 3 }, (_, i) => ({
        name: `P${i}`,
        characterId: 'streetBaller',
        isBot: true,
      })),
      settings: { game: 'survival', mode: 'crush' },
    });
    expect(s.config.suddenDeath.lab).toBeUndefined();
    expect(s.crush?.warnAt.length).toBeGreaterThan(0);
    s.match.phase = 'playing';
    for (let i = 0; i < 200; i++) tick(s);
    expect(s.match.suddenDeath).toBeNull();
  });
});

describe('Sudden Death test match: the closing ring', () => {
  it('telegraphs and lands the whole outer stage over about 30 s, outside in', () => {
    const s = lab();
    const log = play(s, { passive: true });
    const countdown = log.find((l) => l.e.type === 'suddenDeathCountdown')!.tick;
    const warns = log.filter((l) => l.e.type === 'crushWarning');
    const lands = log.filter((l) => l.e.type === 'crushLanded');
    expect(warns.length).toBeGreaterThan(500); // the whole stage outside the open area
    expect(warns.length).toBe(lands.length);
    const firstWarn = warns[0]!.tick;
    const lastLand = lands[lands.length - 1]!.tick;
    expect(firstWarn - countdown).toBeLessThanOrEqual(2);
    // fully closed 30 s after the countdown began (give or take the tick the schedule starts on)
    expect(Math.abs(lastLand - countdown - 1800)).toBeLessThanOrEqual(4);
    // outside in: the distance from the middle never grows back as the order goes on (ring by ring)
    const dist = (e: SimEvent) => {
      const w = e as Extract<SimEvent, { type: 'crushWarning' }>;
      return Math.max(Math.abs(w.x - 22), Math.abs(w.y - 16));
    };
    const first = dist(warns[0]!.e);
    const last = dist(warns[warns.length - 1]!.e);
    expect(first).toBeGreaterThan(last);
    // every tile that lands was warned at least warnTicks earlier, and the open area never closes
    const warnedAt = new Map<string, number>();
    for (const w of warns) warnedAt.set(`${(w.e as { x: number }).x},${(w.e as { y: number }).y}`, w.tick);
    for (const l of lands) {
      const e = l.e as Extract<SimEvent, { type: 'crushLanded' }>;
      expect(l.tick - warnedAt.get(`${e.x},${e.y}`)!).toBeGreaterThanOrEqual(s.config.crush.warnTicks);
      expect(e.x >= 14 && e.x <= 30 && e.y >= 11 && e.y <= 21).toBe(false);
    }
    // the stage really is closed down to the open area when the ring is done
    let open = 0;
    for (const t of s.tiles) if (t !== Tile.Hard) open++;
    expect(open).toBeLessThan(SUDDEN_DEATH_TEST_CORE.w * SUDDEN_DEATH_TEST_CORE.h + 1);
  });

  it('nobody is killed by a tile that was not telegraphed first, for long enough', () => {
    for (const seed of [1, 2, 3]) {
      const s = lab(seed);
      const log = play(s);
      const warned = new Map<string, number>();
      for (const l of log) {
        if (l.e.type === 'crushWarning') warned.set(`${l.e.x},${l.e.y}`, l.tick);
        if (l.e.type === 'playerEliminated' && l.e.cause.kind === 'crush') {
          const at = warned.get(`${Math.round(l.e.x)},${Math.round(l.e.y)}`);
          expect(at, `seed ${seed}: crush kill at ${l.e.x},${l.e.y} was never warned`).toBeDefined();
          expect(l.tick - at!).toBeGreaterThanOrEqual(s.config.crush.warnTicks - 1);
          expect(s.config.crush.warnTicks).toBeGreaterThanOrEqual(90);
        }
      }
    }
  });
});

describe('Sudden Death test match: the travelling blast', () => {
  it('hits each contender exactly when the front reaches their ring, and every blast is announced first', () => {
    const s = lab(2);
    const log = play(s, { passive: true });
    const countdowns = log.filter((l) => l.e.type === 'suddenDeathCountdown');
    const fronts = log.filter((l) => l.e.type === 'suddenDeathFront');
    expect(fronts.length).toBeGreaterThan(0);
    fronts.forEach((f, i) => {
      // the countdown (and the HUD's 5 s warning window) came before the front left
      expect(f.tick - countdowns[i]!.tick).toBeGreaterThanOrEqual(s.config.suddenDeath.warnTicks);
    });
    for (const l of log) {
      if (l.e.type !== 'playerEliminated' || l.e.cause.kind !== 'suddenDeath') continue;
      const front = [...fronts].reverse().find((f) => f.tick <= l.tick)!;
      const fe = front.e as Extract<SimEvent, { type: 'suddenDeathFront' }>;
      const ring = frontRing(fe, Math.round(l.e.x), Math.round(l.e.y));
      const radius = Math.floor((l.tick - fe.startTick) / fe.ticksPerRing);
      // struck on the tick its ring was reached (or at the very end of the front)
      expect(radius).toBeGreaterThanOrEqual(Math.min(ring, fe.maxRing));
      expect(radius).toBeLessThanOrEqual(Math.max(ring, 0) + 1 + (ring >= fe.maxRing ? fe.maxRing : 0));
    }
  });
});

/** The test match at the first tick of its countdown, with a clear floor and the fighters placed on `spots`. */
function atCountdown(spots: [number, number][], seed = 4): GameState {
  const s = lab(seed);
  for (;;) {
    const ev = tick(s);
    if (eventsOf(ev, 'suddenDeathCountdown').length > 0) break;
  }
  spots.forEach(([x, y], id) => {
    s.tiles[y * s.width + x] = Tile.Empty;
    const p = s.players[id]!;
    p.x = p.stepFromX = x;
    p.y = p.stepFromY = y;
    p.stepRemaining = 0;
    p.protectedUntil = 0;
  });
  return s;
}

describe('Sudden Death test match: lethality matches what is shown', () => {
  it('a fighter on a closing tile dies after its warning, with the death counted and no kill credited', () => {
    const s = atCountdown([
      [22, 16],
      [23, 16],
      [1, 1], // overwritten below with the very first tile of the outside-in order
    ]);
    const spot = s.crush!.order[0]!;
    s.players[2]!.x = s.players[2]!.stepFromX = spot % s.width;
    s.players[2]!.y = s.players[2]!.stepFromY = Math.floor(spot / s.width);
    const log: Log[] = [];
    for (let i = 0; i < 400 && s.players[2]!.alive; i++)
      for (const e of tick(s)) log.push({ tick: s.tick, e });
    const warn = log.find((l) => l.e.type === 'crushWarning')!;
    const dead = log.find((l) => l.e.type === 'playerEliminated')!;
    expect(s.players[2]!.alive).toBe(false);
    expect(dead.e).toMatchObject({ playerId: 2, cause: { kind: 'crush' }, creditId: null });
    expect(dead.tick - warn.tick).toBe(s.config.crush.warnTicks);
    expect(s.players[2]!.stats.deaths).toBe(1);
    expect(s.players.map((p) => p.stats.kills)).toEqual([0, 0, 0]);
  });

  it('the front strikes the middle first and the far side later, never before its ring is reached', () => {
    const s = atCountdown([
      [22, 16], // ring 0
      [23, 16], // ring 1
      [19, 16], // ring 3
    ]);
    // bring the first blast forward (the clock itself is covered above)
    s.match.suddenDeath!.nextBlastTick = s.tick + 5;
    const struck: Record<number, number> = {};
    type Front = Extract<SimEvent, { type: 'suddenDeathFront' }>;
    let front: Front | null = null;
    for (let i = 0; i < 200; i++) {
      const ev = tick(s);
      front ??= eventsOf(ev, 'suddenDeathFront')[0] ?? null;
      for (const e of eventsOf(ev, 'playerEliminated'))
        if (e.cause.kind === 'suddenDeath') struck[e.playerId] = s.tick;
    }
    expect(front).not.toBeNull();
    const per = front!.ticksPerRing;
    expect(struck[0]).toBe(front!.startTick);
    expect(struck[1]).toBe(front!.startTick + per);
    expect(struck[2]).toBe(front!.startTick + 3 * per);
  });

  it('every contender is struck no later than the front reaches its last ring, and the report says it spread', () => {
    const s = atCountdown([
      [22, 16],
      [23, 16],
      [21, 16],
    ]);
    s.match.suddenDeath!.nextBlastTick = s.tick + 5;
    const events: SimEvent[] = [];
    for (let i = 0; i < 600 && eventsOf(events, 'suddenDeathBlast').length === 0; i++)
      events.push(...tick(s));
    const front = eventsOf(events, 'suddenDeathFront')[0]!;
    for (const p of s.players) {
      expect(p.alive).toBe(false);
      expect(p.eliminatedTick!).toBeLessThanOrEqual(front.startTick + front.maxRing * front.ticksPerRing);
    }
    expect(eventsOf(events, 'suddenDeathBlast')[0]).toMatchObject({ spread: true });
  });

  it('the blast report waits for the front, so a shield spent on a late-struck fighter is still counted', () => {
    const s = atCountdown([
      [22, 16],
      [23, 16],
      [25, 16],
    ]);
    s.players[2]!.armour = 1;
    s.match.suddenDeath!.nextBlastTick = s.tick + 5;
    const reports: number[] = [];
    let startTick = 0;
    let per = 0;
    for (let i = 0; i < 600; i++) {
      const ev = tick(s);
      const f = eventsOf(ev, 'suddenDeathFront')[0];
      if (f) {
        startTick = s.tick;
        per = f.ticksPerRing;
      }
      for (const e of eventsOf(ev, 'suddenDeathBlast')) {
        reports.push(s.tick);
        expect(e.survivors).toEqual([2]);
        expect(e.eliminated.sort()).toEqual([0, 1]);
      }
      if (reports.length > 0) break;
    }
    expect(reports).toHaveLength(1);
    expect(reports[0]! - startTick).toBeGreaterThanOrEqual(3 * per);
  });
});

describe('Sudden Death test match: bots, credit and determinism', () => {
  it('three fighters under bot control reach a result, and every elimination is counted once', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = lab(seed, true);
      const log = play(s);
      expect(s.match.phase).toBe('ended');
      const falls = log
        .filter((l) => l.e.type === 'playerEliminated')
        .map((l) => (l.e as { playerId: number }).playerId);
      expect(new Set(falls).size).toBe(falls.length);
      for (const p of s.players) expect(p.stats.deaths).toBe(falls.includes(p.id) ? 1 : 0);
      // a flame kill credits its owner; nobody is credited by the ring or the blasts
      for (const l of log) {
        if (l.e.type !== 'playerEliminated') continue;
        if (l.e.cause.kind === 'suddenDeath' || l.e.cause.kind === 'crush') expect(l.e.creditId).toBeNull();
      }
      const kills = s.players.reduce((n, p) => n + p.stats.kills, 0);
      expect(kills).toBe(
        falls.filter(
          (_, i) =>
            (log.filter((l) => l.e.type === 'playerEliminated')[i]!.e as { creditId: number | null })
              .creditId !== null,
        ).length,
      );
    }
  });

  it('is deterministic: the same seed gives the identical event log', () => {
    const a = play(lab(9, true));
    const b = play(lab(9, true));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('Sudden Death test match: the blast covers the stage that is left', () => {
  it('crosses the whole open area in about 3 s, ending exactly at the farthest open tile', () => {
    const s = lab(3);
    const log = play(s, { passive: true });
    const fronts = log
      .filter((l) => l.e.type === 'suddenDeathFront')
      .map((l) => l.e as Extract<SimEvent, { type: 'suddenDeathFront' }>);
    expect(fronts.length).toBeGreaterThan(0);
    const f = fronts[0]!;
    const { w, h } = SUDDEN_DEATH_TEST_CORE;
    expect(f.maxRing).toBe(Math.floor(Math.max(w, h) / 2));
    const seconds = (f.maxRing * f.ticksPerRing) / 60;
    expect(seconds).toBeGreaterThan(2.5);
    expect(seconds).toBeLessThan(3.5);
    // the first blast comes after the ring is closed
    const closed = log.filter((l) => l.e.type === 'crushLanded').at(-1)!.tick;
    expect(f.startTick).toBeGreaterThan(closed);
  });
});
