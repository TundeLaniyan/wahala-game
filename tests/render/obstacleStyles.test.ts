import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BASE_PILLARS,
  DEFAULT_STYLE,
  OBSTACLE_STYLES,
  obstacleStyle,
  resolvePillars,
  resolveSoftWeights,
} from '../../src/render/assets/obstacleStyles';
import { debrisKindFor, softVariantFor } from '../../src/render/assets/props';
import { occludingTiles } from '../../src/render/assets/occlusionFade';
import { ARENAS } from '../../src/sim/arenas';

const MODELS = new URL('../../src/assets/models/', import.meta.url);
const BUNDLED = readdirSync(MODELS)
  .filter((f) => f.endsWith('.glb'))
  .map((f) => f.replace(/\.glb$/, ''));
const SOFT = BUNDLED.filter((id) => id.startsWith('prop_soft_'));

const TEN = [
  'danfoBusPark',
  'balogunMarket',
  'lekkiRoadworks',
  'oshodiInterchange',
  'ajegunleBackstreets',
  'lagoonJetty',
  'surulerePowerYard',
  'yabaAfterDark',
  'thirdMainland',
  'cityRumble',
];

describe('obstacle style registry (presentation only)', () => {
  it('has an entry for all ten arenas and every playable arena', () => {
    for (const id of [...TEN, ...Object.keys(ARENAS)]) {
      const s = OBSTACLE_STYLES[id];
      expect(s, id).toBeDefined();
      expect(s!.pillars.length).toBeGreaterThan(0);
      expect(Object.values(s!.soft).some((w) => w > 0)).toBe(true);
    }
  });

  it('unknown arenas get the default style', () => {
    expect(obstacleStyle('noSuchArena')).toBe(DEFAULT_STYLE);
    expect(obstacleStyle(undefined)).toBe(DEFAULT_STYLE);
  });

  it('every model a style names is a committed GLB', () => {
    for (const [id, s] of Object.entries(OBSTACLE_STYLES)) {
      for (const m of [...s.pillars, ...Object.keys(s.soft)]) {
        expect(existsSync(new URL(`${m}.glb`, MODELS)), `${id}: ${m}`).toBe(true);
      }
    }
  });

  it('each arena draws its own pillar family when it is loaded, else the bus-park set, else procedural', () => {
    const market = obstacleStyle('balogunMarket');
    expect(resolvePillars(market, BUNDLED)).toEqual(['prop_pillar_market']);
    expect(resolvePillars(market, [...BASE_PILLARS])).toEqual([...BASE_PILLARS]);
    expect(resolvePillars(market, [])).toEqual([]);
  });

  it('soft weights fall back to the base crates/tyres, then to an even mix of whatever exists', () => {
    const jetty = obstacleStyle('lagoonJetty');
    expect(resolveSoftWeights(jetty, SOFT).prop_soft_fishcrates).toBeGreaterThan(0);
    const base = resolveSoftWeights(jetty, ['prop_soft_crate', 'prop_soft_tyres']);
    expect(base.prop_soft_crate).toBeGreaterThan(0);
    expect(resolveSoftWeights(jetty, ['crate', 'tyres'])).toEqual({ crate: 1, tyres: 1 });
  });

  it('an arena only ever draws breakables from its own family', () => {
    for (const id of TEN) {
      const family = obstacleStyle(id).soft;
      for (let y = 0; y < 11; y++)
        for (let x = 0; x < 15; x++) {
          const v = softVariantFor(x, y, SOFT, id);
          expect(family[v] ?? 0, `${id} drew ${v}`).toBeGreaterThan(0);
        }
    }
  });

  it('debris matches what a breakable is made of', () => {
    expect(debrisKindFor('prop_soft_drums')).toBe('drums');
    expect(debrisKindFor('prop_soft_cabledrum')).toBe('drums');
    expect(debrisKindFor('prop_soft_tyres')).toBe('tyres');
    expect(debrisKindFor('prop_soft_fishcrates')).toBe('crate');
  });
});

describe('occlusion fade', () => {
  it('dissolves the obstacle directly in front of (south of) a player, generator or pickup', () => {
    const W = 15;
    const tiles = occludingTiles(W, 11, [
      { x: 3, y: 4 },
      { x: 7.4, y: 0.6 }, // mid-step: rounds to its nearest tile
      { x: 2, y: 10 }, // south edge: nothing in front of it
    ]);
    expect([...tiles].sort((a, b) => a - b)).toEqual([2 * W + 7, 5 * W + 3]);
  });
});
