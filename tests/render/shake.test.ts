import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CameraRig } from '../../src/render/cameraRig';
import { createLayout } from '../../src/render/coords';
import {
  SHAKE_CAP,
  SHAKE_FRAME_BUDGET,
  SHAKE_MAX_OFFSET,
  ShakeBudget,
  resolveShakeMode,
} from '../../src/render/shake';

/**
 * Founder A9: no extreme camera shaking. Wahala Crush / the City Rumble closing used to add +0.2 per
 * landed tile (and +0.35 per trap wave) into a 53 Hz jitter, saturating the shake for the whole closing.
 */
describe('camera shake is bounded', () => {
  it('cannot compound: a flood of events every frame stays under the cap, one frame adds at most the budget', () => {
    const s = new ShakeBudget();
    let peak = 0;
    for (let frame = 0; frame < 600; frame++) {
      const before = s.trauma;
      for (let e = 0; e < 40; e++) s.add(0.35); // a whole trap wave + crush tiles + a chain, every frame
      expect(s.trauma - before).toBeLessThanOrEqual(SHAKE_FRAME_BUDGET + 1e-9);
      peak = Math.max(peak, s.trauma);
      s.update(1 / 60);
    }
    expect(peak).toBeLessThanOrEqual(SHAKE_CAP);
  });

  it('the camera offset is a small nudge: never more than SHAKE_MAX_OFFSET (1/20 tile) on any axis', () => {
    const s = new ShakeBudget();
    for (let i = 0; i < 10; i++) s.add(1);
    let max = 0;
    for (let t = 0; t < 2; t += 1 / 240) {
      const o = s.offset(t);
      max = Math.max(max, Math.abs(o.x), Math.abs(o.y), Math.abs(o.z));
    }
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(SHAKE_MAX_OFFSET + 1e-9);
  });

  it('is short: a big jolt is gone in well under half a second', () => {
    const s = new ShakeBudget();
    s.add(1);
    let t = 0;
    while (s.trauma > 0 && t < 2) {
      s.update(1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeLessThan(0.3);
  });

  it("is OFF on touch screens by default, with prefers-reduced-motion, and when set to 'off'", () => {
    const touch = { coarsePointer: true, reducedMotion: false };
    const mouse = { coarsePointer: false, reducedMotion: false };
    const reduced = { coarsePointer: false, reducedMotion: true };
    expect(resolveShakeMode('auto', touch)).toBe('off');
    expect(resolveShakeMode('auto', mouse)).toBe('subtle');
    expect(resolveShakeMode('off', mouse)).toBe('off');
    expect(resolveShakeMode('subtle', touch)).toBe('subtle'); // an explicit choice
    expect(resolveShakeMode('subtle', reduced)).toBe('off');
    const s = new ShakeBudget();
    s.mode = 'off';
    s.add(1);
    for (let t = 0; t < 1; t += 0.01) expect(s.offset(t)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('Wahala Crush landings add no shake at all (renderer)', () => {
    const src = readFileSync('src/render/GameRenderer.ts', 'utf8');
    const crush = src.slice(src.indexOf("case 'crushLanded':"), src.indexOf("case 'trapsActivated':"));
    expect(crush).toContain('crushLanded');
    expect(crush).not.toMatch(/fx\.shake|shaker/);
  });

  it('touch targets never move: picking and the board corners use the un-shaken camera', () => {
    const layout = createLayout(15, 11);
    const rig = new CameraRig(layout);
    rig.fit(844 / 390, { top: 0.13, bottom: 0.03 });
    rig.update(0, 0, 0, null);
    const corners = rig.boardCornersNdc();
    const picks = [
      [100, 200],
      [422, 195],
      [700, 300],
    ].map(([x, y]) => rig.screenToGrid(x!, y!, 844, 390));
    const steady = rig.camera.position.clone();
    rig.update(0, 0, { x: 0.05, y: -0.03, z: 0.05 }, null);
    expect(rig.camera.position.distanceTo(steady)).toBeGreaterThan(0.01); // the picture moved ...
    expect(rig.boardCornersNdc()).toEqual(corners); // ... but the board corners did not
    expect(
      [
        [100, 200],
        [422, 195],
        [700, 300],
      ].map(([x, y]) => rig.screenToGrid(x!, y!, 844, 390)),
    ).toEqual(picks); // ... and neither did any tap
    expect(rig.camera.position.distanceTo(steady)).toBeGreaterThan(0.01); // still shaken for drawing
  });
});
