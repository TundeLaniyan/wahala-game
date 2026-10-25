import {
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
import type { Material, Texture } from 'three';
import { arenaLook } from '../arenaLook';
import type { GameState } from '../../sim';
import { Tile } from '../../sim';
import { modelledPillars, pillarParts, softBlockParts, softVariantFor, softVariants } from '../assets/props';
import type { SoftVariant } from '../assets/props';
import type { Layout } from '../coords';
import { floorMaterial } from '../assets/floor';
import { contactShadowTexture } from '../textures';
import { obstacleStyle, pillarIndexFor, resolvePillars } from '../assets/obstacleStyles';
import { assets } from '../assets/library';
import type { ObstacleStyle } from '../assets/obstacleStyles';
import { MAX_HIDE, occludingTiles } from '../assets/occlusionFade';
import { arenaFloorMaps } from '../arenas/floors';
import { InstanceSet } from './InstanceSet';
import type { FrameContext, View } from './types';

const DROP_TIME = 0.28;
/** Seconds for an obstacle to dissolve / come back when something stands behind it. */
const HIDE_TAU = 0.12;

/** Copies instancing parts with their material tinted (per-arena art direction). */
function tinted<T extends { material: Material }>(
  parts: T[],
  tint: number,
  extra: number,
  owned: Material[],
): T[] {
  if (tint === 0xffffff && extra === 0xffffff) return parts;
  return parts.map((p) => {
    const m = p.material.clone() as MeshStandardMaterial;
    // a clone does not inherit the weathering shader patch, only its flag: let grit patch it again
    delete (m.userData as { gritPatched?: boolean }).gritPatched;
    if (m.color) m.color.multiply(new Color(tint)).multiply(new Color(extra));
    owned.push(m);
    return { ...p, material: m };
  });
}

/**
 * Floor, permanent blockers, breakables (instanced), crush blocks dropping in. What the obstacles
 * look like (models, size, tint) comes from the arena's obstacle style (assets/obstacleStyles.ts);
 * an obstacle that hides a player, generator or pickup standing behind it dissolves its upper part
 * (assets/occlusionFade.ts).
 */
export class ArenaView implements View {
  readonly group = new Group();
  private readonly arenaId: string;
  private readonly style: ObstacleStyle;
  private readonly pillarScale: Vector3;
  private readonly softScale: Vector3;
  /** current occlusion fade per tile (eased towards its target every frame) */
  private readonly hideOf = new Map<number, number>();
  private readonly pillars: InstanceSet[];
  /** Model ids behind `pillars` (empty = the procedural pillar). */
  private readonly pillarIds: string[];
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
    const style = obstacleStyle(state.arenaId);
    this.style = style;
    this.pillarScale = new Vector3(...style.pillarScale);
    this.softScale = new Vector3(...style.softScale);
    const owned = this.ownedMaterials;
    const modelled = modelledPillars(state.arenaId);
    this.pillarIds = modelled ? resolvePillars(style, assets.loadedIds('prop_pillar_')) : [];
    const fade = { fade: true };
    if (modelled) {
      this.pillars = modelled.map(
        (parts) => new InstanceSet(tinted(parts, look.pillarTint, style.pillarTint, owned), W * H, fade),
      );
    } else {
      const parts = pillarParts();
      this.pillars = [
        new InstanceSet(
          tinted([parts.body, parts.band, parts.cap], look.pillarTint, style.pillarTint, owned),
          W * H,
          fade,
        ),
      ];
    }
    for (const set of this.pillars) this.group.add(set.group);
    for (const v of this.variants) {
      const set = new InstanceSet(
        tinted(softBlockParts(v), look.softTint, style.softTint, owned),
        W * H,
        fade,
      );
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
    this.updateOcclusion(state, ctx.dt);
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
        ctx.fx.blockDebris(x, y, this.style.pillarDebris);
        ctx.fx.shake = Math.min(1, ctx.fx.shake + 0.25);
      }
    }
  }

  /**
   * Dissolves the upper part of a pillar or breakable standing directly in front of (south of) a
   * live player, a generator or a pickup, so tall scenery never hides what matters.
   */
  private updateOcclusion(state: GameState, dt: number): void {
    const behind: { x: number; y: number }[] = [];
    for (const p of state.players) if (p.alive) behind.push(p);
    for (const g of state.generators) behind.push(g);
    for (const p of state.pickups) behind.push(p);
    const want = occludingTiles(state.width, state.height, behind);
    const k = 1 - Math.exp(-Math.max(0, dt) / HIDE_TAU);
    for (const i of want) if (!this.hideOf.has(i)) this.hideOf.set(i, 0);
    for (const [i, cur] of this.hideOf) {
      const target = want.has(i) ? MAX_HIDE : 0;
      const next = Math.abs(target - cur) < 0.01 ? target : cur + (target - cur) * k;
      const x = i % state.width;
      const y = Math.floor(i / state.width);
      const kind = this.cache[i];
      if (kind === Tile.Hard) this.pillars[this.pillarVariant(x, y)]!.setHide(i, next);
      else if (kind === Tile.Soft)
        this.soft.get(softVariantFor(x, y, this.variants, this.arenaId))!.setHide(i, next);
      if (next === 0 && target === 0) this.hideOf.delete(i);
      else this.hideOf.set(i, next);
    }
  }

  private removeTile(i: number, x: number, y: number, kind: number): void {
    this.contact.remove(i);
    if (kind === Tile.Hard) this.pillars[this.pillarVariant(x, y)]!.remove(i);
    else if (kind === Tile.Soft) this.soft.get(softVariantFor(x, y, this.variants, this.arenaId))!.remove(i);
  }

  private pillarVariant(x: number, y: number): number {
    if (this.pillarIds.length !== this.pillars.length)
      return (x * 5 + y * 3 + ((x ^ y) & 3)) % this.pillars.length;
    return pillarIndexFor(this.style, this.pillarIds, x, y);
  }

  private placePillar(i: number, x: number, y: number, lift: number): void {
    this.p.set(this.layout.wx(x), lift, this.layout.wz(y));
    this.q.identity();
    this.m.compose(this.p, this.q, this.pillarScale);
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
    this.m.compose(this.p, this.q, this.softScale);
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
