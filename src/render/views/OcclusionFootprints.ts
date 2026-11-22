/**
 * Ground footprints of faded structures (presentation only, decisions OX1-OX6): while a building dissolves because it
 * hides the followed fighter, the tiles it still blocks are drawn on the floor as a faint rim, so the fighter is never
 * left walking into what looks like empty space. Grounded, not graphic: a thin worn-ochre rim (like kerb paint) with a dark line
 * outside it (readable on a bright floor and on a dark one) over a barely-there dark patch, all at low opacity, easing in and out.
 * The shapes and strengths come from `assets/occlusionFootprint.ts`; this class only owns the meshes.
 *
 * One mesh per structure, built the first time it fades and kept (three materials: patch, outer line, rim); only the
 * strongest `budget` footprints are drawn (`QualityProfile.occlusionFootprints`, live), the rest are hidden.
 */
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { footprintShapes } from '../assets/occlusionFootprint';
import type { Rect } from '../assets/occlusionFootprint';
import type { Layout } from '../coords';

/** Height above the floor: over the floor and its decals, under the telegraphs (0.045 and up). */
const Y = 0.036;
const RENDER_ORDER = 5;
/** Highest opacity of each part at strength 1 (kept low: it is a hint under a ghost, not a drawn outline). */
export const PEAK = { fill: 0.3, outer: 0.55, rim: 0.78 } as const;
const COLORS = { fill: 0x0b0a08, outer: 0x0b0a08, rim: 0xc9a24a } as const;

/** What the arena view hands over each frame: one entry per faded structure. */
export interface FootprintEntry {
  /** Identity of the structure (its representative tile). */
  key: number;
  /** Row-major tiles it blocks. */
  tiles: readonly number[];
  /** 0..1 (`outlineStrength`); entries at 0 are hidden. */
  strength: number;
  /** Distance (tiles) from the fighter: with a budget, the nearest are drawn. */
  distance: number;
}

interface Built {
  mesh: Mesh;
  materials: [MeshBasicMaterial, MeshBasicMaterial, MeshBasicMaterial];
}

export class OcclusionFootprints {
  readonly group = new Group();
  private readonly built = new Map<number, Built>();
  private budget = 4;

  constructor(
    private readonly layout: Layout,
    private readonly width: number,
  ) {
    this.group.name = 'occlusionFootprints';
  }

  /** Quality (live): how many footprints are drawn at once. */
  setBudget(n: number): void {
    this.budget = Math.max(0, Math.round(n));
  }

  /** Draws `entries` (the structures faded this frame, with their strengths); everything else is hidden. */
  update(entries: readonly FootprintEntry[]): void {
    const shown = new Set<number>();
    const live = entries.filter((e) => e.strength > 0.004).sort((a, b) => a.distance - b.distance);
    for (const e of live.slice(0, this.budget)) {
      const b = this.built.get(e.key) ?? this.build(e);
      shown.add(e.key);
      b.mesh.visible = true;
      b.materials[0].opacity = PEAK.fill * e.strength;
      b.materials[1].opacity = PEAK.outer * e.strength;
      b.materials[2].opacity = PEAK.rim * e.strength;
    }
    for (const [key, b] of this.built) if (!shown.has(key)) b.mesh.visible = false;
  }

  /** Footprints currently drawn (debug / tests). */
  visibleCount(): number {
    let n = 0;
    for (const b of this.built.values()) if (b.mesh.visible) n++;
    return n;
  }

  private build(e: FootprintEntry): Built {
    const shapes = footprintShapes(e.tiles, this.width);
    const positions: number[] = [];
    const groups: { start: number; count: number }[] = [];
    const add = (rects: readonly Rect[]): void => {
      const start = positions.length / 3;
      for (const r of rects) {
        const x0 = this.layout.wx(r.x0);
        const x1 = this.layout.wx(r.x1);
        const z0 = this.layout.wz(r.y0);
        const z1 = this.layout.wz(r.y1);
        positions.push(x0, Y, z0, x0, Y, z1, x1, Y, z1, x0, Y, z0, x1, Y, z1, x1, Y, z0);
      }
      groups.push({ start, count: positions.length / 3 - start });
    };
    add(shapes.fill);
    add(shapes.outer);
    add(shapes.rim);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    groups.forEach((g, i) => geometry.addGroup(g.start, g.count, i));
    const material = (hex: number): MeshBasicMaterial =>
      new MeshBasicMaterial({
        color: new Color(hex),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: DoubleSide,
        fog: false, // a readability aid: never washed out by the arena's fog
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
    const materials: Built['materials'] = [
      material(COLORS.fill),
      material(COLORS.outer),
      material(COLORS.rim),
    ];
    const mesh = new Mesh(geometry, materials);
    mesh.renderOrder = RENDER_ORDER;
    mesh.frustumCulled = false;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.visible = false;
    this.group.add(mesh);
    const built = { mesh, materials };
    this.built.set(e.key, built);
    return built;
  }

  dispose(): void {
    for (const b of this.built.values()) {
      b.mesh.geometry.dispose();
      for (const m of b.materials) m.dispose();
    }
    this.built.clear();
    this.group.clear();
  }
}
