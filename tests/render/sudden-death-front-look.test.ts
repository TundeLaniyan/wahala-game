/**
 * Sudden Death TEST match, presentation: the floor glow is read from the sim's front, so what lights up is what the
 * sim strikes (ring r hot from the tick the sim hits ring r), the warning marks every open tile before a blast, and an
 * ordinary match shows nothing.
 */
import { describe, expect, it } from 'vitest';
import { suddenDeathFloor } from '../../src/render/views/suddenDeathFrontLook';
import {
  SUDDEN_DEATH_TEST_ARENA,
  SUDDEN_DEATH_TEST_CONFIG,
  SUDDEN_DEATH_TEST_PLAYERS,
  SUDDEN_DEATH_TEST_SETTINGS,
  Tile,
  createGame,
  frontRing,
  tick,
} from '../../src/sim';
import type { GameState } from '../../src/sim';

function atCountdown(): GameState {
  const s = createGame({
    seed: 4,
    arenaId: SUDDEN_DEATH_TEST_ARENA,
    players: Array.from({ length: SUDDEN_DEATH_TEST_PLAYERS }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller',
      isBot: true,
    })),
    settings: SUDDEN_DEATH_TEST_SETTINGS,
    config: SUDDEN_DEATH_TEST_CONFIG,
  });
  while (s.match.suddenDeath?.stage !== 'countdown') tick(s);
  return s;
}

describe('suddenDeathFloor', () => {
  it('shows nothing outside the test match', () => {
    const s = createGame({
      seed: 1,
      arenaId: SUDDEN_DEATH_TEST_ARENA,
      players: [0, 1].map((i) => ({ name: `P${i}`, characterId: 'streetBaller' as const, isBot: true })),
    });
    expect(suddenDeathFloor(s, 0, 0)).toEqual([]);
  });

  it('is quiet far from a blast, then marks every open floor tile in the warning window', () => {
    const s = atCountdown();
    expect(suddenDeathFloor(s, 0, 0)).toEqual([]);
    s.tick = s.match.suddenDeath!.nextBlastTick - s.config.suddenDeath.warnTicks + 10;
    const glow = suddenDeathFloor(s, 0, 1);
    const open = s.tiles.filter((t) => t === Tile.Empty).length;
    expect(glow).toHaveLength(open);
    expect(glow.every((g) => s.tiles[g.index] === Tile.Empty && g.intensity > 0)).toBe(true);
  });

  it('lights ring r hot exactly when the sim strikes ring r, and never a ring the front has not reached (beyond a faint hint)', () => {
    const s = atCountdown();
    s.match.suddenDeath!.nextBlastTick = s.tick + 2;
    tick(s);
    tick(s);
    tick(s);
    const f = s.match.suddenDeath!.front!;
    expect(f).toBeTruthy();
    const hot = (g: { intensity: number; color: number }) => g.color === 0xffe8b0 && g.intensity === 1;
    // two rings in, only ring 2 is hot (the origin tile itself is a pillar on this board)
    s.tick = f.startTick + 2 * f.ticksPerRing;
    const t0 = suddenDeathFloor(s, 0, 0).filter(hot);
    expect(t0.length).toBeGreaterThan(0);
    expect(t0.every((g) => frontRing(f, g.index % s.width, Math.floor(g.index / s.width)) === 2)).toBe(true);
    // three rings later rings 0..3 have been struck; ring 4 and beyond are at most the faint hint
    s.tick = f.startTick + 3 * f.ticksPerRing;
    const glow = suddenDeathFloor(s, 0, 0);
    for (const g of glow) {
      const ring = frontRing(f, g.index % s.width, Math.floor(g.index / s.width));
      if (ring > 3) expect(g.intensity).toBeLessThan(0.2);
    }
    expect(
      glow.some((g) => frontRing(f, g.index % s.width, Math.floor(g.index / s.width)) === 3 && hot(g)),
    ).toBe(true);
  });

  it('the front reaches every open tile of the stage that is left (the glow ends where the floor ends)', () => {
    const s = atCountdown();
    // close the stage the way the ring would: everything outside the open area becomes concrete
    const { x0, y0, x1, y1 } = s.match.suddenDeath!.area;
    for (let i = 0; i < s.tiles.length; i++) {
      const x = i % s.width;
      const y = Math.floor(i / s.width);
      if (x < x0 || x > x1 || y < y0 || y > y1) s.tiles[i] = Tile.Hard;
    }
    s.match.suddenDeath!.nextBlastTick = s.tick + 2;
    tick(s);
    tick(s);
    tick(s);
    const f = s.match.suddenDeath!.front!;
    for (let i = 0; i < s.tiles.length; i++)
      if (s.tiles[i] !== Tile.Hard)
        expect(frontRing(f, i % s.width, Math.floor(i / s.width))).toBeLessThanOrEqual(f.maxRing);
    // at the end of the crossing the outermost open ring is the one lit
    s.tick = f.startTick + f.maxRing * f.ticksPerRing;
    const lit = suddenDeathFloor(s, 0, 0).filter((g) => g.intensity === 1);
    expect(
      lit.some((g) => frontRing(f, g.index % s.width, Math.floor(g.index / s.width)) === f.maxRing),
    ).toBe(true);
  });
});
