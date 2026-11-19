/**
 * The presentation of the campaign areas (docs/CAMPAIGN_WORLD.md, decision WX3), built headless (no DOM: textures are
 * skipped, the danfo is the procedural bus): every campaign arena is registered with its district kit (looks, set, floor,
 * cover, environment); the sim's Oshodi letter kit is the renderer's cover map letter for letter; the cover draws every
 * solid tile of the board as an object and nothing else; the environment is valid on every quality budget.
 */
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_ARENA_IDS, getArena } from '../../src/sim';
import { OSHODI_KIT } from '../../src/sim/arenas/campaign/oshodiKit';
import { NEW_ARENA_ART } from '../../src/render/arenas/newArenas';
import { OSHODI_COVER_LETTERS } from '../../src/render/arenas/oshodiMetroCoverMap';
import { OSHODI_METRO_LOOK, OSHODI_METRO_NIGHT_LOOK } from '../../src/render/arenas/oshodiMetroArt';
import { budgetFor, planEnvironment, resolveEnv, validateEnvironment } from '../../src/render/env/plan';
import { obstacleStyle } from '../../src/render/assets/obstacleStyles';
import { STADIUM_ARENAS } from '../../src/render/cameraModes';

describe('campaign areas are drawn with their district kit', () => {
  it('the sim Oshodi kit is the cover map kit, letter for letter', () => {
    expect(OSHODI_KIT).toEqual(OSHODI_COVER_LETTERS);
  });

  it.each(CAMPAIGN_ARENA_IDS.map((id) => [id] as const))(
    '%s: registered (looks, set, floor, cover, env), follow camera, district obstacles',
    (id) => {
      const art = NEW_ARENA_ART()[id]!;
      expect(art).toBeDefined();
      expect(art.look).toBe(OSHODI_METRO_LOOK);
      expect(art.nightLook).toBe(OSHODI_METRO_NIGHT_LOOK);
      expect(typeof art.set.build).toBe('function');
      expect(art.set.crowdEdges.south).toBe(false); // the camera side stays clear
      expect(typeof art.floor).toBe('function');
      expect(art.cover).toBeDefined();
      expect(art.env).toBeDefined();
      expect(STADIUM_ARENAS.has(id)).toBe(true);
      expect(obstacleStyle(id).note).toMatch(/^campaign area: /);
    },
  );

  it.each(CAMPAIGN_ARENA_IDS.map((id) => [id] as const))(
    '%s: the cover draws every solid tile as an object and nothing else; a wrong board size draws none',
    (id) => {
      const a = getArena(id);
      const W = a.layout[0]!.length;
      const H = a.layout.length;
      const cover = NEW_ARENA_ART()[id]!.cover!({ width: W, height: H })!;
      expect(cover).not.toBeNull();
      a.layout.forEach((row, y) =>
        [...row].forEach((c, x) => expect(cover.covers(y * W + x), `${id} ${x},${y}`).toBe(c === '#')),
      );
      expect(cover.bounds.length).toBeGreaterThan(20);
      cover.dispose();
      expect(NEW_ARENA_ART()[id]!.cover!({ width: W + 1, height: H })).toBeNull();
    },
  );

  it.each(CAMPAIGN_ARENA_IDS.map((id) => [id] as const))(
    '%s: the living environment is valid and fits every quality budget',
    (id) => {
      const a = getArena(id);
      const board = { cols: a.layout[0]!.length, rows: a.layout.length };
      const env = resolveEnv(NEW_ARENA_ART()[id]!.env!, board);
      expect(validateEnvironment(env, board)).toEqual([]);
      expect(env.crowds?.length ?? 0).toBeGreaterThan(0);
      for (const level of ['veryLow', 'low', 'medium', 'high'] as const) {
        const plan = planEnvironment(env, level, board);
        expect(plan.vehicles.length, `${id} ${level}`).toBeLessThanOrEqual(budgetFor(env, level).vehicles);
      }
    },
  );
});
