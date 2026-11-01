/**
 * Ambient vehicles fade out around the road wave's own approaching vehicle (Oshodi): the hazard vehicle stands
 * alone, and the clearance follows the same arithmetic as the hazard view (reaches the entry tile on the start tick).
 */
import { describe, expect, it } from 'vitest';
import { CLEAR_INNER, CLEAR_OUTER, clearanceScale, wavePoints } from '../../src/render/env/waveClearance';
import { oshodiMetroEnv } from '../../src/render/env/oshodiMetroEnv';
import { createGame, getArena } from '../../src/sim';
import type { GameState, StageEvent } from '../../src/sim';

function waveState(): { s: GameState; ev: StageEvent } {
  const a = getArena('rumbleOshodi');
  const roster = [0, 1].map((i) => ({ name: `P${i}`, characterId: 'streetBaller' as const, isBot: i > 0 }));
  const s = createGame({ seed: 5, arenaId: a.id, players: roster, settings: { game: 'survival' } });
  const w = s.width;
  const tiles: number[] = [];
  for (let x = 0; x < w; x++) tiles.push(17 * w + x);
  const ev = {
    id: 1,
    hazard: 0,
    kind: 'sweep',
    style: 'traffic',
    tiles,
    dir: 'right',
    warnTick: s.tick,
    startTick: s.tick + 120,
    endTick: s.tick + 120 + 4 * tiles.length,
    eventId: 1,
    index: -1,
    stepRemaining: 0,
    stepTicks: 4,
  } as unknown as StageEvent;
  s.stage.events.length = 0;
  s.stage.events.push(ev);
  return { s, ev };
}

describe('road wave clearance', () => {
  it('puts the wave vehicle 1 + remaining / stepTicks tiles before the entry tile, on the lane row', () => {
    const { s } = waveState();
    const [p] = wavePoints(s, 0);
    expect(p!.y).toBeCloseTo(17.5);
    expect(p!.x).toBeCloseTo(0.5 - (1 + 120 / 4)); // 31 tiles out at the first tick of the warning
    s.tick += 120; // the start tick: one tile before the entry
    const [q] = wavePoints(s, 0);
    expect(q!.x).toBeCloseTo(0.5 - 1);
  });

  it('ignores events that are not a warned traffic wave', () => {
    const { s, ev } = waveState();
    ev.index = 3; // already running on the board
    expect(wavePoints(s, 0)).toEqual([]);
    ev.index = -1;
    (ev as { style: string }).style = 'train';
    expect(wavePoints(s, 0)).toEqual([]);
  });

  it('hides vehicles within the inner radius, restores them beyond the outer, and eases between', () => {
    const w = [{ x: 10, y: 17.5 }];
    expect(clearanceScale(10 + CLEAR_INNER - 0.1, 17.5, w)).toBe(0);
    expect(clearanceScale(10 + CLEAR_OUTER + 0.1, 17.5, w)).toBe(1);
    const mid = clearanceScale(10 + (CLEAR_INNER + CLEAR_OUTER) / 2, 17.5, w);
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
    expect(clearanceScale(0, 0, [])).toBe(1);
  });

  it('is opt-in: only Oshodi asks for it', () => {
    expect(oshodiMetroEnv({ cols: 63, rows: 47 }, 'day').yieldToWave).toBe(true);
  });
});
