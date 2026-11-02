import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
} from 'three';
import type { PendingKnockdown } from '../../sim';
import { playerGridPos, toWorld } from './motion';
import type { FrameContext, View } from './types';

/** Where the throwers stand: a small balcony above the board's edge wall, so they read as the building side. */
const THROWER_HEIGHT = 2.6;
/** The height of a fighter's head, where the object lands. */
const HEAD_HEIGHT = 1.8;

interface Visual {
  group: Group;
  thrower: Group;
  bottle: Mesh;
  marker: Mesh;
  trail: Mesh;
}

const bottleGeo = new CylinderGeometry(0.1, 0.12, 0.42, 10);
const neckGeo = new CylinderGeometry(0.04, 0.07, 0.2, 8);
const headGeo = new SphereGeometry(0.15, 10, 8);
const bodyGeo = new BoxGeometry(0.34, 0.52, 0.22);
const balconyGeo = new BoxGeometry(0.8, 0.12, 0.5);
const ringGeo = new RingGeometry(0.34, 0.5, 28);

/**
 * GLOBAL KNOCKDOWN (decision GK1): a visible throw at every rival. Presentation only - the simulation owns the objects
 * (`state.knockdowns`: who, from where, when it lands). A figure on the building side winds up and throws a glass
 * bottle that arcs to the rival's head while a pulsing ring marks where they stand; the impact itself (the fall, the
 * shock ring, the thud) comes from the `knockdownHit` event. Bright, additive materials read in the day and at night.
 */
export class KnockdownViews implements View {
  readonly group = new Group();
  private readonly visuals = new Map<number, Visual>();
  private readonly glass = new MeshStandardMaterial({
    color: 0x7be07a,
    emissive: 0x38c24a,
    emissiveIntensity: 1.6,
    roughness: 0.2,
    metalness: 0.1,
    transparent: true,
    opacity: 1,
  });
  private readonly skin = new MeshStandardMaterial({ color: 0x6b4328, roughness: 0.8 });
  private readonly shirt = new MeshStandardMaterial({ color: 0xd8b06a, roughness: 0.9, emissive: 0x3a2a10 });
  private readonly dark = new MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });

  update(ctx: FrameContext): void {
    const { state } = ctx;
    const live = new Set<number>();
    for (const k of state.knockdowns) {
      live.add(k.id);
      let v = this.visuals.get(k.id);
      if (!v) {
        v = this.create();
        this.visuals.set(k.id, v);
      }
      this.pose(ctx, k, v);
    }
    for (const [id, v] of this.visuals) {
      if (live.has(id)) continue;
      this.group.remove(v.group);
      (v.marker.material as MeshBasicMaterial).dispose();
      (v.trail.material as MeshBasicMaterial).dispose();
      this.visuals.delete(id);
    }
  }

  private create(): Visual {
    const group = new Group();
    const thrower = new Group();
    const body = new Mesh(bodyGeo, this.shirt);
    body.position.y = 0.3;
    const head = new Mesh(headGeo, this.skin);
    head.position.y = 0.72;
    const arm = new Mesh(new BoxGeometry(0.1, 0.4, 0.1), this.skin);
    arm.name = 'arm';
    arm.position.set(0.2, 0.55, 0);
    const balcony = new Mesh(balconyGeo, this.dark);
    balcony.position.y = -0.02;
    thrower.add(balcony, body, head, arm);
    const bottle = new Mesh(bottleGeo, this.glass);
    const neck = new Mesh(neckGeo, this.glass);
    neck.position.y = 0.3;
    bottle.add(neck);
    const marker = new Mesh(
      ringGeo,
      new MeshBasicMaterial({
        color: 0xffd23a,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.renderOrder = 9;
    // a short bright streak behind the bottle so the flight reads at a glance
    const trail = new Mesh(
      new BoxGeometry(0.06, 0.06, 0.7),
      new MeshBasicMaterial({
        color: 0xfff2a0,
        transparent: true,
        opacity: 0.7,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    group.add(thrower, bottle, marker, trail);
    this.group.add(group);
    return { group, thrower, bottle, marker, trail };
  }

  private pose(ctx: FrameContext, k: PendingKnockdown, v: Visual): void {
    const { state, alpha, layout, time } = ctx;
    const total = state.config.streaks.globalKnockdown.throwTicks;
    const progress = Math.min(1, Math.max(0, 1 - (k.landTick - (state.tick + alpha)) / total));
    const target = state.players[k.targetId]!;
    const tp = playerGridPos(target, alpha);
    const from = toWorld(layout, k.fromX, k.fromY);
    const to = toWorld(layout, tp.x, tp.y);

    // the thrower leans out over the edge and swings the arm, then stays to watch
    v.thrower.scale.setScalar(1.25);
    v.bottle.scale.setScalar(1.7);
    v.thrower.position.set(from.x, THROWER_HEIGHT - 0.4, from.z);
    v.thrower.lookAt(to.x, THROWER_HEIGHT - 0.4, to.z);
    const arm = v.thrower.getObjectByName('arm');
    if (arm) arm.rotation.x = -2.6 * Math.min(1, progress * 4) + Math.sin(time * 18) * 0.05;

    // the bottle: an arc from the thrower's hand to the head, spinning end over end
    const x = from.x + (to.x - from.x) * progress;
    const z = from.z + (to.z - from.z) * progress;
    const arc = Math.sin(Math.PI * progress) * 1.2;
    const y = THROWER_HEIGHT + (HEAD_HEIGHT - THROWER_HEIGHT) * progress + arc;
    v.bottle.position.set(x, y, z);
    v.bottle.rotation.set(progress * Math.PI * 7, Math.atan2(to.x - from.x, to.z - from.z), 0);
    v.trail.position.set(x - (to.x - from.x) * 0.04, y, z - (to.z - from.z) * 0.04);
    v.trail.lookAt(to.x, y, to.z);
    (v.trail.material as MeshBasicMaterial).opacity = 0.7 * (1 - progress);

    // the landing marker pulses faster and tightens as the object arrives
    v.marker.position.set(to.x, 0.05, to.z);
    const pulse = 0.5 + 0.5 * Math.sin(time * (10 + progress * 22));
    v.marker.scale.setScalar(1.25 - 0.45 * progress + 0.1 * pulse);
    (v.marker.material as MeshBasicMaterial).opacity = 0.5 + 0.45 * pulse;
  }

  dispose(): void {
    this.visuals.clear();
  }
}
