import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { Layout } from './coords';

const PITCH = (58 * Math.PI) / 180; // elevated, near top-down, fixed
const FOV = 36;

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
    cam.fov = aspect < 1.2 ? FOV + 14 : FOV;
    cam.updateProjectionMatrix();
    const W = this.layout.width;
    const H = this.layout.height;
    const pts = [
      new Vector3(-W / 2 - 0.6, 1.1, -H / 2 - 0.6),
      new Vector3(W / 2 + 0.6, 1.1, -H / 2 - 0.6),
      new Vector3(-W / 2 - 0.6, 0, H / 2 + 0.6),
      new Vector3(W / 2 + 0.6, 0, H / 2 + 0.6),
    ];
    const dir = new Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
    const yTop = 1 - insets.top * 2;
    const yBottom = -1 + insets.bottom * 2;
    const fits = (d: number, tz: number): boolean => {
      this.target.set(0, 0, tz);
      cam.position.copy(this.target).addScaledVector(dir, d);
      cam.lookAt(this.target);
      cam.updateMatrixWorld(true);
      const v = new Vector3();
      for (const p of pts) {
        v.copy(p).project(cam);
        if (Math.abs(v.x) > 0.97 || v.y > yTop || v.y < yBottom) return false;
      }
      return true;
    };
    let lo = 6;
    let hi = 70;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid, 0)) hi = mid;
      else lo = mid;
    }
    this.distance = hi;
    this.target.set(0, 0, 0);
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
