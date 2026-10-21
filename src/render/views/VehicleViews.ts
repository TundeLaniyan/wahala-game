import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
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
        this.group.add(model.root, trail);
        v = {
          model,
          trail,
          trailK: 0,
          yaw: this.targetYaw(veh),
          smokeAt: 0,
          lastPos: { x: 0, z: 0, y: 0 },
          wrecked: false,
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
      v.model.root.scale.setScalar(1.12);
      v.model.body.position.y = Math.abs(Math.sin(time * 18)) * (crashing ? 0 : 0.012);
      const spin = veh.phase === 'driving' ? ((dt * 60) / Math.max(4, veh.stepTotal)) * 5 : 0;
      for (const w of v.model.wheels) spinWheel(v.model, w, spin);
      v.lastPos = { x: layout.wx(gx), z: layout.wz(gy), y: 0.5 };
      // speed streaks: longer for faster vehicles, fading in on launch and out when crashing
      const driving = veh.phase === 'driving';
      v.trailK = Math.max(0, Math.min(1, v.trailK + (driving ? dt * 4 : -dt * 3)));
      v.trail.visible = v.trailK > 0.01;
      if (v.trail.visible) {
        const speed = 60 / Math.max(4, veh.stepTotal); // tiles per second
        v.trail.position.copy(v.model.root.position);
        v.trail.rotation.set(0, v.yaw, 0);
        const len = (0.6 + speed * 0.32) * v.trailK;
        v.trail.children.forEach((c, i) => {
          c.scale.x = len * (1 + 0.15 * Math.sin(time * 30 + i * 1.7));
          ((c as Mesh).material as MeshBasicMaterial).opacity = 0.75 * v.trailK;
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
        this.group.remove(v.model.root, v.trail);
        const streak = v.trail.children[0] as Mesh | undefined;
        streak?.geometry.dispose();
        (streak?.material as MeshBasicMaterial | undefined)?.dispose();
        this.visuals.delete(id);
      }
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
