/**
 * The pure planning of living stage environments (src/render/env/plan.ts) and the default Ojuelegba
 * environment: routes never enter the board, crowd zones never overlap it, budgets are respected per
 * quality tier, placement and timing are deterministic, and reactions follow the SimEvents.
 */
import { describe, expect, it } from 'vitest';
import type { SimEvent, StageEvent } from '../../src/sim';
import { ojuelegbaEnv } from '../../src/render/env/ojuelegbaEnv';
import {
  BOARD_MARGIN,
  VEHICLE_DIMS,
  atLeast,
  boardRect,
  budgetFor,
  distanceToRect,
  endScale,
  expandRect,
  flickerAt,
  pathLength,
  planCrowd,
  planEnvironment,
  planTraffic,
  pointInRect,
  pointOnPath,
  reacts,
  ruleFor,
  samplePath,
  scatterInRect,
  scatterTarget,
  stimuliFrom,
  validateEnvironment,
  vehicleAt,
} from '../../src/render/env/plan';
import { ENV_BUDGET, ENV_DRAW_CALL_TARGET } from '../../src/render/env/types';
import type { StageEnvironment, TrafficRouteDef } from '../../src/render/env/types';

const BOARDS = [
  { cols: 41, rows: 31 },
  { cols: 45, rows: 33 },
  { cols: 49, rows: 35 },
  { cols: 41, rows: 35 },
];
const LEVELS = ['low', 'medium', 'high'] as const;

/** A tiny valid environment to mutate in the negative tests. */
const base = (board = { cols: 41, rows: 31 }): StageEnvironment => ({
  id: 'test',
  traffic: [
    {
      id: 'r',
      kinds: ['okada'],
      path: [
        [-30, 10],
        [-4, 10],
      ],
      count: 2,
      speed: 3,
      spacing: 3,
    },
  ],
  crowds: [
    { id: 'z', rect: { x0: board.cols + 3, y0: 5, x1: board.cols + 6, y1: 8 }, count: 4, mood: 'waiting' },
  ],
});

describe('the default Ojuelegba environment', () => {
  for (const board of BOARDS) {
    it(`is valid for a ${board.cols} x ${board.rows} board`, () => {
      expect(validateEnvironment(ojuelegbaEnv(board), board)).toEqual([]);
    });

    it(`keeps every route off the board and every zone outside it (${board.cols} x ${board.rows})`, () => {
      const env = ojuelegbaEnv(board);
      const keepOut = expandRect(boardRect(board), BOARD_MARGIN);
      for (const r of env.traffic!) {
        for (const [x, y] of samplePath(r.path, 0.2))
          expect(pointInRect(x, y, keepOut), `${r.id} at ${x},${y}`).toBe(false);
        if ((r.elevation ?? 0) > 0.5) for (const [, y] of r.path) expect(y, `${r.id} deck`).toBeLessThan(0);
      }
      for (const z of env.crowds!) {
        const dx = distanceToRect((z.rect.x0 + z.rect.x1) / 2, (z.rect.y0 + z.rect.y1) / 2, boardRect(board));
        expect(dx, z.id).toBeGreaterThan(0);
        // every corner of the zone is outside the board
        for (const [x, y] of [
          [z.rect.x0, z.rect.y0],
          [z.rect.x1, z.rect.y0],
          [z.rect.x0, z.rect.y1],
          [z.rect.x1, z.rect.y1],
        ] as const)
          expect(pointInRect(x, y, boardRect(board)), `${z.id} corner ${x},${y}`).toBe(false);
      }
    });
  }

  it('describes the districts relative to the board: the deck north, the approach west, the park east', () => {
    const board = { cols: 45, rows: 33 };
    const env = ojuelegbaEnv(board);
    const deck = env.traffic!.filter((r) => (r.elevation ?? 0) > 0.5);
    expect(deck.length).toBeGreaterThanOrEqual(2);
    for (const r of deck) for (const [x] of r.path) expect(Math.abs(x - board.cols / 2)).toBeLessThan(5);
    const west = env.traffic!.filter((r) => r.id.startsWith('west'));
    for (const r of west) expect(r.path.every(([x]) => x < 0)).toBe(true);
    const east = env.crowds!.filter((z) => z.rect.x0 > board.cols);
    expect(east.map((z) => z.id).sort()).toEqual(['danfoParkTouts', 'rearLoopMechanics']);
    // the bus stop sits under the deck, north of the board
    const stop = env.crowds!.find((z) => z.id === 'busStop')!;
    expect(stop.rect.y1).toBeLessThan(0);
  });

  it('follows the research: no okadas, Danfos and buses dominate, taxis few, kekes sparse, trucks only on the flyover', () => {
    for (const board of BOARDS) {
      const env = ojuelegbaEnv(board);
      const all = env.traffic!.flatMap((r) =>
        r.kinds.map((k) => ({ k, elevated: (r.elevation ?? 0) > 0.5 })),
      );
      expect(all.some((x) => x.k === 'okada')).toBe(false);
      expect(all.filter((x) => x.k === 'truck').every((x) => x.elevated)).toBe(true);
      for (const level of LEVELS) {
        const v = planTraffic(env, level).vehicles;
        const share = (kinds: string[]): number => v.filter((x) => kinds.includes(x.kind)).length / v.length;
        expect(share(['danfo', 'bus']), level).toBeGreaterThanOrEqual(0.5);
        expect(share(['keke']), level).toBeLessThanOrEqual(0.2);
        expect(share(['car']), level).toBeLessThanOrEqual(0.3);
      }
    }
  });

  it('keeps civilians in protected frontage strips: the bus stop, food sellers, touts, traders and mechanics', () => {
    const ids = ojuelegbaEnv({ cols: 41, rows: 31 }).crowds!.map((z) => z.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'busStop',
        'underBridgeFoodSellers',
        'shopfrontTraders',
        'rearLoopMechanics',
        'danfoParkTouts',
      ]),
    );
  });

  it('records its safety notes and cutaway: safe pockets on the board, exclusions that name other styles', () => {
    const env = ojuelegbaEnv({ cols: 41, rows: 31 });
    expect(env.safety?.safePockets?.length).toBeGreaterThan(0);
    expect(env.safety?.exclusions?.[0]?.notWith).toContain('crush');
    expect(env.occlusion?.cutaway?.length).toBeGreaterThan(0);
  });

  it('declares audio hooks that are plain sound names (checked against the recipes in living-env.test.ts)', () => {
    const env = ojuelegbaEnv({ cols: 41, rows: 31 });
    expect(env.audio?.beds.length).toBeGreaterThan(0);
    for (const n of [...env.audio!.beds, ...env.audio!.reactions!.map((r) => r.sound)])
      expect(n).toMatch(/^[a-z0-9_]+$/);
  });
});

describe('validation catches what the contract forbids', () => {
  const board = { cols: 41, rows: 31 };
  const fails = (env: StageEnvironment, text: RegExp): void => {
    expect(validateEnvironment(env, board).join('\n')).toMatch(text);
  };

  it('accepts the base environment', () => {
    expect(validateEnvironment(base(), board)).toEqual([]);
  });

  it('rejects a route that crosses the board', () => {
    const env = base();
    env.traffic = [
      {
        ...env.traffic![0]!,
        path: [
          [-10, 10],
          [50, 10],
        ],
      },
    ];
    fails(env, /enters the board/);
  });

  it('rejects a route that skims the wall (inside the margin)', () => {
    const env = base();
    env.traffic = [
      {
        ...env.traffic![0]!,
        path: [
          [-30, 10],
          [-0.4, 10],
        ],
      },
    ];
    fails(env, /enters the board/);
  });

  it('rejects an elevated route that is not north of the board', () => {
    const env = base();
    env.traffic = [
      {
        ...env.traffic![0]!,
        elevation: 6.6,
        path: [
          [-30, 10],
          [-5, 10],
        ],
      },
    ];
    fails(env, /not north of the board/);
  });

  it('keeps tall vehicles out of the low strip south of the board', () => {
    const env = base();
    const south: TrafficRouteDef = {
      ...env.traffic![0]!,
      id: 's',
      kinds: ['danfo'],
      path: [
        [5, 32.8],
        [30, 32.8],
      ],
    };
    env.traffic = [south];
    fails(env, /low strip/);
    env.traffic = [{ ...south, kinds: ['okada'] }]; // an okada is under a metre
    expect(validateEnvironment(env, board)).toEqual([]);
  });

  it('rejects zones that overlap the board, stand in the low strip, or are crossed by a route', () => {
    const env = base();
    env.crowds = [{ ...env.crowds![0]!, rect: { x0: 38, y0: 5, x1: 43, y1: 8 } }];
    fails(env, /overlaps the board/);
    env.crowds = [{ ...env.crowds![0]!, id: 'south', rect: { x0: 10, y0: 31.2, x1: 14, y1: 33 } }];
    fails(env, /low strip/);
    const e2 = base();
    e2.crowds = [{ ...e2.crowds![0]!, rect: { x0: -14, y0: 9, x1: -10, y1: 11 } }];
    fails(e2, /crossed by route/);
  });

  it('rejects overcrowded zones, duplicate ids and lights standing on the board', () => {
    const env = base();
    env.crowds = [{ ...env.crowds![0]!, count: 60 }];
    fails(env, /too small/);
    env.crowds = [env.crowds![0]!, env.crowds![0]!];
    fails(env, /duplicate zone/);
    const e2 = base();
    e2.lights = [{ at: [10, 10], height: 3, color: 0xffffff, size: 1, strength: 1 }];
    fails(e2, /on the board/);
  });

  it('rejects malformed safety notes and cutaways', () => {
    const env = base();
    env.safety = {
      safePockets: [{ style: 'danfo', rect: { x0: 30, y0: 5, x1: 50, y1: 8 } }],
      exclusions: [{ style: 'danfo', notWith: [] }],
    };
    env.occlusion = { cutaway: [{ x0: 4, y0: 4, x1: 4, y1: 9 }] };
    fails(env, /safe pocket/);
    fails(env, /exclusion/);
    fails(env, /cutaway/);
  });

  it('honours keep-clear hints', () => {
    const env = base();
    env.occlusion = { keepClear: [{ x0: -20, y0: 8, x1: -15, y1: 12 }] };
    fails(env, /keep-clear/);
  });
});

describe('budgets per quality tier', () => {
  it('a stage can lower the global caps, never raise them', () => {
    const env: StageEnvironment = { id: 'b', budget: { medium: { vehicles: 3, people: 999, rigs: 2 } } };
    const b = budgetFor(env, 'medium');
    expect(b.vehicles).toBe(3);
    expect(b.people).toBe(ENV_BUDGET.medium.people);
    expect(b.rigs).toBe(2);
    expect(budgetFor(env, 'high')).toEqual(ENV_BUDGET.high);
  });

  for (const board of BOARDS) {
    for (const level of LEVELS) {
      it(`Ojuelegba ${board.cols} x ${board.rows} at ${level}: within vehicles, models, people, rigs, lights and draw calls`, () => {
        const env = ojuelegbaEnv(board);
        const plan = planEnvironment(env, level, board);
        const cap = budgetFor(env, level);
        expect(plan.vehicles.length).toBeLessThanOrEqual(cap.vehicles);
        expect(plan.models.length).toBeLessThanOrEqual(cap.vehicleModels);
        expect(plan.people).toBeLessThanOrEqual(cap.people);
        expect(plan.rigs).toBeLessThanOrEqual(cap.rigs);
        expect(plan.lights).toBeLessThanOrEqual(cap.lights);
        expect(plan.drawCalls).toBeLessThanOrEqual(ENV_DRAW_CALL_TARGET[level]);
      });
    }
  }

  it('low quality draws nothing heavy: no animated rigs, one vehicle model, a handful of people', () => {
    const plan = planEnvironment(ojuelegbaEnv({ cols: 41, rows: 31 }), 'low');
    expect(plan.rigs).toBe(0);
    expect(plan.models.length).toBeLessThanOrEqual(1);
    expect(plan.people).toBeLessThanOrEqual(20);
    expect(plan.people).toBeGreaterThanOrEqual(12); // the research's provisional low tier: 12-20 nearby people
    expect(plan.vehicles.length).toBeLessThanOrEqual(4);
    expect(plan.drawCalls).toBeLessThanOrEqual(24);
  });

  it('the medium tier stays within the ~60 draw-call target and keeps the high-priority deck traffic', () => {
    const plan = planEnvironment(ojuelegbaEnv({ cols: 41, rows: 31 }), 'medium');
    expect(plan.drawCalls).toBeLessThanOrEqual(60);
    expect(plan.vehicles.some((v) => v.routeId.startsWith('deck'))).toBe(true);
  });

  it('minQuality gates routes, zones and lights', () => {
    const env = ojuelegbaEnv({ cols: 41, rows: 31 });
    expect(atLeast('low', 'medium')).toBe(false);
    expect(planTraffic(env, 'low').vehicles.every((v) => v.routeId !== 'eastRing')).toBe(true);
    expect(planTraffic(env, 'high').vehicles.some((v) => v.routeId === 'eastRing')).toBe(true);
  });
});

describe('ambient traffic is a pure function of the plan and the clock', () => {
  const board = { cols: 41, rows: 31 };
  const env = ojuelegbaEnv(board);

  it('is deterministic and never sits on the board', () => {
    const plan = planTraffic(env, 'high');
    const again = planTraffic(env, 'high');
    expect(again).toEqual(plan);
    const keepOut = expandRect(boardRect(board), BOARD_MARGIN);
    for (let t = 0; t < 400; t += 1.7) {
      for (const v of plan.vehicles) {
        const route = plan.routes.find((r) => r.def.id === v.routeId)!;
        const s = vehicleAt(route, v, t);
        expect(pointInRect(s.x, s.y, keepOut), `${v.routeId} at ${t}`).toBe(false);
        expect(vehicleAt(route, v, t)).toEqual(s);
      }
    }
  });

  it('keeps the planned spacing between neighbours on a route at all times', () => {
    const plan = planTraffic(env, 'high');
    for (const route of plan.routes) {
      const mine = plan.vehicles.filter((v) => v.routeId === route.def.id);
      if (mine.length < 2) continue;
      const longest = Math.max(...route.def.kinds.map((k) => VEHICLE_DIMS[k].length));
      for (const t of [0, 3.3, 41, 199.9]) {
        const along = mine
          .map((v) => (((v.phase + route.def.speed * t) % route.length) + route.length) % route.length)
          .sort((a, b) => a - b);
        for (let i = 0; i < along.length; i++) {
          const next = i + 1 < along.length ? along[i + 1]! : along[0]! + route.length;
          expect(next - along[i]!, `${route.def.id} t=${t}`).toBeGreaterThanOrEqual(
            longest + route.def.spacing - 1e-6,
          );
        }
      }
    }
  });

  it('shrinks vehicles in and out at the ends of a path and turns smoothly at corners', () => {
    expect(endScale(0, 50, 2.5)).toBe(0);
    expect(endScale(25, 50, 2.5)).toBe(1);
    expect(endScale(50, 50, 2.5)).toBe(0);
    expect(endScale(3, 50, 0)).toBe(1);
    const plan = planTraffic(env, 'high');
    const route = plan.routes.find((r) => r.def.id === 'westApproachIn')!;
    const v = plan.vehicles.find((x) => x.routeId === route.def.id)!;
    // headings across the corner change in small steps (no 90 degree snap in one frame)
    let prev: number | null = null;
    let maxJump = 0;
    for (let t = 0; t < 40; t += 0.02) {
      const st = vehicleAt(route, v, t);
      // (the wrap from the end of the path to its start happens at scale 0, out of sight)
      if (prev !== null && st.scale > 0.5)
        maxJump = Math.max(
          maxJump,
          Math.abs(Math.atan2(Math.sin(st.heading - prev), Math.cos(st.heading - prev))),
        );
      prev = st.scale > 0.5 ? st.heading : null;
    }
    expect(maxJump).toBeLessThan(0.35);
  });

  it('measures and walks polylines', () => {
    const path = [
      [0, 0],
      [3, 0],
      [3, 4],
    ] as const;
    expect(pathLength(path)).toBe(7);
    expect(pointOnPath(path, 1.5)).toMatchObject({ x: 1.5, y: 0 });
    expect(pointOnPath(path, 5)).toMatchObject({ x: 3, y: 2 });
    expect(pointOnPath(path, 99)).toMatchObject({ x: 3, y: 4 });
    // heading 0 = south (+y), east positive
    expect(pointOnPath(path, 1).heading).toBeCloseTo(Math.PI / 2);
    expect(pointOnPath(path, 5).heading).toBeCloseTo(0);
  });

  it('uses fewer vehicles on a route that is too short for them', () => {
    const short: StageEnvironment = {
      id: 's',
      traffic: [
        {
          id: 'r',
          kinds: ['bus'],
          path: [
            [-20, 5],
            [-14, 5],
          ],
          count: 8,
          speed: 2,
          spacing: 2,
        },
      ],
    };
    expect(planTraffic(short, 'high').vehicles.length).toBe(1);
  });
});

describe('crowd plan', () => {
  const board = { cols: 41, rows: 31 };
  const env = ojuelegbaEnv(board);

  it('places everyone inside their zone, deterministically', () => {
    for (const level of LEVELS) {
      const a = planCrowd(env, board, level);
      expect(planCrowd(env, board, level)).toEqual(a);
      for (const z of a.zones)
        for (const p of z.people) {
          expect(p.x).toBeGreaterThanOrEqual(z.def.rect.x0);
          expect(p.x).toBeLessThanOrEqual(z.def.rect.x1);
          expect(p.y).toBeGreaterThanOrEqual(z.def.rect.y0);
          expect(p.y).toBeLessThanOrEqual(z.def.rect.y1);
          expect(p.toX).toBeGreaterThanOrEqual(z.def.rect.x0);
          expect(p.toX).toBeLessThanOrEqual(z.def.rect.x1);
        }
    }
  });

  it('never exceeds the people and rig caps, and gives rigs to the busiest zones first', () => {
    const med = planCrowd(env, board, 'medium');
    expect(med.people).toBeLessThanOrEqual(ENV_BUDGET.medium.people);
    expect(med.rigs).toBeLessThanOrEqual(ENV_BUDGET.medium.rigs);
    expect(med.zones[0]!.def.id).toBe('busStop');
    expect(planCrowd(env, board, 'low').rigs).toBe(0);
  });

  it('faces people towards the board and pairs traders face to face', () => {
    const plan = planCrowd(env, board, 'high');
    const stop = plan.zones.find((z) => z.def.id === 'busStop')!;
    for (const p of stop.people) {
      const towards = Math.atan2(board.cols / 2 - p.x, board.rows / 2 - p.y);
      expect(Math.abs(Math.atan2(Math.sin(p.yaw - towards), Math.cos(p.yaw - towards)))).toBeLessThan(0.3);
    }
    const traders = plan.zones.find((z) => z.def.id === 'shopfrontTraders')!;
    const paired = traders.people.filter((p) => p.partner >= 0);
    expect(paired.length).toBeGreaterThanOrEqual(2);
    for (const p of paired) {
      const q = traders.people[p.partner]!;
      expect(q.partner).toBe(p.index);
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(0.7);
    }
  });

  it('keeps a minimum gap when the zone has room', () => {
    let seed = 7;
    const rand = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pts = scatterInRect({ x0: 0, y0: 0, x1: 10, y1: 6 }, 12, rand, 1.0);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        expect(Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1])).toBeGreaterThanOrEqual(0.79);
  });
});

describe('reactions follow SimEvents only', () => {
  const board = { cols: 41, rows: 31 };
  const env = ojuelegbaEnv(board);
  const zone = { x0: 18, y0: -6.8, x1: 26, y1: -4 };
  const exploded = (x: number, y: number, range: number): SimEvent => ({
    type: 'generatorExploded',
    generatorId: 1,
    ownerId: 0,
    x,
    y,
    eventId: 1,
    range,
  });
  const stageEvent = (kind: StageEvent['kind'], style: StageEvent['style'], tile: number): StageEvent => ({
    id: 1,
    hazard: 0,
    kind,
    style,
    tiles: [tile],
    dir: null,
    warnTick: 0,
    startTick: 90,
    endTick: 91,
    eventId: 1,
    index: -1,
    stepRemaining: 0,
    stepTicks: 4,
  });

  it('turns explosions, eliminations and lethal stage warnings into stimuli (and ignores the rest)', () => {
    const events: SimEvent[] = [
      exploded(20, 1, 4),
      {
        type: 'playerEliminated',
        playerId: 3,
        cause: { kind: 'crush', eventId: 0 },
        x: 5,
        y: 6,
        creditId: null,
        assistIds: [],
      },
      { type: 'stageWarning', event: stageEvent('sweep', 'traffic', 2 * 41 + 7) },
      { type: 'stageWarning', event: stageEvent('drop', 'merch', 41) },
      { type: 'matchStarted' },
    ];
    const s = stimuliFrom(events, board);
    expect(s.map((x) => x.kind)).toEqual(['blast', 'elimination', 'stage']);
    expect(s[0]).toMatchObject({ tx: 20.5, ty: 1.5, strength: 4 });
    expect(s[2]).toMatchObject({ tx: 7.5, ty: 2.5, style: 'traffic' });
  });

  it('a big blast near the stop makes it duck; a small or far one does not', () => {
    const near = stimuliFrom([exploded(21, 1, 4)], board)[0]!;
    const small = stimuliFrom([exploded(21, 1, 2)], board)[0]!;
    const far = stimuliFrom([exploded(21, 28, 5)], board)[0]!;
    expect(ruleFor(env.reactions, near, zone)?.reaction).toBe('duck');
    expect(ruleFor(env.reactions, small, zone)).toBeNull();
    expect(ruleFor(env.reactions, far, zone)).toBeNull();
  });

  it('eliminations anywhere get a cheer; stage warnings only turn heads that are close', () => {
    const fell = stimuliFrom(
      [
        {
          type: 'playerEliminated',
          playerId: 1,
          cause: { kind: 'crush', eventId: 0 },
          x: 30,
          y: 25,
          creditId: 2,
          assistIds: [],
        },
      ],
      board,
    )[0]!;
    expect(ruleFor(env.reactions, fell, zone)?.reaction).toBe('cheer');
    const hazard = stimuliFrom(
      [{ type: 'stageWarning', event: stageEvent('strike', 'debris', 15 * 41 + 20) }],
      board,
    )[0]!;
    expect(ruleFor(env.reactions, hazard, zone)).toBeNull(); // 15+ rows away
    const close = stimuliFrom(
      [{ type: 'stageWarning', event: stageEvent('strike', 'debris', 2 * 41 + 20) }],
      board,
    )[0]!;
    expect(ruleFor(env.reactions, close, zone)?.reaction).toBe('look');
  });

  it('style filters and the per-person chance decide who answers', () => {
    const s = stimuliFrom(
      [{ type: 'stageWarning', event: stageEvent('sweep', 'danfo', 3 * 41 + 20) }],
      board,
    )[0]!;
    expect(
      ruleFor({ stage: { reaction: 'look', radius: 30, chance: 1, styles: ['traffic'] } }, s, zone),
    ).toBeNull();
    expect(
      ruleFor({ stage: { reaction: 'look', radius: 30, chance: 1, styles: ['danfo'] } }, s, zone),
    ).not.toBeNull();
    const rule = { reaction: 'duck', radius: 10, chance: 0.5 } as const;
    expect(reacts(rule, s, () => 0.4)).toBe(true);
    expect(reacts(rule, s, () => 0.6)).toBe(false);
    // stronger blasts convince a few more people
    const big = { kind: 'blast', tx: 0, ty: 0, strength: 5 } as const;
    expect(reacts(rule, big, () => 0.6)).toBe(true);
  });

  it('scatterers move away from the cause and never out of the zone', () => {
    const t = scatterTarget({ x: 19, y: -5 }, { tx: 19, ty: 1 }, zone);
    expect(t[1]).toBeLessThan(-5); // away from the board (north)
    const edge = scatterTarget({ x: 25.9, y: -6.7 }, { tx: 10, ty: 3 }, zone, 5);
    expect(edge[0]).toBeLessThanOrEqual(zone.x1);
    expect(edge[0]).toBeGreaterThanOrEqual(zone.x0);
    expect(edge[1]).toBeGreaterThanOrEqual(zone.y0);
    expect(edge[1]).toBeLessThanOrEqual(zone.y1);
  });
});

describe('practical light flicker', () => {
  it('stays within 0..1 and is a pure function of the clock', () => {
    for (const kind of ['steady', 'fluorescent', 'sodium', 'neon'] as const)
      for (let t = 0; t < 30; t += 0.07) {
        const v = flickerAt(kind, t, 1.3);
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(1);
        expect(flickerAt(kind, t, 1.3)).toBe(v);
      }
  });
});
