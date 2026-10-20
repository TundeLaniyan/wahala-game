import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { PickupKind } from '../../sim';
import { PICKUP_DEFS } from '../../sim';
import { drawPickupIcon } from '../../assets/pickupIcons';
import { glowTexture, ringTexture } from '../textures';
import type { FrameContext, View } from './types';

interface Visual {
  sprite: Sprite;
  ring: Mesh;
  shadow: Mesh;
  born: number;
  kind: PickupKind;
}

const iconTextures = new Map<PickupKind, CanvasTexture>();
function iconTexture(kind: PickupKind): CanvasTexture {
  let t = iconTextures.get(kind);
  if (!t) {
    t = new CanvasTexture(drawPickupIcon(kind, 128));
    iconTextures.set(kind, t);
  }
  return t;
}
const flat = new PlaneGeometry(1, 1);

/** Floating, bobbing pickup tokens with a coloured ground ring so they read at a glance on a phone. */
export class PickupViews implements View {
  readonly group = new Group();
  private readonly visuals = new Map<number, Visual>();

  update(ctx: FrameContext): void {
    const { state, time, layout } = ctx;
    const live = new Set<number>();
    for (const p of state.pickups) {
      live.add(p.id);
      let v = this.visuals.get(p.id);
      if (!v) {
        const def = PICKUP_DEFS[p.kind];
        const sprite = new Sprite(
          new SpriteMaterial({ map: iconTexture(p.kind), transparent: true, depthTest: false }),
        );
        sprite.renderOrder = 26;
        const ring = new Mesh(
          flat,
          new MeshBasicMaterial({
            map: ringTexture(),
            color: def.color,
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 5;
        const shadow = new Mesh(
          flat,
          new MeshBasicMaterial({
            map: glowTexture(),
            color: 0x000000,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
          }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.renderOrder = 3;
        this.group.add(sprite, ring, shadow);
        v = { sprite, ring, shadow, born: time, kind: p.kind };
        this.visuals.set(p.id, v);
      }
      const age = time - v.born;
      const pop = Math.min(1, age * 5);
      const pop2 = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.35 : 1;
      const x = layout.wx(p.x);
      const z = layout.wz(p.y);
      const bob = Math.sin(time * 3.2 + p.id) * 0.07;
      const bad = PICKUP_DEFS[p.kind].bad === true;
      const shake = bad ? Math.sin(time * 30) * 0.03 : 0;
      v.sprite.position.set(x + shake, 0.62 + bob, z);
      const size = 0.66 * pop * pop2;
      v.sprite.scale.set(size, size, 1);
      v.ring.position.set(x, 0.025, z);
      v.ring.scale.setScalar(0.78 + 0.08 * Math.sin(time * 4 + p.id));
      v.shadow.position.set(x, 0.02, z);
      v.shadow.scale.setScalar(0.5 - bob * 0.5);
    }
    for (const [id, v] of this.visuals) {
      if (!live.has(id)) {
        this.group.remove(v.sprite, v.ring, v.shadow);
        v.sprite.material.dispose();
        (v.ring.material as MeshBasicMaterial).dispose();
        (v.shadow.material as MeshBasicMaterial).dispose();
        this.visuals.delete(id);
      }
    }
  }

  dispose(): void {
    this.visuals.clear();
  }
}
