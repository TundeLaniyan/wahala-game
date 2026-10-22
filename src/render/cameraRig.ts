import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { Layout } from './coords';

// Cinematic three-quarter action view (~43 degrees): low enough that characters, Danfo buses,
// pillars and Lagos storey buildings have strong 3D depth and vertical presence, while keeping
// every lane and intersection readable.
const PITCH = (43 * Math.PI) / 180;
const FOV = 40;
/** Height of the north-street Danfos & storey facades framed above the back wall. */
const FAR_TOP = 3.1;
/** Max |NDC x| of the near arena corners in the phone layout (clear of the touch controls). */
const NEAR_X_COMPACT = 0.59;

/**
 * Fixed elevated camera. It never pans or follows action: it is fitted once per viewport size so
 * the whole grid and its danger lanes are always visible (Bible section 12).
 */
export class CameraRig {
  readonly camera = new PerspectiveCamera(FOV, 16 / 9, 0.5, 200);
  private readonly target = new Vector3();
  private distance = 20;
  private readonly basePos = new Vector3();
  private readonly raycaster = new Raycaster();
  private readonly ground = new Plane(new Vector3(0, 1, 0), 0);

  constructor(private readonly layout: Layout) {}

  /** `insets` are the fractions of the screen covered by HUD at the top/bottom (0..0.4). */
  fit(aspect: number, insets = { top: 0.1, bottom: 0.06 }): void {
    const cam = this.camera;
    cam.aspect = aspect;
    cam.fov = aspect < 1.2 ? FOV + 12 : FOV;
    cam.updateProjectionMatrix();
    const W = this.layout.width;
    const H = this.layout.height;
    const pts = [
      new Vector3(-W / 2 - 0.35, FAR_TOP, -H / 2 - 0.5),
      new Vector3(W / 2 + 0.35, FAR_TOP, -H / 2 - 0.5),
      new Vector3(-W / 2 - 0.3, 0, H / 2 + 0.45),
      new Vector3(W / 2 + 0.3, 0, H / 2 + 0.45),
    ];
    // Perspective widens the near row. In the short landscape (phone) layout the on-screen D-pad and
    // action buttons sit in the bottom corners, so the near corners are kept inside them.
    const compact = insets.top >= 0.12;
    const nearX = compact ? NEAR_X_COMPACT : 0.97;
    const maxX = (p: Vector3): number => (p.z > 0 ? nearX : 0.97);
    const dir = new Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
    const yTop = 1 - insets.top * 2;
    const yBottom = -1 + insets.bottom * 2;
    const v = new Vector3();
    const pose = (d: number, tz: number): void => {
      this.target.set(0, 0, tz);
      cam.position.copy(this.target).addScaledVector(dir, d);
      cam.lookAt(this.target);
      cam.updateMatrixWorld(true);
    };
    /** Signed vertical imbalance of the framed arena inside the HUD-free band (0 = centred). */
    const imbalance = (d: number, tz: number): number => {
      pose(d, tz);
      let top = -Infinity;
      let bottom = Infinity;
      for (const p of pts) {
        v.copy(p).project(cam);
        top = Math.max(top, v.y);
        bottom = Math.min(bottom, v.y);
      }
      return top - yTop - (yBottom - bottom);
    };
    // With strong perspective the far edge shrinks, so the look-at point is re-centred for each
    // distance (bisection on the imbalance, which grows monotonically with tz).
    const centre = (d: number): number => {
      let a = -H / 2;
      let b = H / 2;
      for (let i = 0; i < 24; i++) {
        const mid = (a + b) / 2;
        if (imbalance(d, mid) > 0) b = mid;
        else a = mid;
      }
      return (a + b) / 2;
    };
    const fits = (d: number): boolean => {
      pose(d, centre(d));
      for (const p of pts) {
        v.copy(p).project(cam);
        if (Math.abs(v.x) > maxX(p) || v.y > yTop + 1e-4 || v.y < yBottom - 1e-4) return false;
      }
      return true;
    };
    let lo = 6;
    let hi = 70;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    this.distance = hi;
    this.target.set(0, 0, centre(hi));
    this.basePos.copy(this.target).addScaledVector(dir, this.distance);
    cam.position.copy(this.basePos);
    cam.lookAt(this.target);
  }

  update(shake: number, time: number, attract = false): void {
    const s = shake * shake * 0.35;
    // Title-screen demo: a slow cinematic drift (the gameplay camera is always static).
    const dx = attract ? Math.sin(time * 0.18) * 1.6 : 0;
    const dy = attract ? Math.sin(time * 0.11) * 0.6 : 0;
    this.camera.position.set(
      this.basePos.x + dx + Math.sin(time * 53) * s,
      this.basePos.y + dy + Math.cos(time * 47) * s * 0.6,
      this.basePos.z + Math.sin(time * 41) * s,
    );
    if (attract) this.camera.lookAt(this.target);
  }

  /** World-space pixel scale for point sprites: pixels per world unit at distance 1. */
  pixelScale(viewportHeight: number): number {
    return (viewportHeight * 0.5) / Math.tan((this.camera.fov * Math.PI) / 360);
  }

  /** Converts a canvas pixel position to a (fractional) grid coordinate on the floor, or null. */
  screenToGrid(px: number, py: number, width: number, height: number): { x: number; y: number } | null {
    const ndc = new Vector2((px / width) * 2 - 1, -(py / height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return null;
    return { x: hit.x + this.layout.width / 2 - 0.5, y: hit.z + this.layout.height / 2 - 0.5 };
  }
}
