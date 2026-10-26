/**
 * The look of a Danfo departure (RE-E3): the pure easing helpers, and the stage-hazard view driving a real
 * simulated departure headlessly: parked and visible on its bay for the whole warning, with its lamps
 * working, then pulling out along the lane without ever running ahead of the lethal tile.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Object3D, Sprite } from 'three';
import { createGame, getArena, tick } from '../../src/sim';
import type { GameState, SimEvent } from '../../src/sim';
import { createLayout } from '../../src/render/coords';
import { Effects } from '../../src/render/fx/Effects';
import { QUALITY } from '../../src/render/quality';
import {
  DEPART_LAG,
  DEPART_RAMP,
  ROLLBACK_TILES,
  blinkerOn,
  departDistance,
  departRollback,
  departSpeed,
  easeDepart,
  hornPulse,
  routePoint,
} from '../../src/render/views/departure';
import { StageHazardViews } from '../../src/render/views/StageHazardViews';
import type { FrameContext } from '../../src/render/views/types';

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

describe('departure easing (pure)', () => {
  it('starts at rest, accelerates over the ramp and then trails the sim by a bounded lag', () => {
    expect(easeDepart(0)).toBe(0);
    expect(easeDepart(-1)).toBe(0);
    let prev = 0;
    for (let u = 0; u <= 12; u += 0.05) {
      const e = easeDepart(u);
      expect(e).toBeGreaterThanOrEqual(prev); // never goes backwards
      expect(e).toBeLessThanOrEqual(u + 1e-9); // never AHEAD of the lethal tile
      expect(u - e).toBeLessThanOrEqual(DEPART_LAG + 1e-9);
      prev = e;
    }
    expect(easeDepart(DEPART_RAMP)).toBeCloseTo(DEPART_RAMP - DEPART_LAG);
    // continuous at the end of the ramp, and it reaches cruising speed there
    expect(easeDepart(DEPART_RAMP - 1e-6)).toBeCloseTo(easeDepart(DEPART_RAMP + 1e-6), 4);
    expect(departSpeed(0)).toBe(0);
    expect(departSpeed(DEPART_RAMP)).toBe(1);
    expect(departSpeed(9)).toBe(1);
  });

  it('measures the sim distance: parked through the warning and the first step, then tile to tile', () => {
    expect(departDistance(-1, 0, 6, 0)).toBe(0);
    expect(departDistance(0, 3, 6, 0.5)).toBe(0);
    expect(departDistance(1, 6, 6, 0)).toBe(0); // about to move off the bay
    expect(departDistance(1, 0, 6, 0)).toBe(1);
    expect(departDistance(3, 3, 6, 0)).toBeCloseTo(2.5);
  });

  it('rolls back a little in the last part of the warning and lets go as it launches', () => {
    expect(departRollback(0.2, 0)).toBe(0);
    expect(departRollback(0.78, 0)).toBe(0);
    expect(departRollback(1, 0)).toBeCloseTo(ROLLBACK_TILES);
    expect(departRollback(0.9, 0)).toBeGreaterThan(0);
    expect(departRollback(0.9, 0)).toBeLessThan(ROLLBACK_TILES);
    expect(departRollback(1, 0.5)).toBeCloseTo(0);
    expect(departRollback(1, 3)).toBe(0);
  });

  it('walks a tile route, backwards before the bay and on past the edge', () => {
    const w = 15;
    const tiles = [4 * w + 3, 4 * w + 2, 4 * w + 1, 4 * w + 0];
    expect(routePoint(tiles, 0, w)).toMatchObject({ x: 3, y: 4, dx: -1, dy: 0 });
    expect(routePoint(tiles, 1.5, w)).toMatchObject({ x: 1.5, y: 4 });
    expect(routePoint(tiles, -0.14, w).x).toBeCloseTo(3.14); // rolled back, away from the lane
    expect(routePoint(tiles, 5, w)).toMatchObject({ x: -2, y: 4, dx: -1 });
    // a corner: the direction follows the segment
    const bent = [2 * w + 2, 2 * w + 3, 3 * w + 3];
    expect(routePoint(bent, 1.5, w)).toMatchObject({ x: 3, y: 2.5, dx: 0, dy: 1 });
  });

  it('flashes the blinkers faster and sends two horn pulses during the warning', () => {
    const count = (k: number): number => {
      let flips = 0;
      let prev = blinkerOn(0, k);
      for (let t = 0; t < 2; t += 0.005) {
        const on = blinkerOn(t, k);
        if (on !== prev) flips++;
        prev = on;
      }
      return flips;
    };
    expect(count(1)).toBeGreaterThan(count(0));
    const pulses = Array.from({ length: 101 }, (_, i) => hornPulse(i / 100)).filter((p) => p >= 0);
    expect(pulses.length).toBeGreaterThan(10);
    expect(hornPulse(0.3)).toBe(-1);
    expect(hornPulse(0.02)).toBe(0);
  });
});

describe('the stage-hazard view draws a simulated departure', () => {
  const arena = getArena('danfoBusPark');
  const original = arena.stageHazards;
  const BAY: [number, number][] = [
    [3, 4],
    [2, 4],
    [1, 4],
    [0, 4],
  ];

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
    arena.stageHazards = [
      {
        kind: 'sweep',
        style: 'danfo',
        routes: [BAY],
        depart: true,
        stepTicks: 9,
        firstAtSec: 1,
        everySec: [30, 30],
        warnSec: 2,
      },
    ];
  });
  afterAll(() => {
    arena.stageHazards = original;
  });

  it('parks the Danfo on its bay for the whole warning, then drives it out without running ahead of the lethal tile', () => {
    const state: GameState = createGame({
      seed: 3,
      arenaId: 'danfoBusPark',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: false },
      ],
    });
    state.match.phase = 'playing';
    state.match.countdownRemaining = 0;
    state.floorHazards = {};
    state.players[0]!.x = state.players[0]!.stepFromX = 14;
    state.players[0]!.y = state.players[0]!.stepFromY = 0;
    state.players[1]!.x = state.players[1]!.stepFromX = 14;
    state.players[1]!.y = state.players[1]!.stepFromY = 10;
    const layout = createLayout(state.width, state.height);
    const fx = new Effects(layout, QUALITY.medium);
    const views = new StageHazardViews(state, layout, fx, QUALITY.medium);
    const solids = views.group.children.find((c) => c.userData.grit === 'vehicle')!;
    const ctx = (time: number): FrameContext =>
      ({ state, alpha: 0, time, dt: 1 / 60, info: { excitement: 0 }, layout, fx }) as unknown as FrameContext;
    const vehicle = (): Object3D | undefined => solids.children[0];
    const bayX = layout.wx(3);
    const bayZ = layout.wz(4);

    let started = false;
    let sawParked = 0;
    let maxProgress = 0;
    let lastX = bayX;
    let reverseLit = false;
    let blinked = false;
    let ended = false;
    let t = 0;
    for (let i = 0; i < 6 * 60 && !ended; i++) {
      const events: SimEvent[] = tick(state, {});
      t += 1 / 60;
      fx.update(1 / 60, t);
      views.handleEvents(events, state);
      views.update(ctx(t));
      const ev = state.stage.events.find((e) => e.kind === 'sweep');
      if (!ev) {
        if (started) ended = true;
        continue;
      }
      const v = vehicle();
      expect(v, `vehicle at tick ${state.tick}`).toBeDefined();
      expect(v!.visible).toBe(true);
      const lamps = v!.children
        .flatMap((c) => (c.children.length ? c.children : [c]))
        .filter((c) => (c as { isSprite?: boolean }).isSprite);
      if (state.tick < ev.startTick) {
        // warning: parked on the bay (rolling back at most a hand's breadth), the lane is not yet lethal
        sawParked++;
        expect(Math.abs(v!.position.x - bayX)).toBeLessThan(0.3);
        expect(v!.position.z).toBeCloseTo(bayZ, 5);
        expect(ev.index).toBe(-1);
        if (lamps.some((l) => (l as Sprite).material.opacity > 0.9)) blinked = true;
      } else {
        started = true;
        const progress = bayX - v!.position.x; // the lane runs west: tiles
        maxProgress = Math.max(maxProgress, progress);
        // never AHEAD of the lethal tile: the sim tile index is where the front is allowed to be
        const lethalProgress = Math.max(0, ev.index);
        expect(progress).toBeLessThanOrEqual(lethalProgress + 1e-6);
        expect(v!.position.x).toBeLessThanOrEqual(lastX + 0.2); // keeps moving the same way (modulo the roll back)
        lastX = v!.position.x;
      }
      if (lamps.some((l) => (l as Sprite).material.opacity > 0.9 && l.position.y < 0.4)) reverseLit = true;
    }
    expect(sawParked).toBeGreaterThanOrEqual(state.config.stage.minLethalWarnTicks);
    expect(started).toBe(true);
    expect(maxProgress).toBeGreaterThan(2); // it really drove out along the lane
    expect(blinked).toBe(true);
    expect(reverseLit).toBe(true);
    views.dispose();
  });
});
