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
import { flameTexture, glowTexture, labelTexture, ringTexture, smokeTexture, starTexture } from '../textures';
import { ParticleSystem } from './Particles';
import type { QualityProfile } from '../quality';

interface Transient {
  obj: Object3D;
  /** Returns false when finished. */
  update(dt: number, t: number): boolean;
  dispose?(): void;
}

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
  shake = 0;
  private readonly fire: ParticleSystem;
  private readonly smoke: ParticleSystem;
  private readonly chunks: ParticleSystem;
  private readonly stars: ParticleSystem;
  private readonly transients: Transient[] = [];
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
  }

  setQuality(q: QualityProfile): void {
    this.density = q.particleDensity;
  }

  setPixelScale(s: number): void {
    for (const p of [this.fire, this.smoke, this.chunks, this.stars]) p.setPixelScale(s);
  }

  get activeParticles(): number {
    return this.fire.active + this.smoke.active + this.chunks.active + this.stars.active;
  }

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.density));
  }

  update(dt: number, t: number): void {
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.fire.update(dt);
    this.smoke.update(dt);
    this.chunks.update(dt);
    this.stars.update(dt);
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
    for (let i = 0; i < this.n(26); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 2.2;
      this.fire.emit({
        x,
        y: 0.25,
        z,
        vx: Math.cos(a) * s,
        vy: 1 + Math.random() * 2.4,
        vz: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.35,
        size: 0.8,
        sizeEnd: 0.2,
        r: 1,
        g: 0.55 + Math.random() * 0.4,
        b: 0.15,
        a: 0.95,
        drag: 1.5,
      });
    }
    for (let i = 0; i < this.n(18); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 3.5;
      this.fire.emit({
        x,
        y: 0.3,
        z,
        vx: Math.cos(a) * s,
        vy: 2 + Math.random() * 3,
        vz: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.5,
        size: 0.11,
        sizeEnd: 0.04,
        r: 1,
        g: 0.9,
        b: 0.4,
        a: 1,
        gravity: 9,
      });
    }
    for (let i = 0; i < this.n(10); i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.emit({
        x,
        y: 0.3,
        z,
        vx: Math.cos(a) * 0.6,
        vy: 0.8 + Math.random() * 0.9,
        vz: Math.sin(a) * 0.6,
        life: 1.1 + Math.random() * 0.8,
        size: 0.6,
        sizeEnd: 1.7,
        r: 0.28,
        g: 0.26,
        b: 0.25,
        a: 0.65,
        drag: 0.8,
      });
    }
    this.flash(x, 0.5, z, 3.2, 0xfff0b0, 0.22);
    this.shockwave(x, z, range + 1.2, 0xffd27a);
    this.scorch(x, z);
    this.shake = Math.min(1, this.shake + 0.22 + range * 0.03);
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

  scorch(x: number, z: number): void {
    const mat = new MeshBasicMaterial({
      map: glowTexture(),
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const m = new Mesh(new PlaneGeometry(1.5, 1.5), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    m.renderOrder = 2;
    let age = 0;
    this.add({
      obj: m,
      update: (dt) => {
        age += dt;
        mat.opacity = Math.max(0, 0.4 * (1 - age / 14));
        return age < 14;
      },
      dispose: () => {
        m.geometry.dispose();
        mat.dispose();
      },
    });
  }

  blockDebris(
    gx: number,
    gy: number,
    variant: 'crate' | 'tyres' | 'sacks' | 'barrier' | 'cartons' | 'kegs' | 'concrete' = 'crate',
  ): void {
    const x = this.layout.wx(gx);
    const z = this.layout.wz(gy);
    const palette: Record<string, [number, number, number][]> = {
      crate: [
        [0.72, 0.48, 0.23],
        [0.55, 0.35, 0.15],
        [0.85, 0.6, 0.3],
      ],
      tyres: [
        [0.15, 0.15, 0.16],
        [0.28, 0.28, 0.3],
      ],
      sacks: [
        [0.6, 0.54, 0.38],
        [0.7, 0.62, 0.42],
      ],
      barrier: [
        [1, 0.76, 0.1],
        [0.12, 0.12, 0.12],
      ],
      cartons: [
        [0.2, 0.45, 0.85],
        [0.9, 0.92, 0.95],
      ],
      kegs: [
        [0.1, 0.35, 0.8],
        [0.8, 0.85, 0.9],
      ],
      concrete: [
        [0.6, 0.58, 0.55],
        [0.45, 0.43, 0.4],
      ],
    };
    const cols = palette[variant]!;
    for (let i = 0; i < this.n(16); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2.8;
      const c = cols[i % cols.length]!;
      this.chunks.emit({
        x: x + (Math.random() - 0.5) * 0.4,
        y: 0.4,
        z: z + (Math.random() - 0.5) * 0.4,
        vx: Math.cos(a) * s,
        vy: 2 + Math.random() * 3.2,
        vz: Math.sin(a) * s,
        life: 0.7 + Math.random() * 0.5,
        size: 0.17 + Math.random() * 0.12,
        sizeEnd: 0.1,
        r: c[0],
        g: c[1],
        b: c[2],
        gravity: 11,
        drag: 0.4,
      });
    }
    this.dust(gx, gy, 6, 0.8);
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
  }
}
