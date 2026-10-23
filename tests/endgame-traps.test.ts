import { describe, expect, it } from 'vitest';
import { ARENAS, STANDARD_ARENA_IDS, createGame, tick, Tile } from '../src/sim';
import type { GameState, MatchMode, SimEvent } from '../src/sim';
import { runMatch } from '../src/ai/headless';
import { put } from './helpers';

/**
 * Mandatory endgame floor traps: every standard match, every arena, every mode. They are
 * telegraphed, go live at 0:30 (wave 1) and 0:15 (wave 2), genuinely trip players, and never
 * interfere with the Wahala Crush schedule or its final tile.
 */
const TPS = 60;
const ARENA_IDS = STANDARD_ARENA_IDS;
const remaining = (s: GameState): number => s.config.match.durationTicks - s.match.playTicks;

function game(arenaId: string, mode: MatchMode = 'classic', players = 2, clearSoft = true): GameState {
  const s = createGame({
    seed: 9,
    arenaId,
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller' as const,
      isBot: false,
    })),
    // the arena's own stage hazards are tested separately (tests/stage-hazards.test.ts)
    settings: { mode, stageHazards: false },
  });
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  // by the endgame most crates are gone; clear them so every planned trap tile is open floor
  if (clearSoft) s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  if (s.crush) {
    // idle test players would be crushed in the first ring: park them on the final safe tile
    const last = s.crush.order[s.crush.order.length - 1]!;
    s.players.forEach((_, i) => put(s, i, last % s.width, Math.floor(last / s.width)));
  }
  return s;
}

/** Keeps every player parked out of harm's way (an open lane tile, far from traps) while time passes. */
function runUntil(s: GameState, remainingTicks: number, log: SimEvent[] = []): SimEvent[] {
  while (remaining(s) > remainingTicks && s.match.phase === 'playing') log.push(...tick(s));
  return log;
}

describe('endgame trap data', () => {
  for (const id of ARENA_IDS) {
    it(`${id}: two symmetric waves on open floor, no overlaps`, () => {
      const arena = ARENAS[id]!;
      expect(arena.endgameTraps.length).toBe(2);
      const seen = new Set<string>();
      for (const rows of arena.endgameTraps) {
        let count = 0;
        rows.forEach((row, y) => {
          for (let x = 0; x < row.length; x++) {
            if (row[x] === '.') continue;
            count++;
            expect(arena.layout[y]![x], `${x},${y} is a pillar`).not.toBe('#');
            // 4-fold mirror symmetry
            expect(rows[rows.length - 1 - y]![x]).toBe(row[x]);
            expect(row[row.length - 1 - x]).toBe(row[x]);
            expect(seen.has(`${x},${y}`), `${x},${y} in two waves`).toBe(false);
            seen.add(`${x},${y}`);
          }
        });
        expect(count).toBeGreaterThanOrEqual(8);
      }
    });
  }
});

describe('endgame traps are mandatory and on schedule', () => {
  for (const id of ARENA_IDS) {
    for (const mode of ['classic', 'crush'] as const) {
      it(`${id} / ${mode}: warned at 0:31.5, live at exactly 0:30 and 0:15, with the stage hazards OFF`, () => {
        const s = game(id, mode);
        expect(s.settings.stageHazards).toBe(false);
        const before = runUntil(s, 30 * TPS + 91);
        expect(before.some((e) => e.type === 'trapsWarning' || e.type === 'trapsActivated')).toBe(false);
        expect(Object.keys(s.floorHazards)).toHaveLength(0);

        const log: SimEvent[] = [];
        runUntil(s, 30 * TPS + 90, log);
        const warn = log.find((e) => e.type === 'trapsWarning');
        expect(warn, 'telegraphed 1.5 s ahead').toBeDefined();
        expect(remaining(s)).toBe(30 * TPS + 90);
        expect(Object.keys(s.floorHazards)).toHaveLength(0); // telegraphed, not live yet
        expect(s.endgameTraps.warnings.length).toBeGreaterThan(0);

        runUntil(s, 30 * TPS + 1, log);
        expect(log.some((e) => e.type === 'trapsActivated')).toBe(false);
        log.length = 0;
        runUntil(s, 30 * TPS, log);
        const live = log.find((e) => e.type === 'trapsActivated');
        expect(live && live.type === 'trapsActivated' && live.wave).toBe(0);
        const wave1 = Object.keys(s.floorHazards).length;
        expect(wave1).toBeGreaterThanOrEqual(mode === 'crush' ? 2 : 8);

        log.length = 0;
        runUntil(s, 15 * TPS, log);
        const second = log.filter((e) => e.type === 'trapsActivated');
        expect(second).toHaveLength(1);
        if (mode === 'classic') expect(Object.keys(s.floorHazards).length).toBeGreaterThan(wave1);
        expect(s.match.phase).toBe('playing');
      });
    }
  }

  it('there is no match setting that disables them', () => {
    const s = createGame({
      seed: 1,
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: false },
      ],
      settings: { stageHazards: false, crowdThrows: false, mode: 'classic' },
    });
    expect(s.endgameTraps.waves.length).toBe(2);
    expect(s.endgameTraps.waves.every((w) => w.length > 0)).toBe(true);
  });

  it("the arena's own floor traps stay live through the endgame and the waves add to them", () => {
    const s = createGame({
      seed: 3,
      arenaId: 'lekkiRoadworks',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: false },
      ],
    });
    s.match.phase = 'playing';
    s.stage.enabled = false; // keep the crane debris off the idle test players
    const early = Object.keys(s.floorHazards);
    expect(early.length).toBeGreaterThan(0);
    runUntil(s, 15 * TPS);
    for (const k of early) expect(s.floorHazards[Number(k)]).toBeDefined();
    expect(Object.keys(s.floorHazards).length).toBeGreaterThan(early.length);
  });
});

describe('endgame traps genuinely work, fairly', () => {
  const liveGame = (): { s: GameState; oil: number; hole: number } => {
    const s = game('danfoBusPark');
    runUntil(s, 30 * TPS);
    const entries = Object.entries(s.floorHazards);
    const oil = Number(entries.find(([, k]) => k === 'oil')![0]);
    const hole = Number(entries.find(([, k]) => k === 'pothole')![0]);
    return { s, oil, hole };
  };

  /** Finds an open neighbour from which a step lands on `target`, and the direction of that step. */
  const approach = (
    s: GameState,
    target: number,
  ): { from: [number, number]; dir: 'left' | 'right' | 'up' | 'down' } => {
    const tx = target % s.width;
    const ty = Math.floor(target / s.width);
    const options = [
      { from: [tx - 1, ty], dir: 'right' },
      { from: [tx + 1, ty], dir: 'left' },
      { from: [tx, ty - 1], dir: 'down' },
      { from: [tx, ty + 1], dir: 'up' },
    ] as const;
    for (const o of options) {
      const [x, y] = o.from;
      if (x < 0 || y < 0 || x >= s.width || y >= s.height) continue;
      const i = y * s.width + x;
      if (s.tiles[i] === Tile.Empty && s.floorHazards[i] === undefined) return { from: [x, y], dir: o.dir };
    }
    throw new Error('no approach');
  };

  const clearAround = (s: GameState, i: number): void => {
    const x = i % s.width;
    const y = Math.floor(i / s.width);
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const j = (y + dy) * s.width + (x + dx);
        if (x + dx >= 0 && x + dx < s.width && y + dy >= 0 && y + dy < s.height && s.tiles[j] === Tile.Soft)
          s.tiles[j] = Tile.Empty;
      }
  };

  it('a live oil slick makes the player slide; a live pothole makes them stumble', () => {
    const { s, oil, hole } = liveGame();
    clearAround(s, oil);
    const a = approach(s, oil);
    put(s, 0, a.from[0], a.from[1]);
    put(s, 1, 0, 0);
    const events: SimEvent[] = [];
    for (let t = 0; t < 2; t++) events.push(...tick(s, { 0: { move: a.dir } }));
    for (let t = 0; t < 40; t++) events.push(...tick(s));
    expect(events.some((e) => e.type === 'hazardTriggered' && e.kind === 'oil')).toBe(true);
    const p = s.players[0]!;
    expect(p.y * s.width + p.x).not.toBe(oil); // slid on past the slick

    clearAround(s, hole);
    const b = approach(s, hole);
    put(s, 0, b.from[0], b.from[1]);
    const ev2: SimEvent[] = [];
    for (let t = 0; t < 2; t++) ev2.push(...tick(s, { 0: { move: b.dir } }));
    expect(ev2.some((e) => e.type === 'hazardTriggered' && e.kind === 'pothole')).toBe(true);
    expect(s.players[0]!.dazedUntil).toBeGreaterThan(s.tick);
  });

  it('a wave never hides a trap under a crate: tiles still covered when it is telegraphed are skipped', () => {
    const s = game('danfoBusPark', 'classic', 2, false);
    const planned = s.endgameTraps.waves[0]!;
    const covered = planned.filter((t) => s.tiles[t.index] === Tile.Soft).map((t) => t.index);
    const open = planned.filter((t) => s.tiles[t.index] === Tile.Empty).map((t) => t.index);
    expect(covered.length + open.length).toBe(planned.length);
    runUntil(s, 30 * TPS);
    for (const i of covered) {
      if (s.tiles[i] === Tile.Soft) expect(s.floorHazards[i]).toBeUndefined();
    }
    for (const i of open) expect(s.floorHazards[i]).toBeDefined();
  });

  it('a trap that appears under a standing player does nothing until they step onto a trap', () => {
    const s = game('danfoBusPark');
    const target = s.endgameTraps.waves[0]![0]!.index;
    s.tiles[target] = Tile.Empty;
    put(s, 0, target % s.width, Math.floor(target / s.width));
    const events = runUntil(s, 30 * TPS - 60);
    expect(s.floorHazards[target]).toBeDefined();
    expect(events.some((e) => e.type === 'hazardTriggered')).toBe(false);
    expect(s.players[0]!.slide).toBeNull();
  });

  it('Wahala Crush: the final safe tile and its neighbours are never trapped, crushed tiles drop their trap', () => {
    for (const id of ARENA_IDS) {
      const s = game(id, 'crush');
      const last = s.crush!.order[s.crush!.order.length - 1]!;
      const near = [last, last - 1, last + 1, last - s.width, last + s.width];
      for (const w of s.endgameTraps.waves) for (const t of w) expect(near).not.toContain(t.index);
      runUntil(s, 10 * TPS);
      for (const k of Object.keys(s.floorHazards)) expect(s.tiles[Number(k)]).not.toBe(Tile.Hard);
    }
  });

  it('Wahala Crush timing is unchanged by the traps: 0:45 warning, 0:43.8 first landing, final tile at 0:00 = draw', () => {
    const s = game('lekkiRoadworks', 'crush');
    const last = s.crush!.order[s.crush!.order.length - 1]!;
    s.players.forEach((_, i) => put(s, i, last % s.width, Math.floor(last / s.width)));
    let firstWarn = -1;
    let firstLand = -1;
    let lastLand = -1;
    while (s.match.phase === 'playing') {
      for (const e of tick(s)) {
        if (e.type === 'crushWarning' && firstWarn < 0) firstWarn = remaining(s);
        if (e.type === 'crushLanded') {
          if (firstLand < 0) firstLand = remaining(s);
          lastLand = remaining(s);
        }
      }
    }
    expect(firstWarn).toBe(45 * TPS);
    expect(firstLand).toBe(Math.round(43.8 * TPS));
    expect(lastLand).toBe(0);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
  });

  it(
    'bots play full matches with the endgame traps on every arena and mode without breaking',
    { timeout: 60_000 },
    () => {
      for (const id of ARENA_IDS) {
        for (const mode of ['classic', 'crush'] as const) {
          for (let seed = 1; seed <= 2; seed++) {
            // a 40 s match so the bots are still alive when both trap waves go live (0:30 and 0:15 left)
            const out = runMatch({
              seed,
              arenaId: id,
              difficulties: ['medium', 'medium', 'easy', 'hard'],
              settings: { mode },
              config: { match: { durationTicks: 40 * TPS } },
            });
            expect(out.winner !== null || out.draw).toBe(true);
            expect(out.ticks).toBeLessThanOrEqual(40 * TPS);
          }
        }
      }
    },
  );
});
