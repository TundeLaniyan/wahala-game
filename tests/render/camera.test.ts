import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CameraRig } from '../../src/render/cameraRig';
import { directShot } from '../../src/render/cameraDirector';
import { cameraModeFor, selectShot } from '../../src/render/cameraModes';
import { createLayout } from '../../src/render/coords';
import { Tile } from '../../src/sim/types';
import { addGenerator, put, sandbox } from '../helpers';

/**
 * The camera is purely presentational. The default ACTION camera is low and close and follows the
 * local player; it must keep that player (and danger that can reach them) inside the HUD-free band
 * from every tile. The OVERVIEW keeps every tile on screen. Pointer picking must map back to exactly
 * the tile under the cursor in both.
 */
const VIEWPORTS = [
  { name: 'desktop 16:9', w: 1280, h: 720, insets: { top: 0.1, bottom: 0.05 } },
  { name: 'landscape phone', w: 844, h: 390, insets: { top: 0.13, bottom: 0.03 } },
  { name: 'portrait', w: 390, h: 844, insets: { top: 0.1, bottom: 0.05 } },
];

function pitchOf(rig: CameraRig): number {
  rig.camera.updateMatrixWorld(true);
  const dir = rig.camera.getWorldDirection(new Vector3());
  return (Math.asin(-dir.y) * 180) / Math.PI;
}

function project(rig: CameraRig, x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z).project(rig.camera);
}

describe('overview camera: whole arena and picking', () => {
  for (const vp of VIEWPORTS) {
    it(`${vp.name}: whole arena visible and screenToGrid round-trips every tile`, () => {
      const layout = createLayout(15, 11);
      const rig = new CameraRig(layout);
      rig.fit(vp.w / vp.h, vp.insets);
      rig.update(0, 0, 0, null);
      for (let y = 0; y < layout.height; y++) {
        for (let x = 0; x < layout.width; x++) {
          const v = project(rig, layout.wx(x), 0, layout.wz(y));
          expect(Math.abs(v.x)).toBeLessThan(1);
          expect(v.y).toBeLessThan(1 - vp.insets.top * 2 + 1e-6);
          expect(v.y).toBeGreaterThan(-1 + vp.insets.bottom * 2 - 1e-6);
          const g = rig.screenToGrid(((v.x + 1) / 2) * vp.w, ((1 - v.y) / 2) * vp.h, vp.w, vp.h)!;
          expect(g.x).toBeCloseTo(x, 3);
          expect(g.y).toBeCloseTo(y, 3);
        }
      }
    });
  }

  it('landscape phone: near-row corners stay clear of the bottom-corner touch controls', () => {
    const layout = createLayout(15, 11);
    const rig = new CameraRig(layout);
    rig.fit(844 / 390, { top: 0.13, bottom: 0.03 });
    rig.update(0, 0, 0, null);
    for (const x of [0, layout.width - 1]) {
      const v = project(
        rig,
        layout.wx(x) + Math.sign(layout.wx(x)) * 0.5,
        0,
        layout.wz(layout.height - 1) + 0.5,
      );
      expect(Math.abs(v.x)).toBeLessThan(0.62);
    }
  });
});

describe('action camera: low, close, follows the local player', () => {
  it('is a low three-quarter view (40-50 degrees) far closer than the overview', () => {
    const state = sandbox();
    const layout = createLayout(state.width, state.height);
    const rig = new CameraRig(layout);
    rig.fit(16 / 9);
    rig.update(0, 0, 0, null);
    const overview = rig.currentPose().distance;
    expect(pitchOf(rig)).toBeGreaterThanOrEqual(40);
    rig.cut();
    rig.update(0, 0, 0, directShot(state, layout, 0, 0, false));
    const pitch = pitchOf(rig);
    expect(pitch).toBeGreaterThan(40);
    expect(pitch).toBeLessThan(50);
    expect(rig.currentPose().distance).toBeLessThan(overview * 0.65);
    // camera height: well under the old whole-board camera
    expect(rig.camera.position.y).toBeLessThan(8);
  });

  for (const vp of VIEWPORTS) {
    it(`${vp.name}: the local player stays in the HUD-free band from every open tile`, () => {
      const state = sandbox();
      const layout = createLayout(state.width, state.height);
      const rig = new CameraRig(layout);
      rig.fit(vp.w / vp.h, vp.insets);
      const compact = vp.insets.top >= 0.12;
      for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
          if (state.tiles[y * state.width + x] !== Tile.Empty) continue;
          put(state, 0, x, y);
          rig.cut();
          rig.update(0, 0, 0, directShot(state, layout, 0, 0, false));
          for (const h of [0, 1.6]) {
            const v = project(rig, layout.wx(x), h, layout.wz(y));
            expect(Math.abs(v.x)).toBeLessThan(0.85);
            expect(v.y).toBeLessThan(1 - vp.insets.top * 2);
            expect(v.y).toBeGreaterThan(-1 + vp.insets.bottom * 2);
          }
          // phones: the player's feet never sit under the bottom-corner D-pad or action buttons
          if (compact) {
            const feet = project(rig, layout.wx(x), 0, layout.wz(y));
            expect(Math.abs(feet.x) < 0.62 || feet.y > -0.3).toBe(true);
          }
          const v = project(rig, layout.wx(x), 0, layout.wz(y));
          const g = rig.screenToGrid(((v.x + 1) / 2) * vp.w, ((1 - v.y) / 2) * vp.h, vp.w, vp.h)!;
          expect(g.x).toBeCloseTo(x, 3);
          expect(g.y).toBeCloseTo(y, 3);
        }
      }
    });
  }

  it('widens to keep a generator whose cross reaches the player in frame', () => {
    const state = sandbox();
    const layout = createLayout(state.width, state.height);
    const rig = new CameraRig(layout);
    rig.fit(16 / 9);
    put(state, 0, 1, 1);
    rig.cut();
    rig.update(0, 0, 0, directShot(state, layout, 0, 0, false));
    const calm = rig.currentPose().distance;
    // a long-range generator at the far end of the same row
    addGenerator(state, { ownerId: 1, x: 13, y: 1, range: 12 });
    const shot = directShot(state, layout, 0, 0, false);
    expect(shot.keep.length).toBeGreaterThan(0);
    rig.cut();
    rig.update(0, 0, 0, shot);
    expect(rig.currentPose().distance).toBeGreaterThan(calm);
    for (const x of [1, 13]) {
      const v = project(rig, layout.wx(x), 0, layout.wz(1));
      expect(Math.abs(v.x)).toBeLessThan(1);
      expect(v.y).toBeLessThan(0.8);
    }
  });

  it('moves smoothly: one frame covers only part of a jump between tiles', () => {
    const state = sandbox();
    const layout = createLayout(state.width, state.height);
    const rig = new CameraRig(layout);
    rig.fit(16 / 9);
    put(state, 0, 3, 5);
    rig.cut();
    rig.update(0, 0, 0, directShot(state, layout, 0, 0, false));
    const x0 = rig.currentPose().x;
    put(state, 0, 9, 5);
    rig.update(1 / 60, 0, 0, directShot(state, layout, 0, 0, false));
    const step = rig.currentPose().x - x0;
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(1);
  });
});

describe('camera director', () => {
  it('opens on the whole arena during the countdown, then follows the local player', () => {
    const state = sandbox();
    const layout = createLayout(state.width, state.height);
    state.match.phase = 'countdown';
    state.match.countdownRemaining = state.config.match.countdownTicks;
    expect(directShot(state, layout, 0, 0, false).kind).toBe('overview');
    state.match.countdownRemaining = 10;
    expect(directShot(state, layout, 0, 0, false).kind).toBe('action');
    state.match.phase = 'playing';
    const shot = directShot(state, layout, 0, 0, false);
    const me = state.players[0]!;
    expect(shot.focus).toEqual({ x: layout.wx(me.x), z: layout.wz(me.y) });
  });

  it('honours the overview preference and frames survivors when the local player is out', () => {
    const state = sandbox({ players: 3 });
    const layout = createLayout(state.width, state.height);
    expect(directShot(state, layout, 0, 0, true).kind).toBe('overview');
    state.players[0]!.alive = false;
    const shot = directShot(state, layout, 0, 0, false);
    expect(shot.kind).toBe('action');
    expect(shot.keep).toHaveLength(2);
  });

  it('ends a win on a close-up of the winner', () => {
    const state = sandbox();
    const layout = createLayout(state.width, state.height);
    state.match.phase = 'ended';
    state.match.result = { kind: 'win', winnerId: 1 };
    const shot = directShot(state, layout, 0, 0, false);
    const w = state.players[1]!;
    expect(shot.focus).toEqual({ x: layout.wx(w.x), z: layout.wz(w.y) });
    expect(shot.zoom).toBeLessThan(1);
    state.match.result = { kind: 'draw', reason: 'timeout' };
    expect(directShot(state, layout, 0, 0, false).kind).toBe('overview');
  });

  it("keeps the player's own vehicle in frame while it drives", () => {
    const state = sandbox();
    const layout = createLayout(state.width, state.height);
    put(state, 0, 1, 1);
    state.vehicles.push({
      id: 99,
      ownerId: 0,
      kind: 'danfo',
      route: [
        { x: 13, y: 9 },
        { x: 12, y: 9 },
      ],
      phase: 'driving',
      warnRemaining: 0,
      wreckRemaining: 0,
      hitPlayerIds: [],
      index: 0,
      stepRemaining: 4,
      stepTotal: 8,
      damage: 0,
      slowUntil: 0,
      softBroken: 0,
      playerHits: 0,
      exposedEvents: [],
      eventId: 1,
      startTick: 0,
    });
    expect(directShot(state, layout, 0, 0, false).keep).toEqual([{ x: layout.wx(13), z: layout.wz(9) }]);
  });

  it('ignores generators that cannot reach the player', () => {
    const state = sandbox();
    const layout = createLayout(state.width, state.height);
    put(state, 0, 1, 1);
    addGenerator(state, { ownerId: 1, x: 9, y: 7, range: 2 });
    expect(directShot(state, layout, 0, 0, false).keep).toHaveLength(0);
  });
});

describe('camera modes: standard matches keep the whole arena on one shared screen', () => {
  it('every standard arena uses the fixed whole-arena camera; stadium is opt-in', () => {
    for (const id of ['danfoBusPark', 'balogunMarket', 'lekkiRoadworks']) {
      expect(cameraModeFor(id)).toBe('arena');
      expect(cameraModeFor(id, 'stadium')).toBe('stadium');
    }
  });

  it('arena mode never follows a player or zooms: countdown, play, threats, spectating, entry and results', () => {
    const state = sandbox({ players: 4 });
    const layout = createLayout(state.width, state.height);
    const opts = { preferOverview: false, choosingEntry: false, attract: false };
    const shots = (): unknown[] => [
      selectShot('arena', state, layout, 0, 0, opts),
      selectShot('arena', state, layout, 0, 0.5, { ...opts, choosingEntry: true }),
    ];
    state.match.phase = 'countdown';
    state.match.countdownRemaining = 10;
    expect(shots()).toEqual([null, null]);
    state.match.phase = 'playing';
    addGenerator(state, { ownerId: 1, x: 1, y: 0 });
    expect(shots()).toEqual([null, null]);
    state.players[0]!.alive = false;
    state.players[1]!.alive = false;
    expect(shots()).toEqual([null, null]);
    state.match.phase = 'ended';
    state.match.result = { kind: 'win', winnerId: 2 };
    expect(shots()).toEqual([null, null]);
    // the stadium mode keeps the follow camera
    state.match.phase = 'playing';
    state.players[0]!.alive = true;
    expect(selectShot('stadium', state, layout, 0, 0, opts)?.kind).toBe('action');
  });

  for (const vp of VIEWPORTS) {
    it(`${vp.name}: the fixed camera is a 35-45 degree three-quarter view framing the whole arena`, () => {
      const layout = createLayout(15, 11);
      const rig = new CameraRig(layout);
      rig.fit(vp.w / vp.h, vp.insets);
      rig.update(0, 0, 0, null);
      const pitch = pitchOf(rig);
      expect(pitch).toBeGreaterThanOrEqual(35);
      expect(pitch).toBeLessThanOrEqual(45);
      expect(rig.framesWholeArena()).toBe(true);
      // and it stays there over a long match (no drift towards anybody)
      for (let i = 0; i < 600; i++) rig.update(1 / 60, i / 60, 0, null);
      expect(rig.framesWholeArena()).toBe(true);
    });

    it(`${vp.name}: character-height pillars on the far row and the near row stay inside the band`, () => {
      const layout = createLayout(15, 11);
      const rig = new CameraRig(layout);
      rig.fit(vp.w / vp.h, vp.insets);
      rig.update(0, 0, 0, null);
      for (const x of [1, 7, 13]) {
        for (const y of [1, 9]) {
          // a 1.7 m pillar top (the tallest obstacle style) on the pillar rows nearest each edge
          const top = project(rig, layout.wx(x), 1.7, layout.wz(y) - 0.45);
          expect(Math.abs(top.x)).toBeLessThan(1);
          expect(top.y).toBeLessThan(1 - vp.insets.top * 2);
          expect(top.y).toBeGreaterThan(-1 + vp.insets.bottom * 2);
        }
      }
    });
  }

  it('the whole-arena lens is longer than the follow lens (less perspective blow-up of the near rows)', () => {
    const layout = createLayout(15, 11);
    const rig = new CameraRig(layout);
    rig.fit(16 / 9, { top: 0.1, bottom: 0.05 });
    rig.update(0, 0, 0, null);
    expect(rig.camera.fov).toBeLessThan(36);
    // near-row tiles are drawn at most 40% wider than far-row tiles
    const width = (y: number): number =>
      project(rig, layout.wx(8), 0, layout.wz(y)).x - project(rig, layout.wx(7), 0, layout.wz(y)).x;
    expect(width(10) / width(0)).toBeLessThan(1.4);
  });
});
