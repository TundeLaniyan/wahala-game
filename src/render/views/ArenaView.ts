import {
  BoxGeometry,
  CylinderGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  Euler,
  Group,
  Color,
} from 'three';
import type { BufferGeometry, Material, Texture } from 'three';
import { arenaLook } from '../arenaLook';
import type { GameState } from '../../sim';
import { Tile } from '../../sim';
import { modelledPillars, pillarParts, softBlockParts, softVariantFor, softVariants } from '../assets/props';
import type { SoftVariant } from '../assets/props';
import type { Layout } from '../coords';
import { floorMaterial } from '../assets/floor';
import { contactShadowTexture, corrugatedTexture } from '../textures';
import { arenaFloorMaps } from '../arenas/floors';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { InstanceSet } from './InstanceSet';
import type { FrameContext, View } from './types';

const DROP_TIME = 0.28;
/**
 * Obstacles are drawn squat and chunky: under the low action camera a tall pillar hides the lane
 * behind it, so pillars stand about one tile high and soft blocks about two thirds, leaving the
 * (taller) characters as the clear top of the visual hierarchy.
 */
const PILLAR_SCALE = new Vector3(0.88, 0.84, 0.88);
const SOFT_SCALE = new Vector3(0.88, 0.82, 0.88);

/** Copies instancing parts with their material tinted (per-arena art direction). */
function tinted<T extends { material: Material }>(parts: T[], tint: number, owned: Material[]): T[] {
  if (tint === 0xffffff) return parts;
  return parts.map((p) => {
    const m = p.material.clone() as MeshStandardMaterial;
    if (m.color) m.color.multiply(new Color(tint));
    owned.push(m);
    return { ...p, material: m };
  });
}

/** Floor, concrete pillars, soft blocks (instanced), crush blocks dropping in, floor hazards. */
export class ArenaView implements View {
  readonly group = new Group();
  private readonly arenaId: string;
  private readonly pillars: InstanceSet[];
  private readonly variants = softVariants();
  private readonly soft = new Map<SoftVariant, InstanceSet>();
  private readonly cache: number[];
  private readonly initialHard: Set<number>;
  private readonly dropping = new Map<number, number>();
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly p = new Vector3();
  private readonly s = new Vector3(1, 1, 1);
  private readonly decals = new Group();
  /** Contact shadows under every pillar and prop: grounding/AO that also works with shadows off. */
  private readonly contact: InstanceSet;
  private readonly ownedMaterials: Material[] = [];
  private readonly ownedTextures: Texture[] = [];

  constructor(
    state: GameState,
    private readonly layout: Layout,
  ) {
    this.arenaId = state.arenaId;
    const W = state.width;
    const H = state.height;
    // the arena's own worn surface (tarmac / pavers / cracked asphalt); the slab atlas is the fallback
    const maps = arenaFloorMaps(state.arenaId, W, H);
    let floorMat: MeshStandardMaterial;
    if (maps) {
      floorMat = new MeshStandardMaterial({
        color: 0xffffff,
        map: maps.map,
        roughnessMap: maps.roughnessMap,
        roughness: 1,
        metalness: 0,
      });
      this.ownedTextures.push(maps.map, maps.roughnessMap);
      this.ownedMaterials.push(floorMat);
    } else floorMat = floorMaterial(W, H, state.arenaId);
    const floor = new Mesh(new PlaneGeometry(W, H), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.userData.grit = 'floor';
    this.group.add(floor);

    const look = arenaLook(state.arenaId);
    const owned = this.ownedMaterials;
    const wraps = this.pillarWraps(state.arenaId);
    const modelled = modelledPillars();
    if (modelled) {
      this.pillars = modelled.map(
        (parts) => new InstanceSet([...tinted(parts, look.pillarTint, owned), ...wraps], W * H),
      );
    } else {
      const parts = pillarParts();
      this.pillars = [
        new InstanceSet(
          [...tinted([parts.body, parts.band, parts.cap], look.pillarTint, owned), ...wraps],
          W * H,
        ),
      ];
    }
    for (const set of this.pillars) this.group.add(set.group);
    for (const v of this.variants) {
      const set = new InstanceSet(tinted(softBlockParts(v), look.softTint, owned), W * H);
      this.soft.set(v, set);
      this.group.add(set.group);
    }
    const contactGeo = new PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2).translate(0.06, 0.006, -0.03); // nudged down-sun
    this.contact = new InstanceSet(
      [
        {
          geometry: contactGeo,
          material: new MeshBasicMaterial({
            map: contactShadowTexture(),
            color: 0x000000,
            transparent: true,
            opacity: 0.42,
            depthWrite: false,
          }),
        },
      ],
      W * H,
    );
    for (const m of this.contact.group.children) {
      m.castShadow = false;
      m.receiveShadow = false;
      m.renderOrder = 1;
    }
    this.group.add(this.contact.group);
    this.cache = new Array<number>(W * H).fill(-1);
    this.initialHard = new Set(state.tiles.flatMap((t, i) => (t === Tile.Hard ? [i] : [])));
    this.group.add(this.decals);
  }

  /**
   * Arena-specific dressing instanced with every pillar (model space, before PILLAR_SCALE): market
   * pillars wear a collar of rusted corrugated sheet like the stall posts around them; roadworks
   * pillars are unfinished columns with rusty rebar stubs sticking out of the top. The bus park keeps
   * the weathered poster pillars.
   */
  private pillarWraps(arenaId: string): { geometry: BufferGeometry; material: Material }[] {
    if (arenaId === 'balogunMarket') {
      const map = corrugatedTexture().clone();
      map.needsUpdate = true;
      map.repeat.set(2, 1);
      const m = new MeshStandardMaterial({ color: 0x6a5240, map, roughness: 0.7, metalness: 0.4 });
      this.ownedMaterials.push(m);
      this.ownedTextures.push(map);
      return [{ geometry: new BoxGeometry(0.91, 0.36, 0.91).translate(0, 0.66, 0), material: m }];
    }
    if (arenaId === 'lekkiRoadworks') {
      const m = new MeshStandardMaterial({ color: 0x5a3624, roughness: 0.65, metalness: 0.5 });
      this.ownedMaterials.push(m);
      const bars: BufferGeometry[] = [];
      for (const [x, z, lean] of [
        [-0.3, -0.3, 0.12],
        [0.3, -0.3, -0.08],
        [-0.3, 0.3, 0.05],
        [0.3, 0.3, -0.14],
        [0, -0.3, 0.02],
        [0, 0.3, -0.04],
      ] as const) {
        const bar = new CylinderGeometry(0.022, 0.022, 0.5, 5).translate(0, 0.25, 0);
        bar.applyMatrix4(new Matrix4().makeRotationZ(lean));
        bars.push(bar.translate(x, 1.08, z));
      }
      return [{ geometry: mergeGeometries(bars)!, material: m }];
    }
    return [];
  }

  /** Variant of the soft block at a tile (for debris colours). */
  variantAt(x: number, y: number): SoftVariant {
    return softVariantFor(x, y, this.variants, this.arenaId);
  }

  update(ctx: FrameContext): void {
    const { state, time } = ctx;
    for (let i = 0; i < state.tiles.length; i++) {
      const kind = state.tiles[i]!;
      if (this.cache[i] !== kind) {
        const x = i % state.width;
        const y = Math.floor(i / state.width);
        this.removeTile(i, x, y, this.cache[i]!);
        this.cache[i] = kind;
        if (kind === Tile.Hard) {
          if (!this.initialHard.has(i)) this.dropping.set(i, time);
          this.placePillar(i, x, y, this.dropping.has(i) ? 6 : 0);
        } else if (kind === Tile.Soft) {
          this.placeSoft(i, x, y);
        }
      }
    }
    for (const [i, start] of this.dropping) {
      const k = Math.min(1, (time - start) / DROP_TIME);
      const x = i % state.width;
      const y = Math.floor(i / state.width);
      this.placePillar(i, x, y, 6 * (1 - k * k));
      this.setContact(i, x, y, 0.35 + 0.65 * k);
      if (k >= 1) {
        this.dropping.delete(i);
        ctx.fx.dust(x, y, 12, 1.0);
        ctx.fx.shockwave(this.layout.wx(x), this.layout.wz(y), 1.5, 0xffaa44);
        ctx.fx.blockDebris(x, y, 'concrete');
        ctx.fx.shake = Math.min(1, ctx.fx.shake + 0.25);
      }
    }
  }

  private removeTile(i: number, x: number, y: number, kind: number): void {
    this.contact.remove(i);
    if (kind === Tile.Hard) this.pillars[this.pillarVariant(x, y)]!.remove(i);
    else if (kind === Tile.Soft) this.soft.get(softVariantFor(x, y, this.variants, this.arenaId))!.remove(i);
  }

  private pillarVariant(x: number, y: number): number {
    return (x * 5 + y * 3 + ((x ^ y) & 3)) % this.pillars.length;
  }

  private placePillar(i: number, x: number, y: number, lift: number): void {
    this.p.set(this.layout.wx(x), lift, this.layout.wz(y));
    this.q.identity();
    this.m.compose(this.p, this.q, PILLAR_SCALE);
    this.pillars[this.pillarVariant(x, y)]!.set(i, this.m);
    this.s.set(1, 1, 1);
    if (lift === 0) this.setContact(i, x, y, 0.94);
  }

  private setContact(i: number, x: number, y: number, size: number): void {
    this.p.set(this.layout.wx(x), 0, this.layout.wz(y));
    this.q.identity();
    this.s.set(size, 1, size);
    this.m.compose(this.p, this.q, this.s);
    this.contact.set(i, this.m);
    this.s.set(1, 1, 1);
  }

  private placeSoft(i: number, x: number, y: number): void {
    this.p.set(this.layout.wx(x), 0, this.layout.wz(y));
    this.e.set(0, ((x * 31 + y * 17) % 5) * 0.03 - 0.06, 0);
    this.q.setFromEuler(this.e);
    this.m.compose(this.p, this.q, SOFT_SCALE);
    this.soft.get(softVariantFor(x, y, this.variants, this.arenaId))!.set(i, this.m);
    this.s.set(1, 1, 1);
    this.setContact(i, x, y, 0.8);
  }

  dispose(): void {
    for (const p of this.pillars) p.dispose();
    for (const s of this.soft.values()) s.dispose();
    this.contact.dispose();
    for (const m of this.ownedMaterials) m.dispose();
    for (const t of this.ownedTextures) t.dispose();
  }
}
