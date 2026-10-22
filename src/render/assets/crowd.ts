import { Color, Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { BufferGeometry, Material } from 'three';
import type { Layout } from '../coords';
import { assets } from './library';

/**
 * The Lagos bus-park crowd (visual only). People are instanced from `crowd.glb`, where every
 * spectator exists in two poses (`spec_<name>_<role>_0` calm, `_1` react or second stride frame):
 *
 * - watchers line the platforms and the ground behind the walls, mostly calm (arms folded, phone,
 *   hands on hips, a basin on the head) and flipping to a reaction pose when the match gets loud;
 * - talkers stand in facing pairs and gesture now and then;
 * - walkers stroll along the streets around the lot (two-frame stride flipbook).
 *
 * Each pose is one InstancedMesh, refilled every frame with only the people currently in that pose
 * (so hidden poses cost nothing): one draw call per variant pose, a matrix per person per frame and
 * no skinning.
 */
export interface Crowd {
  group: Group;
  update(time: number, excitement: number): void;
  dispose(): void;
}

type Role = 'watch' | 'talk' | 'walk';

interface Variant {
  role: Role;
  frames: [InstancedMesh, InstancedMesh];
  /** people using this variant (capacity of both pose meshes) */
  count: number;
  /** instances written this frame, per pose */
  filled: [number, number];
}

interface Person {
  variant: Variant;
  tint: Color;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  phase: number;
  /** watchers/talkers: react pose until this time; next decision at `next` */
  reactUntil: number;
  next: number;
  /** walkers: a straight path walked back and forth */
  path: { ax: number; az: number; bx: number; bz: number; speed: number } | null;
}

interface Spot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  role: Role;
  path?: Person['path'];
}

/** Placement of `count` people around the lot (world units), deterministic from `rng`. */
export function crowdSpots(layout: Layout, count: number, rng: () => number): Spot[] {
  const W = layout.width;
  const H = layout.height;
  const platform = assets.has('env_bleacher');
  const spots: Spot[] = [];
  const face = (x: number, z: number): number => Math.atan2(-x, -z * 1.4) + (rng() - 0.5) * 0.45;
  const watch = (x: number, y: number, z: number): void => {
    spots.push({ x, y, z, yaw: face(x, z), role: 'watch' });
  };
  // A point at distance `out` beyond an arena edge, `t` (0..1) along it. 0 north, 1 east, 2 west, 3 south.
  const edgePoint = (edge: number, t: number, out: number): [number, number] => {
    if (edge === 0) return [-W / 2 - 0.4 + t * (W + 0.8), -H / 2 - out];
    if (edge === 1) return [W / 2 + out, -H / 2 + t * (H + 0.4)];
    if (edge === 2) return [-W / 2 - out, -H / 2 + t * (H + 0.4)];
    return [-W / 2 + t * W, H / 2 + out];
  };
  const edgeFor = (n: number): number => [0, 0, 0, 1, 1, 2, 2, 3][n % 8]!;

  const rail = Math.round(count * 0.42);
  const ring = Math.round(count * 0.22);
  const south = Math.round(count * 0.16);
  const walkers = Math.max(0, count - rail - ring - south);
  // 1) front row along the east/west spectator platforms and north sidewalk gaps
  for (let n = 0; n < rail; n++) {
    const edge = edgeFor(n) === 3 ? 0 : edgeFor(n);
    const onSidePlatform = platform && (edge === 1 || edge === 2);
    const [x, z] = edgePoint(edge, rng(), onSidePlatform ? 0.47 + rng() * 0.22 : 0.82 + rng() * 0.35);
    watch(x, onSidePlatform ? 0.62 : 0, z);
  }
  // 2) people standing on the ground behind the platforms, some in conversation pairs
  for (let n = 0; n < ring; n++) {
    const edge = edgeFor(n) === 3 ? 1 + (n % 2) : edgeFor(n);
    const [x, z] = edgePoint(edge, rng(), 1.05 + rng() * 0.28);
    if (rng() < 0.35 && n + 1 < ring) {
      // a facing pair along the edge
      const along = edge === 0 ? [0.34, 0] : [0, 0.34];
      const yaw = Math.atan2(along[0]!, along[1]!);
      spots.push({ x: x - along[0]!, y: 0, z: z - along[1]!, yaw, role: 'talk' });
      spots.push({ x: x + along[0]!, y: 0, z: z + along[1]!, yaw: yaw + Math.PI, role: 'talk' });
      n++;
    } else watch(x, 0, z);
  }
  // 3) camera side: foreground cheering spectators outside the south wall (framing the bottom edge)
  for (let n = 0; n < south; n++) {
    const [rawX, z] = edgePoint(3, rng(), 0.92 + rng() * 0.85);
    const x = Math.abs(rawX) < 1.65 ? rawX + (rawX < 0 ? -1.7 : 1.7) : rawX; // keep the center hazard gate clear
    watch(x, 0, z);
  }
  // 4) passers-by on the streets around the lot
  for (let n = 0; n < walkers; n++) {
    const k = n % 4;
    const speed = 0.55 + rng() * 0.45;
    let path: NonNullable<Person['path']>;
    if (k === 0 || k === 3) {
      const z = k === 0 ? -H / 2 - 3.05 - rng() * 0.25 : H / 2 + 2.3 + rng() * 0.6;
      path = { ax: -W / 2 - 4, az: z, bx: W / 2 + 4, bz: z, speed };
    } else {
      const x = (k === 1 ? 1 : -1) * (W / 2 + 3.55 + rng() * 0.3);
      path = { ax: x, az: -H / 2 - 3, bx: x, bz: H / 2 + 3, speed };
    }
    if (rng() < 0.5) path = { ax: path.bx, az: path.bz, bx: path.ax, bz: path.az, speed };
    spots.push({ x: path.ax, y: 0, z: path.az, yaw: 0, role: 'walk', path });
  }
  return spots;
}

interface Pose {
  name: string;
  role: Role;
  frame: number;
  geometry: BufferGeometry;
  material: Material;
}

export function createGlbCrowd(layout: Layout, count: number, rng: () => number): Crowd | null {
  const parts = assets.parts('crowd');
  if (parts.length === 0) return null;
  // spec_<name>_<role>_<frame>; older single-pose files (spec_<name>) count as calm watchers
  const poses: Pose[] = parts.map((p) => {
    const m = /^spec_(\w+?)_(watch|talk|walk)_(\d)$/.exec(p.name);
    return m
      ? { name: m[1]!, role: m[2] as Role, frame: Number(m[3]), geometry: p.geometry, material: p.material }
      : { name: p.name, role: 'watch', frame: 0, geometry: p.geometry, material: p.material };
  });
  const byName = new Map<string, Pose[]>();
  for (const p of poses) byName.set(p.name, [...(byName.get(p.name) ?? []), p]);
  const spots = crowdSpots(layout, count, rng);
  const pool: Record<Role, string[]> = { watch: [], talk: [], walk: [] };
  for (const [name, list] of byName) pool[list[0]!.role].push(name);
  if (pool.talk.length === 0) pool.talk = pool.watch;
  if (pool.walk.length === 0) pool.walk = pool.watch;

  // choose a variant per person, then size each pose's InstancedMesh
  const choice = spots.map((s, i) => {
    const names = pool[s.role];
    return names[(i * 7 + Math.floor(rng() * names.length)) % names.length]!;
  });
  const group = new Group();
  const variants = new Map<string, Variant>();
  for (const [name, list] of byName) {
    const n = choice.filter((c) => c === name).length;
    if (n === 0) continue;
    const sorted = [...list].sort((a, b) => a.frame - b.frame);
    const mk = (p: Pose): InstancedMesh => {
      const m = new InstancedMesh(p.geometry, p.material, n);
      m.castShadow = false;
      m.receiveShadow = true;
      m.frustumCulled = false;
      group.add(m);
      return m;
    };
    const f0 = mk(sorted[0]!);
    const f1 = sorted[1] ? mk(sorted[1]) : f0;
    variants.set(name, { role: sorted[0]!.role, frames: [f0, f1], count: 0, filled: [0, 0] });
  }
  const people: Person[] = spots.map((s, i) => {
    const variant = variants.get(choice[i]!)!;
    variant.count++;
    const t = 0.84 + rng() * 0.26;
    const tint = new Color(t, t * (0.95 + rng() * 0.08), t * (0.95 + rng() * 0.08));
    return {
      variant,
      tint,
      x: s.x,
      y: s.y,
      z: s.z,
      yaw: s.yaw,
      // proportional to the taller players so the crowd reads as lively 3D spectators
      scale: (s.z > layout.height / 2 ? 0.82 : 0.86) + rng() * 0.08,
      phase: rng() * 100,
      reactUntil: 0,
      next: rng() * 3,
      path: s.path ?? null,
    };
  });

  const mat4 = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const pos = new Vector3();
  const sc = new Vector3();
  // cheap deterministic per-decision random (render-side only)
  let seed = 1234567;
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const update = (time: number, excitement: number): void => {
    for (const v of variants.values()) v.filled = [0, 0];
    for (const p of people) {
      let frame: number;
      let y = p.y;
      let x = p.x;
      let z = p.z;
      let yaw = p.yaw;
      let lean = 0;
      let squash = 1;
      if (p.path) {
        const { ax, az, bx, bz, speed } = p.path;
        const len = Math.hypot(bx - ax, bz - az);
        const d = (time * speed + p.phase * 3) % (len * 2);
        const forward = d < len;
        const k = (forward ? d : len * 2 - d) / len;
        x = ax + (bx - ax) * k;
        z = az + (bz - az) * k;
        yaw = Math.atan2(forward ? bx - ax : ax - bx, forward ? bz - az : az - bz);
        const stride = Math.floor(d / 0.34);
        frame = stride % 2;
        y += Math.abs(Math.sin((d / 0.34) * Math.PI)) * 0.025;
      } else {
        if (time >= p.next) {
          // the louder the match, the more people react; talkers mostly keep talking
          const pReact = (p.variant.role === 'talk' ? 0.08 : 0.1) + excitement * 0.75;
          if (rand() < pReact) p.reactUntil = time + 0.6 + rand() * 1.4;
          p.next = time + 0.8 + rand() * 2.4;
        }
        const reacting = time < p.reactUntil;
        frame = reacting ? 1 : 0;
        const beat = Math.sin(time * (3 + excitement * 3) + p.phase);
        if (reacting) {
          const jump = Math.max(0, beat) * (0.03 + excitement * 0.12);
          y += jump;
          squash = 1 + jump * 0.25;
          lean = beat * 0.03;
        } else {
          // idle life: weight shift, breathing, looking around
          lean = Math.sin(time * 0.7 + p.phase) * 0.02;
          yaw += Math.sin(time * 0.31 + p.phase) * 0.18;
          squash = 1 + Math.sin(time * 1.6 + p.phase) * 0.006;
        }
      }
      e.set(0, yaw, lean);
      q.setFromEuler(e);
      pos.set(x, y, z);
      sc.set(p.scale, p.scale * squash, p.scale);
      mat4.compose(pos, q, sc);
      const v = p.variant;
      const f = v.frames[0] === v.frames[1] ? 0 : frame;
      const slot = v.filled[f]++;
      v.frames[f].setMatrixAt(slot, mat4);
      v.frames[f].setColorAt(slot, p.tint);
    }
    for (const v of variants.values()) {
      for (const f of [0, 1] as const) {
        const m = v.frames[f];
        if (f === 1 && m === v.frames[0]) continue;
        m.count = v.filled[f];
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  };
  update(0, 0);
  return {
    group,
    update,
    dispose() {
      for (const v of variants.values()) {
        v.frames[0].dispose();
        if (v.frames[1] !== v.frames[0]) v.frames[1].dispose();
      }
      for (const p of parts) {
        p.geometry.dispose();
        (p.material as Material).dispose?.();
      }
    },
  };
}
