import { Group } from 'three';
import type { Vehicle } from '../../sim';
import { createVehicleModel } from '../assets/vehicles';
import type { VehicleModel } from '../assets/vehicles';
import { lerpAngle, stepProgress } from './motion';
import type { FrameContext, View } from './types';

interface Visual {
  model: VehicleModel;
  yaw: number;
  smokeAt: number;
  lastPos: { x: number; z: number; y: number };
  wrecked: boolean;
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
        this.group.add(model.root);
        v = { model, yaw: this.targetYaw(veh), smokeAt: 0, lastPos: { x: 0, z: 0, y: 0 }, wrecked: false };
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
      v.model.body.position.y = Math.abs(Math.sin(time * 18)) * (crashing ? 0 : 0.012);
      const spin = veh.phase === 'driving' ? ((dt * 60) / Math.max(4, veh.stepTotal)) * 5 : 0;
      for (const w of v.model.wheels) w.rotation.z -= spin;
      v.lastPos = { x: layout.wx(gx), z: layout.wz(gy), y: 0.5 };
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
        this.group.remove(v.model.root);
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
