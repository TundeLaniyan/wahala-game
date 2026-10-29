import { Group, PointLight } from 'three';
import { flameTexture, smokeTexture } from '../textures';
import { ParticleSystem } from './Particles';

/**
 * Ambient street atmosphere outside the playable grid (presentation only): burning tyres and
 * wrecks (flames, embers, a column of black smoke, a flickering light), exhaust from idling
 * buses, cooking smoke and drifting dust. Everything shares three point-sprite systems, so the
 * whole layer is three draw calls; emission rates scale with the quality profile.
 */
export interface AmbientOptions {
  /** 0..1 particle budget (QualityProfile.particleDensity). */
  density: number;
  /** Flickering point lights available for fires (0 on low quality). */
  lights: number;
}

interface Source {
  kind: 'fire' | 'smoke' | 'exhaust' | 'dust';
  x: number;
  y: number;
  z: number;
  size: number;
  /** particles per second (already scaled by density) */
  rate: number;
  acc: number;
  /** smoke shade 0 (black) .. 1 (pale) */
  shade: number;
  dirX: number;
  dirZ: number;
  phase: number;
  light: PointLight | null;
}

export class AmbientFx {
  readonly group = new Group();
  private readonly flames: ParticleSystem;
  private readonly embers: ParticleSystem;
  private readonly smoke: ParticleSystem;
  private readonly sources: Source[] = [];
  private lightsLeft: number;
  private readonly density: number;
  /** Live emission share (QualityProfile.ambient relative to what was built), 0..1. */
  private scale = 1;
  private seed = 0x2f6e2b1;

  constructor(opts: AmbientOptions) {
    this.density = Math.max(0.15, opts.density);
    this.lightsLeft = opts.lights;
    this.flames = new ParticleSystem(Math.round(420 * this.density), flameTexture(), true);
    this.embers = new ParticleSystem(Math.round(260 * this.density), flameTexture(), true);
    this.smoke = new ParticleSystem(Math.round(900 * this.density), smokeTexture(), false);
    // ambient smoke draws before the gameplay effects so blasts stay on top
    this.smoke.points.renderOrder = 12;
    this.group.add(this.smoke.points, this.flames.points, this.embers.points);
  }

  /** Thins the emission without rebuilding anything (adaptive quality). */
  setScale(scale: number): void {
    this.scale = Math.max(0, Math.min(1, scale));
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private add(s: Omit<Source, 'acc' | 'phase' | 'light'>, light = false): void {
    let l: PointLight | null = null;
    if (light && this.lightsLeft > 0) {
      this.lightsLeft--;
      l = new PointLight(0xff7a2a, 9 * s.size, 6 * s.size, 1.8);
      l.position.set(s.x, s.y + 0.6 * s.size, s.z);
      this.group.add(l);
    }
    this.sources.push({ ...s, acc: 0, phase: this.rand() * 10, light: l });
  }

  /** A fire (burning tyres, a burning wreck): flames, embers and a black smoke column. */
  fire(x: number, y: number, z: number, size = 1): void {
    const d = this.density;
    this.add({ kind: 'fire', x, y, z, size, rate: 26 * d * size, shade: 0, dirX: 0, dirZ: 0 }, true);
    this.smokeColumn(x, y + 0.5 * size, z, { shade: 0.08, size, rate: 7 });
  }

  /** A rising column of smoke (shade 0 = black tyre smoke, 1 = pale cooking smoke). */
  smokeColumn(
    x: number,
    y: number,
    z: number,
    o: { shade?: number; size?: number; rate?: number } = {},
  ): void {
    const size = o.size ?? 1;
    this.add({
      kind: 'smoke',
      x,
      y,
      z,
      size,
      rate: (o.rate ?? 5) * this.density,
      shade: o.shade ?? 0.3,
      dirX: 0,
      dirZ: 0,
    });
  }

  /** Puffs of exhaust from an idling vehicle's tailpipe, blowing along (dirX, dirZ). */
  exhaust(x: number, y: number, z: number, dirX: number, dirZ: number): void {
    this.add({ kind: 'exhaust', x, y, z, size: 1, rate: 4 * this.density, shade: 0.45, dirX, dirZ });
  }

  /** Low drifting dust kicked up over a patch of street (w x d centred on x, z). */
  dust(x: number, z: number, w: number, d: number): void {
    this.add({
      kind: 'dust',
      x,
      y: 0.15,
      z,
      size: w,
      rate: 1.6 * this.density,
      shade: 0.75,
      dirX: d,
      dirZ: 0,
    });
  }

  setPixelScale(s: number): void {
    for (const p of [this.flames, this.embers, this.smoke]) p.setPixelScale(s);
  }

  update(dt: number, time: number): void {
    dt = Math.min(dt, 0.1);
    const wind = 0.18 + 0.08 * Math.sin(time * 0.13);
    for (const s of this.sources) {
      s.acc += s.rate * this.scale * dt;
      while (s.acc >= 1) {
        s.acc -= 1;
        this.emit(s, wind);
      }
      if (s.light) {
        const f = 0.75 + 0.25 * Math.sin(time * 13 + s.phase) * Math.sin(time * 7.3 + s.phase * 2);
        s.light.intensity = 9 * s.size * f;
      }
    }
    this.flames.update(dt);
    this.embers.update(dt);
    this.smoke.update(dt);
  }

  private emit(s: Source, wind: number): void {
    const r = (): number => this.rand();
    const k = s.size;
    switch (s.kind) {
      case 'fire': {
        const jx = (r() - 0.5) * 0.5 * k;
        const jz = (r() - 0.5) * 0.5 * k;
        this.flames.emit({
          x: s.x + jx,
          y: s.y + r() * 0.15 * k,
          z: s.z + jz,
          vx: wind * 0.4 + (r() - 0.5) * 0.2,
          vy: (0.9 + r() * 0.7) * k,
          vz: (r() - 0.5) * 0.2,
          life: 0.45 + r() * 0.35,
          size: (0.55 + r() * 0.35) * k,
          sizeEnd: 0.15 * k,
          r: 1,
          g: 0.5 + r() * 0.25,
          b: 0.18,
          a: 0.85,
        });
        if (r() < 0.35) {
          this.embers.emit({
            x: s.x + jx,
            y: s.y + 0.3 * k,
            z: s.z + jz,
            vx: wind + (r() - 0.5) * 0.6,
            vy: 1.2 + r() * 1.4,
            vz: (r() - 0.5) * 0.6,
            life: 1.2 + r() * 1.3,
            size: 0.045 + r() * 0.04,
            r: 1,
            g: 0.55,
            b: 0.15,
            a: 1,
            drag: 0.4,
          });
        }
        break;
      }
      case 'smoke': {
        const c = 0.06 + s.shade * 0.5 + r() * 0.05;
        this.smoke.emit({
          x: s.x + (r() - 0.5) * 0.4 * k,
          y: s.y,
          z: s.z + (r() - 0.5) * 0.4 * k,
          vx: wind * 1.4 + (r() - 0.5) * 0.12,
          vy: 0.55 + r() * 0.35,
          vz: (r() - 0.5) * 0.12 - 0.05,
          life: 5 + r() * 3,
          size: (0.5 + r() * 0.3) * k,
          sizeEnd: (2.6 + r() * 1.4) * k,
          r: c,
          g: c * 0.96,
          b: c * 0.92,
          a: 0.42 - s.shade * 0.12,
          drag: 0.05,
        });
        break;
      }
      case 'exhaust': {
        if (Math.sin(this.rand() * 6.28) < -0.3) break; // irregular idle
        const c = 0.34 + r() * 0.1;
        this.smoke.emit({
          x: s.x,
          y: s.y,
          z: s.z,
          vx: s.dirX * (0.6 + r() * 0.4) + wind * 0.5,
          vy: 0.12 + r() * 0.15,
          vz: s.dirZ * (0.6 + r() * 0.4),
          life: 1.6 + r() * 1.2,
          size: 0.18,
          sizeEnd: 0.9 + r() * 0.5,
          r: c,
          g: c,
          b: c * 0.98,
          a: 0.3,
          drag: 0.6,
        });
        break;
      }
      case 'dust': {
        const c = 0.5 + r() * 0.1;
        this.smoke.emit({
          x: s.x + (r() - 0.5) * s.size,
          y: s.y + r() * 0.2,
          z: s.z + (r() - 0.5) * s.dirX,
          vx: wind * 1.2,
          vy: 0.04 + r() * 0.05,
          vz: (r() - 0.5) * 0.1,
          life: 4 + r() * 3,
          size: 0.8,
          sizeEnd: 2.4,
          r: c * 1.05,
          g: c * 0.95,
          b: c * 0.82,
          a: 0.16,
          drag: 0.1,
        });
        break;
      }
    }
  }

  dispose(): void {
    for (const p of [this.flames, this.embers, this.smoke]) p.dispose();
    for (const s of this.sources) s.light?.dispose();
  }
}
