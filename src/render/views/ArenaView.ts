import {
  CircleGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  Euler,
  Group,
  DoubleSide,
} from 'three';
import type { GameState } from '../../sim';
import { Tile } from '../../sim';
import { modelParts, pillarParts, softBlockParts, softVariantFor, softVariants } from '../assets/props';
import type { PropGeometry, SoftVariant } from '../assets/props';
import type { ArenaTheme } from '../themes';
import type { Layout } from '../coords';
import { floorMaterial } from '../assets/floor';
import { contactShadowTexture } from '../textures';
import { InstanceSet } from './InstanceSet';
import type { FrameContext, View } from './types';

const DROP_TIME = 0.28;

/**
 * Floor, permanent obstacles, soft blocks (instanced), crush blocks dropping in, floor hazards; all
 * drawn with the arena theme's models. Permanent tiles that sit in a straight run use the theme's
 * joined model (market counters) turned along the run; isolated ones vary by tile hash.
 */
export class ArenaView implements View {
  readonly group = new Group();
  /** Isolated permanent-obstacle variants, then the joined model (if any) as the last set. */
  private readonly pillars: InstanceSet[];
  private readonly isolatedCount: number;
  /** Set index and yaw chosen for each permanent tile currently drawn. */
  private readonly hardLook = new Map<number, { set: number; yaw: number }>();
  private readonly joinedHeight: number;
  private readonly variants: SoftVariant[];
  private readonly weights: Readonly<Record<string, number>>;
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

  constructor(
    state: GameState,
    private readonly layout: Layout,
    theme: ArenaTheme,
  ) {
    const W = state.width;
    const H = state.height;
    this.variants = softVariants(theme.soft);
    this.weights = theme.soft;
    const floorMat = floorMaterial(W, H, theme.floor, theme.floorFallback);
    floorMat.color.setHex(theme.floorTint);
    const floor = new Mesh(new PlaneGeometry(W, H), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const isolated = theme.hardIsolated.map(modelParts).filter((p): p is PropGeometry[] => p !== null);
    if (isolated.length === 0) {
      const parts = pillarParts();
      isolated.push([parts.body, parts.band, parts.cap]);
    }
    this.isolatedCount = isolated.length;
    this.joinedHeight = theme.hardJoinedHeight;
    const joined = theme.hardJoined ? modelParts(theme.hardJoined) : null;
    this.pillars = [...isolated, ...(joined ? [joined] : [])].map((parts) => new InstanceSet(parts, W * H));
    for (const set of this.pillars) this.group.add(set.group);
    for (const v of this.variants) {
      const set = new InstanceSet(softBlockParts(v), W * H);
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
    this.buildHazardDecals(state);
  }

  private buildHazardDecals(state: GameState): void {
    for (const [key, kind] of Object.entries(state.floorHazards)) {
      const i = Number(key);
      const x = this.layout.wx(i % state.width);
      const z = this.layout.wz(Math.floor(i / state.width));
      const hole = kind === 'pothole';
      const rim = new Mesh(
        new CircleGeometry(hole ? 0.4 : 0.44, 20),
        new MeshStandardMaterial({
          color: hole ? 0x6b625a : 0x2b2540,
          roughness: hole ? 1 : 0.15,
          metalness: hole ? 0 : 0.6,
          side: DoubleSide,
        }),
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(x, 0.014, z);
      rim.receiveShadow = true;
      const core = new Mesh(
        new CircleGeometry(hole ? 0.3 : 0.34, 18),
        new MeshStandardMaterial({
          color: hole ? 0x15110e : 0x4a3d78,
          roughness: hole ? 1 : 0.1,
          metalness: hole ? 0 : 0.8,
        }),
      );
      core.rotation.x = -Math.PI / 2;
      core.position.set(x, 0.018, z);
      this.decals.add(rim, core);
    }
  }

  /** Variant of the soft block at a tile (for debris colours). */
  variantAt(x: number, y: number): SoftVariant {
    return softVariantFor(x, y, this.variants, this.weights);
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
      if (k >= 1) {
        this.dropping.delete(i);
        ctx.fx.dust(x, y, 10, 0.9);
        ctx.fx.shake = Math.min(1, ctx.fx.shake + 0.25);
      }
    }
  }

  private removeTile(i: number, x: number, y: number, kind: number): void {
    this.contact.remove(i);
    if (kind === Tile.Hard) {
      const look = this.hardLook.get(i);
      if (look) this.pillars[look.set]!.remove(i);
      this.hardLook.delete(i);
    } else if (kind === Tile.Soft) this.soft.get(this.variantAt(x, y))!.remove(i);
  }

  /** Joined model along a straight run of original permanent tiles, else an isolated variant. */
  private hardLookFor(i: number, x: number, y: number, W: number): { set: number; yaw: number } {
    const joined = this.pillars.length > this.isolatedCount && this.initialHard.has(i);
    if (joined) {
      const run = (dx: number, dy: number): boolean =>
        x + dx >= 0 && x + dx < W && this.initialHard.has(i + dx + dy * W);
      if (run(1, 0) || run(-1, 0)) return { set: this.isolatedCount, yaw: 0 };
      if (run(0, 1) || run(0, -1)) return { set: this.isolatedCount, yaw: Math.PI / 2 };
    }
    return { set: (x * 5 + y * 3 + ((x ^ y) & 3)) % this.isolatedCount, yaw: 0 };
  }

  private placePillar(i: number, x: number, y: number, lift: number): void {
    let look = this.hardLook.get(i);
    if (!look) {
      look = this.hardLookFor(i, x, y, this.layout.width);
      this.hardLook.set(i, look);
    }
    this.p.set(this.layout.wx(x), lift, this.layout.wz(y));
    this.e.set(0, look.yaw, 0);
    this.q.setFromEuler(this.e);
    this.s.set(1, look.set >= this.isolatedCount ? this.joinedHeight : 1, 1);
    this.m.compose(this.p, this.q, this.s);
    this.s.set(1, 1, 1);
    this.pillars[look.set]!.set(i, this.m);
    if (lift === 0) this.setContact(i, x, y, 1);
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
    this.e.set(0, ((x * 31 + y * 17) % 7) * 0.05 - 0.15, 0);
    this.q.setFromEuler(this.e);
    this.s.set(1, 1, 1);
    this.m.compose(this.p, this.q, this.s);
    this.soft.get(this.variantAt(x, y))!.set(i, this.m);
    this.setContact(i, x, y, 0.85);
  }

  dispose(): void {
    for (const p of this.pillars) p.dispose();
    for (const s of this.soft.values()) s.dispose();
    this.contact.dispose();
  }
}
