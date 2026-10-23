import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CameraRig } from '../src/render/cameraRig';
import { directShot, isLargeBoard } from '../src/render/cameraDirector';
import { cameraModeFor, selectShot } from '../src/render/cameraModes';
import { createLayout } from '../src/render/coords';
import { CITY_RUMBLE_ID, STANDARD_ARENA_IDS } from '../src/sim';
import { addGenerator, put, sandbox } from './helpers';

/**
 * City Rumble uses the stadium (follow) camera: it rides along with the local player (or, once they are
 * out, with the survivor being watched), keeps nearby rivals and incoming danger in view, and never pulls
 * out to frame the whole 41 x 31 city. Standard arenas keep the fixed whole-arena camera.
 */
describe('City Rumble follow camera', () => {
  it('City Rumble alone uses the follow camera', () => {
    expect(cameraModeFor(CITY_RUMBLE_ID)).toBe('stadium');
    for (const id of STANDARD_ARENA_IDS) expect(cameraModeFor(id)).toBe('arena');
  });

  it('follows the local player a little wider than the standard action camera; far danger is clamped close', () => {
    const s = sandbox({ players: 8, arenaId: CITY_RUMBLE_ID });
    const layout = createLayout(s.width, s.height);
    expect(isLargeBoard(s)).toBe(true);
    put(s, 0, 20, 15);
    put(s, 1, 22, 16); // a rival 3 tiles away
    addGenerator(s, { ownerId: 2, x: 28, y: 15, range: 8 }); // its cross reaches me from 8 tiles
    const shot = directShot(s, layout, 0, 0, false);
    expect(shot.kind).toBe('action');
    expect(shot.focus).toEqual({ x: layout.wx(20), z: layout.wz(15) });
    expect(shot.zoom).toBeGreaterThan(1);
    expect(shot.keep).toContainEqual({ x: layout.wx(22), z: layout.wz(16) });
    for (const k of shot.keep) {
      expect(Math.abs(k.x - shot.focus.x)).toBeLessThanOrEqual(7);
      expect(Math.abs(k.z - shot.focus.z)).toBeLessThanOrEqual(5);
    }
  });

  it('spectating rides with the watched survivor; with nobody to watch it shows the city', () => {
    const s = sandbox({ players: 8, arenaId: CITY_RUMBLE_ID });
    const layout = createLayout(s.width, s.height);
    s.players[0]!.alive = false;
    put(s, 5, 30, 20);
    const shot = selectShot('stadium', s, layout, 0, 0, {
      preferOverview: false,
      choosingEntry: false,
      attract: false,
      focusId: 5,
    })!;
    expect(shot.kind).toBe('action');
    expect(shot.focus).toEqual({ x: layout.wx(30), z: layout.wz(20) });
    // never "frame every survivor" on a 41 x 31 board: that would be the whole city
    expect(directShot(s, layout, 0, 0, false, null).kind).toBe('overview');
  });

  it('the rig stays close: the follow shot is a fraction of the whole-city distance on desktop and phone', () => {
    const s = sandbox({ players: 32, arenaId: CITY_RUMBLE_ID });
    const layout = createLayout(s.width, s.height);
    for (const [aspect, insets] of [
      [1280 / 720, { top: 0.1, bottom: 0.05 }],
      [844 / 390, { top: 0.13, bottom: 0.03 }],
    ] as const) {
      const rig = new CameraRig(layout);
      rig.fit(aspect, insets);
      rig.update(0, 0, 0, null);
      const city = rig.currentPose().distance;
      for (const [x, y] of [
        [20, 15],
        [2, 2],
        [38, 28],
      ] as const) {
        put(s, 0, x, y);
        rig.cut();
        rig.update(0, 0, 0, directShot(s, layout, 0, 0, false));
        expect(rig.currentPose().distance).toBeLessThan(city * 0.45);
        // the followed player is on screen inside the HUD-free band
        const v = new Vector3(layout.wx(x), 0.9, layout.wz(y)).project(rig.camera);
        expect(Math.abs(v.x)).toBeLessThan(0.95);
        expect(v.y).toBeLessThan(1 - insets.top * 2);
        expect(v.y).toBeGreaterThan(-1 + insets.bottom * 2);
      }
    }
  });
});

describe('City Rumble set dressing data', () => {
  it('finds the twelve districts and the ten 3 x 3 buildings (none in the open core)', async () => {
    const { rumbleBlocks, districtOf } = await import('../src/render/arenas/rumble');
    const { buildingCentres } = await import('../src/render/arenas/rumbleSet');
    const { getArena } = await import('../src/sim');
    const layout = getArena(CITY_RUMBLE_ID).layout;
    const blocks = rumbleBlocks(layout);
    expect(blocks).toHaveLength(12);
    expect(new Set(blocks.map((_, i) => districtOf(i))).size).toBe(4);
    for (const [x0, y0, x1, y1] of blocks) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) expect(layout[y]![x]).not.toBe('=');
    }
    const b = buildingCentres(layout);
    expect(b).toHaveLength(10);
    for (const c of b) expect(Math.abs(c.x - 20) >= 8 || Math.abs(c.y - 15) >= 6).toBe(true);
  });
});
