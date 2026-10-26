/**
 * Living environments: noncombatant NPCs are presentation only, and the generic builder obeys the
 * contract. Three groups:
 *
 *  1. Noncombatants never exist in the simulation: the state has no NPC entities, eliminations are only
 *     ever credited to competitors, the render modules cannot step or create a game, and running a match
 *     with a living environment attached leaves the state byte-identical to running it without.
 *  2. The builder: budgets and draw calls per quality tier, nothing on the board, ambient traffic kept
 *     apart from attack and hazard vehicles (own muted materials, no warning lights), crowd reactions
 *     driven by SimEvents that stay inside their zones and walk home, reduced motion.
 *  3. Declared audio hooks name existing synthesised sounds.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AdditiveBlending } from 'three';
import type { InstancedMesh, Material, Object3D, Mesh } from 'three';
import { createBot } from '../src/ai';
import { SOUND_IDS } from '../src/audio/recipes';
import { createGame, observe, tick } from '../src/sim';
import type { GameState, Intents, SimEvent } from '../src/sim';
import { QUALITY } from '../src/render/quality';
import { LivingEnvironment } from '../src/render/env/LivingEnvironment';
import { ojuelegbaEnv } from '../src/render/env/ojuelegbaEnv';
import { BOARD_MARGIN, boardRect, expandRect, planEnvironment, pointInRect } from '../src/render/env/plan';
import { ENV_DRAW_CALL_TARGET } from '../src/render/env/types';
import type { StageEnvironment } from '../src/render/env/types';
import type { FrameContext } from '../src/render/views/types';

function fakeContext(canvas: { width: number; height: number }): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const target: Record<string | symbol, unknown> = {
    canvas,
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
  };
  return new Proxy(target, {
    get: (t, p) => (p in t ? t[p] : () => undefined),
    set: (t, p, v) => {
      t[p] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: () => {
      const c = { width: 1, height: 1, style: {} } as {
        width: number;
        height: number;
        getContext?: () => unknown;
      };
      c.getContext = () => fakeContext(c);
      return c;
    },
  });
});

const ID = 'rumbleOjuelegba';
const BOARD = { cols: 41, rows: 31 };

// ---------------------------------------------------------------------------------- 1. not in the sim

/** A Survival match of bots on the stage; returns the final state and every event. */
function playBots(
  seats: number,
  ticks: number,
  onTick?: (events: readonly SimEvent[], s: GameState) => void,
): { state: GameState; events: SimEvent[] } {
  const state = createGame({
    seed: 21,
    arenaId: ID,
    players: Array.from({ length: seats }, (_, i) => ({
      name: `B${i}`,
      characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
      isBot: true,
      difficulty: 'standard' as const,
    })),
    settings: { game: 'survival' },
  });
  const bots = state.players.map((_, i) => createBot({ difficulty: 'standard', seed: 100 + i, playerId: i }));
  const events: SimEvent[] = [];
  const intents: Intents = {};
  while (state.tick < ticks) {
    for (const p of state.players) if (p.alive) intents[p.id] = bots[p.id]!.decide(observe(state, p.id));
    const out = tick(state, intents);
    events.push(...out);
    onTick?.(out, state);
  }
  return { state, events };
}

describe('noncombatants are presentation only', () => {
  it('the simulation has no NPC entities: every entity list belongs to competitors and the sim', () => {
    const { state } = playBots(12, 1500);
    expect(state.players).toHaveLength(12);
    expect(
      Object.keys(state).filter((k) =>
        /npc|pedestrian|bystander|noncombatant|ambient|traffic|extra/i.test(k),
      ),
    ).toEqual([]);
    for (const g of state.generators) expect(g.ownerId >= 0 && g.ownerId < 12).toBe(true);
    for (const v of state.vehicles) expect(state.players.some((p) => p.id === v.ownerId)).toBe(true);
  });

  it('eliminations are only ever credited to competitor ids (or to nobody)', () => {
    const { events } = playBots(12, 3000);
    const elim = events.filter(
      (e): e is Extract<SimEvent, { type: 'playerEliminated' }> => e.type === 'playerEliminated',
    );
    expect(elim.length).toBeGreaterThan(0);
    for (const e of elim) {
      expect(e.playerId).toBeGreaterThanOrEqual(0);
      expect(e.playerId).toBeLessThan(12);
      if (e.creditId !== null) {
        expect(e.creditId).toBeGreaterThanOrEqual(0);
        expect(e.creditId).toBeLessThan(12);
      }
      for (const a of e.assistIds) expect(a >= 0 && a < 12).toBe(true);
    }
    for (const e of events) {
      if (e.type === 'rewardGranted') expect(e.playerId >= 0 && e.playerId < 12).toBe(true);
    }
  });

  it('the render modules of the environment can only read: they never import anything that steps or creates a game', () => {
    const forbidden = new Set(['tick', 'createGame', 'createPlayer', 'mergeConfig']);
    for (const dir of ['src/render/env', 'src/render/life']) {
      for (const name of readdirSync(dir)) {
        const src = readFileSync(join(dir, name), 'utf8');
        for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'(?:\.\.\/)+sim[^']*'/g)) {
          if (m[1]) continue;
          for (const id of m[2]!.split(',').map((x) => x.trim().split(/\s+as\s+/)[0]!))
            expect(forbidden.has(id), `${dir}/${name} imports ${id}`).toBe(false);
        }
      }
    }
  });

  it('attaching a living environment changes nothing: the final state is byte-identical', () => {
    const plain = playBots(10, 1800).state;
    const env = new LivingEnvironment(ojuelegbaEnv(BOARD), {
      board: BOARD,
      profile: QUALITY.high,
      reducedMotion: false,
    });
    let t = 0;
    const withEnv = playBots(10, 1800, (events, s) => {
      Object.freeze(events); // the environment may read the events, never alter them
      env.handleEvents(events);
      if (s.tick % 3 === 0) {
        t += 0.05;
        env.update({
          state: s,
          alpha: 0,
          time: t,
          dt: 0.05,
          info: { excitement: 0.5 },
        } as unknown as FrameContext);
      }
    }).state;
    expect(JSON.stringify(withEnv)).toBe(JSON.stringify(plain));
    env.dispose();
  });
});

// ------------------------------------------------------------------------------------- 2. the builder

const meshesOf = (o: Object3D): InstancedMesh[] => {
  const out: InstancedMesh[] = [];
  o.traverse((c) => {
    if ((c as InstancedMesh).isInstancedMesh) out.push(c as InstancedMesh);
  });
  return out;
};

const build = (
  level: 'low' | 'medium' | 'high',
  reducedMotion = false,
  tweak?: (env: StageEnvironment) => StageEnvironment,
): LivingEnvironment => {
  const env = ojuelegbaEnv(BOARD);
  return new LivingEnvironment(tweak ? tweak(env) : env, {
    board: BOARD,
    profile: QUALITY[level],
    reducedMotion,
  });
};

/** Everyone answers every cause (the mechanism under test, not the dice). */
const certain = (env: StageEnvironment): StageEnvironment => ({
  ...env,
  reactions: {
    blast: { ...env.reactions!.blast!, chance: 1 },
    elimination: { ...env.reactions!.elimination!, chance: 1 },
    stage: { ...env.reactions!.stage!, chance: 1 },
  },
  crowds: env.crowds!.map((z) => ({
    ...z,
    reacts: z.reacts && { ...z.reacts, ...(z.reacts.blast && { blast: { ...z.reacts.blast, chance: 1 } }) },
  })),
});

const frame = (env: LivingEnvironment, time: number, dt = 1 / 60): void =>
  env.update({ info: { excitement: 0.3 }, time, dt } as unknown as FrameContext);

describe('the generic builder', () => {
  for (const level of ['low', 'medium', 'high'] as const) {
    it(`${level}: builds exactly what the plan says, within the draw-call target`, () => {
      const env = build(level);
      const plan = planEnvironment(ojuelegbaEnv(BOARD), level, BOARD);
      const stats = env.stats();
      expect(stats.vehicles).toBe(plan.vehicles.length);
      expect(stats.lights).toBe(plan.lights);
      expect(stats.rigs + stats.figures).toBe(plan.people); // no models in the test: everyone is a figure
      expect(stats.drawCalls).toBeLessThanOrEqual(ENV_DRAW_CALL_TARGET[level]);
      env.dispose();
      expect(env.group.children).toHaveLength(0);
    });
  }

  it('low quality has no animated rigs, one vehicle model and no particles', () => {
    const env = build('low');
    expect(env.stats().rigs).toBe(0);
    const vehicleMeshes = meshesOf(env.group).filter((m) => m.userData.ambientTraffic);
    const geometries = new Set(vehicleMeshes.map((m) => m.geometry.uuid));
    expect(geometries.size).toBeLessThanOrEqual(10); // one model's merged materials
    expect(env.group.children.some((c) => (c as { isPoints?: boolean }).isPoints)).toBe(false);
    env.dispose();
  });

  it('never draws on the board: vehicles stay clear of it at every moment', () => {
    const env = build('high');
    const traffic = env.parts.traffic!;
    const keepOut = expandRect(boardRect(BOARD), BOARD_MARGIN);
    for (let t = 0; t < 300; t += 2.3)
      for (const v of traffic.positions(t)) {
        const tx = v.x + BOARD.cols / 2;
        const ty = v.z + BOARD.rows / 2;
        expect(pointInRect(tx, ty, keepOut), `${v.kind} at ${t}`).toBe(false);
      }
    env.dispose();
  });

  it('keeps ambient traffic apart from attack and hazard vehicles: own muted materials, no warning lights, no beams', () => {
    const env = build('high');
    const mats = new Set<Material>();
    env.parts.traffic!.group.traverse((o) => {
      const m = (o as Mesh).material as Material | undefined;
      if (m) mats.add(m);
    });
    expect(mats.size).toBeGreaterThan(0);
    for (const m of mats) {
      expect(m.userData.ambientTraffic).toBe(true);
      expect(m.userData.gritPatched).toBe(false); // the weathering pass patches this module's own clones
      expect(m.blending).not.toBe(AdditiveBlending); // no headlight beams, glows or telegraph overlays
      const emissive = (m as { emissiveIntensity?: number }).emissiveIntensity ?? 0;
      expect(emissive).toBeLessThanOrEqual(0.2);
    }
    // nothing in the traffic group is a sprite or a light
    env.parts.traffic!.group.traverse((o) => {
      expect((o as { isSprite?: boolean }).isSprite).toBeFalsy();
      expect((o as { isLight?: boolean }).isLight).toBeFalsy();
    });
    expect(env.parts.traffic!.group.userData.grit).toBe('vehicle');
    env.dispose();
  });

  it('crowds look nothing like the cast: no team colours, no markers, instanced muted figures tagged as bystanders', () => {
    const env = build('high');
    const crowd = env.parts.crowd!;
    expect(crowd.group.userData.grit).toBe('crowd');
    const people = meshesOf(crowd.group);
    expect(people.length).toBeGreaterThan(0);
    for (const m of people) {
      expect(m.userData.npcCrowd).toBe(true);
      expect(m.castShadow).toBe(false);
      expect((m.material as Material).userData.npcCrowd).toBe(true);
    }
    // instance tints are darkened (the cast and its team colours are drawn at full brightness)
    for (const m of people) {
      const c = m.instanceColor!;
      for (let i = 0; i < m.count * 3; i++) expect(c.array[i]!).toBeLessThan(0.95);
    }
    env.dispose();
  });

  it('a big blast near the stop makes people duck, an elimination makes the touts cheer; all stay in their zones and walk home', () => {
    const env = build('high', false, certain);
    const crowd = env.parts.crowd!;
    const zones = new Map(ojuelegbaEnv(BOARD).crowds!.map((z) => [z.id, z.rect]));
    let t = 0;
    const step = (secs: number): void => {
      for (let i = 0; i < secs * 30; i++) {
        t += 1 / 30;
        frame(env, t, 1 / 30);
        for (const f of crowd.figurePositions()) {
          const r = zones.get(f.zone)!;
          expect(f.x, f.zone).toBeGreaterThanOrEqual(r.x0);
          expect(f.x, f.zone).toBeLessThanOrEqual(r.x1);
          expect(f.y, f.zone).toBeGreaterThanOrEqual(r.y0);
          expect(f.y, f.zone).toBeLessThanOrEqual(r.y1);
        }
      }
    };
    step(2);
    const calm = crowd.figurePositions();
    // a radius-5 blast on the north edge, just below the bus stop; and one fighter falling on the board
    env.handleEvents([
      {
        type: 'generatorExploded',
        generatorId: 1,
        ownerId: 0,
        x: 20,
        y: 1,
        eventId: 1,
        range: 5,
        radial: true,
      },
      {
        type: 'playerEliminated',
        playerId: 2,
        cause: { kind: 'crush', eventId: 0 },
        x: 20,
        y: 3,
        creditId: 1,
        assistIds: [],
      },
    ]);
    step(0.3);
    const reacting = crowd.figurePositions();
    const stop = reacting.filter((f) => f.zone === 'busStop');
    expect(stop.some((f) => f.pose === 1)).toBe(true); // ducking
    const touts = reacting.filter((f) => f.zone === 'danfoParkTouts');
    expect(touts.some((f) => f.pose === 1)).toBe(true); // cheering (an elimination is heard everywhere)
    // later: calm again and back at their homes
    step(6);
    for (const f of crowd
      .figurePositions()
      .filter((x) => x.zone === 'busStop' || x.zone === 'danfoParkTouts'))
      expect(Math.hypot(f.x - f.homeX, f.y - f.homeY)).toBeLessThan(0.05);
    expect(calm.length).toBe(reacting.length);
    env.dispose();
  });

  it('scatterers move a few steps (never out of the zone) and come back; reduced motion makes them flinch in place', () => {
    for (const reduced of [false, true]) {
      const env = build('high', reduced, certain);
      const crowd = env.parts.crowd!;
      let t = 0;
      const step = (secs: number): void => {
        for (let i = 0; i < secs * 30; i++) {
          t += 1 / 30;
          frame(env, t, 1 / 30);
        }
      };
      step(1);
      // a big blast close to the park's west side: the touts' rule is 'scatter'
      env.handleEvents([
        {
          type: 'generatorExploded',
          generatorId: 1,
          ownerId: 0,
          x: 38,
          y: 11,
          eventId: 1,
          range: 5,
          radial: true,
        },
      ]);
      step(0.7);
      const moved = crowd
        .figurePositions()
        .filter((f) => f.zone === 'danfoParkTouts')
        .map((f) => Math.hypot(f.x - f.homeX, f.y - f.homeY));
      if (reduced) expect(Math.max(...moved)).toBeLessThan(0.05);
      else expect(Math.max(...moved)).toBeGreaterThan(0.2);
      step(5);
      for (const f of crowd.figurePositions().filter((x) => x.zone === 'danfoParkTouts'))
        expect(Math.hypot(f.x - f.homeX, f.y - f.homeY)).toBeLessThan(0.05);
      env.dispose();
    }
  });

  it('reduced motion slows the traffic to a crawl', () => {
    const a = build('high', false).parts.traffic!;
    const b = build('high', true).parts.traffic!;
    // median distance a vehicle covers in 0.3 s (a vehicle that wraps in the window is an outlier)
    const median = (p: ReturnType<typeof a.positions>, q: ReturnType<typeof a.positions>): number => {
      const d = p.map((v, i) => Math.hypot(v.x - q[i]!.x, v.z - q[i]!.z)).sort((x, y) => x - y);
      return d[Math.floor(d.length / 2)]!;
    };
    expect(median(b.positions(1), b.positions(1.3))).toBeLessThan(
      median(a.positions(1), a.positions(1.3)) * 0.6,
    );
  });

  it('rebuilds for a new quality tier and disposes everything', () => {
    const env = build('high');
    const high = env.stats();
    env.setProfile(QUALITY.low);
    const low = env.stats();
    expect(low.vehicles).toBeLessThan(high.vehicles);
    expect(low.drawCalls).toBeLessThan(high.drawCalls);
    env.dispose();
    expect(env.stats().vehicles).toBe(0);
  });

  it('only Ojuelegba declares an environment; other stages get nothing', async () => {
    const { NEW_ARENA_ART } = await import('../src/render/arenas/newArenas');
    const art = NEW_ARENA_ART();
    expect(art.rumbleOjuelegba!.env).toBeDefined();
    for (const [id, a] of Object.entries(art))
      if (id !== 'rumbleOjuelegba') expect(a.env, id).toBeUndefined();
  });
});

// ------------------------------------------------------------------------------------ 3. audio hooks

describe('audio identity hooks', () => {
  it('name existing synthesised sounds only', () => {
    const ids = new Set<string>(SOUND_IDS);
    const audio = ojuelegbaEnv(BOARD).audio!;
    for (const name of audio.beds) expect(ids.has(name), name).toBe(true);
    for (const r of audio.reactions ?? []) expect(ids.has(r.sound), r.sound).toBe(true);
  });
});
