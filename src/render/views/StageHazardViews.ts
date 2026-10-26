import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Texture } from 'three';
import { DIR_VEC, PICKUP_DEFS, getArena } from '../../sim';
import type { Dir, GameState, SimEvent, StageEvent } from '../../sim';
import { sweepVehicleKind } from '../../assets/stagePresentation';
import { VEHICLE_SCALE } from '../arenas/common';
import { assets } from '../assets/library';
import { softVariantFor, softVariants } from '../assets/props';
import { createVehicleModel, spinWheel } from '../assets/vehicles';
import { createHazardTruck } from './hazardTruck';
import type { VehicleModel } from '../assets/vehicles';
import type { Layout } from '../coords';
import type { Effects } from '../fx/Effects';
import { ParticleSystem } from '../fx/Particles';
import type { QualityProfile } from '../quality';
import { chevronTexture, glowTexture, ringTexture, smokeTexture, tileGlowTexture } from '../textures';
import {
  blinkerOn,
  departDistance,
  departRollback,
  departSpeed,
  easeDepart,
  hornPulse,
  routePoint,
} from './departure';
import { lerpAngle, playerGridPos, stepProgress, yawForDir } from './motion';
import { chevronYaw } from './OverlayViews';
import { TileOverlay } from './TileOverlay';
import type { FrameContext, View } from './types';

/**
 * Stage hazards made readable (presentation only: reads `state.stage` and stage SimEvents).
 *
 * - every LETHAL hazard is telegraphed on the floor for its whole warning: a dark underlay (contrast
 *   on bright arenas), a fill that "burns down" along the lane and strobes faster as the moment nears,
 *   marching chevrons and a ring closing in;
 * - sweeps: a real GLB vehicle drives up from beyond the border, along the route (interpolated
 *   between tiles) and off the board again;
 * - debris: a slab on a crane cable, a shadow that grows, the drop, a dust burst;
 * - power: steel service plates always on the floor, crackling arcs in the warning, a bright live state;
 * - gusts: wind streaks and arrows streaming across the board; lagoon wash: water rising over the edge
 *   row, then a foam surge (doused generators steam); market drops: the goods fall with a shadow;
 * - manholes: numbered covers glowing in matching pairs, popping at both ends on a teleport;
 * - a Generator Pass holder gets a mint ring at their feet.
 */

const LETHAL_EARLY = 0xffae1a;
const LETHAL_LATE = 0xff2410;
const POWER = 0x63d4ff;
const POWER_LIVE = 0xe8fbff;
const WIND = 0xd6f2ff;
const WASH = 0x3cd2ff;
const MERCH = 0xffc84a;
const PASS = PICKUP_DEFS.bombpass.color;
const PAIR_COLORS = [0xffb21a, 0x3fd2ff, 0xff4fd8, 0x9dff4a];
const PAIR_CSS = ['#ffb21a', '#3fd2ff', '#ff4fd8', '#9dff4a'];

/** Tiles of approach the sweep vehicle drives in from beyond the border before it becomes real. */
const APPROACH_TILES = 4;
const EXIT_SECONDS = 1.1;
const ARC_SEGMENTS = 5;
const MAX_ARCS = 36;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Warning progress 0..1 (1 = the hazard becomes real now). */
function warnProgress(ev: StageEvent, state: GameState, alpha: number): number {
  const total = Math.max(1, ev.startTick - ev.warnTick);
  return clamp01(1 - (ev.startTick - state.tick - alpha) / total);
}

// ------------------------------------------------------------------ textures (owned by the view)

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTex(c: HTMLCanvasElement, repeat = false): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Wind streak: a thin line, bright at the head (+X), fading out behind and at the sides. */
function streakTexture(): CanvasTexture {
  const [c, g] = canvas(128, 16);
  const along = g.createLinearGradient(0, 0, 128, 0);
  along.addColorStop(0, 'rgba(255,255,255,0)');
  along.addColorStop(0.8, 'rgba(255,255,255,0.7)');
  along.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = along;
  g.fillRect(0, 0, 128, 16);
  g.globalCompositeOperation = 'destination-in';
  const across = g.createLinearGradient(0, 0, 0, 16);
  across.addColorStop(0, 'rgba(0,0,0,0)');
  across.addColorStop(0.5, 'rgba(0,0,0,1)');
  across.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, 128, 16);
  return toTex(c);
}

/** Soft black blob for drop shadows and the contrast underlay. */
function blobTexture(): CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.95)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.6)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return toTex(c);
}

/** Rounded tile, nearly opaque with a solid rim: the painted colour of a hazard tile. */
function paintTexture(): CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = 'rgba(255,255,255,0.86)';
  g.beginPath();
  g.roundRect(3, 3, 58, 58, 9);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 4;
  g.stroke();
  return toTex(c);
}

/** Vertical light shaft: bright at the floor, fading to nothing upwards. */
function shaftTexture(): CanvasTexture {
  const [c, g] = canvas(8, 64);
  const grad = g.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 64);
  return toTex(c);
}

/** 2 x 2 atlas of cast-iron manhole covers numbered 1-4, each with a ring in its pair colour. */
function manholeAtlas(): CanvasTexture {
  const [c, g] = canvas(256, 256);
  for (let n = 0; n < 4; n++) {
    const ox = (n % 2) * 128 + 64;
    const oy = Math.floor(n / 2) * 128 + 64;
    g.save();
    g.translate(ox, oy);
    g.beginPath();
    g.arc(0, 0, 58, 0, Math.PI * 2);
    g.fillStyle = '#1b1a19';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = PAIR_CSS[n]!;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 50, 0, Math.PI * 2);
    const grad = g.createRadialGradient(-14, -16, 4, 0, 0, 52);
    grad.addColorStop(0, '#5a5856');
    grad.addColorStop(1, '#2a2928');
    g.fillStyle = grad;
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(15,14,13,0.85)';
    g.lineWidth = 3;
    for (let i = -60; i <= 60; i += 12) {
      g.beginPath();
      g.moveTo(i, -60);
      g.lineTo(i + 30, 60);
      g.stroke();
      g.beginPath();
      g.moveTo(-60, i);
      g.lineTo(60, i - 30);
      g.stroke();
    }
    g.restore();
    g.fillStyle = '#7c7975';
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * Math.PI * 2 + 0.6;
      g.beginPath();
      g.arc(Math.cos(a) * 42, Math.sin(a) * 42, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(0, 0, 22, 0, Math.PI * 2);
    g.fillStyle = 'rgba(10,10,10,0.8)';
    g.fill();
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = PAIR_CSS[n]!;
    g.fillText(String(n + 1), 0, 2);
    g.restore();
  }
  return toTex(c);
}

/** Electrical service plate: tread-plate steel with a hazard border and a bolt glyph. */
function plateTextures(): { map: CanvasTexture; glow: CanvasTexture } {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#5d6266';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(30,32,35,0.55)';
  g.lineWidth = 3;
  for (let y = 10; y < 128; y += 14) {
    for (let x = 10 + ((y / 14) % 2) * 7; x < 128; x += 14) {
      g.beginPath();
      g.moveTo(x - 3, y + 3);
      g.lineTo(x + 3, y - 3);
      g.stroke();
    }
  }
  // yellow / black border
  for (let i = 0; i < 128; i += 16) {
    g.fillStyle = (i / 16) % 2 ? '#1c1a17' : '#f2b81a';
    g.fillRect(i, 0, 16, 8);
    g.fillRect(i, 120, 16, 8);
    g.fillRect(0, i, 8, 16);
    g.fillRect(120, i, 8, 16);
  }
  const bolt = (ctx: CanvasRenderingContext2D, fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(70, 26);
    ctx.lineTo(44, 70);
    ctx.lineTo(62, 70);
    ctx.lineTo(54, 102);
    ctx.lineTo(84, 54);
    ctx.lineTo(66, 54);
    ctx.closePath();
    ctx.fill();
  };
  bolt(g, '#f2b81a');
  const [e, eg] = canvas(128, 128);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, 128, 128);
  eg.strokeStyle = '#9fe8ff';
  eg.lineWidth = 4;
  eg.strokeRect(10, 10, 108, 108);
  bolt(eg, '#4fb8e0');
  return { map: toTex(c), glow: toTex(e) };
}

function waterTexture(): CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#1f6f86';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    const y = hash(i) * 128;
    const x = hash(i + 50) * 128;
    g.strokeStyle = `rgba(190,240,255,${0.15 + hash(i + 9) * 0.3})`;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 10, y - 4, x + 22, y);
    g.stroke();
  }
  return toTex(c, true);
}

function foamTexture(): CanvasTexture {
  const [c, g] = canvas(256, 32);
  for (let i = 0; i < 120; i++) {
    const x = hash(i * 3) * 256;
    const y = 8 + hash(i * 3 + 1) * 16;
    const r = 2 + hash(i * 3 + 2) * 6;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTex(c, true);
}

/** Flat quads (y-up) merged into one geometry; `cell` picks a quadrant of a 2 x 2 atlas (-1 = whole texture). */
function quadsGeometry(
  items: { x: number; z: number; size: number; cell: number }[],
  y: number,
): BufferGeometry {
  const pos = new Float32Array(items.length * 12);
  const uv = new Float32Array(items.length * 8);
  const idx = new Uint16Array(items.length * 6);
  items.forEach((it, n) => {
    const h = it.size / 2;
    const corners = [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ];
    const u0 = it.cell < 0 ? 0 : (it.cell % 2) * 0.5;
    const v1 = it.cell < 0 ? 1 : 1 - Math.floor(it.cell / 2) * 0.5;
    const span = it.cell < 0 ? 1 : 0.5;
    const uvs = [
      [u0, v1],
      [u0 + span, v1],
      [u0 + span, v1 - span],
      [u0, v1 - span],
    ];
    corners.forEach(([cx, cz], k) => {
      pos.set([it.x + cx!, y, it.z + cz!], n * 12 + k * 3);
      uv.set(uvs[k]!, n * 8 + k * 2);
    });
    idx.set([n * 4, n * 4 + 2, n * 4 + 1, n * 4, n * 4 + 3, n * 4 + 2], n * 6);
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  geo.setIndex(new BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------ visuals

interface SweepVisual {
  ev: StageEvent;
  model: VehicleModel;
  yaw: number;
  shown: boolean;
  seen: number;
  phase: 'live' | 'exiting' | 'blocked';
  since: number;
  lastIndex: number;
  gx: number;
  gy: number;
  /** Direction of travel and the direction the body faces (a Danfo reverses out nose-first in). */
  dx: number;
  dy: number;
  fdx: number;
  fdy: number;
  speed: number;
  smokeAt: number;
  /** Departures only: the warning lamps (own materials, disposed with the visual) and the parked-exhaust clock. */
  lamps?: { reverse: Sprite[]; blink: Sprite[]; mats: SpriteMaterial[] };
  puffAt?: number;
}

type FallerKind = 'debris' | 'merch' | 'cargo';

/** Faded shipping-container paints for the Apapa crane drops (no real line's livery). */
const CARGO_COLORS = [0x8a3a26, 0x2e5a7a, 0x3e6a48, 0x9a8a5e, 0x6a6e72, 0xa8642e];

/** Vertical ribs of a container wall (multiplied by the paint colour). */
function ribTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 64; x += 8) {
    g.fillStyle = '#ffffff';
    g.fillRect(x, 0, 5, 16);
    g.fillStyle = '#9a9a9a';
    g.fillRect(x + 5, 0, 3, 16);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(3, 1);
  t.colorSpace = SRGBColorSpace;
  return t;
}

interface Faller {
  obj: Object3D;
  cable: Mesh | null;
  /** Red light shaft standing on the target tile (crane debris): readable even under a character. */
  shaft: Mesh | null;
  x: number;
  y: number;
  height: number;
  seen: number;
  spin: number;
}

interface LidPop {
  mesh: Mesh;
  age: number;
  active: boolean;
}

export class StageHazardViews implements View {
  readonly group = new Group();
  private readonly owned: { dispose(): void }[] = [];
  /** Vehicles and falling objects get the weathering patch as vehicles / props. */
  private readonly solids = new Group();
  /** Opaque-ish colour painted on hazard tiles: reads on sunlit floors where additive glow washes out. */
  private readonly paint = new TileOverlay(this.own(paintTexture()), 300, 6, 0.04);
  private readonly shadows = new TileOverlay(this.own(blobTexture()), 24, 6, 0.036);
  private readonly fill = new TileOverlay(tileGlowTexture(), 420, 7, 0.046);
  private readonly chevrons = new TileOverlay(chevronTexture(), 260, 8, 0.05);
  /** Dark chevrons for daylight arenas (white additive ones vanish on a bright floor). */
  private readonly ink = new TileOverlay(chevronTexture(), 160, 8, 0.052);
  private readonly rings = new TileOverlay(ringTexture(), 120, 9, 0.054);
  private readonly mist: ParticleSystem;
  private readonly sparks: ParticleSystem;
  private readonly sweeps = new Map<number, SweepVisual>();
  private readonly fallers = new Map<number, Faller>();
  private readonly item = {
    x: 0,
    z: 0,
    y: undefined as number | undefined,
    color: 0,
    intensity: 0,
    rotY: 0,
    scale: 1,
  };
  private readonly col = new Color();
  private readonly col2 = new Color();
  private readonly mark: Uint8Array;
  private readonly marked: number[] = [];
  private frame = 0;
  private time = 0;
  private readonly night: boolean;
  private readonly density: number;

  // headlights shared by every sweep vehicle
  private readonly headMat: SpriteMaterial;
  private readonly beamGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly beamMat: MeshBasicMaterial;

  // debris pieces (shared geometry/materials)
  private readonly slabGeo = new BoxGeometry(0.78, 0.26, 0.62);
  private readonly beamPieceGeo = new BoxGeometry(0.95, 0.12, 0.14);
  private readonly cableGeo = new CylinderGeometry(0.018, 0.018, 1, 5).translate(0, 0.5, 0);
  // Apapa: a short container (fits the 2 x 2 crane zone) and the crane's spreader frame
  private readonly containerGeo = new BoxGeometry(1.86, 1.3, 1.72);
  private readonly spreaderGeo = new BoxGeometry(2.0, 0.12, 0.3);
  private readonly cargoMats = new Map<number, MeshStandardMaterial>();
  private readonly concreteMat = new MeshStandardMaterial({ color: 0x8d877d, roughness: 0.95 });
  private readonly steelMat = new MeshStandardMaterial({ color: 0x9a3a1c, roughness: 0.6, metalness: 0.5 });
  private readonly cableMat = new MeshBasicMaterial({ color: 0x1a1a1a });
  private readonly shaftGeo = new CylinderGeometry(0.42, 0.5, 4.5, 20, 1, true).translate(0, 2.25, 0);
  private readonly shaftMat = new MeshBasicMaterial({
    map: this.own(shaftTexture()),
    color: 0xff3a1a,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly beaconMat = new SpriteMaterial({
    map: glowTexture(),
    color: 0xff2a10,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  private readonly sackGeo = new BoxGeometry(0.7, 0.5, 0.6);
  private readonly sackMat = new MeshStandardMaterial({ color: 0xb08850, roughness: 0.95 });

  // power arcs (one dynamic ribbon mesh)
  private readonly arcPos = new Float32Array(MAX_ARCS * ARC_SEGMENTS * 4 * 3);
  private readonly arcGeo = new BufferGeometry();
  private readonly arcMesh: Mesh;
  private arcCount = 0;
  private readonly arcA = new Vector3();
  private readonly arcB = new Vector3();

  // gust streaks
  private readonly streaks: InstancedMesh;
  private readonly streakCount: number;
  private readonly dummy = new Object3D();
  private gustBurst = { until: -1, dir: 'right' as Dir };

  // lagoon wash
  private readonly water: Mesh;
  private readonly foam: Mesh;
  private readonly waterTex: Texture;
  private readonly foamTex: Texture;
  private surge: { tiles: number[]; dir: Dir; t0: number } | null = null;

  // permanent floor furniture
  private readonly powerTiles: number[] = [];
  private readonly manholes: { index: number; pair: number }[] = [];
  private readonly pairOf = new Map<number, number>();
  private readonly lids: LidPop[] = [];

  constructor(
    state: GameState,
    private readonly layout: Layout,
    private readonly fx: Effects,
    profile: QualityProfile,
  ) {
    this.mark = new Uint8Array(state.width * state.height);
    this.density = profile.particleDensity;
    const arena = getArena(state.arenaId);
    this.night = /night/i.test(arena.info.lighting);
    this.group.name = 'stage-hazards';
    this.solids.userData.grit = 'vehicle';
    this.group.add(this.solids);
    for (const o of [this.paint, this.shadows, this.ink]) {
      const m = o.mesh.material as MeshBasicMaterial;
      m.blending = NormalBlending;
      m.opacity = o === this.paint ? 0.72 : o === this.ink ? 0.9 : 0.62;
      m.needsUpdate = true;
    }
    this.group.add(
      this.paint.mesh,
      this.shadows.mesh,
      this.fill.mesh,
      this.chevrons.mesh,
      this.ink.mesh,
      this.rings.mesh,
    );

    this.mist = new ParticleSystem(Math.max(60, Math.round(320 * this.density)), smokeTexture(), false);
    this.sparks = new ParticleSystem(Math.max(40, Math.round(200 * this.density)), glowTexture(), true);
    this.group.add(this.mist.points, this.sparks.points);
    this.owned.push(this.mist, this.sparks);

    this.headMat = new SpriteMaterial({
      map: glowTexture(),
      color: 0xfff1c8,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: this.night ? 0.95 : 0.5,
    });
    this.beamMat = new MeshBasicMaterial({
      map: glowTexture(),
      color: 0xffe2a0,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: this.night ? 0.55 : 0.18,
    });
    this.owned.push(
      this.headMat,
      this.beamGeo,
      this.beamMat,
      this.slabGeo,
      this.beamPieceGeo,
      this.cableGeo,
      this.containerGeo,
      this.spreaderGeo,
      this.concreteMat,
      this.steelMat,
      this.cableMat,
      this.shaftGeo,
      this.shaftMat,
      this.beaconMat,
      this.sackGeo,
      this.sackMat,
    );

    // power arcs
    const idx = new Uint16Array(MAX_ARCS * ARC_SEGMENTS * 6);
    for (let q = 0; q < MAX_ARCS * ARC_SEGMENTS; q++)
      idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2], q * 6);
    this.arcGeo.setAttribute('position', new BufferAttribute(this.arcPos, 3).setUsage(35048));
    this.arcGeo.setIndex(new BufferAttribute(idx, 1));
    this.arcGeo.setDrawRange(0, 0);
    const arcMat = new MeshBasicMaterial({
      color: 0xd8f6ff,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    this.arcMesh = new Mesh(this.arcGeo, arcMat);
    this.arcMesh.frustumCulled = false;
    this.arcMesh.renderOrder = 22;
    this.group.add(this.arcMesh);
    this.owned.push(this.arcGeo, arcMat);

    // gust streaks
    this.streakCount = Math.max(16, Math.round(54 * Math.max(0.5, this.density)));
    const streakGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const streakMat = new MeshBasicMaterial({
      map: this.own(streakTexture()),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    this.streaks = new InstancedMesh(streakGeo, streakMat, this.streakCount);
    this.streaks.count = 0;
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 21;
    this.streaks.setColorAt(0, this.col.setHex(0xffffff));
    this.group.add(this.streaks);
    this.owned.push(streakGeo, streakMat, this.streaks);

    // lagoon wash: water sheet (anchored at its outer edge, extends along +Z) and a foam front
    this.waterTex = this.own(waterTexture());
    this.foamTex = this.own(foamTexture());
    const sheet = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    const waterMat = new MeshBasicMaterial({
      map: this.waterTex,
      color: 0x9fe6ff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    this.water = new Mesh(sheet, waterMat);
    this.water.visible = false;
    this.water.renderOrder = 5;
    const foamGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const foamMat = new MeshBasicMaterial({
      map: this.foamTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    });
    this.foam = new Mesh(foamGeo, foamMat);
    this.foam.visible = false;
    this.foam.renderOrder = 6;
    this.group.add(this.water, this.foam);
    this.owned.push(sheet, waterMat, foamGeo, foamMat);

    this.buildFloorFurniture(state);
  }

  private ribs: CanvasTexture | null = null;

  private cargoMat(color: number): MeshStandardMaterial {
    let m = this.cargoMats.get(color);
    if (!m) {
      this.ribs ??= this.own(ribTexture());
      m = this.own(new MeshStandardMaterial({ color, map: this.ribs, roughness: 0.72, metalness: 0.35 }));
      this.cargoMats.set(color, m);
    }
    return m;
  }

  private own<T extends { dispose(): void }>(o: T): T {
    this.owned.push(o);
    return o;
  }

  /** Keeps the view's particles the same on-screen size as the Effects particles. */
  setPixelScale(s: number): void {
    this.mist.setPixelScale(s);
    this.sparks.setPixelScale(s);
  }

  private wx(gx: number): number {
    return this.layout.wx(gx);
  }

  private wz(gy: number): number {
    return this.layout.wz(gy);
  }

  /** Service plates for every power zone and the numbered manhole covers: always on the floor. */
  private buildFloorFurniture(state: GameState): void {
    const w = state.width;
    const arena = getArena(state.arenaId);
    const seen = new Set<number>();
    const pairs: { index: number; pair: number }[] = [];
    for (const def of arena.stageHazards) {
      if (def.kind === 'strike' && def.style === 'power') {
        for (const zone of def.zones)
          for (const [x, y] of zone) {
            const i = y * w + x;
            if (state.tiles[i] === 1 || seen.has(i)) continue;
            seen.add(i);
            this.powerTiles.push(i);
          }
      }
      if (def.kind === 'teleport') {
        def.pairs.forEach(([a, b], n) => {
          pairs.push({ index: a[1] * w + a[0], pair: n % 4 }, { index: b[1] * w + b[0], pair: n % 4 });
        });
      }
    }
    if (this.powerTiles.length > 0) {
      const { map, glow } = plateTextures();
      this.own(map);
      this.own(glow);
      const geo = this.own(
        quadsGeometry(
          this.powerTiles.map((i) => ({
            x: this.wx(i % w),
            z: this.wz(Math.floor(i / w)),
            size: 0.9,
            cell: -1,
          })),
          0.014,
        ),
      );
      const mat = this.own(
        new MeshStandardMaterial({
          map,
          emissiveMap: glow,
          emissive: 0x6fd8ff,
          emissiveIntensity: this.night ? 0.55 : 0.35,
          roughness: 0.55,
          metalness: 0.55,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
      );
      const plates = new Mesh(geo, mat);
      plates.receiveShadow = true;
      plates.renderOrder = 2;
      plates.userData.grit = 'scenery';
      this.group.add(plates);
    }
    if (pairs.length > 0) {
      const atlas = this.own(manholeAtlas());
      const geo = this.own(
        quadsGeometry(
          pairs.map((p) => ({
            x: this.wx(p.index % w),
            z: this.wz(Math.floor(p.index / w)),
            size: 0.86,
            cell: p.pair,
          })),
          0.016,
        ),
      );
      const mat = this.own(
        new MeshStandardMaterial({
          map: atlas,
          transparent: true,
          alphaTest: 0.4,
          roughness: 0.5,
          metalness: 0.6,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
      );
      const covers = new Mesh(geo, mat);
      covers.receiveShadow = true;
      covers.renderOrder = 2;
      covers.userData.grit = 'scenery';
      this.group.add(covers);
      for (const p of pairs) {
        this.manholes.push(p);
        this.pairOf.set(p.index, p.pair);
      }
      // pooled lids that pop out of both ends on a teleport
      const lidGeo = this.own(new CylinderGeometry(0.36, 0.36, 0.05, 18));
      const lidMat = this.own(new MeshStandardMaterial({ color: 0x3a3836, roughness: 0.5, metalness: 0.7 }));
      for (let i = 0; i < 4; i++) {
        const mesh = new Mesh(lidGeo, lidMat);
        mesh.visible = false;
        mesh.castShadow = true;
        this.solids.add(mesh);
        this.lids.push({ mesh, age: 0, active: false });
      }
    }
  }

  // ------------------------------------------------------------------ overlay helpers (no allocation)

  private put(
    o: TileOverlay,
    x: number,
    z: number,
    color: number,
    intensity: number,
    scale = 1,
    rotY = 0,
  ): void {
    const it = this.item;
    it.x = x;
    it.z = z;
    it.color = color;
    it.intensity = intensity;
    it.scale = scale;
    it.rotY = rotY;
    o.push(it);
  }

  private lethalColor(k: number): number {
    return this.col
      .setHex(LETHAL_EARLY)
      .lerp(this.col2.setHex(LETHAL_LATE), clamp01((k - 0.25) / 0.6))
      .getHex();
  }

  private scaled(color: number, k: number): number {
    return this.col.setHex(color).multiplyScalar(clamp01(k)).getHex();
  }

  /**
   * A lethal tile: painted colour (readable on a sunlit floor) plus an additive glow that carries the
   * strobe at night. `lit` = the part of the lane the countdown has already burned through.
   */
  private danger(x: number, z: number, color: number, strobe: number, lit: number): void {
    this.put(this.paint, x, z, this.scaled(color, 0.55 + 0.25 * lit + 0.2 * strobe), 1, 0.98);
    const glow = this.night ? 0.22 + 0.3 * strobe + 0.18 * lit : 0.06 + 0.16 * strobe + 0.08 * lit;
    this.put(this.fill, x, z, color, glow, 0.96);
  }

  /** Direction arrow on the floor: white glow at night, dark ink by day. */
  private arrow(x: number, z: number, dir: Dir, intensity: number, scale: number): void {
    if (this.night) this.put(this.chevrons, x, z, 0xffffff, intensity, scale, chevronYaw(dir));
    else this.put(this.ink, x, z, 0x1a0c04, 1, scale, chevronYaw(dir));
  }

  /** Marks a tile for this frame; returns false when it was already marked (route tiles repeat). */
  private claim(i: number): boolean {
    if (this.mark[i]) return false;
    this.mark[i] = 1;
    this.marked.push(i);
    return true;
  }

  private releaseMarks(): void {
    for (const i of this.marked) this.mark[i] = 0;
    this.marked.length = 0;
  }

  // ------------------------------------------------------------------ frame

  update(ctx: FrameContext): void {
    const { state, time, dt } = ctx;
    this.time = time;
    this.frame++;
    this.paint.begin();
    this.ink.begin();
    this.shadows.begin();
    this.fill.begin();
    this.chevrons.begin();
    this.rings.begin();
    this.arcCount = 0;
    let gust: StageEvent | null = null;
    let wash: StageEvent | null = null;

    for (const ev of state.stage.events) {
      switch (ev.kind) {
        case 'sweep':
          this.drawSweep(ev, ctx);
          break;
        case 'strike':
          if (ev.style === 'power') this.drawPower(ev, ctx);
          else this.drawDebris(ev, ctx);
          break;
        case 'push':
          if (ev.style === 'wash') wash = ev;
          else gust = ev;
          break;
        case 'drop':
          this.drawDrop(ev, ctx);
          break;
      }
    }
    this.drawPlates(ctx);
    this.drawGust(gust, ctx);
    this.drawWash(wash, ctx);
    this.drawManholes(ctx);
    this.drawPasses(ctx);
    this.retireSweeps(ctx);
    this.retireFallers();
    this.updateLids(dt);

    this.arcGeo.setDrawRange(0, this.arcCount * ARC_SEGMENTS * 6);
    (this.arcGeo.attributes.position as BufferAttribute).needsUpdate = this.arcCount > 0;
    this.paint.end();
    this.ink.end();
    this.shadows.end();
    this.fill.end();
    this.chevrons.end();
    this.rings.end();
    this.mist.update(dt);
    this.sparks.update(dt);
  }

  // ------------------------------------------------------------------ sweeps

  private drawSweep(ev: StageEvent, ctx: FrameContext): void {
    const { state, alpha, time } = ctx;
    const w = state.width;
    const warning = state.tick < ev.startTick;
    const k = warning ? warnProgress(ev, state, alpha) : 1;
    const color = warning ? this.lethalColor(k) : LETHAL_LATE;
    const len = ev.tiles.length;
    const from = warning ? 0 : Math.max(0, ev.index - 1);
    for (let j = from; j < len; j++) {
      const i = ev.tiles[j]!;
      if (!this.claim(i)) continue;
      const x = this.wx(i % w);
      const z = this.wz(Math.floor(i / w));
      const next = ev.tiles[j + 1];
      const prev = ev.tiles[j - 1];
      const dir =
        next !== undefined
          ? this.dirBetween(i, next, w)
          : prev !== undefined
            ? this.dirBetween(prev, i, w)
            : ev.dir;
      // the lane burns down from the entry as the moment approaches, then the whole lane strobes
      const lit = warning ? (j / len < k ? 1 : 0) : 1;
      const strobe = 0.5 + 0.5 * Math.sin(time * (warning ? 7 + 20 * k : 20) - j * 0.9);
      this.danger(x, z, warning ? color : LETHAL_LATE, strobe, lit);
      if (dir) {
        const v = DIR_VEC[dir];
        const march = ((time * 1.6) % 1) - 0.5;
        this.arrow(x + v.dx * march * 0.5, z + v.dy * march * 0.5, dir, 0.55 + 0.4 * k, 0.62);
      }
    }
    if (warning) {
      // ring closing in on the entry tile: the countdown
      const i0 = ev.tiles[0]!;
      this.put(
        this.rings,
        this.wx(i0 % w),
        this.wz(Math.floor(i0 / w)),
        0xffffff,
        0.5 + 0.5 * k,
        2.2 - 1.3 * k,
      );
    }
    this.releaseMarks();
    this.updateSweepVehicle(ev, ctx);
  }

  private dirBetween(a: number, b: number, w: number): Dir | null {
    const dx = (b % w) - (a % w);
    const dy = Math.floor(b / w) - Math.floor(a / w);
    if (dx > 0) return 'right';
    if (dx < 0) return 'left';
    if (dy > 0) return 'down';
    if (dy < 0) return 'up';
    return null;
  }

  private createSweep(ev: StageEvent): SweepVisual {
    const kind = sweepVehicleKind(ev.style, ev.id);
    const model = ev.style === 'truck' ? createHazardTruck(ev.id) : createVehicleModel(kind);
    // headlights and a pool of light on the road ahead (shared materials, children of the model)
    const box = new Box3().setFromObject(model.root);
    const front = box.max.x;
    const half = Math.max(0.12, box.max.z * 0.62);
    const lightY = Math.max(0.2, box.max.y * 0.32);
    const sides = kind === 'keke' ? [0] : [-half, half];
    for (const s of sides) {
      const head = new Sprite(this.headMat);
      head.position.set(front + 0.02, lightY, s);
      head.scale.setScalar(0.42);
      head.renderOrder = 28;
      model.root.add(head);
    }
    const beam = new Mesh(this.beamGeo, this.beamMat);
    beam.position.set(front + 0.75, 0.03, 0);
    beam.scale.set(1.5, 1, 1.0);
    beam.renderOrder = 7;
    model.root.add(beam);
    model.root.visible = false;
    model.root.scale.setScalar(VEHICLE_SCALE);
    this.solids.add(model.root);
    const lamps = ev.depart ? this.createDepartureLamps(model, box.min.x, half) : undefined;
    const d0 = DIR_VEC[ev.dir ?? 'right'];
    const v: SweepVisual = {
      ev,
      model,
      yaw: Math.atan2(-d0.dy, d0.dx),
      shown: false,
      seen: this.frame,
      phase: 'live',
      since: 0,
      lastIndex: -1,
      gx: 0,
      gy: 0,
      dx: d0.dx,
      dy: d0.dy,
      fdx: d0.dx,
      fdy: d0.dy,
      speed: 60 / Math.max(1, ev.stepTicks),
      smokeAt: 0,
      lamps,
      puffAt: 0,
    };
    this.sweeps.set(ev.id, v);
    return v;
  }

  /**
   * A departing Danfo's warning lamps: two amber blinkers and two white reversing lamps at the back
   * (additive glows on the vehicle, with their own materials so each flashes on its own).
   */
  private createDepartureLamps(
    model: VehicleModel,
    rearX: number,
    half: number,
  ): NonNullable<SweepVisual['lamps']> {
    const lamps: NonNullable<SweepVisual['lamps']> = { reverse: [], blink: [], mats: [] };
    const make = (color: number, z: number, y: number, size: number): Sprite => {
      const m = new SpriteMaterial({
        map: glowTexture(),
        color,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        opacity: 0,
      });
      lamps.mats.push(m);
      const sp = new Sprite(m);
      sp.position.set(rearX - 0.02, y, z);
      sp.scale.setScalar(size);
      sp.renderOrder = 28;
      model.root.add(sp);
      return sp;
    };
    for (const z of [-half, half]) {
      lamps.blink.push(make(0xffa21a, z * 1.05, 0.5, 0.36));
      lamps.reverse.push(make(0xf4fbff, z * 0.55, 0.36, 0.3));
    }
    return lamps;
  }

  /**
   * A DEPARTURE (decision RE-E3): the Danfo is parked on its bay for the whole warning, honking, blinking
   * and revving, rolls back a hand's breadth with its reversing lamps on, then pulls out and accelerates
   * along the lane. Simulation timing is uniform; only the picture eases (see `departure.ts`).
   */
  private updateDeparture(ev: StageEvent, v: SweepVisual, ctx: FrameContext): void {
    const { state, alpha, time } = ctx;
    const w = state.width;
    const warning = state.tick < ev.startTick;
    const k = warning ? warnProgress(ev, state, alpha) : 1;
    const u = departDistance(ev.index, ev.stepRemaining, ev.stepTicks, alpha);
    const parked = u <= 0;
    const back = departRollback(k, u);
    const p = routePoint(ev.tiles, easeDepart(u) - back, w);
    v.lastIndex = ev.index;
    v.dx = v.fdx = p.dx;
    v.dy = v.fdy = p.dy;
    v.smokeAt = parked ? time + 10 : Math.min(v.smokeAt, time); // while parked, the exhaust below runs instead
    this.placeVehicle(v, p.x, p.y, ctx, departSpeed(u));
    const root = v.model.root;
    if (parked) {
      // the engine revs harder as the moment nears
      root.rotation.z += Math.sin(time * 46 + ev.id) * (0.006 + 0.02 * k);
      v.model.body.position.y += Math.abs(Math.sin(time * 31)) * 0.02 * k;
      if (time > (v.puffAt ?? 0)) {
        v.puffAt = time + 0.5 - 0.42 * k;
        this.fx.smokePuff(this.layout.wx(p.x) - p.dx * 0.8, 0.2, this.layout.wz(p.y) - p.dy * 0.8, 0.22 + 0.2 * k);
      }
    }
    const lamps = v.lamps;
    if (lamps) {
      const blink = parked && blinkerOn(time, k);
      for (const m of lamps.blink) (m.material as SpriteMaterial).opacity = parked ? (blink ? 0.95 : 0.08) : 0;
      const reversing = back > 0.004 && (parked || u < 0.5);
      for (const m of lamps.reverse) (m.material as SpriteMaterial).opacity = reversing ? 0.95 : 0;
    }
    // horn: two rings sent out from the vehicle (the horn itself is the audio's `stageWarning` sound)
    const pulse = warning ? hornPulse(k) : -1;
    if (pulse >= 0)
      this.put(this.rings, this.wx(p.x), this.wz(p.y), 0xffe9a0, 0.75 * (1 - pulse), 1.3 + 2.2 * pulse);
  }

  private updateSweepVehicle(ev: StageEvent, ctx: FrameContext): void {
    const { state, alpha } = ctx;
    const w = state.width;
    const v = this.sweeps.get(ev.id) ?? this.createSweep(ev);
    v.ev = ev;
    v.seen = this.frame;
    if (ev.depart) {
      this.updateDeparture(ev, v, ctx);
      return;
    }
    const d0 = DIR_VEC[ev.dir ?? 'right'];
    const t0 = ev.tiles[0]!;
    let gx: number;
    let gy: number;
    let dx = d0.dx;
    let dy = d0.dy;
    if (ev.index < 0) {
      const remaining = ev.startTick - state.tick - alpha;
      if (remaining > ev.stepTicks * APPROACH_TILES) {
        v.model.root.visible = false;
        return;
      }
      const dist = 1 + Math.max(0, remaining) / ev.stepTicks;
      gx = (t0 % w) - d0.dx * dist;
      gy = Math.floor(t0 / w) - d0.dy * dist;
    } else {
      const cur = ev.tiles[ev.index]!;
      const cx = cur % w;
      const cy = Math.floor(cur / w);
      let px = cx - d0.dx;
      let py = cy - d0.dy;
      if (ev.index > 0) {
        const p = ev.tiles[ev.index - 1]!;
        px = p % w;
        py = Math.floor(p / w);
      }
      const k = stepProgress(ev.stepRemaining, ev.stepTicks, alpha);
      gx = px + (cx - px) * k;
      gy = py + (cy - py) * k;
      dx = Math.sign(cx - px);
      dy = Math.sign(cy - py);
    }
    v.lastIndex = ev.index;
    v.dx = dx;
    v.dy = dy;
    // a Danfo backing out of its bay keeps its nose pointing into the arena
    const reversing = ev.style === 'danfo' && dx === -d0.dx && dy === -d0.dy;
    v.fdx = reversing ? d0.dx : dx;
    v.fdy = reversing ? d0.dy : dy;
    this.placeVehicle(v, gx, gy, ctx, reversing ? -1 : 1);
  }

  private placeVehicle(v: SweepVisual, gx: number, gy: number, ctx: FrameContext, gear: number): void {
    const { dt, time, layout } = ctx;
    const root = v.model.root;
    const target = Math.atan2(-v.fdy, v.fdx);
    v.yaw = v.shown ? lerpAngle(v.yaw, target, Math.min(1, dt * 12)) : target;
    v.shown = true;
    root.visible = true;
    v.gx = gx;
    v.gy = gy;
    root.position.set(layout.wx(gx), 0, layout.wz(gy));
    root.rotation.set(0, v.yaw, Math.sin(time * 22 + v.ev.id) * 0.012);
    v.model.body.position.y = Math.abs(Math.sin(time * 18 + v.ev.id)) * 0.016;
    const spin = dt * v.speed * 2.6 * gear;
    for (const wh of v.model.wheels) spinWheel(v.model, wh, spin);
    if (time > v.smokeAt) {
      v.smokeAt = time + (v.model.kind === 'danfo' ? 0.09 : 0.16);
      const back = gear > 0 ? -0.75 : 0.75;
      this.fx.smokePuff(layout.wx(gx) + v.dx * back, 0.18, layout.wz(gy) + v.dy * back, 0.26);
    }
  }

  /** Vehicles whose event ended drive off the board (or, if something blocked them, stop and vanish in dust). */
  private retireSweeps(ctx: FrameContext): void {
    const { time, dt } = ctx;
    for (const [id, v] of this.sweeps) {
      if (v.seen === this.frame) continue;
      if (v.phase === 'live') {
        if (v.lastIndex < 0 || !v.shown) {
          this.removeSweep(id, v);
          continue;
        }
        const completed = v.lastIndex >= v.ev.tiles.length - 1;
        v.phase = completed ? 'exiting' : 'blocked';
        v.since = time;
        if (!completed) {
          this.fx.dust(v.gx, v.gy, 8, 0.7);
          this.fx.shake = Math.min(1, this.fx.shake + 0.1);
        }
      }
      const age = time - v.since;
      if (v.phase === 'exiting') {
        const gear = v.fdx === v.dx && v.fdy === v.dy ? 1 : -1;
        this.placeVehicle(v, v.gx + v.dx * v.speed * dt, v.gy + v.dy * v.speed * dt, ctx, gear);
        if (age > EXIT_SECONDS) this.removeSweep(id, v);
      } else {
        const s = age < 0.4 ? 1 : Math.max(0, 1 - (age - 0.4) / 0.3);
        v.model.root.scale.setScalar(VEHICLE_SCALE * s);
        if (s <= 0) {
          this.fx.dust(v.gx, v.gy, 6, 0.6);
          this.removeSweep(id, v);
        }
      }
    }
  }

  private removeSweep(id: number, v: SweepVisual): void {
    this.solids.remove(v.model.root);
    for (const m of v.lamps?.mats ?? []) m.dispose();
    this.sweeps.delete(id);
  }

  // ------------------------------------------------------------------ strikes

  private drawDebris(ev: StageEvent, ctx: FrameContext): void {
    const { state, alpha, time } = ctx;
    const w = state.width;
    const warning = state.tick < ev.startTick;
    const k = warning ? warnProgress(ev, state, alpha) : 1;
    const color = this.lethalColor(k);
    ev.tiles.forEach((i, j) => {
      const x = this.wx(i % w);
      const z = this.wz(Math.floor(i / w));
      const strobe = 0.5 + 0.5 * Math.sin(time * (8 + 24 * k));
      this.danger(x, z, color, warning ? strobe : 1, 1);
      if (!warning) return;
      // ring closing in, a crosshair of chevrons pointing at the tile, and the growing shadow of the load
      this.put(this.rings, x, z, 0xffffff, 0.6 + 0.4 * k, 3 - 2.2 * k);
      this.put(this.rings, x, z, LETHAL_LATE, 0.9, 1.05);
      for (const d of ['up', 'right', 'down', 'left'] as const) {
        const v = DIR_VEC[d];
        const off = 0.95 - 0.35 * k;
        this.arrow(x - v.dx * off, z - v.dy * off, d, 0.8, 0.5);
      }
      this.put(this.shadows, x, z, 0, 1, 0.35 + 0.85 * k);
      // Lagos Island: bales and cartons tip off the shopfront; Apapa: one container for the whole zone
      if (ev.style === 'goods') this.updateFaller(ev.id * 64 + j, x, z, k, time, 'merch', state);
      else if (ev.style !== 'cargo') this.updateFaller(ev.id * 64 + j, x, z, k, time, 'debris', state);
    });
    if (ev.style === 'cargo' && warning && ev.tiles.length > 0) {
      let cx = 0;
      let cz = 0;
      for (const i of ev.tiles) {
        cx += this.wx(i % w);
        cz += this.wz(Math.floor(i / w));
      }
      this.updateFaller(ev.id * 64, cx / ev.tiles.length, cz / ev.tiles.length, k, time, 'cargo', state);
    }
  }

  private drawPower(ev: StageEvent, ctx: FrameContext): void {
    const { state, alpha, time } = ctx;
    const w = state.width;
    const warning = state.tick < ev.startTick;
    const k = warning ? warnProgress(ev, state, alpha) : 1;
    const bucket = Math.floor(time * 16);
    ev.tiles.forEach((i, j) => {
      const x = this.wx(i % w);
      const z = this.wz(Math.floor(i / w));
      if (warning) {
        // flicker: the plate browns out and surges, more often as the surge nears
        const flick = hash(bucket * 7.3 + j * 3.1) < 0.35 + 0.5 * k ? 1 : 0.25;
        this.put(this.paint, x, z, this.scaled(0x1f7fc0, 0.55 + 0.45 * flick * k), 1, 0.98);
        this.put(this.fill, x, z, POWER, (0.2 + 0.5 * k) * flick + 0.12, 0.96);
        this.put(this.rings, x, z, POWER, 0.25 + 0.5 * k * flick, 1.05);
      } else {
        const buzz = 0.85 + 0.15 * Math.sin(time * 50 + j);
        this.put(this.paint, x, z, 0x39b4ff, 1, 1);
        this.put(this.fill, x, z, POWER_LIVE, buzz, 1);
        this.put(this.fill, x, z, POWER, 0.6, 1.25);
        this.put(this.rings, x, z, POWER_LIVE, 0.9, 1.1 + 0.08 * Math.sin(time * 30 + j));
      }
    });
    // crackling arcs between plates (and within each plate), re-struck ~16 times a second
    const n = ev.tiles.length;
    const arcs = Math.round((warning ? 2 + n * 0.6 * k : n * 1.4) * Math.max(0.5, this.density));
    for (let a = 0; a < arcs && this.arcCount < MAX_ARCS; a++) {
      const seed = bucket * 31.7 + a * 13.1 + ev.id;
      const ia = ev.tiles[Math.floor(hash(seed) * n)]!;
      const ax = ia % w;
      const ay = Math.floor(ia / w);
      this.arcA.set(
        this.wx(ax) + (hash(seed + 1) - 0.5) * 0.7,
        0.05,
        this.wz(ay) + (hash(seed + 2) - 0.5) * 0.7,
      );
      const nb = ev.tiles[Math.floor(hash(seed + 3) * n)]!;
      const bx = nb % w;
      const by = Math.floor(nb / w);
      if (Math.abs(bx - ax) + Math.abs(by - ay) === 1) {
        this.arcB.set(
          this.wx(bx) + (hash(seed + 4) - 0.5) * 0.5,
          0.05,
          this.wz(by) + (hash(seed + 5) - 0.5) * 0.5,
        );
      } else {
        const ang = hash(seed + 6) * Math.PI * 2;
        this.arcB.set(this.arcA.x + Math.cos(ang) * 0.55, 0.05, this.arcA.z + Math.sin(ang) * 0.55);
      }
      this.pushArc(seed, warning ? 0.05 : 0.085, warning ? 0.22 : 0.38);
      if (hash(seed + 9) < (warning ? 0.15 : 0.4)) this.spark(this.arcB.x, 0.1, this.arcB.z, POWER_LIVE);
    }
  }

  /** One jagged arc from arcA to arcB as a flat ribbon of ARC_SEGMENTS quads. */
  private pushArc(seed: number, width: number, lift: number): void {
    const a = this.arcA;
    const b = this.arcB;
    const lx = b.x - a.x;
    const lz = b.z - a.z;
    const len = Math.hypot(lx, lz) || 1;
    const px = (-lz / len) * width;
    const pz = (lx / len) * width;
    const base = this.arcCount * ARC_SEGMENTS * 12;
    let x0 = a.x;
    let y0 = a.y;
    let z0 = a.z;
    for (let s = 1; s <= ARC_SEGMENTS; s++) {
      const t = s / ARC_SEGMENTS;
      const jit = s === ARC_SEGMENTS ? 0 : (hash(seed + s * 1.7) - 0.5) * 0.36;
      const x1 = a.x + lx * t + (-lz / len) * jit;
      const z1 = a.z + lz * t + (lx / len) * jit;
      const y1 = 0.05 + Math.sin(Math.PI * t) * lift * hash(seed + 11);
      const o = base + (s - 1) * 12;
      const p = this.arcPos;
      p[o] = x0 - px;
      p[o + 1] = y0;
      p[o + 2] = z0 - pz;
      p[o + 3] = x0 + px;
      p[o + 4] = y0;
      p[o + 5] = z0 + pz;
      p[o + 6] = x1 - px;
      p[o + 7] = y1;
      p[o + 8] = z1 - pz;
      p[o + 9] = x1 + px;
      p[o + 10] = y1;
      p[o + 11] = z1 + pz;
      x0 = x1;
      y0 = y1;
      z0 = z1;
    }
    this.arcCount++;
  }

  private spark(x: number, y: number, z: number, color: number): void {
    this.col.setHex(color);
    const a = Math.random() * Math.PI * 2;
    this.sparks.emit({
      x,
      y,
      z,
      vx: Math.cos(a) * 1.4,
      vy: 1 + Math.random() * 1.6,
      vz: Math.sin(a) * 1.4,
      life: 0.35,
      size: 0.14,
      sizeEnd: 0.02,
      r: this.col.r,
      g: this.col.g,
      b: this.col.b,
      a: 1,
      gravity: 6,
    });
  }

  /** The power plates stay visible all match; a faint glow keeps them readable at night. */
  private drawPlates(ctx: FrameContext): void {
    if (this.powerTiles.length === 0) return;
    const w = ctx.state.width;
    const glow = this.night ? 0.07 : 0.05;
    for (const i of this.powerTiles) {
      this.put(
        this.fill,
        this.wx(i % w),
        this.wz(Math.floor(i / w)),
        POWER,
        glow + 0.03 * Math.sin(ctx.time * 2 + i),
        0.94,
      );
    }
  }

  // ------------------------------------------------------------------ falling things (debris, market goods)

  private updateFaller(
    key: number,
    x: number,
    z: number,
    k: number,
    time: number,
    kind: FallerKind,
    state: GameState,
  ): void {
    let f = this.fallers.get(key);
    if (!f) {
      f = this.createFaller(kind, x, z, state);
      this.fallers.set(key, f);
    }
    f.seen = this.frame;
    // hangs (and sways) on the crane / tips off the stall, then falls under gravity to land exactly on time
    const release = kind === 'debris' ? 0.55 : kind === 'cargo' ? 0.62 : 0.45;
    const sway = k < release ? Math.sin(time * 1.6 + key) * 0.06 : 0;
    const t = k < release ? 0 : (k - release) / (1 - release);
    const y = f.height * (1 - t * t);
    f.obj.position.set(x + sway, y, z);
    f.obj.rotation.set(
      sway * 0.8,
      f.spin + (kind === 'merch' ? t * 2.4 : time * 0.3),
      t * (kind === 'merch' ? 1.2 : 0.2),
    );
    if (f.cable) {
      f.cable.visible = k < release;
      f.cable.position.set(x + sway, y + 0.2, z);
      f.cable.scale.set(1, 14, 1);
    }
    if (f.shaft) {
      f.shaft.position.set(x, 0.02, z);
      const wide = kind === 'cargo' ? 2.1 : 1;
      f.shaft.scale.set((1.1 - 0.35 * k) * wide, 1, (1.1 - 0.35 * k) * wide);
      this.shaftMat.opacity = 0.3 + 0.45 * k * (0.75 + 0.25 * Math.sin(time * (10 + 20 * k)));
      this.beaconMat.opacity = Math.sin(time * 14) > 0 ? 1 : 0.15;
    }
  }

  private createFaller(kind: FallerKind, x: number, z: number, state: GameState): Faller {
    let obj: Object3D;
    let cable: Mesh | null = null;
    let shaft: Mesh | null = null;
    if (kind === 'cargo') {
      // a short box container on the crane's spreader: ribbed steel in a faded shipping-line colour
      const g = new Group();
      const paint = CARGO_COLORS[Math.floor(Math.abs(x * 7 + z * 13)) % CARGO_COLORS.length]!;
      const box = new Mesh(this.containerGeo, this.cargoMat(paint));
      box.position.y = 0.66;
      box.castShadow = true;
      g.add(box);
      const spreader = new Mesh(this.spreaderGeo, this.steelMat);
      spreader.position.y = 1.38;
      g.add(spreader);
      const beacon = new Sprite(this.beaconMat);
      beacon.position.set(0, 1.55, 0);
      beacon.scale.setScalar(0.6);
      beacon.renderOrder = 28;
      g.add(beacon);
      obj = g;
      cable = new Mesh(this.cableGeo, this.cableMat);
      this.solids.add(cable);
      shaft = new Mesh(this.shaftGeo, this.shaftMat);
      shaft.scale.set(2, 1, 2);
      shaft.renderOrder = 23;
      this.group.add(shaft);
    } else if (kind === 'debris') {
      const g = new Group();
      const slab = new Mesh(this.slabGeo, this.concreteMat);
      slab.position.y = 0.13;
      const beamA = new Mesh(this.beamPieceGeo, this.steelMat);
      beamA.position.set(0.05, 0.32, -0.12);
      beamA.rotation.y = 0.35;
      const beamB = new Mesh(this.beamPieceGeo, this.steelMat);
      beamB.position.set(-0.05, 0.44, 0.1);
      beamB.rotation.y = -0.5;
      for (const m of [slab, beamA, beamB]) {
        m.castShadow = true;
        g.add(m);
      }
      const beacon = new Sprite(this.beaconMat);
      beacon.position.set(0, 0.62, 0);
      beacon.scale.setScalar(0.55);
      beacon.renderOrder = 28;
      g.add(beacon);
      obj = g;
      cable = new Mesh(this.cableGeo, this.cableMat);
      this.solids.add(cable);
      shaft = new Mesh(this.shaftGeo, this.shaftMat);
      shaft.renderOrder = 23;
      this.group.add(shaft);
    } else {
      const gx = Math.round(x + state.width / 2 - 0.5);
      const gy = Math.round(z + state.height / 2 - 0.5);
      const variant = softVariantFor(gx, gy, softVariants(), state.arenaId);
      const inst = variant.startsWith('prop_soft_') ? assets.instance(variant) : null;
      if (inst) {
        inst.scale.set(0.88, 0.82, 0.88);
        const g = new Group();
        g.add(inst);
        obj = g;
      } else {
        const m = new Mesh(this.sackGeo, this.sackMat);
        m.position.y = 0.25;
        m.castShadow = true;
        const g = new Group();
        g.add(m);
        obj = g;
      }
    }
    this.solids.add(obj);
    return {
      obj,
      cable,
      shaft,
      x,
      y: 0,
      height: kind === 'debris' ? 5.5 : kind === 'cargo' ? 7 : 4.5,
      seen: this.frame,
      spin: Math.random() * Math.PI,
    };
  }

  private retireFallers(): void {
    for (const [key, f] of this.fallers) {
      if (f.seen === this.frame) continue;
      this.solids.remove(f.obj);
      if (f.cable) this.solids.remove(f.cable);
      if (f.shaft) this.group.remove(f.shaft);
      this.fallers.delete(key);
    }
  }

  private drawDrop(ev: StageEvent, ctx: FrameContext): void {
    const { state, alpha, time } = ctx;
    if (state.tick >= ev.startTick) return;
    const w = state.width;
    const k = warnProgress(ev, state, alpha);
    ev.tiles.forEach((i, j) => {
      const x = this.wx(i % w);
      const z = this.wz(Math.floor(i / w));
      const pulse = 0.5 + 0.5 * Math.sin(time * (8 + 14 * k));
      this.put(this.paint, x, z, this.scaled(MERCH, 0.7 + 0.3 * pulse), 1, 0.92);
      this.put(this.fill, x, z, MERCH, 0.1 + 0.2 * pulse, 0.92);
      this.put(this.rings, x, z, MERCH, 0.5 + 0.4 * k, 2 - 1.2 * k);
      this.put(this.shadows, x, z, 0, 1, 0.3 + 0.75 * k);
      this.updateFaller(ev.id * 64 + j, x, z, k, time, 'merch', state);
    });
  }

  // ------------------------------------------------------------------ pushes

  private drawGust(ev: StageEvent | null, ctx: FrameContext): void {
    const { state, alpha, time, dt } = ctx;
    const burst = time < this.gustBurst.until;
    if (!ev && !burst) {
      this.streaks.count = 0;
      return;
    }
    const warning = ev !== null && state.tick < ev.startTick;
    const k = ev && warning ? warnProgress(ev, state, alpha) : 1;
    const dir: Dir = ev?.dir ?? this.gustBurst.dir;
    const v = DIR_VEC[dir];
    const w = state.width;
    const h = state.height;
    const horizontal = v.dx !== 0;
    const span = (horizontal ? w : h) + 6;
    const lanes = horizontal ? h : w;
    const speed = burst ? 16 : 4 + 6 * k;
    const strength = burst ? 1 : 0.25 + 0.6 * k;
    const count = this.streakCount;
    for (let s = 0; s < count; s++) {
      const lane = (s * 7) % lanes;
      const sub = (hash(s * 3.3) - 0.5) * 0.8;
      const along = ((hash(s * 1.9) * span + time * speed * (0.8 + hash(s) * 0.5)) % span) - 3;
      const a = (horizontal ? v.dx : v.dy) > 0 ? along : span - 6 - along;
      const gx = horizontal ? a - 0.5 : lane + sub;
      const gy = horizontal ? lane + sub : a - 0.5;
      this.dummy.position.set(this.wx(gx), 0.14 + hash(s * 5.1) * 0.5, this.wz(gy));
      this.dummy.rotation.set(0, Math.atan2(-v.dy, v.dx), 0);
      this.dummy.scale.set((0.9 + hash(s * 2.7) * 1.4) * (burst ? 1.8 : 1), 1, 0.07);
      this.dummy.updateMatrix();
      this.streaks.setMatrixAt(s, this.dummy.matrix);
      this.streaks.setColorAt(
        s,
        this.col.setHex(WIND).multiplyScalar(strength * (0.5 + 0.5 * hash(s * 4.4))),
      );
    }
    this.streaks.count = count;
    this.streaks.instanceMatrix.needsUpdate = true;
    if (this.streaks.instanceColor) this.streaks.instanceColor.needsUpdate = true;
    if (warning) {
      // rows of arrows streaming downwind across the whole board
      for (let lane = 1; lane < lanes; lane += 2) {
        for (let c = 0; c < span; c += 4) {
          const along = ((c + time * 3.2 + lane * 1.3) % span) - 3;
          const a = (horizontal ? v.dx : v.dy) > 0 ? along : span - 6 - along;
          if (a < -0.5 || a > (horizontal ? w : h) - 0.5) continue;
          const gx = horizontal ? a : lane;
          const gy = horizontal ? lane : a;
          this.arrow(this.wx(gx), this.wz(gy), dir, 0.2 + 0.55 * k, 0.72);
        }
      }
    }
    if (burst && Math.random() < dt * 40 * this.density) {
      const gx = Math.random() * w;
      const gy = Math.random() * h;
      this.mist.emit({
        x: this.wx(gx),
        y: 0.25,
        z: this.wz(gy),
        vx: v.dx * 5,
        vy: 0.3,
        vz: v.dy * 5,
        life: 0.8,
        size: 0.35,
        sizeEnd: 1.1,
        r: 0.82,
        g: 0.76,
        b: 0.66,
        a: 0.45,
        drag: 1.2,
      });
    }
  }

  private drawWash(ev: StageEvent | null, ctx: FrameContext): void {
    const { state, alpha, time } = ctx;
    this.waterTex.offset.set(time * 0.05, time * 0.11);
    this.foamTex.offset.x = time * 0.08;
    const surge = this.surge;
    const surgeAge = surge ? time - surge.t0 : 99;
    const warning = ev !== null && state.tick < ev.startTick;
    if (!warning && surgeAge > 1.4) {
      this.water.visible = false;
      this.foam.visible = false;
      if (surge && surgeAge > 1.4) this.surge = null;
      return;
    }
    const tiles = warning ? ev.tiles : surge!.tiles;
    const dir = (warning ? ev.dir : surge!.dir) ?? 'down';
    const v = DIR_VEC[dir];
    const w = state.width;
    // extent of the edge row (it is a straight row or column)
    let lo = Infinity;
    let hi = -Infinity;
    let line = 0;
    for (const i of tiles) {
      const along = v.dx !== 0 ? Math.floor(i / w) : i % w;
      line = v.dx !== 0 ? i % w : Math.floor(i / w);
      lo = Math.min(lo, along);
      hi = Math.max(hi, along);
    }
    const OUT = 1.3;
    let depth: number;
    let opacity: number;
    if (warning) {
      const k = warnProgress(ev, state, alpha);
      depth = OUT + 0.15 + 0.75 * k * k + 0.05 * Math.sin(time * 5);
      opacity = 0.55 + 0.3 * k;
      for (const i of tiles) {
        const x = this.wx(i % w);
        const z = this.wz(Math.floor(i / w));
        const pulse = 0.5 + 0.5 * Math.sin(time * (6 + 12 * k) + (i % w) * 0.5);
        this.put(this.paint, x, z, this.scaled(0x1c86b8, 0.6 + 0.4 * pulse * k), 1, 0.94);
        this.put(this.fill, x, z, WASH, 0.1 + 0.25 * pulse * k, 0.94);
        if ((i % w) % 2 === 0 || v.dx !== 0)
          this.arrow(x + v.dx * 0.25, z + v.dy * 0.25, dir, 0.3 + 0.5 * k, 0.5);
      }
    } else {
      // the wave breaks: surges a tile and a half inland, then drains back
      const t = surgeAge / 1.4;
      depth = OUT + 2.4 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - Math.max(0, t - 0.55) / 0.45);
      opacity = 0.8 * (1 - Math.max(0, t - 0.5) / 0.5);
    }
    const mid = (lo + hi) / 2;
    const length = hi - lo + 1 + 2;
    // anchor: the outer edge of the row, OUT tiles out into the lagoon
    const edgeX = v.dx !== 0 ? line - v.dx * (0.5 + OUT) : mid;
    const edgeY = v.dx !== 0 ? mid : line - v.dy * (0.5 + OUT);
    const yaw = yawForDir(v.dx, v.dy);
    this.water.visible = true;
    this.water.position.set(this.wx(edgeX), 0.07, this.wz(edgeY));
    this.water.rotation.set(0, yaw, 0);
    this.water.scale.set(length, 1, Math.max(0.01, depth));
    (this.water.material as MeshBasicMaterial).opacity = opacity;
    this.foam.visible = true;
    this.foam.position.set(this.wx(edgeX + v.dx * depth), 0.08, this.wz(edgeY + v.dy * depth));
    this.foam.rotation.set(0, yaw, 0);
    this.foam.scale.set(length, 1, 0.42);
    (this.foam.material as MeshBasicMaterial).opacity = Math.min(1, opacity + 0.15);
  }

  // ------------------------------------------------------------------ manholes, Generator Pass

  private drawManholes(ctx: FrameContext): void {
    if (this.manholes.length === 0 || !ctx.state.stage.enabled) return;
    const { state, time } = ctx;
    const w = state.width;
    const local = state.players[ctx.info.localPlayerId];
    const resting = local ? state.tick < local.teleportReadyTick : false;
    for (const m of this.manholes) {
      const x = this.wx(m.index % w);
      const z = this.wz(Math.floor(m.index / w));
      const pulse = 0.5 + 0.5 * Math.sin(time * 3 + m.pair * 1.7);
      const color = PAIR_COLORS[m.pair]!;
      const dim = resting ? 0.45 : 1;
      this.put(this.rings, x, z, color, (0.35 + 0.4 * pulse) * dim, 0.98 + 0.08 * pulse);
      this.put(this.fill, x, z, color, (0.08 + 0.1 * pulse) * dim, 0.8);
    }
  }

  private drawPasses(ctx: FrameContext): void {
    const { state, alpha, time } = ctx;
    for (const p of state.players) {
      if (!p.alive || p.contact !== 'pass') continue;
      const g = playerGridPos(p, alpha);
      const pulse = 0.5 + 0.5 * Math.sin(time * 4 + p.id);
      this.put(this.rings, this.wx(g.x), this.wz(g.y), PASS, 0.35 + 0.25 * pulse, 0.78 + 0.05 * pulse);
    }
  }

  private popLid(gx: number, gy: number): void {
    const lid = this.lids.find((l) => !l.active) ?? this.lids[0];
    if (!lid) return;
    lid.active = true;
    lid.age = 0;
    lid.mesh.visible = true;
    lid.mesh.position.set(this.wx(gx), 0.05, this.wz(gy));
    const pair = this.pairOf.get(gy * this.layout.width + gx) ?? 0;
    const color = PAIR_COLORS[pair]!;
    this.fx.shockwave(this.wx(gx), this.wz(gy), 0.9, color);
    this.fx.flash(this.wx(gx), 0.4, this.wz(gy), 1.4, color, 0.25);
    for (let i = 0; i < Math.max(3, Math.round(8 * this.density)); i++) {
      const a = (i / 8) * Math.PI * 2;
      this.mist.emit({
        x: this.wx(gx),
        y: 0.15,
        z: this.wz(gy),
        vx: Math.cos(a) * 0.6,
        vy: 0.9 + Math.random() * 0.6,
        vz: Math.sin(a) * 0.6,
        life: 0.9,
        size: 0.3,
        sizeEnd: 1,
        r: 0.7,
        g: 0.74,
        b: 0.66,
        a: 0.5,
        drag: 1.5,
      });
    }
  }

  private updateLids(dt: number): void {
    for (const l of this.lids) {
      if (!l.active) continue;
      l.age += dt;
      const t = l.age;
      // pops up, flips and clanks back down into the frame
      const y = Math.max(0.03, 0.05 + 3.2 * t - 8 * t * t);
      l.mesh.position.y = y;
      l.mesh.rotation.set(Math.min(Math.PI * 2, t * 14), 0, 0);
      if (t > 0.45) {
        l.active = false;
        l.mesh.visible = false;
      }
    }
  }

  // ------------------------------------------------------------------ events

  handleEvents(events: readonly SimEvent[], state: GameState): void {
    const w = state.width;
    for (const e of events) {
      switch (e.type) {
        case 'stageStarted': {
          const ev = e.event;
          const first = ev.tiles[0];
          if (first === undefined) break;
          const fx0 = first % w;
          const fy0 = Math.floor(first / w);
          if (ev.style === 'debris') {
            for (const i of ev.tiles) {
              this.fx.blockDebris(i % w, Math.floor(i / w), 'concrete');
              this.fx.dust(i % w, Math.floor(i / w), 12, 1.0);
              this.fx.shockwave(this.wx(i % w), this.wz(Math.floor(i / w)), 1.1, 0xd8c8a8);
            }
            this.fx.shake = Math.min(1, this.fx.shake + 0.28);
          } else if (ev.style === 'cargo' || ev.style === 'goods') {
            const heavy = ev.style === 'cargo';
            for (const i of ev.tiles) {
              this.fx.blockDebris(i % w, Math.floor(i / w), heavy ? 'drums' : 'cartons');
              this.fx.dust(i % w, Math.floor(i / w), heavy ? 14 : 8, heavy ? 1.1 : 0.8);
            }
            const c = ev.tiles[Math.floor(ev.tiles.length / 2)]!;
            this.fx.shockwave(this.wx(c % w), this.wz(Math.floor(c / w)), heavy ? 2.0 : 1.0, 0xd8c8a8);
            this.fx.shake = Math.min(1, this.fx.shake + (heavy ? 0.32 : 0.1));
          } else if (ev.style === 'power') {
            let cx = 0;
            let cz = 0;
            for (const i of ev.tiles) {
              cx += this.wx(i % w);
              cz += this.wz(Math.floor(i / w));
              for (let s = 0; s < 3; s++)
                this.spark(
                  this.wx(i % w) + (Math.random() - 0.5) * 0.6,
                  0.1,
                  this.wz(Math.floor(i / w)),
                  POWER_LIVE,
                );
            }
            this.fx.flash(cx / ev.tiles.length, 0.6, cz / ev.tiles.length, 3, 0xbfefff, 0.22);
            this.fx.shake = Math.min(1, this.fx.shake + 0.08);
          } else if (ev.style === 'wash') {
            this.surge = { tiles: ev.tiles, dir: ev.dir ?? 'down', t0: this.time };
            const v = DIR_VEC[ev.dir ?? 'down'];
            for (const i of ev.tiles) {
              const x = this.wx(i % w);
              const z = this.wz(Math.floor(i / w));
              const n = Math.max(1, Math.round(5 * this.density));
              for (let s = 0; s < n; s++) {
                this.mist.emit({
                  x: x + (Math.random() - 0.5) * 0.9,
                  y: 0.15,
                  z: z + (Math.random() - 0.5) * 0.9,
                  vx: v.dx * 2.2 + (Math.random() - 0.5),
                  vy: 1.6 + Math.random() * 1.8,
                  vz: v.dy * 2.2 + (Math.random() - 0.5),
                  life: 0.9,
                  size: 0.3,
                  sizeEnd: 0.9,
                  r: 0.92,
                  g: 0.97,
                  b: 1,
                  a: 0.75,
                  gravity: 5,
                  drag: 0.8,
                });
              }
              if ((i % w) % 3 === 0) this.fx.shockwave(x, z, 0.8, 0xbff0ff);
            }
            this.fx.shake = Math.min(1, this.fx.shake + 0.12);
          } else if (ev.style === 'gust') {
            this.gustBurst = { until: this.time + 0.8, dir: ev.dir ?? 'right' };
          } else if (ev.kind === 'drop') {
            for (const i of ev.tiles) this.fx.dust(i % w, Math.floor(i / w), 9, 0.8);
            this.fx.shake = Math.min(1, this.fx.shake + 0.06);
          } else if (ev.kind === 'sweep') {
            this.fx.dust(fx0, fy0, 6, 0.6);
          }
          break;
        }
        case 'playerTeleported':
          this.popLid(e.fromX, e.fromY);
          this.popLid(e.toX, e.toY);
          break;
        case 'generatorDoused': {
          const g = state.generators.find((o) => o.id === e.generatorId);
          if (!g) break;
          for (let s = 0; s < Math.max(4, Math.round(12 * this.density)); s++) {
            this.mist.emit({
              x: this.wx(g.x) + (Math.random() - 0.5) * 0.4,
              y: 0.6,
              z: this.wz(g.y) + (Math.random() - 0.5) * 0.4,
              vx: (Math.random() - 0.5) * 0.5,
              vy: 1.2 + Math.random() * 0.8,
              vz: (Math.random() - 0.5) * 0.5,
              life: 1.4,
              size: 0.35,
              sizeEnd: 1.4,
              r: 0.95,
              g: 0.96,
              b: 0.97,
              a: 0.65,
              drag: 1,
            });
          }
          break;
        }
        default:
          break;
      }
    }
  }

  dispose(): void {
    for (const v of this.sweeps.values()) this.solids.remove(v.model.root);
    this.sweeps.clear();
    for (const f of this.fallers.values()) this.solids.remove(f.obj);
    this.fallers.clear();
    for (const o of [this.paint, this.shadows, this.fill, this.chevrons, this.ink, this.rings]) o.dispose();
    for (const o of this.owned) o.dispose();
  }
}
