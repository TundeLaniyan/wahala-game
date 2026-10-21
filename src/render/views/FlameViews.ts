import {
  AdditiveBlending,
  NormalBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { Flame } from '../../sim';
import { flameTexture, glowTexture, tileGlowTexture } from '../textures';
import type { FrameContext, View } from './types';

interface Visual {
  floor: Mesh;
  a: Sprite;
  b: Sprite;
  /** white-hot inner flame: makes each lane read as a bright core with orange edges */
  hot: Sprite;
  core: Sprite | null;
  phase: number;
}

const floorGeo = new PlaneGeometry(1, 1);

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
      const env = Math.min(1, k * 9) * (k > 0.62 ? Math.max(0, 1 - (k - 0.62) / 0.38) : 1);
      const x = layout.wx(f.x);
      const z = layout.wz(f.y);
      const flick = 0.85 + 0.25 * Math.sin(time * 28 + v.phase);
      const size = (f.dir === null ? 2.0 : f.tip ? 1.35 : 1.6) * flick * (0.75 + env * 0.35);
      v.floor.position.set(x, 0.03, z);
      (v.floor.material as MeshBasicMaterial).opacity = 0.85 * env;
      v.a.position.set(x, 0.5 + 0.08 * Math.sin(time * 20 + v.phase), z);
      v.a.scale.set(size * 0.9, size * 1.15, 1);
      v.a.material.opacity = env;
      v.b.position.set(
        x + 0.05 * Math.sin(time * 17 + v.phase),
        0.32,
        z + 0.05 * Math.cos(time * 15 + v.phase),
      );
      v.b.scale.set(size * 0.82, size * 1.05, 1);
      v.b.material.opacity = env * 0.75;
      v.hot.position.set(x, 0.3, z);
      v.hot.scale.set(size * 0.42, size * 0.55, 1);
      v.hot.material.opacity = env * (0.45 + 0.15 * flick);
      if (v.core) {
        v.core.position.set(x, 0.4, z);
        v.core.scale.setScalar(2.2 * (1.1 - k * 0.5));
        v.core.material.opacity = env;
        const light = this.lights[lit++];
        if (light) {
          light.position.set(x, 0.9, z);
          light.intensity = 15 * env * flick;
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
      const hot = mk(0xffd890);
      hot.renderOrder = 23;
      // the body flame is alpha-blended (not additive) so the fire keeps its orange-red mass on the pale floor
      const body = mk(0xff6a1c);
      body.material.blending = NormalBlending;
      body.renderOrder = 21;
      v = { floor, a: mk(), b: body, hot, core: null, phase: 0 };
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
    }
    if (!center && v.core) {
      this.group.remove(v.core);
      v.core.material.dispose();
      v.core = null;
    }
    this.group.add(v.floor, v.a, v.b, v.hot);
    if (v.core) this.group.add(v.core);
    return v;
  }

  private release(v: Visual): void {
    this.group.remove(v.floor, v.a, v.b, v.hot);
    if (v.core) this.group.remove(v.core);
    this.pool.push(v);
  }

  dispose(): void {
    for (const v of [...this.visuals.values(), ...this.pool]) {
      (v.floor.material as MeshBasicMaterial).dispose();
      v.a.material.dispose();
      v.b.material.dispose();
      v.hot.material.dispose();
      v.core?.material.dispose();
    }
    this.visuals.clear();
    this.pool.length = 0;
  }
}
