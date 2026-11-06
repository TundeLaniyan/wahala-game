/**
 * Checkpoint clarity in the world (docs/CHECKPOINT_CLARITY.md, decisions CK1-CK3): the pure beacon look (current bright
 * with a waypoint arrow, later faint, reached flashes then settles with a tick, never a filling ring), and the mission
 * view driving a real simulated field mission headlessly: walk-through checkpoints are beacons, the depot door is a hold
 * pad with a ring, and they are different objects.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Group, Mesh, MeshBasicMaterial } from 'three';
import { createLayout } from '../../src/render/coords';
import { Effects } from '../../src/render/fx/Effects';
import { QUALITY } from '../../src/render/quality';
import { MissionViews } from '../../src/render/views/MissionViews';
import { BEACON_COLORS, BEACON_FLASH_SEC, beaconLook } from '../../src/render/views/checkpointStyle';
import { MARKER_COLORS } from '../../src/render/views/missionStyle';
import type { FrameContext } from '../../src/render/views/types';
import { advance, put } from '../mission-helpers';
import { newField } from '../field-helpers';

function fakeContext(canvas: { width: number; height: number }): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const target: Record<string | symbol, unknown> = {
    canvas,
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

describe('beacon look (pure)', () => {
  it('the current checkpoint is gold, tall, bright, with a ripple and the waypoint arrow', () => {
    for (const t of [0, 0.4, 1.7]) {
      const l = beaconLook('live', null, t);
      expect(l.color).toBe(BEACON_COLORS.current);
      expect(l.height).toBe(1);
      expect(l.column).toBeGreaterThan(0.6);
      expect(l.core).toBeGreaterThan(0.7);
      expect(l.arrow).toBe(1);
      expect(l.tick).toBe(false);
    }
  });

  it('a later checkpoint is faint, short and grey, with no arrow and no ripple', () => {
    const l = beaconLook('locked', null, 0.5);
    const live = beaconLook('live', null, 0.5);
    expect(l.color).toBe(BEACON_COLORS.later);
    expect(l.column).toBeLessThan(live.column / 3);
    expect(l.height).toBeLessThan(0.5);
    expect(l.arrow).toBe(0);
    expect(l.rippleOpacity).toBe(0);
  });

  it('reached: a white then green burst that fades over BEACON_FLASH_SEC, then a calm green flag with a tick', () => {
    const start = beaconLook('done', 0, 0);
    expect(start.color).toBe(BEACON_COLORS.flash);
    expect(start.tick).toBe(true);
    expect(start.column).toBeGreaterThan(0.9);
    const mid = beaconLook('done', BEACON_FLASH_SEC / 2, 0);
    expect(mid.color).toBe(BEACON_COLORS.reached);
    expect(mid.column).toBeLessThan(start.column);
    const settled = beaconLook('done', BEACON_FLASH_SEC + 0.1, 0);
    expect(settled).toMatchObject({ color: BEACON_COLORS.reached, column: 0, core: 0, arrow: 0, tick: true });
    // already done when first seen (e.g. a resumed mission): no flash
    expect(beaconLook('done', null, 0)).toEqual(settled);
  });
});

describe('the mission view draws a simulated field mission', () => {
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
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  const rig = () => {
    const state = newField('oshodi.approach');
    const layout = createLayout(state.width, state.height);
    const fx = new Effects(layout, QUALITY.medium);
    const views = new MissionViews();
    const ctx = (time = 0): FrameContext =>
      ({ state, alpha: 0, time, dt: 1 / 60, info: { excitement: 0 }, layout, fx }) as unknown as FrameContext;
    return { state, views, ctx };
  };

  it('checkpoints are beacons (one current, two later), never a pad with a progress ring', () => {
    const { state, views, ctx } = rig();
    advance(state, 1);
    views.update(ctx(0.1));
    expect(views.stats()).toMatchObject({ beacons: 3, beaconsLive: 1, beaconsLocked: 2, holds: 0, nodes: 0 });
    const { beacons, holds } = views.debugObjects();
    expect(holds).toHaveLength(0);
    for (const b of beacons) expect(b.userData.markerKind).toBe('checkpoint');
    views.dispose();
  });

  it('reaching checkpoint A flashes it, makes B the current one; the door is a separate hold pad with a ring', () => {
    const { state, views, ctx } = rig();
    advance(state, 1);
    views.update(ctx(0.1));
    put(state, 0, 9, 39);
    advance(state, 1);
    views.update(ctx(0.2));
    expect(views.stats()).toMatchObject({
      beaconsDone: 1,
      beaconsLive: 1,
      beaconsLocked: 1,
      beaconsFlashing: 1,
    });
    views.update(ctx(0.2 + BEACON_FLASH_SEC + 0.1));
    expect(views.stats().beaconsFlashing).toBe(0);

    put(state, 0, 19, 39);
    advance(state, 1);
    put(state, 0, 26, 40);
    advance(state, 1);
    put(state, 0, 25, 44);
    advance(state, 20);
    views.update(ctx(3));
    const stats = views.stats();
    expect(stats).toMatchObject({ holds: 1, nodes: 1, beacons: 3, beaconsDone: 3, beaconsLive: 0 });
    const { beacons, holds } = views.debugObjects();
    const door = holds[0]!;
    expect(door.userData.markerKind).toBe('hold');
    expect(beacons.includes(door)).toBe(false);
    // the door's hold track is shown and its progress arc fills (a third of the hold), in the HOLD colour (cyan)
    const meshes = door.children as Mesh[];
    const pad = meshes[0]!;
    expect((pad.material as MeshBasicMaterial).color.getHex()).toBe(MARKER_COLORS.hold);
    const [track, arc] = [meshes[1]!, meshes[2]!];
    expect(track.visible).toBe(true);
    expect(arc.visible).toBe(true);
    expect(arc.geometry).not.toBe(track.geometry);
    views.dispose();
  });

  it('beacons and pads are distinct object types in the scene graph', () => {
    const { state, views, ctx } = rig();
    for (const [x, y] of [
      [9, 39],
      [19, 39],
      [26, 40],
    ] as const) {
      put(state, 0, x, y);
      advance(state, 1);
    }
    views.update(ctx(1));
    const { beacons, holds } = views.debugObjects();
    const names = (g: Group): string[] => g.children.map((c) => (c as Mesh).geometry.type).sort();
    expect(beacons.length).toBe(3);
    expect(holds.length).toBe(1);
    expect(names(beacons[0]!)).not.toEqual(names(holds[0]!));
    expect(names(beacons[0]!)).toContain('CylinderGeometry');
    expect(names(beacons[0]!)).toContain('ConeGeometry');
    views.dispose();
  });
});
