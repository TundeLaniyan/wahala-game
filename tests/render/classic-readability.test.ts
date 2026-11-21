/**
 * Readability of the Classic raid looks (docs/CLASSIC_LIGHTING.md, decision NL2), on Low and on High, with the code-side
 * index of `render/readability.ts` (calibrated against the rendered-pixel measurement of
 * `scripts/classic-lighting-shots.mjs`): every lit raid is at least as readable as the approved Danfo Bus Park on the
 * same preset and below a wash-out ceiling, its fog leaves the board clear, Low is not much darker than High, and the
 * night raid's lit-area look is readable (its darkness is the night mask, not the look).
 */
import { describe, expect, it } from 'vitest';
import { RAID_ARENA_IDS } from '../../src/sim';
import { arenaLook } from '../../src/render/arenaLook';
import { boardFog, readabilityIndex } from '../../src/render/readability';
import { isNightRaidArena } from '../../src/render/arenas/raidArt';

const DANFO = arenaLook('danfoBusPark');
/** The sunlit rail yard measured a floor mean of 98-128 / 255 on Low with p90 155: bright, not blown. */
const CEILING = 2.3;

describe('normal (lit) raids are readable on Low and High', () => {
  const lit = RAID_ARENA_IDS.filter((id) => !isNightRaidArena(id));

  it('there are five lit raids', () => {
    expect(lit).toHaveLength(5);
  });

  it.each(lit.map((id) => [id] as const))('%s', (id) => {
    const look = arenaLook(id);
    expect(look).not.toBe(DANFO);
    for (const q of ['low', 'high'] as const) {
      const r = readabilityIndex(look, q);
      expect(r, `${id} ${q}`).toBeGreaterThanOrEqual(readabilityIndex(DANFO, q));
      expect(r, `${id} ${q}`).toBeLessThanOrEqual(CEILING);
    }
    // the fog at the fixed camera's distance leaves the board clear
    expect(boardFog(look)).toBeLessThanOrEqual(0.25);
    // Low (no lamps, x1.3 fill) keeps at least three quarters of High's floor light
    expect(readabilityIndex(look, 'low')).toBeGreaterThanOrEqual(0.75 * readabilityIndex(look, 'high'));
  });
});

describe('the night raid', () => {
  it("lit tiles read like a normal stage: the look is the lit area's, the same on Low and High", () => {
    const look = arenaLook('raidRecordsVault');
    expect(look.lamps).toHaveLength(0);
    expect(readabilityIndex(look, 'low')).toBe(readabilityIndex(look, 'high'));
    expect(readabilityIndex(look, 'low')).toBeGreaterThanOrEqual(readabilityIndex(DANFO, 'high'));
    expect(boardFog(look)).toBe(0);
  });
});

describe('the index', () => {
  it('ranks the approved standard arenas as measured: night arenas below day ones, Low with lamps below High', () => {
    const r = (id: string, q: 'low' | 'high') => readabilityIndex(arenaLook(id), q);
    expect(r('lekkiRoadworks', 'high')).toBeLessThan(r('danfoBusPark', 'high'));
    expect(r('yabaAfterDark', 'high')).toBeLessThan(r('balogunMarket', 'high'));
    expect(r('danfoBusPark', 'low')).toBeLessThan(r('danfoBusPark', 'high'));
  });
});
