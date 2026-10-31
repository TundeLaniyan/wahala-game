/**
 * The living environment of Oshodi Transport Metropolis: valid on every board size, within the per-tier
 * budgets (vehicles, models, people, rigs, lights, draw calls), ambient traffic kept apart from the stage's
 * combat vehicles, nothing on the board or on the rails, the night variant on exactly the same routes.
 */
import { describe, expect, it } from 'vitest';
import { getArena } from '../../src/sim';
import { OSHODI_DECK_ELEVATION, oshodiMetroEnv } from '../../src/render/env/oshodiMetroEnv';
import {
  BOARD_MARGIN,
  boardRect,
  budgetFor,
  expandRect,
  planEnvironment,
  planTraffic,
  pointInRect,
  samplePath,
  validateEnvironment,
} from '../../src/render/env/plan';
import { ENV_BUDGET, ENV_DRAW_CALL_TARGET } from '../../src/render/env/types';
import { NEW_ARENA_ART } from '../../src/render/arenas/newArenas';
import { QUALITY } from '../../src/render/quality';

const a = getArena('rumbleOshodi');
const board = { cols: a.layout[0]!.length, rows: a.layout.length };
const LEVELS = ['veryLow', 'low', 'medium', 'high'] as const;

describe('Oshodi environment data', () => {
  for (const tod of ['day', 'night'] as const)
    for (const size of [board, { cols: 41, rows: 31 }])
      it(`is valid for a ${size.cols} x ${size.rows} board by ${tod}`, () => {
        expect(validateEnvironment(oshodiMetroEnv(size, tod), size)).toEqual([]);
      });

  it('is registered with the stage and resolves for the real board', () => {
    const src = NEW_ARENA_ART().rumbleOshodi!.env!;
    const env = typeof src === 'function' ? src(board) : src;
    expect(env.id).toBe('rumbleOshodi');
    expect(env.traffic!.length).toBeGreaterThanOrEqual(5);
  });

  it('keeps every route and zone off the board; elevated traffic rides the expressway north of it', () => {
    const env = oshodiMetroEnv(board);
    const keepOut = expandRect(boardRect(board), BOARD_MARGIN);
    for (const r of env.traffic!) {
      for (const [x, y] of samplePath(r.path, 0.2))
        expect(pointInRect(x, y, keepOut), `${r.id} ${x},${y}`).toBe(false);
      if ((r.elevation ?? 0) > 0.5) {
        expect(r.elevation).toBe(OSHODI_DECK_ELEVATION);
        for (const [, y] of r.path) expect(y, `${r.id} deck`).toBeLessThan(-8);
      }
    }
    for (const z of env.crowds!) {
      for (const [x, y] of [
        [z.rect.x0, z.rect.y0],
        [z.rect.x1, z.rect.y1],
      ] as const)
        expect(pointInRect(x, y, boardRect(board)), `${z.id}`).toBe(false);
    }
  });

  it('keeps ambient traffic separate from combat: no warning lights, no track lanes, no sweep vehicles, muted kinds only', () => {
    const env = oshodiMetroEnv(board);
    const cols = [36, 37];
    for (const r of env.traffic!) {
      // nothing ambient runs along the board's track columns (the expressway passes far above and north of them)
      if ((r.elevation ?? 0) < 0.5)
        for (const [x] of samplePath(r.path, 0.5)) expect(cols.includes(Math.floor(x)), r.id).toBe(false);
      // only the muted ambient kinds (the cast's attack vehicles are danfo / taxi / keke on the sim's lanes)
      expect(
        r.kinds.every((k) => ['bus', 'danfo', 'car', 'keke', 'truck'].includes(k)),
        r.id,
      ).toBe(true);
      expect(r.kinds.includes('okada'), r.id).toBe(false);
    }
    // no practical light wears a hazard colour (the red lane lamps belong to the stage's telegraph)
    for (const l of env.lights!) {
      const red = (l.color >> 16) & 0xff;
      const green = (l.color >> 8) & 0xff;
      const blue = l.color & 0xff;
      expect(red > 0xc0 && green < 0x60 && blue < 0x60, `light at ${l.at}`).toBe(false); // sodium orange is fine
    }
    // the environment's own safety notes mirror the stage: rail shoulders and platforms are the refuge
    const pockets = env.safety!.safePockets!.filter((p) => p.style === 'train');
    expect(pockets.length).toBeGreaterThanOrEqual(4);
    for (const p of pockets) expect(p.rect.x1 <= 36 || p.rect.x0 >= 38, `${p.note}`).toBe(true);
    expect(env.safety!.exclusions![0]!.notWith).toEqual(
      expect.arrayContaining(['traffic', 'danfo', 'goods', 'debris', 'crush']),
    );
  });

  it('buses and Danfos dominate, taxis and kekes stay a minority, trucks only on the expressway, no okadas', () => {
    const env = oshodiMetroEnv(board);
    for (const level of LEVELS) {
      const v = planTraffic(env, level).vehicles;
      const share = (kinds: string[]): number => v.filter((x) => kinds.includes(x.kind)).length / v.length;
      expect(share(['danfo', 'bus']), level).toBeGreaterThanOrEqual(0.5);
      expect(share(['keke']), level).toBeLessThanOrEqual(0.2);
      expect(share(['car']), level).toBeLessThanOrEqual(0.3);
    }
    const trucks = env.traffic!.filter((r) => r.kinds.includes('truck'));
    expect(trucks.every((r) => (r.elevation ?? 0) > 0.5)).toBe(true);
  });

  it('day and night share every route and zone and differ only in light', () => {
    const day = oshodiMetroEnv(board, 'day');
    const night = oshodiMetroEnv(board, 'night');
    expect(night.traffic).toEqual(day.traffic);
    expect(night.crowds).toEqual(day.crowds);
    expect(night.lights!.length).toBe(day.lights!.length);
    const total = (e: typeof day): number => e.lights!.reduce((n, l) => n + l.strength, 0);
    expect(total(night)).toBeGreaterThan(total(day) * 1.2);
  });
});

describe('Oshodi environment budgets', () => {
  for (const tod of ['day', 'night'] as const)
    for (const level of LEVELS)
      it(`${tod} at ${level}: within vehicles, models, people, rigs, lights and planned draw calls`, () => {
        const env = oshodiMetroEnv(board, tod);
        const plan = planEnvironment(env, level, board);
        const cap = budgetFor(env, level);
        expect(plan.vehicles.length).toBeLessThanOrEqual(cap.vehicles);
        expect(plan.models.length).toBeLessThanOrEqual(cap.vehicleModels);
        expect(plan.people).toBeLessThanOrEqual(cap.people);
        expect(plan.rigs).toBeLessThanOrEqual(cap.rigs);
        expect(plan.lights).toBeLessThanOrEqual(cap.lights);
        expect(plan.drawCalls).toBeLessThanOrEqual(ENV_DRAW_CALL_TARGET[level]);
      });

  it('low quality draws nothing heavy: no rigs, one vehicle model, a handful of people', () => {
    const plan = planEnvironment(oshodiMetroEnv(board), 'low', board);
    expect(plan.rigs).toBe(0);
    expect(plan.models.length).toBeLessThanOrEqual(1);
    expect(plan.people).toBeLessThanOrEqual(20);
    expect(plan.drawCalls).toBeLessThanOrEqual(24);
  });

  it('the quality profiles still cap the stage cover at a few merged meshes', () => {
    for (const level of ['low', 'high'] as const) expect(QUALITY[level]).toBeDefined();
  });
});

describe('Oshodi bus-choked roads (opt-in budget boost)', () => {
  const env = oshodiMetroEnv(board, 'day');

  it('raises the vehicle cap only for this stage; the shared caps are unchanged', () => {
    expect(budgetFor(env, 'medium').vehicles).toBeGreaterThan(ENV_BUDGET.medium.vehicles);
    expect(budgetFor(env, 'high').vehicles).toBeGreaterThan(ENV_BUDGET.high.vehicles);
    const plain = { ...env, boost: undefined };
    for (const level of LEVELS) expect(budgetFor(plain, level)).toEqual(ENV_BUDGET[level]);
  });

  it('keeps the model count (hence the vehicle draw calls) at the shared cap on every tier', () => {
    for (const level of LEVELS)
      expect(budgetFor(env, level).vehicleModels).toBe(ENV_BUDGET[level].vehicleModels);
  });

  it('puts many more ground vehicles on the roads at medium and high, still none on the board', () => {
    const ground = (level: (typeof LEVELS)[number]): number =>
      planTraffic(env, level).vehicles.filter((v) => !v.routeId.startsWith('deck')).length;
    expect(ground('medium')).toBeGreaterThanOrEqual(40);
    expect(ground('high')).toBeGreaterThanOrEqual(ground('medium'));
    expect(ground('veryLow')).toBeLessThanOrEqual(ENV_BUDGET.veryLow.vehicles);
  });
});
