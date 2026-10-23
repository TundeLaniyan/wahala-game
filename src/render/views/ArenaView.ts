import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
  Euler,
  Group,
  DoubleSide,
  Color,
} from 'three';
import type { Material } from 'three';
import { arenaLook } from '../arenaLook';
import type { GameState } from '../../sim';
import { Tile } from '../../sim';
import { modelledPillars, pillarParts, softBlockParts, softVariantFor, softVariants } from '../assets/props';
import type { SoftVariant } from '../assets/props';
import type { Layout } from '../coords';
import { floorMaterial } from '../assets/floor';
import { ankaraTexture, chevronBandTexture, contactShadowTexture, floorMarkingsTexture } from '../textures';
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
/** Height of the modelled pillar cap once scaled (accents sit on it). */
const PILLAR_TOP = 1.1 * PILLAR_SCALE.y;

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

  constructor(
    state: GameState,
    private readonly layout: Layout,
  ) {
    this.arenaId = state.arenaId;
    const W = state.width;
    const H = state.height;
    const floor = new Mesh(new PlaneGeometry(W, H), floorMaterial(W, H, state.arenaId));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
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
        new InstanceSet([...tinted([parts.body, parts.band, parts.cap], look.pillarTint, owned), ...wraps], W * H),
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
    const markings = new Mesh(
      new PlaneGeometry(W, H),
      new MeshStandardMaterial({
        map: floorMarkingsTexture(state.arenaId, W, H),
        transparent: true,
        depthWrite: false,
        roughness: 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    markings.rotation.x = -Math.PI / 2;
    markings.position.y = 0.004;
    markings.receiveShadow = true;
    markings.renderOrder = 1;
    this.decals.add(markings);
    this.buildHazardDecals(state);
    this.buildArenaPillarAccents(state);
  }

  private buildHazardDecals(state: GameState): void {
    const rubbleGeo = new BoxGeometry(0.09, 0.045, 0.07);
    const rubbleMat = new MeshStandardMaterial({ color: 0x5c534a, roughness: 0.95 });
    for (const [key, kind] of Object.entries(state.floorHazards)) {
      const i = Number(key);
      const x = this.layout.wx(i % state.width);
      const z = this.layout.wz(Math.floor(i / state.width));
      const hole = kind === 'pothole';
      const rim = new Mesh(
        new CircleGeometry(hole ? 0.43 : 0.46, 20),
        new MeshStandardMaterial({
          color: hole ? 0x62584f : 0x1b1828,
          roughness: hole ? 0.95 : 0.12,
          metalness: hole ? 0 : 0.75,
          side: DoubleSide,
        }),
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(x, 0.014, z);
      rim.receiveShadow = true;
      const core = new Mesh(
        new CircleGeometry(hole ? 0.31 : 0.36, 18),
        new MeshStandardMaterial({
          color: hole ? 0x14100d : 0x3b2d6e,
          roughness: hole ? 0.35 : 0.08,
          metalness: hole ? 0.2 : 0.85,
        }),
      );
      core.rotation.x = -Math.PI / 2;
      core.position.set(x, 0.018, z);
      this.decals.add(rim, core);
      if (hole) {
        // Broken asphalt rubble chunks around the pothole rim
        for (let k = 0; k < 5; k++) {
          const ang = (k * Math.PI * 2) / 5 + (i % 3) * 0.4;
          const chunk = new Mesh(rubbleGeo, rubbleMat);
          chunk.position.set(x + Math.cos(ang) * 0.35, 0.024, z + Math.sin(ang) * 0.35);
          chunk.rotation.y = ang * 1.7;
          this.decals.add(chunk);
        }
      } else {
        // Iridescent petroleum rainbow sheen ring on the oil slick
        const sheen = new Mesh(
          new RingGeometry(0.16, 0.29, 18),
          new MeshStandardMaterial({
            color: 0x28b8d8,
            emissive: 0x245878,
            emissiveIntensity: 0.35,
            roughness: 0.08,
            metalness: 0.9,
            side: DoubleSide,
          }),
        );
        sheen.rotation.x = -Math.PI / 2;
        sheen.position.set(x + 0.03, 0.021, z - 0.02);
        this.decals.add(sheen);
      }
    }
  }

  /**
   * Arena-specific dressing instanced with every pillar (model space, before PILLAR_SCALE):
   * market pillars are wrapped in Ankara cloth like stall posts; roadworks pillars carry red/white
   * reflective chevron bands like jersey barriers. The bus park keeps the plain poster pillars.
   */
  private pillarWraps(arenaId: string): { geometry: BoxGeometry; material: Material }[] {
    if (arenaId === 'balogunMarket') {
      const m = new MeshStandardMaterial({ map: ankaraTexture(), alphaTest: 0.5, roughness: 0.82 });
      this.ownedMaterials.push(m);
      return [{ geometry: new BoxGeometry(0.905, 0.52, 0.905).translate(0, 0.74, 0), material: m }];
    }
    if (arenaId === 'lekkiRoadworks') {
      const map = chevronBandTexture().clone();
      map.needsUpdate = true;
      map.repeat.set(2, 1);
      const m = new MeshStandardMaterial({ map, roughness: 0.32, metalness: 0.05 });
      this.ownedMaterials.push(m);
      return [
        { geometry: new BoxGeometry(0.89, 0.14, 0.89).translate(0, 0.88, 0), material: m },
        { geometry: new BoxGeometry(0.89, 0.14, 0.89).translate(0, 0.56, 0), material: m },
      ];
    }
    return [];
  }

  /** Distinct visual accents atop permanent interior pillars for Balogun Market and Lekki Roadworks. */
  private buildArenaPillarAccents(state: GameState): void {
    if (state.arenaId !== 'balogunMarket' && state.arenaId !== 'lekkiRoadworks') return;
    const isMarket = state.arenaId === 'balogunMarket';
    const marketColors = [0xe63946, 0xffbe0b, 0x1d6fe0, 0x169852, 0x8338ec, 0xfb5607];
    const basinGeo = new CylinderGeometry(0.20, 0.14, 0.12, 12);
    const goodsGeo = new CylinderGeometry(0.15, 0.18, 0.07, 10);
    const coneGeo = new CylinderGeometry(0.03, 0.12, 0.32, 10);
    const bandGeo = new CylinderGeometry(0.065, 0.09, 0.09, 10);
    const coneMat = new MeshStandardMaterial({ color: 0xff5a0e, roughness: 0.45 });
    const whiteMat = new MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.5 });

    for (const i of this.initialHard) {
      const gx = i % state.width;
      const gy = Math.floor(i / state.width);
      const wx = this.layout.wx(gx);
      const wz = this.layout.wz(gy);
      const h = (gx * 7 + gy * 13) % 6;
      if (isMarket) {
        // Folded Ankara fabric stack & enamel produce basin perched on the concrete pillar cap
        const col2 = marketColors[(h + 2) % marketColors.length]!;
        // the cloth wrap carries the colour; only every fourth stall shows an enamel basin of produce
        if ((gx + gy) % 4 === 0) {
          const basin = new Mesh(basinGeo, new MeshStandardMaterial({ color: col2, roughness: 0.4 }));
          basin.position.set(wx + 0.07, PILLAR_TOP + 0.05, wz - 0.05);
          const goods = new Mesh(goodsGeo, new MeshStandardMaterial({ color: 0xf4a226, roughness: 0.75 }));
          goods.position.set(wx + 0.07, PILLAR_TOP + 0.11, wz - 0.05);
          this.decals.add(basin, goods);
        }
      } else if ((gx + gy) % 4 === 0) {
        // Lekki Roadworks: bright orange/white traffic cone perched on select pillars
        const cone = new Mesh(coneGeo, coneMat);
        cone.position.set(wx, PILLAR_TOP + 0.16, wz);
        const stripe = new Mesh(bandGeo, whiteMat);
        stripe.position.set(wx, PILLAR_TOP + 0.15, wz);
        this.decals.add(cone, stripe);
      }
    }
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
  }
}
