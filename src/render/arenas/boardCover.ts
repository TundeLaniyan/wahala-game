/**
 * Board cover: permanent concrete ('#' tiles) drawn as the real objects it stands for - a whole parked
 * Danfo, a shop building, a hammerhead pier - instead of one pillar model per tile. Presentation only:
 * collision, blasts and the tile map are untouched; an arena opts in through `ArenaArt.cover` and the
 * arena view then skips the per-tile pillar on every tile the cover claims (crush blocks dropped in during
 * the match are never claimed, so they still fall in as pillars).
 *
 * `CoverBuilder` bakes everything into a few merged meshes (one per material and board chunk, so a frame
 * costs a handful of draw calls and off-screen chunks are culled). Every vertex carries the occlusion
 * fade attribute of `assets/occlusionFade.ts`; a cover GROUP (one building, one row of buses) fades as a
 * whole when anything worth seeing stands behind any of its tiles, the same dither the pillars use.
 */
import { BufferAttribute, Color, Float32BufferAttribute, Group, Matrix4, Mesh, Vector3 } from 'three';
import type { Material, Object3D, BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fadeableMaterial } from '../assets/occlusionFade';

/** What the arena view needs from a board cover. */
export interface BoardCover {
  readonly object: Object3D;
  /** True when this tile's concrete is drawn by the cover (the arena view draws no pillar there). */
  covers(tile: number): boolean;
  /** How many tiles NORTH of `tile` its object can hide from the camera (>= 1), for the occlusion fade. */
  reach(tile: number): number;
  /** The most rows any cover object reaches (bounds the arena view's search). */
  readonly maxReach: number;
  /** Fade of a covered tile this frame (0 .. MAX_HIDE); its whole group fades with its most hidden tile. */
  setHide(tile: number, value: number): void;
  /** Uploads the fades set since the last commit (once per frame, after every `setHide`). */
  commit(): void;
  dispose(): void;
}

/** Builds an arena's board cover for a match (null: draw per-tile pillars as usual). */
export type CoverFactory = (board: { width: number; height: number }) => BoardCover | null;

interface Piece {
  geometry: BufferGeometry;
  group: number;
}

interface Range {
  attr: BufferAttribute;
  start: number;
  count: number;
}

const WHITE = new Color(0xffffff);

/**
 * One geometry in the shared vertex format (non-indexed; position, normal, uv, colour; the fade attribute is
 * added at merge time), transformed by `matrix`. `color` tints the vertices (used by vertex-colour materials).
 */
function normalise(src: BufferGeometry, matrix: Matrix4 | null, color: Color | null): BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes))
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color')
      g.deleteAttribute(name);
  if (matrix) g.applyMatrix4(matrix);
  const n = g.attributes.position!.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(n * 2), 2));
  const out = new Float32Array(n * 3);
  const old = g.attributes.color;
  const c = color ?? WHITE;
  for (let i = 0; i < n; i++) {
    // an authored vertex colour (GLB models) times the tint; GLB colours may be RGBA or normalised ints
    const r = old ? old.getX(i) : 1;
    const gg = old ? old.getY(i) : 1;
    const b = old ? old.getZ(i) : 1;
    out[i * 3] = r * c.r;
    out[i * 3 + 1] = gg * c.g;
    out[i * 3 + 2] = b * c.b;
  }
  if (old) g.deleteAttribute('color');
  g.setAttribute('color', new Float32BufferAttribute(out, 3));
  // a model's uv may be stored as normalised ints: force floats so every piece merges
  const uv = g.attributes.uv!;
  if (!(uv.array instanceof Float32Array)) {
    const f = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      f[i * 2] = uv.getX(i);
      f[i * 2 + 1] = uv.getY(i);
    }
    g.setAttribute('uv', new Float32BufferAttribute(f, 2));
  }
  const nor = g.attributes.normal!;
  if (!(nor.array instanceof Float32Array)) {
    const f = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      f[i * 3] = nor.getX(i);
      f[i * 3 + 1] = nor.getY(i);
      f[i * 3 + 2] = nor.getZ(i);
    }
    g.setAttribute('normal', new Float32BufferAttribute(f, 3));
  }
  return g;
}

export class CoverBuilder {
  /** material -> chunk -> pieces */
  private readonly buckets = new Map<Material, Map<number, Piece[]>>();
  private readonly tileGroup: Int32Array;
  private readonly groupReach: number[] = [];
  private readonly groupChunk: number[] = [];
  private readonly m = new Matrix4();
  private readonly v = new Vector3();
  private readonly owned: { dispose(): void }[] = [];
  private readonly gritOf = new Map<Material, string>();

  /** Disposed with the cover (materials and textures the caller created for it). */
  own<T extends { dispose(): void }>(d: T): T {
    this.owned.push(d);
    return d;
  }

  /** Weathering class for the meshes of one material (default: the ancestor's, i.e. scenery). */
  grit(material: Material, cls: string): void {
    this.gritOf.set(material, cls);
  }

  /**
   * @param chunk board chunk size in tiles: pieces are merged per material per chunk (frustum culling).
   */
  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly chunk: [number, number] = [23, 17],
  ) {
    this.tileGroup = new Int32Array(width * height).fill(-1);
  }

  /**
   * Declares a cover group: the tiles it claims, how many rows north of them it can hide, and the tile
   * whose chunk its geometry joins (its centre). Returns the group id for `add`.
   */
  group(tiles: readonly (readonly [number, number])[], reach: number): number {
    const id = this.groupReach.length;
    let sx = 0;
    let sy = 0;
    for (const [x, y] of tiles) {
      this.tileGroup[y * this.width + x] = id;
      sx += x;
      sy += y;
    }
    const cx = Math.floor(sx / Math.max(1, tiles.length));
    const cy = Math.floor(sy / Math.max(1, tiles.length));
    const cols = Math.ceil(this.width / this.chunk[0]);
    this.groupChunk.push(Math.floor(cy / this.chunk[1]) * cols + Math.floor(cx / this.chunk[0]));
    this.groupReach.push(Math.max(1, Math.round(reach)));
    return id;
  }

  /** Adds a geometry (world space after `matrix`) to a group. `color` tints vertex-colour materials. */
  add(group: number, geometry: BufferGeometry, material: Material, matrix?: Matrix4, color?: number): void {
    const g = normalise(geometry, matrix ?? null, color === undefined ? null : new Color(color));
    this.push(group, g, material);
  }

  /** Bakes every mesh of a model (its world transform, then `matrix`) into a group. */
  addObject(group: number, object: Object3D, matrix?: Matrix4): void {
    object.updateMatrixWorld(true);
    object.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
      this.m.copy(mesh.matrixWorld);
      if (matrix) this.m.premultiply(matrix);
      this.push(group, normalise(mesh.geometry, this.m, null), material);
    });
  }

  private push(given: number, geometry: BufferGeometry, material: Material): void {
    // a piece belongs to the fade group of the tile under its centre when that tile is claimed (so one
    // object can be split into several fade groups, e.g. a long row of buildings fading in short sections)
    geometry.computeBoundingBox();
    const c = geometry.boundingBox!.getCenter(this.v);
    const tx = Math.floor(c.x + this.width / 2);
    const ty = Math.floor(c.z + this.height / 2);
    const under =
      tx >= 0 && ty >= 0 && tx < this.width && ty < this.height ? this.tileGroup[ty * this.width + tx]! : -1;
    const group = under >= 0 ? under : given;
    const chunk = this.groupChunk[group] ?? 0;
    let byChunk = this.buckets.get(material);
    if (!byChunk) {
      byChunk = new Map();
      this.buckets.set(material, byChunk);
    }
    const list = byChunk.get(chunk) ?? [];
    list.push({ geometry, group });
    byChunk.set(chunk, list);
  }

  build(): BoardCover {
    const root = new Group();
    root.name = 'boardCover';
    const ranges: Range[][] = this.groupReach.map(() => []);
    const owned: { dispose(): void }[] = [...this.owned];
    for (const [material, byChunk] of this.buckets) {
      const fade = fadeableMaterial(material);
      owned.push(fade);
      for (const pieces of byChunk.values()) {
        // group order inside the chunk keeps each group's vertices together
        pieces.sort((a, b) => a.group - b.group);
        const merged = mergeGeometries(pieces.map((p) => p.geometry));
        for (const p of pieces) p.geometry.dispose();
        if (!merged) continue;
        const n = merged.attributes.position!.count;
        const hide = new BufferAttribute(new Float32Array(n), 1);
        merged.setAttribute('aHide', hide);
        merged.computeBoundingSphere();
        let start = 0;
        for (const p of pieces) {
          const count = p.geometry.attributes.position?.count ?? 0;
          const list = ranges[p.group]!;
          const last = list[list.length - 1];
          if (last && last.attr === hide && last.start + last.count === start) last.count += count;
          else list.push({ attr: hide, start, count });
          start += count;
        }
        const mesh = new Mesh(merged, fade);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const cls = this.gritOf.get(material);
        if (cls) mesh.userData.grit = cls;
        root.add(mesh);
        owned.push(merged);
      }
    }
    this.buckets.clear();
    const tileGroup = this.tileGroup;
    const reach = this.groupReach;
    const want = new Float32Array(reach.length);
    const shown = new Float32Array(reach.length);
    return {
      object: root,
      maxReach: Math.max(1, ...reach),
      covers: (tile) => (tileGroup[tile] ?? -1) >= 0,
      reach: (tile) => reach[tileGroup[tile] ?? -1] ?? 1,
      setHide(tile, value) {
        const g = tileGroup[tile] ?? -1;
        if (g >= 0 && value > want[g]!) want[g] = value;
      },
      commit() {
        for (let g = 0; g < want.length; g++) {
          const v = want[g]!;
          want[g] = 0;
          if (v === shown[g]) continue;
          shown[g] = v;
          for (const r of ranges[g]!) {
            (r.attr.array as Float32Array).fill(v, r.start, r.start + r.count);
            r.attr.addUpdateRange(r.start, r.count);
            r.attr.needsUpdate = true;
          }
        }
      },
      dispose() {
        for (const o of owned) o.dispose();
      },
    };
  }
}
