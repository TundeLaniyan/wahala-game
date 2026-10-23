import { Color, Fog, PCFShadowMap, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { PICKUP_DEFS } from '../sim';
import type { GameState, SimEvent } from '../sim';
import { createBackdrop } from './assets/backdrop';
import { createSceneLights } from './lighting';
import { arenaLook } from './arenaLook';
import { installGrading } from './grading';
import type { SceneLights } from './lighting';
import type { Backdrop } from './assets/backdrop';
import { CameraRig } from './cameraRig';
import { cameraModeFor, selectShot } from './cameraModes';
import type { CameraMode } from './cameraModes';
import { createLayout } from './coords';
import type { Layout } from './coords';
import { Effects } from './fx/Effects';
import { QUALITY } from './quality';
import type { QualityLevel, QualityProfile } from './quality';
import type { EntryPick, FrameInfo } from './types';
import { debrisKindFor } from './assets/props';
import { ArenaView } from './views/ArenaView';
import { FlameViews } from './views/FlameViews';
import { GeneratorViews } from './views/GeneratorViews';
import { OverlayViews } from './views/OverlayViews';
import { PickupViews } from './views/PickupViews';
import { PlayerViews } from './views/PlayerViews';
import { VehicleViews } from './views/VehicleViews';
import { TrapViews } from './views/TrapViews';
import type { FrameContext, View } from './views/types';
import { disposeTextures } from './textures';

export interface RenderStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  particles: number;
  pixelRatio: number;
  quality: QualityLevel;
}

export type CameraView = 'action' | 'overview';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  quality: QualityLevel | 'auto';
  /** Forces a camera mode for every match (debug `?cam=stadium`); default: chosen per arena. */
  cameraMode?: CameraMode | null;
  onContextLost?: () => void;
}

const WRECK_COLORS: Record<string, [number, number, number][]> = {
  danfo: [
    [1, 0.76, 0.1],
    [0.1, 0.1, 0.1],
    [0.75, 0.75, 0.78],
  ],
  taxi: [
    [0.0, 0.65, 0.9],
    [0.95, 0.96, 0.98],
    [0.12, 0.14, 0.18],
  ],
  keke: [
    [0.97, 0.78, 0.08],
    [0.14, 0.16, 0.2],
    [0.12, 0.12, 0.12],
  ],
};

/**
 * Owns the WebGL renderer and the scene for one match. It only READS the simulation state and
 * consumes SimEvents; it never changes game state.
 */
export class GameRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private rig!: CameraRig;
  private layout!: Layout;
  private effects!: Effects;
  private backdrop!: Backdrop;
  private arena!: ArenaView;
  private overlays!: OverlayViews;
  private vehicles!: VehicleViews;
  private views: View[] = [];
  private players: PlayerViews | null = null;
  private lights!: SceneLights;
  private profile: QualityProfile;
  private readonly auto: boolean;
  private width = 1;
  private height = 1;
  private insets = { top: 0.1, bottom: 0.06 };
  private time = 0;
  private frameAvg = 1 / 60;
  private slowFrames = 0;
  private fastFrames = 0;
  private disposed = false;
  private loaded = false;
  private overviewPreferred = false;
  private readonly cameraOverride: CameraMode | null;
  private mode: CameraMode = 'arena';

  constructor(opts: RendererOptions) {
    this.auto = opts.quality === 'auto';
    this.cameraOverride = opts.cameraMode ?? null;
    this.profile = QUALITY[opts.quality === 'auto' ? 'medium' : opts.quality];
    this.renderer = new WebGLRenderer({
      canvas: opts.canvas,
      antialias: this.profile.antialias,
      powerPreference: 'high-performance',
      stencil: true, // occlusion silhouettes (assets/xray.ts)
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    installGrading(this.renderer);
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setClearColor(0xe3b985);
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      opts.onContextLost?.();
    });
  }

  /** Builds the scene for a freshly created game. Safe to call again for a rematch. */
  loadGame(state: GameState): void {
    this.unload();
    this.layout = createLayout(state.width, state.height);
    this.rig = new CameraRig(this.layout);
    this.mode = cameraModeFor(state.arenaId, this.cameraOverride);
    this.effects = new Effects(this.layout, this.profile);

    const look = arenaLook(state.arenaId);
    this.scene.background = new Color(look.sky);
    this.scene.fog = new Fog(look.fog.color, look.fog.near, look.fog.far);
    this.renderer.setClearColor(look.sky);
    this.renderer.toneMappingExposure = look.exposure;
    this.lights = createSceneLights(this.scene, this.renderer, look);

    this.backdrop = createBackdrop(this.layout, this.profile.crowd, this.profile.parkedBuses, state.arenaId);
    this.arena = new ArenaView(state, this.layout);
    const generators = new GeneratorViews();
    const flames = new FlameViews(this.profile.flameLights);
    const pickups = new PickupViews();
    const traps = new TrapViews(state.width * state.height);
    const players = new PlayerViews();
    this.players = players;
    this.vehicles = new VehicleViews();
    this.overlays = new OverlayViews();
    this.views = [this.arena, traps, generators, flames, pickups, players, this.vehicles, this.overlays];
    this.scene.add(
      this.backdrop.root,
      this.arena.group,
      traps.group,
      generators.group,
      flames.group,
      pickups.group,
      players.group,
      this.vehicles.group,
      this.overlays.group,
      this.effects.group,
    );

    this.loaded = true;
    this.applyQuality();
    this.resize(this.width, this.height);
  }

  private unload(): void {
    if (!this.loaded) return;
    for (const v of this.views) v.dispose();
    this.effects.dispose();
    this.lights.dispose();
    this.backdrop.dispose();
    this.scene.clear();
    this.views = [];
    this.players = null;
    this.loaded = false;
  }

  setInsets(top: number, bottom: number): void {
    this.insets = { top, bottom };
    if (this.loaded) this.rig.fit(this.width / this.height, this.insets);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    const dpr = Math.min(this.profile.maxPixelRatio, globalThis.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height, false);
    if (this.loaded) {
      this.rig.fit(this.width / this.height, this.insets);
      this.effects.setPixelScale(this.rig.pixelScale(this.height * dpr));
    }
  }

  /**
   * Stadium mode only: 'action' = the close follow camera, 'overview' = the whole arena. Standard
   * matches (`arena` mode) always show the whole arena and ignore this.
   */
  setCameraView(view: CameraView): void {
    this.overviewPreferred = view === 'overview';
  }

  /** Camera mode of the loaded match: 'arena' (whole arena, fixed) or 'stadium' (follow camera). */
  cameraMode(): CameraMode {
    return this.mode;
  }

  setQuality(level: QualityLevel | 'auto'): void {
    this.profile = QUALITY[level === 'auto' ? 'medium' : level];
    this.applyQuality();
    this.resize(this.width, this.height);
  }

  private applyQuality(): void {
    const p = this.profile;
    this.renderer.shadowMap.enabled = p.shadows;
    if (this.loaded) {
      this.lights.setShadows(p.shadows, p.shadowMapSize);
      this.scene.traverse((o) => {
        const m = (o as { material?: { needsUpdate: boolean } | { needsUpdate: boolean }[] }).material;
        if (Array.isArray(m)) for (const x of m) x.needsUpdate = true;
        else if (m) m.needsUpdate = true;
      });
      this.effects.setQuality(p);
    }
  }

  /** Reacts to simulation events with particles, camera shake and floating text. Call before render(). */
  handleEvents(events: readonly SimEvent[], state: GameState): void {
    if (!this.loaded) return;
    const fx = this.effects;
    this.players?.onEvents(events);
    for (const e of events) {
      switch (e.type) {
        case 'generatorExploded':
          fx.explosion(e.x, e.y, e.range);
          break;
        case 'generatorPlaced':
          fx.dust(e.x, e.y, 3, 0.4);
          break;
        case 'blockDestroyed': {
          const variant = this.arena.variantAt(e.x, e.y);
          fx.blockDebris(e.x, e.y, e.by === 'crush' ? 'concrete' : debrisKindFor(variant));
          break;
        }
        case 'pickupRevealed':
          fx.sparkle(e.x, e.y, PICKUP_DEFS[e.kind].color);
          break;
        case 'pickupDropped':
          fx.sparkle(e.x, e.y, PICKUP_DEFS[e.kind].color);
          break;
        case 'pickupCollected': {
          const p = state.players[e.playerId]!;
          const def = PICKUP_DEFS[e.kind];
          fx.sparkle(p.x, p.y, def.color);
          if (!e.wasted) fx.floatText(p.x, p.y, def.short.toUpperCase(), def.bad ? '#d58cff' : '#ffffff');
          else fx.floatText(p.x, p.y, 'ALREADY!', '#cfcfcf');
          break;
        }
        case 'pickupBurned':
          fx.dust(e.x, e.y, 3, 0.4);
          break;
        case 'playerEliminated':
          fx.shake = Math.min(1, fx.shake + 0.12);
          break;
        case 'okadaMounted': {
          const p = state.players[e.playerId]!;
          fx.floatText(p.x, p.y, 'OKADA!', '#ffe14a');
          fx.sparkle(p.x, p.y, 0xffe14a);
          break;
        }
        case 'okadaBroken':
          fx.floatText(e.x, e.y, 'OKADA SAVED YOU!', '#ffe14a');
          break;
        case 'vehicleLaunched': {
          const v = state.vehicles.find((o) => o.id === e.vehicleId);
          if (v) fx.dust(v.route[0]!.x, v.route[0]!.y, 8, 0.8);
          break;
        }
        case 'vehicleHitPlayer':
        case 'vehicleHitGenerator':
          fx.shake = Math.min(1, fx.shake + 0.18);
          break;
        case 'vehicleDamaged': {
          const v = state.vehicles.find((o) => o.id === e.vehicleId);
          const t = v?.route[Math.max(0, v.index)];
          if (t) fx.floatText(t.x, t.y, `-${e.damage}`, '#ff9a5a');
          break;
        }
        case 'vehicleDestroyed': {
          const info = this.vehicles.wreckInfo(e.vehicleId);
          if (info) fx.wreck(info.x, 0.5, info.z, WRECK_COLORS[info.kind]!);
          else fx.wreck(this.layout.wx(e.x), 0.5, this.layout.wz(e.y), WRECK_COLORS.danfo!);
          break;
        }
        case 'skillUsed': {
          const p = state.players[e.playerId]!;
          fx.shockwave(this.layout.wx(p.x), this.layout.wz(p.y), 1.1, 0xffffff);
          break;
        }
        case 'playerPushed':
          fx.dust(e.fromX, e.fromY, 5, 0.5);
          break;
        case 'playerDazed': {
          const p = state.players[e.playerId]!;
          fx.floatText(p.x, p.y, 'DAZED!', '#ffe14a');
          break;
        }
        case 'cursed': {
          const p = state.players[e.playerId]!;
          const label = { slow: 'SLOW!', inverted: 'WRONG WAY!', weakFire: 'WEAK FIRE!' }[e.curse];
          fx.floatText(p.x, p.y, label, '#d58cff');
          break;
        }
        case 'generatorCarried': {
          const p = state.players[e.playerId]!;
          if (e.bonus) fx.floatText(p.x, p.y, '+1s', '#c08cff');
          break;
        }
        case 'generatorDisarmed': {
          const g = state.generators.find((o) => o.id === e.generatorId);
          if (g) fx.floatText(g.x, g.y, 'DISARMED', '#cfd6dd');
          break;
        }
        case 'generatorDudCleaned':
          fx.dust(e.x, e.y, 5, 0.5);
          break;
        case 'hazardTriggered': {
          const p = state.players[e.playerId]!;
          fx.floatText(p.x, p.y, e.kind === 'pothole' ? 'WHOOPS!' : 'SLIPPERY!', '#ffffff');
          fx.dust(p.x, p.y, 5, 0.5);
          break;
        }
        case 'crowdLanded':
          if (e.kind === 'firecracker') fx.explosion(e.x, e.y, 1);
          else fx.shockwave(this.layout.wx(e.x), this.layout.wz(e.y), 1.2, 0x80e0ff);
          break;
        case 'crushLanded':
          fx.shake = Math.min(1, fx.shake + 0.2);
          break;
        case 'trapsActivated':
          // the floor gives way: a jolt and a puff of grit on every new trap
          fx.shake = Math.min(1, fx.shake + 0.35);
          for (const t of e.tiles) fx.dust(t.index % state.width, Math.floor(t.index / state.width), 4, 0.5);
          break;
        default:
          break;
      }
    }
  }

  /** Draws one frame. `alpha` is the fraction of the next simulation tick that has elapsed. */
  render(state: GameState, alpha: number, dt: number, info: FrameInfo): void {
    if (!this.loaded || this.disposed) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const ctx: FrameContext = {
      state,
      alpha,
      time: this.time,
      dt,
      info,
      layout: this.layout,
      fx: this.effects,
    };
    for (const v of this.views) v.update(ctx);
    this.effects.update(dt, this.time);
    this.backdrop.update(this.time, info.excitement);
    const shot = selectShot(this.mode, state, this.layout, info.localPlayerId, alpha, {
      preferOverview: this.overviewPreferred,
      choosingEntry: info.entryOverlay !== null,
      attract: info.attract === true,
    });
    this.rig.update(dt, this.time, this.effects.shake, shot, info.attract === true);
    this.renderer.render(this.scene, this.rig.camera);
    this.trackPerformance(dt);
  }

  private trackPerformance(dt: number): void {
    this.frameAvg = this.frameAvg * 0.95 + dt * 0.05;
    if (!this.auto) return;
    if (this.frameAvg > 1 / 30) {
      this.slowFrames++;
      this.fastFrames = 0;
    } else if (this.frameAvg < 1 / 55) {
      this.fastFrames++;
      this.slowFrames = 0;
    } else {
      this.slowFrames = 0;
      this.fastFrames = 0;
    }
    if (this.slowFrames > 90 && this.profile.level !== 'low') {
      this.profile = QUALITY[this.profile.level === 'high' ? 'medium' : 'low'];
      this.slowFrames = 0;
      this.applyQuality();
      this.resize(this.width, this.height);
    } else if (this.fastFrames > 600 && this.profile.level === 'low') {
      this.profile = QUALITY.medium;
      this.fastFrames = 0;
      this.applyQuality();
      this.resize(this.width, this.height);
    }
  }

  /** Maps a pointer position to the nearest vehicle-entry or turn marker. */
  pickEntry(clientX: number, clientY: number): EntryPick | null {
    if (!this.loaded) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const g = this.rig.screenToGrid(clientX - rect.left, clientY - rect.top, rect.width, rect.height);
    return g ? this.overlays.pick(g.x, g.y) : null;
  }

  /** Jumps the camera straight to its current goal (debug/screenshots; the next frame applies it). */
  cutCamera(): void {
    if (this.loaded) this.rig.cut();
  }

  /** Debug: camera pose, mode and whether every playable tile is inside the HUD-free band. */
  debugCamera(): {
    position: number[];
    aspect: number;
    fov: number;
    pitchDeg: number;
    distance: number;
    mode: CameraMode;
    arenaInView: boolean;
  } {
    const c = this.rig.camera;
    const pose = this.rig.currentPose();
    return {
      position: c.position.toArray(),
      aspect: c.aspect,
      fov: c.fov,
      pitchDeg: (pose.pitch * 180) / Math.PI,
      distance: pose.distance,
      mode: this.mode,
      arenaInView: this.loaded && this.rig.framesWholeArena(),
    };
  }

  stats(): RenderStats {
    const info = this.renderer.info.render;
    return {
      fps: Math.round(1 / this.frameAvg),
      drawCalls: info.calls,
      triangles: info.triangles,
      particles: this.loaded ? this.effects.activeParticles : 0,
      pixelRatio: this.renderer.getPixelRatio(),
      quality: this.profile.level,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.unload();
    disposeTextures();
    this.renderer.dispose();
  }
}
