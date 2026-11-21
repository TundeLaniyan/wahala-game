/**
 * A NIGHT raid's light (docs/CLASSIC_LIGHTING.md, decisions NL4-NL7). Every frame it asks the sim which tiles are lit
 * (`raidLightMap`: the fighter's flashlight cone and personal radius, the guards' torch cones, the fixed lamps, all
 * occluded by walls on the grid), eases each tile's level a little so a turning cone sweeps instead of snapping, and
 * writes the levels into the darkness mask texture (`nightMask.ts`) that every weathered material reads. On top it
 * draws one faint additive beam per light (the fighter's warm, the guards' cold), each as long as its line of light.
 *
 * It decides nothing: which enemy is hidden is the sim's `tileRevealed` on the same tile sets (`concealed`), and the
 * mask, the tile sets and the hiding do not depend on the quality preset (only the beam's segment count does).
 */
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { BufferAttribute } from 'three';
import {
  DIR_VEC,
  LIGHT_TUNING,
  Tile,
  carriesTorch,
  raidLighting,
  raidLightMap,
  tileRevealed,
  torchFacing,
} from '../../sim';
import type { Dir, GameState, LightMap, Player, RaidLighting } from '../../sim';
import { createNightMap, disableNight, enableNight, NIGHT_TINTS } from '../nightMask';
import type { DataTexture } from 'three';
import { lerpAngle, playerGridPos } from './motion';
import type { FrameContext, View } from './types';

/** Facing as a yaw about +Y where yaw 0 points grid south (+z). */
const YAW: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

/** How fast a tile's shown level follows the sim's level (per second; ~0.1 s to settle). */
const EASE_PER_SEC = 14;
/** Beams kept for guards (raids have at most a handful of torch carriers alive at once). */
const MAX_GUARD_BEAMS = 8;

export interface NightStatus {
  /** Tiles lit now by each class (the sim's tile sets, `level >= LIGHT_TUNING.lit`). */
  litPlayer: number;
  litGuard: number;
  litLamp: number;
  /** Enemies on the board, and how many the dark hides now. */
  enemies: number;
  concealed: number;
  /** Beams drawn (the fighter's + guards'). */
  beams: number;
  /** The fighter's beam yaw (radians, 0 = grid south) and its facing in the sim. */
  playerYaw: number;
  playerFacing: Dir | null;
  /** The fighter's beam length in tiles (clipped by the first solid tile). */
  playerReach: number;
}

interface Beam {
  mesh: Mesh;
  yaw: number;
  seen: boolean;
}

/** An open cone, apex at the origin, opening along -Y, length 1, radius 1 at the far end; brighter near the apex. */
function beamGeometry(segments: number): CylinderGeometry {
  const g = new CylinderGeometry(0.06, 1, 1, segments, 4, true);
  g.translate(0, -0.5, 0);
  const pos = g.attributes.position as BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = 1 + pos.getY(i); // 1 at the apex, 0 at the far end
    const k = Math.pow(Math.max(0, t), 2.4);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

/**
 * The beam's material: additive, unlit, no fog, no depth write. The colour fades along the cone (vertex colour) and
 * towards its silhouette as seen from the camera (a soft edge instead of a paper wedge).
 */
function beamMaterial(color: number, strength: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color).multiplyScalar(strength) } },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      varying vec3 vColor;
      varying vec3 vN;
      void main() {
        vColor = color;
        vN = normalize( normalMatrix * normal );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vColor;
      varying vec3 vN;
      void main() {
        float face = pow( abs( normalize( vN ).z ), 1.6 );
        gl_FragColor = vec4( uColor * vColor * face, 1.0 );
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
}

/** How many tiles ahead of (x, y) are open before the first solid tile (at most `range`). */
export function reachAlong(state: GameState, x: number, y: number, dir: Dir, range: number): number {
  const { dx, dy } = DIR_VEC[dir];
  let n = 0;
  for (let i = 1; i <= range; i++) {
    const tx = x + dx * i;
    const ty = y + dy * i;
    if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) break;
    n = i;
    if (state.tiles[ty * state.width + tx] !== Tile.Empty) break;
  }
  return n;
}

export class NightLightViews implements View {
  readonly group = new Group();
  private readonly lighting: RaidLighting;
  private map: LightMap | null = null;
  private readonly texture: DataTexture;
  private readonly shown: Float32Array;
  private readonly geo: CylinderGeometry;
  private readonly player: Beam;
  private readonly guards: Beam[] = [];
  private readonly guardYaw = new Map<number, number>();
  private viewer: { x: number; y: number } | null = null;
  private status: NightStatus = {
    litPlayer: 0,
    litGuard: 0,
    litLamp: 0,
    enemies: 0,
    concealed: 0,
    beams: 0,
    playerYaw: 0,
    playerFacing: null,
    playerReach: 0,
  };
  private readonly from = new Vector3();
  private readonly dir = new Vector3();
  private readonly down = new Vector3(0, -1, 0);

  constructor(state: GameState, lighting: RaidLighting, beamSegments = 16) {
    this.lighting = lighting;
    this.texture = createNightMap(state.width, state.height);
    this.shown = new Float32Array(state.width * state.height * 3);
    enableNight(this.texture, state.width, state.height);
    this.geo = beamGeometry(beamSegments);
    this.player = this.beam(NIGHT_TINTS.player, 0.14);
    for (let i = 0; i < MAX_GUARD_BEAMS; i++) this.guards.push(this.beam(NIGHT_TINTS.guard, 0.12));
  }

  private beam(color: number, strength: number): Beam {
    const mesh = new Mesh(this.geo, beamMaterial(color, strength));
    mesh.renderOrder = 6;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    return { mesh, yaw: 0, seen: false };
  }

  /** Is this player hidden by the dark now? (Enemies only; the sim's rule on the step's both tiles.) */
  readonly concealed = (p: Player): boolean => {
    if (!p.isBot || !this.map) return false;
    const seen =
      tileRevealed(this.map, p.x, p.y, this.viewer) ||
      tileRevealed(this.map, p.stepFromX, p.stepFromY, this.viewer);
    return !seen;
  };

  /** The light shown on a tile now (0..1, eased; 0 off the board). */
  level(gx: number, gy: number): number {
    const x = Math.round(gx);
    const y = Math.round(gy);
    const w = this.texture.image.width;
    const h = this.texture.image.height;
    if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    const i = (y * w + x) * 3;
    return Math.max(this.shown[i]!, this.shown[i + 1]!, this.shown[i + 2]!);
  }

  update(ctx: FrameContext): void {
    const { state, dt, layout, alpha } = ctx;
    this.map = raidLightMap(state, this.map ?? undefined);
    const map = this.map;
    if (!map) return;
    const me = state.players.find((p) => !p.isBot && p.alive) ?? null;
    this.viewer = me ? { x: me.x, y: me.y } : null;

    // the mask: ease each tile towards the sim's level, then write the bytes
    const k = 1 - Math.exp(-EASE_PER_SEC * Math.min(dt, 0.1));
    const data = this.texture.image.data as Uint8Array;
    const n = map.width * map.height;
    let litP = 0;
    let litG = 0;
    let litL = 0;
    for (let i = 0; i < n; i++) {
      const tp = map.player[i]! / 255;
      const tg = map.guard[i]! / 255;
      const tl = map.practical[i]! / 255;
      if (map.player[i]! >= LIGHT_TUNING.lit) litP++;
      if (map.guard[i]! >= LIGHT_TUNING.lit) litG++;
      if (map.practical[i]! >= LIGHT_TUNING.lit) litL++;
      const s = i * 3;
      this.shown[s] = this.shown[s]! + (tp - this.shown[s]!) * k;
      this.shown[s + 1] = this.shown[s + 1]! + (tg - this.shown[s + 1]!) * k;
      this.shown[s + 2] = this.shown[s + 2]! + (tl - this.shown[s + 2]!) * k;
      data[i * 4] = Math.round(this.shown[s]! * 255);
      data[i * 4 + 1] = Math.round(this.shown[s + 1]! * 255);
      data[i * 4 + 2] = Math.round(this.shown[s + 2]! * 255);
      data[i * 4 + 3] = 255;
    }
    this.texture.needsUpdate = true;

    // the beams: from hand height to the floor, as long as the line of light, turning smoothly
    let beams = 0;
    const ease = 1 - Math.exp(-12 * Math.min(dt, 0.1));
    const aim = (b: Beam, p: Player, facing: Dir, range: number, spread: number, prevYaw: number): number => {
      const pos = playerGridPos(p, alpha);
      const yaw = b.seen ? lerpAngle(prevYaw, YAW[facing], ease) : YAW[facing];
      const reach = Math.max(1, reachAlong(state, p.x, p.y, facing, range)) + 0.4;
      this.from.set(layout.wx(pos.x) + Math.sin(yaw) * 0.25, 1.05, layout.wz(pos.y) + Math.cos(yaw) * 0.25);
      this.dir.set(Math.sin(yaw) * reach, -1.0, Math.cos(yaw) * reach);
      const len = this.dir.length();
      b.mesh.position.copy(this.from);
      b.mesh.quaternion.setFromUnitVectors(this.down, this.dir.normalize());
      const r = Math.max(0.4, reach * spread * 0.75 + 0.2);
      b.mesh.scale.set(r, len, r);
      b.mesh.visible = true;
      b.seen = true;
      beams++;
      return yaw;
    };
    if (me) {
      const t = LIGHT_TUNING.player;
      this.player.yaw = aim(this.player, me, me.facing, t.range, t.spread, this.player.yaw);
      this.status.playerReach = reachAlong(state, me.x, me.y, me.facing, t.range);
    } else {
      this.player.mesh.visible = false;
      this.player.seen = false;
    }
    let g = 0;
    let enemies = 0;
    let concealed = 0;
    for (const p of state.players) {
      if (!p.isBot || !p.alive) continue;
      enemies++;
      if (this.concealed(p)) concealed++;
      if (!carriesTorch(p, this.lighting) || g >= this.guards.length) continue;
      const b = this.guards[g++]!;
      const t = LIGHT_TUNING.guard;
      const prev = this.guardYaw.get(p.id);
      b.seen = prev !== undefined;
      const yaw = aim(b, p, torchFacing(p), t.range, t.spread, prev ?? 0);
      this.guardYaw.set(p.id, yaw);
    }
    for (let i = g; i < this.guards.length; i++) {
      this.guards[i]!.mesh.visible = false;
      this.guards[i]!.seen = false;
    }
    this.status = {
      litPlayer: litP,
      litGuard: litG,
      litLamp: litL,
      enemies,
      concealed,
      beams,
      playerYaw: this.player.yaw,
      playerFacing: me?.facing ?? null,
      playerReach: this.status.playerReach,
    };
  }

  /** Debug / e2e: what the night drew last frame. */
  stats(): NightStatus {
    return { ...this.status };
  }

  dispose(): void {
    disableNight();
    this.texture.dispose();
    this.geo.dispose();
    for (const b of [this.player, ...this.guards]) (b.mesh.material as ShaderMaterial).dispose();
  }
}

/** The night data of this match, unless `?nonight` (measurement / comparison only) turns the dark off. */
export function nightLightingOf(state: GameState): RaidLighting | null {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nonight')) return null;
  return raidLighting(state);
}
