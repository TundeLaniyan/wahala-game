import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { BufferGeometry, Texture } from 'three';
import * as sim from '../../sim';
import { Tile } from '../../sim';
import type { Dir, GameState, RaidCargoView, RaidDoorView, RaidView, SimEvent } from '../../sim';
import { mat } from '../assets/helpers';
import { ringTexture, tileGlowTexture } from '../textures';
import {
  RAID_COLORS,
  beltPhase,
  beltYaw,
  cargoLook,
  doorLook,
  extractionLook,
  shipmentTelegraph,
  warningColor,
} from './raidStyle';
import {
  barrelTexture,
  beamTexture,
  beltTexture,
  chevronsTexture,
  crackDecal,
  crateFaceTexture,
  disposeRaidTextures,
  frameTexture,
  hatchTexture,
  lockTexture,
  markedFaceTexture,
  padTexture,
  shutterTexture,
} from './raidTextures';
import { TileOverlay } from './TileOverlay';
import type { Effects } from '../fx/Effects';
import type { Layout } from '../coords';
import type { FrameContext, View } from './types';

/** Where a view gets the raid from: `raidView(state)` once raid-sim ships it, tests pass a fixture. */
export type RaidSource = (state: GameState) => RaidView | null;

/**
 * The default source. The contract (src/sim/raid/types.ts) says `raidView(state)` builds the `RaidView` from `state.raid`
 * and is null outside a raid; it is looked up at run time so this module builds before raid-sim's runtime lands, and a
 * match without `state.raid` costs one property read.
 */
export const defaultRaidSource: RaidSource = (state) => {
  if (!(state as { raid?: unknown }).raid) return null;
  const fn = (sim as unknown as { raidView?: RaidSource }).raidView;
  return fn ? fn(state) : null;
};

export interface RaidViewStats {
  cargo: number;
  belts: number;
  shipments: number;
  doors: number;
  marked: number;
  crates: number;
  barrels: number;
  cracks: number;
  rings: number;
  warnTiles: number;
  locked: number;
  extraction: boolean;
  visible: boolean;
  updateMs: number;
}

/** A classic raid: the sim has a raid runtime on the state, or the match kind says so. */
export function isRaidMatch(state: GameState): boolean {
  return state.settings.game === 'raid' || !!(state as { raid?: unknown }).raid;
}

const CAP = { crates: 128, marked: 48, barrels: 64, ships: 24, cracks: 160 };
const MAX_TILES = 256;

/** A dense, camera-readable batch of identical meshes drawn in one call (matrices rewritten each frame). */
class Batch {
  readonly mesh: InstancedMesh;
  private n = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly p = new Vector3();
  private readonly s = new Vector3();

  constructor(
    geometry: BufferGeometry,
    material: MeshStandardMaterial | MeshBasicMaterial,
    capacity: number,
    shadows = true,
  ) {
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0;
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = shadows;
    this.mesh.frustumCulled = false;
  }

  begin(): void {
    this.n = 0;
  }

  push(x: number, y: number, z: number, yaw = 0, sx = 1, sy = sx, sz = sx): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.q.setFromEuler(this.e.set(0, yaw, 0));
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.mesh.setMatrixAt(this.n++, this.m);
  }

  get count(): number {
    return this.n;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose();
  }
}

interface Belt {
  key: string;
  mesh: InstancedMesh;
  texture: Texture;
  material: MeshStandardMaterial;
}

interface Ship {
  group: Group;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  since: number;
}

interface DoorMarker {
  group: Group;
  span: Group;
  shutter: Mesh;
  lockSprite: Sprite;
  chain: Group;
  frame: Mesh[];
  locked: boolean;
  openedAt: number | null;
}

/** The world markers of a classic raid (docs/RAID_PRESENTATION.md). A no-op without a raid: hidden, nothing built. */
export class RaidViews implements View {
  readonly group = new Group();
  // ---- shared geometry and materials (one per kind, never per item)
  private readonly boxGeo = new BoxGeometry(0.8, 0.8, 0.8).translate(0, 0.4, 0);
  private readonly crackBoxGeo = new BoxGeometry(0.815, 0.815, 0.815).translate(0, 0.4, 0);
  private readonly barrelGeo = new CylinderGeometry(0.34, 0.34, 0.8, 14).translate(0, 0.4, 0);
  private readonly crackBarrelGeo = new CylinderGeometry(0.35, 0.35, 0.81, 14, 1, true).translate(0, 0.4, 0);
  private readonly palletGeo = new BoxGeometry(0.92, 0.1, 0.92).translate(0, 0.05, 0);
  private readonly plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly beltGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly beamGeo = new CylinderGeometry(0.16, 0.24, 3, 14, 1, true);
  private readonly mats: (MeshStandardMaterial | MeshBasicMaterial | SpriteMaterial)[] = [];

  private readonly crates: Batch;
  private readonly marked: Batch;
  private readonly barrels: Batch;
  private readonly pallets: Batch;
  private readonly ships: Batch;
  private readonly boxCracks: [Batch, Batch];
  private readonly barrelCracks: [Batch, Batch];
  private readonly rings = new TileOverlay(ringTexture(), 48, 7, 0.045);
  private readonly warnGlow = new TileOverlay(tileGlowTexture(), MAX_TILES, 10, 0.05);
  private readonly warnHatch = new TileOverlay(hatchTexture(), MAX_TILES, 11, 0.055, false);
  private readonly warnEdge = new TileOverlay(frameTexture(), MAX_TILES, 12, 0.06);
  private readonly doorFrames = new TileOverlay(frameTexture(), 16, 9, 0.04);

  private readonly belts = new Map<string, Belt>();
  private readonly shipMarkers = new Map<string, Ship>();
  private readonly doors = new Map<string, DoorMarker>();
  private readonly hitAt = new Map<string, number>();
  private readonly seen = new Map<string, number>();
  private extraction: {
    group: Group;
    padMat: MeshBasicMaterial;
    chevMat: MeshBasicMaterial;
    beamMat: MeshBasicMaterial;
    pad: Mesh;
    chev: Mesh;
    beam: Mesh;
    chevTex: Texture;
  } | null = null;
  private extractionOpenedAt: number | null = null;
  private now = 0;
  private hidden = false;
  private updateMs = 0;
  private counts = { cargo: 0, belts: 0, shipments: 0, doors: 0 };
  /** Door ids that opened by event this frame (the animation starts on the event, not only on the state flip). */
  private readonly openedByEvent = new Set<string>();

  constructor(private readonly source: RaidSource = defaultRaidSource) {
    this.group.visible = false;
    const crate = this.track(
      new MeshStandardMaterial({ map: crateFaceTexture(), roughness: 0.88, metalness: 0.02 }),
    );
    const marked = this.track(
      new MeshStandardMaterial({
        map: markedFaceTexture(),
        roughness: 0.7,
        emissive: RAID_COLORS.marked,
        emissiveIntensity: 0.16,
      }),
    );
    const barrel = this.track(
      new MeshStandardMaterial({ map: barrelTexture(), roughness: 0.6, metalness: 0.3 }),
    );
    const pallet = this.track(new MeshStandardMaterial({ color: 0x6b5233, roughness: 0.95 }));
    const ship = this.track(
      new MeshStandardMaterial({ map: crateFaceTexture(), color: RAID_COLORS.shipment, roughness: 0.8 }),
    );
    this.crates = new Batch(this.boxGeo, crate, CAP.crates);
    this.marked = new Batch(this.boxGeo, marked, CAP.marked);
    this.barrels = new Batch(this.barrelGeo, barrel, CAP.barrels);
    this.pallets = new Batch(this.palletGeo, pallet, CAP.ships);
    this.ships = new Batch(this.boxGeo, ship, CAP.ships);
    const crackMat = (level: 1 | 2): MeshBasicMaterial =>
      this.track(
        new MeshBasicMaterial({
          map: crackDecal(level),
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
      );
    const c1 = crackMat(1);
    const c2 = crackMat(2);
    this.boxCracks = [
      new Batch(this.crackBoxGeo, c1, CAP.cracks, false),
      new Batch(this.crackBoxGeo, c2, CAP.cracks, false),
    ];
    this.barrelCracks = [
      new Batch(this.crackBarrelGeo, c1, CAP.cracks, false),
      new Batch(this.crackBarrelGeo, c2, CAP.cracks, false),
    ];
    for (const b of this.batches()) this.group.add(b.mesh);
    this.group.add(
      this.rings.mesh,
      this.doorFrames.mesh,
      this.warnGlow.mesh,
      this.warnHatch.mesh,
      this.warnEdge.mesh,
    );
    for (const b of this.boxCracks) b.mesh.renderOrder = 3;
    for (const b of this.barrelCracks) b.mesh.renderOrder = 3;
  }

  private batches(): Batch[] {
    return [
      this.crates,
      this.marked,
      this.barrels,
      this.pallets,
      this.ships,
      ...this.boxCracks,
      ...this.barrelCracks,
    ];
  }

  private track<T extends MeshStandardMaterial | MeshBasicMaterial | SpriteMaterial>(m: T): T {
    this.mats.push(m);
    return m;
  }

  /** Debug / performance report: stop drawing (the update still runs) so a frame can be measured with and without. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) this.group.visible = false;
  }

  /** What is on the board right now (tests / the debug handle). */
  stats(): RaidViewStats {
    return {
      cargo: this.counts.cargo,
      belts: this.counts.belts,
      shipments: this.counts.shipments,
      doors: this.counts.doors,
      marked: this.marked.count,
      crates: this.crates.count,
      barrels: this.barrels.count,
      cracks:
        this.boxCracks[0].count +
        this.boxCracks[1].count +
        this.barrelCracks[0].count +
        this.barrelCracks[1].count,
      rings: this.rings.mesh.count,
      warnTiles: this.warnHatch.mesh.count,
      locked: [...this.doors.values()].filter((d) => d.locked).length,
      extraction: !!this.extraction?.group.visible,
      visible: this.group.visible,
      updateMs: Math.round(this.updateMs * 1000) / 1000,
    };
  }

  // ------------------------------------------------------------------------------------------ events

  /** One-shot reactions: hit punches, debris, a door opening, the exit appearing. Words are HUD rail notices. */
  handleEvents(events: readonly SimEvent[], fx: Effects, layout: Layout): void {
    for (const e of events) {
      switch (e.type) {
        case 'cargoHit':
          this.hitAt.set(e.id, this.now);
          fx.dust(e.x, e.y, 3, 0.35);
          fx.shake = Math.min(1, fx.shake + 0.06);
          break;
        case 'cargoDestroyed':
          this.hitAt.delete(e.id);
          fx.blockDebris(e.x, e.y, e.kind === 'barrel' ? 'concrete' : 'crate');
          fx.dust(e.x, e.y, e.marked ? 10 : 5, e.marked ? 0.8 : 0.5);
          if (e.marked) fx.sparkle(e.x, e.y, RAID_COLORS.marked);
          break;
        case 'raidDoorOpened':
          this.openedByEvent.add(e.id);
          fx.dust(e.x, e.y, 6, 0.5);
          fx.sparkle(e.x, e.y, RAID_COLORS.doorOpen);
          break;
        case 'raidExtractionOpened':
          this.extractionOpenedAt = this.now;
          fx.shockwave(layout.wx(e.x), layout.wz(e.y), 2.2, RAID_COLORS.extraction);
          fx.sparkle(e.x, e.y, RAID_COLORS.extraction);
          break;
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------------------------------------ frame

  update(ctx: FrameContext): void {
    const raid = this.source(ctx.state);
    if (!raid) {
      if (this.group.visible) this.group.visible = false;
      return;
    }
    const t0 = performance.now();
    this.now = ctx.time;
    this.group.visible = !this.hidden;
    const { layout, state } = ctx;
    this.updateCargo(ctx, raid, layout);
    this.updateBelts(ctx, raid, layout);
    this.updateShipments(ctx, raid, layout);
    this.updateWarnings(ctx, raid, layout, state.width);
    this.updateDoors(ctx, raid, layout);
    this.updateExtraction(ctx, raid, layout);
    this.openedByEvent.clear();
    this.updateMs += (performance.now() - t0 - this.updateMs) * 0.1;
  }

  // ------------------------------------------------------------------------------------------ cargo

  private updateCargo(ctx: FrameContext, raid: RaidView, layout: Layout): void {
    const bs = this.batches();
    for (const b of bs) b.begin();
    this.rings.begin();
    let n = 0;
    const alive = new Set<string>();
    for (const c of raid.cargo) {
      if (c.state === 'destroyed') continue;
      alive.add(c.id);
      n++;
      this.placeCargo(c, ctx.time, layout);
    }
    for (const id of this.hitAt.keys())
      if (!alive.has(id) && ctx.time - (this.hitAt.get(id) ?? 0) > 1) this.hitAt.delete(id);
    for (const b of bs) b.end();
    this.rings.end();
    this.counts.cargo = n;
  }

  private placeCargo(c: RaidCargoView, time: number, layout: Layout): void {
    const x = layout.wx(c.x);
    const z = layout.wz(c.y);
    const hit = this.hitAt.get(c.id);
    const look = cargoLook(c, time, hit === undefined ? Infinity : time - hit);
    const barrel = c.kind === 'barrel';
    // a tiny deterministic yaw per id so a stack of plain crates does not look like a grid of clones
    const yaw = c.marked ? 0 : ((hashId(c.id) % 7) - 3) * 0.035;
    const sy = look.scale;
    if (barrel) this.barrels.push(x, 0, z, yaw, sy);
    else if (look.marked) this.marked.push(x, 0, z, 0, sy);
    else this.crates.push(x, 0, z, yaw, sy);
    if (look.crack > 0) {
      const set = barrel ? this.barrelCracks : this.boxCracks;
      set[look.crack - 1]!.push(x, 0, z, barrel ? 0 : yaw, sy);
    }
    if (look.marked)
      this.rings.push({
        x,
        z,
        color: look.ringColor,
        intensity: look.ring,
        scale: 1.55 + 0.08 * Math.sin(time * 3.4),
      });
  }

  // ------------------------------------------------------------------------------------------ belts

  private updateBelts(ctx: FrameContext, raid: RaidView, layout: Layout): void {
    const live = new Set<string>();
    for (const belt of raid.conveyors) {
      live.add(belt.id);
      const key = belt.tiles.map((t) => `${t.x},${t.y},${t.dir}`).join('|') + `@${belt.stepTicks}`;
      let b = this.belts.get(belt.id);
      if (b && b.key !== key) {
        this.disposeBelt(b);
        b = undefined;
      }
      if (!b) {
        b = this.createBelt(key, belt.tiles, layout);
        this.belts.set(belt.id, b);
      }
      // the texture runs along +u of each tile (rotated per tile): one full tile per step, locked to the sim clock
      b.texture.offset.x = -beltPhase(ctx.state.tick, ctx.alpha, belt.stepTicks);
    }
    for (const [id, b] of this.belts)
      if (!live.has(id)) {
        this.disposeBelt(b);
        this.belts.delete(id);
      }
    this.counts.belts = this.belts.size;
  }

  private createBelt(key: string, tiles: { x: number; y: number; dir: Dir }[], layout: Layout): Belt {
    const texture = beltTexture().clone();
    texture.needsUpdate = true;
    const material = new MeshStandardMaterial({
      map: texture,
      roughness: 0.85,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const mesh = new InstancedMesh(this.beltGeo, material, Math.max(1, tiles.length));
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    tiles.forEach((t, i) => {
      q.setFromEuler(e.set(0, beltYaw(t.dir), 0));
      m.compose(new Vector3(layout.wx(t.x), 0.03, layout.wz(t.y)), q, new Vector3(0.98, 1, 0.98));
      mesh.setMatrixAt(i, m);
    });
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    return { key, mesh, texture, material };
  }

  private disposeBelt(b: Belt): void {
    this.group.remove(b.mesh);
    b.mesh.dispose();
    b.texture.dispose();
    b.material.dispose();
  }

  // ------------------------------------------------------------------------------------------ shipments

  private updateShipments(ctx: FrameContext, raid: RaidView, layout: Layout): void {
    this.pallets.begin();
    this.ships.begin();
    const live = new Set<string>();
    for (const s of raid.shipments) {
      live.add(s.id);
      let m = this.shipMarkers.get(s.id);
      if (!m) {
        m = { group: new Group(), fromX: s.x, fromY: s.y, toX: s.x, toY: s.y, since: -Infinity };
        this.shipMarkers.set(s.id, m);
      }
      if (m.toX !== s.x || m.toY !== s.y) {
        // it moved one tile: glide from where it was drawn to the new tile over a short, fixed time
        m.fromX = m.toX;
        m.fromY = m.toY;
        m.toX = s.x;
        m.toY = s.y;
        m.since = ctx.time;
      }
      const k = Math.min(1, (ctx.time - m.since) / 0.18);
      const gx = m.fromX + (m.toX - m.fromX) * k;
      const gy = m.fromY + (m.toY - m.fromY) * k;
      const x = layout.wx(gx);
      const z = layout.wz(gy);
      const wobble = s.warnTicks > 0 ? 0.015 * Math.sin(ctx.time * 40) : 0; // about to move: it shudders
      this.pallets.push(x, 0.03, z, 0);
      this.ships.push(x + wobble, 0.13, z, 0, 0.9);
    }
    for (const id of this.shipMarkers.keys()) if (!live.has(id)) this.shipMarkers.delete(id);
    this.pallets.end();
    this.ships.end();
    this.counts.shipments = raid.shipments.length;
  }

  // ------------------------------------------------------------------------------------------ warnings

  private updateWarnings(ctx: FrameContext, raid: RaidView, layout: Layout, width: number): void {
    const { time, alpha } = ctx;
    this.warnGlow.begin();
    this.warnHatch.begin();
    this.warnEdge.begin();
    const drawn = new Set<number>();
    const push = (idx: number, color: number, progress: number, urgent: boolean): void => {
      if (drawn.has(idx)) return;
      drawn.add(idx);
      const x = layout.wx(idx % width);
      const z = layout.wz(Math.floor(idx / width));
      this.warnGlow.push({ x, z, color, intensity: 0.3 + 0.5 * progress, scale: 0.97 });
      this.warnHatch.push({
        x,
        z,
        color,
        intensity: urgent ? 0.8 + 0.2 * Math.sin(time * 22) : 1,
        scale: 0.3 + 0.66 * progress,
      });
      this.warnEdge.push({ x, z, color, intensity: 0.5 + 0.5 * progress, scale: 1 });
    };
    const keys = new Set<string>();
    for (const w of raid.warnings) {
      if (w.kind === 'projectile') continue; // drawn as a path preview by the projectile view
      const key = `${w.kind}:${w.tiles[0] ?? -1}:${w.tiles.length}`;
      keys.add(key);
      const remaining = Math.max(0, w.remainingTicks - alpha);
      const total = Math.max(this.seen.get(key) ?? 0, w.remainingTicks, 1);
      this.seen.set(key, total);
      const progress = 1 - remaining / total;
      for (const idx of w.tiles) push(idx, warningColor(w.kind), progress, progress > 0.75);
    }
    // a shipment about to move shows its next tiles even when the sim sent no separate warning for it
    for (const s of raid.shipments)
      for (const idx of shipmentTelegraph(s, layout.width, layout.height))
        push(idx, warningColor('shipment'), 0.6 + 0.2 * Math.sin(time * 8), s.warnTicks < 20);
    for (const k of this.seen.keys()) if (!keys.has(k)) this.seen.delete(k);
    this.warnGlow.end();
    this.warnHatch.end();
    this.warnEdge.end();
  }

  // ------------------------------------------------------------------------------------------ doors

  private createDoor(): DoorMarker {
    const group = new Group();
    const span = new Group();
    const steel = mat(0x4a4d52, { roughness: 0.55, metalness: 0.6 });
    const paint = mat(RAID_COLORS.doorLocked, { roughness: 0.6, metalness: 0.2 });
    const posts: Mesh[] = [];
    for (const sx of [-0.5, 0.5]) {
      const post = new Mesh(new BoxGeometry(0.12, 1.4, 0.18), paint);
      post.position.set(sx, 0.7, 0);
      posts.push(post);
      span.add(post);
    }
    const lintel = new Mesh(new BoxGeometry(1.12, 0.14, 0.2), paint);
    lintel.position.set(0, 1.4, 0);
    span.add(lintel);
    posts.push(lintel);
    const shutterMat = this.track(
      new MeshStandardMaterial({ map: shutterTexture(), roughness: 0.7, metalness: 0.45 }),
    );
    const shutter = new Mesh(new BoxGeometry(0.94, 1.3, 0.1), shutterMat);
    shutter.castShadow = true;
    span.add(shutter);
    const chain = new Group();
    for (const rz of [0.75, -0.75]) {
      const bar = new Mesh(new BoxGeometry(0.06, 1.5, 0.05), steel);
      bar.rotation.z = rz;
      bar.position.set(0, 0.65, 0.09);
      chain.add(bar);
    }
    span.add(chain);
    const lockMat = this.track(
      new SpriteMaterial({
        map: lockTexture(),
        color: RAID_COLORS.lock,
        transparent: true,
        depthWrite: false,
      }),
    );
    const lockSprite = new Sprite(lockMat);
    lockSprite.scale.set(0.62, 0.62, 1);
    lockSprite.position.set(0, 0.75, 0.3);
    lockSprite.renderOrder = 20;
    group.add(span, lockSprite);
    this.group.add(group);
    return { group, span, shutter, lockSprite, chain, frame: posts, locked: true, openedAt: null };
  }

  private updateDoors(ctx: FrameContext, raid: RaidView, layout: Layout): void {
    this.doorFrames.begin();
    const live = new Set<string>();
    for (const d of raid.doors) {
      live.add(d.id);
      let m = this.doors.get(d.id);
      if (!m) {
        m = this.createDoor();
        m.locked = d.locked;
        // seen already open the first time: no animation
        m.openedAt = d.locked ? null : -Infinity;
        m.span.rotation.y = doorSpansZ(ctx.state, d) ? Math.PI / 2 : 0;
        this.doors.set(d.id, m);
      }
      if (m.locked && !d.locked) m.openedAt = ctx.time; // the state flipped: the opening animation starts now
      if (this.openedByEvent.has(d.id) && m.openedAt === null) m.openedAt = ctx.time;
      if (d.locked) m.openedAt = null;
      m.locked = d.locked;
      const since = d.locked ? Infinity : m.openedAt === null ? -Infinity : ctx.time - m.openedAt;
      const look = doorLook(d, d.locked ? 0 : Math.max(0, since));
      const x = layout.wx(d.x);
      const z = layout.wz(d.y);
      m.group.position.set(x, 0, z);
      const full = 1.3;
      const h = Math.max(0.04, full * (1 - look.lift));
      m.shutter.scale.y = h / full;
      m.shutter.position.y = 1.35 - h / 2;
      m.shutter.visible = h > 0.05;
      m.lockSprite.visible = look.lock > 0.02;
      (m.lockSprite.material as SpriteMaterial).opacity = look.lock;
      m.chain.visible = look.chain < 0.98;
      m.chain.position.y = -look.chain * 1.1;
      m.chain.rotation.x = look.chain * 0.9;
      const paint = mat(look.color, { roughness: 0.6, metalness: 0.2 });
      for (const p of m.frame) p.material = paint;
      this.doorFrames.push({
        x,
        z,
        color: look.color,
        intensity: d.locked ? 0.55 + 0.25 * Math.sin(ctx.time * 3) : 0.95,
        scale: 1.02,
      });
    }
    for (const [id, m] of this.doors)
      if (!live.has(id)) {
        this.group.remove(m.group);
        this.doors.delete(id);
      }
    this.doorFrames.end();
    this.counts.doors = this.doors.size;
  }

  // ------------------------------------------------------------------------------------------ extraction

  private createExtraction(): NonNullable<RaidViews['extraction']> {
    const additive = (map: Texture): MeshBasicMaterial =>
      this.track(
        new MeshBasicMaterial({
          map,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
          color: RAID_COLORS.extraction,
        }),
      );
    const padMat = additive(padTexture());
    const chevTex = chevronsTexture().clone();
    chevTex.wrapS = chevTex.wrapT = RepeatWrapping;
    chevTex.needsUpdate = true;
    const chevMat = additive(chevTex);
    const beamMat = additive(beamTexture());
    const pad = new Mesh(this.plane, padMat);
    pad.position.y = 0.04;
    pad.renderOrder = 6;
    const chev = new Mesh(this.plane, chevMat);
    chev.position.y = 0.05;
    chev.renderOrder = 7;
    const beam = new Mesh(this.beamGeo, beamMat);
    beam.position.y = 1.55;
    beam.renderOrder = 13;
    const group = new Group();
    group.add(pad, chev, beam);
    group.visible = false;
    this.group.add(group);
    return { group, padMat, chevMat, beamMat, pad, chev, beam, chevTex };
  }

  private updateExtraction(ctx: FrameContext, raid: RaidView, layout: Layout): void {
    if (!raid.extraction.open) {
      if (this.extraction) this.extraction.group.visible = false;
      return;
    }
    this.extraction ??= this.createExtraction();
    const ex = this.extraction;
    // an exit that is already open when first seen (a loaded game) has no grow-in
    if (this.extractionOpenedAt === null) this.extractionOpenedAt = -Infinity;
    const look = extractionLook(true, ctx.time - this.extractionOpenedAt, ctx.time);
    ex.group.visible = look.visible;
    ex.group.position.set(layout.wx(raid.extraction.x), 0, layout.wz(raid.extraction.y));
    const s = 1.9 * look.scale;
    ex.pad.scale.setScalar(s);
    ex.chev.scale.setScalar(s * 0.62);
    ex.padMat.opacity = 0.55 + 0.4 * look.pulse;
    ex.chevMat.opacity = 0.7 + 0.3 * look.pulse;
    ex.chevTex.offset.y = -((ctx.time * 0.7) % 1);
    ex.beam.scale.set(1, Math.max(0.01, look.beam), 1);
    ex.beam.position.y = 0.05 + (3 * Math.max(0.01, look.beam)) / 2;
    ex.beamMat.opacity = 0.5 + 0.3 * look.pulse;
  }

  dispose(): void {
    for (const b of this.batches()) b.dispose();
    for (const b of this.belts.values()) this.disposeBelt(b);
    this.belts.clear();
    for (const d of this.doors.values()) this.group.remove(d.group);
    this.doors.clear();
    for (const o of [this.rings, this.warnGlow, this.warnHatch, this.warnEdge, this.doorFrames]) o.dispose();
    for (const g of [
      this.boxGeo,
      this.crackBoxGeo,
      this.barrelGeo,
      this.crackBarrelGeo,
      this.palletGeo,
      this.plane,
      this.beltGeo,
      this.beamGeo,
    ])
      g.dispose();
    for (const m of this.mats) m.dispose();
    this.extraction?.chevTex.dispose();
    disposeRaidTextures();
  }
}

/** A small stable number from an id (a deterministic per-item yaw, never a rule). */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Does the door sit in a wall that runs north-south (its shutter then spans z)? True when the tiles above and below are
 * solid and the ones left and right are not. Ties (open room, no walls) span x, facing the camera.
 */
export function doorSpansZ(
  state: Pick<GameState, 'tiles' | 'width' | 'height'>,
  d: Pick<RaidDoorView, 'x' | 'y'>,
): boolean {
  const solid = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= state.width || y >= state.height || state.tiles[y * state.width + x] === Tile.Empty
      ? 0
      : 1;
  const alongX = solid(d.x - 1, d.y) + solid(d.x + 1, d.y);
  const alongZ = solid(d.x, d.y - 1) + solid(d.x, d.y + 1);
  return alongZ > alongX;
}
