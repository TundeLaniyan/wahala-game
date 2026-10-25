import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { Object3D, Texture } from 'three';
import type { Layout } from '../coords';
import {
  crackTexture,
  flameTexture,
  glowTexture,
  labelTexture,
  ringTexture,
  smokeTexture,
  sootStreakTexture,
  starTexture,
  scorchTexture,
} from '../textures';
import type { DebrisKind } from '../assets/obstacleStyles';
import { DecalPool } from './Decals';
import { DebrisField } from './Debris';
import type { FragmentShape } from './Debris';
import { ParticleSystem } from './Particles';
import type { QualityProfile } from '../quality';
import { ShakeBudget } from '../shake';

interface Transient {
  obj: Object3D;
  /** Returns false when finished. */
  update(dt: number, t: number): boolean;
  dispose?(): void;
}

/** What a smashed breakable is made of: fragment shapes, colours (sRGB) and how dusty it is. */
const DEBRIS_RECIPES: Record<
  DebrisKind,
  { shapes: FragmentShape[]; colors: [number, number, number][]; dust: number }
> = {
  crate: {
    shapes: ['plank', 'plank', 'plank', 'lump'],
    colors: [
      [0.62, 0.42, 0.22],
      [0.5, 0.33, 0.16],
      [0.72, 0.52, 0.3],
      [0.3, 0.2, 0.11],
    ],
    dust: 0.62,
  },
  tyres: {
    shapes: ['lump', 'slab', 'lump'],
    colors: [
      [0.13, 0.13, 0.14],
      [0.22, 0.22, 0.23],
      [0.45, 0.44, 0.42],
    ],
    dust: 0.3,
  },
  sacks: {
    shapes: ['slab', 'lump', 'lump'],
    colors: [
      [0.62, 0.55, 0.4],
      [0.74, 0.66, 0.46],
      [0.85, 0.8, 0.68],
    ],
    dust: 1,
  },
  barrier: {
    shapes: ['plank', 'plank', 'slab'],
    colors: [
      [0.86, 0.66, 0.12],
      [0.12, 0.12, 0.12],
      [0.8, 0.78, 0.74],
    ],
    dust: 0.5,
  },
  cartons: {
    shapes: ['slab', 'slab', 'lump'],
    colors: [
      [0.62, 0.48, 0.32],
      [0.25, 0.45, 0.78],
      [0.86, 0.88, 0.9],
    ],
    dust: 0.6,
  },
  kegs: {
    shapes: ['slab', 'lump'],
    colors: [
      [0.14, 0.34, 0.72],
      [0.72, 0.2, 0.14],
      [0.8, 0.82, 0.84],
    ],
    dust: 0.4,
  },
  drums: {
    shapes: ['slab', 'plank', 'lump'],
    colors: [
      [0.55, 0.16, 0.1],
      [0.2, 0.3, 0.5],
      [0.36, 0.25, 0.14],
    ],
    dust: 0.5,
  },
  concrete: {
    shapes: ['slab', 'lump', 'lump'],
    colors: [
      [0.6, 0.58, 0.55],
      [0.45, 0.43, 0.4],
      [0.7, 0.68, 0.64],
    ],
    dust: 1,
  },
};

let squareTex: Texture | null = null;
function chunkTexture(): Texture {
  if (squareTex) return squareTex;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(2, 2, 12, 12);
  squareTex = new CanvasTexture(c);
  return squareTex;
}

/** One-off visual effects triggered by simulation events. Never influences gameplay. */
export class Effects {
  readonly group = new Group();
  /** Bounded camera shake (render/shake.ts): per-frame budget, cap, fast decay, off on touch by default. */
  readonly shaker = new ShakeBudget();
  private readonly fire: ParticleSystem;
  private readonly smoke: ParticleSystem;
  private readonly chunks: ParticleSystem;
  private readonly stars: ParticleSystem;
  private readonly transients: Transient[] = [];
  /** real 3D fragments (planks, lumps, slabs) */
  private readonly debris: DebrisField;
  /** blast-centre scorch, soot along the lanes, occasional ground cracks */
  private readonly scorches: DecalPool;
  private readonly soot: DecalPool;
  private readonly cracks: DecalPool;
  private density: number;

  constructor(
    private readonly layout: Layout,
    quality: QualityProfile,
  ) {
    this.density = quality.particleDensity;
    this.fire = new ParticleSystem(Math.round(900 * quality.particleDensity), flameTexture(), true);
    this.smoke = new ParticleSystem(Math.round(600 * quality.particleDensity), smokeTexture(), false);
    this.chunks = new ParticleSystem(Math.round(500 * quality.particleDensity), chunkTexture(), false);
    this.stars = new ParticleSystem(80, starTexture(), false);
    this.group.add(this.smoke.points, this.chunks.points, this.fire.points, this.stars.points);
    this.debris = new DebrisField(this.group, Math.max(24, Math.round(120 * quality.particleDensity)));
    this.scorches = new DecalPool(scorchTexture(), 96, { y: 0.012, renderOrder: 2, hold: 45, fadeOut: 25 });
    this.soot = new DecalPool(sootStreakTexture(), 384, { y: 0.01, renderOrder: 2, hold: 30, fadeOut: 20 });
    this.cracks = new DecalPool(crackTexture(), 48, { y: 0.014, renderOrder: 2, hold: 70, fadeOut: 30 });
    this.group.add(this.soot.mesh, this.scorches.mesh, this.cracks.mesh);
  }

  setQuality(q: QualityProfile): void {
    this.density = q.particleDensity;
  }

  setPixelScale(s: number): void {
    for (const p of [this.fire, this.smoke, this.chunks, this.stars]) p.setPixelScale(s);
  }

  get activeParticles(): number {
    return this.fire.active + this.smoke.active + this.chunks.active + this.stars.active + this.debris.active;
  }

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.density));
  }

  /**
   * Shake trauma (0..cap). Views still write `fx.shake = Math.min(1, fx.shake + x)`: that is read as a
   * request to add `x`, which the budget clips (a frame can add only so much, the total is capped).
   */
  get shake(): number {
    return this.shaker.trauma;
  }

  set shake(value: number) {
    this.shaker.add(value - this.shaker.trauma);
  }

  update(dt: number, t: number): void {
    this.shaker.update(dt);
    this.fire.update(dt);
    this.smoke.update(dt);
    this.chunks.update(dt);
    this.stars.update(dt);
    this.debris.update(dt);
    this.scorches.update(dt);
    this.soot.update(dt);
    this.cracks.update(dt);
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const tr = this.transients[i]!;
      if (!tr.update(dt, t)) {
        this.group.remove(tr.obj);
        tr.dispose?.();
        this.transients.splice(i, 1);
      }
    }
  }

  private add(t: Transient): void {
    this.group.add(t.obj);
    this.transients.push(t);
  }

  // ------------------------------------------------------------ high level effects (grid coords)

  explosion(gx: number, gy: number, range: number): void {
    const x = this.layout.wx(gx);
    const z = this.layout.wz(gy);
    // the fireball: a fat burst of fire that rolls upwards out of the generator
    for (let i = 0; i < this.n(34); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 2.4;
      this.fire.emit({
        x,
        y: 0.25,
        z,
        vx: Math.cos(a) * s,
        vy: 1 + Math.random() * 3,
        vz: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.4,
        size: 0.85 + Math.random() * 0.3,
        sizeEnd: 0.2,
        r: 1,
        g: 0.5 + Math.random() * 0.45,
        b: 0.12,
        a: 0.95,
        drag: 1.5,
      });
    }
    // a column of flame that climbs and curls over (reads as height under the three-quarter camera)
    for (let i = 0; i < this.n(10); i++) {
      this.fire.emit({
        x: x + (Math.random() - 0.5) * 0.3,
        y: 0.5,
        z: z + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 3.2 + Math.random() * 1.6,
        vz: (Math.random() - 0.5) * 0.6,
        life: 0.45 + Math.random() * 0.25,
        size: 1.1,
        sizeEnd: 0.5,
        r: 1,
        g: 0.62,
        b: 0.2,
        a: 0.85,
        drag: 2.4,
      });
    }
    // sparks: fast, gravity-bound, long enough to arc over the neighbouring tiles
    for (let i = 0; i < this.n(30); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2.5 + Math.random() * 4.5;
      this.fire.emit({
        x,
        y: 0.35,
        z,
        vx: Math.cos(a) * s,
        vy: 2.5 + Math.random() * 4,
        vz: Math.sin(a) * s,
        life: 0.55 + Math.random() * 0.6,
        size: 0.09 + Math.random() * 0.05,
        sizeEnd: 0.03,
        r: 1,
        g: 0.88,
        b: 0.42,
        a: 1,
        gravity: 9,
      });
    }
    // a heavy billow of black generator smoke: rises quickly (so the lanes stay readable) and lingers above
    for (let i = 0; i < this.n(18); i++) {
      const a = Math.random() * Math.PI * 2;
      const c = 0.09 + Math.random() * 0.08;
      this.smoke.emit({
        x: x + Math.cos(a) * 0.2,
        y: 0.45,
        z: z + Math.sin(a) * 0.2,
        vx: Math.cos(a) * 0.7,
        vy: 1.4 + Math.random() * 1.2,
        vz: Math.sin(a) * 0.7,
        life: 1.7 + Math.random() * 1.3,
        size: 0.7,
        sizeEnd: 2.4 + Math.random() * 0.9,
        r: c,
        g: c * 0.95,
        b: c * 0.9,
        a: 0.55,
        drag: 0.9,
      });
    }
    // torn metal and casing: real tumbling fragments plus fine grit
    const metal: [number, number, number][] = [
      [0.22, 0.21, 0.2],
      [0.42, 0.4, 0.37],
      [0.58, 0.26, 0.12],
    ];
    for (let i = 0; i < this.n(7); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 3;
      this.debris.emit(i % 2 ? 'slab' : 'lump', {
        x,
        y: 0.45,
        z,
        vx: Math.cos(a) * s,
        vy: 3 + Math.random() * 3,
        vz: Math.sin(a) * s,
        size: 0.55 + Math.random() * 0.4,
        color: metal[i % metal.length]!,
        life: 2.6 + Math.random() * 1.6,
      });
    }
    for (let i = 0; i < this.n(14); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2.2 + Math.random() * 3.6;
      const c = Math.random() < 0.5 ? 0.16 : 0.32;
      this.chunks.emit({
        x,
        y: 0.4,
        z,
        vx: Math.cos(a) * s,
        vy: 2.4 + Math.random() * 3.4,
        vz: Math.sin(a) * s,
        life: 0.7 + Math.random() * 0.6,
        size: 0.06 + Math.random() * 0.08,
        sizeEnd: 0.04,
        r: c * 1.1,
        g: c,
        b: c * 0.9,
        gravity: 12,
        drag: 0.3,
      });
    }
    this.flash(x, 0.6, z, 3.6, 0xfff0b0, 0.24);
    this.shockwave(x, z, range + 1.2, 0xffd27a);
    this.scorch(x, z);
    // occasional cosmetic ground cracks (bigger blasts crack the floor more often)
    if (Math.random() < 0.22 + Math.min(0.4, range * 0.05))
      this.cracks.add(x, z, 1.5 + Math.random() * 0.5, 1.5 + Math.random() * 0.5, Math.random() * 6.28, 0.75);
    this.shake = Math.min(1, this.shake + 0.22 + range * 0.03);
  }

  /**
   * One flame tile catching (called by the flame view for every new burning tile): a lick of fire
   * thrown along the lane, an ember or two and a soot streak on the floor. The blast-centre gets the
   * full explosion instead. Cheap enough for a 15-tile row-and-column blast.
   */
  flameTile(gx: number, gy: number, dir: 'up' | 'down' | 'left' | 'right' | null, tip: boolean): void {
    if (dir === null) return;
    const x = this.layout.wx(gx);
    const z = this.layout.wz(gy);
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const dz = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    const licks = tip ? 3 : 2;
    for (let i = 0; i < licks && Math.random() < this.density + 0.2; i++) {
      this.fire.emit({
        x: x + (Math.random() - 0.5) * 0.4,
        y: 0.3,
        z: z + (Math.random() - 0.5) * 0.4,
        vx: dx * (1.6 + Math.random() * 1.6) + (Math.random() - 0.5) * 0.6,
        vy: 0.9 + Math.random() * 1.2,
        vz: dz * (1.6 + Math.random() * 1.6) + (Math.random() - 0.5) * 0.6,
        life: 0.35 + Math.random() * 0.25,
        size: 0.75,
        sizeEnd: 0.2,
        r: 1,
        g: 0.5 + Math.random() * 0.3,
        b: 0.12,
        a: 0.9,
        drag: 2,
      });
    }
    if (Math.random() < 0.6 * this.density + 0.1)
      this.fire.emit({
        x,
        y: 0.4,
        z,
        vx: dx * 2 + (Math.random() - 0.5) * 2.4,
        vy: 2 + Math.random() * 2.5,
        vz: dz * 2 + (Math.random() - 0.5) * 2.4,
        life: 0.5 + Math.random() * 0.4,
        size: 0.08,
        sizeEnd: 0.03,
        r: 1,
        g: 0.85,
        b: 0.4,
        a: 1,
        gravity: 9,
      });
    if (tip && Math.random() < 0.7)
      this.smoke.emit({
        x,
        y: 0.4,
        z,
        vx: dx * 0.6,
        vy: 1 + Math.random() * 0.6,
        vz: dz * 0.6,
        life: 1.1 + Math.random() * 0.6,
        size: 0.5,
        sizeEnd: 1.5,
        r: 0.12,
        g: 0.11,
        b: 0.1,
        a: 0.4,
        drag: 1,
      });
    // soot along the lane (the streak lies along the arm's direction)
    const along = dx !== 0 ? 0 : Math.PI / 2;
    this.soot.add(
      x,
      z,
      1.15,
      0.62 + Math.random() * 0.2,
      along + (Math.random() - 0.5) * 0.12,
      0.45 + Math.random() * 0.2,
    );
  }

  flash(x: number, y: number, z: number, size: number, color: number, life: number): void {
    const mat = new SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const s = new Sprite(mat);
    s.position.set(x, y, z);
    s.renderOrder = 25;
    let age = 0;
    this.add({
      obj: s,
      update: (dt) => {
        age += dt;
        const k = age / life;
        s.scale.setScalar(size * (0.4 + k));
        mat.opacity = Math.max(0, 1 - k);
        return k < 1;
      },
      dispose: () => mat.dispose(),
    });
  }

  shockwave(x: number, z: number, maxSize: number, color: number): void {
    const mat = new MeshBasicMaterial({
      map: ringTexture(),
      color,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    const m = new Mesh(new PlaneGeometry(1, 1), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, z);
    m.renderOrder = 8;
    let age = 0;
    const life = 0.42;
    this.add({
      obj: m,
      update: (dt) => {
        age += dt;
        const k = age / life;
        m.scale.setScalar(0.4 + maxSize * 2 * (1 - (1 - k) * (1 - k)));
        mat.opacity = Math.max(0, 0.75 * (1 - k));
        return k < 1;
      },
      dispose: () => {
        m.geometry.dispose();
        mat.dispose();
      },
    });
  }

  /** Soot-splash scorch at a blast centre (instanced, stays for most of a match). */
  scorch(x: number, z: number): void {
    const s = 1.6 + Math.random() * 0.3;
    this.scorches.add(x, z, s, s, Math.random() * Math.PI * 2, 0.72);
  }

  /**
   * A breakable smashed by fire or a vehicle: real fragments of what it was made of (planks and
   * splinters, rubber, burst sacks, cardboard, plastic, sheet metal), a burst of flame licking out
   * of it, a dust cloud and a few embers.
   */
  blockDebris(gx: number, gy: number, variant: DebrisKind = 'crate'): void {
    const x = this.layout.wx(gx);
    const z = this.layout.wz(gy);
    const r = DEBRIS_RECIPES[variant] ?? DEBRIS_RECIPES.crate;
    const count = this.n(variant === 'concrete' ? 14 : 12);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.2 + Math.random() * 2.8;
      this.debris.emit(r.shapes[i % r.shapes.length]!, {
        x: x + (Math.random() - 0.5) * 0.5,
        y: 0.25 + Math.random() * 0.5,
        z: z + (Math.random() - 0.5) * 0.5,
        vx: Math.cos(a) * s,
        vy: 2.2 + Math.random() * 3.6,
        vz: Math.sin(a) * s,
        size: 0.75 + Math.random() * 0.6,
        color: r.colors[i % r.colors.length]!,
        life: 2.4 + Math.random() * 2,
      });
    }
    // fine splinters and grit (point sprites)
    for (let i = 0; i < this.n(14); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2.8;
      const c = r.colors[i % r.colors.length]!;
      this.chunks.emit({
        x: x + (Math.random() - 0.5) * 0.4,
        y: 0.4,
        z: z + (Math.random() - 0.5) * 0.4,
        vx: Math.cos(a) * s,
        vy: 2 + Math.random() * 3.2,
        vz: Math.sin(a) * s,
        life: 0.7 + Math.random() * 0.5,
        size: 0.08 + Math.random() * 0.08,
        sizeEnd: 0.05,
        r: c[0],
        g: c[1],
        b: c[2],
        gravity: 11,
        drag: 0.4,
      });
    }
    // flame licking out of the broken load
    if (variant !== 'concrete')
      for (let i = 0; i < this.n(8); i++) {
        const a = Math.random() * Math.PI * 2;
        this.fire.emit({
          x: x + Math.cos(a) * 0.2,
          y: 0.35 + Math.random() * 0.3,
          z: z + Math.sin(a) * 0.2,
          vx: Math.cos(a) * 1.1,
          vy: 1.4 + Math.random() * 1.8,
          vz: Math.sin(a) * 1.1,
          life: 0.35 + Math.random() * 0.3,
          size: 0.7,
          sizeEnd: 0.15,
          r: 1,
          g: 0.55 + Math.random() * 0.3,
          b: 0.15,
          a: 0.9,
          drag: 1.8,
        });
      }
    // a dust cloud that hangs a moment, then a little dark smoke
    for (let i = 0; i < this.n(Math.round(10 * r.dust) + 4); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 0.9;
      this.smoke.emit({
        x: x + Math.cos(a) * 0.25,
        y: 0.15 + Math.random() * 0.3,
        z: z + Math.sin(a) * 0.25,
        vx: Math.cos(a) * sp,
        vy: 0.3 + Math.random() * 0.6,
        vz: Math.sin(a) * sp,
        life: 0.9 + Math.random() * 0.8,
        size: 0.5,
        sizeEnd: 1.5 + Math.random() * 0.6,
        r: 0.7,
        g: 0.65,
        b: 0.57,
        a: 0.42,
        drag: 1.6,
      });
    }
    this.smokePuff(x, 0.6, z, 0.7);
  }

  dust(gx: number, gy: number, count = 6, size = 0.5): void {
    const x = this.layout.wx(gx);
    const z = this.layout.wz(gy);
    for (let i = 0; i < this.n(count); i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.emit({
        x,
        y: 0.1,
        z,
        vx: Math.cos(a) * 0.9,
        vy: 0.3 + Math.random() * 0.5,
        vz: Math.sin(a) * 0.9,
        life: 0.6 + Math.random() * 0.4,
        size: size * 0.5,
        sizeEnd: size * 1.6,
        r: 0.72,
        g: 0.68,
        b: 0.6,
        a: 0.5,
        drag: 2,
      });
    }
  }

  sparkle(gx: number, gy: number, color: number): void {
    const x = this.layout.wx(gx);
    const z = this.layout.wz(gy);
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;
    for (let i = 0; i < this.n(14); i++) {
      const a = (i / 14) * Math.PI * 2;
      this.fire.emit({
        x,
        y: 0.4,
        z,
        vx: Math.cos(a) * 1.8,
        vy: 0.8 + Math.random() * 1.2,
        vz: Math.sin(a) * 1.8,
        life: 0.5,
        size: 0.16,
        sizeEnd: 0.02,
        r,
        g,
        b,
        a: 1,
        gravity: 3,
        drag: 1.5,
      });
    }
    this.shockwave(x, z, 0.8, color);
  }

  /** Comic cloud with orbiting stars, used for eliminations. */
  comicPuff(gx: number, gy: number): void {
    const x = this.layout.wx(gx);
    const z = this.layout.wz(gy);
    for (let i = 0; i < this.n(14); i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.emit({
        x,
        y: 0.4,
        z,
        vx: Math.cos(a) * 1.4,
        vy: 0.4 + Math.random(),
        vz: Math.sin(a) * 1.4,
        life: 0.9 + Math.random() * 0.6,
        size: 0.5,
        sizeEnd: 1.4,
        r: 0.95,
        g: 0.93,
        b: 0.88,
        a: 0.85,
        drag: 1.4,
      });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.stars.emit({
        x,
        y: 0.9,
        z,
        vx: Math.cos(a) * 0.9,
        vy: 1.6 + Math.random() * 0.6,
        vz: Math.sin(a) * 0.9,
        life: 1.4,
        size: 0.34,
        sizeEnd: 0.2,
        r: 1,
        g: 1,
        b: 1,
        a: 1,
        gravity: 2.4,
        drag: 0.6,
      });
    }
  }

  /** Two shoes launched out of the cloud. */
  shoes(gx: number, gy: number, color: number): void {
    const x = this.layout.wx(gx);
    const z = this.layout.wz(gy);
    for (let i = 0; i < 2; i++) {
      const m = new Mesh(new BoxGeometry(0.16, 0.08, 0.26), new MeshBasicMaterial({ color }));
      m.position.set(x, 0.5, z);
      let vx = (i ? 1 : -1) * (1 + Math.random());
      let vy = 4.5 + Math.random();
      let vz = (Math.random() - 0.5) * 2 - 0.4;
      let age = 0;
      this.add({
        obj: m,
        update: (dt) => {
          age += dt;
          vy -= 12 * dt;
          m.position.x += vx * dt;
          m.position.y += vy * dt;
          m.position.z += vz * dt;
          m.rotation.x += 9 * dt;
          m.rotation.z += 7 * dt;
          if (m.position.y < 0.06) {
            m.position.y = 0.06;
            vy = Math.abs(vy) * 0.3;
            vx *= 0.6;
            vz *= 0.6;
          }
          return age < 2.4;
        },
        dispose: () => {
          m.geometry.dispose();
          (m.material as MeshBasicMaterial).dispose();
        },
      });
    }
  }

  /** Floating text such as "+FIRE" or "OKADA!". */
  floatText(gx: number, gy: number, text: string, color = '#ffffff'): void {
    const x = this.layout.wx(gx);
    const z = this.layout.wz(gy);
    const mat = new SpriteMaterial({ map: labelTexture(text, color), transparent: true, depthTest: false });
    const s = new Sprite(mat);
    s.scale.set(1.5, 0.56, 1);
    s.position.set(x, 1.3, z);
    s.renderOrder = 40;
    let age = 0;
    this.add({
      obj: s,
      update: (dt) => {
        age += dt;
        s.position.y = 1.3 + age * 0.8;
        mat.opacity = Math.min(1, (1.3 - age) * 2.2);
        return age < 1.3;
      },
      dispose: () => mat.dispose(),
    });
  }

  smokePuff(wx: number, wy: number, wz: number, size = 0.5): void {
    this.smoke.emit({
      x: wx,
      y: wy,
      z: wz,
      vx: (Math.random() - 0.5) * 0.4,
      vy: 0.5,
      vz: (Math.random() - 0.5) * 0.4,
      life: 0.9,
      size: size * 0.6,
      sizeEnd: size * 1.7,
      r: 0.3,
      g: 0.3,
      b: 0.3,
      a: 0.55,
    });
  }

  /** Scatter of coloured chunks for wrecks and Okada break-ups (world coordinates). */
  wreck(wx: number, wy: number, wz: number, colors: [number, number, number][]): void {
    for (let i = 0; i < this.n(26); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.2 + Math.random() * 3;
      const c = colors[i % colors.length]!;
      this.chunks.emit({
        x: wx,
        y: wy,
        z: wz,
        vx: Math.cos(a) * s,
        vy: 2.5 + Math.random() * 3.5,
        vz: Math.sin(a) * s,
        life: 1 + Math.random() * 0.7,
        size: 0.2 + Math.random() * 0.15,
        sizeEnd: 0.12,
        r: c[0],
        g: c[1],
        b: c[2],
        gravity: 11,
        drag: 0.3,
      });
    }
    for (let i = 0; i < this.n(8); i++)
      this.smokePuff(wx + (Math.random() - 0.5), wy, wz + (Math.random() - 0.5), 0.8);
    this.flash(wx, wy + 0.2, wz, 2, 0xffd890, 0.2);
    this.shake = Math.min(1, this.shake + 0.18);
  }

  dispose(): void {
    for (const t of this.transients) t.dispose?.();
    this.transients.length = 0;
    for (const p of [this.fire, this.smoke, this.chunks, this.stars]) p.dispose();
    this.debris.dispose();
    for (const d of [this.scorches, this.soot, this.cracks]) d.dispose();
  }
}
