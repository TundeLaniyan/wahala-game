import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  NormalBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { Flame } from '../../sim';
import { flameTexture, glowTexture, tileGlowTexture } from '../textures';
import type { FrameContext, View } from './types';

interface Visual {
  floor: Mesh;
  beam: Mesh;
  a: Sprite;
  b: Sprite;
  /** white-hot inner flame: makes each lane read as a bright core with orange edges */
  hot: Sprite;
  core: Sprite | null;
  cross: Sprite | null;
  phase: number;
}

const floorGeo = new PlaneGeometry(1.12, 1.12);
const beamGeo = new BoxGeometry(1.04, 0.42, 0.62);

let cachedCrossTex: CanvasTexture | null = null;
function blastCrossTexture(): CanvasTexture {
  if (cachedCrossTex) return cachedCrossTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const glow = g.createRadialGradient(64, 64, 6, 64, 64, 60);
  glow.addColorStop(0, 'rgba(255,255,235,1)');
  glow.addColorStop(0.45, 'rgba(255,200,50,0.85)');
  glow.addColorStop(1, 'rgba(255,90,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(50, 18, 28, 92, 8);
  g.roundRect(18, 50, 92, 28, 8);
  g.fill();
  cachedCrossTex = new CanvasTexture(c);
  cachedCrossTex.colorSpace = SRGBColorSpace;
  return cachedCrossTex;
}

/**
 * Draws every active flame tile. Each tile gets a hot floor glow (so the plus shape and its
 * extent are unmistakable) plus flickering fire sprites. The centre tile is the generator's
 * position, so every arm visibly originates at its source.
 */
export class FlameViews implements View {
  readonly group = new Group();
  private readonly visuals = new Map<Flame, Visual>();
  private readonly pool: Visual[] = [];
  private readonly floorTex = tileGlowTexture();
  /**
   * A fixed pool of point lights (count never changes, so no shader recompiles mid-match) parked at
   * the hottest blast centres: flames throw warm light onto pillars, crates and players.
   */
  private readonly lights: PointLight[] = [];

  constructor(lightCount = 0) {
    for (let i = 0; i < lightCount; i++) {
      const l = new PointLight(0xff8a3a, 0, 5.5, 2);
      l.position.set(0, -10, 0);
      this.lights.push(l);
      this.group.add(l);
    }
  }

  update(ctx: FrameContext): void {
    const { state, alpha, time, layout } = ctx;
    const live = new Set<Flame>(state.flames);
    for (const [flame, v] of this.visuals) {
      if (!live.has(flame)) {
        this.release(v);
        this.visuals.delete(flame);
      }
    }
    const now = state.tick + alpha;
    let lit = 0;
    for (const f of state.flames) {
      let v = this.visuals.get(f);
      if (!v) {
        v = this.acquire(f.dir === null);
        v.phase = Math.random() * 6.28;
        this.visuals.set(f, v);
      }
      const life = Math.max(1, f.endTick - f.startTick);
      const k = Math.min(1, Math.max(0, (now - f.startTick) / life));
      const env = Math.min(1, 0.55 + k * 10) * (k > 0.65 ? Math.max(0, 1 - (k - 0.65) / 0.35) : 1);
      const x = layout.wx(f.x);
      const z = layout.wz(f.y);
      const flick = 0.9 + 0.24 * Math.sin(time * 28 + v.phase);
      const size = (f.dir === null ? 2.65 : f.tip ? 1.85 : 2.15) * flick * (0.85 + env * 0.35);
      v.floor.position.set(x, 0.032, z);
      (v.floor.material as MeshBasicMaterial).opacity = 0.98 * env;
      v.beam.position.set(x, 0.24, z);
      v.beam.rotation.y = f.dir === 'up' || f.dir === 'down' ? Math.PI / 2 : 0;
      v.beam.scale.set(f.dir === null ? 0.95 : 1.05, 0.75 + 0.35 * flick, f.dir === null ? 0.95 : 0.78);
      (v.beam.material as MeshBasicMaterial).opacity = 0.58 * env;
      v.a.position.set(x, 0.5 + 0.06 * Math.sin(time * 20 + v.phase), z);
      v.a.scale.set(size * 0.98, size * 0.98, 1);
      v.a.material.opacity = env;
      v.b.position.set(
        x + 0.05 * Math.sin(time * 17 + v.phase),
        0.38,
        z + 0.05 * Math.cos(time * 15 + v.phase),
      );
      v.b.scale.set(size * 0.92, size * 0.88, 1);
      v.b.material.opacity = env * 0.88;
      v.hot.position.set(x, 0.38, z);
      v.hot.scale.set(size * 0.62, size * 0.6, 1);
      v.hot.material.opacity = env * (0.76 + 0.2 * flick);
      if (v.core) {
        v.core.position.set(x, 0.48, z);
        v.core.scale.setScalar(2.6 * (1.15 - k * 0.4));
        v.core.material.opacity = env;
        if (v.cross) {
          v.cross.position.set(x, 0.68, z);
          v.cross.scale.setScalar(1.15 * (0.92 + 0.12 * flick));
          v.cross.material.opacity = env;
        }
        const light = this.lights[lit++];
        if (light) {
          light.position.set(x, 1.05, z);
          light.intensity = 22 * env * flick;
        }
      }
    }
    for (; lit < this.lights.length; lit++) this.lights[lit]!.intensity = 0;
  }

  private acquire(center: boolean): Visual {
    let v = this.pool.pop();
    if (!v) {
      const floor = new Mesh(
        floorGeo,
        new MeshBasicMaterial({
          map: this.floorTex,
          color: 0xff6012,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.renderOrder = 6;
      const mk = (color = 0xff8a34): Sprite => {
        const s = new Sprite(
          new SpriteMaterial({
            map: flameTexture(),
            color,
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
        );
        s.renderOrder = 22;
        return s;
      };
      const beam = new Mesh(
        beamGeo,
        new MeshBasicMaterial({
          color: 0xff8c1a,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      beam.renderOrder = 20;
      const hot = mk(0xffe29a);
      hot.renderOrder = 23;
      // the body flame is alpha-blended (not additive) so the fire keeps its orange-red mass on the pale floor
      const body = mk(0xff6a1c);
      body.material.blending = NormalBlending;
      body.renderOrder = 21;
      v = { floor, beam, a: mk(), b: body, hot, core: null, cross: null, phase: 0 };
    }
    if (center && !v.core) {
      const c = new Sprite(
        new SpriteMaterial({
          map: glowTexture(),
          color: 0xffc680,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      c.renderOrder = 24;
      v.core = c;
      const cr = new Sprite(
        new SpriteMaterial({
          map: blastCrossTexture(),
          color: 0xfff4c2,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      cr.renderOrder = 25;
      v.cross = cr;
    }
    if (!center && v.core) {
      this.group.remove(v.core);
      v.core.material.dispose();
      v.core = null;
      if (v.cross) {
        this.group.remove(v.cross);
        v.cross.material.dispose();
        v.cross = null;
      }
    }
    this.group.add(v.floor, v.beam, v.a, v.b, v.hot);
    if (v.core) this.group.add(v.core);
    if (v.cross) this.group.add(v.cross);
    return v;
  }

  private release(v: Visual): void {
    this.group.remove(v.floor, v.beam, v.a, v.b, v.hot);
    if (v.core) this.group.remove(v.core);
    if (v.cross) this.group.remove(v.cross);
    this.pool.push(v);
  }

  dispose(): void {
    for (const v of [...this.visuals.values(), ...this.pool]) {
      (v.floor.material as MeshBasicMaterial).dispose();
      (v.beam.material as MeshBasicMaterial).dispose();
      v.a.material.dispose();
      v.b.material.dispose();
      v.hot.material.dispose();
      v.core?.material.dispose();
      v.cross?.material.dispose();
    }
    this.visuals.clear();
    this.pool.length = 0;
  }
}
