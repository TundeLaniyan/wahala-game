import type { BufferGeometry } from 'three';
import {
  AdditiveBlending,
  BackSide,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
} from 'three';
import { BEACON_FLASH_SEC, BEACON_HEIGHT, beaconLook } from './checkpointStyle';
import type { BeaconState } from './checkpointStyle';
import { beamTexture, tickTexture } from './missionTextures';

/** One walk-through destination to mark: a route checkpoint, an escape exit or the return marker. */
export interface BeaconInput {
  id: string;
  /** World position of the tile centre. */
  x: number;
  z: number;
  state: BeaconState;
  kind: 'checkpoint' | 'exit' | 'return';
}

interface Beacon {
  group: Group;
  column: Mesh;
  core: Mesh;
  pole: Mesh;
  flag: Mesh;
  ring: Mesh;
  ripple: Mesh;
  tick: Mesh;
  arrow: Mesh;
  arrowEdge: Mesh;
  arrowMat: MeshBasicMaterial;
  mats: MeshBasicMaterial[];
  columnMat: MeshBasicMaterial;
  coreMat: MeshBasicMaterial;
  poleMat: MeshBasicMaterial;
  flagMat: MeshBasicMaterial;
  ringMat: MeshBasicMaterial;
  rippleMat: MeshBasicMaterial;
  tickMat: MeshBasicMaterial;
}

const POLE_HEIGHT = 2.1;

const glow = (map?: MeshBasicMaterial['map']): MeshBasicMaterial =>
  new MeshBasicMaterial({
    map: map ?? null,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });

/**
 * Field-mission WALK-THROUGH beacons (docs/CHECKPOINT_CLARITY.md, decisions CK1-CK3): a tall column of light, a bright
 * core, a flag on a pole and a floor ring with a ripple on the CURRENT checkpoint; a faint short grey column for the
 * later ones; a white-green burst and then a small green flag with a tick once reached. Never a filling ring (that is
 * the door's hold pad). Reads only what `MissionViews` hands it (the sim's `MissionView.route` and walk-through nodes);
 * the reach flash is timed from the render clock when the renderer first sees a beacon turn done.
 */
export class CheckpointBeacons {
  readonly group = new Group();
  private readonly items = new Map<string, Beacon>();
  private readonly shown = new Map<string, BeaconState>();
  private readonly reachedAt = new Map<string, number>();
  private now = 0;
  private readonly columnGeo = new CylinderGeometry(0.5, 0.5, BEACON_HEIGHT, 20, 1, true);
  private readonly coreGeo = new CylinderGeometry(0.16, 0.16, BEACON_HEIGHT, 10, 1, true);
  private readonly poleGeo = new CylinderGeometry(0.045, 0.06, POLE_HEIGHT, 6).translate(
    0,
    POLE_HEIGHT / 2,
    0,
  );
  private readonly flagGeo = new PlaneGeometry(1.15, 0.7).translate(0.575, -0.35, 0);
  private readonly ringGeo = new RingGeometry(0.6, 0.78, 40).rotateX(-Math.PI / 2);
  private readonly tickGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  /** A four-sided cone pointing down: the waypoint arrow, with a slightly larger dark copy behind it as its outline. */
  private readonly arrowGeo = new ConeGeometry(0.66, 1.2, 4).rotateX(Math.PI);

  constructor() {
    this.group.name = 'checkpoint-beacons';
  }

  private create(kind: BeaconInput['kind']): Beacon {
    const columnMat = glow(beamTexture());
    // the core is a plain (not additive) gold so it keeps its colour over a pale floor or a yellow bus
    const coreMat = new MeshBasicMaterial({
      map: beamTexture(),
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    const poleMat = new MeshBasicMaterial({ color: 0x22252b, transparent: true });
    const flagMat = new MeshBasicMaterial({ transparent: true, side: DoubleSide, depthWrite: false });
    const ringMat = glow();
    const rippleMat = glow();
    const tickMat = new MeshBasicMaterial({ map: tickTexture(), transparent: true, depthWrite: false });
    const column = new Mesh(this.columnGeo, columnMat);
    column.renderOrder = 13;
    const core = new Mesh(this.coreGeo, coreMat);
    core.renderOrder = 14;
    const pole = new Mesh(this.poleGeo, poleMat);
    pole.position.set(0.38, 0, -0.38);
    const flag = new Mesh(this.flagGeo, flagMat);
    flag.position.set(0.38, POLE_HEIGHT, -0.38);
    flag.renderOrder = 15;
    const ring = new Mesh(this.ringGeo, ringMat);
    ring.position.y = 0.04;
    ring.renderOrder = 6;
    const ripple = new Mesh(this.ringGeo, rippleMat);
    ripple.position.y = 0.045;
    ripple.renderOrder = 6;
    // the arrow ignores depth: it must read over a roof or a bus standing in front of the checkpoint
    const arrowMat = new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
    const arrowEdgeMat = new MeshBasicMaterial({
      color: 0x0a0c10,
      transparent: true,
      opacity: 0.85,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
    });
    const arrow = new Mesh(this.arrowGeo, arrowMat);
    arrow.renderOrder = 41;
    const arrowEdge = new Mesh(this.arrowGeo, arrowEdgeMat);
    arrowEdge.scale.setScalar(1.3);
    arrowEdge.renderOrder = 40;
    const tick = new Mesh(this.tickGeo, tickMat);
    tick.position.y = 0.05;
    tick.scale.setScalar(0.9);
    tick.renderOrder = 7;
    const group = new Group();
    group.name = `beacon-${kind}`;
    group.userData.markerKind = 'checkpoint';
    group.add(ring, ripple, tick, pole, flag, column, core, arrowEdge, arrow);
    this.group.add(group);
    const mats = [columnMat, coreMat, poleMat, flagMat, ringMat, rippleMat, tickMat, arrowMat, arrowEdgeMat];
    return {
      group,
      column,
      core,
      pole,
      flag,
      ring,
      ripple,
      tick,
      arrow,
      arrowEdge,
      arrowMat,
      mats,
      columnMat,
      coreMat,
      poleMat,
      flagMat,
      ringMat,
      rippleMat,
      tickMat,
    };
  }

  /** Draws `inputs` this frame; `inView` culls beacons off the follow camera. */
  update(
    inputs: readonly BeaconInput[],
    time: number,
    inView?: (x: number, z: number, r: number) => boolean,
  ): void {
    this.now = time;
    const live = new Set<string>();
    for (const b of inputs) {
      live.add(b.id);
      const before = this.shown.get(b.id);
      if (before !== undefined && before !== 'done' && b.state === 'done') this.reachedAt.set(b.id, time);
      if (b.state !== 'done') this.reachedAt.delete(b.id);
      this.shown.set(b.id, b.state);
      let item = this.items.get(b.id);
      if (!item) {
        item = this.create(b.kind);
        this.items.set(b.id, item);
      }
      item.group.position.set(b.x, 0, b.z);
      item.group.visible = inView ? inView(b.x, b.z, 4) : true;
      if (!item.group.visible) continue;
      const at = this.reachedAt.get(b.id);
      const look = beaconLook(b.state, at === undefined ? null : time - at, time);
      const h = BEACON_HEIGHT * look.height;
      item.column.visible = look.column > 0.01 && look.height > 0;
      item.column.scale.set(look.width, look.height, look.width);
      item.column.position.y = h / 2;
      item.columnMat.color.setHex(look.color);
      item.columnMat.opacity = look.column;
      item.core.visible = look.core > 0.01;
      item.core.scale.set(1, look.height, 1);
      item.core.position.y = h / 2;
      item.coreMat.color.setHex(look.color);
      item.coreMat.opacity = look.core;
      item.flag.scale.setScalar(look.flagScale);
      item.flag.position.y = POLE_HEIGHT * look.flagScale;
      item.flag.rotation.y = 0.28 * Math.sin(time * 3.1 + b.x);
      item.flagMat.color.setHex(look.color);
      item.flagMat.opacity = look.flag;
      item.pole.scale.set(1, look.flagScale, 1);
      item.poleMat.opacity = Math.min(1, look.flag + 0.2);
      item.ringMat.color.setHex(look.color);
      item.ringMat.opacity = look.ring;
      item.ripple.visible = look.rippleOpacity > 0.01;
      item.ripple.scale.setScalar(look.ripple);
      item.rippleMat.color.setHex(look.color);
      item.rippleMat.opacity = look.rippleOpacity;
      item.arrow.visible = item.arrowEdge.visible = look.arrow > 0.01;
      item.arrow.position.y = item.arrowEdge.position.y = look.arrowY;
      item.arrow.rotation.y = item.arrowEdge.rotation.y = time * 1.6;
      item.arrowMat.color.setHex(look.color);
      item.arrowMat.opacity = look.arrow;
      item.tick.visible = look.tick;
      item.tickMat.color.setHex(look.color);
    }
    for (const [id, item] of this.items) {
      if (live.has(id)) continue;
      this.disposeItem(item);
      this.items.delete(id);
      this.shown.delete(id);
      this.reachedAt.delete(id);
    }
  }

  /** What is drawn (tests / the debug handle): beacons by state, and how many are flashing a reach right now. */
  stats(): { beacons: number; live: number; locked: number; done: number; flashing: number } {
    let live = 0;
    let locked = 0;
    let done = 0;
    for (const s of this.shown.values()) {
      if (s === 'live') live++;
      else if (s === 'locked') locked++;
      else done++;
    }
    let flashing = 0;
    for (const at of this.reachedAt.values()) if (this.now - at < BEACON_FLASH_SEC) flashing++;
    return { beacons: this.items.size, live, locked, done, flashing };
  }

  /** The beacon objects (tests: a checkpoint beacon is not a door pad). */
  objects(): Group[] {
    return [...this.items.values()].map((i) => i.group);
  }

  private disposeItem(item: Beacon): void {
    this.group.remove(item.group);
    for (const m of item.mats) m.dispose();
  }

  dispose(): void {
    for (const item of this.items.values()) this.disposeItem(item);
    this.items.clear();
    const geos: BufferGeometry[] = [
      this.columnGeo,
      this.coreGeo,
      this.poleGeo,
      this.flagGeo,
      this.ringGeo,
      this.tickGeo,
      this.arrowGeo,
    ];
    for (const g of geos) g.dispose();
  }
}
