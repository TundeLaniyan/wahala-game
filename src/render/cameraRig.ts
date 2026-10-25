import { MathUtils, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { CameraShot } from './cameraDirector';
import type { Layout } from './coords';
import type { ShakeOffset } from './shake';

/**
 * Two framings share one camera (which one is used is decided by the camera mode, cameraModes.ts):
 *
 * - OVERVIEW: the whole arena fitted inside the HUD-free band, a cinematic three-quarter view at
 *   42 degrees through a longer lens (31 degree vertical FOV): lower than a map view, so pillars,
 *   walls and crates show their height and side faces, but far enough back that the near rows are
 *   not blown up by perspective and the far rows keep their size. This is the fixed camera of every
 *   standard match.
 * - ACTION (stadium mode only): a low, close three-quarter camera (41 degrees above the floor) that follows the
 *   local player with smooth damping, widening only as far as needed to keep incoming danger
 *   (a generator whose cross reaches the player, a vehicle about to pass) on screen. It never
 *   rotates, so up is always north and the controls never change meaning.
 *
 * The camera is purely presentational: it never affects the simulation.
 */
const ACTION_PITCH = MathUtils.degToRad(41);
const OVERVIEW_PITCH = MathUtils.degToRad(42);
/** Vertical FOV of the action (stadium follow) camera and of the whole-arena camera, landscape. */
const FOV = 38;
const OVERVIEW_FOV = 31;
/** Portrait screens widen both lenses by this much so the arena's width still fits. */
const PORTRAIT_FOV_BOOST = 14;
/** Vertical span (world units, in the view plane at the focus) covered by the HUD-free band. */
const ACTION_SPAN = 6.4;
/**
 * World units of scenery the action camera may show beyond the side walls and the south wall. Phones
 * get more, so a player in a corner can still sit clear of the on-screen D-pad and action buttons.
 */
const MARGIN = { side: 1.8, south: 1.1 };
const MARGIN_COMPACT = { side: 3.4, south: 2.2 };
/** Where the focus sits inside the HUD-free band (0 = centre, negative = lower). */
const FOCUS_BAND_Y = -0.12;
/** Damping time constants (seconds). */
const TAU_MOVE = 0.3;
const TAU_ZOOM = 0.55;
const TAU_PITCH = 0.45;
/** Height of the north-street Danfos & storey facades kept above the back wall in the overview. */
const FAR_TOP = 3.1;
/** On phones only the back wall itself (1.6 m panels, 1.85 m piers) must clear the HUD: the board comes first. */
const FAR_TOP_COMPACT = 2.0;
/**
 * Max |NDC x| of the near arena corners in the phone layout. The on-screen controls live in two strips
 * beside the board's near row: the action-button column on the right is `PHONE_CONTROL_STRIP` screen
 * heights wide (styles.css `.actions` in the compact layout: 30vh plus an 8 px gap) and the floating
 * thumbstick's resting ring fits in the same width on the left. In NDC that strip is
 * 2 * strip * height / width = 2 * strip / aspect.
 */
export const PHONE_CONTROL_STRIP = 0.28;
export function compactNearX(aspect: number): number {
  return MathUtils.clamp(1 - (2 * PHONE_CONTROL_STRIP) / aspect, 0.55, 0.76);
}

interface Pose {
  x: number;
  z: number;
  distance: number;
  pitch: number;
  /** vertical field of view, degrees */
  fov: number;
}

export class CameraRig {
  readonly camera = new PerspectiveCamera(FOV, 16 / 9, 0.5, 200);
  private readonly raycaster = new Raycaster();
  private readonly shakeOffset = new Vector3();
  private readonly ground = new Plane(new Vector3(0, 1, 0), 0);
  private insets = { top: 0.1, bottom: 0.06 };
  /** The fitted whole-arena pose. */
  private readonly overview: Pose = { x: 0, z: 0, distance: 20, pitch: OVERVIEW_PITCH, fov: OVERVIEW_FOV };
  /** The current (smoothed) pose and its goal. */
  private readonly pose: Pose = { x: 0, z: 0, distance: 20, pitch: OVERVIEW_PITCH, fov: OVERVIEW_FOV };
  private readonly goal: Pose = { x: 0, z: 0, distance: 20, pitch: OVERVIEW_PITCH, fov: OVERVIEW_FOV };
  private actionFov = FOV;
  private overviewFov = OVERVIEW_FOV;
  private snap = true;
  /** Ground extents of the action view per unit of distance (they scale linearly with it). */
  private unitHalfWidth = 0.6;
  private unitNear = 0.4;
  private actionDistance = 10;
  private margin = MARGIN;
  private readonly v = new Vector3();

  constructor(private readonly layout: Layout) {}

  /** `insets` are the fractions of the screen covered by HUD at the top/bottom (0..0.4). */
  fit(aspect: number, insets = { top: 0.1, bottom: 0.06 }): void {
    const cam = this.camera;
    this.insets = insets;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    this.actionFov = aspect < 1.2 ? FOV + PORTRAIT_FOV_BOOST : FOV;
    this.overviewFov = aspect < 1.2 ? OVERVIEW_FOV + PORTRAIT_FOV_BOOST : OVERVIEW_FOV;
    this.fitOverview(aspect);
    this.setFov(this.actionFov);
    this.margin = insets.top >= 0.12 && aspect > 1.2 ? MARGIN_COMPACT : MARGIN;

    // Action framing: the HUD-free band spans ACTION_SPAN world units at the focus. Narrow
    // (portrait) screens pull back a little so a useful width of the arena stays in view.
    const tanHalf = Math.tan(MathUtils.degToRad(cam.fov) / 2);
    const band = Math.max(0.5, 1 - insets.top - insets.bottom);
    const minWidth = 7.5;
    this.actionDistance = Math.max(ACTION_SPAN / (2 * tanHalf * band), minWidth / (2 * tanHalf * aspect));
    this.actionDistance = Math.min(this.actionDistance, this.overview.distance * 0.8);

    // Ground extents of the action view at distance 1, looking at the origin.
    this.place({ x: 0, z: 0, distance: 1, pitch: ACTION_PITCH, fov: this.actionFov });
    const mid = this.groundAt(0.97, 0);
    const near = this.groundAt(0, -1 + insets.bottom * 2);
    this.unitHalfWidth = mid ? Math.abs(mid.x) : 0.6;
    this.unitNear = near ? near.z : 0.4;

    if (this.snap) Object.assign(this.pose, this.overview);
    this.place(this.pose);
  }

  /** The whole arena (plus the far-side scenery) inside the HUD-free band. */
  private fitOverview(aspect: number): void {
    const cam = this.camera;
    const insets = this.insets;
    const fov = this.overviewFov;
    const W = this.layout.width;
    const H = this.layout.height;
    // Perspective widens the near row. In the short landscape (phone) layout the thumbstick's resting
    // place and the action buttons sit beside the near row, so the near corners are kept between them;
    // the board fills the rest (the scenery above the back wall gives way to it).
    const compact = insets.top >= 0.12 && aspect > 1.2;
    const farTop = compact ? FAR_TOP_COMPACT : FAR_TOP;
    const pts = [
      new Vector3(-W / 2 - 0.35, farTop, -H / 2 - 0.5),
      new Vector3(W / 2 + 0.35, farTop, -H / 2 - 0.5),
      new Vector3(-W / 2 - 0.3, 0, H / 2 + 0.45),
      new Vector3(W / 2 + 0.3, 0, H / 2 + 0.45),
    ];
    const nearX = compact ? compactNearX(aspect) : 0.97;
    const maxX = (p: Vector3): number => (p.z > 0 ? nearX : 0.97);
    const yTop = 1 - insets.top * 2;
    const yBottom = -1 + insets.bottom * 2;
    const v = this.v;
    const pose = (d: number, tz: number): void =>
      this.place({ x: 0, z: tz, distance: d, pitch: OVERVIEW_PITCH, fov });
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
    Object.assign(this.overview, { x: 0, z: centre(hi), distance: hi, pitch: OVERVIEW_PITCH, fov });
  }

  private setFov(fov: number): void {
    if (this.camera.fov === fov) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  /** Points the camera at (x, 0, z) from `distance` away at `pitch` above the floor. */
  private place(p: Pose): void {
    const cam = this.camera;
    this.setFov(p.fov);
    cam.position.set(p.x, Math.sin(p.pitch) * p.distance, p.z + Math.cos(p.pitch) * p.distance);
    cam.lookAt(p.x, 0, p.z);
    cam.updateMatrixWorld(true);
  }

  /** Floor point under an NDC position for the current camera, relative to the look-at point. */
  private groundAt(nx: number, ny: number): Vector3 | null {
    this.raycaster.setFromCamera(new Vector2(nx, ny), this.camera);
    const hit = new Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, hit);
  }

  /** The action-camera goal for a shot (look-at point and distance), clamped to the arena. */
  private actionGoal(shot: CameraShot): Pose {
    const fov = this.actionFov;
    const tanHalf = Math.tan(MathUtils.degToRad(fov) / 2);
    const yTop = 1 - this.insets.top * 2;
    const yBottom = -1 + this.insets.bottom * 2;
    const yFocus = (yTop + yBottom) / 2 + FOCUS_BAND_Y * (yTop - yBottom) * 0.5;
    const lift = (d: number): number => (yFocus * d * tanHalf) / Math.sin(ACTION_PITCH);

    let cx = shot.focus.x + shot.lead.x;
    let cz = shot.focus.z + shot.lead.z;
    let distance = this.actionDistance * shot.zoom;
    if (shot.keep.length > 0) {
      // Frame the focus and every kept point: centre on their bounds, then back off just enough.
      let x0 = cx;
      let x1 = cx;
      let z0 = cz;
      let z1 = cz;
      for (const p of shot.keep) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        z0 = Math.min(z0, p.z);
        z1 = Math.max(z1, p.z);
      }
      x0 -= 0.8;
      x1 += 0.8;
      z0 -= 0.9;
      z1 += 0.7;
      cx = (x0 + x1) / 2;
      cz = (z0 + z1) / 2;
      const corners = [
        [x0, 0, z0],
        [x1, 0, z0],
        [x0, 0, z1],
        [x1, 0, z1],
        [x0, 1.4, z0],
        [x1, 1.4, z0],
      ];
      const fits = (d: number): boolean => {
        this.place({ x: cx, z: cz + lift(d), distance: d, pitch: ACTION_PITCH, fov });
        for (const c of corners) {
          this.v.set(c[0]!, c[1]!, c[2]!).project(this.camera);
          if (Math.abs(this.v.x) > 0.9 || this.v.y > yTop - 0.02 || this.v.y < yBottom + 0.02) return false;
        }
        return true;
      };
      const far = this.overview.distance * 1.1;
      if (!fits(distance)) {
        let lo = distance;
        let hi = far;
        for (let i = 0; i < 16; i++) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) hi = mid;
          else lo = mid;
        }
        distance = hi;
      }
    }
    let x = cx;
    let z = cz + lift(distance);
    if (shot.free) return { x, z, distance, pitch: ACTION_PITCH, fov };
    // Keep the view on the arena: at most a margin of street beyond the side and south walls.
    const W = this.layout.width;
    const H = this.layout.height;
    const sideRoom = Math.max(0, W / 2 + this.margin.side - this.unitHalfWidth * distance);
    x = MathUtils.clamp(x, -sideRoom, sideRoom);
    z = Math.min(z, H / 2 + this.margin.south - this.unitNear * distance);
    z = Math.max(z, -H / 2 - 1);
    return { x, z, distance, pitch: ACTION_PITCH, fov };
  }

  /**
   * Moves the camera towards the shot. `dt` in seconds; `shake` is this frame's bounded camera offset
   * (render/shake.ts; 0 = none). With no shot (or an overview shot) the whole arena is framed. `attract`
   * adds the title-screen drift.
   */
  update(
    dt: number,
    time: number,
    shake: Readonly<ShakeOffset> | 0,
    shot: CameraShot | null = null,
    attract = false,
  ): void {
    const target = shot && shot.kind === 'action' && !attract ? this.actionGoal(shot) : this.overview;
    Object.assign(this.goal, target);
    const p = this.pose;
    if (this.snap) {
      Object.assign(p, this.goal);
      this.snap = false;
    } else {
      const k = (tau: number): number => 1 - Math.exp(-Math.max(0, dt) / tau);
      p.x += (this.goal.x - p.x) * k(TAU_MOVE);
      p.z += (this.goal.z - p.z) * k(TAU_MOVE);
      p.distance += (this.goal.distance - p.distance) * k(TAU_ZOOM);
      p.pitch += (this.goal.pitch - p.pitch) * k(TAU_PITCH);
      p.fov += (this.goal.fov - p.fov) * k(TAU_ZOOM);
    }
    this.place(p);
    // Title-screen demo: a slow cinematic drift (part of the framing, not shake).
    const cam = this.camera;
    if (attract) {
      cam.position.x += Math.sin(time * 0.18) * 1.6;
      cam.position.y += Math.sin(time * 0.11) * 0.6;
      cam.lookAt(p.x, 0, p.z);
    }
    // Shake is a pure translation added last, remembered so picking can take it back out.
    const s = shake === 0 ? null : shake;
    this.shakeOffset.set(s?.x ?? 0, s?.y ?? 0, s?.z ?? 0);
    cam.position.add(this.shakeOffset);
    cam.updateMatrixWorld(true);
  }

  /** The offset the last `update` shook the camera by (zero when none). */
  get currentShake(): Readonly<Vector3> {
    return this.shakeOffset;
  }

  /**
   * Runs `fn` with the camera at its un-shaken pose: touch / mouse picking and the HUD's board corners must
   * never move with the shake (decision WA6).
   */
  private steady<T>(fn: () => T): T {
    if (this.shakeOffset.lengthSq() === 0) return fn();
    const cam = this.camera;
    cam.position.sub(this.shakeOffset);
    cam.updateMatrixWorld(true);
    try {
      return fn();
    } finally {
      cam.position.add(this.shakeOffset);
      cam.updateMatrixWorld(true);
    }
  }

  /**
   * True when every playable tile (floor corners, and a standing character's head on the far row) is
   * inside the HUD-free band of the current camera; in the phone layout the near corners must also
   * stay clear of the on-screen controls.
   */
  framesWholeArena(): boolean {
    return this.steady(() => this.framesWholeArenaNow());
  }

  private framesWholeArenaNow(): boolean {
    const W = this.layout.width;
    const H = this.layout.height;
    const compact = this.insets.top >= 0.12 && this.camera.aspect > 1.2;
    const yTop = 1 - this.insets.top * 2;
    const yBottom = -1 + this.insets.bottom * 2;
    const pts: [number, number, number, number][] = [
      [-W / 2, 0, -H / 2, 1],
      [W / 2, 0, -H / 2, 1],
      [-W / 2, 1.9, -H / 2 + 0.5, 1],
      [W / 2, 1.9, -H / 2 + 0.5, 1],
      [-W / 2, 0, H / 2, compact ? compactNearX(this.camera.aspect) + 0.02 : 1],
      [W / 2, 0, H / 2, compact ? compactNearX(this.camera.aspect) + 0.02 : 1],
    ];
    for (const [x, y, z, maxX] of pts) {
      this.v.set(x, y, z).project(this.camera);
      if (Math.abs(this.v.x) > maxX || this.v.y > yTop + 0.02 || this.v.y < yBottom - 0.02) return false;
    }
    return true;
  }

  /**
   * The playable floor's four corners in normalised device coordinates (far-left, far-right, near-right,
   * near-left), for HUD layout and tests that keep overlays off the board. The far corners are lifted to a
   * standing character's head height, so a far-row player stays clear too.
   */
  boardCornersNdc(): { x: number; y: number }[] {
    return this.steady(() => this.boardCornersNow());
  }

  private boardCornersNow(): { x: number; y: number }[] {
    const W = this.layout.width;
    const H = this.layout.height;
    const pts: [number, number, number][] = [
      [-W / 2, 1.9, -H / 2],
      [W / 2, 1.9, -H / 2],
      [W / 2, 0, H / 2],
      [-W / 2, 0, H / 2],
    ];
    return pts.map(([x, y, z]) => {
      this.v.set(x, y, z).project(this.camera);
      return { x: this.v.x, y: this.v.y };
    });
  }

  /** Jump straight to the goal on the next update (new match). */
  cut(): void {
    this.snap = true;
  }

  /** Debug/tests: the current smoothed pose. */
  currentPose(): Readonly<Pose> {
    return this.pose;
  }

  /** World-space pixel scale for point sprites: pixels per world unit at distance 1. */
  pixelScale(viewportHeight: number): number {
    return (viewportHeight * 0.5) / Math.tan((this.camera.fov * Math.PI) / 360);
  }

  /** Converts a canvas pixel position to a (fractional) grid coordinate on the floor, or null. */
  screenToGrid(px: number, py: number, width: number, height: number): { x: number; y: number } | null {
    return this.steady(() => this.screenToGridNow(px, py, width, height));
  }

  private screenToGridNow(
    px: number,
    py: number,
    width: number,
    height: number,
  ): { x: number; y: number } | null {
    const ndc = new Vector2((px / width) * 2 - 1, -(py / height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return null;
    return { x: hit.x + this.layout.width / 2 - 0.5, y: hit.z + this.layout.height / 2 - 0.5 };
  }
}
