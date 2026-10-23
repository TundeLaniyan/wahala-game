import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Group,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { InstancedMesh } from 'three';
import type { Flame } from '../../sim';
import { BillboardSet, ColorInstances } from '../fx/Billboards';
import { flameTexture, glowTexture, tileGlowTexture } from '../textures';
import type { FrameContext, View } from './types';

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

interface FlameState {
  phase: number;
  /** wall-clock time the tile first burned (for the ignition lick that runs down the lane) */
  born: number;
}

/**
 * Draws every active flame tile, ALL of them instanced: whatever the number of burning tiles (a
 * 15-tile row-and-column blast, several crosses at once) the fire costs seven draw calls. Each
 * tile gets a hot floor glow (so the plus shape and its extent are unmistakable), a low fire
 * "beam" along its lane, an orange body flame, an additive tongue and a white-hot core; the centre
 * tile adds a glow and a bright cross marking where the generator stood, so every arm visibly
 * originates at its source. Arm tiles light up in sequence outwards for the first few frames (a
 * jet running down the lane) and the tips are a little smaller, so the reach reads at a glance.
 *
 * Light: a fixed pool of point lights (count never changes, so no shader recompiles mid-match)
 * parked at the hottest blast centres; flame tiles never get their own light.
 */
export class FlameViews implements View {
  readonly group = new Group();
  private readonly state = new Map<Flame, FlameState>();
  private readonly floorMat = new MeshBasicMaterial({
    map: tileGlowTexture(),
    color: 0xffffff,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  private readonly beamMat = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  private readonly floorGeo = new PlaneGeometry(1.12, 1.12).rotateX(-Math.PI / 2);
  private readonly beamGeo = new BoxGeometry(1.04, 0.42, 0.62);
  private readonly floor: ColorInstances;
  private readonly beam: ColorInstances;
  /** alpha-blended orange body: keeps the fire's mass on pale floors */
  private readonly body: BillboardSet;
  private readonly tongue: BillboardSet;
  private readonly hot: BillboardSet;
  private readonly core: BillboardSet;
  private readonly cross: BillboardSet;
  private readonly lights: PointLight[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  constructor(lightCount = 0) {
    const swap = (mesh: InstancedMesh, old: InstancedMesh): void => {
      this.group.remove(old);
      this.group.add(mesh);
    };
    this.floor = new ColorInstances(this.floorGeo, this.floorMat, 6, swap);
    this.beam = new ColorInstances(this.beamGeo, this.beamMat, 20, swap);
    this.body = new BillboardSet(flameTexture(), { additive: false, renderOrder: 21 }, swap);
    this.tongue = new BillboardSet(flameTexture(), { additive: true, renderOrder: 22 }, swap);
    this.hot = new BillboardSet(flameTexture(), { additive: true, renderOrder: 23 }, swap);
    this.core = new BillboardSet(glowTexture(), { additive: true, renderOrder: 24, capacity: 16 }, swap);
    this.cross = new BillboardSet(
      blastCrossTexture(),
      { additive: true, renderOrder: 25, capacity: 16 },
      swap,
    );
    this.group.add(
      this.floor.mesh,
      this.beam.mesh,
      this.body.mesh,
      this.tongue.mesh,
      this.hot.mesh,
      this.core.mesh,
      this.cross.mesh,
    );
    for (let i = 0; i < lightCount; i++) {
      const l = new PointLight(0xff8a3a, 0, 5.5, 2);
      l.position.set(0, -10, 0);
      this.lights.push(l);
      this.group.add(l);
    }
  }

  update(ctx: FrameContext): void {
    const { state, alpha, time, layout, fx } = ctx;
    if (this.state.size > 0) {
      const live = new Set<Flame>(state.flames);
      for (const f of this.state.keys()) if (!live.has(f)) this.state.delete(f);
    }
    const sets = [this.body, this.tongue, this.hot, this.core, this.cross];
    for (const s of sets) s.begin();
    this.floor.begin();
    this.beam.begin();
    const now = state.tick + alpha;
    let lit = 0;
    for (const f of state.flames) {
      let st = this.state.get(f);
      const x = layout.wx(f.x);
      const z = layout.wz(f.y);
      if (!st) {
        st = { phase: (f.x * 7.13 + f.y * 3.71 + f.startTick * 0.37) % 6.283, born: time };
        this.state.set(f, st);
        fx.flameTile(f.x, f.y, f.dir, f.tip === true);
      }
      const life = Math.max(1, f.endTick - f.startTick);
      const k = Math.min(1, Math.max(0, (now - f.startTick) / life));
      // the jet runs outwards: arm tiles ignite one after another (about 70 tiles per second)
      const reach = f.dir === null ? 1 : Math.min(1, Math.max(0, (time - st.born) * 14 + 0.35));
      const env = Math.min(1, 0.55 + k * 10) * (k > 0.65 ? Math.max(0, 1 - (k - 0.65) / 0.35) : 1) * reach;
      if (env <= 0.002) continue;
      const flick = 0.9 + 0.24 * Math.sin(time * 28 + st.phase);
      const size = (f.dir === null ? 2.65 : f.tip ? 1.75 : 2.15) * flick * (0.85 + env * 0.35);
      const vertical = f.dir === 'up' || f.dir === 'down';

      // floor glow (additive: the colour is the fade)
      this.m.makeTranslation(x, 0.032, z);
      const fg = 0.98 * env;
      this.floor.push(this.m, fg, fg * 0.117, fg * 0.006); // 0xff6012 (linear)
      // the low fire beam along the lane
      this.q.setFromAxisAngle(this.up, vertical ? Math.PI / 2 : 0);
      this.s.set(f.dir === null ? 0.95 : 1.05, 0.75 + 0.35 * flick, f.dir === null ? 0.95 : 0.78);
      this.m.compose(this.p.set(x, 0.24, z), this.q, this.s);
      const bg = 0.58 * env;
      this.beam.push(this.m, bg, bg * 0.262, bg * 0.01); // 0xff8c1a

      // colours are linear-space multipliers (the old sprite hex colours converted)
      this.tongue.push(
        x,
        0.5 + 0.06 * Math.sin(time * 20 + st.phase),
        z,
        size * 0.98,
        size * 0.98,
        1,
        0.254,
        0.034,
        env,
      );
      this.body.push(
        x + 0.05 * Math.sin(time * 17 + st.phase),
        0.38,
        z + 0.05 * Math.cos(time * 15 + st.phase),
        size * 0.92,
        size * 0.88,
        1,
        0.144,
        0.011,
        env * 0.88,
      );
      this.hot.push(x, 0.38, z, size * 0.62, size * 0.6, 1, 0.76, 0.32, env * (0.76 + 0.2 * flick));
      if (f.dir === null) {
        const cs = 2.6 * (1.15 - k * 0.4);
        this.core.push(x, 0.48, z, cs, cs, 1, 0.565, 0.216, env);
        const xs = 1.15 * (0.92 + 0.12 * flick);
        this.cross.push(x, 0.68, z, xs, xs, 1, 0.905, 0.54, env);
        const light = this.lights[lit++];
        if (light) {
          light.position.set(x, 1.05, z);
          light.intensity = 22 * env * flick;
        }
      }
    }
    for (const s of sets) s.end();
    this.floor.end();
    this.beam.end();
    for (; lit < this.lights.length; lit++) this.lights[lit]!.intensity = 0;
  }

  /** Debug/tests: number of draw calls the fire layer issues (constant, whatever is burning). */
  drawCalls(): number {
    return 7;
  }

  dispose(): void {
    for (const s of [this.body, this.tongue, this.hot, this.core, this.cross]) s.dispose();
    this.floor.dispose();
    this.beam.dispose();
    this.floorGeo.dispose();
    this.beamGeo.dispose();
    this.floorMat.dispose();
    this.beamMat.dispose();
    this.state.clear();
  }
}
