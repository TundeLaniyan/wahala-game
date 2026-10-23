import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Group,
} from 'three';
import { oilSlickTexture, potholeTexture } from '../textures';
import type { FrameContext, View } from './types';

/**
 * Live floor traps (early traps and the mandatory endgame waves): a broken-tarmac pothole with
 * rubble, or a black diesel slick. Rebuilt whenever the set of live traps changes (a wave goes
 * live, a Crush block buries one). Telegraphs are drawn by OverlayViews.
 */
export class TrapViews implements View {
  readonly group = new Group();
  private readonly holes: InstancedMesh;
  private readonly oil: InstancedMesh;
  private readonly rubble: InstancedMesh;
  private key = '';
  private readonly tmp = new Object3D();
  private readonly owned: { dispose(): void }[] = [];

  constructor(capacity: number) {
    const plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const holeMat = new MeshStandardMaterial({
      map: potholeTexture(),
      transparent: true,
      depthWrite: false,
      roughness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const oilMat = new MeshStandardMaterial({
      map: oilSlickTexture(),
      transparent: true,
      depthWrite: false,
      roughness: 0.08,
      metalness: 0.35,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const chunk = new BoxGeometry(0.1, 0.05, 0.08);
    const chunkMat = new MeshStandardMaterial({ color: 0x3d3833, roughness: 0.95 });
    this.holes = new InstancedMesh(plane, holeMat, capacity);
    this.oil = new InstancedMesh(plane, oilMat, capacity);
    this.rubble = new InstancedMesh(chunk, chunkMat, capacity * 6);
    for (const m of [this.holes, this.oil]) {
      m.receiveShadow = true;
      m.renderOrder = 2;
      m.count = 0;
    }
    this.rubble.castShadow = true;
    this.rubble.count = 0;
    this.owned.push(plane, holeMat, oilMat, chunk, chunkMat);
    this.group.add(this.holes, this.oil, this.rubble);
  }

  update(ctx: FrameContext): void {
    const { state, layout } = ctx;
    const entries = Object.entries(state.floorHazards);
    const key = entries.map(([k, v]) => `${k}${v[0]}`).join(',');
    if (key === this.key) return;
    this.key = key;
    let nh = 0;
    let no = 0;
    let nr = 0;
    const t = this.tmp;
    const m = new Matrix4();
    for (const [k, kind] of entries) {
      const i = Number(k);
      const x = layout.wx(i % state.width);
      const z = layout.wz(Math.floor(i / state.width));
      const spin = ((i * 2.399) % (Math.PI * 2)) - Math.PI;
      t.position.set(x, 0.012, z);
      t.rotation.set(0, spin, 0);
      t.scale.setScalar(kind === 'oil' ? 1.08 : 0.98);
      t.updateMatrix();
      if (kind === 'oil') this.oil.setMatrixAt(no++, t.matrix);
      else {
        this.holes.setMatrixAt(nh++, t.matrix);
        for (let c = 0; c < 6; c++) {
          const a = spin + (c * Math.PI * 2) / 6 + (i % 5) * 0.3;
          const d = 0.4 + ((i * 7 + c * 13) % 10) / 100;
          t.position.set(x + Math.cos(a) * d, 0.025, z + Math.sin(a) * d);
          t.rotation.set(0.2 * c, a * 1.7, 0.15);
          t.scale.setScalar(0.7 + ((c * 37 + i) % 7) / 10);
          t.updateMatrix();
          this.rubble.setMatrixAt(nr++, m.copy(t.matrix));
        }
      }
    }
    this.holes.count = nh;
    this.oil.count = no;
    this.rubble.count = nr;
    for (const im of [this.holes, this.oil, this.rubble]) im.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const im of [this.holes, this.oil, this.rubble]) im.dispose();
    for (const o of this.owned) o.dispose();
  }
}
