import {
  Color,
  Fog,
  Frustum,
  Matrix4,
  PCFShadowMap,
  Scene,
  Sphere,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { PICKUP_DEFS } from '../sim';
import type { GameState, SimEvent } from '../sim';
import { createBackdrop } from './assets/backdrop';
import { createSceneLights } from './lighting';
import { arenaLook } from './arenaLook';
import { installGrading } from './grading';
import { applyGrit, setGritWorld } from './grit';
import type { GritClass } from './grit';
import type { SceneLights } from './lighting';
import type { Backdrop } from './assets/backdrop';
import { CameraRig } from './cameraRig';
import { cameraModeFor, selectShot } from './cameraModes';
import type { CameraMode } from './cameraModes';
import { createLayout } from './coords';
import type { Layout } from './coords';
import { Effects } from './fx/Effects';
import type { ShakeMode } from './shake';
import { profileFor, rungOfPreset, rungOfSetting } from './quality';
import type { QualityLevel, QualityProfile, QualitySetting } from './quality';
import {
  AdaptiveQuality,
  deviceFingerprint,
  detectCapabilities,
  estimateRung,
  loadLearned,
  saveLearned,
} from './perf';
import type { AdaptiveStatus, CapabilityEnv, DeviceHints, QualityChange } from './perf';
import type { EntryPick, FrameInfo } from './types';
import { debrisKindFor } from './assets/props';
import { NEW_ARENA_ART } from './arenas/newArenas';
import { LivingEnvironment } from './env/LivingEnvironment';
import type { LivingStats } from './env/LivingEnvironment';
import { resolveEnv } from './env/plan';
import { ArenaView, softTilt } from './views/ArenaView';
import { FlameViews } from './views/FlameViews';
import { GeneratorViews } from './views/GeneratorViews';
import { OverlayViews } from './views/OverlayViews';
import { PickupViews } from './views/PickupViews';
import { SupplyMarkViews } from './views/SupplyMarkViews';
import { PlayerViews } from './views/PlayerViews';
import { VehicleViews } from './views/VehicleViews';
import { TrapViews } from './views/TrapViews';
import { StageHazardViews } from './views/StageHazardViews';
import type { FrameContext, View } from './views/types';
import { disposeTextures } from './textures';

export interface RenderStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  particles: number;
  pixelRatio: number;
  quality: QualityLevel;
  /** Name of the ladder rung in use ("Medium-Low"), and whether Auto chose it. */
  qualityName: string;
  auto: boolean;
}

/** What Settings and the debug handle show about graphics quality. */
export interface QualityStatus {
  setting: QualitySetting;
  auto: boolean;
  rung: number;
  name: string;
  level: QualityLevel;
  pixelRatio: number;
  /** Median fps of the adaptive window (0 when Auto has not measured yet or is off). */
  fps: number;
  /** The first guess and why (hints are only a starting point). */
  estimate: { rung: number; ceiling: number; reasons: string[] };
  /** Auto started from a remembered measurement of this device. */
  learned: boolean;
  controller: AdaptiveStatus;
}

/** A quality change Auto made, for the notice and the debug log. */
export interface QualityEvent {
  change: QualityChange;
  profile: QualityProfile;
}

export type CameraView = 'action' | 'overview';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  quality: QualitySetting;
  /** Called when Auto moves the quality (the app shows a rate-limited notice). */
  onQualityChange?: (e: QualityEvent) => void;
  /** Browser objects for the capability estimate (defaults to the page's own; tests pass fakes). */
  capabilityEnv?: CapabilityEnv;
  /** Where the learned rung is kept (defaults to localStorage when available). */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Forces a camera mode for every match (debug `?cam=stadium`); default: chosen per arena. */
  cameraMode?: CameraMode | null;
  onContextLost?: () => void;
}

/** The page's own browser objects for the capability estimate; every piece is optional. */
function pageEnv(): CapabilityEnv {
  const w = globalThis as unknown as Partial<{
    navigator: CapabilityEnv['navigator'];
    screen: CapabilityEnv['screen'];
    devicePixelRatio: number;
    matchMedia: CapabilityEnv['matchMedia'];
    document: { createElement(tag: string): unknown };
  }>;
  return {
    navigator: w.navigator,
    screen: w.screen,
    devicePixelRatio: w.devicePixelRatio,
    matchMedia: w.matchMedia?.bind(globalThis),
    createCanvas: w.document ? () => w.document!.createElement('canvas') as { getContext(t: string): unknown } : undefined,
  };
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
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
  private stage: StageHazardViews | null = null;
  /** The stage's living environment (ambient traffic, crowds); null for arenas without one or with `?noenv`. */
  private living: LivingEnvironment | null = null;
  private views: View[] = [];
  private players: PlayerViews | null = null;
  private lights!: SceneLights;
  private profile: QualityProfile;
  private auto: boolean;
  private setting: QualitySetting;
  private readonly hints: DeviceHints;
  private readonly estimate: ReturnType<typeof estimateRung>;
  private readonly fingerprint: string;
  private readonly adaptive: AdaptiveQuality;
  private readonly learned: boolean;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  private readonly onQualityChange: ((e: QualityEvent) => void) | undefined;
  private lastFrameMs = 0;
  /** Debug seam (e2e): while set, only synthetic frames feed the controller (see `debugFeedFrames`). */
  private synthetic: { now: number } | null = null;
  private lastBlastAt = -Infinity;
  private appliedShadows: boolean | null = null;
  private width = 1;
  private height = 1;
  private insets = { top: 0.1, bottom: 0.06 };
  private time = 0;
  private frameAvg = 1 / 60;
  private disposed = false;
  private loaded = false;
  private overviewPreferred = false;
  private frames = 0;
  /** Debug / art review only: a forced close shot of a world point (null = normal camera). */
  private inspect: { x: number; z: number; zoom: number } | null = null;
  private readonly cameraOverride: CameraMode | null;
  private mode: CameraMode = 'arena';
  /** Camera shake mode (render/shake.ts); 'off' on touch devices by default, set by the app. */
  private shakeMode: ShakeMode = 'subtle';
  private readonly frustum = new Frustum();
  private readonly viewProj = new Matrix4();
  private readonly sphere = new Sphere();
  /** Is a floor circle (world x, z, radius) inside the last frame's view? (follow camera LOD) */
  private readonly inView = (x: number, z: number, radius: number): boolean => {
    this.sphere.center.set(x, 0.9, z);
    this.sphere.radius = radius;
    return this.frustum.intersectsSphere(this.sphere);
  };

  constructor(opts: RendererOptions) {
    this.setting = opts.quality;
    this.auto = opts.quality === 'auto';
    this.cameraOverride = opts.cameraMode ?? null;
    this.onQualityChange = opts.onQualityChange;
    this.storage = opts.storage ?? safeStorage();
    // First guess from what the browser says about the device (and, if this device was measured before,
    // from that); the adaptive controller then follows the real frame times.
    this.hints = detectCapabilities(opts.capabilityEnv ?? pageEnv());
    this.estimate = estimateRung(this.hints);
    this.fingerprint = deviceFingerprint(this.hints);
    const remembered = loadLearned(this.storage, this.fingerprint, Date.now());
    this.learned = remembered !== null;
    const autoStart = Math.min(remembered ?? this.estimate.rung, this.estimate.ceiling);
    this.adaptive = new AdaptiveQuality({
      start: autoStart,
      ceiling: this.estimate.ceiling,
      now: performance.now() / 1000,
    });
    this.profile = profileFor(rungOfSetting(opts.quality, autoStart));
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
    this.effects.shaker.mode = this.shakeMode;
    this.appliedShadows = null;
    // shader compiles and first draws are not evidence about steady-state speed
    this.adaptive.suspend(this.now(), 6);

    const look = arenaLook(state.arenaId);
    this.scene.background = new Color(look.sky);
    this.scene.fog = new Fog(look.fog.color, look.fog.near, look.fog.far);
    this.renderer.setClearColor(look.sky);
    this.renderer.toneMappingExposure = look.exposure;
    this.lights = createSceneLights(this.scene, this.renderer, look, this.profile.flameLights > 0);
    setGritWorld(look.grit.tone, look.grit.dirt, look.grit.dust);

    this.backdrop = createBackdrop(this.layout, this.profile, state.arenaId);
    this.arena = new ArenaView(state, this.layout);
    const generators = new GeneratorViews();
    const flames = new FlameViews(this.profile.flameLights);
    const pickups = new PickupViews();
    const supplies = new SupplyMarkViews((i) => this.arena.hideAmount(i), softTilt);
    const traps = new TrapViews(state.width * state.height);
    const players = new PlayerViews();
    this.players = players;
    this.vehicles = new VehicleViews();
    this.overlays = new OverlayViews();
    this.stage = new StageHazardViews(state, this.layout, this.effects, this.profile);
    this.views = [
      this.arena,
      supplies,
      traps,
      generators,
      flames,
      pickups,
      players,
      this.vehicles,
      this.overlays,
      this.stage,
    ];
    this.living = this.createLiving(state);
    if (this.living) this.views.push(this.living);
    this.scene.add(
      this.backdrop.root,
      this.arena.group,
      supplies.group,
      traps.group,
      generators.group,
      flames.group,
      pickups.group,
      players.group,
      this.vehicles.group,
      this.overlays.group,
      this.stage.group,
      this.effects.group,
    );
    if (this.living) this.scene.add(this.living.group);

    const tag = (o: { userData: Record<string, unknown> }, cls: GritClass): void => {
      o.userData.grit = cls;
    };
    tag(this.backdrop.root, 'scenery');
    tag(this.arena.group, 'scenery');
    tag(supplies.group, 'none');
    tag(traps.group, 'none');
    tag(generators.group, 'vehicle');
    tag(flames.group, 'none');
    tag(pickups.group, 'none');
    tag(players.group, 'player');
    tag(this.vehicles.group, 'vehicle');
    tag(this.overlays.group, 'none');
    tag(this.stage.group, 'none');
    tag(this.effects.group, 'none');
    if (this.living) tag(this.living.group, 'none');
    this.weather();

    this.loaded = true;
    this.applyQuality();
    this.resize(this.width, this.height);
  }

  /** The arena's living environment, if its art declares one (data in `ArenaArt.env`); `?noenv` turns it off for measuring. */
  private createLiving(state: GameState): LivingEnvironment | null {
    const src = NEW_ARENA_ART()[state.arenaId]?.env;
    if (!src || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('noenv'))) return null;
    const board = { cols: state.width, rows: state.height };
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return new LivingEnvironment(resolveEnv(src, board), { board, profile: this.profile, reducedMotion: reduced });
  }

  /** What the living environment built (debug / performance report); null when the arena has none. */
  livingStats(): LivingStats | null {
    return this.living?.stats() ?? null;
  }

  /** Applies the grit (weathering) patch to every material in the scene that does not have it yet. */
  private weather(): void {
    for (const child of this.scene.children) applyGrit(child, 'none');
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
    this.stage = null;
    this.living = null;
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
      this.backdrop.setPixelScale(this.rig.pixelScale(this.height * dpr));
      this.stage?.setPixelScale(this.rig.pixelScale(this.height * dpr));
      this.living?.setPixelScale(this.rig.pixelScale(this.height * dpr));
    }
  }

  /**
   * Stadium mode only: 'action' = the close follow camera, 'overview' = the whole arena. Standard
   * matches (`arena` mode) always show the whole arena and ignore this.
   */
  setCameraView(view: CameraView): void {
    this.overviewPreferred = view === 'overview';
  }

  /** Camera shake: 'off' (touch default, reduced motion) or 'subtle' (short, small, bounded). */
  setShake(mode: ShakeMode): void {
    this.shakeMode = mode;
    if (this.loaded) {
      this.effects.shaker.mode = mode;
      if (mode === 'off') this.effects.shaker.reset();
    }
  }

  /** Debug / tests: the shake mode and the current trauma (0..cap). */
  shakeStatus(): { mode: ShakeMode; trauma: number } {
    return { mode: this.shakeMode, trauma: this.loaded ? this.effects.shaker.trauma : 0 };
  }

  /** Camera mode of the loaded match: 'arena' (whole arena, fixed) or 'stadium' (follow camera). */
  cameraMode(): CameraMode {
    return this.mode;
  }

  /**
   * The graphics setting from Settings: a manual preset pins that rung (Auto never touches it); 'auto' hands
   * the choice to the adaptive controller, starting from the rung the player was just looking at.
   */
  setQuality(setting: QualitySetting): void {
    this.setting = setting;
    this.auto = setting === 'auto';
    if (setting === 'auto') this.adaptive.reset(this.profile.rung, this.now());
    else this.profile = profileFor(rungOfPreset(setting));
    this.synthetic = null;
    this.applyQuality();
    this.resize(this.width, this.height);
  }

  /** Wall clock in seconds (the controller's clock outside tests). */
  private now(): number {
    return this.synthetic ? this.synthetic.now : performance.now() / 1000;
  }

  /**
   * Makes the running match follow `this.profile`. Cheap live knobs only (pixel ratio, shadow map, particle
   * density, crowd / street-life share, ambient, animation stride); the materials are recompiled only when
   * the shadow pass is switched on or off, because that changes their shaders.
   */
  private applyQuality(): void {
    const p = this.profile;
    this.renderer.shadowMap.enabled = p.shadows;
    if (!this.loaded) return;
    this.lights.setShadows(p.shadows, p.shadowMapSize);
    if (this.appliedShadows !== p.shadows) {
      this.appliedShadows = p.shadows;
      this.scene.traverse((o) => {
        const m = (o as { material?: { needsUpdate: boolean } | { needsUpdate: boolean }[] }).material;
        if (Array.isArray(m)) for (const x of m) x.needsUpdate = true;
        else if (m) m.needsUpdate = true;
      });
    }
    this.effects.setQuality(p);
    this.backdrop.setQuality(p);
    this.living?.setProfile(p);
  }

  /** What Settings and the debug handle show. */
  qualityStatus(): QualityStatus {
    const controller = this.adaptive.status(this.now());
    return {
      setting: this.setting,
      auto: this.auto,
      rung: this.profile.rung,
      name: this.profile.name,
      level: this.profile.level,
      pixelRatio: Math.min(this.profile.maxPixelRatio, globalThis.devicePixelRatio || 1),
      fps: this.auto ? controller.fps : 0,
      estimate: { rung: this.estimate.rung, ceiling: this.estimate.ceiling, reasons: this.estimate.reasons },
      learned: this.learned,
      controller,
    };
  }

  /**
   * Debug / e2e: feeds `count` synthetic frames of `frameMs` to the Auto controller on a virtual clock and
   * applies what it decides, exactly as real frames would. While any are fed, real frames are not sampled.
   * `setQuality()` ends the synthetic mode.
   */
  debugFeedFrames(frameMs: number, count: number, opts: { busy?: boolean } = {}): QualityChange[] {
    const changes: QualityChange[] = [];
    if (!this.auto) return changes;
    if (!this.synthetic) {
      // enter the synthetic clock: measuring starts afresh at the rung in use, with no warm-up pause
      this.synthetic = { now: performance.now() / 1000 };
      this.adaptive.reset(this.profile.rung, this.synthetic.now, 0);
    }
    for (let i = 0; i < count; i++) {
      this.synthetic.now += frameMs / 1000;
      const c = this.adaptive.frame(frameMs / 1000, this.synthetic.now, opts);
      if (c) {
        changes.push(c);
        this.adoptChange(c);
      }
    }
    return changes;
  }

  /** Auto moved the quality: apply it, remember it for this device, tell the app. */
  private adoptChange(change: QualityChange): void {
    this.profile = profileFor(change.to);
    this.applyQuality();
    this.resize(this.width, this.height);
    saveLearned(this.storage, this.fingerprint, change.to, Date.now());
    this.onQualityChange?.({ change, profile: this.profile });
  }

  /** Reacts to simulation events with particles, camera shake and floating text. Call before render(). */
  handleEvents(events: readonly SimEvent[], state: GameState): void {
    if (!this.loaded) return;
    const fx = this.effects;
    this.players?.onEvents(events);
    this.stage?.handleEvents(events, state);
    this.living?.handleEvents(events);
    for (const e of events) {
      switch (e.type) {
        case 'generatorExploded':
          this.lastBlastAt = this.time;
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
        case 'contactUsed': {
          // kick / punch: a burst where the foot or fist met the generator
          const p = state.players[e.playerId]!;
          if (e.ability === 'kick') fx.dust(p.x, p.y, 4, 0.5);
          else if (e.ability === 'punch')
            fx.shockwave(this.layout.wx(p.x), this.layout.wz(p.y), 0.8, 0xffd23f);
          break;
        }
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
          fx.trapContact(p.x, p.y, e.kind);
          break;
        }
        case 'crowdLanded':
          if (e.kind === 'firecracker') fx.explosion(e.x, e.y, 1);
          else fx.shockwave(this.layout.wx(e.x), this.layout.wz(e.y), 1.2, 0x80e0ff);
          break;
        case 'crushLanded':
          // no shake: the Crush / City Rumble closing lands many tiles a second (decision WA6)
          break;
        case 'trapsActivated':
          // the floor gives way: a small jolt (bounded by the shake budget) and a puff of grit per new trap
          fx.shake = Math.min(1, fx.shake + 0.15);
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
      // follow camera: views may skip what the last frame did not show (the fixed camera shows it all)
      inView: this.mode === 'stadium' && !info.attract ? this.inView : undefined,
    };
    if (ctx.inView) {
      const cam = this.rig.camera;
      this.frustum.setFromProjectionMatrix(
        this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
      );
    }
    for (const v of this.views) v.update(ctx);
    // models created mid-match (vehicles, wrecks, a player's swapped model) get weathered too
    if (++this.frames % 30 === 0) this.weather();
    this.effects.update(dt, this.time);
    this.backdrop.update(this.time, info.excitement, dt);
    const shot = this.inspect
      ? {
          kind: 'action' as const,
          focus: this.inspect,
          lead: { x: 0, z: 0 },
          keep: [],
          zoom: this.inspect.zoom,
          free: true,
        }
      : selectShot(this.mode, state, this.layout, info.localPlayerId, alpha, {
          preferOverview: this.overviewPreferred,
          choosingEntry: info.entryOverlay !== null,
          attract: info.attract === true,
          focusId: info.focusPlayerId ?? null,
        });
    const shake = info.attract === true ? 0 : this.effects.shaker.offset(this.time);
    this.rig.update(dt, this.time, shake, shot, info.attract === true);
    this.renderer.render(this.scene, this.rig.camera);
    this.trackPerformance(dt, info);
  }

  /**
   * Frame-time bookkeeping. `dt` (clamped) feeds the displayed fps; the wall-clock gap between two renders
   * is what the player actually experiences and is what Auto measures. Paused and fast-forward frames are not
   * sampled, and an explosion burst defers a drop (adaptive.ts).
   */
  private trackPerformance(dt: number, info: FrameInfo): void {
    this.frameAvg = this.frameAvg * 0.95 + dt * 0.05;
    const nowMs = performance.now();
    const gap = this.lastFrameMs > 0 ? (nowMs - this.lastFrameMs) / 1000 : 0;
    this.lastFrameMs = nowMs;
    if (!this.auto || this.synthetic || gap <= 0) return;
    if (info.paused || info.skipping || info.attract) {
      this.adaptive.suspend(nowMs / 1000, 2);
      return;
    }
    const busy = this.time - this.lastBlastAt < 1.5;
    const change = this.adaptive.frame(gap, nowMs / 1000, { busy });
    if (change) this.adoptChange(change);
  }

  /** Maps a pointer position to the nearest vehicle-entry or turn marker. */
  pickEntry(clientX: number, clientY: number): EntryPick | null {
    if (!this.loaded) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const g = this.rig.screenToGrid(clientX - rect.left, clientY - rect.top, rect.width, rect.height);
    return g ? this.overlays.pick(g.x, g.y) : null;
  }

  /** Debug / art review: frame a world point closely (null restores the normal camera). Never used in play. */
  debugInspect(target: { x: number; z: number; zoom?: number } | null): void {
    this.inspect = target ? { x: target.x, z: target.z, zoom: target.zoom ?? 1 } : null;
    this.rig?.cut();
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

  /**
   * Where the playable board is on screen, in CSS pixels of the canvas: its four corners (far-left,
   * far-right, near-right, near-left; the far ones at head height). Null before a match is loaded. The HUD
   * uses it to keep notifications and subtitles off the board; tests assert it.
   */
  boardScreenCorners(): { x: number; y: number }[] | null {
    if (!this.loaded) return null;
    return this.rig.boardCornersNdc().map((p) => ({
      x: ((p.x + 1) / 2) * this.width,
      y: ((1 - p.y) / 2) * this.height,
    }));
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
      qualityName: this.profile.name,
      auto: this.auto,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.unload();
    disposeTextures();
    this.renderer.dispose();
  }
}
