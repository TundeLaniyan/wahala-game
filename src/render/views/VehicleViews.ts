import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
} from 'three';
import type { Vehicle } from '../../sim';
import { createVehicleModel, spinWheel } from '../assets/vehicles';
import type { VehicleModel } from '../assets/vehicles';
import { lerpAngle, stepProgress } from './motion';
import type { FrameContext, View } from './types';

interface Visual {
  model: VehicleModel;
  /** speed streaks trailing a driving vehicle (local -X is behind it) */
  trail: Group;
  trailK: number;
  yaw: number;
  smokeAt: number;
  lastPos: { x: number; z: number; y: number };
  wrecked: boolean;
  /** The generator the vehicle carries (a roof-mounted unit with a lamp): what tells it from scenery traffic. */
  gen: Group;
  lamp: Mesh;
  /** The late warning: a small amber ring on the road under a fusing carrier. */
  ring: Mesh;
}

let genParts: {
  box: BoxGeometry;
  band: CylinderGeometry;
  lamp: CylinderGeometry;
  body: MeshStandardMaterial;
  dark: MeshStandardMaterial;
} | null = null;
let ringParts: { geo: RingGeometry; mat: MeshBasicMaterial } | null = null;

/** A small yellow generator with black bands and a red lamp (shared geometry; one per carrier). */
function createCarriedGenerator(): { gen: Group; lamp: Mesh } {
  genParts ??= {
    box: new BoxGeometry(0.46, 0.26, 0.34),
    band: new CylinderGeometry(0.05, 0.05, 0.36, 6),
    lamp: new CylinderGeometry(0.07, 0.07, 0.07, 8),
    body: new MeshStandardMaterial({ color: 0xe8b020, roughness: 0.55, metalness: 0.3 }),
    dark: new MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7 }),
  };
  const gen = new Group();
  const body = new Mesh(genParts.box, genParts.body);
  body.position.y = 0.13;
  gen.add(body);
  for (const x of [-0.14, 0.14]) {
    const band = new Mesh(genParts.band, genParts.dark);
    band.rotation.x = Math.PI / 2;
    band.position.set(x, 0.27, 0);
    gen.add(band);
  }
  const lamp = new Mesh(genParts.lamp, new MeshBasicMaterial({ color: 0xff3b2a }));
  lamp.position.set(0, 0.31, 0);
  gen.add(lamp);
  return { gen, lamp };
}

function createFuseRing(): Mesh {
  ringParts ??= {
    geo: new RingGeometry(0.62, 0.74, 28),
    mat: new MeshBasicMaterial({
      color: 0xffa23a,
      transparent: true,
      opacity: 0.0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  };
  const ring = new Mesh(ringParts.geo, ringParts.mat.clone());
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 8;
  ring.visible = false;
  return ring;
}

const TRAIL_COLORS: Record<Vehicle['kind'], number> = { danfo: 0xffd23a, taxi: 0xffe58a, keke: 0x9dffb0 };
let streakTex: CanvasTexture | null = null;

/** Soft streak: bright at the vehicle end, fading to nothing behind it and at the edges. */
function streakTexture(): CanvasTexture {
  if (streakTex) return streakTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d')!;
  const along = g.createLinearGradient(0, 0, 128, 0);
  along.addColorStop(0, 'rgba(255,255,255,0)');
  along.addColorStop(0.75, 'rgba(255,255,255,0.55)');
  along.addColorStop(1, 'rgba(255,255,255,0.95)');
  g.fillStyle = along;
  g.fillRect(0, 0, 128, 16);
  g.globalCompositeOperation = 'destination-in';
  const across = g.createLinearGradient(0, 0, 0, 16);
  across.addColorStop(0, 'rgba(0,0,0,0)');
  across.addColorStop(0.5, 'rgba(0,0,0,1)');
  across.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, 128, 16);
  streakTex = new CanvasTexture(c);
  return streakTex;
}

function createTrail(kind: Vehicle['kind']): Group {
  const trail = new Group();
  const geo = new PlaneGeometry(1, 1).translate(-0.5, 0, 0); // extends backwards from the origin
  const mat = new MeshBasicMaterial({
    map: streakTexture(),
    color: TRAIL_COLORS[kind],
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const lanes =
    kind === 'danfo'
      ? [
          [0.42, 0.35, 0.16],
          [-0.42, 0.35, 0.16],
          [0.3, 0.95, 0.12],
          [-0.3, 0.95, 0.12],
          [0, 0.62, 0.22],
        ]
      : [
          [0.3, 0.3, 0.12],
          [-0.3, 0.3, 0.12],
          [0, 0.55, 0.16],
        ];
  for (const [z, y, w] of lanes) {
    const streak = new Mesh(geo, mat);
    streak.rotation.x = -Math.PI / 2 + 0.5; // tilted towards the elevated camera
    streak.position.set(-0.35, y!, z!);
    streak.scale.set(1, w!, 1);
    streak.renderOrder = 7;
    trail.add(streak);
  }
  trail.visible = false;
  return trail;
}

/** Danfo, taxi and Keke in motion. Models face +X; yaw maps travel direction onto that. */
export class VehicleViews implements View {
  readonly group = new Group();
  private readonly visuals = new Map<number, Visual>();

  update(ctx: FrameContext): void {
    const { state, alpha, layout, dt, time, fx } = ctx;
    const live = new Set<number>();
    for (const veh of state.vehicles) {
      if (veh.phase === 'warning') continue;
      live.add(veh.id);
      let v = this.visuals.get(veh.id);
      if (!v) {
        const model = createVehicleModel(veh.kind);
        const trail = createTrail(veh.kind);
        const roofTop = new Box3().setFromObject(model.root).max;
        const { gen, lamp } = createCarriedGenerator();
        gen.position.set(0, roofTop.y, 0);
        model.root.add(gen);
        const ring = createFuseRing();
        this.group.add(model.root, trail, ring);
        v = {
          model,
          trail,
          trailK: 0,
          yaw: this.targetYaw(veh),
          smokeAt: 0,
          lastPos: { x: 0, z: 0, y: 0 },
          wrecked: false,
          gen,
          lamp,
          ring,
        };
        this.visuals.set(veh.id, v);
      }
      const cur = veh.route[veh.index]!;
      const dirVec = this.heading(veh);
      const prev = veh.index > 0 ? veh.route[veh.index - 1]! : { x: cur.x - dirVec.dx, y: cur.y - dirVec.dy };
      const k = veh.phase === 'driving' ? stepProgress(veh.stepRemaining, veh.stepTotal, alpha) : 1;
      const gx = prev.x + (cur.x - prev.x) * k;
      const gy = prev.y + (cur.y - prev.y) * k;
      const target = this.targetYaw(veh);
      v.yaw = lerpAngle(v.yaw, target, Math.min(1, dt * 10));
      const crashing = veh.phase === 'crashing';
      const wobble = crashing
        ? Math.sin(time * 40) * 0.05 * Math.max(0, veh.wreckRemaining / 40)
        : Math.sin(time * 22 + veh.id) * 0.012;
      v.model.root.position.set(layout.wx(gx), 0, layout.wz(gy));
      v.model.root.rotation.set(crashing ? -0.18 : 0, v.yaw, wobble);
      v.model.root.scale.setScalar(1.32);
      v.model.body.position.y = Math.abs(Math.sin(time * 18)) * (crashing ? 0 : 0.016);
      const spin = veh.phase === 'driving' ? ((dt * 60) / Math.max(4, veh.stepTotal)) * 5 : 0;
      for (const w of v.model.wheels) spinWheel(v.model, w, spin);
      v.lastPos = { x: layout.wx(gx), z: layout.wz(gy), y: 0.5 };
      this.fuseVisual(veh, v, ctx, layout.wx(gx), layout.wz(gy));
      // speed streaks: longer for faster vehicles, fading in on launch and out when crashing
      const driving = veh.phase === 'driving';
      v.trailK = Math.max(0, Math.min(1, v.trailK + (driving ? dt * 4 : -dt * 3)));
      v.trail.visible = v.trailK > 0.01;
      if (v.trail.visible) {
        const speed = 60 / Math.max(4, veh.stepTotal); // tiles per second
        v.trail.position.copy(v.model.root.position);
        v.trail.rotation.set(0, v.yaw, 0);
        const len = (0.95 + speed * 0.42) * v.trailK;
        v.trail.children.forEach((c, i) => {
          c.scale.x = len * (1 + 0.15 * Math.sin(time * 30 + i * 1.7));
          ((c as Mesh).material as MeshBasicMaterial).opacity = 0.85 * v.trailK;
        });
      }
      if ((veh.damage > 0 || crashing) && time > v.smokeAt) {
        v.smokeAt = time + 0.08;
        fx.smokePuff(layout.wx(gx), 0.7, layout.wz(gy), 0.5);
      }
      if (veh.phase === 'driving' && time > v.smokeAt + 0.02 && veh.kind === 'danfo') {
        fx.smokePuff(layout.wx(gx) - dirVec.dx * 0.7, 0.15, layout.wz(gy) - dirVec.dy * 0.7, 0.28);
      }
    }
    for (const [id, v] of this.visuals) {
      if (!live.has(id)) {
        this.group.remove(v.model.root, v.trail, v.ring);
        (v.ring.material as MeshBasicMaterial).dispose();
        const streak = v.trail.children[0] as Mesh | undefined;
        streak?.geometry.dispose();
        (streak?.material as MeshBasicMaterial | undefined)?.dispose();
        this.visuals.delete(id);
      }
    }
  }

  /**
   * The late, subtle warning (decision VG1): a fusing carrier stops, its lamp flickers faster and a small amber ring
   * pulses on the road under it; a carrier waiting for its owner to leave the blast pulses slowly. Nothing covers
   * the screen: the ring is about one tile wide.
   */
  private fuseVisual(veh: Vehicle, v: Visual, ctx: FrameContext, wx: number, wz: number): void {
    const { time, state } = ctx;
    const st = veh.payload?.state ?? 'scanning';
    const lamp = v.lamp.material as MeshBasicMaterial;
    const fuseTicks = Math.max(1, state.config.vehicles.fuseTicks);
    let ringOpacity = 0;
    if (st === 'fusing') {
      const left = Math.max(0, Math.min(1, (veh.payload?.fuseRemaining ?? 0) / fuseTicks));
      const rate = 6 + (1 - left) * 18; // Hz: speeds up as the fuse burns down
      const on = Math.sin(time * rate * Math.PI * 2) > 0;
      lamp.color.setHex(on ? 0xff6a3a : 0x5a1410);
      ringOpacity = on ? 0.55 : 0.18;
    } else if (st === 'pending') {
      const slow = 0.5 + 0.5 * Math.sin(time * 4);
      lamp.color.setHex(0xff8a4a);
      ringOpacity = 0.12 + 0.2 * slow;
    } else {
      // scanning: a steady, dim lamp: a carrier is recognisable from the generator on its roof
      lamp.color.setHex(0xff3b2a);
    }
    v.ring.visible = ringOpacity > 0 && veh.phase === 'driving';
    if (v.ring.visible) {
      (v.ring.material as MeshBasicMaterial).opacity = ringOpacity;
      v.ring.position.set(wx, 0.07, wz);
      v.ring.scale.setScalar(1 + 0.12 * Math.sin(time * 12));
    }
  }

  /** Last known world position and body colours of a vehicle, used to spawn wreck debris on destruction. */
  wreckInfo(id: number): { x: number; z: number; y: number; kind: Vehicle['kind'] } | null {
    const v = this.visuals.get(id);
    return v ? { ...v.lastPos, kind: v.model.kind } : null;
  }

  private heading(veh: Vehicle): { dx: number; dy: number } {
    const i = veh.index;
    const next = veh.route[Math.min(veh.route.length - 1, i + 1)]!;
    const cur = veh.route[i]!;
    if (next.x !== cur.x || next.y !== cur.y)
      return { dx: Math.sign(next.x - cur.x), dy: Math.sign(next.y - cur.y) };
    const prev = veh.route[Math.max(0, i - 1)]!;
    if (prev.x !== cur.x || prev.y !== cur.y)
      return { dx: Math.sign(cur.x - prev.x), dy: Math.sign(cur.y - prev.y) };
    const first = veh.route[0]!;
    const second = veh.route[1] ?? first;
    return { dx: Math.sign(second.x - first.x), dy: Math.sign(second.y - first.y) };
  }

  private targetYaw(veh: Vehicle): number {
    // Look at where the vehicle is going once a step has started (smooth Keke turns).
    const i = Math.max(0, veh.index);
    const cur = veh.route[i]!;
    const prev = i > 0 ? veh.route[i - 1]! : null;
    let dx: number;
    let dy: number;
    if (prev && (prev.x !== cur.x || prev.y !== cur.y)) {
      dx = cur.x - prev.x;
      dy = cur.y - prev.y;
    } else {
      const h = this.heading(veh);
      dx = h.dx;
      dy = h.dy;
    }
    // Model faces +X in the XZ plane; +Z (grid +y) needs yaw of -PI/2.
    return Math.atan2(-dy, dx);
  }

  dispose(): void {
    this.visuals.clear();
  }
}
