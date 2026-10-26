/**
 * Protected off-board crowds for a living stage environment (presentation only).
 *
 * A zone is a rectangle outside the board where bystanders live: people waiting at a stop, traders,
 * touts, labourers, onlookers. Each zone's people are placed by the pure plan (`planCrowd`) and drawn
 * two ways under one budget:
 *
 *  - RIGS (a few): real skinned, animated characters run by `StreetLife` (conductor / seller / worker /
 *    onlooker scripts), dressed in worn muted clothes, smaller than the cast;
 *  - FIGURES (the rest): instanced two-pose people from `crowd.glb` (a procedural silhouette when the
 *    file is missing), one draw call per pose, animated by matrix only.
 *
 * Both answer SimEvents (a big blast near the edge, an elimination, a lethal stage warning) with a
 * short reaction: duck, flinch, scatter a few steps, cheer or look. Reactions only move the drawn
 * offset, bounded by the zone, and then walk home. These people are never simulation entities: they
 * cannot be hit, block anything or credit a kill, and nothing they do flows back into the game.
 *
 * Distinct from the fighters by construction: no team colours, outfits, markers or name tags; a muted,
 * darkened palette; a smaller scale.
 */
import {
  BoxGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STREET } from '../arenas/common';
import { assets } from '../assets/library';
import { MAX_FIGURE_VARIANTS, REACTION_SECONDS, reacts, rngFor, ruleFor, scatterTarget } from '../env/plan';
import type { CrowdPlan, PlannedPerson, PlannedZone, Stimulus } from '../env/plan';
import type { NpcReaction, ReactionRules } from '../env/types';
import { StreetLife } from './StreetLife';
import type { WorldBounds } from './StreetLife';

type Role = 'watch' | 'talk' | 'walk';
const WHITE = new Color(1, 1, 1);

const ROLE_OF_MOOD = { waiting: 'watch', watching: 'watch', trading: 'talk', working: 'walk' } as const;
/** Worn, muted tints for the instanced figures (multiplied into the pose atlas). */
const TINTS = [0x8a8068, 0x6c6c68, 0x86563c, 0x5c6240, 0x48505e, 0x9c9482, 0x6a5240, 0x6a3a3c];

export interface CrowdOptions {
  cols: number;
  rows: number;
  seed: number;
  reducedMotion: boolean;
  /** Default reaction rules (zones may override). */
  rules?: ReactionRules;
  /** Rigs cast shadows (only where the budget pays for the second pass). */
  rigShadows: boolean;
  /** A small dust puff (world x, y, z) where someone scatters (optional). */
  puff?: (x: number, y: number, z: number) => void;
}

interface Pose {
  geometry: BufferGeometry;
  material: Material;
}

interface Variant {
  role: Role;
  frames: [InstancedMesh, InstancedMesh];
  geometries: BufferGeometry[];
  material: Material;
  count: number;
  filled: [number, number];
}

interface Figure {
  variant: Variant;
  zone: PlannedZone;
  person: PlannedPerson;
  tint: Color;
  scale: number;
  phase: number;
  y: number;
  next: number;
  altUntil: number;
  /** Where the figure was last drawn (tile units) and which pose. */
  dx: number;
  dy: number;
  pose: 0 | 1;
  react: { kind: NpcReaction; t0: number; until: number; tx: number; ty: number; look: number } | null;
}

// ------------------------------------------------------------------------------------ figure meshes

function paint(g: BufferGeometry, r: number, gr: number, b: number): BufferGeometry {
  const n = g.attributes.position!.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([r, gr, b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(c, 3));
  return g;
}

/** A plain standing person (the fallback when `crowd.glb` is missing); `armsUp` is the reaction pose. */
export function proceduralFigure(armsUp: boolean): BufferGeometry {
  const at = (g: BufferGeometry, x: number, y: number, z: number): BufferGeometry => g.translate(x, y, z);
  const parts = [
    paint(at(new BoxGeometry(0.36, 0.62, 0.22), 0, 1.0, 0), 0.82, 0.8, 0.76), // torso (tinted per person)
    paint(at(new BoxGeometry(0.15, 0.7, 0.17), -0.1, 0.35, 0), 0.32, 0.3, 0.3), // legs
    paint(at(new BoxGeometry(0.15, 0.7, 0.17), 0.1, 0.35, 0), 0.32, 0.3, 0.3),
    paint(at(new SphereGeometry(0.12, 8, 6), 0, 1.45, 0), 0.5, 0.36, 0.28), // head
  ];
  const armY = armsUp ? 1.34 : 0.98;
  const armH = armsUp ? 0.5 : 0.56;
  parts.push(paint(at(new BoxGeometry(0.1, armH, 0.1), -0.25, armY, 0), 0.82, 0.8, 0.76));
  parts.push(paint(at(new BoxGeometry(0.1, armH, 0.1), 0.25, armY, 0), 0.82, 0.8, 0.76));
  return mergeGeometries(parts, false)!;
}

/** The pose pairs (calm, reacting) per role: from `crowd.glb`, else the procedural silhouette. */
function poseSets(): Map<Role, { name: string; frames: [Pose, Pose] }[]> {
  const out = new Map<Role, { name: string; frames: [Pose, Pose] }[]>();
  const parts = assets.parts('crowd');
  const byName = new Map<
    string,
    { role: Role; frame: number; geometry: BufferGeometry; material: Material }[]
  >();
  for (const p of parts) {
    const m = /^spec_(\w+?)_(watch|talk|walk)_(\d)$/.exec(p.name);
    if (!m) continue;
    const list = byName.get(m[1]!) ?? [];
    list.push({ role: m[2] as Role, frame: Number(m[3]), geometry: p.geometry, material: p.material });
    byName.set(m[1]!, list);
  }
  for (const [name, list] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...list].sort((a, b) => a.frame - b.frame);
    const a = sorted[0]!;
    const b = sorted[1] ?? a;
    const roleList = out.get(a.role) ?? [];
    roleList.push({ name, frames: [a, b] });
    out.set(a.role, roleList);
  }
  if (out.size === 0) {
    const calm: Pose = {
      geometry: proceduralFigure(false),
      material: new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    };
    const up: Pose = { geometry: proceduralFigure(true), material: calm.material };
    for (const role of ['watch', 'talk', 'walk'] as const)
      out.set(role, [{ name: `procedural_${role}`, frames: [calm, up] }]);
  }
  return out;
}

// ------------------------------------------------------------------------------------------ the crowd

export class CrowdZones {
  readonly group = new Group();
  private readonly life: StreetLife;
  private readonly figures: Figure[] = [];
  private readonly variants: Variant[] = [];
  private readonly rand: () => number;
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private rigCount = 0;

  constructor(
    private readonly plan: CrowdPlan,
    private readonly opts: CrowdOptions,
  ) {
    this.group.name = 'crowdZones';
    this.group.userData.grit = 'crowd';
    this.rand = rngFor(opts.seed, 'crowd:react');
    this.life = new StreetLife(Math.max(0, plan.rigs), opts.seed ^ 0x5eed, {
      scale: [0.8, 0.9],
      darken: 0.8,
      castShadow: opts.rigShadows,
    });
    this.group.add(this.life.group);
    this.populate();
    this.update(0, 0, 0); // first frame: matrices and instance colours exist from the start
  }

  private world(zone: PlannedZone): WorldBounds {
    const { cols, rows } = this.opts;
    const r = zone.def.rect;
    return { x0: r.x0 - cols / 2, z0: r.y0 - rows / 2, x1: r.x1 - cols / 2, z1: r.y1 - rows / 2 };
  }

  private populate(): void {
    const { cols, rows } = this.opts;
    const figuresNeeded: { zone: PlannedZone; person: PlannedPerson }[] = [];
    const rigged = new Set<string>();
    for (const zone of this.plan.zones) {
      const bounds = this.world(zone);
      const y = STREET + (zone.def.elevation ?? 0);
      for (const person of zone.people) {
        const key = `${zone.def.id}:${person.index}`;
        if (person.rig && !rigged.has(key))
          this.addRig(zone, person, { x: person.x - cols / 2, z: person.y - rows / 2, y, bounds }, rigged);
        if (!rigged.has(key)) figuresNeeded.push({ zone, person: { ...person, rig: false } });
      }
    }
    this.rigCount = this.life.count;
    this.buildFigures(figuresNeeded);
  }

  /**
   * One scripted rig (or a trading pair) for a planned person. Everyone it managed to create is added to
   * `rigged`; whoever is not (no model loaded, budget used) is drawn as an instanced figure instead.
   */
  private addRig(
    zone: PlannedZone,
    person: PlannedPerson,
    at: { x: number; z: number; y: number; bounds: WorldBounds },
    rigged: Set<string>,
  ): void {
    const { cols, rows } = this.opts;
    const base = { y: at.y, bounds: at.bounds };
    const mood = zone.def.mood;
    const key = (i: number): string => `${zone.def.id}:${i}`;
    const before = this.life.count;
    let members = [person.index];
    if (mood === 'trading') {
      const partner = person.partner >= 0 ? zone.people[person.partner] : undefined;
      if (partner?.rig && partner.index > person.index) {
        members = [person.index, partner.index];
        this.life.add({
          kind: 'seller',
          x: (person.x + partner.x) / 2 - cols / 2,
          z: (person.y + partner.y) / 2 - rows / 2,
          yaw: person.yaw,
          ...base,
        });
      } else {
        // a tout calling passers-by, pacing a few steps along the stall line
        this.life.add({
          kind: 'conductor',
          x: at.x,
          z: at.z,
          yaw: person.yaw,
          toX: person.toX - cols / 2 + 0.8,
          toZ: person.toY - rows / 2,
          ...base,
        });
      }
    } else if (mood === 'working') {
      this.life.add({
        kind: 'worker',
        x: at.x,
        z: at.z,
        yaw: person.yaw,
        toX: person.toX - cols / 2,
        toZ: person.toY - rows / 2,
        ...base,
      });
    } else {
      this.life.add({ kind: 'onlooker', x: at.x, z: at.z, yaw: person.yaw, ...base });
    }
    const made = this.life.count - before;
    if (made >= members.length) for (const m of members) rigged.add(key(m));
    else if (made === 1) rigged.add(key(members[0]!));
  }

  private buildFigures(list: { zone: PlannedZone; person: PlannedPerson }[]): void {
    if (list.length === 0) return;
    const poses = poseSets();
    const roleOf = (f: { zone: PlannedZone }): Role => ROLE_OF_MOOD[f.zone.def.mood];
    const roles = [...new Set(list.map(roleOf))];
    // at most MAX_FIGURE_VARIANTS variants: the commonest roles get the spare ones
    const perRole = new Map<Role, number>(roles.map((r) => [r, 1]));
    let spare = MAX_FIGURE_VARIANTS - roles.length;
    const common = [...roles].sort(
      (a, b) => list.filter((f) => roleOf(f) === b).length - list.filter((f) => roleOf(f) === a).length,
    );
    for (const r of common) {
      const extra = Math.min(spare, Math.max(0, (poses.get(r)?.length ?? 1) - 1));
      perRole.set(r, 1 + extra);
      spare -= extra;
    }
    const pick = rngFor(this.opts.seed, 'crowd:variants');
    const specs = new Map<Role, { set: { frames: [Pose, Pose] }; count: number }[]>();
    for (const role of roles) {
      const names = [...(poses.get(role) ?? poses.get('watch') ?? [])];
      const chosen: { set: { frames: [Pose, Pose] }; count: number }[] = [];
      for (let k = 0; k < (perRole.get(role) ?? 1) && names.length > 0; k++)
        chosen.push({ set: names.splice(Math.floor(pick() * names.length), 1)[0]!, count: 0 });
      specs.set(role, chosen);
    }
    // assign people to variants round-robin, then size the instance buffers once
    const assigned = list.map((entry, i) => {
      const options = specs.get(roleOf(entry))!;
      const spec = options[i % options.length]!;
      spec.count++;
      return { entry, spec };
    });
    const built = new Map<object, Variant>();
    for (const [role, options] of specs)
      for (const spec of options) {
        const material = (spec.set.frames[0].material as MeshStandardMaterial).clone();
        material.userData = { gritPatched: false, npcCrowd: true };
        const geos = spec.set.frames.map((f) => f.geometry) as [BufferGeometry, BufferGeometry];
        const mk = (g: BufferGeometry): InstancedMesh => {
          const im = new InstancedMesh(g, material, Math.max(1, spec.count));
          im.castShadow = false;
          im.receiveShadow = true;
          im.frustumCulled = false;
          im.userData.npcCrowd = true;
          // give both poses an instance-colour buffer now: adding one later (the first reaction) would recompile the material
          im.setColorAt(0, WHITE);
          this.group.add(im);
          return im;
        };
        const f0 = mk(geos[0]);
        const variant: Variant = {
          role,
          frames: [f0, geos[1] === geos[0] ? f0 : mk(geos[1])],
          geometries: geos,
          material,
          count: spec.count,
          filled: [0, 0],
        };
        built.set(spec, variant);
        this.variants.push(variant);
      }
    for (const { entry, spec } of assigned) {
      const { zone, person } = entry;
      const shade = person.shade;
      this.figures.push({
        variant: built.get(spec)!,
        zone,
        person,
        tint: new Color(TINTS[Math.floor(shade * 997) % TINTS.length]!).multiplyScalar(
          0.62 + 0.28 * ((shade * 7.3) % 1),
        ),
        scale: 0.78 + 0.08 * ((shade * 13.1) % 1),
        phase: shade * 100,
        y: STREET + (zone.def.elevation ?? 0),
        next: shade * 3,
        altUntil: 0,
        dx: person.x,
        dy: person.y,
        pose: 0,
        react: null,
      });
    }
  }

  // ------------------------------------------------------------------------------------- reactions

  /** Feeds the tick's stimuli (from SimEvents) to every zone that cares. */
  stimulate(stimuli: readonly Stimulus[], time: number): void {
    if (stimuli.length === 0) return;
    const { cols, rows } = this.opts;
    for (const s of stimuli) {
      for (const zone of this.plan.zones) {
        const rule = ruleFor({ ...this.opts.rules, ...zone.def.reacts }, s, zone.def.rect);
        if (!rule) continue;
        // reduced motion: nobody runs about, they flinch where they stand
        const reaction: NpcReaction =
          this.opts.reducedMotion && rule.reaction === 'scatter' ? 'flinch' : rule.reaction;
        const seconds = REACTION_SECONDS[reaction];
        const boost = s.kind === 'blast' ? Math.min(0.25, Math.max(0, s.strength - 2) * 0.06) : 0;
        const from = { x: s.tx - cols / 2, z: s.ty - rows / 2 };
        this.life.reactInRect(
          this.world(zone),
          reaction,
          time,
          seconds,
          from,
          Math.min(1, rule.chance + boost),
        );
        for (const f of this.figures) {
          if (f.zone !== zone || !reacts(rule, s, this.rand)) continue;
          if (f.react && f.react.until > time + seconds) continue;
          const [tx, ty] =
            reaction === 'scatter'
              ? scatterTarget({ x: f.person.x, y: f.person.y }, s, zone.def.rect)
              : [f.person.x, f.person.y];
          f.react = {
            kind: reaction,
            t0: time,
            until: time + seconds,
            tx,
            ty,
            look: Math.atan2(s.tx - f.person.x, s.ty - f.person.y),
          };
          if (reaction === 'scatter')
            this.opts.puff?.(f.person.x - cols / 2, f.y + 0.1, f.person.y - rows / 2);
        }
      }
    }
  }

  // --------------------------------------------------------------------------------------- frames

  update(
    dt: number,
    time: number,
    excitement: number,
    visible?: (x: number, z: number, radius: number) => boolean,
  ): void {
    this.life.update(dt, time, excitement, visible && ((x, z) => visible(x, z, 3)));
    const { cols, rows } = this.opts;
    for (const v of this.variants) v.filled = [0, 0];
    const seen = new Set<Variant>();
    for (const f of this.figures) {
      const p = f.person;
      let x = p.x;
      let y = p.y;
      let yaw = p.yaw;
      let lift = 0;
      let squash = 1;
      let lean = 0;
      let frame: 0 | 1;
      const mood = f.zone.def.mood;
      if (mood === 'working' && (p.toX !== p.x || p.toY !== p.y)) {
        // pace between home and the work point, stride flipbook
        const len = Math.hypot(p.toX - p.x, p.toY - p.y);
        const d = (time * 0.45 + f.phase) % (len * 2);
        const k = (d < len ? d : len * 2 - d) / len;
        x = p.x + (p.toX - p.x) * k;
        y = p.y + (p.toY - p.y) * k;
        yaw = Math.atan2((p.toX - p.x) * (d < len ? 1 : -1), (p.toY - p.y) * (d < len ? 1 : -1));
        frame = (Math.floor(d / 0.4) % 2) as 0 | 1;
      } else {
        if (time >= f.next) {
          // idle life: a change of stance now and then, louder match = more cheering among watchers
          const p1 = mood === 'watching' ? 0.15 + excitement * 0.6 : mood === 'trading' ? 0.35 : 0.12;
          if (this.rand() < p1) f.altUntil = time + 0.5 + this.rand() * 1.2;
          f.next = time + 0.9 + this.rand() * 2.4;
        }
        frame = time < f.altUntil ? 1 : 0;
        yaw += Math.sin(time * 0.31 + f.phase) * 0.14;
        squash = 1 + Math.sin(time * 1.6 + f.phase) * 0.006;
      }
      const r = f.react;
      if (r) {
        if (time >= r.until) f.react = null;
        else {
          const u = (time - r.t0) / (r.until - r.t0);
          const w = u < 0.25 ? u / 0.25 : u > 0.7 ? (1 - u) / 0.3 : 1;
          const k = w * w * (3 - 2 * w);
          switch (r.kind) {
            case 'duck':
              squash *= 1 - 0.28 * k;
              frame = 1;
              break;
            case 'flinch':
              lean = -0.3 * k;
              frame = 1;
              break;
            case 'scatter':
              x += (r.tx - p.x) * k;
              y += (r.ty - p.y) * k;
              frame = (Math.floor(time / 0.18) % 2) as 0 | 1;
              lift = Math.abs(Math.sin(time * 14)) * 0.03 * k;
              break;
            case 'cheer':
              frame = 1;
              lift = Math.max(0, Math.sin(time * 9 + f.phase)) * 0.1 * k;
              break;
            case 'look':
              yaw = yaw + (r.look - yaw) * k;
              break;
          }
        }
      }
      // never leave the zone, whatever the maths above did
      const rect = f.zone.def.rect;
      x = Math.min(rect.x1 - 0.15, Math.max(rect.x0 + 0.15, x));
      y = Math.min(rect.y1 - 0.15, Math.max(rect.y0 + 0.15, y));
      f.dx = x;
      f.dy = y;
      f.pose = frame;
      if (
        visible &&
        !seen.has(f.variant) &&
        visible(x - cols / 2, y - rows / 2, 2 + (f.zone.def.elevation ?? 0))
      )
        seen.add(f.variant);
      this.q.setFromEuler(this.e.set(lean, yaw, 0, 'YXZ'));
      this.m4.compose(
        this.p.set(x - cols / 2, f.y + lift, y - rows / 2),
        this.q,
        this.s.set(f.scale, f.scale * squash, f.scale),
      );
      const v = f.variant;
      const fr = v.frames[0] === v.frames[1] ? 0 : frame;
      const slot = v.filled[fr]++;
      v.frames[fr].setMatrixAt(slot, this.m4);
      v.frames[fr].setColorAt(slot, f.tint);
    }
    for (const v of this.variants) {
      for (const fr of [0, 1] as const) {
        const m = v.frames[fr];
        m.visible = !visible || seen.has(v); // follow camera: a pose set nobody in view uses is not drawn
        m.count = v.filled[fr];
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  }

  /** Planned people: animated rigs and instanced figures actually created. */
  get counts(): { rigs: number; figures: number } {
    return { rigs: this.rigCount, figures: this.figures.length };
  }

  /** Where every instanced figure was drawn last frame (tile units), its zone, home and pose: for tests and debugging. */
  figurePositions(): { zone: string; x: number; y: number; homeX: number; homeY: number; pose: 0 | 1 }[] {
    return this.figures.map((f) => ({
      zone: f.zone.def.id,
      x: f.dx,
      y: f.dy,
      homeX: f.person.x,
      homeY: f.person.y,
      pose: f.pose,
    }));
  }

  /** Where every rig stands now, in world metres (tests check they stay inside their zones). */
  rigPositions(): { x: number; z: number; bounds: WorldBounds | null }[] {
    return this.life.positions();
  }

  /** Draw calls this module adds: rig meshes plus the figure poses in use. */
  get drawCalls(): number {
    return this.variants.reduce((n, v) => n + (v.frames[0] === v.frames[1] ? 1 : 2), 0) + this.rigCount * 5;
  }

  dispose(): void {
    this.life.dispose();
    for (const v of this.variants) {
      for (const f of v.frames) {
        this.group.remove(f);
        f.dispose();
      }
      v.material.dispose();
    }
    this.variants.length = 0;
    this.figures.length = 0;
  }
}
