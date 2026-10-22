import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CameraRig } from '../../src/render/cameraRig';
import { createLayout } from '../../src/render/coords';

/**
 * The 3/4 camera is purely presentational: every tile must stay on screen (inside the HUD-free
 * band) and pointer picking must map back to exactly the tile under the cursor.
 */
const VIEWPORTS = [
  { name: 'desktop 16:9', w: 1280, h: 720, insets: { top: 0.1, bottom: 0.05 } },
  { name: 'landscape phone', w: 844, h: 390, insets: { top: 0.13, bottom: 0.03 } },
  { name: 'portrait', w: 390, h: 844, insets: { top: 0.1, bottom: 0.05 } },
];

describe('render camera framing and picking', () => {
  for (const vp of VIEWPORTS) {
    it(`${vp.name}: whole arena visible and screenToGrid round-trips every tile`, () => {
      const layout = createLayout(15, 11);
      const rig = new CameraRig(layout);
      rig.fit(vp.w / vp.h, vp.insets);
      rig.update(0, 0);
      const cam = rig.camera;
      cam.updateMatrixWorld(true);
      const v = new Vector3();
      for (let y = 0; y < layout.height; y++) {
        for (let x = 0; x < layout.width; x++) {
          v.set(layout.wx(x), 0, layout.wz(y)).project(cam);
          expect(Math.abs(v.x)).toBeLessThan(1);
          expect(v.y).toBeLessThan(1 - vp.insets.top * 2 + 1e-6);
          expect(v.y).toBeGreaterThan(-1 + vp.insets.bottom * 2 - 1e-6);
          const px = ((v.x + 1) / 2) * vp.w;
          const py = ((1 - v.y) / 2) * vp.h;
          const g = rig.screenToGrid(px, py, vp.w, vp.h)!;
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
    rig.camera.updateMatrixWorld(true);
    for (const x of [0, layout.width - 1]) {
      const v = new Vector3(layout.wx(x) + Math.sign(layout.wx(x)) * 0.5, 0, layout.wz(layout.height - 1) + 0.5);
      v.project(rig.camera);
      expect(Math.abs(v.x)).toBeLessThan(0.62);
    }
  });

  it('looks down at an elevated three-quarter angle (not top-down)', () => {
    const rig = new CameraRig(createLayout(15, 11));
    rig.fit(16 / 9);
    rig.camera.updateMatrixWorld(true);
    const dir = rig.camera.getWorldDirection(new Vector3());
    const pitchDeg = (Math.asin(-dir.y) * 180) / Math.PI;
    expect(pitchDeg).toBeGreaterThan(40);
    expect(pitchDeg).toBeLessThan(50);
  });
});
