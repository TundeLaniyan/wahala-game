/**
 * Ambient traffic: instanced vehicles driving authored routes OUTSIDE the board (a flyover deck, the
 * approach roads beyond the walls). Presentation only and deliberately NOT a stage hazard or an attack
 * vehicle:
 *
 *  - it has no simulation counterpart: nothing here can hit, block or credit anyone;
 *  - it never draws on a board tile (the route plan is validated against the board rectangle);
 *  - it wears none of the telegraph language: no warning lights, no hazard colours, no headlight beams,
 *    and its materials are its own muted clones, never the ones the attack vehicles (`VehicleViews`) or
 *    the stage-hazard vehicles (`StageHazardViews`) use.
 *
 * Positions are a pure function of the plan and the render clock (`vehicleAt`), so a frame is
 * reproducible. Each vehicle model costs one draw call per material (about eight): the parts of a model
 * are merged by material and every vehicle of that model is one instance.
 */
import {
  Color,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import type { BufferGeometry, Material, MeshStandardMaterial, Mesh } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEHICLE_SCALE, STREET } from '../arenas/common';
import { assets } from '../assets/library';
import { createVehicleModel } from '../assets/vehicles';
import { VEHICLE_DIMS, vehicleAt } from './plan';
import type { PlannedVehicle, TrafficPlan, VehicleModelId } from './plan';

export interface TrafficOptions {
  cols: number;
  rows: number;
  /** Vehicles cast shadows (high quality only: shadow casters are drawn twice). */
  castShadow: boolean;
  /** Reduced motion: traffic crawls at 40 % speed. */
  reducedMotion: boolean;
  /** Called a few times a second per vehicle with a world position and drift: tailpipe puffs (optional). */
  exhaust?: (x: number, y: number, z: number, vx: number, vz: number, diesel: boolean) => void;
}

interface Part {
  geometry: BufferGeometry;
  material: Material;
}

/** Procedural vehicles face +X; the library's models face +Z (the instancing convention here). */
const FACE_Z = new Matrix4().makeRotationY(-Math.PI / 2);

/** The model's parts with node transforms baked in, facing +Z, from the GLB or the procedural fallback. */
function modelParts(model: VehicleModelId): Part[] {
  const glb = assets.parts(`veh_${model}`);
  if (glb.length > 0) return glb.map((p) => ({ geometry: p.geometry, material: p.material }));
  const built = createVehicleModel(model === 'taxi' ? 'taxi' : model === 'keke' ? 'keke' : 'danfo');
  built.root.updateMatrixWorld(true);
  const out: Part[] = [];
  built.root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    g.applyMatrix4(FACE_Z);
    out.push({ geometry: g, material: Array.isArray(m.material) ? m.material[0]! : m.material });
  });
  return out;
}

/** position + normal + uv only, non-indexed: the common ground for merging parts of one material. */
function plain(g: BufferGeometry): BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(out.attributes))
    if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv)
    out.setAttribute(
      'uv',
      new Float32BufferAttribute(new Float32Array(out.attributes.position!.count * 2), 2),
    );
  return out;
}

/**
 * The model as a few merged geometries, one per material, with the material cloned into this module's
 * own muted copy (lamps dimmed so nothing reads as a warning light, grit flag reset so the weathering
 * pass patches the clone).
 */
export function buildModel(model: VehicleModelId): { geometry: BufferGeometry; material: Material }[] {
  const groups = new Map<Material, BufferGeometry[]>();
  for (const p of modelParts(model)) {
    const list = groups.get(p.material) ?? [];
    list.push(plain(p.geometry));
    groups.set(p.material, list);
  }
  const out: { geometry: BufferGeometry; material: Material }[] = [];
  for (const [material, list] of groups) {
    const geometry = list.length === 1 ? list[0]! : mergeGeometries(list, false);
    if (!geometry) continue;
    const own = material.clone() as MeshStandardMaterial;
    own.userData = { gritPatched: false, ambientTraffic: true };
    if (own.emissive && own.emissiveIntensity > 0)
      own.emissiveIntensity = Math.min(own.emissiveIntensity, 0.2);
    out.push({ geometry, material: own });
  }
  return out;
}

interface ModelSet {
  id: VehicleModelId;
  meshes: InstancedMesh[];
  vehicles: PlannedVehicle[];
  geometries: BufferGeometry[];
  materials: Material[];
}

export class AmbientTraffic {
  readonly group = new Group();
  private readonly sets: ModelSet[] = [];
  private readonly routes = new Map<string, TrafficPlan['routes'][number]>();
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly puffAt: number[] = [];
  private lastTime = 0;

  constructor(
    private readonly plan: TrafficPlan,
    private readonly opts: TrafficOptions,
  ) {
    this.group.name = 'ambientTraffic';
    this.group.userData.grit = 'vehicle';
    this.group.userData.ambientTraffic = true;
    for (const r of plan.routes) this.routes.set(r.def.id, r);
    for (const id of plan.models) {
      const vehicles = plan.vehicles.filter((v) => v.model === id);
      if (vehicles.length === 0) continue;
      const set: ModelSet = { id, meshes: [], vehicles, geometries: [], materials: [] };
      for (const part of buildModel(id)) {
        const im = new InstancedMesh(part.geometry, part.material, vehicles.length);
        im.castShadow = opts.castShadow;
        im.receiveShadow = false;
        im.frustumCulled = false; // instances move far from the model origin
        im.userData.ambientTraffic = true;
        vehicles.forEach((v, n) => im.setColorAt(n, this.tintOf(v)));
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        set.meshes.push(im);
        set.geometries.push(part.geometry);
        set.materials.push(part.material);
        this.group.add(im);
      }
      this.sets.push(set);
    }
    this.puffAt = plan.vehicles.map((_, i) => (i * 0.37) % 1);
    this.update(0, 0);
  }

  /** Muted grade per kind and a little variation per vehicle (buses redder and duller than Danfos). */
  private tintOf(v: PlannedVehicle): Color {
    const d = VEHICLE_DIMS[v.kind];
    const k = d.tint * (0.9 + 0.2 * v.shade);
    const c = new Color(k, k, k);
    if (v.kind === 'bus') c.setRGB(k * 1.05, k * 0.78, k * 0.72);
    else if (v.kind === 'truck') c.setRGB(k * 0.85, k * 0.95, k);
    return c;
  }

  /** Number of vehicles drawn (all instances of all models). */
  get count(): number {
    return this.plan.vehicles.length;
  }

  /** World-space position of each vehicle at `time`: used by the update and by tests. */
  positions(time: number): { x: number; y: number; z: number; kind: string; scale: number }[] {
    const speed = this.opts.reducedMotion ? 0.4 : 1;
    const { cols, rows } = this.opts;
    return this.plan.vehicles.map((v) => {
      const route = this.routes.get(v.routeId)!;
      const st = vehicleAt(route, v, time, speed);
      return {
        x: st.x - cols / 2,
        y: STREET + (route.def.elevation ?? 0),
        z: st.y - rows / 2,
        kind: v.kind,
        scale: st.scale,
      };
    });
  }

  /**
   * Moves every vehicle to its place at `time`. With `visible` (follow camera) a model whose vehicles are all
   * out of view is not drawn at all.
   */
  update(time: number, dt: number, visible?: (x: number, z: number, radius: number) => boolean): void {
    const speed = this.opts.reducedMotion ? 0.4 : 1;
    const { cols, rows } = this.opts;
    let all = 0;
    for (const set of this.sets) {
      let seen = !visible;
      set.vehicles.forEach((v, n) => {
        const route = this.routes.get(v.routeId)!;
        const st = vehicleAt(route, v, time, speed);
        const d = VEHICLE_DIMS[v.kind];
        const x = st.x - cols / 2;
        const z = st.y - rows / 2;
        const y = STREET + (route.def.elevation ?? 0);
        if (visible && !seen && visible(x, z, 4 + (route.def.elevation ?? 0))) seen = true;
        // a faint road shudder, different per vehicle
        const roll = Math.sin(time * 17 + v.phase) * 0.008;
        this.q.setFromEuler(this.e.set(0, st.heading, roll, 'YXZ'));
        const k = VEHICLE_SCALE * Math.max(0.001, st.scale);
        this.m4.compose(
          this.p.set(x, y, z),
          this.q,
          this.s.set(k * d.stretch[0], k * d.stretch[1], k * d.stretch[2]),
        );
        for (const im of set.meshes) im.setMatrixAt(n, this.m4);
        if (this.opts.exhaust && st.scale > 0.9) {
          const i = all;
          this.puffAt[i] = (this.puffAt[i] ?? 0) + dt * (v.kind === 'okada' ? 3 : 2.4);
          if (this.puffAt[i]! >= 1) {
            this.puffAt[i] = 0;
            const back = -d.length * 0.5;
            const bx = x + Math.sin(st.heading) * back;
            const bz = z + Math.cos(st.heading) * back;
            this.opts.exhaust(
              bx,
              y + 0.28,
              bz,
              -Math.sin(st.heading) * 0.8,
              -Math.cos(st.heading) * 0.8,
              v.kind !== 'okada',
            );
          }
        }
        all++;
      });
      for (const im of set.meshes) {
        im.instanceMatrix.needsUpdate = true;
        im.visible = seen;
      }
    }
    this.lastTime = time;
  }

  /** The clock of the last update (tests). */
  get time(): number {
    return this.lastTime;
  }

  /** Draw calls this module adds (one per instanced part). */
  get drawCalls(): number {
    return this.sets.reduce((n, s) => n + s.meshes.length, 0);
  }

  dispose(): void {
    for (const set of this.sets) {
      for (const im of set.meshes) {
        this.group.remove(im);
        im.dispose();
      }
      for (const g of set.geometries) g.dispose();
      for (const m of set.materials) m.dispose();
    }
    this.sets.length = 0;
  }
}
