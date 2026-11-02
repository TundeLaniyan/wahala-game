/**
 * The road's traffic wave is drawn for its whole warning: the vehicle that will cross the lane approaches from
 * the far end of the approach road and arrives at the entry tile on the tick the sim starts the sweep.
 */
import { describe, expect, it } from 'vitest';
import { sweepApproachTiles } from '../../src/render/views/StageHazardViews';
import { createGame, getArena, tick } from '../../src/sim';

describe('sweep vehicle approach', () => {
  it('shows the traffic wave for the whole warning, the railcar and other sweeps only at the end', () => {
    expect(sweepApproachTiles('traffic', 'rumbleOshodi')).toBe(Infinity);
    // every other stage keeps the short approach
    for (const id of ['rumbleOjuelegba', 'rumbleMushin', 'rumbleLagosIsland', 'oshodiInterchange', ''])
      expect(sweepApproachTiles('traffic', id)).toBeLessThan(10);
    expect(sweepApproachTiles('train')).toBeLessThan(5);
    expect(sweepApproachTiles('danfo')).toBeLessThan(10);
    expect(sweepApproachTiles(undefined)).toBeLessThan(10);
  });

  it('matches the sim: the approach distance at the first tick of the warning is warn / stepTicks tiles from the mouth', () => {
    const a = getArena('rumbleOshodi');
    const roster = Array.from({ length: 2 }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller' as const,
      isBot: i > 0,
    }));
    const s = createGame({ seed: 5, arenaId: a.id, players: roster, settings: { game: 'survival' } });
    let ev = null as null | (typeof s.stage.events)[number];
    for (let i = 0; i < 90 * 60 && !ev; i++)
      for (const e of tick(s, {})) if (e.type === 'stageWarning' && e.event.style === 'traffic') ev = e.event;
    expect(ev).not.toBeNull();
    const w = s.width;
    const entry = ev!.tiles[0]!;
    // the entry is a road mouth on the board's edge, and the vehicle covers one tile per step on the lane's row
    expect(entry % w === 0 || entry % w === w - 1).toBe(true);
    const row = Math.floor(entry / w);
    expect(ev!.tiles.every((t) => Math.floor(t / w) === row)).toBe(true);
    const warnTicks = ev!.startTick - ev!.warnTick;
    expect(warnTicks / ev!.stepTicks).toBeGreaterThan(20); // a long, readable run-up from the loop's road
  });
});
