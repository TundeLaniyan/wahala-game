/**
 * Builds and runs a stage's living environment from its `StageEnvironment` data (presentation only).
 * One generic object per match: ambient traffic, protected crowd zones that react to SimEvents, practical
 * lights, a small particle layer for exhaust and dust, all sized to the quality tier's budget. An arena
 * without `env` gets none of it (`GameRenderer` creates nothing).
 *
 * It implements `View`, so the renderer updates and disposes it with the other views, and it reads the
 * simulation only through the frame context and the tick's events. It owns no rules and writes nothing
 * back: ambient vehicles and people are not simulation entities.
 */
import { Group } from 'three';
import type { SimEvent } from '../../sim';
import { ParticleSystem } from '../fx/Particles';
import { CrowdZones } from '../life/CrowdZones';
import type { QualityProfile } from '../quality';
import { smokeTexture } from '../textures';
import type { FrameContext, View } from '../views/types';
import { PracticalLights } from './Lights';
import { activeLights, planEnvironment, stimuliFrom } from './plan';
import type { EnvironmentPlan } from './plan';
import { AmbientTraffic } from './Traffic';
import type { AudioIdentity, BoardSize, StageEnvironment } from './types';

export interface LivingOptions {
  board: BoardSize;
  profile: QualityProfile;
  reducedMotion: boolean;
}

export interface LivingStats {
  environment: string;
  quality: string;
  vehicles: number;
  rigs: number;
  figures: number;
  lights: number;
  drawCalls: number;
}

export class LivingEnvironment implements View {
  readonly group = new Group();
  private traffic: AmbientTraffic | null = null;
  private crowd: CrowdZones | null = null;
  private lights: PracticalLights | null = null;
  private dust: ParticleSystem | null = null;
  private plan!: EnvironmentPlan;
  private time = 0;
  private pendingDt = 0;
  private frames = 0;
  private pixelScale = 600;

  constructor(
    private readonly env: StageEnvironment,
    private opts: LivingOptions,
  ) {
    this.group.name = `livingEnvironment:${env.id}`;
    this.build();
  }

  private build(): void {
    const { board, profile, reducedMotion } = this.opts;
    const level = profile.level;
    this.plan = planEnvironment(this.env, level, board);
    const seed = this.env.seed ?? 1;
    const particles = level === 'medium' || level === 'high';
    if (particles) {
      this.dust = new ParticleSystem(Math.round(160 * profile.particleDensity), smokeTexture(), false);
      this.dust.points.renderOrder = 13;
      this.dust.setPixelScale(this.pixelScale);
      this.group.add(this.dust.points);
    }
    const emit = this.dust;
    if (this.plan.vehicles.length > 0) {
      this.traffic = new AmbientTraffic(this.plan.traffic, {
        cols: board.cols,
        rows: board.rows,
        castShadow: level === 'high',
        reducedMotion,
        exhaust: emit
          ? (x, y, z, vx, vz, diesel) =>
              emit.emit({
                x,
                y,
                z,
                vx,
                vy: 0.15,
                vz,
                life: 1.3,
                size: 0.1,
                sizeEnd: 0.6,
                r: diesel ? 0.3 : 0.45,
                g: diesel ? 0.3 : 0.45,
                b: diesel ? 0.3 : 0.45,
                a: 0.22,
                drag: 0.8,
              })
          : undefined,
      });
      this.group.add(this.traffic.group);
    }
    if (this.plan.people > 0) {
      this.crowd = new CrowdZones(this.plan.crowd, {
        cols: board.cols,
        rows: board.rows,
        seed,
        reducedMotion,
        rules: this.env.reactions,
        rigShadows: level === 'high',
        puff: emit
          ? (x, y, z) => {
              for (let i = 0; i < 3; i++)
                emit.emit({
                  x: x + (i - 1) * 0.15,
                  y,
                  z,
                  vx: (i - 1) * 0.4,
                  vy: 0.3,
                  vz: 0.1 * i,
                  life: 0.8,
                  size: 0.2,
                  sizeEnd: 0.7,
                  r: 0.55,
                  g: 0.5,
                  b: 0.42,
                  a: 0.28,
                  drag: 1.2,
                });
            }
          : undefined,
      });
      this.group.add(this.crowd.group);
    }
    const lit = activeLights(this.env, level);
    if (lit.length > 0) {
      this.lights = new PracticalLights(lit, board);
      this.group.add(this.lights.group);
    }
  }

  private teardown(): void {
    this.traffic?.dispose();
    this.crowd?.dispose();
    this.lights?.dispose();
    this.dust?.dispose();
    this.group.clear();
    this.traffic = this.crowd = this.lights = this.dust = null;
  }

  /**
   * A new quality profile (adaptive quality moved the rung). Only a change of coarse tier rebuilds (traffic,
   * crowds and lights are budgeted per tier); inside a tier just the animation stride follows.
   */
  setProfile(profile: QualityProfile): void {
    const rebuild = profile.level !== this.opts.profile.level;
    this.opts = { ...this.opts, profile };
    if (!rebuild) return;
    this.teardown();
    this.build();
  }

  setPixelScale(scale: number): void {
    this.pixelScale = scale;
    this.dust?.setPixelScale(scale);
  }

  /** Reactions: the tick's SimEvents become crowd stimuli. Nothing flows back. */
  handleEvents(events: readonly SimEvent[]): void {
    if (!this.crowd || events.length === 0) return;
    this.crowd.stimulate(stimuliFrom(events, this.opts.board), this.time);
  }

  update(ctx: FrameContext): void {
    this.time = ctx.time;
    // background animation on a stride at low quality: every Nth frame, with the time of the frames skipped
    this.pendingDt += ctx.dt;
    const stride = this.opts.profile.animationStride;
    if (stride > 1 && ++this.frames % stride !== 0) return;
    const dt = this.pendingDt;
    this.pendingDt = 0;
    // follow camera: what is out of view is neither moved nor drawn (elevated things get a wider circle)
    const visible = ctx.inView;
    this.traffic?.update(ctx.time, dt, visible);
    this.crowd?.update(dt, ctx.time, ctx.info.excitement, visible);
    this.lights?.update(ctx.time);
    this.dust?.update(dt);
  }

  /** What was built (debug overlay, tests, the performance report). */
  stats(): LivingStats {
    const counts = this.crowd?.counts ?? { rigs: 0, figures: 0 };
    const drawCalls =
      (this.traffic?.drawCalls ?? 0) +
      (this.crowd?.drawCalls ?? 0) +
      (this.lights?.drawCalls ?? 0) +
      (this.dust ? 1 : 0);
    return {
      environment: this.env.id,
      quality: this.opts.profile.level,
      vehicles: this.traffic?.count ?? 0,
      rigs: counts.rigs,
      figures: counts.figures,
      lights: this.lights?.count ?? 0,
      drawCalls,
    };
  }

  /** The stage's audio identity (names of existing synthesised sounds), for the audio engine to read. */
  audioHooks(): AudioIdentity | undefined {
    return this.env.audio;
  }

  /** Test / debug access to the parts. */
  get parts(): { traffic: AmbientTraffic | null; crowd: CrowdZones | null; lights: PracticalLights | null } {
    return { traffic: this.traffic, crowd: this.crowd, lights: this.lights };
  }

  dispose(): void {
    this.teardown();
  }
}
