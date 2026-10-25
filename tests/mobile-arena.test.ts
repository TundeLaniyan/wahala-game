import { describe, expect, it } from 'vitest';
import {
  EXPERIMENTAL_ARENA_IDS,
  MOBILE_TEST_ARENA_ID,
  STANDARD_ARENA_IDS,
  Tile,
  createGame,
  getArena,
  tick,
} from '../src/sim';
import type { GameState, SimEvent } from '../src/sim';
import { runMatch } from '../src/ai/headless';
import { put } from './helpers';

/** The experimental Mobile Test Arena (decision WB10): 13 x 9 primary, 15 x 9 variant. */
const SIZES: Record<string, [number, number]> = { mobileTest13x9: [13, 9], mobileTest15x9: [15, 9] };

function game(arenaId: string, players = 4, stageHazards = true): GameState {
  const s = createGame({
    seed: 11,
    arenaId,
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i}`, characterId: 'streetBaller' as const, isBot: false })),
    settings: { mode: 'crush', stageHazards },
  });
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}

describe('Mobile Test Arena registry', () => {
  it('is experimental and kept out of the nine official stages', () => {
    expect(MOBILE_TEST_ARENA_ID).toBe('mobileTest13x9');
    expect(EXPERIMENTAL_ARENA_IDS).toEqual(['mobileTest13x9', 'mobileTest15x9']);
    expect(STANDARD_ARENA_IDS).toHaveLength(9);
    for (const id of EXPERIMENTAL_ARENA_IDS) {
      const a = getArena(id);
      expect(STANDARD_ARENA_IDS).not.toContain(id);
      expect(a.experimental).toBe(true);
      expect(a.kind).toBe('standard');
      expect(a.info.tagline).toMatch(/EXPERIMENTAL/);
    }
  });
});

describe.each(Object.entries(SIZES))('%s', (id, [W, H]) => {
  const a = getArena(id);

  it(`is ${W} x ${H}, mirror-symmetric, with concrete on every odd/odd tile`, () => {
    expect(a.layout).toHaveLength(H);
    for (const row of a.layout) expect(row).toHaveLength(W);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        expect(a.layout[y]![x] === '#', `${x},${y}`).toBe(x % 2 === 1 && y % 2 === 1);
      }
  });

  it('has four symmetric corner spawns with a clear way out of the first blast', () => {
    expect(a.spawns).toEqual([
      { x: 0, y: H - 1 },
      { x: W - 1, y: 0 },
      { x: 0, y: 0 },
      { x: W - 1, y: H - 1 },
    ]);
    for (let seed = 1; seed <= 6; seed++) {
      const s = createGame({
        seed,
        arenaId: id,
        players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, characterId: 'streetBaller' as const, isBot: false })),
      });
      for (const sp of a.spawns) {
        const sx = sp.x < W / 2 ? 1 : -1;
        const sy = sp.y < H / 2 ? 1 : -1;
        for (const o of a.spawnClearance) expect(s.tiles[(sp.y + o.y * sy) * W + sp.x + o.x * sx]).toBe(Tile.Empty);
      }
      // crates are mirrored too: every corner faces the same board
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) expect(s.tiles[y * W + W - 1 - x]).toBe(s.tiles[y * W + x]);
    }
  });

  it('keeps the mandatory endgame trap waves at 0:30 and 0:15, never on concrete or the final crush tile', () => {
    const s = game(id);
    expect(s.endgameTraps.waves).toHaveLength(2);
    for (const wave of s.endgameTraps.waves) {
      expect(wave.length).toBeGreaterThan(0);
      for (const t of wave) expect(s.tiles[t.index]).not.toBe(Tile.Hard);
    }
    const last = s.crush!.order[s.crush!.order.length - 1]!;
    for (const wave of s.endgameTraps.waves) expect(wave.map((t) => t.index)).not.toContain(last);
    const dur = s.config.match.durationTicks;
    expect(s.endgameTraps.liveAt).toEqual([dur - 30 * 60, dur - 15 * 60]);
  });

  it('Wahala Crush closes it from 0:45 to a single tile, the last one landing at exactly 0:00', () => {
    const s = game(id, 2, false);
    const crush = s.crush!;
    const open = (): number => s.tiles.filter((t) => t !== Tile.Hard).length;
    expect(crush.order).toHaveLength(open());
    const last = crush.order[crush.order.length - 1]!;
    s.players.forEach((_, i) => put(s, i, last % W, Math.floor(last / W)));
    const all: SimEvent[] = [];
    let openAt2 = -1;
    while (s.match.phase === 'playing') {
      all.push(...tick(s, {}));
      if (s.config.match.durationTicks - s.match.playTicks === 2 * 60) openAt2 = open();
    }
    expect(openAt2).toBe(1);
    expect(open()).toBe(0);
    expect(s.match.playTicks).toBe(s.config.match.durationTicks);
    const firstWarn = all.find((e) => e.type === 'crushWarning');
    expect(firstWarn).toBeDefined();
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
  });

  it('plays real four-bot matches to a result without anyone leaving the board', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const out = runMatch({ seed, arenaId: id, difficulties: ['standard', 'casual', 'skilled', 'beginner'], settings: { mode: 'crush' } });
      expect(out.ticks).toBeLessThanOrEqual(120 * 60);
      for (const seat of out.seats) {
        expect(seat.x).toBeGreaterThanOrEqual(0);
        expect(seat.x).toBeLessThan(W);
        expect(seat.y).toBeGreaterThanOrEqual(0);
        expect(seat.y).toBeLessThan(H);
      }
    }
  }, 60_000);
});
