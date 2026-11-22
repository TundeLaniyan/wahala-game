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
import type { BufferGeometry, Material, Texture } from 'three';
import { arenaLook } from '../arenaLook';
import type { GameState, Player } from '../../sim';
import { Tile } from '../../sim';
import { modelledPillars, pillarParts, softBlockParts, softVariantFor, softVariants } from '../assets/props';
import type { SoftVariant } from '../assets/props';
import type { Layout } from '../coords';
import { floorMaterial } from '../assets/floor';
import { contactShadowTexture, isSharedTexture } from '../textures';
import { obstacleStyle, pillarIndexFor, resolvePillars } from '../assets/obstacleStyles';
import { assets } from '../assets/library';
import type { ObstacleStyle } from '../assets/obstacleStyles';
import { MAX_HIDE, occludingTiles } from '../assets/occlusionFade';
import {
  OCCLUSION_LOOK,
  ease,
  footprintDistance,
  hideFor,
  isPushing,
  outlineStrength,
  proximity,
  stackedHide,
} from '../assets/occlusionFootprint';
import {
  PILLAR_HEIGHT,
  SOFT_HEIGHT,
  VIEW_CLEAR,
  hidesAny,
  holdMisses,
  pickOccludersFor,
  regionTiles,
  viewPoints,
} from '../assets/viewClear';
import type { ViewPoint } from '../assets/viewClear';
import { playerGridPos } from './motion';
import { arenaFloorMaps } from '../arenas/floors';
import { installPaving } from '../arenas/paving/material';
import { mergeCovers } from '../arenas/boardCover';
import type { BoardCover, CoverBounds, CoverClip } from '../arenas/boardCover';
import { inClip, renderClip } from '../sectorClip';
import { buildSectorBarricades } from './SectorBarricades';
import type { SectorBarricades } from './SectorBarricades';
import { NEW_ARENA_ART } from '../arenas/newArenas';
import { InstanceSet } from './InstanceSet';
import { OcclusionFootprints } from './OcclusionFootprints';
import type { FootprintEntry } from './OcclusionFootprints';
import type { FrameContext, View } from './types';

const DROP_TIME = 0.28;

/** Slight deterministic yaw of the breakable on a tile (radians); the supply marks follow it. */
export const softTilt = (x: number, y: number): number => ((x * 31 + y * 17) % 5) * 0.03 - 0.06;

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
  /**
   * Marked supply crates (RE-C3) all use one plain wooden crate model so the yellow marking
   * (SupplyMarkViews) sits on a known shape; fixed at the start (supplies never refill).
   */
  private readonly supplyTiles: Set<number>;
  private readonly supplyVariant: SoftVariant | null;
  private readonly width: number;
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
  /** Permanent cover drawn as whole objects (an arena's `ArenaArt.cover`), or null: pillars per tile. */
  private readonly cover: BoardCover | null;
  /** Live quality knob (`QualityProfile.viewClearStride`): the view-clear test runs every Nth frame (never off). */
  private viewStride = 1;
  private readonly viewProj = new Matrix4();
  /** What the last view-clear test looked at (debug / e2e: `viewClearStatus`). */
  private lastPoints = 0;
  /** Tiles the camera-to-fighter test wants faded (cover groups by their representative tile), kept between runs. */
  private readonly rayWant = new Set<number>();
  /** Cover groups (indices of `cover.bounds`) fading from the last test: they use the wider exit pad. */
  private rayBoxes = new Set<number>();
  private rayFrame = 0;
  /** Tests in a row each faded tile has missed (debounce of the release, `holdMisses`). */
  private readonly rayMiss = new Map<number, number>();
  /** Faded structures' blocked tiles drawn on the ground (decisions OX1-OX6); budget = `QualityProfile.occlusionFootprints`. */
  private readonly footprints: OcclusionFootprints;
  /** The fade group (and so the footprint) each covered tile belongs to. */
  private readonly groupAt = new Map<number, CoverBounds>();
  /** Eased footprint strength (0 .. 1) and last distance to the fighter per faded structure (its representative tile). */
  private readonly outline = new Map<number, { strength: number; distance: number }>();
  private readonly ownedMaterials: Material[] = [];
  private readonly ownedTextures: Texture[] = [];
  private readonly ownedGeometries: BufferGeometry[] = [];
  /** A mission sector's render clip (null = the whole board) and its barricades. */
  private readonly clip: CoverClip | null;
  private readonly barricades: SectorBarricades | null;
  /** Soft tiles that are field equipment (drawn by `FieldEquipmentViews`). */
  private readonly equipment: Set<number>;

  constructor(
    state: GameState,
    private readonly layout: Layout,
  ) {
    this.arenaId = state.arenaId;
    this.width = state.width;
    this.supplyTiles = new Set(state.supplies);
    this.supplyVariant = ['prop_soft_crate', 'crate'].find((v) => this.variants.includes(v)) ?? null;
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
      // interlocking road paving (Lekki): drawn by the floor shader, before grit composes its program key with it
      const pavers = maps.paving ? installPaving(floorMat, { width: W, height: H }, maps.paving) : null;
      if (pavers) this.ownedTextures.push(pavers);
    } else {
      // the slab atlas: its loaded maps are this match's own (a cached fallback texture is shared and kept)
      floorMat = floorMaterial(W, H, state.arenaId);
      this.ownedMaterials.push(floorMat);
      for (const t of [floorMat.map, floorMat.normalMap, floorMat.roughnessMap])
        if (t && !isSharedTexture(t)) this.ownedTextures.push(t);
    }
    const floorGeo = new PlaneGeometry(W, H);
    this.ownedGeometries.push(floorGeo);
    const floor = new Mesh(floorGeo, floorMat);
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
    // a mission sector (docs/CAMPAIGN_SECTOR_AI.md): only what can be seen is built, and its barricades are real objects
    const clip = renderClip(state);
    this.clip = clip;
    this.barricades = buildSectorBarricades(state);
    // board cover: grouped concrete drawn as the buildings / buses / piers it stands for
    const arenaCover =
      NEW_ARENA_ART()[state.arenaId]?.cover?.(
        clip ? { width: W, height: H, clip } : { width: W, height: H },
      ) ?? null;
    this.cover = mergeCovers(arenaCover, this.barricades?.cover);
    if (this.cover) {
      this.group.add(this.cover.object);
      for (const b of this.cover.bounds) for (const t of b.tiles) this.groupAt.set(t, b);
    }
    this.footprints = new OcclusionFootprints(this.layout, W);
    this.group.add(this.footprints.group);
    // field equipment (destroyTargets legs) stands on soft tiles but is drawn by its own view, never as a crate
    this.equipment = new Set((state.mission?.field?.targets ?? []).map((t) => t.y * W + t.x));
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
    const contactMat = new MeshBasicMaterial({
      map: contactShadowTexture(),
      color: 0x000000,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    // the set does not own unfaded parts: the view does (they leaked once per match)
    this.ownedGeometries.push(contactGeo);
    owned.push(contactMat);
    this.contact = new InstanceSet([{ geometry: contactGeo, material: contactMat }], W * H);
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
    return this.variantOf(y * this.width + x, x, y);
  }

  private variantOf(i: number, x: number, y: number): SoftVariant {
    return this.supplyVariant !== null && this.supplyTiles.has(i)
      ? this.supplyVariant
      : softVariantFor(x, y, this.variants, this.arenaId);
  }

  /** How far the obstacle on a tile is currently dissolved (0 = solid .. MAX_HIDE); the supply marks follow it. */
  hideAmount(i: number): number {
    return this.hideOf.get(i) ?? 0;
  }

  update(ctx: FrameContext): void {
    const { state, time } = ctx;
    this.barricades?.sync(state);
    for (let i = 0; i < state.tiles.length; i++) {
      const kind = state.tiles[i]!;
      if (this.cache[i] !== kind) {
        const x = i % state.width;
        const y = Math.floor(i / state.width);
        if (!inClip(this.clip, x, y)) {
          this.cache[i] = kind; // outside a mission sector's clip: never seen, never built
          continue;
        }
        this.removeTile(i, x, y, this.cache[i]!);
        this.cache[i] = kind;
        if (kind === Tile.Hard) {
          if (this.coveredAt(i)) continue; // drawn by the board cover
          if (!this.initialHard.has(i)) this.dropping.set(i, time);
          this.placePillar(i, x, y, this.dropping.has(i) ? 6 : 0);
        } else if (kind === Tile.Soft && !this.equipment.has(i)) {
          this.placeSoft(i, x, y);
        }
      }
    }
    this.updateOcclusion(ctx);
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
  private updateOcclusion(ctx: FrameContext): void {
    const { state, dt } = ctx;
    const behind: { x: number; y: number }[] = [];
    for (const p of state.players) if (p.alive) behind.push(p);
    for (const g of state.generators) behind.push(g);
    for (const p of state.pickups) behind.push(p);
    const want = occludingTiles(state.width, state.height, behind);
    // a tall cover object (a shop, a bus) can hide more than the one tile behind it
    const cover = this.cover;
    if (cover)
      for (const o of behind) {
        const x = Math.round(o.x);
        if (x < 0 || x >= state.width) continue;
        for (let k = 2; k <= cover.maxReach; k++) {
          const y = Math.round(o.y) + k;
          if (y < 0 || y >= state.height) continue;
          const i = y * state.width + x;
          if (this.coveredAt(i) && cover.reach(i) >= k) want.add(i);
        }
      }
    this.viewClearTiles(ctx);
    for (const i of this.rayWant) want.add(i);
    // Readability of what fades because it hides the followed fighter (assets/occlusionFootprint.ts): its dither cap
    // and the footprint drawn on the ground depend on how close the fighter is and whether it pushes at the structure.
    const fighter = this.followedFighter(ctx);
    const fade = new Map<number, { cap: number; prox: number; pushing: boolean; distance: number }>();
    if (fighter) {
      const at = playerGridPos(fighter, ctx.alpha);
      const settled = fighter.stepRemaining <= 0;
      for (const rep of this.rayWant) {
        const tiles = this.footprintOf(rep);
        const distance = footprintDistance(tiles, state.width, at.x, at.y);
        const pushing = isPushing(tiles, state.width, fighter.x, fighter.y, fighter.facing, settled);
        const prox = pushing ? 1 : proximity(distance);
        fade.set(rep, { cap: hideFor(prox), prox, pushing, distance });
      }
      // several buildings fading at once: the nearest to the fighter keeps its full cap, the ones behind it a little less
      // (breakable crates are not ranked: they are low and never push a building's cap down)
      [...fade.entries()]
        .filter(([rep]) => this.cache[rep] === Tile.Hard)
        .sort((a, b) => a[1].distance - b[1].distance)
        .forEach(([, f], rank) => {
          f.cap = stackedHide(f.cap, rank);
        });
    } else
      for (const rep of this.rayWant)
        fade.set(rep, { cap: OCCLUSION_LOOK.farHide, prox: 0, pushing: false, distance: Infinity });
    for (const i of want) if (!this.hideOf.has(i)) this.hideOf.set(i, 0);
    for (const [i, cur] of this.hideOf) {
      // what hides the fighter or the floor around it dissolves further than a pillar that merely stands in front;
      // every tile of a faded building follows the building's own cap (not the pillar rule of the tile in front of a player)
      const rep = this.groupAt.get(i)?.tile ?? i;
      const f = fade.get(rep);
      const target = f ? f.cap : want.has(i) ? MAX_HIDE : 0;
      const next = ease(cur, target, dt);
      const x = i % state.width;
      const y = Math.floor(i / state.width);
      const kind = this.cache[i];
      if (kind === Tile.Hard && this.coveredAt(i)) cover!.setHide(i, next);
      else if (kind === Tile.Hard) this.pillars[this.pillarVariant(x, y)]!.setHide(i, next);
      else if (kind === Tile.Soft) this.soft.get(this.variantOf(i, x, y))!.setHide(i, next);
      if (next === 0 && target === 0) this.hideOf.delete(i);
      else this.hideOf.set(i, next);
    }
    this.updateFootprints(fade, dt);
    cover?.commit();
  }

  /** The fighter the camera follows (the local human, or the spectated one), or undefined while nobody is alive to follow. */
  private followedFighter(ctx: FrameContext): Player | undefined {
    const { state, info } = ctx;
    const id = state.players.some((p) => p.id === info.localPlayerId && p.alive)
      ? info.localPlayerId
      : (info.focusPlayerId ?? -1);
    return state.players.find((p) => p.id === id && p.alive);
  }

  /** The tiles a faded structure blocks: its whole fade group (a building), or the one tile of a pillar. */
  private footprintOf(rep: number): readonly number[] {
    return this.groupAt.get(rep)?.tiles ?? [rep];
  }

  /**
   * Draws the footprints of the structures fading because they hide the followed fighter. The strength eases in and
   * out on its own clock (`ease`), follows proximity and pushing, and is 0 for anything not in the view-clear set (a
   * pillar that merely stands in front of someone gets no outline). Breakable crates get none: they are low and keep
   * a solid foot.
   */
  private updateFootprints(
    fade: ReadonlyMap<number, { prox: number; pushing: boolean; distance: number }>,
    dt: number,
  ): void {
    for (const [rep, f] of fade) {
      if (this.cache[rep] !== Tile.Hard) continue;
      const target = outlineStrength(OCCLUSION_LOOK.farHide, f.prox, f.pushing);
      const cur = this.outline.get(rep);
      this.outline.set(rep, {
        strength: ease(cur?.strength ?? 0, target, dt),
        distance: f.distance,
      });
    }
    const entries: FootprintEntry[] = [];
    for (const [rep, cur] of this.outline) {
      if (!fade.has(rep)) {
        const strength = ease(cur.strength, 0, dt);
        if (strength === 0) {
          this.outline.delete(rep);
          continue;
        }
        cur.strength = strength;
      }
      entries.push({
        key: rep,
        tiles: this.footprintOf(rep),
        strength: cur.strength,
        distance: cur.distance,
      });
    }
    this.footprints.update(entries);
  }

  /** Quality (live): how many faded structures get their footprint drawn at once. */
  setFootprintBudget(n: number): void {
    this.footprints.setBudget(n);
  }

  /** Debug / e2e: the footprints on the ground now (structure tiles and strength), strongest first. */
  footprintStatus(): { drawn: number; tracked: number } {
    return { drawn: this.footprints.visibleCount(), tracked: this.outline.size };
  }

  /** Quality: the view-clear test runs every `stride` frames (1 = every frame). It is never switched off. */
  setViewClearStride(stride: number): void {
    this.viewStride = Math.max(1, Math.round(stride));
  }

  /** Debug / e2e: what the view-clear fade is doing now. */
  viewClearStatus(): {
    stride: number;
    groups: number;
    tiles: number;
    points: number;
    fading: number;
    wanted: number[];
    /** Highest dither (0 .. 1) of a structure the view-clear test wants faded, and the footprints on the ground. */
    hide: number;
    footprints: { drawn: number; tracked: number };
  } {
    let fading = 0;
    for (const v of this.hideOf.values()) if (v > 0.3) fading++;
    let hide = 0;
    for (const t of this.rayWant) hide = Math.max(hide, this.hideOf.get(t) ?? 0);
    return {
      stride: this.viewStride,
      groups: this.rayBoxes.size,
      tiles: this.rayWant.size,
      points: this.lastPoints,
      fading,
      wanted: [...this.rayWant],
      hide,
      footprints: this.footprintStatus(),
    };
  }

  /**
   * Refreshes `rayWant`: the cover groups and per-tile obstacles that stand between the camera and anything that
   * must stay readable around the followed fighter - the fighter, the floor disc around it, rivals and generators
   * close by (assets/viewClear.ts, decided from the real camera matrices). Throttled by quality; nothing is
   * returned while the picture is in the clear.
   */
  private viewClearTiles(ctx: FrameContext): void {
    const cam = ctx.camera;
    if (!cam) return;
    if (this.rayFrame++ % this.viewStride !== 0) return;
    const { state, layout } = ctx;
    const me = this.followedFighter(ctx);
    const prev = new Set(this.rayWant);
    this.rayWant.clear();
    if (!me) {
      this.rayBoxes = new Set();
      this.rayMiss.clear();
      this.lastPoints = 0;
      return;
    }
    const w = state.width;
    const tileOf = (x: number, z: number): number => {
      const tx = Math.round(x + w / 2 - 0.5);
      const ty = Math.round(z + state.height / 2 - 0.5);
      return tx < 0 || ty < 0 || tx >= w || ty >= state.height ? -1 : ty * w + tx;
    };
    const grid = playerGridPos(me, ctx.alpha);
    const at = { x: layout.wx(grid.x), z: layout.wz(grid.y) };
    const eye = cam.position;
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const extras: { x: number; z: number; y: number }[] = [];
    const near = VIEW_CLEAR.extraNear;
    for (const q of state.players)
      if (q.alive && q !== me && Math.abs(q.x - grid.x) <= near && Math.abs(q.y - grid.y) <= near) {
        const g = playerGridPos(q, ctx.alpha);
        extras.push({ x: layout.wx(g.x), z: layout.wz(g.y), y: 0.9 });
      }
    for (const g of state.generators)
      if (
        g.mode !== 'disabled' &&
        g.carriedBy === null &&
        Math.abs(g.x - grid.x) <= near &&
        Math.abs(g.y - grid.y) <= near
      )
        extras.push({ x: layout.wx(g.x), z: layout.wz(g.y), y: 0.5 });
    const points: ViewPoint[] = viewPoints({
      fighter: at,
      viewProj: this.viewProj.elements,
      walkable: (x, z) => {
        const t = tileOf(x, z);
        if (t < 0) return false;
        const kind = this.cache[t];
        return kind !== Tile.Hard && kind !== Tile.Soft;
      },
      extras,
    });
    this.lastPoints = points.length;
    const freshBoxes = new Set<number>();
    const fresh = new Set<number>();
    if (this.cover) {
      const bounds = this.cover.bounds;
      for (const b of pickOccludersFor(eye, points, bounds, this.rayBoxes, VIEW_CLEAR, at)) {
        freshBoxes.add(b);
        fresh.add(bounds[b]!.tile);
      }
    }
    // pillars and breakables the board cover does not draw: only the tiles around the view corridor are tested
    const half = 0.5;
    for (const t of regionTiles(at, eye, tileOf, VIEW_CLEAR.haloRadius)) {
      const kind = this.cache[t];
      const solid = kind === Tile.Hard ? !this.coveredAt(t) : kind === Tile.Soft;
      if (!solid) continue;
      const cx = layout.wx(t % w);
      const cz = layout.wz(Math.floor(t / w));
      const top = kind === Tile.Hard ? PILLAR_HEIGHT : SOFT_HEIGHT;
      const box = { minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half, minY: 0, maxY: top };
      if (hidesAny(eye, points, box, prev.has(t), VIEW_CLEAR, at)) fresh.add(t); // hysteresis: prev.has(t)
    }
    // an object leaves only after missing a couple of tests in a row (no blinking along an edge)
    for (const t of holdMisses(prev, fresh, this.rayMiss)) this.rayWant.add(t);
    if (this.cover) {
      const bounds = this.cover.bounds;
      this.rayBoxes = new Set(freshBoxes);
      // a held cover group keeps its wider margin (its box index is looked up by its tile)
      if (this.rayWant.size > fresh.size)
        bounds.forEach((b, i) => {
          if (this.rayWant.has(b.tile) && !fresh.has(b.tile)) this.rayBoxes.add(i);
        });
    }
  }

  /** An original concrete tile the board cover draws (never a crush block dropped in later). */
  private coveredAt(i: number): boolean {
    return this.cover !== null && this.initialHard.has(i) && this.cover.covers(i);
  }

  private removeTile(i: number, x: number, y: number, kind: number): void {
    this.contact.remove(i);
    if (kind === Tile.Hard) this.pillars[this.pillarVariant(x, y)]!.remove(i);
    else if (kind === Tile.Soft && !this.equipment.has(i)) this.soft.get(this.variantOf(i, x, y))!.remove(i);
  }

  /** Debug / tests: the mission sector's render clip and barricades (null without a sector). */
  sectorStatus(): { clip: { x0: number; y0: number; x1: number; y1: number }; barricades: number } | null {
    if (!this.clip) return null;
    return { clip: { ...this.clip }, barricades: this.barricades?.stats().barricades ?? 0 };
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
    this.e.set(0, softTilt(x, y), 0);
    this.q.setFromEuler(this.e);
    this.m.compose(this.p, this.q, this.softScale);
    this.soft.get(this.variantOf(i, x, y))!.set(i, this.m);
    this.s.set(1, 1, 1);
    this.setContact(i, x, y, 0.8);
  }

  dispose(): void {
    for (const p of this.pillars) p.dispose();
    for (const s of this.soft.values()) s.dispose();
    this.contact.dispose();
    this.cover?.dispose();
    this.footprints.dispose();
    for (const m of this.ownedMaterials) m.dispose();
    for (const t of this.ownedTextures) t.dispose();
    for (const g of this.ownedGeometries) g.dispose();
  }
}
