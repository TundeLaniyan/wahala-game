import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  AdditiveBlending,
  Vector3,
} from 'three';
import type { Player } from '../../sim';
import { SLOT_COLORS } from '../../assets/palette';
import { drawPickupIcon } from '../../assets/pickupIcons';
import { createPlayerModel } from '../assets/characters';
import type { PlayerModel } from '../assets/characters';
import { CanvasTexture } from 'three';
import { chevronTexture, glowTexture, labelTexture, ringTexture, starTexture } from '../textures';
import { lerpAngle, playerGridPos, toWorld, yawForDir } from './motion';
import type { FrameContext, View } from './types';

const DEATH_TIME = 1.7;
/** Characters are drawn a little larger than a tile-sized figure so they read at phone size. */
const SCALE = 1.3;

interface Visual {
  model: PlayerModel;
  ring: Mesh;
  shadow: Mesh;
  name: Sprite;
  marker: Sprite | null;
  stars: Sprite[];
  curse: Sprite;
  voucher: Sprite;
  yaw: number;
  phase: number;
  deadAt: number | null;
  deathDir: Vector3;
  wasMounted: boolean;
}

const flat = new PlaneGeometry(1, 1);
let voucherTex: CanvasTexture | null = null;

export class PlayerViews implements View {
  readonly group = new Group();
  private readonly visuals = new Map<number, Visual>();

  update(ctx: FrameContext): void {
    for (const p of ctx.state.players) {
      let v = this.visuals.get(p.id);
      if (!v) {
        v = this.create(p, ctx);
        this.visuals.set(p.id, v);
      }
      this.pose(ctx, p, v);
    }
  }

  private create(p: Player, ctx: FrameContext): Visual {
    const model = createPlayerModel(p.characterId);
    const slot = SLOT_COLORS[p.slot % SLOT_COLORS.length]!;
    const ring = new Mesh(
      flat,
      new MeshBasicMaterial({
        map: ringTexture(),
        color: slot,
        transparent: true,
        depthWrite: false,
        opacity: 0.95,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(0.82);
    ring.renderOrder = 4;
    const shadow = new Mesh(
      flat,
      new MeshBasicMaterial({
        map: glowTexture(),
        color: 0x000000,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.setScalar(0.7);
    shadow.renderOrder = 3;
    const name = new Sprite(
      new SpriteMaterial({
        map: labelTexture(p.name, '#ffffff', 'bold 40px system-ui, sans-serif'),
        transparent: true,
        depthTest: false,
      }),
    );
    name.scale.set(1.1, 0.41, 1);
    name.renderOrder = 31;
    let marker: Sprite | null = null;
    if (p.id === ctx.info.localPlayerId) {
      marker = new Sprite(
        new SpriteMaterial({ map: chevronTexture(), color: slot, transparent: true, depthTest: false }),
      );
      marker.material.rotation = Math.PI;
      marker.scale.set(0.42, 0.42, 1);
      marker.renderOrder = 32;
      this.group.add(marker);
    }
    const stars = [0, 1, 2].map(() => {
      const s = new Sprite(new SpriteMaterial({ map: starTexture(), transparent: true, depthTest: false }));
      s.scale.set(0.2, 0.2, 1);
      s.renderOrder = 33;
      s.visible = false;
      this.group.add(s);
      return s;
    });
    const curse = new Sprite(
      new SpriteMaterial({
        map: glowTexture(),
        color: 0x9b30ff,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    curse.scale.set(1.3, 1.3, 1);
    curse.visible = false;
    voucherTex ??= new CanvasTexture(drawPickupIcon('voucher', 64));
    const voucher = new Sprite(new SpriteMaterial({ map: voucherTex, transparent: true, depthTest: false }));
    voucher.scale.set(0.38, 0.38, 1);
    voucher.renderOrder = 33;
    voucher.visible = false;
    this.group.add(model.root, ring, shadow, name, curse, voucher);
    return {
      model,
      ring,
      shadow,
      name,
      marker,
      stars,
      curse,
      voucher,
      yaw: 0,
      phase: Math.random() * 6,
      deadAt: null,
      deathDir: new Vector3(0, 0, 1),
      wasMounted: false,
    };
  }

  private pose(ctx: FrameContext, p: Player, v: Visual): void {
    const { state, time, alpha, layout, dt, fx } = ctx;
    const pos = playerGridPos(p, alpha);
    const w = toWorld(layout, pos.x, pos.y);
    const m = v.model;

    if (!p.alive) {
      this.poseDead(ctx, p, v, w);
      return;
    }

    const face = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[p.facing];
    v.yaw = lerpAngle(v.yaw, yawForDir(face[0]!, face[1]!), Math.min(1, dt * 16));
    m.root.position.set(w.x, 0, w.z);
    m.root.rotation.set(0, v.yaw, 0);
    m.root.scale.setScalar(SCALE);
    m.root.visible = true;

    const moving = pos.moving && state.match.phase !== 'ended';
    const speed = moving ? 1 / Math.max(0.05, p.stepTotal / 60) : 0;
    v.phase += dt * (moving ? 7 + speed * 1.6 : 0);
    const swing = moving ? Math.sin(v.phase * 2) * 0.75 : Math.sin(time * 2 + p.id) * 0.03;
    const bob = moving ? Math.abs(Math.sin(v.phase * 2)) * 0.045 : Math.sin(time * 2.4 + p.id) * 0.012;
    const carrying = p.carrying !== null;
    const mounted = p.mounted;
    m.bike.visible = mounted;
    m.rig.position.y = mounted ? 0.2 + bob * 0.3 : bob;
    m.legL.rotation.x = mounted ? -1.15 : swing;
    m.legR.rotation.x = mounted ? -1.15 : -swing;
    m.armL.rotation.x = carrying ? -2.8 : mounted ? -1.2 : -swing * 0.8;
    m.armR.rotation.x = carrying ? -2.8 : mounted ? -1.2 : swing * 0.8;
    m.armL.rotation.z = carrying ? 0.15 : 0.04;
    m.armR.rotation.z = carrying ? -0.15 : -0.04;
    m.torso.rotation.x = moving ? 0.1 : 0;
    m.head.rotation.z = Math.sin(time * 1.7 + p.id) * 0.03;

    // Okada breaks apart comically the moment protection is spent.
    if (v.wasMounted && !mounted) {
      fx.wreck(w.x, 0.4, w.z, [
        [1, 0.82, 0.1],
        [0.1, 0.1, 0.1],
        [0.8, 0.8, 0.82],
      ]);
    }
    v.wasMounted = mounted;

    v.ring.position.set(w.x, 0.03, w.z);
    (v.ring.material as MeshBasicMaterial).opacity =
      state.match.phase === 'countdown' ? 0.5 + 0.4 * Math.sin(time * 6) : 0.95;
    v.shadow.position.set(w.x, 0.02, w.z);
    v.name.position.set(w.x, 1.5, w.z);
    v.name.visible = true;
    if (v.marker) {
      v.marker.position.set(w.x, 1.9 + Math.sin(time * 5) * 0.08, w.z);
      v.marker.visible = true;
    }
    const dazed = state.tick < p.dazedUntil;
    v.stars.forEach((s, i) => {
      s.visible = dazed;
      if (dazed) {
        const a = time * 6 + (i * Math.PI * 2) / 3;
        s.position.set(w.x + Math.cos(a) * 0.28, 1.3 + (mounted ? 0.25 : 0), w.z + Math.sin(a) * 0.3);
      }
    });
    const cursed = p.curse !== null && state.tick < p.curse.until;
    v.curse.visible = cursed;
    if (cursed) {
      v.curse.position.set(w.x, 0.5, w.z);
      v.curse.material.opacity = 0.45 + 0.3 * Math.sin(time * 9);
    }
    const entering = p.entryUntil !== null;
    v.voucher.visible = entering;
    if (entering) {
      v.voucher.position.set(w.x, 1.9 + Math.sin(time * 8) * 0.06, w.z);
      v.ring.scale.setScalar(0.82 + 0.12 * Math.sin(time * 10));
    } else v.ring.scale.setScalar(0.82);
  }

  private poseDead(ctx: FrameContext, p: Player, v: Visual, base: Vector3): void {
    const { time, fx } = ctx;
    const m = v.model;
    v.ring.visible = false;
    v.name.visible = false;
    if (v.marker) v.marker.visible = false;
    v.curse.visible = false;
    v.voucher.visible = false;
    m.bike.visible = false;

    if (v.deadAt === null) {
      v.deadAt = time;
      const cause = p.elimination?.kind ?? 'flame';
      v.deathDir.set(((p.id * 37) % 7) / 7 - 0.43, 0, (((p.id * 53) % 5) / 5 - 0.5) * 1.4);
      if (cause === 'vehicle') {
        const veh = ctx.state.vehicles.find(
          (o) => p.elimination?.kind === 'vehicle' && o.eventId === p.elimination.eventId,
        );
        const cur = veh?.route[Math.max(0, veh.index)];
        const prev = veh ? veh.route[Math.max(0, veh.index - 1)] : null;
        if (cur && prev && (cur.x !== prev.x || cur.y !== prev.y))
          v.deathDir.set(cur.x - prev.x, 0, cur.y - prev.y).multiplyScalar(2.6);
      }
      fx.comicPuff(p.x, p.y);
      fx.shoes(p.x, p.y, 0xffffff);
    }
    const t = time - v.deadAt;
    const cause = p.elimination?.kind ?? 'flame';
    if (t > DEATH_TIME) {
      m.root.visible = false;
      v.shadow.visible = false;
      for (const s of v.stars) s.visible = false;
      return;
    }
    v.shadow.visible = true;
    m.root.visible = true;
    const k = t / DEATH_TIME;
    if (cause === 'crush' || cause === 'crowd') {
      // Comically squashed flat.
      m.root.position.set(base.x, 0, base.z);
      m.root.scale.set(
        SCALE * (1 + Math.min(1, t * 5) * 0.5),
        Math.max(0.12, 1 - t * 6) * SCALE,
        SCALE * (1 + Math.min(1, t * 5) * 0.5),
      );
      m.root.rotation.set(0, v.yaw, 0);
    } else {
      const air = 0.62;
      const h = t < air ? 3.4 * t * (1 - t / air) * 2 : 0;
      const slide = Math.min(t, 1.1);
      m.root.position.set(base.x + v.deathDir.x * slide * 1.4, h, base.z + v.deathDir.z * slide * 1.4);
      m.root.rotation.set(
        cause === 'vehicle' ? t * 9 : Math.min(t * 6, Math.PI / 2),
        v.yaw + t * (cause === 'vehicle' ? 0 : 8) * (t < air ? 1 : 0),
        cause === 'vehicle' ? t * 5 : 0,
      );
      m.root.scale.setScalar(SCALE * (k > 0.75 ? Math.max(0, 1 - (k - 0.75) * 4) : 1));
    }
    v.shadow.position.set(
      base.x + v.deathDir.x * Math.min(t, 1.1) * 1.4,
      0.02,
      base.z + v.deathDir.z * Math.min(t, 1.1) * 1.4,
    );
    v.stars.forEach((s, i) => {
      s.visible = t > 0.5 && t < DEATH_TIME;
      const a = time * 5 + (i * Math.PI * 2) / 3;
      s.position.set(
        m.root.position.x + Math.cos(a) * 0.3,
        0.5 + Math.sin(time * 3) * 0.05,
        m.root.position.z + Math.sin(a) * 0.3,
      );
    });
    m.legL.rotation.x = Math.sin(time * 30) * 0.6;
    m.legR.rotation.x = -Math.sin(time * 30) * 0.6;
  }

  dispose(): void {
    this.visuals.clear();
  }
}
